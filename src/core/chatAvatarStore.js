// Lightweight, per-chat display overrides. This module deliberately has no runtime imports.
// The bootstrap and bundled runtime may each load a copy; their state must remain one service.
const CHAT_AVATAR_SERVICE = Symbol.for('Hearttrace.chatAvatars.v1');
const CHAT_AVATAR_DB = 'hearttrace-chat-avatars-v1';
const CHAT_AVATAR_STORE = 'pairs';
const CHAT_AVATAR_PREFIX = 'hearttrace:chat-avatars:v1:';

function service() {
    if (!globalThis[CHAT_AVATAR_SERVICE]) {
        globalThis[CHAT_AVATAR_SERVICE] = { cache: new Map(), loads: new Map(), writes: new Map(),
            subscribers: new Set(), db: null, api: null, installations: 0, activeScope: '', scopeQueued: false };
    }
    // Shared with any already loaded lightweight/bundled copy, never a third durable store.
    if (!globalThis[CHAT_AVATAR_SERVICE].fallbackRepairs) globalThis[CHAT_AVATAR_SERVICE].fallbackRepairs = new Map();
    return globalThis[CHAT_AVATAR_SERVICE];
}

function rawContext() {
    try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; }
}

function identityText(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function personaAvatarFile(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f/\\:]/.test(value)) return '';
    const file = value.trim();
    return file && file !== '.' && file !== '..' ? file : '';
}

function currentPersonaAvatar(context, documentLike) {
    const active = personaAvatarFile(context?.user_avatar) || personaAvatarFile(context?.userAvatar)
        || personaAvatarFile(context?.personaAvatar);
    if (active) return active;
    // Some ST/TT contexts omit the current Persona filename. Read the host's selection,
    // not a displayed/cropped avatar, and keep this lightweight module independent of UI code.
    try {
        const selected = documentLike?.querySelector?.('#user_avatar_block .avatar-container.selected');
        const file = personaAvatarFile(selected?.getAttribute?.('data-avatar-id'));
        if (file) return file;
    } catch { /* Older hosts expose only their chat-locked Persona. */ }
    return personaAvatarFile(context?.chatMetadata?.persona);
}

export function chatAvatarScope(context = rawContext(), documentLike = globalThis.document) {
    if (!context || !identityText(context.characterId)) return '';
    if (context.groupId !== undefined && context.groupId !== null && context.groupId !== '' && context.groupId !== false) return '';
    let chat = context.chatId;
    try { chat = context.getCurrentChatId?.() ?? chat; } catch { /* Raw host fallback. */ }
    chat = identityText(chat);
    if (!chat) return '';
    const character = context.characters?.[context.characterId];
    const avatar = identityText(character?.avatar || character?.data?.avatar);
    const name = identityText(context.name2 || character?.name || character?.data?.name);
    if (!avatar && !name) return '';
    const persona = [context.personaId, context.persona_id, context.currentPersonaId,
        currentPersonaAvatar(context, documentLike),
        context.powerUserSettings?.persona_id].map(identityText);
    return JSON.stringify([1, identityText(context.characterId), avatar, name, chat, identityText(context.name1), persona]);
}

function currentScopeMatches(context, scope) {
    return !!scope && chatAvatarScope(context) === scope && chatAvatarScope(rawContext()) === scope;
}

function assertCurrentScope(context, scope) {
    if (!currentScopeMatches(context, scope)) throw new Error('聊天或人物身份已切换，请在当前聊天重新操作。');
}

function pngDataUrl(value) {
    if (typeof value !== 'string' || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) return '';
    const encoded = value.slice(22);
    if (encoded.length % 4 !== 0) return '';
    try {
        const bytes = globalThis.atob(encoded);
        // Require the PNG signature and its mandatory header/end chunks, not an arbitrary data URL.
        if (bytes.length < 45 || bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n'
            || bytes.slice(12, 16) !== 'IHDR' || bytes.slice(-8, -4) !== 'IEND') return '';
        return value;
    } catch { return ''; }
}

function normalizePerson(value) {
    const url = pngDataUrl(value?.url), name = identityText(value?.name);
    return url && name ? Object.freeze({ name, url }) : null;
}

function normalizeRecord(value, scope) {
    if (!value || value.version !== 1 || value.scope !== scope || !Number.isSafeInteger(value.revision) || value.revision < 1) return null;
    if (value.deleted === true) return Object.freeze({ version: 1, scope, revision: value.revision, deleted: true });
    const char = normalizePerson(value.char), user = normalizePerson(value.user);
    return char && user ? Object.freeze({ version: 1, scope, revision: value.revision, char, user }) : null;
}

function newestRecord(...records) {
    return records.filter(Boolean).sort((a, b) => b.revision - a.revision || Number(!!b.deleted) - Number(!!a.deleted))[0] || null;
}

function visibleRecord(record) { return record && !record.deleted ? record : null; }

function emit(name) {
    try { globalThis.dispatchEvent?.(new globalThis.CustomEvent(name)); } catch { /* Optional host events. */ }
}

function notifyChanged() {
    emit('hearttrace:avatars-changed');
    for (const listener of [...service().subscribers]) {
        try { listener(); } catch { /* A consumer cannot break saving or other consumers. */ }
    }
}

function observeCurrentScope() {
    const state = service(), scope = chatAvatarScope(rawContext());
    if (state.activeScope === scope) return;
    // Publish identity changes even when the destination pair is already cached. Assign first
    // and notify in a microtask so a consumer calling getCurrent() cannot recursively notify.
    state.activeScope = scope;
    if (state.scopeQueued) return;
    state.scopeQueued = true;
    queueMicrotask(() => { state.scopeQueued = false; notifyChanged(); });
}

function cacheRecord(scope, record) {
    const state = service(), previous = state.cache.get(scope);
    const chosen = newestRecord(previous, record);
    state.cache.set(scope, chosen);
    if (previous === undefined || JSON.stringify(previous) !== JSON.stringify(chosen)) notifyChanged();
    return chosen;
}

function openDatabase() {
    const state = service();
    if (state.db) return state.db;
    const pending = new Promise((resolve, reject) => {
        const idb = globalThis.indexedDB;
        if (!idb?.open) { reject(new Error('Avatar database unavailable')); return; }
        let request;
        try { request = idb.open(CHAT_AVATAR_DB, 1); } catch (error) { reject(error); return; }
        let settled = false;
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CHAT_AVATAR_STORE)) db.createObjectStore(CHAT_AVATAR_STORE, { keyPath: 'scope' });
        };
        request.onerror = request.onblocked = () => { settled = true; reject(new Error('Avatar database unavailable')); };
        request.onsuccess = () => {
            if (settled) { try { request.result.close(); } catch { /* Already closed. */ } return; }
            const db = request.result;
            db.onversionchange = () => { try { db.close(); } catch { /* Already closed. */ } if (state.db === pending) state.db = null; };
            resolve(db);
        };
    });
    state.db = pending;
    pending.catch(() => { if (state.db === pending) state.db = null; });
    return pending;
}

async function readDatabase(scope) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(CHAT_AVATAR_STORE, 'readonly');
            const request = tx.objectStore(CHAT_AVATAR_STORE).get(scope);
            request.onsuccess = () => resolve(normalizeRecord(request.result, scope));
            request.onerror = tx.onerror = tx.onabort = () => reject(new Error('Avatar read failed'));
        } catch (error) { reject(error); }
    });
}

function readFallback(scope) {
    const storage = globalThis.localStorage;
    if (!storage?.getItem) throw new Error('Avatar storage unavailable');
    const raw = storage.getItem(CHAT_AVATAR_PREFIX + scope);
    if (!raw) return null;
    try { return normalizeRecord(JSON.parse(raw), scope); } catch { return null; }
}

function writeFallback(record) {
    try {
        const storage = globalThis.localStorage;
        if (!storage?.setItem) return false;
        storage.setItem(CHAT_AVATAR_PREFIX + record.scope, JSON.stringify(record));
        return true;
    } catch { return false; }
}

function discardStaleFallback(record) {
    try {
        const current = readFallback(record.scope);
        // No stale record, or another writer already persisted a newer one: do not delete it.
        if (!current || current.revision >= record.revision) return true;
    } catch { /* An unreadable fallback can still be removed safely. */ }
    try {
        const storage = globalThis.localStorage;
        if (!storage?.removeItem) return false;
        storage.removeItem(CHAT_AVATAR_PREFIX + record.scope);
        return true;
    } catch { return false; }
}

function trackFallbackResult(record, consistent) {
    const pending = service().fallbackRepairs;
    if (consistent) {
        if (!pending.get(record.scope) || pending.get(record.scope).revision <= record.revision) pending.delete(record.scope);
    } else pending.set(record.scope, newestRecord(record, pending.get(record.scope)));
    return consistent;
}

function reconcileFallback(record) {
    if (!record) return true;
    const pending = service().fallbackRepairs.get(record.scope);
    record = newestRecord(record, pending);
    try {
        // Re-read after the asynchronous database read so a newer fallback is never
        // replaced with the older value captured at the beginning of hydration.
        const current = readFallback(record.scope);
        if (!current || current.revision >= record.revision) return trackFallbackResult(record, true);
    } catch {
        // A first unknown read is not proof of stale data. It also cannot erase a
        // conflict already confirmed in this session; only verified cleanup can.
        return pending ? trackFallbackResult(record, discardStaleFallback(record)) : true;
    }
    return trackFallbackResult(record, writeFallback(record) || discardStaleFallback(record));
}

function incompleteSaveError() { return new Error('头像更改未能完整保存，请检查本地存储后重试。'); }

async function hydrate(scope) {
    const state = service();
    if (state.loads.has(scope)) return state.loads.get(scope);
    const pending = (async () => {
        let local = null, database = null, available = false;
        try { local = readFallback(scope); available = true; } catch { /* Try the independent database. */ }
        try { database = await readDatabase(scope); available = true; } catch { /* Existing cache stays usable. */ }
        if (!available) {
            if (state.fallbackRepairs.has(scope)) throw incompleteSaveError();
            return state.cache.get(scope) || null;
        }
        // A later refresh retries an incomplete fallback sync, including after restore
        // when the UI already sees the committed tombstone and has no pair to clear.
        const fallbackConsistent = reconcileFallback(database || state.fallbackRepairs.get(scope));
        const record = cacheRecord(scope, newestRecord(local, database));
        if (!fallbackConsistent) throw incompleteSaveError();
        return record;
    })();
    state.loads.set(scope, pending);
    pending.finally(() => { if (state.loads.get(scope) === pending) state.loads.delete(scope); }).catch(() => {});
    return pending;
}

export function readChatAvatarSnapshot(context = rawContext()) {
    observeCurrentScope();
    const scope = chatAvatarScope(context), state = service();
    if (!scope || !currentScopeMatches(context, scope)) return null;
    if (!state.cache.has(scope)) { hydrate(scope).catch(() => {}); return null; }
    return visibleRecord(state.cache.get(scope));
}

export async function loadChatAvatarSnapshot(context = rawContext()) {
    observeCurrentScope();
    const scope = chatAvatarScope(context);
    if (!scope || !currentScopeMatches(context, scope)) return null;
    const record = await hydrate(scope);
    observeCurrentScope();
    return currentScopeMatches(context, scope) ? visibleRecord(record) : null;
}

async function writeDatabase(record, context) {
    const db = await openDatabase();
    assertCurrentScope(context, record.scope);
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(CHAT_AVATAR_STORE, 'readwrite');
            tx.oncomplete = () => resolve(true);
            tx.onerror = tx.onabort = () => reject(new Error('Avatar write failed'));
            // One record / one transaction: either both cropped avatars are stored or neither is.
            tx.objectStore(CHAT_AVATAR_STORE).put(record);
        } catch (error) { reject(error); }
    });
}

async function commitRecord(record, context) {
    assertCurrentScope(context, record.scope);
    let databaseSaved = false, fallbackSaved = false;
    try { databaseSaved = await writeDatabase(record, context); } catch { /* Same atomic pair may use local storage. */ }
    assertCurrentScope(context, record.scope);
    fallbackSaved = writeFallback(record);
    if (!databaseSaved && !fallbackSaved) throw new Error('头像保存失败，原头像已保留。请检查本地存储空间后再试。');
    const fallbackConsistent = trackFallbackResult(record, fallbackSaved || discardStaleFallback(record));
    // Do not roll back a durable primary write or pretend the old pair is still current.
    cacheRecord(record.scope, record);
    if (!fallbackConsistent) {
        // With an inaccessible stale fallback, a later database outage cannot be
        // distinguished from an older successful save after restart. Report partial
        // persistence honestly; hydration will reconcile when storage is available.
        throw incompleteSaveError();
    }
    return visibleRecord(record);
}

function queuedWrite(context, expectedScope, pair) {
    observeCurrentScope();
    const scope = chatAvatarScope(context);
    if (!scope || expectedScope !== scope) return Promise.reject(new Error('聊天或人物身份已切换，请在当前聊天重新操作。'));
    const state = service(), previous = state.writes.get(scope) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
        assertCurrentScope(context, scope);
        const old = await hydrate(scope);
        assertCurrentScope(context, scope);
        const revision = Math.max(Date.now(), Number(old?.revision || 0) + 1);
        const record = Object.freeze(pair ? { version: 1, scope, revision, char: pair.char, user: pair.user }
            : { version: 1, scope, revision, deleted: true });
        return commitRecord(record, context);
    });
    state.writes.set(scope, pending);
    pending.finally(() => { if (state.writes.get(scope) === pending) state.writes.delete(scope); }).catch(() => {});
    return pending;
}

export async function saveChatAvatarPair(pair, { context = rawContext(), expectedScope = '' } = {}) {
    const char = normalizePerson(pair?.char), user = normalizePerson(pair?.user);
    if (!char || !user) throw new Error('请先准备两张完整的 PNG 头像，再应用到当前聊天。');
    return queuedWrite(context, expectedScope, { char, user });
}

export async function clearChatAvatarPair({ context = rawContext(), expectedScope = '' } = {}) {
    return queuedWrite(context, expectedScope, null);
}

export function installChatAvatarBridge() {
    const state = service();
    if (!state.api) state.api = Object.freeze({ apiVersion: 1,
        getCurrent() { return readChatAvatarSnapshot(); },
        refresh() { return loadChatAvatarSnapshot(); },
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            state.subscribers.add(listener);
            return () => { state.subscribers.delete(listener); };
        } });
    if (globalThis.HearttraceAvatars && globalThis.HearttraceAvatars !== state.api) return () => {};
    const first = state.installations === 0;
    globalThis.HearttraceAvatars = state.api; state.installations++;
    if (first) emit('hearttrace:avatars-ready');
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true; state.installations = Math.max(0, state.installations - 1);
        if (state.installations === 0 && globalThis.HearttraceAvatars === state.api) {
            delete globalThis.HearttraceAvatars; state.subscribers.clear(); emit('hearttrace:avatars-changed');
        }
    };
}
