import test from 'node:test';
import assert from 'node:assert/strict';
import * as looks from '../src/core/castLooks.js';
import * as appearance from '../src/generation/cgAppearance.js';
import * as images from '../src/generation/imageGeneration.js';
import * as contextApi from '../src/core/context.js';
import * as archive from '../src/archive/repository.js';
import * as editorUi from '../src/ui/cgPromptEditor.js';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';

function fixture(t) {
    const keys = ['SillyTavern', 'localStorage', 'STBaiBaiImage', 'location'];
    const before = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const storage = new Map();
    const stats = { writes: 0, mirrors: 0, calls: 0, cardReads: 0, fail: false, failMirror: false };
    globalThis.localStorage = {
        getItem: key => storage.get(key) || null,
        setItem(key, value) { if (stats.fail) throw new Error('quota'); stats.writes++; storage.set(key, value); },
    };
    const bank = { version: 3, chatId: 'looks-chat', archiveRevision: 'looks-r1', characterName: '甲', userName: '乙',
        memories: [{ id: 'M001', title: '栽花', summary: '甲和乙在庭院栽花。', detail: '甲扶苗，乙浇水。' }] };
    const ctx = { characterId: 0, groupId: null, chatId: bank.chatId, name1: '乙', name2: '甲',
        characters: [{ name: '甲', avatar: 'char.png', data: { name: '甲', avatar: 'char.png' } }],
        chat: [], extensionSettings: {}, chatMetadata: { [constants.MEMORY_KEY]: bank },
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { stats.cardReads++; return { description: '黑色短发，身高180cm，性格沉稳', persona: '银色长发，喜欢音乐' }; },
        saveMetadataDebounced() { stats.mirrors++; if (stats.failMirror) throw new Error('host unavailable'); },
    };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.location = { href: 'tauri://localhost/' };
    const requests = [];
    globalThis.STBaiBaiImage = { apiVersion: 1, capabilities: { generate: true, saveToGallery: true },
        getBackendStatus: () => ({ configured: true, supportsCharacters: false }),
        async generate(request) { stats.calls++; requests.push(request); return { path: '/user/images/fixture/r75-looks.png' }; } };
    const oldSnapshot = state.activeArchiveSnapshot;
    state.activeArchiveSnapshot = null;
    t.after(() => {
        state.activeArchiveSnapshot = oldSnapshot;
        state.archiveDeletionFences.clear();
        for (const [key, descriptor] of before) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    return { ctx, bank, storage, stats, requests,
        ticket() { return { origin: contextApi.captureTaskOrigin(ctx, bank.archiveRevision), expectedSignature: looks.castLooksSignature(looks.readCastLooks(ctx)) }; },
    };
}

// DOM boundary only: production editor opening, input listeners, origin checks and
// save action are exercised. This deliberately makes no browser/layout claims.
function editorFixture(f, t, image = null) {
    const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const beforeToastr = Object.getOwnPropertyDescriptor(globalThis, 'toastr');
    const previousMode = state.activeMode, previousSession = state.activeSession;
    class Node {
        constructor() { this.value = ''; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.nodes = []; this.isConnected = true; }
        set innerHTML(html) {
            this.html = html; this.nodes = [];
            for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
                const node = new Node(); node.tagName = match[1];
                for (const attr of match[2].matchAll(/\b(data-rmt-[\w-]+|id)(?:="([^"]*)")?/g)) node.attributes[attr[1]] = attr[2] ?? '';
                this.nodes.push(node);
            }
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        querySelectorAll(selector) {
            const alternatives = selector.split(',').map(value => value.trim());
            return this.nodes.filter(node => alternatives.some(value => {
                const match = value.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
                return match && Object.hasOwn(node.attributes, match[1]) && (match[2] === undefined || node.attributes[match[1]] === match[2]);
            }));
        }
        setAttribute(name, value) { this.attributes[name] = value; }
        addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
        removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(value => value !== fn); }
        input() { for (const fn of this.listeners.input || []) fn({ target: this }); }
        focus() { globalThis.document.activeElement = this; }
        remove() { this.isConnected = false; }
    }
    const shell = { current: null, appendChild(node) { this.current = node; node.isConnected = true; } };
    const host = new Node(); host.querySelector = selector => selector === '.rmt-shell' ? shell : null;
    const notices = [];
    globalThis.toastr = { error: text => notices.push(text), info: text => notices.push(text) };
    globalThis.document = { activeElement: null, createElement: () => new Node(), getElementById: id => id === constants.OVERLAY_ID ? host : null };
    const item = { id: 'event', title: '庭院栽花', desc: '甲扶苗，乙浇水。', unlocked: true, visualSeed: ['花苗'], ...(image ? { cgImage: image } : {}) };
    const session = { kind: constants.MODE.ALBUM, chatId: f.bank.chatId, archiveRevision: f.bank.archiveRevision, selectedId: item.id, entries: [item] };
    f.ctx.chatMetadata[constants.CACHE_KEY] = { chatId: f.bank.chatId, archiveRevision: f.bank.archiveRevision, album: structuredClone(session) };
    state.activeMode = constants.MODE.ALBUM; state.activeSession = session;
    state.runtimeSessionCache.clear(); state.cacheHydrationErrors.clear();
    t.after(() => {
        editorUi.closeCgPromptEditor({ restoreFocus: false });
        state.activeMode = previousMode; state.activeSession = previousSession;
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        state.cachePersistTimers.clear(); state.runtimeSessionCache.clear(); state.cacheHydrationErrors.clear();
        beforeDocument ? Object.defineProperty(globalThis, 'document', beforeDocument) : delete globalThis.document;
        beforeToastr ? Object.defineProperty(globalThis, 'toastr', beforeToastr) : delete globalThis.toastr;
    });
    return { open() { editorUi.openCgPromptEditor(); assert.ok(editorUi.hasCgPromptEditor(), JSON.stringify(notices)); return shell.current; } };
}

test('the real editor loads chat looks, saves edited looks without an image request, and reopens them', async t => {
    const f = fixture(t);
    looks.writeCastLooks(f.ctx, { char: 'black hair', user: 'silver hair', manual: true }, f.ctx.chatId);
    const ui = editorFixture(f, t);
    let element = ui.open();
    const field = element.querySelector('[data-rmt-cg-tag-input="char"]');
    assert.equal(field.value, 'black hair');
    assert.equal(element.querySelector('[data-rmt-cg-tag-input="user"]').value, 'silver hair');
    assert.ok(element.querySelector('[data-rmt-cg-prompt-action="save-looks"]'));
    field.value = 'purple pupils, white fur, cybernetic arm'; field.input();
    await editorUi.handleCgPromptEditorAction('save-looks');
    assert.match(element.querySelector('[data-rmt-cg-prompt-status]').textContent, /外貌已保存/);
    assert.equal(f.stats.calls, 0);
    assert.equal(f.stats.writes, 1);
    editorUi.closeCgPromptEditor({ restoreFocus: false });
    delete f.ctx.chatMetadata[looks.CAST_LOOKS_KEY];
    element = ui.open();
    assert.equal(element.querySelector('[data-rmt-cg-tag-input="char"]').value, 'purple pupils, white fur, cybernetic arm');
    assert.equal(f.stats.cardReads, 0);
});

test('the real editor scene input removes old scene metadata from the send preview', async t => {
    const f = fixture(t);
    const ui = editorFixture(f, t, { url: '/user/images/fixture/old.png', prompt: '甲在卧室。', provider: 'baibai-image', generatedAt: 1,
        promptMetadata: { sceneTags: 'bedroom, bed', flatPrompt: 'A bedroom scene', characters: [{ role: 'char', name: '甲', tag: 'black hair' }] } });
    const element = ui.open();
    const field = element.querySelector('[data-rmt-cg-prompt-input]');
    field.value = '甲在庭院栽花。'; field.input();
    assert.equal(element.querySelector('[data-rmt-cg-scene-tags]').value, '');
    assert.equal(element.querySelector('[data-rmt-cg-flat-prompt]').value, '');
    assert.doesNotMatch(element.querySelector('[data-rmt-cg-send-preview]').value, /卧室|bedroom|bed/);
    assert.equal(element.querySelector('[data-rmt-cg-tag-input="char"]').value, 'black hair');
    assert.equal(f.stats.calls, 0);
});

test('explicit appearance save is durable without drawing or saving whole chat, survives a lost metadata mirror', t => {
    const f = fixture(t);
    f.ctx.saveChat = f.ctx.saveMetadata = () => { throw new Error('whole chat save forbidden'); };
    f.stats.failMirror = true;
    const record = looks.saveConfirmedCastLooks({ char: 'purple pupils, white fur, cybernetic arm', user: '1girl, adult woman, silver hair' }, f.ticket());
    assert.equal(f.stats.calls, 0);
    assert.equal(f.stats.writes, 1);
    assert.equal(record.manual, true);
    assert.equal(record.char, 'purple pupils, white fur, cybernetic arm');
    assert.equal(record.user, '1girl, adult woman, silver hair');
    delete f.ctx.chatMetadata[looks.CAST_LOOKS_KEY];
    assert.deepEqual(looks.readCastLooks(f.ctx), record, 'reload can recover the explicit small record');
    assert.deepEqual(looks.ensureCastLooks(f.ctx), record, 'automatic capture never replaces manual appearance');
    assert.equal(f.stats.cardReads, 0);
});

test('manual save removes explicit biography but retains unfamiliar short visual tags', t => {
    const f = fixture(t);
    const record = looks.saveConfirmedCastLooks({ char: 'purple pupils，MBTI：INTJ，喜欢音乐，white fur，cybernetic arm', user: 'adult woman, silver hair' }, f.ticket());
    assert.equal(record.char, 'purple pupils, white fur, cybernetic arm');
    assert.doesNotMatch(JSON.stringify([...f.storage.values()]), /MBTI|INTJ|喜欢音乐/);
    assert.equal(f.stats.calls, 0);
});

test('saving empty looks is explicit and does not let automatic capture silently restore them', t => {
    const f = fixture(t);
    const record = looks.saveConfirmedCastLooks({ char: '', user: '' }, f.ticket());
    assert.equal(record.manual, true);
    assert.equal(looks.ensureCastLooks(f.ctx).char, '');
    assert.equal(f.stats.cardReads, 0);
    const evidence = appearance.captureCgAppearanceEvidence(f.ctx, { api: { apiVersion: 1, capabilities: { characterLibrary: true },
        getCharacters() { throw new Error('explicitly cleared looks must not be reread'); } } });
    assert.deepEqual(evidence.missingRoles, ['char', 'user']);
    assert.ok(evidence.characters.every(person => !person.knownTag && !person.description));
    assert.equal(f.stats.cardReads, 0);
});

test('new image metadata inherits saved chat looks without rereading cards, existing confirmed image remains intact', async t => {
    const f = fixture(t);
    looks.saveConfirmedCastLooks({ char: 'black hair, green eyes', user: 'silver hair, brown eyes' }, f.ticket());
    const metadata = appearance.initialCgAppearanceMetadata({ id: 'new-cg' }, f.ctx);
    await images.invokeImageGeneration('甲扶着花苗，乙在庭院浇水。', f.ctx, { promptMetadata: metadata });
    assert.match(f.requests[0].prompt, /甲：black hair, green eyes/);
    assert.match(f.requests[0].prompt, /乙：silver hair, brown eyes/);
    assert.equal(f.stats.cardReads, 0);
    const prior = { sceneTags: 'old garden', characters: [{ role: 'char', name: '甲', tag: 'old confirmed hair', nl: '' }] };
    assert.deepEqual(appearance.initialCgAppearanceMetadata({ cgImage: { promptMetadata: prior } }, f.ctx), prior);
    assert.equal(appearance.initialCgAppearanceMetadata({ cgImage: { url: '/user/images/fixture/old.png' } }, f.ctx), null);
});

test('saved manual appearance takes priority when explicitly preparing another image', t => {
    const f = fixture(t);
    looks.saveConfirmedCastLooks({ char: 'black hair', user: 'silver hair' }, f.ticket());
    const evidence = appearance.captureCgAppearanceEvidence(f.ctx, { api: { apiVersion: 1, capabilities: { characterLibrary: true },
        getCharacters: () => ({ apiVersion: 1, characters: [{ name: '甲', tag: 'blonde hair' }] }) } });
    assert.equal(evidence.characters.find(person => person.role === 'char').knownTag, 'black hair');
    const wrong = { imagePrompt: 'A blonde person waters flowers.', sceneTags: 'garden', flatPrompt: 'A blonde person waters flowers.',
        characters: [{ role: 'char', tag: 'blonde hair' }] };
    assert.throws(() => appearance.normalizeCgPreparedPrompt(wrong, evidence), error => error.code === 'RMT_CG_PROMPT_INVALID');
    assert.equal(f.stats.calls, 0);
});

for (const change of ['chat', 'character', 'revision', 'readonly', 'deleted', 'missing', 'empty']) {
    test(`stale or invalid ${change} cannot save appearance or write durable data`, t => {
        const f = fixture(t), ticket = f.ticket();
        if (change === 'chat') f.ctx.chatId = 'other-chat';
        if (change === 'character') f.ctx.characterId = 1;
        if (change === 'revision') f.bank.archiveRevision = 'new-revision';
        if (change === 'readonly') state.activeArchiveSnapshot = { readOnly: true };
        if (change === 'deleted') state.archiveDeletionFences.add(archive.archiveDeletionFenceKey(f.ctx, f.bank));
        if (change === 'missing') delete f.ctx.chatMetadata[constants.MEMORY_KEY];
        if (change === 'empty') f.bank.memories = [];
        assert.throws(() => looks.saveConfirmedCastLooks({ char: 'pink hair' }, ticket), error => error.code === 'RMT_CAST_LOOKS_STALE');
        assert.equal(f.stats.writes, 0);
        assert.equal(f.stats.mirrors, 0);
    });
}

test('compare-and-set protects a newer manual save and storage failures retain the old saved record', t => {
    const f = fixture(t), oldTicket = f.ticket();
    const first = looks.saveConfirmedCastLooks({ char: 'black hair', user: 'silver hair' }, oldTicket);
    assert.throws(() => looks.saveConfirmedCastLooks({ char: 'pink hair' }, oldTicket), error => error.code === 'RMT_CAST_LOOKS_STALE');
    assert.deepEqual(looks.readCastLooks(f.ctx), first);
    const before = [...f.storage.entries()];
    f.stats.fail = true;
    assert.throws(() => looks.saveConfirmedCastLooks({ char: 'blue hair' }, f.ticket()), error => error.code === 'RMT_CAST_LOOKS_SAVE_FAILED');
    assert.deepEqual([...f.storage.entries()], before);
    assert.deepEqual(looks.readCastLooks(f.ctx), first);
});

test('durable appearance never supplies another chat or a missing, deleted or readonly archive', t => {
    const f = fixture(t);
    looks.saveConfirmedCastLooks({ char: 'black hair' }, f.ticket());
    delete f.ctx.chatMetadata[looks.CAST_LOOKS_KEY];
    f.ctx.chatId = 'other-chat';
    assert.equal(looks.readCastLooks(f.ctx), null);
    f.ctx.chatId = f.bank.chatId;
    state.activeArchiveSnapshot = {};
    assert.equal(looks.readCastLooks(f.ctx), null);
    state.activeArchiveSnapshot = null;
    state.archiveDeletionFences.add(archive.archiveDeletionFenceKey(f.ctx, f.bank));
    assert.equal(looks.readCastLooks(f.ctx), null);
    state.archiveDeletionFences.clear();
    delete f.ctx.chatMetadata[constants.MEMORY_KEY];
    assert.equal(looks.readCastLooks(f.ctx), null);
});

test('scene edits invalidate old scene tags and flat prompt at the real multi-character provider boundary', async t => {
    const f = fixture(t);
    globalThis.STBaiBaiImage.getBackendStatus = () => ({ configured: true, supportsCharacters: true });
    const metadata = appearance.metadataAfterSceneEdit({ sceneTags: 'bedroom, bed', flatPrompt: 'A bedroom scene',
        characters: [{ role: 'char', name: '甲', tag: 'black hair' }] });
    await images.invokeImageGeneration('甲在庭院栽花。', f.ctx, { promptMetadata: metadata });
    assert.equal(f.requests[0].prompt, '甲在庭院栽花。');
    assert.doesNotMatch(JSON.stringify(f.requests[0]), /bedroom|bed/);
    assert.equal(f.requests[0].characters[0].tag, 'black hair');
});

for (const supportsCharacters of [true, false]) {
    test(`daily primary prompt retains every panel action and Q proportions with metadata, supportsCharacters=${supportsCharacters}`, async t => {
        const f = fixture(t);
        globalThis.STBaiBaiImage.getBackendStatus = () => ({ configured: true, supportsCharacters });
        const item = { panelCount: 2, panels: [{ action: '甲扶住花苗' }, { action: '乙拿水壶浇水' }], imagePrompt: '庭院种花' };
        const metadata = { sceneTags: 'garden, watering', flatPrompt: 'Two adults gardening in a courtyard',
            characters: [{ role: 'char', name: '甲', tag: 'black hair' }, { role: 'user', name: '乙', tag: 'silver hair' }] };
        await images.invokeImageGeneration(images.dailyComicImagePrompt(item), f.ctx, { promptMetadata: metadata });
        const sent = f.requests[0].prompt;
        assert.match(sent, /chibi/);
        assert.match(sent, /2 distinct vertically arranged comic panels/);
        assert.match(sent, /Panel 1:.*甲扶住花苗/);
        assert.match(sent, /Panel 2:.*乙拿水壶浇水/);
        assert.match(sent, /no text, no speech bubbles/);
    });
}
