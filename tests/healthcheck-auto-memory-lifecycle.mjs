import assert from 'node:assert/strict';
import test from 'node:test';
import { lifecycleHarness } from './helpers-auto-memory-lifecycle.mjs';

// Run: node --experimental-vm-modules --test tests/healthcheck-auto-memory-lifecycle.mjs
// AUTO_MEMORY_TEST_SOURCE_ROOT can select the unchanged pre-fix checkout for red/green verification.

test('the real scheduler completes both room steps under one fixed origin and logical task', async () => {
    const h = await lifecycleHarness();
    const result = await h.run();
    assert.equal(result.action, 'reveal');
    assert.deepEqual(h.requests.map(row => row.chatId), ['A', 'A']);
    assert.equal(h.snapshot().modulePlan.steps.every(step => step.status === 'completed'), true);
    assert.equal(h.snapshot().revealRecords.length, 1);
    assert.equal(h.snapshot().plan.activeDrawTicketId, null);
    for (const request of h.requests) {
        assert.equal(request.options.context, h.chats.A);
        assert.equal(request.options.origin.chatId, 'A');
        assert.ok(request.options.logicalParentTaskId);
        assert.equal(request.options.signal.aborted, false);
    }
    assert.equal(new Set(h.requests.map(row => row.options.logicalParentTaskId)).size, 1);
    assert.equal(h.finishedTasks.length, 1);
    assert.equal(h.tasks.size, 0);
});

for (const [name, invalidate] of [
    ['chat switch', h => h.switchChat()],
    ['chat-scope cancellation', h => h.cancel()],
    ['lifecycle replacement', h => { h.state.lifecycle += 1; }],
    ['plan disable', h => h.disable()],
    ['archive replacement', h => { h.chats.A.memory.archiveRevision = 'archive-replaced'; }],
    ['plan revision replacement', h => {
        const next = h.snapshot(); next.plan.revision += 1;
        h.plans.assignAutoMemoryMetadata(h.chats.A.chatMetadata, next);
    }],
    ['scheduler stop', h => h.scheduler.stopAutoMemoryScheduler()],
]) {
    test(`${name} during first step persistence prevents the next real scheduler step`, async () => {
        let invalidated = false;
        const h = await lifecycleHarness({ onBoundary: async (boundary, harness, detail) => {
            if (boundary === 'metadata.save' && detail.number === 1) { invalidate(harness); invalidated = true; }
        } });
        const result = await h.run();
        assert.equal(invalidated, true, 'the first completed step reaches persistence');
        assert.deepEqual(h.requests.map(row => row.chatId), ['A'], 'no later step may bind to live chat B or continue an invalid round');
        assert.equal(h.state.saveCount, 1, 'no post-invalidation metadata save is allowed');
        assert.equal(h.snapshot().revealRecords.length, 0);
        assert.equal(result.action, 'failed');
        assert.equal(h.tasks.size, 0, 'the round task always settles');
    });
}

for (const boundary of ['journal.read', 'provider', 'journal.save', 'recovery.read', 'cache.hydrate']) {
    test(`chat changes at ${boundary}: await resumption cannot issue another request or save an achievement`, async () => {
        let invalidated = false;
        const h = await lifecycleHarness({ journalNotes: true, onBoundary: async (name, harness) => {
            if (name === boundary && !invalidated) { invalidated = true; harness.switchChat(); }
        } });
        const result = await h.run();
        assert.equal(invalidated, true, `boundary ${boundary} was exercised`);
        assert.equal(h.requests.some(row => row.chatId === 'B'), false);
        const maxRequests = boundary === 'journal.read' ? 0 : boundary === 'cache.hydrate' ? 2 : 1;
        assert.equal(h.requests.length, maxRequests);
        assert.equal(h.events.filter(row => row.name === 'achievement.save').length, 0);
        assert.equal(result.action, 'failed');
        assert.equal(h.tasks.size, 0);
    });
}

test('hiding the panel during an authorized round does not cancel its remaining step', async () => {
    const h = await lifecycleHarness({ onBoundary: async (name, harness) => {
        if (name === 'metadata.save') harness.state.uiOpen = false;
    } });
    const result = await h.run();
    assert.equal(h.state.uiOpen, false);
    assert.equal(result.action, 'reveal');
    assert.deepEqual(h.requests.map(row => row.chatId), ['A', 'A']);
    assert.equal(h.snapshot().revealRecords.length, 1);
    assert.equal(h.tasks.size, 0);
});

test('an import may advance the frozen revision only to its own committed live revision', async () => {
    const h = await lifecycleHarness();
    await h.round.withAutoMemoryRound(h.chats.A, async round => {
        const parentId = h.round.generationOptions(round).logicalParentTaskId;
        h.chats.A.memory.archiveRevision = 'archive-A-2';
        h.round.acceptArchiveCommit(round, h.data({ status: 'committed', archiveRevision: 'archive-A-2' }));
        const next = h.round.generationOptions(round);
        assert.equal(next.context, h.chats.A);
        assert.equal(next.origin.archiveRevision, 'archive-A-2');
        assert.equal(next.logicalParentTaskId, parentId);
        assert.equal(next.signal.aborted, false);
        h.round.acceptArchiveCommit(round, h.data({ status: 'noop' }));
        assert.equal(h.round.generationOptions(round).origin.archiveRevision, 'archive-A-2');
    });
    assert.deepEqual(h.events.filter(row => row.name === 'task.bind').map(row => row.archiveRevision), ['archive-A-2']);
    assert.equal(h.tasks.size, 0);
    assert.equal(h.finishedTasks[0].outcome.status, 'done');
});

for (const [name, status, returnedRevision, liveRevision] of [
    ['concurrent newer archive', 'committed', 'archive-A-2', 'archive-A-3'],
    ['committed result without revision', 'committed', '', 'archive-A'],
    ['noop after external archive change', 'noop', '', 'archive-A-2'],
    ['deferred import', 'deferred', 'archive-A-2', 'archive-A-2'],
    ['cancelled import', 'cancelled', 'archive-A-2', 'archive-A-2'],
    ['failed import', 'failed', '', 'archive-A'],
]) {
    test(`${name} cannot advance the round's archive fence or issue a next generation`, async () => {
        const h = await lifecycleHarness();
        let roundTask;
        await assert.rejects(h.round.withAutoMemoryRound(h.chats.A, async round => {
            roundTask = round.task;
            h.chats.A.memory.archiveRevision = liveRevision;
            h.round.acceptArchiveCommit(round, h.data({ status, archiveRevision: returnedRevision }));
            assert.fail('a rejected import must not reach another generation');
        }), { name: 'AbortError' });
        assert.equal(roundTask.signal.aborted, true);
        assert.equal(h.events.filter(row => row.name === 'task.bind').length, 0);
        assert.equal(h.tasks.size, 0);
        assert.equal(h.finishedTasks[0].outcome.status, 'cancelled');
    });
}

for (const write of ['assign', 'commit']) {
    test(`${write} of a disabled plan aborts an active provider immediately; re-enabling cannot revive the round`, async () => {
        let abortObserved = false;
        const h = await lifecycleHarness({ onBoundary: async (name, harness) => {
            if (name !== 'provider' || abortObserved) return;
            const current = harness.snapshot();
            const next = harness.data({ ...current, plan: {
                ...current.plan, enabled: false, revision: current.plan.revision + 1,
            } });
            if (write === 'assign') harness.plans.assignAutoMemoryMetadata(harness.chats.A.chatMetadata, next);
            else harness.plans.commitAutoMemoryMetadata(harness.chats.A.chatMetadata, next, current.plan.revision);
            const signal = harness.requests[0].options.signal;
            assert.equal(signal?.aborted, true, 'plan write aborts the signal before the provider settles');
            abortObserved = true;
            harness.plans.assignAutoMemoryMetadata(harness.chats.A.chatMetadata, harness.data({
                ...next, plan: { ...next.plan, enabled: true, revision: next.plan.revision + 1 },
            }));
            assert.equal(signal.aborted, true, 'authorization belongs to the cancelled round');
        } });
        const result = await h.run();
        assert.equal(abortObserved, true);
        assert.equal(result.action, 'failed');
        assert.equal(h.snapshot().plan.enabled, true);
        assert.equal(h.state.saveCount, 0);
        assert.equal(h.requests.length, 1);
        assert.equal(h.snapshot().revealRecords.length, 0);
        assert.equal(h.tasks.size, 0);
    });
}

test('the real due-floor host round imports automatically and carries its committed revision into the draw and module', async () => {
    const h = await lifecycleHarness();
    h.prepareDueRound();
    await h.runHost();
    assert.equal(h.imports.length, 1);
    const imported = h.imports[0];
    assert.equal(imported.chatId, 'A');
    assert.equal(imported.options.automatic, true);
    assert.equal(imported.options.context, h.chats.A);
    assert.equal(imported.options.origin.archiveRevision, 'archive-A');
    assert.deepEqual(JSON.parse(JSON.stringify(imported.options.floorWindow)), { start: 1, end: 1 });
    assert.ok(imported.options.logicalParentTaskId);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].mode, 'calendar');
    assert.equal(h.requests[0].options.logicalParentTaskId, imported.options.logicalParentTaskId);
    assert.equal(h.requests[0].options.signal, imported.options.signal);
    assert.equal(h.requests[0].options.origin.archiveRevision, 'archive-A-2');
    const saved = h.snapshot();
    assert.equal(saved.drawTickets.length, 1);
    assert.equal(saved.drawTickets[0].archiveRevision, 'archive-A-2');
    assert.equal(saved.modulePlan.archiveRevision, 'archive-A-2');
    assert.deepEqual(Array.from(saved.drawTickets[0].sourceMemoryIds), ['M002']);
    assert.deepEqual(Array.from(saved.modulePlan.sourceMemoryIds), ['M002']);
    assert.equal(saved.revealRecords.length, 1);
    assert.equal(saved.plan.activeDrawTicketId, null);
    assert.equal(h.finishedTasks.length, 1);
    assert.equal(h.finishedTasks[0].outcome.status, 'done');
    assert.equal(h.jobs.at(-1)?.status, 'done');
    assert.equal(h.state.jobActive, false);
    assert.equal(h.tasks.size, 0);
});

for (const boundary of ['archive.import', 'recovery.read', 'recovery.write']) {
    test(`the due-floor import chain stops at ${boundary} after a chat switch and settles its job as cancelled`, async () => {
        let invalidated = false;
        const h = await lifecycleHarness({ onBoundary: async (name, harness) => {
            if (name === boundary && !invalidated) { invalidated = true; harness.switchChat(); }
        } });
        h.prepareDueRound();
        await h.runHost();
        assert.equal(invalidated, true);
        assert.equal(h.imports.length, 1);
        assert.equal(h.requests.length, 0, 'neither the original nor the other chat receives a module request');
        assert.equal(h.snapshot().revealRecords.length, 0);
        assert.equal(h.jobs.at(-1)?.status, 'cancelled');
        assert.equal(h.state.jobActive, false);
        assert.equal(h.tasks.size, 0);
        assert.equal(h.finishedTasks[0].outcome.status, 'cancelled');
        if (boundary === 'recovery.write') assert.equal(h.recovery.get('chat:A').revision, 1, 'cancelled backup commit stays at its previous revision');
    });
}
