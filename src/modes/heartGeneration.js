import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_heartLanguage from '../core/heartLanguage.js';
import * as core_context from '../core/context.js';
import * as core_incremental from '../core/incremental.js';
import * as core_participants from '../core/participants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as ui_heartView from '../ui/heartView.js';
import { legacyFireflyVoices, makeHeartSession, normalizeFireflyUpgradePart, normalizeHeart, normalizeHeartCollectionBatch, normalizeHeartCore, normalizeHeartCoreIncrement, normalizeScenarioDramaPart, normalizeVoiceDramaPart, preserveHeartSelection, showSavedHeartTaskResult } from './heartData.js';
import { categoryLanguageInput, categoryLanguagePrompt, compactHeartDialoguesExisting, heartCoreIncrementPrompt, heartCoreLegacyPrompt, heartCorePrompt, heartFireflyPrompt, heartFireflyUpgradePrompt, heartPostVoicePrompt, heartSeasonRequestBase, heartSeasonScenarioPrompt, heartSeasonVoicePrompt, heartStripsPrompt, languageCategory, partsDialoguesReady, requestHeartPart } from './heartPrompts.js';
import { HEART_REGENERATION_PAGES, beginHeartSubtask, clearCommittedHeartRecovery, commitHeartPageReplacement, finishHeartRecovery, heartParticipantRegeneration, heartPreparationTargetHint, heartTargetMessage, latestHeartSessionForRuntime, nextHeartDramaBatchId, ordinaryHeartRecoveryOptions, persistHeartPartialPatch, persistHeartWholeSession, prepareHeartSubtaskRuntime, recoveryStopsHeart, refreshHeartArchiveTarget, runOrdinaryHeartLogicalTask, startHeartRecovery } from './heartRuntime.js';
// HEART 分段生成入口：单页重新生成、主线 / 萤火虫 / 四季分段生成
// 从 modes/heart.js 原样搬出（重构阶段 2），声明文本一字未改；modes/heart.js 仍转发原有导出。

// Explicit, version-backed regeneration only. Existing generation entry points
// continue their append behavior when no participantRegeneration is supplied.
export async function regenerateHeartPage(page, options = {}) {
    const pageId = page === 'dialogues' ? 'language' : page;
    const requested = heartParticipantRegeneration(options);
    if (!HEART_REGENERATION_PAGES.has(pageId) || !requested
        || (requested.pageId && requested.pageId !== pageId)) {
        throw core_text.safeUserError('重新生成需要明确勾选的角色互动页面和已保存旧版本。', 'RMT_ARCHIVE_VERSION_REQUIRED');
    }
    const participantRegeneration = { versionId: requested.versionId, pageId,
        participantSnapshot: core_participants.normalizeParticipantSnapshot(requested.participantSnapshot) };
    const initialContext = runtimeState.activeArchiveSnapshot
        ? archive_library.archiveTargetGenerationOptions().context : core_context.currentCharacterGuard();
    const initialMemory = archive_repository.requireArchive(initialContext);
    const initialOrigin = { ...core_context.captureTaskOrigin(initialContext, initialMemory.archiveRevision),
        ...(runtimeState.activeArchiveSnapshot ? { archiveTargetEntryId: runtimeState.activeArchiveSnapshot.entryId } : {}) };
    const scope = runtimeState.activeArchiveSnapshot ? `archive-target:${runtimeState.activeArchiveSnapshot.entryId}` : core_context.chatScopeKey(initialContext);
    const taskKey = `heart-participant:${scope}:${pageId}`;
    const logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'heart-page', mode: core_constants.MODE.HEART,
        pageId, context: initialContext, origin: initialOrigin, taskKey, parentTaskId: options.logicalParentTaskId });
    let targetRuntime, outcome = { status: 'failed', pageId, versionId: participantRegeneration.versionId };
    try {
        targetRuntime = await prepareHeartSubtaskRuntime(`participant:${pageId}`);
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin, { taskKey });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const resumedSource = generation_recovery.readGenerationContentSnapshot(options.existing)?.memoryBank;
        if (resumedSource?.archiveRevision && resumedSource.archiveRevision !== targetRuntime.expectedArchiveRevision) {
            // This operation will save an independent task result and ask where
            // it belongs. It has no permission to replace the new archive here.
            const version = await core_cache.readArchiveVersion(targetRuntime.context, participantRegeneration.versionId);
            if (!version.selectedPages.includes(pageId)) throw core_text.safeUserError('原任务旧版本没有记录这一页，草稿保留。', 'RMT_ARCHIVE_VERSION_REQUIRED');
        } else await core_cache.assertArchiveVersionReplacement(targetRuntime.context, participantRegeneration, core_constants.MODE.HEART);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin,
            { taskKey, participantSnapshot: participantRegeneration.participantSnapshot });
        if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, targetRuntime.context)
            || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
            throw core_text.safeUserError('角色互动仍有生成任务，请等待原任务结束后重做所选页面。', 'RMT_HEART_GENERATING');
        }
        if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
            throw core_text.safeUserError('当前生成任务已满，本页旧内容保留。', 'RMT_HEART_GENERATING');
        }
        runtimeState.activeModeBuildScopes.add(taskKey);
        core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
            heartTargetMessage(targetRuntime, `角色互动 · 重做 ${pageId}`));
        targetRuntime.recoverySelection = { pageId, draftId: options.draftId || options.existing?.draftId || '' };
        if (!await beginHeartSubtask(targetRuntime)) throw core_text.safeUserError('未能开始本页重做，旧内容保留。', 'RMT_HEART_REPLACEMENT_UNCOMMITTED');
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin,
            { taskKey, participantSnapshot: participantRegeneration.participantSnapshot });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const { origin } = targetRuntime;
        let { context, memoryBank } = targetRuntime;
        let base = latestHeartSessionForRuntime(targetRuntime);
        const batchId = core_context.stableArchiveHash(`heart-participant|${participantRegeneration.versionId}|${pageId}`);
        const operation = pageId === 'language' || pageId === 'strips'
            ? { kind: 'heart-section', part: pageId === 'language' ? 'dialogues' : pageId, ...(pageId === 'language' ? { dialogueMode: 'full' } : {}) }
            : pageId === 'fireflies' ? { kind: 'heart-fireflies', upgrade: false }
                : { kind: 'heart-season', season: pageId, batchId };
        const recovery = await startHeartRecovery(targetRuntime, { ...operation, participantRegeneration }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        const request = (prompt, suffix, settings, validator) => {
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
            return requestHeartPart(prompt, `角色互动 · 正在重做 ${pageId}`, { ...settings, context, origin,
                taskKey: `${taskKey}:${suffix}`, mode: core_constants.MODE.HEART, background: true }, validator);
        };
        const enrich = item => ({ ...item, sourceArchiveMemoryIds: [], incrementBatchId: batchId, generatedAt: Date.now() });
        let replacement;
        if (pageId === 'language') {
            replacement = await request(heartCorePrompt(context, memoryBank), 'dialogues-full',
                { maxTokens: 6000, temperatureCeiling: 0.35 }, raw => normalizeHeart(makeHeartSession(normalizeHeartCore(raw, memoryBank)), memoryBank));
        } else if (pageId === 'strips' || pageId === 'fireflies') {
            const strips = pageId === 'strips';
            const batch = await request(strips ? heartStripsPrompt(context, memoryBank, base) : heartFireflyPrompt(context, memoryBank, base),
                pageId, strips ? { maxTokens: 5000 } : { maxTokens: 5200 },
                raw => normalizeHeartCollectionBatch(raw, pageId));
            replacement = { [strips ? 'dailyStrips' : 'fireflyVoices']: batch.items.map(enrich), rejectedCount: batch.rejectedCount };
        } else {
            const postending = pageId === 'postending';
            const voices = await request(postending ? heartPostVoicePrompt(context, memoryBank, base)
                : heartSeasonVoicePrompt(context, memoryBank, base, pageId), 'voice',
                { maxTokens: postending ? 3800 : 3000 }, raw => normalizeVoiceDramaPart(raw, [pageId], memoryBank));
            const runScenario = !postending && (options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true);
            const scenarios = runScenario ? await request(heartSeasonScenarioPrompt(context, memoryBank, base, pageId), 'scenario',
                { maxTokens: 3200 }, raw => normalizeScenarioDramaPart(raw, pageId, memoryBank)) : [];
            if (!postending && !runScenario) {
                core_requestCoordinator.noteSecondStepOffer(origin, {
                    label: '小事件', kind: 'heart-scenario', mode: core_constants.MODE.HEART, pageId,
                });
            }
            replacement = { voiceDramas: voices.map(enrich), scenarioDramas: scenarios.map(enrich) };
        }
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const session = await commitHeartPageReplacement(targetRuntime, base, pageId, replacement, participantRegeneration, logicalTask);
        if (session?.status === 'awaiting-choice') {
            outcome = session;
            showSavedHeartTaskResult(outcome.draftId, targetRuntime.context);
            return outcome;
        }
        outcome = { status: 'committed', pageId, versionId: participantRegeneration.versionId, session };
        return outcome;
    } catch (error) {
        if (targetRuntime?.origin) {
            try { await generation_recovery.noteGenerationRecoveryFailure(targetRuntime.origin, error); } catch { /* Preserve the original generation/commit error. */ }
        }
        outcome = { ...outcome, status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        throw error;
    } finally {
        try {
            if (targetRuntime?.origin) generation_recovery.detachGenerationRecovery(targetRuntime.origin);
            runtimeState.activeModeBuildScopes.delete(taskKey);
            core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
            core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, targetRuntime?.origin || initialOrigin);
            if (targetRuntime) refreshHeartArchiveTarget(targetRuntime);
        } finally {
            core_requestCoordinator.finishLogicalGenerationTask(logicalTask, outcome);
        }
    }
}

export async function generateHeartSection(part, options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage(part === 'seasons' ? runtimeState.activeSession?.selectedSeason || 'postending' : part, options);
    const sourceSession = options.backgroundTarget?.session || runtimeState.activeSession;
    if (!sourceSession || sourceSession.kind !== core_constants.MODE.HEART) return;
    if (part === 'seasons') return generateHeartSeasonSection(sourceSession.selectedSeason || 'postending', options);
    if (part === 'fireflies') return generateHeartFirefliesSection(options);
    if (!['dialogues', 'strips'].includes(part)) return;
    return runOrdinaryHeartLogicalTask(part === 'dialogues' ? 'language' : part, options,
        logicalTask => generateHeartSectionOperation(part, options, logicalTask));
}

async function generateHeartSectionOperation(part, options, logicalTask) {
    const normalizedPart = ['dialogues', 'strips'].includes(part) ? part : '';
    let resumeFull = options.existing?.operation?.dialogueMode === 'full';
    let category = languageCategory(options.existing?.operation?.languageCategory || options.languageCategory);
    if (!normalizedPart) return;
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime(`part:${normalizedPart}`, logicalTask, options.backgroundTarget); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, normalizedPart === 'dialogues' ? 'language' : normalizedPart, options);
    resumeFull = options.existing?.operation?.dialogueMode === 'full';
    category = languageCategory(options.existing?.operation?.languageCategory || options.languageCategory);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let { context, memoryBank } = targetRuntime;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    memoryBank = sourceSnapshot?.memoryBank || memoryBank;
    const taskKey = `heart-part:${scope}:${normalizedPart}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '这一项已经在生成中。'), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    let base;
    try { base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    let sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, normalizedPart);
    let fullDialogues = normalizedPart === 'dialogues'
        && (options.replaceDialogues === true || resumeFull || !partsDialoguesReady(base));
    if (!sourceMemoryIds.length && !fullDialogues) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-section', part: normalizedPart });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前档案没有尚未用于${normalizedPart === 'dialogues' ? '基础语言' : '日常一格'}的新记忆。`), '心迹回廊');
        return;
    }
    const confirmationIdentity = JSON.stringify(compactHeartDialoguesExisting(base));
    if (fullDialogues && core_heartLanguage.heartLanguageStatus(base).hasContent
        && !ui_heartView.confirmHeartLanguageReplacement()) return;
    let origin = targetRuntime.origin;
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, `角色互动生成中：${normalizedPart === 'dialogues' ? '时期对话' : '日常一格'}`));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, base);
    sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, normalizedPart);
    fullDialogues = normalizedPart === 'dialogues'
        && (options.replaceDialogues === true || resumeFull || !partsDialoguesReady(base));
    if (!sourceMemoryIds.length && !fullDialogues) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-section', part: normalizedPart });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '另一项较新的任务已经覆盖这些新增记忆，本次没有重复生成。'), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    if (fullDialogues && JSON.stringify(compactHeartDialoguesExisting(base)) !== confirmationIdentity) {
        globalThis.toastr?.info?.('基础语言已被另一任务更新，请重新确认；旧内容保留。', '心迹回廊');
        return;
    }
    const coverage = {
        revisit: !!base && !core_incremental.incrementalArchiveMemoryIds(base, memoryBank, normalizedPart).length,
        coveragePart: normalizedPart,
        sourceMemoryIds,
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    origin = targetRuntime.origin;
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-section', part: normalizedPart, ...(normalizedPart === 'dialogues' ? { dialogueMode: fullDialogues ? 'full' : 'increment', ...(category ? { languageCategory: category } : {}) } : {}) }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        let persisted;
        if (normalizedPart === 'dialogues') {
            if (fullDialogues) {
                const core = await generation_client.requestValidatedSegment(
                    heartCorePrompt(context, memoryBank) + categoryLanguagePrompt(category),
                    partsDialoguesReady(base) ? '角色互动 · 正在重新生成基础语言…' : '角色互动 · 正在生成基础语言…',
                    { maxTokens: 6000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:dialogues-full`, mode: core_constants.MODE.HEART, background: true,
                        recoveryCompatibility: { contract: 'heart-language-birthday-r8412', legacyPrompts: [heartCoreLegacyPrompt(context, memoryBank) + categoryLanguagePrompt(category)], legacyTemperatures: [0.35] } },
                    raw => normalizeHeartCore(categoryLanguageInput(raw, category), memoryBank),
                );
                const fullCoverage = {
                    ...coverage,
                    sourceMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
                    coverageConsumedMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
                };
                persisted = await persistHeartPartialPatch('dialogues', { type: category && core_heartLanguage.heartLanguageStatus(base).hasContent && options.replaceDialogues !== true ? 'dialogues-increment' : 'dialogues', core, ...fullCoverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            } else {
                const core = await generation_client.requestValidatedSegment(
                    heartCoreIncrementPrompt(context, memoryBank, base, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'dialogues') + categoryLanguagePrompt(category),
                    '角色互动 · 追加时期对话',
                    { maxTokens: 4500, temperatureCeiling: 0.4, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true },
                    raw => normalizeHeartCoreIncrement(categoryLanguageInput(raw, category), memoryBank, sourceMemoryIds),
                );
                persisted = await persistHeartPartialPatch('dialogues', { type: 'dialogues-increment', core, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            }
        } else {
            const batch = await requestHeartPart(
                heartStripsPrompt(context, memoryBank, base, base, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'strips'),
                '角色互动 · 追加日常一格',
                { maxTokens: 5000, context, origin, taskKey: `${taskKey}:strips`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeHeartCollectionBatch(raw, 'strips'),
            );
            const batchId = core_incremental.incrementalBatchId('strips', sourceMemoryIds);
            const enriched = batch.items.map(item => ({ ...item, sourceArchiveMemoryIds: sourceMemoryIds, incrementBatchId: batchId, generatedAt: Date.now() }));
            persisted = await persistHeartPartialPatch('strips', { type: 'strips', dailyStrips: enriched, rejectedCount: batch.rejectedCount, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
        }
        await finishHeartRecovery(targetRuntime, persisted?.committed);
        if (!persisted?.committed) {
            globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '内容已生成，但尚未确认保存；保留草稿，未计入已保存数量。'), '心迹回廊');
        } else {
            const rejected = core_heartLanguage.heartCollectionIssues(persisted.updated)[normalizedPart] || 0;
            const message = normalizedPart === 'dialogues'
                ? `基础语言已有 ${core_heartLanguage.heartLanguageStatus(persisted.updated).total} 句；其他内容保留。`
                : `已有 ${persisted.updated?.dailyStrips?.length || 0} 篇日常一格。`;
            globalThis.toastr?.[rejected ? 'warning' : 'success']?.(heartTargetMessage(targetRuntime,
                message + (rejected ? `本次另有 ${rejected} 条未通过校验，可选择重试；已有内容照常阅读。` : '')), '心迹回廊');
        }
        return { status: persisted?.committed ? 'committed' : 'blocked', session: persisted?.updated };
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
}

export async function generateHeartFirefliesSection(options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage('fireflies', options);
    if (!(options.backgroundTarget?.session || runtimeState.activeSession) || (options.backgroundTarget?.session || runtimeState.activeSession).kind !== core_constants.MODE.HEART) return;
    return runOrdinaryHeartLogicalTask('fireflies', options,
        logicalTask => generateHeartFirefliesSectionOperation(options, logicalTask));
}

async function generateHeartFirefliesSectionOperation(options, logicalTask) {
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime('fireflies', logicalTask, options.backgroundTarget); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, 'fireflies', options);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let context = targetRuntime.context;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    let memoryBank = sourceSnapshot?.memoryBank || targetRuntime.memoryBank;
    let origin = targetRuntime.origin;
    const taskKey = `heart-fireflies:${scope}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '萤火虫栖息地正在点亮。'), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    // A pure no-op must not advance the persistent HEART write fence. Inspect the freshly
    // revalidated preflight cache first, then repeat the decision after the real claim.
    let base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession);
    let hasExisting = Array.isArray(base?.fireflyVoices) && base.fireflyVoices.length > 0;
    let legacyBatch = legacyFireflyVoices(base).slice(0, 6);
    let existingFireflyCursor = core_incremental.incrementalPartRecord(base, 'fireflies');
    let sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, 'fireflies');
    if (!legacyBatch.length && hasExisting && base.fireflyVoices.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `萤火虫栖息地已经收集到 ${core_constants.HEART_FIREFLY_MAX_ITEMS} 个心声光点；旧光点不会自动删除。`), '心迹回廊');
        return;
    }
    if (!legacyBatch.length && hasExisting && existingFireflyCursor && !sourceMemoryIds.length) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '当前档案没有新的关系进展可用于解锁萤火虫。先增量更新档案，再来点亮新的光点。'), '心迹回廊');
        return;
    }
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, '角色互动生成中：萤火虫栖息地'));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    origin = targetRuntime.origin;
    memoryBank = sourceSnapshot?.memoryBank || targetRuntime.memoryBank;
    base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, base);
    hasExisting = Array.isArray(base?.fireflyVoices) && base.fireflyVoices.length > 0;
    legacyBatch = legacyFireflyVoices(base).slice(0, 6);
    if (legacyBatch.length) {
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        try {
            const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-fireflies', upgrade: true }, options);
            context = recovery.contentContext; memoryBank = recovery.contentBank;
            base = recovery.contentInputs?.baseSession || base;
            legacyBatch = legacyFireflyVoices(base).slice(0, 6);
            const upgraded = await requestHeartPart(
                heartFireflyUpgradePrompt(context, base, legacyBatch, memoryBank),
                '角色互动 · 正在把旧版萤火虫升级为 GS4 式追加约会会话…',
                { maxTokens: 5200, context, origin, taskKey: `${taskKey}:upgrade`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeFireflyUpgradePart(raw, legacyBatch),
            );
            const result = await persistHeartPartialPatch('firefly-upgrade', { type: 'firefly-upgrade', fireflyVoices: upgraded }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            await finishHeartRecovery(targetRuntime, result.committed);
            const remain = legacyFireflyVoices(result.updated || base).length;
            globalThis.toastr?.success?.(heartTargetMessage(targetRuntime, `已升级 ${upgraded.length} 个旧光点为追加约会会话${remain ? `，还剩 ${remain} 个可继续升级` : '，旧版独白光点已全部升级'}.`), '心迹回廊');
            return { status: result.committed ? 'committed' : 'blocked', session: result.updated };
        } catch (error) {
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
            return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
        } finally {
            generation_recovery.detachGenerationRecovery(origin);
            runtimeState.activeModeBuildScopes.delete(taskKey);
            core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
            refreshHeartArchiveTarget(targetRuntime);
        }
        return;
    }
    if (hasExisting && base.fireflyVoices.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `萤火虫栖息地已经收集到 ${core_constants.HEART_FIREFLY_MAX_ITEMS} 个心声光点；旧光点不会自动删除。`), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    existingFireflyCursor = core_incremental.incrementalPartRecord(base, 'fireflies');
    if (hasExisting && !existingFireflyCursor) {
        const migrated = core_incremental.stampIncrementalCoverage(structuredClone(base), base, memoryBank, 'fireflies', core_incremental.archiveMemoryIds(memoryBank), 0);
        migrated.chatId = expectedChatId;
        migrated.archiveRevision = expectedArchiveRevision;
        try {
            const persisted = await persistHeartWholeSession(migrated, targetRuntime, origin);
            const sameTargetVisible = !targetRuntime.archiveTarget
                || runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId;
            if (persisted && sameTargetVisible && runtimeState.activeSession?.kind === core_constants.MODE.HEART
                && runtimeState.activeSession.chatId === expectedChatId && runtimeState.activeSession.archiveRevision === expectedArchiveRevision
                && (targetRuntime.archiveTarget || !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin))) {
                runtimeState.activeSession = preserveHeartSelection({ ...persisted }, runtimeState.activeSession);
                ui_heartView.renderHeart();
            }
            globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '已把旧版萤火虫保存为永久解锁基线。之后档案出现新的 Mxxx 时，只会继续追加新光点。'), '心迹回廊');
            return { status: persisted ? 'committed' : 'blocked', session: persisted };
        } finally {
            runtimeState.activeModeBuildScopes.delete(taskKey);
            refreshHeartArchiveTarget(targetRuntime);
        }
        return;
    }
    sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, 'fireflies');
    if (hasExisting && !sourceMemoryIds.length) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '较新的任务已经覆盖当前关系进展，本次没有重复请求。'), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    const coverage = {
        coveragePart: 'fireflies',
        sourceMemoryIds,
        coverageConsumedMemoryIds: hasExisting ? sourceMemoryIds : core_incremental.archiveMemoryIds(memoryBank),
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-fireflies', upgrade: false }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        const batch = await requestHeartPart(
            heartFireflyPrompt(context, memoryBank, base, hasExisting ? base : null, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'fireflies'),
            hasExisting ? '角色互动 · 正在解锁新的萤火虫心声…' : '角色互动 · 正在点亮萤火虫栖息地…',
            { maxTokens: 5200, context, origin, taskKey, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeHeartCollectionBatch(raw, 'fireflies'),
        );
        const batchId = core_incremental.incrementalBatchId('fireflies', sourceMemoryIds);
        const enriched = batch.items.map(item => ({
            ...item,
            sourceArchiveMemoryIds: sourceMemoryIds,
            incrementBatchId: batchId,
            generatedAt: Date.now(),
        }));
        const result = await persistHeartPartialPatch('fireflies', { type: 'fireflies', fireflyVoices: enriched, rejectedCount: batch.rejectedCount, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
        await finishHeartRecovery(targetRuntime, result.committed);
        const total = result.updated?.fireflyVoices?.length || base.fireflyVoices?.length || 0;
        const addedNow = Math.max(0, total - (base.fireflyVoices?.length || 0));
        if (!result.committed) globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '光点已生成，但尚未确认保存；草稿保留。'), '心迹回廊');
        else globalThis.toastr?.[batch.rejectedCount ? 'warning' : 'success']?.(heartTargetMessage(targetRuntime,
            `已有 ${total} 个萤火虫光点，本次新增 ${addedNow} 个。` + (batch.rejectedCount ? `另有 ${batch.rejectedCount} 个话题未通过校验，可选择重试。` : '')), '心迹回廊');
        return { status: result.committed ? 'committed' : 'blocked', session: result.updated };
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
}

export async function generateHeartSeasonSection(season, options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage(season, options);
    if (!(options.backgroundTarget?.session || runtimeState.activeSession) || (options.backgroundTarget?.session || runtimeState.activeSession).kind !== core_constants.MODE.HEART) return;
    const allowed = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);
    const normalizedSeason = allowed.has(season) ? season : '';
    if (!normalizedSeason) return;
    return runOrdinaryHeartLogicalTask(normalizedSeason, options,
        logicalTask => generateHeartSeasonSectionOperation(normalizedSeason, options, logicalTask));
}

async function generateHeartSeasonSectionOperation(normalizedSeason, options, logicalTask) {
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime(`season:${normalizedSeason}`, logicalTask, options.backgroundTarget); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, normalizedSeason, options);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let { context, memoryBank } = targetRuntime;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    memoryBank = sourceSnapshot?.memoryBank || memoryBank;
    const taskKey = `heart-season:${scope}:${normalizedSeason}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `${ui_heartView.heartSeasonLabel(normalizedSeason)}正在生成中。`), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    if (await clearCommittedHeartRecovery(targetRuntime, latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession), { kind: 'heart-season', season: normalizedSeason })) {
        globalThis.toastr?.info?.('原季节篇章已完整保存，已清理完成草稿；没有重复生成。', '心迹回廊');
        return;
    }
    let origin = targetRuntime.origin;
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, `角色互动生成中：${ui_heartView.heartSeasonLabel(normalizedSeason)} Drama`));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    const base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession);
    const latestSession = () => targetRuntime.recoveryHandle?.contentInputs?.baseSession
        ? structuredClone(targetRuntime.recoveryHandle.contentInputs.baseSession) : latestHeartSessionForRuntime(targetRuntime, base);
    const existingRecovery = options.existing === undefined
        ? options.draftId ? core_cache.loadGenerationRecovery(core_constants.MODE.HEART, context, targetRuntime.archiveTarget?.cache,
            { draftId: options.draftId, pageId: normalizedSeason }) : null : options.existing;
    const previousOperation = existingRecovery?.operation;
    const batchId = previousOperation?.kind === 'heart-season' && previousOperation.season === normalizedSeason
        ? previousOperation.batchId : nextHeartDramaBatchId(base, normalizedSeason);
    const enrichVoice = item => ({
        ...item,
        sourceArchiveMemoryIds: [],
        incrementBatchId: batchId,
        generatedAt: Date.now(),
    });
    const enrichScenario = item => ({
        ...item,
        sourceArchiveMemoryIds: [],
        incrementBatchId: batchId,
        generatedAt: Date.now(),
    });

    origin = targetRuntime.origin;
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    const errors = [];
    let savedParts = 0;
    let allCommitted = true;
    let offeredSecond = false;
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-season', season: normalizedSeason, batchId }, { ...options, existing: existingRecovery });
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        if (normalizedSeason === 'postending') {
            const latest = latestSession();
            try {
                const voice = enrichVoice((await requestHeartPart(
                    heartPostVoicePrompt(context, memoryBank, latest, latest, null),
                    '角色互动 · 追加未来 / 后日谈',
                    { maxTokens: 3800, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true },
                    raw => normalizeVoiceDramaPart(raw, ['postending'], memoryBank),
                ))[0]);
                const persisted = await persistHeartPartialPatch(`season:postending:${batchId}:voice`, { type: 'season', season: 'postending', voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                allCommitted &&= persisted.committed;
                if (persisted.committed) savedParts += 1;
            } catch (error) {
                await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                errors.push(error);
            }
        } else {
            let latest = latestSession();
            let voice = latest.voiceDramas?.find(item => item.kind === normalizedSeason && item.incrementBatchId === batchId) || null;
            let scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || null;

            if (!voice) {
                try {
                    voice = enrichVoice((await requestHeartPart(
                        heartSeasonVoicePrompt(context, memoryBank, latest, normalizedSeason, heartSeasonRequestBase(latest, normalizedSeason, batchId), null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Voice`,
                        { maxTokens: 3000, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true,
                            recoveryCompatibility: { contract: 'heart-season-siblings-r8412',
                                legacyPrompts: [heartSeasonVoicePrompt(context, memoryBank, latest, normalizedSeason, latest, null)], legacyTemperatures: [0.65] } },
                        raw => normalizeVoiceDramaPart(raw, [normalizedSeason], memoryBank),
                    ))[0]);
                    const persisted = await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:voice`, { type: 'season', season: normalizedSeason, voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                    allCommitted &&= persisted.committed;
                    if (persisted.committed) savedParts += 1;
                    latest = latestSession();
                } catch (error) {
                    await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                    errors.push(error);
                }
            }

            scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || scenario;
            const runScenario = options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true;
            if (!scenario && voice && !runScenario && !errors.length) {
                offeredSecond = true;
                core_requestCoordinator.noteSecondStepOffer(origin, {
                    label: '小事件', kind: 'heart-scenario', mode: core_constants.MODE.HEART, pageId: normalizedSeason,
                });
            }
            if (!scenario && runScenario && !errors.some(recoveryStopsHeart)) {
                try {
                    scenario = enrichScenario((await requestHeartPart(
                        heartSeasonScenarioPrompt(context, memoryBank, latest, normalizedSeason, heartSeasonRequestBase(latest, normalizedSeason, batchId), null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Scenario`,
                        { maxTokens: 3200, context, origin, taskKey: `${taskKey}:scenario`, mode: core_constants.MODE.HEART, background: true,
                            recoveryCompatibility: { contract: 'heart-season-siblings-r8412',
                                legacyPrompts: [heartSeasonScenarioPrompt(context, memoryBank, latest, normalizedSeason, latest, null)], legacyTemperatures: [0.65] } },
                        raw => normalizeScenarioDramaPart(raw, normalizedSeason, memoryBank),
                    ))[0]);
                    const persisted = await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:scenario`, { type: 'season', season: normalizedSeason, scenario }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                    allCommitted &&= persisted.committed;
                    if (persisted.committed) savedParts += 1;
                } catch (error) {
                    await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                    errors.push(error);
                }
            }
        }

        if (errors.length && !savedParts) throw errors[0];
        if (errors.length) {
            globalThis.toastr?.warning?.(heartTargetMessage(targetRuntime, `${ui_heartView.heartSeasonLabel(normalizedSeason)}已保存成功部分；${core_text.safeErrorSummary(errors[0])} 已有篇章照常阅读；需要时可选择重试未完成篇。`), '心迹回廊');
        } else {
            await finishHeartRecovery(targetRuntime, allCommitted);
            globalThis.toastr?.[allCommitted ? 'success' : 'info']?.(heartTargetMessage(targetRuntime, allCommitted
                ? (offeredSecond ? `已保存 ${ui_heartView.heartSeasonLabel(normalizedSeason)} 的 Voice。可以第二次生成小事件。` : `已保存 ${ui_heartView.heartSeasonLabel(normalizedSeason)} 的新增篇章。`)
                : '篇章已生成，但尚未确认保存；草稿保留。'), '心迹回廊');
        }
        return { status: errors.length ? 'failed' : allCommitted ? 'committed' : 'blocked', savedParts };
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), `心迹回廊 · ${ui_heartView.heartSeasonLabel(normalizedSeason)} Drama`);
        return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
}
