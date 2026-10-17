// Own, lazy browser storage. Never opened by bootstrap or ordinary message events.
// A revisioned null payload is a tombstone: delayed writers cannot resurrect it.
const DATABASE = 'heartbeat_memories_local_recovery_v1';
const STORE = 'records';
let testBackend = null;
export function setLocalRecoveryBackendForTests(value) { testBackend = value; }
export function localRecoveryStorageAvailable() {
    try { return !!testBackend || typeof globalThis.indexedDB?.open === 'function'; } catch { return false; }
}
function failure(code = 'RMT_LOCAL_STORAGE', quota = false) {
    const error = new Error(code === 'RMT_LOCAL_CAS' ? '本机保存版本已变化；原记录保留，请重新打开后继续。' : '浏览器未能保存本机记录；原记录保留，请勿刷新未保存的页面。');
    // quota is a content-free boolean marker so callers can name the remedy
    // (clearing site data) without exposing raw browser error text.
    Object.assign(error, { code, safeToDisplay: true, safeUserMessage: error.message, retryable: false, retryableJson: false,
        ...(quota ? { quota: true } : {}) });
    return error;
}
function quotaFailureOf(tx, code) {
    return failure(code, tx?.error?.name === 'QuotaExceededError');
}
async function database() {
    return new Promise((resolve, reject) => {
        let request, settled = false;
        const timer = setTimeout(() => { settled = true; reject(failure('RMT_LOCAL_TIMEOUT')); }, 10000);
        const stop = () => { clearTimeout(timer); if (!settled) { settled = true; reject(failure()); } };
        try {
            request = globalThis.indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' }); };
            request.onerror = stop; request.onblocked = stop;
            request.onsuccess = () => {
                if (settled) { request.result.close(); return; }
                settled = true; clearTimeout(timer);
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        } catch { stop(); }
    });
}
function writeTransaction(db, key) {
    if (key.startsWith('draft:')) {
        try { return db.transaction(STORE, 'readwrite', { durability: 'strict' }); }
        catch (error) { if (error?.name !== 'TypeError') throw error; }
    }
    return db.transaction(STORE, 'readwrite');
}
function validKey(key) { return typeof key === 'string' && /^(?:draft:[a-f0-9]{64}|credential:[a-f0-9-]{36})$/.test(key); }
// A timer that fires while the transaction is already committing cannot abort it:
// abort() throws and the write still lands. Only report a timeout when abort()
// really stopped the transaction; otherwise wait for its own completion event.
function settleOnTimeout(tx, timeoutFailure, reject, extraMs = 30000) {
    try { tx.abort(); } catch {
        return setTimeout(() => reject(timeoutFailure()), extraMs);
    }
    reject(timeoutFailure());
    return null;
}
export async function readLocalRecoveryRecord(key, { timeoutMs = 30000 } = {}) {
    if (!validKey(key)) throw failure();
    if (testBackend) return testBackend.read(key);
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly'); let result = null, timedOut = false, lateTimer = null;
            // Reading a large saved draft back is slow on phones too.
            const limit = Math.max(30000, Math.min(120000, Number(timeoutMs) || 30000));
            const timer = setTimeout(() => { timedOut = true; lateTimer = settleOnTimeout(tx, () => failure('RMT_LOCAL_TIMEOUT'), reject); }, limit);
            const done = () => { clearTimeout(timer); if (lateTimer) clearTimeout(lateTimer); };
            const request = tx.objectStore(STORE).get(key);
            request.onsuccess = () => { result = request.result || null; };
            tx.oncomplete = () => { done(); resolve(result); };
            tx.onabort = tx.onerror = () => { done(); if (timedOut && !lateTimer) return; reject(failure()); };
        });
    } finally { db.close(); }
}
// A large draft (a long chat's task inputs plus every finished segment) can take
// a phone well over five seconds to write; a fixed 5s limit aborted it every time.
export function localRecoveryWriteTimeout(bytes = 0) {
    const size = Math.max(0, Number(bytes) || 0);
    return Math.min(120000, 5000 + Math.ceil(size / (1024 * 1024)) * 4000);
}
export async function compareLocalRecoveryRecord(key, expectedRevision, payload, { timeoutMs = 5000 } = {}) {
    if (!validKey(key) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure();
    if (testBackend) return testBackend.compare(key, expectedRevision, payload);
    return writeRecord(key, payload, timeoutMs, current => current === expectedRevision);
}
// Explicit discard only: a tombstone at the stored revision + 1, whatever that is.
// It needs no prior read of a possibly huge or unreadable record.
export async function discardLocalRecoveryRecord(key, { timeoutMs = 5000 } = {}) {
    if (!validKey(key)) throw failure();
    if (testBackend) {
        if (typeof testBackend.discard === 'function') return testBackend.discard(key);
        const current = await testBackend.read(key);
        return testBackend.compare(key, Number.isSafeInteger(current?.revision) ? current.revision : 0, null);
    }
    return writeRecord(key, null, timeoutMs, () => true);
}
async function writeRecord(key, payload, timeoutMs, accepts) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = writeTransaction(db, key); let mismatch = false, cloneFailed = false, timedOut = false, lateTimer = null, written = 0;
            const limit = Math.max(5000, Math.min(120000, Number(timeoutMs) || 5000));
            const timer = setTimeout(() => { timedOut = true; lateTimer = settleOnTimeout(tx, () => failure('RMT_LOCAL_TIMEOUT'), reject); }, limit);
            const done = () => { clearTimeout(timer); if (lateTimer) clearTimeout(lateTimer); };
            const store = tx.objectStore(STORE), request = store.get(key);
            request.onsuccess = () => {
                const current = request.result?.revision || 0;
                if (!accepts(current)) { mismatch = true; tx.abort(); return; }
                written = current + 1;
                // r84.177：内容本身存不进去（例如内嵌浏览器不允许存加密钥匙）时单独标出来，调用处好给出准确提示。
                try { store.put({ key, revision: written, payload }); }
                catch (error) { cloneFailed = error?.name === 'DataCloneError'; try { tx.abort(); } catch {} }
            };
            tx.oncomplete = () => { done(); resolve(written); };
            tx.onabort = tx.onerror = () => { done(); if (timedOut && !lateTimer) return; reject(cloneFailed ? failure('RMT_LOCAL_CLONE') : quotaFailureOf(tx, mismatch ? 'RMT_LOCAL_CAS' : 'RMT_LOCAL_STORAGE')); };
        });
    } finally { db.close(); }
}
