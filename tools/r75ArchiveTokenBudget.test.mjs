import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPromptBudget, generateConfiguredJson } from '../src/generation/client.js';
import * as constants from '../src/core/constants.js';

test('aborting a stuck host token count settles immediately and sends no generation request', async () => {
    const controller = new AbortController();
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    let providerCalls = 0;
    const context = {
        name1: '用户', name2: '角色',
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { useActivatedWorldInfo: false } },
        getTokenCountAsync() { entered(); return new Promise(() => {}); },
        ConnectionManagerRequestService: { sendRequest() { providerCalls++; throw new Error('must not send'); } },
    };
    const request = generateConfiguredJson('{}', { context, contextEnvelope: '', signal: controller.signal });
    await ready;
    controller.abort();
    await assert.rejects(request, error => error.name === 'AbortError');
    assert.equal(providerCalls, 0);
});

test('a token counter timeout no longer blocks inputs within the original character budget', async () => {
    const context = { getTokenCountAsync: () => new Promise(() => {}) };
    await assert.doesNotReject(assertPromptBudget(context, 'fixture prompt', { tokenCountTimeoutMs: 1 }));
});

test('token and character hard limits remain enforced', async () => {
    await assert.rejects(assertPromptBudget({ getTokenCountAsync: async () => constants.MAX_GENERATION_INPUT_TOKENS + 1 }, 'small'),
        error => error.code === 'RMT_INPUT_BUDGET');
    await assert.rejects(assertPromptBudget({}, 'x'.repeat(constants.MAX_GENERATION_INPUT_CHARS + 1), { skipTokenCount: true }),
        error => error.code === 'RMT_INPUT_BUDGET');
});
