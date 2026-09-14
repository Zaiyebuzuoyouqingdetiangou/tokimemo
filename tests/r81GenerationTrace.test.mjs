import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../src/generation/client.js';
import * as constants from '../src/core/constants.js';
import * as trace from '../src/core/taskTrace.js';
import { state } from '../src/core/state.js';

function fixture(t) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    trace.clearTaskTrace();
    t.after(() => { trace.clearTaskTrace(); descriptor ? Object.defineProperty(globalThis, 'document', descriptor) : delete globalThis.document; });
    const profile = { id: 'trace-fixture', mode: 'cc', api: 'openai', model: 'fixture', 'secret-id': 'SECRET_REFERENCE' };
    const requests = [], counted = [];
    let response = 'PRIVATE_PROSE_WITHOUT_JSON';
    const context = { name1: 'PRIVATE_USER', name2: 'PRIVATE_CHAR',
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { connectionProfileId: profile.id,
            useActivatedWorldInfo: false, excludedContextTags: ['thinking'] }, connectionManager: { profiles: [profile] } },
        getTokenCountAsync: async text => { counted.push(text); return 40; },
        ConnectionManagerRequestService: { validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, messages, _length, _options, overridePayload) { const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload }; assert.ok(payload.secret_id); requests.push(messages); return typeof response === 'function' ? response(messages) : { content: response }; } },
    };
    const options = { context, contextEnvelope: '', mode: 'travel', taskKey: 'PRIVATE_CHAT_SCOPE',
        origin: { lifecycleEpoch: state.runtimeLifecycleEpoch, archiveTargetEntryId: 'PRIVATE_ARCHIVE' } };
    return { context, options, requests, counted, setResponse: value => { response = value; } };
}

test('budget counts the exact filtered payload sent, including JSON string source fields', async t => {
    const f = fixture(t);
    f.setResponse('{"ok":true}');
    const prompt = JSON.stringify({ source: '<thinking>' + 'x'.repeat(100000) + '</thinking>保留人设' });
    assert.deepEqual(await client.generateConfiguredJson(prompt, f.options), { ok: true });
    assert.equal(f.counted.length, 1);
    assert.equal(f.counted[0], f.requests[0][0].content);
    assert.match(f.counted[0], /保留人设/);
    assert.ok(f.counted[0].length < 1000);
});

test('derived failure exports mode, stage and code while excluding all source text', async t => {
    const f = fixture(t);
    await assert.rejects(client.requestJson('PRIVATE_PROMPT', 'PRIVATE_LABEL', f.options), { code: 'RMT_JSON_NOT_FOUND' });
    const entries = trace.taskTraceSnapshot();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].mode, 'travel');
    assert.equal(entries[0].outcome, 'failed');
    assert.equal(entries[0].code, 'RMT_JSON_NOT_FOUND');
    assert.ok(entries[0].stages.some(stage => stage.startsWith('parse!@')));
    assert.equal(entries[0].response.shape, 'content');
    assert.equal(entries[0].response.finalChars, 'PRIVATE_PROSE_WITHOUT_JSON'.length);
    assert.equal(entries[0].input.chars, f.requests[0][0].content.length);
    assert.equal(entries[0].input.tokens, 40);
    assert.doesNotMatch(JSON.stringify(entries), /PRIVATE_|SECRET_/);
    assert.equal(state.activeGenerationTasks.size, 0);
    assert.equal(state.activeProviderRequestCount, 0);
});

test('known excessive input is a recorded preflight failure with zero provider calls', async t => {
    const f = fixture(t);
    f.context.getTokenCountAsync = async () => constants.MAX_GENERATION_INPUT_TOKENS + 1;
    await assert.rejects(client.requestJson('{}', '', f.options), { code: 'RMT_INPUT_BUDGET' });
    const entry = trace.taskTraceSnapshot().at(-1);
    assert.equal(entry?.code, 'RMT_INPUT_BUDGET');
    assert.equal(entry.input.tokens, constants.MAX_GENERATION_INPUT_TOKENS + 1);
    assert.equal(f.requests.length, 0);
});


test('standalone segment diagnostics wait for the validator instead of declaring success after parsing', async t => {
    const f = fixture(t); f.setResponse('{"ok":true}');
    const error = Object.assign(new Error('PRIVATE_VALIDATOR'), { code: 'RMT_SEGMENT_VALIDATION', retryable: false });
    await assert.rejects(client.requestValidatedSegment('{}', '', { ...f.options, segmentMaxAttempts: 1 }, () => { throw error; }), { code: error.code });
    const row = trace.taskTraceSnapshot().at(-1);
    assert.equal(row.outcome, 'failed'); assert.equal(row.code, error.code);
    assert.ok(row.stages.some(stage => stage.startsWith('validate!@')));
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_/);
});

test('concurrent segments retain separate active stages and matching input-response summaries', async t => {
    const f = fixture(t);
    let enterFirst, releaseFirst;
    const entered = new Promise(resolve => { enterFirst = resolve; });
    const paused = new Promise(resolve => { releaseFirst = resolve; });
    f.context.getTokenCountAsync = async prompt => prompt.includes('FIRST_SEGMENT') ? 41 : 82;
    f.setResponse(async messages => {
        if (messages[0].content.includes('FIRST_SEGMENT')) { enterFirst(); await paused; return { content: '{"ok":true}' }; }
        return { content: 'PRIVATE_NO_JSON_SECOND' };
    });
    const parent = trace.startTaskTrace('PRIVATE_PARENT', 'album');
    const first = client.requestValidatedSegment('FIRST_SEGMENT', '', { ...f.options, taskKey: 'PRIVATE_FIRST', taskTrace: parent, segmentMaxAttempts: 1 }, value => value);
    await entered;
    await assert.rejects(client.requestValidatedSegment('SECOND_SEGMENT', '', { ...f.options, taskKey: 'PRIVATE_SECOND', taskTrace: parent, segmentMaxAttempts: 1 }, value => value), { code: 'RMT_JSON_NOT_FOUND' });
    let requests = trace.taskTraceSnapshot()[0].requests;
    assert.equal(requests.length, 2);
    assert.equal(requests[0].activeStage, 'request');
    assert.equal(requests[1].outcome, 'failed');
    assert.equal(requests[1].input.tokens, 82);
    assert.equal(requests[1].response.finalChars, 'PRIVATE_NO_JSON_SECOND'.length);
    assert.ok(requests[1].stages.some(stage => stage.startsWith('parse!@')));
    releaseFirst(); assert.deepEqual(await first, { ok: true });
    requests = trace.taskTraceSnapshot()[0].requests;
    assert.equal(requests[0].outcome, 'ok'); assert.equal(requests[0].input.tokens, 41);
    assert.equal(requests[0].response.finalChars, '{"ok":true}'.length);
    assert.doesNotMatch(JSON.stringify(trace.taskTraceSnapshot()), /PRIVATE_|FIRST_SEGMENT|SECOND_SEGMENT/);
});
