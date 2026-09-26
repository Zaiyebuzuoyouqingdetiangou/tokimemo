import * as recovery_action from './recoveryAction.js';
import * as workspace_ui from './workspace.js';
import * as language_view from './languageView.js';
import * as ui_contentManager from './contentManager.js';
import * as archive_library from '../archive/library.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as past_lives_view from './pastLivesView.js';
import * as time_stories_view from './timeStoriesView.js';
import * as generation_client from '../generation/client.js';
import { applyArchiveMobileSafeArea, bindOverlayCloseFallback, bindToolbarMoreMenu, bodyEl, calendarQuickAccessHtml, closeArchiveOverlayFromUser, closeToolbarMoreMenu, confirmExplicitAction, confirmExplicitActionTwice, confirmModeRegeneration, confirmRoomLifeRefresh, decorateReadOnlyModeUi, emptyArchiveMode, formatArchiveTime, isArchiveMobileViewport, loadChooserArchiveRecovery, memoryLockPanelHtml, readableModePortals, requestParticipantSelection, requestParticipantVersions, revealArchiveOverlay, setBackVisible, setManageVisible, setRegenerateVisible, toggleToolbarMoreMenu, toolbarMoreMenu, topTitle } from './overlayShell.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as archive_repository from '../archive/repository.js';
import * as core_constants from '../core/constants.js';
import * as expanded_cg_view from './expandedCgView.js';
import * as bedtime_view from './bedtimeView.js';
import * as song_view from './themeSongView.js';
import * as ui_inboxView from './inboxView.js';
import * as ui_taskCenter from './taskCenter.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as ui_workspaceState from './workspaceState.js';
import * as ui_calendarView from './calendarView.js';
import * as ui_travelView from './travelView.js';
import * as ui_butterflyView from './butterflyView.js';
import * as ui_endingView from './endingView.js';
import * as ui_albumView from './albumView.js';
import * as ui_advEventView from './advEventView.js';
import * as modes_room from '../modes/room.js';
import * as modes_items from '../modes/items.js';
import * as ui_phoneView from './phoneView.js';
import * as ui_heartView from './heartView.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_settings from '../core/settings.js';
import { OVERLAY_CLICK_UNHANDLED, applyMemoryPatch, openCachedOrGenerate, presentGenerationTaskResult, showChooser } from './overlayCore.js';
// ui/overlayCore.js handleOverlayClick 的分组处理（重构阶段 3）。每个函数是原函数里连续的一段语句，一字未改；
// 返回 OVERLAY_CLICK_UNHANDLED 表示“这一段没有处理”，原函数接着往下走，和拆分前完全相同。

// 按元素属性分发：记忆锁定、工作区、内容草稿、任务结果、前世 / 时间故事、恢复草稿、档案草稿、CG 大图、睡前故事 / 印象曲 / 邮箱、生成队列（原第 6–49 条语句）
function recoveryButtonKey(action, button, mode) {
    const snapshot = runtimeState.activeArchiveSnapshot;
    const scope = snapshot?.entryId || core_context.chatScopeKey(core_context.getContext());
    return recovery_action.recoveryActionKey(action, scope, mode,
        button.dataset.rmtRecoveryPageId || '', button.dataset.rmtRecoveryDraftId || button.dataset.rmtArchiveRecoveryDraftId || '');
}

export function overlayClickRecordTargets(event) {
    const lockBtn = event.target.closest?.('[data-rmt-memory-lock]');
    if (lockBtn) {
        const pressed = lockBtn.getAttribute('aria-pressed') === 'true';
        return void applyMemoryPatch(lockBtn.dataset.rmtMemoryLock, { locked: !pressed });
    }
    if (workspace_ui.handleWorkspaceClick(event) || language_view.handleLanguageClick(event)) return;
    if (event.target.closest?.('[data-rmt-edit-partial]')) return ui_contentManager.renderPartialContentEditor();
    const contentDraftOpen = event.target.closest?.('[data-rmt-content-draft-open]');
    if (contentDraftOpen) return void archive_library.openContentRegenerationDraft(
        contentDraftOpen.dataset.rmtContentDraftOpen, core_context.getContext(), { snapshot: runtimeState.activeArchiveSnapshot },
    ).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const resultChoice = event.target.closest?.('[data-rmt-task-result-choose]');
    if (resultChoice) return void presentGenerationTaskResult(resultChoice.dataset.rmtTaskResultChoose)
        .catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const resultOpen = event.target.closest?.('[data-rmt-task-result-open]');
    if (resultOpen) return void archive_library.openGenerationTaskResult(resultOpen.dataset.rmtTaskResultOpen, core_context.getContext(), { snapshot: runtimeState.activeArchiveSnapshot })
        .catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const pastLivesButton = event.target.closest?.('[data-rmt-past-lives]');
    if (pastLivesButton) return void past_lives_view.handlePastLivesAction(pastLivesButton.dataset.rmtPastLives, pastLivesButton.dataset.rmtPastLivesId);
    const timeStoryButton = event.target.closest?.('[data-rmt-time-story]');
    if (timeStoryButton) return void time_stories_view.handleTimeStoryAction(timeStoryButton.dataset.rmtTimeStory, timeStoryButton.dataset.rmtTimeStoryId);
    const exportRecoveryButton = event.target.closest?.('[data-rmt-recovery-export]');
    if (exportRecoveryButton) return void recovery_action.runRecoveryAction(exportRecoveryButton, recoveryButtonKey('export', exportRecoveryButton, exportRecoveryButton.dataset.rmtRecoveryExport), () => generation_client.exportSavedGeneration(exportRecoveryButton.dataset.rmtRecoveryExport, {
        draftId: exportRecoveryButton.dataset.rmtRecoveryDraftId || '', pageId: exportRecoveryButton.dataset.rmtRecoveryPageId || '',
    }).then(value => {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'hearttrace-module-recovery.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        globalThis.toastr?.info?.('草稿文件包含任务背景与未提交内容，请勿公开分享。', '心迹回廊');
    }), { label: '正在导出…' });
    const discardButton = event.target.closest?.('[data-rmt-recovery-discard]');
    if (discardButton) return void recovery_action.runRecoveryAction(discardButton, recoveryButtonKey('discard', discardButton, discardButton.dataset.rmtRecoveryDiscard), () => generation_client.discardSavedGeneration(discardButton.dataset.rmtRecoveryDiscard, {
        draftId: discardButton.dataset.rmtRecoveryDraftId || '', pageId: discardButton.dataset.rmtRecoveryPageId || '',
    }).then(result => { if (result) ui_taskCenter.syncTaskCenterChrome({ refreshRecovery: true }); }), { label: '正在停止并放弃…' });
    if (event.target.closest?.('[data-rmt-archive-read-drafts]')) {
        return void loadChooserArchiveRecovery(core_context.getContext(), { showEmpty: true });
    }
    const archiveDraftOpen = event.target.closest?.('[data-rmt-archive-draft-open]');
    if (archiveDraftOpen) return void archive_library.openArchiveRecoveryDraft(
        archiveDraftOpen.dataset.rmtArchiveDraftOpen, core_context.getContext(),
    ).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const saveDraftButton = event.target.closest?.('[data-rmt-archive-save-draft]');
    if (saveDraftButton) {
        if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !archive_library.requireWritableArchiveAction()) return;
        const context = core_context.currentCharacterGuard();
        const origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || '');
        saveDraftButton.disabled = true;
        return void archive_repository.saveCurrentArchiveRecovery(context, saveDraftButton.dataset.rmtArchiveSaveDraft).then(() => {
            if (core_context.isCurrentTaskOrigin(origin)) return loadChooserArchiveRecovery(context);
        }).catch(error => {
            if (core_context.isCurrentTaskOrigin(origin)) globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿未保存');
        }).finally(() => { saveDraftButton.disabled = false; });
    }
    if (event.target.closest?.('[data-rmt-archive-import-draft]')) {
        if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !archive_library.requireWritableArchiveAction()) return;
        const context = core_context.currentCharacterGuard();
        const origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || '');
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
        input.addEventListener('change', async () => {
            try {
                const file = input.files?.[0]; if (!file) return;
                if (file.size > core_constants.MAX_CACHE_SOURCE_BYTES) throw core_text.safeUserError('整理草稿超过 12MB 安全范围，原数据未动。', 'RMT_RECOVERY_LIMIT');
                const data = JSON.parse(await file.text());
                if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed', 'AbortError');
                if (!confirmExplicitAction('导入原聊天的整理草稿？', '只导入待校验草稿，不覆盖正式记忆，不发起模型请求。继续时仍会验证聊天、来源与原请求。', { destructive: false })) return;
                const result = await archive_repository.importCurrentArchiveRecoveryFile(data, context);
                globalThis.toastr?.success?.(`已导入 ${result.completed} 个成功分段；${result.durable ? '已保存到本机' : '仅本页保留，请勿刷新'}。点击继续才处理未完成部分。`, '心迹回廊');
                showChooser();
            } catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 未导入'); }
        }, { once: true });
        input.click(); return;
    }
    if (event.target.closest?.('[data-rmt-archive-commit-complete]')) {
        if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !archive_library.requireWritableArchiveAction()) return;
        return void archive_repository.continueCurrentArchiveImport({ commitCompletedOnly: true })
            .catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    }
    if (event.target.closest?.('[data-rmt-archive-export-pending]')) {
        return void archive_repository.exportCurrentArchiveRecoveryAfterLoad().then(value => {
            const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = 'hearttrace-unarchived-results.json';
            link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }).catch(error => { if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); });
    }
    if (event.target.closest?.('[data-rmt-archive-restart]')) {
        if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return;
        if (!confirmExplicitAction('按当前条件另起整理任务？',
            '正式档案与旧 Mxxx 保持不变。当前未提交草稿暂停并保留，可导出；是否已保存到本机请看草稿状态。已保存的批次检查点随下一次成功保存一并保留。新任务使用当前来源与配置，可能重新处理旧任务尚未正式入档的片段并消耗额度。零成功草稿也可这样重新开始。',
            { destructive: false })) return;
        return void archive_repository.restartCurrentArchiveImport().catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    }
    const archiveDiscard = event.target.closest?.('[data-rmt-archive-discard]');
    if (archiveDiscard) {
        const context = core_context.currentCharacterGuard();
        const discardOrigin = core_context.captureTaskOrigin(context);
        return void recovery_action.runRecoveryAction(archiveDiscard, `archive-discard:${core_context.chatScopeKey(context)}`, async () => {
            if (!confirmExplicitAction('放弃整理草稿？', '如当前聊天的档案整理或简介仍在生成，将先停止它。仅清除这些未提交草稿，不能恢复。不删除已保存的正式记忆、模块或图片，也不会自动发起新请求。', { destructive: true })) return;
            const cleared = await archive_repository.discardCurrentArchiveImportRecovery(context);
            if (cleared) {
                globalThis.toastr?.success?.('整理草稿已放弃，正式档案仍保留。', '心迹回廊');
                if (core_context.isCurrentTaskOrigin(discardOrigin)) showChooser();
                ui_taskCenter.syncTaskCenterChrome({ refreshRecovery: true });
            }
        }, { label: '正在停止并放弃…', title: '心迹回廊 · 草稿未放弃' });
    }
    const recoveryButton = event.target.closest?.('[data-rmt-recovery-mode]');
    if (recoveryButton) return void recovery_action.runRecoveryAction(recoveryButton, recoveryButtonKey('retry', recoveryButton, recoveryButton.dataset.rmtRecoveryMode), () => generation_client.continueSavedGeneration(recoveryButton.dataset.rmtRecoveryMode, {
        draftId: recoveryButton.dataset.rmtRecoveryDraftId || '', pageId: recoveryButton.dataset.rmtRecoveryPageId || '',
    }), { label: '正在继续…' });
    const archiveRecoveryButton = event.target.closest?.('[data-rmt-archive-recovery]');
    if (archiveRecoveryButton) return void recovery_action.runRecoveryAction(archiveRecoveryButton, recoveryButtonKey('archive-retry', archiveRecoveryButton, archiveRecoveryButton.dataset.rmtArchiveRecovery), () => (archiveRecoveryButton.dataset.rmtArchiveRecovery === 'profile'
        ? archive_repository.rewriteCurrentArchiveVerdict({ draftId: archiveRecoveryButton.dataset.rmtArchiveRecoveryDraftId || '' })
        : archive_repository.continueCurrentArchiveImport({ draftId: archiveRecoveryButton.dataset.rmtArchiveRecoveryDraftId || '' })), { label: '正在继续…' });
    const expandedCgButton = event.target.closest?.('[data-rmt-expanded-cg]');
    if (expandedCgButton) return void expanded_cg_view.handleExpandedCgButton(expandedCgButton);
    const bedtimeButton = event.target.closest?.('[data-rmt-bedtime]');
    if (bedtimeButton && !bedtimeButton.disabled) return void bedtime_view.handleBedtimeAction(bedtimeButton.dataset.rmtBedtime, bedtimeButton.dataset.rmtBedtimeId || '');
    const songButton = event.target.closest?.('[data-rmt-song]');
    if (songButton) return void song_view.handleThemeSongAction(songButton.dataset.rmtSong, songButton.dataset.rmtSongId);
    const mailButton = event.target.closest?.('[data-rmt-inbox]');
    if (mailButton) return void ui_inboxView.handleInboxAction(mailButton.dataset.rmtInbox, mailButton.dataset.rmtInboxId);
    const queuePick = event.target.closest?.('.rmt-queue-pick');
    if (queuePick) {
        const input = queuePick.querySelector('[data-rmt-queue-route]');
        queueMicrotask(() => {
            if (input) ui_taskCenter.setQueuePick(input.dataset.rmtQueueRoute, input.checked);
        });
        return;
    }
    const generateModeButton = event.target.closest?.('[data-rmt-generate-mode]');
    if (generateModeButton) {
        const mode = generateModeButton.dataset.rmtGenerateMode;
        const completion = generateModeButton.dataset.rmtCompletion;
        const completionOptions = completion === 'album-comments' && mode === core_constants.MODE.ALBUM
            || completion === 'ending-scenes' && mode === core_constants.MODE.ENDING ? { secondStep: true }
            : completion === 'room-lines' && mode === core_constants.MODE.ROOM ? { fillRoomText: true }
                : completion === 'items-lines' && mode === core_constants.MODE.ITEMS ? { fillItemsText: true } : {};
        const background = !time_stories.isTimeStoryMode(mode) && generateModeButton.dataset.rmtReaderGeneration !== 'true';
        if (runtimeState.activeArchiveSnapshot) {
            if (runtimeState.activeArchiveSnapshot.backupOnly) {
                globalThis.toastr?.warning?.('当前查看的是只读备份，不能启动派生生成；可返回档案页重试读取源聊天。', '心迹回廊');
                return;
            }
            if (generateModeButton.dataset.rmtRegenerate === 'true' && !confirmModeRegeneration(mode)) return;
            const snapshot = runtimeState.activeArchiveSnapshot;
            void (async () => {
                try {
                    const targetOptions = archive_library.archiveTargetGenerationOptions(snapshot);
                    await generation_client.generateMode(mode, { workspaceRoute: ui_workspaceState.workspace.route || mode, background, ...targetOptions, ...completionOptions });
                } catch (error) {
                    if (!error?.notified) globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
                }
            })();
            return;
        }
        if (!archive_library.requireWritableArchiveAction()) return;
        if (generateModeButton.dataset.rmtRegenerate === 'true' && !confirmModeRegeneration(mode)) return;
        void generation_client.generateMode(mode, { workspaceRoute: ui_workspaceState.workspace.route || mode, background, ...completionOptions });
        return;
    }
    return OVERLAY_CLICK_UNHANDLED;
}

// 按元素属性分发：玩法入口、日历、出行、结局、相簿、房间、终端、HEART、头像对话、档案聊天 / 角色、外部记忆与只读开关（原第 50–121 条语句）
export function overlayClickPageTargets(event) {
    const modeButton = event.target.closest?.('[data-rmt-mode]');
    if (modeButton) {
        openCachedOrGenerate(modeButton.dataset.rmtMode);
        return;
    }
    const calendarShift = event.target.closest?.('[data-rmt-calendar-shift]');
    if (calendarShift) return ui_calendarView.shiftCalendarMonth(calendarShift.dataset.rmtCalendarShift);
    const calendarTag = event.target.closest?.('[data-rmt-calendar-tag]');
    if (calendarTag) return ui_calendarView.toggleCalendarTag(calendarTag.dataset.rmtCalendarTag);
    const calendarTagClear = event.target.closest?.('[data-rmt-calendar-tag-clear]');
    if (calendarTagClear) return ui_calendarView.clearCalendarTags();
    const calendarDate = event.target.closest?.('[data-rmt-calendar-date]');
    if (calendarDate) return ui_calendarView.selectCalendarDate(calendarDate.dataset.rmtCalendarDate);
    const calendarPending = event.target.closest?.('[data-rmt-calendar-pending]');
    if (calendarPending) return ui_calendarView.selectCalendarPending(calendarPending.dataset.rmtCalendarPending);
    const calendarMonth = event.target.closest?.('[data-rmt-calendar-month]');
    if (calendarMonth) return ui_calendarView.setCalendarMonth(calendarMonth.dataset.rmtCalendarMonth);
    const travelLocation = event.target.closest?.('[data-rmt-travel-location]');
    if (travelLocation) return ui_travelView.selectTravelLocation(travelLocation.dataset.rmtTravelLocation);
    const node = event.target.closest?.('[data-rmt-node]');
    if (node) return ui_butterflyView.selectButterflyNode(node.dataset.rmtNode);
    const endingView = event.target.closest?.('[data-rmt-ending-view]');
    if (endingView) return ui_endingView.endingSetView(endingView.dataset.rmtEndingView);
    const confessionReplay = event.target.closest?.('[data-rmt-confession-id]');
    if (confessionReplay) return ui_endingView.confessionSelect(confessionReplay.dataset.rmtConfessionId);
    const endingRoute = event.target.closest?.('[data-rmt-ending-id]');
    if (endingRoute) return ui_endingView.endingSelect(endingRoute.dataset.rmtEndingId);
    const albumPrompt = event.target.closest?.('[data-rmt-album-prompt]');
    const albumMemory = event.target.closest?.('[data-rmt-album-memory]');
    if (albumMemory) return ui_albumView.albumEnterSharedMemory(albumMemory.dataset.rmtAlbumMemory);
    if (albumPrompt) return ui_albumView.albumEditCgPrompt(albumPrompt.dataset.rmtAlbumPrompt);
    const albumDraw = event.target.closest?.('[data-rmt-album-draw]');
    if (albumDraw) {
        if (!archive_library.requireWritableArchiveAction()) return;
        return ui_albumView.albumDrawCg(albumDraw.dataset.rmtAlbumDraw);
    }
    const card = event.target.closest?.('[data-rmt-album-id]');
    if (card) return ui_albumView.albumSelect(card.dataset.rmtAlbumId);
    const filter = event.target.closest?.('[data-rmt-category]');
    if (filter) return ui_albumView.albumFilter(filter.dataset.rmtCategory);
    const eventButton = event.target.closest?.('[data-rmt-event-id]');
    if (eventButton) return ui_advEventView.advSelect(eventButton.dataset.rmtEventId);
    const roomSpace = event.target.closest?.('[data-rmt-room-space]');
    if (roomSpace) return modes_room.roomSelectSpace(roomSpace.dataset.rmtRoomSpace);
    const roomObject = event.target.closest?.('[data-rmt-room-id]');
    if (roomObject) return modes_room.roomSelect(roomObject.dataset.rmtRoomId);
    const itemsBox = event.target.closest?.('[data-rmt-items-box]');
    if (itemsBox) return modes_items.itemsSelectBox(itemsBox.dataset.rmtItemsBox);
    const itemNode = event.target.closest?.('[data-rmt-item-node]');
    if (itemNode) return modes_items.itemsSelectNode(itemNode.dataset.rmtItemNode);
    const phoneApp = event.target.closest?.('[data-rmt-phone-app]');
    if (phoneApp) return ui_phoneView.phoneSelectApp(phoneApp.dataset.rmtPhoneApp);
    const phoneEntry = event.target.closest?.('[data-rmt-phone-entry]');
    if (phoneEntry) return ui_phoneView.phoneSelectEntry(phoneEntry.dataset.rmtPhoneEntry);
    const heartView = event.target.closest?.('[data-rmt-heart-view]');
    if (heartView) return ui_heartView.heartSetView(heartView.dataset.rmtHeartView);
    const heartSeason = event.target.closest?.('[data-rmt-heart-season]');
    if (heartSeason) return ui_heartView.heartSetSeason(heartSeason.dataset.rmtHeartSeason);
    const heartVoice = event.target.closest?.('[data-rmt-heart-voice-id]');
    if (heartVoice) return ui_heartView.heartSelectVoice(heartVoice.dataset.rmtHeartVoiceId);
    const heartScenario = event.target.closest?.('[data-rmt-heart-scenario-id]');
    if (heartScenario) return ui_heartView.heartSelectScenario(heartScenario.dataset.rmtHeartScenarioId);
    const heartStrip = event.target.closest?.('[data-rmt-heart-strip-id]');
    if (heartStrip && !event.target.closest?.('[data-rmt-action]')) return ui_heartView.heartSelectStrip(heartStrip.dataset.rmtHeartStripId);
    const heartFirefly = event.target.closest?.('[data-rmt-heart-firefly-id]');
    if (heartFirefly) return ui_heartView.heartSelectFirefly(heartFirefly.dataset.rmtHeartFireflyId);
    const avatarTalk = event.target.closest?.('[data-rmt-avatar-talk]');
    if (avatarTalk) {
        event.preventDefault?.();
        event.stopPropagation?.();
        return void ui_heartView.showAvatarDialogueForCharacter(avatarTalk.dataset.rmtAvatarTalk);
    }
    const archiveChat = event.target.closest?.('[data-rmt-archive-chat]');
    if (archiveChat) return void archive_snapshots.openArchiveSnapshotFromOverview(archiveChat.dataset.rmtArchiveChat);
    const archiveCharacter = event.target.closest?.('[data-rmt-archive-character]');
    if (archiveCharacter) return archive_library.showArchiveCharacter(archiveCharacter.dataset.rmtArchiveCharacter);
    const indexedChat = event.target.closest?.('[data-rmt-indexed-chat]');
    if (indexedChat) return void archive_library.openIndexedArchive(indexedChat.dataset.rmtIndexedCharacter, indexedChat.dataset.rmtIndexedChat, indexedChat.dataset.rmtIndexedEntry || '');

    const externalToggle = event.target.closest?.('[data-rmt-external-memory-toggle]');
    if (externalToggle) {
        core_settings.updatePluginSettings({ useCurrentChatExternalMemory: !!externalToggle.checked });
        try { archive_repository.clearMemoryPreflight(core_context.currentCharacterGuard()); } catch {}
        showChooser();
        return;
    }
    const readOnlyToggle = event.target.closest?.('[data-rmt-readonly-toggle]');
    if (readOnlyToggle) {
        archive_library.setArchiveReadOnly(!!readOnlyToggle.checked);
        return;
    }
    return OVERLAY_CLICK_UNHANDLED;
}
