import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecoveryAction, recoveryActionKey } from '../src/ui/recoveryAction.js';

test('legacy buttons without draft ids stay distinct by page, mode, and chat', () => {
    const key = (...values) => recoveryActionKey('retry', ...values);
    assert.notEqual(key('chat-a', 'inbox'), key('chat-a', 'pastLives'));
    assert.notEqual(key('chat-a', 'profile'), key('chat-b', 'profile'));
    assert.notEqual(key('entry-a', 'inbox', 'page', 'one'), key('entry-a', 'inbox', 'page', 'two'));
});

test('repeated taps share one pending operation and one error; next explicit attempt remains available', async () => {
    const button = { textContent: '放弃草稿', disabled: false, setAttribute() {}, removeAttribute() {} };
    const errors = []; globalThis.toastr = { error: (...args) => errors.push(args) };
    let reject, calls = 0;
    const operation = () => { calls++; return new Promise((resolve, no) => { reject = no; }); };
    const first = runRecoveryAction(button, 'same-draft', operation);
    const duplicate = runRecoveryAction({ ...button }, 'same-draft', operation);
    assert.equal(first, duplicate); assert.equal(button.disabled, true);
    await Promise.resolve(); assert.equal(calls, 1);
    reject(Error('upstream private text sk-secret')); await first;
    assert.equal(errors.length, 1); assert.doesNotMatch(errors[0][0], /sk-secret/);
    assert.equal(button.disabled, false); assert.equal(button.textContent, '放弃草稿');
    await runRecoveryAction(button, 'same-draft', () => { calls++; });
    assert.equal(calls, 2);
});

test('unrelated draft actions proceed independently and cancellation creates no error toast', async () => {
    const errors = []; globalThis.toastr = { error: (...args) => errors.push(args) };
    let finish; const first = runRecoveryAction(null, 'draft-one', () => new Promise(resolve => { finish = resolve; }));
    let done = false; await runRecoveryAction(null, 'draft-two', () => { done = true; throw new DOMException('Cancelled', 'AbortError'); });
    assert.equal(done, true); assert.equal(errors.length, 0); finish(); await first;
});
