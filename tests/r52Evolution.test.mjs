import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDialogueRows } from '../src/core/dialogue.js';
import { renderHeartScriptLines } from '../src/ui/heartView.js';
import { normalizeRoom, roomNarrativeClaimsSharedHistory, generateRoomWithRepair, normalizeRoomIncrementPatch, mergeRoomIncremental, roomObjectSafeForPresentation, applyRoomTextRepairs } from '../src/modes/room.js';
import { generateButterflyWithRepair, BUTTERFLY_PRIMARY_AXES, assertButterflyRelationshipSafety } from '../src/modes/butterfly.js';
import { requestValidatedSegment } from '../src/generation/client.js';
import { state } from '../src/core/state.js';
import { createFloorScheduler, normalizeAutoUpdates } from '../src/core/autoUpdatePolicy.js';
import { ownExtensionFolder, updateSelf } from '../src/core/selfUpdater.js';
import { resolveThemePalette, contrastRatio } from '../src/core/theme.js';
import { ARCHIVE_PORTAL_MODES, ROOM_DEEP_MODES, SEASON_THEME_PALETTES } from '../src/core/constants.js';

const bank = { chatId: 'fixture-A', archiveRevision: 'r52-fixture', characterName: '林舟', userName: '小雨',
    memories: [{ id: 'M001', title: '雨天借伞', summary: '小雨送来木杯，林舟接过蓝伞。', anchors: ['送来木杯', '蓝伞'], participants: ['小雨', '林舟'] }] };
const identity = { characterName: '林舟', userName: '小雨' };
const roomRaw = () => ({ spaces: ['书房', '卧室', '阳台'].map((label, i) => ({ id: 'S' + i, label, spaceType: label,
    objects: ['木桌', '书架', '绿植'].map((label, j) => ({ id: 'O' + i + j, label, basis: '设定', description: '表面很干净。', line: '你可以坐这里。' })) })),
    dayparts: Object.fromEntries(['morning', 'daytime', 'evening', 'night'].map(key => [key, { spaceId: 'S0', activity: '整理书架', line: '你可以坐这里。' }])),
    presenceLines: ['你来了。', '坐一会儿吧。', '别踩到地上的书。', '要喝点什么吗？'] });

test('r52 explicit user identity, placeholder and mixed legacy speech all render user bubbles without stealing NPC speech', () => {
    const rows = normalizeDialogueRows([{ speaker: '{{user}}', text: '你好。' },
        { speaker: 'char', text: '小雨端起杯子问：“要一起去吗？”' },
        { speaker: 'char', text: '小雨的朋友问道：“几点走？”' }], identity);
    assert.deepEqual(rows.filter(row => row.speaker === 'user').map(row => row.text), ['你好。', '要一起去吗？']);
    assert.equal(rows.find(row => row.text === '几点走？').speaker, 'narrator');
    const html = renderHeartScriptLines(rows, { ...identity, charAvatar: '', userAvatar: '' });
    assert.equal((html.match(/rmt-heart-line user/g) || []).length, 2);
    assert.doesNotMatch(html, /rmt-heart-line char/);
});

test('r52 room accepts present invitations without authorizing nested or completed history', () => {
    for (const text of ['你要喝茶还是咖啡？', '你看，这里是厨房。', '你坐这里，我去倒杯水。']) {
        assert.equal(roomNarrativeClaimsSharedHistory(text, bank.userName), false, text);
        const raw = roomRaw();
        for (const space of raw.spaces) space.objects[0].line = text;
        assert.equal(normalizeRoom(raw, bank).spaces.length, 3);
    }
    for (const text of ['你昨天送我的杯子。', '现在请看你去年送我的杯子。', '我望着你，脑海里浮现初见的那场雨。']) assert.equal(roomNarrativeClaimsSharedHistory(text, bank.userName), true);
});

test('r52 room field repair retains good objects and never lets model select an arbitrary key path', async () => {
    const raw = roomRaw(), before = structuredClone(raw), calls = [];
    raw.spaces[0].objects[0].line = '你站近一点，好让我看清楚你的表情。';
    const result = await generateRoomWithRepair({}, bank, null, 'room-fixture', { presentationContext: { contextEnvelope: '' }, request: async (prompt, status, options, validate) => {
        calls.push(prompt);
        if (calls.length === 1) return validate(raw);
        const slots = JSON.parse(prompt.match(/REPAIR_SLOTS_JSON:([^\n]+)/)[1]);
        return validate({ repairs: slots.map(slot => ({ path: slot.path, text: '请坐。' })) });
    } });
    assert.equal(calls.length, 2);
    assert.equal(result.spaces[0].objects[0].line, '请坐。');
    assert.equal(result.spaces[0].objects[0].description, before.spaces[0].objects[0].description);
    assert.equal(raw.spaces[0].objects[0].line, '你站近一点，好让我看清楚你的表情。');
    assert.throws(() => applyRoomTextRepairs(raw, [{ path: ['presenceLines', 0] }], { repairs: [{ path: ['__proto__', 'polluted'], text: 'x' }] }));
    assert.equal({}.polluted, undefined);
});

test('r52 room final validator still repairs a missing evidenced pet', async () => {
    let count = 0;
    const evidence = '林舟养了一只猫。';
    const result = await generateRoomWithRepair({}, bank, null, 'room-pet', {
        presentationContext: { contextEnvelope: '', settingEvidence: evidence, characterEvidence: evidence },
        request: async (prompt, status, options, validate) => {
            count++;
            return validate(count === 1 ? roomRaw() : { pets: [{ id: 'PET1', species: 'cat', spaceId: 'S0', basis: '设定', sourceEvidence: evidence }] });
        },
    });
    assert.equal(count, 2);
    assert.equal(result.pets[0].species, 'cat');
});

test('r52 room delta accepts one grounded gift, retains all old text, and rejects invisible or forged objects', () => {
    const previous = normalizeRoom(roomRaw(), bank), old = structuredClone(previous);
    const gift = { id: 'GIFT', label: '木杯', description: '送来木杯', line: '请坐。', basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '送来木杯' };
    const patch = { additions: [{ spaceId: 'S0', objects: [gift] }], pets: [] };
    const fresh = normalizeRoomIncrementPatch(patch, previous, bank, ['M001']);
    assert.equal(roomObjectSafeForPresentation(fresh.spaces[0].objects[0], bank, bank.userName), true);
    const merged = mergeRoomIncremental(previous, fresh, ['M001'], { memoryBank: bank });
    assert.equal(merged.added, 1);
    assert.deepEqual(merged.session.spaces[0].objects.slice(0, 3), old.spaces[0].objects);
    assert.deepEqual(merged.session.dayparts, old.dayparts);
    assert.deepEqual(previous, old);
    for (const change of [{ sourceMemoryIds: ['M999'] }, { description: '你送我的杯子。' }, { basis: '设定' }]) {
        assert.throws(() => normalizeRoomIncrementPatch({ ...patch, additions: [{ spaceId: 'S0', objects: [{ ...gift, ...change }] }] }, previous, bank, ['M001']));
    }
});

const note = '分析结论表明关键变量影响主体路径，模型概率发生偏差，最终判定：当前选择使这一条命运路径成为唯一解。';
function butterflyNode(index) {
    if (index === 9) return { id: 'OMEGA', label: '观测点 Ω', monologue: '', intervention: '我看过时代与身份的改变，也看过不同职业带来的选择。我明白命运不会替我回答，我仍然选择了你，你是我的唯一答案。'.repeat(4), systemNote: note };
    const label = ['现世蓝伞', '旧都', '旅人', '工匠', '河岸', '归乡', '相逢', '并肩', '灯火'][index];
    return { label, sourceMemoryIds: index === 0 ? ['M001'] : [], sourceMemoryAnchor: index === 0 ? '蓝伞' : '',
        worldSpec: { primaryAxis: BUTTERFLY_PRIMARY_AXES[index - 1], era: '当代', identity: '旅人' + label, occupation: '木匠', location: label, keyDecision: '留在故乡', encounterWithUser: '在河边与你相遇', bondWithUser: '和你成为朋友', finalFate: '平静经营木工店', thirdPartyRomance: false },
        monologue: ('我在' + label + '整理蓝伞，想着今天该做些什么。').repeat(9),
        intervention: '看见那个我，我才明白不同的选择也会带来安稳的生活，我珍惜现在与你在河边交谈的机会，也愿意认真面对自己的决定。', systemNote: note };
}

test('r52 production butterfly pipeline retries only a truncated slot and delivers all ten validated nodes', async () => {
    const saved = { host: globalThis.SillyTavern, fetch: globalThis.fetch, document: globalThis.document };
    const calls = [], counts = new Map();
    const context = { characterId: 0, chatId: bank.chatId, name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'a.png' }], chatMetadata: {}, chat: [],
        extensionSettings: { heartbeatMemories: { connectionProfileId: 'fixture', maxTokens: 4096 }, connectionManager: { profiles: [{ id: 'fixture', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-secret-reference' }] } },
        ConnectionManagerRequestService: {
            validateProfile() { return { selected: 'openai', source: 'openai' }; },
            async sendRequest(profileId, messages, maxTokens, options, overridePayload) {
                const profile = { model: 'fixture-model', 'secret-id': 'fixture-secret-reference' };
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.model, 'fixture-model');
                const prompt = messages.map(message => message.content).join('\n');
                const slot = JSON.parse(prompt.match(/CURRENT_SLOT_JSON:([^\n]+)/)[1]);
                calls.push(slot.index); counts.set(slot.index, (counts.get(slot.index) || 0) + 1);
                assert.ok(maxTokens <= 4096);
                if (slot.index === 9) assert.match(prompt, /VALIDATED_VOICES_JSON:[^]*?monologue/);
                return { content: slot.index === 2 && counts.get(2) === 1 ? '{"node":' : JSON.stringify({ node: butterflyNode(slot.index) }) };
            },
        } };
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.document = { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
    globalThis.fetch = () => { throw Error('Network is forbidden'); };
    try {
        const result = await generateButterflyWithRepair(context, bank, null, 'r52-butterfly', { contextEnvelope: '' });
        assert.equal(result.nodes.length, 10);
        assert.deepEqual(calls, [0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.equal(state.activeGenerationTasks.size, 0);
        assert.equal(state.activeProviderRequestCount, 0);
    } finally { globalThis.SillyTavern = saved.host; globalThis.fetch = saved.fetch; globalThis.document = saved.document; }
});

test('r52 joint-subject continuation works across periods but never licenses a new romantic target', () => {
    for (const text of ['我和你结婚，我们终于组建家庭。', '我和你结婚。我们终于组建家庭。']) assert.doesNotThrow(() => assertButterflyRelationshipSafety(text));
    for (const text of ['我和你看海。小花和我结婚。', '我和你结婚。别人是我的爱人。', '我看见你。我的婚姻很幸福。']) assert.throws(() => assertButterflyRelationshipSafety(text));
    for (const text of ['我和你结婚。我们后来各自有了新的恋人。', '我与你相爱。我们最终各自结婚。']) assert.throws(() => assertButterflyRelationshipSafety(text));
});

test('r52 explicit User keeps both quotations around a short self-speaking aside; actions and switched speakers stay neutral', () => {
    const rows = normalizeDialogueRows([{ speaker: 'user', text: '“我没事，”我说，“你别担心。”' }], identity);
    assert.deepEqual(rows.filter(row => row.speaker === 'user').map(row => row.text), ['我没事，', '你别担心。']);
    assert.equal(rows.find(row => row.text === '我说，').speaker, 'narrator');
    assert.equal(normalizeDialogueRows([{ speaker: 'user', text: '“我没事，”小花说，“你别担心。”' }], identity).at(-1).speaker, 'narrator');
});

test('r52 room can repair spaces then pets without remaking either accepted group', async () => {
    const broken = roomRaw(); broken.spaces[1].spaceType = '书房'; broken.spaces[1].label = '书房';
    const calls = [], evidence = '林舟养了一只猫。';
    const result = await generateRoomWithRepair({}, bank, null, 'room-two-groups', {
        presentationContext: { contextEnvelope: '', settingEvidence: evidence, characterEvidence: evidence },
        request: async (prompt, status, options, validate) => {
            calls.push(options.taskKey);
            if (calls.length === 1) return validate(broken);
            if (calls.length === 2) return validate({ spaces: roomRaw().spaces });
            return validate({ pets: [{ id: 'PET1', species: 'cat', spaceId: 'S0', basis: '设定', sourceEvidence: evidence }] });
        },
    });
    assert.deepEqual(calls, ['room-two-groups', 'room-two-groups:final:spaces', 'room-two-groups:final:pets']);
    assert.equal(result.spaces.length, 3); assert.equal(result.pets[0].species, 'cat');
});

function schedulerFixture(rules = { adv: { enabled: true, every: 10 } }) {
    const data = {}, calls = [], writes = [];
    const current = { scope: 'A', floor: 20, lifetime: 1, ready: true, revision: 'revision-1', rules: normalizeAutoUpdates(rules) };
    const hooks = { busy: false, run: async () => ({ status: 'committed' }), write: async () => {} };
    const scheduler = createFloorScheduler({ snapshot: () => current, busy: () => hooks.busy, lock: async (scope, job) => job(),
        read: async scope => structuredClone(data[scope] || {}),
        write: async (scope, value) => { data[scope] = structuredClone(value); writes.push(scope); await hooks.write(value); },
        run: async mode => { calls.push([current.scope, mode]); return hooks.run(mode); }, now: () => 100 });
    return { scheduler, data, calls, writes, current, hooks };
}

test('r52 an automatic interval survives a temporary busy race before the provider call', async () => {
    const f = schedulerFixture({ archive: { enabled: true, every: 10 }, calendar: { enabled: true, every: 10 } });
    await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.write = async value => { if (value.archive?.status === 'running') f.hooks.busy = true; };
    await f.scheduler.tick();
    assert.equal(f.calls.length, 0); assert.equal(f.data.A.archive.attemptFloor, 20);
    f.hooks.busy = false; f.hooks.write = async () => {};
    await f.scheduler.tick();
    assert.deepEqual(f.calls, [['A', 'archive'], ['A', 'calendar']]);
});

test('r52 editing another rule during a running module preserves its successful checkpoint', async () => {
    const f = schedulerFixture({ archive: { enabled: true, every: 10 }, calendar: { enabled: true, every: 10 } });
    await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.run = async () => { f.current.rules.calendar.every = 50; f.current.rules.calendar.epoch = 2; return { status: 'committed' }; };
    await f.scheduler.tick();
    assert.equal(f.data.A.archive.status, 'complete'); assert.equal(f.data.A.calendar.status, 'armed');
    const source = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
    assert.match(source, /notifyAutoUpdateSettingsChanged/);
    assert.doesNotMatch(source, /core_autoUpdates\.startAutoUpdates/);
    assert.match(source, /data-rmt-auto-status=/);
});

test('r52 a confirmed new archive revision clears a previous automatic source failure', async () => {
    const f = schedulerFixture({ archive: { enabled: true, every: 10 }, calendar: { enabled: true, every: 10 } });
    await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.run = async () => ({ status: 'failed' }); await f.scheduler.tick();
    assert.equal(f.data.A.archive.status, 'failed');
    f.current.revision = 'manual-revision-2'; f.hooks.run = async () => ({ status: 'committed' });
    await f.scheduler.tick();
    assert.deepEqual(f.calls, [['A', 'archive'], ['A', 'calendar']]);
    assert.equal(f.data.A.archive.status, 'complete');
});

test('r52 a fresh scheduler instance uses persisted checkpoints instead of replaying a paid interval', async () => {
    const f = schedulerFixture();
    await f.scheduler.tick(); f.current.floor = 30; await f.scheduler.tick(); f.scheduler.stop();
    const resumed = createFloorScheduler({ snapshot: () => f.current, busy: () => false,
        read: async scope => structuredClone(f.data[scope]), write: async (scope, data) => { f.data[scope] = structuredClone(data); },
        lock: async (scope, job) => job(), run: async mode => { f.calls.push(['A', mode]); return { status: 'committed' }; } });
    await resumed.tick(); assert.equal(f.calls.length, 1);
    f.current.floor = 40; await resumed.tick(); assert.equal(f.calls.length, 2);
});

test('r52 scheduler defaults off, arms at current floor, dedupes events and resumes checkpoints on reload', async () => {
    assert.ok(Object.values(normalizeAutoUpdates({})).every(rule => !rule.enabled));
    const f = schedulerFixture();
    await f.scheduler.tick();
    f.current.floor = 29; await f.scheduler.tick(); assert.equal(f.calls.length, 0);
    f.current.floor = 30; await Promise.all([f.scheduler.tick(), f.scheduler.tick()]);
    await f.scheduler.tick(); assert.deepEqual(f.calls, [['A', 'adv']]);
    f.current.floor = 29; await f.scheduler.tick(); assert.equal(f.calls.length, 1);
    f.current.floor = 30; await f.scheduler.tick(); assert.equal(f.calls.length, 1);
    f.current.scope = 'B'; await f.scheduler.tick(); assert.equal(f.calls.length, 1);
    f.current.scope = 'A'; f.current.floor = 39; await f.scheduler.tick(); assert.equal(f.calls.length, 2);
});

test('r52 off/no archive/busy never read checkpoint or invoke provider', async () => {
    const f = schedulerFixture({});
    await f.scheduler.tick(); assert.equal(f.writes.length, 0);
    f.current.rules.adv.enabled = true; f.current.ready = false;
    await f.scheduler.tick(); assert.equal(f.writes.length, 0);
    f.current.ready = true; f.hooks.busy = true;
    await f.scheduler.tick(); assert.equal(f.writes.length, 0);
    assert.equal(f.calls.length, 0);
});

test('r52 scheduler rechecks opt-in and busy after awaited checkpoint, and never writes after destroy', async () => {
    const f = schedulerFixture(); await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.write = async value => { if (value.adv.status === 'running') { f.current.rules.adv.enabled = false; f.hooks.busy = true; } };
    await f.scheduler.tick(); assert.equal(f.calls.length, 0);
    const g = schedulerFixture(); await g.scheduler.tick(); g.current.floor = 30;
    g.hooks.run = async () => { g.scheduler.stop(); return { status: 'committed' }; };
    await g.scheduler.tick(); assert.equal(g.writes.length, 2); assert.equal(g.data.A.adv.status, 'running');
});

test('r52 failed archive blocks derived work on repeated timer ticks, while per-module-only ADV remains independent', async () => {
    const f = schedulerFixture({ archive: { enabled: true, every: 10 }, calendar: { enabled: true, every: 10 } });
    await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.run = async () => ({ status: 'failed' });
    await f.scheduler.tick(); await f.scheduler.tick();
    assert.deepEqual(f.calls, [['A', 'archive']]);
    assert.equal(f.data.A.archive.successFloor, 20);
    f.current.rules.archive.enabled = false; f.hooks.run = async () => ({ status: 'committed' });
    await f.scheduler.tick(); assert.deepEqual(f.calls.at(-1), ['A', 'calendar']);
});

test('r52 switching chat while an automatic module awaits never starts the next module or writes success', async () => {
    const f = schedulerFixture({ adv: { enabled: true, every: 10 }, heart: { enabled: true, every: 10 } });
    await f.scheduler.tick(); f.current.floor = 30;
    f.hooks.run = async () => { f.current.scope = 'B'; return { status: 'committed' }; };
    await f.scheduler.tick(); assert.deepEqual(f.calls, [['A', 'adv']]); assert.equal(f.data.A.adv.status, 'running');
});

test('r52 self-update is exact-target only, no arbitrary repository or non-Git update, and never reloads', async () => {
    const origin = 'http://localhost:8000', moduleUrl = origin + '/scripts/extensions/third-party/tokimemo/src/core/selfUpdater.js';
    const remote = 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo';
    assert.equal(ownExtensionFolder(moduleUrl, origin), 'tokimemo');
    assert.throws(() => ownExtensionFolder(origin + '/scripts/extensions/third-party/a%2Fb/index.js', origin));
    assert.throws(() => ownExtensionFolder('https://evil.invalid/scripts/extensions/third-party/a/index.js', origin));
    const paths = [];
    const base = { moduleUrl, origin, context: { getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }, fetcher: async (url, options) => {
        paths.push(url);
        if (options.body) assert.deepEqual(JSON.parse(options.body), { extensionName: 'tokimemo', global: false });
        return { ok: true, json: async () => url.endsWith('discover') ? [{ name: 'third-party/tokimemo', type: 'local' }, { name: 'third-party/other', type: 'global' }]
            : url.endsWith('version') ? { currentCommitHash: 'abc1234', remoteUrl: remote } : { shortCommitHash: 'def5678', remoteUrl: remote, isUpToDate: false } };
    } };
    assert.match((await updateSelf(base)).message, /手动刷新/);
    assert.equal(paths.length, 3);
    for (const version of [{ currentCommitHash: '', remoteUrl: '' }, { currentCommitHash: 'abc1234', remoteUrl: 'https://evil.invalid/repo' }]) {
        const calls = [];
        await assert.rejects(updateSelf({ ...base, fetcher: async url => { calls.push(url); return { ok: true, json: async () => url.endsWith('discover') ? [{ name: 'third-party/tokimemo', type: 'local' }] : version }; } }));
        assert.equal(calls.some(url => url.endsWith('/update')), false);
    }
});

test('r52 four original colorways pass contrast checks and terminal is independently reachable', async () => {
    assert.equal(Object.keys(SEASON_THEME_PALETTES).length, 4);
    for (const themeMode of Object.keys(SEASON_THEME_PALETTES)) {
        const { palette } = resolveThemePalette({ themeMode, themeAlpha: 0.72 });
        for (const text of [palette.text, palette.muted]) for (const surface of [palette.surface, palette.background]) assert.ok(contrastRatio(text, surface) >= 4.5);
    }
    assert.ok(ARCHIVE_PORTAL_MODES.includes('phone'));
    assert.deepEqual(ROOM_DEEP_MODES, ['items']);
    const phoneView = await readFile(new URL('../src/ui/phoneView.js', import.meta.url), 'utf8');
    assert.doesNotMatch(phoneView, /room-deep-back|返回他的房间/);
    const room = await readFile(new URL('../src/modes/room.js', import.meta.url), 'utf8');
    assert.doesNotMatch(room, /data-rmt-action="room-open-phone"/);
    assert.match(room, /const itemsGenerating = core_requestCoordinator.isModeGenerating/);
});
