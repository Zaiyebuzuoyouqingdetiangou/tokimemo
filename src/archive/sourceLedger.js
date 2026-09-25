// Durable, read-only-at-the-provider-boundary source ledger for r46.
// Provider data is copied only after an explicit current-chat scan/import.  The ledger
// never writes back to, edits, or deletes data in another extension.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import * as source_read from './sourceReadGuard.js';

let databasePromise = null;
let testBackend = null;
const ledgerMutationQueues = new Map();

function cloneValue(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function ledgerHash(value) {
    const text = String(value ?? '');
    const a = core_text.hashString(text).toString(36);
    const b = core_text.hashString(`${text.length}\u001f${text.slice(-4096)}\u001f${text.slice(0, 4096)}`).toString(36);
    return `${a.replace('-', 'n')}${b.replace('-', 'n')}`;
}

export function normalizeMemorySourceProvider(value) {
    const raw = String(value ?? '').replace(/\u0000/g, '').trim() || 'unknown-memory';
    if (raw.length <= 100) return raw;
    // Keep a readable prefix for diagnostics, but derive authority from the full
    // untruncated provider identity. File/plugin names that only differ after the
    // first 100 characters must never collapse into one complete-revision stream.
    return `${core_text.normalizeText(raw, 60)}#${ledgerHash(raw)}`;
}

function normalizeLedgerIdentity(value, maxChars, readableChars) {
    const raw = String(value ?? '').replace(/\u0000/g, '').trim();
    if (!raw || raw.length <= maxChars) return raw;
    return `${core_text.normalizeText(raw, readableChars)}#${ledgerHash(raw)}`;
}

export function normalizeMemorySourceId(value) {
    return normalizeLedgerIdentity(value, 180, 130);
}

export function normalizeMemorySourceRevision(value) {
    return normalizeLedgerIdentity(value, 180, 130);
}

export function normalizeMemorySourceHash(value) {
    return normalizeLedgerIdentity(value, 160, 112);
}

function normalizeRevisionList(values) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const normalized = normalizeMemorySourceRevision(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

function normalizeSourceIdList(values) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const normalized = normalizeMemorySourceId(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

export function normalizeMemorySourceScope(scope) {
    const characterKey = core_text.normalizeText(scope?.characterKey, 300);
    const characterName = core_text.normalizeText(scope?.characterName, 120);
    const chatId = core_text.normalizeText(scope?.chatId, 240).replace(/\.jsonl$/i, '').trim();
    if (!characterKey || !chatId) throw new Error('记忆来源必须绑定当前角色与聊天窗口。');
    // The display name is intentionally not part of durable identity. Renaming a
    // character must not orphan the sources already bound to the same card/chat.
    const key = `SL:${ledgerHash(`${characterKey}\u001f${chatId}`)}`;
    return { key, characterKey, characterName, chatId };
}

export function splitMemorySourceText(value) {
    const text = String(value ?? '').replace(/\u0000/g, '').trim();
    if (!text) return [];
    const chunks = [];
    const size = core_constants.MAX_MEMORY_SOURCE_FRAGMENT_CHARS;
    for (let offset = 0; offset < text.length; offset += size) chunks.push(text.slice(offset, offset + size));
    return chunks;
}

export function normalizeMemorySourceCoverage(value = {}, fallbackStatus = 'partial') {
    const allowed = new Set(['complete', 'partial', 'truncated', 'failed']);
    let status = allowed.has(value?.status) ? value.status : fallbackStatus;
    const returned = Math.max(0, Math.floor(Number(value?.returned) || 0));
    const total = value?.total != null && value.total !== '' && Number.isFinite(Number(value.total))
        ? Math.max(0, Math.floor(Number(value.total))) : null;
    const missingAiFloors = Array.isArray(value?.missingAiFloors)
        ? value.missingAiFloors.filter(item => Number.isInteger(Number(item))).slice(0, 5000).map(Number)
        : [];
    const contradictoryComplete = status === 'complete'
        && (missingAiFloors.length > 0 || (total != null && returned !== total));
    if (contradictoryComplete) status = 'partial';
    const reasons = [];
    const suppliedReason = core_text.normalizeText(value?.reason, 240);
    if (suppliedReason) reasons.push(suppliedReason);
    if (missingAiFloors.length) reasons.push(`缺少 ${missingAiFloors.length} 个应有摘要楼层`);
    if (total != null && returned !== total) reasons.push(`来源声明 ${returned}/${total} 条，与 total 不一致`);
    return {
        status,
        returned,
        total,
        reason: core_text.normalizeText([...new Set(reasons)].join('；'), 240),
        missingAiFloors,
    };
}

export function normalizeMemorySourceRecord(raw, fallback = {}) {
    // A batch descriptor is the authority for provider identity. Display labels
    // from raw rows must not split one provider into an untracked second source.
    const provider = normalizeMemorySourceProvider(fallback.provider || raw?.provider);
    const content = String(raw?.content ?? raw?.summary ?? raw?.text ?? '').replace(/\u0000/g, '').trim();
    if (!content) return null;
    const sourceHash = normalizeMemorySourceHash(raw?.sourceHash) || ledgerHash(content);
    const sourceId = normalizeMemorySourceId(raw?.sourceId || raw?.externalId || raw?.id)
        || normalizeMemorySourceId(`${provider}:${sourceHash}`);
    const revision = normalizeMemorySourceRevision(raw?.revision || fallback.revision) || sourceHash;
    const batchRevision = normalizeMemorySourceRevision(raw?.batchRevision || fallback.batchRevision || fallback.revision) || revision;
    return {
        provider,
        providerVersion: core_text.normalizeText(raw?.providerVersion || fallback.providerVersion, 80) || 'unknown',
        sourceId,
        revision,
        batchRevision,
        sourceHash,
        type: core_text.normalizeText(raw?.type, 80) || 'memory',
        date: core_text.normalizeText(raw?.date ?? raw?.timestamp, 100),
        title: core_text.normalizeText(raw?.title, 180),
        fragments: splitMemorySourceText(content),
        importedAt: Math.max(0, Number(raw?.importedAt) || Date.now()),
    };
}

function currentRecords(records) {
    const latest = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        const key = `${record.provider}\u001f${record.sourceId}`;
        const previous = latest.get(key);
        if (!previous || Number(record.importedAt) >= Number(previous.importedAt)) latest.set(key, record);
    }
    return [...latest.values()];
}

export function ledgerCurrentRecords(ledger) {
    const sourceByProvider = new Map((Array.isArray(ledger?.sources) ? ledger.sources : [])
        .map(source => {
            const allowed = Array.isArray(source?.allowedSourceIds)
                ? new Set(normalizeSourceIdList(source.allowedSourceIds))
                : null;
            // All records in this projection share the same provider descriptor.
            // Build its retained revision set once, not again for every record;
            // keep this local so the next projection sees any source revocation.
            const coverage = normalizeMemorySourceCoverage(source?.coverage);
            const revision = normalizeMemorySourceRevision(source?.revision);
            const baselineRevision = normalizeMemorySourceRevision(
                source?.baselineRevision || (coverage.status === 'complete' ? revision : ''),
            );
            const overlayRevisions = new Set(normalizeRevisionList(source?.overlayRevisions));
            if (coverage.status !== 'complete' && revision) overlayRevisions.add(revision);
            return [normalizeMemorySourceProvider(source?.provider), { allowed, baselineRevision, overlayRevisions }];
        }));
    const projected = (Array.isArray(ledger?.records) ? ledger.records : []).filter(record => {
        const descriptor = sourceByProvider.get(record.provider);
        if (!descriptor) return true;
        // A precise world-book selection is an immediate user revocation. Even
        // when the next read is partial/failed, old baseline rows outside the
        // current UID whitelist may not continue entering generation prompts.
        if (descriptor.allowed && !descriptor.allowed.has(record.sourceId)) return false;
        const { baselineRevision, overlayRevisions } = descriptor;
        if (!baselineRevision && !overlayRevisions.size) return true;
        const recordBatchRevision = normalizeMemorySourceRevision(record.batchRevision || record.revision);
        return recordBatchRevision === baselineRevision || overlayRevisions.has(recordBatchRevision);
    });
    return currentRecords(projected).map(record => ({
        ...cloneValue(record),
        content: (Array.isArray(record.fragments) ? record.fragments : []).join(''),
    }));
}

function normalizeLedger(raw, scope = null) {
    if (!raw || Number(raw.storageVersion) !== core_constants.MEMORY_SOURCE_LEDGER_STORAGE_VERSION) return null;
    const identity = normalizeMemorySourceScope(raw.scope);
    if (scope && identity.key !== normalizeMemorySourceScope(scope).key) return null;
    const records = [];
    for (const item of Array.isArray(raw.records) ? raw.records : []) {
        const record = normalizeMemorySourceRecord({ ...item, content: Array.isArray(item?.fragments) ? item.fragments.join('') : item?.content });
        if (!record) continue;
        records.push(record);
    }
    const sources = (Array.isArray(raw.sources) ? raw.sources : []).map(source => ({
        ...cloneValue(source),
        provider: normalizeMemorySourceProvider(source?.provider),
        label: core_text.normalizeText(source?.label, 100) || normalizeMemorySourceProvider(source?.provider),
        allowedSourceIds: Array.isArray(source?.allowedSourceIds)
            ? normalizeSourceIdList(source.allowedSourceIds)
            : undefined,
    }));
    return {
        storageVersion: core_constants.MEMORY_SOURCE_LEDGER_STORAGE_VERSION,
        scope: identity,
        records,
        sources,
        updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
    };
}

function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('记忆来源账本读取失败。'));
    });
}

function transactionDone(transaction, message) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error(message));
        transaction.onabort = () => reject(transaction.error || new Error(message));
    });
}

function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!globalThis.indexedDB?.open) return Promise.reject(new Error('当前浏览器没有可用的 IndexedDB，无法保存记忆来源账本。'));
    let stopped = false;
    const opening = new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(core_constants.MEMORY_SOURCE_LEDGER_DB_NAME, core_constants.MEMORY_SOURCE_LEDGER_STORAGE_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME)) {
                db.createObjectStore(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME, { keyPath: 'scope.key' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            if (stopped) { db.close(); return; }
            db.onclose = () => { if (databasePromise === pending) databasePromise = null; };
            db.onversionchange = () => {
                try { db.close(); } catch {}
                if (databasePromise === pending) databasePromise = null;
            };
            resolve(db);
        };
        request.onerror = () => reject(request.error || new Error('无法打开记忆来源账本。'));
        request.onblocked = () => reject(new Error('记忆来源账本被旧页面占用。'));
    });
    const pending = source_read.boundedSourceRead(() => opening).catch(error => {
        // A synchronous open() exception rejects the executor too. Never retain
        // that rejected promise for the lifetime of the page.
        stopped = true;
        if (databasePromise === pending) databasePromise = null;
        throw error;
    });
    databasePromise = pending;
    return pending;
}

async function finishLedgerTransaction(transaction, request, signal) {
    try {
        const [result] = await source_read.boundedSourceRead(() => Promise.all([
            requestValue(request), transactionDone(transaction, '记忆来源账本事务未完成。'),
        ]), signal);
        return result;
    } catch (error) {
        // Never let a timed-out/cancelled write commit later behind a new scan.
        try { transaction.abort(); } catch {}
        throw error;
    }
}

async function idbRead(scope, { signal = null } = {}) {
    const db = await source_read.waitForSourceRead(openDatabase, signal);
    const identity = normalizeMemorySourceScope(scope);
    const transaction = db.transaction(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME, 'readonly');
    return finishLedgerTransaction(transaction, transaction.objectStore(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME).get(identity.key), signal);
}

async function idbWrite(ledger, { signal = null } = {}) {
    const db = await source_read.waitForSourceRead(openDatabase, signal);
    const transaction = db.transaction(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME).put(ledger);
    await finishLedgerTransaction(transaction, request, signal);
    return true;
}

async function idbDelete(scope) {
    const db = await openDatabase();
    const identity = normalizeMemorySourceScope(scope);
    const transaction = db.transaction(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(core_constants.MEMORY_SOURCE_LEDGER_STORE_NAME).delete(identity.key);
    await finishLedgerTransaction(transaction, request);
    return true;
}

function backend() {
    return testBackend || { read: idbRead, write: idbWrite, delete: idbDelete };
}

export function setMemorySourceLedgerBackendForTests(value = null) {
    testBackend = value;
    ledgerMutationQueues.clear();
}

export async function readMemorySourceLedger(scope, { signal = null } = {}) {
    const raw = await source_read.waitForSourceRead(() => backend().read(normalizeMemorySourceScope(scope), { signal }), signal);
    const ledger = normalizeLedger(raw, scope);
    if (raw != null && !ledger) throw new Error('记忆来源账本校验失败；为避免覆盖旧来源，已停止本次操作。');
    return ledger;
}

function runLedgerMutation(identity, operation) {
    const previous = ledgerMutationQueues.get(identity.key) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(operation);
    ledgerMutationQueues.set(identity.key, pending);
    return pending.finally(() => {
        if (ledgerMutationQueues.get(identity.key) === pending) ledgerMutationQueues.delete(identity.key);
    });
}

function mergeMemorySourceLedgerBatch(previous, identity, batch = {}) {
    const records = previous?.records ? [...previous.records] : [];
    const provider = normalizeMemorySourceProvider(batch.provider);
    const rawRevision = normalizeMemorySourceRevision(batch.revision);
    const batchRevision = rawRevision || ledgerHash(JSON.stringify((Array.isArray(batch.records) ? batch.records : []).map(item => ({
        sourceId: item?.sourceId || item?.externalId || item?.id || '',
        revision: item?.revision || '',
        sourceHash: item?.sourceHash || '',
        content: String(item?.content ?? item?.summary ?? item?.text ?? ''),
    }))));
    const exact = new Set(records.map(item => `${item.provider}\u001f${item.sourceId}\u001f${item.batchRevision || item.revision}\u001f${item.revision}\u001f${item.sourceHash}`));
    for (const raw of Array.isArray(batch.records) ? batch.records : []) {
        const record = normalizeMemorySourceRecord(raw, { ...batch, batchRevision });
        if (!record) continue;
        const key = `${record.provider}\u001f${record.sourceId}\u001f${record.batchRevision}\u001f${record.revision}\u001f${record.sourceHash}`;
        if (exact.has(key)) continue;
        exact.add(key);
        records.push(record);
    }
    const sources = [...(previous?.sources || [])];
    if (provider) {
        const coverage = normalizeMemorySourceCoverage(batch.coverage, batch.coverage?.status || 'partial');
        const previousDescriptor = sources.find(item => item.provider === provider);
        const previousCoverage = normalizeMemorySourceCoverage(previousDescriptor?.coverage);
        const previousRevision = normalizeMemorySourceRevision(previousDescriptor?.revision);
        let baselineRevision = normalizeMemorySourceRevision(previousDescriptor?.baselineRevision)
            || (previousCoverage.status === 'complete' ? previousRevision : '');
        let overlayRevisions = normalizeRevisionList(previousDescriptor?.overlayRevisions);
        if (previousDescriptor && previousCoverage.status !== 'complete' && previousRevision) overlayRevisions.push(previousRevision);
        if (coverage.status === 'complete') {
            baselineRevision = batchRevision;
            overlayRevisions = [];
        } else {
            overlayRevisions.push(batchRevision);
            overlayRevisions = normalizeRevisionList(overlayRevisions);
        }
        const descriptor = {
            provider,
            label: core_text.normalizeText(batch.label, 100) || provider,
            sourceKind: core_text.normalizeText(batch.sourceKind, 80),
            sourceKey: core_text.normalizeText(batch.sourceKey, 240),
            providerVersion: core_text.normalizeText(batch.providerVersion, 80) || 'unknown',
            revision: batchRevision,
            baselineRevision,
            overlayRevisions,
            coverage,
            updatedAt: Date.now(),
        };
        if (Array.isArray(batch.allowedSourceIds)) {
            descriptor.allowedSourceIds = normalizeSourceIdList(batch.allowedSourceIds);
        }
        const index = sources.findIndex(item => item.provider === provider);
        if (index >= 0) sources[index] = descriptor;
        else sources.push(descriptor);
    }
    const ledger = {
        storageVersion: core_constants.MEMORY_SOURCE_LEDGER_STORAGE_VERSION,
        scope: identity,
        records,
        sources,
        updatedAt: Date.now(),
    };
    return ledger;
}

async function upsertMemorySourceLedgerBatchesUnlocked(identity, batches, assertCurrent = () => {}, signal = null) {
    assertCurrent();
    let ledger = await readMemorySourceLedger(identity, { signal });
    for (const batch of batches) ledger = mergeMemorySourceLedgerBatch(ledger, identity, batch);
    if (!batches.length) return ledger;
    assertCurrent();
    await backend().write(cloneValue(ledger), { signal });
    assertCurrent();
    return normalizeLedger(ledger, identity);
}

export async function upsertMemorySourceLedger(scope, batch = {}, { assertCurrent = () => {}, signal = null } = {}) {
    const identity = normalizeMemorySourceScope(scope);
    return runLedgerMutation(identity, () => upsertMemorySourceLedgerBatchesUnlocked(identity, [batch], assertCurrent, signal));
}

export async function upsertMemorySourceLedgerBatches(scope, batches = [], { assertCurrent = () => {}, signal = null } = {}) {
    const identity = normalizeMemorySourceScope(scope);
    const list = Array.isArray(batches) ? batches.filter(batch => batch && typeof batch === 'object') : [];
    return runLedgerMutation(identity, () => upsertMemorySourceLedgerBatchesUnlocked(identity, list, assertCurrent, signal));
}

export async function deleteMemorySourceLedger(scope) {
    const identity = normalizeMemorySourceScope(scope);
    return runLedgerMutation(identity, async () => {
        const storage = backend();
        if (typeof storage.delete !== 'function') throw new Error('记忆来源账本后端不支持删除。');
        await storage.delete(identity);
        const after = await storage.read(identity);
        if (after != null) throw new Error('记忆来源账本清除后读回验证失败。');
        return true;
    });
}

export function memorySourceLedgerSummary(ledger) {
    const records = ledgerCurrentRecords(ledger);
    const chars = records.reduce((sum, item) => sum + item.content.length, 0);
    return {
        recordCount: records.length,
        totalChars: chars,
        sources: (ledger?.sources || []).map(item => ({ ...cloneValue(item), coverage: normalizeMemorySourceCoverage(item.coverage) })),
    };
}
