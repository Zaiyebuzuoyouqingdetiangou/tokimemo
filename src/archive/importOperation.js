import * as partial_import from './partialImport.js';
import * as source_read from './sourceReadGuard.js';
import * as draft_inputs from './draftInputs.js';
import * as archive_batches from './importBatches.js';
import * as archive_coverage from './coverageRanges.js';
import * as archive_summary from './summaryPreference.js';
import * as archive_requestBudget from './requestBudget.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as cast_looks from '../core/castLooks.js';
import * as chat_read_range from '../core/chatReadRange.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_text from '../core/text.js';
import * as archive_importRecovery from './importRecovery.js';
import * as archive_capacity from './capacity.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';
import * as archive_avatars from '../ui/archiveAvatars.js';
import * as participants from '../core/participants.js';
import { clearMemoryPreflight, getImportedMemory, isArchiveCancellation } from './archiveCore.js';
import { currentMemorySourceLedgerExternal, emptyMemoryWorldInfo, hasMemoryWorldInfoSelection, memoryWorldInfoPromptBlock } from './worldInfoSources.js';
import { archivedChatFingerprint, externalMemoryImportPrompt, readCurrentChatMemoryPlugins, splitExternalMemoryIntoChunks } from './externalMemory.js';
import { archiveInputAvailable, archiveProfilePrompt, checkedArchiveProfile, fallbackArchiveName, fallbackArchiveSummary, memoryImportPrompt, normalizeArchiveProfile, splitSnapshotIntoChunks } from './importPrompts.js';
import { admitArchiveBatch, archiveContentContext, archiveRecoverySettingsIdentity, archiveSourceOwnerIdentity, assertBatchCommitIdentity, batchIdentity, captureArchiveTaskInput, checkedArchiveTaskInput, progressExternalMetadata, progressWorldInfo, retainedBatchExternal } from './importIdentity.js';
import { archiveSourceBank, progressForDraftRow, refreshArchiveRecoveryReading } from './recoveryDrafts.js';
import { generateArchiveImportSegment } from './archiveVerdict.js';
// 建档主流程：一次建档操作（分批、请求、校验、保存）
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

function windowChatMessages(context, floorWindow) {
    const start = Math.floor(Number(floorWindow?.start));
    const end = Math.floor(Number(floorWindow?.end));
    if (start < 1 || end < start) return [];
    return chat_read_range.selectChatReadRange(context, { mode: 'range', start, end, includeHidden: false }).map(row => ({
        index: row.index,
        role: row.message?.is_user === true ? 'user' : 'char',
        name: core_text.normalizeText(row.message?.name, 120),
        date: core_text.normalizeText(row.message?.send_date || row.message?.date || '', 80),
        text: String(row.message?.mes ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim(),
    })).filter(item => item.text);
}

export async function importCurrentChatMemoryOperation({ fullRebuild = false, automatic = false, continueRecovery = false, restartImport = false, participantRoster, logicalTask, floorWindow = null,
    draftId = '', selectedDraft = null, commitCompletedOnly = false, partialBase = null, independentResult = false, nextIndependentBatch = false, baseMemoryMissing = false, sceneRecords = null } = {}, preparation) {
    const context = preparation.context;
    const existing = Object.hasOwn(preparation, 'sourceExisting') ? preparation.sourceExisting : preparation.existing;
    // Capture before any await; a later chat/Persona switch cannot rebind this bank.
    let userAvatar = fullRebuild ? archive_avatars.currentUserAvatar(context)
        : archive_avatars.archiveUserAvatar(existing) || archive_avatars.currentUserAvatar(context);
    const taskTrace = preparation.taskTrace;
    core_requestCoordinator.bindLogicalGenerationTask(logicalTask, preparation.origin);
    const preparationStillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(logicalTask)
        && core_context.isCurrentTaskOrigin(preparation.origin, core_context.currentCharacterGuard());
    if (automatic) {
        if (!existing) return { status: 'blocked' };
        await source_read.waitForSourceRead(() => core_cache.ensureCacheHydrated(context), logicalTask.signal);
        if (!preparationStillCurrent()) throw new DOMException('Chat changed', 'AbortError');
        if (core_cache.loadPhoneGenerationDraft(context, existing)) {
            globalThis.toastr?.info?.('私人终端有未完成草稿，自动档案同步暂缓；请先继续生成终端。', '心迹回廊');
            return { status: 'blocked' };
        }
    }
    const assertPreparationCurrent = () => {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { live = null; }
        if (!live || !core_context.isCurrentTaskOrigin(preparation.origin, live)) {
            throw new DOMException('Chat changed while preparing archive', 'AbortError');
        }
        return live;
    };
    const incrementalUpdate = !!existing && !fullRebuild;
    const mergeExisting = partialBase || (incrementalUpdate || commitCompletedOnly ? existing : null);
    const preserveExisting = !!mergeExisting;
    const receiptBase = partialBase || (!selectedDraft && !fullRebuild && !restartImport ? existing : null);
    const savedSlots = new Set(receiptBase?.archivePartialDraft?.slots?.map(row => row.slot) || []);
    const receivedSlots = partial_import.completeSlots(selectedDraft);
    if (commitCompletedOnly && fullRebuild && existing) throw core_text.safeUserError('完全重建草稿不能用部分成果替换完整旧档案，请继续原重建任务；成功分段仍保留。', 'RMT_RECOVERY_INPUT_CHANGED');
    if (commitCompletedOnly && (!selectedDraft?.inputs?.progress || !selectedDraft.inputs.taskInputV1
        || ![...receivedSlots].some(slot => !savedSlots.has(slot)))) {
        throw core_text.safeUserError('这份草稿没有新的、可校验来源的完整分段可先入档；原成果保留。', 'RMT_ARCHIVE_CHUNK');
    }
    const pinnedInputs = selectedDraft ? selectedDraft.inputs : continueRecovery ? archive_importRecovery.archiveRecoveryInputs(preparation.origin) : null;
    const legacyDraft = !!pinnedInputs && !pinnedInputs.batchVersion;
    // Drafts saved by this version keep the full source snapshot only at
    // inputs.taskInputV1; older drafts stored a second copy inside
    // inputs.progress. Rebuild the in-page alias so resuming either shape
    // behaves identically. The stored row itself is never re-inflated.
    if (pinnedInputs?.taskInputV1 && pinnedInputs.progress && !pinnedInputs.progress.taskInputV1) {
        pinnedInputs.progress = { ...pinnedInputs.progress, taskInputV1: pinnedInputs.taskInputV1 };
    }
    const storedProgress = archive_batches.checkedProgress(existing?.[archive_batches.IMPORT_PROGRESS_KEY]);
    let progress = nextIndependentBatch ? existing?.[archive_batches.IMPORT_PROGRESS_KEY]
        : pinnedInputs?.progress || (!restartImport && archive_batches.hasPendingBatches(storedProgress) ? storedProgress : null);
    let taskInputV1 = continueRecovery || selectedDraft ? pinnedInputs?.taskInputV1 || progress?.taskInputV1 || null : null;
    const capturedInput = checkedArchiveTaskInput(taskInputV1, context);
    const contentContext = archiveContentContext(context, capturedInput);
    const settings = core_settings.getPluginSettings(contentContext);
    if (capturedInput) userAvatar = capturedInput.userAvatar;
    const inputOwner = capturedInput?.inputOwner || archiveSourceOwnerIdentity(context);
    if (!capturedInput && pinnedInputs?.inputOwner && pinnedInputs.inputOwner !== inputOwner) {
        const was = JSON.parse(pinnedInputs.inputOwner), now = JSON.parse(inputOwner);
        throw archive_batches.changedInput(JSON.stringify(was.character) !== JSON.stringify(now.character) ? 'character' : 'persona');
    }
    const snapshotForIdentity = capturedInput?.snapshotForIdentity || await core_context.buildChatSnapshot(context, {
        completeSource: true, readRange: settings.chatReadRange, expectedChatId: preparation.origin.chatId,
        stillCurrent: preparationStillCurrent });
    assertPreparationCurrent();
    const identity = capturedInput?.identity || batchIdentity(context, snapshotForIdentity);
    const floorWindowSync = archive_batches.isAutomaticFloorWindowSync({
        automatic, floorWindow, continueRecovery, restartImport, selectedDraft, nextIndependentBatch, draftId,
    });
    if (progress) {
        archive_batches.assertIdentity(progress.identity, identity, { ignoreChatFingerprint: floorWindowSync });
        if (progress.archiveRevision !== (existing?.archiveRevision || '')) throw archive_batches.changedInput('archive');
    }
    if (pinnedInputs?.identity) archive_batches.assertIdentity(pinnedInputs.identity, identity);
    const shouldScan = settings.useCurrentChatExternalMemory || hasMemoryWorldInfoSelection(context);
    let external = capturedInput?.external || pinnedInputs?.external || (progress ? await source_read.boundedSourceRead(() => retainedBatchExternal(context, progress), logicalTask.signal) : (shouldScan
        ? await readCurrentChatMemoryPlugins({ automatic: true, preparationToken: runtimeState.archivePreparationToken, signal: logicalTask.signal })
        : await source_read.boundedSourceRead(() => currentMemorySourceLedgerExternal(context), logicalTask.signal).catch(error => {
            if (error?.name === 'AbortError') throw error;
            globalThis.toastr?.info?.('来源账本暂不可读，本批仅处理已取得的聊天；没有宣称账本来源已全部归档。', '心迹回廊');
            return { records: [], sources: [{ id: 'source-ledger', label: '本地来源账本', count: 0,
                readStatus: 'unavailable', coverage: { status: 'failed', reason: '账本读取未完成' } }], fingerprint: 'none', ledgerAvailable: false };
        })));
    external.worldInfo ||= emptyMemoryWorldInfo('none');
    const sceneOnly = Array.isArray(sceneRecords) && sceneRecords.length > 0 && !capturedInput && !progress;
    if (sceneOnly) {
        external = {
            records: sceneRecords.map(item => structuredClone(item)),
            sources: [{ id: 'story-scenes', label: '时间场景', count: sceneRecords.length,
                coverage: { status: 'complete', reason: '用户勾选的时间场景' } }],
            fingerprint: archive_batches.sourceHash(JSON.stringify(sceneRecords.map(item => item.externalId || item.title))),
            worldInfo: emptyMemoryWorldInfo('none'),
            ledgerAvailable: false,
        };
    }
    assertPreparationCurrent();
    if (automatic && (external?.sources?.some(source => source.coverage?.status === 'failed'
        && !['api-unavailable', 'disabled', 'not-ready', 'empty', 'unavailable', 'syncing'].includes(source.readStatus)) || external?.worldInfo?.books?.some(book => book.error))) {
        throw core_text.safeUserError('自动同步的来源读取失败。', 'RMT_LEDGER_UNAVAILABLE');
    }
    const limited = external.sources.filter(source => source.coverage?.status === 'truncated');
    if (limited.length) globalThis.toastr?.warning?.('部分来源达到本次输入预算；完整本地来源不会被删除，具体数量见记忆来源。', '心迹回廊');

    if (incrementalUpdate && core_cache.isCompressedCacheRecord(context.chatMetadata?.[core_constants.CACHE_KEY])) {
        try {
            await source_read.waitForSourceRead(() => core_cache.ensureCacheHydrated(context), logicalTask.signal);
            assertPreparationCurrent();
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            const blocked = new Error(`旧的 ADV EVENT 等生成缓存暂时无法读取，因此已取消档案更新，避免误清空缓存。请刷新页面后重试。${core_text.safeErrorSummary(error)}`);
            blocked.safeToDisplay = true;
            blocked.safeUserMessage = blocked.message;
            throw blocked;
        }
    }

    // A resumed batch owns its original choice, including the absence of a roster.
    // A current selection belongs to later requests, never to an older checkpoint.
    const archiveRoster = participants.normalizeParticipantRoster(pinnedInputs
        ? pinnedInputs.participantRoster ?? null
        : progress ? progress.participantRoster ?? null
            : participantRoster !== undefined ? participantRoster : core_cache.readParticipantRoster(context));
    const participantSnapshot = participants.selectedParticipantSnapshot(archiveRoster);

    const previousMessageCount = incrementalUpdate ? Math.max(0, Number(existing?.sourceMessageCount) || 0) : 0;
    const snapshot = capturedInput?.snapshot || await core_context.buildChatSnapshot(context, {
        completeSource: !legacyDraft,
        prefixCount: previousMessageCount,
        readRange: settings.chatReadRange,
        expectedChatId: preparation.origin.chatId,
        stillCurrent: () => {
            try { return core_requestCoordinator.isLogicalGenerationTaskCurrent(logicalTask)
                && core_context.isCurrentTaskOrigin(preparation.origin, core_context.currentCharacterGuard()); }
            catch { return false; }
        },
    });
    if (!snapshot.chatId) throw new Error('无法识别当前聊天窗口 ID，请先保存或打开一个具体聊天。');
    if (!archiveInputAvailable(snapshot, external)) throw new Error('当前聊天窗口没有可用于创建档案的角色/用户消息或已绑定的外部历史。');

    if (incrementalUpdate && !capturedInput && !restartImport) {
        const oldChatFingerprint = archivedChatFingerprint(existing);
        if (!oldChatFingerprint || previousMessageCount > snapshot.totalMessages || snapshot.prefixFingerprint !== oldChatFingerprint
            || (existing?.fullSourceFingerprint && snapshot.fullPrefixFingerprint && snapshot.fullPrefixFingerprint !== existing.fullSourceFingerprint)) {
            throw core_text.safeUserError('旧档案与当前聊天历史基线不一致，本次保留旧成果；请恢复原聊天历史后继续，或另行保留当前来源。', 'RMT_ARCHIVE_PREFIX_CHANGED');
        }
    }

    const rangeChanged = incrementalUpdate && JSON.stringify(existing?.chatReadRange || null) !== JSON.stringify(snapshot.readRange);
    // Label only: backfill vs incremental never changes what is read or merged below.
    const operationKind = archive_coverage.archiveOperationKind({ existing, fullRebuild, rangeChanged });
    const actionLabel = fullRebuild ? '完全重建' : existing ? archive_coverage.OPERATION_KIND_LABEL[operationKind] : '创建';
    const coverageWindow = archive_coverage.runCoverageWindow(snapshot, { incrementalUpdate, rangeChanged, previousMessageCount });
    // Broader/revised choices may explicitly add older selected floors. The merge below
    // deduplicates already archived content and never deletes records outside the range.
    let chatInput = sceneOnly ? [] : (progress || restartImport ? snapshot.messages : incrementalUpdate && !rangeChanged ? snapshot.incrementalMessages : snapshot.messages);
    const externalChanged = !!progress || restartImport || !incrementalUpdate || core_text.normalizeText(existing?.externalMemoryFingerprint, 240) !== core_text.normalizeText(external.fingerprint, 240);
    // 自动留忆先建档。有新摘要时，摘要和没被摘要点名的楼一起送出，正文不截断。摘要没更新才只读这一窗。
    if (automatic && floorWindow && !progress && !restartImport && !capturedInput && !sceneOnly) {
        const scoped = windowChatMessages(context, floorWindow);
        const source = archive_summary.archiveSourceForDue({
            summaryChanged: externalChanged,
            summaryCount: archive_summary.pluginSummaryCount(external),
        });
        if (source === 'summary') {
            const uncovered = archive_summary.uncoveredWindowMessages(scoped, external.records);
            chatInput = uncovered;
        } else if (scoped.length) chatInput = scoped;
    }
    if (!progress && incrementalUpdate && !chatInput.length && !externalChanged) {
        clearMemoryPreflight(context);
        globalThis.toastr?.info?.('当前窗口没有发现新的聊天消息或新的记忆 / 摘要资料；现有档案和全部已生成内容保持不变。', '心迹回廊');
        return { status: 'noop' };
    }
    let chunks = splitSnapshotIntoChunks({ messages: chatInput });
    let externalChunks = externalChanged ? splitExternalMemoryIntoChunks(external.records) : [];
    let totalChunks = chunks.length + externalChunks.length;
    let batchBudgets = [], capacityPending = [];
    let pausedProgress = pinnedInputs?.pausedProgress || (restartImport && storedProgress ? [...(existing?.archiveImportPaused || []), storedProgress] : existing?.archiveImportPaused || []);
    let completedChunks = 0;
    let chunkInFlight = false;
    core_taskTrace.markChunks(taskTrace, { total: totalChunks, pending: totalChunks });
    const origin = {
        ...preparation.origin,
        archivePresent: !!preparation.existing,
        sourceMessageCount: snapshot.totalMessages,
    };

    core_requestCoordinator.bindLogicalGenerationTask(logicalTask, origin);
    const importController = logicalTask.controller;
    let recoveryTicket = null;
    let profilePending = false;
    runtimeState.activeTaskAbortController = importController;
    runtimeState.activeTaskOrigin = origin;
    runtimeState.activeTaskLabel = `正在${actionLabel}当前聊天档案…`;
    runtimeState.activeTaskBackgrounded = true;
    runtimeState.busy = true;
    if (!automatic) {
        runtimeState.activeArchiveSnapshot = null;
        ui_overlay.openOverlay();
        ui_overlay.setBusyUi(true, runtimeState.activeTaskLabel);
        ui_overlay.showChooser();
        ui_overlay.setBusyUi(true, runtimeState.activeTaskLabel);
    }
    await core_context.yieldToUi();
    try {
        const liveEnvelopeContext = assertPreparationCurrent();
        const contextEnvelope = capturedInput?.contextEnvelope ?? pinnedInputs?.contextEnvelope ?? progress?.contextEnvelope ??
            (await core_cache.buildControlledContextEnvelope(liveEnvelopeContext, { includeWorldInfoDepth: true, signal: importController.signal })
                + participants.participantPromptBlock(participantSnapshot));
        assertPreparationCurrent();
        const chatEnvelope = legacyDraft ? contextEnvelope : contextEnvelope + memoryWorldInfoPromptBlock(external.worldInfo);
        const measuredRequests = new Map();
        const tokenCountState = {};
        const inspect = async (kind, rows, index, total) => {
            const prompt = kind === 'external' ? externalMemoryImportPrompt(contentContext, rows, external.worldInfo) : memoryImportPrompt(contentContext, rows, index, total);
            const actual = archive_requestBudget.composeArchiveRequest(contentContext, prompt, kind === 'external' ? contextEnvelope : chatEnvelope);
            const key = archive_batches.sourceHash(actual);
            const budget = measuredRequests.get(key) || await archive_requestBudget.measureArchiveRequest(contentContext, actual, { signal: importController.signal, tokenCountState });
            measuredRequests.set(key, budget);
            taskTrace.archiveBudget = archive_requestBudget.publicBudget(budget);
            return budget;
        };
        if (!legacyDraft) {
            if (!progress) {
                let units = archive_batches.makeSourceUnits(chatInput, externalChanged ? external.records : []);
                if (restartImport && storedProgress) {
                    if (!rangeChanged) units = units.filter(unit => unit.ref.kind !== 'chat'
                        || unit.ref.index > (storedProgress.baseChatEndFloor || 0));
                    units = archive_batches.excludeSavedUnits(units, storedProgress);
                }
                const batches = await archive_batches.planSourceBatches(units, inspect, { signal: importController.signal });
                if (!batches.length) return { status: 'noop' };
                progress = { version: archive_batches.IMPORT_BATCH_VERSION,
                    taskId: archive_batches.sourceHash(JSON.stringify([identity, Date.now(), external.fingerprint])),
                    identity, archiveRevision: existing?.archiveRevision || '', nextBatch: 0,
                    batches: archive_batches.manifestFromBatches(batches), contextEnvelope,
                    worldInfo: progressWorldInfo(external.worldInfo), external: progressExternalMetadata(external),
                    worldInfoEntryCount: external.worldInfo?.entries?.length || 0,
                    baseChatEndFloor: incrementalUpdate ? (restartImport && storedProgress ? storedProgress.baseChatEndFloor || 0 : previousMessageCount) : 0,
                    baseUsedMessages: incrementalUpdate ? Number(existing?.usedMessageCount) || 0 : 0,
                    baseUsedChars: incrementalUpdate ? Number(existing?.usedCharacterCount) || 0 : 0,
                    ...(external.ledgerAvailable === false ? { fallbackRecords: external.records } : {}),
                    capacityPending: [], createdAt: Date.now(),
                    ...(archiveRoster ? { participantRoster: archiveRoster } : {}) };
                archive_batches.checkedProgress(progress);
            }
            if (progress.capacityPending?.length) {
                globalThis.toastr?.warning?.('已有待入档成果未处理。请先导出；锁上的热位记忆不会被顶掉。', '心迹回廊');
                return { status: 'blocked' };
            }
            if (incrementalUpdate && existing.memories.length >= core_constants.MAX_MEMORY_ITEMS
                && !archive_capacity.canAdmitToHot(existing.memories)) {
                globalThis.toastr?.info?.('热位已满且均为锁定。本批新结果会进待入档，可导出；已有相簿/ADV/房间仍可生成。', '心迹回廊');
            }
            const parts = archive_batches.resolveBatchParts(progress, snapshot.messages, external.records);
            chunks = parts.filter(part => part.kind === 'chat').map(part => part.data);
            externalChunks = parts.filter(part => part.kind === 'external').map(part => part.data);
            if (!commitCompletedOnly) {
                batchBudgets = await Promise.all(parts.map(part => inspect(part.kind, part.data, part.index, part.total)));
                batchBudgets.forEach(archive_requestBudget.assertArchiveRequestBudget);
            }
            totalChunks = chunks.length + externalChunks.length;
            core_taskTrace.markChunks(taskTrace, { total: totalChunks, pending: totalChunks });
        }
        if (!legacyDraft && !taskInputV1) {
            taskInputV1 = captureArchiveTaskInput(context, { operation: 'import', snapshot, snapshotForIdentity,
                external, contextEnvelope, inputOwner, identity, userAvatar,
                participantRoster: archiveRoster });
        }
        if (progress && taskInputV1) progress.taskInputV1 = structuredClone(taskInputV1);
        assertPreparationCurrent();
        if (progress) assertBatchCommitIdentity(context, { [archive_batches.IMPORT_PROGRESS_KEY]: progress });
        if (!automatic && !continueRecovery) {
            const chatCharacters = chatInput.reduce((sum, item) => sum + item.text.length, 0);
            const externalCharacters = externalChunks.reduce((sum, chunk) => sum + JSON.stringify(chunk).length, 0);
            const rangeLabel = snapshot.readRange?.mode === 'all' ? '全部楼层'
                : snapshot.readRange?.mode === 'recent' ? `最近 ${snapshot.readRange.recent} 楼`
                    : `第 ${snapshot.readRange?.start}–${snapshot.readRange?.end} 楼`;
            if (!ui_overlay.confirmExplicitAction('确认本次读取范围',
                `${progress ? `本次为第 ${progress.nextBatch + 1}/${progress.batches.length} 批，完成后停止。` : ''}【${archive_coverage.OPERATION_KIND_LABEL[operationKind]}】${rangeLabel}；已捕获 ${chatInput.length} 条聊天正文，约 ${chatCharacters.toLocaleString()} 字符。${snapshot.readRange?.includeHidden ? '包含隐藏普通对话' : '不含隐藏对话'}。\n外部摘要独立选择：${externalChunks.length} 个分块，约 ${externalCharacters.toLocaleString()} 字符；角色/用户设定与世界书背景每次请求约 ${contextEnvelope.length.toLocaleString()} 字符。\n分块整理后还有档案概述步骤；字符数不是精确 token 或费用。已有 ${existing?.memories?.length || 0} 条档案记忆保留，不会因缩小范围而删除。`,
                { destructive: false })) return { status: 'cancelled' };
            assertPreparationCurrent();
        }
        const settingsIdentity = archiveRecoverySettingsIdentity(context);
        const draftInputs = draft_inputs.compactArchiveInputs(legacyDraft ? pinnedInputs : { external, contextEnvelope, inputOwner, identity,
            batchVersion: archive_batches.IMPORT_BATCH_VERSION,
            // One snapshot copy per draft row: inputs.taskInputV1 only. The live
            // progress object keeps its own copy for the archive-bank commit.
            progress: progressForDraftRow(progress, taskInputV1), pausedProgress,
            baseMemory: archiveSourceBank(existing),
            ...(taskInputV1 ? { taskInputV1 } : {}),
            ...(archiveRoster ? { participantRoster: archiveRoster } : {}) });
        // Same serialization and byte limit as the draft save itself. Fail before
        // any storage transaction or model request; existing records stay untouched.
        if (archive_importRecovery.archiveRecoveryDraftPlanExceedsCapacity(origin, 'import', draftInputs)) {
            throw archive_importRecovery.archiveDraftCapacityFailure();
        }
        recoveryTicket = await archive_importRecovery.beginArchiveRecovery({ origin,
            sourceIdentity: JSON.stringify({ fullRebuild, archivePresent: !!existing, baseRevision: existing?.archiveRevision || '',
                snapshotFingerprint: snapshot.fingerprint, prefixFingerprint: snapshot.prefixFingerprint,
                sourceMessageCount: snapshot.totalMessages, externalFingerprint: external.fingerprint, contextEnvelope,
                ...(archiveRoster ? { participantRoster: archiveRoster } : {}) }),
            sourceFragments: [...chunks.map(chunk => JSON.stringify(chunk)), ...externalChunks.map(chunk => JSON.stringify(chunk))],
            settingsIdentity, fullRebuild, continueApproved: continueRecovery, onProgress: refreshArchiveRecoveryReading,
            draftId, nextIndependentBatch,
            inputs: draftInputs, completedOnly: commitCompletedOnly,
            assertCurrent: () => core_requestCoordinator.isLogicalGenerationTaskCurrent(logicalTask) && core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)
                && core_context.isCurrentTaskRunOrigin(origin, context)
                && core_context.comparableChatId(core_context.getChatId(context)) === origin.chatId
                && (getImportedMemory(context)?.archiveRevision || '') === origin.archiveRevision
                && (taskInputV1 || archiveRecoverySettingsIdentity(context) === settingsIdentity) });
        if (!automatic) globalThis.toastr?.info?.(archive_importRecovery.archiveRecoverySummary(origin)?.notice || archive_importRecovery.ARCHIVE_RECOVERY_PAGE_NOTICE, '心迹回廊 · 档案整理');
        const fresh = [];
        for (let i = 0; i < chunks.length; i += 1) {
            if (savedSlots.has(`chat:${i}`)) { completedChunks += 1; continue; }
            if (commitCompletedOnly && !receivedSlots.has(`chat:${i}`)) continue;
            runtimeState.activeTaskLabel = `正在${actionLabel}新增聊天 · ${i + 1} / ${chunks.length}`;
            ui_overlay.updateBackgroundTaskLabel(runtimeState.activeTaskLabel);
            await core_context.yieldToUi();
            if (automatic) assertPreparationCurrent();
            if (progress) assertBatchCommitIdentity(context, { [archive_batches.IMPORT_PROGRESS_KEY]: progress });
            chunkInFlight = true;
            const normalized = await generateArchiveImportSegment(recoveryTicket, context, chunks[i], { index: i, total: chunks.length,
                requestOptions: { maxTokens: core_constants.MAX_GENERATION_OUTPUT_TOKENS, temperature: Math.min(settings.temperature, 0.35),
                    ...(taskInputV1 ? { recoveryContentSettings: taskInputV1.data.contentSettings,
                        recoveryPrompt: memoryImportPrompt(contentContext, chunks[i], i, chunks.length) } : {}),
                    contextEnvelope: chatEnvelope, signal: importController.signal, skipTokenCount: legacyDraft,
                    archiveRequestBudget: !legacyDraft, archiveBudgetStamp: batchBudgets[i], automatic, taskTrace } });
            fresh.push(...normalized);
            chunkInFlight = false;
            completedChunks += 1;
            core_taskTrace.markChunks(taskTrace, { total: totalChunks, ok: completedChunks, pending: totalChunks - completedChunks });
        }
        for (let i = 0; i < externalChunks.length; i += 1) {
            if (savedSlots.has(`external:${i}`)) { completedChunks += 1; continue; }
            if (commitCompletedOnly && !receivedSlots.has(`external:${i}`)) continue;
            runtimeState.activeTaskLabel = `正在${actionLabel}记忆 / 摘要资料 · ${i + 1} / ${externalChunks.length}`;
            ui_overlay.updateBackgroundTaskLabel(runtimeState.activeTaskLabel);
            await core_context.yieldToUi();
            if (automatic) assertPreparationCurrent();
            if (progress) assertBatchCommitIdentity(context, { [archive_batches.IMPORT_PROGRESS_KEY]: progress });
            chunkInFlight = true;
            const normalized = await generateArchiveImportSegment(recoveryTicket, context, externalChunks[i], { index: i, total: externalChunks.length,
                external: true, worldInfo: external.worldInfo,
                requestOptions: { maxTokens: core_constants.MAX_GENERATION_OUTPUT_TOKENS, temperature: Math.min(settings.temperature, 0.35),
                    ...(taskInputV1 ? { recoveryContentSettings: taskInputV1.data.contentSettings,
                        recoveryPrompt: externalMemoryImportPrompt(contentContext, externalChunks[i], external.worldInfo) } : {}),
                    contextEnvelope, signal: importController.signal, skipTokenCount: legacyDraft,
                    archiveRequestBudget: !legacyDraft, archiveBudgetStamp: batchBudgets[chunks.length + i], automatic, taskTrace } });
            fresh.push(...normalized);
            chunkInFlight = false;
            completedChunks += 1;
            core_taskTrace.markChunks(taskTrace, { total: totalChunks, ok: completedChunks, pending: totalChunks - completedChunks });
        }

        core_taskTrace.beginStage(taskTrace, 'merge');
        const admitted = admitArchiveBatch(
            mergeExisting?.memories || [],
            fresh,
            mergeExisting?.coldArchive || [],
        );
        const memories = admitted.memories;
        capacityPending = admitted.pending;
        if (commitCompletedOnly && capacityPending.length) throw core_text.safeUserError('成功分段超过当前档案可接收容量，未部分覆盖；请先导出成果并处理档案容量。', 'RMT_ARCHIVE_CHUNK');
        if (legacyDraft && !progress) {
            // Retain the exact old request/replay above, then queue every source not
            // covered by that draft. No old successful chunk is generated a second time.
            const completeExternal = shouldScan ? await readCurrentChatMemoryPlugins({ automatic: true,
                preparationToken: runtimeState.archivePreparationToken, signal: importController.signal }) : await source_read.boundedSourceRead(() => currentMemorySourceLedgerExternal(context), importController.signal);
            const covered = archive_batches.makeSourceUnits(chunks.flat(), externalChunks.flat());
            const capturedChat = incrementalUpdate && !rangeChanged
                ? snapshotForIdentity.messages.filter(row => row.index > previousMessageCount) : snapshotForIdentity.messages;
            const rest = archive_batches.excludeSavedUnits(archive_batches.makeSourceUnits(capturedChat, completeExternal.records), {
                nextBatch: 1, batches: [[{ refs: covered.map(unit => unit.ref) }]],
            });
            // Only the old failed request keeps its byte-identical pinned envelope.
            // New continuation batches must not duplicate that selected-book suffix.
            const selectedBlock = memoryWorldInfoPromptBlock(external.worldInfo);
            const continuationEnvelope = selectedBlock && contextEnvelope.endsWith(selectedBlock)
                ? contextEnvelope.slice(0, -selectedBlock.length) : contextEnvelope;
            const inspectContinuation = (kind, rows, index, total) => {
                const prompt = kind === 'external' ? externalMemoryImportPrompt(context, rows, index, total, external.worldInfo)
                    : memoryImportPrompt(context, rows, index, total);
                return archive_requestBudget.measureArchiveRequest(context,
                    archive_requestBudget.composeArchiveRequest(context, prompt, continuationEnvelope + (kind === 'chat' ? selectedBlock : '')),
                    { signal: importController.signal, tokenCountState });
            };
            const remainingBatches = await archive_batches.planSourceBatches(rest, inspectContinuation, { signal: importController.signal });
            const oldParts = [];
            for (const [kind, groups] of [['chat', chunks], ['external', externalChunks]]) groups.forEach((rows, index) => {
                oldParts.push({ kind, index, total: groups.length, refs: archive_batches.makeSourceUnits(kind === 'chat' ? rows : [], kind === 'external' ? rows : []).map(unit => unit.ref) });
            });
            progress = { version: archive_batches.IMPORT_BATCH_VERSION, taskId: archive_batches.sourceHash(JSON.stringify([identity, Date.now()])),
                identity, archiveRevision: existing?.archiveRevision || '', nextBatch: 0,
                batches: [oldParts, ...archive_batches.manifestFromBatches(remainingBatches)],
                contextEnvelope: continuationEnvelope, worldInfo: progressWorldInfo(external.worldInfo), external: progressExternalMetadata(completeExternal),
                ...(completeExternal.ledgerAvailable === false ? { fallbackRecords: completeExternal.records } : {}),
                baseChatEndFloor: incrementalUpdate ? previousMessageCount : 0,
                capacityPending: [], createdAt: Date.now(), baseUsedMessages: Number(existing?.usedMessageCount) || 0,
                baseUsedChars: Number(existing?.usedCharacterCount) || 0 };
        }
        core_taskTrace.markStage(taskTrace, 'merge');

        runtimeState.activeTaskLabel = `正在整理档案简介…`;
        core_taskTrace.beginStage(taskTrace, 'profile');
        ui_overlay.updateBackgroundTaskLabel(runtimeState.activeTaskLabel);
        await core_context.yieldToUi();
        if (automatic) assertPreparationCurrent();
        let profile;
        if (commitCompletedOnly) {
            profile = mergeExisting ? { archiveName: mergeExisting.archiveName || fallbackArchiveName(memories),
                archiveSummary: mergeExisting.archiveSummary || fallbackArchiveSummary(memories), archiveVerdict: mergeExisting.archiveVerdict || null,
                keywords: core_text.cleanArray(mergeExisting.archiveKeywords, 10, 80) } : normalizeArchiveProfile({}, memories);
        } else if ((!preserveExisting || progress?.coverDeferred === true) && progress && !capacityPending.length
            && progress.nextBatch + 1 < progress.batches.length) {
            // r84.71: a new archive now checkpoints in several smaller batches.
            // Intermediate batches keep a local cover and defer the one paid
            // cover request to the batch that completes the sources.
            progress.coverDeferred = true;
            profile = mergeExisting ? { archiveName: mergeExisting.archiveName || fallbackArchiveName(memories),
                archiveSummary: mergeExisting.archiveSummary || fallbackArchiveSummary(memories), archiveVerdict: mergeExisting.archiveVerdict || null,
                keywords: core_text.cleanArray(mergeExisting.archiveKeywords, 10, 80) } : normalizeArchiveProfile({}, memories);
        } else if (preserveExisting && progress?.coverDeferred !== true) {
            // Incremental memory capture does not silently rewrite a user's existing cover.
            profile = { archiveName: mergeExisting.archiveName || fallbackArchiveName(memories),
                archiveSummary: mergeExisting.archiveSummary || fallbackArchiveSummary(memories),
                archiveVerdict: mergeExisting.archiveVerdict || null, keywords: core_text.cleanArray(mergeExisting.archiveKeywords, 10, 80) };
        } else if (!memories.length) {
            profile = normalizeArchiveProfile({}, memories);
        } else try {
            profile = await archive_importRecovery.requestArchiveRecoverySegment(recoveryTicket, 'profile', archiveProfilePrompt(contentContext, memories),
                { maxTokens: 8192, temperature: Math.min(settings.temperature, 0.35), contextEnvelope,
                    ...(taskInputV1 ? { recoveryContentSettings: taskInputV1.data.contentSettings } : {}),
                    archiveRequestBudget: !legacyDraft, signal: importController.signal, context, taskTrace },
                raw => checkedArchiveProfile(raw, memories));
            if (progress?.coverDeferred === true) delete progress.coverDeferred;
        } catch (error) {
            // Only a real cancellation may discard the run. The memories were already
            // validated against the snapshot taken at import start, so a chat or setting
            // change during the *summary* step is a reason to skip the summary, not to
            // throw away every validated chunk and leave the chat with no archive.
            if (error?.name === 'AbortError') throw error;
            profilePending = true;
            core_taskTrace.recordTaskFailure(taskTrace, error);
            if (taskTrace?.activeStage) core_taskTrace.markStage(taskTrace, taskTrace.activeStage, false);
            core_taskTrace.markStage(taskTrace, 'profile', false);
            console.warn('[HeartbeatMemories] archive profile generation failed; using existing/local fallback', core_text.safeErrorDiagnostic(error));
            profile = incrementalUpdate
                ? { archiveName: existing.archiveName || fallbackArchiveName(memories), archiveSummary: existing.archiveSummary || fallbackArchiveSummary(memories), archiveVerdict: existing.archiveVerdict || null, keywords: core_text.cleanArray(existing.archiveKeywords, 10, 80) }
                : normalizeArchiveProfile({}, memories);
            globalThis.toastr?.warning?.(`档案简介这一步没完成，将使用本地简介继续保存已校验的回忆。${core_text.safeErrorSummary(error)}`, '心迹回廊 · 档案简介');
        }
        if (!profilePending) core_taskTrace.markStage(taskTrace, 'profile');
        // Capture the chat's cast appearance here, where the card is already in hand.
        // A record the user confirmed by hand is never replaced by this.
        if (!archiveRoster) { try { cast_looks.ensureCastLooks(context); } catch {} }
        if (preserveExisting) profile.archiveName = mergeExisting.archiveName || fallbackArchiveName(memories);
        const now = Date.now();
        const memoryBank = {
            version: core_constants.MEMORY_VERSION,
            chatId: snapshot.chatId,
            characterName: core_text.normalizeText(contentContext.name2, 120),
            userName: core_text.normalizeText(contentContext.name1, 120),
            ...(userAvatar ? { userAvatar } : {}),
            archiveName: profile.archiveName,
            archiveSummary: profile.archiveSummary,
            archiveVerdict: profile.archiveVerdict,
            archiveKeywords: profile.keywords,
            createdAt: Number(mergeExisting?.createdAt || existing?.createdAt) || now,
            updatedAt: now,
            archiveRevision: `${now}-${snapshot.fingerprint}-${external.fingerprint}`,
            sourceFingerprint: `${snapshot.fingerprint}:${external.fingerprint}`,
            externalMemoryFingerprint: external.fingerprint,
            externalMemorySources: external.sources.map(source => ({
                id: source.id,
                label: source.label,
                count: source.count,
                coverageStatus: source.coverage?.status || 'partial',
                coverageReason: core_text.normalizeText(source.coverage?.reason, 400),
            })),
            externalMemoryRecordCount: external.records.length,
            memoryWorldInfoSources: (external.worldInfo?.books || []).filter(book => book.imported > 0).map(book => ({ name: book.name, mode: book.mode, count: book.imported })),
            memoryWorldInfoEntryCount: external.worldInfo?.entries?.length || 0,
            sourceMessageCount: snapshot.totalMessages,
            chatReadRange: snapshot.readRange,
            usedMessageCount: incrementalUpdate ? (Number(existing?.usedMessageCount) || 0) + chatInput.length : snapshot.usedMessages,
            usedCharacterCount: incrementalUpdate ? (Number(existing?.usedCharacterCount) || 0) + (rangeChanged ? snapshot.usedChars : snapshot.incrementalUsedChars) : snapshot.usedChars,
            coverageMode: incrementalUpdate ? 'incremental-append' : snapshot.coverageMode,
            truncated: incrementalUpdate ? (!!existing?.truncated || (rangeChanged ? snapshot.truncated : snapshot.incrementalTruncated)) : snapshot.truncated,
            memories,
            coldArchive: Array.isArray(admitted.coldArchive) ? admitted.coldArchive : [],
            ...(archiveRoster ? { [participants.PARTICIPANTS_KEY]: archiveRoster } : {}),
        };
        const unfinishedProfile = profilePending;
        if (progress) {
            const staged = commitCompletedOnly
                ? partial_import.partialProgress(progress, receivedSlots, memoryBank.archiveRevision)
                : archive_batches.advanceProgress(progress, { pending: capacityPending, archiveRevision: memoryBank.archiveRevision });
            if (commitCompletedOnly) memoryBank.archivePartialDraft = partial_import.partialReceipt(selectedDraft, memoryBank.archiveRevision);
            memoryBank[archive_batches.IMPORT_PROGRESS_KEY] = staged;
            if (pausedProgress.length) memoryBank.archiveImportPaused = structuredClone(pausedProgress);
            memoryBank.fullSourceFingerprint = snapshotForIdentity.fullFingerprint;
            memoryBank.memoryWorldInfoEntryCount = progress.worldInfoEntryCount ?? memoryBank.memoryWorldInfoEntryCount;
            const totals = archive_batches.progressTotals(staged);
            const savedRefs = archive_batches.savedSourceRefs(staged);
            memoryBank.usedMessageCount = (staged.baseUsedMessages || 0) + new Set(savedRefs.filter(ref => ref.kind === 'chat').map(ref => ref.index)).size;
            memoryBank.usedCharacterCount = (staged.baseUsedChars || 0) + savedRefs.reduce((sum, ref) => sum + ref.length, 0);
            memoryBank.coverageMode = archive_batches.hasPendingBatches(staged) ? 'batched-pending' : 'batched-complete';
            // A pending cover must not occupy the import draft slot and block the
            // next explicit batch. Its original recipe/prefix is retained separately.
            if (archive_batches.hasPendingBatches(staged)) profilePending = false;
        }
        // Floor coverage ledger: append only intervals whose paid batch is durably
        // checkpointed in this save; a full rebuild restarts from what it re-read.
        const coveredRanges = archive_coverage.coveredRangesForSave(preserveExisting ? mergeExisting : null, { window: coverageWindow,
            kind: operationKind, revision: memoryBank.archiveRevision, progress: memoryBank[archive_batches.IMPORT_PROGRESS_KEY] || null });
        if (coveredRanges.length) memoryBank.coveredRanges = coveredRanges;
        const assertBatchSaveCurrent = () => {
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
            if (!core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)) throw new DOMException('Runtime destroyed', 'AbortError');
            const live = core_context.currentCharacterGuard();
            if (!core_context.isCurrentTaskOrigin(origin, live)) throw archive_batches.changedInput('archive');
            if ((commitCompletedOnly || receiptBase?.archivePartialDraft)
                && !floorWindowSync
                && core_context.completeArchiveChatFingerprint(live) !== snapshotForIdentity.fullFingerprint) throw archive_batches.changedInput('chat');
            assertBatchCommitIdentity(live, memoryBank);
        };
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        if (progress && core_context.isCurrentTaskOrigin(origin)) assertBatchSaveCurrent();
        if (commitCompletedOnly && !core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed before partial save', 'AbortError');
        if (independentResult || draftId && !core_context.isCurrentTaskOrigin(origin)) {
            const saved = await archive_importRecovery.retainCompletedArchiveImport(recoveryTicket, memoryBank,
                { sourceMemory: archiveSourceBank(existing), profilePending: unfinishedProfile, baseMemoryMissing });
            refreshArchiveRecoveryReading();
            globalThis.toastr?.success?.('原任务本批成果已独立保存，当前档案没有被覆盖。', '心迹回廊');
            return saved;
        }
        const commitIntent = core_requestCoordinator.queueDeferredCommitRecord(origin, {
            kind: 'archive',
            memoryBank,
            preserveDerivedCache: preserveExisting,
            profilePending,
            completedChunks,
        });
        if (commitIntent.item && !commitCompletedOnly) archive_importRecovery.stageArchiveRecoveryCommit(recoveryTicket, memoryBank.archiveRevision, { profilePending, profileMemory: memoryBank });
        let wasBackgrounded = runtimeState.activeTaskBackgrounded || !core_context.isCurrentTaskOrigin(origin);
        if (core_context.isCurrentTaskOrigin(origin)) {
            try {
                core_taskTrace.beginStage(taskTrace, 'save');
                await core_cache.saveImportedMemory(core_context.currentCharacterGuard(), memoryBank, snapshot.chatId, {
                    preserveDerivedCache: preserveExisting,
                    expectedTaskOrigin: origin,
                    assertTaskCurrent: () => { core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask); if (progress) assertBatchSaveCurrent(); },
                    explicitCreate: origin.archivePresent === false,
                    expectedPreviousArchiveState: {
                        present: origin.archivePresent === true,
                        revision: origin.archiveRevision,
                    },
                });
                core_taskTrace.markStage(taskTrace, 'save');
                core_requestCoordinator.acknowledgeDeferredCommit(commitIntent.key, commitIntent.item);
                clearMemoryPreflight(core_context.currentCharacterGuard());
            } catch (error) {
                if (!core_context.isCurrentTaskOrigin(origin) && commitIntent.durable) wasBackgrounded = true;
                else throw error;
            }
        } else {
            if (!commitIntent.durable) throw new Error('聊天窗口已经切换，且浏览器未能持久保存待写回档案。请回到原聊天后重新更新。');
        }
        if (wasBackgrounded && !core_context.isCurrentTaskOrigin(origin)) {
            if (taskTrace?.activeStage === 'save') core_taskTrace.markStage(taskTrace, 'save', false);
            core_taskTrace.markStage(taskTrace, 'deferred');
        }
        if (!commitCompletedOnly) archive_importRecovery.stageArchiveRecoveryCommit(recoveryTicket, memoryBank.archiveRevision, { profilePending, profileMemory: memoryBank });
        if (!commitCompletedOnly && core_context.isCurrentTaskOrigin(origin)) {
            const saved = getImportedMemory(core_context.currentCharacterGuard());
            if (saved?.archiveRevision === memoryBank.archiveRevision) archive_importRecovery.acknowledgeArchiveRecoveryCommit({ ...origin, archiveRevision: saved.archiveRevision }, draftId);
        }
        if (profilePending) globalThis.toastr?.info?.((core_context.isCurrentTaskOrigin(origin)
            ? '回忆已保存。可点“仅重试档案简介”，不会重新抽取成功记忆。'
            : '整理结果已保留，正在等待原聊天写回；写回后可仅重试档案简介。')
            + (archive_importRecovery.archiveRecoverySummary(origin)?.notice || archive_importRecovery.ARCHIVE_RECOVERY_PAGE_NOTICE), '心迹回廊 · 简介待重试');
        runtimeState.activeTaskBackgrounded = false;
        if (!automatic) { runtimeState.activeMode = null; runtimeState.activeSession = null; }
        if (core_context.isCurrentTaskOrigin(origin)) {
            ui_settingsPanel.refreshSettingsMemoryStatus();
        }
        if (commitCompletedOnly) {
            globalThis.toastr?.success?.('已将成功分段入档，未完成部分仍保留；继续时不会重做已入档分段。', '心迹回廊');
            return { status: core_context.isCurrentTaskOrigin(origin) ? 'committed' : 'deferred' };
        }
        const added = Math.max(0, memories.length - (incrementalUpdate ? existing.memories.length : 0));
        const rollingNotice = archive_capacity.capacityNotice(admitted);
        globalThis.toastr?.success?.(core_text.toastText(`${progress && archive_batches.hasPendingBatches(memoryBank[archive_batches.IMPORT_PROGRESS_KEY]) ? `【${archive_coverage.OPERATION_KIND_LABEL[operationKind]}】${capacityPending.length ? '本批部分结果入档，余下结果待入档' : '本批已保存，后续批次待点击'}` : `${actionLabel}完成`}：${memoryBank.archiveName} · 当前热位 ${memories.length} 条${memoryBank.coldArchive?.length ? ` · 冷归档 ${memoryBank.coldArchive.length}` : ''}${incrementalUpdate ? ` · 新增 ${added} 条 · 已保留原 ADV EVENT 等缓存` : ''}${!core_context.isCurrentTaskOrigin(origin) ? '（待回到原窗口写入，尚未正式保存）' : ''}`), '心迹回廊');
        if (rollingNotice) globalThis.toastr?.info?.(rollingNotice, '心迹回廊 · 容量');
        return { status: core_context.isCurrentTaskOrigin(origin) ? 'committed' : 'deferred' };
    } catch (error) {
        const cancelled = isArchiveCancellation(error);
        if (chunkInFlight) core_taskTrace.markChunks(taskTrace, {
            total: totalChunks, ok: completedChunks, failed: cancelled ? 0 : 1,
            pending: totalChunks - completedChunks - (cancelled ? 0 : 1),
        });
        core_taskTrace.endTaskTrace(taskTrace, cancelled ? 'cancelled' : 'failed', error);
        if (!automatic) { runtimeState.activeMode = null; runtimeState.activeSession = null; }
        if (cancelled) {
            console.warn('[HeartbeatMemories] archive import aborted by extension/task cancellation');
        } else {
            console.error('[HeartbeatMemories] archive import failed', core_text.safeErrorDiagnostic(error));
            const wasBackgrounded = runtimeState.activeTaskBackgrounded || document.getElementById(core_constants.OVERLAY_ID)?.hidden;
            runtimeState.activeTaskBackgrounded = false;
            if (!automatic && !wasBackgrounded) ui_overlay.showMemoryImportError(core_text.safeErrorSummary(error));
            globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
            if (archive_importRecovery.archiveRecoverySummary(origin)) globalThis.toastr?.info?.(archive_importRecovery.archiveRecoverySummary(origin)?.notice || archive_importRecovery.ARCHIVE_RECOVERY_PAGE_NOTICE, '心迹回廊 · 档案整理草稿');
        }
        return { status: cancelled ? 'cancelled' : 'failed', error };
    } finally {
        archive_importRecovery.releaseArchiveRecovery(recoveryTicket);
        if (recoveryTicket) try { await archive_importRecovery.flushArchiveRecovery(origin, recoveryTicket.entry.operation); }
        catch (error) { globalThis.toastr?.warning?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿保存'); }
        if (runtimeState.activeTaskAbortController === importController) runtimeState.activeTaskAbortController = null;
        if (runtimeState.activeTaskOrigin === origin) runtimeState.activeTaskOrigin = null;
        runtimeState.activeTaskLabel = '';
    }
}
