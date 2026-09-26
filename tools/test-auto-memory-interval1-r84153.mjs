import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as batches from '../src/archive/importBatches.js';
import * as draw from '../src/autoMemory/draw.js';
import * as floor from '../src/autoMemory/floorPace.js';
import * as gate from '../src/autoMemory/incrementalGate.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as wizard from '../src/autoMemory/wizardPlan.js';
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
    assert.equal(Object.hasOwn(draw.incrementalImportOptions({ start: 11, end: 11 }), 'parkPriorDraft'), false);
    assert.deepEqual(
        tasks.failedTaskRetrySpec({ kind: 'archive-import', failureCode: 'RMT_RECOVERY_INPUT_CHANGED' }),
        { archiveRestart: true, label: '按当前聊天再整理' },
    );
});

test('interval-1 sync does not swallow import errors behind parkPriorDraft', async () => {
    const repo = await readFile(new URL('../src/archive/repository.js', import.meta.url), 'utf8');
    const scheduler = await readFile(new URL('../src/autoMemory/scheduler.js', import.meta.url), 'utf8');
    assert.equal(repo.includes('isAutomaticFloorWindowSync(options) && options.parkPriorDraft !== true'), false);
    assert.match(repo, /parkArchiveRecovery\(hydrationOrigin, 'import', \{ ignoreActive: true \}\)/);
    assert.match(scheduler, /if \(result\?\.status === 'failed' && result\.error\) throw result\.error/);
});

test('setting interval 1 makes the current finished floor due and a blocked import stays visible', async () => {
    const metadata = {
        [plans.AUTO_MEMORY_PLAN_KEY]: plans.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5,
            lastCompletedFloor: 40, nextDueFloor: 45, legacyPreferencesMigrated: true,
        }),
        [plans.AUTO_MEMORY_REVEAL_KEY]: [],
        [plans.AUTO_MEMORY_DRAW_TICKETS_KEY]: [],
        [plans.AUTO_MEMORY_MODULE_PLAN_KEY]: null,
    };
    const patched = wizard.pacePatch(metadata, { intervalFloors: 1, floor: 80 }, 90);
    assert.equal(patched.changed, true);
    assert.equal(patched.snapshot.plan.intervalFloors, 1);
    assert.equal(patched.snapshot.plan.lastCompletedFloor, 79);
    assert.equal(patched.snapshot.plan.nextDueFloor, 80);
    assert.deepEqual(floor.dueFloorWindow(79, 80), { start: 80, end: 80 });
    const blocked = await gate.runAutoMemoryRound({
        snapshot: patched.snapshot, floor: 80, memoryIds: ['M001'], now: 100,
    }, {
        importIncremental: async () => ({ status: 'blocked' }),
        persist: async () => { throw new Error('must not mark the floor empty'); },
        readMemoryIds: async () => ['M001'],
    });
    assert.equal(blocked.action, 'failed');
    assert.equal(blocked.reason, 'import-blocked');
});
