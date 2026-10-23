import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const host = JSON.parse(fs.readFileSync(new URL('./fixtures/sticker-host-api.json', import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

async function scene({ bulk = true, cardStatus = 200, readCardStatus = 200, bookStatus = 200, readBookStatus = 200, listStatus = 500 } = {}) {
    const network = { cardStatus, readCardStatus, bookStatus, readBookStatus, listStatus };
    const card = { avatar: 'A.png', name: 'A', chat: 'chat', data: { extensions: { world: 'shared-book', hearttrace_stickers: {
        packs: [{ id: 'p', owner: 'char', title: '旧组名', stickers: [{ id: 's', name: '开心', url: '/user/images/a.png' }] }],
    } } } };
    const characters = [card], storedCards = new Map([[card.avatar, plain(card)]]), books = new Map([['shared-book', { entries: {} }]]), requests = [];
    const context = { characterId: 0, name2: 'A', name1: '我', characters };
    const ui = { find() { return this; }, text() { return ''; }, remove() {}, append() {}, val() {} };
    const scope = vm.createContext({ structuredClone, Date, URL, console: { ...console, error() {} },
        SillyTavern: { getContext: () => context }, getContext: () => context, characters,
        getRequestHeaders: () => ({}), UNSET_VALUE: Symbol(), DOMPurify: { sanitize: value => value },
        $: () => ui, Option: class {}, selected_world_info: [], world_names: [], worldInfoCache: new Map(),
        cancelDebounce() {}, saveWorldDebounced() {}, eventSource: { async emit() {} }, event_types: { WORLDINFO_UPDATED: 'updated' },
        setValueByPath(object, path, value) { const keys = path.split('.'), last = keys.pop(); let ref = object; for (const key of keys) ref = ref[key] || (ref[key] = {}); ref[last] = value; },
        fetch: async (url, options) => {
            const body = JSON.parse(options.body); requests.push({ url, body });
            if (url === '/api/characters/merge-attributes') {
                const avatars = body.avatars || [body.avatar];
                if (network.cardStatus < 400) for (const avatar of avatars) {
                    const stored = storedCards.get(avatar); if (stored) Object.assign(stored.data.extensions, plain(body.data.data?.extensions || body.data.extensions));
                }
                await network.afterCardWrite?.(body);
                return { ok: network.cardStatus < 400, status: network.cardStatus, json: async () => ({ updated: avatars.filter(a => storedCards.has(a)), skipped: [], failed: [] }) };
            }
            if (url === '/api/characters/get') return { ok: network.readCardStatus < 400, status: network.readCardStatus, json: async () => plain(storedCards.get(body.avatar_url)) };
            if (url === '/api/worldinfo/get') return { ok: network.readBookStatus < 400 && books.has(body.name), status: network.readBookStatus, json: async () => plain(books.get(body.name)) };
            if (url === '/api/worldinfo/edit') {
                if (network.bookStatus < 400) books.set(body.name, plain(body.data));
                return { ok: network.bookStatus < 400, status: network.bookStatus };
            }
            if (url === '/api/settings/get') return { ok: network.listStatus < 400, status: network.listStatus, json: async () => ({ world_names: [...books.keys()] }) };
            throw new Error('unexpected fixture request');
        },
    });
    vm.runInContext([host.card, host.bulk, host.one, host.load, host.list, host.save].join('\n'), scope);
    for (const name of ['writeExtensionField', 'getOneCharacter', 'loadWorldInfo', 'saveWorldInfo', 'updateWorldInfoList']) context[name] = scope[name];
    if (bulk) context.writeExtensionFieldBulk = scope.writeExtensionFieldBulk;
    context.getWorldInfoNames = () => [...scope.world_names];
    const store = new vm.SourceTextModule(fs.readFileSync(new URL('src/core/stickerStore.js', root), 'utf8'), { context: scope });
    await store.link(() => {}); await store.evaluate();
    const lore = new vm.SourceTextModule(fs.readFileSync(new URL('src/core/stickerLore.js', root), 'utf8'), { context: scope });
    await lore.link(() => store); await lore.evaluate();
    return { context, store: store.namespace, lore: lore.namespace, books, storedCards, requests, scope, network };
}
const rename = data => ({ ...data, packs: data.packs.map(pack => ({ ...pack, title: '新组名' })) });

test('character writes use the single-avatar public bulk receipt and retain other fields', async () => {
    const s = await scene();
    const saved = await s.store.updateStickerData(rename, s.context);
    assert.equal(saved.packs[0].title, '新组名');
    assert.deepEqual(s.requests[0].body.avatars, ['A.png']);
    assert.equal(s.storedCards.get('A.png').data.extensions.world, 'shared-book');
});

test('a real host HTTP 500 bulk receipt does not become a successful card save', async () => {
    const s = await scene({ cardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context));
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '旧组名');
    assert.equal(s.storedCards.get('A.png').data.extensions.hearttrace_stickers.packs[0].title, '旧组名');
    assert.equal(s.requests.filter(row => row.url === '/api/characters/merge-attributes').length, 1);
});

test('legacy host writes confirm through a fresh character reload', async () => {
    const s = await scene({ bulk: false });
    await s.store.updateStickerData(rename, s.context);
    assert.equal(s.requests.filter(row => row.url === '/api/characters/get').length, 1);
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '新组名');
});

test('legacy optimistic mutation is not accepted when its server save fails', async () => {
    const s = await scene({ bulk: false, cardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context));
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '旧组名');
});

test('an unavailable legacy readback leaves last confirmed plugin data visible', async () => {
    const s = await scene({ bulk: false, cardStatus: 500, readCardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context), error => error.code === 'RMT_STICKER_SAVE_UNCONFIRMED');
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '旧组名');
});

test('failed book reads and stale names cannot overwrite the old same-named book', async () => {
    const s = await scene({ readBookStatus: 500 });
    s.context.characters[0].data.extensions.world = '';
    s.storedCards.get('A.png').data.extensions.world = '';
    const old = { entries: { 99: { uid: 99, comment: '原世界设定', content: '必须保留' } } };
    s.books.set('A的表情包', plain(old));
    const result = await s.lore.writeStickerLore(s.context);
    assert.deepEqual(s.books.get('A的表情包'), old);
    assert.notEqual(result.book, 'A的表情包');
});

test('unacknowledged book saves never create a confirmed hash and do not loop on startup', async () => {
    const s = await scene({ bookStatus: 500 });
    const result = await s.lore.writeStickerLore(s.context);
    const data = s.store.readStickerData(s.context);
    assert.equal(data.lore.hash, '');
    assert.equal(data.lore.unconfirmed, true);
    assert.equal(result.unconfirmed, true);
    assert.equal(Object.keys(s.books.get('shared-book').entries).length, 0);
    const count = s.requests.length;
    assert.equal(await s.lore.refreshStickerLore(s.context), false);
    assert.equal(s.requests.length, count);
});

test('unacknowledged removals remain retryable and do not recreate rules on edits', async () => {
    const s = await scene({ bookStatus: 500 });
    await s.lore.writeStickerLore(s.context);
    await s.lore.removeStickerLore(s.context);
    const data = s.store.readStickerData(s.context);
    assert.equal(data.lore.unconfirmed, true);
    assert.equal(data.lore.removed, true);
    assert.equal(data.lore.book, 'shared-book');
    const count = s.requests.filter(row => row.url === '/api/worldinfo/edit').length;
    assert.equal(await s.lore.refreshStickerLore(s.context), false);
    await s.lore.removeStickerLore(s.context);
    assert.equal(s.requests.filter(row => row.url === '/api/worldinfo/edit').length, count + 1);
});

test('malformed, skipped, failed and foreign bulk receipts are rejected without legacy fallback', async () => {
    for (const receipt of [undefined, {}, { updated: ['A.png'], skipped: {}, failed: [] },
        { updated: ['B.png'], skipped: [], failed: [] }, { updated: ['A.png'], skipped: [], failed: ['A.png'] },
        { updated: ['A.png'], skipped: ['A.png'], failed: [] }]) {
        const s = await scene();
        s.context.writeExtensionFieldBulk = async () => receipt;
        await assert.rejects(s.store.updateStickerData(rename, s.context), error => error.code === 'RMT_STICKER_SAVE');
        assert.equal(s.requests.length, 0);
        assert.equal(s.store.readStickerData(s.context).packs[0].title, '旧组名');
    }
});

test('a later fresh host read releases an uncertain plugin snapshot without rewriting the card', async () => {
    const s = await scene({ bulk: false, readCardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context), error => error.code === 'RMT_STICKER_SAVE_UNCONFIRMED');
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '旧组名');
    s.network.readCardStatus = 200;
    await s.context.getOneCharacter('A.png');
    assert.equal(s.store.readStickerData(s.context).packs[0].title, '新组名');
    assert.equal(s.requests.filter(row => row.url === '/api/characters/merge-attributes').length, 1);
});

test('bootstrap and runtime share the last confirmed value after a legacy read failure', async () => {
    const s = await scene({ bulk: false, readCardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context));
    const copy = new vm.SourceTextModule(fs.readFileSync(new URL('src/core/stickerStore.js', root), 'utf8'), { context: s.scope });
    await copy.link(() => {}); await copy.evaluate();
    assert.equal(copy.namespace.readStickerData(s.context).packs[0].title, '旧组名');
});

test('a known collision in a newly generated worldbook name is never modified', async () => {
    const s = await scene();
    s.context.characters[0].data.extensions.world = '';
    s.context.loadWorldInfo = async () => ({ entries: { 9: { uid: 9, comment: '已有规则', content: '保持' } } });
    await assert.rejects(s.lore.writeStickerLore(s.context), error => error.code === 'RMT_STICKER_LORE_READ');
    assert.equal(s.requests.length, 0);
});

test('a confirmed retry after a legacy failure starts from the last confirmed content', async () => {
    const s = await scene({ bulk: false, cardStatus: 500, readCardStatus: 500 });
    await assert.rejects(s.store.updateStickerData(rename, s.context));
    s.network.cardStatus = s.network.readCardStatus = 200;
    await s.store.updateStickerData(data => ({ ...data, settings: { ...data.settings, maxOne: false } }), s.context);
    const saved = s.storedCards.get('A.png').data.extensions.hearttrace_stickers;
    assert.equal(saved.packs[0].title, '旧组名');
    assert.equal(saved.settings.maxOne, false);
});

test('after restart a failed new-book save cannot turn its persisted binding into an empty replacement', async () => {
    const s = await scene({ bookStatus: 500 });
    s.context.characters[0].data.extensions.world = '';
    s.storedCards.get('A.png').data.extensions.world = '';
    const submitted = await s.lore.writeStickerLore(s.context);
    assert.equal(s.storedCards.get('A.png').data.extensions.world, submitted.book);
    assert.equal(s.books.has(submitted.book), false);
    // The host starts afresh after a browser reload: only durable state remains.
    s.scope.worldInfoCache.clear();
    await s.context.getOneCharacter('A.png');
    const count = s.requests.filter(row => row.url === '/api/worldinfo/edit').length;
    await assert.rejects(s.lore.writeStickerLore(s.context), error => error.code === 'RMT_STICKER_LORE_READ');
    await assert.rejects(s.lore.removeStickerLore(s.context), error => error.code === 'RMT_STICKER_LORE_READ');
    assert.equal(s.requests.filter(row => row.url === '/api/worldinfo/edit').length, count);
    assert.equal(s.store.readStickerData(s.context).lore.unconfirmed, true);
});

test('late official bulk callbacks cannot replace a newer persisted worldbook selection or unbinding', async () => {
    for (const selected of ['newer-user-selected-book', '']) {
        const s = await scene();
        s.context.characters[0].data.extensions.world = '';
        s.storedCards.get('A.png').data.extensions.world = '';
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        s.network.afterCardWrite = async body => {
            const book = body.data.data?.extensions?.world;
            if (book) { entered(book); await gate; }
        };
        const pending = s.lore.writeStickerLore(s.context);
        const rejected = assert.rejects(pending, error => error.code === 'RMT_STICKER_CHANGED');
        const submittedBook = await waiting;
        s.context.characters[0].data.extensions.world = selected;
        s.storedCards.get('A.png').data.extensions.world = selected;
        release(); await rejected;
        assert.equal(s.context.characters[0].data.extensions.world, selected);
        assert.equal(s.storedCards.get('A.png').data.extensions.world, selected);
        assert.equal(s.store.readStickerData(s.context).lore.book, '');
        assert.equal(s.books.has(submittedBook), true, 'the newly written book remains available');
    }
});

test('a bulk worldbook binding with unavailable readback remains explicitly unconfirmed', async () => {
    const s = await scene({ readCardStatus: 500 });
    s.context.characters[0].data.extensions.world = '';
    s.storedCards.get('A.png').data.extensions.world = '';
    await assert.rejects(s.lore.writeStickerLore(s.context), error => error.code === 'RMT_STICKER_SAVE_UNCONFIRMED');
    assert.equal(s.store.readStickerData(s.context).lore.book, '');
    assert.equal(s.requests.filter(row => row.url === '/api/characters/get').length, 1);
});
