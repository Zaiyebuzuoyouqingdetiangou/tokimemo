import test from 'node:test';
import assert from 'node:assert/strict';
import * as text from '../src/core/text.js';
import * as recovery from '../src/generation/recovery.js';
import * as constants from '../src/core/constants.js';
import { recoveryBannerHtml } from '../src/ui/recoveryView.js';

const mode = constants.MODE.PHONE;
const origin = { characterKey: 'fixture-character', characterId: '0', characterAvatar: 'fixture.png',
    chatId: 'fixture-chat', archiveRevision: 'fixture-revision' };
const options = { origin, mode, taskKey: 'fixture-segment', contextEnvelope: '' };
const secret = 'PRIVATE_PROVIDER_BODY_AND_KEY';
const validate = value => value;

function timeoutError() {
    return Object.assign(new Error(secret), { code: 'RMT_TOKEN_COUNT_TIMEOUT', response: { body: secret }, prompt: secret });
}

async function createHandle(extra = {}) {
    return recovery.createGenerationRecovery({ origin, mode, settingsIdentity: 'fixture-settings',
        save: async () => true, ...extra });
}

function banner(journal, { bank = origin, ...display } = {}) {
    return recoveryBannerHtml({ [recovery.GENERATION_RECOVERY_CACHE_KEY]: {
        [mode]: { ...journal, [constants.SESSION_MODE_WRITE_FENCE_KEY]: '' },
    } }, bank, display);
}

test('token timeout survives safe diagnostics and phone draft summaries without raw error text', () => {
    const diagnostic = text.safeErrorDiagnostic(timeoutError());
    assert.equal(diagnostic.code, 'RMT_TOKEN_COUNT_TIMEOUT');
    assert.ok(!JSON.stringify(diagnostic).includes(secret));
    const summary = text.safeErrorSummary({ code: 'RMT_PHONE_DRAFT_AVAILABLE', failure: diagnostic,
        partialProgress: { completed: 1, total: 3 } });
    assert.match(summary, /1\/3 个应用/);
    assert.match(summary, /输入检查超时/);
    assert.ok(!summary.includes(secret));
    const legacy = text.safeErrorSummary({ code: 'RMT_PHONE_DRAFT_AVAILABLE', failure: { name: 'Error' } });
    assert.ok(!legacy.includes('超时'), 'missing legacy causes must not be guessed');
});

test('a persisted r75 token timeout renders its known cause after reopening', async () => {
    const handle = await createHandle();
    const journal = recovery.generationRecoverySnapshot(handle);
    // r75 wrote this code directly, but its message whitelist did not recognize it.
    journal.failureCode = 'RMT_TOKEN_COUNT_TIMEOUT';
    journal.segments = [{ slot: options.taskKey, requestHash: 'a'.repeat(64), state: 'retry',
        failureCode: 'RMT_TOKEN_COUNT_TIMEOUT' }];
    const html = banner(JSON.parse(JSON.stringify(journal)));
    assert.match(html, /输入检查超时/);
    assert.match(html, /本段未发送/);
    assert.match(html, /重试未完成部分/);
    assert.match(html, /生成额度/);
    assert.ok(!html.includes('没有可识别的错误原因'));
    assert.ok(!html.includes('RMT_TOKEN_COUNT_TIMEOUT'));
    assert.equal(banner(journal, { readOnly: true }), '');
    assert.equal(banner(journal, { bank: { ...origin, archiveRevision: 'other-revision' } }), '');
});

test('known timeout is retained through the real recovery save seam and successful segments replay', async () => {
    const saved = [];
    const handle = await createHandle({ save: async journal => { saved.push(journal); return true; } });
    recovery.attachGenerationRecovery(origin, handle);
    try {
        const completeOptions = { ...options, taskKey: 'already-complete' };
        await recovery.withRecoverySegment('first prompt', completeOptions, validate, async (_prompt, _options, accepted) => {
            const result = { value: 'validated first segment' };
            await accepted(result);
            return result;
        });
        const error = timeoutError();
        await assert.rejects(recovery.withRecoverySegment('second prompt', options, validate, async () => { throw error; }),
            failure => failure === error);
        assert.equal(saved.at(-1).failureCode, 'RMT_TOKEN_COUNT_TIMEOUT');
        assert.ok(!JSON.stringify(saved).includes(secret));
        assert.match(banner(saved.at(-1)), /已保留 1 个成功分段/);
        const resumed = await createHandle({ continueRequested: true, existing: saved.at(-1) });
        recovery.attachGenerationRecovery(origin, resumed);
        let generationCalls = 0;
        const first = await recovery.withRecoverySegment('first prompt', completeOptions, validate, async () => {
            generationCalls++;
            throw new Error('completed segment must not regenerate');
        });
        assert.equal(first.value, 'validated first segment');
        await recovery.withRecoverySegment('second prompt', options, validate, async (_prompt, _options, accepted) => {
            generationCalls++;
            const result = { value: 'newly completed segment' };
            await accepted(result);
            return result;
        });
        assert.equal(generationCalls, 1);
        const summary = recovery.generationRecoveryForOrigin(origin);
        assert.equal(summary.completed, 2);
        assert.equal(summary.failed, 0);
        assert.equal(summary.failureCode, '');
    } finally { recovery.detachGenerationRecovery(origin); }
});

test('arbitrary RMT-prefixed error values do not enter recovery storage at either failure seam', async () => {
    const handle = await createHandle();
    recovery.attachGenerationRecovery(origin, handle);
    const error = Object.assign(new Error(secret), { code: `RMT_${secret}` });
    try {
        await assert.rejects(recovery.withRecoverySegment('prompt', options, validate, async () => { throw error; }),
            failure => failure === error);
        await recovery.noteGenerationRecoveryFailure(origin, error);
        const snapshot = recovery.generationRecoverySnapshot(handle);
        assert.equal(snapshot.failureCode, 'RMT_RECOVERY_FAILED');
        assert.equal(snapshot.segments[0].failureCode, 'RMT_RECOVERY_FAILED');
        assert.ok(!JSON.stringify(snapshot).includes(secret));
        assert.match(banner(snapshot), /具体原因未记录/);
        assert.ok(!banner(snapshot).includes('校验'), 'unknown errors must not be relabeled as validation failures');
    } finally { recovery.detachGenerationRecovery(origin); }
});

test('legacy unrecognized codes remain retryable without exposing or guessing their cause', async () => {
    const journal = recovery.generationRecoverySnapshot(await createHandle());
    journal.failureCode = `RMT_${secret}`;
    journal.segments = [{ slot: options.taskKey, requestHash: 'b'.repeat(64), state: 'retry', failureCode: journal.failureCode }];
    const html = banner(journal);
    assert.match(html, /具体原因未记录/);
    assert.match(html, /重试未完成部分/);
    assert.ok(!html.includes(secret));
    assert.ok(!html.includes('超时'));
});
