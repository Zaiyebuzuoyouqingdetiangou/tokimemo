import test from 'node:test';
import assert from 'node:assert/strict';
import * as trace from '../src/core/taskTrace.js';
import * as client from '../src/generation/client.js';
import * as stories from '../src/modes/timeStories.js';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as contextApi from '../src/core/context.js';
import * as groups from '../src/archive/groups.js';
import * as library from '../src/archive/library.js';
import * as backup from '../src/archive/backupStore.js';
import * as overlay from '../src/ui/overlay.js';
import * as navigation from '../src/ui/navigationBookmark.js';
import * as floating from '../src/ui/floatingArchive.js';
import * as recovery from '../src/generation/recovery.js';
import * as recoveryView from '../src/ui/recoveryView.js';
import { createDurableDeferredCommitMap } from '../src/core/deferredCommitStore.js';
import { state } from '../src/core/state.js';

const clone = value => value == null ? value : structuredClone(value);
const echo = (title = '雨声从明天传来', medium = { kind: 'phone', label: '旧电话' }) => ({
    title, opening: '林舟拿起听筒，听见尚未落下的雨。', closing: '他收起原定的车票，约好一起走另一条路。',
    palette: 'blue', motif: '雨声', medium,
    ends: [{ role: 'char', time: '今夜' }, { role: 'user', time: '三年后的今夜' }],
    lines: [{ speaker: 'a', text: '你那边还在下雨吗？' }, { speaker: 'b', text: '明天别坐那班车。' }],
    message: '换一班车，带上那封信。',
});
// Exercise real mode admission, controlled context, provider validation, recovery,
// compressed canonical persistence and readers. Only browser/host capabilities,
// transport and the IndexedDB backend are replaced; there is no live model call.
async function fixture(t) {
    const globals = new Map(['SillyTavern', 'document', 'window', 'location', 'localStorage', 'fetch', 'toastr', 'confirm']
        .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const fields = ['activeMode', 'activeSession', 'activeArchiveSnapshot', 'activeArchiveReadOnly', 'archiveViewLevel',
        'archiveLibraryCharacterKey', 'busy', 'contentManagerOpen', 'runtimeLifecycleEpoch', 'deferredChatCommits',
        'activeTaskTrace', 'activeTaskOrigin', 'activeTaskAbortController', 'activeTaskBackgrounded'];
    const previous = Object.fromEntries(fields.map(key => [key, state[key]]));
    const oldWarn = console.warn, oldError = console.error;
    const records = new Map(), local = new Map(), requests = [], reads = [], booksRead = [], diagnostics = [], notices = [];
    let response = echo(), providerHook = null, sourceReadHook = null, failedMode = '', rejectedWrites = 0;
    const profile = { id: 'time-flow-profile', name: 'Fixture', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-only' };
    const characters = [
        { name: '林舟', avatar: 'time-a.png', data: { name: '林舟', description: 'CARD_A_ONLY。林舟生活在现代都市，日常使用手机。', personality: '认真而克制。' } },
        { name: '沈砚', avatar: 'time-b.png', data: { name: '沈砚', description: 'CARD_B_ONLY。沈砚居住在仙门，日常使用灵力与传音玉。', personality: '说话直接，重视承诺。' } },
    ];
    const bank = side => ({ version: constants.MEMORY_VERSION, chatId: `time-flow-${side}`, archiveRevision: `time-revision-${side}`,
        characterName: side === 'a' ? '林舟' : '沈砚', userName: side === 'a' ? '小月' : '阿宁', archiveName: `回忆-${side}`,
        createdAt: 1, updatedAt: 1,
        memories: [{ id: 'M001', title: '栽花', summary: '两人一同在庭院栽花。', anchors: ['庭院'] }] });
    const liveBank = bank('a'), otherBank = bank('b');
    const oldPhone = memory => ({ kind: 'phone', uiVersion: constants.PHONE_SESSION_VERSION,
        chatId: memory.chatId, archiveRevision: memory.archiveRevision, title: '原有私人终端',
        deviceKind: 'phone', apps: [{ id: 'notes', kind: 'notes', label: '旧札', icon: 'fa-note-sticky',
            entries: [{ id: 'keep-1', title: '不能改写', preview: '旧终端正文', detail: 'OLD_PHONE_PROSE_SENTINEL', basis: '推演' }] }],
        selectedAppId: 'notes', selectedEntryId: 'keep-1', screen: 'app',
    });
    const baseCache = memory => ({ chatId: memory.chatId, archiveRevision: memory.archiveRevision, phone: oldPhone(memory),
        cabinet: { kind: 'cabinet', chatId: memory.chatId, archiveRevision: memory.archiveRevision, items: [{ id: 'old-item', text: 'OLD_OTHER_MODE_SENTINEL' }] } });
    const liveCache = baseCache(liveBank), otherCache = baseCache(otherBank);
    const selection = name => ({ books: [{ name, all: true, entryUids: [], historySource: false }] });
    const ctx = { characterId: 0, groupId: null, chatId: liveBank.chatId, name1: liveBank.userName, name2: liveBank.characterName,
        characters, chat: [{ is_user: true, name: liveBank.userName, mes: '两人一同在庭院栽花。' }],
        chatMetadata: { [constants.MEMORY_KEY]: clone(liveBank), [constants.CACHE_KEY]: clone(liveCache),
            [constants.MEMORY_WORLD_INFO_SETTINGS_KEY]: selection('A-book') },
        powerUserSettings: { persona_description: 'PERSONA_A_ONLY，温和的花店店主。' },
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { apiConnectionMode: 'profile', connectionProfileId: profile.id,
            useCurrentChatExternalMemory: false, useActivatedWorldInfo: false, maxTokens: 12000 }, connectionManager: { profiles: [profile] } },
        getCurrentChatId() { return this.chatId; }, getCharacterCardFields() { return clone(this.characters[this.characterId].data); },
        getTokenCountAsync: async () => 100, saveMetadataDebounced() {}, saveSettingsDebounced() {}, getRequestHeaders: () => ({}),
        getWorldInfoNames: () => ['A-book', 'B-book'],
        async loadWorldInfo(name) {
            booksRead.push(name);
            return { entries: { 1: { uid: 1, comment: '世界设定', key: ['庭院'], content: name === 'A-book'
                ? 'WORLD_A_ONLY。这个世界是现代都市，日常使用电话。' : 'WORLD_B_ONLY。这个世界存在仙门与灵力，传音玉用于联络。' } } };
        },
        ConnectionManagerRequestService: {
            validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, messages, _length, _options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-only');
                requests.push(clone(messages));
                if (providerHook) await providerHook();
                return { content: JSON.stringify(response) };
            },
        },
    };
    const aEntry = groups.currentCharacterArchiveProbe(ctx, liveBank);
    aEntry.entryId = contextApi.archiveIndexEntryId(aEntry);
    const otherContext = { ...ctx, characterId: 1, chatId: otherBank.chatId, name1: otherBank.userName, name2: otherBank.characterName,
        chatMetadata: { [constants.MEMORY_KEY]: otherBank, [constants.CACHE_KEY]: otherCache } };
    const bEntry = groups.currentCharacterArchiveProbe(otherContext, otherBank);
    bEntry.entryId = contextApi.archiveIndexEntryId(bEntry);
    ctx.extensionSettings[constants.ARCHIVE_INDEX_SETTINGS_KEY] = [aEntry, bEntry];

    function node() {
        return { children: [], dataset: {}, style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
            hidden: false, innerHTML: '', textContent: '', scrollTop: 0,
            appendChild(child) { this.children.push(child); return child; }, prepend(child) { this.children.unshift(child); },
            replaceChildren(...children) { this.children = children; this.innerHTML = ''; this.scrollTop = 0; },
            setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {},
            querySelector(selector) { return this.children.find(child => selector === `.${child.className}`) || null; },
            querySelectorAll: () => [],
        };
    }
    const body = node(), host = node(), style = node(), created = [];
    host.querySelector = selector => selector === '.rmt-body' ? body : null;
    globalThis.document = { body: node(), head: node(),
        createElement() { const el = node(); created.push(el); return el; },
        getElementById: id => id === constants.OVERLAY_ID ? host : [constants.STYLE_ID, constants.SETTINGS_STYLE_ID].includes(id)
            ? style : created.find(el => el.id === id) || null,
        querySelector: selector => selector === `#${constants.OVERLAY_ID} .rmt-body` ? body : null,
        querySelectorAll: () => [],
    };
    delete globalThis.window;
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8000/', origin: 'http://127.0.0.1:8000' };
    const storage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) };
    globalThis.localStorage = storage; globalThis.confirm = () => true;
    globalThis.toastr = Object.fromEntries(['info', 'warning', 'error', 'success'].map(kind => [kind, message => notices.push({ kind, message })]));
    console.warn = console.error = (...args) => diagnostics.push(args);
    const maps = ['activeGenerationTasks', 'activeCgImageTasks', 'activeModeBuildScopes', 'activeAdvBulkScopes',
        'activeArchiveTargetReservations', 'runtimeSessionCache', 'cacheHydrationPromises', 'cacheHydrationErrors',
        'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains', 'archiveCommitChains',
        'archiveDeletionFences', 'archiveSnapshotCache', 'archiveTargetTaskEpochs', 'memoryPreflightCache'];
    maps.forEach(key => state[key].clear());
    state.deferredChatCommits = createDurableDeferredCommitMap({ storage });
    Object.assign(state, { activeMode: null, activeSession: null, activeArchiveSnapshot: null, activeArchiveReadOnly: false,
        archiveViewLevel: 'chooser', busy: false, activeTaskTrace: null, activeTaskOrigin: null, activeTaskAbortController: null,
        activeTaskBackgrounded: false, contentManagerOpen: false });
    navigation.clearReadingPositions(); floating.destroyFloatingArchive();
    backup.setArchiveBackupBackendForTests({
        read: async entry => clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null),
        async put(record, expected, options = {}) {
            if (options.stillCurrent) assert.notEqual(options.stillCurrent(), false, 'canonical writes must respect the real lifecycle fence');
            const raw = cache.isCompressedCacheRecord(record.cache) ? await cache.gunzipJson(record.cache.data) : record.cache;
            if (failedMode && raw?.[failedMode]?.episodes?.length) {
                rejectedWrites++;
                throw new DOMException('fixture quota at completed session commit', 'QuotaExceededError');
            }
            const old = records.get(record.entryId);
            if (expected?.present === false) assert.equal(old, undefined);
            if (expected?.present === true && old) assert.equal(old.archiveRevision, expected.revision);
            records.set(record.entryId, clone(record)); return true;
        },
        async delete() { throw new Error('Story generation must not delete archives'); },
    });
    await backup.seedArchiveBackup(aEntry, liveBank, liveCache);
    await backup.seedArchiveBackup(bEntry, otherBank, otherCache);
    globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body); reads.push({ url, body });
        assert.equal(url, '/api/chats/get', 'archive generation may only read its own frozen source');
        assert.equal(body.avatar_url, bEntry.avatar); assert.equal(body.file_name, otherBank.chatId);
        if (sourceReadHook) await sourceReadHook();
        return { ok: true, json: async () => [{ chat_metadata: { [constants.MEMORY_KEY]: clone(otherBank),
            [constants.CACHE_KEY]: clone(otherCache), [constants.MEMORY_WORLD_INFO_SETTINGS_KEY]: selection('B-book') } }] };
    };
    t.after(async () => {
        await Promise.allSettled([...state.archiveCommitChains.values(), ...state.cachePersistChains.values()]);
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        state.cachePersistTimers.clear(); if (state.chooserRefreshTimer) clearTimeout(state.chooserRefreshTimer);
        state.chooserRefreshTimer = 0; floating.destroyFloatingArchive(); navigation.clearReadingPositions();
        maps.forEach(key => state[key].clear()); backup.setArchiveBackupBackendForTests(null);
        Object.assign(state, previous); console.warn = oldWarn; console.error = oldError;
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    return { ctx, liveBank, otherBank, liveCache, otherCache, aEntry, bEntry, records, body, host, requests, reads, booksRead, diagnostics, notices,
        setResponse(value) { response = value; }, failCompletedSave(mode) { failedMode = mode; }, rejectedWrites: () => rejectedWrites,
        pauseProvider() {
            let entered, release;
            const ready = new Promise(resolve => { entered = resolve; }); const wait = new Promise(resolve => { release = resolve; });
            providerHook = async () => { entered(); await wait; };
            return { ready, release };
        },
        pauseSourceRead() {
            let entered, release;
            const ready = new Promise(resolve => { entered = resolve; }); const wait = new Promise(resolve => { release = resolve; });
            sourceReadHook = async () => { entered(); await wait; };
            return { ready, release };
        },
        async persisted(entry = aEntry) {
            const record = await backup.readArchiveBackup(entry);
            return cache.isCompressedCacheRecord(record.cache) ? cache.gunzipJson(record.cache.data) : clone(record.cache);
        },
        open(mode) { host.hidden = false; overlay.openCachedOrGenerate(mode); },
        async historical(mode) {
            const snapshot = await library.fetchIndexedArchiveSnapshot(bEntry, ctx, { force: true });
            state.activeArchiveSnapshot = snapshot; state.activeArchiveReadOnly = false; state.archiveViewLevel = 'snapshot';
            host.hidden = false; overlay.openCachedOrGenerate(mode);
            return library.archiveTargetGenerationOptions(snapshot);
        },
    };
}

async function retiredCache(f) {
    const mode = 'timeJourney';
    const fence = { generation: 1, token: 'retired-fence' };
    const signature = '1:retired-fence';
    const journal = (await recovery.createGenerationRecovery({
        origin: contextApi.captureTaskOrigin(f.ctx, f.liveBank.archiveRevision), mode,
        settingsIdentity: 'retired-settings', save() {},
    })).journal;
    journal.failureCode = 'RMT_JSON_NOT_FOUND';
    journal.segments = [{ slot: 'old-story', requestHash: 'a'.repeat(64), state: 'complete', rawJson: '{"title":"OLD_ACCEPTED_STORY"}' }];
    journal[constants.SESSION_MODE_WRITE_FENCE_KEY] = signature;
    return { chatId: f.liveBank.chatId, archiveRevision: f.liveBank.archiveRevision,
        [mode]: { kind: mode, version: 1, chatId: f.liveBank.chatId, archiveRevision: f.liveBank.archiveRevision,
            title: '旧篇章', episodes: [{ id: 'TS01', title: 'OLD_STORY_SENTINEL' }], selectedId: 'TS01', view: 'story',
            [constants.SESSION_MODE_WRITE_FENCE_KEY]: signature },
        [constants.MODE_WRITE_FENCES_CACHE_KEY]: { [mode]: fence },
        __generationRecoveryV1: { [mode]: journal } };
}

for (const side of ['canonical', 'mirror']) {
    test(`removing journey preserves its ${side}-only old payload while echo saves and reopens`, async t => {
        const f = await fixture(t), retired = await retiredCache(f);
        const canonical = clone(f.records.get(f.aEntry.entryId));
        const plain = { ...clone(f.liveCache), updatedAt: 200 };
        const old = { ...clone(f.liveCache), ...retired, updatedAt: 100 };
        canonical.cache = side === 'canonical' ? old : plain;
        f.records.set(f.aEntry.entryId, canonical);
        f.ctx.chatMetadata[constants.CACHE_KEY] = side === 'mirror' ? old : plain;
        state.runtimeSessionCache.clear();
        f.open('timeEcho'); await client.generateMode('timeEcho');
        const saved = await f.persisted();
        assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
        assert.equal(saved.timeEcho.episodes.length, 1);
        assert.deepEqual(saved.timeJourney, retired.timeJourney);
        assert.deepEqual(saved.__generationRecoveryV1.timeJourney, retired.__generationRecoveryV1.timeJourney);
        assert.deepEqual(saved[constants.MODE_WRITE_FENCES_CACHE_KEY].timeJourney, retired[constants.MODE_WRITE_FENCES_CACHE_KEY].timeJourney);
        assert.deepEqual(saved.phone, f.liveCache.phone); assert.deepEqual(saved.cabinet, f.liveCache.cabinet);
        assert.equal(cache.loadSession('timeJourney', { cache: saved, chatId: f.liveBank.chatId, memoryBank: f.liveBank }), null);
        assert.equal(cache.loadGenerationRecovery('timeJourney', f.ctx), null);
        assert.doesNotMatch(recoveryView.recoveryBannerHtml(saved, f.liveBank), /timeJourney|OLD_ACCEPTED_STORY/);
        overlay.closeOverlay(); state.runtimeSessionCache.clear();
        await cache.ensureCacheHydrated(f.ctx); f.open('timeEcho');
        assert.equal(state.activeSession.episodes.length, 1); assert.equal(f.requests.length, 1);
    });
}

test('an archive containing only retired data keeps it inert across an evidence revision', async t => {
    const f = await fixture(t), retired = await retiredCache(f);
    const old = clone(retired);
    old.__generationRecoveryV1.album = { mustStillBeCleared: true };
    const record = clone(f.records.get(f.aEntry.entryId)); record.cache = old;
    f.records.set(f.aEntry.entryId, record); f.ctx.chatMetadata[constants.CACHE_KEY] = clone(old);
    state.runtimeSessionCache.clear();
    const chat = JSON.stringify(f.ctx.chat);
    const next = { ...clone(f.liveBank), archiveRevision: 'next-revision', updatedAt: 2 };
    await cache.saveImportedMemory(f.ctx, next, next.chatId, { preserveDerivedCache: true,
        expectedPreviousArchiveState: { present: true, revision: f.liveBank.archiveRevision } });
    const saved = await f.persisted();
    assert.deepEqual(saved.timeJourney, retired.timeJourney);
    assert.deepEqual(saved.__generationRecoveryV1.timeJourney, retired.__generationRecoveryV1.timeJourney);
    assert.equal(saved.__generationRecoveryV1.album, undefined);
    assert.equal(saved.archiveRevision, 'next-revision');
    assert.equal(saved.timeJourney.archiveRevision, f.liveBank.archiveRevision, 'retired story must not acquire new evidence identity');
    assert.equal(JSON.stringify(f.ctx.chat), chat); assert.equal(f.requests.length, 0);
});

test('retired clear markers and newer deletion fences still prevent old mirror resurrection', async t => {
    const f = await fixture(t), retired = await retiredCache(f);
    for (const deleted of [false, true]) {
        const record = clone(f.records.get(f.aEntry.entryId));
        const canonical = { ...clone(f.liveCache), ...clone(retired), updatedAt: 100 };
        if (deleted) {
            canonical[constants.MODE_WRITE_FENCES_CACHE_KEY].timeJourney = { generation: 2, token: 'removed' };
            delete canonical.timeJourney;
        }
        canonical.__generationRecoveryClearedV1 = { timeJourney: deleted ? '2:removed' : '1:retired-fence' };
        delete canonical.__generationRecoveryV1;
        record.cache = canonical; f.records.set(f.aEntry.entryId, record);
        f.ctx.chatMetadata[constants.CACHE_KEY] = { ...clone(f.liveCache), ...clone(retired), updatedAt: 200 };
        state.runtimeSessionCache.clear();
        const origin = contextApi.captureTaskOrigin(f.ctx, f.liveBank.archiveRevision);
        assert.equal(await cache.commitSession('cabinet', f.liveCache.cabinet, f.liveBank.chatId, origin), true);
        const saved = await f.persisted();
        assert.equal(saved.__generationRecoveryV1?.timeJourney, undefined);
        assert.equal(saved.__generationRecoveryClearedV1.timeJourney, canonical.__generationRecoveryClearedV1.timeJourney);
        assert.deepEqual(saved.timeJourney, deleted ? undefined : retired.timeJourney);
        assert.deepEqual(saved.cabinet.items, f.liveCache.cabinet.items);
    }
});

test('retired opening, generation, retry and old bookmarks do not replace another reader or send requests', async t => {
    const f = await fixture(t), retired = await retiredCache(f);
    Object.assign(f.ctx.chatMetadata[constants.CACHE_KEY], retired);
    state.activeMode = 'timeJourney'; state.activeSession = clone(retired.timeJourney);
    navigation.rememberReadingPosition();
    f.open('phone'); const active = state.activeSession, html = f.body.innerHTML;
    const before = JSON.stringify(f.ctx.chatMetadata), recordsBefore = JSON.stringify([...f.records]);
    f.open('timeJourney'); await client.generateMode('timeJourney'); await client.continueSavedGeneration('timeJourney');
    assert.equal(navigation.restoreReadingPosition({ open() { assert.fail('retired bookmark reopened'); } }), false);
    assert.equal(state.activeSession, active); assert.equal(state.activeMode, 'phone'); assert.equal(f.body.innerHTML, html);
    assert.equal(JSON.stringify(f.ctx.chatMetadata), before); assert.equal(JSON.stringify([...f.records]), recordsBefore);
    assert.equal(f.requests.length, 0); assert.equal(f.reads.length, 0); assert.equal(f.booksRead.length, 0);
});

for (const mode of ['timeEcho']) {
    test(`${mode}: real generation saves an episode, appends with no new memory, and reopens from durable cache`, async t => {
        const f = await fixture(t); f.setResponse(echo()); f.open(mode);
        assert.equal(state.activeSession.episodes.length, 0);
        assert.equal(f.requests.length, 0, 'opening the empty reader is free');
        const first = await client.generateMode(mode);
        assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
        assert.equal(first?.episodes.length, 1, JSON.stringify(f.diagnostics));
        assert.equal(state.activeSession.episodes.length, 1, 'the empty foreground reader must show its completed episode');
        assert.match(f.body.innerHTML, new RegExp(first.episodes[0].title));
        const exactFirst = clone(first.episodes[0]);
        const foregroundSession = state.activeSession;
        f.setResponse(echo('第二声铃响'));
        const second = await client.generateMode(mode, { background: true });
        assert.equal(f.requests.length, 2, 'another explicit story is allowed without adding formal memories');
        assert.equal(second?.episodes.length, 2, JSON.stringify(f.diagnostics));
        assert.equal(state.activeSession, foregroundSession, 'explicit background generation must preserve the current reader');
        assert.deepEqual(second.episodes[0], exactFirst); assert.equal(second.episodes[1].id, 'TS02');
        assert.deepEqual(f.ctx.chatMetadata[constants.MEMORY_KEY], f.liveBank, 'fiction cannot alter formal memory');
        const durable = await f.persisted();
        assert.deepEqual(durable.phone, f.liveCache.phone); assert.deepEqual(durable.cabinet, f.liveCache.cabinet);
        assert.deepEqual(durable[mode].episodes, second.episodes);
        assert.equal(cache.loadGenerationRecovery(mode, f.ctx), null, 'successful commit clears only its recovery journal');
        const savedMirror = clone(f.ctx.chatMetadata);
        overlay.closeOverlay(); state.runtimeSessionCache.clear(); state.archiveSnapshotCache.clear();
        state.pendingCompressedCacheWrites.clear(); f.ctx.chatMetadata = clone(savedMirror);
        await cache.ensureCacheHydrated(f.ctx); f.open(mode);
        assert.deepEqual(state.activeSession.episodes, second.episodes);
        assert.ok(stories.readableTimeStoriesSession(state.activeSession, f.liveBank));
        assert.equal(f.requests.length, 2, 'cold reading must not regenerate');
        assert.match(JSON.stringify(f.requests[0]), /CARD_A_ONLY/); assert.match(JSON.stringify(f.requests[0]), /WORLD_A_ONLY/);
        assert.doesNotMatch(JSON.stringify(f.requests[0]), /CARD_B_ONLY|WORLD_B_ONLY|OLD_PHONE_PROSE_SENTINEL/);
    });
}

test('a completed reply survives canonical save failure and retries through the real recovery without a new provider call', async t => {
    const f = await fixture(t); f.open('timeEcho'); f.failCompletedSave('timeEcho');
    await client.generateMode('timeEcho', { background: true });
    assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
    assert.ok(f.rejectedWrites() > 0, 'only the canonical write containing the completed session was rejected');
    assert.equal((await f.persisted()).timeEcho, undefined);
    const journal = cache.loadGenerationRecovery('timeEcho', f.ctx);
    assert.equal(journal?.segments.length, 1); assert.equal(journal.segments[0].state, 'complete');
    assert.deepEqual(f.ctx.chatMetadata[constants.MEMORY_KEY], f.liveBank);
    f.failCompletedSave('');
    const recovered = await client.continueSavedGeneration('timeEcho');
    assert.equal(f.requests.length, 1, 'explicit recovery must reuse its accepted JSON');
    assert.equal(recovered?.episodes.length, 1, JSON.stringify(f.diagnostics));
    assert.deepEqual((await f.persisted()).timeEcho.episodes, recovered.episodes);
    assert.deepEqual(state.activeSession.episodes, recovered.episodes, 'the real continue button must replace the empty reader after recovery');
    assert.match(f.body.innerHTML, new RegExp(recovered.episodes[0].title));
    assert.equal(cache.loadGenerationRecovery('timeEcho', f.ctx), null);
    assert.deepEqual((await f.persisted()).phone, f.liveCache.phone);
});

for (const interruption of ['close', 'different-mode', 'new-reader']) {
    test(`a ${interruption} during a story request does not steal the current UI when the saved reply arrives`, async t => {
        const f = await fixture(t); f.open('timeEcho'); const paused = f.pauseProvider();
        const pending = client.generateMode('timeEcho'); await paused.ready;
        if (interruption === 'close') overlay.closeOverlay();
        if (interruption === 'different-mode') f.open('phone');
        if (interruption === 'new-reader') { overlay.closeOverlay(); f.open('timeEcho'); }
        const currentSession = state.activeSession, currentMode = state.activeMode;
        f.body.innerHTML = 'NEWER_PAGE_SENTINEL'; f.body.scrollTop = 37;
        paused.release(); await pending;
        assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
        assert.equal((await f.persisted()).timeEcho.episodes.length, 1, 'closing or navigating does not cancel the completed save');
        assert.equal(state.activeMode, currentMode); assert.equal(state.activeSession, currentSession);
        assert.equal(f.body.innerHTML, 'NEWER_PAGE_SENTINEL'); assert.equal(f.body.scrollTop, 37);
        assert.equal(f.host.hidden, interruption === 'close');
        assert.deepEqual(f.ctx.chatMetadata[constants.MEMORY_KEY], f.liveBank);
    });
}

test('moving within the same reader while another episode generates preserves the chosen passage', async t => {
    const f = await fixture(t); f.open('timeEcho'); await client.generateMode('timeEcho');
    const original = state.activeSession;
    original.view = 'library'; overlay.renderActive();
    f.setResponse(echo('第二声铃响')); const paused = f.pauseProvider();
    const pending = client.generateMode('timeEcho'); await paused.ready;
    Object.assign(original, { view: 'story', reading: true, dialogueIndex: 1 }); overlay.renderActive();
    const chosenPassage = f.body.innerHTML; f.body.scrollTop = 51;
    paused.release(); await pending;
    assert.equal(f.requests.length, 2, JSON.stringify(f.diagnostics));
    assert.equal((await f.persisted()).timeEcho.episodes.length, 2);
    assert.equal(state.activeSession, original); assert.equal(original.dialogueIndex, 1);
    assert.equal(f.body.innerHTML, chosenPassage); assert.equal(f.body.scrollTop, 51);
});

test('historical B generates with its card/worldbook, updates its still-open reader, and never changes current chat A', async t => {
    const f = await fixture(t); f.setResponse(echo('玉中迟来的回声', { kind: 'relic', label: '传音玉' }));
    const options = await f.historical('timeEcho'); const liveBefore = clone(f.ctx.chatMetadata);
    const session = await client.generateMode('timeEcho', { ...options, background: false });
    assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
    assert.equal(session?.episodes.length, 1, JSON.stringify(f.diagnostics));
    assert.equal(session.characterName, '沈砚'); assert.equal(session.userName, '阿宁');
    const sent = JSON.stringify(f.requests[0]);
    assert.match(sent, /CARD_B_ONLY/); assert.match(sent, /WORLD_B_ONLY/);
    assert.doesNotMatch(sent, /CARD_A_ONLY|WORLD_A_ONLY|PERSONA_A_ONLY|小月/);
    assert.ok(f.booksRead.length > 0); assert.ok(f.booksRead.every(name => name === 'B-book'));
    assert.equal(state.activeArchiveSnapshot.entryId, f.bEntry.entryId);
    assert.equal(state.activeSession.characterName, '沈砚'); assert.equal(state.activeSession.episodes.length, 1);
    assert.match(f.body.innerHTML, /玉中迟来的回声/);
    assert.equal(f.ctx.chatId, f.liveBank.chatId); assert.equal(f.ctx.characterId, 0);
    assert.deepEqual(f.ctx.chatMetadata, liveBefore, 'detached saves must leave A memory and derived caches unchanged');
    const durable = await f.persisted(f.bEntry);
    assert.deepEqual(durable.timeEcho.episodes, session.episodes); assert.deepEqual(durable.phone, f.otherCache.phone);
    overlay.closeOverlay(); state.runtimeSessionCache.clear(); state.archiveSnapshotCache.clear();
    await f.historical('timeEcho');
    assert.equal(state.activeSession.episodes.length, 1); assert.equal(f.requests.length, 1);
});

test('closing historical B during source preflight keeps the overlay closed while the final episode saves to B', async t => {
    const f = await fixture(t); f.setResponse(echo('玉中迟来的回声', { kind: 'relic', label: '传音玉' }));
    const options = await f.historical('timeEcho'); const liveBefore = clone(f.ctx.chatMetadata);
    const paused = f.pauseSourceRead();
    const pending = client.generateMode('timeEcho', { ...options, background: false }); await paused.ready;
    assert.equal(f.requests.length, 0, 'the request is still in source preflight when the user closes');
    overlay.closeOverlay(); f.body.innerHTML = 'CLOSED_DURING_PREFLIGHT'; f.body.scrollTop = 29;
    paused.release(); const session = await pending;
    assert.equal(f.requests.length, 1, JSON.stringify(f.diagnostics));
    assert.equal(session?.episodes.length, 1, JSON.stringify(f.diagnostics));
    assert.equal(f.host.hidden, true, 'preflight completion must not reopen the closed overlay');
    assert.equal(state.activeMode, null); assert.equal(state.activeSession, null);
    assert.equal(f.body.innerHTML, 'CLOSED_DURING_PREFLIGHT'); assert.equal(f.body.scrollTop, 29);
    assert.deepEqual((await f.persisted(f.bEntry)).timeEcho.episodes, session.episodes);
    assert.deepEqual(f.ctx.chatMetadata, liveBefore); assert.equal(f.ctx.characterId, 0);
});

// Derived requests must remain attached to one logical mode record through save/recovery.
test('derived diagnostics distinguish accepted model output from a failed save and a successful save-only retry', async t => {
    const f = await fixture(t); trace.clearTaskTrace(); t.after(() => trace.clearTaskTrace());
    f.open('timeEcho'); f.failCompletedSave('timeEcho');
    await client.generateMode('timeEcho', { background: true });
    let rows = trace.taskTraceSnapshot();
    assert.equal(rows.length, 1); assert.equal(rows[0].mode, 'timeEcho');
    assert.equal(rows[0].outcome, 'deferred');
    assert.ok(rows[0].stages.some(stage => stage.startsWith('parse@')));
    assert.ok(rows[0].stages.some(stage => stage.startsWith('save!@')));
    assert.equal(rows[0].response.shape, 'content');
    assert.doesNotMatch(JSON.stringify(rows), /time-flow-|CARD_A_ONLY|旧电话|fixture-only/);
    f.failCompletedSave('');
    await client.continueSavedGeneration('timeEcho');
    rows = trace.taskTraceSnapshot();
    assert.equal(rows.length, 2); assert.equal(rows[1].outcome, 'ok');
    assert.equal(rows[1].response, undefined, 'save-only recovery does not pretend a new model response happened');
    assert.equal(f.requests.length, 1);
});

test('real garden generation excludes selected history books and fits complete setting entries before saving', async t => {
    const f = await fixture(t);
    f.ctx.chatMetadata[constants.MEMORY_WORLD_INFO_SETTINGS_KEY] = { books: [
        { name: 'history-book', all: true, historySource: true },
        { name: 'setting-book', all: true, historySource: false },
    ] };
    f.ctx.getWorldInfoNames = () => ['history-book', 'setting-book'];
    const reads = [];
    f.ctx.loadWorldInfo = async name => {
        reads.push(name);
        if (name === 'history-book') throw new Error('history must not consume the garden setting budget');
        return { entries: {
            1: { uid: 1, comment: '很长的设定', key: ['林舟'], content: '大条目不应进入本次庭园'.repeat(2000) },
            2: { uid: 2, comment: '邻居', key: ['林舟'], content: '白露是林舟的邻居，常在庭院种花。' },
        } };
    };
    f.setResponse({ title: '庭园', summary: '附近的朋友', discoveries: [], relationships: [],
        settingRelationships: [{ name: '白露', sourceWorld: 'setting-book', sourceUid: '2', sourceEvidence: '白露是林舟的邻居，常在庭院种花。' }] });
    const result = await client.generateMode('relations', { background: true });
    assert.ok(result, JSON.stringify(f.diagnostics));
    assert.equal(f.requests.length, 1); assert.ok(reads.includes('setting-book')); assert.ok(!reads.includes('history-book'));
    assert.doesNotMatch(JSON.stringify(f.requests), /大条目不应进入本次庭园/);
    assert.equal(result.settingRelationships[0].name, '白露');
    assert.equal((await f.persisted()).relations.settingRelationships[0].name, '白露');
});
