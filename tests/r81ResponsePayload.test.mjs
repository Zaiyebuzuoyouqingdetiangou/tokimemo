import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/core/independentApi.js';
import { extractJson } from '../src/generation/jsonParser.js';
import { MAX_GENERATION_OUTPUT_CHARS } from '../src/core/constants.js';

const expected = { title: '庭院中的回声', lines: ['他说：留下来。', '她合上了门。'] };
const final = JSON.stringify(expected);
const parse = payload => extractJson(api.assertIndependentResponsePayload(payload));

test('standard final text, content blocks and provider envelopes keep their actual final JSON', () => {
    const cases = [
        final,
        { content: final, reasoning: 'private reasoning' },
        { choices: [{ index: 0, message: { role: 'assistant', content: final }, finish_reason: 'stop' }] },
        { message: { role: 'assistant', content: [{ type: 'text', text: final }] } },
        { content: [{ type: 'text', text: { value: final } }] },
        { output_text: final },
        { output: [{ type: 'web_search_call', status: 'completed' },
            { type: 'reasoning', summary: [{ text: 'private reasoning' }] },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: final }] }] },
        { candidates: [{ content: { role: 'model', parts: [{ text: final }] }, finishReason: 'STOP' }] },
        { text: final },
        { choices: [{ text: final }] },
        { choices: [{ delta: { content: final } }] },
    ];
    for (const payload of cases) {
        assert.equal(api.extractIndependentResponseContent(payload), final);
        assert.deepEqual(parse(payload), expected);
    }
});

test('explicit final fields outrank generic wrapper text without mixing independent choices', () => {
    for (const payload of [
        { text: '请求已经完成', content: final },
        { message: '请求已经完成', content: final },
        { text: '请求已经完成', output_text: final },
        { text: '请求已经完成', output: [{ type: 'message', content: [{ type: 'output_text', text: final }] }] },
        { text: '请求已经完成', data: { content: final } },
        { choices: [{ index: 1, message: { content: '{"wrong":true}' } },
            { index: 0, message: { content: final } }] },
    ]) assert.equal(api.extractIndependentResponseContent(payload), final);
});

test('known nested final envelopes are unwrapped, arbitrary data objects are never serialized as model output', () => {
    for (const payload of [
        { result: { message: { content: final } } },
        { data: { output: [{ type: 'message', content: [{ type: 'output_text', text: final }] }] } },
        { response: { choices: [{ message: { content: final } }] } },
        { body: { data: { content: final } } },
    ]) assert.deepEqual(parse(payload), expected);
    for (const payload of [expected, { content: expected }, { unexpected: { content: final } },
        { data: { unexpected: final } }, { content: { unexpected: final } }]) {
        assert.throws(() => parse(payload), error => error.code === 'RMT_RESPONSE_FORMAT' && error.retryable === false);
    }
    assert.throws(() => extractJson(expected), error => error.code === 'RMT_RESPONSE_FORMAT');
});

test('reasoning, tools, refusals and an empty final cannot become usable final output', () => {
    const blocks = [
        { type: 'reasoning', text: '{"wrong":"reasoning"}' },
        { type: 'thinking', text: '{"wrong":"thinking"}' },
        { type: 'tool_result', content: '{"wrong":"tool"}' },
        { type: 'web_search_call', text: '{"wrong":"search tool"}' },
        { type: 'refusal', text: '{"wrong":"refusal"}' },
        { type: 'error', text: '{"wrong":"error"}' },
        { role: 'tool', content: '{"wrong":"tool role"}' },
        { type: 'text', text: final },
    ];
    assert.equal(api.extractIndependentResponseContent({ content: blocks }), final);
    assert.equal(api.extractIndependentResponseContent({ candidates: [{ content: { parts: [
        { thought: true, text: '{"wrong":"thought"}' }, { text: final },
    ] } }] }), final);
    for (const payload of [
        { content: '', reasoning: final, text: final },
        { output: [{ type: 'reasoning', text: final }], text: final },
        { message: { role: 'tool', content: final } },
        { choices: [{ message: { content: final, refusal: 'refused' } }] },
        { choices: [{ finish_reason: 'tool_calls', message: { content: final, tool_calls: [{ type: 'function' }] } }] },
    ]) assert.throws(() => parse(payload), error => /^RMT_JSON_EMPTY_FINAL/.test(error.code));
});

test('provider errors and HTML still fail before any embedded JSON can be accepted', () => {
    for (const payload of [
        { error: { message: 'private provider text' }, content: final },
        { result: { success: false, content: final } },
        { data: { status: 403, content: final } },
    ]) assert.throws(() => api.assertIndependentResponsePayload(payload), error => /RMT_(?:MANUAL_PROVIDER_ERROR|PROVIDER_STATUS|CONNECTION_)/.test(error.code));
    assert.throws(() => api.assertIndependentResponsePayload(`<html><body>${final}</body></html>`),
        error => error.code === 'RMT_RESPONSE_HTML');
});

test('a complete JSON fence is readable even if preceding prose contains an unmatched opening brace', () => {
    assert.deepEqual(extractJson(`说明：这里有一个 {，正文如下。\n\`\`\`json\n${final}\n\`\`\``), expected);
    const tricky = { text: '字面量 } { 与 \\" 引号，还有 ```json 和 ``` 标记。' };
    assert.deepEqual(extractJson(JSON.stringify(tricky)), tricky);
    assert.deepEqual(extractJson(`前言\n\`\`\`json\n${JSON.stringify(tricky)}\n\`\`\`\n后记`), tricky);
    assert.throws(() => extractJson('只有一段散文。'), error => error.code === 'RMT_JSON_NOT_FOUND');
    assert.throws(() => extractJson('{"title":"未完成'), error => error.code === 'RMT_JSON_TRUNCATED');
    assert.throws(() => extractJson('{"title":}'), error => error.code === 'RMT_JSON_INVALID');
    assert.throws(() => extractJson('', { reasoning: '仍在推理' }), error => error.code === 'RMT_JSON_EMPTY_FINAL_WITH_REASONING');
});

test('response shape diagnostics expose only fixed labels, capped counts and allowlisted finish reasons', () => {
    const secret = 'PRIVATE_MODEL_URL_KEY_TEXT';
    const payload = { model: secret, url: secret, [secret]: secret,
        choices: [{ message: { content: final, reasoning_content: secret }, finish_reason: 'stop' }] };
    assert.deepEqual(api.responseShapeSummary(payload), {
        shape: 'choices', finalChars: final.length, reasoningChars: secret.length, finishReason: 'stop',
    });
    const hidden = api.responseShapeSummary({ result: { content: final, reasoning: secret, finish_reason: secret } });
    assert.equal(hidden.shape, 'wrapped'); assert.equal(hidden.finalChars, final.length);
    assert.equal(hidden.reasoningChars, secret.length); assert.equal(hidden.finishReason, 'unknown');
    assert.doesNotMatch(JSON.stringify(hidden), /PRIVATE|MODEL|URL|KEY|TEXT/);
    assert.deepEqual(api.responseShapeSummary({ secret }), {
        shape: 'unsupported', finalChars: 0, reasoningChars: 0, finishReason: 'none',
    });
    assert.equal(api.responseShapeSummary({ content: 'a'.repeat(MAX_GENERATION_OUTPUT_CHARS + 1) }).finalChars,
        MAX_GENERATION_OUTPUT_CHARS);
    assert.equal(api.responseShapeSummary({ error: { message: secret }, content: final }).shape, 'error');
    assert.equal(api.responseShapeSummary({ get content() { throw new Error(secret); } }).shape, 'unsupported');
    const cyclic = {}; cyclic.data = cyclic;
    assert.equal(api.responseShapeSummary(cyclic).shape, 'unsupported');
});
