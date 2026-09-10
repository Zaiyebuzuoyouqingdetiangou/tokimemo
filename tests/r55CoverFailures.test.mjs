import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveProfilePrompt, normalizeArchiveProfile } from '../src/archive/repository.js';
import { normalizeConnectionManagerError } from '../src/generation/client.js';
import { requestManualApiCompletion, assertIndependentResponsePayload } from '../src/core/independentApi.js';
import { shouldRetrySegmentRequest } from '../src/core/requestCoordinator.js';
import { safeErrorSummary } from '../src/core/text.js';

const memories = [{ id: 'M001', title: '雨棚等候', summary: '林舟在雨棚下等小雨下班，两人约好明天再见。', anchors: ['雨棚等候'] }];
const profile = () => ({ archiveName: '雨停之前', archiveVerdict: '把等待留在雨声里，把明天留给还没有说完的话。',
    relationshipReading: { char: '他愿意等候', user: '她答应再见', relation: '已有下一次见面的约定，未确认恋爱' },
    verdictSources: [{ memoryId: 'M001', anchor: '雨棚等候' }], keywords: ['等候'] });
const settings = { manualApiBaseUrl: 'https://example.invalid/v1', manualApiKey: 'test-only', manualApiModel: 'fixture' };
const context = { getRequestHeaders: () => ({}) };

test('r55 cover asks for a relationship verdict, not a plot summary', () => {
    const prompt = archiveProfilePrompt({ name1: '小雨', name2: '林舟' }, memories);
    assert.match(prompt, /判词/);
    assert.match(prompt, /双方/);
    assert.doesNotMatch(prompt, /archiveSummary 用 120～300/);
    assert.equal(normalizeArchiveProfile(profile(), memories).archiveVerdict?.text, profile().archiveVerdict);
});
test('r55 verdict never accepts an unanchored or copied factual summary', () => {
    assert.equal(normalizeArchiveProfile({ ...profile(), verdictSources: [{ memoryId: 'M999', anchor: '雨棚等候' }] }, memories).archiveVerdict, null);
    assert.equal(normalizeArchiveProfile({ ...profile(), archiveVerdict: memories[0].summary }, memories).archiveVerdict, null);
    assert.equal(normalizeArchiveProfile({ ...profile(), archiveVerdict: '长'.repeat(200) }, memories).archiveVerdict, null);
    assert.equal(normalizeArchiveProfile({}, memories).archiveVerdict, null);
});
test('r55 explicit status wins over mixed authentication words', () => {
    const failure = normalizeConnectionManagerError({ status: 429, message: 'authentication rate limit exceeded' });
    assert.equal(failure.code, 'RMT_CONNECTION_RATE_LIMIT');
    assert.equal(normalizeConnectionManagerError({ status: 429, message: 'cloudflare API rate limit exceeded' }).code, 'RMT_CONNECTION_RATE_LIMIT');
    assert.equal(normalizeConnectionManagerError({ status: 503, message: 'invalid key backend unavailable' }).code, 'RMT_CONNECTION_SERVER');
});
test('r55 JSON error envelopes retain safe typed errors, not bodies or invented HTTP status', async () => {
    for (const [code, expected] of [[401, 'RMT_CONNECTION_AUTH'], [429, 'RMT_CONNECTION_RATE_LIMIT']]) {
        const payload = { error: { code, message: 'private provider body never displayed' } };
        await assert.rejects(requestManualApiCompletion(settings, context, [{ role: 'user', content: 'fixture' }], 30,
            { fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) }), error => {
            assert.equal(normalizeConnectionManagerError(error).code, expected);
            assert.doesNotMatch(safeErrorSummary(error), /private provider/);
            return true;
        });
        assert.throws(() => assertIndependentResponsePayload(payload), error => normalizeConnectionManagerError(error).code === expected);
    }
});
test('r55 HTTP headers classify HTML without consuming its body and respect long cooldowns', async () => {
    await assert.rejects(requestManualApiCompletion(settings, context, [{ role: 'user', content: 'fixture' }], 30,
        { fetchImpl: async () => new Response('<html>private</html>', { status: 403, headers: { 'content-type': 'text/html' } }) }),
        error => normalizeConnectionManagerError(error).code === 'RMT_RESPONSE_HTML');
    await assert.rejects(requestManualApiCompletion(settings, context, [{ role: 'user', content: 'fixture' }], 30,
        { fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }) }), error => {
        const normalized = normalizeConnectionManagerError(error);
        assert.equal(normalized.retryAfterMs, 120000);
        assert.equal(shouldRetrySegmentRequest(normalized), false);
        return true;
    });
});
