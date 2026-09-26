import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as ui_advEventView from '../ui/advEventView.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';
import { advBatchPrompt, advPreparationTargetHint, advPrompt, advTargetMessage, advTargetStatus, advTargetVisible, beginAdvSubtask, clearCommittedAdvRecovery, finishAdvRecovery, latestAdvSessionForRuntime, normalizeAdv, normalizeAdvBatch, persistAdvMutation, prepareAdvSubtaskRuntime, refreshAdvArchiveTarget, shouldRenderAdvTarget, showAdvFailure, showAdvNotice, startAdvRecovery } from './advEventData.js';
// ADV 生成：整批生成、修复失败项、生成选中事件
// 从 modes/advEvent.js 原样搬出（重构阶段 2），声明文本一字未改；modes/advEvent.js 仍转发原有导出。

export async function generateAllAdvForSession(options = {}) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return;
    const targetHint = advPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareAdvSubtaskRuntime('bulk'); }
    catch (error) { showAdvFailure(targetHint, error); return; }
    const { context, scope } = targetRuntime;
    let origin = targetRuntime.origin;
    const bulkTaskKey = `adv-bulk:${scope}`;
    if (runtimeState.activeAdvBulkScopes.has(scope)) return showAdvNotice(targetRuntime, 'ADV 批量任务已经在进行中。');
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.ADV, context)) return showAdvNotice(targetRuntime, 'ADV EVENT 事件索引正在生成或补齐，请先等它完成。');
    if (core_requestCoordinator.hasGenerationTaskPrefix(`adv:${scope}:`)) return showAdvNotice(targetRuntime, '当前有单篇 ADV 正在生成，请等它完成后再批量生成。');
    if (!core_requestCoordinator.canStartGenerationTask(bulkTaskKey)) return showAdvNotice(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请稍后再试。`);

    // No-op checks belong before the durable latest-task claim. Clicking an already-complete
    // archive must not advance the ADV fence and invalidate a real task in another tab.
    let session = latestAdvSessionForRuntime(targetRuntime, runtimeState.activeSession);
    if (!session?.events?.some(event => !event.adv?.paragraphs?.length)) {
        await clearCommittedAdvRecovery(targetRuntime, session, 'adv-bulk');
        globalThis.toastr?.info?.(advTargetMessage(targetRuntime, '全部 ADV 都已经生成完成。'), '心迹回廊');
        return;
    }
    runtimeState.activeAdvBulkScopes.add(scope);
    const bulkCancel = core_requestCoordinator.openAdvBulkCancellation(scope);
    core_requestCoordinator.registerArchiveTargetReservation(bulkTaskKey, targetRuntime, core_constants.MODE.ADV,
        advTargetMessage(targetRuntime, 'ADV 批量生成中'));
    try {
    if (!await beginAdvSubtask(targetRuntime)) {
        runtimeState.activeAdvBulkScopes.delete(scope);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    origin = targetRuntime.origin;
    session = latestAdvSessionForRuntime(targetRuntime, session);
    const allPending = session.events.filter(event => !event.adv?.paragraphs?.length);
    if (!allPending.length) {
        await clearCommittedAdvRecovery(targetRuntime, session, 'adv-bulk');
        globalThis.toastr?.info?.(advTargetMessage(targetRuntime, '较新的任务已经补完全部 ADV，本次没有重复请求。'), '心迹回廊');
        runtimeState.activeAdvBulkScopes.delete(scope);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    const retryIds = new Set(core_text.cleanArray(session.advBulkRecovery?.failedIds, 64, 100));
    const recoveryPending = retryIds.size ? allPending.filter(event => retryIds.has(event.id)) : [];
    if (retryIds.size && !recoveryPending.length) session.advBulkRecovery = null;
    const pending = (recoveryPending.length ? recoveryPending : allPending).slice(0, core_constants.ADV_BULK_BATCH_SIZE);
    const memoryBank = targetRuntime.memoryBank;
    if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(true, advTargetStatus(targetRuntime, `本批生成 ${pending.length} 篇 ADV…`));
    let batchCount = 0;
    let batchError = '';
    let batchAccepted = false;
    const completedBatch = new Map();
    try {
        await startAdvRecovery(targetRuntime, { kind: 'adv-bulk', eventIds: pending.map(event => event.id) }, options, session);
        try {
            if (bulkCancel.signal.aborted) throw core_requestCoordinator.createGenerationAbortError();
            const batch = await generation_client.requestValidatedSegment(
                advBatchPrompt(context, pending, memoryBank),
                `正在生成本批 ${pending.length} 篇 ADV…`,
                {
                    maxTokens: core_constants.MAX_GENERATION_OUTPUT_TOKENS,
                    context,
                    origin,
                    signal: bulkCancel.signal,
                    taskKey: bulkTaskKey,
                    mode: core_constants.MODE.ADV,
                    background: true,
                    segmentMaxAttempts: 1,
                },
                raw => normalizeAdvBatch(raw, pending),
            );
            batchAccepted = true;
            for (const event of pending) {
                const adv = batch.get(event.id);
                if (!adv) continue;
                completedBatch.set(event.id, adv);
                batchCount += 1;
            }
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            batchError = core_text.safeErrorSummary(error, 1000);
            console.warn('[HeartbeatMemories] bulk ADV request failed; waiting for user recovery choice', core_text.safeErrorDiagnostic(error));
        }

        const attemptedIds = new Set(pending.map(event => event.id));
        const persisted = await persistAdvMutation(targetRuntime, latest => {
            const next = structuredClone(latest || session);
            for (const item of next.events || []) {
                const adv = completedBatch.get(item.id);
                // A result that was already committed by another valid task is never replaced by
                // this older patch; independent event patches therefore compose under CAS.
                if (adv && !item.adv?.paragraphs?.length) item.adv = adv;
            }
            const failedAttemptIds = (next.events || [])
                .filter(item => attemptedIds.has(item.id) && !item.adv?.paragraphs?.length)
                .map(item => item.id);
            next.advBulkRecovery = failedAttemptIds.length ? {
                failedIds: failedAttemptIds,
                attemptedAt: Date.now(),
                batchSucceeded: Math.max(0, attemptedIds.size - failedAttemptIds.length),
                error: batchError,
            } : null;
            return next;
        }, session);
        session = persisted.session || session;
        // A syntactically complete batch may contain fewer valid entries than requested,
        // including none. Once its accepted entries and missing IDs are durably consumed,
        // retire this exact-prompt checkpoint. The next explicit action can then request
        // only missing IDs (or use per-item repair), without replaying an empty batch or
        // changing a saved segment's prompt identity. Truncation/failure and deferred
        // writes keep their journal; the canonical deferred session commit retires it.
        if (batchAccepted) await finishAdvRecovery(targetRuntime, persisted.committed);
        const failedAfterBatch = pending.filter(event => !session.events?.find(item => item.id === event.id)?.adv?.paragraphs?.length);
        const completed = session.events.filter(event => event.adv?.paragraphs?.length).length;
        const failed = session.events.length - completed;
        const visible = shouldRenderAdvTarget(targetRuntime)
            && (targetRuntime.archiveTarget || core_context.isCurrentTaskOrigin(origin))
            && runtimeState.activeSession?.kind === core_constants.MODE.ADV
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden;
        if (visible) {
            runtimeState.activeSession = session;
            ui_advEventView.renderAdvMode();
        }
        if (failedAfterBatch.length) {
            globalThis.toastr?.warning?.(advTargetMessage(targetRuntime, `本批完成 ${batchCount}/${pending.length} 篇；${failedAfterBatch.length} 篇需要重试。`), '心迹回廊');
        } else if (failed) {
            globalThis.toastr?.success?.(advTargetMessage(targetRuntime, `本批完成 ${batchCount} 篇；还有 ${failed} 篇未生成，可继续生成下一批。`), '心迹回廊');
        } else {
            globalThis.toastr?.success?.(advTargetMessage(targetRuntime, `ADV 已完成：${completed}/${session.events.length}。`), '心迹回廊');
        }
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') {
            console.error('[HeartbeatMemories] bulk ADV flow failed', core_text.safeErrorDiagnostic(error));
            showAdvFailure(targetRuntime, error);
        }
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeAdvBulkScopes.delete(scope);
        core_requestCoordinator.closeAdvBulkCancellation(scope, bulkCancel);
        core_requestCoordinator.unregisterArchiveTargetReservation(bulkTaskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.ADV, origin);
        refreshAdvArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeAdvBulkScopes.delete(scope);
        core_requestCoordinator.closeAdvBulkCancellation(scope, bulkCancel);
        core_requestCoordinator.unregisterArchiveTargetReservation(bulkTaskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        refreshAdvArchiveTarget(targetRuntime);
    }
}

export async function repairFailedAdvForSession(options = {}) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return;
    const targetHint = advPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareAdvSubtaskRuntime('repair'); }
    catch (error) { showAdvFailure(targetHint, error); return; }
    const { context, scope } = targetRuntime;
    let origin = targetRuntime.origin;
    const bulkTaskKey = `adv-bulk:${scope}`;
    if (runtimeState.activeAdvBulkScopes.has(scope) || core_requestCoordinator.hasGenerationTaskPrefix(`adv:${scope}:`)) return showAdvNotice(targetRuntime, '当前已有 ADV 生成任务，请稍候。');
    if (!core_requestCoordinator.canStartGenerationTask(bulkTaskKey)) return showAdvNotice(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请稍后再试。`);
    let session = latestAdvSessionForRuntime(targetRuntime, runtimeState.activeSession);
    let requestedIds = new Set(core_text.cleanArray(session.advBulkRecovery?.failedIds, 64, 100));
    let failed = session.events.filter(event => !event.adv?.paragraphs?.length && (!requestedIds.size || requestedIds.has(event.id)));
    if (!failed.length) {
        await clearCommittedAdvRecovery(targetRuntime, session, 'adv-repair');
        session.advBulkRecovery = null;
        if (advTargetVisible(targetRuntime, origin)) {
            runtimeState.activeSession = session;
            ui_advEventView.renderAdvMode();
        }
        return;
    }
    if (!ui_overlay.confirmExplicitAction(
        `逐个补完 ${failed.length} 篇失败 ADV？`,
        `这最多会发出 ${failed.length} 次独立模型请求。若你更在意请求次数，请取消并选择“再次一键生成失败项（1 次请求）”。`,
        { destructive: false },
    )) return;

    const memoryBank = targetRuntime.memoryBank;
    runtimeState.activeAdvBulkScopes.add(scope);
    const bulkCancel = core_requestCoordinator.openAdvBulkCancellation(scope);
    core_requestCoordinator.registerArchiveTargetReservation(bulkTaskKey, targetRuntime, core_constants.MODE.ADV,
        advTargetMessage(targetRuntime, 'ADV 失败项补完中'));
    try {
    if (!await beginAdvSubtask(targetRuntime)) {
        runtimeState.activeAdvBulkScopes.delete(scope);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    origin = targetRuntime.origin;
    session = latestAdvSessionForRuntime(targetRuntime, session);
    requestedIds = new Set(core_text.cleanArray(session.advBulkRecovery?.failedIds, 64, 100));
    failed = session.events.filter(event => !event.adv?.paragraphs?.length && (!requestedIds.size || requestedIds.has(event.id)));
    if (!failed.length) {
        await clearCommittedAdvRecovery(targetRuntime, session, 'adv-repair');
        globalThis.toastr?.info?.('较新的任务已经补完这些 ADV，本次没有重复请求。', '心迹回廊');
        runtimeState.activeAdvBulkScopes.delete(scope);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    let repaired = 0;
    try {
        await startAdvRecovery(targetRuntime, { kind: 'adv-repair', eventIds: failed.map(event => event.id) }, options, session);
        for (let i = 0; i < failed.length; i += 1) {
            if (bulkCancel.signal.aborted) throw core_requestCoordinator.createGenerationAbortError();
            const event = failed[i];
            if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(true, advTargetStatus(targetRuntime, `逐个补完 ${i + 1} / ${failed.length}：${event.title}`));
            let adv;
            try {
                adv = await generation_client.requestValidatedSegment(
                    advPrompt(context, event, memoryBank),
                    `正在补 ADV：${event.title}`,
                    {
                        maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ADV],
                        context,
                        origin,
                        signal: bulkCancel.signal,
                        taskKey: `adv-user-repair:${scope}:${core_text.safeId(event.id, String(i + 1))}`,
                        mode: core_constants.MODE.ADV,
                        background: true,
                        segmentMaxAttempts: 1,
                    },
                    raw => normalizeAdv(raw),
                );
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                if (error?.code === 'RMT_JSON_TRUNCATED' || /^RMT_RECOVERY_/.test(error?.code || '')) throw error;
                console.warn('[HeartbeatMemories] user-requested ADV repair failed', { eventId: core_text.normalizeText(event.id, 80), ...core_text.safeErrorDiagnostic(error) });
                await core_context.yieldToUi();
                continue;
            }
            const persisted = await persistAdvMutation(targetRuntime, latest => {
                const next = structuredClone(latest || session);
                const item = next.events?.find(candidate => candidate.id === event.id);
                if (item && !item.adv?.paragraphs?.length) item.adv = adv;
                return next;
            }, session);
            session = persisted.session || session;
            if (session.events?.find(item => item.id === event.id)?.adv?.paragraphs?.length) repaired += 1;
            await core_context.yieldToUi();
        }
        const persisted = await persistAdvMutation(targetRuntime, latest => {
            const next = structuredClone(latest || session);
            const pendingIds = (next.events || []).filter(item => !item.adv?.paragraphs?.length).map(item => item.id);
            next.advBulkRecovery = pendingIds.length ? { failedIds: pendingIds, attemptedAt: Date.now(), batchSucceeded: 0, error: '' } : null;
            return next;
        }, session);
        session = persisted.session || session;
        const stillFailed = session.events.filter(event => !event.adv?.paragraphs?.length);
        if (!stillFailed.length) await finishAdvRecovery(targetRuntime, persisted.committed);
        const visible = shouldRenderAdvTarget(targetRuntime)
            && (targetRuntime.archiveTarget || core_context.isCurrentTaskOrigin(origin))
            && runtimeState.activeSession?.kind === core_constants.MODE.ADV
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden;
        if (visible) {
            runtimeState.activeSession = session;
            ui_advEventView.renderAdvMode();
        }
        globalThis.toastr?.[stillFailed.length ? 'warning' : 'success']?.(advTargetMessage(targetRuntime, `逐个补完完成：成功 ${repaired} 篇${stillFailed.length ? `，仍有 ${stillFailed.length} 篇失败` : '，全部 ADV 已就绪'}。`), '心迹回廊');
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') showAdvFailure(targetRuntime, error);
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeAdvBulkScopes.delete(scope);
        core_requestCoordinator.closeAdvBulkCancellation(scope, bulkCancel);
        core_requestCoordinator.unregisterArchiveTargetReservation(bulkTaskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.ADV, origin);
        refreshAdvArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeAdvBulkScopes.delete(scope);
        core_requestCoordinator.closeAdvBulkCancellation(scope, bulkCancel);
        core_requestCoordinator.unregisterArchiveTargetReservation(bulkTaskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        refreshAdvArchiveTarget(targetRuntime);
    }
}

export async function generateAdvForSelected(options = {}) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return;
    const selectedId = options.eventId || runtimeState.activeSession.selectedId;
    const targetHint = advPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareAdvSubtaskRuntime(`event:${core_text.safeId(selectedId, 'event')}`); }
    catch (error) { showAdvFailure(targetHint, error); return; }
    let session = latestAdvSessionForRuntime(targetRuntime, runtimeState.activeSession);
    let event = session.events.find(x => x.id === selectedId);
    if (!event) return;
    if (event.adv?.paragraphs?.length) {
        await clearCommittedAdvRecovery(targetRuntime, session, 'adv-single', selectedId);
        if (shouldRenderAdvTarget(targetRuntime) && runtimeState.activeSession?.kind === core_constants.MODE.ADV && ui_overlay.bodyEl()) {
            session.view = 'adv';
            session.paragraphIndex = 0;
            runtimeState.activeSession = session;
            ui_advEventView.renderAdvMode();
        }
        return;
    }
    const { context, scope } = targetRuntime;
    let origin = targetRuntime.origin;
    if (runtimeState.activeAdvBulkScopes.has(scope)) return showAdvNotice(targetRuntime, '全部 ADV 正在批量生成 / 补失败项，请稍后再单独打开。');
    const eventId = event.id;
    const taskKey = `adv:${scope}:${core_text.safeId(eventId, 'event')}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.ADV, context)) {
        return showAdvNotice(targetRuntime, 'ADV EVENT 事件索引正在增量追加，请等索引完成后再生成具体 ADV。');
    }
    if (runtimeState.activeModeBuildScopes.has(taskKey) || core_requestCoordinator.hasGenerationTaskPrefix(`adv:${scope}:`)) {
        return showAdvNotice(targetRuntime, core_requestCoordinator.isGenerationTaskRunning(taskKey) ? '这篇 ADV 已经在生成中。' : '当前窗口还有另一篇 ADV 正在生成，请等它完成后再生成下一篇。');
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        return showAdvNotice(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请稍后再试。`);
    }
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.ADV,
        advTargetMessage(targetRuntime, `ADV 正文生成中：${event.title}`));
    try {
    if (!await beginAdvSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    origin = targetRuntime.origin;
    session = latestAdvSessionForRuntime(targetRuntime, session);
    event = session?.events?.find(item => item.id === eventId);
    if (!event || event.adv?.paragraphs?.length) {
        if (event) await clearCommittedAdvRecovery(targetRuntime, session, 'adv-single', eventId);
        globalThis.toastr?.info?.(advTargetMessage(targetRuntime, event ? '较新的任务已经补完这篇 ADV，本次没有重复请求。' : '这条 ADV 事件已不在最新档案中，本次没有请求。'), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshAdvArchiveTarget(targetRuntime);
        return;
    }
    const memoryBank = targetRuntime.memoryBank;
    if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(true, advTargetStatus(targetRuntime, `正在为「${event.title}」生成长篇 ADV…`));
    try {
        await startAdvRecovery(targetRuntime, { kind: 'adv-single', eventId }, options, session);
        const generatedAdv = await generation_client.requestValidatedSegment(
            advPrompt(context, event, memoryBank), `正在根据当前聊天档案生成「${event.title}」ADV…`,
            { maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ADV], context, origin, taskKey, mode: core_constants.MODE.ADV, background: true, segmentMaxAttempts: 1 },
            raw => normalizeAdv(raw),
        );
        const persisted = await persistAdvMutation(targetRuntime, latest => {
            const next = structuredClone(latest || session);
            const item = next.events?.find(candidate => candidate.id === eventId);
            if (!item) return null;
            if (!item.adv?.paragraphs?.length) item.adv = generatedAdv;
            next.selectedId = eventId;
            next.view = 'adv';
            next.paragraphIndex = 0;
            return next;
        }, session);
        session = persisted.session || session;
        await finishAdvRecovery(targetRuntime, persisted.committed);
        const wasBackgrounded = !shouldRenderAdvTarget(targetRuntime)
            || (!targetRuntime.archiveTarget && !core_context.isCurrentTaskOrigin(origin))
            || document.getElementById(core_constants.OVERLAY_ID)?.hidden
            || runtimeState.activeSession?.kind !== core_constants.MODE.ADV;
        if (wasBackgrounded || !persisted.committed) {
            if (targetRuntime.archiveTarget) ui_settingsPanel.refreshSettingsTaskStatus();
            else ui_settingsPanel.refreshSettingsMemoryStatus();
            globalThis.toastr?.success?.(advTargetMessage(targetRuntime, `ADV 后台生成完成：${event.title}`), '心迹回廊');
            return;
        }
        runtimeState.activeSession = session;
        ui_advEventView.renderAdvMode();
        globalThis.toastr?.success?.(advTargetMessage(targetRuntime, `ADV 已生成：${event.title}`), '心迹回廊');
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name === 'AbortError') {
            console.warn('[HeartbeatMemories] ADV generation aborted after chat/extension change');
            if (advTargetVisible(targetRuntime, origin)) {
                ui_overlay.setInnerLoading(false);
                ui_overlay.showChooser();
            }
            return;
        }
        console.error('[HeartbeatMemories] ADV generation failed', core_text.safeErrorDiagnostic(error));
        showAdvFailure(targetRuntime, error);
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        refreshAdvArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        if (advTargetVisible(targetRuntime, origin)) ui_overlay.setInnerLoading(false);
        refreshAdvArchiveTarget(targetRuntime);
    }
}
