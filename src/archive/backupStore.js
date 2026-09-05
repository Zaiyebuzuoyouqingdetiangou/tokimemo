// Heartbeat's independent, browser-local archive content store.
// This module is reachable only from the full runtime bundle; index.js/bootstrap never imports it.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

let databasePromise = null;
let testBackend = null;
const backupWriteChains = new Map();

function assertBackupWriteCurrent(options = {}) {
    if (typeof options.stillCurrent === 'function' && options.stillCurrent() === false) {
        throw new Error('这份档案的写入任务已被撤销，旧结果没有写入。');
    }
}

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

// A deletion fence must survive ordinary character-card edits that change the card
// fingerprint/derived key. Keep this exceptional matcher deliberately narrower than a
// live-record matcher: same chat file, same non-empty avatar, and same slot.
// This prevents a different clone from inheriting the fence while stopping stale source
// metadata from resurrecting the deleted archive after a description edit.
function deletionIdentityMatches(record, entry) {
    const wanted = normalizedIdentity(entry);
    if (!record?.deleted || !wanted.chatId || core_context.comparableChatId(record.chatId) !== wanted.chatId) return false;
    if (core_text.normalizeText(record.entryId, 120) === core_context.archiveIndexEntryId(entry)) return true;
    const recordAvatar = core_text.normalizeText(record.avatar, 300);
    const recordHint = normalizedCharacterIndexHint(record.characterIndexHint);
    return !!wanted.avatar && !!recordAvatar && wanted.avatar === recordAvatar
        && wanted.characterIndexHint >= 0 && recordHint >= 0 && wanted.characterIndexHint === recordHint;
}

function exactIdentityCompatibleWithMissing(record, entry) {
    const wanted = normalizedIdentity(entry);
    if (!record || !wanted.chatId || core_context.comparableChatId(record.chatId) !== wanted.chatId) return false;
    const comparableText = (left, right, limit, ignored = '') => {
        const a = core_text.normalizeText(left, limit);
        const b = core_text.normalizeText(right, limit);
        if (!a || !b || (ignored && (a === ignored || b === ignored))) return true;
        return a === b;
    };
    if (!comparableText(record.characterName, wanted.characterName, 120, '未命名角色')) return false;
    if (!comparableText(core_context.archiveStoredAvatar(record), wanted.avatar, 300)) return false;
    if (!comparableText(record.characterKey, wanted.characterKey, 300)) return false;
    if (!comparableText(record.characterFingerprint, wanted.characterFingerprint, 160)) return false;
    const recordHasHint = Object.prototype.hasOwnProperty.call(record, 'characterIndexHint')
        && normalizedCharacterIndexHint(record.characterIndexHint) >= 0;
    const wantedHasHint = normalizedCharacterIndexHint(wanted.characterIndexHint) >= 0;
    if (recordHasHint && wantedHasHint
        && normalizedCharacterIndexHint(record.characterIndexHint) !== normalizedCharacterIndexHint(wanted.characterIndexHint)) return false;
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

function cacheCommitOrder(value) {
    const token = Math.floor(Number(value?.commitToken) || 0);
    if (Number.isSafeInteger(token) && token > 0) return token;
    return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(0, Math.floor(Number(value?.updatedAt) || 0)) * 1000);
}

function cachesEquivalent(left, right) {
    try { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
    catch { return false; }
}

async function serializeBackupWrite(entry, operation) {
    const key = core_context.archiveIndexEntryId(entry);
    const previous = backupWriteChains.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    backupWriteChains.set(key, current);
    try { return await current; }
    finally { if (backupWriteChains.get(key) === current) backupWriteChains.delete(key); }
}

export function hasMatchingArchiveDeletionFence(records, entry) {
    const entryId = core_context.archiveIndexEntryId(entry);
    return (Array.isArray(records) ? records : [])
        .some(record => record?.deleted === true && (
            core_text.normalizeText(record?.entryId, 120) === entryId
            || deletionIdentityMatches(record, entry)
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
    if (entry && !identityMatches(raw, entry)
        && !(exactEntryId && exactIdentityCompatibleWithMissing(raw, entry))
        && !(entry?.allowCharacterRename === true && exactEntryId && identityMatchesExceptName(raw, entry))) return null;
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
    const compatible = (Array.isArray(matches) ? matches : []).filter(item => item?.deleted === true
        ? deletionIdentityMatches(item, entry)
        : identityMatches(item, entry));
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
        let abortReason = null;
        const finalize = () => {
            if (finalized || !exactDone || !matchesDone) return;
            finalized = true;
            try { assertBackupWriteCurrent(options); }
            catch (error) {
                abortReason = error;
                transaction.abort();
                return;
            }
            const aliases = new Map();
            for (const candidate of [exactRaw, ...chatRecords]) {
                const id = core_text.normalizeText(candidate?.entryId, 120);
                if (id && (id === core_text.normalizeText(record.entryId, 120)
                    || identityMatches(candidate, record)
                    || deletionIdentityMatches(candidate, record))) aliases.set(id, candidate);
            }
            const matching = [...aliases.values()];
            const matchingDeletionFences = matching.filter(candidate => candidate?.deleted === true && (
                core_text.normalizeText(candidate?.entryId, 120) === core_context.archiveIndexEntryId(record)
                || deletionIdentityMatches(candidate, record)
            ));
            const recreateStartedAt = Math.max(0, Number(options.recreateStartedAt) || 0);
            const canRecreateDeleted = options.allowDeletedRecreate === true
                && recreateStartedAt > 0
                && matchingDeletionFences.every(candidate => {
                    const deletedAt = Math.max(0, Number(candidate?.deletedAt) || 0);
                    return deletedAt > 0 && deletedAt < recreateStartedAt;
                });
            if (matchingDeletionFences.length && !canRecreateDeleted) {
                abortReason = new Error('这份档案已被明确删除，旧任务不能重新创建它。');
                abortReason.code = 'RMT_ARCHIVE_DELETED_FENCE';
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
            const authorizedMissingFieldEnrichment = exactPrevious === previous
                && core_text.normalizeText(previous?.entryId, 120) === core_text.normalizeText(record.entryId, 120)
                && exactIdentityCompatibleWithMissing(exactRaw, record)
                && ((expected?.present === true && previousRevision === expectedRevision)
                    || (options.seed === true && previousRevision === record.archiveRevision));
            if (previous && !identityMatches(previous, record) && !authorizedIdentityRefresh && !authorizedMissingFieldEnrichment) return transaction.abort();
            const idempotentRetry = options.allowIdempotentRetry === true
                && exactPrevious === previous
                && (identityMatches(previous, record) || authorizedMissingFieldEnrichment)
                && backupRecordsEquivalent(previous, record);
            if (expected?.present === false && previous && !idempotentRetry) return transaction.abort();
            if (expected?.present === true && previous && previousRevision !== expectedRevision && !idempotentRetry) return transaction.abort();
            if (expected?.present === true && !previous && options.allowMissingPrevious !== true) return transaction.abort();
            const replacingProvenInvalidCache = options.seed === true && options.replaceInvalidCache === true;
            if (Number.isFinite(Number(options.expectedCacheOrder))) {
                const expectedCacheOrder = Math.max(0, Math.floor(Number(options.expectedCacheOrder) || 0));
                const currentCacheOrder = previousRevision === record.archiveRevision ? cacheCommitOrder(previous?.cache) : 0;
                if (currentCacheOrder !== expectedCacheOrder) {
                    abortReason = new Error('独立档案备份的派生缓存已被另一个页面更新，本次将重新合并。');
                    abortReason.code = 'RMT_CACHE_CAS_CONFLICT';
                    transaction.abort();
                    return;
                }
            }
            if (!replacingProvenInvalidCache && previous && previousRevision === record.archiveRevision && previous.cache && record.cache) {
                const previousCacheOrder = cacheCommitOrder(previous.cache);
                const incomingCacheOrder = cacheCommitOrder(record.cache);
                if (incomingCacheOrder < previousCacheOrder
                    || (incomingCacheOrder === previousCacheOrder && !cachesEquivalent(previous.cache, record.cache))) return transaction.abort();
            }
            if (canRecreateDeleted) {
                // A deliberate new canonical archive may replace an earlier deletion. Clear
                // every matching tombstone alias in this transaction so future seed/cache
                // updates are not blocked by an older entry ID.
                for (const [id, candidate] of aliases) {
                    if (candidate?.deleted === true && id !== record.entryId) store.delete(id);
                }
            }
            if (options.seed === true && !replacingProvenInvalidCache && previous && previousRevision === record.archiveRevision) {
                const previousCacheTime = Math.max(0, Number(previous.cache?.updatedAt) || 0);
                const incomingCacheTime = Math.max(0, Number(record.cache?.updatedAt) || 0);
                if (previous.cache && (!record.cache || previousCacheTime > incomingCacheTime)) {
                    // Opening a source whose CACHE_KEY is absent/older must never erase the last
                    // same-revision independent cache that could recover generated content.
                    record = { ...record, cache: cloneValue(previous.cache) };
                }
            }
            if (options.seed === true && previous && previousRevision !== record.archiveRevision) {
                // Seeding mirrors a source; it is never allowed to replace a canonical IDB
                // revision. Revision IDs are opaque and wall clocks can tie or move backwards.
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
        transaction.onabort = () => reject(abortReason || new Error('独立档案备份版本已经变化，本次旧结果没有覆盖备份。'));
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
    const targets = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!targets.length) return true;
    return new Promise((resolve, reject) => {
        // A character group is one user-visible deletion. Resolve every exact/legacy alias and
        // write all tombstones in one IndexedDB transaction so an Nth-record failure cannot
        // leave the first N-1 backups silently deleted while the library index remains intact.
        const transaction = db.transaction(core_constants.ARCHIVE_BACKUP_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(core_constants.ARCHIVE_BACKUP_STORE_NAME);
        const discovered = targets.map(() => ({ exact: null, chat: [] }));
        let pending = targets.length * 2;
        let finalized = false;
        const abort = error => {
            if (error) transaction.__rmtAbortReason = error;
            try { transaction.abort(); } catch {}
        };
        const finishDiscovery = () => {
            pending -= 1;
            if (pending || finalized) return;
            finalized = true;
            const tombstones = new Map();
            const deletedAt = Date.now();
            for (let index = 0; index < targets.length; index += 1) {
                const target = targets[index];
                const identity = normalizedIdentity(target);
                const records = new Map();
                const exact = discovered[index].exact;
                if (exact?.entryId) records.set(core_text.normalizeText(exact.entryId, 120), exact);
                for (const record of discovered[index].chat) {
                    const id = core_text.normalizeText(record?.entryId, 120);
                    if (id) records.set(id, record);
                }
                const ids = new Set(identity.entryId ? [identity.entryId] : []);
                for (const record of records.values()) {
                    if (identityMatches(record, target)) ids.add(core_text.normalizeText(record.entryId, 120));
                }
                for (const id of ids) {
                    if (!id) continue;
                    const source = records.get(id) || target;
                    tombstones.set(id, {
                        storageVersion: core_constants.ARCHIVE_BACKUP_STORAGE_VERSION,
                        ...normalizedIdentity(source),
                        entryId: id,
                        deleted: true,
                        deletedAt,
                        memory: null,
                        cache: null,
                        archiveRevision: '',
                        archiveName: '',
                        createdAt: 0,
                        updatedAt: deletedAt,
                    });
                }
            }
            try {
                for (const record of tombstones.values()) store.put(record);
            } catch (error) { abort(error); }
        };
        targets.forEach((target, index) => {
            const identity = normalizedIdentity(target);
            const exactRequest = store.get(identity.entryId);
            exactRequest.onerror = () => abort(exactRequest.error || new Error('独立档案备份删除失败。'));
            exactRequest.onsuccess = () => { discovered[index].exact = exactRequest.result || null; finishDiscovery(); };
            const matchesRequest = store.index('chatId').getAll(identity.chatId);
            matchesRequest.onerror = () => abort(matchesRequest.error || new Error('独立档案备份删除失败。'));
            matchesRequest.onsuccess = () => { discovered[index].chat = Array.isArray(matchesRequest.result) ? matchesRequest.result : []; finishDiscovery(); };
        });
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => reject(transaction.__rmtAbortReason || transaction.error || new Error('独立档案备份删除失败。'));
        transaction.onerror = () => reject(transaction.error || new Error('独立档案备份删除失败。'));
    });
}

function backend() {
    return testBackend || {
        read: idbRead,
        put: idbPut,
        delete: idbDelete,
    };
}

export function setArchiveBackupBackendForTests(value = null) {
    testBackend = value;
}

export async function readArchiveBackup(entry) {
    const raw = await backend().read(entry);
    return normalizeRecord(raw, entry);
}

export async function readArchiveBackupState(entry) {
    const raw = await backend().read(entry);
    const exactEntryId = core_text.normalizeText(raw?.entryId, 120) === core_context.archiveIndexEntryId(entry);
    if (raw?.deleted === true && (exactEntryId || deletionIdentityMatches(raw, entry))) {
        return { deleted: true, deletedAt: Math.max(0, Number(raw.deletedAt) || 0), record: null };
    }
    return { deleted: false, deletedAt: 0, record: normalizeRecord(raw, entry) };
}

export async function hasArchiveBackupDeletionFence(entry) {
    return (await readArchiveBackupState(entry)).deleted === true;
}

export async function replaceArchiveBackup(entry, memory, cache, expectedState, options = {}) {
    return serializeBackupWrite(entry, async () => {
        assertBackupWriteCurrent(options);
        const record = buildRecord(entry, memory, cache);
        if (expectedState?.present === true && options.allowMissingPrevious === true && record.cache) {
            const previous = await readArchiveBackup(entry);
            assertBackupWriteCurrent(options);
            if (previous?.archiveRevision === record.archiveRevision && previous.cache) {
                const previousOrder = cacheCommitOrder(previous.cache);
                const incomingOrder = cacheCommitOrder(record.cache);
                if (incomingOrder < previousOrder
                    || (incomingOrder === previousOrder && !cachesEquivalent(previous.cache, record.cache))) {
                    throw new Error('独立档案备份已有更新的派生缓存，本次旧结果没有覆盖备份。');
                }
            }
        }
        assertBackupWriteCurrent(options);
        const saved = await backend().put(record, expectedState, options);
        assertBackupWriteCurrent(options);
        if (!saved) throw new Error('独立档案备份没有写入。');
        return cloneValue(record);
    });
}

export async function seedArchiveBackup(entry, memory, cache = null, options = {}) {
    return serializeBackupWrite(entry, async () => {
        assertBackupWriteCurrent(options);
        const record = buildRecord(entry, memory, cache);
        const previous = await readArchiveBackup(entry);
        assertBackupWriteCurrent(options);
        if (options.replaceInvalidCache !== true && previous?.archiveRevision === record.archiveRevision && previous.cache
            && (!record.cache || cacheCommitOrder(previous.cache) > cacheCommitOrder(record.cache))) {
            record.cache = cloneValue(previous.cache);
        }
        const saved = await backend().put(record, null, {
            seed: true,
            allowMissingPrevious: true,
            allowCharacterRename: entry?.allowCharacterRename === true,
            replaceInvalidCache: options.replaceInvalidCache === true,
            stillCurrent: options.stillCurrent,
        });
        assertBackupWriteCurrent(options);
        return saved ? cloneValue(record) : null;
    });
}

export async function updateArchiveBackupCache(entry, memory, cache, options = {}) {
    return replaceArchiveBackup(entry, memory, cache, { present: true, revision: core_text.normalizeText(memory?.archiveRevision, 240) }, {
        allowMissingPrevious: true,
        allowCharacterRename: entry?.allowCharacterRename === true,
        expectedCacheOrder: options.expectedCacheOrder,
        stillCurrent: options.stillCurrent,
    });
}

export async function deleteArchiveBackup(entries) {
    return backend().delete(entries);
}
