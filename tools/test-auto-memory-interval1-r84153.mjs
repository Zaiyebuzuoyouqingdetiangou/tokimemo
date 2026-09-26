import assert from 'node:assert/strict';
import test from 'node:test';
import * as batches from '../src/archive/importBatches.js';
import * as draw from '../src/autoMemory/draw.js';
import * as tasks from '../src/ui/taskCenter.js';

function identity(chat, extra = {}) {
    return {
        chat,
        character: extra.character || 'char',
        persona: extra.persona || 'persona',
        range: extra.range || 'range',
        selection: extra.selection || 'sel',
        configuration: extra.configuration || 'cfg',
    };
}

test('interval-1 floor sync does not treat append-only chat growth as a new source', () => {
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true, floorWindow: { start: 11, end: 11 } }), true);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true, floorWindow: { start: 6, end: 10 } }), true);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true }), false);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true, floorWindow: { start: 1, end: 1 }, continueRecovery: true }), false);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true, floorWindow: { start: 1, end: 1 }, restartImport: true }), false);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: true, floorWindow: { start: 1, end: 1 }, draftId: 'd1' }), false);
    assert.equal(batches.isAutomaticFloorWindowSync({ automatic: false, floorWindow: { start: 1, end: 1 } }), false);

    const previous = identity('old-chat-fingerprint');
    const grown = identity('new-chat-fingerprint');
    batches.assertIdentity(previous, grown, { ignoreChatFingerprint: true });
    assert.throws(() => batches.assertIdentity(previous, grown), error => error.code === 'RMT_RECOVERY_INPUT_CHANGED');
    assert.throws(
        () => batches.assertIdentity(previous, identity('new-chat-fingerprint', { character: 'other' }), { ignoreChatFingerprint: true }),
        error => error.code === 'RMT_RECOVERY_INPUT_CHANGED' && error.archiveInputCategory === 'character',
    );

    assert.deepEqual(draw.incrementalImportOptions({ start: 11, end: 11 }), { automatic: true, floorWindow: { start: 11, end: 11 } });
    assert.deepEqual(
        tasks.failedTaskRetrySpec({ kind: 'archive-import', failureCode: 'RMT_RECOVERY_INPUT_CHANGED' }),
        { archiveRestart: true, label: '按当前聊天再整理' },
    );
});
