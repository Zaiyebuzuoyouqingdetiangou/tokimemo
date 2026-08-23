import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/heartbeatMemories.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const testingExports = `
export const __r24Testing = {
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
  SEGMENT_REQUEST_CONCURRENCY,
};`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\n${testingExports}`).toString('base64')}`;
const { __r24Testing: api } = await import(moduleUrl);

test.afterEach(() => api.reset());

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

test('new confession pages validate and legacy confession text splits locally', () => {
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
            confessionLines: lines,
            creditsLine: '在下一次心跳之前。',
            epilogue: {
                title: '后日谈',
                timeSkip: '数月后',
                scenes: [1, 2, 3].map(index => ({ title: `片段${index}`, text: `这是未来生活片段${index}。`.repeat(18) })),
                finalLine: '以后也一起走吧。',
            },
        },
    }, route);
    assert.equal(detail.confessionLines.length, 6);
    assert.equal(detail.confession, lines.join('\n'));
});
