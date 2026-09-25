import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_heartLanguage from '../core/heartLanguage.js';
import * as core_context from '../core/context.js';
import * as core_incremental from '../core/incremental.js';
import * as core_participants from '../core/participants.js';
import * as routePeople from '../core/routeParticipants.js';
import * as core_generationParticipants from '../core/generationParticipants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as ui_heartView from '../ui/heartView.js';
import * as ui_overlay from '../ui/overlay.js';
import { makeHeartSession, makeHeartShell, mergeHeartCoreIncremental, normalizeHeart, normalizeHeartContentPatch, normalizeHeartCore, normalizeHeartCoreIncrement, preserveHeartSelection, showSavedHeartTaskResult } from './heartData.js';
import { heartCoreIncrementPrompt, heartCoreLegacyPrompt, heartCorePrompt, partsDialoguesReady } from './heartPrompts.js';
// HEART 任务运行：页面替换、后台目标、子任务与恢复、会话落盘、批次编号、整体生成修复
// 从 modes/heart.js 原样搬出（重构阶段 2），声明文本一字未改；modes/heart.js 仍转发原有导出。

export async function generateHeartWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const existing = core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(existing, memoryBank, 'dialogues');
    if (existing && partsDialoguesReady(existing) && options.replaceExisting !== true) {
        const core = await generation_client.requestValidatedSegment(
            heartCoreIncrementPrompt(context, memoryBank, existing, sourceMemoryIds) + core_incremental.derivedExpansionDirective(existing, memoryBank, 'dialogues'),
            '角色互动 · 正在从新增档案追加时期对话…',
            { maxTokens: 4500, temperatureCeiling: 0.4, context, origin, taskKey: `${taskKey}:dialogues-increment`, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeHeartCoreIncrement(raw, memoryBank, sourceMemoryIds),
        );
        const preserveRelationship = !core.relationshipSourceMemoryIds?.length
            || !core.relationshipSourceMemoryAnchor
            || !core_incremental.incrementalArchiveMemoryIds(existing, memoryBank, 'dialogues').length;
        const { session, added } = mergeHeartCoreIncremental(existing, core, preserveRelationship);
        const normalized = normalizeHeart(session, memoryBank);
        return core_incremental.stampIncrementalCoverage(normalized, existing, memoryBank, 'dialogues', sourceMemoryIds, added);
    }
    const core = await generation_client.requestValidatedSegment(
        heartCorePrompt(context, memoryBank),
        '角色互动 · 正在生成时期对话…',
        { maxTokens: 6000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true,
            recoveryCompatibility: { contract: 'heart-language-birthday-r8412', legacyPrompts: [heartCoreLegacyPrompt(context, memoryBank)], legacyTemperatures: [0.35] } },
        raw => normalizeHeartCore(raw, memoryBank),
    );
    // Generic/automatic admission only fills an incomplete library. Explicit
    // replacement lives in generateHeartSection and always asks twice first.
    const combined = existing && options.replaceExisting !== true
        ? mergeHeartCoreIncremental(existing, core, !!existing.relationshipSummary && !core.relationshipSourceMemoryIds?.length).session
        : makeHeartSession(core, existing);
    const normalized = normalizeHeart(combined, memoryBank);
    return core_incremental.stampIncrementalCoverage(normalized, existing, memoryBank, 'dialogues', sourceMemoryIds, Object.values(core.greetings || {}).flat().length);
}

export const HEART_REGENERATION_PAGES = new Set(['language', 'spring', 'summer', 'autumn', 'winter', 'strips', 'fireflies', 'postending']);

export function heartParticipantRegeneration(options) {
    return options?.participantRegeneration || options?.existing?.operation?.participantRegeneration;
}

// Only a validated replacement for the explicitly selected page enters this
// merge. Do not normalize the whole session: untouched pages may contain old
// text, image records or fields unknown to the current generator.
export function applyHeartPageReplacement(base, pageId, replacement, participantRegeneration) {
    if (!HEART_REGENERATION_PAGES.has(pageId)) throw new TypeError('Unknown HEART replacement page.');
    const updated = structuredClone(base || {});
    const generationParts = { ...(updated.generationParts || {}) };
    if (pageId === 'language') {
        for (const key of ['relationshipState', 'relationshipSummary', 'relationshipSourceMemoryIds',
            'relationshipSourceMemoryAnchor', 'birthdayMmDd', 'userBirthdayMmDd', 'specialDays', 'greetings']) {
            updated[key] = structuredClone(replacement[key]);
        }
        generationParts.dialogues = core_heartLanguage.heartLanguageStatus(replacement).complete;
    } else if (pageId === 'strips' || pageId === 'fireflies') {
        const field = pageId === 'strips' ? 'dailyStrips' : 'fireflyVoices';
        updated[field] = structuredClone(replacement[field]);
        updated.collectionIssues = { ...(updated.collectionIssues || {}), [pageId]: replacement.rejectedCount || 0 };
        generationParts[pageId] = updated[field].length > 0;
    } else {
        // Replace this season in place while retaining every other season's
        // objects and order, including old images and unrecognized fields.
        const replaceSeason = (items, key, next) => {
            const out = [], incoming = structuredClone(next);
            let inserted = false;
            for (const item of items || []) {
                if (item?.[key] !== pageId) out.push(item);
                else if (!inserted) { out.push(...incoming); inserted = true; }
            }
            if (!inserted) out.push(...incoming);
            return out;
        };
        updated.voiceDramas = replaceSeason(updated.voiceDramas, 'kind', replacement.voiceDramas);
        if (pageId !== 'postending') updated.scenarioDramas = replaceSeason(updated.scenarioDramas, 'season', replacement.scenarioDramas);
        generationParts.seasons = true;
    }
    updated.generationParts = generationParts;
    updated.participantRegenerationPages = { ...(updated.participantRegenerationPages || {}),
        [pageId]: structuredClone(participantRegeneration) };
    return updated;
}

export async function commitHeartPageReplacement(targetRuntime, base, pageId, replacement, participantRegeneration, logicalTask) {
    const { origin, expectedChatId, expectedArchiveRevision } = targetRuntime;
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    const sourceMemory = targetRuntime.recoveryHandle?.contentBank;
    if (sourceMemory?.archiveRevision && sourceMemory.archiveRevision !== expectedArchiveRevision) {
        return core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART,
            applyHeartPageReplacement(base, pageId, replacement, participantRegeneration), origin, {
                pageId, archiveTarget: targetRuntime.archiveTarget, memoryBank: targetRuntime.memoryBank,
                sourceMemory, stillCurrent: targetRuntime.stillCurrent,
            });
    }
    const mutate = latest => {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        return applyHeartPageReplacement(latest || base, pageId, replacement, participantRegeneration);
    };
    const commitOptions = { participantRegeneration, completeGeneration: true };
    let session;
    if (targetRuntime.archiveTarget) {
        if (!targetRuntime.stillCurrent()) throw core_requestCoordinator.createGenerationAbortError();
        const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
        const result = await core_cache.commitDetachedArchiveSessionMutation(target, core_constants.MODE.HEART, origin,
            mutate, base, () => targetRuntime.stillCurrent() && !logicalTask.signal.aborted, commitOptions);
        if (!result.unchanged) session = result.session;
        if (session) archive_library.syncArchiveTargetSubtask(targetRuntime, { ...target, cache: result.cache, loadedAt: Date.now() });
    } else {
        session = await core_cache.commitSessionMutation(core_constants.MODE.HEART, expectedChatId, origin, mutate, base, commitOptions);
    }
    if (!session) throw core_text.safeUserError('这一页尚未确认保存；旧内容与重做草稿保留。', 'RMT_HEART_REPLACEMENT_UNCOMMITTED');
    const visible = runtimeState.activeSession;
    const sameReader = visible?.kind === core_constants.MODE.HEART && visible.chatId === expectedChatId
        && visible.archiveRevision === expectedArchiveRevision && (targetRuntime.archiveTarget
            ? runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId
            : !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin));
    if (sameReader) {
        runtimeState.activeSession = preserveHeartSelection({ ...session }, visible);
        if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    }
    return session;
}

const ordinaryHeartLogicalTasks = new WeakMap();

// A queued page owns a saved HEART target, independently of the page currently
// visible in the overlay. An empty target is a local shell, not an extra model
// request for unrelated foundation dialogue.
export function captureHeartBackgroundTarget(context = core_context.currentCharacterGuard()) {
    const memory = archive_repository.requireArchive(context);
    const stored = core_cache.getCache(context);
    const session = core_cache.loadSession(core_constants.MODE.HEART, { context, cache: stored,
        chatId: memory.chatId, memoryBank: memory, clone: true });
    if (!session && stored?.[core_constants.MODE.HEART]) throw core_text.safeUserError('原角色互动暂不可安全读取，旧内容保留。', 'RMT_HEART_SOURCE_CHANGED');
    return { context, session: session || makeHeartShell(memory),
        origin: core_context.captureTaskOrigin(context, memory.archiveRevision) };
}

function assertHeartBackgroundTarget(target) {
    if (!target?.context || target.session?.kind !== core_constants.MODE.HEART
        || !core_context.isCurrentTaskOrigin(target.origin)) throw core_requestCoordinator.createGenerationAbortError();
    const memory = archive_repository.requireArchive(target.context);
    if (core_context.comparableChatId(target.session.chatId) !== core_context.comparableChatId(memory.chatId)
        || target.session.archiveRevision !== memory.archiveRevision) throw core_requestCoordinator.createGenerationAbortError();
    return memory;
}

export async function runOrdinaryHeartLogicalTask(pageId, options, run) {
    let logicalTask;
    try {
        if (options.backgroundTarget) assertHeartBackgroundTarget(options.backgroundTarget);
        const context = options.backgroundTarget?.context || (runtimeState.activeArchiveSnapshot
            ? archive_library.archiveTargetGenerationOptions().context : core_context.currentCharacterGuard());
        const memory = archive_repository.requireArchive(context);
        const origin = { ...core_context.captureTaskOrigin(context, memory.archiveRevision),
            ...(!options.backgroundTarget && runtimeState.activeArchiveSnapshot ? { archiveTargetEntryId: runtimeState.activeArchiveSnapshot.entryId } : {}) };
        // Register before preparation yields. The existing per-part admission checks
        // still decide whether this ordinary append can actually start a request.
        logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'heart-page', mode: core_constants.MODE.HEART,
            pageId, context, origin, parentTaskId: options.logicalParentTaskId });
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(heartPreparationTargetHint(), core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    try {
        return await run(logicalTask);
    } catch (error) {
        logicalTask.failureCode = core_text.normalizeText(error?.code, 80);
        logicalTask.failureSummary = core_text.safeErrorSummary(error);
        throw error;
    } finally {
        // Includes preparation, all child requests, recovery and persistence cleanup.
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask);
    }
}

function bindOrdinaryHeartRuntime(targetRuntime, logicalTask) {
    if (!logicalTask) return targetRuntime;
    core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin);
    ordinaryHeartLogicalTasks.set(targetRuntime, logicalTask);
    const stillCurrent = targetRuntime.stillCurrent;
    targetRuntime.stillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(logicalTask) && stillCurrent();
    return targetRuntime;
}

export async function prepareHeartSubtaskRuntime(taskPart, logicalTask = null, backgroundTarget = null) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    if (backgroundTarget) assertHeartBackgroundTarget(backgroundTarget);
    const targetRuntime = backgroundTarget ? null : await archive_library.prepareArchiveTargetSubtask(core_constants.MODE.HEART, taskPart);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    if (targetRuntime) return bindOrdinaryHeartRuntime(targetRuntime, logicalTask);
    if (!backgroundTarget && !archive_library.requireWritableArchiveAction()) throw new Error('当前档案尚未处于可写的真实聊天上下文。');
    const context = backgroundTarget?.context || core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const origin = {
        ...core_context.captureTaskOrigin(context, expectedArchiveRevision),
        chatId: core_context.comparableChatId(expectedChatId),
    };
    return bindOrdinaryHeartRuntime({
        archiveTarget: null,
        context,
        memoryBank,
        expectedChatId,
        expectedArchiveRevision,
        scope: core_context.chatScopeKey(context),
        origin,
        stillCurrent: () => core_context.isCurrentTaskOrigin(origin),
        options: null,
        backgroundSession: backgroundTarget?.session || null,
    }, logicalTask);
}

export function latestHeartSessionForRuntime(targetRuntime, fallback = null) {
    const cache = targetRuntime.archiveTarget?.cache || core_cache.getCache(targetRuntime.context);
    const session = core_cache.loadSession(core_constants.MODE.HEART, {
        context: targetRuntime.context, cache,
        chatId: targetRuntime.expectedChatId,
        memoryBank: targetRuntime.archiveTarget?.memory || targetRuntime.memoryBank,
        clone: true,
    });
    if (!session && cache?.[core_constants.MODE.HEART]) throw core_text.safeUserError('原角色互动暂不可安全读取，旧内容保留。', 'RMT_HEART_SOURCE_CHANGED');
    return session || structuredClone(targetRuntime.backgroundSession || (fallback?.kind === core_constants.MODE.HEART ? fallback : null)) || makeHeartShell(targetRuntime.memoryBank);
}

export async function beginHeartSubtask(targetRuntime) {
    const logicalTask = ordinaryHeartLogicalTasks.get(targetRuntime);
    try {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        if (targetRuntime.archiveTarget) await archive_library.beginArchiveTargetSubtask(targetRuntime);
        else {
            await core_cache.claimLiveModeGeneration(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.memoryBank, targetRuntime.recoverySelection || {});
            targetRuntime.origin = core_context.captureTaskOrigin(targetRuntime.context, targetRuntime.expectedArchiveRevision);
        }
        // Claims replace the origin/write fence; child requests must belong to the
        // same logical task after that replacement, including after cancellation.
        bindOrdinaryHeartRuntime(targetRuntime, logicalTask);
        return true;
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return false;
    }
}

async function freezeHeartParticipantSnapshot(targetRuntime, operation, existing, handle, options = {}) {
    const frozenInputs = handle.journal?.frozenInputs || {};
    let snapshot;
    if (Object.hasOwn(frozenInputs, 'participants:heart')) {
        snapshot = core_generationParticipants.resolveGenerationParticipantSnapshot({ frozenSnapshot: JSON.parse(frozenInputs['participants:heart']) });
    } else if (!existing && Object.hasOwn(options, 'participantSnapshot')) {
        snapshot = core_generationParticipants.resolveGenerationParticipantSnapshot({frozenSnapshot: options.participantSnapshot});
        snapshot = await generation_recovery.frozenGenerationInput(targetRuntime.origin, 'participants:heart', () => snapshot);
    } else if (operation?.participantRegeneration && Object.hasOwn(operation.participantRegeneration, 'participantSnapshot')) {
        snapshot = core_generationParticipants.resolveGenerationParticipantSnapshot({ frozenSnapshot: operation.participantRegeneration.participantSnapshot });
        snapshot = await generation_recovery.frozenGenerationInput(targetRuntime.origin, 'participants:heart', () => snapshot);
    } else {
        // A legacy recovery has no reproducible roster input. Keep its exact old
        // recipe rather than reading today's picker state or adding a new key.
        if (existing) return null;
        const roster = core_participants.normalizeParticipantRoster(handle.contentBank?.[core_participants.PARTICIPANTS_KEY])
            || core_cache.readParticipantRoster(targetRuntime.context);
        snapshot = core_generationParticipants.resolveGenerationParticipantSnapshot({ roster });
        if (!snapshot) return null;
        snapshot = await generation_recovery.frozenGenerationInput(targetRuntime.origin, 'participants:heart', () => snapshot);
    }
    if (!snapshot) return null;
    handle.contentBank = core_generationParticipants.deriveGenerationParticipantMemoryBank(handle.contentBank, snapshot);
    const logicalTask = ordinaryHeartLogicalTasks.get(targetRuntime)
        || core_requestCoordinator.logicalGenerationTaskForOrigin(targetRuntime.origin);
    if (logicalTask) core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin, { participantSnapshot: snapshot });
    return snapshot;
}

export async function startHeartRecovery(targetRuntime, operation, options = {}) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(targetRuntime.origin);
    targetRuntime.recoveryArchiveEntry = targetRuntime.archiveTarget || core_cache.archiveBackupEntryForContext(targetRuntime.context, targetRuntime.memoryBank);
    const pageId = operation.participantRegeneration?.pageId || (operation.kind === 'heart-season' ? operation.season
        : operation.kind === 'heart-fireflies' ? 'fireflies' : operation.part === 'dialogues' ? 'language' : operation.part);
    const route = pageId === 'postending' ? 'postending' : ['spring','summer','autumn','winter'].includes(pageId) ? 'heart' : pageId;
    if (!Object.hasOwn(options, 'participantSnapshot') && !options.existing && !options.draftId && !options.participantRegeneration
        && !core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.archiveTarget?.cache, {pageId})) {
        options = { ...options, participantSnapshot: routePeople.captureRoutePeople(route, targetRuntime.context, targetRuntime.memoryBank) };
    }
    // An ordinary page click resumes that page's latest unfinished operation;
    // an explicit rebuild starts a separate attempt. Other pages remain saved.
    const existing = options.existing !== undefined ? options.existing : options.participantRegeneration && !options.draftId ? null
        : core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.archiveTarget?.cache,
            { ...(options.draftId ? { draftId: options.draftId } : {}), pageId });
    const handle = await generation_client.beginModeRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.memoryBank, targetRuntime.origin, {
        ...options, existing, pageId, operation,
        contentInputs: { baseSession: latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession) },
        archiveTarget: targetRuntime.archiveTarget, archiveEntry: targetRuntime.recoveryArchiveEntry,
        stillCurrent: targetRuntime.archiveTarget ? targetRuntime.stillCurrent : undefined,
    });
    await freezeHeartParticipantSnapshot(targetRuntime, operation, existing, handle, options);
    targetRuntime.recoveryHandle = handle;
    return handle;
}

export function ordinaryHeartRecoveryOptions(targetRuntime, pageId, options) {
    const selected = options.existing !== undefined ? options : { ...options,
        existing: core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context,
            targetRuntime.archiveTarget?.cache, { ...(options.draftId ? { draftId: options.draftId } : {}), pageId }) };
    targetRuntime.recoverySelection = { pageId, draftId: options.draftId || selected.existing?.draftId || '' };
    return selected;
}

export async function finishHeartRecovery(targetRuntime, committed) {
    if (!committed) return;
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(targetRuntime.origin);
    if (targetRuntime.taskResultSession) {
        targetRuntime.taskResult = await core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART,
            targetRuntime.taskResultSession, targetRuntime.origin, { pageId: targetRuntime.recoveryHandle.journal.pageId,
                archiveTarget: targetRuntime.archiveTarget, memoryBank: targetRuntime.memoryBank,
                sourceMemory: targetRuntime.recoveryHandle.contentBank, stillCurrent: targetRuntime.stillCurrent });
        showSavedHeartTaskResult(targetRuntime.taskResult.draftId, targetRuntime.context);
        return;
    }
    await core_cache.saveGenerationRecovery(targetRuntime.context, targetRuntime.memoryBank, core_constants.MODE.HEART, null, targetRuntime.origin, {
        archiveTarget: targetRuntime.archiveTarget, archiveEntry: targetRuntime.recoveryArchiveEntry,
        stillCurrent: targetRuntime.archiveTarget ? targetRuntime.stillCurrent : undefined,
    });
}

export async function clearCommittedHeartRecovery(targetRuntime, session, operation) {
    const journal = core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.archiveTarget?.cache);
    if (journal?.draftId && journal.draftId !== targetRuntime.origin.generationRecoveryDraftId) return false;
    const summary = generation_recovery.generationRecoverySummary(journal);
    if (!summary?.completed || summary.truncated || summary.failed || summary.failureCode
        || journal.operation?.kind !== operation.kind || (operation.part && journal.operation.part !== operation.part)
        || (operation.season && journal.operation.season !== operation.season)) return false;
    if (operation.kind === 'heart-season') {
        const { batchId, season } = journal.operation;
        if (!batchId || !session?.voiceDramas?.some(item => item.kind === season && item.incrementBatchId === batchId)
            || (season !== 'postending' && !session?.scenarioDramas?.some(item => item.season === season && item.incrementBatchId === batchId))) return false;
    }
    targetRuntime.recoveryArchiveEntry = targetRuntime.archiveTarget || core_cache.archiveBackupEntryForContext(targetRuntime.context, targetRuntime.memoryBank);
    await finishHeartRecovery(targetRuntime, true);
    return true;
}

export function recoveryStopsHeart(error) {
    return error?.code === 'RMT_JSON_TRUNCATED' || /^RMT_RECOVERY_/.test(error?.code || '')
        || core_requestCoordinator.stopsCompositeGeneration(error);
}

export function heartTargetMessage(targetRuntime, message) {
    const text = core_text.normalizeText(message, 1200);
    return targetRuntime?.archiveTarget
        ? `${targetRuntime.archiveTarget.characterName} · ${targetRuntime.archiveTarget.archiveName}：${text}`
        : text;
}

export function heartPreparationTargetHint() {
    const snapshot = runtimeState.activeArchiveSnapshot;
    return snapshot?.entryId ? { archiveTarget: {
        entryId: snapshot.entryId,
        characterName: snapshot.characterName,
        archiveName: snapshot.archiveName,
    } } : null;
}

export function refreshHeartArchiveTarget(targetRuntime) {
    const entryId = core_text.normalizeText(targetRuntime?.archiveTarget?.entryId, 120);
    if (entryId) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(entryId));
}

export async function persistHeartWholeSession(session, targetRuntime, origin) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    // This path only migrates the legacy firefly coverage cursor. Merge that cursor into the
    // latest canonical HEART session instead of replacing sibling dialogue/season/strip writes.
    const mutateCoverage = latestSession => {
        const next = structuredClone(latestSession || session);
        const desiredMeta = session?.generationMeta && typeof session.generationMeta === 'object' ? session.generationMeta : {};
        const nextMeta = next?.generationMeta && typeof next.generationMeta === 'object' ? next.generationMeta : {};
        const desiredRecord = desiredMeta?.parts?.fireflies;
        if (!desiredRecord || typeof desiredRecord !== 'object') return next;
        next.generationMeta = {
            ...structuredClone(nextMeta),
            schemaVersion: desiredMeta.schemaVersion || nextMeta.schemaVersion,
            parts: {
                ...(nextMeta.parts && typeof nextMeta.parts === 'object' ? structuredClone(nextMeta.parts) : {}),
                fireflies: structuredClone(desiredRecord),
            },
            lastUpdate: structuredClone(desiredMeta.lastUpdate || nextMeta.lastUpdate || {}),
        };
        next.generationParts = { ...(next.generationParts || {}), fireflies: Array.isArray(next.fireflyVoices) && next.fireflyVoices.length > 0 };
        return next;
    };
    if (!targetRuntime?.archiveTarget) {
        return core_cache.commitSessionMutation(core_constants.MODE.HEART, targetRuntime.expectedChatId, origin, mutateCoverage, session);
    }
    if (!targetRuntime.stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
    const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
    const result = await targetRuntime.options.commitArchiveTargetMutation(
        target,
        core_constants.MODE.HEART,
        origin,
        mutateCoverage,
        session,
        targetRuntime.stillCurrent,
    );
    archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
    return result.session || null;
}

export async function persistHeartPartialPatch(patchKey, patch, fallbackBase, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime = null) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    if (targetRuntime?.recoveryHandle?.contentBank?.archiveRevision
        && targetRuntime.recoveryHandle.contentBank.archiveRevision !== expectedArchiveRevision) {
        const updated = normalizeHeartContentPatch(targetRuntime.taskResultSession || fallbackBase, [patch], memoryBank);
        await core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART, updated, origin, {
            pageId: targetRuntime.recoveryHandle.journal.pageId, archiveTarget: targetRuntime.archiveTarget,
            memoryBank: targetRuntime.memoryBank, sourceMemory: memoryBank, complete: false, stillCurrent: targetRuntime.stillCurrent });
        targetRuntime.taskResultSession = updated;
        return { updated, committed: true, taskResult: true };
    }
    let committed = false;
    let updated = null;
    if (targetRuntime?.archiveTarget) {
        if (!targetRuntime.stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
        const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
        const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
        const result = await targetRuntime.options.commitArchiveTargetMutation(
            target,
            core_constants.MODE.HEART,
            origin,
            (latestSession, liveMemory) => normalizeHeartContentPatch(latestSession || fallbackBase, [patch], liveMemory),
            fallbackBase,
            targetRuntime.stillCurrent,
        );
        updated = result.session;
        committed = !!updated;
        archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
    } else if (core_context.isCurrentTaskOrigin(origin)) {
        try {
            const context = core_context.currentCharacterGuard();
            const latestMemory = archive_repository.requireArchive(context);
            if (latestMemory.archiveRevision === expectedArchiveRevision) {
                updated = await core_cache.commitSessionMutation(
                    core_constants.MODE.HEART,
                    expectedChatId,
                    origin,
                    (latest, liveMemory) => normalizeHeartContentPatch(latest || fallbackBase, [patch], liveMemory),
                    fallbackBase,
                );
                committed = !!updated;
            }
        } catch {}
    }
    if (!committed && !targetRuntime?.archiveTarget) {
        // The live commit may throw after an await. Cancellation must not be
        // swallowed by its legacy fallback and queued as a late append.
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
        core_requestCoordinator.queueDeferredCommit(origin, { kind: 'heartPatches', patches: { [patchKey]: patch } });
        updated = normalizeHeartContentPatch(fallbackBase, [patch], memoryBank);
        updated.chatId = expectedChatId;
        updated.archiveRevision = expectedArchiveRevision;
    }
    const sameTargetVisible = targetRuntime?.archiveTarget
        ? runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId
        : true;
    const visible = runtimeState.activeSession;
    const sameReaderOwner = visible?.kind === core_constants.MODE.HEART
        && visible.chatId === expectedChatId && visible.archiveRevision === expectedArchiveRevision
        && (targetRuntime?.archiveTarget ? sameTargetVisible
            : !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin));
    if (committed && sameReaderOwner) {
        // Merge the latest committed content, never the saved reader cursor. The user may
        // have turned pages or changed standalone routes while this request was running.
        runtimeState.activeSession = preserveHeartSelection({ ...updated }, visible);
        if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    }
    return { updated, committed };
}

export function pendingHeartDramaBatchId(session, season) {
    if (!session || season === 'postending') return '';
    const voices = (Array.isArray(session.voiceDramas) ? session.voiceDramas : []).filter(item => item.kind === season && core_text.normalizeText(item.incrementBatchId, 80));
    const scenarios = (Array.isArray(session.scenarioDramas) ? session.scenarioDramas : []).filter(item => item.season === season && core_text.normalizeText(item.incrementBatchId, 80));
    const voiceIds = new Set(voices.map(item => core_text.normalizeText(item.incrementBatchId, 80)));
    const scenarioIds = new Set(scenarios.map(item => core_text.normalizeText(item.incrementBatchId, 80)));
    const candidates = [...voices, ...scenarios]
        .sort((a, b) => (Number(b?.generatedAt) || 0) - (Number(a?.generatedAt) || 0))
        .map(item => core_text.normalizeText(item?.incrementBatchId, 80))
        .filter(Boolean);
    return candidates.find(id => voiceIds.has(id) !== scenarioIds.has(id)) || '';
}

export function nextHeartDramaBatchId(session, season) {
    const pending = pendingHeartDramaBatchId(session, season);
    if (pending) return pending;
    const voiceCount = (Array.isArray(session?.voiceDramas) ? session.voiceDramas : []).filter(item => item.kind === season).length;
    const scenarioCount = (Array.isArray(session?.scenarioDramas) ? session.scenarioDramas : []).filter(item => item.season === season).length;
    return core_context.stableArchiveHash(`heart-drama|${season}|${voiceCount}|${scenarioCount}|${Date.now()}|${Math.random()}`);
}
