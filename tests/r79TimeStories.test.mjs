import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/core/timeStoriesContract.js';
import * as stories from '../src/modes/timeStories.js';
import * as constants from '../src/core/constants.js';
import * as contextApi from '../src/core/context.js';
import * as recovery from '../src/generation/recovery.js';
import { state } from '../src/core/state.js';

const bank = { version: 3, chatId: 'time-story-chat', archiveRevision: 'time-r1', characterName: '林舟', userName: '小月',
    archiveName: '雨夜归途', memories: [{ id: 'M001', title: '雨中归家', summary: '林舟与小月在门廊躲雨。', anchors: ['门廊'] }] };
const echo = () => ({ title: '明日的雨声', opening: '窗外的雨还没有落下，听筒先传来雨声。', closing: '林舟把原定的车票放回抽屉。',
    palette: 'blue', motif: '雨落在窗沿', medium: { kind: 'phone', label: '旧电话' }, ends: [{ role: 'char', time: '今夜' }, { role: 'user', time: '三年后的今夜' }],
    lines: [{ speaker: 'a', text: '你那边怎么也在下雨？' }, { speaker: 'b', text: '明天别坐那班车。' }], message: '换一班车，带上那封信。' });
const journey = () => ({ title: '你来得比春天早', opening: '林舟无法决定自己何时离开。', closing: '这次，小月终于能把花亲手交给他。', palette: 'moss', motif: '尚未开放的花', traveler: 'char',
    encounters: [{ title: '初见', charTime: '第一次跳跃', userTime: '离别以后', charOrder: 1, userOrder: 2, charKnows: '还不认识她', userKnows: '知道他会回来', text: '小月叫出了陌生人的名字。' },
        { title: '旧约', charTime: '最后一次归来', userTime: '春天以前', charOrder: 2, userOrder: 1, text: '林舟没有解释那句迟到的问候。' }] });
const episode = (mode, raw, opts = {}) => stories.normalizeTimeStoryEpisode(mode, raw, bank, { id: 'TS01', presentation: 'modern', ...opts });
const sessionFor = (mode, raw) => ({ ...stories.emptyTimeStories(mode, bank), episodes: [episode(mode, raw)], selectedId: 'TS01', view: 'story' });

test('both sides can be char or user at different times; local IDs and fiction authority ignore model fields', () => {
    for (const role of ['char', 'user']) {
        const raw = echo(); raw.ends.forEach(end => end.role = role); raw.id = 'remote-id'; raw.fiction = false; raw.css = 'body{display:none}';
        const result = episode('timeEcho', raw);
        assert.deepEqual(result.ends.map(end => end.role), [role, role]);
        assert.equal(result.id, 'TS01'); assert.equal(result.fiction, true); assert.equal(result.css, undefined);
    }
    const raw = echo(); raw.lines = [{ speaker: 'a', text: '只有一端说话。' }];
    assert.throws(() => episode('timeEcho', raw), { code: 'RMT_TIME_STORY_STRUCTURE' });
});

test('media follows controlled technology; unknown worlds do not acquire phones or magic', () => {
    assert.deepEqual(contract.timeStoryMediumKinds({ technology: 'neutral', worldStyle: 'neutral' }), ['object', 'voice']);
    for (const profile of [{ technology: 'low', worldStyle: 'historical' }, { technology: 'low', worldStyle: 'contemporary' }, {}]) {
        assert.throws(() => episode('timeEcho', echo(), { profile }), { code: 'RMT_TIME_STORY_WORLD' });
        const raw = echo(); raw.medium = { kind: 'object', label: '铜铃' };
        assert.equal(episode('timeEcho', raw, { profile }).medium.kind, 'object');
    }
    const magical = echo(); magical.medium = { kind: 'relic', label: '传音玉' };
    assert.equal(episode('timeEcho', magical, { profile: { technology: 'magical', worldStyle: 'fantasy' } }).medium.kind, 'relic');
    const future = echo(); future.medium = { kind: 'terminal', label: '舰桥通讯台' };
    assert.equal(episode('timeEcho', future, { profile: { technology: 'future', worldStyle: 'scifi' } }).presentation, 'scifi');
});

test('journey preserves personal time orders without requiring an artificial inversion', () => {
    const result = episode('timeJourney', journey());
    assert.deepEqual(result.encounters.map(item => item.id), ['S01', 'S02']);
    assert.deepEqual([...result.encounters].sort((a, b) => a.userOrder - b.userOrder).map(item => item.id), ['S02', 'S01']);
    const sequential = journey(); sequential.encounters.forEach((item, i) => item.userOrder = i + 3);
    assert.deepEqual(episode('timeJourney', sequential).encounters.map(item => item.userOrder), [3, 4]);
    for (const orders of [[1, 1], [0, 2], [1.5, 2], [1, Number.MAX_SAFE_INTEGER + 1]]) {
        const raw = journey(); raw.encounters.forEach((item, i) => item.userOrder = orders[i]);
        assert.throws(() => episode('timeJourney', raw), { code: 'RMT_TIME_STORY_STRUCTURE' });
    }
});

test('stored reading checks structure and archive identity without reinterpreting old prose', () => {
    const session = sessionFor('timeJourney', journey());
    session.episodes[0].closing = '旧故事中的前任与别人结婚。';
    assert.ok(stories.readableTimeStoriesSession(session, bank));
    assert.equal(stories.readableTimeStoriesSession(session, { ...bank, chatId: 'other-chat' }), null);
    assert.equal(stories.readableTimeStoriesSession(session, { ...bank, archiveRevision: 'other-revision' }), null);
    assert.equal(stories.readableTimeStoriesSession(session, { ...bank, characterName: '另一人' }), null);
    assert.equal(stories.readableTimeStoriesSession(session, { ...bank, userName: '另一个用户' }), null);
    const malformed = structuredClone(session); malformed.episodes[0].encounters[1].id = 'S01';
    assert.equal(stories.readableTimeStoriesSession(malformed, bank), null);
});

test('bounded inert data rejects accessors/prototypes/cycles; markup remains literal text without executable fields', () => {
    let accessed = false; const bad = { get title() { accessed = true; return 'secret'; } };
    const cycle = {}; cycle.self = cycle;
    for (const value of [bad, cycle, Object.assign(Object.create({ secret: 'private' }), echo()), JSON.parse('{"__proto__":{"secret":"private"}}')]) {
        assert.throws(() => episode('timeEcho', value), error => error.code === 'RMT_TIME_STORY_STRUCTURE' && !error.message.includes('private'));
    }
    assert.equal(accessed, false);
    const raw = echo(); raw.title = '<img src=x onerror=alert(1)>'; raw.palette = 'blue" onclick="alert(1)'; raw.url = 'javascript:alert(1)';
    const safe = episode('timeEcho', raw);
    assert.equal(safe.title, raw.title); assert.equal(safe.palette, 'slate'); assert.equal(safe.url, undefined);
    assert.throws(() => episode('timeEcho', { ...echo(), opening: 'x'.repeat(30001) }), { code: 'RMT_TIME_STORY_STRUCTURE' });
});

test('new fiction rejects third-party romance without requiring present-day marriage or minimum prose length', () => {
    const raw = echo(); raw.lines[0].text = '我和你结婚的那天，也下着雨。';
    assert.equal(episode('timeEcho', raw).lines[0].text, raw.lines[0].text);
    raw.lines[0].text = '我和别人结婚了。';
    assert.throws(() => episode('timeEcho', raw), { code: 'RMT_TIME_STORY_RELATIONSHIP' });
    assert.ok(episode('timeEcho', { ...echo(), title: '雨', opening: '雨。', closing: '晴。' }));
});

test('reading state clamps missing selections and dialogue position and preserves supported timeline tabs', () => {
    const session = sessionFor('timeEcho', echo());
    assert.equal(contract.timeStoryReadingState({ ...session, dialogueIndex: 100000 }).dialogueIndex, 2);
    assert.equal(contract.timeStoryReadingState({ ...session, dialogueIndex: -1 }).dialogueIndex, 0);
    assert.equal(contract.timeStoryReadingState({ ...session, selectedId: 'missing' }).view, 'library');
    const pair = sessionFor('timeJourney', journey());
    const ui = contract.timeStoryReadingState({ ...pair, selectedEntryId: 'missing', tab: 'user' });
    assert.equal(ui.selectedEntryId, 'S01'); assert.equal(ui.tab, 'user');
    assert.equal(contract.timeStoryReadingState({ ...pair, reading: true }).reading, true, 'journey closing remains visible');
});

function providerFixture(t) {
    const keys = ['SillyTavern', 'document', 'location', 'localStorage', 'fetch', 'toastr'];
    const before = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const profile = { id: 'time-profile', name: 'Fixture', mode: 'cc', api: 'openai', model: 'time-model', 'secret-id': 'fixture-only' };
    const requests = [], store = new Map(); let response = echo();
    const memory = structuredClone(bank);
    const ctx = { characterId: 0, groupId: null, name1: memory.userName, name2: memory.characterName, chatId: memory.chatId, chat: [],
        characters: [{ name: memory.characterName, avatar: 'time.png', data: { name: memory.characterName, avatar: 'time.png' } }],
        chatMetadata: { [constants.MEMORY_KEY]: memory, [constants.CACHE_KEY]: { chatId: memory.chatId, archiveRevision: memory.archiveRevision } },
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { apiConnectionMode: 'profile', connectionProfileId: profile.id, maxTokens: 12000,
            useCurrentChatExternalMemory: false, useActivatedWorldInfo: false }, connectionManager: { profiles: [profile] } },
        getCurrentChatId() { return this.chatId; }, getCharacterCardFields: () => ({}), getTokenCountAsync: async () => 100,
        saveSettingsDebounced() {}, saveMetadataDebounced() {},
        ConnectionManagerRequestService: { validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, messages, _length, _options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-only'); requests.push(messages); return { content: JSON.stringify(response) };
            } } };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8000/', origin: 'http://127.0.0.1:8000' };
    globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
    globalThis.fetch = async () => { throw new Error('Unexpected network'); };
    globalThis.toastr = { info() {}, error() {}, warning() {}, success() {} };
    const maps = ['activeGenerationTasks', 'runtimeSessionCache', 'activeModeBuildScopes', 'activeArchiveTargetReservations'];
    maps.forEach(key => state[key].clear()); state.busy = false; state.activeMode = null; state.activeArchiveSnapshot = null;
    t.after(() => { maps.forEach(key => state[key].clear());
        for (const [key, value] of before) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]; });
    const origin = contextApi.captureTaskOrigin(ctx, memory.archiveRevision);
    const presentationContext = { profile: { technology: 'modern', worldStyle: 'contemporary' }, contextEnvelope: 'CHARACTER_CARD_JSON:\n{}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n现代\n【上下文结束】' };
    return { ctx, memory, origin, requests, presentationContext, setResponse(value) { response = value; } };
}

test('one accepted request creates a complete episode, and another request appends without changing the old episode', async t => {
    const f = providerFixture(t);
    const first = await stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'time-fixture', { presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 1); assert.equal(first.episodes.length, 1);
    const unchanged = JSON.stringify(first.episodes[0]);
    f.setResponse({ ...echo(), title: '第二声铃响' });
    const second = await stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'time-fixture-next', { previousSession: first, presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 2); assert.equal(second.episodes.length, 2);
    assert.equal(second.episodes[1].id, 'TS02'); assert.equal(JSON.stringify(second.episodes[0]), unchanged); assert.equal(first.episodes.length, 1);
    assert.deepEqual(f.memory, bank); assert.ok(stories.readableTimeStoriesSession(second, bank));
});

test('accepted recovery replays the stable slot after a later save failure without a second provider request', async t => {
    const f = providerFixture(t); let journal = null;
    const attach = async existing => {
        const handle = await recovery.createGenerationRecovery({ origin: f.origin, mode: 'timeEcho', settingsIdentity: 'unchanged', existing,
            continueRequested: !!existing, taskScopes: ['time-recovery'], assertCurrent: () => true,
            save: value => { journal = structuredClone(value); } });
        recovery.attachGenerationRecovery(f.origin, handle);
    };
    t.after(() => recovery.detachGenerationRecovery(f.origin));
    await attach(null);
    const first = await stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'time-recovery', { presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 1); assert.equal(journal.segments.length, 1);
    recovery.detachGenerationRecovery(f.origin); await attach(journal);
    const resumed = await stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'time-recovery', { presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 1); assert.deepEqual(resumed.episodes, first.episodes);
});

test('unknown stored versions and mismatched previous identity stop before a paid request', async t => {
    const f = providerFixture(t);
    const old = sessionFor('timeEcho', echo()); old.version = 99;
    await assert.rejects(stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'bad-version', { previousSession: old, presentationContext: f.presentationContext }), { code: 'RMT_TIME_STORY_VERSION' });
    f.ctx.chatMetadata[constants.CACHE_KEY].timeEcho = old;
    state.runtimeSessionCache.clear();
    await assert.rejects(stories.generateTimeStoryWithRepair('timeEcho', f.ctx, f.memory, f.origin, 'bad-cache', { presentationContext: f.presentationContext }), { code: 'RMT_TIME_STORY_VERSION' });
    assert.equal(f.requests.length, 0);
});

test('the complete journey is accepted in one request and stale live source identity is rejected before requesting', async t => {
    const f = providerFixture(t); f.setResponse(journey());
    const result = await stories.generateTimeStoryWithRepair('timeJourney', f.ctx, f.memory, f.origin, 'journey-fixture', { presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 1); assert.equal(result.episodes[0].encounters.length, 2);
    f.ctx.name1 = '已切换的用户';
    await assert.rejects(stories.generateTimeStoryWithRepair('timeJourney', f.ctx, f.memory, f.origin, 'journey-stale', { presentationContext: f.presentationContext }), { code: 'RMT_TIME_STORY_SOURCE' });
    assert.equal(f.requests.length, 1);
});

test('a detached historical target uses its own names, memory and cache while the live chat stays unchanged', async t => {
    const f = providerFixture(t);
    f.ctx.chatMetadata[constants.CACHE_KEY].timeEcho = { version: 99, title: 'LIVE_CACHE_SENTINEL' };
    const liveBefore = JSON.stringify(f.ctx.chatMetadata);
    const memory = { ...structuredClone(bank), chatId: 'historical-chat', archiveRevision: 'historical-r1', characterName: '沈远', userName: '若竹', archiveName: '旧时庭院' };
    const ctx = { ...f.ctx, name1: memory.userName, name2: memory.characterName, chatId: memory.chatId,
        __rmtArchiveTargetEntryId: 'AE:historical',
        characters: [{ name: memory.characterName, avatar: 'historical.png', data: { name: memory.characterName, avatar: 'historical.png' } }],
        chatMetadata: { [constants.MEMORY_KEY]: memory, [constants.CACHE_KEY]: { chatId: memory.chatId, archiveRevision: memory.archiveRevision } } };
    const origin = contextApi.captureTaskOrigin(ctx, memory.archiveRevision);
    const result = await stories.generateTimeStoryWithRepair('timeEcho', ctx, memory, origin, 'history-fixture', { presentationContext: f.presentationContext });
    assert.equal(f.requests.length, 1); assert.equal(result.chatId, memory.chatId); assert.equal(result.characterName, '沈远');
    assert.equal(JSON.stringify(f.ctx.chatMetadata), liveBefore);
    const sent = JSON.stringify(f.requests);
    assert.match(sent, /沈远/); assert.match(sent, /若竹/); assert.doesNotMatch(sent, /LIVE_CACHE_SENTINEL/);
});

test('prompt gives world-compatible media, pair fiction and flexible length without importing complete old stories', () => {
    const previous = sessionFor('timeEcho', echo()); previous.episodes[0].opening = 'OLD_FULL_PROSE_SENTINEL';
    const prompt = stories.timeStoryPrompt('timeEcho', { name1: bank.userName, name2: bank.characterName }, bank, previous, { technology: 'low', worldStyle: 'historical' });
    assert.match(prompt, /object\|voice/); assert.match(prompt, /不设.*字数/); assert.match(prompt, /同一人/);
    assert.match(prompt, /双方台词、行为及 user 回应均属虚构番外，无需 Mxxx 举证/);
    assert.doesNotMatch(prompt, /OLD_FULL_PROSE_SENTINEL/); assert.match(prompt, /明日的雨声/);
    assert.ok(prompt.length < 5000);
});
