import * as cg_format_ui from './cgFormatControl.js';
import * as heart_reader from './heartReaderState.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as archive_importRecovery from '../archive/importRecovery.js';
import * as core_cache from '../core/cache.js';
import * as core_archiveCover from '../core/archiveCover.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_theme from '../core/theme.js';
import * as generation_client from '../generation/client.js';
import * as generation_contentRegeneration from '../generation/contentRegeneration.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as cg_editor from './cgPromptEditor.js';
import * as participant_picker from './participantPicker.js';
import * as participant_contract from '../core/participants.js';
import * as image_viewer from './cgImageViewer.js';
import * as navigation_bookmark from './navigationBookmark.js';
import * as floating_archive from './floatingArchive.js';
import * as recovery_view from './recoveryView.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_phone from '../modes/phone.js';
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
import * as song_contract from '../core/themeSongContract.js';
import * as ui_inboxView from './inboxView.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_pastLives from '../modes/pastLives.js';
import * as ui_travelView from './travelView.js';
import * as ui_settingsPanel from './settingsPanel.js';
import * as home_view from './homeView.js';
import * as past_lives_view from './pastLivesView.js';
import * as time_stories_view from './timeStoriesView.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as modes_timeStories from '../modes/timeStories.js';
import * as ui_styles from './styles.js';
import * as workspace_ui from './workspace.js';
import * as language_view from './languageView.js';
import * as ui_workspaceState from './workspaceState.js';

export function isArchiveMobileViewport() {
    try {
        return !!globalThis.matchMedia?.('(max-width: 1000px)')?.matches || Number(globalThis.navigator?.maxTouchPoints || 0) > 0;
    } catch {
        return false;
    }
}

export function archiveMobileSafeTopFallback(navigatorLike = globalThis.navigator) {
    const userAgent = String(navigatorLike?.userAgent || '');
    const platform = String(navigatorLike?.platform || '');
    const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
    const iosDevice = /iP(?:hone|ad|od)/i.test(userAgent) || /iP(?:hone|ad|od)/i.test(platform);
    const ipadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;
    // Some iOS one-click/WebView builds render edge-to-edge but expose every env(safe-area-*)
    // value as zero. Keep the code-owned close control below the system status touch region.
    return iosDevice || ipadDesktopMode ? 52 : 0;
}

export function applyArchiveMobileSafeArea(overlay) {
    if (!overlay?.style) return;
    let ttEnabled = false;
    try { ttEnabled = core_settings.getPluginSettings(core_context.getContext()).ttDisplayMode === true; } catch {}
    overlay.classList?.toggle?.('rmt-tt-display', ttEnabled);
    const fallback = ttEnabled && isArchiveMobileViewport() ? archiveMobileSafeTopFallback() : 0;
    overlay.style.setProperty('--rmt-mobile-safe-top', `${fallback}px`);
}

export function overlayCloseButtonFromEvent(event, overlay) {
    const selector = '.rmt-topbar > button[data-rmt-action="close"]';
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    let button = path.find(node => node?.matches?.(selector)) || null;
    if (!button) button = event?.target?.closest?.(selector) || null;
    if (!button || (typeof overlay?.contains === 'function' && !overlay.contains(button))) return null;
    return button;
}

export function closeArchiveOverlayFromUser() {
    if (image_viewer.closeCgImageViewer()) return;
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay || overlay.hidden) return closeOverlay();
    // Closing this reversible view is not cancelling a task. Native confirm may return
    // false without displaying UI in a WebView; it must never trap the modal on screen.
    if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
    if (core_requestCoordinator.hasAnyTask()) globalThis.toastr?.info?.('当前任务会继续在后台运行，完成后会通知你。', '心迹回廊');
    return closeOverlay();
}

export function bindOverlayCloseFallback(overlay) {
    if (!overlay || overlay.dataset.rmtEarlyCloseBound === 'true') return;
    let lastCloseAt = 0;
    const earlyHandler = event => {
        const button = overlayCloseButtonFromEvent(event, overlay);
        if (!button || overlay.hidden) return;
        if (event.type === 'pointerdown' && (Number(event.button ?? 0) !== 0 || event.isPrimary === false)) return;
        const now = Date.now();
        if (now - lastCloseAt < 500) return;
        lastCloseAt = now;
        // Limit interception to the code-owned topbar close button. This prevents click-through
        // without restoring the old document-wide mobile gesture blocker.
        event.preventDefault?.();
        event.stopPropagation?.();
        closeArchiveOverlayFromUser();
    };
    overlay.addEventListener('pointerdown', earlyHandler, true);
    overlay.addEventListener('touchstart', earlyHandler, { capture: true, passive: false });
    overlay.dataset.rmtEarlyCloseBound = 'true';
}

export function revealArchiveOverlay(overlay) {
    if (!overlay) return;
    overlay.hidden = false;
    overlay.removeAttribute('aria-hidden');
    if (typeof globalThis.HTMLDialogElement === 'function' && overlay instanceof globalThis.HTMLDialogElement) {
        if (!overlay.open) {
            try { overlay.showModal(); }
            catch {
                try { overlay.setAttribute('open', ''); } catch {}
            }
        }
    }
}

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
              <button type="button" data-rmt-action="back" hidden aria-label="返回上级">‹</button>
              <div class="rmt-topbar-title">心迹回廊</div>
              <button type="button" data-rmt-action="library-home" aria-label="打开档案室" title="档案室"><i class="fa-regular fa-folder" aria-hidden="true"></i></button>
              <button type="button" data-rmt-action="workspace-expand" aria-label="展开窗口" title="展开窗口"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
              <button type="button" data-rmt-action="regenerate" hidden aria-label="增量追加" title="增量追加">＋</button>
              <button type="button" data-rmt-action="manage" hidden aria-label="管理" title="管理">⋯</button>
              <button type="button" data-rmt-action="close" aria-label="关闭档案室">×</button>
            </div>
            ${workspace_ui.workspaceNavHtml()}
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
    applyArchiveMobileSafeArea(overlay);
    try { core_theme.applyThemeToElement(overlay, core_settings.getPluginSettings(core_context.getContext())); } catch {}
    bindOverlayCloseFallback(overlay);
    revealArchiveOverlay(overlay);
    workspace_ui.syncWorkspaceChrome();
    return overlay;
}

export function closeOverlay() {
    participant_picker.closeParticipantPicker();
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    // Mobile close gestures can deliver both an early event and a click. Only
    // the first close records the page; later events must not replace it.
    if (overlay && !overlay.hidden) {
        floating_archive.rememberFloatingArchive();
        navigation_bookmark.rememberReadingPosition();
    }
    ui_workspaceState.leaveWorkspaceReader();
    cg_editor.closeCgPromptEditor({ restoreFocus: false });
    modes_room.stopRoomClock();
    ui_phoneView.stopPhoneClock();
    ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    if (overlay) {
        if (typeof globalThis.HTMLDialogElement === 'function' && overlay instanceof globalThis.HTMLDialogElement && overlay.open) {
            try { overlay.close(); } catch {}
        }
        overlay.hidden = true;
        const body = overlay.querySelector('.rmt-body');
        if (body) body.replaceChildren();
    }
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    runtimeState.contentManagerOpen = false;
    floating_archive.refreshFloatingArchive();
}

export function bodyEl() {
    return document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-body`);
}

export function topTitle(text) {
    const el = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
    if (el) el.textContent = text || '心迹回廊';
    workspace_ui.syncWorkspaceChrome();
}

export function setBackVisible(visible, label = '返回上级') {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="back"]`);
    if (!button) return;
    button.hidden = !visible;
    button.textContent = '‹';
    button.title = label;
    button.setAttribute('aria-label', label);
}

export function navigateBack() {
    if (image_viewer.closeCgImageViewer()) return;
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

export function setManageVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="manage"]`);
    if (button) button.hidden = !visible;
}

export function setRegenerateVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="regenerate"]`);
    if (button) {
        button.hidden = !visible;
        button.textContent = '＋';
        button.setAttribute('aria-label', '增量追加');
    }
}

export function confirmExplicitAction(title, detail, { destructive = false, unavailableFallback = false } = {}) {
    const prefix = destructive ? '⚠️ ' : '';
    const message = `${prefix}${core_text.normalizeText(title, 160)}\n\n${core_text.normalizeText(detail, 1200)}\n\n确定继续吗？`;
    try {
        if (typeof globalThis.confirm === 'function') return globalThis.confirm(message);
    } catch (error) {
        console.warn('[HeartbeatMemories] native confirmation unavailable', core_text.safeErrorDiagnostic(error));
    }
    if (unavailableFallback) {
        globalThis.toastr?.warning?.('当前环境无法显示系统确认框；已按你的关闭操作退出档案室。正在运行的任务仍留在当前网页后台，刷新网页会中断它。', '心迹回廊');
        return true;
    }
    globalThis.toastr?.warning?.('当前环境无法显示确认提示。为避免误操作，本次操作已取消。', '心迹回廊');
    return false;
}

export function confirmExplicitActionTwice(title, detail, { destructive = false } = {}) {
    const safeTitle = core_text.normalizeText(title, 160);
    const safeDetail = core_text.normalizeText(detail, 1200);
    if (!confirmExplicitAction(`第一次确认 · ${safeTitle}`, safeDetail, { destructive })) return false;
    return confirmExplicitAction(
        `第二次确认 · ${safeTitle}`,
        `这是最后确认。${safeDetail}

确认后立即执行，不能通过“取消”恢复已经完成的删除或替换。`,
        { destructive },
    );
}

export function confirmModeRegeneration(mode) {
    const label = core_constants.MODE_LABEL[mode] || mode || '当前内容';
    if ([core_constants.MODE.ROOM, core_constants.MODE.ITEMS].includes(mode)) return confirmExplicitAction(
        '追加「' + label + '」？',
        '会调用模型，优先同步新增记忆，也可按明确人设补充普通生活物件。旧房间、旧物件和旧台词保留；推演内容不成为真实共同往事，也不会写入聊天档案。',
        { destructive: false },
    );
    if (core_constants.CREATIVE_EXPANSION_MODES.includes(mode) || mode === core_constants.MODE.CABINET) return confirmExplicitAction(
        '基于当前档案追加「' + label + '」？',
        '有新记忆时优先使用新记忆；没有新记忆也可以扩写新镜头或新视角。会调用模型，旧内容与图片保留，不更新正式记忆、不新增已发生的剧情。完全重复或没有有效证据的结果不会收录。',
        { destructive: false },
    );
    if (mode === core_constants.MODE.CALENDAR) {
        return confirmExplicitAction(
            '刷新「两个人的日历」？',
            '这会重新整理“已约定 · 未发生”和“未来 · 世界设定”，并重新从当前档案生成“已经度过”的日期索引。它不会新增剧情、不会把未来设定写成已发生事实，也不会修改聊天档案。',
            { destructive: false },
        );
    }
    return confirmExplicitAction(
        `从新增档案追加「${label}」？`,
        `这次只消费这一项尚未使用的新档案记忆，并在现有内容后追加；旧篇章、旧台词、旧 ADV EVENT、旧图片引用和当前选择都保持不变。若没有新增记忆，不会调用模型。当前聊天档案本身不会被修改。`,
        { destructive: false },
    );
}

export function confirmRoomLifeRefresh() {
    return confirmExplicitActionTwice(
        '更新今日生活？',
        '这会重新生成今天的房间生活状态并替换当前“今日生活”缓存；聊天档案和房间主体不会被修改。',
        { destructive: true },
    );
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

export async function requestParticipantSelection() {
    if (!archive_library.requireWritableArchiveAction()) return false;
    const context = core_context.currentCharacterGuard();
    const scope = core_context.chatScopeKey(context);
    const assertCurrent = () => {
        if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    };
    return participant_picker.showParticipantPicker({ context,
        onConfirm: async (roster, expectedRevision) => {
            assertCurrent();
            const previous = core_cache.readParticipantRoster(context);
            const tasks = core_requestCoordinator.queryParticipantGenerationTasks(context).filter(task => !task.parentTaskId);
            const bank = archive_repository.getImportedMemory(context);
            if (!bank && !tasks.length) {
                await core_cache.commitParticipantRoster(context, roster, { expectedRevision });
                globalThis.toastr?.success?.('人物选择已暂存；建档时会随本次任务输入保存。', '心迹回廊');
                return true;
            }
            if (JSON.stringify(previous) === JSON.stringify(roster)) return true;
            const appended = participant_contract.appendParticipantSelection(previous, roster);
            const scopes = bank ? participantRegenerationScopes() : [{ id: 'archiveImport', label: '重新生成本次人物档案' }];
            const decision = await participant_picker.chooseParticipantChange({ context, tasks, scopes,
                appendedNames: participant_contract.selectedParticipantSnapshot(appended).people.map(person => person.name),
                selectedNames: participant_contract.selectedParticipantSnapshot(roster).people.map(person => person.name),
            });
            if (!decision || decision.action === 'continue') return false;
            assertCurrent();
            if (decision.action === 'append') {
                await core_cache.commitParticipantRoster(context, appended, { expectedRevision });
                globalThis.toastr?.success?.('追加名单已保存；已有内容保留。需要新内容时，请在对应页面点击生成。', '心迹回廊');
                return true;
            }
            if (!roster.selectedIds.length) throw new Error('请先选好要加入回廊的人物，再开始生成。');
            await runParticipantRegeneration({ context, roster, expectedRevision, pages: decision.pages, tasks, assertCurrent });
            return true;
        },
    });
}

export function participantRegenerationScopes() {
    return [
        ['archiveProfile', '档案名称与简介（不重抽记忆）'], ['room', '他的房间'], ['roomLife', '今日生活'],
        ['items', '他的物品'], ['phone', '他的私人终端'], ['inbox', '你的邮箱'], ['themeSong', '角色印象曲'],
        ['album', '回忆相簿'], ['adv', 'ADV EVENT'], ['cabinet', '两个人的陈列柜'], ['travel', '他的出行路线'],
        ['language', '基础语言'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬'],
        ['strips', '日常一格'], ['fireflies', '萤火虫栖息地'], ['postending', '未来／后日谈'],
        ['ending', 'ENDING'], ['calendar', '两个人的日历'], ['relations', '人际庭园'],
        ['achievements', '成就库'], ['butterfly', '蝴蝶效应'], ['pastLives', '前世今生'], ['timeEcho', '时空回响'],
    ].map(([id, label]) => ({ id, label }));
}

export async function runParticipantRegeneration({ context, roster, expectedRevision, pages, tasks, assertCurrent }) {
    const labels = new Map([...participantRegenerationScopes(), { id: 'archiveImport', label: '人物档案' }].map(page => [page.id, page.label]));
    const before = archive_repository.getImportedMemory(context);
    const origin = core_context.captureTaskOrigin(context, before?.archiveRevision || '');
    const plan = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'participant-plan', context, origin,
        pageIds: pages, label: '按所选人物重做：' + pages.map(page => labels.get(page) || page).join('、') });
    let outcome = { status: 'failed' };
    const results = [];
    try {
        // Stop the old tasks listed in the user's confirmation. The new page
        // selection controls what to generate next, not which old task survives.
        const ids = tasks.map(task => task.id);
        await core_requestCoordinator.cancelParticipantGenerationTasks(ids);
        assertCurrent();
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(plan);
        const bank = archive_repository.getImportedMemory(context);
        const version = bank ? await core_cache.saveArchiveVersion(context, {
            reason: '人物名单变更前', selectedPages: pages, expectedRosterRevision: expectedRevision, parkDrafts: true,
        }) : null;
        assertCurrent();
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(plan);
        const saved = await core_cache.commitParticipantRoster(context, roster, { expectedRevision });
        const participantSnapshot = participant_contract.selectedParticipantSnapshot(saved);
        for (const pageId of pages) {
            assertCurrent();
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(plan);
            const options = { background: true, logicalParentTaskId: plan.id,
                participantRegeneration: { versionId: version?.versionId || '', pageId, participantSnapshot } };
            let result;
            try {
                if (pageId === 'archiveImport') result = await archive_repository.restartCurrentArchiveImport({ participantRoster: saved, logicalParentTaskId: plan.id });
                else if (pageId === 'archiveProfile') result = await archive_repository.rewriteCurrentArchiveVerdict(options);
                else if (pageId === 'roomLife') result = await modes_room.ensureRoomLifePlan({ ...options, force: true });
                else if (['language','spring','summer','autumn','winter','strips','fireflies','postending'].includes(pageId)) result = await modes_heart.regenerateHeartPage(pageId, options);
                else result = await generation_client.generateMode(pageId, { ...options, replaceExisting: true });
                core_requestCoordinator.assertLogicalGenerationTaskCurrent(plan);
                results.push({ pageId, status: result?.status || 'unconfirmed' });
            } catch (error) {
                core_requestCoordinator.assertLogicalGenerationTaskCurrent(plan);
                results.push({ pageId, status: 'failed', message: core_text.safeErrorSummary(error) });
            }
        }
        outcome = { status: results.every(row => row.status === 'committed') ? 'committed' : 'partial', results };
        const message = results.map(row => `${labels.get(row.pageId) || row.pageId}：${row.status === 'committed' ? '已保存' : row.status === 'deferred' ? '已生成，等待回原窗口保存' : row.status === 'cancelled' ? '已中断，旧内容保留' : '未完成，旧内容保留'}${row.message ? '（' + row.message + '）' : ''}`).join('\n');
        globalThis.toastr?.[outcome.status === 'committed' ? 'success' : 'warning']?.(message, '心迹回廊 · 本次重做结果');
        return outcome;
    } catch (error) {
        outcome = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', results };
        throw error;
    } finally {
        core_requestCoordinator.finishLogicalGenerationTask(plan, outcome);
    }
}

export async function requestParticipantVersions() {
    const context = core_context.currentCharacterGuard();
    const scope = core_context.chatScopeKey(context);
    const versions = await core_cache.listArchiveVersions(context);
    if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) return false;
    return participant_picker.showParticipantVersions({ context, versions,
        onOpen: version => archive_library.openArchiveVersion(version.versionId, context)
            .catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊')),
    });
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

export function formatArchiveTime(value) {
    const time = Number(value) || 0;
    if (!time) return '未记录';
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date(time));
    } catch {
        return new Date(time).toLocaleString();
    }
}

function calendarQuickAccessHtml({ ready = false, generated = false, generating = false, partial = false, readOnly = false } = {}) {
    const status = !ready
        ? '先建立当前聊天档案后，就可以整理日历。'
        : partial ? '已整理部分内容 · 可以先打开查看'
        : generating
            ? (generated ? '正在刷新 · 旧日历仍可查看' : '正在整理日历…')
            : generated
                ? '已整理：已度过 / 已约定未发生 / 未来世界设定'
                : (readOnly ? '这份档案还没有整理日历。' : '还没有整理。日历不会自动把未来设定写成已发生。');
    const openButton = generated
        ? `<button type="button" class="rmt-btn rmt-calendar-quick-primary" data-rmt-mode="${core_text.esc(core_constants.MODE.CALENDAR)}">打开日历</button>`
        : '';
    const generateButton = !readOnly
        ? `<button type="button" class="rmt-btn" data-rmt-generate-mode="${core_text.esc(core_constants.MODE.CALENDAR)}" ${generated ? 'data-rmt-regenerate="true"' : ''} ${!ready || generating ? 'disabled' : ''}>${generating ? '生成中…' : generated ? '刷新日历' : '生成日历'}</button>`
        : '';
    return `<section class="rmt-calendar-quick ${generated ? 'ready' : 'empty'}">
      <div class="rmt-calendar-quick-icon"><i class="fa-solid fa-calendar"></i></div>
      <div class="rmt-calendar-quick-copy"><span>RELATIONSHIP CALENDAR</span><b>两个人的日历</b><small>${core_text.esc(status)}</small></div>
      <div class="rmt-calendar-quick-actions">${openButton}${generateButton}</div>
    </section>`;
}

// Update only the recovery area: do not reset sources, inputs, scroll position
// or a reader the user has already opened while local storage was being read.
export async function loadChooserArchiveRecovery(context = core_context.getContext(), { showEmpty = false } = {}) {
    const body = bodyEl();
    const region = body?.querySelector?.('[data-rmt-archive-recoveries]');
    if (!region || ui_workspaceState.workspace.tab !== 'archive') return;
    const epoch = ui_workspaceState.workspace.epoch;
    let origin;
    try { origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || ''); }
    catch { return; } // The live chat may have closed before this view action ran.
    const stillVisible = () => epoch === ui_workspaceState.workspace.epoch
        && ui_workspaceState.workspace.tab === 'archive' && runtimeState.archiveViewLevel === 'chooser'
        && !runtimeState.activeMode && !runtimeState.activeArchiveSnapshot
        && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
        && bodyEl()?.querySelector?.('[data-rmt-archive-recoveries]') === region
        && core_context.isCurrentTaskOrigin(origin)
        && (archive_repository.getImportedMemory(core_context.getContext())?.archiveRevision || '') === origin.archiveRevision;
    const banners = () => recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveImportRecoverySummary(context))
        + recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveProfileRecoverySummary(context), { profile: true });
    const status = message => `<p role="status">${core_text.esc(message)}</p>`;
    region.setAttribute('aria-busy', 'true');
    region.innerHTML = banners() + status('正在读取本机整理草稿…不会请求模型。');
    try {
        await archive_repository.hydrateCurrentArchiveRecovery(context, { force: showEmpty });
        if (!stillVisible()) return;
        const html = banners();
        region.innerHTML = html || (showEmpty ? status('本机未找到这条聊天的整理草稿；原档案未修改。旧版导出的成果文件可从下方导入。') : '');
    } catch (error) {
        if (!stillVisible()) return;
        region.innerHTML = banners() + `<section class="rmt-recovery-status" role="status"><b>本机草稿读取未完成</b><p>${core_text.esc(error?.code === 'RMT_ARCHIVE_DRAFT_CONFLICT' ? '本机版本已变化，未覆盖任何记录。请先导出本页成果，再重新打开原聊天读取。' : '不能认定没有记录；原记录未修改，也没有请求模型。可重新读取；存储恢复前请勿清数据或重做。')}</p><button type="button" class="rmt-btn" data-rmt-archive-read-drafts>重新读取本机草稿</button></section>`;
    } finally {
        if (stillVisible()) region.setAttribute('aria-busy', 'false');
    }
}

export function readableModePortals(portals, options = {}) {
    return portals.map(portal => ({ ...portal, session: core_cache.loadSession(portal.mode, { ...options, includePartial: true }) || portal.session }));
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
    topTitle(anyRunning ? `心迹回廊 · 档案室 · ${runtimeState.busy ? '档案整理中' : `${concurrentLabels.length}项生成中`}` : `心迹回廊 · 档案室${ready ? ` · ${archiveName}` : ''}`);
    const busyBanner = anyRunning ? `<div class="rmt-task-banner"><span class="rmt-task-dot"></span><div><b>${runtimeState.busy ? '档案整理进行中' : `${concurrentLabels.length} 项后台生成中`}</b><small>${core_text.esc(runtimeState.busy ? (runtimeState.activeTaskLabel || '正在整理聊天档案…') : concurrentLabels.join(' · '))}</small></div></div>` : '';
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
        ${busyBanner}
        <div data-rmt-archive-recoveries aria-live="polite">
        <div data-rmt-archive-recoveries>${recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveImportRecoverySummary(context))}
        ${recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveProfileRecoverySummary(context), { profile: true })}</div>
        </div>
        <div data-rmt-generation-recoveries>${ready ? recovery_view.recoveryBannerHtml(core_cache.getCache(context), memory) : ''}</div>
        <div data-rmt-calendar-quick>${calendarQuick}</div>
        <section class="rmt-memory-gate rmt-archive-card">
          <div class="rmt-memory-gate-text">
            <div class="rmt-archive-kicker">PRIVATE MEMORY ARCHIVE</div>
            <strong class="rmt-archive-title">${core_text.esc(archiveName)}</strong>
            ${ready ? core_archiveCover.archiveCoverHtml(memory, { writable: true, busy: anyRunning }) : `<div class="rmt-archive-summary">${core_text.esc(archiveSummary)}</div>`}
            ${keywords.length ? `<div class="rmt-archive-keywords">${keywords.map(word => `<span>${core_text.esc(word)}</span>`).join('')}</div>` : ''}
            <div class="rmt-memory-status ${pendingClass}">${core_text.esc(archive_snapshots.memoryStateLabel(state, settings.autoUpdates?.archive?.enabled))}</div>
            ${ready ? `<div class="rmt-archive-meta">上次归档：${core_text.esc(formatArchiveTime(memory.updatedAt || memory.createdAt))}</div>` : ''}
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

export function showLoading(text) {
    topTitle('心迹回廊');
    setRegenerateVisible(false);
    setManageVisible(false);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>${core_text.esc(text)}</b><div class="rmt-loading-actions"><button type="button" class="rmt-btn" data-rmt-action="home">返回档案室</button><button type="button" class="rmt-btn" data-rmt-action="close">关闭</button></div></div></div>`;
}

export function showError(message, mode) {
    runtimeState.activeMode = mode || runtimeState.activeMode;
    topTitle('心迹回廊 · 生成失败');
    setRegenerateVisible(!!runtimeState.activeMode);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-error" role="alert"><div><b>本次生成未完成</b><div style="margin:10px 0;white-space:pre-wrap">${core_text.esc(message)}</div><button type="button" class="rmt-btn" data-rmt-action="regenerate">重试本次生成 / 追加</button></div></div>`;
}

export function showMemoryImportError(message) {
    topTitle('心迹回廊 · 档案整理失败');
    setRegenerateVisible(false);
    setManageVisible(false);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-error"><div><b>当前聊天档案整理失败</b><div style="margin:10px 0;white-space:pre-wrap;opacity:.78">${core_text.esc(message)}</div><button type="button" class="rmt-btn" data-rmt-action="import-memory">重新整理档案</button><button type="button" class="rmt-btn" data-rmt-action="home" style="margin-left:8px">返回</button></div></div>`;
}

export function updateBackgroundTaskLabel(text) {
    const label = core_text.normalizeText(text, 240);
    const title = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
    if (title && !runtimeState.activeMode) title.textContent = '心迹回廊 · 档案室 · 后台整理中';
    const banner = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-task-banner small`);
    if (banner) banner.textContent = `${label} · 可以关闭档案室继续聊天。`;
}

export function setBusyUi(isBusy, text = '') {
    const requestSelectors = [
        '[data-rmt-action="import-memory"]',
        '[data-rmt-action="full-rebuild-memory"]',
        '[data-rmt-action="regenerate"]',
        '[data-rmt-action="manage"]',
        '[data-rmt-action^="manage-"]',
        '[data-rmt-action="read-adv"]',
        '[data-rmt-action="room-life-refresh"]',
        '[data-rmt-generate-mode]',
        '[data-rmt-action="read-memory-plugins"]',
    ].join(',');
    document.querySelectorAll(requestSelectors).forEach(el => { el.disabled = !!isBusy; });
    if (isBusy && text) {
        const title = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
        if (title && !runtimeState.activeMode) title.textContent = '心迹回廊 · 档案室 · 后台生成中';
    }
    ui_settingsPanel.refreshSettingsMemoryStatus();
}

export function setInnerLoading(show, text = '') {
    const body = bodyEl();
    if (!body) return;
    let layer = body.querySelector('.rmt-inline-status');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'rmt-inline-status';
        body.appendChild(layer);
    }
    layer.hidden = !show;
    layer.textContent = text;
}

export function refreshArchiveTargetSnapshotView(entryId = '') {
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (!snapshot || runtimeState.archiveViewLevel !== 'snapshot' || runtimeState.activeMode || runtimeState.activeSession) return false;
    if (entryId && core_context.archiveIndexEntryId(snapshot) !== core_text.normalizeText(entryId, 120)) return false;
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay || overlay.hidden) return false;
    archive_library.showIndexedArchiveSnapshot(snapshot);
    return true;
}

export function showInlineError(message) {
    const detail = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-event-detail`) || bodyEl();
    if (!detail) return;
    let box = detail.querySelector('.rmt-inline-error');
    if (!box) {
        box = document.createElement('div');
        box.className = 'rmt-inline-error';
        detail.prepend(box);
    }
    box.textContent = message;
    if (runtimeState.activeMode) {
        const context = core_context.getContext();
        const snapshot = runtimeState.activeArchiveSnapshot;
        const bank = snapshot?.memory || archive_repository.getImportedMemory(context);
        const all = snapshot?.cache || core_cache.getCache(context);
        const host = document.createElement('div');
        host.innerHTML = recovery_view.recoveryBannerHtml({ ...all, __generationRecoveryV1: { [runtimeState.activeMode]: all?.__generationRecoveryV1?.[runtimeState.activeMode] } }, bank, { readOnly: snapshot?.backupOnly });
        box.appendChild(host);
    }
}

function emptyArchiveMode(mode, memory, context, stored) {
    if (mode === core_constants.MODE.INBOX) return modes_inbox.emptyInbox(memory, context);
    if (mode === core_constants.MODE.PAST_LIVES) return modes_pastLives.emptyPastLives(memory, context);
    // Opening an empty reader is free. An unreadable existing record is not an
    // empty reader and never grants permission to overwrite saved material.
    if (stored?.[mode]) return null;
    if (mode === core_constants.MODE.THEME_SONG) return song_contract.emptyThemeSongs(memory, context ? core_context.currentCharacterRuntimeKey(context) : '');
    if (mode === core_constants.MODE.HEART) return modes_heart.makeHeartShell(memory);
    if (time_stories.isTimeStoryMode(mode)) return modes_timeStories.emptyTimeStories(mode, memory, context);
    if (mode === core_constants.MODE.PHONE) return ui_phoneView.emptyPhone(memory, context);
    return null;
}

let heartOpenRequest = 0;
export function openCachedOrGenerate(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
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

export function decorateReadOnlyModeUi() {
    if (!runtimeState.activeArchiveSnapshot) return;
    const body = bodyEl();
    if (!body || body.querySelector('[data-rmt-readonly-toggle]')) return;
    const control = document.createElement('div');
    control.className = 'rmt-archive-readonly-control';
    control.innerHTML = `<label><input type="checkbox" data-rmt-readonly-toggle ${runtimeState.activeArchiveReadOnly ? 'checked' : ''}> 只读查看</label>`;
    body.prepend(control);
}

export async function refreshArchiveRecoveryView() {
    const host = document.getElementById(core_constants.OVERLAY_ID), body = bodyEl();
    if (!host || host.hidden || !body || runtimeState.activeArchiveSnapshot) return false;
    const context = core_context.getContext(), scope = core_context.chatScopeKey(context);
    const reader = body.querySelector('[data-rmt-archive-draft-reader]');
    if (reader) {
        const draftId = reader.getAttribute('data-rmt-archive-draft-reader');
        const record = await archive_repository.readCurrentArchiveRecoveryDraft(draftId, context);
        if (bodyEl() !== body || body.querySelector('[data-rmt-archive-draft-reader]') !== reader
            || host.hidden || core_context.chatScopeKey(core_context.getContext()) !== scope) return false;
        const scrollTop = body.scrollTop;
        body.innerHTML = archive_library.archiveRecoveryDraftHtml(record);
        body.scrollTop = scrollTop;
        return true;
    }
    const banners = body.querySelector('[data-rmt-archive-recoveries]');
    if (!banners) return false;
    banners.innerHTML = recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveImportRecoverySummary(context))
        + recovery_view.archiveRecoveryHtml(archive_repository.getCurrentArchiveProfileRecoverySummary(context), { profile: true });
    return true;
}

export function refreshContentRegenerationDraftView(journal, context, { archiveTarget = null } = {}) {
    const host = document.getElementById(core_constants.OVERLAY_ID), body = bodyEl();
    const reader = body?.querySelector?.('[data-rmt-content-draft-reader]');
    if (!host || host.hidden || !reader || reader.getAttribute('data-rmt-content-draft-reader') !== journal?.draftId) return false;
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot ? !archiveTarget || snapshot.entryId !== archiveTarget.entryId
        : core_context.chatScopeKey(core_context.getContext()) !== core_context.chatScopeKey(context)) return false;
    const scrollTop = body.scrollTop;
    body.innerHTML = archive_library.contentRegenerationDraftHtml(journal);
    body.scrollTop = scrollTop;
    return true;
}

export async function refreshPartialGenerationView(mode, context, { draftId, pageId, archiveTarget = null, readerStillCurrent = null } = {}) {
    const host = document.getElementById(core_constants.OVERLAY_ID);
    if (!host || host.hidden) return false;
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.taskResultDraftId && snapshot.taskResultDraftId !== draftId) return false;
    if (snapshot && !snapshot.taskResultDraftId) {
        if (snapshot.historyVersionId || snapshot.backupOnly || !archiveTarget
            || snapshot.entryId !== archiveTarget.entryId
            || snapshot.memory?.archiveRevision !== archiveTarget.memory?.archiveRevision
            || core_context.comparableChatId(snapshot.chatId) !== core_context.comparableChatId(archiveTarget.chatId)) return false;
        snapshot.cache = structuredClone(archiveTarget.cache);
        if (!runtimeState.activeMode) {
            const scrollTop = bodyEl()?.scrollTop || 0;
            archive_library.showIndexedArchiveSnapshot(snapshot);
            if (bodyEl()) bodyEl().scrollTop = scrollTop;
            return true;
        }
    }
    if (!snapshot && core_context.chatScopeKey(context) !== core_context.chatScopeKey(core_context.getContext())) return false;
    if (!snapshot && !runtimeState.activeMode && runtimeState.archiveViewLevel === 'chooser') {
        if (ui_workspaceState.workspace.tab === 'content') {
            const scrollTop = bodyEl()?.scrollTop || 0;
            showChooser({ section: 'content' });
            if (bodyEl()) bodyEl().scrollTop = scrollTop;
        } else {
            // Archive source selections may be half edited. Refresh only the
            // received-content controls, leaving those inputs in place.
            const memory = archive_repository.getImportedMemory(context);
            const stored = core_cache.getCache(context);
            const recovery = bodyEl()?.querySelector?.('[data-rmt-generation-recoveries]');
            if (recovery) recovery.innerHTML = recovery_view.recoveryBannerHtml(stored, memory);
            const session = core_cache.loadSession(mode, { context, memoryBank: memory, includePartial: true });
            const portal = bodyEl()?.querySelector?.(`.rmt-archive-portal [data-rmt-mode="${mode}"]`)
                ?.closest?.('.rmt-archive-portal')
                || bodyEl()?.querySelector?.(`[data-rmt-generate-mode="${mode}"]`)?.closest?.('.rmt-archive-portal');
            if (session && portal) {
                portal.classList.remove('empty'); portal.classList.add('ready');
                const open = portal.querySelector('.rmt-portal-open');
                open.disabled = false; open.setAttribute('data-rmt-mode', mode);
                const status = portal.querySelector('.rmt-portal-status');
                if (status) status.textContent = '已生成部分内容 · 可以先查看';
                const dot = portal.querySelector('.rmt-portal-lock, .rmt-portal-ready-dot');
                if (dot) { dot.className = 'rmt-portal-ready-dot'; dot.textContent = '…'; }
            }
            if (mode === core_constants.MODE.CALENDAR) {
                const quick = bodyEl()?.querySelector?.('[data-rmt-calendar-quick]');
                if (quick) quick.innerHTML = calendarQuickAccessHtml({ ready: !!memory, generated: !!session,
                    generating: core_requestCoordinator.isModeGenerating(mode), partial: !!session?.readableProgress });
            }
        }
        return true;
    }
    if (runtimeState.activeMode !== mode) return false;
    const prior = runtimeState.activeSession;
    // A full-page/background task does not own every later reader of its mode.
    // An explicitly opened view of this very draft can keep receiving progress;
    // otherwise the caller's original reader and position must still be current.
    const ownsDraft = snapshot?.taskResultDraftId === draftId
        || (prior?.readableProgress?.complete === false && prior.readableProgress.draftId === draftId);
    if (prior?.readableProgress?.explicitDraft && !ownsDraft) return false;
    if (!ownsDraft && typeof readerStillCurrent === 'function' && !readerStillCurrent()) return false;
    if (mode === core_constants.MODE.HEART && pageId && pageId !== 'heart') {
        const shownPage = ui_workspaceState.workspace.route === 'heart'
            ? heart_reader.heartReaderSession(prior)?.selectedSeason || 'spring' : ui_workspaceState.workspace.route;
        if (shownPage !== pageId) return false;
    }
    let memory, stored;
    if (snapshot?.taskResultDraftId) {
        const result = await core_cache.readGenerationTaskResult(context, draftId);
        if (runtimeState.activeArchiveSnapshot !== snapshot || runtimeState.activeSession !== prior
            || runtimeState.activeMode !== mode || host.hidden) return false;
        memory = result.sourceMemory;
        stored = { chatId: memory.chatId, archiveRevision: memory.archiveRevision, [mode]: result.session };
        snapshot.memory = structuredClone(memory); snapshot.cache = structuredClone(stored);
    } else if (snapshot) {
        memory = snapshot.memory; stored = snapshot.cache;
    } else {
        memory = archive_repository.getImportedMemory(context); stored = core_cache.getCache(context);
    }
    const exactResult = prior?.readableProgress?.explicitDraft ? stored?.[core_cache.GENERATION_DRAFTS_CACHE_KEY]?.records?.[prior.readableProgress.draftId]?.result : null;
    const session = exactResult ? core_cache.generationTaskResultSession({ draftId: prior.readableProgress.draftId, ...exactResult })
        : core_cache.loadSession(mode, { context, chatId: memory?.chatId, memoryBank: memory, cache: stored, clone: true, includePartial: true });
    if (!session?.readableProgress) return false;
    if (!snapshot && !exactResult && stored?.[core_cache.GENERATION_DRAFTS_CACHE_KEY]?.records?.[draftId]?.result?.sourceMemory?.archiveRevision !== memory?.archiveRevision) return false;
    for (const key of ['selectedId', 'selectedEntryId', 'selectedContainerId', 'selectedNodeId', 'category', 'page', 'viewPath',
        'selectedMonth', 'selectedDateKey', 'view', 'tab', 'reading', 'dialogueIndex', 'sharedMemory',
        'selectedSeason', 'selectedVoiceId', 'selectedScenarioId', 'selectedStripId', 'selectedFireflyId', 'selectedDramaKey']) {
        if (prior && Object.hasOwn(prior, key)) session[key] = structuredClone(prior[key]);
    }
    const body = bodyEl(), scrollTop = body?.scrollTop || 0;
    // The generation caller uses this reference to recognize its original
    // foreground reader at the final save. Progress is a refresh of that same
    // reader, not navigation to a replacement reader.
    if (prior && typeof readerStillCurrent === 'function') {
        for (const key of Object.keys(prior)) delete prior[key];
        Object.assign(prior, session);
        runtimeState.activeSession = prior;
    } else runtimeState.activeSession = session;
    ui_workspaceState.workspace.empty = null;
    renderActive();
    if (body) body.scrollTop = scrollTop;
    return true;
}

export function openPartialTaskSession(record) {
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = false;
    runtimeState.activeMode = record.mode;
    runtimeState.activeSession = core_cache.generationTaskResultSession(record);
    runtimeState.archiveViewLevel = 'content';
    ui_workspaceState.prepareWorkspaceSession(record.mode, runtimeState.activeSession, record.pageId);
    renderActive();
}

// Persist a local change to the precise draft/formal item that the user saw.
export async function saveActiveSessionEdit(mutator, { select = value => value } = {}) {
    if (!archive_library.requireWritableArchiveAction()) return null;
    const shown = runtimeState.activeSession, mode = runtimeState.activeMode;
    const context = core_context.currentCharacterGuard(), bank = archive_repository.requireArchive(context);
    const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
    const resolved = await core_cache.resolveGenerationProgressTarget(context, shown, select);
    if (!resolved) throw new Error('这项内容已经变化，请重新打开后编辑；没有修改其他版本。');
    const expected = JSON.stringify(select(resolved.session));
    const mutate = latest => {
        if (JSON.stringify(select(latest)) !== expected) throw new Error('这项内容刚被更新，已保留最新内容，请重新打开后编辑。');
        return mutator(latest);
    };
    const committed = resolved.draftId
        ? await core_cache.commitGenerationTaskResultMutation(context, resolved.draftId, mutate, { expectedTaskOrigin: origin })
        : await core_cache.commitSessionMutation(mode, core_context.getChatId(context), origin, mutate, resolved.session);
    if (!committed) throw new Error('本次修改尚未保存，请重新打开这项内容后再试。');
    if (runtimeState.activeSession === shown && core_context.isCurrentTaskOrigin(origin)) {
        const next = structuredClone(committed);
        if (shown.readableProgress?.explicitDraft && next.readableProgress) next.readableProgress.explicitDraft = true;
        if (shown.generationSources) next.generationSources = structuredClone(shown.generationSources);
        for (const key of ['selectedId','selectedEntryId','selectedStripId','view','page','dialogueIndex','sharedMemory']) {
            if (Object.hasOwn(shown, key)) next[key] = structuredClone(shown[key]);
        }
        runtimeState.activeSession = next;
    }
    return committed;
}

export function renderActive() {
    if (workspace_ui.renderEmptyWorkspace()) return;
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    runtimeState.contentManagerOpen = false;
    if (runtimeState.activeMode !== core_constants.MODE.ENDING) ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    if (!runtimeState.activeSession || !runtimeState.activeMode) return runtimeState.activeArchiveSnapshot ? archive_library.showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot) : showChooser();
    const supportsTopbarIncrement = !time_stories.isTimeStoryMode(runtimeState.activeMode) && ![core_constants.MODE.INBOX, core_constants.MODE.HEART, core_constants.MODE.THEME_SONG, 'pastLives'].includes(runtimeState.activeMode) && (!core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) || runtimeState.activeMode === core_constants.MODE.PHONE);
    setRegenerateVisible((!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && supportsTopbarIncrement);
    setManageVisible(!(runtimeState.activeMode === core_constants.MODE.HEART && ui_workspaceState.workspace.route === 'language') && (!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && !time_stories.isTimeStoryMode(runtimeState.activeMode) && ![core_constants.MODE.RELATIONS, core_constants.MODE.INBOX, core_constants.MODE.THEME_SONG, 'pastLives'].includes(runtimeState.activeMode));
    setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) ? '他的房间' : '当前档案');
    if (runtimeState.activeMode !== core_constants.MODE.ROOM) modes_room.stopRoomClock();
    if (runtimeState.activeMode !== core_constants.MODE.PHONE) ui_phoneView.stopPhoneClock();
    if (runtimeState.activeMode === core_constants.MODE.BUTTERFLY) ui_butterflyView.renderButterfly();
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
    cg_format_ui.mountCgFormatControl(bodyEl(), runtimeState.activeMode, ui_workspaceState.workspace.route, !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly);
    decorateReadOnlyModeUi();
    workspace_ui.syncWorkspaceChrome();
}


function managedTargetRecord(type, id, parentId = '') {
    return ui_contentManager.managementTargetsForSession(runtimeState.activeSession).find(item =>
        item.type === core_text.normalizeText(type, 60)
        && item.id === core_text.normalizeText(id, 120)
        && item.parentId === core_text.normalizeText(parentId, 160)
    ) || null;
}

function markUserManaged(session) {
    if (session && typeof session === 'object') session.userManaged = true;
    return session;
}

function managedItemFromSession(session, type, id, parentId = '') {
    if (type === 'room-life') return session?.lifePlan || null;
    if (type === 'calendar-draft' || type === 'calendar-manual-todo') {
        const field = type === 'calendar-draft' ? 'drafts' : 'manualTodos';
        return modes_calendar.calendarDayPage(session, parentId)?.[field]?.find(item => item.id === id) || null;
    }
    const baseType = { 'album-image': 'album-entry', 'adv-image': 'adv-event', 'heart-strip-image': 'heart-strip' }[type] || type;
    try { return generation_contentRegeneration.contentRegenerationTarget(session, baseType, id, parentId).item; }
    catch { return null; }
}

function deleteManagedTargetFromSession(session, type, id, parentId = '') {
    const updated = structuredClone(session);
    const removeById = (list, wanted) => (Array.isArray(list) ? list : []).filter(item => item?.id !== wanted);
    if (type === 'album-entry') {
        updated.entries = removeById(updated.entries, id);
        if (updated.selectedId === id) updated.selectedId = updated.entries[0]?.id || '';
    } else if (type === 'album-image') {
        const item = updated.entries?.find(entry => entry.id === id); if (!item) throw new Error('找不到这张相簿 CG。'); item.cgImage = null;
    } else if (type === 'adv-event') {
        updated.events = removeById(updated.events, id);
        if (updated.selectedId === id) updated.selectedId = updated.events[0]?.id || '';
    } else if (type === 'adv-text') {
        const item = updated.events?.find(entry => entry.id === id); if (!item) throw new Error('找不到这个 ADV EVENT。'); item.adv = null;
    } else if (type === 'adv-image') {
        const item = updated.events?.find(entry => entry.id === id); if (!item) throw new Error('找不到这张 ADV EVENT CG。'); item.cgImage = null;
    } else if (type === 'room-life') {
        delete updated.lifePlan; delete updated.lifePlanAttempt;
    } else if (type === 'phone-app') {
        updated.apps = removeById(updated.apps, id);
        if (updated.selectedAppId === id) { updated.selectedAppId = updated.apps[0]?.id || ''; updated.selectedEntryId = ''; updated.view = 'list'; }
    } else if (type === 'phone-entry') {
        const app = updated.apps?.find(candidate => candidate.id === parentId); if (!app) throw new Error('找不到这个 App。');
        app.entries = removeById(app.entries, id);
        if (updated.selectedEntryId === id) { updated.selectedEntryId = ''; updated.view = 'list'; }
    } else if (type === 'ending-route') {
        updated.endings = removeById(updated.endings, id);
        if (updated.selectedId === id) updated.selectedId = updated.endings[0]?.id || '';
    } else if (type === 'ending-confession') {
        updated.confessionReplays = removeById(updated.confessionReplays, id);
        if (updated.selectedConfessionId === id) updated.selectedConfessionId = updated.confessionReplays[0]?.id || '';
    } else if (type === 'heart-voice') {
        updated.voiceDramas = removeById(updated.voiceDramas, id);
        if (updated.selectedVoiceId === id) updated.selectedVoiceId = '';
        if (updated.selectedDramaKey === `voice:${id}`) updated.selectedDramaKey = '';
    } else if (type === 'heart-scenario') {
        updated.scenarioDramas = removeById(updated.scenarioDramas, id);
        if (updated.selectedScenarioId === id) updated.selectedScenarioId = '';
        if (updated.selectedDramaKey === `scenario:${id}`) updated.selectedDramaKey = '';
    } else if (type === 'heart-strip') {
        updated.dailyStrips = removeById(updated.dailyStrips, id);
        if (updated.selectedStripId === id) updated.selectedStripId = updated.dailyStrips[0]?.id || '';
    } else if (type === 'heart-firefly') {
        updated.fireflyVoices = removeById(updated.fireflyVoices, id);
        if (updated.selectedFireflyId === id) updated.selectedFireflyId = updated.fireflyVoices[0]?.id || '';
    } else if (type === 'heart-strip-image') {
        const item = updated.dailyStrips?.find(entry => entry.id === id); if (!item) throw new Error('找不到这个日常一格。'); item.cgImage = null;
    } else if (type === 'achievement') {
        updated.entries = removeById(updated.entries, id);
    } else if (type === 'calendar-entry') {
        const pageKey = core_text.normalizeText(parentId, 160);
        const index = updated.entries?.findIndex(item => item?.id === id && modes_calendar.calendarEntryPageKey(item) === pageKey) ?? -1;
        if (index < 0) throw new Error('找不到这条日历项。');
        updated.entries.splice(index, 1);
        const page = modes_calendar.calendarDayPage(updated, pageKey);
        const sameIdStillOnPage = (updated.entries || []).some(item => item?.id === id && modes_calendar.calendarEntryPageKey(item) === pageKey);
        if (page && !sameIdStillOnPage) page.entryIds = (Array.isArray(page.entryIds) ? page.entryIds : []).filter(entryId => entryId !== id);
    } else if (type === 'calendar-note' || type === 'calendar-mood' || type === 'calendar-draft' || type === 'calendar-manual-todo') {
        const page = modes_calendar.calendarDayPage(updated, core_text.normalizeText(parentId, 160));
        if (!page) throw new Error('找不到这个日期页。');
        const field = type === 'calendar-note'
            ? 'stickyNotes'
            : type === 'calendar-mood'
                ? 'moodNotes'
                : type === 'calendar-draft'
                    ? 'drafts'
                    : 'manualTodos';
        const before = Array.isArray(page[field]) ? page[field].length : 0;
        page[field] = removeById(page[field], id);
        if (page[field].length === before) throw new Error('找不到这条日期页内容。');
    } else if (type === 'butterfly-node') {
        const node = updated.nodes?.find(entry => entry.id === id);
        if (!node || node.trueEnding || node.id === 'MAIN') throw new Error('主时间线和观测点 Ω 不能单独删除。');
        updated.nodes = removeById(updated.nodes, id);
        updated.selected = Math.max(1, Math.min(Number(updated.selected) || 1, Math.max(1, updated.nodes.length - 1)));
    } else {
        throw new Error('未知或不允许的单项删除目标。');
    }
    return markUserManaged(updated);
}

async function commitManagedSession(updated, expectedChatId, expectedArchiveRevision, origin) {
    if (!core_context.isCurrentTaskOrigin(origin)) throw new Error('操作期间聊天窗口已经变化，本次修改没有写入。');
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    if (memoryBank.archiveRevision !== expectedArchiveRevision) throw new Error('操作期间正式档案已经更新，本次修改没有写入。');
    updated.chatId = expectedChatId;
    updated.archiveRevision = expectedArchiveRevision;
    if (!await core_cache.commitSession(runtimeState.activeMode, updated, expectedChatId, origin)) throw new Error('当前派生缓存版本已经变化，本次修改没有写入。');
    runtimeState.activeSession = updated;
    return true;
}

async function deleteManagedTarget(type, id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const shownSession = runtimeState.activeSession, mode = runtimeState.activeMode;
    const shownSnapshot = runtimeState.activeArchiveSnapshot;
    const record = managedTargetRecord(type, id, parentId);
    if (!record || !ui_contentManager.isManageableTargetType(type) || record.canDelete === false) return;
    if (!confirmExplicitActionTwice(
        `删除「${record.label}」？`,
        '只删除当前心迹回廊派生缓存中的这一项；正式聊天档案 Mxxx、SillyTavern 聊天正文和世界书都不会修改。删除后如想恢复，需要重新生成。',
        { destructive: true },
    )) return;
    try {
        if (shownSession?.readableProgress?.complete === false) {
            const targetRuntime = shownSnapshot ? await archive_library.prepareArchiveTargetSubtask(mode, `delete:${type}:${parentId}:${id}`, shownSnapshot) : null;
            const context = targetRuntime?.context || core_context.currentCharacterGuard();
            const resolved = await core_cache.resolveGenerationProgressTarget(context, shownSession,
                session => managedItemFromSession(session, type, id, parentId), { cache: targetRuntime?.archiveTarget?.cache });
            if (!resolved) throw new Error('刚才选中的内容已经变化，未删除其他版本的同编号内容。请查看当前内容后再操作。');
            const expected = JSON.stringify(managedItemFromSession(resolved.session, type, id, parentId));
            const mutate = latest => {
                if (JSON.stringify(managedItemFromSession(latest, type, id, parentId)) !== expected) {
                    throw new Error('刚才选中的内容已被更新，本次没有删除新内容。');
                }
                return deleteManagedTargetFromSession(latest, type, id, parentId);
            };
            const bank = targetRuntime?.memoryBank || archive_repository.requireArchive(context);
            const origin = targetRuntime?.origin || core_context.captureTaskOrigin(context, bank.archiveRevision);
            let committed;
            if (resolved.draftId) {
                committed = await core_cache.commitGenerationTaskResultMutation(context, resolved.draftId, mutate, {
                    expectedTaskOrigin: origin, archiveTarget: targetRuntime?.archiveTarget,
                    stillCurrent: targetRuntime?.stillCurrent,
                });
            } else if (targetRuntime) {
                const result = await targetRuntime.options.commitArchiveTargetMutation(targetRuntime.archiveTarget, mode, origin, mutate, resolved.session, targetRuntime.stillCurrent);
                archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
                committed = result.session;
            } else committed = await core_cache.commitSessionMutation(mode, core_context.getChatId(context), origin, mutate, resolved.session);
            if (!committed) throw new Error('这份内容的保存状态已变化，未删除其他版本。请重新打开当前内容后再操作。');
            if (runtimeState.activeMode === mode && (shownSnapshot
                ? runtimeState.activeArchiveSnapshot?.entryId === shownSnapshot.entryId : core_context.isCurrentTaskOrigin(origin))) {
                if (targetRuntime) runtimeState.activeArchiveSnapshot.cache = structuredClone(targetRuntime.archiveTarget.cache);
                runtimeState.activeSession = shownSession.readableProgress?.explicitDraft
                    ? { ...committed, readableProgress: { ...committed.readableProgress, explicitDraft: true }, generationSources: shownSession.generationSources }
                    : core_cache.loadSession(mode, { context, memoryBank: bank,
                    cache: targetRuntime?.archiveTarget?.cache, clone: true, includePartial: true }) || committed;
                ui_contentManager.renderContentManager();
            }
            globalThis.toastr?.success?.(`已删除：${record.label}`, '心迹回廊');
            return;
        }
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        const memoryBank = archive_repository.requireArchive(context);
        const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
        const base = core_cache.loadSession(runtimeState.activeMode, { context, chatId: expectedChatId, memoryBank, clone: true });
        if (!base) throw new Error('当前分类缓存已经变化，请返回后重新打开再操作。');
        const updated = deleteManagedTargetFromSession(base, type, id, parentId);
        await commitManagedSession(updated, expectedChatId, memoryBank.archiveRevision, origin);
        globalThis.toastr?.success?.(`已删除：${record.label}`, '心迹回廊');
        ui_contentManager.renderContentManager();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    }
}

async function regenerateManagedTarget(type, id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const record = managedTargetRecord(type, id, parentId);
    if (!record || !ui_contentManager.isManageableTargetType(type) || record.canRegenerate === false) return;
    // Image and daily-life regeneration already own their exact two confirmations.
    if (type === 'album-image' || type === 'adv-image') {
        runtimeState.activeSession.selectedId = id;
        runtimeState.contentManagerOpen = false;
        return generation_imageGeneration.drawSelectedCgImage();
    }
    if (type === 'heart-strip-image') {
        runtimeState.contentManagerOpen = false;
        return ui_heartView.drawHeartStripImage(id);
    }
    if (type === 'room-life') {
        if (!confirmRoomLifeRefresh()) return;
        runtimeState.contentManagerOpen = false;
        return modes_room.ensureRoomLifePlan({ force: true });
    }
    if (!confirmExplicitActionTwice(
        `重新生成「${record.label}」？`,
        '模型成功返回并通过校验后，才会用新内容替换这一项；如果生成失败、聊天切换或档案 revision 变化，旧内容会原样保留。正式档案 Mxxx 不会被修改。',
        { destructive: true },
    )) return;
    return ui_contentManager.runContentRegeneration(type, id, parentId, { confirmed: true });
}

async function deleteManagedCategory() {
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

async function regenerateManagedCategory() {
    if (runtimeState.activeMode === core_constants.MODE.INBOX) return;
    if (!runtimeState.activeMode || !archive_library.requireWritableArchiveAction()) return;
    const mode = runtimeState.activeMode;
    const label = core_constants.MODE_LABEL[mode] || mode;
    if (!confirmExplicitActionTwice(
        `重新生成整个「${label}」？`,
        `成功后会用全新的分类基础内容替换当前分类；旧内容在新结果成功写入之前会一直保留。${mode === core_constants.MODE.ROOM ? '房间成功替换后，只清除依赖旧结构的“他的物品”；私人终端保留。' : ''} 实图/可选长正文等独立子内容可继续使用各自的单项重新生成按钮。正式档案不会修改。`,
        { destructive: true },
    )) return;
    runtimeState.contentManagerOpen = false;
    const fresh = await generation_client.generateMode(mode, { background: false, replaceExisting: true });
    if (fresh && mode === core_constants.MODE.ROOM) {
        try {
            const context = core_context.currentCharacterGuard();
            await core_cache.deleteSessions([core_constants.MODE.ITEMS], core_context.getChatId(context));
        } catch (error) {
            console.warn('[HeartbeatMemories] room dependent cache invalidation after replacement failed', core_text.safeErrorDiagnostic(error));
        }
    }
}

export function handleOverlayClick(event) {
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
    if (exportRecoveryButton) return void generation_client.exportSavedGeneration(exportRecoveryButton.dataset.rmtRecoveryExport, {
        draftId: exportRecoveryButton.dataset.rmtRecoveryDraftId || '', pageId: exportRecoveryButton.dataset.rmtRecoveryPageId || '',
    }).then(value => {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'hearttrace-module-recovery.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        globalThis.toastr?.info?.('草稿文件包含任务背景与未提交内容，请勿公开分享。', '心迹回廊');
    }).catch(error => { if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); });
    const discardButton = event.target.closest?.('[data-rmt-recovery-discard]');
    if (discardButton) return void generation_client.discardSavedGeneration(discardButton.dataset.rmtRecoveryDiscard, {
        draftId: discardButton.dataset.rmtRecoveryDraftId || '', pageId: discardButton.dataset.rmtRecoveryPageId || '',
    }).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
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
    if (event.target.closest?.('[data-rmt-archive-discard]')) {
        if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return;
        if (!confirmExplicitAction('放弃整理草稿？', '仅清除当前聊天尚未提交的档案整理/简介草稿，不能恢复。不删除已保存的正式记忆、模块或图片，也不会自动发起新请求。', { destructive: true })) return;
        const context = core_context.currentCharacterGuard();
        try {
            return void Promise.resolve(archive_repository.discardCurrentArchiveImportRecovery(context)).then(cleared => {
                if (cleared && core_context.getContext() === context) showChooser();
            }).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿未放弃'));
        } catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 草稿未放弃'); }
        return;
    }
    const recoveryButton = event.target.closest?.('[data-rmt-recovery-mode]');
    if (recoveryButton) return void generation_client.continueSavedGeneration(recoveryButton.dataset.rmtRecoveryMode, {
        draftId: recoveryButton.dataset.rmtRecoveryDraftId || '', pageId: recoveryButton.dataset.rmtRecoveryPageId || '',
    }).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const archiveRecoveryButton = event.target.closest?.('[data-rmt-archive-recovery]');
    if (archiveRecoveryButton) return void (archiveRecoveryButton.dataset.rmtArchiveRecovery === 'profile'
        ? archive_repository.rewriteCurrentArchiveVerdict({ draftId: archiveRecoveryButton.dataset.rmtArchiveRecoveryDraftId || '' })
        : archive_repository.continueCurrentArchiveImport({ draftId: archiveRecoveryButton.dataset.rmtArchiveRecoveryDraftId || '' })).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    const songButton = event.target.closest?.('[data-rmt-song]');
    if (songButton) return void song_view.handleThemeSongAction(songButton.dataset.rmtSong, songButton.dataset.rmtSongId);
    const mailButton = event.target.closest?.('[data-rmt-inbox]');
    if (mailButton) return void ui_inboxView.handleInboxAction(mailButton.dataset.rmtInbox, mailButton.dataset.rmtInboxId);
    const generateModeButton = event.target.closest?.('[data-rmt-generate-mode]');
    if (generateModeButton) {
        const mode = generateModeButton.dataset.rmtGenerateMode;
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
                    await generation_client.generateMode(mode, { background, ...targetOptions });
                } catch (error) {
                    globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
                }
            })();
            return;
        }
        if (!archive_library.requireWritableArchiveAction()) return;
        if (generateModeButton.dataset.rmtRegenerate === 'true' && !confirmModeRegeneration(mode)) return;
        void generation_client.generateMode(mode, { background });
        return;
    }
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

    const actionEl = event.target.closest?.('[data-rmt-action]');
    const action = actionEl?.dataset?.rmtAction;
    if (!action) return;
    if (action === 'rewrite-archive-verdict') {
        if (runtimeState.activeArchiveSnapshot && !archive_library.requireWritableArchiveAction()) return;
        if (!confirmExplicitAction('重写这份档案的简介？', '只读取已归档经历，使用当前独立 API；记忆和其他已生成内容保持不变。')) return;
        return archive_repository.rewriteCurrentArchiveVerdict();
    }
    if (runtimeState.activeArchiveSnapshot && ['regenerate', 'draw-cg', 'clear-cg-image', 'draw-heart-strip', 'clear-heart-strip', 'room-life-refresh', 'room-schema-upgrade', 'import-memory', 'full-rebuild-memory', 'read-memory-plugins', 'memory-worldinfo-picker', 'refresh-ending-confessions'].includes(action)) {
        if (!archive_library.requireWritableArchiveAction()) return;
    }
    if (action === 'inbox-back') return ui_inboxView.closeInboxLetter();
    if (action === 'back') return navigateBack();
    if (action === 'travel-close-detail') return ui_travelView.closeTravelDetail();
    if (action === 'travel-dialogue-prev') return ui_travelView.travelDialogueStep(-1);
    if (action === 'travel-dialogue-next') return ui_travelView.travelDialogueStep(1);
    if (action === 'travel-dialogue-replay') return ui_travelView.replayTravelDialogue();
    if (action === 'close') return closeArchiveOverlayFromUser();
    if (action === 'home') {
        if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
        return home_view.showHome();
    }
    if (action === 'library-home') {
        if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
        return archive_library.showArchiveLibrary();
    }
    if (action === 'archive-character-back') return runtimeState.archiveLibraryCharacterKey ? archive_library.showArchiveCharacter(runtimeState.archiveLibraryCharacterKey) : archive_library.showArchiveLibrary();
    if (action === 'open-heart') return ui_heartView.openHeartMode();
    if (action === 'heart-avatar-talk') {
        const key = runtimeState.activeArchiveSnapshot?.archiveGroupId || (() => { try { return archive_groups.currentArchiveGroupKey(core_context.getContext()); } catch { return ''; } })();
        return void ui_heartView.showAvatarDialogueForCharacter(key);
    }
    if (action === 'heart-generate-part') return void modes_heart.generateHeartSection(actionEl.dataset.rmtHeartPart || 'dialogues');
    if (action === 'heart-add-language') {
        const category = bodyEl()?.querySelector('[data-rmt-language-category]')?.value || '';
        return void modes_heart.generateHeartSection('dialogues', { languageCategory: category });
    }
    if (action === 'heart-generate-language') return void modes_heart.generateHeartSection('dialogues', {
        replaceDialogues: actionEl.dataset.rmtHeartLanguageReplace === '1',
    });
    if (action === 'heart-generate-season') return void modes_heart.generateHeartSeasonSection(actionEl.dataset.rmtHeartSeasonTarget || 'postending');
    if (action === 'heart-drama-prev') return ui_heartView.heartStepDrama(-1);
    if (action === 'heart-drama-next') return ui_heartView.heartStepDrama(1);
    if (action === 'heart-firefly-prev') return ui_heartView.heartStepFireflyPage(-1);
    if (action === 'heart-firefly-next') return ui_heartView.heartStepFireflyPage(1);
    if (action === 'avatar-talk-again') return ui_heartView.renderAvatarDialoguePopup(runtimeState.activeAvatarDialogue, { repeat: true });
    if (action === 'avatar-heart-open') return ui_heartView.openHeartFromAvatar();
    if (action === 'avatar-heart-generate') return ui_heartView.openHeartFromAvatar();
    if (action === 'avatar-heart-open-archive') {
        const state = runtimeState.activeAvatarDialogue;
        bodyEl()?.querySelector('.rmt-avatar-dialog-pop')?.remove();
        runtimeState.activeAvatarDialogue = null;
        if (state?.snapshot) return archive_library.showIndexedArchiveSnapshot(state.snapshot);
        if (state?.entry) return void archive_library.openIndexedArchive(state.entry.characterKey, state.entry.chatId, core_context.archiveIndexEntryId(state.entry));
        return archive_library.showArchiveLibrary();
    }
    if (action === 'avatar-dialog-close') {
        bodyEl()?.querySelector('.rmt-avatar-dialog-pop')?.remove();
        runtimeState.activeAvatarDialogue = null;
        return;
    }
    if (action === 'current-archive') return showChooser();
    if (action === 'current-archive-import') return requestCurrentArchiveImport();
    if (action === 'current-archive-delete') {
        void archive_groups.deleteCurrentHeartbeatArchive('').then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.('当前聊天的心迹回廊档案已删除；聊天正文没有删除。', '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'read-memory-plugins') return void archive_repository.readCurrentChatMemoryPlugins().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'phone-fill-missing' || action === 'room-refresh-figure') {
        if (!archive_library.requireWritableArchiveAction()) return;
        const mode = action === 'phone-fill-missing' ? core_constants.MODE.PHONE : core_constants.MODE.ROOM;
        const extra = runtimeState.activeArchiveSnapshot ? archive_library.archiveTargetGenerationOptions(runtimeState.activeArchiveSnapshot) : {};
        return void generation_client.generateMode(mode, { ...extra, background: false, fillMissing: action === 'phone-fill-missing', visualOnly: action === 'room-refresh-figure' }).catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
    }
    if (action === 'memory-worldinfo-picker') return void archive_repository.showMemoryWorldInfoPicker();
    if (action === 'memory-worldinfo-close') {
        document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-memory-wi-picker`)?.remove();
        if (runtimeState.archiveViewLevel === 'home') { void ui_settingsPanel.refreshMemoryIngressUi(); return; }
        return showChooser();
    }
    if (action === 'memory-worldinfo-expand') return void archive_repository.expandMemoryWorldInfoBook(actionEl);
    if (action === 'archive-group-manager') return archive_library.showArchiveGroupManager();
    if (action === 'archive-group-close') { document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`)?.remove(); return archive_library.showArchiveLibrary(); }
    if (action === 'archive-character-delete') {
        const groupId = core_text.normalizeText(actionEl.dataset.rmtArchiveGroupId, 120);
        void archive_groups.deleteArchiveCharacterFromLibrary(groupId).then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.(`已从档案室删除“${deleted.name}”、其 ${deleted.count} 个聊天档案索引及独立备份；SillyTavern 正文聊天窗口没有删除。`, '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'character-profile-generate') {
        const groupId = core_text.normalizeText(runtimeState.archiveLibraryCharacterKey, 120);
        if (!groupId) return globalThis.toastr?.info?.('请先打开一个角色档案。', '心迹回廊');
        if (!confirmExplicitAction('读取角色固定设定并更新 Character Profile？', '只会读取该角色卡、当前 User Persona 与本轮激活到的相关世界书，整理全窗口共用的客观资料，并保存故事开始前已经明确成立的固定关系供各聊天的人际庭园合并显示。不会读取聊天正文，也不会把某个聊天窗口的发展写进公共角色档案。', { destructive: false })) return;
        void modes_relations.generateCharacterProfileForGroup(groupId).then(() => {
            globalThis.toastr?.success?.('角色固定资料已更新；固定关系会在各聊天的人际庭园中合并显示。', '心迹回廊');
            archive_library.showArchiveCharacter(groupId);
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊 · Character Profile'));
        return;
    }
    if (action === 'relation-select') {
        const key = core_text.normalizeText(actionEl.dataset.rmtRelationKey, 160);
        if (runtimeState.activeMode === core_constants.MODE.RELATIONS) {
            runtimeState.relationSelectedKey = key;
            return modes_relations.renderRelations();
        }
        return;
    }
    if (action === 'archive-auto-classify') {
        const changed = archive_groups.autoClassifyArchiveIndex(core_context.getContext(), { confirm: true });
        if (changed) globalThis.toastr?.success?.(`已自动分类 ${changed} 个档案索引。聊天文件没有移动。`, '心迹回廊');
        const manager = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`);
        return manager ? archive_library.showArchiveGroupManager() : archive_library.showArchiveLibrary();
    }
    if (action === 'archive-group-create') {
        const select = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-new-character]`);
        if (!select?.value) return globalThis.toastr?.info?.('先选择一个 SillyTavern char。', '心迹回廊');
        try { archive_groups.createArchiveGroupForCharacter(core_context.getContext(), Number(select.value)); globalThis.toastr?.success?.('已新建角色档案组。现在可以把档案移动进去。', '心迹回廊'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-group-move') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        const select = [...document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-archive-move-select]`)].find(node => node.dataset.rmtArchiveMoveSelect === entryId);
        try { archive_groups.moveArchiveIndexEntryToGroup(core_context.getContext(), entryId, select?.value || '__AUTO__'); globalThis.toastr?.success?.('档案分类已更新；聊天文件没有移动。', '心迹回廊'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-remove-index') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        try {
            if (archive_groups.removeIndexedArchiveFromLibrary(entryId)) {
                globalThis.toastr?.success?.('已从档案室移除索引；聊天文件和真实档案未删除。', '心迹回廊');
                archive_library.showArchiveGroupManager();
            }
        } catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-delete-live') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        void archive_groups.deleteCurrentHeartbeatArchive(entryId).then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.('当前聊天的心迹回廊档案已删除；聊天正文没有删除。', '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'manage') {
        if (!runtimeState.activeMode || !runtimeState.activeSession || !archive_library.requireWritableArchiveAction()) return;
        return ui_contentManager.renderContentManager();
    }
    if (action === 'manage-regenerate-category') return void regenerateManagedCategory();
    if (action === 'manage-delete-category') return void deleteManagedCategory();
    if (action === 'manage-regenerate-target') return void regenerateManagedTarget(actionEl.dataset.rmtManageType, actionEl.dataset.rmtManageId, actionEl.dataset.rmtManageParent);
    if (action === 'manage-delete-target') return void deleteManagedTarget(actionEl.dataset.rmtManageType, actionEl.dataset.rmtManageId, actionEl.dataset.rmtManageParent);
    if (action === 'rebuild-archive-index') return void archive_library.rebuildArchiveIndexFromExisting();
    if (action === 'import-memory') return requestCurrentArchiveImport();
    if (action === 'participants-picker') return void requestParticipantSelection().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'participants-versions') return void requestParticipantVersions().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'full-rebuild-memory') return requestCurrentArchiveFullRebuild();
    if (action === 'archive-overview-refresh') return archive_snapshots.renderArchiveOverviewAsync({ force: true });
    if (action === 'regenerate') {
        if (!runtimeState.activeMode || !confirmModeRegeneration(runtimeState.activeMode)) return;
        if (runtimeState.activeMode === core_constants.MODE.HEART && runtimeState.activeSession?.kind === core_constants.MODE.HEART) {
            return void modes_heart.generateHeartSection('dialogues');
        }
        return generation_client.generateMode(runtimeState.activeMode, { background: false });
    }
    if (action === 'room-schema-upgrade') {
        if (runtimeState.activeMode !== core_constants.MODE.ROOM || !modes_room.roomNeedsSchemaUpgrade(runtimeState.activeSession)) return;
        if (!confirmExplicitAction(
            '为旧版房间补全宠物设定？',
            '会重新扫描当前角色卡和世界书中明确存在的宠物/动物伙伴。只合并缺失的宠物与新证据，旧房间、旧物件、旧台词和深层内容都保留；没有明确宠物设定时不会凭空生成。',
            { destructive: false },
        )) return;
        return void generation_client.generateMode(core_constants.MODE.ROOM, { background: false });
    }
    if (action === 'refresh-ending-confessions') return void ui_endingView.refreshEndingConfessionReplays();
    if (action === 'ending-confession-prev') return ui_endingView.endingConfessionStep(-1);
    if (action === 'ending-confession-next') return ui_endingView.endingConfessionStep(1);
    if (action === 'ending-confession-replay') return ui_endingView.replayEndingConfession();
    if (action === 'ending-easter-open') return ui_endingView.openEndingEasterEgg();
    if (action === 'ending-easter-close') return ui_endingView.closeEndingEasterEgg();
    if (action === 'ending-easter-pulse') return ui_endingView.endingEasterEggPulse();
    if (action === 'ending-easter-reveal') return ui_endingView.endingEasterEggReveal();
    if (action === 'ending-easter-toggle') return ui_endingView.endingEasterEggToggleLogs();
    if (action === 'ending-easter-stabilize') return ui_endingView.endingEasterEggStabilize();
    if (action === 'cancel-cg-image') return generation_imageGeneration.cancelCurrentCgImage();
    if (action === 'view-heart-cg') return ui_heartView.viewHeartStripImage(actionEl);
    if (action === 'refresh-image-provider') return generation_imageGeneration.refreshImageGenerationUi();
    if (action === 'album-prev') return ui_albumView.albumPage(-1);
    if (action === 'album-next') return ui_albumView.albumPage(1);
    if (action === 'show-hint') return ui_albumView.showAlbumHint();
    if (action === 'album-cancel') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.selectedId = '';
            runtimeState.activeSession.hintVisible = false;
            ui_albumView.renderAlbum();
        }
        return;
    }
    if (action === 'shared-memory') return ui_albumView.enterSharedMemory();
    if (action === 'shared-back') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.sharedMemory = false;
            ui_albumView.renderAlbum();
        }
        return;
    }
    if (action === 'shared-prev') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex = Math.max(0, runtimeState.activeSession.dialogueIndex - 1);
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'shared-next') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex += 1;
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'shared-replay') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex = 0;
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'edit-cg-prompt') return cg_editor.openCgPromptEditor();
    if (action === 'edit-heart-cg-prompt') return cg_editor.openCgPromptEditor({ heartStrip: true });
    if (action === 'draw-cg') return void generation_imageGeneration.drawSelectedCgImage();
    if (action === 'clear-cg-image') return generation_imageGeneration.clearSelectedCgImage();
    if (action === 'draw-heart-strip') return void ui_heartView.drawHeartStripImage(actionEl.dataset.rmtHeartStripId);
    if (action === 'clear-heart-strip') return ui_heartView.clearHeartStripImage(actionEl.dataset.rmtHeartStripId);
    if (action === 'cg-only') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ADV) {
            runtimeState.activeSession.view = 'cg';
            ui_advEventView.renderAdvMode();
        }
        return;
    }
    if (action === 'generate-all-adv') return modes_advEvent.generateAllAdvForSession();
    if (action === 'repair-failed-adv') return modes_advEvent.repairFailedAdvForSession();
    if (action === 'read-adv') {
        if (ui_advEventView.resumeAdvReading()) return;
        return modes_advEvent.generateAdvForSelected();
    }
    if (action === 'room-presence') return modes_room.roomPresenceNext();
    if (action === 'room-participant') return modes_room.roomSelectParticipant(actionEl.dataset.rmtParticipantId);
    if (action === 'room-find-presence') return modes_room.roomFindPresence();
    if (action === 'room-life-refresh') {
        if (!confirmRoomLifeRefresh()) return;
        return modes_room.ensureRoomLifePlan({ force: true });
    }
    if (action === 'room-open-items') return modes_room.openRoomDeepMode(core_constants.MODE.ITEMS);
    if (action === 'room-open-phone') return openCachedOrGenerate(core_constants.MODE.PHONE);
    if (action === 'room-deep-back') return modes_room.returnToRoomFromDeep();
    if (action === 'phone-entry-back') return ui_phoneView.phoneEntryBack();
    if (action === 'items-open') return modes_items.itemsOpenSelected();
    if (action === 'items-back') return modes_items.itemsBack();
    if (action === 'adv-event-prev') return ui_advEventView.advEventStep(-1);
    if (action === 'adv-event-next') return ui_advEventView.advEventStep(1);
    if (action === 'adv-prev') return ui_advEventView.advStep(-1);
    if (action === 'adv-next') return ui_advEventView.advStep(1);
}

function refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey) {
    try {
        if (archive_repository.memorySourceScopeForContext(core_context.currentCharacterGuard()).key !== expectedScopeKey) return;
    } catch { return; }
    const book = archive_repository.getMemoryWorldInfoSelection(context).books.find(item => item.name === world);
    const all = book?.all === true;
    const selected = new Set(all ? [] : (book?.entryUids || []).map(String));
    const allInput = section?.querySelector?.('[data-rmt-memory-wi-all]');
    if (allInput) allInput.checked = all;
    const historyInput = section?.querySelector?.('[data-rmt-memory-wi-history]');
    if (historyInput) { historyInput.checked = book?.historySource === true; historyInput.disabled = !book; }
    section?.querySelectorAll?.('[data-rmt-memory-wi-entry]').forEach(input => {
        input.disabled = all;
        input.checked = !all && selected.has(String(input.dataset.rmtMemoryWiUid || ''));
    });
}

export async function handleOverlayChange(event) {
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
