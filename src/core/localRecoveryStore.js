// Own, lazy browser storage. Never opened by bootstrap or ordinary message events.
// A revisioned null payload is a tombstone: delayed writers cannot resurrect it.
const DATABASE = 'heartbeat_memories_local_recovery_v1';
const STORE = 'records';
let testBackend = null;
export function setLocalRecoveryBackendForTests(value) { testBackend = value; }
export function localRecoveryStorageAvailable() {
    try { return !!testBackend || typeof globalThis.indexedDB?.open === 'function'; } catch { return false; }
}
function failure(code = 'RMT_LOCAL_STORAGE') {
    const error = new Error(code === 'RMT_LOCAL_CAS' ? '本机保存版本已变化；原记录保留，请重新打开后继续。' : '浏览器未能保存本机记录；原记录保留，请勿刷新未保存的页面。');
    Object.assign(error, { code, safeToDisplay: true, safeUserMessage: error.message, retryable: false, retryableJson: false });
    return error;
}
async function database() {
    return new Promise((resolve, reject) => {
        let request, settled = false;
        const timer = setTimeout(() => { settled = true; reject(failure()); }, 5000);
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
export async function readLocalRecoveryRecord(key) {
    if (!validKey(key)) throw failure();
    if (testBackend) return testBackend.read(key);
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly'); let result = null;
            const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(failure()); }, 5000);
            const request = tx.objectStore(STORE).get(key);
            request.onsuccess = () => { result = request.result || null; };
            tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
            tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(failure()); };
        });
    } finally { db.close(); }
}
export async function compareLocalRecoveryRecord(key, expectedRevision, payload) {
    if (!validKey(key) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure();
    if (testBackend) return testBackend.compare(key, expectedRevision, payload);
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = writeTransaction(db, key); let mismatch = false;
            const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(failure()); }, 5000);
            const store = tx.objectStore(STORE), request = store.get(key);
            request.onsuccess = () => {
                if ((request.result?.revision || 0) !== expectedRevision) { mismatch = true; tx.abort(); return; }
                store.put({ key, revision: expectedRevision + 1, payload });
            };
            tx.oncomplete = () => { clearTimeout(timer); resolve(expectedRevision + 1); };
            tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(failure(mismatch ? 'RMT_LOCAL_CAS' : 'RMT_LOCAL_STORAGE')); };
        });
    } finally { db.close(); }
}
