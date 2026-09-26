import * as partial_import from './partialImport.js';
import * as archive_batches from './importBatches.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_text from '../core/text.js';
import * as archive_importRecovery from './importRecovery.js';
import * as archive_capacity from './capacity.js';
import * as archive_storyScenes from './storyScenes.js';
import * as ui_overlay from '../ui/overlay.js';
import * as split_archiveCore from './archiveCore.js';
import * as split_worldInfoSources from './worldInfoSources.js';
import * as split_externalMemory from './externalMemory.js';
import * as split_importPrompts from './importPrompts.js';
import * as split_importIdentity from './importIdentity.js';
import * as split_recoveryDrafts from './recoveryDrafts.js';
import * as split_archiveVerdict from './archiveVerdict.js';
import * as split_importOperation from './importOperation.js';
import { finishArchiveTaskTrace, isArchiveCancellation } from './archiveCore.js';
import { checkedArchiveTaskInput } from './importIdentity.js';
import { retryCurrentArchiveSave, saveCurrentArchivePendingResults } from './recoveryDrafts.js';
import { importCurrentChatMemoryOperation } from './importOperation.js';
import * as core_archiveBridge from '../core/archiveBridge.js';
// 以下导出已搬到 archive/archiveCore.js、archive/worldInfoSources.js、archive/externalMemory.js、archive/importPrompts.js、archive/importIdentity.js、archive/recoveryDrafts.js、archive/archiveVerdict.js、archive/importOperation.js，这里原样转发，调用方不用改。
export const archiveSchemaVersion = split_archiveCore.archiveSchemaVersion;
export const isCompatibleArchive = split_archiveCore.isCompatibleArchive;
export const migrateArchiveInMemory = split_archiveCore.migrateArchiveInMemory;
export const getImportedMemory = split_archiveCore.getImportedMemory;
export const archiveDeletionFenceKey = split_archiveCore.archiveDeletionFenceKey;
export const safeOwnDataValue = split_archiveCore.safeOwnDataValue;
export const safeOwnDataEntries = split_archiveCore.safeOwnDataEntries;
export const safeNestedDataValue = split_archiveCore.safeNestedDataValue;
export const getMemoryPreflight = split_archiveCore.getMemoryPreflight;
export const clearMemoryPreflight = split_archiveCore.clearMemoryPreflight;
export const memorySourceScopeForContext = split_worldInfoSources.memorySourceScopeForContext;
export const currentMemorySourceLedger = split_worldInfoSources.currentMemorySourceLedger;
export const currentMemorySourceLedgerSummary = split_worldInfoSources.currentMemorySourceLedgerSummary;
export const externalMemoryFromSourceLedger = split_worldInfoSources.externalMemoryFromSourceLedger;
export const currentMemorySourceLedgerExternal = split_worldInfoSources.currentMemorySourceLedgerExternal;
export const previewCurrentChatMemoryFile = split_worldInfoSources.previewCurrentChatMemoryFile;
export const commitCurrentChatMemoryFilePreview = split_worldInfoSources.commitCurrentChatMemoryFilePreview;
export const clearCurrentChatImportedSources = split_worldInfoSources.clearCurrentChatImportedSources;
export const normalizeMemoryWorldInfoBook = split_worldInfoSources.normalizeMemoryWorldInfoBook;
export const getMemoryWorldInfoSelection = split_worldInfoSources.getMemoryWorldInfoSelection;
export const setMemoryWorldInfoSelection = split_worldInfoSources.setMemoryWorldInfoSelection;
export const updateMemoryWorldInfoBookSelection = split_worldInfoSources.updateMemoryWorldInfoBookSelection;
export const memoryWorldInfoSelectionSummary = split_worldInfoSources.memoryWorldInfoSelectionSummary;
export const hasMemoryWorldInfoSelection = split_worldInfoSources.hasMemoryWorldInfoSelection;
export const normalizeMemoryWorldInfoEntry = split_worldInfoSources.normalizeMemoryWorldInfoEntry;
export const worldInfoEntriesFromData = split_worldInfoSources.worldInfoEntriesFromData;
export const loadMemoryWorldInfoBook = split_worldInfoSources.loadMemoryWorldInfoBook;
export const collectSelectedMemoryWorldInfo = split_worldInfoSources.collectSelectedMemoryWorldInfo;
export const selectedWorldInfoHistoryBatch = split_worldInfoSources.selectedWorldInfoHistoryBatch;
export const selectedWorldInfoHistoryBatches = split_worldInfoSources.selectedWorldInfoHistoryBatches;
export const syncSelectedWorldInfoHistoryLedger = split_worldInfoSources.syncSelectedWorldInfoHistoryLedger;
export const memoryWorldInfoPromptBlock = split_worldInfoSources.memoryWorldInfoPromptBlock;
export const showMemoryWorldInfoPicker = split_worldInfoSources.showMemoryWorldInfoPicker;
export const expandMemoryWorldInfoBook = split_worldInfoSources.expandMemoryWorldInfoBook;
export const mergeImportedMemories = split_externalMemory.mergeImportedMemories;
export const archivedChatFingerprint = split_externalMemory.archivedChatFingerprint;
export const importedMemoryStableKey = split_externalMemory.importedMemoryStableKey;
export const appendImportedMemoriesStable = split_externalMemory.appendImportedMemoriesStable;
export const migrateDerivedCacheRevision = split_externalMemory.migrateDerivedCacheRevision;
export const splitExternalMemoryIntoChunks = split_externalMemory.splitExternalMemoryIntoChunks;
export const appendLongExternalText = split_externalMemory.appendLongExternalText;
export const flushDeferredCommitsForCurrentChat = split_recoveryDrafts.flushDeferredCommitsForCurrentChat;
export const externalMemorySourceSummary = split_externalMemory.externalMemorySourceSummary;
export const normalizeExternalMemoryRecords = split_worldInfoSources.normalizeExternalMemoryRecords;
export const flattenExternalMemoryPayload = split_externalMemory.flattenExternalMemoryPayload;
export const currentChatSummaryMemoryRecords = split_externalMemory.currentChatSummaryMemoryRecords;
export const mergeDurableSourceDescriptor = split_externalMemory.mergeDurableSourceDescriptor;
export const collectCurrentChatExternalMemory = split_externalMemory.collectCurrentChatExternalMemory;
export const readCurrentChatMemoryPlugins = split_externalMemory.readCurrentChatMemoryPlugins;
export const externalMemoryImportPrompt = split_externalMemory.externalMemoryImportPrompt;
export const normalizeExternalImportedMemories = split_externalMemory.normalizeExternalImportedMemories;
export const getCurrentUsableMessageCount = split_importPrompts.getCurrentUsableMessageCount;
export const archiveInputAvailable = split_importPrompts.archiveInputAvailable;
export const getMemoryState = split_importPrompts.getMemoryState;
export const requireArchive = split_importPrompts.requireArchive;
export const splitSnapshotIntoChunks = split_importPrompts.splitSnapshotIntoChunks;
export const memoryImportPrompt = split_importPrompts.memoryImportPrompt;
export const normalizeImportedChunk = split_importPrompts.normalizeImportedChunk;
export const fallbackArchiveName = split_importPrompts.fallbackArchiveName;
export const fallbackArchiveSummary = split_importPrompts.fallbackArchiveSummary;
export const archiveProfilePrompt = split_importPrompts.archiveProfilePrompt;
export const normalizeArchiveProfile = split_importPrompts.normalizeArchiveProfile;
export const exportCurrentArchiveImportProgress = split_recoveryDrafts.exportCurrentArchiveImportProgress;
export const readCurrentArchiveRecoveryDraft = split_recoveryDrafts.readCurrentArchiveRecoveryDraft;
export const hydrateCurrentArchiveRecovery = split_recoveryDrafts.hydrateCurrentArchiveRecovery;
export const exportCurrentArchiveRecoveryAfterLoad = split_recoveryDrafts.exportCurrentArchiveRecoveryAfterLoad;
export const saveCurrentArchiveRecovery = split_recoveryDrafts.saveCurrentArchiveRecovery;
export const importCurrentArchiveRecoveryFile = split_recoveryDrafts.importCurrentArchiveRecoveryFile;
export const getCurrentArchiveImportRecoverySummary = split_recoveryDrafts.getCurrentArchiveImportRecoverySummary;
export const discardCurrentArchiveImportRecovery = split_recoveryDrafts.discardCurrentArchiveImportRecovery;
export const getCurrentArchiveProfileRecoverySummary = split_recoveryDrafts.getCurrentArchiveProfileRecoverySummary;
export const generateArchiveImportSegment = split_archiveVerdict.generateArchiveImportSegment;
export const rewriteCurrentArchiveVerdict = split_archiveVerdict.rewriteCurrentArchiveVerdict;

export async function restartCurrentArchiveImport(options = {}) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return { status: 'blocked' };
    return importCurrentChatMemory({ ...options, restartImport: true, parkPriorDraft: true });
}

export function continueCurrentArchiveImport(options = {}) {
    if (!options.draftId && !getCurrentArchiveImportRecoverySummary()) return Promise.resolve({ status: 'blocked' });
    return importCurrentChatMemory({ ...options, continueRecovery: true });
}

export async function importSelectedStoryScenes(scenes, options = {}) {
    const records = archive_storyScenes.scenesToExternalRecords(scenes);
    if (!records.length) {
        globalThis.toastr?.info?.('没有可建档的时间场景。', '心迹回廊');
        return { status: 'noop' };
    }
    return importCurrentChatMemory({ ...options, sceneRecords: records, parkPriorDraft: true });
}

export async function patchImportedMemoryFields(id, patch = {}) {
    const context = core_context.currentCharacterGuard();
    const memory = getImportedMemory(context);
    if (!memory) throw core_text.safeUserError('当前没有可改的档案记忆。', 'RMT_ARCHIVE_MISSING');
    const item = archive_capacity.findMemoryById(memory, id);
    if (!item) throw core_text.safeUserError('没有找到这条记忆。', 'RMT_ARCHIVE_MISSING');
    if (Object.hasOwn(patch, 'locked')) item.locked = patch.locked === true;
    if (Object.hasOwn(patch, 'date')) item.date = core_text.normalizeText(patch.date, 100);
    memory.updatedAt = Date.now();
    await core_cache.saveImportedMemory(context, memory, memory.chatId, {
        preserveDerivedCache: true,
        expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision },
    });
    return item;
}

// r84.71: when a paid chunk fails after others succeeded, formally save the
// successful chunks right away (same validated path as the manual
// "先将成功分段入档" button, no model request). The failure is still reported and
// the unfinished chunks stay in the draft for "重试未完成分块".
let autoPartialCommitEnabled = true;

// Test seam only: legacy fixtures exercise the manual button path.
export function setAutoPartialCommitForTests(value) { autoPartialCommitEnabled = value !== false; }

async function autoCommitCompletedArchiveChunks(options, outcome) {
    if (!autoPartialCommitEnabled || options.commitCompletedOnly || options.automatic || options.restartImport || options.fullRebuild || options.parkPriorDraft) return null;
    if (outcome?.status === 'cancelled' || isArchiveCancellation(outcome?.error)) return null;
    if (outcome?.status && outcome.status !== 'failed') return null;
    let context, summary;
    try {
        context = core_context.currentCharacterGuard();
        summary = getCurrentArchiveImportRecoverySummary(context);
    } catch { return null; }
    if (!summary?.canCommitComplete || summary.awaitingCommit || summary.profileOnly) return null;
    const committed = Number(getImportedMemory(context)?.archivePartialDraft?.slots?.length) || 0;
    if ((Number(summary.completed) || 0) <= committed) return null;
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return null;
    try {
        const saved = await importCurrentChatMemoryOnce({ commitCompletedOnly: true, continueRecovery: true, autoPartialCommit: true });
        if (saved?.status === 'committed') {
            globalThis.toastr?.success?.(`已自动把 ${summary.completed} 个成功分块正式入档，没有请求模型。未完成的部分点"重试未完成分块"即可，只会补发失败的那几块。`, '心迹回廊 · 档案整理');
        }
        return saved;
    } catch (error) {
        console.warn('[HeartbeatMemories] automatic partial archive commit skipped', core_text.safeErrorDiagnostic(error));
        return null;
    }
}

export async function importCurrentChatMemory(options = {}) {
    if (archive_batches.isAutomaticFloorWindowSync(options) && options.parkPriorDraft !== true) {
        options = { ...options, parkPriorDraft: true };
    }
    let outcome;
    try {
        outcome = await importCurrentChatMemoryOnce(options);
        return outcome;
    } catch (error) {
        outcome = { status: 'failed', error };
        throw error;
    } finally {
        if (outcome?.status === 'failed') await autoCommitCompletedArchiveChunks(options, outcome);
    }
}

async function importCurrentChatMemoryOnce(options = {}) {
    const context = core_context.currentCharacterGuard();
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    const logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'archive-import', pageId: 'archiveImport', context, origin,
        taskKey: `archive-import:${core_context.chatScopeKey(context)}`, label: '聊天经历整理', parentTaskId: options.logicalParentTaskId });
    // Without this the stage marks below have nothing to attach to, and the diagnostic
    // report shows an empty task list even after a run that clearly happened.
    const taskTrace = core_taskTrace.startTaskTrace(`archive:${core_context.getChatId(context)}`, 'archive');
    core_taskTrace.markStage(taskTrace, 'start');
    let result;
    try {
        if (options.parkPriorDraft) {
            await archive_importRecovery.hydrateArchiveRecovery(origin, 'import', { signal: logicalTask.signal });
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
            if (archive_importRecovery.parkArchiveRecovery(origin)
                && !await archive_importRecovery.flushArchiveRecovery(origin)) throw new Error('原整理草稿未确认保存，本次没有重新生成。');
        }
        result = await runArchiveImport(context, { ...options, logicalTask }, taskTrace);
        finishArchiveTaskTrace(taskTrace, result);
        return result;
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, isArchiveCancellation(error) ? 'cancelled' : 'failed', error);
        result = { status: isArchiveCancellation(error) ? 'cancelled' : 'failed', error };
        if (options.parkPriorDraft || isArchiveCancellation(error)) return result;
        throw error;
    } finally {
        if (runtimeState.activeTaskTrace === taskTrace) runtimeState.activeTaskTrace = null;
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask, result);
    }
}

// A well-formed archive whose only problem is a different chatId.
//
// SillyTavern's chat id changes when a chat is renamed, branched or copied, and the
// archive travels inside that chat's metadata. Before this, such an archive was
// unreadable *and* blocked a new one from being created, leaving the chat permanently
// unable to generate anything. Detect that exact shape so the user can decide.
export function mismatchedArchiveInfo(context = core_context.getContext()) {
    const raw = context?.chatMetadata?.[core_constants.MEMORY_KEY];
    if (!raw || getImportedMemory(context)) return null;
    const memory = migrateArchiveInMemory(raw);
    if (!memory || !Array.isArray(memory.memories) || !memory.memories.length) return null;
    const stored = core_context.comparableChatId(memory.chatId);
    const current = core_context.comparableChatId(core_context.getChatId(context));
    // Only a pure identity mismatch qualifies; a deletion fence or broken shape does not.
    if (!stored || stored === current) return null;
    if (runtimeState.archiveDeletionFences.has(archiveDeletionFenceKey(context, memory))) return null;
    return { memoryCount: memory.memories.length, archiveName: core_text.normalizeText(memory.archiveName, 120) };
}

// Re-binds the existing archive to the chat the user is actually in. Explicit action only:
// it never runs automatically, and it keeps the previous identity for traceability.
export function claimMismatchedArchive(context = core_context.getContext()) {
    const info = mismatchedArchiveInfo(context);
    if (!info) return null;
    const memory = migrateArchiveInMemory(context.chatMetadata[core_constants.MEMORY_KEY]);
    const previousChatId = core_text.normalizeText(memory.chatId, 240);
    memory.chatId = core_context.getChatId(context);
    memory.claimedFromChatId = previousChatId;
    memory.updatedAt = Date.now();
    context.chatMetadata[core_constants.MEMORY_KEY] = memory;
    context.saveMetadataDebounced?.();
    return { memoryCount: info.memoryCount, previousChatId };
}

async function runArchiveImport(context, options = {}, taskTrace = null) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) {
        throw new Error('当前还有内容生成任务在进行，请等生成结束后再创建/更新档案。');
    }
    // Reserve admission BEFORE asynchronous credential/draft hydration. A second
    // click or another mode must not enter while the first action is preparing.
    const admission = {};
    runtimeState.archivePreparationToken = admission;
    runtimeState.busy = true;
    runtimeState.activeTaskAbortController = options.logicalTask.controller;
    runtimeState.activeTaskOrigin = options.logicalTask.origin;
    runtimeState.activeTaskLabel = '正在准备当前聊天档案…';
    try { return await runArchiveImportPrepared(context, options, taskTrace, admission); }
    finally {
        if (runtimeState.archivePreparationToken === admission) {
            runtimeState.archivePreparationToken = null; runtimeState.busy = false;
            ui_overlay.setBusyUi(false);
        }
        if (runtimeState.activeTaskAbortController === options.logicalTask.controller) {
            runtimeState.activeTaskAbortController = null;
            runtimeState.activeTaskOrigin = null;
            runtimeState.activeTaskLabel = '';
        }
    }
}

async function runArchiveImportPrepared(context, options, taskTrace, admission) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    const releasePreparation = () => {
        if (runtimeState.archivePreparationToken === admission) {
            runtimeState.archivePreparationToken = null; runtimeState.busy = false;
        }
    };
    const initialOrigin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    const localPendingAdmission = !options.draftId && !options.restartImport && !options.fullRebuild
        && !!getImportedMemory(context)?.[archive_batches.IMPORT_PROGRESS_KEY]?.capacityPending?.length;
    if (!options.commitCompletedOnly && !localPendingAdmission) await core_settings.prepareManualCredential(context, { signal: options.logicalTask.signal });
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    if (!core_context.isCurrentTaskOrigin(initialOrigin)) throw new DOMException('Chat changed', 'AbortError');
    let existing = getImportedMemory(context);
    if (Object.prototype.hasOwnProperty.call(context.chatMetadata || {}, core_constants.MEMORY_KEY) && !existing) {
        const mismatch = mismatchedArchiveInfo(context);
        if (mismatch && !options.automatic && options.allowArchiveClaim === true) {
            // Offer the way out instead of dead-ending: the data is intact and the user is
            // the only one who can say whether this chat is the same story.
            const claim = ui_overlay.confirmExplicitAction(
                '这个聊天里有一份档案，但标识对不上',
                `找到「${mismatch.archiveName || '未命名档案'}」，共 ${mismatch.memoryCount} 条记忆，但它记录的聊天标识与当前聊天不同。`
                + '\n\n聊天被重命名、分支或复制后会出现这种情况。'
                + '\n\n确定＝把这份档案认领到当前聊天（不改动任何记忆内容，之后即可正常使用）。'
                + '\n取消＝保持原样，本次不生成。',
                { destructive: false });
            if (claim) {
                claimMismatchedArchive(context);
                existing = getImportedMemory(context);
                globalThis.toastr?.success?.(`已认领 ${mismatch.memoryCount} 条记忆到当前聊天。`, '心迹回廊');
            }
        }
        if (!existing) {
            throw core_text.safeUserError(mismatch
                ? `这个聊天里存着一份 ${mismatch.memoryCount} 条记忆的档案，但它记录的聊天标识与当前不同（重命名、分支或复制聊天后会这样）。原数据完好未动。请用档案室的「认领这份档案」把它绑到当前聊天，或先备份后删除它再新建。`
                : '当前聊天中的档案标识或格式不匹配，已停止生成并保留原数据。', 'RMT_ARCHIVE_SOURCE_MISMATCH');
        }
    }
    const hydrationOrigin = core_context.captureTaskOrigin(context, existing?.archiveRevision || '');
    await archive_importRecovery.hydrateArchiveRecovery(hydrationOrigin, 'import', { signal: options.logicalTask.signal });
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    if (!core_context.isCurrentTaskOrigin(hydrationOrigin)) throw new DOMException('Chat changed', 'AbortError');
    if (runtimeState.archivePreparationToken !== admission || core_requestCoordinator.hasGenerationTasks()) return { status: 'blocked' };
    const pending = getCurrentArchiveImportRecoverySummary(context);
    if (localPendingAdmission) {
        if (options.automatic) return { status: 'blocked' };
        if (pending?.awaitingCommit) {
            releasePreparation();
            return retryCurrentArchiveSave(context, taskTrace);
        }
        if (!ui_overlay.confirmExplicitAction('保存待入档结果？',
            '只保存本批已校验结果，不请求模型、不删除旧记忆；保存成功后才推进批次。', { destructive: false })) return { status: 'cancelled' };
        return saveCurrentArchivePendingResults(context, existing, options.logicalTask, taskTrace);
    }
    const floorWindowSync = archive_batches.isAutomaticFloorWindowSync(options);
    let selectedDraft = null, sourceExisting;
    if (options.draftId) selectedDraft = archive_importRecovery.readArchiveRecoveryDraft(hydrationOrigin, options.draftId);
    // A completed pending result already owns its validated content. Its local
    // save retry must precede source-journal admission (including a card rename).
    else if (!options.restartImport && !floorWindowSync && pending && !pending.onlyArchivedDrafts && !pending.awaitingCommit) {
        const active = archive_importRecovery.listArchiveRecoveryDrafts(hydrationOrigin, 'import').find(row => !row.paused && row.stage === 'segments');
        if (active) selectedDraft = archive_importRecovery.readArchiveRecoveryDraft(hydrationOrigin, active.draftId);
    }
    if (selectedDraft) {
        if (selectedDraft.operation !== 'import') throw core_text.safeUserError('请选择这份建档草稿的继续入口。', 'RMT_RECOVERY_DATA');
        if (options.automatic) return { status: 'blocked' };
        if (selectedDraft.stage === 'profile-only') {
            releasePreparation();
            return rewriteCurrentArchiveVerdict({ draftId: selectedDraft.draftId, logicalParentTaskId: options.logicalTask.id });
        }
        const previousResult = selectedDraft.stage === 'archive-result' ? selectedDraft.archiveResult : null;
        if (previousResult && !archive_batches.hasPendingBatches(previousResult.memoryBank?.[archive_batches.IMPORT_PROGRESS_KEY])) {
            // A received independent result is not a successful durable save
            // until this exact scope acknowledges it; retry is local only.
            await archive_importRecovery.flushArchiveRecovery(hydrationOrigin, 'import');
            return { status: 'independent', draftId: selectedDraft.draftId };
        }
        const captured = checkedArchiveTaskInput(selectedDraft.inputs?.taskInputV1, context);
        const baseRevision = selectedDraft.inputs?.progress?.archiveRevision || '';
        let baseMemoryMissing = selectedDraft.archiveResult?.baseMemoryMissing === true;
        if (previousResult) sourceExisting = structuredClone(previousResult.memoryBank);
        else if (Object.hasOwn(selectedDraft.inputs || {}, 'baseMemory')) sourceExisting = structuredClone(selectedDraft.inputs.baseMemory);
        else if (baseRevision === (existing?.archiveRevision || '')) sourceExisting = existing;
        else if (captured) {
            // Earlier snapshots retained all request sources but not the archive
            // baseline. Continue those exact chunks; never invent the old bank
            // from a different current archive. The independent reader says so.
            baseMemoryMissing = true;
            sourceExisting = baseRevision ? { version: core_constants.MEMORY_VERSION, archiveRevision: baseRevision,
                chatId: captured.snapshot.chatId, characterName: captured.names.name2, userName: captured.names.name1,
                sourceMessageCount: selectedDraft.inputs.progress?.baseChatEndFloor || 0,
                usedMessageCount: selectedDraft.inputs.progress?.baseUsedMessages || 0,
                usedCharacterCount: selectedDraft.inputs.progress?.baseUsedChars || 0, memories: [] } : null;
        } else sourceExisting = existing; // Truly legacy drafts retain the original strict recipe checks.
        const partialBase = partial_import.partialBaseForDraft(selectedDraft, existing);
        const independentResult = !!previousResult || baseMemoryMissing
            || (!partialBase && (sourceExisting?.archiveRevision || '') !== (existing?.archiveRevision || ''));
        if (options.commitCompletedOnly && (independentResult || selectedDraft.stage !== 'segments')) throw core_text.safeUserError('这份草稿不属于当前可写档案基线，原成果保留；请从原任务继续。', 'RMT_RECOVERY_INPUT_CHANGED');
        if (!options.autoPartialCommit && !ui_overlay.confirmExplicitAction(options.commitCompletedOnly ? '先将成功分段入档？' : '继续这份原建档草稿？',
            options.commitCompletedOnly ? '只保存通过原来源校验的完整分段，不请求模型；未完成分段与原草稿继续保留。' : `${previousResult ? '继续原任务的下一批。' : '保留已成功分块，仅处理这份草稿尚未完成的部分。'}${independentResult ? '完成后独立保存，当前档案不会被覆盖。' : ''}`, { destructive: false })) return { status: 'cancelled' };
        options = { ...options, draftId: selectedDraft.draftId, selectedDraft, partialBase,
            fullRebuild: previousResult ? false : selectedDraft.fullRebuild,
            continueRecovery: !previousResult, independentResult, nextIndependentBatch: !!previousResult, baseMemoryMissing };
    }
    if (options.commitCompletedOnly && !selectedDraft) throw core_text.safeUserError('没有可先入档的原整理草稿，原记录未改动。', 'RMT_ARCHIVE_DRAFT_NOT_FOUND');
    if (!selectedDraft && pending && !pending.onlyArchivedDrafts && !options.restartImport && !floorWindowSync) {
        if (options.automatic === true) return { status: 'blocked' };
        if (pending.capacityBlocked) {
            globalThis.toastr?.warning?.(pending.notice, '心迹回廊 · 容量边界');
            return { status: 'blocked' };
        }
        if (pending.profileOnly) { releasePreparation(); return rewriteCurrentArchiveVerdict({ logicalParentTaskId: options.logicalTask.id }); }
        if (pending.awaitingCommit) {
            releasePreparation();
            return retryCurrentArchiveSave(context, taskTrace);
        }
        if (!ui_overlay.confirmExplicitAction(pending.canContinue ? '继续档案整理？' : '重试未完成分块？',
            pending.batchProgress ? pending.notice : `已保留 ${pending.completed} 个通过校验的分块；只处理未完成部分，不重做成功项。继续会使用文本生成额度。\n${pending.notice}`,
            { destructive: false })) return { status: 'cancelled' };
        options = { ...options, fullRebuild: pending.fullRebuild, continueRecovery: true };
    }
    const preparation = {
        context,
        existing,
        ...(selectedDraft ? { sourceExisting } : {}),
        taskTrace,
        origin: {
            ...core_context.captureTaskOrigin(context, existing?.archiveRevision || ''),
            archivePresent: !!existing,
        },
    };
    const token = admission;
    runtimeState.archivePreparationToken = token;
    runtimeState.busy = true;
    runtimeState.activeTaskTrace = taskTrace;
    runtimeState.activeTaskOrigin = preparation.origin;
    runtimeState.activeTaskLabel = '正在准备当前聊天档案…';
    let result;
    try {
        result = await importCurrentChatMemoryOperation(options, preparation);
    } finally {
        if (runtimeState.archivePreparationToken === token) {
            runtimeState.archivePreparationToken = null;
            runtimeState.busy = false;
            runtimeState.activeTaskOrigin = null;
            runtimeState.activeTaskLabel = '';
            ui_overlay.setBusyUi(false);
        }
    }
    // A storage failure may occur before a recovery ticket is returned. Refresh
    // only the still-visible recovery region, so save/export controls and the
    // confirmed count reflect the retained page draft without navigating away.
    if (result?.status === 'failed' && !options.automatic && core_context.isCurrentTaskOrigin(preparation.origin)) {
        await ui_overlay.loadChooserArchiveRecovery(context);
    }
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (result?.status === 'committed' && !options.automatic && overlay && !overlay.hidden
        && core_context.isCurrentTaskOrigin(preparation.origin) && !runtimeState.activeMode) {
        core_taskTrace.beginStage(taskTrace, 'render');
        ui_overlay.showChooser();
        core_taskTrace.markStage(taskTrace, 'render');
    }
    return result;
}

// 重构清单 C-3c（r84.100）：把 core 层要用的函数登记到 core/archiveBridge.js（core 不再 import 本文件）。
core_archiveBridge.registerArchiveBridge({ getImportedMemory, importCurrentChatMemory, requireArchive, getMemoryWorldInfoSelection, migrateDerivedCacheRevision, migrateArchiveInMemory, archiveDeletionFenceKey });
