import * as handJournal from './handJournalView.js';
import * as expanded_cg_view from './expandedCgView.js';
import * as archive_inheritance_view from './archiveInheritance.js';
import * as bedtime_view from './bedtimeView.js';
import * as cg_format_ui from './cgFormatControl.js';
import * as generation_status_view from './generationStatus.js';
import * as mirror_reader from './mirrorTtsReader.js';
import * as heart_reader from './heartReaderState.js';
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_archiveCover from '../core/archiveCover.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as ui_taskCenter from './taskCenter.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_theme from '../core/theme.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as cg_editor from './cgPromptEditor.js';
import * as participant_picker from './participantPicker.js';
import * as image_viewer from './cgImageViewer.js';
import * as floating_archive from './floatingArchive.js';
import * as recovery_view from './recoveryView.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as ui_advEventView from './advEventView.js';
import * as ui_albumView from './albumView.js';
import * as ui_butterflyView from './butterflyView.js';
import * as ui_calendarView from './calendarView.js';
import * as ui_contentManager from './contentManager.js';
import * as ui_endingView from './endingView.js';
import * as ui_heartView from './heartView.js';
import * as ui_phoneView from './phoneView.js';
import * as song_view from './themeSongView.js';
import * as ui_inboxView from './inboxView.js';
import * as ui_travelView from './travelView.js';
import * as ui_settingsPanel from './settingsPanel.js';
import * as home_view from './homeView.js';
import * as past_lives_view from './pastLivesView.js';
import * as time_stories_view from './timeStoriesView.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as ui_styles from './styles.js';
import * as workspace_ui from './workspace.js';
import * as language_view from './languageView.js';
import * as ui_workspaceState from './workspaceState.js';
import * as toolbarIcons from './toolbarIcons.js';
import { applyArchiveMobileSafeArea, bindOverlayCloseFallback, bindToolbarMoreMenu, bodyEl, calendarQuickAccessHtml, closeArchiveOverlayFromUser, closeToolbarMoreMenu, confirmExplicitAction, confirmExplicitActionTwice, confirmModeRegeneration, confirmRoomLifeRefresh, decorateReadOnlyModeUi, emptyArchiveMode, formatArchiveTime, isArchiveMobileViewport, loadChooserArchiveRecovery, memoryLockPanelHtml, readableModePortals, requestParticipantSelection, requestParticipantVersions, revealArchiveOverlay, setBackVisible, setManageVisible, setRegenerateVisible, toggleToolbarMoreMenu, toolbarMoreMenu, topTitle } from './overlayShell.js';
import { deleteManagedTarget, recategorizeManagedTarget, refreshMemoryWorldInfoBookControls, regenerateManagedCategory, regenerateManagedTarget } from './overlayManage.js';
import * as dispatch_overlayClickTargets from './overlayClickTargets.js';
import * as dispatch_overlayClickActions from './overlayClickActions.js';
// handleOverlayClick 的连续语句分组放在 ui/overlayClickTargets.js、ui/overlayClickActions.js；分组函数返回它表示“没处理”，接着往下走。
export const OVERLAY_CLICK_UNHANDLED = Symbol('OVERLAY_CLICK_UNHANDLED');
// 主窗口核心：打开与导航、建档入口、任务结果呈现、页面渲染、点击与变更事件分发
// 从 ui/overlay.js 原样搬出（重构阶段 2），声明文本一字未改；ui/overlay.js 仍转发原有导出。

export function openOverlay() {
    floating_archive.hideFloatingArchive();
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    ui_styles.ensureStyles();
    const preferDialog = isArchiveMobileViewport() && typeof globalThis.HTMLDialogElement === 'function';
    let overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (overlay && preferDialog && !(overlay instanceof globalThis.HTMLDialogElement)) {
        overlay.remove();
        overlay = null;
    }
    if (!overlay) {
        overlay = document.createElement(preferDialog ? 'dialog' : 'div');
        overlay.id = core_constants.OVERLAY_ID;
        overlay.innerHTML = `
          <div class="rmt-shell" role="dialog" aria-modal="true" aria-label="心迹回廊">
            <div class="rmt-topbar">
              <button type="button" data-rmt-action="back" hidden aria-label="返回上级">${toolbarIcons.toolbarIcon('back')}</button>
              <div class="rmt-topbar-title">心迹回廊</div>
              <div class="rmt-live-tasks" data-rmt-live-tasks hidden></div>
              <button type="button" data-rmt-action="library-home" aria-label="打开档案室" title="档案室">${toolbarIcons.toolbarIcon('library')}</button>
              <button type="button" data-rmt-action="workspace-expand" aria-label="展开窗口" title="展开窗口">${toolbarIcons.toolbarIcon('expand')}</button>
              <button type="button" data-rmt-action="regenerate" hidden aria-label="增量追加" title="增量追加">${toolbarIcons.toolbarIcon('add')}</button>
              <button type="button" data-rmt-action="manage" hidden aria-label="管理" title="管理">${toolbarIcons.toolbarIcon('manage')}</button>
              <button type="button" data-rmt-action="tasks" aria-label="任务" title="任务">${toolbarIcons.toolbarIcon('tasks')}<span class="rmt-task-count" data-rmt-task-count hidden>0</span></button>
              <button type="button" data-rmt-action="toolbar-more" aria-label="更多操作" aria-haspopup="menu" aria-controls="rmt-toolbar-more-menu" aria-expanded="false">${toolbarIcons.toolbarIcon('more')}</button>
              <div id="rmt-toolbar-more-menu" class="rmt-toolbar-more-menu" data-rmt-toolbar-more-menu role="menu" aria-label="更多操作" hidden>
<button type="button" data-reader="page" role="menuitem">朗读本页</button><button type="button" data-reader="selection" role="menuitem">朗读选中文字</button><button type="button" data-reader="stop" role="menuitem">停止朗读</button><button type="button" data-rmt-workspace-route="mirrorVoice" role="menuitem">镜译 · 语音设置</button>
                <button type="button" data-rmt-action="workspace-expand" role="menuitem">${toolbarIcons.toolbarIcon('expand')}<span>展开窗口</span></button>
                <button type="button" data-rmt-action="regenerate" data-rmt-toolbar-more-item="regenerate" role="menuitem" hidden>${toolbarIcons.toolbarIcon('add')}<span>增量追加</span></button>
                <button type="button" data-rmt-action="manage" data-rmt-toolbar-more-item="manage" role="menuitem" hidden>${toolbarIcons.toolbarIcon('manage')}<span>管理</span></button>
              </div>
              <button type="button" data-rmt-action="close" aria-label="关闭档案室">${toolbarIcons.toolbarIcon('close')}</button>
            </div>
            ${workspace_ui.workspaceNavHtml()}
            <div class="rmt-task-center" data-rmt-task-center hidden></div>
            <div class="rmt-body"></div>
          </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', handleOverlayClick);
        overlay.addEventListener('change', handleOverlayChange);
        overlay.addEventListener('error', generation_imageGeneration.handleOverlayMediaError, true);
        if (typeof globalThis.HTMLDialogElement === 'function' && overlay instanceof globalThis.HTMLDialogElement) {
            overlay.addEventListener('cancel', event => {
                // ESC on desktop and the Android back gesture both land here.
                event.preventDefault();
                closeArchiveOverlayFromUser();
            });
        }
    }
    ui_taskCenter.ensureTaskCenterChrome(overlay);
    applyArchiveMobileSafeArea(overlay);
    try { core_theme.applyThemeToElement(overlay, core_settings.getPluginSettings(core_context.getContext())); } catch {}
    ui_taskCenter.syncTaskCenterChrome();
    bindOverlayCloseFallback(overlay);
    bindToolbarMoreMenu(overlay);
    revealArchiveOverlay(overlay);
    workspace_ui.syncWorkspaceChrome();
    mirror_reader.mountMirrorReader(overlay);

    return overlay;
}

export function navigateBack() {
    if (image_viewer.closeCgImageViewer()) return;
    if (runtimeState.activeMode === 'bedtime' && bedtime_view.closeBedtimeDetail()) return;
    if (runtimeState.activeMode === 'pastLives' && past_lives_view.closePastLivesDetail()) return;
    if (time_stories.isTimeStoryMode(runtimeState.activeMode) && time_stories_view.closeTimeStoryDetail()) return;
    if (runtimeState.activeMode === core_constants.MODE.TIME_ECHO) return openCachedOrGenerate(core_constants.MODE.PHONE);
    if (cg_editor.hasCgPromptEditor()) return cg_editor.closeCgPromptEditor();
    if (runtimeState.endingEasterEggRuntime) return ui_endingView.closeEndingEasterEgg();
    if (runtimeState.contentManagerOpen) {
        runtimeState.contentManagerOpen = false;
        return renderActive();
    }
    if (runtimeState.activeMode === core_constants.MODE.INBOX && ui_inboxView.closeInboxLetter()) return;
    if (runtimeState.activeMode === core_constants.MODE.TRAVEL && runtimeState.activeSession?.selectedLocationId) return ui_travelView.closeTravelDetail();
    if (runtimeState.activeMode === core_constants.MODE.ITEMS) return modes_room.returnToRoomFromDeep();
    if (runtimeState.activeMode === core_constants.MODE.ALBUM && runtimeState.activeSession?.kind === core_constants.MODE.ALBUM && runtimeState.activeSession.sharedMemory) {
        runtimeState.activeSession.sharedMemory = false;
        return ui_albumView.renderAlbum();
    }
    if (runtimeState.activeMode) return workspace_ui.openWorkspaceTab('content');
    if (runtimeState.archiveViewLevel === 'snapshot' && runtimeState.activeArchiveSnapshot) {
        const key = core_text.normalizeText(runtimeState.activeArchiveSnapshot.archiveGroupId, 120) || (() => { const entry = archive_groups.getArchiveIndex(core_context.getContext()).find(item => core_context.archiveIndexEntryId(item) === core_text.normalizeText(runtimeState.activeArchiveSnapshot.entryId, 120)); return entry ? archive_groups.archiveGroupKeyForEntry(entry) : ''; })();
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
        return key ? archive_library.showArchiveCharacter(key) : archive_library.showArchiveLibrary();
    }
    if (runtimeState.archiveViewLevel === 'chooser') {
        try {
            const key = archive_groups.currentArchiveGroupKey(core_context.currentCharacterGuard());
            if (key) return archive_library.showArchiveCharacter(key);
        } catch {}
        return archive_library.showArchiveLibrary();
    }
    if (runtimeState.archiveViewLevel === 'character') return archive_library.showArchiveLibrary();
    return home_view.showHome();
}

export function requestCurrentArchiveImport({ cardTypeConfirmed = false, participantRoster } = {}) {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        return false;
    }
    const existing = archive_repository.getImportedMemory(context);
    if (!existing && !cardTypeConfirmed && !archive_repository.getCurrentArchiveImportRecoverySummary(context)) {
        return participant_picker.showArchiveCardTypePicker({ context,
            onSingle: () => {
                void core_cache.discardParticipantDraft(context).then(() => requestCurrentArchiveImport({ cardTypeConfirmed: true, participantRoster: null }))
                    .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
            },
            onMultiple: () => {
                void participant_picker.showParticipantPicker({ context, requireSelection: true, confirmLabel: '确认人物并建档',
                    onConfirm: async (roster, expectedRevision) => {
                        const saved = await core_cache.commitParticipantRoster(context, roster, { expectedRevision });
                        participant_picker.closeParticipantPicker();
                        requestCurrentArchiveImport({ cardTypeConfirmed: true, participantRoster: saved });
                    },
                }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
            },
        });
    }
    const settings = core_settings.getPluginSettings(context);
    const detected = archive_repository.externalMemorySourceSummary(context);
    if (settings.useCurrentChatExternalMemory && detected.length && !archive_repository.getMemoryPreflight(context)
        && !archive_repository.getCurrentArchiveImportRecoverySummary(context)) {
        showChooser();
        globalThis.toastr?.info?.('检测到当前窗口记忆 / 摘要来源。请先点“扫描记忆 / 摘要”，确认读取范围后再生成/更新当前窗口档案。', '心迹回廊');
        return false;
    }
    const title = existing ? '增量更新当前窗口档案？' : '生成当前窗口档案？';
    const detail = existing
        ? '默认只整理“上次档案之后新增的聊天”和发生变化的当前窗口记忆/摘要。已有 Mxxx 记忆 ID 不重排，已生成的回忆相簿、CG、ADV、房间、ENDING、储物、私人终端会继续保留。若检测到旧聊天被编辑/删除，本次会停止并保留成果，说明变更类别，由你选择如何处理。'
        : '这会读取当前聊天窗口并建立一份只属于这个窗口的心迹回廊档案。聊天正文不会被修改；之后也只有你手动更新时档案才会变化。';
    if (!confirmExplicitAction(title, detail, { destructive: false })) return false;
    void archive_repository.importCurrentChatMemory({ fullRebuild: false,
        ...(participantRoster !== undefined ? { participantRoster } : {}),
    }).catch(error => {
        console.error('[HeartbeatMemories] current archive import action failed', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    });
    return true;
}

export async function presentGenerationTaskResult(draftId, context = core_context.currentCharacterGuard()) {
    const scope = core_context.chatScopeKey(context);
    const record = await core_cache.readGenerationTaskResult(context, draftId);
    if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) return { status: 'awaiting-choice', draftId };
    const decision = await participant_picker.chooseGenerationTaskResult({ context,
        title: `${core_constants.MODE_LABEL[record.mode] || '旧任务'}已生成完成` });
    if (!decision || core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) return { status: 'awaiting-choice', draftId };
    const result = await core_cache.resolveGenerationTaskResult(context, draftId, decision);
    if (decision === 'independent') await archive_library.openGenerationTaskResult(draftId, context);
    else {
        globalThis.toastr?.success?.('已更新对应页面；替换前的内容和原任务成果都已保留。', '心迹回廊');
        showChooser();
    }
    return result;
}

export function requestCurrentArchiveFullRebuild() {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        return false;
    }
    if (!archive_repository.getImportedMemory(context)) return requestCurrentArchiveImport();
    const settings = core_settings.getPluginSettings(context);
    const detected = archive_repository.externalMemorySourceSummary(context);
    if (settings.useCurrentChatExternalMemory && detected.length && !archive_repository.getMemoryPreflight(context)) {
        showChooser();
        globalThis.toastr?.info?.('完全重建前请先扫描当前窗口记忆 / 摘要，确认读取范围。', '心迹回廊');
        return false;
    }
    if (!confirmExplicitActionTwice(
        '完全重建当前窗口档案？',
        '这会重新读取整个当前聊天并重新编号 Mxxx 记忆，因此旧档案版本对应的回忆相簿、CG、ADV、房间、蝴蝶效应、ENDING、储物、私人终端和邮箱（含来信及收藏的明信片）缓存都会失效，请先备份。只有当你明确需要从头整理（例如旧消息被大量编辑/删除）时才建议使用。',
        { destructive: true },
    )) return false;
    void archive_repository.importCurrentChatMemory({ fullRebuild: true }).catch(error => {
        console.error('[HeartbeatMemories] full archive rebuild failed', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    });
    return true;
}

function refreshAfterMemoryPatch() {
    if (runtimeState.activeMode === core_constants.MODE.ALBUM) return ui_albumView.renderAlbum();
    if (runtimeState.archiveViewLevel === 'chooser' && !runtimeState.activeMode) return showChooser();
}

export async function applyMemoryPatch(id, patch) {
    try {
        await archive_repository.patchImportedMemoryFields(id, patch);
        refreshAfterMemoryPatch();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
    }
}

export function showChooser({ section = null } = {}) {
    const priorTab = ui_workspaceState.workspace.tab;
    ui_workspaceState.leaveWorkspaceReader();
    ui_workspaceState.workspace.tab = section === 'content' || (!section && priorTab === 'content') ? 'content' : 'archive';
    ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    modes_room.stopRoomClock();
    ui_phoneView.stopPhoneClock();
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    runtimeState.archiveViewLevel = 'chooser';
    openOverlay();
    setRegenerateVisible(false);
    setManageVisible(false);
    setBackVisible(true, '角色档案');
    const body = bodyEl();
    if (!body) return;

    let hydrationContext;
    try { hydrationContext = core_context.currentCharacterGuard(); } catch { hydrationContext = null; }
    if (hydrationContext) {
        const scope = core_cache.cacheScopeFromContext(hydrationContext);
        const stored = hydrationContext.chatMetadata?.[core_constants.CACHE_KEY];
        if (core_cache.isCompressedCacheRecord(stored) && !runtimeState.runtimeSessionCache.has(scope)) {
            topTitle('心迹回廊 · 档案室');
            body.innerHTML = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在读取已生成档案…</b></div></div>';
            const chooserEpoch = ui_workspaceState.workspace.epoch;
            const chooserStillVisible = () => chooserEpoch === ui_workspaceState.workspace.epoch
                && runtimeState.archiveViewLevel === 'chooser' && !runtimeState.activeMode
                && !runtimeState.activeArchiveSnapshot && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
                && core_cache.cacheScopeFromContext(core_context.getContext()) === scope;
            void core_cache.ensureCacheHydrated(hydrationContext).then(() => {
                if (chooserStillVisible()) archive_snapshots.scheduleChooserRefresh(0);
            }).catch(error => {
                if (!chooserStillVisible()) return;
                console.warn('[HeartbeatMemories] compressed cache read failed', core_text.safeErrorDiagnostic(error));
                const latestBody = bodyEl();
                if (latestBody) latestBody.innerHTML = `<div class="rmt-error"><div><b>已生成内容缓存读取失败</b><div style="margin:10px 0;white-space:pre-wrap;opacity:.78">${core_text.esc(core_text.safeErrorSummary(error))}</div><button type="button" class="rmt-btn" data-rmt-action="library-home">返回档案室</button></div></div>`;
            });
            return;
        }
    }

    let state;
    let context;
    try {
        context = core_context.currentCharacterGuard();
        state = archive_repository.getMemoryState(context);
    } catch (error) {
        if (ui_workspaceState.workspace.tab === 'content') {
            topTitle('心迹回廊 · 内容');
            body.innerHTML = '<main class="rmt-workspace-page">' + workspace_ui.workspaceCatalogueHtml() + '</main>';
            workspace_ui.syncWorkspaceChrome();
            return;
        }
        topTitle('心迹回廊 · 档案室');
        body.innerHTML = `<div class="rmt-error"><div><b>无法读取当前聊天</b><div style="margin-top:10px;white-space:pre-wrap;opacity:.75">${core_text.esc(core_text.safeErrorSummary(error))}</div></div></div>`;
        return;
    }
    const ready = state.status === 'ready';
    const settings = core_settings.getPluginSettings(context);
    const memory = state.memory;
    const importLabel = ready ? '增量更新当前窗口档案' : '生成当前窗口档案';
    const preview = ready ? memory.memories.slice(0, 7).map(item => item.title).join(' · ') : '';
    const archiveName = ready ? (memory.archiveName || archive_repository.fallbackArchiveName(memory.memories)) : '尚未创建档案';
    const archiveSummary = ready ? (memory.archiveSummary || archive_repository.fallbackArchiveSummary(memory.memories)) : '先为当前聊天创建档案。默认手动更新，也可在设置中开启按楼层自动同步。';
    const keywords = ready ? core_text.cleanArray(memory.archiveKeywords, 10, 80) : [];
    const pendingClass = ready && (state.pendingMessages > 0 || state.sourceChanged) ? 'pending' : 'ready';
    const cachedRead = ready ? { context, chatId: core_context.getChatId(context), memoryBank: memory, clone: false } : null;
    const portals = ready ? readableModePortals(archive_snapshots.baseModeAvailability(cachedRead), cachedRead) : core_constants.ARCHIVE_PORTAL_MODES.map(mode => ({ mode, session: null, meta: archive_snapshots.modePortalMeta(mode) }));
    const generatedCount = portals.filter(item => !!item.session && !item.session.readableProgress).length;
    const calendarPortal = portals.find(item => item.mode === core_constants.MODE.CALENDAR) || { session: null };
    const calendarGenerated = !!calendarPortal.session;
    const calendarGenerating = core_requestCoordinator.isModeGenerating(core_constants.MODE.CALENDAR);
    const calendarQuick = calendarQuickAccessHtml({ ready, generated: calendarGenerated, generating: calendarGenerating,
        partial: !!calendarPortal.session?.readableProgress, readOnly: false });
    const concurrentLabels = core_requestCoordinator.generationTaskLabels();
    const anyRunning = runtimeState.busy || concurrentLabels.length > 0;
    topTitle(`心迹回廊 · 档案室${ready ? ` · ${archiveName}` : ''}`);
    const portalHtml = portals.filter(item => item.mode !== core_constants.MODE.CALENDAR).map(({ mode, session, meta }) => {
        const generated = !!session;
        const generating = core_requestCoordinator.isModeGenerating(mode);
        const capacityReached = core_requestCoordinator.activeLogicalGenerationCount() >= core_constants.MAX_CONCURRENT_GENERATION_TASKS && !generating;
        const isCalendar = mode === core_constants.MODE.CALENDAR;
        const statusText = session?.readableProgress ? '已生成部分内容 · 可以先查看' : generating
            ? (generated ? (isCalendar ? '刷新中 · 旧日历仍可查看' : '增量追加中 · 旧内容仍可查看') : '后台生成中 · 可继续启动其他入口')
            : generated ? (isCalendar ? '已整理 · 点击查看日历' : '已生成 · 点击头像查看') : '尚未生成';
        const draft = mode === core_constants.MODE.PHONE && ready ? core_cache.loadPhoneGenerationDraft(context) : null;
        const actionText = mode === core_constants.MODE.INBOX ? (generating ? '收信中…' : '收取新信') : generating ? '生成中…' : draft ? '重试未完成项' : generated ? (isCalendar ? '刷新日历' : '增量追加') : (isCalendar ? '生成日历' : '生成这一项');
        return `<article class="rmt-archive-portal ${generated ? 'ready' : 'empty'} ${generating ? 'generating' : ''} rmt-archive-portal-${core_text.esc(meta.accent)}">
          <button type="button" class="rmt-portal-open" ${generated || (ready && [core_constants.MODE.INBOX, core_constants.MODE.PHONE, core_constants.MODE.HEART].includes(mode)) ? `data-rmt-mode="${core_text.esc(mode)}"` : 'disabled'}>
            <span class="rmt-portal-avatar"><i class="fa-solid ${core_text.esc(meta.icon)}"></i>${generated ? `<span class="rmt-portal-ready-dot">${session?.readableProgress ? '…' : '✓'}</span>` : '<span class="rmt-portal-lock"><i class="fa-solid fa-lock"></i></span>'}</span>
            <span class="rmt-portal-title">${core_text.esc(meta.title)}</span>
            <span class="rmt-portal-subtitle">${core_text.esc(meta.subtitle)}</span>
            <span class="rmt-portal-status">${core_text.esc(statusText)}</span>
          </button>
          ${draft ? `<p class="rmt-phone-draft-status" role="status">${core_text.esc(core_text.safeErrorSummary({ code: 'RMT_PHONE_DRAFT_AVAILABLE', failure: draft.failure, partialProgress: { completed: draft.completedApps.length, total: draft.plan.apps.length } }))}</p>` : ''}
          <button type="button" class="rmt-btn rmt-portal-generate" ${mode === core_constants.MODE.HEART ? 'data-rmt-action="open-heart"' : `data-rmt-generate-mode="${core_text.esc(mode)}"`} ${generated ? 'data-rmt-regenerate="true"' : ''} ${runtimeState.busy || generating || capacityReached ? 'disabled' : ''}>${core_text.esc(mode === core_constants.MODE.HEART ? '打开角色互动' : actionText)}</button>
        </article>`;
    }).join('');
    const memorySettings = core_settings.getPluginSettings();
    const externalSetting = memorySettings.useCurrentChatExternalMemory;
    const detectedExternalSources = archive_repository.externalMemorySourceSummary(context);
    const preflight = archive_repository.getMemoryPreflight(context);
    const importedSources = ready ? core_text.cleanArray((memory.externalMemorySources || []).map(item => {
        const label = core_text.normalizeText(item?.label, 80);
        const coverage = { complete: '完整', partial: '部分', truncated: '已截断', failed: '失败' }[item?.coverageStatus] || '部分';
        const reason = core_text.normalizeText(item?.coverageReason, 80);
        return `${coverage} · ${label} ${Number(item?.count) || 0}条${reason ? ` · ${reason}` : ''}`;
    }), 8, 220) : [];
    const worldInfoSelectionText = archive_repository.memoryWorldInfoSelectionSummary(context);
    const preflightText = preflight
        ? `本次已扫描：建档可用 ${preflight.records.length} 个摘要片段${preflight.worldInfo?.entries?.length ? ` · 世界书 ${preflight.worldInfo.entries.length} 条` : ''} · ${Number(preflight.totalChars || 0).toLocaleString()} 字符`
        : detectedExternalSources.length
            ? `检测到：${detectedExternalSources.map(item => item.label).join(' · ')}；建档前请先扫描一次。`
            : archive_repository.hasMemoryWorldInfoSelection(context)
                ? `${worldInfoSelectionText}；历史摘要将用于建档，未标记的条目仍只作设定背景。`
                : '当前没有检测到可读取的当前窗口记忆 / 摘要；仍可只用聊天正文建档。普通世界书/角色卡只作为设定参考。';
    const externalSourceText = preflight ? preflightText : importedSources.length ? `上次档案同步：${importedSources.join(' · ')}` : preflightText;
    const requirePreflight = externalSetting && (detectedExternalSources.length > 0 || archive_repository.hasMemoryWorldInfoSelection(context)) && !preflight;
    const externalMemoryControls = `<div class="rmt-external-memory-row">
      <label class="rmt-external-memory-toggle"><input type="checkbox" data-rmt-external-memory-toggle ${externalSetting ? 'checked' : ''} ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}> 读取外部记忆 / 摘要</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:7px"><button type="button" class="rmt-btn" data-rmt-action="read-memory-plugins" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}>扫描记忆 / 摘要</button><button type="button" class="rmt-btn" data-rmt-action="memory-worldinfo-picker" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}>选择记忆世界书</button></div>
      <small>${core_text.esc(externalSourceText)}</small>
      ${preflight ? `<details class="rmt-memory-read-details"><summary>来源读取详情</summary><small>本地当前来源：${Number(preflight.storedRecordCount || 0)} 条 · ${Number(preflight.storedChars || 0).toLocaleString()} 字符；本次建档：${preflight.records.length} 个片段 · ${Number(preflight.recordChars || 0).toLocaleString()} 字符。</small>${preflight.sources.map(source => `<p>${core_text.esc(source.label)}：${core_text.esc(source.coverage?.reason || ({ complete: '已读取', partial: '部分可用', truncated: '本次输入受限', failed: '读取失败' }[source.coverage?.status] || '状态未知'))}</p>`).join('')}${(preflight.worldInfo?.books || []).filter(book => !book.historySource).map(book => `<p>${core_text.esc(book.name)}：${book.error ? '读取失败' : `${book.imported} 条，仅作设定背景；历史内容请标记为历史摘要`}</p>`).join('')}</details>` : ''}
    </div>`;
    const generationAction = '';

    body.innerHTML = `
      <div class="rmt-archive-room">
        <div data-rmt-archive-recoveries aria-live="polite">
        <div data-rmt-archive-recoveries>${recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveImportRecoverySummary(context))}
        ${recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveProfileRecoverySummary(context), { profile: true })}</div>
        </div>
        <div data-rmt-calendar-quick>${calendarQuick}</div>
        <section class="rmt-memory-gate rmt-archive-card">
          <div class="rmt-memory-gate-text">
            <div class="rmt-archive-kicker">PRIVATE MEMORY ARCHIVE</div>
            <strong class="rmt-archive-title">${core_text.esc(archiveName)}</strong>
            ${ready ? core_archiveCover.archiveCoverHtml(memory, { writable: true, busy: anyRunning }) : `<div class="rmt-archive-summary">${core_text.esc(archiveSummary)}</div>`}
            ${keywords.length ? `<div class="rmt-archive-keywords">${keywords.map(word => `<span>${core_text.esc(word)}</span>`).join('')}</div>` : ''}
            <div class="rmt-memory-status ${pendingClass}">${core_text.esc(archive_snapshots.memoryStateLabel(state, settings.autoUpdates?.archive?.enabled))}</div>
            ${ready ? `<div class="rmt-archive-meta">上次归档：${core_text.esc(formatArchiveTime(memory.updatedAt || memory.createdAt))}</div>` : ''}
            ${ready ? memoryLockPanelHtml(memory) : ''}
          </div>
          <div class="rmt-current-archive-actions">
            <button type="button" class="rmt-btn" data-rmt-archive-read-drafts>读取已保存草稿（不生成）</button>
            <button type="button" class="rmt-btn" data-rmt-archive-import-draft>导入整理草稿</button>
            <button class="rmt-btn rmt-archive-update" type="button" data-rmt-action="import-memory" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || requirePreflight ? 'disabled' : ''}>${core_text.esc(requirePreflight ? '先扫描记忆 / 摘要' : (ready ? '增量更新当前窗口档案' : importLabel))}</button>
            ${ready ? `<button class="rmt-btn" type="button" data-rmt-action="full-rebuild-memory" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || requirePreflight ? 'disabled' : ''}>完全重建档案</button><button class="rmt-btn" type="button" data-rmt-action="current-archive-delete" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}>删除当前档案</button>` : ''}
          </div>
        </section>
        ${externalMemoryControls}
        <section class="rmt-archive-portals" aria-label="档案室内容入口">${portalHtml}</section>
        ${generationAction}
      </div>`;
    workspace_ui.arrangeArchiveWorkspace(body, { portals, ready });
    if (ui_workspaceState.workspace.tab === 'archive') void loadChooserArchiveRecovery(context);
    ui_settingsPanel.refreshSettingsMemoryStatus();
}

let heartOpenRequest = 0;

export function openCachedOrGenerate(mode, options = {}) {
    if (mode === 'journal') return handJournal.openHandJournal();
    if (['mirrorCall','mirrorVoice'].includes(mode)) return workspace_ui.openVoiceModule(mode);
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    if (options.incrementalSession) {
        const route = options.workspaceRoute || mode;
        ui_workspaceState.workspace.route = route; ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.empty = null;
        runtimeState.activeMode = mode; runtimeState.activeSession = options.incrementalSession;
        ui_workspaceState.prepareWorkspaceSession(mode, options.incrementalSession, route);
        return renderActive();
    }
    heart_reader.rememberHeartReader();
    const openRequest = ++heartOpenRequest;
    const route = options.workspaceRoute || mode;
    ui_workspaceState.workspace.route = route; ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.empty = null;
    const navigationEpoch = ui_workspaceState.workspace.epoch;
    if (runtimeState.activeArchiveSnapshot) {
        const snapshot = runtimeState.activeArchiveSnapshot;
        const stored = snapshot.cache || {};
        const cached = core_cache.loadSession(mode, { chatId: snapshot.chatId, memoryBank: snapshot.memory, cache: stored, clone: true, includePartial: true });
        const session = cached || (!stored[mode] ? emptyArchiveMode(mode, snapshot.memory, null, stored) : null);
        if (session) {
            runtimeState.activeMode = mode; runtimeState.activeSession = session;
            ui_workspaceState.prepareWorkspaceSession(mode, session, route);
        heart_reader.enterHeartReader(session, route); return renderActive();
        }
        return workspace_ui.showEmptyWorkspace(mode, { memory: snapshot.memory, stored: !!stored[mode] });
    }
    let context, memory;
    try { context = core_context.currentCharacterGuard(); memory = archive_repository.requireArchive(context); }
    catch {
        return workspace_ui.showEmptyWorkspace(mode, { noChat: !context });
    }
    // Hydrate before deciding whether a record is absent. A fresh empty page must never
    // become an overwrite route for an existing compressed/unreadable record.
    if (core_cache.isCompressedCacheRecord(context.chatMetadata?.[core_constants.CACHE_KEY])
        && !runtimeState.runtimeSessionCache.has(core_cache.cacheScopeFromContext(context))) {
        const origin = core_context.captureTaskOrigin(context, memory.archiveRevision);
        const priorMode = runtimeState.activeMode;
        return core_cache.ensureCacheHydrated(context).then(() => {
            if (openRequest !== heartOpenRequest || navigationEpoch !== ui_workspaceState.workspace.epoch || !core_context.isCurrentTaskOrigin(origin)
                || runtimeState.activeArchiveSnapshot || runtimeState.activeMode !== priorMode
                || document.getElementById(core_constants.OVERLAY_ID)?.hidden) return;
            return openCachedOrGenerate(mode, { workspaceRoute: route });
        }).catch(error => {
            if (openRequest === heartOpenRequest && navigationEpoch === ui_workspaceState.workspace.epoch) globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        });
    }
    const stored = core_cache.getCache(context);
    const cached = core_cache.loadSession(mode, { context, memoryBank: memory, clone: true, includePartial: true });
    const session = cached || (!stored?.[mode] ? emptyArchiveMode(mode, memory, context, stored) : null);
    if (session) {
        runtimeState.activeMode = mode; runtimeState.activeSession = session;
        ui_workspaceState.prepareWorkspaceSession(mode, session, route);
        heart_reader.enterHeartReader(session, route); return renderActive();
    }
    return workspace_ui.showEmptyWorkspace(mode, { memory, stored: !!stored?.[mode] });
}

export function renderActive() {
    const floorLive = !!document.querySelector('.rmt-floor-shell [data-rmt-floor-body][data-rmt-floor-live="1"]');
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!floorLive && (!overlay || overlay.hidden)) return;
    try {
        const scope = core_context.chatScopeKey(core_context.currentCharacterGuard());
        if (runtimeState.renderedChatScope && runtimeState.renderedChatScope !== scope) return;
    } catch { return; }
    if (['mirrorCall', 'mirrorVoice', 'journal'].includes(runtimeState.activeMode)) return;
    if (workspace_ui.renderEmptyWorkspace()) return;
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    runtimeState.contentManagerOpen = false;
    if (runtimeState.activeMode !== core_constants.MODE.ENDING) ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    if (!runtimeState.activeSession || !runtimeState.activeMode) return runtimeState.activeArchiveSnapshot ? archive_library.showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot) : showChooser();
    const supportsTopbarIncrement = !time_stories.isTimeStoryMode(runtimeState.activeMode) && ![core_constants.MODE.INBOX, core_constants.MODE.HEART, core_constants.MODE.THEME_SONG, 'pastLives', 'bedtime'].includes(runtimeState.activeMode) && (!core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) || runtimeState.activeMode === core_constants.MODE.PHONE);
    setRegenerateVisible((!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && supportsTopbarIncrement);
    setManageVisible(!(runtimeState.activeMode === core_constants.MODE.HEART && ui_workspaceState.workspace.route === 'language') && (!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && !time_stories.isTimeStoryMode(runtimeState.activeMode) && ![core_constants.MODE.RELATIONS, core_constants.MODE.INBOX, core_constants.MODE.THEME_SONG, 'pastLives', 'bedtime'].includes(runtimeState.activeMode));
    setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) ? '他的房间' : '当前档案');
    if (runtimeState.activeMode !== core_constants.MODE.ROOM) modes_room.stopRoomClock();
    if (runtimeState.activeMode !== core_constants.MODE.PHONE) ui_phoneView.stopPhoneClock();
    if (runtimeState.activeMode === 'bedtime') bedtime_view.renderBedtime();
    else if (runtimeState.activeMode === core_constants.MODE.BUTTERFLY) ui_butterflyView.renderButterfly();
    else if (runtimeState.activeMode === core_constants.MODE.ALBUM) ui_albumView.renderAlbum();
    else if (runtimeState.activeMode === core_constants.MODE.ADV) ui_advEventView.renderAdvMode();
    else if (runtimeState.activeMode === core_constants.MODE.ROOM) modes_room.renderRoom();
    else if (runtimeState.activeMode === core_constants.MODE.ITEMS) modes_items.renderItems();
    else if (runtimeState.activeMode === core_constants.MODE.CABINET) modes_cabinet.renderCabinet();
    else if (runtimeState.activeMode === core_constants.MODE.PHONE) ui_phoneView.renderPhone();
    else if (runtimeState.activeMode === core_constants.MODE.THEME_SONG) song_view.renderThemeSongs();
    else if (runtimeState.activeMode === core_constants.MODE.INBOX) ui_inboxView.renderInbox();
    else if (runtimeState.activeMode === core_constants.MODE.TRAVEL) ui_travelView.renderTravel();
    else if (runtimeState.activeMode === core_constants.MODE.ENDING) ui_endingView.renderEnding();
    else if (runtimeState.activeMode === core_constants.MODE.CALENDAR) ui_calendarView.renderCalendar();
    else if (runtimeState.activeMode === core_constants.MODE.RELATIONS) modes_relations.renderRelations();
    else if (runtimeState.activeMode === core_constants.MODE.ACHIEVEMENTS) modes_achievements.renderAchievements();
    else if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    else if (runtimeState.activeMode === 'pastLives') past_lives_view.renderPastLives();
    else if (time_stories.isTimeStoryMode(runtimeState.activeMode)) time_stories_view.renderTimeStories();
    const progress = runtimeState.activeSession?.readableProgress;
    if (progress?.version === 1 && progress.complete === false && bodyEl()) {
        const note = document.createElement('section');
        note.className = 'rmt-recovery-status';
        note.setAttribute('role', 'status');
        note.innerHTML = `<b>已生成部分内容 · 本次任务尚未完成</b><p>这里显示已收到的内容。后续失败或关闭页面，不会清除已保存部分；继续生成只补未完成部分。</p>${!runtimeState.activeArchiveSnapshot ? '<button type="button" class="rmt-btn" data-rmt-edit-partial>编辑已生成内容</button>' : ''}`;
        bodyEl().prepend(note);
    }
    const pageStatus = generation_status_view.routeGenerationStatus(ui_workspaceState.workspace.route || runtimeState.activeMode, runtimeState.activeMode, runtimeState.activeSession, { snapshot: runtimeState.activeArchiveSnapshot });
    if (['unsaved', 'failed', 'retry'].includes(pageStatus.state) && bodyEl() && !bodyEl().querySelector('.rmt-generation-completion,.rmt-recovery-status')) {
        const statusNote = document.createElement('section');
        statusNote.className = 'rmt-generation-completion';
        statusNote.innerHTML = `<h3>生成与补全</h3><p role="status">${core_text.esc(pageStatus.label)}</p>${!runtimeState.activeArchiveSnapshot ? '<button type="button" class="rmt-btn" data-rmt-action="tasks">打开任务中心</button>' : ''}`;
        bodyEl().prepend(statusNote);
    }
    cg_format_ui.mountCgFormatControl(bodyEl(), runtimeState.activeMode, ui_workspaceState.workspace.route, !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly);
    decorateReadOnlyModeUi();
    workspace_ui.syncWorkspaceChrome();
}

export async function deleteManagedCategory() {
    if (!runtimeState.activeMode || !archive_library.requireWritableArchiveAction()) return;
    const mode = runtimeState.activeMode;
    const label = core_constants.MODE_LABEL[mode] || mode;
    const cascade = mode === core_constants.MODE.ROOM ? [core_constants.MODE.ROOM, core_constants.MODE.ITEMS] : [mode];
    if (!confirmExplicitActionTwice(
        `删除整个「${label}」？`,
        `${mode === core_constants.MODE.ROOM ? '“他的物品”依赖房间结构，也会一起清除；私人终端保留。' : ''}只删除这些派生缓存，不删除正式档案 Mxxx 或聊天正文。`,
        { destructive: true },
    )) return;
    try {
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        await core_cache.deleteSessions(cascade, expectedChatId);
        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        runtimeState.contentManagerOpen = false;
        globalThis.toastr?.success?.(`已删除整个分类：${label}`, '心迹回廊');
        showChooser();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    }
}

export function handleOverlayClick(event) {
    if (event.target.closest?.('[data-rmt-cg-history-step]')) { event.preventDefault(); event.stopPropagation(); return void generation_imageGeneration.handleCgHistorySwitch(event); }
    const moreTrigger = event.target.closest?.('[data-rmt-action="toolbar-more"]');
    const overlay = event.currentTarget?.querySelector ? event.currentTarget : document.getElementById(core_constants.OVERLAY_ID);
    if (moreTrigger) return toggleToolbarMoreMenu(overlay);
    const moreMenu = toolbarMoreMenu(overlay);
    if (!moreMenu?.hidden && !event.target.closest?.('[data-rmt-toolbar-more-menu]')) closeToolbarMoreMenu(overlay);
    else if (!moreMenu?.hidden && event.target.closest?.('[data-rmt-toolbar-more-menu] [data-rmt-action],[data-rmt-toolbar-more-menu] [data-reader],[data-rmt-toolbar-more-menu] [data-rmt-workspace-route]')) closeToolbarMoreMenu(overlay);
    if (dispatch_overlayClickTargets.overlayClickRecordTargets(event) !== OVERLAY_CLICK_UNHANDLED) return;
    if (dispatch_overlayClickTargets.overlayClickPageTargets(event) !== OVERLAY_CLICK_UNHANDLED) return;

    const actionEl = event.target.closest?.('[data-rmt-action]');
    const action = actionEl?.dataset?.rmtAction;
    if (!action) return;
    if (!action.startsWith('archive-inheritance-')) archive_inheritance_view.clearArchiveInheritancePreview();
    if (dispatch_overlayClickActions.overlayArchiveActions(actionEl, action) !== OVERLAY_CLICK_UNHANDLED) return;
    if (dispatch_overlayClickActions.overlayPageActions(actionEl, action) !== OVERLAY_CLICK_UNHANDLED) return;
}

export async function handleOverlayChange(event) {
    const dateInput = event.target.closest?.('[data-rmt-memory-date]');
    if (dateInput) return void applyMemoryPatch(dateInput.dataset.rmtMemoryDate, { date: dateInput.value });
    if (cg_format_ui.handleCgFormatChange(event)) return;
    if (workspace_ui.handleWorkspaceChange(event) || language_view.handleLanguageChange(event)) return;
    const advSelectEl = event.target.closest?.('[data-rmt-adv-select]');
    if (advSelectEl) return ui_advEventView.advSelect(advSelectEl.value);
    const historyToggle = event.target.closest?.('[data-rmt-memory-wi-history]');
    if (historyToggle) {
        const context = core_context.currentCharacterGuard();
        const selection = archive_repository.getMemoryWorldInfoSelection(context);
        const world = core_text.normalizeText(historyToggle.dataset.rmtMemoryWiHistory, 240);
        const previous = selection.books.find(book => book.name === world);
        if (!previous || runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) {
            historyToggle.checked = previous?.historySource === true; return;
        }
        archive_repository.updateMemoryWorldInfoBookSelection(context, world, { historySource: historyToggle.checked === true });
        const attempted = JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books);
        try { await archive_repository.syncSelectedWorldInfoHistoryLedger(context); }
        catch (error) {
            if (!error?.worldHistoryPersisted && JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books) === attempted) {
                archive_repository.setMemoryWorldInfoSelection(context, selection); historyToggle.checked = previous.historySource;
            }
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.('历史来源未同步，原有来源仍保留。', '心迹回廊');
        }
        return;
    }
    const allToggle = event.target.closest?.('[data-rmt-memory-wi-all]');
    if (allToggle) {
        const context = core_context.currentCharacterGuard();
        const expectedScopeKey = archive_repository.memorySourceScopeForContext(context).key;
        const world = core_text.normalizeText(allToggle.dataset.rmtMemoryWiAll, 240);
        const selection = archive_repository.getMemoryWorldInfoSelection(context);
        if (allToggle.checked && !selection.books.some(book => book.name === world) && selection.books.length >= core_constants.MAX_MEMORY_WORLD_INFO_BOOKS) {
            allToggle.checked = false;
            globalThis.toastr?.warning?.(`最多选择 ${core_constants.MAX_MEMORY_WORLD_INFO_BOOKS} 本记忆相关世界书。`, '心迹回廊');
            return;
        }
        archive_repository.updateMemoryWorldInfoBookSelection(context, world, { all: !!allToggle.checked, entryUids: [] });
        const section = allToggle.closest?.('[data-rmt-memory-wi-book]');
        const attemptedSelectionJson = JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books);
        refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey);
        try { await archive_repository.syncSelectedWorldInfoHistoryLedger(context); }
        catch (error) {
            if (!error?.worldHistoryPersisted
                && JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books) === attemptedSelectionJson) {
                archive_repository.setMemoryWorldInfoSelection(context, selection);
            }
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(`世界书选择没有同步，已恢复原选择：${core_text.toastText(core_text.safeErrorSummary(error))}`, '心迹回廊');
        } finally {
            refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey);
        }
        return;
    }
    const entryToggle = event.target.closest?.('[data-rmt-memory-wi-entry]');
    if (entryToggle) {
        const context = core_context.currentCharacterGuard();
        const expectedScopeKey = archive_repository.memorySourceScopeForContext(context).key;
        const world = core_text.normalizeText(entryToggle.dataset.rmtMemoryWiEntry, 240);
        const uid = core_text.normalizeText(entryToggle.dataset.rmtMemoryWiUid, 120);
        const selection = archive_repository.getMemoryWorldInfoSelection(context);
        const current = selection.books.find(item => item.name === world);
        if (entryToggle.checked && !current && selection.books.length >= core_constants.MAX_MEMORY_WORLD_INFO_BOOKS) {
            entryToggle.checked = false;
            globalThis.toastr?.warning?.(`最多选择 ${core_constants.MAX_MEMORY_WORLD_INFO_BOOKS} 本记忆相关世界书。`, '心迹回廊');
            return;
        }
        const set = new Set(current?.all ? [] : (current?.entryUids || []));
        if (entryToggle.checked && !set.has(uid) && set.size >= core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES) {
            entryToggle.checked = false;
            globalThis.toastr?.warning?.(`每次最多精确选择 ${core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES} 个世界书条目。`, '心迹回廊');
            return;
        }
        if (entryToggle.checked) set.add(uid); else set.delete(uid);
        archive_repository.updateMemoryWorldInfoBookSelection(context, world, { all: false, entryUids: [...set] });
        const attemptedSelectionJson = JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books);
        const section = entryToggle.closest?.('[data-rmt-memory-wi-book]');
        refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey);
        try { await archive_repository.syncSelectedWorldInfoHistoryLedger(context); }
        catch (error) {
            if (!error?.worldHistoryPersisted
                && JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books) === attemptedSelectionJson) {
                archive_repository.setMemoryWorldInfoSelection(context, selection);
            }
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(`世界书选择没有同步，已恢复原选择：${core_text.toastText(core_text.safeErrorSummary(error))}`, '心迹回廊');
        } finally {
            refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey);
        }
        return;
    }
}
