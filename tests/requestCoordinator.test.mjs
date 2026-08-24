import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/heartbeatMemories.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const testingExports = `
export const __r30Testing = {
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
  shouldDeferCachePersistForProviderTraffic,
  shouldWriteUncompressedCacheImmediately,
  CACHE_PERSIST_IDLE_RETRY_MS,
  runGenerationRequestWithTimeout,
  normalizeConnectionManagerError,
  shouldRetrySegmentRequest,
  normalizeEndingConfessionLines,
  normalizeEndingRouteDetail,
  normalizeEndingConfessionReplays,
  normalizeEndingIncrementOutline,
  normalizeAlbumIndex,
  normalizeAlbum,
  mergeAlbumIncremental,
  normalizeEventList,
  mergeAdvIncremental,
  normalizePhonePlan,
  normalizePhoneIncrementPlan,
  normalizePhoneDraftApp,
  mergePhoneIncremental,
  normalizePhone,
  PHONE_DRAFT_CACHE_KEY,
  normalizeHeart,
  normalizeHeartCoreIncrement,
  normalizeVoiceDramaPart,
  normalizeScenarioDramaPart,
  applyHeartPartialPatch,
  incrementalArchiveMemoryIds,
  incrementalArchiveSlice,
  stampIncrementalCoverage,
  migrateDerivedCacheRevision,
  mergeEndingConfessions,
  mergeButterflyIncremental,
  mergeRoomIncremental,
  normalizeItems,
  countItemNodes,
  mergeItemsIncremental,
  mergeAchievementsIncremental,
  normalizeAchievements,
  SEGMENT_REQUEST_CONCURRENCY,
  ADV_BULK_BATCH_SIZE,
  getPluginSettings,
  jsonOutputBudgetSummary,
  extractJson,
  MAX_GENERATION_OUTPUT_TOKENS,
  MAX_GENERATION_OUTPUT_CHARS,
};`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\n${testingExports}`).toString('base64')}`;
const { __r30Testing: api } = await import(moduleUrl);

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

test('legacy r28/r29 caches migrate with the old archive as their exact incremental baseline', () => {
    const oldBank = {
        archiveRevision: 'rev-old',
        memories: [
            { id: 'M001', title: '旧一', anchors: ['旧一'], summary: '旧记忆一。' },
            { id: 'M002', title: '旧二', anchors: ['旧二'], summary: '旧记忆二。' },
        ],
    };
    const newBank = {
        archiveRevision: 'rev-new',
        memories: [...oldBank.memories, { id: 'M003', title: '新增', anchors: ['新增锚点'], summary: '本轮新增记忆。' }],
    };
    const cache = {
        archiveRevision: 'rev-old',
        album: { kind: 'album', archiveRevision: 'rev-old', entries: [{ id: 'CG01', title: '旧相簿' }] },
        heart: {
            kind: 'heart', archiveRevision: 'rev-old', greetings: {}, dailyStrips: [], scenarioDramas: [],
            voiceDramas: [{ id: 'VS1', kind: 'spring', title: '第一篇春日' }],
        },
    };
    api.migrateDerivedCacheRevision(cache, oldBank, newBank);
    assert.deepEqual(cache.album.generationMeta.parts.mode.coveredMemoryIds, ['M001', 'M002']);
    assert.deepEqual(api.incrementalArchiveMemoryIds(cache.album, newBank, 'mode'), ['M003']);
    assert.deepEqual(cache.heart.generationMeta.parts['season:spring'].coveredMemoryIds, ['M001', 'M002']);
    assert.deepEqual(api.incrementalArchiveMemoryIds(cache.heart, newBank, 'season:spring'), ['M003']);
    assert.deepEqual(api.incrementalArchiveMemoryIds(cache.heart, newBank, 'season:summer'), ['M001', 'M002', 'M003']);
    assert.equal(cache.album.archiveRevision, 'rev-new');
});

test('a legacy cache already on the current revision is never mistaken for wholly new material', () => {
    const bank = { archiveRevision: 'same-revision', memories: memoryBank.memories };
    const legacyAlbum = { kind: 'album', archiveRevision: 'same-revision', entries: [{ id: 'CG01', title: '旧内容', sourceMemoryIds: ['M001'] }] };
    assert.deepEqual(api.incrementalArchiveMemoryIds(legacyAlbum, bank, 'mode'), []);
});

test('incremental cursors consume successful empty deltas and cap each batch at 64 memories', () => {
    const manyBank = {
        archiveRevision: 'rev-many',
        memories: Array.from({ length: 70 }, (_, index) => ({ id: `M${String(index + 1).padStart(3, '0')}` })),
    };
    assert.equal(api.incrementalArchiveMemoryIds(null, manyBank, 'mode').length, 64);

    const bank = { archiveRevision: 'rev-next', memories: memoryBank.memories };
    const previous = {
        kind: 'album',
        generationMeta: { schemaVersion: 1, parts: { mode: { coveredMemoryIds: ['M001'], archiveRevision: 'rev-old', updatedAt: 1 } } },
    };
    const session = api.stampIncrementalCoverage(structuredClone(previous), previous, bank, 'mode', ['M002'], 0);
    assert.deepEqual(api.incrementalArchiveMemoryIds(session, bank, 'mode'), []);
    assert.equal(session.generationMeta.lastUpdate.added, 0);
    assert.deepEqual(session.generationMeta.lastUpdate.consumedMemoryIds, ['M002']);
});

test('mutable relationship summaries must cite the current incremental batch', () => {
    const heartDelta = {
        relationshipState: '新阶段', relationshipSummary: '新增档案带来的关系变化。', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '站台雨伞',
        birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [], greetings: { morning: ['新增的一句早安。'] },
    };
    assert.throws(() => api.normalizeHeartCoreIncrement(heartDelta, memoryBank, ['M002']), /本轮新增档案/);
    const acceptedHeart = api.normalizeHeartCoreIncrement({ ...heartDelta, relationshipSourceMemoryIds: ['M002'], relationshipSourceMemoryAnchor: '海边夕阳' }, memoryBank, ['M002']);
    assert.deepEqual(acceptedHeart.relationshipSourceMemoryIds, ['M002']);

    const endingDelta = {
        relationshipState: '新阶段', relationshipSummary: '关系摘要。', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '站台雨伞', recommendedEndingId: '', endings: [],
    };
    assert.throws(() => api.normalizeEndingIncrementOutline(endingDelta, memoryBank, ['M002']), /本轮新增档案/);
    const acceptedEnding = api.normalizeEndingIncrementOutline({ ...endingDelta, relationshipSourceMemoryIds: ['M002'], relationshipSourceMemoryAnchor: '海边夕阳' }, memoryBank, ['M002']);
    assert.equal(acceptedEnding.endings.length, 0);
});

test('incremental factual deltas reject old archive evidence before merge', () => {
    const oldAlbum = {
        title: '回忆相簿',
        entries: [{
            id: 'CG_OLD', title: '旧雨夜换标题', date: '08/01', desc: '站台雨伞下的旧事件。', category: '日常', unlocked: true,
            sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', visualSeed: ['雨', '伞', '站台', '夜'], imagePrompt: 'rainy station', hintLines: [],
        }],
    };
    assert.throws(() => api.normalizeAlbumIndex(oldAlbum, memoryBank, ['M002']), /没有生成任何可验证/);
    assert.equal(api.normalizeAlbumIndex({ ...oldAlbum, entries: [{ ...oldAlbum.entries[0], id: 'CG_NEW', title: '海边新增', desc: '海边夕阳下的新事件。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' }] }, memoryBank, ['M002']).entries.length, 1);

    const oldAdv = { events: [{ id: 'EV_OLD', title: '旧雨夜换标题', cgDesc: '站台雨伞下的旧画面。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', visualSeed: ['雨', '伞', '站台', '夜'] }] };
    assert.equal(api.normalizeEventList(oldAdv, memoryBank, { allowPartial: true, sourceMemoryIds: ['M002'] }).events.length, 0);
    assert.equal(api.normalizeEventList({ events: [{ ...oldAdv.events[0], id: 'EV_NEW', title: '海边新增', cgDesc: '海边夕阳下的新画面。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' }] }, memoryBank, { allowPartial: true, sourceMemoryIds: ['M002'] }).events.length, 1);

    const achievements = api.normalizeAchievements({ entries: [
        { id: 'ACH_OLD', title: '旧里程碑换名', description: '站台雨伞的旧事件。', unlocked: true, sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞' },
        { id: 'ACH_LOCKED', title: '泛化新目标', description: '没有新增证据的未来目标。', unlocked: false },
        { id: 'ACH_NEW', title: '海边里程碑', description: '海边夕阳的新事件。', unlocked: true, sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' },
    ] }, memoryBank, { allowPartial: true, sourceMemoryIds: ['M002'] });
    assert.deepEqual(achievements.entries.map(item => item.id), ['ACH_NEW']);

    const planApp = { id: 'NOTES', label: '备忘', kind: 'notes', incremental: true, summary: '新增备忘', entries: [{ id: 'N_NEW', title: '新增', meta: '' }] };
    const rawEntry = {
        id: 'N_NEW', title: '换标题的旧事件', preview: '站台雨伞旧事件。', detail: '仍然只是旧内容。', messages: [], fields: [], imageCaption: '',
        basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞',
    };
    assert.throws(() => api.normalizePhoneDraftApp({ app: { id: 'NOTES', entries: [rawEntry] } }, planApp, memoryBank, 'phone', ['M002']), /详情不完整/);
    const acceptedPhone = api.normalizePhoneDraftApp({ app: { id: 'NOTES', entries: [{ ...rawEntry, title: '海边新增', preview: '海边夕阳的新事件。', detail: '这是本轮新增内容。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' }] } }, planApp, memoryBank, 'phone', ['M002']);
    assert.deepEqual(acceptedPhone.entries[0].sourceMemoryIds, ['M002']);

    const archiveSlice = JSON.parse(api.incrementalArchiveSlice({ archiveName: '档案', archiveSummary: '旧档案总摘要不能进入增量请求', archiveKeywords: ['旧关键词'], memories: memoryBank.memories }, ['M002']));
    assert.equal('archiveSummary' in archiveSlice, false);
    assert.equal('archiveKeywords' in archiveSlice, false);
    assert.deepEqual(archiveSlice.memories.map(item => item.id), ['M002']);
});

test('album incremental merge preserves historical copy, image data, and current reader position', () => {
    const oldEntry = {
        id: 'CG01', title: '原来的雨夜', date: '08/01', desc: '旧描述绝不能被润色。', category: '日常', unlocked: true,
        sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', visualSeed: ['雨', '伞', '站台', '夜'], imagePrompt: 'old prompt',
        cgImage: { provider: 'sillytavern-imagine', url: 'data:image/png;base64,AAAA' }, comments: ['旧一', '旧二', '旧三', '旧四'], hintLines: [],
    };
    const previous = { kind: 'album', title: '旧相簿', entries: [oldEntry], category: '日常', page: 3, pageSize: 6, selectedId: 'CG01', sharedMemory: true, dialogueIndex: 2, hintVisible: false };
    const freshEntry = { ...structuredClone(oldEntry), id: 'CG02', title: '新增海边', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', cgImage: null, comments: ['新一', '新二', '新三', '新四'] };
    const merged = api.mergeAlbumIncremental(previous, { kind: 'album', title: '模型新标题', entries: [freshEntry] }, memoryBank);
    assert.deepEqual(merged.entries[0], oldEntry);
    assert.equal(merged.entries.length, 2);
    assert.equal(merged.title, '旧相簿');
    assert.equal(merged.page, 3);
    assert.equal(merged.sharedMemory, true);
    assert.equal(merged.dialogueIndex, 2);
});

test('album incremental merge upgrades a matching locked entry in place', () => {
    const lockedEntry = {
        id: 'CG_LOCKED', title: '海边的约定', date: '', desc: '', category: '特别', unlocked: false,
        sourceMemoryIds: [], sourceMemoryAnchor: '', visualSeed: [], imagePrompt: '', cgImage: null,
        comments: [], hintLines: ['继续记录与海边有关的回忆。'],
    };
    const unlockedEntry = {
        id: 'CG_NEW', title: '海边的约定', date: '08/24', desc: '新增档案里的海边夕阳。', category: '特别', unlocked: true,
        sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', visualSeed: ['海边', '夕阳', '约定'], imagePrompt: 'sunset beach',
        cgImage: null, comments: ['新一', '新二', '新三', '新四'], hintLines: [],
    };
    const previous = { kind: 'album', title: '旧相簿', entries: [lockedEntry], page: 2, selectedId: 'CG_LOCKED' };
    const merged = api.mergeAlbumIncremental(previous, { kind: 'album', title: '模型新标题', entries: [unlockedEntry] }, memoryBank);
    assert.equal(merged.entries.length, 1);
    assert.equal(merged.entries[0].id, 'CG_LOCKED');
    assert.equal(merged.entries[0].unlocked, true);
    assert.deepEqual(merged.entries[0].sourceMemoryIds, ['M002']);
    assert.equal(merged.page, 2);
    assert.equal(merged.selectedId, 'CG_LOCKED');
});

test('room and item-tree deltas append only nodes grounded in the new archive batch', () => {
    const oldObject = { id: 'O1', label: '旧相框', basis: '记忆', description: '旧描述。', line: '旧台词。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞' };
    const previousRoom = {
        kind: 'room', title: '他的房间', spaces: [{ id: 'SP1', label: '卧室', spaceType: '卧室', atmosphere: '旧气氛。', objects: [oldObject] }],
        dayparts: {}, presenceLines: ['旧问候'], selectedSpaceId: 'SP1', selectedObjectId: 'O1', presenceIndex: 0,
    };
    const freshRoom = {
        spaces: [{ id: 'SP1', label: '卧室', spaceType: '卧室', objects: [
            { ...oldObject, description: '模型试图改写旧描述。' },
            { id: 'O2', label: '新车票', basis: '记忆', description: '新增物件。', line: '新增台词。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' },
            { id: 'O3', label: '无关摆件', basis: '设定', description: '不应追加。', line: '不应追加。', sourceMemoryIds: [], sourceMemoryAnchor: '' },
        ] }],
        presenceLines: ['旧问候', '新增问候'],
    };
    const roomMerged = api.mergeRoomIncremental(previousRoom, freshRoom, ['M002']);
    assert.deepEqual(roomMerged.session.spaces[0].objects[0], oldObject);
    assert.deepEqual(roomMerged.session.spaces[0].objects.map(item => item.label), ['旧相框', '新车票']);
    assert.deepEqual(roomMerged.session.presenceLines, ['旧问候', '新增问候']);

    const newSpaceRoom = api.mergeRoomIncremental(previousRoom, { spaces: [{
        id: 'SP2', label: '新工作室', spaceType: '工作室', atmosphere: '新增空间。', objects: [
            { id: 'N1', label: '新票根', basis: '记忆', description: '新增。', line: '新增。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳' },
            { id: 'N2', label: '旧雨伞', basis: '记忆', description: '旧内容不应搭车进入。', line: '旧。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞' },
            { id: 'N3', label: '普通工作灯', basis: '设定', description: '新空间的普通陈设。', line: '灯在这里。', sourceMemoryIds: [], sourceMemoryAnchor: '' },
        ],
    }], presenceLines: [] }, ['M002']);
    assert.deepEqual(newSpaceRoom.session.spaces[1].objects.map(item => item.label), ['新票根', '普通工作灯']);

    const oldNode = { id: 'IT1', label: '旧物', kind: 'item', basis: '记忆', summary: '旧摘要。', line: '旧台词。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', children: [] };
    const previousItems = { kind: 'items', title: '他的物品', containers: [{ id: 'BOX1', label: '抽屉', spaceLabel: '卧室', nodes: [oldNode] }], selectedContainerId: 'BOX1', viewPath: [], selectedNodeId: 'IT1' };
    const freshItems = { containers: [{ id: 'BOX1', label: '抽屉', spaceLabel: '卧室', nodes: [
        { ...oldNode, summary: '模型试图改写旧摘要。' },
        { id: 'IT2', label: '新票根', kind: 'item', basis: '记忆', summary: '新增摘要。', line: '新增台词。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', children: [] },
        { id: 'IT_OLD_PARENT', label: '旧证据父容器换名', kind: 'container', basis: '记忆', summary: '旧内容不应随子节点整棵搭车进入。', line: '旧台词。', sourceMemoryIds: ['M003'], sourceMemoryAnchor: '旧书签', children: [
            { id: 'IT_CHILD', label: '嵌套的新票根', kind: 'item', basis: '记忆', summary: '新子节点。', line: '新台词。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', children: [] },
        ] },
    ] }] };
    const itemMerged = api.mergeItemsIncremental(previousItems, freshItems, ['M002']);
    assert.deepEqual(itemMerged.session.containers[0].nodes[0], oldNode);
    assert.deepEqual(itemMerged.session.containers[0].nodes.map(item => item.label), ['旧物', '新票根']);

    const nestedPatch = { containers: [{ id: 'BOX1', label: '抽屉', spaceLabel: '卧室', nodes: [{
        ...oldNode,
        summary: '模型仍不能改写旧父节点。',
        children: [{ id: 'IT_NESTED', label: '旧物里的新夹层', kind: 'item', basis: '记忆', summary: '新增夹层。', line: '新增台词。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', children: [] }],
    }] }] };
    const nestedMerged = api.mergeItemsIncremental(previousItems, nestedPatch, ['M002']);
    assert.equal(nestedMerged.session.containers[0].nodes[0].summary, '旧摘要。');
    assert.deepEqual(nestedMerged.session.containers[0].nodes[0].children.map(item => item.label), ['旧物里的新夹层']);
});

test('item capacity counts actual nodes even when model IDs are duplicated', () => {
    const oldNode = index => ({
        id: 'DUPLICATE_NODE_ID', label: `旧物 ${index}`, kind: 'container', basis: '设定',
        summary: `旧摘要 ${index}。`, line: `旧台词 ${index}。`, sourceMemoryIds: [], sourceMemoryAnchor: '',
        children: [{
            id: 'DUPLICATE_NODE_ID', label: `旧夹层 ${index}`, kind: 'item', basis: '设定',
            summary: `旧夹层摘要 ${index}。`, line: `旧夹层台词 ${index}。`, sourceMemoryIds: [], sourceMemoryAnchor: '', children: [],
        }],
    });
    const previous = api.normalizeItems({
        title: '满额旧物品',
        containers: Array.from({ length: 10 }, (_, boxIndex) => ({
            id: `BOX${boxIndex}`, label: `旧容器 ${boxIndex}`, spaceLabel: `旧空间 ${boxIndex}`,
            nodes: Array.from({ length: 12 }, (__, nodeIndex) => oldNode(`${boxIndex}-${nodeIndex}`)),
        })),
    }, memoryBank);
    assert.equal(api.countItemNodes(previous.containers.flatMap(box => box.nodes)), 240);

    const groundedNode = index => ({
        id: 'DUPLICATE_FRESH_ID', label: `新增物件 ${index}`, kind: 'item', basis: '记忆',
        summary: `海边夕阳后的新增物件 ${index}。`, line: `海边夕阳后的新增台词 ${index}。`,
        sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', children: [],
    });
    const fresh = api.normalizeItems({
        title: '候选增量',
        containers: [{
            id: 'BOX0', label: '旧容器 0', spaceLabel: '旧空间 0',
            nodes: [groundedNode(1), groundedNode(2), groundedNode(3), { ...groundedNode(4), children: [groundedNode('4-1')] }],
        }],
    }, memoryBank);
    const merged = api.mergeItemsIncremental(previous, fresh, ['M002']);
    assert.equal(merged.added, 0);
    assert.equal(api.countItemNodes(merged.session.containers.flatMap(box => box.nodes)), 240);
});

test('phone delta appends entries while preserving every old App entry', () => {
    const specs = [
        ['MOMENTS', 'moments', 3], ['CHAT', 'chat', 3], ['GALLERY', 'gallery', 4], ['NOTES', 'notes', 5], ['SCHEDULE', 'schedule', 4],
        ['STORE', 'store', 4], ['BROWSER', 'browser', 3], ['CONTACTS', 'contacts', 3], ['LOCATION', 'location', 2], ['MISC', 'misc', 2],
    ];
    const apps = specs.map(([id, kind, count]) => ({
        id, label: id, kind, summary: `${kind} old summary`,
        entries: Array.from({ length: count }, (_, index) => ({
            id: `${id}${index + 1}`, title: `${kind}-${index + 1}`, meta: '旧 meta', preview: '旧预览', detail: '旧详情',
            messages: kind === 'chat' && index < 2 ? Array.from({ length: 12 }, (__, i) => ({ speaker: i % 2 ? '角色' : '朋友', time: '21:00', text: `旧消息${i + 1}` })) : [],
            fields: kind === 'contacts' && index === 0 ? [{ label: '备注', value: '旧备注' }, { label: '最近通话', value: '昨天' }, { label: '提醒', value: '生日' }] : [],
            imageCaption: '', basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '',
        })),
    }));
    const raw = { title: '他的手机', deviceName: '私人手机', deviceKind: 'phone', lockText: 'LOCK', liveStates: { morning: {}, daytime: {}, evening: {}, night: {} }, apps };
    const previous = api.normalizePhone(raw, memoryBank);
    previous.selectedAppId = 'NOTES';
    previous.selectedEntryId = 'NOTES1';
    previous.view = 'detail';
    const oldFirst = structuredClone(previous.apps[0].entries[0]);
    const patch = [{ id: 'NOTES', kind: 'notes', entries: [{
        id: 'NOTES_NEW', title: '海边之后', meta: '新增', preview: '新增预览', detail: '新增详情', messages: [], fields: [], imageCaption: '',
        basis: '记忆', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳',
    }] }];
    const merged = api.mergePhoneIncremental(previous, patch, memoryBank).session;
    assert.deepEqual(merged.apps[0].entries[0], oldFirst);
    assert.equal(merged.apps.find(app => app.id === 'NOTES').entries.at(-1).title, '海边之后');
    assert.equal(merged.selectedAppId, 'NOTES');
    assert.equal(merged.selectedEntryId, 'NOTES1');
    assert.equal(merged.view, 'detail');
});

test('phone accepts an explicit empty incremental plan without retry-shaped validation failure', () => {
    const previous = {
        title: '他的手机', deviceName: '私人手机', deviceKind: 'phone', lockText: 'LOCK',
        liveStates: { morning: {}, daytime: {}, evening: {}, night: {} },
        apps: [{ id: 'NOTES', label: '备忘', kind: 'notes', summary: '旧备忘', entries: [{ id: 'N1', title: '旧条目' }] }],
    };
    const empty = api.normalizePhoneIncrementPlan({ apps: [] }, previous);
    assert.deepEqual(empty.apps, []);
    assert.throws(() => api.normalizePhoneIncrementPlan({ apps: [{ id: 'UNKNOWN', kind: 'unknown', entries: [] }] }, previous), /没有可验证的新条目/);
    assert.match(source, /if \(!plan\.apps\.length\) \{\s*return stampIncrementalCoverage\(structuredClone\(previous\)/);
});

test('achievement and confession deltas keep old records and reject duplicate evidence', () => {
    const oldAchievement = { id: 'ACH01', title: '旧里程碑', description: '旧描述不能改。', category: '关系', tier: 'gold', unlocked: true, unlockedAt: '08/01', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', hint: '' };
    const previousAchievements = { kind: 'achievements', title: '旧成就库', entries: [oldAchievement] };
    const freshAchievements = { kind: 'achievements', title: '模型标题', entries: [
        { id: 'ACH_MODEL_REPEAT', title: '换标题复述旧里程碑', description: '不应追加。', category: '关系', tier: 'gold', unlocked: true, unlockedAt: '08/01', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', hint: '' },
        { id: 'ACH02', title: '海边约定', description: '新里程碑。', category: '事件', tier: 'silver', unlocked: true, unlockedAt: '08/02', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', hint: '' },
    ] };
    const mergedAchievements = api.mergeAchievementsIncremental(previousAchievements, freshAchievements, memoryBank);
    assert.deepEqual(mergedAchievements.entries[0], oldAchievement);
    assert.equal(mergedAchievements.entries[1].title, '海边约定');

    const oldConfession = { id: 'CONF01', type: 'mutual', title: '旧告白', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', confessionText: '旧告白原文重构。' };
    const duplicate = { ...oldConfession, id: 'MODEL_CHANGED', type: 'indirect', title: '换标题复述', confessionText: '模型试图重说。' };
    const fresh = { id: 'CONF02', type: 'true', title: '新告白', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边夕阳', confessionText: '新增告白。' };
    const mergedConfessions = api.mergeEndingConfessions([oldConfession], [duplicate, fresh]);
    assert.deepEqual(mergedConfessions.items[0], oldConfession);
    assert.equal(mergedConfessions.items.length, 2);
    assert.equal(mergedConfessions.items[1].title, '新告白');
});

test('butterfly append keeps old nodes and refuses to evict them at capacity', () => {
    const previous = {
        kind: 'butterfly', title: '终端', subject: '角色', status: 'UNSTABLE', selected: 1,
        nodes: [
            { id: 'MAIN', label: '主线', monologue: '主线', intervention: '主线回应', systemNote: '主线结论' },
            { id: 'EG01', label: '旧分歧', monologue: '旧独白', intervention: '旧回应', systemNote: '旧结论', trueEnding: false },
            { id: 'OMEGA', label: '观测点 Ω：旧', monologue: '', intervention: '旧 Ω 发言', systemNote: '旧 Ω 结论', trueEnding: true },
        ],
    };
    const part = {
        branches: [{ id: 'EG02', label: '新分歧', monologue: '新独白', intervention: '新回应', systemNote: '新结论', trueEnding: false }],
        omega: { id: 'OMEGA', label: '观测点 Ω：新', monologue: '', intervention: '新 Ω 发言', systemNote: '新 Ω 结论', trueEnding: true },
    };
    const merged = api.mergeButterflyIncremental(previous, part, ['M002']);
    assert.deepEqual(merged.nodes[0], previous.nodes[0]);
    assert.deepEqual(merged.nodes[1], previous.nodes[1]);
    assert.ok(merged.nodes.some(item => item.intervention === '旧 Ω 发言'));
    assert.equal(merged.nodes.at(-1).intervention, '新 Ω 发言');

    const full = structuredClone(previous);
    while (full.nodes.length < 239) full.nodes.splice(-1, 0, { id: `EG${full.nodes.length}`, label: `旧分歧${full.nodes.length}` });
    const unchanged = api.mergeButterflyIncremental(full, part, ['M002']);
    assert.deepEqual(unchanged, full);
});

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
    assert.equal(merged.events.length, 2);
    assert.deepEqual(merged.events[0].sourceMemoryIds, ['M999']);
    assert.equal(merged.events[0].adv.paragraphs[0], '旧段落1。这是足够长的旧 ADV 内容。');
    assert.deepEqual(merged.events[1].sourceMemoryIds, ['M002']);
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
            {
                id: 'ACH_UNSUPPORTED',
                title: '模型凭空解锁的里程碑',
                description: '没有任何当前档案证据，不能进入已解锁区。',
                category: '特别',
                tier: 'gold',
                unlocked: true,
                unlockedAt: '已解锁',
                sourceMemoryIds: ['M999'],
                sourceMemoryAnchor: '不存在的锚点',
                hint: '',
            },
        ],
    }, memoryBank);
    assert.equal(achievements.entries.length, 2);
    assert.equal(achievements.entries.filter(item => item.unlocked).length, 1);
    assert.equal(achievements.entries.filter(item => !item.unlocked).length, 1);
    assert.deepEqual(achievements.entries[1].sourceMemoryIds, []);
    assert.throws(() => api.normalizeAchievements({ entries: [{
        id: 'ACH_ONLY_BAD', title: '虚构解锁', description: '没有证据。', unlocked: true,
        sourceMemoryIds: ['M999'], sourceMemoryAnchor: '不存在的锚点',
    }] }, memoryBank), /没有生成可用条目/);
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

test('HEART season coverage advances only after Voice and Scenario for the same batch exist', () => {
    const coverage = {
        coveragePart: 'season:spring',
        sourceMemoryIds: ['M002'],
        archiveMemoryIds: ['M001', 'M002'],
        archiveRevision: 'rev-heart',
    };
    const base = {
        kind: 'heart', voiceDramas: [], scenarioDramas: [], dailyStrips: [],
        generationMeta: { schemaVersion: 1, parts: { 'season:spring': { coveredMemoryIds: ['M001'], archiveRevision: 'rev-old', updatedAt: 1 } } },
    };
    const voice = { id: 'VOICE_BATCH', kind: 'spring', title: '新春篇', setting: '春日', incrementBatchId: 'batch-m002', script: [] };
    const scenario = { id: 'SCENE_BATCH', season: 'spring', title: '新春场景', setting: '春日', incrementBatchId: 'batch-m002', script: [] };
    const voiceOnly = api.applyHeartPartialPatch(base, { type: 'season', season: 'spring', voice });
    assert.deepEqual(api.incrementalArchiveMemoryIds(voiceOnly, { archiveRevision: 'rev-heart', memories: memoryBank.memories }, 'season:spring'), ['M002']);

    const complete = api.applyHeartPartialPatch(voiceOnly, { type: 'season', season: 'spring', scenario, ...coverage });
    assert.deepEqual(api.incrementalArchiveMemoryIds(complete, { archiveRevision: 'rev-heart', memories: memoryBank.memories }, 'season:spring'), []);
    assert.equal(complete.voiceDramas[0].incrementBatchId, complete.scenarioDramas[0].incrementBatchId);
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


test('cache persistence waits until provider traffic is idle', async () => {
    assert.equal(api.CACHE_PERSIST_IDLE_RETRY_MS, 1200);
    assert.equal(api.shouldDeferCachePersistForProviderTraffic(), false);
    const a = new AbortController();
    const b = new AbortController();
    const c = new AbortController();
    const releaseA = await api.acquireProviderRequestPermit(a.signal);
    const releaseB = await api.acquireProviderRequestPermit(b.signal);
    const pendingC = api.acquireProviderRequestPermit(c.signal);
    assert.equal(api.shouldDeferCachePersistForProviderTraffic(), true);
    releaseA();
    const releaseC = await pendingC;
    assert.equal(api.shouldDeferCachePersistForProviderTraffic(), true);
    releaseB();
    releaseC();
    assert.equal(api.shouldDeferCachePersistForProviderTraffic(), false);
});

test('modern CompressionStream path does not immediately upload an uncompressed theater cache', () => {
    if (typeof CompressionStream === 'function') {
        assert.equal(api.shouldWriteUncompressedCacheImmediately(null), false);
        assert.match(source, /if \(shouldWriteUncompressedCacheImmediately\(stored\)\)/);
        assert.match(source, /if \(shouldDeferCachePersistForProviderTraffic\(\)\) \{\s*arm\(CACHE_PERSIST_IDLE_RETRY_MS\)/);
    }
});


test('HEART keeps multiple stories in one season without overwriting sibling seasons', () => {
    const longLine = text => text.repeat(6);
    const springOne = api.normalizeVoiceDramaPart({ voiceDramas: [{
        id: 'VS1', kind: 'spring', title: '第一场春雨', subtitle: '', setting: '', incrementBatchId: 'spring-one',
        script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: longLine('第一篇春日故事会一直保留在这里。') })),
    }] }, ['spring'])[0];
    const summer = api.normalizeVoiceDramaPart({ voiceDramas: [{
        id: 'VU1', kind: 'summer', title: '第一场夏夜', subtitle: '', setting: '', incrementBatchId: 'summer-one',
        script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: longLine('夏日故事不应该被春日更新影响。') })),
    }] }, ['summer'])[0];
    const springTwo = api.normalizeVoiceDramaPart({ voiceDramas: [{
        id: 'VS2', kind: 'spring', title: '第二场春风', subtitle: '', setting: '', incrementBatchId: 'spring-two',
        script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: longLine('新增档案只会再追加一篇春日故事。') })),
    }] }, ['spring'])[0];
    let merged = api.applyHeartPartialPatch({ kind: 'heart', voiceDramas: [], scenarioDramas: [], dailyStrips: [] }, { type: 'season', season: 'spring', voice: springOne });
    merged = api.applyHeartPartialPatch(merged, { type: 'season', season: 'summer', voice: summer });
    merged = api.applyHeartPartialPatch(merged, { type: 'season', season: 'spring', voice: springTwo });
    assert.deepEqual(merged.voiceDramas.map(item => item.title), ['第一场春雨', '第一场夏夜', '第二场春风']);
    assert.equal(merged.voiceDramas.filter(item => item.kind === 'spring').length, 2);
    assert.equal(merged.voiceDramas.find(item => item.id === 'VS1').script[0].text, springOne.script[0].text);
    assert.match(source, /Voice \$\{voiceCount\} \/ Scenario \$\{scenarioCount\}/);
    assert.match(source, /旧篇保留；每次档案增量后可继续追加。/);
});

test('maximum output setting is 60k and UI no longer clamps to 30k', () => {
    assert.equal(api.MAX_GENERATION_OUTPUT_TOKENS, 60000);
    assert.equal(api.MAX_GENERATION_OUTPUT_CHARS, 600000);
    assert.match(source, /data-rmt-api-max-tokens[^>]*max="60000"/);
    assert.doesNotMatch(source, /MAX_GENERATION_OUTPUT_TOKENS = 30000/);
    assert.doesNotMatch(source, /data-rmt-api-max-tokens[^>]*max="30000"/);
    assert.match(source, /normalizeText\(raw, MAX_GENERATION_OUTPUT_CHARS\)/);
    const saveCalls = [];
    const context = {
        extensionSettings: { heartbeatMemories: { maxTokens: 60000 } },
        saveSettingsDebounced() { saveCalls.push(true); },
    };
    assert.equal(api.getPluginSettings(context).maxTokens, 60000);
    context.extensionSettings.heartbeatMemories.maxTokens = 90000;
    assert.equal(api.getPluginSettings(context).maxTokens, 60000);
});

test('JSON output errors report configured and actual per-segment output budgets', () => {
    const summary = api.jsonOutputBudgetSummary({ requestMaxTokens: 3000, configuredMaxTokens: 60000 });
    assert.match(summary, /3,000/);
    assert.match(summary, /60,000/);
    assert.match(summary, /较小的分段上限/);
    assert.match(source, /requestMaxTokens: responseLength/);
    assert.match(source, /configuredMaxTokens: settings\.maxTokens/);
});

test('invalid JSON diagnostics never echo model-body fragments', () => {
    const secret = 'ARCHIVE_SECRET_SENTINEL';
    assert.throws(
        () => api.extractJson(`{"a":${secret}}`, { requestMaxTokens: 3000, configuredMaxTokens: 60000 }),
        error => error?.code === 'RMT_JSON_INVALID'
            && !error.message.includes(secret)
            && !error.message.includes('ARCHIVE_SE')
            && !error.message.includes('{"a"'),
    );
});
