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

function run(mode, action, { signal, isCurrent, onCommitted } = {}) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const cancelled = () => signal?.aborted || (isCurrent && !isCurrent());
        if (cancelled()) { reject(new DOMException('已取消', 'AbortError')); return; }
        const tx = db.transaction(STORE, mode);
        let request;
        const cleanup = () => signal?.removeEventListener?.('abort', abort);
        const abort = () => {
            // If the transaction already committed, its completion is authoritative.
            // Never compensate with a later write that could overwrite a newer action.
            try { tx.abort(); } catch { /* The complete/abort event resolves the outcome. */ }
        };
        tx.oncomplete = () => {
            cleanup();
            try { onCommitted?.(); } catch { /* UI notification cannot undo a committed write. */ }
            resolve(request?.result);
        };
        tx.onerror = () => { cleanup(); reject(tx.error || request?.error || new Error('indexedDB failed')); };
        tx.onabort = () => { cleanup(); reject(tx.error || new DOMException('已取消', 'AbortError')); };
        signal?.addEventListener?.('abort', abort, { once: true });
        try {
            if (cancelled()) { abort(); return; }
            request = action(tx.objectStore(STORE));
            if (mode === 'readwrite' && isCurrent) request.onsuccess = () => {
                // Request success precedes the transaction commit and still
                // permits aborting if the owning song changed during the write.
                try { if (cancelled()) abort(); } catch { abort(); }
            };
        } catch (error) { abort(); cleanup(); reject(error); }
    }));
}

export function mediaKey(kind, scope, songId, shotId = '') {
    return [kind, scope, songId, shotId].join('\u001f');
}

export async function putMedia(key, blob, name = '', details = {}, options = {}) {
    try { await run('readwrite', store => store.put({ key, blob, name, type: blob?.type || '', at: Date.now(), ...(details.sourceUrl ? { sourceUrl: details.sourceUrl } : {}), ...(!blob && details.mediaUrl ? { mediaUrl: details.mediaUrl } : {}), ...(typeof details.artist === 'string' && details.artist ? { artist: details.artist.slice(0, 80) } : {}), ...(typeof details.coverUrl === 'string' && /^https:\/\//.test(details.coverUrl) ? { coverUrl: details.coverUrl } : {}) }), options); return true; }
    catch { return false; }
}

export async function getMedia(key) {
    try { return (await run('readonly', store => store.get(key))) || null; }
    catch { return null; }
}

export async function deleteMedia(key, options = {}) {
    try { await run('readwrite', store => store.delete(key), options); return true; }
    catch { return false; }
}
