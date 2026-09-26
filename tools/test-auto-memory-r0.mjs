import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import * as constants from '../src/core/constants.js';
import * as registry from '../src/autoMemory/moduleRegistry.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as migrate from '../src/autoMemory/migrateLegacy.js';

const CHAT = 'Alice - 2026-09-26';
const DRAW = 'draw_cabinet01';

function plan(extra = {}) {
    return plans.createAutoMemoryPlan({
        revision: 2,
        updatedAt: 20,
        enabled: false,
        intervalFloors: 5,
        preferredModuleIds: ['cabinet', 'calendar'],
        excludedModuleIds: ['inbox'],
        lastCompletedFloor: 10,
        nextDueFloor: 15,
        activeDrawTicketId: DRAW,
        legacyPreferencesMigrated: true,
        ...extra,
    });
}

function ticket(extra = {}) {
    return {
        id: DRAW,
        dueFloor: 15,
        archiveRevision: 'rev-1',
        candidates: [{ id: 'cabinet', weight: 2 }, { id: 'calendar', weight: 1 }],
        selectedModuleId: 'cabinet',
        sourceMemoryIds: ['M001', 'M014'],
        status: 'drawn',
        ...extra,
    };
}

function modulePlan() {
    return {
        version: 1,
        drawId: DRAW,
        moduleId: 'cabinet',
        chatId: CHAT,
        archiveRevision: 'rev-1',
        sourceMemoryIds: ['M001'],
        expectedRequestRange: { min: 1, max: 1 },
        steps: [
            { id: 'body', kind: 'generate', order: 0, status: 'completed', recoverySlot: 'body:1' },
            { id: 'seal', kind: 'achievement', order: 1, status: 'pending', recoverySlot: '' },
        ],
        frozenAt: 30,
    };
}

function reveal() {
    return {
        id: 'reveal_cabinet01',
        moduleId: 'cabinet',
        achievementId: null,
        sourceMemoryIds: ['M001'],
        status: 'generating',
        createdAt: 30,
    };
}

function snapshot(extraPlan = {}) {
    return plans.parseAutoMemorySnapshot({
        plan: plan(extraPlan),
        revealRecords: [reveal()],
        drawTickets: [ticket()],
        modulePlan: modulePlan(),
    });
}

function recoveryRecord(payload, chatId = CHAT) {
    return plans.parseAutoMemoryRecoveryRecord({
        key: 'chat:' + encodeURIComponent(chatId),
        schemaVersion: 1,
        chatId,
        revision: payload.plan.revision,
        payload,
    });
}

function metadataFrom(value) {
    return {
        heartbeatMemoriesArchiveV3: { version: 3 },
        [plans.AUTO_MEMORY_PLAN_KEY]: value.plan,
        [plans.AUTO_MEMORY_REVEAL_KEY]: value.revealRecords,
        [plans.AUTO_MEMORY_DRAW_TICKETS_KEY]: value.drawTickets,
        [plans.AUTO_MEMORY_MODULE_PLAN_KEY]: value.modulePlan,
    };
}

test('registry stays ineligible until a module is adapted', () => {
    const modules = registry.listAutoMemoryModules();
    const modeIds = new Set(Object.values(constants.MODE));
    assert.equal(modules.length, 18);
    for (const item of modules) {
        assert.equal(modeIds.has(item.id), true);
        assert.equal(item.autoEligible, item.id !== 'achievements');
        assert.equal(item.achievementMerged, item.id !== 'achievements');
        assert.equal(item.description.length > 0, true);
        assert.equal(item.audience.length > 0, true);
        assert.equal(item.requestPlain.length > 0, true);
        assert.equal(item.normalRequestEstimate.length > 0, true);
        assert.ok(item.contentKind === 'historical' || item.contentKind === 'collection');
        for (const prerequisite of item.prerequisites) assert.equal(registry.isAutoMemoryDrawModule(prerequisite), true);
    }
    assert.equal(registry.autoMemoryModuleById('achievements').inDrawPool, false);
    assert.match(registry.autoMemoryModuleById('achievements').audience, /每生成一份回忆/);
    assert.equal(registry.autoMemoryModuleById('items').prerequisites[0], 'room');
    assert.throws(() => { modules[0].autoEligible = true; });
    const adapted = modules.filter(item => item.inDrawPool && item.autoEligible).map(item => item.id);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(modules.map(item => item.id), []), adapted);
    assert.equal(adapted.includes('achievements'), false);
});

test('a plan round trip keeps every field and rejects loose values', () => {
    const original = snapshot();
    const again = plans.parseAutoMemorySnapshot(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(again, original);
    assert.equal(again.plan.intervalFloors, 5);
    assert.equal(again.plan.lastCompletedFloor, 10);
    assert.equal(again.modulePlan.steps[1].recoverySlot, '');
    assert.equal(plans.createAutoMemoryPlan({ intervalFloors: 1 }).intervalFloors, 1);
    assert.equal(plans.createAutoMemoryPlan({ intervalFloors: 1000 }).intervalFloors, 1000);
    assert.equal(plans.createAutoMemoryPlan().intervalFloors, 5);
    for (const intervalFloors of [0, 1001, 1.5, '5', null]) {
        assert.throws(() => plans.createAutoMemoryPlan({ intervalFloors }), error => error.code === 'RMT_AUTO_MEMORY_INTERVAL');
    }
    assert.throws(() => plans.parseAutoMemoryPlan({ ...original.plan, autoEligible: true }), error => error.code === 'RMT_AUTO_MEMORY_CORRUPT');
    assert.throws(() => plans.parseAutoMemoryPlan({ ...original.plan, preferredModuleIds: ['achievements'] }));
    assert.throws(() => plans.parseAutoMemoryPlan({ ...original.plan, preferredModuleIds: ['archive'] }));
    assert.throws(() => plans.parseAutoMemoryPlan({ ...original.plan, preferredModuleIds: ['cabinet'], excludedModuleIds: ['cabinet'] }));
    assert.throws(() => plans.parseModuleStep({ ...modulePlan().steps[0], recoverySlot: '' }));
    assert.throws(() => plans.parseDrawTicket({ ...ticket(), selectedModuleId: 'inbox' }));
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(original.plan.preferredModuleIds, original.plan.excludedModuleIds), ['cabinet', 'calendar']);
});

test('old and corrupt chats are not rewritten', () => {
    const oldChat = { heartbeatMemoriesArchiveV3: { version: 3 }, note: 'keep' };
    const oldCopy = structuredClone(oldChat);
    assert.equal(plans.readAutoMemoryMetadata(oldChat), null);
    assert.deepEqual(plans.selectAutoMemoryCanonical(oldChat, null), { snapshot: null, source: 'absent', recoveryIgnored: false });
    assert.deepEqual(oldChat, oldCopy);

    const broken = { autoMemoryPlanV1: { intervalFloors: 1001 }, revealRecordsV1: [] };
    const brokenCopy = structuredClone(broken);
    assert.throws(() => plans.readAutoMemoryMetadata(broken), error => error.code === 'RMT_AUTO_MEMORY_CORRUPT');
    assert.throws(() => plans.commitAutoMemoryMetadata(broken, snapshot({ revision: 1, activeDrawTicketId: null }), 0));
    assert.throws(() => plans.selectAutoMemoryCanonical(broken, recoveryRecord(snapshot())));
    assert.deepEqual(broken, brokenCopy);
});

test('legacy switches migrate once into preferences and stay disabled', () => {
    const legacy = {
        album: { enabled: true, every: 20, epoch: 1 },
        cabinet: { enabled: true, every: 7, epoch: 0 },
        achievements: { enabled: true, every: 20, epoch: 0 },
        archive: { enabled: true, every: 20, epoch: 0 },
        inbox: { enabled: false, every: 20, epoch: 0 },
    };
    const legacyCopy = structuredClone(legacy);
    const first = migrate.migrateLegacyAutoPreferences(null, legacy, 40);
    assert.equal(first.changed, true);
    assert.equal(first.plan.enabled, false);
    assert.equal(first.plan.legacyPreferencesMigrated, true);
    assert.equal(first.plan.intervalFloors, 5);
    assert.deepEqual(first.plan.preferredModuleIds, ['album', 'cabinet']);
    assert.deepEqual(first.plan.excludedModuleIds, []);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(first.plan.preferredModuleIds), ['album', 'cabinet']);
    assert.deepEqual(legacy, legacyCopy);

    const second = migrate.migrateLegacyAutoPreferences(first.plan, { album: { enabled: false, every: 20, epoch: 0 } }, 80);
    assert.equal(second.changed, false);
    assert.deepEqual(second.plan.preferredModuleIds, ['album', 'cabinet']);
    assert.throws(() => migrate.migrateLegacyAutoPreferences({ intervalFloors: 0 }, legacy));
});

describe('metadata wins over an older recovery copy', { concurrency: false }, () => {
    test('revision and chat identity gate the restore', async () => {
        const current = snapshot();
        const older = snapshot({ revision: 1, updatedAt: 10 });
        const newer = snapshot({ revision: 4, updatedAt: 50 });
        const metadata = metadataFrom(current);
        const metadataCopy = structuredClone(metadata);
        const olderRecord = recoveryRecord(older);
        const chosen = plans.selectAutoMemoryCanonical(metadata, olderRecord, CHAT);
        assert.equal(chosen.source, 'metadata');
        assert.equal(chosen.snapshot.plan.revision, 2);
        assert.throws(() => plans.assertMayRestoreFromRecovery(metadata, olderRecord, CHAT), error => error.code === 'RMT_AUTO_MEMORY_RECOVERY_STALE');
        assert.equal(plans.selectAutoMemoryCanonical(metadata, recoveryRecord(current), CHAT).source, 'metadata');
        assert.equal(plans.selectAutoMemoryCanonical(metadata, recoveryRecord(newer), CHAT).source, 'recovery');
        assert.equal(plans.assertMayRestoreFromRecovery(metadata, recoveryRecord(newer), CHAT).plan.revision, 4);
        assert.equal(plans.selectAutoMemoryCanonical(metadata, recoveryRecord(newer, 'other-chat'), CHAT).recoveryIgnored, true);
        assert.throws(() => plans.selectAutoMemoryCanonical({}, recoveryRecord(newer, 'other-chat'), CHAT));
        assert.deepEqual(metadata, metadataCopy);

        const rows = new Map();
        plans.setAutoMemoryRecoveryBackendForTests({
            read: async key => rows.has(key) ? structuredClone(rows.get(key)) : null,
            write: async (key, expectedRevision, record) => {
                if ((rows.get(key)?.revision || 0) !== expectedRevision) {
                    throw Object.assign(new Error('stale'), { code: 'RMT_AUTO_MEMORY_STALE', safeToDisplay: true, safeUserMessage: '自动留忆备份版本已变化，没有覆盖较新的记录。' });
                }
                rows.set(key, structuredClone(record));
                return structuredClone(record);
            },
        });
        try {
            const first = snapshot({ revision: 1, updatedAt: 1, activeDrawTicketId: DRAW });
            await plans.writeAutoMemoryRecovery(CHAT, first, 0);
            await assert.rejects(plans.writeAutoMemoryRecovery(CHAT, snapshot({ revision: 1 }), 0), error => error.code === 'RMT_AUTO_MEMORY_STALE');
            const stored = await plans.readAutoMemoryRecovery(CHAT);
            assert.equal(stored.revision, 1);
            assert.deepEqual(stored.payload, first);
            const saved = plans.commitAutoMemoryMetadata({ heartbeatMemoriesArchiveV3: { version: 3 } }, first, 0);
            assert.equal(saved.plan.revision, 1);
            assert.equal(plans.readAutoMemoryMetadata(metadataFrom(saved)).plan.preferredModuleIds[0], 'cabinet');
        } finally {
            plans.setAutoMemoryRecoveryBackendForTests(null);
        }
    });
});
