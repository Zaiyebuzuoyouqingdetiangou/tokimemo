import * as archive_inheritance_view from './archiveInheritance.js';
import * as bedtime_contract from '../core/bedtimeContract.js';
import * as bedtime_view from './bedtimeView.js';
import * as mirror_reader from './mirrorTtsReader.js';
import * as mirror_call from './mirrorCallView.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as ui_taskCenter from './taskCenter.js';
import * as ui_countdown from './autoMemoryCountdown.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_contentRegeneration from '../generation/contentRegeneration.js';
import * as cg_editor from './cgPromptEditor.js';
import * as participant_picker from './participantPicker.js';
import * as participant_contract from '../core/participants.js';
import * as image_viewer from './cgImageViewer.js';
import * as navigation_bookmark from './navigationBookmark.js';
import * as floating_archive from './floatingArchive.js';
import * as recovery_view from './recoveryView.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_room from '../modes/room.js';
import * as ui_contentManager from './contentManager.js';
import * as ui_endingView from './endingView.js';
import * as ui_phoneView from './phoneView.js';
import * as song_contract from '../core/themeSongContract.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_pastLives from '../modes/pastLives.js';
import * as ui_settingsPanel from './settingsPanel.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as modes_timeStories from '../modes/timeStories.js';
import * as workspace_ui from './workspace.js';
import * as ui_workspaceState from './workspaceState.js';
import * as toolbarIcons from './toolbarIcons.js';
// 主窗口外壳：手机安全区、打开 / 关闭 / 返回、聊天切换失效、通用小部件
// 从 ui/overlay.js 原样搬出（重构阶段 2），声明文本一字未改；ui/overlay.js 仍转发原有导出。

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
    if (runtimeState.activeMode === 'bedtime' && bedtime_view.closeBedtimeDetail()) return;
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

export function toolbarMoreMenu(overlay) {
    return overlay?.querySelector?.('[data-rmt-toolbar-more-menu]') || null;
}

export function closeToolbarMoreMenu(overlay, { restoreFocus = false } = {}) {
    const menu = toolbarMoreMenu(overlay);
    const trigger = overlay?.querySelector?.('[data-rmt-action="toolbar-more"]');
    if (!menu || menu.hidden) return false;
    menu.hidden = true;
    trigger?.setAttribute?.('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus?.();
    return true;
}

export function toggleToolbarMoreMenu(overlay) {
    const menu = toolbarMoreMenu(overlay);
    const trigger = overlay?.querySelector?.('[data-rmt-action="toolbar-more"]');
    if (!menu || !trigger) return;
    const open = menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button:not([disabled])')?.focus?.();
}

export function bindToolbarMoreMenu(overlay) {
    if (!overlay || overlay.dataset.rmtToolbarMenuBound === 'true') return;
    overlay.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !closeToolbarMoreMenu(overlay, { restoreFocus: true })) return;
        event.preventDefault(); event.stopPropagation();
    });
    overlay.dataset.rmtToolbarMenuBound = 'true';
}

export function revealArchiveOverlay(overlay) {
    if (!overlay) return;
    try { runtimeState.renderedChatScope = core_context.chatScopeKey(core_context.currentCharacterGuard()); } catch {}
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

export function closeOverlay(options = {}) {
    archive_inheritance_view.clearArchiveInheritancePreview();
    mirror_reader.disposeMirrorReader();
    mirror_call.disposeMirrorCall();
    const remember = options.remember !== false;
    participant_picker.closeParticipantPicker();
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    closeToolbarMoreMenu(overlay);
    const focused = document.activeElement;
    if (focused && overlay?.contains?.(focused)) {
        try { focused.blur(); } catch {}
    }
    // Mobile close gestures can deliver both an early event and a click. Only
    // the first close records the page; later events must not replace it.
    if (remember && overlay && !overlay.hidden) {
        floating_archive.rememberFloatingArchive();
        navigation_bookmark.rememberReadingPosition();
    }
    ui_workspaceState.leaveWorkspaceReader();
    cg_editor.closeCgPromptEditor({ restoreFocus: false });
    modes_room.stopRoomClock();
    ui_phoneView.stopPhoneClock();
    ui_taskCenter.hideTaskCenter();
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

export function invalidateArchiveViewForChatNavigation(nextChatId = '') {
    const snapshot = runtimeState.activeArchiveSnapshot;
    const snapshotChat = snapshot ? core_context.comparableChatId(snapshot.chatId) : '';
    const next = core_context.comparableChatId(nextChatId);
    closeOverlay({ remember: false });
    if (!snapshot || snapshotChat !== next) {
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
    }
    runtimeState.archiveViewLevel = 'chooser';
    runtimeState.renderedChatScope = '';
    runtimeState.pendingArchiveEntry = 'chooser';
    runtimeState.contentManagerOpen = false;
    if (runtimeState.chooserRefreshTimer) {
        clearTimeout(runtimeState.chooserRefreshTimer);
        runtimeState.chooserRefreshTimer = 0;
    }
}

export function bodyEl() {
    const floor = document.querySelector('.rmt-floor-shell [data-rmt-floor-body][data-rmt-floor-live="1"]');
    if (floor) return floor;
    return document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-body`);
}

export function topTitle(text) {
    const el = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
    if (el) el.textContent = text || '心迹回廊';
    workspace_ui.syncWorkspaceChrome();
    ui_countdown.refreshAutoMemoryCountdown();
}

export function setBackVisible(visible, label = '返回上级') {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="back"]`);
    if (!button) return;
    button.hidden = !visible;
    button.innerHTML = toolbarIcons.toolbarIcon('back');
    button.title = label;
    button.setAttribute('aria-label', label);
}

export function setManageVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="manage"]`);
    if (button) button.hidden = !visible;
    const menuButton = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-toolbar-more-item="manage"]`);
    if (menuButton) menuButton.hidden = !visible;
}

export function setRegenerateVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="regenerate"]`);
    if (button) {
        button.hidden = !visible;
        button.innerHTML = toolbarIcons.toolbarIcon('add');
        button.setAttribute('aria-label', '增量追加');
    }
    const menuButton = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-toolbar-more-item="regenerate"]`);
    if (menuButton) menuButton.hidden = !visible;
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
        ['achievements', '成就库'], ['butterfly', '蝴蝶效应'], ['pastLives', '前世今生'], ['timeEcho', '时空回响'], ['bedtime', '睡前故事'],
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

export function calendarQuickAccessHtml({ ready = false, generated = false, generating = false, partial = false, readOnly = false } = {}) {
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

export function memoryLockPanelHtml(memory, { readOnly = false } = {}) {
    const hot = Array.isArray(memory?.memories) ? memory.memories : [];
    if (!hot.length) return '';
    const cold = Array.isArray(memory?.coldArchive) ? memory.coldArchive.length : 0;
    const rows = hot.map(item => `<div class="rmt-memory-lock-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
      <button type="button" class="rmt-btn" data-rmt-memory-lock="${core_text.esc(item.id)}" ${readOnly ? 'disabled' : ''} aria-pressed="${item.locked === true}">${item.locked === true ? '已锁定' : '锁定'}</button>
      <b>${core_text.esc(item.id)}</b>
      <span>${core_text.esc(item.title || '')}</span>
      <input type="text" data-rmt-memory-date="${core_text.esc(item.id)}" value="${core_text.esc(item.date || '')}" ${readOnly ? 'disabled' : ''} placeholder="公历 YYYY/MM/DD 或历年" style="min-width:160px;flex:1">
    </div>`).join('');
    return `<details class="rmt-memory-lock-panel"><summary>档案记忆 ${hot.length} 条${cold ? ` · 冷归档 ${cold}` : ''}</summary><div style="max-height:240px;overflow:auto">${rows}</div></details>`;
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
    runtimeState.activeTaskLabel = core_text.normalizeText(text, 240) || runtimeState.activeTaskLabel;
    ui_taskCenter.syncLiveTaskStrip();
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
    if (isBusy && text) runtimeState.activeTaskLabel = core_text.normalizeText(text, 240) || runtimeState.activeTaskLabel;
    ui_taskCenter.syncLiveTaskStrip();
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
    refreshVisibleRecoveryHost();
}

export function showInlinePreflight(summary, detailText, { error = false } = {}) {
    const detail = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-event-detail`) || bodyEl();
    if (!detail) return;
    let box = detail.querySelector('.rmt-inline-preflight');
    if (!box) {
        box = document.createElement('div');
        box.className = 'rmt-inline-preflight';
        detail.prepend(box);
    }
    box.classList.toggle('rmt-inline-error', error === true);
    box.replaceChildren();
    const details = document.createElement('details');
    details.open = error === true;
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = summary;
    const body = document.createElement('pre');
    body.textContent = detailText || '';
    details.append(summaryEl, body);
    box.append(details);
}

function refreshVisibleRecoveryHost() {
    // Unfinished generation drafts are handled in the task center. Leaving the
    // banner in the reader made the same retry card appear twice.
    document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-generation-recoveries]`).forEach(node => node.remove());
}

export function emptyArchiveMode(mode, memory, context, stored) {
    if (mode === core_constants.MODE.INBOX) return modes_inbox.emptyInbox(memory, context);
    if (mode === core_constants.MODE.PAST_LIVES) return modes_pastLives.emptyPastLives(memory, context);
    // Opening an empty reader is free. An unreadable existing record is not an
    // empty reader and never grants permission to overwrite saved material.
    if (stored?.[mode]) return null;
    if (mode === 'bedtime') return bedtime_contract.emptyBedtime(memory, context ? core_context.currentCharacterRuntimeKey(context) : '');
    if (mode === core_constants.MODE.THEME_SONG) return song_contract.emptyThemeSongs(memory, context ? core_context.currentCharacterRuntimeKey(context) : '');
    if (mode === core_constants.MODE.HEART) return modes_heart.makeHeartShell(memory);
    if (time_stories.isTimeStoryMode(mode)) return modes_timeStories.emptyTimeStories(mode, memory, context);
    if (mode === core_constants.MODE.PHONE) return ui_phoneView.emptyPhone(memory, context);
    return null;
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

export function managedTargetRecord(type, id, parentId = '') {
    return ui_contentManager.managementTargetsForSession(runtimeState.activeSession).find(item =>
        item.type === core_text.normalizeText(type, 60)
        && item.id === core_text.normalizeText(id, 120)
        && item.parentId === core_text.normalizeText(parentId, 160)
    ) || null;
}

export function markUserManaged(session) {
    if (session && typeof session === 'object') session.userManaged = true;
    return session;
}

export function managedItemFromSession(session, type, id, parentId = '') {
    if (type === 'room-life') return session?.lifePlan || null;
    if (type === 'calendar-draft' || type === 'calendar-manual-todo') {
        const field = type === 'calendar-draft' ? 'drafts' : 'manualTodos';
        return modes_calendar.calendarDayPage(session, parentId)?.[field]?.find(item => item.id === id) || null;
    }
    const baseType = { 'album-image': 'album-entry', 'adv-image': 'adv-event', 'heart-strip-image': 'heart-strip' }[type] || type;
    try { return generation_contentRegeneration.contentRegenerationTarget(session, baseType, id, parentId).item; }
    catch { return null; }
}
