import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as constants from '../src/core/constants.js';
import * as envelopes from '../src/ui/heartEnvelope.js';
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
    assert.deepEqual(wizard.WIZARD_STEPS, ['api', 'card', 'people', 'sources', 'image', 'archive', 'modules', 'offer', 'interval', 'run']);
    assert.deepEqual(wizard.wizardVisibleSteps({ archivePresent: true, wantAuto: false }), ['api', 'card', 'people', 'sources', 'image', 'modules', 'offer']);
    assert.deepEqual(wizard.wizardVisibleSteps({ archivePresent: true, wantAuto: true }), ['api', 'card', 'people', 'sources', 'image', 'modules', 'offer', 'interval', 'run']);
    assert.equal(wizard.wizardVisibleSteps({ archivePresent: false, wantAuto: true }).includes('autoModules'), false);
    assert.equal(wizard.wizardVisibleSteps({ archivePresent: false, wantAuto: true }).includes('interval'), true);
    assert.equal(wizard.plainRequestCount('2 次。两次合在一起才是一份完整回忆。'), 2);
    assert.equal(wizard.plainRequestCount('1 次。没有新信就是 0 次。'), 1);
    assert.equal(wizard.plainRequestCount('不用再单独请求。'), 0);
    const sample = ['album', 'adv', 'inbox', 'travel', 'butterfly', 'heart']
        .reduce((sum, id) => sum + wizard.plainRequestCount(registry.autoMemoryModuleById(id).requestPlain), 0);
    assert.equal(sample, 11);
    for (const id of constants.HEART_ENVELOPE_SKINS) {
        const art = envelopes.heartEnvelopeSvg(id);
        assert.match(art, /viewBox="0 0 280 190"/);
        assert.match(art, /class="rmt-envelope"/);
    }
    const picker = envelopes.heartEnvelopePickerHtml('wax');
    assert.equal((picker.match(/data-rmt-heart-envelope/g) || []).length, 6);
    assert.match(picker, /value="wax" checked/);
    assert.match(picker, /<details class="rmt-envelope-picker">/);
    assert.match(picker, /rmt-envelope-options/);
    assert.equal(envelopes.heartEnvelopeTitle('wax'), 'A 蜡封信');
    assert.equal(wizard.wizardVisibleSteps({ archivePresent: false, wantAuto: false }).includes('run'), false);
    assert.equal(wizard.inspectAutoMemoryApi({ mode: 'manual', manualReady: true }).ready, true);
    const manual = wizard.inspectAutoMemoryApi({ mode: 'manual', manualReady: false, manualMessage: '请填写手动 API 的模型 ID。' });
    assert.equal(manual.ready, false);
    assert.match(manual.message, /模型 ID/);
    assert.match(manual.action, /地址、模型和 Key/);
    const missing = wizard.inspectAutoMemoryApi({ mode: 'profile', profileConfigured: false });
    assert.match(missing.action, /手动填写|当前连接/);
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
    assert.equal(cards.some(item => item.autoEligible), true);
    assert.equal(cards.find(item => item.id === 'achievements').autoEligible, false);
    const draft = wizard.createWizardDraft(storedPlan().plan);
    const chosen = wizard.preferenceUpdate(draft, 'album', 'prefer');
    assert.equal(chosen.error, '');
    assert.equal(chosen.preferredModuleIds.includes('album'), true);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(chosen.preferredModuleIds, chosen.excludedModuleIds), ['cabinet', 'calendar', 'album']);
    const blocked = wizard.preferenceUpdate(draft, 'achievements', 'prefer');
    assert.equal(blocked.error, 'unavailable');
    assert.equal(blocked.preferredModuleIds.includes('achievements'), false);
    const freshOff = wizard.preferenceSelectAll(wizard.createWizardDraft(null), false);
    assert.equal(wizard.moduleSelected(freshOff, 'album'), false);
    assert.equal(freshOff.excludedModuleIds.includes('achievements'), false);
    const freshOn = wizard.preferenceSelectAll(freshOff, true);
    assert.equal(wizard.moduleSelected(freshOn, 'album'), true);
    assert.equal(freshOn.excludedModuleIds.includes('album'), false);
    assert.equal(wizard.wizardModuleCards().find(item => item.id === 'album').audience.includes('你与他'), true);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(draft.preferredModuleIds, draft.excludedModuleIds), ['cabinet', 'calendar']);
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
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(saved.plan.preferredModuleIds, saved.plan.excludedModuleIds), ['cabinet', 'album', 'calendar']);
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
    assert.equal(wizard.wizardSkipsArchiveStep({ archivePresent: true, cardChoiceDirty: false }), true);
    assert.equal(wizard.wizardSkipsArchiveStep({ archivePresent: true, cardChoiceDirty: true }), false);
    assert.equal(wizard.wizardSkipsArchiveStep({ archivePresent: false }), false);
    assert.deepEqual(tasks.failedTaskRetrySpec({ kind: 'archive-import', label: '聊天经历整理' }), { archive: 'import', draftId: '', label: '重试未完成部分' });
    assert.equal(tasks.failedTaskRetrySpec({ kind: 'archive-import', archiveRestart: true }).archiveRestart, true);
    assert.deepEqual(tasks.failedTaskRetrySpec({ kind: 'archive-import', failureCode: 'RMT_ARCHIVE_PREFIX_CHANGED' }), { archiveRestart: true, label: '按当前聊天再整理' });
    assert.equal(tasks.failedTaskRetrySpec({ kind: 'archive-import', archiveCanContinue: false }), null);
    assert.equal(tasks.failedTaskRetrySpec({ kind: 'mode', mode: 'album', draftId: 'd1', pageId: 'album' }).mode, 'album');
    assert.equal(tasks.failedTaskRetrySpec({ oversized: true, mode: 'album', draftId: 'd1' }), null);
    assert.equal(tasks.failedTaskRetrySpec({ kind: 'logical' }), null);
    assert.equal(tasks.failedTaskRetrySpec({ queueRoute: 'album', queueId: 'q1' }).queueId, 'q1');
    assert.equal(tasks.handleTaskCenterAction('task-retry-queue', { dataset: { rmtQueueId: 'missing' } }), undefined);
});

test('task center floor retry uses the bundled scheduler, not a dynamic import', async () => {
    const src = await readFile(new URL('../src/ui/taskCenter.js', import.meta.url), 'utf8');
    assert.equal(src.includes("import('../autoMemory/scheduler.js')"), false);
    assert.match(src, /import \* as auto_memory_scheduler from '\.\.\/autoMemory\/scheduler\.js'/);
    assert.match(src, /auto_memory_scheduler\[run\]/);
});
