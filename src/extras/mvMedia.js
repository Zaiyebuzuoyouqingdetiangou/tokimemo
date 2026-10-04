// MV 本机媒体：用户放入的歌曲和自己的图片，只存在这台设备的浏览器里（IndexedDB），不上传、不写入聊天。
// 打不开 IndexedDB 时静默退回到“只在本次打开期间使用”。
const DB_NAME = 'heartbeatMemoriesMvMedia';
const STORE = 'files';
let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        try {
            const request = globalThis.indexedDB?.open(DB_NAME, 1);
            if (!request) return reject(new Error('indexedDB unavailable'));
            request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' }); };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
        } catch (error) { reject(error); }
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
}

function run(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error || request?.error || new Error('indexedDB failed'));
        tx.onabort = () => reject(tx.error || new Error('indexedDB aborted'));
    }));
}

export function mediaKey(kind, scope, songId, shotId = '') {
    return [kind, scope, songId, shotId].join('\u001f');
}

export async function putMedia(key, blob, name = '', details = {}) {
    try { await run('readwrite', store => store.put({ key, blob, name, type: blob?.type || '', at: Date.now(), ...(details.sourceUrl ? { sourceUrl: details.sourceUrl } : {}) })); return true; }
    catch { return false; }
}

export async function getMedia(key) {
    try { return (await run('readonly', store => store.get(key))) || null; }
    catch { return null; }
}

export async function deleteMedia(key) {
    try { await run('readwrite', store => store.delete(key)); return true; }
    catch { return false; }
}
