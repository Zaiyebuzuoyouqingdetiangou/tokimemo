import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../src/generation/client.js';
import * as coordinator from '../src/core/requestCoordinator.js';
import * as constants from '../src/core/constants.js';
import * as text from '../src/core/text.js';
import * as trace from '../src/core/taskTrace.js';
import { state } from '../src/core/state.js';

test('long local queue followed by an immediate opaque failure keeps an unknown connection diagnosis', async t => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    trace.clearTaskTrace();
    coordinator.resetProviderRateLimitThrottle();
    const controller = new AbortController();
    const releases = [];
    let request, sends = 0;
    t.after(async () => {
        controller.abort();
        for (const release of releases) release();
        if (request) await Promise.allSettled([request]);
        coordinator.resetProviderRateLimitThrottle();
        trace.clearTaskTrace();
        documentDescriptor ? Object.defineProperty(globalThis, 'document', documentDescriptor) : delete globalThis.document;
    });
    const profile = { id: 'diagnostic-fixture', mode: 'cc', api: 'openai', model: 'fixture', 'secret-id': 'FAKE_REFERENCE' };
    const context = {
        name1: 'PRIVATE_USER', name2: 'PRIVATE_CHAR',
        extensionSettings: {
            [constants.EXTENSION_SETTINGS_KEY]: { connectionProfileId: profile.id, useActivatedWorldInfo: false },
            connectionManager: { profiles: [profile] },
        },
        getTokenCountAsync: async () => 40,
        ConnectionManagerRequestService: {
            validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, _messages, _length, _options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.ok(payload.secret_id);
                sends++;
                throw new Error('PRIVATE_OPAQUE_FAILURE');
            },
        },
    };
    releases.push(await coordinator.acquireProviderRequestPermit(), await coordinator.acquireProviderRequestPermit());
    request = client.requestValidatedSegment('TEST', '', {
        context, contextEnvelope: '', mode: 'travel', taskKey: 'queue-diagnostic', signal: controller.signal,
        origin: { lifecycleEpoch: state.runtimeLifecycleEpoch, archiveTargetEntryId: 'PRIVATE_ARCHIVE' },
    }, value => value).then(value => ({ value }), error => ({ error }));
    const deadline = Date.now() + 1000;
    while (!state.providerRequestQueue.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(state.providerRequestQueue.length, 1, 'request reaches the occupied provider gate');
    assert.equal(sends, 0, 'queueing has not called the provider');
    const afterQueue = Date.now() + 120000;
    t.mock.method(Date, 'now', () => afterQueue);
    releases[0]();
    const { error } = await request;
    releases[1]();
    assert.equal(sends, 1, 'unknown failure is not automatically retried');
    assert.equal(error?.code, 'RMT_CONNECTION_FAILED', 'time queued does not identify a gateway cutoff');
    assert.doesNotMatch(text.safeErrorSummary(error), /被上游网关切断|不是\s*API Key|不是.*模型设置|分段全部保留/);
    const row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.code, 'RMT_CONNECTION_FAILED', 'export retains the recognized connection code');
    assert.equal(row.providerRequests, 1);
    assert.equal(row.outcome, 'failed');
    assert.equal(row.activeStage, '');
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.providerRequestQueue.length, 0);
    assert.equal(state.activeGenerationTasks.size, 0);
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_/);
});

test('elapsed time alone cannot establish a gateway cause or rule out API configuration', () => {
    for (const elapsedMs of [0, 90000, 120000, 300000]) {
        const error = client.normalizeConnectionManagerError(new Error('opaque failure'), { elapsedMs, receivedResponse: false });
        assert.equal(error.code, 'RMT_CONNECTION_FAILED', `${elapsedMs}ms has no causal evidence`);
        assert.equal(error.retryable, false);
        assert.doesNotMatch(text.safeErrorSummary(error), /被上游网关切断|不是\s*API Key|不是.*模型设置/);
    }
});

test('explicit HTTP evidence keeps its classification without promising an automatic retry', t => {
    t.after(() => coordinator.resetProviderRateLimitThrottle());
    for (const [status, code] of [[401, 'RMT_CONNECTION_AUTH'], [429, 'RMT_CONNECTION_RATE_LIMIT'], [504, 'RMT_CONNECTION_SERVER']]) {
        const source = Object.assign(new Error('provider failure'), { status });
        const error = client.normalizeConnectionManagerError(source, { elapsedMs: 120000, receivedResponse: false });
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /本段会等待后重试|仅对本段按等待窗口有界重试/);
        assert.equal(text.safeErrorDiagnostic(error).code, code);
    }
});
