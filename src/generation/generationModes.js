import * as routePeople from '../core/routeParticipants.js';
import * as composerOptions from '../core/generationOptions.js';
import * as generation_merged from './mergedGeneration.js';
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_participants from '../core/participants.js';
import * as core_generationParticipants from '../core/generationParticipants.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as generation_recovery from './recovery.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_normalizers from './normalizers.js';
import * as generation_prompts from './prompts.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_phone from '../modes/phone.js';
import * as modes_song from '../modes/themeSong.js';
import * as song_contract from '../core/themeSongContract.js';
import * as modes_bedtime from '../modes/bedtime.js';
import * as bedtime_contract from '../core/bedtimeContract.js';
import * as heart_reader from '../ui/heartReaderState.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_pastLives from '../modes/pastLives.js';
import * as modes_timeStories from '../modes/timeStories.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as modes_travel from '../modes/travel.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';
import * as ui_contentManager from '../ui/contentManager.js';
import * as navigation_bookmark from '../ui/navigationBookmark.js';
import { buildWorldPresentationContext, captureAlbumParticipantSnapshot, captureModeParticipantSnapshot, captureRoomParticipantSnapshot, contentContextSources, generationWorldInfoScanTerms, modeTaskTraces } from './generationContext.js';
import { requestValidatedSegment } from './generationRequest.js';
import { beginModeRecovery, startAdvScriptSecondStep } from './generationSavedActions.js';
// 各玩法生成主流程：继续已保存的生成、generateMode
// 从 generation/client.js 原样搬出（重构阶段 2），声明文本一字未改；generation/client.js 仍转发原有导出。

export async function continueSavedGeneration(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.backupOnly) throw new Error('独立备份是只读快照，不能继续生成。');
    const targetOptions = snapshot ? archive_library.archiveTargetGenerationOptions(snapshot) : {};
    const context = targetOptions.context || options.context || core_context.currentCharacterGuard();
    const bank = archive_repository.requireArchive(context);
    const existing = core_cache.loadGenerationRecovery(mode, context, targetOptions.archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    if (!existing) { globalThis.toastr?.info?.('当前档案没有可继续的草稿，不会发起新请求。', '心迹回廊'); return; }
    if (options.skipConfirm !== true && !ui_overlay.confirmExplicitAction('继续未完成内容？', '只补原任务未完成的内容，会使用文本生成额度。认证或额度问题需要先在设置里解决；取消不改动草稿。', { destructive: false })) return;
    const operation = existing.operation || { kind: 'mode', mode };
    const resumeOptions = { ...options, ...targetOptions, existing, continueRecovery: true,
        ...(operation.participantRegeneration ? { participantRegeneration: operation.participantRegeneration } : {}) };
    if (operation.kind === 'merged') return generation_merged.resumeMergedGeneration(existing, resumeOptions);
    if (operation.kind === 'mode') return generateMode(mode, { ...resumeOptions,
        background: options.skipConfirm === true || !(runtimeState.activeMode === mode && (time_stories.isTimeStoryMode(mode)
            || mode === core_constants.MODE.THEME_SONG || mode === core_constants.MODE.BEDTIME
            || (mode === core_constants.MODE.PHONE && runtimeState.activeSession?._rmtEmptyTerminal === true))) });
    if (operation.kind === 'content-item' && operation.sourceDraftId) return ui_contentManager.resumeContentRegeneration(resumeOptions);
    let session = core_cache.loadSession(mode, { context, memoryBank: bank, cache: targetOptions.archiveTarget?.cache, clone: true });
    const stored = targetOptions.archiveTarget?.cache || core_cache.getCache(context);
    if (!session && mode === core_constants.MODE.HEART && !stored?.[mode]
        && ['heart-section', 'heart-season', 'heart-fireflies'].includes(operation.kind)) session = modes_heart.makeHeartShell(bank);
    if (!session) throw new Error('原任务所依赖的内容已不在当前档案；草稿保留，没有重新生成。');
    if (operation.kind === 'content-item') {
        runtimeState.activeMode = mode;
        runtimeState.activeSession = session;
        return ui_contentManager.resumeContentRegeneration(resumeOptions);
    }
    const routes = {
        'adv-single': () => modes_advEvent.generateAdvForSelected({ ...resumeOptions, eventId: operation.eventId }),
        'adv-bulk': () => modes_advEvent.generateAllAdvForSession(resumeOptions),
        'adv-repair': () => modes_advEvent.repairFailedAdvForSession(resumeOptions),
        'heart-section': () => modes_heart.generateHeartSection(operation.part, resumeOptions),
        'heart-fireflies': () => modes_heart.generateHeartFirefliesSection(resumeOptions),
        'heart-season': () => modes_heart.generateHeartSeasonSection(operation.season, resumeOptions),
        'room-daily-life': () => modes_room.ensureRoomLifePlan({ ...resumeOptions, force: true }),
    };
    if (!routes[operation.kind] || !operation.kind.startsWith(mode === core_constants.MODE.ADV ? 'adv-' : mode === core_constants.MODE.HEART ? 'heart-' : mode === core_constants.MODE.ROOM ? 'room-' : '!')) throw new Error('无法识别原续写入口，草稿保留。');
    runtimeState.activeMode = mode;
    runtimeState.activeSession = session;
    return routes[operation.kind]();
}

export async function generateMode(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    const context = options.context || core_context.currentCharacterGuard();
    if (!Object.hasOwn(options, 'participantSnapshot') && !options.existing && !options.draftId && !options.participantRegeneration && !options.archiveTarget
        && !core_cache.loadGenerationRecovery(mode, context)) {
        options = { ...options, participantSnapshot: routePeople.captureRoutePeople(options.workspaceRoute || mode, context, archive_repository.getImportedMemory(context)) };
    }
    const origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || '');
    let logicalTask;
    try {
        logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'mode', mode,
            draftId: options.existing?.draftId || options.draftId || '',
            pageId: options.participantRegeneration?.pageId || mode, context, origin,
            taskKey: core_requestCoordinator.generationTaskKeyForMode(mode, context), parentTaskId: options.logicalParentTaskId });
    } catch (error) {
        if (error?.code !== 'RMT_LOGICAL_TASK_BUSY') throw error;
        globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在生成/补齐中。`, '心迹回廊');
        return options.participantRegeneration ? { status: 'blocked' } : undefined;
    }
    let result;
    try {
        result = await generateModeOperation(mode, { ...options, logicalTask });
        if (options.participantRegeneration && !result) result = { status: 'noop' };
        return result;
    } catch (error) {
        result = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        if (options.participantRegeneration) return { ...result, error };
        throw error;
    } finally {
        const autoAdvScripts = logicalTask?.autoAdvScripts === true && result?.status !== 'failed' && result?.status !== 'cancelled';
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask, result);
        if (autoAdvScripts) setTimeout(() => { startAdvScriptSecondStep().catch(() => {}); }, 600);
    }
}

async function generateModeOperation(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    // Capture once, before any archive/network/storage await. A destroyed invocation must never
    // adopt the next runtime lifetime and re-register itself as a fresh paid task.
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    if ([core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode) && options.automatic) return { status: 'noop' };
    options = { ...options, cgPromptFormat: options.cgPromptFormat || core_settings.getPluginSettings(options.context || core_context.getContext()).cgPromptFormat };
    // Readers may belong to a historical archive while the host stays in another
    // chat. Only that exact, unchanged reader may receive a foreground result.
    const scopedReaderMode = time_stories.isTimeStoryMode(mode)
        || mode === core_constants.MODE.THEME_SONG || mode === core_constants.MODE.BEDTIME || mode === core_constants.MODE.HEART
        || (mode === core_constants.MODE.PHONE && runtimeState.activeSession?._rmtEmptyTerminal === true);
    const timeReader = scopedReaderMode && runtimeState.activeMode === mode && runtimeState.activeSession
        ? { session: runtimeState.activeSession, entryId: runtimeState.activeArchiveSnapshot?.entryId || '',
            scope: core_context.chatScopeKey(core_context.getContext()),
            position: JSON.stringify(navigation_bookmark.readingPosition(runtimeState.activeSession)) } : null;
    const timeReaderVisible = () => {
        try {
            return !!timeReader && core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)
                && runtimeState.activeMode === mode && runtimeState.activeSession === timeReader.session
                && (runtimeState.activeArchiveSnapshot?.entryId || '') === timeReader.entryId
                && core_context.chatScopeKey(core_context.getContext()) === timeReader.scope
                && JSON.stringify(navigation_bookmark.readingPosition(runtimeState.activeSession)) === timeReader.position
                && !document.getElementById(core_constants.OVERLAY_ID)?.hidden;
        } catch { return false; }
    };
    let themeSongPlan = null;
    let bedtimePlan = null;
    let inboxDate = mode === core_constants.MODE.INBOX ? new Date() : null;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const background = options.background === true;
    let replaceExisting = options.replaceExisting === true;
    let recoveryHandle = null;
    let recoveryExisting = null;
    if (mode === core_constants.MODE.THEME_SONG && replaceExisting && !options.participantRegeneration) throw song_contract.songError('REPLACE', '印象曲每次追加新作品，不会整册覆盖。');
    if (mode === core_constants.MODE.BEDTIME && replaceExisting && !options.participantRegeneration) throw bedtime_contract.bedtimeError('REPLACE', '睡前故事只会新建故事或追加章节，不会整册覆盖。');
    if (mode === core_constants.MODE.INBOX && replaceExisting && !options.participantRegeneration) throw new Error('邮箱只追加新信，不支持整箱重新生成。');
    const archiveTarget = options.archiveTarget && typeof options.archiveTarget === 'object' ? options.archiveTarget : null;
    if (archiveTarget?.backupOnly) throw new Error('独立备份是永久只读快照，不能生成或写入派生内容。');
    let context = archiveTarget ? options.context : (options.context || core_context.currentCharacterGuard());
    if (!context) throw new Error('无法构建档案专用生成上下文。');
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    let replacementTicket = null;
    if (options.participantRegeneration) {
        replacementTicket = await core_cache.assertArchiveVersionReplacement(context, options.participantRegeneration, mode);
        const snapshot = core_participants.normalizeParticipantSnapshot(options.participantRegeneration.participantSnapshot);
        if (!snapshot) throw new Error('明确重做缺少本次已确认的人物快照。');
        options.participantRegeneration = { ...replacementTicket, participantSnapshot: snapshot };
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, options.logicalTask.origin, { participantSnapshot: snapshot });
        replaceExisting = true;
    }
    if (archiveTarget) {
        if (typeof options.revalidateArchiveTarget !== 'function') throw new Error('档案专用读取边界不可用，本次没有发起模型请求。');
        const latestTarget = await options.revalidateArchiveTarget(archiveTarget, lifecycleEpoch);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        archiveTarget.memory = structuredClone(latestTarget.memory);
        archiveTarget.cache = structuredClone(latestTarget.cache || {});
        archiveTarget.archiveRevision = core_text.normalizeText(latestTarget.memory?.archiveRevision, 240);
        context.chatMetadata[core_constants.MEMORY_KEY] = structuredClone(archiveTarget.memory);
        context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(archiveTarget.cache);
    }
    const expectedChatId = core_context.getChatId(context);
    let memoryBank = archive_repository.requireArchive(context);
    let targetMemoryBank = memoryBank;
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const promptFactory = generation_prompts.PROMPTS[mode];
    if (!promptFactory && !time_stories.isTimeStoryMode(mode) && ![core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.RELATIONS, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode)) return;
    const segmentedMode = time_stories.isTimeStoryMode(mode) || [core_constants.MODE.ENDING, core_constants.MODE.ALBUM, core_constants.MODE.HEART, core_constants.MODE.PHONE, core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode);
    let calendarCurrentDate = mode === core_constants.MODE.CALENDAR ? modes_calendar.storyCalendarDate(memoryBank) : '';
    let calendarLegacyDate = false;
    let generationPrompt = segmentedMode || mode === core_constants.MODE.RELATIONS
        ? ''
        : mode === core_constants.MODE.CALENDAR
            ? generation_prompts.calendarStoryPrompt(context, memoryBank, { currentDate: calendarCurrentDate })
            : promptFactory(context, memoryBank);
    let roomSession = null;
    let focusObject = null;
    let previousSession = null;
    const incrementalPart = mode === core_constants.MODE.HEART ? 'dialogues' : 'mode';
    const refreshableCalendar = mode === core_constants.MODE.CALENDAR;
    const refreshableRelations = mode === core_constants.MODE.RELATIONS || mode === core_constants.MODE.CABINET;
    let roomSchemaUpgrade = false;
    let allowPersonaExpansion = options.automatic !== true && [core_constants.MODE.ROOM, core_constants.MODE.ITEMS, core_constants.MODE.TRAVEL].includes(mode);
    const modeHasNoIncrementalWork = () => {
        if (replacementTicket) return false;
        if (options.continueRecovery) return false;
        if (allowPersonaExpansion && previousSession) return false;
        if (mode === core_constants.MODE.INBOX) return !modes_inbox.inboxPlan(memoryBank, previousSession, inboxDate).length;
        if (mode === core_constants.MODE.ROOM && options.visualOnly && previousSession) return false;
        if (mode === core_constants.MODE.PHONE && options.fillMissing) {
            if (options.continueDraft) throw new Error('私人终端还有已保存的续写草稿，请先从档案入口继续生成；补旧终端不会清除这份草稿。');
            return !modes_phone.phoneHasMissingEntries(previousSession);
        }
        if (!previousSession || refreshableCalendar || refreshableRelations || core_constants.CREATIVE_EXPANSION_MODES.includes(mode) || (mode === core_constants.MODE.PHONE && options.continueDraft === true)) return false;
        const pendingMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
        return !pendingMemoryIds.length && !roomSchemaUpgrade;
    };
    const reportNoIncrementalWork = () => {
        if (mode === core_constants.MODE.INBOX) { globalThis.toastr?.info?.('今天的来信与最新关系事件已经收录，不会重复请求。', '心迹回廊 · 邮箱'); return; }
        const targetPrefix = archiveTarget ? `「${archiveTarget.characterName} · ${archiveTarget.archiveName}」的` : '';
        globalThis.toastr?.info?.(`${targetPrefix}「${core_constants.MODE_LABEL[mode]}」已经覆盖当前档案。请先增量更新档案；下次只会追加新内容，旧内容不会重写。`, '心迹回廊');
    };
    const taskKey = core_requestCoordinator.generationTaskKeyForMode(mode, context);
    const alreadyGenerating = core_requestCoordinator.isModeGenerating(mode, context);
    if (alreadyGenerating) {
        globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在生成/补齐中。`, '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已经有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成。`, '心迹回廊');
        return;
    }
    if (mode === core_constants.MODE.ROOM && runtimeState.roomLifeRefreshPromise) {
        globalThis.toastr?.info?.('“今日生活”正在更新，请等它完成后再从新增档案追加房间内容。', '心迹回廊');
        return;
    }
    if (mode === core_constants.MODE.ADV && (core_requestCoordinator.hasGenerationTaskPrefix(`adv:${core_context.chatScopeKey(context)}:`) || runtimeState.activeAdvBulkScopes.has(core_context.chatScopeKey(context)))) {
        globalThis.toastr?.info?.('当前有 ADV 正文正在生成，请等它完成后再追加 ADV EVENT 事件索引。', '心迹回廊');
        return;
    }
    // A no-op must not advance the durable mode fence. In another tab, doing so would cancel a
    // real in-flight build for the same frozen archive even though this invocation never calls a
    // provider. Preflight against the freshly revalidated snapshot, then repeat after the CAS.
    recoveryExisting = options.newTask === true ? null : options.existing || core_cache.loadGenerationRecovery(mode, context, archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    // The whole-page entry must not resume the newest one-item child instead
    // of its page. Explicit draft buttons and legacy formal-item recovery keep
    // their existing routing; the child's paid journal remains independently saved.
    if (!options.automatic && !options.existing && !options.draftId
        && recoveryExisting?.operation?.kind === 'content-item' && recoveryExisting.operation.sourceDraftId) {
        recoveryExisting = core_cache.loadGenerationRecovery(mode, context, archiveTarget?.cache,
            { draftId: recoveryExisting.operation.sourceDraftId, pageId: recoveryExisting.pageId });
    }
    if (recoveryExisting) {
        if (replacementTicket && !options.continueRecovery) throw new Error('原分段草稿尚未保留到旧版本，本次没有重新请求。');
        if (options.automatic) return { status: 'noop' };
        if (recoveryExisting.operation?.kind && recoveryExisting.operation.kind !== 'mode') return continueSavedGeneration(mode,
            { ...options, draftId: recoveryExisting.draftId, pageId: recoveryExisting.pageId });
        if (!options.continueRecovery && !ui_overlay.confirmExplicitAction('继续未完成内容？', '这项还保留着上次的分段草稿。继续只补未完成部分，会使用文本生成额度；取消不会改动草稿或旧内容。', { destructive: false })) return;
        options.continueRecovery = true;
        replaceExisting = recoveryExisting.replaceExisting === true;
        const savedOperation = recoveryExisting.operation;
        if (savedOperation?.kind === 'mode') {
            if (savedOperation.participantRegeneration && !replacementTicket) {
                replacementTicket = await core_cache.assertArchiveVersionReplacement(context, savedOperation.participantRegeneration, mode);
                const participantSnapshot = core_participants.normalizeParticipantSnapshot(savedOperation.participantRegeneration.participantSnapshot);
                if (!participantSnapshot) throw new Error('重做草稿缺少原人物快照。');
                options.participantRegeneration = { ...replacementTicket, participantSnapshot };
                core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, options.logicalTask.origin, { participantSnapshot });
            }
            if (mode === core_constants.MODE.INBOX && typeof savedOperation.inboxDate === 'string' && Number.isFinite(Date.parse(savedOperation.inboxDate))) inboxDate = new Date(savedOperation.inboxDate);
            if (mode === core_constants.MODE.CALENDAR) {
                // Existing recovery keeps its exact recipe/date; never silently restarts paid work.
                calendarLegacyDate = savedOperation.calendarTimeBasis !== 'story';
                calendarCurrentDate = modes_calendar.normalizeCalendarDate(savedOperation.calendarDate)?.date || '';
                generationPrompt = (calendarLegacyDate ? generation_prompts.calendarPrompt : generation_prompts.calendarStoryPrompt)(context, memoryBank, { currentDate: calendarCurrentDate });
            }
            allowPersonaExpansion = options.automatic !== true && savedOperation.allowPersonaExpansion === true;
            options.visualOnly = savedOperation.visualOnly === true;
            options.fillMissing = savedOperation.fillMissing === true;
            if (typeof savedOperation.focusObjectId === 'string') options.focusObjectId = savedOperation.focusObjectId;
        }
    }
    previousSession = replaceExisting ? null : core_cache.loadSession(mode, {
        context,
        chatId: expectedChatId,
        memoryBank,
        clone: true,
    });
    roomSchemaUpgrade = mode === core_constants.MODE.ROOM && modes_room.roomNeedsSchemaUpgrade(previousSession);
    if (mode === core_constants.MODE.PHONE && !replaceExisting && core_cache.loadPhoneGenerationDraft(context, memoryBank)) options.continueDraft = true;
    if (modeHasNoIncrementalWork()) {
        if (!options.automatic) reportNoIncrementalWork();
        return options.automatic ? { status: 'noop' } : undefined;
    }
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    let origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId), archiveTargetEntryId: core_text.normalizeText(archiveTarget?.entryId, 120) };
    core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
    const targetEpochKey = archiveTarget ? `${origin.archiveTargetEntryId}:${mode}` : '';
    const targetEpoch = archiveTarget ? (Number(runtimeState.archiveTargetTaskEpochs.get(targetEpochKey)) || 0) + 1 : 0;
    if (archiveTarget) runtimeState.archiveTargetTaskEpochs.set(targetEpochKey, targetEpoch);
    const taskTrace = core_taskTrace.startTaskTrace(taskKey, mode);
    core_taskTrace.markStage(taskTrace, 'start');
    modeTaskTraces.set(taskKey, taskTrace);
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, { archiveTarget }, mode,
        archiveTarget ? `${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${core_constants.MODE_LABEL[mode]}生成中` : '');
    if (archiveTarget) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(archiveTarget.entryId));
    const archiveTargetStillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(options.logicalTask) && (!archiveTarget || (
        core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)
        && runtimeState.archiveTargetTaskEpochs.get(targetEpochKey) === targetEpoch
        && runtimeState.activeModeBuildScopes.has(taskKey)
    ));
    core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
    if (!background && (!scopedReaderMode || timeReaderVisible())) {
        ui_overlay.openOverlay();
        const actionText = replaceExisting ? `正在重新生成「${core_constants.MODE_LABEL[mode]}」…` : roomSchemaUpgrade ? '正在为旧版房间刷新视觉设定…' : refreshableCalendar && previousSession ? '正在刷新「两个人的日历」…' : refreshableRelations && previousSession ? '正在刷新「本世界线人际关系」…' : previousSession ? `正在从新增档案追加「${core_constants.MODE_LABEL[mode]}」…` : `正在生成「${core_constants.MODE_LABEL[mode]}」…`;
        ui_overlay.setInnerLoading(true, archiveTarget ? `正在为：${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${actionText}` : actionText);
    }
    try {
        if (archiveTarget) {
            if (typeof options.claimArchiveTarget !== 'function') throw new Error('档案专用生成版本边界不可用，本次没有发起模型请求。');
            const claimed = await options.claimArchiveTarget(archiveTarget, mode, archiveTargetStillCurrent);
            if (!archiveTargetStillCurrent()) throw new DOMException('Runtime destroyed', 'AbortError');
            archiveTarget.cache = claimed.cache;
            context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(claimed.cache);
        } else {
            await core_cache.claimLiveModeGeneration(mode, context, memoryBank, {
                draftId: options.draftId || recoveryExisting?.draftId,
                pageId: options.pageId || recoveryExisting?.pageId || mode,
            });
        }
        // A claim is a real IndexedDB CAS boundary. Another page may have committed the same
        // archive revision after the UI snapshot was opened, so every incremental/base input must
        // be reloaded from the claimed canonical cache before the first provider request.
        memoryBank = archive_repository.requireArchive(context);
        targetMemoryBank = memoryBank;
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        previousSession = replaceExisting ? null : core_cache.loadSession(mode, {
            context,
            chatId: expectedChatId,
            memoryBank,
            clone: true,
        });
        roomSchemaUpgrade = mode === core_constants.MODE.ROOM && modes_room.roomNeedsSchemaUpgrade(previousSession);
        if (mode === core_constants.MODE.PHONE && !replaceExisting && core_cache.loadPhoneGenerationDraft(context, memoryBank)) options.continueDraft = true;
        if (core_constants.ROOM_DEEP_MODES.includes(mode)) {
            roomSession = options.roomSessionOverride
                || core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: expectedChatId, memoryBank, clone: false });
            if (!roomSession) {
                globalThis.toastr?.info?.('请先生成“他的房间”，再从房间内部生成这项深层内容。', '心迹回廊');
                return;
            }
            const selectedSpace = roomSession.spaces.find(space => space.id === roomSession.selectedSpaceId) || roomSession.spaces[0];
            focusObject = selectedSpace?.objects.find(item => item.id === options.focusObjectId)
                || selectedSpace?.objects.find(item => item.id === roomSession.selectedObjectId)
                || selectedSpace?.objects[0]
                || null;
            if (mode === core_constants.MODE.ITEMS && !core_evidence.isSearchableRoomObject(focusObject)) {
                globalThis.toastr?.info?.('只有房间里的盒子、抽屉、柜子、包等收纳物可以生成翻找内容。', '心迹回廊');
                return;
            }
            if (mode !== core_constants.MODE.PHONE) generationPrompt = generation_prompts.roomDeepGenerationPrompt(mode, context, memoryBank, roomSession, focusObject);
        }
        if (modeHasNoIncrementalWork()) {
            if (!options.automatic) reportNoIncrementalWork();
            return options.automatic ? { status: 'noop' } : undefined;
        }
        if (mode === core_constants.MODE.THEME_SONG) {
            const stored = core_cache.getCache(context);
            if (!previousSession && stored?.[mode] && !replacementTicket) throw song_contract.songError('SOURCE', '已有印象曲暂不可读取，原作品保留。');
            themeSongPlan = recoveryExisting?.operation?.themeSongPlan
                ? modes_song.validateThemeSongPlan(recoveryExisting.operation.themeSongPlan, memoryBank)
                : modes_song.validateThemeSongPlan(modes_song.createThemeSongPlan(options.songOptions || composerOptions.readSongOptions(context, memoryBank), memoryBank, previousSession), memoryBank);
        }
        if (mode === core_constants.MODE.BEDTIME) {
            const stored = core_cache.getCache(context);
            if (!previousSession && stored?.[mode] && !replacementTicket) throw bedtime_contract.bedtimeError('SOURCE', '已有睡前故事暂不可读取，原作品仍保留。');
            const recoverySnapshot = generation_recovery.readGenerationContentSnapshot(recoveryExisting);
            const frozenInputs = recoverySnapshot?.contentInputs;
            const planPrevious = frozenInputs && Object.hasOwn(frozenInputs, 'previousSession') ? frozenInputs.previousSession : previousSession;
            const planMemory = recoverySnapshot?.memoryBank || memoryBank;
            bedtimePlan = recoveryExisting?.operation?.bedtimePlan
                ? modes_bedtime.validateBedtimePlan(recoveryExisting.operation.bedtimePlan, planMemory, planPrevious)
                : modes_bedtime.validateBedtimePlan(modes_bedtime.createBedtimePlan(options.bedtimeOptions || {}, memoryBank, previousSession), memoryBank, previousSession);
        }
        origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId), archiveTargetEntryId: core_text.normalizeText(archiveTarget?.entryId, 120) };
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
        // A room replacement intentionally has no incremental previousSession.
        // Keep its unselected life/pets and linked physical IDs independently of
        // that prompt input. The already-validated version also repairs older
        // replacement drafts that never captured this separate preservation data.
        let linkedRoomSession = null;
        if (replacementTicket && mode === core_constants.MODE.ROOM) {
            const savedInputs = generation_recovery.readGenerationContentSnapshot(recoveryExisting)?.contentInputs;
            linkedRoomSession = savedInputs && Object.hasOwn(savedInputs, 'linkedRoomSession')
                ? structuredClone(savedInputs.linkedRoomSession)
                : (await core_cache.readArchiveVersion(context, replacementTicket.versionId)).cache[mode] || null;
        }
        recoveryHandle = await beginModeRecovery(mode, context, memoryBank, origin, { ...options, archiveTarget, stillCurrent: archiveTargetStillCurrent, existing: recoveryExisting, replaceExisting,
            partialReaderStillCurrent: scopedReaderMode ? () => !background && timeReaderVisible() : null,
            contentInputs: { previousSession, roomSession, focusObject, ...(linkedRoomSession ? { linkedRoomSession } : {}) },
            operation: recoveryExisting?.operation || { kind: 'mode', mode, ...(themeSongPlan ? { themeSongPlan } : {}), ...(bedtimePlan ? { bedtimePlan } : {}), inboxDate: inboxDate?.toISOString() || '', calendarDate: calendarCurrentDate,
                ...(mode === core_constants.MODE.CALENDAR ? { calendarTimeBasis: 'story' } : {}),
                allowPersonaExpansion, visualOnly: options.visualOnly === true, fillMissing: options.fillMissing === true, focusObjectId: core_text.normalizeText(options.focusObjectId, 120),
                ...(replacementTicket ? { participantRegeneration: options.participantRegeneration } : {}) } });
        context = recoveryHandle.contentContext;
        memoryBank = recoveryHandle.contentBank;
        if (recoveryHandle.contentInputs) {
            previousSession = recoveryHandle.contentInputs.previousSession;
            roomSession = recoveryHandle.contentInputs.roomSession;
            focusObject = recoveryHandle.contentInputs.focusObject;
        }
        let participantSnapshot = null;
        if (![core_constants.MODE.ROOM, core_constants.MODE.ALBUM].includes(mode)) {
            participantSnapshot = await captureModeParticipantSnapshot(mode, context, origin, {
                existing: recoveryExisting,
                participantSnapshot: options.participantRegeneration?.participantSnapshot ?? options.participantSnapshot,
                memoryBank,
            });
            memoryBank = core_generationParticipants.deriveGenerationParticipantMemoryBank(memoryBank, participantSnapshot);
            if (participantSnapshot && options.logicalTask) core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin, { participantSnapshot });
        }
        if (!segmentedMode && mode !== core_constants.MODE.RELATIONS) {
            generationPrompt = core_constants.ROOM_DEEP_MODES.includes(mode) && mode !== core_constants.MODE.PHONE
                ? generation_prompts.roomDeepGenerationPrompt(mode, context, memoryBank, roomSession, focusObject)
                : mode === core_constants.MODE.CALENDAR
                    ? (calendarLegacyDate ? generation_prompts.calendarPrompt : generation_prompts.calendarStoryPrompt)(context, memoryBank, { currentDate: calendarCurrentDate })
                    : promptFactory(context, memoryBank);
        }
        let session;
        participantSnapshot = mode === core_constants.MODE.ROOM
            ? await captureRoomParticipantSnapshot(context, origin, { existing: recoveryExisting,
                participantSnapshot: options.participantRegeneration?.participantSnapshot ?? options.participantSnapshot })
            : mode === core_constants.MODE.ALBUM ? await captureAlbumParticipantSnapshot(context, origin, { existing: recoveryExisting,
                participantSnapshot: options.participantRegeneration?.participantSnapshot ?? options.participantSnapshot }) : participantSnapshot;
        if (participantSnapshot && options.logicalTask) {
            if (mode === core_constants.MODE.ROOM) options.logicalTask.participantPromptIndexed = true;
            core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin, { participantSnapshot });
        }
        let presentationContext = null;
        if (time_stories.isTimeStoryMode(mode) || (mode === core_constants.MODE.ITEMS && previousSession && allowPersonaExpansion) || [core_constants.MODE.ROOM, core_constants.MODE.PHONE, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode)) {
            presentationContext = await buildWorldPresentationContext(context, memoryBank, mode, origin, participantSnapshot);
            if (options.logicalTask && presentationContext.selectedSetting) options.logicalTask.inputPacking = presentationContext.selectedSetting;
        }
        if (mode === core_constants.MODE.THEME_SONG) {
            session = await modes_song.generateThemeSong(context, memoryBank, origin, taskKey, previousSession, { plan: themeSongPlan, presentationContext });
        } else if (mode === core_constants.MODE.BEDTIME) {
            session = await modes_bedtime.generateBedtime(context, memoryBank, origin, taskKey, previousSession, { plan: bedtimePlan, presentationContext });
        } else if (mode === core_constants.MODE.INBOX) {
            session = await modes_inbox.generateInbox(context, memoryBank, origin, taskKey, previousSession, { presentationContext, date: inboxDate });
        } else if (time_stories.isTimeStoryMode(mode)) {
            session = await modes_timeStories.generateTimeStoryWithRepair(mode, context, memoryBank, origin, taskKey, { previousSession, replaceExisting, presentationContext });
        } else if (mode === core_constants.MODE.PAST_LIVES) {
            session = await modes_pastLives.generatePastLivesWithRepair(context, memoryBank, origin, taskKey, { previousSession, replaceExisting, presentationContext, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ADV) {
            session = await modes_advEvent.generateAdvIndexWithRepair(context, memoryBank, origin, expectedChatId, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.BUTTERFLY && options.fillButterflyText && previousSession) {
            session = await modes_butterfly.fillButterflyProse(context, memoryBank, origin, taskKey, previousSession);
        } else if (mode === core_constants.MODE.BUTTERFLY) {
            session = previousSession
                ? await modes_butterfly.generateButterflyIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession)
                : await modes_butterfly.generateButterflyWithRepair(context, memoryBank, origin, taskKey, { secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ROOM && options.fillRoomText && previousSession) {
            session = await modes_room.generateRoomWithRepair(context, memoryBank, origin, taskKey, { presentationContext, participantSnapshot, fillExisting: true, existingSession: previousSession, secondStep: true });
        } else if (mode === core_constants.MODE.ROOM && options.visualOnly && previousSession) {
            session = await modes_room.refreshRoomFigure(context, memoryBank, origin, taskKey, previousSession, { presentationContext, participantSnapshot });
        } else if (mode === core_constants.MODE.ROOM && previousSession) {
            session = await modes_room.generateRoomIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext, allowPersonaExpansion, participantSnapshot });
        } else if (mode === core_constants.MODE.ROOM) {
            session = await modes_room.generateRoomWithRepair(context, memoryBank, origin, taskKey, { presentationContext, participantSnapshot, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ITEMS && options.fillItemsText && previousSession) {
            session = await modes_items.fillItemsLines(context, memoryBank, origin, taskKey, previousSession);
        } else if (mode === core_constants.MODE.ITEMS && previousSession) {
            session = await modes_items.generateItemsIncrementalWithRepair(context, memoryBank, roomSession, focusObject, origin, taskKey, previousSession, { presentationContext, allowPersonaExpansion });
        } else if (mode === core_constants.MODE.ITEMS) {
            session = await modes_items.generateItemsWithRepair(context, memoryBank, origin, taskKey, generationPrompt, { secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ENDING) {
            session = await modes_ending.generateEndingWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ALBUM) {
            session = await modes_album.generateAlbumWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, participantSnapshot, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.HEART) {
            session = await modes_heart.generateHeartWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.PHONE) {
            session = previousSession && options.fillMissing
                ? await modes_phone.generatePhoneMissingWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext,
                    savePartial: async partial => {
                        partial.chatId = expectedChatId; partial.archiveRevision = expectedArchiveRevision;
                        if (archiveTarget) await archive_library.commitArchiveTargetSessionMutation(archiveTarget, mode, origin, () => partial, partial, archiveTargetStillCurrent);
                        else if (!await core_cache.commitSessionMutation(mode, expectedChatId, origin, () => partial, partial)) throw new DOMException('Archive changed', 'AbortError');
                    } })
                : previousSession && options.continueDraft !== true
                ? await modes_phone.generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext })
                : await modes_phone.generatePhoneWithRepair(context, memoryBank, origin, taskKey, {
                    continueDraft: options.continueDraft === true,
                    secondStep: options.secondStep === true,
                    archiveTarget,
                    stillCurrent: archiveTargetStillCurrent,
                    presentationContext,
                });
        } else if (mode === core_constants.MODE.TRAVEL && options.fillTravelText && previousSession) {
            session = await modes_travel.fillTravelProse(context, memoryBank, origin, taskKey, previousSession, {
                contextEnvelope: presentationContext?.contextEnvelope, controlledEvidence: presentationContext?.settingEvidence || '',
            });
        } else if (mode === core_constants.MODE.TRAVEL) {
            session = await modes_travel.generateTravelWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, presentationContext, allowPersonaExpansion, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.RELATIONS) {
            const selectedBooks = await generation_recovery.frozenGenerationInput(origin, 'relations:setting-books',
                () => archive_repository.collectSelectedMemoryWorldInfo(context, expectedChatId, null, { settingsOnly: true }));
            const settingSelection = modes_relations.fitRelationSettingEntries(selectedBooks.entries, { coverage: selectedBooks.coverage });
            // Same rule as the setting envelope: an unreadable or oversized book means
            // "fewer people to draw from", not "refuse to refresh the garden".
            if (settingSelection.coverage.status !== 'complete' && options.logicalTask) {
                const kept = settingSelection.entries?.length || 0;
                const total = (selectedBooks.entries || []).length;
                options.logicalTask.inputPacking = {
                    used: kept,
                    total,
                    dropped: Math.max(0, total - kept),
                    note: `已发送 ${kept}/${total} 条人际设定，未送出的旧人物仅在来源仍有效时保留。${core_text.normalizeText(settingSelection.coverage?.reason, 160)}`,
                    deduplicatedChars: 0,
                    included: [],
                    excluded: [],
                };
            }
            const settingEntries = settingSelection.entries;
            const raw = await requestValidatedSegment(
                modes_relations.relationsPrompt(context, memoryBank, settingEntries),
                '正在整理当前世界线的人际关系…',
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 7000, temperatureCeiling: 0.3, context, origin, taskKey: `${taskKey}:relations`, mode, background: true },
                value => {
                    if (settingEntries.length && !Array.isArray(value?.settingRelationships)) throw new Error('设定人物列表缺失');
                    modes_relations.normalizeRelations(value, memoryBank, context);
                    return value;
                },
            );
            session = modes_relations.normalizeRelations(raw, memoryBank, context);
            session.settingRelationships = modes_relations.mergeBudgetRetainedSettingRelations(raw.settingRelationships, previousSession?.settingRelationships, settingSelection, context);
            session.settingCoverage = settingSelection.coverage;
            const relationGroupId = archive_groups.currentArchiveGroupKey(context, memoryBank);
            if (relationGroupId) {
                const relationEntries = archive_groups.archiveGroupEntries(relationGroupId, context);
                const relationMeta = archive_groups.archiveGroupMeta(relationGroupId, relationEntries, context);
                session.profileKey = modes_relations.archiveCharacterProfileKey(relationGroupId, relationMeta, relationEntries);
            }
            session.characterName = core_text.normalizeText(context.name2, 120);
            session.characterAvatar = core_context.contextCharacterAvatar(context, context.name2);
        } else if (mode === core_constants.MODE.ACHIEVEMENTS) {
            session = await modes_achievements.generateAchievementsWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else {
            const contextEnvelope = mode === core_constants.MODE.CALENDAR
                ? await generation_recovery.frozenGenerationInput(origin, 'context:calendar',
                    () => core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(mode, context) }))
                : presentationContext?.contextEnvelope;
            const effectivePrompt = mode === core_constants.MODE.ROOM
                ? `${generationPrompt}\nCONTROLLED_WORLD_PRESENTATION_JSON:\n${JSON.stringify(presentationContext?.profile || {}, null, 2)}\n明确的外貌设定优先采用角色卡/世界书原文；本轮不生成宠物；不要依据生成的房间名、物件或用户 persona 猜测。`
                : generationPrompt;
            const normalize = raw => mode === core_constants.MODE.CALENDAR
                ? modes_calendar.normalizeCalendar(raw, memoryBank, {
                    currentDate: calendarCurrentDate,
                    dateBasis: calendarLegacyDate ? 'legacy-local' : 'story',
                    futureEvidenceText: core_worldPresentation.controlledCalendarEvidence(contextEnvelope),
                    holidayEvidenceText: core_worldPresentation.controlledSettingEvidence(contextEnvelope),
                })
                : mode === core_constants.MODE.ROOM
                    ? modes_room.normalizeRoom(raw, memoryBank, {
                        identityKey: core_context.currentCharacterRuntimeKey(context),
                        worldPresentation: presentationContext?.profile,
                        controlledEvidence: presentationContext?.settingEvidence,
                        characterEvidence: presentationContext?.characterEvidence,
                    })
                : generation_normalizers.normalizeByMode(mode, raw, memoryBank, context);
            session = await requestValidatedSegment(
                effectivePrompt,
                `正在根据当前聊天档案生成「${core_constants.MODE_LABEL[mode]}」…`,
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 6144, context, contextEnvelope, origin, taskKey, mode, background: true },
                normalize,
            );
            if (mode === core_constants.MODE.CALENDAR && previousSession && !replaceExisting) {
                session = modes_calendar.mergeCalendarRefresh(previousSession, session, memoryBank);
            }
            if (mode === core_constants.MODE.CABINET && previousSession) session = modes_cabinet.mergeCabinet(previousSession, session);
        }
        core_taskTrace.markStage(taskTrace, 'validate');
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        if (replacementTicket) {
            if (mode === core_constants.MODE.ROOM) {
                session = modes_room.preserveRoomLinkedContent(linkedRoomSession, session);
            }
            session[core_cache.PARTICIPANT_REPLACEMENT_KEY] = replacementTicket;
        }
        if (!core_incremental.incrementalPartRecord(session, incrementalPart)) {
            const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
            const added = previousSession ? 0 : 1;
            core_incremental.stampIncrementalCoverage(session, previousSession, memoryBank, incrementalPart, sourceMemoryIds, added);
        }
        const generatedSongId = mode === core_constants.MODE.THEME_SONG ? session.songs[0]?.id || '' : '';
        session.chatId = expectedChatId;
        if (memoryBank.archiveRevision !== expectedArchiveRevision) {
            session.archiveRevision = memoryBank.archiveRevision;
            const pending = await core_cache.saveGenerationTaskResult(context, mode, session, origin, {
                draftId: origin.generationRecoveryDraftId, pageId: recoveryHandle?.journal.pageId || mode,
                archiveTarget, memoryBank: targetMemoryBank, sourceMemory: memoryBank, complete: true,
            });
            core_taskTrace.endTaskTrace(taskTrace, 'ok');
            await ui_overlay.presentGenerationTaskResult(pending.draftId, contentContextSources.get(context) || context);
            return pending;
        }
        session.archiveRevision = expectedArchiveRevision;
        await core_context.yieldToUi();
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        core_taskTrace.beginStage(taskTrace, 'save');
        core_requestCoordinator.noteChatTaskPhase('save', { taskKey, origin });
        let committed = false;
        if (archiveTarget) {
            const stillCurrent = archiveTargetStillCurrent;
            if (!stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
            if (typeof options.revalidateArchiveTarget !== 'function' || typeof options.commitArchiveTarget !== 'function') throw new Error('档案专用写回边界不可用，本次结果没有写入。');
            const latestTarget = await options.revalidateArchiveTarget(archiveTarget, lifecycleEpoch);
            if (!stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
            await options.commitArchiveTarget(latestTarget, mode, session, stillCurrent, origin);
            committed = true;
        } else if (core_context.isCurrentTaskOrigin(origin)) {
            try {
                const latestMemory = archive_repository.requireArchive(core_context.currentCharacterGuard());
                if (latestMemory.archiveRevision === expectedArchiveRevision) {
                    committed = await core_cache.commitSession(mode, session, expectedChatId, origin);
                }
            } catch (error) {
                core_taskTrace.recordTaskFailure(taskTrace, error);
            }
        }
        if (!committed && !archiveTarget) {
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
            const deferredDurable = core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [mode]: session } });
            core_requestCoordinator.notifyDeferredCommitNotDurable(deferredDurable);
        }

        if (committed && recoveryHandle) await core_cache.saveGenerationRecovery(context, memoryBank, mode, null, origin, { archiveTarget, stillCurrent: archiveTargetStillCurrent });
        if (committed && [core_constants.MODE.INBOX, core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode)) {
            session = archiveTarget
                ? core_cache.loadSession(mode, { chatId: expectedChatId, memoryBank, cache: runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId ? runtimeState.activeArchiveSnapshot.cache : archiveTarget.cache }) || session
                : core_cache.loadSession(mode) || session;
        }
        if (replacementTicket) {
            core_taskTrace.endTaskTrace(taskTrace, committed ? 'ok' : 'deferred');
            return { status: committed ? 'committed' : 'deferred', session };
        }
        core_taskTrace.markStage(taskTrace, 'save', committed);
        if (!committed) core_taskTrace.markStage(taskTrace, 'deferred');
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        const phoneProgress = mode === core_constants.MODE.PHONE ? modes_phone.phoneCompletionSummary(session) : null;
        const partialNotice = phoneProgress?.partial ? `已保留 ${phoneProgress.readableItems} 条，另有 ${phoneProgress.missingItems} 项未完成，可在终端选择重试` : '';
        const stayBackground = background || !committed || (scopedReaderMode
            ? !timeReaderVisible()
            : !core_context.isCurrentTaskOrigin(origin) || overlay?.hidden || runtimeState.activeMode !== mode);
        if (stayBackground) {
            if (archiveTarget) ui_settingsPanel.refreshSettingsTaskStatus();
            else ui_settingsPanel.refreshSettingsMemoryStatus();
            if (!options.automatic && overlay && !overlay.hidden && !runtimeState.activeMode) archive_snapshots.scheduleChooserRefresh(20);
            if (!options.automatic && !archiveTarget && mode === core_constants.MODE.ROOM && runtimeState.activeMode === core_constants.MODE.ROOM && committed) {
                runtimeState.activeSession = core_cache.loadSession(core_constants.MODE.ROOM) || runtimeState.activeSession;
                modes_room.renderRoom();
            }
            const targetDone = archiveTarget ? `已安全写回：${archiveTarget.characterName} · ${archiveTarget.archiveName} · ` : '';
            core_taskTrace.endTaskTrace(taskTrace, committed ? 'ok' : 'deferred');
            if (options.automatic) return { status: committed ? 'committed' : 'deferred' };
            globalThis.toastr?.success?.(`${targetDone}${partialNotice || (replaceExisting ? '后台重新生成完成' : refreshableCalendar && previousSession ? '后台刷新完成' : refreshableRelations && previousSession ? '后台刷新完成' : previousSession ? '后台增量追加完成' : '后台生成完成')}：${core_constants.MODE_LABEL[mode]}${committed || archiveTarget ? '' : '（回到原窗口自动写入）'}`, '心迹回廊');
            return session;
        }
        if (mode === core_constants.MODE.THEME_SONG && session.songs.some(song => song.id === generatedSongId)) {
            session = { ...session, selectedId: generatedSongId };
        }
        runtimeState.activeMode = mode;
        runtimeState.activeSession = mode === core_constants.MODE.HEART
            ? { ...session, ...heart_reader.heartSelectionScalars(runtimeState.activeSession) } : session;
        core_taskTrace.beginStage(taskTrace, 'render');
        ui_overlay.renderActive();
        core_taskTrace.markStage(taskTrace, 'render');
        core_taskTrace.endTaskTrace(taskTrace, 'ok');
        // Today's life is a separate explicit action; saving a room does not incur
        // an additional unconfirmed provider request.
        globalThis.toastr?.success?.(`${partialNotice || (replaceExisting ? '已重新生成' : refreshableCalendar && previousSession ? '已刷新' : refreshableRelations && previousSession ? '已刷新' : previousSession ? '已增量追加' : '已生成')}：${core_constants.MODE_LABEL[mode]}${previousSession && !refreshableCalendar && !refreshableRelations && !replaceExisting ? '；旧内容保持不变' : ''}`, '心迹回廊');
        return session;
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error?.failure || error);
        if (replacementTicket) {
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        }
        if (recoveryHandle) { try { await generation_recovery.noteGenerationRecoveryFailure(origin, error?.failure || error); } catch {} }
        if (recoveryHandle && error?.name !== 'AbortError') {
            try {
                const summary = generation_recovery.generationRecoverySummary(recoveryHandle.journal);
                if (summary?.canRetry && !summary.canContinue && !summary.oversized && !summary.blocked) {
                    core_requestCoordinator.noteRetryableGeneration({
                        mode,
                        draftId: recoveryHandle.journal.draftId || '',
                        pageId: recoveryHandle.journal.pageId || mode,
                        label: core_constants.MODE_LABEL[mode] || mode,
                    });
                }
            } catch { /* A missed auto-retry leaves the manual button in the task center. */ }
        }
        if (error?.name === 'AbortError') {
            console.warn('[HeartbeatMemories] generation aborted by extension/task cancellation', { mode });
            return null;
        }
        const safeError = core_text.safeErrorSummary(error, 800);
        console.error('[HeartbeatMemories] generation failed', {
            mode,
            ...core_text.safeErrorDiagnostic(error),
        });
        const targetVisible = !archiveTarget || (
            runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
        );
        if (!archiveTarget && mode === core_constants.MODE.PHONE && error?.code === 'RMT_PHONE_DRAFT_AVAILABLE' && runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM) {
            modes_room.renderRoom();
        }
        if (archiveTarget && !targetVisible) {
            globalThis.toastr?.error?.(
                core_text.toastText(`${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${core_constants.MODE_LABEL[mode]}：${safeError}`),
                '心迹回廊 · 档案生成失败',
            );
            error.notified = true;
            return null;
        }
        if (background || document.getElementById(core_constants.OVERLAY_ID)?.hidden || runtimeState.activeMode !== mode
            || (scopedReaderMode && !timeReaderVisible())) {
            const targetPrefix = archiveTarget ? `${archiveTarget.characterName} · ${archiveTarget.archiveName} · ` : '';
            globalThis.toastr?.error?.(core_text.toastText(`${targetPrefix}${safeError}`), `心迹回廊 · ${core_constants.MODE_LABEL[mode]}生成失败`);
            error.notified = true;
            return null;
        }
        if (error.preflightDetail) ui_overlay.showInlinePreflight(safeError, error.preflightDetail, { error: true });
        else ui_overlay.showInlineError(safeError);
        error.notified = true;
        return null;
    } finally {
        core_taskTrace.endTaskTrace(taskTrace, 'noop');
        modeTaskTraces.delete(taskKey);
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
        if (archiveTarget) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(archiveTarget.entryId));
        const targetVisible = !archiveTarget || (
            runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
        );
        if (!background && targetVisible && (!scopedReaderMode || timeReaderVisible())) ui_overlay.setInnerLoading(false);
    }
}

export const autoContinuedDrafts = new Set();
