import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/heartbeatMemories.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const testingExports = `
export const __r27Testing = {
  reset() {
    activeGenerationTasks.clear();
    activeModeBuildScopes.clear();
    activeAdvBulkScopes.clear();
    activeCgImageTasks.clear();
    providerRequestQueue.splice(0);
    activeProviderRequestCount = 0;
  },
  addBuildScope(key) { activeModeBuildScopes.add(key); },
  addRequest(key, parentTaskKey = '') { activeGenerationTasks.set(key, { parentTaskKey }); },
  logicalKeys() { return [...activeLogicalGenerationKeys()]; },
  acquireProviderRequestPermit,
  providerState() { return { active: activeProviderRequestCount, queued: providerRequestQueue.length }; },
  runGenerationRequestWithTimeout,
  normalizeConnectionManagerError,
  shouldRetrySegmentRequest,
  normalizeEndingConfessionLines,
  normalizeEndingRouteDetail,
  normalizeEndingConfessionReplays,
  normalizeAlbum,
  normalizeEventList,
  mergeAdvIncremental,
  normalizePhonePlan,
  normalizePhoneDraftApp,
  PHONE_DRAFT_CACHE_KEY,
  normalizeHeart,
  normalizeVoiceDramaPart,
  normalizeScenarioDramaPart,
  applyHeartPartialPatch,
  normalizeAchievements,
  SEGMENT_REQUEST_CONCURRENCY,
  ADV_BULK_BATCH_SIZE,
};`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\n${testingExports}`).toString('base64')}`;
const { __r27Testing: api } = await import(moduleUrl);

test.afterEach(() => api.reset());

test('ADV bulk requests are capped at six stories per click', () => {
    assert.equal(api.ADV_BULK_BATCH_SIZE, 6);
});

test('segmented children fold into one parent logical task', () => {
    const parent = 'mode:char|chat:ending';
    api.addBuildScope(parent);
    api.addRequest(`${parent}:outline`, parent);
    api.addRequest(`${parent}:route:END_ROUTE`, parent);
    assert.deepEqual(api.logicalKeys(), [parent]);
    assert.equal(api.SEGMENT_REQUEST_CONCURRENCY, 1);
});

test('provider queue never grants more than two permits and drains in order', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const c = new AbortController();
    const releaseA = await api.acquireProviderRequestPermit(a.signal);
    const releaseB = await api.acquireProviderRequestPermit(b.signal);
    const pendingC = api.acquireProviderRequestPermit(c.signal);
    assert.deepEqual(api.providerState(), { active: 2, queued: 1 });
    releaseA();
    const releaseC = await pendingC;
    assert.deepEqual(api.providerState(), { active: 2, queued: 0 });
    releaseB();
    releaseC();
    assert.deepEqual(api.providerState(), { active: 0, queued: 0 });
});

test('aborting a queued request removes it without consuming a permit', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const queued = new AbortController();
    const releaseA = await api.acquireProviderRequestPermit(a.signal);
    const releaseB = await api.acquireProviderRequestPermit(b.signal);
    const pending = api.acquireProviderRequestPermit(queued.signal);
    queued.abort();
    await assert.rejects(pending, error => error?.name === 'AbortError');
    assert.deepEqual(api.providerState(), { active: 2, queued: 0 });
    releaseA();
    releaseB();
});

test('a hung provider promise becomes a non-retryable local timeout', async () => {
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (handler, _delay, ...args) => realSetTimeout(handler, 5, ...args);
    try {
        const controller = new AbortController();
        await assert.rejects(
            api.runGenerationRequestWithTimeout(() => new Promise(() => {}), controller, 30000, '测试分段'),
            error => error?.code === 'RMT_REQUEST_TIMEOUT' && error?.retryable === false,
        );
        assert.equal(controller.signal.aborted, true);
    } finally {
        globalThis.setTimeout = realSetTimeout;
    }
});

test('an already-aborted request never calls the provider factory', async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await assert.rejects(
        api.runGenerationRequestWithTimeout(() => { called = true; }, controller, 30000, '测试分段'),
        error => error?.name === 'AbortError',
    );
    assert.equal(called, false);
});

test('connection errors are classified without echoing provider secrets', () => {
    const auth = api.normalizeConnectionManagerError(new Error('status 401 secret-key-value'));
    assert.equal(auth.code, 'RMT_CONNECTION_AUTH');
    assert.equal(auth.retryable, false);
    assert.doesNotMatch(auth.message, /secret-key-value/);
    const rate = api.normalizeConnectionManagerError({ status: 429, message: 'quota exceeded' });
    assert.equal(rate.code, 'RMT_CONNECTION_RATE_LIMIT');
    assert.equal(api.shouldRetrySegmentRequest(rate), true);
    const context = api.normalizeConnectionManagerError({ status: 413, message: 'payload too large' });
    assert.equal(context.code, 'RMT_CONNECTION_CONTEXT_LIMIT');
    assert.equal(api.shouldRetrySegmentRequest(context), false);
    assert.equal(api.shouldRetrySegmentRequest({ retryableJson: true }), true);
    assert.equal(api.shouldRetrySegmentRequest({ code: 'RMT_SEGMENT_VALIDATION', retryable: true }), true);
    assert.equal(api.shouldRetrySegmentRequest({ code: 'RMT_CONNECTION_SERVER', retryable: true }), true);
    assert.equal(api.shouldRetrySegmentRequest({ code: 'RMT_REQUEST_TIMEOUT', retryable: false }), false);
});

test('confession avatar pages live in confession replay while routes no longer require them', () => {
    const lines = [
        '我很早以前就已经在意你，只是直到今天才终于敢把它说出口。',
        '那些一起走过的路，对我来说从来都不是可以随便忘掉的小事。',
        '每一次回头看见你，我都会更确定自己真正想留下来的地方。',
        '我不想替你决定未来，也不需要你现在立刻给我任何答案。',
        '我只是想让你知道，我喜欢你，而且会认真珍惜这份喜欢。',
        '如果你愿意，以后的季节也请让我继续站在你的身边。',
    ];
    const legacy = lines.join('');
    assert.equal(api.normalizeEndingConfessionLines(lines, '').length, 6);
    assert.ok(api.normalizeEndingConfessionLines([], legacy).length >= 6);

    const route = { id: 'END_ROUTE', title: '当前路线', available: true };
    const detail = api.normalizeEndingRouteDetail({
        ending: {
            id: 'END_ROUTE',
            endingScene: '终章场景。'.repeat(70),
            creditsLine: '在下一次心跳之前。',
            epilogue: {
                title: '后日谈',
                timeSkip: '数月后',
                scenes: [1, 2, 3].map(index => ({ title: `片段${index}`, text: `这是未来生活片段${index}。`.repeat(18) })),
                finalLine: '以后也一起走吧。',
            },
        },
    }, route);
    assert.deepEqual(detail.confessionLines, []);
    assert.equal(detail.confession, '');

    const memoryBank = {
        memories: [{ id: 'M001', title: '那晚的告白', anchors: ['告白夜'], summary: '已经发生的告白。' }],
    };
    const replays = api.normalizeEndingConfessionReplays([{
        id: 'CONF01',
        type: 'mutual',
        title: '那晚的告白',
        date: '08/20',
        scene: '告白夜里，两个人停下来把之前没有说出口的话讲清楚。'.repeat(12),
        confessionText: legacy,
        confessionLines: lines,
        responseSummary: '当时得到了明确回应。',
        afterEffect: '关系从那以后发生了变化。',
        sourceMemoryIds: ['M001'],
        sourceMemoryAnchor: '告白夜',
    }], memoryBank);
    assert.equal(replays.length, 1);
    assert.equal(replays[0].confessionLines.length, 6);
});

const memoryBank = {
    memories: [
        { id: 'M001', title: '雨夜回家', anchors: ['站台雨伞'], summary: '两个人在雨夜一起回家。' },
        { id: 'M002', title: '海边约定', anchors: ['海边夕阳'], summary: '两个人在海边留下重要约定。' },
    ],
};

test('album and ADV accept a small set of important nodes instead of fixed 15/12', () => {
    const album = api.normalizeAlbum({
        title: '回忆相簿',
        entries: [{
            id: 'CG01',
            title: '雨夜回家',
            date: '08/01',
            desc: '站台雨伞下并肩等车。',
            category: '日常',
            unlocked: true,
            sourceMemoryIds: ['M001'],
            sourceMemoryAnchor: '站台雨伞',
            visualSeed: ['雨伞', '站台', '夜色', '两个人'],
            imagePrompt: 'night station, umbrella, two people, soft light',
            comments: ['你看，那把伞还偏在你那边。', '我那时其实比看起来紧张。', '现在回头看，最清楚的还是站台的雨声。', '这张我一直觉得值得留下。'],
            hintLines: [],
        }],
    }, memoryBank);
    assert.equal(album.entries.length, 1);

    const adv = api.normalizeEventList({
        title: '回想',
        events: [{
            id: 'EV01',
            title: '海边约定',
            date: '08/02',
            cgDesc: '海边夕阳里，两个人停在浪线附近。',
            sourceMemoryIds: ['M002'],
            sourceMemoryAnchor: '海边夕阳',
            visualSeed: ['夕阳', '海面', '浪线', '两个人'],
            imagePrompt: 'sunset beach, two people, sea, warm backlight',
        }],
    }, memoryBank);
    assert.equal(adv.events.length, 1);

    const merged = api.mergeAdvIncremental({
        kind: 'adv',
        title: '旧回想',
        events: [{
            id: 'EV_OLD',
            title: '已失效旧节点',
            date: '07/01',
            cgDesc: '旧档案里曾经存在、但当前档案已经无法验证的事件。',
            sourceMemoryIds: ['M999'],
            sourceMemoryAnchor: '已经消失的锚点',
            visualSeed: ['旧', '节点', '画面', '人物'],
            imagePrompt: 'old scene',
            adv: { paragraphs: Array.from({ length: 18 }, (_, i) => `旧段落${i + 1}。这是足够长的旧 ADV 内容。`) },
        }],
    }, adv, memoryBank);
    assert.equal(merged.events.length, 1);
    assert.deepEqual(merged.events[0].sourceMemoryIds, ['M002']);
});

test('phone plan keeps many apps but accepts roughly thirty entries', () => {
    const specs = [
        ['MOMENTS', 'moments', 3],
        ['CHAT', 'chat', 3],
        ['GALLERY', 'gallery', 4],
        ['NOTES', 'notes', 5],
        ['SCHEDULE', 'schedule', 4],
        ['STORE', 'store', 4],
        ['BROWSER', 'browser', 3],
        ['CONTACTS', 'contacts', 3],
        ['LOCATION', 'location', 2],
        ['MISC', 'misc', 2],
    ];
    const apps = specs.map(([id, kind, count]) => ({
        id,
        label: id,
        kind,
        summary: `${kind} summary`,
        entries: Array.from({ length: count }, (_, index) => ({ id: `${id}${index + 1}`, title: `${kind}-${index + 1}`, meta: 'meta' })),
    }));
    const plan = api.normalizePhonePlan({
        deviceName: '私人手机',
        deviceKind: 'phone',
        lockText: 'LOCK',
        liveStates: { morning: { lockText: '早', statusLine: '醒了', badgeCounts: { CHAT: 2, EVIL: 999 }, unknown: '<script>' }, daytime: {}, evening: {}, night: {} },
        apps,
    });
    assert.equal(plan.apps.length, 10);
    assert.equal(plan.apps.reduce((sum, app) => sum + app.entries.length, 0), 33);
    assert.deepEqual({ ...plan.liveStates.morning.badgeCounts }, { CHAT: 2 });
    assert.equal('unknown' in plan.liveStates.morning, false);
});

test('HEART can persist dialogue-only state before seasons and strips exist', () => {
    const heart = api.normalizeHeart({
        title: '角色互动',
        relationshipState: '关系发展中',
        relationshipSummary: '雨夜回家之后，两个人的距离更近了。',
        relationshipSourceMemoryIds: ['M001'],
        relationshipSourceMemoryAnchor: '站台雨伞',
        birthdayMmDd: '',
        userBirthdayMmDd: '',
        specialDays: [],
        greetings: {
            morning: ['早。', '醒了吗？'],
            noon: ['中午了。', '记得吃东西。'],
            evening: ['今天回来得不算晚。', '外面天已经暗了。'],
            night: ['还没睡？', '别熬太久。'],
            weekend: ['今天不用赶时间。', '慢一点也没关系。'],
            birthday: ['今天就陪我一会儿。'],
            userBirthday: ['生日快乐。'],
            holiday: ['今天也算个特别日子。'],
            absenceWorry: ['最近没见到你。'],
            absenceSulky: ['你是不是把这里忘了。'],
            absenceJealous: [],
        },
        voiceDramas: [],
        scenarioDramas: [],
        dailyStrips: [],
        generationParts: { dialogues: true, seasons: false, strips: false },
        view: 'greetings',
    }, memoryBank);
    assert.equal(heart.voiceDramas.length, 0);
    assert.equal(heart.scenarioDramas.length, 0);
    assert.equal(heart.dailyStrips.length, 0);
    assert.equal(heart.generationParts.dialogues, true);
});

test('achievement library separates evidence-backed unlocks from future locked goals', () => {
    const achievements = api.normalizeAchievements({
        title: '成就库',
        entries: [
            {
                id: 'ACH01',
                title: '同一把伞',
                description: '第一次把这段雨夜真正留进共同记忆。',
                category: '日常',
                tier: 'bronze',
                unlocked: true,
                unlockedAt: '08/01',
                sourceMemoryIds: ['M001'],
                sourceMemoryAnchor: '站台雨伞',
                hint: '',
            },
            {
                id: 'ACH02',
                title: '下一次远行',
                description: '一起完成一次新的长途旅行。',
                category: '特别',
                tier: 'silver',
                unlocked: false,
                unlockedAt: '',
                sourceMemoryIds: [],
                sourceMemoryAnchor: '',
                hint: '继续积累新的共同经历。',
            },
        ],
    }, memoryBank);
    assert.equal(achievements.entries.length, 2);
    assert.equal(achievements.entries.filter(item => item.unlocked).length, 1);
    assert.equal(achievements.entries.filter(item => !item.unlocked).length, 1);
    assert.deepEqual(achievements.entries[1].sourceMemoryIds, []);
});


test('settings copy is trimmed and HEART speakers render real names instead of generic labels', () => {
    assert.doesNotMatch(source, /模型刷新只调用 SillyTavern 本地后端状态接口/);
    assert.doesNotMatch(source, /专用连接：.*心跳回忆固定使用这个连接/);
    assert.doesNotMatch(source, /剧本中的你/);
    assert.doesNotMatch(source, /<strong>角色<\/strong>/);
    assert.match(source, /data-rmt-action="heart-generate-season"/);
    assert.match(source, /activeArchiveSnapshot\?\.memory\?\.userName \|\| getContext\(\)\.name1/);
    assert.doesNotMatch(source, /const taskKey = `heart-section:\$\{scope\}`;/);
    assert.match(source, /const taskKey = `heart-season:\$\{scope\}:\$\{normalizedSeason\}`;/);
});

test('one season of Drama can be normalized and kept without generating the other seasons', () => {
    const longVoice = '春天的风从窗边吹进来，我会想到那天我们一起走过的路。'.repeat(5);
    const longScenario = '普通的春日里，我们一起处理了一件很小但很具体的生活琐事。'.repeat(6);
    const baseGreetings = {
        morning: ['早。', '醒了吗？'], noon: ['中午了。', '记得吃东西。'], evening: ['回来了。', '天已经暗了。'], night: ['还没睡？', '别熬太久。'], weekend: ['今天慢一点。', '不用赶时间。'],
        birthday: ['今天陪我。'], userBirthday: ['生日快乐。'], holiday: ['今天也算特别。'], absenceWorry: ['最近没见到你。'], absenceSulky: ['你是不是忘了这里。'], absenceJealous: [],
    };
    const heart = api.normalizeHeart({
        title: '角色互动', relationshipState: '关系发展中', relationshipSummary: '雨夜回家之后，两个人的距离更近了。',
        relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '站台雨伞', birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [], greetings: baseGreetings,
        voiceDramas: [{ id: 'VOICE_SPRING', kind: 'spring', title: '春 Voice Drama', subtitle: '春日', setting: '春日模拟', script: Array.from({ length: 5 }, (_, i) => ({ speaker: i % 3 === 0 ? 'narrator' : 'char', text: longVoice })) }],
        scenarioDramas: [{ id: 'SCENE_SPRING', season: 'spring', title: '春 Scenario Drama', subtitle: '小事', setting: '春日模拟', script: Array.from({ length: 6 }, (_, i) => ({ speaker: i % 4 === 0 ? 'user' : 'char', text: longScenario })) }],
        dailyStrips: [], generationParts: { dialogues: true, seasons: true, strips: false }, selectedSeason: 'spring', view: 'seasons',
    }, memoryBank);
    assert.deepEqual(heart.voiceDramas.map(item => item.kind), ['spring']);
    assert.deepEqual(heart.scenarioDramas.map(item => item.season), ['spring']);
    assert.equal(heart.selectedSeason, 'spring');
});


test('different HEART seasons reserve independent logical task keys while provider concurrency stays capped at two', () => {
    const scope = 'char|chat';
    api.addBuildScope(`heart-season:${scope}:spring`);
    api.addBuildScope(`heart-season:${scope}:summer`);
    assert.deepEqual(new Set(api.logicalKeys()), new Set([`heart-season:${scope}:spring`, `heart-season:${scope}:summer`]));
    assert.match(source, /MAX_CONCURRENT_PROVIDER_REQUESTS = 2/);
});

test('season Voice and Scenario are independently valid at the lighter reliability thresholds', () => {
    const voiceText = '春风从门口吹进来，我看见你时忽然觉得今天比平常更轻一点。'.repeat(5);
    const scenarioText = '我们只是去买了一点日用品，中途因为一件小事停下来笑了很久。'.repeat(6);
    const voice = api.normalizeVoiceDramaPart({ voiceDramas: [{
        id: 'VOICE_SPRING', kind: 'spring', title: '春 Voice', subtitle: '春日', setting: '春日模拟',
        script: Array.from({ length: 5 }, (_, i) => ({ speaker: i % 2 ? 'char' : 'narrator', text: voiceText })),
    }] }, ['spring']);
    const scenario = api.normalizeScenarioDramaPart({ scenarioDramas: [{
        id: 'SCENE_SPRING', season: 'spring', title: '春 Scenario', subtitle: '小事', setting: '春日模拟',
        script: Array.from({ length: 6 }, (_, i) => ({ speaker: i % 3 ? 'char' : 'user', text: scenarioText })),
    }] }, 'spring');
    assert.equal(voice.length, 1);
    assert.equal(scenario.length, 1);
});

test('independent HEART season patches merge without overwriting sibling seasons', () => {
    const baseGreetings = {
        morning: ['早。', '醒了吗？'], noon: ['中午了。', '记得吃东西。'], evening: ['回来了。', '天暗了。'], night: ['还没睡？', '早点休息。'], weekend: ['今天慢一点。', '不用赶时间。'],
        birthday: ['今天陪我。'], userBirthday: ['生日快乐。'], holiday: ['今天也算特别。'], absenceWorry: ['最近没见到你。'], absenceSulky: ['你是不是忘了这里。'], absenceJealous: [],
    };
    const base = api.normalizeHeart({
        title: '角色互动', relationshipState: '关系发展中', relationshipSummary: '雨夜回家之后，两个人的距离更近了。',
        relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '站台雨伞', birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [], greetings: baseGreetings,
        voiceDramas: [], scenarioDramas: [], dailyStrips: [], generationParts: { dialogues: true, seasons: false, strips: false }, view: 'seasons',
    }, memoryBank);
    const springVoice = api.normalizeVoiceDramaPart({ voiceDramas: [{ id: 'VS', kind: 'spring', title: '春', subtitle: '', setting: '', script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: '春天里我还是会很自然地想到你和那段一起走过的路。'.repeat(6) })) }] }, ['spring'])[0];
    const summerVoice = api.normalizeVoiceDramaPart({ voiceDramas: [{ id: 'VU', kind: 'summer', title: '夏', subtitle: '', setting: '', script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: '夏天很热，但一起走回去的时候我反而觉得那段路没有那么长。'.repeat(6) })) }] }, ['summer'])[0];
    let merged = api.applyHeartPartialPatch(base, { type: 'season', season: 'spring', voice: springVoice });
    merged = api.applyHeartPartialPatch(merged, { type: 'season', season: 'summer', voice: summerVoice });
    assert.deepEqual(new Set(merged.voiceDramas.map(item => item.kind)), new Set(['spring', 'summer']));
});

test('phone continuation draft keeps only bounded normalized App fields', () => {
    assert.equal(api.PHONE_DRAFT_CACHE_KEY, 'phoneGenerationDraftV1');
    const planApp = {
        id: 'CHAT', label: '通讯', kind: 'chat', summary: '联系人',
        entries: [{ id: 'C1', title: '甲', meta: '' }, { id: 'C2', title: '乙', meta: '' }, { id: 'C3', title: '丙', meta: '' }],
    };
    const messages = Array.from({ length: 12 }, (_, i) => ({ speaker: i % 2 ? '角色' : '朋友', time: '21:00', text: `消息${i + 1}` }));
    const raw = { app: {
        id: 'CHAT', label: '模型乱改的标签', kind: 'chat', summary: '通讯摘要', unknownHtml: '<script>alert(1)</script>',
        entries: planApp.entries.map((entry, index) => ({
            ...entry, preview: `预览${index}`, detail: `详情${index}`, messages: index < 2 ? messages : [], fields: [], imageCaption: '', basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '', unknown: { nested: true },
        })),
    } };
    const normalized = api.normalizePhoneDraftApp(raw, planApp, memoryBank, 'phone');
    assert.equal(normalized.id, 'CHAT');
    assert.equal(normalized.label, '通讯');
    assert.equal(normalized.entries.length, 3);
    assert.equal('unknownHtml' in normalized, false);
    assert.equal('unknown' in normalized.entries[0], false);
    assert.equal(normalized.entries[0].messages.length, 12);
});
