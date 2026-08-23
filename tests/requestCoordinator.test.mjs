import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/heartbeatMemories.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const testingExports = `
export const __r25Testing = {
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
  normalizeHeart,
  normalizeAchievements,
  SEGMENT_REQUEST_CONCURRENCY,
  ADV_BULK_BATCH_SIZE,
};`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\n${testingExports}`).toString('base64')}`;
const { __r25Testing: api } = await import(moduleUrl);

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
        liveStates: { morning: {}, daytime: {}, evening: {}, night: {} },
        apps,
    });
    assert.equal(plan.apps.length, 10);
    assert.equal(plan.apps.reduce((sum, app) => sum + app.entries.length, 0), 33);
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
