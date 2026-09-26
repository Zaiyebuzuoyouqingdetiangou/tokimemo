import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../src/core/autoUpdatePolicy.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as wizard from '../src/autoMemory/wizardPlan.js';
import * as registry from '../src/autoMemory/moduleRegistry.js';

function metadata(extra = {}) {
    const snapshot = plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 2,
            updatedAt: 20,
            enabled: false,
            preferredModuleIds: ['cabinet'],
            excludedModuleIds: ['inbox'],
            legacyPreferencesMigrated: true,
            ...extra,
        }),
        revealRecords: [],
        drawTickets: [],
        modulePlan: null,
    });
    return {
        heartbeatMemoriesArchiveV3: { version: 3 },
        [plans.AUTO_MEMORY_PLAN_KEY]: snapshot.plan,
        [plans.AUTO_MEMORY_REVEAL_KEY]: snapshot.revealRecords,
        [plans.AUTO_MEMORY_DRAW_TICKETS_KEY]: snapshot.drawTickets,
        [plans.AUTO_MEMORY_MODULE_PLAN_KEY]: snapshot.modulePlan,
    };
}

test('achievements are no longer an old auto candidate', () => {
    assert.equal(policy.AUTO_UPDATE_MODES.includes('achievements'), false);
    const normalized = policy.normalizeAutoUpdates({
        achievements: { enabled: true, every: 1, epoch: 1 },
        album: { enabled: true, every: 5, epoch: 1 },
    });
    assert.equal(Object.hasOwn(normalized, 'achievements'), false);
    assert.equal(normalized.album.enabled, true);
    assert.equal(policy.hasEnabledAutoUpdates({ achievements: { enabled: true } }), false);
});

test('an enabled plan blocks the legacy scheduler and turning it off resumes the old switches', async () => {
    const legacy = { album: { enabled: true, every: 1, epoch: 1 }, achievements: { enabled: true, every: 1, epoch: 1 } };
    const legacyCopy = structuredClone(legacy);
    const enabled = metadata({ enabled: true });
    const enabledCopy = structuredClone(enabled);
    const blocked = policy.readLegacySchedulerGate(enabled);
    assert.equal(blocked.allowLegacy, false);
    assert.equal(blocked.source, 'paused-new-plan');
    const calls = [];
    await policy.createFloorScheduler({
        snapshot: () => null,
        busy: () => false,
        lock: (_scope, job) => job(),
        read: async () => ({}),
        write: async () => {},
        run: async mode => { calls.push(mode); return { status: 'noop' }; },
    }).tick();
    assert.deepEqual(calls, []);
    assert.deepEqual(enabled, enabledCopy);
    assert.deepEqual(legacy, legacyCopy);

    const disabled = wizard.disableAutoMemoryPlan(enabled, 40);
    assert.equal(disabled.changed, true);
    assert.equal(disabled.snapshot.plan.enabled, false);
    assert.deepEqual(disabled.snapshot.plan.preferredModuleIds, ['cabinet']);
    assert.deepEqual(disabled.snapshot.plan.excludedModuleIds, ['inbox']);
    assert.deepEqual(enabled, enabledCopy);
    const restored = metadata();
    restored[plans.AUTO_MEMORY_PLAN_KEY] = disabled.snapshot.plan;
    restored[plans.AUTO_MEMORY_REVEAL_KEY] = disabled.snapshot.revealRecords;
    restored[plans.AUTO_MEMORY_DRAW_TICKETS_KEY] = disabled.snapshot.drawTickets;
    restored[plans.AUTO_MEMORY_MODULE_PLAN_KEY] = disabled.snapshot.modulePlan;
    assert.equal(policy.readLegacySchedulerGate(restored).source, 'legacy');
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(disabled.snapshot.plan.preferredModuleIds, disabled.snapshot.plan.excludedModuleIds), ['cabinet']);

    let floor = 10;
    const state = {};
    const rules = policy.normalizeAutoUpdates(legacy);
    const scheduler = policy.createFloorScheduler({
        snapshot: () => ({ scope: 'chat', ready: true, floor, lifetime: 1, revision: 'rev', rules }),
        busy: () => false,
        lock: (_scope, job) => job(),
        read: async () => state,
        write: async () => {},
        run: async mode => { calls.push(mode); return { status: 'noop' }; },
    });
    await scheduler.tick();
    floor = 11;
    await scheduler.tick();
    assert.deepEqual(calls, ['album']);
    assert.deepEqual(legacy, legacyCopy);
});

test('a corrupt plan pauses the old scheduler and is not replaced', () => {
    const broken = { autoMemoryPlanV1: { enabled: true }, revealRecordsV1: [] };
    const copy = structuredClone(broken);
    const gate = policy.readLegacySchedulerGate(broken);
    assert.equal(gate.allowLegacy, false);
    assert.equal(gate.source, 'paused-corrupt');
    assert.deepEqual(broken, copy);
    assert.equal(policy.readLegacySchedulerGate({}).source, 'legacy');
});

test('an existing single or multi archive skips archive setup', () => {
    const single = wizard.wizardEntry({ archivePresent: true, cardType: 'single', apiReady: true });
    assert.deepEqual(single, { skipArchive: true, step: 'modules', doArchive: false, cardType: 'single' });
    const multiple = wizard.wizardEntry({ archivePresent: true, cardType: 'multiple', apiReady: true });
    assert.equal(multiple.cardType, 'multiple');
    assert.equal(multiple.step, 'modules');
    const unknown = wizard.wizardEntry({ archivePresent: true, cardType: '', apiReady: true });
    assert.equal(unknown.skipArchive, false);
    assert.equal(unknown.step, 'api');
    const fresh = wizard.wizardEntry({ archivePresent: false, cardType: 'single', apiReady: true });
    assert.equal(fresh.doArchive, true);
    assert.equal(fresh.step, 'api');
});
