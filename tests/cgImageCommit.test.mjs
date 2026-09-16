import test from 'node:test';
import assert from 'node:assert/strict';
import * as constants from '../src/core/constants.js';
import * as contextApi from '../src/core/context.js';
import * as cacheApi from '../src/core/cache.js';
import * as backupApi from '../src/archive/backupStore.js';
import * as images from '../src/generation/imageGeneration.js';
import * as albumUi from '../src/ui/albumView.js';
import * as advUi from '../src/ui/advEventView.js';
import * as heartUi from '../src/ui/heartView.js';
import * as backupDiagnostics from '../src/core/backupDiagnostics.js';
import { CAST_LOOKS_KEY } from '../src/core/castLooks.js';
import { state } from '../src/core/state.js';

const imagePath = '/user/images/fixture/cg-event.png';
const scene = '两位成年人物在庭院一同栽花，一人扶住花苗，另一人浇水。';
const clone = value => value == null ? value : structuredClone(value);

// Host/provider/storage boundary doubles only. The draw handler, origin fences,
// cache merger, backup schema, compression, metadata write and album renderer are real.
function memoryBackend() {
    const records = new Map();
    return {
        records,
        reads: 0,
        puts: 0,
        async read(entry) { this.reads++; return clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null); },
        async put(record, expected, options = {}) {
            const previous = records.get(record.entryId);
            if (previous?.deleted && !options.allowDeletedRecreate) throw new Error('deleted fixture archive');
            if (expected?.present === false && previous && !previous.deleted) throw new Error('stale fixture create');
            if (expected?.present === true && !previous && !options.allowMissingPrevious) throw new Error('missing fixture previous');
            if (expected?.present === true && previous && previous.archiveRevision !== expected.revision) throw new Error('stale fixture revision');
            this.puts++;
            records.set(record.entryId, clone(record));
            return true;
        },
        async delete() { throw new Error('fixture must not delete archives'); },
    };
}

async function fixture(t, { href = 'tauri://localhost/', metadataFailure = false, mode = constants.MODE.ALBUM, previousImage = null } = {}) {
    const keys = ['SillyTavern', 'STBaiBaiImage', 'location', 'document', 'confirm', 'fetch', 'indexedDB'];
    const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const originalError = console.error;
    const originalWarn = console.warn;
    const bank = { version: 3, chatId: 'cg-commit-chat', archiveRevision: 'revision-1', characterName: '角色',
        userName: '用户', archiveName: '庭院回忆', createdAt: 1, updatedAt: 2,
        memories: [{ id: 'M001', date: '', title: '栽花', summary: scene, detail: scene, quote: '', tags: [] }] };
    let session = { kind: constants.MODE.ALBUM, chatId: bank.chatId, archiveRevision: bank.archiveRevision,
        title: '回忆相簿', category: '全部', selectedId: 'event', page: 1, pageSize: 4,
        entries: [{ id: 'event', title: '一同栽花', date: '2026/09/14', category: '日常', unlocked: true,
            desc: scene, cgDesc: scene, visualSeed: ['庭院', '花苗'] },
        { id: 'other', title: '旧回忆', category: '日常', unlocked: true, desc: '两人在门口撑伞。', visualSeed: ['雨伞'] }] };
    if (previousImage) session.entries[0].cgImage = clone(previousImage);
    if (mode === constants.MODE.ADV) {
        const { entries, ...base } = session;
        session = { ...base, kind: mode, events: entries, view: 'cg' };
    } else if (mode === constants.MODE.HEART) {
        const { entries, ...base } = session;
        session = { ...base, kind: mode, view: 'strips', selectedStripId: 'event',
            greetings: {}, relationshipSourceMemoryAnchor: scene, voiceDramas: [], scenarioDramas: [],
            dailyStrips: entries.map(item => ({ ...item, subtitle: item.desc, panelCount: 1,
                panels: [{ caption: '庭院', action: item.desc, charLine: '慢一点浇水。', userLine: '好。' }] })) };
    }
    const render = () => mode === constants.MODE.HEART ? heartUi.renderHeart()
        : mode === constants.MODE.ADV ? advUi.renderAdvMode() : albumUi.renderAlbum();
    let cardReads = 0;
    let fetches = 0;
    const ctx = { characterId: 0, groupId: null, chatId: bank.chatId, name1: '用户', name2: '角色',
        characters: [{ name: '角色', avatar: 'role.png', data: { name: '角色', avatar: 'role.png' } }],
        chat: [], chatMetadata: { [constants.MEMORY_KEY]: clone(bank), [constants.CACHE_KEY]: {
            chatId: bank.chatId, archiveRevision: bank.archiveRevision, updatedAt: 3, [mode]: clone(session) } },
        extensionSettings: {}, metadataSaves: 0,
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { cardReads++; return {}; },
        saveMetadataDebounced() { if (metadataFailure) throw new Error('fixture metadata failure'); this.metadataSaves++; },
        saveSettingsDebounced() {},
    };
    const body = { innerHTML: '' };
    const topTitle = { textContent: '' };
    const overlay = { hidden: false, querySelectorAll: () => [] };
    const notices = [];
    const errors = [];
    const warnings = [];
    const originalToastr = Object.getOwnPropertyDescriptor(globalThis, 'toastr');
    let generations = 0;
    let metadataWrites = 0;
    Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: { href, origin: new URL(href).origin } });
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = {
        getElementById: id => id === constants.OVERLAY_ID ? overlay : null,
        querySelector: selector => selector.endsWith('.rmt-body') ? body : selector.endsWith('.rmt-topbar-title') ? topTitle : null,
    };
    globalThis.confirm = () => true;
    globalThis.fetch = async () => { fetches++; throw new Error('unexpected network request in image commit fixture'); };
    globalThis.toastr = Object.fromEntries(['success', 'error', 'warning', 'info'].map(kind => [kind,
        message => notices.push({ kind, message })]));
    console.error = (...args) => errors.push(args);
    console.warn = (...args) => warnings.push(args);
    globalThis.STBaiBaiImage = { apiVersion: 1, capabilities: { generate: true, saveToGallery: true },
        getBackendStatus: () => ({ configured: true }),
        async generate(request) {
            generations++;
            assert.equal(request.save, true);
            assert.equal(request.character, '角色');
            metadataWrites = ctx.metadataSaves;
            return { path: imagePath };
        } };
    const backend = memoryBackend();
    backupApi.setArchiveBackupBackendForTests(backend);
    state.activeMode = mode;
    state.activeSession = clone(session);
    state.activeArchiveSnapshot = null;
    state.activeArchiveReadOnly = false;
    state.cgImageLifecycleEpoch++;
    state.activeCgImageTasks.clear();
    state.activeGenerationTasks.clear();
    state.runtimeSessionCache.clear();
    state.cacheHydrationErrors.clear();
    const entry = cacheApi.archiveBackupEntryForContext(ctx, bank);
    await backupApi.seedArchiveBackup(entry, bank, clone(ctx.chatMetadata[constants.CACHE_KEY]));
    t.after(() => {
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        state.cachePersistTimers.clear();
        for (const key of ['activeCgImageTasks', 'activeGenerationTasks', 'runtimeSessionCache', 'cacheHydrationErrors',
            'cacheHydrationPromises', 'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains', 'archiveCommitChains']) state[key].clear();
        state.activeMode = null; state.activeSession = null; state.activeArchiveSnapshot = null;
        backupApi.setArchiveBackupBackendForTests(null);
        console.error = originalError;
        console.warn = originalWarn;
        for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
        originalToastr ? Object.defineProperty(globalThis, 'toastr', originalToastr) : delete globalThis.toastr;
    });
    return { ctx, bank, entry, backend, session, body, notices, errors, warnings, render,
        generationCount: () => generations, metadataWritesAtGeneration: () => metadataWrites,
        cardReadCount: () => cardReads, fetchCount: () => fetches,
        async draw(expectedTarget = null, promptMetadata) {
            const options = { promptOverride: scene, expectedTarget, promptMetadata };
            if (mode === constants.MODE.HEART) await heartUi.drawHeartStripImage('event', options);
            else await images.drawSelectedCgImage(options);
        },
        async reopen() {
            state.runtimeSessionCache.clear();
            await cacheApi.ensureCacheHydrated(ctx);
            const loaded = cacheApi.loadSession(mode, { context: ctx });
            state.activeSession = loaded;
            render();
            return loaded;
        } };
}

for (const href of ['tauri://localhost/', 'https://cloud.example/']) {
    test(`real image draw commits and reopens through cache and album renderer at ${href}`, async t => {
        const f = await fixture(t, { href });
        const untouched = clone(f.session.entries[1]);
        await f.draw();
        assert.equal(f.generationCount(), 1);
        assert.equal(f.notices.filter(item => item.kind === 'error').length, 0, JSON.stringify(f.errors));
        assert.equal(state.activeSession.entries[0].cgImage?.url, imagePath);
        assert.deepEqual(state.activeSession.entries[1], untouched);
        assert.ok(f.ctx.metadataSaves > 0);
        const backup = await backupApi.readArchiveBackup(f.entry);
        assert.ok(backup?.cache);
        const reopened = await f.reopen();
        assert.equal(reopened.entries[0].cgImage?.url, imagePath);
        assert.deepEqual(reopened.entries[1], untouched);
        assert.match(f.body.innerHTML, /<img\b[^>]*src="\/user\/images\/fixture\/cg-event\.png"/);
        assert.equal(state.activeCgImageTasks.size, 0);
    });
}

test('real draw retains an unpaid-retry image when backup storage is unavailable and later saves without generating again', async t => {
    const f = await fixture(t);
    backupApi.setArchiveBackupBackendForTests({ ...f.backend,
        async read() { throw backupDiagnostics.backupFailureError(null, 'open', 'unavailable'); } });
    const before = JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]);
    const target = images.captureCgImageTarget();
    await f.draw(target);
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.entries[0].cgImage, undefined);
    assert.equal(JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]), before);
    assert.equal(f.notices.filter(item => item.kind === 'error').length, 1);
    assert.equal(state.activeCgImageTasks.size, 0);
    assert.equal(images.hasPendingCgImage(target), true);
    assert.ok(f.notices.every(item => !item.message.includes('没有可识别的错误原因')));
    await f.draw();
    assert.equal(f.generationCount(), 1, 'a pending saved image blocks another paid draw');
    backupApi.setArchiveBackupBackendForTests(f.backend);
    const retried = await Promise.all([images.retryPendingCgImage(target), images.retryPendingCgImage(target)]);
    assert.equal(retried.filter(Boolean).length, 1, 'simultaneous retries use one pending commit');
    assert.equal(f.generationCount(), 1, 'retry never calls the billed provider again');
    assert.equal(images.hasPendingCgImage(target), false);
    assert.equal(state.activeSession.entries[0].cgImage?.url, imagePath);
    const reopened = await f.reopen();
    assert.equal(reopened.entries[0].cgImage?.url, imagePath);
    assert.match(f.body.innerHTML, /<img\b[^>]*src="\/user\/images\/fixture\/cg-event\.png"/);
});

test('real draw keeps the durable image visible when the metadata mirror fails', async t => {
    const f = await fixture(t, { metadataFailure: true });
    const before = JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]);
    await f.draw();
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.entries[0].cgImage?.url, imagePath);
    assert.notEqual(JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]), before);
    assert.equal(f.notices.filter(item => item.kind === 'error').length, 0);
    assert.ok(f.warnings.some(item => item[1]?.code === 'RMT_CG_MIRROR_PENDING'));
    const backup = await backupApi.readArchiveBackup(f.entry);
    const saved = cacheApi.isCompressedCacheRecord(backup.cache) ? await cacheApi.gunzipJson(backup.cache.data) : backup.cache;
    assert.equal(saved.album.entries[0].cgImage?.url, imagePath, 'canonical backup succeeded before mirror threw');
    assert.equal(state.activeCgImageTasks.size, 0);
    const reopened = await f.reopen();
    assert.equal(reopened.entries[0].cgImage?.url, imagePath);
});

async function setCanonicalDivergence(f, { completed = true } = {}) {
    const fence = { generation: 1, token: 'same-fence' };
    const stamp = '1:same-fence';
    const canonical = clone(f.ctx.chatMetadata[constants.CACHE_KEY]);
    canonical.updatedAt = 4;
    canonical[constants.MODE_WRITE_FENCES_CACHE_KEY] = { album: fence };
    canonical.__generationRecoveryClearedV1 = { album: stamp };
    canonical.album[constants.SESSION_MODE_WRITE_FENCE_KEY] = stamp;
    canonical.album.entries[0].desc = '同一回忆的旧描述';
    await backupApi.updateArchiveBackupCache(f.entry, f.bank, canonical);
    const live = clone(canonical);
    live.updatedAt = Date.now();
    live.album.entries[0].desc = scene;
    if (!completed) delete live.__generationRecoveryClearedV1;
    f.ctx.chatMetadata[constants.CACHE_KEY] = live;
    state.activeSession = clone(live.album);
}

test('real draw preserves newer completed runtime content sharing the canonical completion fence', async t => {
    const f = await fixture(t);
    await setCanonicalDivergence(f);
    await f.draw();
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.entries[0].cgImage?.url, imagePath);
    assert.equal(state.activeSession.entries[0].desc, scene);
    assert.equal(f.notices.filter(item => item.kind === 'error').length, 0);
    const reopened = await f.reopen();
    assert.equal(reopened.entries[0].desc, scene);
    assert.equal(reopened.entries[0].cgImage?.url, imagePath);
});

test('real draw cannot revive a pre-completion mirror over a completed canonical item', async t => {
    const f = await fixture(t);
    await setCanonicalDivergence(f, { completed: false });
    await f.draw();
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.entries[0].cgImage, undefined);
    const backup = await backupApi.readArchiveBackup(f.entry);
    assert.equal(backup.cache.album.entries[0].desc, '同一回忆的旧描述');
    assert.equal(backup.cache.album.entries[0].cgImage, undefined);
    assert.equal(f.notices.filter(item => item.kind === 'error').length, 1);
    assert.equal(state.activeCgImageTasks.size, 0);
});

test('a retained image cannot replace a card edited after the original draw', async t => {
    const f = await fixture(t);
    const target = images.captureCgImageTarget();
    backupApi.setArchiveBackupBackendForTests({ ...f.backend,
        async read() { throw backupDiagnostics.backupFailureError(null, 'open', 'unavailable'); } });
    await f.draw(target);
    assert.equal(images.hasPendingCgImage(target), true);
    backupApi.setArchiveBackupBackendForTests(f.backend);
    state.activeSession.entries[0].desc = '用户随后修改过的回忆';
    const putsBefore = f.backend.puts;
    assert.equal(await images.retryPendingCgImage(target), false);
    assert.equal(f.backend.puts, putsBefore);
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.entries[0].desc, '用户随后修改过的回忆');
    assert.equal(state.activeSession.entries[0].cgImage, undefined);
});

test('a retained image does not write into another chat and can be retried after returning', async t => {
    const f = await fixture(t);
    const target = images.captureCgImageTarget();
    backupApi.setArchiveBackupBackendForTests({ ...f.backend,
        async read() { throw backupDiagnostics.backupFailureError(null, 'open', 'unavailable'); } });
    await f.draw(target);
    backupApi.setArchiveBackupBackendForTests(f.backend);
    const originalMetadata = f.ctx.chatMetadata;
    const originalSession = state.activeSession;
    f.ctx.chatId = 'different-chat';
    f.ctx.chatMetadata = { [constants.MEMORY_KEY]: { ...clone(f.bank), chatId: 'different-chat', archiveRevision: 'different-revision' } };
    state.activeSession = { ...clone(f.session), chatId: 'different-chat', archiveRevision: 'different-revision' };
    const before = JSON.stringify(f.ctx.chatMetadata);
    const putsBefore = f.backend.puts;
    assert.equal(await images.retryPendingCgImage(target), false);
    assert.equal(f.backend.puts, putsBefore);
    assert.equal(JSON.stringify(f.ctx.chatMetadata), before);
    f.ctx.chatId = f.bank.chatId;
    f.ctx.chatMetadata = originalMetadata;
    state.activeSession = originalSession;
    assert.equal(await images.retryPendingCgImage(target), true);
    assert.equal(f.generationCount(), 1);
    const reopened = await f.reopen();
    assert.equal(reopened.entries[0].cgImage?.url, imagePath);
});

test('the image-only mirror option does not change ordinary cache mutation rollback behavior', async t => {
    const f = await fixture(t, { metadataFailure: true });
    const before = JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]);
    const origin = contextApi.captureTaskOrigin(f.ctx, f.bank.archiveRevision);
    await assert.rejects(cacheApi.commitSessionMutation(constants.MODE.ALBUM, f.bank.chatId, origin,
        latest => { latest.entries[0].desc = '普通派生内容更新'; return latest; }, state.activeSession), /fixture metadata failure/);
    assert.equal(JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]), before);
    assert.equal(f.generationCount(), 0);
});

test('real draw preserves confirmed character appearance metadata through image commit and reopening', async t => {
    const f = await fixture(t);
    const promptMetadata = { sceneTags: '2people, garden', characters: [
        { role: 'char', name: '角色', tag: 'black hair' },
        { role: 'user', name: '用户', tag: 'silver hair' },
    ] };
    // r84.10: new images also persist their chosen prompt dialect; appearance unchanged.
    const storedMetadata = { ...promptMetadata, promptFormat: 'nai5-natural', characters: promptMetadata.characters.map(character => ({ ...character, nl: '' })) };
    const readsBefore = f.cardReadCount();
    await f.draw(null, promptMetadata);
    assert.equal(f.generationCount(), 1);
    assert.equal(f.cardReadCount(), readsBefore, 'draw uses confirmed tags without reading the card again');
    assert.equal(f.fetchCount(), 0, 'draw does not add a text model or other HTTP request');
    assert.deepEqual(state.activeSession.entries[0].cgImage?.promptMetadata, storedMetadata);
    const reopened = await f.reopen();
    assert.deepEqual(reopened.entries[0].cgImage?.promptMetadata, storedMetadata);
    assert.equal(reopened.entries[0].cgImage?.url, imagePath);
});

for (const mode of [constants.MODE.ALBUM, constants.MODE.ADV, constants.MODE.HEART]) {
    test(`${mode}: a view reopened before image completion refreshes its saved image and releases drawing UI`, async t => {
        const f = await fixture(t, { mode });
        let finish;
        const provider = globalThis.STBaiBaiImage.generate;
        globalThis.STBaiBaiImage.generate = request => new Promise(resolve => {
            finish = async () => resolve(await provider(request));
        });
        const original = state.activeSession;
        const drawing = f.draw();
        assert.equal(typeof finish, 'function', 'provider is pending before reopening');
        state.activeMode = null;
        state.activeSession = null;
        state.activeMode = mode;
        state.activeSession = cacheApi.loadSession(mode, { context: f.ctx });
        assert.notEqual(state.activeSession, original);
        f.render();
        assert.doesNotMatch(f.body.innerHTML, /<img\b[^>]*cg-event\.png/);
        assert.match(f.body.innerHTML, /取消本次绘制/);
        await finish();
        await drawing;
        assert.equal(f.generationCount(), 1);
        assert.equal(images.cgItemInSession(mode, state.activeSession, 'event').cgImage?.url, imagePath);
        assert.match(f.body.innerHTML, /<img\b[^>]*src="\/user\/images\/fixture\/cg-event\.png"/);
        assert.doesNotMatch(f.body.innerHTML, /取消本次绘制|绘制中…/);
        assert.equal(state.activeCgImageTasks.size, 0);
        assert.equal(images.cgItemInSession(mode, await f.reopen(), 'event').cgImage?.url, imagePath);
    });
}

test('daily strip keeps an old image on backup failure, then refills the generated image without another provider call', async t => {
    const previousImage = { url: '/user/images/fixture/old.png', prompt: '旧画面', provider: 'baibai-image', generatedAt: 1 };
    const f = await fixture(t, { mode: constants.MODE.HEART, previousImage });
    const target = images.captureCgImageTarget();
    const before = JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]);
    backupApi.setArchiveBackupBackendForTests({ ...f.backend,
        async read() { throw backupDiagnostics.backupFailureError(null, 'open', 'unavailable'); } });
    await f.draw(target);
    assert.equal(f.generationCount(), 1);
    assert.deepEqual(state.activeSession.dailyStrips[0].cgImage, previousImage);
    assert.equal(JSON.stringify(f.ctx.chatMetadata[constants.CACHE_KEY]), before);
    assert.equal(images.hasPendingCgImage(target), true);
    assert.ok(f.notices.some(notice => /回填已生成图片/.test(notice.message)));
    await f.draw();
    assert.equal(f.generationCount(), 1, 'pending daily strip blocks a second paid draw');
    backupApi.setArchiveBackupBackendForTests(f.backend);
    assert.equal(await images.retryPendingCgImage(target), true);
    assert.equal(f.generationCount(), 1);
    assert.equal(images.hasPendingCgImage(target), false);
    assert.match(f.body.innerHTML, /<img\b[^>]*cg-event\.png/);
    assert.equal((await f.reopen()).dailyStrips[0].cgImage?.url, imagePath);
});

test('daily strip treats a successful canonical save as success when the metadata mirror fails', async t => {
    const f = await fixture(t, { mode: constants.MODE.HEART, metadataFailure: true });
    await f.draw();
    assert.equal(f.generationCount(), 1);
    assert.equal(f.notices.filter(notice => notice.kind === 'error').length, 0);
    assert.ok(f.warnings.some(item => item[1]?.code === 'RMT_CG_MIRROR_PENDING'));
    assert.equal(state.activeSession.dailyStrips[0].cgImage?.url, imagePath);
    const backup = await backupApi.readArchiveBackup(f.entry);
    const saved = cacheApi.isCompressedCacheRecord(backup.cache) ? await cacheApi.gunzipJson(backup.cache.data) : backup.cache;
    assert.equal(saved.heart.dailyStrips[0].cgImage?.url, imagePath);
    assert.equal((await f.reopen()).dailyStrips[0].cgImage?.url, imagePath);
});

test('daily strip retained image cannot overwrite an edited panel or a different chat', async t => {
    const f = await fixture(t, { mode: constants.MODE.HEART });
    const target = images.captureCgImageTarget();
    backupApi.setArchiveBackupBackendForTests({ ...f.backend,
        async read() { throw backupDiagnostics.backupFailureError(null, 'open', 'unavailable'); } });
    await f.draw(target);
    assert.equal(images.hasPendingCgImage(target), true);
    backupApi.setArchiveBackupBackendForTests(f.backend);
    const puts = f.backend.puts;
    f.ctx.chatId = 'other-chat';
    assert.equal(await images.retryPendingCgImage(target), false);
    f.ctx.chatId = f.bank.chatId;
    state.activeSession.dailyStrips[0].panels[0].action = '用户已修改本格动作';
    assert.equal(await images.retryPendingCgImage(target), false);
    assert.equal(f.backend.puts, puts);
    assert.equal(f.generationCount(), 1);
    assert.equal(state.activeSession.dailyStrips[0].cgImage, undefined);
});

test('direct daily-strip drawing reuses saved chat appearances without reading the card', async t => {
    const f = await fixture(t, { mode: constants.MODE.HEART });
    f.ctx.chatMetadata[CAST_LOOKS_KEY] = { chatId: f.bank.chatId, char: 'black hair', user: 'silver hair', manual: true, updatedAt: 1 };
    const provider = globalThis.STBaiBaiImage.generate;
    let sent;
    globalThis.STBaiBaiImage.getBackendStatus = () => ({ configured: true, supportsCharacters: true });
    globalThis.STBaiBaiImage.generate = request => { sent = request; return provider(request); };
    const reads = f.cardReadCount();
    await heartUi.drawHeartStripImage('event');
    assert.equal(f.generationCount(), 1);
    assert.equal(f.cardReadCount(), reads);
    assert.deepEqual(sent.characters.map(({ name, tag }) => ({ name, tag })), [
        { name: '角色', tag: 'black hair' }, { name: '用户', tag: 'silver hair' },
    ]);
    assert.match(sent.nl, /single-panel comic/);
    assert.equal((await f.reopen()).dailyStrips[0].cgImage.promptMetadata.characters.length, 2);
});
