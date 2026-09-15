import test from 'node:test';
import assert from 'node:assert/strict';
import * as floating from '../src/ui/floatingArchive.js';
import * as overlay from '../src/ui/overlay.js';
import * as navigation from '../src/ui/navigationBookmark.js';
import * as backup from '../src/archive/backupStore.js';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';

// Real archive readers/renderers and metadata identity checks; only host DOM,
// fetch transport and the IndexedDB boundary are replaced. No generated bank or
// archive save operation is mocked into the recovery path.
async function fixture(t) {
    const globals = new Map(['document', 'window', 'SillyTavern', 'fetch', 'toastr'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const fields = ['activeMode', 'activeSession', 'activeArchiveSnapshot', 'activeArchiveReadOnly', 'archiveViewLevel',
        'archiveLibraryCharacterKey', 'busy', 'contentManagerOpen', 'runtimeLifecycleEpoch'];
    const previous = Object.fromEntries(fields.map(key => [key, state[key]]));
    const bank = chat => ({ version: constants.MEMORY_VERSION, chatId: 'chat-' + chat, archiveRevision: 'revision-' + chat,
        characterName: chat === 'a' ? '角色甲' : '角色乙', archiveName: chat === 'a' ? '甲的档案' : '乙的档案',
        userAvatar: 'user-' + chat + '.png', memories: [{ id: 'M001', title: '栽花', summary: '一起栽花', sourceText: 'PRIVATE_FULL_SOURCE_SENTINEL' }] });
    const liveBank = bank('a'), historicalBank = bank('b');
    const entry = { entryId: 'entry-b', characterKey: 'b.png', avatar: 'b.png', userAvatar: 'user-b.png',
        characterName: '角色乙', characterIndexHint: 1, chatId: historicalBank.chatId, archiveGroupId: 'group-b' };
    const ctx = { characterId: 0, groupId: null, chatId: liveBank.chatId, name1: '用户甲', name2: '角色甲', user_avatar: 'user-a.png',
        characters: [{ name: '角色甲', avatar: 'a.png', data: { name: '角色甲' } },
            { name: '角色乙', avatar: 'b.png', data: { name: '角色乙' } }], chat: [],
        chatMetadata: { [constants.MEMORY_KEY]: liveBank, persona: 'user-a.png' },
        extensionSettings: { [constants.ARCHIVE_INDEX_SETTINGS_KEY]: [entry] },
        getCurrentChatId() { return this.chatId; }, getRequestHeaders: () => ({}) };
    const created = [];
    function node() {
        const queries = new Map();
        const element = { children: [], dataset: {}, style: { setProperty() {} }, classList: { toggle() {} },
            appendChild(child) { this.children.push(child); return child; },
            setAttribute() {}, addEventListener() {}, remove() {}, querySelectorAll: () => [],
            querySelector(selector) {
                if (selector === '[data-rmt-home-diagnostic]') return null;
                if (!queries.has(selector)) queries.set(selector, node());
                return queries.get(selector);
            } };
        return element;
    }
    const homeMount = node(), home = node();
    const body = { scrollTop: 247, innerHTML: 'previous content', querySelector: selector =>
        selector === '[data-rmt-home-settings]' ? homeMount : selector === '.rmt-home' ? home : {},
        replaceChildren() { this.innerHTML = ''; this.scrollTop = 0; }, prepend() {} };
    const host = { hidden: false, dataset: {}, style: { setProperty() {} }, classList: { toggle() {} },
        removeAttribute() {}, addEventListener() {}, querySelector: selector => selector === '.rmt-body' ? body : null };
    const style = { textContent: '' };
    globalThis.document = { createElement() { const element = node(); created.push(element); return element; },
        getElementById: id => id === constants.OVERLAY_ID ? host
        : [constants.STYLE_ID, constants.SETTINGS_STYLE_ID].includes(id) ? style : created.find(element => element.id === id) || null,
        querySelector: selector => selector === '#' + constants.OVERLAY_ID + ' .rmt-body' ? body : null,
        querySelectorAll: () => [] };
    delete globalThis.window;
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.toastr = { info() {}, warning() {}, error() {} };
    state.activeMode = null; state.activeSession = null; state.activeArchiveSnapshot = null;
    state.activeArchiveReadOnly = true; state.archiveViewLevel = 'snapshot'; state.archiveLibraryCharacterKey = 'group-b';
    state.busy = false; state.contentManagerOpen = false;
    navigation.clearReadingPositions(); floating.destroyFloatingArchive(); state.runtimeSessionCache.clear(); state.archiveSnapshotCache.clear();
    const stored = new Map();
    backup.setArchiveBackupBackendForTests({
        read: async wanted => structuredClone(stored.get(wanted.entryId) || null),
        put: async record => { stored.set(record.entryId, structuredClone(record)); return true; },
    });
    function album(memory, title = '初次保存的相册') {
        return { kind: constants.MODE.ALBUM, chatId: memory.chatId, archiveRevision: memory.archiveRevision,
            title, selectedId: 'cg-2', category: '全部', page: 1, pageSize: 6, sharedMemory: false,
            entries: [{ id: 'cg-1', title: '一起栽花', unlocked: false, category: '日常', hintLines: [] },
                { id: 'cg-2', title: '一起散步', unlocked: false, category: '日常', hintLines: [] }] };
    }
    let source = { memory: historicalBank, cache: { chatId: historicalBank.chatId, archiveRevision: historicalBank.archiveRevision,
        [constants.MODE.ALBUM]: album(historicalBank) } };
    await backup.seedArchiveBackup(entry, source.memory, source.cache);
    const requests = []; let gate = null;
    globalThis.fetch = async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        assert.equal(url, '/api/chats/get', 'opening the floating avatar may only read its indexed source chat');
        if (gate) await gate;
        return { ok: true, json: async () => [{ chat_metadata: { [constants.MEMORY_KEY]: structuredClone(source.memory),
            [constants.CACHE_KEY]: structuredClone(source.cache), persona: 'user-b.png' } }] };
    };
    function showHistorical({ detail = true } = {}) {
        const snapshot = { ...entry, memory: structuredClone(source.memory), cache: structuredClone(source.cache),
            archiveName: source.memory.archiveName, loadedAt: Date.now() };
        state.activeArchiveSnapshot = snapshot; state.activeArchiveReadOnly = true;
        state.archiveViewLevel = 'snapshot'; state.activeMode = detail ? constants.MODE.ALBUM : null;
        state.activeSession = detail ? structuredClone(source.cache.album) : null;
        host.hidden = false; body.innerHTML = 'historical view'; body.scrollTop = 247;
        return snapshot;
    }
    let cleaned = false;
    async function cleanup() {
        if (cleaned) return; cleaned = true;
        // Join the existing per-entry seed chain before restoring global fixtures.
        await backup.seedArchiveBackup(entry, source.memory, source.cache);
        floating.destroyFloatingArchive(); navigation.clearReadingPositions(); state.runtimeSessionCache.clear(); state.archiveSnapshotCache.clear();
        Object.assign(state, previous); backup.setArchiveBackupBackendForTests(null);
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    }
    t.after(cleanup);
    return { ctx, liveBank, entry, body, host, requests, album, showHistorical, cleanup,
        source: () => source,
        async publish(memory, cache) { source = { memory, cache }; await backup.seedArchiveBackup(entry, memory, cache); },
        pauseRead() { let release; gate = new Promise(resolve => { release = resolve; }); return release; },
    };
}

test('closing historical B remembers B and its Persona, stores no content, and ignores duplicate close', async t => {
    const f = await fixture(t); f.showHistorical();
    overlay.closeOverlay(); const mark = floating.floatingArchiveTarget();
    assert.equal(mark.entryId, 'entry-b'); assert.equal(mark.chatId, 'chat-b');
    assert.equal(mark.avatar, 'b.png'); assert.equal(mark.userAvatar, 'user-b.png');
    assert.equal(mark.ui.selectedId, 'cg-2'); assert.equal(mark.scroll, 247);
    assert.doesNotMatch(JSON.stringify(mark), /PRIVATE_FULL_SOURCE_SENTINEL|memories|"cache"|一起栽花|一起散步/);
    assert.ok(JSON.stringify(mark).length < 2500, 'bookmark must stay scalar and small');
    mark.ui.selectedId = 'tampered'; assert.equal(floating.floatingArchiveTarget().ui.selectedId, 'cg-2');
    state.activeArchiveSnapshot = null; overlay.closeOverlay();
    assert.equal(floating.floatingArchiveTarget().entryId, 'entry-b');
    f.showHistorical(); delete state.activeArchiveSnapshot.userAvatar; delete state.activeArchiveSnapshot.memory.userAvatar;
    delete f.entry.userAvatar; overlay.closeOverlay();
    assert.equal(floating.floatingArchiveTarget().userAvatar, '', 'an older B archive cannot fall through to user A');
    assert.equal(f.requests.length, 0);
});

test('clicking the remembered B avatar freshly reads one archive and restores its detail read-only without switching A', async t => {
    const f = await fixture(t); f.showHistorical(); overlay.closeOverlay();
    const before = JSON.stringify(f.ctx.chatMetadata);
    const nextCache = structuredClone(f.source().cache); nextCache.album.title = '后来保存的新标题'; nextCache.album.selectedId = 'cg-1';
    await f.publish(f.source().memory, nextCache);
    assert.equal(await floating.openFloatingArchive(), true);
    assert.deepEqual(f.requests, [{ url: '/api/chats/get', body: { avatar_url: 'b.png', file_name: 'chat-b' } }]);
    assert.equal(state.activeArchiveSnapshot.entryId, 'entry-b'); assert.equal(state.activeArchiveReadOnly, true);
    assert.equal(state.activeMode, constants.MODE.ALBUM); assert.equal(state.activeSession.title, '后来保存的新标题');
    assert.equal(state.activeSession.selectedId, 'cg-2'); assert.equal(f.body.scrollTop, 247);
    assert.equal(f.ctx.chatId, 'chat-a'); assert.equal(f.ctx.characterId, 0);
    assert.equal(JSON.stringify(f.ctx.chatMetadata), before);
});

for (const change of ['revision', 'mode fence']) {
    test(`a changed ${change} opens the fresh B overview instead of resurrecting its old detail selection`, async t => {
        const f = await fixture(t); f.showHistorical(); overlay.closeOverlay();
        const memory = structuredClone(f.source().memory), cache = structuredClone(f.source().cache);
        if (change === 'revision') {
            memory.archiveRevision = cache.archiveRevision = cache.album.archiveRevision = 'revision-b-new';
            memory.archiveName = '新版乙档案';
        } else cache[constants.MODE_WRITE_FENCES_CACHE_KEY] = { album: { generation: 1, token: 'deleted-old-album' } };
        await f.publish(memory, cache);
        assert.equal(await floating.openFloatingArchive(), true);
        assert.equal(state.activeMode, null); assert.equal(state.activeSession, null);
        assert.equal(state.archiveViewLevel, 'snapshot'); assert.equal(state.activeArchiveSnapshot.entryId, 'entry-b');
        assert.equal(state.activeArchiveSnapshot.memory.archiveRevision, memory.archiveRevision);
        assert.equal(state.activeArchiveReadOnly, true); assert.equal(f.ctx.chatId, 'chat-a');
        assert.match(f.body.innerHTML, /rmt-archive-room/); assert.equal(f.requests.length, 1);
    });
}

test('removing the remembered index row prevents a fetch and cannot resurrect its archive', async t => {
    const f = await fixture(t); f.showHistorical(); overlay.closeOverlay();
    f.ctx.extensionSettings[constants.ARCHIVE_INDEX_SETTINGS_KEY] = [];
    assert.equal(await floating.openFloatingArchive(), false);
    assert.equal(f.requests.length, 0); assert.equal(state.archiveViewLevel, 'home');
    assert.equal(state.activeArchiveSnapshot, null); assert.equal(state.activeSession, null);
    assert.equal(f.ctx.chatId, 'chat-a'); assert.equal(floating.floatingArchiveTarget(), null);
});

test('close, another navigation, changed host chat and runtime teardown all fence an outstanding historical read', async t => {
    for (const interruption of ['close', 'navigate', 'chat', 'epoch']) {
        const f = await fixture(t); f.showHistorical(); overlay.closeOverlay();
        const release = f.pauseRead(); const pending = floating.openFloatingArchive();
        for (let i = 0; i < 20 && !f.requests.length; i++) await Promise.resolve();
        assert.equal(f.requests.length, 1, interruption + ': expected the real source read to be waiting');
        if (interruption === 'close') overlay.closeOverlay();
        if (interruption === 'navigate') { overlay.openOverlay(); state.archiveViewLevel = 'home'; }
        if (interruption === 'chat') f.ctx.chatId = 'chat-c';
        if (interruption === 'epoch') state.runtimeLifecycleEpoch++;
        f.body.innerHTML = 'newer navigation'; f.body.scrollTop = 11;
        const mode = state.activeMode, snapshot = state.activeArchiveSnapshot;
        release(); assert.equal(await pending, false, interruption);
        assert.equal(f.body.innerHTML, 'newer navigation', interruption); assert.equal(f.body.scrollTop, 11, interruption);
        assert.equal(state.activeMode, mode, interruption); assert.equal(state.activeArchiveSnapshot, snapshot, interruption);
        await f.cleanup();
    }
});

test('the current chat avatar preserves the existing live reopen path and does not fetch or become a foreign snapshot', async t => {
    const f = await fixture(t);
    const session = f.album(f.liveBank, '甲的相册');
    f.ctx.chatMetadata[constants.CACHE_KEY] = { chatId: f.ctx.chatId, archiveRevision: f.liveBank.archiveRevision, album: structuredClone(session) };
    state.activeArchiveSnapshot = null; state.activeArchiveReadOnly = false;
    state.archiveViewLevel = 'chooser'; state.activeMode = constants.MODE.ALBUM; state.activeSession = session;
    overlay.closeOverlay();
    assert.equal(floating.floatingArchiveTarget().avatar, 'a.png');
    assert.equal(await floating.openFloatingArchive(), true);
    assert.equal(state.activeArchiveSnapshot, null); assert.equal(state.activeMode, constants.MODE.ALBUM);
    assert.equal(state.activeSession.selectedId, 'cg-2'); assert.equal(f.body.scrollTop, 247);
    assert.equal(f.requests.length, 0); assert.equal(f.ctx.chatId, 'chat-a');
});
