import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import * as internals from './testingFacade.mjs';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';

const srcRoot = new URL('../src/', import.meta.url);
const sourceFiles = (await readdir(srcRoot, { recursive: true })).filter(name => name.endsWith('.js')).sort();
const sourceByFile = new Map();
let source = '';
for (const name of sourceFiles) {
  const text = await readFile(new URL(name, srcRoot), 'utf8');
  sourceByFile.set(name.replaceAll('\\', '/'), text);
  source += `\n// FILE:${name}\n${text}`;
}

const api = {
  ...internals,
  ...constants,
  reset() {
    state.activeGenerationTasks.clear();
    state.activeModeBuildScopes.clear();
    state.activeAdvBulkScopes.clear();
    state.activeCgImageTasks.clear();
    state.providerRequestQueue.splice(0);
    state.activeProviderRequestCount = 0;
  },
  addCgImageTask(key, controller) { state.activeCgImageTasks.set(key, { controller }); },
  addBuildScope(key) { state.activeModeBuildScopes.add(key); },
  addRequest(key, parentTaskKey = '') { state.activeGenerationTasks.set(key, { parentTaskKey }); },
  logicalKeys() { return [...internals.activeLogicalGenerationKeys()]; },
  providerState() { return { active: state.activeProviderRequestCount, queued: state.providerRequestQueue.length }; },
};

test.afterEach(() => api.reset());


test('TT display is opt-in while legacy mobile fullscreen remains the default', () => {
    assert.equal(api.DEFAULT_SETTINGS.ttDisplayMode, false);
    const context = { extensionSettings: { heartbeatMemories: { ttDisplayMode: true } }, saveSettingsDebounced() {} };
    assert.equal(api.getPluginSettings(context).ttDisplayMode, true);
    assert.equal(api.archiveMobileSafeTopFallback({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', platform: 'iPhone', maxTouchPoints: 5 }), 52);
    assert.match(source, /rmt-tt-display/);
    assert.match(source, /TT 显示模式/);
    assert.match(sourceByFile.get('ui/styles.js'), /#\$\{core_constants\.OVERLAY_ID\}\{padding:0\}/);
    assert.match(source, /max\(env\(safe-area-inset-top, 0px\),var\(--rmt-mobile-safe-top, 0px\)\)/);
});

test('mobile overlay early-close fallback accepts only its code-owned topbar close button', () => {
    const selector = '.rmt-topbar > button[data-rmt-action="close"]';
    const closeButton = { matches: candidate => candidate === selector };
    const contentButton = { matches: () => false };
    const overlay = { contains: node => node === closeButton };
    assert.equal(api.overlayCloseButtonFromEvent({ composedPath: () => [closeButton] }, overlay), closeButton);
    assert.equal(api.overlayCloseButtonFromEvent({ composedPath: () => [contentButton] }, overlay), null);
    assert.equal(api.overlayCloseButtonFromEvent({ composedPath: () => [closeButton] }, { contains: () => false }), null);
    assert.match(source, /overlay\.addEventListener\('touchstart', earlyHandler, \{ capture: true, passive: false \}\)/);
    assert.match(source, /event\.preventDefault\?\.\(\);\s*event\.stopPropagation\?\.\(\);\s*closeArchiveOverlayFromUser\(\)/);
});

test('role interaction is a standalone archive portal immediately before achievements', () => {
    assert.match(sourceByFile.get('core/constants.js'), /ARCHIVE_PORTAL_MODES = Object\.freeze\(\[MODE\.ALBUM, MODE\.ADV, MODE\.ROOM, MODE\.ENDING, MODE\.CALENDAR, MODE\.RELATIONS, MODE\.HEART, MODE\.ACHIEVEMENTS/);
    assert.match(sourceByFile.get('archive/snapshots.js'), /\[core_constants\.MODE\.HEART\]: \{ title: '角色互动'/);
});


test('calendar and phone runtime ship through one versioned bundle instead of a stale child-module graph', async () => {
    assert.equal(api.ARCHIVE_PORTAL_MODES.includes(api.MODE.CALENDAR), true);
    assert.equal(api.modePortalMeta(api.MODE.CALENDAR).title, '两个人的日历');
    const currentIndexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    const bundleSource = await readFile(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url), 'utf8');
    assert.match(currentIndexSource, /import\(`\.\/dist\/heartbeatMemories\.bundle\.js\?heartbeat=\$\{BUILD\}`\)/);
    assert.doesNotMatch(currentIndexSource, /location\.reload\(\)/);
    assert.doesNotMatch(bundleSource, /^import\s+/m);
    assert.match(bundleSource, /两个人的日历/);
    assert.match(bundleSource, /增量追加终端/);
});


test('relationship calendar is a first-screen dedicated shortcut instead of a buried generic portal card', () => {
    const overlaySource = sourceByFile.get('ui/overlay.js');
    const librarySource = sourceByFile.get('archive/library.js');
    assert.match(overlaySource, /calendarQuickAccessHtml/);
    assert.match(overlaySource, /\$\{calendarQuick\}[\s\S]*?<section class="rmt-memory-gate/);
    assert.match(overlaySource, /portals\.filter\(item => item\.mode !== core_constants\.MODE\.CALENDAR\)/);
    assert.match(librarySource, /snapshotCalendarQuickAccessHtml/);
    assert.match(librarySource, /\$\{calendarQuick\}[\s\S]*?<section class="rmt-archive-portals"/);
    assert.match(sourceByFile.get('ui/styles.js'), /\.rmt-calendar-quick\{/);
});

test('private terminal exposes an explicit mobile-visible incremental button in addition to the topbar action', () => {
    const overlaySource = sourceByFile.get('ui/overlay.js');
    const phoneViewSource = sourceByFile.get('ui/phoneView.js');
    assert.match(overlaySource, /supportsTopbarIncrement = !core_constants\.ROOM_DEEP_MODES\.includes\(runtimeState\.activeMode\) \|\| runtimeState\.activeMode === core_constants\.MODE\.PHONE/);
    assert.match(phoneViewSource, /增量追加终端/);
    assert.match(phoneViewSource, /data-rmt-action=\"regenerate\"/);
    assert.match(sourceByFile.get('modes/phone.js'), /generatePhoneIncrementalWithRepair/);
});

test('private terminal chat requires distinguishable owner/contact speakers and renders opposite sides', () => {
    const chatBank = { ...memoryBank, characterName: '佐伯', userName: '小月' };
    const planApp = {
        id: 'CHAT', label: '通讯', kind: 'chat', incremental: true, summary: '聊天',
        entries: [{ id: 'C1', title: '与小月聊天', meta: '夜里' }],
    };
    const allOther = {
        app: {
            id: 'CHAT', entries: [{
                id: 'C1', title: '与小月聊天', meta: '夜里', preview: '晚上的消息', detail: '', contactName: '小月',
                messages: Array.from({ length: 12 }, (_, i) => ({ speaker: '对方', time: `21:${String(i).padStart(2, '0')}`, text: `消息${i + 1}` })),
                fields: [], imageCaption: '', basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '',
            }],
        },
    };
    assert.throws(() => api.normalizePhoneDraftApp(allOther, planApp, chatBank, 'phone'), /没有同时出现设备主人和聊天对象/);

    const twoSided = structuredClone(allOther);
    twoSided.app.entries[0].messages = Array.from({ length: 12 }, (_, i) => ({
        speakerRole: i % 2 ? 'owner' : 'contact',
        speaker: i % 2 ? '我' : '小月',
        time: `21:${String(i).padStart(2, '0')}`,
        text: `双向消息${i + 1}`,
    }));
    const accepted = api.normalizePhoneDraftApp(twoSided, planApp, chatBank, 'phone');
    assert.equal(accepted.entries[0].contactName, '小月');
    assert.equal(accepted.entries[0].messages[0].speaker, '小月');
    assert.equal(accepted.entries[0].messages[1].speaker, '佐伯');
    assert.deepEqual(new Set(accepted.entries[0].messages.map(item => item.speakerRole)), new Set(['owner', 'contact']));
    const html = api.renderPhoneEntryDetail(accepted.entries[0], { kind: 'chat', label: '通讯' }, { ownerName: '佐伯' });
    assert.match(html, /rmt-phone-message-contact/);
    assert.match(html, /rmt-phone-message-owner/);
    assert.doesNotMatch(html, />对方</);
    assert.match(sourceByFile.get('modes/phone.js'), /speakerRole=owner 或 contact/);
});

test('secondary API forwards the user max output instead of a smaller feature hint', async () => {
    let sentMax = 0;
    const context = {
        extensionSettings: { heartbeatMemories: { connectionProfileId: 'profile', maxTokens: 60000 } },
        saveSettingsDebounced() {},
        ConnectionManagerRequestService: {
            async sendRequest(_profile, _prompt, maxTokens) { sentMax = maxTokens; return { content: '{\"ok\":true}' }; },
        },
    };
    const result = await api.generateConfiguredJson('return JSON', { context, contextEnvelope: '', skipTokenCount: true, maxTokens: 3800, timeoutMs: 30000 });
    assert.equal(sentMax, 60000);
    assert.equal(result.ok, true);
    context.extensionSettings.heartbeatMemories.maxTokens = 30000;
    await api.generateConfiguredJson('return JSON again', { context, contextEnvelope: '', skipTokenCount: true, maxTokens: 3800, timeoutMs: 30000 });
    assert.equal(sentMax, 30000);
});

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
    assert.equal(merged.apps.some(app => ['schedule', 'calendar'].includes(app.kind)), false);
});

test('phone calendar is retired in favor of the standalone relationship notebook and legacy cache is migrated', () => {
    assert.deepEqual([...api.PHONE_EXCLUDED_APP_KINDS].sort(), ['calendar', 'schedule']);
    const promptSource = sourceByFile.get('generation/prompts.js');
    const phoneSource = sourceByFile.get('modes/phone.js');
    const cacheSource = sourceByFile.get('core/cache.js');
    assert.match(promptSource, /禁止生成 schedule \/ calendar \/ 日历 App/);
    assert.match(phoneSource, /禁止生成 kind=schedule \/ calendar 或名为“日历”的 App/);
    assert.match(cacheSource, /PHONE_EXCLUDED_APP_KINDS/);

    const legacyApps = [
        ['CHAT', 'chat', 3], ['GALLERY', 'gallery', 4], ['NOTES', 'notes', 5], ['SCHEDULE', 'schedule', 4],
        ['MOMENTS', 'moments', 3], ['STORE', 'store', 4], ['BROWSER', 'browser', 3], ['CONTACTS', 'contacts', 3], ['LOCATION', 'location', 2], ['MISC', 'misc', 2],
    ].map(([id, kind, count]) => ({ id, label: id, kind, entries: Array.from({ length: count }, (_, i) => ({ id: `${id}${i}`, title: `${kind}${i}` })) }));
    const chatId = 'chat-phone-calendar-migration';
    const bank = { ...memoryBank, archiveRevision: 77 };
    const cache = { chatId, archiveRevision: 77, phone: { kind: 'phone', chatId, archiveRevision: 77, apps: legacyApps, selectedAppId: 'SCHEDULE', selectedEntryId: 'SCHEDULE0', view: 'detail' } };
    const migrated = api.loadSession(api.MODE.PHONE, { cache, chatId, memoryBank: bank, clone: true });
    assert.ok(migrated);
    assert.equal(migrated.apps.some(app => app.kind === 'schedule'), false);
    assert.equal(migrated.selectedAppId, 'CHAT');
    assert.equal(migrated.selectedEntryId, '');
    assert.equal(migrated.view, 'list');
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
    assert.match(sourceByFile.get('modes/phone.js'), /if \(!plan\.apps\.length\) \{\s*return core_incremental\.stampIncrementalCoverage\(structuredClone\(previous\)/);
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

test('phone plan keeps roughly thirty entries without duplicating the standalone calendar', () => {
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
    assert.equal(plan.apps.length, 9);
    assert.equal(plan.apps.reduce((sum, app) => sum + app.entries.length, 0), 29);
    assert.equal(plan.apps.some(app => ['schedule', 'calendar'].includes(app.kind)), false);
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
    assert.match(sourceByFile.get('ui/heartView.js'), /runtimeState\.activeArchiveSnapshot\?\.memory\?\.userName \|\| core_context\.getContext\(\)\.name1/);
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
        assert.match(sourceByFile.get('core/cache.js'), /if \(core_requestCoordinator\.shouldDeferCachePersistForProviderTraffic\(\)\) \{\s*arm\(core_constants\.CACHE_PERSIST_IDLE_RETRY_MS\)/);
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
        script: Array.from({ length: 5 }, () => ({ speaker: 'char', text: longLine('新的未来春日故事可以继续追加。') })),
    }] }, ['spring'])[0];
    let merged = api.applyHeartPartialPatch({ kind: 'heart', voiceDramas: [], scenarioDramas: [], dailyStrips: [] }, { type: 'season', season: 'spring', voice: springOne });
    merged = api.applyHeartPartialPatch(merged, { type: 'season', season: 'summer', voice: summer });
    merged = api.applyHeartPartialPatch(merged, { type: 'season', season: 'spring', voice: springTwo });
    assert.deepEqual(merged.voiceDramas.map(item => item.title), ['第一场春雨', '第一场夏夜', '第二场春风']);
    assert.equal(merged.voiceDramas.filter(item => item.kind === 'spring').length, 2);
    assert.equal(merged.voiceDramas.find(item => item.id === 'VS1').script[0].text, springOne.script[0].text);
    assert.match(source, /单篇翻阅/);
    assert.match(sourceByFile.get('ui/heartView.js'), /heartCurrentDrama/);
});



test('seasonal Drama uses archive only for relationship distance, not as a plot-material feed', () => {
    assert.deepEqual(JSON.parse(api.heartDramaRelationshipOnlyContext({
        relationshipState: '稳定交往中',
        relationshipSummary: '档案里出现了不应被四季剧情反复复读的具体敏感物品。',
        relationshipSourceMemoryIds: ['M001'],
        relationshipSourceMemoryAnchor: '敏感锚点',
    })), { relationshipState: '稳定交往中' });
    const heartSource = sourceByFile.get('modes/heart.js');
    const start = heartSource.indexOf('export async function generateHeartSeasonSection(season)');
    const end = heartSource.indexOf('export function normalizeHeartScript', start);
    const seasonalGenerator = heartSource.slice(start, end);
    assert.doesNotMatch(seasonalGenerator, /incrementalArchiveMemoryIds/);
    assert.doesNotMatch(seasonalGenerator, /sourceMemoryIds/);
    assert.match(source, /这是【未来的\$\{label\}日常模拟】/);
    assert.match(source, /和已知朋友家人同事一起活动/);
    assert.match(source, /不得把历史中的具体物品、伤痛、性生活\/敏感细节/);
    assert.doesNotMatch(source, /新篇必须由 incrementalMemoryIds 触发/);
});

test('seasonal Drama can append without a new archive batch and resumes a half-finished pair', () => {
    const partial = {
        voiceDramas: [{ kind: 'spring', incrementBatchId: 'spring-pending', generatedAt: 20 }],
        scenarioDramas: [],
    };
    assert.equal(api.pendingHeartDramaBatchId(partial, 'spring'), 'spring-pending');
    assert.equal(api.nextHeartDramaBatchId(partial, 'spring'), 'spring-pending');
    const complete = {
        voiceDramas: [{ kind: 'spring', incrementBatchId: 'spring-complete', generatedAt: 20 }],
        scenarioDramas: [{ season: 'spring', incrementBatchId: 'spring-complete', generatedAt: 21 }],
    };
    assert.equal(api.pendingHeartDramaBatchId(complete, 'spring'), '');
    assert.notEqual(api.nextHeartDramaBatchId(complete, 'spring'), 'spring-complete');
});

test('period dialogue library is hidden from HEART page and remains avatar-only', () => {
    assert.doesNotMatch(source, /data-rmt-heart-view="greetings"/);
    assert.match(source, /const view = \['seasons', 'strips', 'fireflies'\]\.includes\(session\.view\) \? session\.view : 'seasons'/);
    assert.match(source, /selectHeartGreeting\(session/);
    assert.match(source, /data-rmt-action="avatar-talk-again"/);
    const renderStart = source.indexOf('function renderHeart()');
    const renderEnd = source.indexOf('function renderButterfly()', renderStart);
    assert.doesNotMatch(source.slice(renderStart, renderEnd), /data-rmt-action="heart-avatar-talk"/);
});
test('maximum output setting is 60k and UI no longer clamps to 30k', () => {
    assert.equal(api.MAX_GENERATION_OUTPUT_TOKENS, 60000);
    assert.equal(api.MAX_GENERATION_OUTPUT_CHARS, 600000);
    assert.match(source, /data-rmt-api-max-tokens[^>]*max="60000"/);
    assert.doesNotMatch(source, /MAX_GENERATION_OUTPUT_TOKENS = 30000/);
    assert.doesNotMatch(source, /data-rmt-api-max-tokens[^>]*max="30000"/);
    assert.match(sourceByFile.get('generation/jsonParser.js'), /core_text\.normalizeText\(raw, core_constants\.MAX_GENERATION_OUTPUT_CHARS\)/);
    const saveCalls = [];
    const context = {
        extensionSettings: { heartbeatMemories: { maxTokens: 60000 } },
        saveSettingsDebounced() { saveCalls.push(true); },
    };
    assert.equal(api.getPluginSettings(context).maxTokens, 60000);
    context.extensionSettings.heartbeatMemories.maxTokens = 90000;
    assert.equal(api.getPluginSettings(context).maxTokens, 60000);
});

test('JSON output diagnostics use the actual user-selected provider budget', () => {
    const summary = api.jsonOutputBudgetSummary({ requestMaxTokens: 60000, configuredMaxTokens: 60000 });
    assert.match(summary, /60,000/);
    assert.doesNotMatch(summary, /较小的分段上限/);
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



test('r40.2 calendar keeps evidence-backed dates while adding sparse sticky and mood notebook content', () => {
    const bank = {
        memories: [
            { id: 'M001', date: '2026/10/24', title: '去接纪时卿', summary: '他决定在10月24日去接纪时卿。', anchors: ['接纪时卿'] },
            { id: 'M002', date: '2026/10/24', title: '发烧插曲', summary: '当天出现发烧，但这只是剧情经过。', anchors: ['39.2℃'] },
            { id: 'M003', date: '2026/10/25', title: '水族馆约定', summary: '两个人明确说好11月2日一起去水族馆，目前尚未发生。', anchors: ['11月2日水族馆'] },
            { id: 'M004', date: '未标注', title: '没有日期', summary: '这条不能作为已发生日期锚点。', anchors: ['无日期'] },
        ],
    };
    const calendar = api.normalizeCalendar({
        title: '两个人的日历',
        past: [
            { id: 'P1', title: '接纪时卿', tags: ['接送', '<img src=x onerror=1>', '重要日'], sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接纪时卿' },
            { id: 'P_BAD', title: '无日期事件', tags: ['重要日'], sourceMemoryIds: ['M004'], sourceMemoryAnchor: '无日期' },
        ],
        promised: [
            { id: 'F1', date: '11/02', title: '去水族馆', tags: ['约定', '约会'], sourceMemoryIds: ['M003'], sourceMemoryAnchor: '11月2日水族馆' },
            { id: 'F_BAD_DATE', date: '11/03', title: '凭空改日期', tags: ['约定'], sourceMemoryIds: ['M003'], sourceMemoryAnchor: '11月2日水族馆' },
        ],
        future: [
            { id: 'W1', date: '12/25', title: '冬星祭', tags: ['设定日', '活动'], sourceLabel: '世界书', recurring: true },
        ],
        stickyNotes: [
            { id: 'N1', kind: 'memo', title: '记得', text: '11月2日别把时间排得太满。', sourceType: 'archive', sourceMemoryIds: ['M003'], sourceMemoryAnchor: '11月2日水族馆' },
            { id: 'N2', kind: 'special', title: '特别备注', text: '她不太喜欢太甜的东西。', sourceType: 'setting', sourceLabel: '角色卡' },
            { id: 'N_BAD', kind: 'memo', title: '坏便签', text: '没有证据。', sourceType: 'archive', sourceMemoryIds: ['M999'], sourceMemoryAnchor: '不存在' },
        ],
        moodNotes: [
            { id: 'J1', text: '那天等她出来的时候，我看时间的次数比自己想象得多。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接纪时卿' },
            { id: 'J_BAD', text: '凭空出现的情绪。', sourceMemoryIds: ['M999'], sourceMemoryAnchor: '不存在' },
        ],
    }, bank);
    assert.equal(calendar.kind, api.MODE.CALENDAR);
    assert.equal(calendar.calendarVersion, 4);
    assert.deepEqual(calendar.entries.filter(item => item.status === 'past').map(item => item.title), ['接纪时卿']);
    assert.equal(calendar.entries.some(item => item.title === '发烧插曲'), false);
    assert.equal(calendar.entries.some(item => item.title === '无日期事件'), false);
    assert.equal(calendar.entries.filter(item => item.status === 'promised').length, 1);
    assert.equal(calendar.entries.find(item => item.status === 'promised').date, '11/02');
    assert.equal(calendar.entries.some(item => item.title === '凭空改日期'), false);
    assert.deepEqual(calendar.entries.find(item => item.status === 'past').tags, ['接送', '重要日']);
    assert.equal(calendar.stickyNotes.length, 2);
    assert.equal(calendar.stickyNotes.find(item => item.kind === 'special').sourceType, 'setting');
    assert.deepEqual(calendar.stickyNotes.find(item => item.sourceType === 'setting').sourceMemoryIds, []);
    assert.equal(calendar.moodNotes.length, 1);
    assert.equal(calendar.moodNotes[0].date, '2026/10/24');
    assert.deepEqual(calendar.moodNotes[0].sourceMemoryIds, ['M001']);
});

test('r40.2 calendar prompt describes a whole notebook page, not per-date reflection cards', () => {
    const promptSource = sourceByFile.get('generation/prompts.js');
    assert.match(promptSource, /私人日历 \/ 手账页/);
    assert.match(promptSource, /便签 \/ 特别备注/);
    assert.match(promptSource, /To-Do List 由 promised 数组自动生成/);
    assert.match(promptSource, /stickyNotes/);
    assert.match(promptSource, /moodNotes/);
    assert.match(promptSource, /绝对不要每个日期、每个事项都写一条/);
    assert.match(promptSource, /sourceType=\"archive\"/);
    assert.match(promptSource, /sourceType=\"setting\"/);
    assert.match(promptSource, /证据里没有具体日期就写“待定”/);
    assert.match(promptSource, /future 不是剧情事实，也不是两个人已经约定的事项/);
    assert.match(sourceByFile.get('generation/client.js'), /const refreshableCalendar = mode === core_constants\.MODE\.CALENDAR/);
    assert.match(sourceByFile.get('core/cache.js'), /Array\.isArray\(session\.stickyNotes\)/);
    assert.match(sourceByFile.get('core/cache.js'), /Array\.isArray\(session\.moodNotes\)/);
});

test('r40.2 calendar renders month grid plus sticky board, global todo, special notes and sparse mood snippets', () => {
    const constantsSource = sourceByFile.get('core/constants.js');
    assert.match(constantsSource, /CALENDAR_SESSION_VERSION = 4/);
    const view = sourceByFile.get('ui/calendarView.js');
    assert.match(view, /rmt-calendar-grid/);
    assert.match(view, /rmt-calendar-notebook-board/);
    assert.match(view, /rmt-calendar-sticky-panel/);
    assert.match(view, /rmt-calendar-master-todo/);
    assert.match(view, /rmt-calendar-special-notes/);
    assert.match(view, /rmt-calendar-mood-section/);
    assert.match(view, /便签夹/);
    assert.match(view, /还要做的事/);
    assert.match(view, /页角随笔/);
    assert.match(view, /promised\.map\(item => calendarTodoRow\(item\)\)/);
    assert.doesNotMatch(view, /后来回想|做这个决定的时候|把这件事约下来的时候/);
    assert.doesNotMatch(view, /draw-cg|read-adv|generate.*story|特别篇/i);
    const styles = sourceByFile.get('ui/styles.js');
    assert.match(styles, /\.rmt-calendar-sticky\{/);
    assert.match(styles, /\.rmt-calendar-master-todo/);
    assert.match(styles, /\.rmt-calendar-mood-note\{/);
});

test('r42 entry module mounts a lightweight bootstrap and defers the full runtime until explicit Heartbeat use', async () => {
    const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(indexSource, /lightweight bootstrap ready; full runtime deferred/);
    assert.match(indexSource, /async function ensureRuntime\(reason = 'unknown'\)/);
    assert.match(indexSource, /await import\(`\.\/dist\/heartbeatMemories\.bundle\.js\?heartbeat=\$\{BUILD\}`\)/);
    assert.match(indexSource, /requestArchiveOpen[\s\S]*ensureRuntime\('archive'\)/);
    assert.doesNotMatch(indexSource, /jQuery\(\(\) => \{[\s\S]{0,240}import\(/);
    assert.doesNotMatch(indexSource, /bootHeartbeatMemories\(\)/);
});

test('r35 modular architecture keeps the entrypoint thin and modes horizontally isolated', () => {
    const entry = sourceByFile.get('heartbeatMemories.js');
    assert.ok(entry.length < 12000, `entrypoint unexpectedly large: ${entry.length}`);
    assert.deepEqual(
        [...entry.matchAll(/export function ([A-Za-z0-9_]+)/g)].map(match => match[1]).sort(),
        ['destroyMemoryTheater', 'initMemoryTheater', 'openArchiveLibrary'],
    );
    for (const [name, text] of sourceByFile) {
        if (!name.startsWith('modes/') || name === 'modes/registry.js') continue;
        assert.doesNotMatch(text, /from ['"]\.\/[^'"]+\.js['"]/, `${name} imports a sibling mode directly`);
    }
});

test('r35 keeps security-sensitive boundaries single-owner after the split', () => {
    const definitions = [
        ['normalizeMemoryReference', 'core/evidence.js'],
        ['acquireProviderRequestPermit', 'core/requestCoordinator.js'],
        ['isCurrentTaskOrigin', 'core/context.js'],
        ['saveSession', 'core/cache.js'],
        ['requireWritableArchiveAction', 'archive/library.js'],
        ['generateConfiguredJson', 'generation/client.js'],
    ];
    for (const [fn, file] of definitions) {
        const count = [...source.matchAll(new RegExp(`export (?:async )?function ${fn}\\b`, 'g'))].length;
        assert.equal(count, 1, `${fn} should have exactly one authoritative definition`);
        assert.match(sourceByFile.get(file), new RegExp(`export (?:async )?function ${fn}\\b`));
    }
});

test('ADV EVENT is a product rename while the legacy adv cache key stays compatible', () => {
    const constantsSource = sourceByFile.get('core/constants.js');
    assert.match(constantsSource, /ADV: 'adv'/);
    assert.match(constantsSource, /\[MODE\.ADV\]: 'ADV EVENT'/);
    assert.doesNotMatch(constantsSource, /ADV_EVENT: 'advEvent'/);
    assert.match(sourceByFile.get('archive/snapshots.js'), /title: 'ADV EVENT'/);
});

test('r35 runtime state namespace cannot be shadowed by local state variables', () => {
    for (const [name, text] of sourceByFile) {
        if (name === 'core/state.js') continue;
        assert.doesNotMatch(text, /import \{ state \} from .*core\/state\.js/);
        assert.doesNotMatch(text, /\bstate\.(?:activeMode|activeSession|busy|runtimeSessionCache|providerRequestQueue|activeGenerationTasks)\b/);
    }
    assert.match(source, /import \{ state as runtimeState \} from/);
});

test('r37 delete and regenerate controls require two explicit confirmations', () => {
    const previous = globalThis.confirm;
    const seen = [];
    globalThis.confirm = message => { seen.push(String(message)); return true; };
    try {
        assert.equal(api.confirmExplicitActionTwice('重新生成测试', '将替换派生内容。', { destructive: true }), true);
        assert.equal(seen.length, 2);
        assert.match(seen[0], /第一次确认/);
        assert.match(seen[1], /第二次确认/);
        seen.length = 0;
        globalThis.confirm = message => { seen.push(String(message)); return seen.length < 2; };
        assert.equal(api.confirmExplicitActionTwice('删除测试', '只删派生缓存。', { destructive: true }), false);
        assert.equal(seen.length, 2);
    } finally {
        if (previous === undefined) delete globalThis.confirm;
        else globalThis.confirm = previous;
    }
});

test('r37 content manager exposes category and granular CG / ADV / Drama / phone / calendar controls', () => {
    const managerSource = sourceByFile.get('ui/contentManager.js');
    const overlaySource = sourceByFile.get('ui/overlay.js');
    for (const target of ['album-entry', 'album-image', 'adv-event', 'adv-text', 'adv-image', 'heart-voice', 'heart-scenario', 'heart-strip', 'heart-strip-image', 'phone-app', 'phone-entry', 'ending-route', 'ending-confession', 'achievement', 'calendar-entry', 'calendar-note', 'calendar-mood']) {
        assert.match(managerSource, new RegExp(`['\"]${target}['\"]`));
    }
    assert.match(overlaySource, /manage-regenerate-category/);
    assert.match(overlaySource, /manage-delete-category/);
    assert.match(overlaySource, /type === 'calendar-note'/);
    assert.match(overlaySource, /type === 'calendar-mood'/);
    assert.match(overlaySource, /confirmExplicitActionTwice/);
    assert.match(overlaySource, /MODE\.ROOM \? \[core_constants\.MODE\.ROOM, core_constants\.MODE\.ITEMS, core_constants\.MODE\.PHONE\]/);
});

test('r37 individual deletion is derived-cache only and user-pruned sessions remain loadable', () => {
    const cacheSource = sourceByFile.get('core/cache.js');
    const overlaySource = sourceByFile.get('ui/overlay.js');
    assert.match(cacheSource, /export async function deleteSessions/);
    assert.doesNotMatch(cacheSource.slice(cacheSource.indexOf('export async function deleteSessions'), cacheSource.indexOf('export function saveSession')), /MEMORY_KEY/);
    assert.match(overlaySource, /updated\.userManaged = true|session\.userManaged = true/);
    assert.match(cacheSource, /MODE\.PHONE[^\n]+!userManaged/);
    assert.match(cacheSource, /MODE\.ENDING[^\n]+!userManaged/);
    assert.match(cacheSource, /MODE\.ACHIEVEMENTS[^\n]+!userManaged/);
});

test('r37 granular regeneration targets are allowlisted and replace only after a validated candidate returns', () => {
    const managerSource = sourceByFile.get('ui/contentManager.js');
    const regenSource = sourceByFile.get('generation/contentRegeneration.js');
    const overlaySource = sourceByFile.get('ui/overlay.js');
    assert.match(managerSource, /MANAGEABLE_TARGET_TYPES = new Set/);
    assert.match(regenSource, /export async function regenerateManagedTarget/);
    assert.match(regenSource, /type === 'calendar-note'/);
    assert.match(regenSource, /type === 'calendar-mood'/);
    assert.match(regenSource, /throw new Error\('这一类内容目前不支持单项模型重新生成。'\)/);
    assert.match(overlaySource, /const updated = await generation_contentRegeneration\.regenerateManagedTarget/);
    assert.match(overlaySource, /await commitManagedSession\(updated/);
    assert.match(overlaySource, /如果生成失败、聊天切换或档案 revision 变化，旧内容会原样保留/);
});

test('r42.1 firefly habitat generates 5-6 GS4-style additional-date conversations', () => {
    const rows = [
        ['F1', 'pink'], ['F2', 'blue'], ['F3', 'yellow'], ['F4', 'white'], ['F5', 'desire'], ['F6', 'pink'],
    ].map(([id, color], index) => ({
        id, color, title: `萤火虫话题${index + 1}`,
        script: [
            { speaker: 'char', text: `第${index + 1}个话题从眼前的萤火虫说起。我本来只是随口想说点什么，可站在这里以后，好像平常会藏住的话也更容易跑出来。` },
            { speaker: 'user', text: '你今天好像比平时坦率一点。' },
            { speaker: 'char', text: '大概是这里的传闻害的吧。不过既然已经说到这里，我也不想再装作完全不在意。' },
            { speaker: 'char', text: '有些事情直接说出口确实有点难，可如果只是借着这些光，我好像又能再多说一点。' },
            { speaker: 'user_thought', text: '刚才那句话……难道真的是他的心声吗？' },
        ],
    }));
    const normalized = api.normalizeFireflyVoicesPart({ fireflyVoices: rows });
    assert.equal(normalized.length, 6);
    assert.equal(normalized[0].script.length, 5);
    assert.equal(normalized[0].script.at(-1).speaker, 'user_thought');
    assert.ok(normalized[0].line.length > 120);
    assert.ok(new Set(normalized.map(item => item.color)).size >= 3);
    const promptSource = sourceByFile.get('modes/heart.js');
    assert.match(promptSource, /GS4「ホタルの住処」/);
    assert.match(promptSource, /pink 💗【恋爱】/);
    assert.match(promptSource, /blue 💙【恋爱的烦恼】/);
    assert.match(promptSource, /yellow 💛【朋友】/);
    assert.match(promptSource, /white 🤍【お楽しみ \/ 个性话题】/);
    assert.match(promptSource, /desire ♥️【本插件扩展，不是 GS4 原四色】/);
    assert.match(promptSource, /每颗必须是 5～10 个 script 节点/);
    assert.match(promptSource, /不要连续写“她怎么怎样/);
    assert.match(promptSource, /本轮新增 5～6 个真正新的话题/);
    assert.match(promptSource, /首次总数 5～6 个/);
});

test('r42.1 first firefly batch must include at least one friend or character-specific topic', () => {
    const mk = (id, color) => ({ id, color, title: id, script: [
        { speaker: 'char', text: '站在这些光里，平常会绕开的话题好像也变得容易开口一点。我本来以为自己能装得和平时一样。' },
        { speaker: 'user', text: '那你现在想说什么？' },
        { speaker: 'char', text: '就是有些事情其实一直放在心上，只是直接说出来会显得太认真，所以我才总想换个轻松点的说法。' },
        { speaker: 'char', text: '不过这里不是传说会让人说出心声吗？那我今天偶尔坦率一点，也可以怪到这些萤火虫头上。' },
        { speaker: 'user_thought', text: '他今天真的和平时有点不一样……' },
    ] });
    const romanceOnly = [mk('A','pink'), mk('B','blue'), mk('C','desire'), mk('D','pink'), mk('E','blue')];
    assert.throws(() => api.normalizeFireflyVoicesPart({ fireflyVoices: romanceOnly }), /至少需要 1 个 yellow/);
});

test('r41 HEART UI exposes firefly habitat as a third independent interaction tab', () => {
    const view = sourceByFile.get('ui/heartView.js');
    assert.match(view, /data-rmt-heart-view="fireflies"/);
    assert.match(view, /萤火虫栖息地/);
    assert.match(view, /rmt-firefly-point/);
    assert.match(view, /data-rmt-heart-firefly-id/);
    assert.match(sourceByFile.get('ui/contentManager.js'), /heart-firefly/);
    assert.match(sourceByFile.get('ui/overlay.js'), /type === 'heart-firefly'/);
});

test('r41.7 seasonal drama pager keeps one authoritative Voice/Scenario selection', () => {
    const session = {
        selectedVoiceId: 'V1', selectedScenarioId: 'S1', selectedDramaKey: 'scenario:S1',
        voiceDramas: [{ id: 'V1', kind: 'spring', generatedAt: 1 }, { id: 'V2', kind: 'spring', generatedAt: 3 }],
        scenarioDramas: [{ id: 'S1', season: 'spring', generatedAt: 2 }],
    };
    const state = api.heartCurrentDrama(session, 'spring');
    assert.equal(state.items.length, 3);
    assert.equal(state.current.type, 'scenario');
    assert.equal(state.current.item.id, 'S1');
    const legacy = api.heartCurrentDrama({ ...session, selectedDramaKey: '', selectedScenarioId: '' }, 'spring');
    assert.equal(legacy.current.item.id, 'V1');
    const view = sourceByFile.get('ui/heartView.js');
    assert.match(view, /heart-drama-prev/);
    assert.match(view, /heart-drama-next/);
    assert.match(view, /selectedDramaKey = `\$\{next\.type\}:\$\{next\.item\.id\}`/);
    assert.match(view, /单篇翻阅/);
});

test('r41 seasonal drama visual tone is constrained and used only as an allowlisted class', () => {
    const heartSource = sourceByFile.get('modes/heart.js');
    const viewSource = sourceByFile.get('ui/heartView.js');
    const styles = sourceByFile.get('ui/styles.js');
    assert.match(heartSource, /HEART_DRAMA_VISUAL_TONES/);
    assert.match(heartSource, /visualTone 只能是 soft \/ clear \/ muted \/ deep/);
    assert.match(viewSource, /\['soft', 'clear', 'muted', 'deep'\]\.includes\(item\.visualTone\)/);
    assert.match(styles, /season-spring/);
    assert.match(styles, /season-summer/);
    assert.match(styles, /season-autumn/);
    assert.match(styles, /season-winter/);
    assert.match(styles, /tone-deep/);
});

test('r41.2 character archive deletion tombstone blocks the same character from being re-indexed by avatar or source identity', () => {
    const deleted = api.normalizeDeletedArchiveCharacter({
        groupId: 'auto:abc', characterName: '佐伯', avatars: ['saeki.png'], characterKeys: ['saeki.png'],
        sourceIdentityKeys: ['fingerprint:card:old'], deletedAt: 123,
    });
    assert.equal(api.archiveEntryMatchesDeletedCharacter({ archiveGroupId: 'auto:abc', characterKey: 'other.png', avatar: 'other.png', characterName: '其他', chatId: 'A' }, deleted), true);
    assert.equal(api.archiveEntryMatchesDeletedCharacter({ characterKey: 'saeki.png', avatar: 'saeki.png', characterName: '佐伯', chatId: 'B', characterFingerprint: 'card:new' }, deleted), false);
    const stableDeleted = api.normalizeDeletedArchiveCharacter({ ...deleted, sourceIdentityKeys: [...deleted.sourceIdentityKeys, 'fallback:saeki.png\u001f佐伯'] });
    assert.equal(api.archiveEntryMatchesDeletedCharacter({ characterKey: 'saeki.png', avatar: 'saeki.png', characterName: '佐伯', chatId: 'B', characterFingerprint: 'card:new' }, stableDeleted), true);
    assert.equal(api.archiveEntryMatchesDeletedCharacter({ characterKey: 'saeki.png', avatar: 'saeki.png', characterName: '其他', chatId: 'C', characterFingerprint: 'card:other' }, stableDeleted), false);
    assert.equal(api.archiveEntryMatchesDeletedCharacter({ characterKey: 'other.png', avatar: 'other.png', characterName: '佐伯', chatId: 'D', characterFingerprint: 'card:other' }, stableDeleted), false);
});

test('r41.2 character archive delete mutates only Heartbeat library settings while preserving chat metadata', () => {
    const previousSt = globalThis.SillyTavern;
    const previousConfirm = globalThis.confirm;
    const confirmations = [];
    const context = {
        extensionSettings: {},
        chatMetadata: { untouched: {正文: '保留'} },
        characters: [{ name: '佐伯', avatar: 'saeki.png', data: { name: '佐伯', avatar: 'saeki.png', description: '角色设定' } }],
        characterId: 0,
        name2: '佐伯',
        getCurrentChatId: () => 'chat-a',
        saveSettingsDebounced() {},
    };
    api.setArchiveGroups(context, [{ id: 'auto:saeki', label: '佐伯', characterName: '佐伯', avatar: 'saeki.png', characterFingerprint: 'card:old' }]);
    api.setArchiveIndex(context, [{
        entryId: 'AE:test', archiveGroupId: 'auto:saeki', characterKey: 'saeki.png', avatar: 'saeki.png', characterName: '佐伯',
        characterFingerprint: 'card:old', chatId: 'chat-a', archiveName: '高中篇', memoryCount: 10, updatedAt: 1,
    }]);
    api.setCharacterProfile(context, { key: 'group:auto:saeki', characterName: '佐伯', facts: [], relationships: [] });
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.confirm = message => { confirmations.push(String(message)); return true; };
    try {
        const beforeMetadata = structuredClone(context.chatMetadata);
        const deleted = api.deleteArchiveCharacterFromLibrary('auto:saeki');
        assert.equal(deleted.name, '佐伯');
        assert.equal(deleted.count, 1);
        assert.equal(confirmations.length, 2);
        assert.deepEqual(context.chatMetadata, beforeMetadata);
        assert.equal(api.getArchiveGroups(context).length, 0);
        assert.equal(api.getArchiveIndex(context).length, 0);
        assert.equal(api.getDeletedArchiveCharacters(context).length, 1);
        assert.equal(api.getCharacterProfile(context, 'group:auto:saeki'), null);
        assert.equal(api.isArchiveEntryDeletedFromLibrary({ characterKey: 'saeki.png', avatar: 'saeki.png', characterName: '佐伯', chatId: 'chat-b' }, context), true);
    } finally {
        if (previousSt === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = previousSt;
        if (previousConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = previousConfirm;
    }
});

test('r41.2 deleting a character archive removes only Heartbeat library records and keeps chat deletion APIs out of the path', () => {
    const groupsSource = sourceByFile.get('archive/groups.js');
    const librarySource = sourceByFile.get('archive/library.js');
    const overlaySource = sourceByFile.get('ui/overlay.js');
    assert.match(librarySource, /data-rmt-action="archive-character-delete"/);
    assert.match(groupsSource, /confirmExplicitActionTwice\(/);
    assert.match(groupsSource, /不会删除、清空、重命名或改写任何 SillyTavern 正文聊天窗口/);
    assert.match(groupsSource, /ARCHIVE_DELETED_CHARACTERS_SETTINGS_KEY/);
    assert.match(librarySource, /isArchiveEntryDeletedFromLibrary\(candidate, context, deletedIndex\)/);
    assert.match(overlaySource, /archive-character-delete/);
    assert.doesNotMatch(groupsSource, /\/api\/chats\/delete|deleteChat|removeChat|\.chat\s*=\s*\[\]/);
});

test('r41.2 deleted current character hides current quick archive and calendar surfaces instead of resurrecting from live metadata', () => {
    const librarySource = sourceByFile.get('archive/library.js');
    assert.match(librarySource, /const deletedFromLibrary = archive_groups\.isCurrentCharacterDeletedFromLibrary\(ctx, mem\)/);
    assert.match(librarySource, /if \(deletedFromLibrary\) \{\s*currentQuick = '';\s*calendarQuick = '';/);
    assert.match(sourceByFile.get('archive/groups.js'), /if \(isCurrentCharacterDeletedFromLibrary\(context, memoryBank\)\) return;/);
});

test('r41.1 firefly unlocks append without overwriting or auto-evicting old lights', () => {
    const base = {
        kind: 'heart',
        fireflyVoices: [
            { id: 'F01', color: 'pink', line: '我还是会下意识先去找你在哪里。', generatedAt: 1 },
            { id: 'F02', color: 'blue', line: '有时候太在意你，反而不知道该怎么开口。', generatedAt: 2 },
        ],
        selectedFireflyId: 'F01',
        generationParts: { fireflies: true },
        view: 'fireflies',
    };
    const updated = api.applyHeartPartialPatch(base, {
        type: 'fireflies',
        fireflyVoices: [
            { id: 'F01', color: 'pink', line: '我还是会下意识先去找你在哪里。', generatedAt: 3 },
            { id: 'F02', color: 'desire', line: '现在比以前更想把你拉近一点，不想只隔着距离看你。', generatedAt: 4 },
        ],
    });
    assert.equal(updated.fireflyVoices.length, 3);
    assert.equal(updated.fireflyVoices[0].line, base.fireflyVoices[0].line);
    assert.equal(updated.fireflyVoices[1].line, base.fireflyVoices[1].line);
    assert.equal(updated.fireflyVoices.filter(item => item.line === base.fireflyVoices[0].line).length, 1);
    assert.equal(updated.fireflyVoices[2].color, 'desire');
    assert.notEqual(updated.fireflyVoices[2].id, 'F02');
    assert.equal(updated.selectedFireflyId, updated.fireflyVoices[2].id);
});

test('r41.1 firefly incremental cursor waits for new archive memories and then exposes only the delta', () => {
    const bank = { memories: [{ id: 'M001' }, { id: 'M002' }, { id: 'M003' }] };
    const modern = {
        kind: 'heart',
        fireflyVoices: [{ id: 'F01', color: 'pink', line: '这是一条已经保存的萤火虫心声。' }],
        generationMeta: { parts: { fireflies: { coveredMemoryIds: ['M001', 'M002'], archiveRevision: 'R2', updatedAt: 1 } } },
    };
    assert.deepEqual(api.incrementalArchiveMemoryIds(modern, bank, 'fireflies'), ['M003']);

    const legacy = { kind: 'heart', fireflyVoices: modern.fireflyVoices };
    assert.deepEqual(api.incrementalArchiveMemoryIds(legacy, bank, 'fireflies'), []);
});

test('r42.1 legacy monologue fireflies remain readable and are marked for GS4-style conversation upgrade', () => {
    const legacy = api.normalizeFireflyVoice({ id: 'OLD1', color: 'pink', line: '我总是下意识先去看你有没有在附近。' });
    assert.equal(legacy.thoughts.length, 1);
    assert.equal(legacy.script.length, 0);
    assert.equal(legacy.line, '我总是下意识先去看你有没有在附近。');
    assert.equal(api.legacyFireflyVoices({ fireflyVoices: [legacy] }).length, 1);
    const heartSource = sourceByFile.get('modes/heart.js');
    const viewSource = sourceByFile.get('ui/heartView.js');
    assert.match(heartSource, /patch\.type === 'firefly-upgrade'/);
    assert.match(heartSource, /升级为 GS4 式会话/);
    assert.match(heartSource, /legacyFireflyVoices\(base\)\.slice\(0, 6\)/);
    assert.match(viewSource, /旧版独白光点/);
});

test('r42.1 legacy firefly upgrade preserves ids, colors, and provenance while replacing only derived presentation with a conversation', () => {
    const base = {
        kind: 'heart',
        fireflyVoices: [{ id: 'OLD1', color: 'blue', line: '我有点怕你哪天忽然不再回头看我。', sourceArchiveMemoryIds: ['M014'], incrementBatchId: 'B1', generatedAt: 10 }],
        selectedFireflyId: 'OLD1', generationParts: { fireflies: true }, view: 'fireflies',
    };
    const script = [
        { speaker: 'char', text: '这里这么安静，我反而有点不知道该不该把话说得太明白。平时总觉得自己还能装得若无其事。' },
        { speaker: 'user', text: '你是在担心什么吗？' },
        { speaker: 'char', text: '大概吧。越是认真，就越怕有一天发现自己其实并没有站在最靠近你的地方。' },
        { speaker: 'char', text: '我知道这样想有点难看，可这里不是传说会让人把心里话说出来吗？那就当我今天只是中了这个传闻的招。' },
        { speaker: 'user_thought', text: '他刚才那句话……难道真的是一直没说出口的心声吗？' },
    ];
    const upgraded = api.applyHeartPartialPatch(base, {
        type: 'firefly-upgrade',
        fireflyVoices: [{ id: 'OLD1', color: 'blue', title: '不敢问出口', script }],
    });
    assert.equal(upgraded.fireflyVoices.length, 1);
    assert.equal(upgraded.fireflyVoices[0].id, 'OLD1');
    assert.equal(upgraded.fireflyVoices[0].color, 'blue');
    assert.deepEqual(upgraded.fireflyVoices[0].sourceArchiveMemoryIds, ['M014']);
    assert.equal(upgraded.fireflyVoices[0].incrementBatchId, 'B1');
    assert.equal(upgraded.fireflyVoices[0].generatedAt, 10);
    assert.equal(upgraded.fireflyVoices[0].script.length, 5);
});

test('r42.1 legacy firefly upgrade validator refuses id/color drift', () => {
    const expected = [{ id: 'OLD1', color: 'pink' }];
    const rich = { id: 'OLD1', color: 'blue', title: '错色', script: [
        { speaker: 'char', text: '这里的光一闪一闪的，看久了好像连平常不想承认的事都容易说出口。我本来还想装作只是随便看看风景。' },
        { speaker: 'user', text: '比如什么？你从刚才开始就有点奇怪。' },
        { speaker: 'char', text: '比如我其实会在意你是不是把别人看得比我更重要。说出来挺幼稚的吧，可我越想装得不在乎，反而越容易注意这些事。' },
        { speaker: 'char', text: '算了，就当是这里的传闻害我多嘴。平时我可不会这么坦白。今晚说过的话，至少别马上拿来笑我。' },
        { speaker: 'user_thought', text: '他是在吃醋吗……？刚才那种坦率的语气，和平时真的不太一样。' },
    ] };
    assert.throws(() => api.normalizeFireflyUpgradePart({ fireflyVoices: [rich] }, expected), /改变了颜色/);
});

test('r41.8 firefly generation requires a small 5-6 item batch', () => {
    const heartSource = sourceByFile.get('modes/heart.js');
    assert.match(heartSource, /minTotal: 5/);
    assert.match(heartSource, /slice\(0, 6\)/);
    assert.doesNotMatch(heartSource, /minTotal: hasExisting \? 8 : 18/);
});

test('r41.8 firefly library keeps the archive large but renders only one 6-light page', () => {
    const constants = sourceByFile.get('core/constants.js');
    const view = sourceByFile.get('ui/heartView.js');
    const heart = sourceByFile.get('modes/heart.js');
    assert.match(constants, /HEART_FIREFLY_MAX_ITEMS = MAX_DERIVED_CONTENT_ITEMS/);
    assert.match(constants, /HEART_FIREFLY_PAGE_SIZE = 6/);
    assert.match(view, /visibleVoices = voices\.slice\(pageStart, pageStart \+ pageSize\)/);
    assert.match(view, /heart-firefly-prev/);
    assert.match(view, /heart-firefly-next/);
    assert.match(heart, /out\.length >= core_constants\.HEART_FIREFLY_MAX_ITEMS/);
    assert.doesNotMatch(heart, /updated\.fireflyVoices = patch\.fireflyVoices\.slice\(0, 36\)/);
});


test('r41.5 deleted-character filtering builds one indexed Set for archive-library and legacy-scan passes', () => {
    const context = {
        extensionSettings: {
            heartbeatMemoriesDeletedCharactersV1: [
                { groupId: 'auto:a', characterName: 'A', sourceIdentityKeys: ['fingerprint:card:a', 'fallback:a.png\u001fa'], deletedAt: 1 },
                { groupId: 'auto:b', characterName: 'B', sourceIdentityKeys: ['fingerprint:card:b'], deletedAt: 2 },
            ],
        },
    };
    const index = api.buildDeletedArchiveCharacterIndex(context);
    assert.equal(index.groupIds.has('auto:a'), true);
    assert.equal(index.groupIds.has('auto:b'), true);
    assert.equal(index.sourceIdentityKeys.has('fingerprint:card:a'), true);
    assert.equal(api.archiveEntryMatchesDeletedCharacterIndex({ archiveGroupId: 'auto:a', characterKey: 'x', characterName: 'x', chatId: '1' }, index), true);
    const librarySource = sourceByFile.get('archive/library.js');
    assert.match(librarySource, /const deletedIndex = archive_groups\.buildDeletedArchiveCharacterIndex\(archiveContext\)/);
    assert.match(librarySource, /isArchiveEntryDeletedFromLibrary\(item, archiveContext, deletedIndex\)/);
    assert.match(librarySource, /const deletedIndex = archive_groups\.buildDeletedArchiveCharacterIndex\(context\)/);
    assert.match(librarySource, /isArchiveEntryDeletedFromLibrary\(candidate, context, deletedIndex\)/);
});

test('r41.5 ordinary message events use lightweight archive-status refresh and do not rescan the whole chat', () => {
    const portal = sourceByFile.get('ui/archivePortal.js');
    const settings = sourceByFile.get('ui/settingsPanel.js');
    assert.match(portal, /messageHandler[\s\S]*refreshSettingsMemoryStatus\(\{ lightweight: true \}\)/);
    assert.match(settings, /refreshSettingsMemoryStatus\(\{ lightweight = false \} = \{\}\)/);
    assert.match(settings, /lightweight\s*\?\s*!!archive_repository\.getImportedMemory\(context\)\s*:\s*archive_repository\.getMemoryState\(context\)\.status === 'ready'/);
});

test('r41.5 startup injects only compact settings CSS and defers the full UI stylesheet until overlay open', () => {
    const heartbeat = sourceByFile.get('heartbeatMemories.js');
    const settings = sourceByFile.get('ui/settingsPanel.js');
    const overlay = sourceByFile.get('ui/overlay.js');
    const styles = sourceByFile.get('ui/styles.js');
    assert.doesNotMatch(heartbeat, /initMemoryTheater\(\)[\s\S]*ui_styles\.ensureSettingsStyles\(\)/);
    assert.doesNotMatch(heartbeat, /initMemoryTheater\(\)[\s\S]*ui_styles\.ensureStyles\(\)/);
    assert.match(settings, /export function mountSettings\(\) \{\s*ui_styles\.ensureSettingsStyles\(\)/);
    assert.match(overlay, /export function openOverlay\(\) \{\s*ui_styles\.ensureStyles\(\)/);
    assert.match(styles, /export function ensureSettingsStyles\(\)/);
    assert.match(styles, /export function ensureStyles\(\) \{\s*ensureSettingsStyles\(\)/);
    assert.match(heartbeat, /SETTINGS_STYLE_ID/);
});

test('r41.4 shared Character Profile accepts explicit user special-setting evidence but rejects guessed facts', () => {
    const sources = {
        characterData: { name: '佐伯', avatar: 'saeki.png', description: '佐伯的生日是9月9日。血型A型。姐姐叫美奈。' },
        userData: { name: '小月', personaDescription: '小月和佐伯从小一起长大，是青梅竹马。' },
        worldInfo: '佐伯在学校里最信任的朋友是志波。',
    };
    const profile = api.normalizeCharacterProfile({
        title: 'CHARACTER PROFILE',
        introduction: '安静而认真。',
        facts: [
            { label: '生日', value: '9月9日', sourceType: 'character_card', sourceEvidence: '生日是9月9日' },
            { label: '血型', value: 'O型', sourceType: 'character_card', sourceEvidence: '血型A型' },
            { label: '身高', value: '187cm', sourceType: 'character_card', sourceEvidence: '身高187cm' },
        ],
        relationships: [
            { id: 'U', name: '小月', relation: '青梅竹马', category: 'close', state: '亲密', sentiments: ['信赖'], summary: '从小一起长大。', isUser: true, sourceType: 'user_persona', sourceEvidence: '和佐伯从小一起长大，是青梅竹马' },
            { id: 'F', name: '凭空朋友', relation: '好友', category: 'friend', state: '友好', sentiments: [], summary: '不存在。', isUser: false, sourceType: 'world_info', sourceEvidence: '凭空朋友' },
        ],
    }, sources, 'group:auto:test', '佐伯', 'saeki.png');
    assert.deepEqual(profile.facts.map(item => item.label), ['生日', '血型']);
    assert.equal(profile.facts.find(item => item.label === '血型')?.value, 'A型');
    assert.equal(profile.facts.some(item => item.value === 'O型' || item.label === '身高'), false);
    assert.equal(profile.relationships.length, 1);
    assert.equal(profile.relationships[0].isUser, true);
    assert.equal(profile.relationships[0].relation, '青梅竹马');

    const worldSources = { ...sources, worldInfo: '固定设定：小月是佐伯的未婚妻。' };
    const worldProfile = api.normalizeCharacterProfile({
        title: 'CHARACTER PROFILE', introduction: '', facts: [],
        relationships: [{ id: 'WU', name: '小月', relation: '未婚妻', category: 'special', state: '伴侣', sentiments: ['重视'], summary: '故事开始前就存在的婚约。', isUser: true, sourceType: 'world_info', sourceEvidence: '小月是佐伯的未婚妻' }],
    }, worldSources, 'group:auto:test2', '佐伯', 'saeki.png');
    assert.equal(worldProfile.relationships.length, 1);
    assert.equal(worldProfile.relationships[0].relation, '未婚妻');
});

test('r41.4 per-chat relation layer requires real Mxxx evidence and merges with the shared user node without cross-window overwrite', () => {
    const dynamic = api.normalizeRelations({
        title: '本世界线人际关系',
        summary: '关系推进。',
        relationships: [
            { id: 'D1', name: '小月', relation: '恋人', category: 'special', state: '恋爱', sentiments: ['依赖'], summary: '海边约定后两人确认了恋爱关系。', isUser: true, sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边约定' },
            { id: 'D2', name: '不存在的人', relation: '同事', category: 'work', state: '普通', sentiments: [], summary: '没有证据。', isUser: false, sourceMemoryIds: ['M999'], sourceMemoryAnchor: '不存在' },
            { id: 'D3', name: '凭空同事', relation: '同事', category: 'work', state: '普通', sentiments: [], summary: '错误地借用真实记忆。', isUser: false, sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞' },
        ],
    }, memoryBank, { name1: '小月' });
    assert.equal(dynamic.relationships.length, 1);
    const merged = api.mergeRelationLayers([
        { id: 'B1', name: '小月', relation: '青梅竹马', category: 'close', state: '亲密', isUser: true },
    ], dynamic.relationships);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].base.relation, '青梅竹马');
    assert.equal(merged[0].dynamic.relation, '恋人');
});

test('r41.4 worldline profile discoveries require literal Mxxx evidence and stay inside the chat-scoped relations session', () => {
    const bank = { memories: [
        { id: 'M010', title: '生日的话题', anchors: ['生日是10月14日'], summary: '他明确说自己的生日是10月14日，也提到兴趣是摄影。' },
        { id: 'M011', title: '普通散步', anchors: ['走过河边'], summary: '两个人散步，没有谈身高。' },
    ] };
    const session = api.normalizeRelations({
        title: '本世界线人际关系', summary: '',
        discoveries: [
            { id: 'D1', label: '生日', value: '10月14日', summary: '后来在聊天里得知。', sourceMemoryIds: ['M010'], sourceMemoryAnchor: '生日是10月14日' },
            { id: 'D2', label: '兴趣', value: '摄影', summary: '明确提到。', sourceMemoryIds: ['M010'], sourceMemoryAnchor: '生日是10月14日' },
            { id: 'D3', label: '身高', value: '187cm', summary: '不能从散步猜。', sourceMemoryIds: ['M011'], sourceMemoryAnchor: '走过河边' },
            { id: 'D4', label: '血型', value: 'A型', summary: '无证据。', sourceMemoryIds: ['M999'], sourceMemoryAnchor: '不存在' },
        ],
        relationships: [],
    }, bank, { name1: '小月' });
    assert.deepEqual(session.discoveries.map(item => [item.label, item.value]), [['生日', '10月14日'], ['兴趣', '摄影']]);
    assert.equal(session.relationships.length, 0);
    const relationSource = sourceByFile.get('modes/relations.js');
    assert.match(relationSource, /discoveries 永远属于当前聊天世界线/);
    assert.match(relationSource, /worldlineDiscoveriesHtml\(session\.discoveries/);
    assert.doesNotMatch(relationSource, /setCharacterProfile\([^)]*discoveries/);
});

test('r41.4 GS profile keeps standard rows visible as unknown instead of hiding missing blood type or height', () => {
    const relationSource = sourceByFile.get('modes/relations.js');
    assert.match(relationSource, /PROFILE_FACT_ORDER = Object\.freeze\(\['生日', '年龄 \/ 年级', '身高', '血型'/);
    assert.match(relationSource, /item \? core_text\.esc\(item\.value\) : '？？？'/);
    assert.match(sourceByFile.get('ui/styles.js'), /rmt-profile-fact\.unknown/);
});

test('r41.4 relation garden is code-laid-out and profile generation is setting-only, not chat-derived', () => {
    const relationSource = sourceByFile.get('modes/relations.js');
    const positions = api.relationGardenPositions(99);
    assert.equal(positions.length, 18);
    assert.match(relationSource, /本请求【禁止读取\/利用任何聊天窗口正文或 Mxxx 档案】/);
    assert.match(relationSource, /sourceEvidence 必须逐字来自对应来源/);
    assert.doesNotMatch(relationSource, /requestAnimationFrame|setInterval\(/);
    assert.doesNotMatch(relationSource, /fetch\(/);
    assert.match(relationSource, /style="left:\$\{pos\.x\.toFixed/);
    assert.match(relationSource, /<svg class="rmt-relation-edges"/);
    assert.match(relationSource, /<line class=\"rmt-relation-edge base\"/);
});


test('r41.4 same character keeps one shared profile group after ordinary card text edits', () => {
    const groups = [api.normalizeArchiveGroup({
        id: 'auto:old', label: '佐伯', characterName: '佐伯', avatar: 'saeki.png',
        characterFingerprint: 'card:old', manual: false, characterIndexHint: 0,
    })];
    const group = api.ensureArchiveAutoGroup(groups, { index: 0, name: '佐伯', avatar: 'saeki.png', fingerprint: 'card:new' });
    assert.equal(group.id, 'auto:old');
    assert.equal(group.characterFingerprint, 'card:new');
    assert.equal(groups.length, 1);
});


test('fresh HEART session assembly does not depend on an out-of-scope data variable', () => {
    const core = {
        title: 'HEART VOICE / 角色互动',
        relationshipState: '关系稳定',
        relationshipSummary: '两个人已经建立稳定关系。',
        relationshipSourceMemoryIds: ['M001'],
        relationshipSourceMemoryAnchor: '关系锚点',
        birthdayMmDd: '',
        userBirthdayMmDd: '',
        specialDays: [],
        greetings: { morning: ['早。'] },
    };
    const session = api.makeHeartSession(core, null);
    assert.equal(session.kind, api.MODE.HEART);
    assert.deepEqual(session.fireflyVoices, []);
    assert.equal(session.generationParts.dialogues, true);
});

test('startup settings and chat navigation stay on lightweight paths', async () => {
    const settings = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
    const portal = await readFile(new URL('../src/ui/archivePortal.js', import.meta.url), 'utf8');
    const heartbeat = await readFile(new URL('../src/heartbeatMemories.js', import.meta.url), 'utf8');
    assert.match(settings, /hydrateSettingsPanel/);
    assert.match(settings, /refreshSettingsMemoryStatus\(\{ lightweight: true \}\)/);
    assert.match(portal, /chatHandler[\s\S]*refreshSettingsMemoryStatus\(\{ lightweight: true \}\)/);
    assert.doesNotMatch(heartbeat, /ensureSettingsStyles\(\);\s*const settingsMounted/);
});

test('r42 zero-decompression diagnostic reads only cache manifest/string length and never expands the cache', async () => {
    const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    const settings = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
    assert.match(indexSource, /heartbeatMemoriesTheaterV3/);
    assert.match(indexSource, /stored\.data\.length/);
    assert.match(indexSource, /stored\.sourceChars/);
    assert.match(indexSource, /Array\.isArray\(memory\?\.memories\) \? memory\.memories\.length/);
    assert.doesNotMatch(indexSource, /\batob\s*\(|new\s+DecompressionStream\s*\(|pako\.|fflate\./);
    assert.doesNotMatch(indexSource, /JSON\.stringify\(stored|JSON\.stringify\(metadata/);
    assert.match(indexSource, /未执行 Base64 解码、gzip 解压、缓存序列化/);
    assert.match(settings, /data-rmt-performance-diagnostic/);
    assert.match(settings, /__heartbeatMemoriesRenderPerformanceDiagnostic/);
});

test('r42 bootstrap diagnostic does not load the full runtime when the diagnostic button is used', async () => {
    const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    const bootstrapMount = indexSource.match(/function mountBootstrapSettings\(\)[\s\S]*?\n}\n\nfunction removeBootstrapShells/)?.[0] || '';
    assert.match(bootstrapMount, /data-rmt-bootstrap-diagnostic/);
    assert.match(bootstrapMount, /renderDiagnostic\(/);
    const diagnosticBranch = bootstrapMount.match(/if \(diag\) \{[\s\S]*?return;\n        \}/)?.[0] || '';
    assert.doesNotMatch(diagnosticBranch, /ensureRuntime|import\(/);
});


test('r41.9 Character Profile deterministically reads literal age and occupation from the character card', () => {
    const sources = {
        characterData: {
            name: '文不通',
            description: '文不通，本名沈清源，30岁，知名网文作家、影视编剧，前历史系讲师。姐姐25岁，是医生。性格清醒而痛苦。',
        },
        userData: { name: 'User', personaDescription: '24岁，设计师。' },
        worldInfo: '',
    };
    const profile = api.normalizeCharacterProfile({ title: 'CHARACTER PROFILE', introduction: '简介', facts: [], relationships: [] }, sources, 'group:test', '文不通', '');
    const facts = new Map(profile.facts.map(item => [item.label, item.value]));
    assert.equal(facts.get('年龄 / 年级'), '30岁');
    assert.equal(facts.get('职业 / 学校'), '知名网文作家、影视编剧、前历史系讲师');
    assert.doesNotMatch(facts.get('职业 / 学校'), /医生/);
    assert.notEqual(facts.get('年龄 / 年级'), '24岁');
});

test('r41.9 Character Profile accepts common fact-label aliases without guessing values', () => {
    const sources = {
        characterData: { name: '角色', description: '角色年龄：30岁。职业：编剧。' },
        userData: { name: 'User', personaDescription: '' },
        worldInfo: '',
    };
    const profile = api.normalizeCharacterProfile({
        facts: [
            { label: '年龄', value: '30岁', sourceType: 'character_card', sourceEvidence: '年龄：30岁' },
            { label: '职业', value: '编剧', sourceType: 'character_card', sourceEvidence: '职业：编剧' },
        ],
        relationships: [],
    }, sources, 'group:test', '角色', '');
    assert.equal(profile.facts.some(item => item.label === '年龄 / 年级' && item.value === '30岁'), true);
    assert.equal(profile.facts.some(item => item.label === '职业 / 学校' && /编剧/.test(item.value)), true);
});

test('r41.9 role page uses one collapsible Character Profile and no duplicate base-only relation garden', () => {
    const relationsSource = sourceByFile.get('modes/relations.js');
    const librarySource = sourceByFile.get('archive/library.js');
    assert.match(relationsSource, /<details class="rmt-character-profile rmt-archive-card">/);
    assert.match(relationsSource, /已读取 \$\{knownCount\} \/ \$\{PROFILE_FACT_ORDER\.length\} 项固定资料 · 点击展开/);
    assert.doesNotMatch(relationsSource, /人际庭园 · 固有设定/);
    assert.doesNotMatch(relationsSource, /characterProfileHtml[\s\S]*?relationGardenHtml\(\{ characterName: profile\.characterName/);
    assert.match(relationsSource, /relationGardenHtml\(\{ characterName, avatarUrl, sharedRelations: profile\?\.relationships \|\| \[\], dynamicRelations: session\.relationships \|\| \[\], selectedKey \}\)/);
    assert.match(librarySource, /patchCharacterProfileFromCard\(context, profile, matchedDescriptor\.index\)/);
});
