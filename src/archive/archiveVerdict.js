import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_text from '../core/text.js';
import * as archive_importRecovery from './importRecovery.js';
import * as ui_overlay from '../ui/overlay.js';
import * as participants from '../core/participants.js';
import { finishArchiveTaskTrace, getImportedMemory, isArchiveCancellation } from './archiveCore.js';
import { externalMemoryImportPrompt, normalizeExternalImportedMemories } from './externalMemory.js';
import { archiveProfilePrompt, checkedArchiveProfile, memoryImportPrompt, normalizeImportedChunk } from './importPrompts.js';
import { archiveContentContext, archiveRecoverySettingsIdentity, archiveSourceOwnerIdentity, captureArchiveTaskInput, checkedArchiveTaskInput } from './importIdentity.js';
import { archivedRequestJson, getCurrentArchiveImportRecoverySummary, getCurrentArchiveProfileRecoverySummary, refreshArchiveRecoveryReading } from './recoveryDrafts.js';
// 档案复核与简介：分段生成、复核改写、简介续写
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

// Shared production seam: successful checkpoints contain the model JSON, but
// every replay re-enters these same source-aware normalizers before any save.
export async function generateArchiveImportSegment(ticket, context, chunk, { index = 0, total = 1,
    external = false, worldInfo = null, requestOptions = {} } = {}) {
    const prompt = requestOptions.recoveryPrompt ?? (external ? externalMemoryImportPrompt(context, chunk, worldInfo)
        : memoryImportPrompt(context, chunk, index, total));
    return archive_importRecovery.requestArchiveRecoverySegment(ticket, `${external ? 'external' : 'chat'}:${index}`, prompt,
        { ...requestOptions, context }, raw => {
            if (!Array.isArray(raw?.memories)) throw core_text.safeUserError('当前分块缺少记忆列表，成功部分仍保留。', 'RMT_ARCHIVE_CHUNK');
            const normalize = value => external ? normalizeExternalImportedMemories(value, chunk)
                : normalizeImportedChunk(value, chunk).map(item => ({ ...item, sourceKind: 'chat' }));
            // Apply the ORIGINAL per-item evidence/field validator to every row.
            // Its historical slice(32/48) must not silently eat valid batch overflow.
            const normalized = [];
            if (requestOptions.archiveRequestBudget) {
                const size = external ? 48 : 32;
                for (let offset = 0; offset < raw.memories.length; offset += size) normalized.push(...normalize({ memories: raw.memories.slice(offset, offset + size) }));
            } else normalized.push(...normalize(raw));
            if (raw.memories.length && !normalized.length) throw core_text.safeUserError('当前分块没有通过原有内容与来源校验，成功部分仍保留。', 'RMT_ARCHIVE_CHUNK');
            return normalized;
        });
}

export async function rewriteCurrentArchiveVerdict(options = {}) {
    const context = options.context || core_context.currentCharacterGuard();
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    const logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'archive-profile', pageId: 'archiveProfile',
        context, origin, taskKey: `archive-profile:${core_context.chatScopeKey(context)}`, label: '档案名称与简介', parentTaskId: options.logicalParentTaskId });
    const taskTrace = core_taskTrace.startTaskTrace('archive-profile', 'archive-profile');
    core_taskTrace.markStage(taskTrace, 'start');
    let result;
    try {
        result = await rewriteCurrentArchiveVerdictOperation(taskTrace, { ...options, logicalTask });
        finishArchiveTaskTrace(taskTrace, result);
        return result;
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, isArchiveCancellation(error) ? 'cancelled' : 'failed', error);
        result = { status: isArchiveCancellation(error) ? 'cancelled' : 'failed', error };
        if (options.participantRegeneration) return result;
        throw error;
    } finally {
        if (runtimeState.activeTaskTrace === taskTrace) runtimeState.activeTaskTrace = null;
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask, result);
    }
}

async function rewriteCurrentArchiveVerdictOperation(taskTrace, options = {}) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return { status: 'blocked' };
    const context = core_context.currentCharacterGuard();
    const existing = getImportedMemory(context);
    if (!existing) return { status: 'blocked' };
    const memory = structuredClone(existing);
    const origin = core_context.captureTaskOrigin(context, memory.archiveRevision);
    core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
    let replacementTicket = null;
    if (options.participantRegeneration) {
        replacementTicket = await core_cache.assertArchiveVersionReplacement(context, options.participantRegeneration);
        const snapshot = participants.normalizeParticipantSnapshot(options.participantRegeneration.participantSnapshot);
        if (!snapshot) throw new Error('明确重做缺少本次已确认的人物快照。');
        options.participantRegeneration = { ...replacementTicket, participantSnapshot: snapshot };
    }
    await core_settings.prepareManualCredential(context);
    await archive_importRecovery.hydrateArchiveRecovery(origin);
    await archive_importRecovery.hydrateArchiveRecovery(origin, 'profile');
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed', 'AbortError');
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return { status: 'blocked' };
    let pendingImport = getCurrentArchiveImportRecoverySummary(context);
    let pendingProfile = getCurrentArchiveProfileRecoverySummary(context);
    let selectedProfile = null;
    if (!replacementTicket) {
        const selectedDraft = options.draftId ? archive_importRecovery.readArchiveRecoveryDraft(origin, options.draftId) : null;
        selectedProfile = selectedDraft?.operation === 'profile' ? selectedDraft : null;
        const importProfile = selectedDraft ? (selectedDraft.operation === 'import' && (selectedDraft.stage === 'profile-only'
            || selectedDraft.stage === 'archive-result' && selectedDraft.profilePending) ? selectedDraft : null)
            : pendingImport?.profileOnly ? archive_importRecovery.readArchiveRecoveryDraft(origin,
                pendingImport.drafts.find(row => !row.paused)?.draftId) : null;
        if (importProfile) return continueImportedArchiveProfile(context, memory, origin, importProfile, options, taskTrace);
    }
    if (pendingProfile?.onlyArchivedDrafts) pendingProfile = null;
    if (selectedProfile) pendingProfile = { canContinue: selectedProfile.journal.segments.some(segment => segment.state === 'truncated'),
        notice: '继续选中的原简介草稿，其他草稿与正式档案保持原样。' };
    if (replacementTicket) {
        // An explicit replacement owns a new draft; the old paid profile and
        // any import's profile-only checkpoint remain in their durable slots.
        // Flush both scopes even after a failed prior park: its active slot may
        // already be empty, but the paused record still needs acknowledgement.
        for (const operation of ['profile', 'import']) {
            if (operation === 'profile' ? pendingProfile : pendingImport?.profileOnly) {
                archive_importRecovery.parkArchiveRecovery(origin, operation);
            }
            try {
                if (!await archive_importRecovery.flushArchiveRecovery(origin, operation)) {
                    throw core_text.safeUserError('原简介草稿未确认保存，本次没有重新生成。', 'RMT_ARCHIVE_DRAFT_STORAGE');
                }
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'RMT_ARCHIVE_DRAFT_STORAGE') throw error;
                // A queued storage transaction can reject before flush reaches
                // its own normalized save path; surface that as a save failure.
                throw core_text.safeUserError('原简介草稿未确认保存，本次没有重新生成。', 'RMT_ARCHIVE_DRAFT_STORAGE');
            }
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
            if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed', 'AbortError');
        }
        pendingImport = getCurrentArchiveImportRecoverySummary(context);
        pendingProfile = getCurrentArchiveProfileRecoverySummary(context);
    }
    if (pendingProfile?.onlyArchivedDrafts) pendingProfile = null;
    if ((pendingProfile || pendingImport?.profileOnly) && !ui_overlay.confirmExplicitAction(
        pendingProfile?.canContinue ? '继续未写完的档案简介？' : '仅重试档案简介？',
        `${pendingImport?.profileOnly ? '记忆分块已保存，这次只重新生成简介，不会重导聊天或重做成功记忆。' : '此前成功内容保留，只处理这段简介。'} 会额外使用文本生成额度。\n${pendingProfile?.notice || pendingImport?.notice || archive_importRecovery.ARCHIVE_RECOVERY_PAGE_NOTICE}`,
        { destructive: false })) return { status: 'cancelled' };
    const controller = options.logicalTask.controller;
    let recoveryTicket = null;
    runtimeState.busy = true;
    runtimeState.activeTaskTrace = taskTrace;
    runtimeState.activeTaskOrigin = origin;
    runtimeState.activeTaskAbortController = controller;
    runtimeState.activeTaskLabel = '正在读懂双方经历，重写档案简介…';
    const stillCurrent = () => {
        try { return core_requestCoordinator.isLogicalGenerationTaskCurrent(options.logicalTask) && core_context.isCurrentTaskOrigin(origin)
            && getImportedMemory(core_context.currentCharacterGuard())?.archiveRevision === memory.archiveRevision; }
        catch { return false; }
    };
    try {
        ui_overlay.setBusyUi(true, runtimeState.activeTaskLabel);
        await core_cache.ensureCacheHydrated(context);
        if (!stillCurrent()) throw new DOMException('Archive changed', 'AbortError');
        const profileInputs = selectedProfile?.inputs || archive_importRecovery.archiveRecoveryInputs(origin, 'profile');
        let taskInputV1 = profileInputs?.taskInputV1 || null;
        const capturedInput = checkedArchiveTaskInput(taskInputV1, context);
        const profileMemory = capturedInput?.memory || memory;
        const sourceRevisionChanged = profileMemory.archiveRevision !== memory.archiveRevision;
        const contentContext = archiveContentContext(context, capturedInput);
        const ownerIdentity = capturedInput?.ownerIdentity || archiveSourceOwnerIdentity(context);
        if (!capturedInput && profileInputs?.ownerIdentity && profileInputs.ownerIdentity !== ownerIdentity) {
            const error = core_text.safeUserError('角色卡或 Persona 与原简介任务不同；已保存成果与草稿保留。', 'RMT_RECOVERY_INPUT_CHANGED');
            error.archiveInputCategory = 'character';
            throw error;
        }
        const contextEnvelope = capturedInput?.contextEnvelope ?? (profileInputs?.ownerIdentity ? profileInputs.contextEnvelope
            : await core_cache.buildControlledContextEnvelope(context)
                + (replacementTicket ? participants.participantPromptBlock(options.participantRegeneration.participantSnapshot) : ''));
        if (!stillCurrent()) throw new DOMException('Archive changed', 'AbortError');
        const settings = core_settings.getPluginSettings(contentContext);
        const profilePrompt = capturedInput?.profilePrompt || archiveProfilePrompt(contentContext, profileMemory.memories);
        // A pre-snapshot legacy draft remains on its exact-hash compatibility path.
        if (!taskInputV1 && !profileInputs) taskInputV1 = captureArchiveTaskInput(context, {
            operation: 'profile', memory: profileMemory, ownerIdentity, contextEnvelope, profilePrompt });
        const settingsIdentity = archiveRecoverySettingsIdentity(context);
        const profileDraftInputs = { contextEnvelope, ownerIdentity,
            ...(taskInputV1 ? { taskInputV1 } : {}),
            ...(replacementTicket ? { participantRegeneration: options.participantRegeneration } : {}) };
        // Same serialization and byte limit as the draft save itself. Fail before
        // any storage transaction or model request; existing records stay untouched.
        if (archive_importRecovery.archiveRecoveryDraftPlanExceedsCapacity(origin, 'profile', profileDraftInputs)) {
            throw archive_importRecovery.archiveDraftCapacityFailure();
        }
        recoveryTicket = await archive_importRecovery.beginArchiveRecovery({ origin, operation: 'profile',
            sourceIdentity: profileMemory.archiveRevision, sourceFragments: [JSON.stringify(profileMemory.memories), contextEnvelope], settingsIdentity, inputs: profileDraftInputs,
            continueApproved: !!pendingProfile, onProgress: refreshArchiveRecoveryReading, draftId: selectedProfile?.draftId || '',
            assertCurrent: () => stillCurrent() && (taskInputV1 || archiveRecoverySettingsIdentity(context) === settingsIdentity) });
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, recoveryTicket.origin);
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
        const profile = await archive_importRecovery.requestArchiveRecoverySegment(recoveryTicket, 'profile',
            profilePrompt, {
                maxTokens: 3000, temperature: Math.min(settings.temperature, 0.65), contextEnvelope, archiveRequestBudget: true, signal: controller.signal, context, taskTrace,
                ...(taskInputV1 ? { recoveryContentSettings: taskInputV1.data.contentSettings } : {}),
            }, raw => checkedArchiveProfile(raw, profileMemory.memories));
        core_taskTrace.markStage(taskTrace, 'profile');
        if (!stillCurrent()) throw new DOMException('Archive changed', 'AbortError');
        if (sourceRevisionChanged) {
            const saved = await archive_importRecovery.retainCompletedArchiveProfile(recoveryTicket, profile, profileMemory);
            refreshArchiveRecoveryReading();
            return saved;
        }
        core_taskTrace.beginStage(taskTrace, 'save');
        await core_cache.saveImportedMemory(context, { ...memory, archiveName: profile.archiveName,
            archiveVerdict: profile.archiveVerdict, archiveCoverUpdatedAt: Date.now() }, memory.chatId, {
            presentationOnly: true, preserveDerivedCache: true, expectedTaskOrigin: origin,
            ...(replacementTicket ? { participantRegeneration: replacementTicket } : {}),
            assertTaskCurrent: () => core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask),
            expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision },
        });
        core_taskTrace.markStage(taskTrace, 'save');
        archive_importRecovery.finishArchiveProfileRecovery(recoveryTicket, origin);
        globalThis.toastr?.success?.('简介已写好；记忆与其他内容保持不变。', '心迹回廊');
        return { status: 'committed' };
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, isArchiveCancellation(error) ? 'cancelled' : 'failed', error);
        globalThis.toastr?.warning?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊 · 简介未更新');
        if (getCurrentArchiveProfileRecoverySummary(context)) globalThis.toastr?.info?.(getCurrentArchiveProfileRecoverySummary(context)?.notice || archive_importRecovery.ARCHIVE_RECOVERY_PAGE_NOTICE, '心迹回廊 · 简介草稿');
        return { status: isArchiveCancellation(error) ? 'cancelled' : 'failed' };
    } finally {
        archive_importRecovery.releaseArchiveRecovery(recoveryTicket);
        if (recoveryTicket) try { await archive_importRecovery.flushArchiveRecovery(origin, recoveryTicket.entry.operation); }
        catch (error) { globalThis.toastr?.warning?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿保存'); }
        runtimeState.busy = false;
        if (runtimeState.activeTaskOrigin === origin) runtimeState.activeTaskOrigin = null;
        if (runtimeState.activeTaskAbortController === controller) runtimeState.activeTaskAbortController = null;
        runtimeState.activeTaskLabel = '';
        ui_overlay.setBusyUi(false);
        if (stillCurrent() && runtimeState.archiveViewLevel === 'chooser' && !runtimeState.activeMode && !globalThis.document?.getElementById(core_constants.OVERLAY_ID)?.hidden) {
            core_taskTrace.beginStage(taskTrace, 'render');
            ui_overlay.showChooser();
            core_taskTrace.markStage(taskTrace, 'render');
        }
    }
}

async function continueImportedArchiveProfile(context, memory, origin, draft, options, taskTrace) {
    if (!ui_overlay.confirmExplicitAction('继续原来未完成的档案简介？',
        '沿用首次建档的原资料与已收到正文，只处理原简介的未完成部分；已有记忆和封面保留。', { destructive: false })) return { status: 'cancelled' };
    const settingsIdentity = archiveRecoverySettingsIdentity(context);
    const profileSegment = draft.journal?.segments?.find(segment => segment.slot === 'profile');
    const recipe = profileSegment?.requestRecipe;
    const captured = checkedArchiveTaskInput(draft.inputs?.taskInputV1, context);
    const originalMemories = archivedRequestJson(profileSegment, 'UNTRUSTED_MEMORY_LIST:\n');
    const sourceMemory = draft.profileMemory || (draft.committedRevision === memory.archiveRevision ? memory
        : originalMemories ? { ...memory, archiveRevision: draft.committedRevision, memories: originalMemories,
            characterName: captured?.names?.name2 || memory.characterName, userName: captured?.names?.name1 || memory.userName } : null);
    if (!sourceMemory) throw core_text.safeUserError('这份旧简介缺少可还原的原记忆资料；原文仍可查看，未用当前资料替换。', 'RMT_RECOVERY_SOURCE_SNAPSHOT_MISSING');
    const stillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(options.logicalTask)
        && core_context.isCurrentTaskOrigin(origin) && getImportedMemory(context)?.archiveRevision === memory.archiveRevision;
    let ticket = null;
    runtimeState.busy = true; runtimeState.activeTaskTrace = taskTrace; runtimeState.activeTaskOrigin = origin;
    runtimeState.activeTaskAbortController = options.logicalTask.controller; runtimeState.activeTaskLabel = '正在继续原档案简介…';
    try {
        ui_overlay.setBusyUi(true, runtimeState.activeTaskLabel);
        ticket = await archive_importRecovery.resumeArchiveImportProfile({ origin, draftId: draft.draftId,
            settingsIdentity, assertCurrent: stillCurrent, onProgress: refreshArchiveRecoveryReading });
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, ticket.origin);
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
        const contentContext = archiveContentContext(context, captured);
        const settings = core_settings.getPluginSettings(contentContext);
        const profile = await archive_importRecovery.requestArchiveRecoverySegment(ticket, 'profile',
            recipe?.identity?.prompt || archiveProfilePrompt(contentContext, sourceMemory.memories), {
                maxTokens: recipe?.identity?.maxTokens ?? 8192, temperature: recipe?.identity?.temperature ?? Math.min(settings.temperature, 0.35),
                contextEnvelope: recipe?.identity?.contextEnvelope ?? draft.inputs?.contextEnvelope ?? '',
                ...(captured ? { recoveryContentSettings: captured.contentSettings } : {}),
                context, archiveRequestBudget: true, taskTrace, signal: options.logicalTask.signal,
            }, raw => checkedArchiveProfile(raw, sourceMemory.memories));
        if (!stillCurrent()) throw new DOMException('Archive changed', 'AbortError');
        if (sourceMemory.archiveRevision !== memory.archiveRevision) {
            return await archive_importRecovery.retainCompletedArchiveProfile(ticket, profile, sourceMemory);
        }
        await core_cache.saveImportedMemory(context, { ...memory, archiveName: profile.archiveName,
            archiveVerdict: profile.archiveVerdict, archiveCoverUpdatedAt: Date.now() }, memory.chatId, {
            presentationOnly: true, preserveDerivedCache: true, expectedTaskOrigin: origin,
            expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision },
            assertTaskCurrent: () => core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask),
        });
        archive_importRecovery.finishArchiveProfileRecovery(ticket, origin);
        return { status: 'committed' };
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, isArchiveCancellation(error) ? 'cancelled' : 'failed', error);
        globalThis.toastr?.warning?.(core_text.safeErrorSummary(error), '心迹回廊 · 原简介继续保留');
        return { status: isArchiveCancellation(error) ? 'cancelled' : 'failed' };
    } finally {
        archive_importRecovery.releaseArchiveRecovery(ticket);
        if (ticket) try { await archive_importRecovery.flushArchiveRecovery(origin, 'import'); } catch (error) {
            globalThis.toastr?.warning?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿保存');
        }
        runtimeState.busy = false; runtimeState.activeTaskLabel = '';
        if (runtimeState.activeTaskOrigin === origin) runtimeState.activeTaskOrigin = null;
        if (runtimeState.activeTaskAbortController === options.logicalTask.controller) runtimeState.activeTaskAbortController = null;
        ui_overlay.setBusyUi(false); refreshArchiveRecoveryReading();
        if (stillCurrent() && runtimeState.archiveViewLevel === 'chooser' && !runtimeState.activeMode
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden) ui_overlay.showChooser();
    }
}
