// Heartbeat's independent, browser-local archive content store.
// This module is reachable only from the full runtime bundle; index.js/bootstrap never imports it.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

let databasePromise = null;
let testBackend = null;

function cloneValue(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function utf8JsonSize(value, label) {
    let json;
    try { json = JSON.stringify(value); }
    catch { throw new Error(`${label}无法序列化，独立备份没有写入。`); }
    const bytes = new Blob([json], { type: 'application/json' }).size;
    if (bytes > core_constants.MAX_CACHE_SOURCE_BYTES) {
        throw new Error(`${label}超过 12 MB UTF-8 安全上限，独立备份没有写入。`);
    }
    return bytes;
}

function normalizedCharacterIndexHint(value) {
    return Number.isInteger(Number(value)) ? Number(value) : -1;
}

function normalizedIdentity(entry, memory = null) {
    const chatId = core_context.comparableChatId(memory?.chatId || entry?.chatId);
    const characterName = core_text.normalizeText(entry?.characterName || memory?.characterName, 120) || '未命名角色';
    const avatar = core_text.normalizeText(core_context.archiveStoredAvatar(entry), 300);
    const characterKey = core_text.normalizeText(entry?.characterKey, 300) || avatar;
    const characterFingerprint = core_text.normalizeText(entry?.characterFingerprint, 160);
    const characterIndexHint = normalizedCharacterIndexHint(entry?.characterIndexHint);
    const identity = { ...entry, characterKey, avatar, characterName, characterFingerprint, characterIndexHint, chatId };
    return {
        entryId: core_context.archiveIndexEntryId(identity),
        characterKey,
        avatar,
        characterName,
        characterFingerprint,
        characterIndexHint,
        chatId,
    };
}

function identityMatches(record, entry) {
    const wanted = normalizedIdentity(entry);
    if (!record || !wanted.chatId || core_context.comparableChatId(record.chatId) !== wanted.chatId) return false;
    const recordName = core_text.normalizeText(record.characterName, 120);
    const recordAvatar = core_text.normalizeText(record.avatar, 300);
    const recordKey = core_text.normalizeText(record.characterKey, 300);
    const recordFingerprint = core_text.normalizeText(record.characterFingerprint, 160);
    const recordHint = normalizedCharacterIndexHint(record.characterIndexHint);
    if ((wanted.characterIndexHint >= 0 || recordHint >= 0)
        && (wanted.characterIndexHint < 0 || recordHint < 0 || wanted.characterIndexHint !== recordHint)) return false;
    if (wanted.characterFingerprint && recordFingerprint && wanted.characterFingerprint !== recordFingerprint) return false;
    if (wanted.characterName && wanted.characterName !== '未命名角色' && recordName && recordName !== wanted.characterName) return false;
    if (wanted.avatar && recordAvatar && recordAvatar !== wanted.avatar) return false;
    if (wanted.characterKey && recordKey && recordKey !== wanted.characterKey) return false;
    return true;
}

function identityMatchesExceptName(record, entry) {
    const wanted = normalizedIdentity(entry);
    if (!record || !wanted.chatId || core_context.comparableChatId(record.chatId) !== wanted.chatId) return false;
    const recordAvatar = core_text.normalizeText(record.avatar, 300);
    const recordKey = core_text.normalizeText(record.characterKey, 300);
    const recordHint = normalizedCharacterIndexHint(record.characterIndexHint);
    // Exact-key card edits may adopt a newly introduced slot hint, but an existing
    // non-matching hint is never transferable to another card.
    if (recordHint >= 0 && wanted.characterIndexHint >= 0 && recordHint !== wanted.characterIndexHint) return false;
    if (recordHint >= 0 && wanted.characterIndexHint < 0) return false;
    // A rename capability is deliberately unavailable when either stable locator is
    // absent. This keeps the exceptional path narrower than the ordinary matcher.
    if (!wanted.avatar || !recordAvatar || wanted.avatar !== recordAvatar) return false;
    if (!wanted.characterKey || !recordKey || wanted.characterKey !== recordKey) return false;
    return true;
}

function backupRecordsEquivalent(previous, incoming) {
    if (!previous || !incoming || previous.entryId !== incoming.entryId
        || previous.archiveRevision !== incoming.archiveRevision) return false;
    try {
        return JSON.stringify(previous.memory) === JSON.stringify(incoming.memory)
            && JSON.stringify(previous.cache ?? null) === JSON.stringify(incoming.cache ?? null);
    } catch { return false; }
}

export function hasMatchingArchiveDeletionFence(records, entry) {
    const entryId = core_context.archiveIndexEntryId(entry);
    return (Array.isArray(records) ? records : [])
        .some(record => record?.deleted === true && (
            core_text.normalizeText(record?.entryId, 120) === entryId
            || identityMatches(record, entry)
        ));
}

function compatibleCacheValue(cache, memory) {
    if (!cache || typeof cache !== 'object') return null;
    const chatId = core_context.comparableChatId(memory?.chatId);
    const archiveRevision = core_text.normalizeText(memory?.archiveRevision, 240);
    const cacheChatId = core_context.comparableChatId(cache?.chatId);
    const cacheRevision = core_text.normalizeText(cache?.archiveRevision, 240);
    if (cacheChatId && cacheChatId !== chatId) return null;
    if (cacheRevision && cacheRevision !== archiveRevision) return null;
    if (cache.format === core_constants.CACHE_STORAGE_FORMAT) {
        if (Number(cache.storageVersion) !== core_constants.CACHE_STORAGE_VERSION) return null;
        if (typeof cache.data !== 'string' || !cache.data || cache.data.length > core_constants.MAX_CACHE_COMPRESSED_BASE64_CHARS) return null;
        if (Number(cache.sourceBytes) > core_constants.MAX_CACHE_SOURCE_BYTES) return null;
        return cloneValue(cache);
    }
    utf8JsonSize(cache, '未压缩派生缓存');
    return cloneValue(cache);
}

function normalizeRecord(raw, entry = null) {
    if (!raw || typeof raw !== 'object' || Number(raw.storageVersion) !== core_constants.ARCHIVE_BACKUP_STORAGE_VERSION) return null;
    const exactEntryId = entry
        && core_text.normalizeText(raw?.entryId, 120)
        && core_text.normalizeText(raw.entryId, 120) === core_context.archiveIndexEntryId(entry);
    if (entry && !exactEntryId && !identityMatches(raw, entry)
        && !(entry?.allowCharacterRename === true && identityMatchesExceptName(raw, entry))) return null;
    const memory = cloneValue(raw.memory);
    if (!memory || typeof memory !== 'object' || !Array.isArray(memory.memories)) return null;
    const identity = normalizedIdentity(raw, memory);
    if (!identity.entryId || !identity.chatId || identity.chatId !== core_context.comparableChatId(memory.chatId)) return null;
    const revision = core_text.normalizeText(memory.archiveRevision, 240);
    if (!revision || revision !== core_text.normalizeText(raw.archiveRevision, 240)) return null;
    utf8JsonSize(memory, '正式 Mxxx 档案');
    const cache = compatibleCacheValue(raw.cache, memory);
    return {
        storageVersion: core_constants.ARCHIVE_BACKUP_STORAGE_VERSION,
        ...identity,
        archiveName: core_text.normalizeText(raw.archiveName || memory.archiveName, 160) || '未命名档案',
        archiveRevision: revision,
        memory,
        cache,
        createdAt: Math.max(0, Number(raw.createdAt) || Number(memory.createdAt) || Date.now()),
        updatedAt: Math.max(0, Number(raw.updatedAt) || Number(memory.updatedAt) || Date.now()),
    };
}

function buildRecord(entry, memory, cache = null) {
    const identity = normalizedIdentity(entry, memory);
    if (!identity.entryId || !identity.chatId) throw new Error('无法建立独立档案备份身份。');
    const safeMemory = cloneValue(memory);
    if (!safeMemory || !Array.isArray(safeMemory.memories)) throw new Error('正式 Mxxx 档案格式无效，独立备份没有写入。');
    safeMemory.chatId = identity.chatId;
    const archiveRevision = core_text.normalizeText(safeMemory.archiveRevision, 240);
    if (!archiveRevision) throw new Error('正式档案缺少 archiveRevision，独立备份没有写入。');
    utf8JsonSize(safeMemory, '正式 Mxxx 档案');
    return {
        storageVersion: core_constants.ARCHIVE_BACKUP_STORAGE_VERSION,
        ...identity,
        archiveName: core_text.normalizeText(safeMemory.archiveName, 160) || '未命名档案',
        archiveRevision,
        memory: safeMemory,
        cache: compatibleCacheValue(cache, safeMemory),
        createdAt: Math.max(0, Number(safeMemory.createdAt) || Date.now()),
        updatedAt: Math.max(0, Number(safeMemory.updatedAt) || Date.now()),
    };
}

function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败。'));
    });
}

function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!globalThis.indexedDB?.open) return Promise.reject(new Error('当前浏览器没有可用的 IndexedDB，无法建立独立档案备份。'));
    databasePromise = new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(core_constants.ARCHIVE_BACKUP_DB_NAME, core_constants.ARCHIVE_BACKUP_STORAGE_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.objectStoreNames.contains(core_constants.ARCHIVE_BACKUP_STORE_NAME)
                ? request.transaction.objectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME)
                : db.createObjectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME, { keyPath: 'entryId' });
            if (!store.indexNames.contains('chatId')) store.createIndex('chatId', 'chatId', { unique: false });
            if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', 'updatedAt', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { databasePromise = null; reject(request.error || new Error('无法打开独立档案备份数据库。')); };
        request.onblocked = () => { databasePromise = null; reject(new Error('独立档案备份数据库正在被旧页面占用，请关闭其他酒馆页面后重试。')); };
    });
    return databasePromise;
}

async function idbRead(entry) {
    const db = await openDatabase();
    const identity = normalizedIdentity(entry);
    const transaction = db.transaction(core_constants.ARCHIVE_BACKUP_STORE_NAME, 'readonly');
    const store = transaction.objectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME);
    const exact = await requestValue(store.get(identity.entryId));
    if (exact) return exact;
    const matches = await requestValue(store.index('chatId').getAll(identity.chatId));
    const compatible = (Array.isArray(matches) ? matches : []).filter(item => identityMatches(item, entry));
    // A legacy entry ID may differ from the newer fingerprint-derived ID. Recover only when the
    // chat + stable display identity resolve to exactly one record; ambiguity stays fail-closed.
    return compatible.length === 1 ? compatible[0] : null;
}

async function idbPut(record, expected = null, options = {}) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(core_constants.ARCHIVE_BACKUP_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME);
        let outcome = false;
        let finalized = false;
        let exactRaw = null;
        let chatRecords = [];
        let exactDone = false;
        let matchesDone = false;
        const finalize = () => {
            if (finalized || !exactDone || !matchesDone) return;
            finalized = true;
            const aliases = new Map();
            for (const candidate of [exactRaw, ...chatRecords]) {
                const id = core_text.normalizeText(candidate?.entryId, 120);
                if (id && (id === core_text.normalizeText(record.entryId, 120) || identityMatches(candidate, record))) aliases.set(id, candidate);
            }
            const matching = [...aliases.values()];
            if (hasMatchingArchiveDeletionFence(matching, record) && options.allowDeletedRecreate !== true) {
                transaction.abort();
                return;
            }
            const liveAliases = matching.map(candidate => normalizeRecord(candidate)).filter(Boolean);
            if (liveAliases.length > 1) {
                transaction.abort();
                return;
            }
            let previous = normalizeRecord(exactRaw);
            const exactPrevious = previous;
            if (!previous && liveAliases.length === 1) {
                previous = liveAliases[0];
                // Preserve a legacy/index-assigned durable key instead of creating a second
                // record under a newly fingerprinted ID.
                record = { ...record, entryId: previous.entryId };
            }
            const previousRevision = core_text.normalizeText(previous?.archiveRevision, 240);
            const expectedRevision = core_text.normalizeText(expected?.revision, 240);
            const authorizedIdentityRefresh = options.allowCharacterRename === true
                && exactPrevious === previous
                && core_text.normalizeText(previous?.entryId, 120) === core_text.normalizeText(record.entryId, 120)
                && identityMatchesExceptName(previous, record)
                && ((expected?.present === true && previousRevision === expectedRevision)
                    || (options.seed === true && previousRevision === record.archiveRevision));
            if (previous && !identityMatches(previous, record) && !authorizedIdentityRefresh) return transaction.abort();
            if (expected?.present === false && previous) return transaction.abort();
            const idempotentRetry = options.allowIdempotentRetry === true
                && expected?.present === true
                && exactPrevious === previous
                && identityMatches(previous, record)
                && backupRecordsEquivalent(previous, record);
            if (expected?.present === true && previous && previousRevision !== expectedRevision && !idempotentRetry) return transaction.abort();
            if (expected?.present === true && !previous && options.allowMissingPrevious !== true) return transaction.abort();
            if (options.allowDeletedRecreate === true) {
                // A deliberate new canonical archive may replace an earlier deletion. Clear
                // every matching tombstone alias in this transaction so future seed/cache
                // updates are not blocked by an older entry ID.
                for (const [id, candidate] of aliases) {
                    if (candidate?.deleted === true && id !== record.entryId) store.delete(id);
                }
            }
            if (options.seed === true && previous && previousRevision === record.archiveRevision) {
                const previousCacheTime = Math.max(0, Number(previous.cache?.updatedAt) || 0);
                const incomingCacheTime = Math.max(0, Number(record.cache?.updatedAt) || 0);
                if (previous.cache && (!record.cache || previousCacheTime > incomingCacheTime)) {
                    // Opening a source whose CACHE_KEY is absent/older must never erase the last
                    // same-revision independent cache that could recover generated content.
                    record = { ...record, cache: cloneValue(previous.cache) };
                }
            }
            if (options.seed === true && previous && previousRevision !== record.archiveRevision && Number(previous.updatedAt) > Number(record.updatedAt)) {
                outcome = true;
                return;
            }
            if (!idempotentRetry) store.put(record);
            outcome = true;
        };
        const getRequest = store.get(record.entryId);
        getRequest.onerror = () => transaction.abort();
        getRequest.onsuccess = () => {
            exactRaw = getRequest.result || null;
            exactDone = true;
            finalize();
        };
        const matchesRequest = store.index('chatId').getAll(record.chatId);
        matchesRequest.onerror = () => transaction.abort();
        matchesRequest.onsuccess = () => {
            chatRecords = Array.isArray(matchesRequest.result) ? matchesRequest.result : [];
            matchesDone = true;
            finalize();
        };
        transaction.oncomplete = () => resolve(outcome);
        transaction.onabort = () => reject(new Error('独立档案备份版本已经变化，本次旧结果没有覆盖备份。'));
        transaction.onerror = () => reject(transaction.error || new Error('独立档案备份写入失败。'));
    });
}

async function idbDeleteOne(db, entry) {
    const identity = normalizedIdentity(entry);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(core_constants.ARCHIVE_BACKUP_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME);
        const ids = new Set();
        const records = new Map();
        let exactDone = false;
        let matchesDone = false;
        const finalize = () => {
            if (!exactDone || !matchesDone) return;
            for (const record of records.values()) {
                if (identityMatches(record, entry)) ids.add(core_text.normalizeText(record.entryId, 120));
            }
            // The explicit durable key remains the deletion authority when card metadata drifts.
            // Identity matching is only needed to discover legacy aliases under other keys.
            if (identity.entryId) ids.add(identity.entryId);
            for (const id of ids) {
                if (!id) continue;
                const source = records.get(id) || entry;
                store.put({
                    storageVersion: core_constants.ARCHIVE_BACKUP_STORAGE_VERSION,
                    ...normalizedIdentity(source),
                    entryId: id,
                    deleted: true,
                    deletedAt: Date.now(),
                    memory: null,
                    cache: null,
                    archiveRevision: '',
                    archiveName: '',
                    createdAt: 0,
                    updatedAt: Date.now(),
                });
            }
        };
        const exactRequest = store.get(identity.entryId);
        exactRequest.onerror = () => transaction.abort();
        exactRequest.onsuccess = () => {
            if (exactRequest.result) records.set(identity.entryId, exactRequest.result);
            exactDone = true;
            finalize();
        };
        const matchesRequest = store.index('chatId').getAll(identity.chatId);
        matchesRequest.onerror = () => transaction.abort();
        matchesRequest.onsuccess = () => {
            for (const record of Array.isArray(matchesRequest.result) ? matchesRequest.result : []) {
                const id = core_text.normalizeText(record?.entryId, 120);
                if (id) records.set(id, record);
            }
            matchesDone = true;
            finalize();
        };
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => reject(transaction.error || new Error('独立档案备份删除失败。'));
        transaction.onerror = () => reject(transaction.error || new Error('独立档案备份删除失败。'));
    });
}

async function idbDelete(entries) {
    const db = await openDatabase();
    for (const entry of Array.isArray(entries) ? entries : [entries]) await idbDeleteOne(db, entry);
    return true;
}

function backend() {
    return testBackend || { read: idbRead, put: idbPut, delete: idbDelete };
}

export function setArchiveBackupBackendForTests(value = null) {
    testBackend = value;
}

export async function readArchiveBackup(entry) {
    const raw = await backend().read(entry);
    return normalizeRecord(raw, entry);
}

export async function replaceArchiveBackup(entry, memory, cache, expectedState, options = {}) {
    const record = buildRecord(entry, memory, cache);
    const saved = await backend().put(record, expectedState, options);
    if (!saved) throw new Error('独立档案备份没有写入。');
    return cloneValue(record);
}

export async function seedArchiveBackup(entry, memory, cache = null) {
    const record = buildRecord(entry, memory, cache);
    const saved = await backend().put(record, null, {
        seed: true,
        allowMissingPrevious: true,
        allowCharacterRename: entry?.allowCharacterRename === true,
    });
    return saved ? cloneValue(record) : null;
}

export async function updateArchiveBackupCache(entry, memory, cache) {
    return replaceArchiveBackup(entry, memory, cache, { present: true, revision: core_text.normalizeText(memory?.archiveRevision, 240) }, {
        allowMissingPrevious: true,
        allowCharacterRename: entry?.allowCharacterRename === true,
    });
}

export async function deleteArchiveBackup(entries) {
    return backend().delete(entries);
}
