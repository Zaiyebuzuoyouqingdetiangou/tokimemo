import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const plain = value => JSON.parse(JSON.stringify(value));

async function scene({ cardWrite = null, bookWrite = null } = {}) {
    const writes = [], books = new Map([['shared-test-book', { entries: {} }]]), bookWrites = [], warnings = [];
    const makeContext = (avatar, id = 0) => {
        const characters = [];
        characters[id] = { avatar, data: { extensions: { world: 'shared-test-book', hearttrace_stickers: {
            packs: [{ id: 'pack', owner: 'char', stickers: [{ id: 'sticker', name: '旧名', meaning: '旧义', caption: '', url: '/user/images/old.png' }] }],
        } } } };
        return { characterId: id, name2: avatar, name1: '我', characters,
            async writeExtensionField(index, field, value) {
                const row = { avatar, index, field, value: plain(value) }; writes.push(row);
                if (cardWrite) await cardWrite(row);
            },
            async writeExtensionFieldBulk(avatars, field, value) {
                assert.deepEqual([...avatars], [avatar]);
                const row = { avatar, index: id, field, value: plain(value) }; writes.push(row);
                if (cardWrite) await cardWrite(row);
                this.characters[id].data.extensions[field] = plain(value);
                return { updated: [avatar], skipped: [], failed: [] };
            },
            async getOneCharacter() { this.characters[id] = structuredClone(this.characters[id]); },
            async loadWorldInfo(name) { return books.has(name) ? plain(books.get(name)) : null; },
            async saveWorldInfo(name, value) {
                const row = { name, value: plain(value) }; bookWrites.push(row);
                if (bookWrite) await bookWrite(row);
                books.set(name, row.value);
            },
        };
    };
    const a = makeContext('A.png'), b = makeContext('B.png', 1);
    let active = a;
    const context = vm.createContext({ console: { ...console, warn: (...args) => warnings.push(args) }, structuredClone, Date, URL,
        CustomEvent: class {}, SillyTavern: { getContext: () => active } });
    const modules = new Map();
    const actual = new Set(['src/ui/stickersView.js', 'src/extras/stickers.js', 'src/core/stickerStore.js', 'src/core/stickerLore.js']);
    const text = { esc: value => String(value), safeErrorSummary: error => error?.message || '',
        safeUserError: (message, code) => Object.assign(new Error(message), { code }) };
    function get(name) {
        if (modules.has(name)) return modules.get(name);
        let module;
        if (actual.has(name)) {
            const source = fs.readFileSync(root + name, 'utf8') + (name === 'src/ui/stickersView.js'
                ? '\nexport { updateSticker, beginImageEdit, cancelImageEdit };' : '');
            module = new vm.SourceTextModule(source, { context, identifier: name });
        } else {
            const exports = name === 'src/core/text.js' ? text : {};
            module = new vm.SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
            }, { context, identifier: name });
        }
        modules.set(name, module); return module;
    }
    const ui = get('src/ui/stickersView.js');
    await ui.link((specifier, from) => get(new URL(specifier, 'file:///' + from.identifier).pathname.slice(1)));
    await ui.evaluate();
    return { ui: ui.namespace, store: get('src/core/stickerStore.js').namespace, lore: get('src/core/stickerLore.js').namespace,
        extras: get('src/extras/stickers.js').namespace, a, b, writes, bookWrites, books, warnings, context,
        activate: next => { active = next; } };
}

test('two UI field edits merge with the latest confirmed card instead of overwriting each other', async () => {
    const gates = [];
    const s = await scene({ cardWrite: () => { const gate = deferred(); gates.push(gate); return gate.promise; } });
    const first = s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { name: '新名' });
    const second = s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { meaning: '新义' });
    await tick(); assert.equal(gates.length, 1, 'host card writes are serialized');
    gates[0].resolve(); await tick(); assert.equal(gates.length, 2);
    gates[1].resolve(); await Promise.all([first, second]);
    const row = s.store.readStickerData(s.a).packs[0].stickers[0];
    assert.equal(row.name, '新名'); assert.equal(row.meaning, '新义');
});

test('failed card save keeps the previous state and does not poison the next queued edit', async () => {
    let count = 0;
    const s = await scene({ cardWrite: () => { if (++count === 1) throw new Error('write failed'); } });
    const first = s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { name: '未保存' });
    const rejected = assert.rejects(first, error => error.code === 'RMT_STICKER_SAVE');
    const second = s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { meaning: '已保存' });
    await rejected; await second;
    const row = s.store.readStickerData(s.a).packs[0].stickers[0];
    assert.equal(row.name, '旧名'); assert.equal(row.meaning, '已保存');
});

test('asynchronous image/caption edits are latest-wins and cannot recreate deleted stickers', async () => {
    const s = await scene(), view = { scope: 'A.png' };
    const old = s.ui.beginImageEdit(s.a, 'sticker');
    const newer = s.ui.beginImageEdit(s.a, 'sticker');
    await s.ui.updateSticker(view, 'sticker', { caption: '新字', url: '/user/images/new.png' }, { context: s.a, isCurrent: newer.isCurrent });
    await assert.rejects(s.ui.updateSticker(view, 'sticker', { caption: '旧字', url: '/user/images/late.png' }, { context: s.a, isCurrent: old.isCurrent }), error => error.code === 'RMT_STICKER_CHANGED');
    assert.equal(s.store.readStickerData(s.a).packs[0].stickers[0].caption, '新字');
    const drawing = s.ui.beginImageEdit(s.a, 'sticker');
    s.ui.cancelImageEdit(s.a, 'sticker');
    await s.extras.saveStickerData(data => ({ ...data, packs: data.packs.map(pack => ({ ...pack, stickers: [] })) }), s.a);
    await assert.rejects(s.ui.updateSticker(view, 'sticker', { url: '/user/images/redraw.png' }, { context: s.a, isCurrent: drawing.isCurrent }), error => error.code === 'RMT_STICKER_CHANGED');
    assert.equal(await s.ui.updateSticker(view, 'sticker', { name: '迟到字段' }, { context: s.a }), null);
    assert.equal(s.store.readStickerData(s.a).packs[0].stickers.length, 0);
    old.finish(); newer.finish(); drawing.finish();
});

test('switching characters during an image edit cannot modify a copied sticker id in the new character', async () => {
    const s = await scene(), edit = s.ui.beginImageEdit(s.a, 'sticker');
    s.activate(s.b);
    await assert.rejects(s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { url: '/user/images/wrong.png' }, { context: s.a, isCurrent: edit.isCurrent }), error => error.code === 'RMT_STICKER_CHANGED');
    await s.ui.updateSticker({ scope: 'B.png' }, 'sticker', { name: 'B的新名' }, { context: s.b });
    assert.equal(s.store.readStickerData(s.a).packs[0].stickers[0].name, '旧名');
    assert.equal(s.store.readStickerData(s.b).packs[0].stickers[0].name, 'B的新名');
    assert.ok(s.writes.every(row => row.avatar === 'B.png'));
});

test('late lorebook receipt updates only lore metadata, preserving newer card edits', async () => {
    const firstBook = deferred(); let calls = 0;
    const s = await scene({ bookWrite: () => ++calls === 1 ? firstBook.promise : undefined });
    await s.store.updateStickerData(data => ({ ...data, lore: { book: 'shared-test-book', hash: '' } }), s.a);
    const first = s.extras.saveStickerData(data => ({ ...data, packs: data.packs.map(pack => ({ ...pack, title: '新组名' })) }), s.a);
    await tick(); assert.equal(s.bookWrites.length, 1);
    const second = s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { meaning: '后来修改' });
    await tick(); assert.equal(s.store.readStickerData(s.a).packs[0].stickers[0].meaning, '后来修改');
    firstBook.resolve(); await Promise.all([first, second]);
    const data = s.store.readStickerData(s.a);
    assert.equal(data.packs[0].title, '新组名'); assert.equal(data.packs[0].stickers[0].meaning, '后来修改');
    assert.equal(data.lore.hash, '');
    assert.equal(data.lore.submittedHash, s.store.loreHash(s.store.stickerLoreContent(data, s.a)));
    assert.equal(data.lore.unconfirmed, true);
    assert.ok(Object.values(s.books.get('shared-test-book').entries).some(row => row.content.includes('后来修改')));
});

test('lorebook failure keeps saved card content and allows a later synchronization', async () => {
    let calls = 0;
    const s = await scene({ bookWrite: () => { if (++calls === 1) throw new Error('book unavailable'); } });
    await s.store.updateStickerData(data => ({ ...data, lore: { book: 'shared-test-book', hash: '' } }), s.a);
    await s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { name: '保留的名字' });
    assert.equal(s.store.readStickerData(s.a).packs[0].stickers[0].name, '保留的名字');
    assert.equal(s.warnings.length, 1);
    await s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { meaning: '保留的意思' });
    const row = s.store.readStickerData(s.a).packs[0].stickers[0];
    assert.equal(row.name, '保留的名字'); assert.equal(row.meaning, '保留的意思');
});

test('bootstrap and runtime copies share the same per-character write queue', async () => {
    const gates = [];
    const s = await scene({ cardWrite: () => { const gate = deferred(); gates.push(gate); return gate.promise; } });
    const copy = new vm.SourceTextModule(fs.readFileSync(root + 'src/core/stickerStore.js', 'utf8'), { context: s.context });
    await copy.link(() => {}); await copy.evaluate();
    const first = s.store.updateStickerData(data => ({ ...data, settings: { ...data.settings, maxOne: false } }), s.a);
    const second = copy.namespace.updateStickerData(data => ({ ...data, settings: { ...data.settings, chibiFilter: 'auto' } }), s.a);
    await tick(); assert.equal(gates.length, 1);
    gates[0].resolve(); await tick(); assert.equal(gates.length, 2);
    gates[1].resolve(); await Promise.all([first, second]);
    const settings = s.store.readStickerData(s.a).settings;
    assert.equal(settings.maxOne, false); assert.equal(settings.chibiFilter, 'auto');
});

test('a host refreshing the same character object does not break queued saves', async () => {
    let s;
    s = await scene({ cardWrite: () => { s.a.characters[0] = structuredClone(s.a.characters[0]); } });
    await Promise.all([
        s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { name: '新名' }),
        s.ui.updateSticker({ scope: 'A.png' }, 'sticker', { meaning: '新义' }),
    ]);
    const row = s.store.readStickerData(s.a).packs[0].stickers[0];
    assert.equal(row.name, '新名'); assert.equal(row.meaning, '新义');
});

test('two characters sharing one book retain separate rules and removal touches only the owner', async () => {
    const s = await scene();
    s.a.characters[1] = s.b.characters[1]; s.b.characters = s.a.characters;
    await s.lore.writeStickerLore(s.a); await s.lore.writeStickerLore(s.b);
    let rows = Object.values(s.books.get('shared-test-book').entries);
    assert.equal(rows.length, 2);
    assert.ok(rows.some(row => row.content.includes('A.png') && row.characterFilter.names.join() === 'A'));
    assert.ok(rows.some(row => row.content.includes('B.png') && row.characterFilter.names.join() === 'B'));
    await s.lore.removeStickerLore(s.a);
    rows = Object.values(s.books.get('shared-test-book').entries);
    assert.equal(rows.length, 1); assert.ok(rows[0].content.includes('B.png'));
});

test('shared book read-modify-write operations serialize across different characters', async () => {
    const gate = deferred(); let count = 0;
    const s = await scene({ bookWrite: () => ++count === 1 ? gate.promise : undefined });
    const a = s.lore.writeStickerLore(s.a), b = s.lore.writeStickerLore(s.b);
    await tick(); assert.equal(s.bookWrites.length, 1);
    gate.resolve(); await Promise.all([a, b]);
    assert.equal(Object.keys(s.books.get('shared-test-book').entries).length, 2);
});

test('ambiguous legacy entries and unrelated rows are preserved on write and removal', async () => {
    const s = await scene(); s.a.characters[1] = s.b.characters[1]; s.b.characters = s.a.characters;
    const legacy = { uid: 0, comment: s.store.LORE_COMMENT, content: s.store.stickerLoreContent(s.store.readStickerData(s.a), s.a) };
    const other = { uid: 1, comment: '用户的世界观', content: '不可改变', disable: true };
    const nudge = { uid: 2, comment: s.store.LORE_NUDGE_COMMENT, content: '旧规则归属不明' };
    s.books.set('shared-test-book', { entries: { 0: legacy, 1: other, 2: nudge } });
    await s.store.updateStickerData(data => ({ ...data, lore: { book: 'shared-test-book', hash: s.store.loreHash(legacy.content) } }), s.a);
    const receipt = await s.lore.writeStickerLore(s.a);
    assert.equal(receipt.legacyPreserved, true);
    await s.lore.removeStickerLore(s.a);
    assert.deepEqual(s.books.get('shared-test-book').entries, { 0: legacy, 1: other, 2: nudge });
});

test('unambiguous unchanged legacy entry migrates in place and preserves user settings', async () => {
    const s = await scene(), data = s.store.readStickerData(s.a);
    const content = s.store.stickerLoreContent(data, s.a);
    s.books.set('shared-test-book', { entries: { 4: { uid: 4, comment: s.store.LORE_COMMENT, content, disable: true, order: 456 } } });
    await s.store.updateStickerData(value => ({ ...value, lore: { book: 'shared-test-book', hash: s.store.loreHash(content) } }), s.a);
    await s.lore.writeStickerLore(s.a);
    const entries = s.books.get('shared-test-book').entries;
    assert.deepEqual(Object.keys(entries), ['4']); assert.equal(entries[4].disable, true); assert.equal(entries[4].order, 456);
    assert.deepEqual(entries[4].characterFilter, { names: ['A'], tags: [], isExclude: false });
    await s.lore.removeStickerLore(s.a); assert.equal(Object.keys(s.books.get('shared-test-book').entries).length, 0);
});

test('legacy entry filtered to another character is never adopted or removed', async () => {
    const s = await scene(), content = s.store.stickerLoreContent(s.store.readStickerData(s.a), s.a);
    const legacy = { uid: 0, comment: s.store.LORE_COMMENT, content, characterFilter: { names: ['B'], tags: [], isExclude: false } };
    s.books.set('shared-test-book', { entries: { 0: legacy } });
    await s.store.updateStickerData(data => ({ ...data, lore: { book: 'shared-test-book', hash: s.store.loreHash(content) } }), s.a);
    await s.lore.writeStickerLore(s.a); await s.lore.removeStickerLore(s.a);
    assert.deepEqual(s.books.get('shared-test-book').entries, { 0: legacy });
});

test('book replacement while a write waits does not redirect the operation', async () => {
    const s = await scene(), gate = deferred();
    const load = s.a.loadWorldInfo; s.a.loadWorldInfo = async name => { await gate.promise; return load(name); };
    const pending = s.lore.writeStickerLore(s.a);
    const rejected = assert.rejects(pending, error => error.code === 'RMT_STICKER_CHANGED');
    await tick(); s.a.characters[0].data.extensions.world = 'new-book'; gate.resolve(); await rejected;
    assert.equal(s.bookWrites.length, 0);
});

test('late newly-created book binding receipt cannot overwrite a newer user selection', async () => {
    const gate = deferred();
    const s = await scene({ cardWrite: row => row.field === 'world' ? gate.promise : undefined });
    s.a.characters[0].data.extensions.world = '';
    const pending = s.lore.writeStickerLore(s.a);
    const rejected = assert.rejects(pending, error => error.code === 'RMT_STICKER_CHANGED');
    await tick(); assert.ok(s.writes.some(row => row.field === 'world'));
    s.a.characters[0].data.extensions.world = 'newly-chosen-book';
    // The host bulk callback may publish its older request before our readback.
    // The newer user selection has already reached the server.
    const persisted = structuredClone(s.a.characters[0]);
    s.a.getOneCharacter = async () => { s.a.characters[0] = structuredClone(persisted); };
    gate.resolve(); await rejected;
    assert.equal(s.a.characters[0].data.extensions.world, 'newly-chosen-book');
});

for (const result of [null, {}, { entries: [] }]) test(`unreadable bound book (${JSON.stringify(result)}) cannot be overwritten or removed`, async () => {
    const s = await scene(); s.a.loadWorldInfo = async () => result;
    await s.store.updateStickerData(data => ({ ...data, lore: { book: 'shared-test-book', hash: 'receipt' } }), s.a);
    await assert.rejects(s.lore.writeStickerLore(s.a), error => error.code === 'RMT_STICKER_LORE_READ');
    await assert.rejects(s.lore.removeStickerLore(s.a), error => error.code === 'RMT_STICKER_LORE_READ');
    assert.equal(s.bookWrites.length, 0); assert.equal(s.store.readStickerData(s.a).lore.hash, 'receipt');
});

test('new books use independent names whether an old human-readable name is listed or omitted', async () => {
    for (const exists of [false, true]) {
        const s = await scene(); s.a.characters[0].data.extensions.world = '';
        s.a.loadWorldInfo = async () => null;
        s.a.getWorldInfoNames = () => exists ? ['A.png的表情包'] : [];
        const result = await s.lore.writeStickerLore(s.a);
        assert.equal(result.created, true); assert.equal(s.bookWrites.length, 1);
        assert.notEqual(result.book, 'A.png的表情包');
    }
});

test('unchanged old lore receipts do not trigger new startup migration reads', async () => {
    const s = await scene(), data = s.store.readStickerData(s.a);
    await s.store.updateStickerData(value => ({ ...value, lore: { book: 'shared-test-book', hash: s.store.loreHash(s.store.stickerLoreContent(data, s.a)) } }), s.a);
    s.a.loadWorldInfo = async () => { throw new Error('must not read'); };
    assert.equal(await s.lore.refreshStickerLore(s.a), false);
});

test('bootstrap and runtime lore copies share the same book queue', async () => {
    const gate = deferred(); let count = 0;
    const s = await scene({ bookWrite: () => ++count === 1 ? gate.promise : undefined });
    const duplicateStore = new vm.SourceTextModule(fs.readFileSync(root + 'src/core/stickerStore.js', 'utf8'), { context: s.context });
    await duplicateStore.link(() => {}); await duplicateStore.evaluate();
    const duplicateLore = new vm.SourceTextModule(fs.readFileSync(root + 'src/core/stickerLore.js', 'utf8'), { context: s.context });
    await duplicateLore.link(() => duplicateStore); await duplicateLore.evaluate();
    const a = s.lore.writeStickerLore(s.a), b = duplicateLore.namespace.writeStickerLore(s.b);
    await tick(); assert.equal(s.bookWrites.length, 1);
    gate.resolve(); await Promise.all([a, b]);
    assert.equal(Object.keys(s.books.get('shared-test-book').entries).length, 2);
});

test('two same-named cards without books create separate destinations without lost entries', async () => {
    const s = await scene();
    s.a.name2 = s.b.name2 = '同名角色';
    s.a.characters[0].data.extensions.world = ''; s.b.characters[1].data.extensions.world = '';
    await Promise.all([s.lore.writeStickerLore(s.a), s.lore.writeStickerLore(s.b)]);
    const aName = s.a.characters[0].data.extensions.world, bName = s.b.characters[1].data.extensions.world;
    assert.notEqual(aName, bName);
    assert.equal(Object.keys(s.books.get(aName).entries).length, 1);
    assert.equal(Object.keys(s.books.get(bName).entries).length, 1);
});

test('missing refresh API still allows a new independent destination without touching a same-named book', async () => {
    const s = await scene(); s.a.characters[0].data.extensions.world = '';
    s.a.loadWorldInfo = async () => null; s.a.getWorldInfoNames = () => [];
    const result = await s.lore.writeStickerLore(s.a);
    assert.equal(result.created, true); assert.notEqual(result.book, 'A.png的表情包');
    assert.equal(s.bookWrites.length, 1);
});
