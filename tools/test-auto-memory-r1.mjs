import assert from 'node:assert/strict';
import test from 'node:test';
import * as constants from '../src/core/constants.js';
import * as registry from '../src/autoMemory/moduleRegistry.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as wizard from '../src/autoMemory/wizardPlan.js';
import * as tasks from '../src/ui/taskCenter.js';

function storedPlan(extra = {}) {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 2,
            updatedAt: 20,
            enabled: false,
            intervalFloors: 5,
            preferredModuleIds: ['cabinet', 'calendar'],
            excludedModuleIds: ['inbox'],
            legacyPreferencesMigrated: true,
            ...extra,
        }),
        revealRecords: [],
        drawTickets: [],
        modulePlan: null,
    });
}

function metadataFrom(value) {
    return {
        heartbeatMemoriesArchiveV3: { version: 3 },
        legacyAutoUpdate: { album: { enabled: true, every: 20 } },
        [plans.AUTO_MEMORY_PLAN_KEY]: value.plan,
        [plans.AUTO_MEMORY_REVEAL_KEY]: value.revealRecords,
        [plans.AUTO_MEMORY_DRAW_TICKETS_KEY]: value.drawTickets,
        [plans.AUTO_MEMORY_MODULE_PLAN_KEY]: value.modulePlan,
    };
}

test('api check names the next action and interval stays an integer', () => {
    assert.deepEqual(wizard.WIZARD_STEPS, ['api', 'card', 'people', 'sources', 'modules', 'preference', 'interval', 'archive', 'first', 'run']);
    assert.equal(wizard.inspectAutoMemoryApi({ mode: 'manual', manualReady: true }).ready, true);
    const manual = wizard.inspectAutoMemoryApi({ mode: 'manual', manualReady: false, manualMessage: '请填写手动 API 的模型 ID。' });
    assert.equal(manual.ready, false);
    assert.match(manual.message, /模型 ID/);
    assert.match(manual.action, /API 页/);
    const missing = wizard.inspectAutoMemoryApi({ mode: 'profile', profileConfigured: false });
    assert.match(missing.action, /连接配置|手动 API/);
    const unsafe = wizard.inspectAutoMemoryApi({ mode: 'profile', profileConfigured: true, profileReady: false });
    assert.match(unsafe.message, /凭证/);
    assert.equal(wizard.normalizeInterval(1).ok, true);
    assert.equal(wizard.normalizeInterval(5).intervalFloors, 5);
    assert.equal(wizard.normalizeInterval(1000).ok, true);
    for (const value of [0, 1001, 1.5, '5', null]) assert.equal(wizard.normalizeInterval(value).ok, false);
    assert.match(wizard.normalizeInterval(0).message, /1 到 1000/);
});

test('unadapted modules stay out of the draw and off by default', () => {
    const fresh = wizard.createWizardDraft(null);
    assert.deepEqual(fresh.preferredModuleIds, []);
    assert.equal(fresh.intervalFloors, 5);
    const cards = wizard.wizardModuleCards();
    assert.equal(cards.some(item => item.autoEligible), false);
    assert.equal(cards.every(item => item.autoEligible || item.unavailableReason === '暂不可自动生成' || item.id === 'achievements'), true);
    const draft = wizard.createWizardDraft(storedPlan().plan);
    const chosen = wizard.preferenceUpdate(draft, 'album', 'prefer');
    assert.equal(chosen.error, '');
    assert.equal(chosen.preferredModuleIds.includes('album'), true);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(chosen.preferredModuleIds, chosen.excludedModuleIds), []);
    const blocked = wizard.preferenceUpdate(draft, 'achievements', 'prefer');
    assert.equal(blocked.error, 'unavailable');
    assert.equal(blocked.preferredModuleIds.includes('achievements'), false);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(draft.preferredModuleIds, draft.excludedModuleIds), []);
});

test('archive and module request counts stay separate', () => {
    const one = wizard.archiveSegmentEstimate({ chatCharacters: constants.IMPORT_CHUNK_CHARS, externalCharacters: constants.EXTERNAL_MEMORY_CHUNK_CHARS });
    assert.equal(one.chatRequests, 1);
    assert.equal(one.externalRequests, 1);
    assert.equal(one.archiveRequests, 2);
    assert.equal(one.checkpoints, 1);
    const splitChat = wizard.archiveSegmentEstimate({ chatCharacters: constants.IMPORT_CHUNK_CHARS + 1 });
    assert.equal(splitChat.chatRequests, 2);
    assert.equal(splitChat.externalRequests, 0);
    const longChat = wizard.archiveSegmentEstimate({ chatCharacters: constants.ARCHIVE_BATCH_CHAT_CHARS + 1 });
    assert.equal(longChat.checkpoints, 2);
    const preview = wizard.splitRequestPreview(one, ['cabinet', 'calendar']);
    assert.equal(preview.archiveRequests, 2);
    assert.equal(preview.moduleCount, 2);
    assert.equal(preview.moduleEstimates.some(item => item.estimate === String(preview.archiveRequests)), false);
    assert.equal(preview.moduleEstimates.every(item => typeof item.estimate === 'string' && item.estimate.length > 0), true);
});

test('first queue drops a bad id and one failure leaves the others', () => {
    const draft = wizard.createWizardDraft(null);
    draft.firstModuleIds = ['cabinet', 'not-a-module', 'calendar'];
    assert.deepEqual(wizard.firstQueueRoutes(draft, ['cabinet', 'calendar']), ['cabinet', 'calendar']);
    draft.archiveOnly = true;
    assert.deepEqual(wizard.firstQueueRoutes(draft, ['cabinet', 'calendar']), []);
    draft.archiveOnly = false;
    draft.skipFirst = true;
    assert.deepEqual(wizard.firstQueueRoutes(draft, ['cabinet', 'calendar']), []);
    const items = [
        { id: 'cabinet', status: 'done' },
        { id: 'calendar', status: 'running' },
        { id: 'room', status: 'queued' },
    ];
    const next = wizard.queueAfterItemFailure(items, 'calendar');
    assert.equal(next[0].status, 'done');
    assert.equal(next[1].status, 'failed');
    assert.equal(next[2].status, 'queued');
    assert.equal(items[1].status, 'running');
    assert.equal(tasks.settleQueuedItem('running', new Error('failed')), 'failed');
    const abort = new Error('stopped');
    abort.name = 'AbortError';
    assert.equal(tasks.settleQueuedItem('running', abort), 'cancelled');
    assert.equal(tasks.settleQueuedItem('done', new Error('late')), 'done');
});

test('wizard completion round-trips and does not rewrite corrupt or old settings', () => {
    const legacy = { album: { enabled: true, every: 20, epoch: 1 } };
    const legacyCopy = structuredClone(legacy);
    const fresh = wizard.wizardCompletionSnapshot({}, wizard.createWizardDraft(null), 40);
    assert.equal(fresh.plan.enabled, true);
    assert.equal(fresh.plan.intervalFloors, 5);
    assert.deepEqual(fresh.plan.preferredModuleIds, []);
    assert.equal(fresh.plan.legacyPreferencesMigrated, true);
    assert.deepEqual(legacy, legacyCopy);

    const existing = storedPlan();
    const metadata = metadataFrom(existing);
    const before = structuredClone(metadata);
    const draft = wizard.createWizardDraft(existing.plan);
    draft.intervalFloors = 12;
    draft.preferredModuleIds = ['cabinet', 'album', 'calendar'];
    const saved = wizard.wizardCompletionSnapshot(metadata, draft, 50);
    assert.deepEqual(metadata, before);
    assert.equal(saved.plan.enabled, true);
    assert.equal(saved.plan.revision, 3);
    assert.equal(saved.plan.intervalFloors, 12);
    assert.deepEqual(saved.plan.preferredModuleIds, ['cabinet', 'album', 'calendar']);
    assert.deepEqual(saved.plan.excludedModuleIds, ['inbox']);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(saved.plan.preferredModuleIds, saved.plan.excludedModuleIds), []);
    plans.commitAutoMemoryMetadata(metadata, saved, 2);
    assert.equal(metadata.legacyAutoUpdate.album.enabled, true);
    assert.equal(metadata.heartbeatMemoriesArchiveV3.version, 3);
    const again = plans.readAutoMemoryMetadata(metadata);
    assert.equal(again.plan.revision, 3);
    assert.equal(wizard.wizardResumeView(again, { running: true }).completed, true);
    assert.equal(wizard.wizardResumeView(again, { running: true }).archiveStillRunning, true);
    assert.equal(wizard.wizardResumeView(storedPlan(), null).completed, false);

    const broken = { autoMemoryPlanV1: { intervalFloors: 1001 }, revealRecordsV1: [], legacyAutoUpdate: legacy };
    const brokenCopy = structuredClone(broken);
    assert.throws(() => wizard.wizardCompletionSnapshot(broken, wizard.createWizardDraft(null), 60), error => error.code === 'RMT_AUTO_MEMORY_CORRUPT');
    assert.deepEqual(broken, brokenCopy);
    assert.equal(wizard.wizardBlocksChatInput(), false);
    assert.equal(wizard.wizardCloseAbortsTasks(), false);
});
