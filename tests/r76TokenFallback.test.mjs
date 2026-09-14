import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConfiguredJson, requestJson } from '../src/generation/client.js';
import * as constants from '../src/core/constants.js';
import * as trace from '../src/core/taskTrace.js';
import { state } from '../src/core/state.js';

function fixture(t, counter) {
    const profile = { id: 'fixture', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-reference' };
    const warnings = [];
    const oldWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    t.after(() => { console.warn = oldWarn; trace.clearTaskTrace(); });
    let calls = 0;
    const context = {
        name1: '用户', name2: '角色', getTokenCountAsync: counter,
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: {
            apiConnectionMode: 'profile', connectionProfileId: profile.id, useActivatedWorldInfo: false,
        }, connectionManager: { profiles: [profile] } },
        ConnectionManagerRequestService: {
            validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, _messages, _length, options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-reference');
                assert.equal(options.signal.aborted, false);
                assert.equal(state.activeProviderRequestCount, 1, 'only the actual transport holds a permit');
                calls++;
                return { content: '{"ok":true}' };
            },
        },
    };
    const task = trace.startTaskTrace('private-task-key', 'phone');
    return { context, warnings, task, calls: () => calls,
        generate: (options = {}, prompt = 'PRIVATE_FIXTURE_PROMPT') => generateConfiguredJson(prompt,
            { context, contextEnvelope: '', tokenCountTimeoutMs: 1, taskTrace: task, ...options }) };
}

function released() {
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.providerRequestQueue.length, 0);
}

test('a stalled tokenizer permits one normal request; late token result cannot dispatch again', async t => {
    let resolveCount;
    const env = fixture(t, () => new Promise(resolve => { resolveCount = resolve; }));
    assert.deepEqual(await env.generate(), { ok: true });
    assert.equal(env.calls(), 1);
    resolveCount(constants.MAX_GENERATION_INPUT_TOKENS + 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls(), 1);
    released();
    assert.ok(trace.taskTraceSnapshot().at(-1).stages.some(item => item.startsWith('token-count-fallback@')));
    assert.ok(!JSON.stringify(env.warnings).includes('PRIVATE_FIXTURE_PROMPT'));
});

test('late tokenizer rejection is consumed without another request or a raw error log', async t => {
    let rejectCount;
    const env = fixture(t, () => new Promise((_resolve, reject) => { rejectCount = reject; }));
    await env.generate();
    rejectCount(new Error('PRIVATE_TOKENIZER_RESPONSE'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls(), 1);
    released();
    assert.ok(!JSON.stringify(env.warnings).includes('PRIVATE_TOKENIZER_RESPONSE'));
});

test('unavailable tokenizer retains the original bounded character fallback', async t => {
    const env = fixture(t, async () => { throw new Error('PRIVATE_TOKENIZER_RESPONSE'); });
    assert.deepEqual(await env.generate(), { ok: true });
    assert.equal(env.calls(), 1);
    released();
    assert.ok(!JSON.stringify(env.warnings).includes('PRIVATE_TOKENIZER_RESPONSE'));
});

test('invalid counter results use the same fallback; numeric token strings still enforce the known limit', async t => {
    const env = fixture(t, async () => undefined);
    assert.deepEqual(await env.generate(), { ok: true });
    env.context.getTokenCountAsync = async () => String(constants.MAX_GENERATION_INPUT_TOKENS + 1);
    await assert.rejects(env.generate(), { code: 'RMT_INPUT_BUDGET' });
    assert.equal(env.calls(), 1);
    released();
});

test('oversize characters stop before counting or requesting, and known oversize tokens stop before requesting', async t => {
    let counted = 0;
    const env = fixture(t, async () => { counted++; return constants.MAX_GENERATION_INPUT_TOKENS + 1; });
    await assert.rejects(env.generate({}, 'x'.repeat(constants.MAX_GENERATION_INPUT_CHARS + 1)), { code: 'RMT_INPUT_BUDGET' });
    assert.equal(counted, 0);
    await assert.rejects(env.generate(), { code: 'RMT_INPUT_BUDGET' });
    assert.equal(counted, 1);
    assert.equal(env.calls(), 0);
    released();
});

test('cancelling pending token count prevents provider dispatch even when the counter resolves later', async t => {
    let entered, resolveCount;
    const ready = new Promise(resolve => { entered = resolve; });
    const controller = new AbortController();
    const env = fixture(t, () => { entered(); return new Promise(resolve => { resolveCount = resolve; }); });
    const request = env.generate({ signal: controller.signal, tokenCountTimeoutMs: 5000 });
    await ready;
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    resolveCount(100);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls(), 0);
    released();
});

for (const cancel of [false, true]) test(`real request task keeps preflight outside the permit and releases after token ${cancel ? 'cancellation' : 'fallback'}`, async t => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    t.after(() => originalDocument ? Object.defineProperty(globalThis, 'document', originalDocument) : delete globalThis.document);
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const env = fixture(t, () => { entered(); return new Promise(() => {}); });
    const taskKey = 'r76-permit-fixture';
    const pending = requestJson('{}', 'fixture', { context: env.context, contextEnvelope: '', taskKey,
        tokenCountTimeoutMs: cancel ? 5000 : 1,
        origin: { lifecycleEpoch: state.runtimeLifecycleEpoch, archiveTargetEntryId: 'fixture-entry' } });
    await ready;
    assert.equal(state.activeProviderRequestCount, 0);
    assert.equal(state.activeGenerationTasks.size, 1);
    if (cancel) {
        state.activeGenerationTasks.get(taskKey).controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
    } else assert.deepEqual(await pending, { ok: true });
    assert.equal(env.calls(), cancel ? 0 : 1);
    released();
    assert.equal(state.activeGenerationTasks.size, 0);
});
