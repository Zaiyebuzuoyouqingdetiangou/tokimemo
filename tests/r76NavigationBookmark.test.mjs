import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../src/ui/navigationBookmark.js';
import * as overlay from '../src/ui/overlay.js';
import * as contextApi from '../src/core/context.js';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as backup from '../src/archive/backupStore.js';
import * as library from '../src/archive/library.js';
import { state } from '../src/core/state.js';

// Host/DOM boundary doubles; closing, bookmarks, identity checks and cache reads
// execute their production paths. No generation or archive writer is substituted.
function fixture(t, { page = 'chooser', archive = true } = {}) {
    const globals = new Map(['SillyTavern', 'document', 'toastr', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const fields = ['activeMode', 'activeSession', 'activeArchiveSnapshot', 'activeArchiveReadOnly', 'archiveViewLevel',
        'archiveLibraryCharacterKey', 'busy', 'activeTaskAbortController', 'activeTaskBackgrounded', 'contentManagerOpen'];
    const previous = Object.fromEntries(fields.map(key => [key, state[key]]));
    const bank = { version: constants.MEMORY_VERSION, chatId: 'chat-a', archiveRevision: 'revision-a',
        characterName: '角色甲', memories: [{ id: 'M001', title: '栽花', summary: '一起栽花' }] };
    const ctx = { characterId: 0, groupId: null, chatId: bank.chatId, name1: '用户', name2: '角色甲',
        characters: [{ name: '角色甲', avatar: 'a.png', data: { name: '角色甲' } },
            { name: '角色乙', avatar: 'b.png', data: { name: '角色乙' } }],
        chat: [], chatMetadata: archive ? { [constants.MEMORY_KEY]: bank } : {}, extensionSettings: {},
        getCurrentChatId() { return this.chatId; } };
    const body = { scrollTop: 234, innerHTML: 'current page', replaceChildren() { this.innerHTML = ''; this.scrollTop = 0; } };
    const sections = new Map();
    const element = { hidden: false, dataset: {}, style: { setProperty() {} }, classList: { toggle() {} },
        removeAttribute() {}, addEventListener() {}, querySelector: selector => selector === '.rmt-body' ? body : null };
    const style = { textContent: '' };
    globalThis.document = { getElementById: id => id === constants.OVERLAY_ID ? element
        : [constants.STYLE_ID, constants.SETTINGS_STYLE_ID].includes(id) ? style : null,
        querySelector: selector => selector === '#' + constants.OVERLAY_ID + ' .rmt-body' ? body
            : sections.get(selector.match(/data-rmt-settings-section="(\w+)"/)?.[1]) || null,
        querySelectorAll: () => [] };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.toastr = { info() {} };
    state.activeMode = null; state.activeSession = null; state.activeArchiveSnapshot = null;
    state.activeArchiveReadOnly = true; state.archiveViewLevel = page; state.contentManagerOpen = false;
    state.busy = false; state.activeTaskAbortController = null; state.activeTaskBackgrounded = false;
    navigation.clearReadingPositions(); state.runtimeSessionCache.clear();
    t.after(() => {
        navigation.clearReadingPositions(); state.runtimeSessionCache.clear(); state.archiveSnapshotCache.clear(); Object.assign(state, previous);
        backup.setArchiveBackupBackendForTests(null);
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    function show(page) { state.archiveViewLevel = page; element.hidden = false; body.innerHTML = page; }
    function album() {
        const session = { kind: constants.MODE.ALBUM, chatId: ctx.chatId, archiveRevision: bank.archiveRevision,
            selectedId: 'cg-1', sharedMemory: true, dialogueIndex: 3, entries: [{ id: 'cg-1', title: '栽花' }] };
        ctx.chatMetadata[constants.CACHE_KEY] = { chatId: ctx.chatId, archiveRevision: bank.archiveRevision, album: structuredClone(session) };
        state.activeMode = constants.MODE.ALBUM; state.activeSession = session;
        return session;
    }
    return { ctx, bank, body, element, sections, show, album };
}

test('closing the archive chooser returns to that page and scroll without cancelling background work', t => {
    const f = fixture(t);
    const before = JSON.stringify(f.ctx.chatMetadata);
    const controller = new AbortController();
    state.busy = true; state.activeTaskAbortController = controller;
    overlay.closeArchiveOverlayFromUser();
    assert.equal(f.element.hidden, true); assert.equal(state.busy, true);
    assert.equal(controller.signal.aborted, false); assert.equal(state.activeTaskBackgrounded, true);
    assert.equal(navigation.restorePagePosition({ chooser: () => f.show('chooser') }), true);
    assert.equal(f.body.innerHTML, 'chooser'); assert.equal(f.body.scrollTop, 234);
    assert.equal(JSON.stringify(f.ctx.chatMetadata), before);
});

test('the first-archive screen is remembered even before a memory bank exists', t => {
    const f = fixture(t, { archive: false });
    overlay.closeOverlay();
    assert.equal(navigation.restorePagePosition({ chooser: () => f.show('chooser') }), true);
    assert.equal(f.body.scrollTop, 234); assert.deepEqual(f.ctx.chatMetadata, {});
});

test('leaving home replaces an older content bookmark, including the synchronous home navigation hook', t => {
    const f = fixture(t);
    f.album(); overlay.closeOverlay();
    f.element.hidden = false; f.show('home'); f.body.scrollTop = 89;
    overlay.closeOverlay();
    assert.equal(navigation.restoreReadingPosition({ open() {}, render() {} }), false);
    assert.equal(navigation.restorePagePosition({ home: () => {
        navigation.rememberReadingPosition(); f.show('home');
    } }), true);
    assert.equal(f.body.innerHTML, 'home'); assert.equal(f.body.scrollTop, 89);
});

test('duplicate close events do not replace a detailed content reading position with its parent page', t => {
    const f = fixture(t);
    const original = f.album();
    overlay.closeOverlay(); overlay.closeOverlay();
    let renders = 0;
    assert.equal(navigation.restoreReadingPosition({ open: () => { f.element.hidden = false; }, render: () => { renders++; } }), true);
    assert.equal(renders, 1); assert.equal(state.activeMode, constants.MODE.ALBUM);
    assert.equal(state.activeSession.selectedId, 'cg-1'); assert.equal(state.activeSession.dialogueIndex, 3);
    assert.notEqual(state.activeSession, original); assert.equal(f.body.scrollTop, 234);
});

test('home restores only named settings sections before restoring its scroll', t => {
    const f = fixture(t, { page: 'home' });
    f.sections.set('api', { open: true }); f.sections.set('memory', { open: true });
    f.sections.set('theme', { open: false });
    overlay.closeOverlay();
    f.sections.get('api').open = false; f.sections.get('memory').open = false;
    assert.equal(navigation.restorePagePosition({ home: options => {
        assert.equal(options.section, 'memory', 'reuse the existing memory hydration when that section was open');
        navigation.rememberReadingPosition(); f.show('home');
    } }), true);
    assert.equal(f.sections.get('api').open, true); assert.equal(f.sections.get('memory').open, true);
    assert.equal(f.sections.get('theme').open, false); assert.equal(f.body.scrollTop, 234);
});

test('page bookmarks stay isolated by both chat and character', t => {
    const f = fixture(t);
    overlay.closeOverlay();
    const restore = () => navigation.restorePagePosition({ chooser: () => f.show('chooser') });
    f.ctx.chatId = 'chat-b'; assert.equal(restore(), false);
    f.ctx.chatId = 'chat-a'; f.ctx.characterId = 1; f.ctx.name2 = '角色乙'; assert.equal(restore(), false);
    f.ctx.characterId = 0; f.ctx.name2 = '角色甲'; assert.equal(restore(), true);
});

test('stale content is not restored after archive revision, deletion, or mode fence changes', t => {
    const f = fixture(t); f.album(); overlay.closeOverlay();
    const restore = () => navigation.restoreReadingPosition({ open() {}, render() { assert.fail('stale content rendered'); } });
    f.bank.archiveRevision = 'revision-b'; assert.equal(restore(), false);
    f.bank.archiveRevision = 'revision-a';
    const current = cache.getCache(f.ctx);
    current[constants.MODE_WRITE_FENCES_CACHE_KEY] = { album: { generation: 1, token: 'replaced' } };
    assert.equal(restore(), false);
    delete current[constants.MODE_WRITE_FENCES_CACHE_KEY];
    delete f.ctx.chatMetadata[constants.MEMORY_KEY]; assert.equal(restore(), false);
});

test('async library restoration ignores old scroll after a later close or chat change', async t => {
    const f = fixture(t, { page: 'library' });
    overlay.closeOverlay();
    let finish;
    assert.equal(navigation.restorePagePosition({ library: () => {
        f.show('library'); return new Promise(resolve => { finish = resolve; });
    } }), true);
    overlay.closeOverlay(); f.body.scrollTop = 7; finish(); await Promise.resolve();
    assert.equal(f.body.scrollTop, 7);
    f.element.hidden = false; f.show('library'); f.body.scrollTop = 200; overlay.closeOverlay();
    assert.equal(navigation.restorePagePosition({ library: () => {
        f.show('library'); return new Promise(resolve => { finish = resolve; });
    } }), true);
    f.ctx.chatId = 'chat-b'; f.body.scrollTop = 9; finish(); await Promise.resolve();
    assert.equal(f.body.scrollTop, 9);
});

test('a missing character group and an unrelated read-only snapshot never restore as writable live content', t => {
    const f = fixture(t, { page: 'character' });
    state.archiveLibraryCharacterKey = 'deleted-group'; overlay.closeOverlay();
    assert.equal(navigation.restorePagePosition({ character: () => assert.fail('deleted group rendered') }), false);
    navigation.clearReadingPositions(); f.element.hidden = false; f.album();
    state.activeArchiveSnapshot = { entryId: 'other-chat', chatId: 'chat-b', memory: { ...f.bank, chatId: 'chat-b' } };
    state.activeArchiveReadOnly = true;
    overlay.closeOverlay();
    assert.equal(navigation.hasIndexedReadingPosition(), false);
    assert.equal(navigation.restoreReadingPosition({ open() {}, render() { assert.fail('foreign snapshot rendered'); } }), false);
    assert.equal(f.ctx.chatId, 'chat-a'); assert.equal(contextApi.getChatId(f.ctx), 'chat-a');
});

test('a same-chat snapshot overview is freshly read and remains read-only on reopening', async t => {
    const f = fixture(t, { page: 'snapshot' });
    const entry = { entryId: 'entry-a', characterKey: 'a.png', characterName: '角色甲', characterIndexHint: 0,
        avatar: 'a.png', chatId: f.ctx.chatId, archiveGroupId: 'group-a' };
    f.ctx.extensionSettings[constants.ARCHIVE_INDEX_SETTINGS_KEY] = [entry];
    f.ctx.getRequestHeaders = () => ({});
    state.activeArchiveSnapshot = { ...entry, memory: structuredClone(f.bank), cache: {} };
    state.activeArchiveReadOnly = true;
    const previousSnapshot = state.activeArchiveSnapshot;
    overlay.closeOverlay();
    assert.equal(navigation.hasIndexedReadingPosition(), true);
    let reads = 0;
    globalThis.fetch = async (url, options) => {
        reads++; assert.equal(url, '/api/chats/get'); assert.equal(JSON.parse(options.body).file_name, 'chat-a');
        return { ok: true, json: async () => [{ chat_metadata: { [constants.MEMORY_KEY]: { ...f.bank, archiveName: '重新读取的名称' } } }] };
    };
    let seeded;
    const seedDone = new Promise(resolve => { seeded = resolve; });
    backup.setArchiveBackupBackendForTests({ read: async () => null, put: async () => { seeded(); return true; } });
    let shown = null;
    assert.equal(await navigation.restoreIndexedReadingPosition({ renderSnapshot: snapshot => {
        shown = snapshot; f.show('snapshot');
    }, fallback: () => assert.fail('valid same-chat snapshot fell back') }), true);
    await seedDone;
    assert.equal(reads, 1); assert.notEqual(shown, previousSnapshot);
    assert.equal(shown.archiveName, '重新读取的名称'); assert.equal(state.activeArchiveReadOnly, true);
    assert.equal(f.ctx.chatId, 'chat-a'); assert.equal(f.body.scrollTop, 234);
});

for (const change of ['different-page', 'closed', 'different-chat', 'newer-library']) {
    test(`the actual async library renderer cannot overwrite ${change}`, async t => {
        const f = fixture(t, { archive: false });
        // A group context still permits the library overview, but intentionally
        // has no current single-character archive to seed or recover.
        f.ctx.groupId = 'fixture-group';
        f.ctx.extensionSettings[constants.ARCHIVE_INDEX_SETTINGS_KEY] = [{ entryId: 'entry-a', characterKey: 'a.png',
            characterName: '角色甲', characterIndexHint: 0, avatar: 'a.png', chatId: 'chat-a', archiveGroupId: 'group-a' }];
        const reads = [];
        backup.setArchiveBackupBackendForTests({ read: () => new Promise(resolve => reads.push(resolve)),
            put: async () => assert.fail('overview UI test must not write an archive') });
        let markup = '', writes = 0;
        Object.defineProperty(f.body, 'innerHTML', { get: () => markup, set: value => { markup = value; writes++; }, configurable: true });
        const first = library.showArchiveLibrary();
        assert.equal(reads.length, 1);
        let next;
        if (change === 'different-page') { f.show('home'); f.body.innerHTML = 'new home'; }
        if (change === 'closed') { overlay.closeOverlay(); f.body.innerHTML = 'closed'; }
        if (change === 'different-chat') { f.ctx.chatId = 'chat-b'; f.body.innerHTML = 'new chat'; }
        if (change === 'newer-library') {
            next = library.showArchiveLibrary(); assert.equal(reads.length, 2);
            reads[1](null); await next;
            assert.match(f.body.innerHTML, /档案室一览/);
        }
        const before = f.body.innerHTML, writeCount = writes;
        reads[0](null); await first;
        assert.equal(f.body.innerHTML, before); assert.equal(writes, writeCount);
    });
}
