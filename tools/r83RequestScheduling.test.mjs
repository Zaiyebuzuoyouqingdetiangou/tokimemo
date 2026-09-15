import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../src/generation/client.js';
import * as coordinator from '../src/core/requestCoordinator.js';
import * as constants from '../src/core/constants.js';
import * as trace from '../src/core/taskTrace.js';
import { state } from '../src/core/state.js';

function gate() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

async function until(predicate, message) {
    const deadline = Date.now() + 1000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
    assert.ok(predicate(), message);
}

async function flush() { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); }

function fixture(t) {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    trace.clearTaskTrace();
    const savedEpoch = state.runtimeLifecycleEpoch;
    const requests = [], counted = [], tasks = [], controllers = [], settled = new Set();
    const tokenGates = new Map(), network = new Map(), extraGates = [];
    const profile = { id: 'schedule-fixture', mode: 'cc', api: 'openai', model: 'fixture', 'secret-id': 'SECRET_REFERENCE' };
    const context = {
        name1: 'PRIVATE_USER', name2: 'PRIVATE_CHAR',
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { connectionProfileId: profile.id,
            useActivatedWorldInfo: false, excludedContextTags: ['thinking'] }, connectionManager: { profiles: [profile] } },
        async getTokenCountAsync(text) {
            const key = text.trim().split('\n')[0]; counted.push(key);
            return tokenGates.has(key) ? tokenGates.get(key).promise : 40;
        },
        ConnectionManagerRequestService: {
            validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, messages, _length, _options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.ok(payload.secret_id);
                const key = messages[0].content.trim().split('\n')[0];
                requests.push(key);
                if (network.has(key)) return network.get(key).promise;
                return { content: '{"ok":true}' };
            },
        },
    };
    const options = { context, contextEnvelope: '', mode: 'travel',
        origin: { lifecycleEpoch: savedEpoch, archiveTargetEntryId: 'PRIVATE_ARCHIVE' } };
    const track = promise => { tasks.push(promise); promise.then(() => settled.add(promise), () => settled.add(promise)); return promise; };
    const start = (key, overrides = {}, direct = false) => {
        const controller = new AbortController(); controllers.push(controller);
        const requestOptions = { ...options, taskKey: key, signal: controller.signal, ...overrides };
        return track(direct ? client.generateConfiguredJson(key, requestOptions) : client.requestJson(key, '', requestOptions));
    };
    t.after(async () => {
        for (const controller of controllers) controller.abort();
        for (const task of state.activeGenerationTasks.values()) task.controller?.abort();
        for (const item of tokenGates.values()) item.resolve(40);
        for (const item of network.values()) item.resolve({ content: '{"ok":true}' });
        for (const item of extraGates) item.resolve();
        await Promise.allSettled(tasks);
        state.providerRequestQueue.length = 0;
        state.activeProviderRequestCount = 0;
        state.activeGenerationTasks.clear();
        state.runtimeLifecycleEpoch = savedEpoch;
        coordinator.resetProviderRateLimitThrottle();
        trace.clearTaskTrace();
        documentDescriptor ? Object.defineProperty(globalThis, 'document', documentDescriptor) : delete globalThis.document;
    });
    return { context, profile, options, requests, counted, tokenGates, network, extraGates, track, start,
        done: promise => settled.has(promise) };
}

test('input checks do not occupy provider slots and a ready request overtakes blocked token checks', async t => {
    const f = fixture(t);
    f.tokenGates.set('TOKEN_A', gate()); f.tokenGates.set('TOKEN_B', gate());
    const first = f.start('TOKEN_A'), second = f.start('TOKEN_B');
    await until(() => f.counted.length === 2, 'both token checks started');
    assert.equal(state.activeProviderRequestCount, 0);
    const third = f.start('READY_C');
    await until(() => f.requests.includes('READY_C'), 'ready request reaches provider without releasing token gates');
    assert.deepEqual(await third, { ok: true });
    assert.equal(f.done(first), false); assert.equal(f.done(second), false);
    f.tokenGates.get('TOKEN_A').resolve(40); f.tokenGates.get('TOKEN_B').resolve(40);
    await Promise.all([first, second]);
    assert.equal(state.activeProviderRequestCount, 0);
});

test('direct archive generation respects the shared two-request provider cap', async t => {
    const f = fixture(t);
    for (const key of ['DIRECT_A', 'DIRECT_B', 'DIRECT_C']) f.network.set(key, gate());
    const tasks = ['DIRECT_A', 'DIRECT_B', 'DIRECT_C'].map(key => f.start(key, { mode: 'archive' }, true));
    await until(() => f.counted.length === 3 && f.requests.length >= 2, 'all three direct calls prepared');
    await flush();
    assert.equal(f.requests.length, 2);
    assert.equal(state.activeProviderRequestCount, 2);
    assert.equal(state.providerRequestQueue.length, 1);
    f.network.get(f.requests[0]).resolve({ content: '{"ok":true}' });
    await until(() => f.requests.length === 3, 'third direct call starts after a slot frees');
    for (const item of f.network.values()) item.resolve({ content: '{"ok":true}' });
    await Promise.all(tasks);
    assert.equal(state.activeProviderRequestCount, 0);
});

test('an excessive token budget rejects before queueing even when two provider slots are busy', async t => {
    const f = fixture(t);
    f.network.set('BUSY_A', gate()); f.network.set('BUSY_B', gate());
    f.start('BUSY_A'); f.start('BUSY_B');
    await until(() => f.requests.length === 2, 'two provider calls in flight');
    f.tokenGates.set('TOO_LARGE', gate()); f.tokenGates.get('TOO_LARGE').resolve(constants.MAX_GENERATION_INPUT_TOKENS + 1);
    const rejected = f.start('TOO_LARGE');
    await until(() => f.done(rejected), 'budget failure settles without releasing occupied provider slots');
    await assert.rejects(rejected, { code: 'RMT_INPUT_BUDGET' });
    assert.equal(state.providerRequestQueue.length, 0);
    assert.deepEqual(f.requests, ['BUSY_A', 'BUSY_B']);
});

test('an external abort removes a queued request without sending it or leaking a permit', async t => {
    const f = fixture(t);
    f.network.set('BUSY_A', gate()); f.network.set('BUSY_B', gate());
    f.start('BUSY_A'); f.start('BUSY_B');
    await until(() => f.requests.length === 2, 'two provider calls in flight');
    const controller = new AbortController();
    const queued = f.start('CANCELLED_C', { signal: controller.signal });
    await until(() => state.providerRequestQueue.length === 1, 'third request queued');
    controller.abort();
    await until(() => f.done(queued), 'external abort settles queued request');
    await assert.rejects(queued, error => error.name === 'AbortError');
    assert.equal(state.providerRequestQueue.length, 0);
    assert.equal(state.activeProviderRequestCount, 2);
    assert.deepEqual(f.requests, ['BUSY_A', 'BUSY_B']);
});

test('a profile model changed while queued rejects the old request before transport', async t => {
    const f = fixture(t);
    f.network.set('BUSY_A', gate()); f.network.set('BUSY_B', gate());
    f.start('BUSY_A'); f.start('BUSY_B');
    await until(() => f.requests.length === 2, 'two provider calls in flight');
    const queued = f.start('STALE_C');
    await until(() => state.providerRequestQueue.length === 1, 'third request queued');
    f.profile.model = 'changed-fixture-model';
    f.network.get('BUSY_A').resolve({ content: '{"ok":true}' });
    await until(() => f.done(queued), 'stale configuration rejected when queued request is admitted');
    await assert.rejects(queued, { code: 'RMT_API_CONFIG_CHANGED' });
    assert.equal(f.requests.includes('STALE_C'), false);
    assert.equal(state.providerRequestQueue.length, 0);
});

test('an HTTP 200 error envelope applies 429 pressure before releasing the provider permit', async t => {
    const f = fixture(t);
    for (const key of ['LIMIT_A', 'BUSY_B', 'QUEUED_C', 'QUEUED_D']) f.network.set(key, gate());
    const limited = f.start('LIMIT_A'); f.start('BUSY_B');
    await until(() => f.requests.length === 2, 'two provider calls in flight');
    f.start('QUEUED_C'); f.start('QUEUED_D');
    await until(() => state.providerRequestQueue.length === 2, 'two callers queued');
    f.network.get('LIMIT_A').resolve({ error: { code: 429, message: 'rate limit exceeded' } });
    await until(() => f.done(limited), 'envelope failure settles');
    await assert.rejects(limited, { code: 'RMT_CONNECTION_RATE_LIMIT' });
    await flush();
    assert.equal(coordinator.effectiveProviderConcurrency(), 1);
    assert.equal(state.activeProviderRequestCount, 1);
    assert.equal(state.providerRequestQueue.length, 2);
    assert.deepEqual(f.requests, ['LIMIT_A', 'BUSY_B']);
});

test('a permit from an old runtime cannot decrement new runtime counters', async t => {
    fixture(t);
    const oldRelease = await coordinator.acquireProviderRequestPermit();
    state.runtimeLifecycleEpoch += 1;
    state.activeProviderRequestCount = 0;
    const newRelease = await coordinator.acquireProviderRequestPermit();
    oldRelease(); oldRelease();
    assert.equal(state.activeProviderRequestCount, 1);
    newRelease();
    assert.equal(state.activeProviderRequestCount, 0);
});

test('an unknown upstream error is not automatically retried and releases task and provider slots', async t => {
    const f = fixture(t);
    f.context.ConnectionManagerRequestService.sendRequest = async function (_id, messages, _length, _options, overridePayload) {
        const profile = f.profile;
        const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id);
        f.requests.push(messages[0].content.trim().split('\n')[0]);
        throw new Error('PRIVATE_UPSTREAM_FAILURE');
    };
    const request = f.track(client.requestValidatedSegment('UNKNOWN_FAILURE', '', { ...f.options, taskKey: 'UNKNOWN_FAILURE' }, value => value));
    await assert.rejects(request, error => error.code === 'RMT_CONNECTION_FAILED' && error.retryable === false);
    assert.equal(f.requests.length, 1);
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
    assert.doesNotMatch(JSON.stringify(trace.taskTraceSnapshot()), /PRIVATE_|SECRET_/);
});

test('a 429 stops after one send: no automatic second charge', async t => {
    const f = fixture(t);
    f.context.ConnectionManagerRequestService.sendRequest = async function (_id, messages, _length, _options, overridePayload) {
        const profile = f.profile;
        const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id);
        f.requests.push(messages[0].content.trim().split('\n')[0]);
        return { error: { code: 429, message: 'rate limit exceeded' } };
    };
    const request = f.track(client.requestValidatedSegment('RATE_LIMIT', '',
        { ...f.options, taskKey: 'RATE_LIMIT' }, value => value));
    await assert.rejects(request, { code: 'RMT_CONNECTION_RATE_LIMIT' });
    // The whole point of turning auto-retry off: one failure must cost exactly one request.
    assert.equal(f.requests.length, 1, '不得自动再发一次付费请求');
    const row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.providerRequests, 1);
    assert.equal(row.attempt, 1);
    assert.equal(row.outcome, 'failed');
    assert.equal(row.activeStage, '');
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
});

test('opting in to retry still bounds the 429 attempts', async t => {
    const f = fixture(t);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    f.context.ConnectionManagerRequestService.sendRequest = async function (_id, messages, _length, _options, overridePayload) {
        const profile = f.profile;
        const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id);
        f.requests.push(messages[0].content.trim().split('\n')[0]);
        return { error: { code: 429, message: 'rate limit exceeded' } };
    };
    const request = f.track(client.requestValidatedSegment('RATE_LIMIT', '',
        { ...f.options, taskKey: 'RATE_LIMIT', allowAutoRetry: true }, value => value));
    for (let step = 0; step < 50 && !f.done(request); step++) {
        await flush();
        t.mock.timers.tick(10000);
    }
    assert.ok(f.done(request), 'bounded rate-limit retries settled');
    await assert.rejects(request, { code: 'RMT_CONNECTION_RATE_LIMIT' });
    assert.equal(f.requests.length, 2, '显式开启后仍有上限');
    const row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.providerRequests, 2);
    assert.equal(row.attempt, 2);
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
});

test('a validator failure stops after one send and leaves no stale active stage', async t => {
    const f = fixture(t);
    f.context.ConnectionManagerRequestService.sendRequest = async function (_id, messages, _length, _options, overridePayload) {
        const profile = f.profile;
        const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id);
        f.requests.push(messages[0].content.trim().split('\n')[0]);
        return { content: '{"ok":true}' };
    };
    let validations = 0;
    const request = f.track(client.requestValidatedSegment('BAD_SEGMENT', '',
        { ...f.options, taskKey: 'BAD_SEGMENT' }, () => {
            validations++;
            throw new Error('PRIVATE_VALIDATOR_FAILURE');
        }));
    await assert.rejects(request, { code: 'RMT_SEGMENT_VALIDATION' });
    assert.equal(f.requests.length, 1, '校验失败不得自动重发');
    assert.equal(validations, 1);
    const row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.outcome, 'failed');
    assert.equal(row.activeStage, '', '失败后不得留下悬挂的阶段');
    assert.ok(row.stages.some(stage => stage.startsWith('validate!@')));
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
    // The validator's own message must never reach the trace.
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_/);
});

test('opting in to retry clears the previous active stage and response', async t => {
    const f = fixture(t), second = gate(); f.extraGates.push(second);
    f.context.ConnectionManagerRequestService.sendRequest = async function (_id, messages, _length, _options, overridePayload) {
        const profile = f.profile;
        const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id);
        f.requests.push(messages[0].content.trim().split('\n')[0]);
        if (f.requests.length > 1) await second.promise;
        return { content: '{"ok":true}' };
    };
    let validations = 0;
    const request = f.track(client.requestValidatedSegment('BAD_SEGMENT', '',
        { ...f.options, taskKey: 'BAD_SEGMENT', allowAutoRetry: true }, () => {
            validations++;
            throw new Error('PRIVATE_VALIDATOR_FAILURE');
        }));
    await until(() => f.requests.length === 2, 'second actual request started');
    let row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.outcome, 'running');
    assert.equal(row.activeStage, 'request');
    assert.equal(row.attempt, 2);
    assert.equal(row.providerRequests, 2);
    assert.equal(row.retryCode, 'RMT_SEGMENT_VALIDATION');
    assert.equal(row.response, undefined);
    assert.ok(row.stages.some(stage => stage.startsWith('validate!@')));
    second.resolve();
    await assert.rejects(request, { code: 'RMT_SEGMENT_VALIDATION' });
    assert.equal(f.requests.length, 2);
    assert.equal(validations, 2);
    row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.outcome, 'failed');
    assert.equal(row.activeStage, '');
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_/);
});

test('five logical tasks reject a sixth independent task while an existing parent may run a child', async t => {
    const f = fixture(t);
    const savedScopes = [...state.activeModeBuildScopes];
    t.after(() => { state.activeModeBuildScopes.clear(); for (const scope of savedScopes) state.activeModeBuildScopes.add(scope); });
    for (let i = 0; i < 5; i++) state.activeModeBuildScopes.add(`PARENT_${i}`);
    assert.equal(coordinator.activeLogicalGenerationCount(), 5);
    assert.equal(coordinator.canStartGenerationTask('SIXTH'), false);
    await assert.rejects(f.start('SIXTH'), /5/);
    // A failing input budget proves the child passed task admission without sending to the provider.
    f.context.getTokenCountAsync = async () => constants.MAX_GENERATION_INPUT_TOKENS + 1;
    await assert.rejects(f.start('PARENT_0:CHILD', { parentTaskKey: 'PARENT_0' }), { code: 'RMT_INPUT_BUDGET' });
    assert.equal(f.requests.length, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
    assert.equal(state.activeProviderRequestCount, 0);
});
