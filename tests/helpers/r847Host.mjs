import test from 'node:test';
import assert from 'node:assert/strict';
import * as trace from '../../src/core/taskTrace.js';
import * as client from '../../src/generation/client.js';
import * as stories from '../../src/modes/timeStories.js';
import * as cache from '../../src/core/cache.js';
import * as constants from '../../src/core/constants.js';
import * as contextApi from '../../src/core/context.js';
import * as groups from '../../src/archive/groups.js';
import * as library from '../../src/archive/library.js';
import * as backup from '../../src/archive/backupStore.js';
import * as overlay from '../../src/ui/overlay.js';
import * as navigation from '../../src/ui/navigationBookmark.js';
import * as floating from '../../src/ui/floatingArchive.js';
import * as recovery from '../../src/generation/recovery.js';
import * as recoveryView from '../../src/ui/recoveryView.js';
import { createDurableDeferredCommitMap } from '../../src/core/deferredCommitStore.js';
import { state } from '../../src/core/state.js';

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
export async function fixture(t) {
    const globals = new Map(['SillyTavern', 'document', 'window', 'location', 'localStorage', 'fetch', 'toastr', 'confirm']
        .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const fields = ['activeMode', 'activeSession', 'activeArchiveSnapshot', 'activeArchiveReadOnly', 'archiveViewLevel',
        'archiveLibraryCharacterKey', 'busy', 'contentManagerOpen', 'runtimeLifecycleEpoch', 'deferredChatCommits',
        'activeTaskTrace', 'activeTaskOrigin', 'activeTaskAbortController', 'activeTaskBackgrounded'];
    const previous = Object.fromEntries(fields.map(key => [key, state[key]]));
    const oldWarn = console.warn, oldError = console.error;
    const records = new Map(), local = new Map(), requests = [], reads = [], booksRead = [], diagnostics = [], notices = [];
    let response = echo(), providerHook = null, sourceReadHook = null, failedMode = '', rejectedWrites = 0;
    let completedPredicate = value => value?.episodes?.length;
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
                return { content: JSON.stringify(typeof response === 'function' ? await response(messages) : response) };
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
            if (failedMode && completedPredicate(raw?.[failedMode])) {
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
        setResponse(value) { response = value; }, failCompletedSave(mode, predicate = value => value?.episodes?.length) { failedMode = mode; completedPredicate = predicate; }, rejectedWrites: () => rejectedWrites,
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
        open(mode) { host.hidden = false; return overlay.openCachedOrGenerate(mode); },
        async historical(mode) {
            const snapshot = await library.fetchIndexedArchiveSnapshot(bEntry, ctx, { force: true });
            state.activeArchiveSnapshot = snapshot; state.activeArchiveReadOnly = false; state.archiveViewLevel = 'snapshot';
            host.hidden = false; overlay.openCachedOrGenerate(mode);
            return library.archiveTargetGenerationOptions(snapshot);
        },
    };
}
