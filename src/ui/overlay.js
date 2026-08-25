// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_contentRegeneration from '../generation/contentRegeneration.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
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
import * as ui_settingsPanel from './settingsPanel.js';
import * as ui_styles from './styles.js';

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
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay || overlay.hidden) return closeOverlay();
    if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
    if (core_requestCoordinator.hasAnyTask()) globalThis.toastr?.info?.('当前任务会继续在后台运行，完成后会通知你。', '心跳回忆');
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
          <div class="rmt-shell" role="dialog" aria-modal="true" aria-label="心跳回忆">
            <div class="rmt-topbar">
              <button type="button" data-rmt-action="back" hidden aria-label="返回上级">← 返回</button>
              <div class="rmt-topbar-title">心跳回忆</div>
              <button type="button" data-rmt-action="home">档案室</button>
              <button type="button" data-rmt-action="regenerate" hidden>增量追加</button>
              <button type="button" data-rmt-action="manage" hidden>管理</button>
              <button type="button" data-rmt-action="close" aria-label="关闭档案室">关闭</button>
            </div>
            <div class="rmt-body"></div>
          </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', handleOverlayClick);
        overlay.addEventListener('change', handleOverlayChange);
        overlay.addEventListener('error', generation_imageGeneration.handleOverlayMediaError, true);
        if (typeof globalThis.HTMLDialogElement === 'function' && overlay instanceof globalThis.HTMLDialogElement) {
            overlay.addEventListener('cancel', event => {
                event.preventDefault();
                closeOverlay();
            });
        }
    }
    applyArchiveMobileSafeArea(overlay);
    bindOverlayCloseFallback(overlay);
    revealArchiveOverlay(overlay);
    return overlay;
}

export function closeOverlay() {
    modes_room.stopRoomClock();
    ui_phoneView.stopPhoneClock();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
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
}

export function bodyEl() {
    return document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-body`);
}

export function topTitle(text) {
    const el = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
    if (el) el.textContent = text || '心跳回忆';
}

export function setBackVisible(visible, label = '返回上级') {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="back"]`);
    if (!button) return;
    button.hidden = !visible;
    button.textContent = `← ${label}`;
    button.setAttribute('aria-label', label);
}

export function navigateBack() {
    if (runtimeState.contentManagerOpen) {
        runtimeState.contentManagerOpen = false;
        return renderActive();
    }
    if (runtimeState.activeMode === core_constants.MODE.ITEMS || runtimeState.activeMode === core_constants.MODE.PHONE) return modes_room.returnToRoomFromDeep();
    if (runtimeState.activeMode === core_constants.MODE.ADV && runtimeState.activeSession?.kind === core_constants.MODE.ADV && runtimeState.activeSession.view === 'adv') {
        runtimeState.activeSession.view = 'cg';
        runtimeState.activeSession.paragraphIndex = 0;
        return ui_advEventView.renderAdvMode();
    }
    if (runtimeState.activeMode === core_constants.MODE.ALBUM && runtimeState.activeSession?.kind === core_constants.MODE.ALBUM && runtimeState.activeSession.sharedMemory) {
        runtimeState.activeSession.sharedMemory = false;
        return ui_albumView.renderAlbum();
    }
    if (runtimeState.activeMode) return runtimeState.activeArchiveSnapshot ? archive_library.showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot) : showChooser();
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
    return archive_library.showArchiveLibrary();
}

export function setManageVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="manage"]`);
    if (button) button.hidden = !visible;
}

export function setRegenerateVisible(visible) {
    const button = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="regenerate"]`);
    if (button) {
        button.hidden = !visible;
        button.textContent = '增量追加';
    }
}

export function confirmExplicitAction(title, detail, { destructive = false } = {}) {
    const prefix = destructive ? '⚠️ ' : '';
    const message = `${prefix}${core_text.normalizeText(title, 160)}\n\n${core_text.normalizeText(detail, 1200)}\n\n确定继续吗？`;
    try {
        if (typeof globalThis.confirm === 'function') return globalThis.confirm(message);
    } catch (error) {
        console.warn('[HeartbeatMemories] native confirmation unavailable', error);
    }
    globalThis.toastr?.warning?.('当前环境无法显示确认提示。为避免误操作，本次操作已取消。', '心跳回忆');
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

export function requestCurrentArchiveImport() {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
        return false;
    }
    const existing = archive_repository.getImportedMemory(context);
    const settings = core_settings.getPluginSettings(context);
    const detected = archive_repository.externalMemorySourceSummary(context);
    if (settings.useCurrentChatExternalMemory && detected.length && !archive_repository.getMemoryPreflight(context)) {
        showChooser();
        globalThis.toastr?.info?.('检测到当前窗口记忆 / 摘要来源。请先点“扫描记忆 / 摘要”，确认读取范围后再生成/更新当前窗口档案。', '心跳回忆');
        return false;
    }
    const title = existing ? '增量更新当前窗口档案？' : '生成当前窗口档案？';
    const detail = existing
        ? '默认只整理“上次档案之后新增的聊天”和发生变化的当前窗口记忆/摘要。已有 Mxxx 记忆 ID 不重排，已生成的回忆相簿、CG、ADV、房间、ENDING、储物、私人终端会继续保留。若检测到旧聊天被编辑/删除，本次会停止并要求你明确选择“完全重建档案”。'
        : '这会读取当前聊天窗口并建立一份只属于这个窗口的心跳回忆档案。聊天正文不会被修改；之后也只有你手动更新时档案才会变化。';
    if (!confirmExplicitAction(title, detail, { destructive: false })) return false;
    void archive_repository.importCurrentChatMemory({ fullRebuild: false }).catch(error => {
        console.error('[HeartbeatMemories] current archive import action failed', error);
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    });
    return true;
}

export function requestCurrentArchiveFullRebuild() {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
        return false;
    }
    if (!archive_repository.getImportedMemory(context)) return requestCurrentArchiveImport();
    const settings = core_settings.getPluginSettings(context);
    const detected = archive_repository.externalMemorySourceSummary(context);
    if (settings.useCurrentChatExternalMemory && detected.length && !archive_repository.getMemoryPreflight(context)) {
        showChooser();
        globalThis.toastr?.info?.('完全重建前请先扫描当前窗口记忆 / 摘要，确认读取范围。', '心跳回忆');
        return false;
    }
    if (!confirmExplicitActionTwice(
        '完全重建当前窗口档案？',
        '这会重新读取整个当前聊天并重新编号 Mxxx 记忆，因此旧档案版本对应的回忆相簿、CG、ADV、房间、蝴蝶效应、ENDING、储物和私人终端缓存都会失效。只有当你明确需要从头整理（例如旧消息被大量编辑/删除）时才建议使用。',
        { destructive: true },
    )) return false;
    void archive_repository.importCurrentChatMemory({ fullRebuild: true }).catch(error => {
        console.error('[HeartbeatMemories] full archive rebuild failed', error);
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
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

function calendarQuickAccessHtml({ ready = false, generated = false, generating = false, readOnly = false } = {}) {
    const status = !ready
        ? '先建立当前聊天档案后，就可以整理日历。'
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

export function showChooser() {
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
            topTitle('心跳回忆 · 档案室');
            body.innerHTML = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在读取已生成档案…</b></div></div>';
            void core_cache.ensureCacheHydrated(hydrationContext).then(() => archive_snapshots.scheduleChooserRefresh(0)).catch(error => {
                console.warn('[HeartbeatMemories] compressed cache read failed', error);
                const latestBody = bodyEl();
                if (latestBody) latestBody.innerHTML = `<div class="rmt-error"><div><b>已生成内容缓存读取失败</b><div style="margin:10px 0;white-space:pre-wrap;opacity:.78">${core_text.esc(error?.message || String(error))}</div><button type="button" class="rmt-btn" data-rmt-action="library-home">返回档案室</button></div></div>`;
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
        topTitle('心跳回忆 · 档案室');
        body.innerHTML = `<div class="rmt-error"><div><b>无法读取当前聊天</b><div style="margin-top:10px;white-space:pre-wrap;opacity:.75">${core_text.esc(error?.message || String(error))}</div></div></div>`;
        return;
    }
    const ready = state.status === 'ready';
    const memory = state.memory;
    const importLabel = ready ? '增量更新当前窗口档案' : '生成当前窗口档案';
    const preview = ready ? memory.memories.slice(0, 7).map(item => item.title).join(' · ') : '';
    const archiveName = ready ? (memory.archiveName || archive_repository.fallbackArchiveName(memory.memories)) : '尚未创建档案';
    const archiveSummary = ready ? (memory.archiveSummary || archive_repository.fallbackArchiveSummary(memory.memories)) : '先为当前聊天创建档案。档案只在你手动创建 / 更新时变化，不会因为继续聊天而自动改写。';
    const keywords = ready ? core_text.cleanArray(memory.archiveKeywords, 10, 80) : [];
    const pendingClass = ready && (state.pendingMessages > 0 || state.sourceChanged) ? 'pending' : 'ready';
    const cachedRead = ready ? { context, chatId: core_context.getChatId(context), memoryBank: memory, clone: false } : null;
    const portals = ready ? archive_snapshots.baseModeAvailability(cachedRead) : core_constants.ARCHIVE_PORTAL_MODES.map(mode => ({ mode, session: null, meta: archive_snapshots.modePortalMeta(mode) }));
    const generatedCount = portals.filter(item => !!item.session).length;
    const calendarPortal = portals.find(item => item.mode === core_constants.MODE.CALENDAR) || { session: null };
    const calendarGenerated = !!calendarPortal.session;
    const calendarGenerating = core_requestCoordinator.isModeGenerating(core_constants.MODE.CALENDAR);
    const calendarQuick = calendarQuickAccessHtml({ ready, generated: calendarGenerated, generating: calendarGenerating, readOnly: false });
    const concurrentLabels = core_requestCoordinator.generationTaskLabels();
    const anyRunning = runtimeState.busy || concurrentLabels.length > 0;
    topTitle(anyRunning ? `心跳回忆 · 档案室 · ${runtimeState.busy ? '档案整理中' : `${concurrentLabels.length}项生成中`}` : `心跳回忆 · 档案室${ready ? ` · ${archiveName}` : ''}`);
    const busyBanner = anyRunning ? `<div class="rmt-task-banner"><span class="rmt-task-dot"></span><div><b>${runtimeState.busy ? '档案整理进行中' : `${concurrentLabels.length} 项后台生成中`}</b><small>${core_text.esc(runtimeState.busy ? (runtimeState.activeTaskLabel || '正在整理聊天档案…') : concurrentLabels.join(' · '))}</small></div></div>` : '';
    const portalHtml = portals.filter(item => item.mode !== core_constants.MODE.CALENDAR).map(({ mode, session, meta }) => {
        const generated = !!session;
        const generating = core_requestCoordinator.isModeGenerating(mode);
        const capacityReached = core_requestCoordinator.activeLogicalGenerationCount() >= core_constants.MAX_CONCURRENT_GENERATION_TASKS && !generating;
        const isCalendar = mode === core_constants.MODE.CALENDAR;
        const statusText = generating
            ? (generated ? (isCalendar ? '刷新中 · 旧日历仍可查看' : '增量追加中 · 旧内容仍可查看') : '后台生成中 · 可继续启动其他入口')
            : generated ? (isCalendar ? '已整理 · 点击查看日历' : '已生成 · 点击头像查看') : '尚未生成';
        const actionText = generating ? '生成中…' : generated ? (isCalendar ? '刷新日历' : '增量追加') : (isCalendar ? '生成日历' : '生成这一项');
        return `<article class="rmt-archive-portal ${generated ? 'ready' : 'empty'} ${generating ? 'generating' : ''} rmt-archive-portal-${core_text.esc(meta.accent)}">
          <button type="button" class="rmt-portal-open" ${generated ? `data-rmt-mode="${core_text.esc(mode)}"` : 'disabled'}>
            <span class="rmt-portal-avatar"><i class="fa-solid ${core_text.esc(meta.icon)}"></i>${generated ? '<span class="rmt-portal-ready-dot">✓</span>' : '<span class="rmt-portal-lock"><i class="fa-solid fa-lock"></i></span>'}</span>
            <span class="rmt-portal-title">${core_text.esc(meta.title)}</span>
            <span class="rmt-portal-subtitle">${core_text.esc(meta.subtitle)}</span>
            <span class="rmt-portal-status">${core_text.esc(statusText)}</span>
          </button>
          <button type="button" class="rmt-btn rmt-portal-generate" data-rmt-generate-mode="${core_text.esc(mode)}" ${generated ? 'data-rmt-regenerate="true"' : ''} ${runtimeState.busy || generating || capacityReached ? 'disabled' : ''}>${core_text.esc(actionText)}</button>
        </article>`;
    }).join('');
    const memorySettings = core_settings.getPluginSettings();
    const externalSetting = memorySettings.useCurrentChatExternalMemory;
    const publicReaderSetting = memorySettings.usePublicMemoryProviderReaders;
    const detectedExternalSources = archive_repository.externalMemorySourceSummary(context);
    const preflight = archive_repository.getMemoryPreflight(context);
    const importedSources = ready ? core_text.cleanArray((memory.externalMemorySources || []).map(item => `${core_text.normalizeText(item?.label, 80)} ${Number(item?.count) || 0}条`), 8, 120) : [];
    const worldInfoSelectionText = archive_repository.memoryWorldInfoSelectionSummary(context);
    const preflightText = preflight
        ? `本次已扫描：记忆/摘要 ${preflight.sources.length} 个来源 · ${preflight.records.length} 条${preflight.worldInfo?.entries?.length ? ` · 世界书 ${preflight.worldInfo.entries.length} 条` : ''} · ${Number(preflight.totalChars || 0).toLocaleString()} 字符`
        : detectedExternalSources.length
            ? `检测到：${detectedExternalSources.map(item => item.label).join(' · ')}；建档前请先扫描一次。`
            : archive_repository.hasMemoryWorldInfoSelection(context)
                ? `${worldInfoSelectionText}；它会在扫描记忆 / 摘要时作为解释上下文一起读取。`
                : '当前没有检测到可读取的当前窗口记忆 / 摘要；仍可只用聊天正文建档。普通世界书/角色卡只作为设定参考。';
    const externalSourceText = importedSources.length ? `上次档案同步：${importedSources.join(' · ')}` : preflightText;
    const requirePreflight = externalSetting && (detectedExternalSources.length > 0 || archive_repository.hasMemoryWorldInfoSelection(context)) && !preflight;
    const externalMemoryControls = `<div class="rmt-external-memory-row">
      <label class="rmt-external-memory-toggle"><input type="checkbox" data-rmt-external-memory-toggle ${externalSetting ? 'checked' : ''} ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}> 使用当前窗口记忆 / 摘要</label>
      <label class="rmt-external-memory-toggle"><input type="checkbox" data-rmt-public-memory-toggle ${publicReaderSetting ? 'checked' : ''} ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !externalSetting ? 'disabled' : ''}> 允许第三方 current-chat reader</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:7px"><button type="button" class="rmt-btn" data-rmt-action="read-memory-plugins" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !externalSetting ? 'disabled' : ''}>扫描记忆 / 摘要</button><button type="button" class="rmt-btn" data-rmt-action="memory-worldinfo-picker" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !externalSetting ? 'disabled' : ''}>选择记忆世界书</button></div>
      <small>${core_text.esc(externalSourceText)}</small>
    </div>`;
    const generationAction = '';

    body.innerHTML = `
      <div class="rmt-archive-room">
        ${busyBanner}
        ${calendarQuick}
        <section class="rmt-memory-gate rmt-archive-card">
          <div class="rmt-memory-gate-text">
            <div class="rmt-archive-kicker">PRIVATE MEMORY ARCHIVE</div>
            <strong class="rmt-archive-title">${core_text.esc(archiveName)}</strong>
            <div class="rmt-archive-summary">${core_text.esc(archiveSummary)}</div>
            ${keywords.length ? `<div class="rmt-archive-keywords">${keywords.map(word => `<span>${core_text.esc(word)}</span>`).join('')}</div>` : ''}
            <div class="rmt-memory-status ${pendingClass}">${core_text.esc(archive_snapshots.memoryStateLabel(state))}</div>
            ${ready ? `<div class="rmt-archive-meta">上次手动更新：${core_text.esc(formatArchiveTime(memory.updatedAt || memory.createdAt))}</div>` : ''}
            ${preview ? `<div class="rmt-memory-preview">记忆索引：${core_text.esc(preview)}</div>` : ''}
          </div>
          <div class="rmt-current-archive-actions">
            <button class="rmt-btn rmt-archive-update" type="button" data-rmt-action="import-memory" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || requirePreflight ? 'disabled' : ''}>${core_text.esc(requirePreflight ? '先扫描记忆 / 摘要' : (ready ? '增量更新当前窗口档案' : importLabel))}</button>
            ${ready ? `<button class="rmt-btn" type="button" data-rmt-action="full-rebuild-memory" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || requirePreflight ? 'disabled' : ''}>完全重建档案</button><button class="rmt-btn" type="button" data-rmt-action="current-archive-delete" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}>删除当前档案</button>` : ''}
          </div>
        </section>
        ${externalMemoryControls}
        <section class="rmt-archive-portals" aria-label="档案室内容入口">${portalHtml}</section>
        ${generationAction}
      </div>`;
    ui_settingsPanel.refreshSettingsMemoryStatus();
}

export function showLoading(text) {
    topTitle('心跳回忆');
    setRegenerateVisible(false);
    setManageVisible(false);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>${core_text.esc(text)}</b><div class="rmt-loading-actions"><button type="button" class="rmt-btn" data-rmt-action="home">返回档案室</button><button type="button" class="rmt-btn" data-rmt-action="close">关闭</button></div></div></div>`;
}

export function showError(message, mode) {
    runtimeState.activeMode = mode || runtimeState.activeMode;
    topTitle('心跳回忆 · 生成失败');
    setRegenerateVisible(!!runtimeState.activeMode);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-error"><div><b>生成未通过数据校验</b><div style="margin:10px 0;white-space:pre-wrap;opacity:.78">${core_text.esc(message)}</div><button type="button" class="rmt-btn" data-rmt-action="regenerate">重试本次生成 / 追加</button></div></div>`;
}

export function showMemoryImportError(message) {
    topTitle('心跳回忆 · 档案整理失败');
    setRegenerateVisible(false);
    setManageVisible(false);
    const body = bodyEl();
    if (!body) return;
    body.innerHTML = `<div class="rmt-error"><div><b>当前聊天档案整理失败</b><div style="margin:10px 0;white-space:pre-wrap;opacity:.78">${core_text.esc(message)}</div><button type="button" class="rmt-btn" data-rmt-action="import-memory">重新整理档案</button><button type="button" class="rmt-btn" data-rmt-action="home" style="margin-left:8px">返回</button></div></div>`;
}

export function updateBackgroundTaskLabel(text) {
    const label = core_text.normalizeText(text, 240);
    const title = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-topbar-title`);
    if (title && !runtimeState.activeMode) title.textContent = '心跳回忆 · 档案室 · 后台整理中';
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
        if (title && !runtimeState.activeMode) title.textContent = '心跳回忆 · 档案室 · 后台生成中';
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
}

export function openCachedOrGenerate(mode) {
    if (runtimeState.activeArchiveSnapshot) {
        const snapshot = runtimeState.activeArchiveSnapshot;
        const cached = core_cache.loadSession(mode, { chatId: snapshot.chatId, memoryBank: snapshot.memory, cache: snapshot.cache, clone: true });
        if (cached) {
            runtimeState.activeMode = mode;
            runtimeState.activeSession = cached;
            return renderActive();
        }
        archive_library.showIndexedArchiveSnapshot(snapshot);
        globalThis.toastr?.info?.('这份旧档案还没有生成这一项。只读浏览不会替你切换聊天或发起生成。', '心跳回忆');
        return;
    }
    try {
        archive_repository.requireArchive(core_context.currentCharacterGuard());
    } catch (error) {
        showChooser();
        globalThis.toastr?.warning?.(core_text.toastText(error?.message || String(error)), '心跳回忆');
        return;
    }
    const cached = core_cache.loadSession(mode);
    if (cached) {
        runtimeState.activeMode = mode;
        runtimeState.activeSession = cached;
        renderActive();
        if (mode === core_constants.MODE.ROOM && !runtimeState.busy) void modes_room.ensureRoomLifePlan();
        return;
    }
    showChooser();
    globalThis.toastr?.info?.('这个入口还没有生成。请在档案室直接点击这个入口下方的“生成这一项”。', '心跳回忆');
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

export function renderActive() {
    runtimeState.contentManagerOpen = false;
    if (!runtimeState.activeSession || !runtimeState.activeMode) return runtimeState.activeArchiveSnapshot ? archive_library.showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot) : showChooser();
    const supportsTopbarIncrement = !core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) || runtimeState.activeMode === core_constants.MODE.PHONE;
    setRegenerateVisible((!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && supportsTopbarIncrement);
    setManageVisible((!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly) && runtimeState.activeMode !== core_constants.MODE.RELATIONS);
    setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : core_constants.ROOM_DEEP_MODES.includes(runtimeState.activeMode) ? '他的房间' : '当前档案');
    if (runtimeState.activeMode !== core_constants.MODE.ROOM) modes_room.stopRoomClock();
    if (runtimeState.activeMode !== core_constants.MODE.PHONE) ui_phoneView.stopPhoneClock();
    if (runtimeState.activeMode === core_constants.MODE.BUTTERFLY) ui_butterflyView.renderButterfly();
    else if (runtimeState.activeMode === core_constants.MODE.ALBUM) ui_albumView.renderAlbum();
    else if (runtimeState.activeMode === core_constants.MODE.ADV) ui_advEventView.renderAdvMode();
    else if (runtimeState.activeMode === core_constants.MODE.ROOM) modes_room.renderRoom();
    else if (runtimeState.activeMode === core_constants.MODE.ITEMS) modes_items.renderItems();
    else if (runtimeState.activeMode === core_constants.MODE.PHONE) ui_phoneView.renderPhone();
    else if (runtimeState.activeMode === core_constants.MODE.ENDING) ui_endingView.renderEnding();
    else if (runtimeState.activeMode === core_constants.MODE.CALENDAR) ui_calendarView.renderCalendar();
    else if (runtimeState.activeMode === core_constants.MODE.RELATIONS) modes_relations.renderRelations();
    else if (runtimeState.activeMode === core_constants.MODE.ACHIEVEMENTS) modes_achievements.renderAchievements();
    else if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    decorateReadOnlyModeUi();
}


function managedTargetRecord(type, id, parentId = '') {
    return ui_contentManager.managementTargetsForSession(runtimeState.activeSession).find(item =>
        item.type === core_text.normalizeText(type, 60)
        && item.id === core_text.normalizeText(id, 120)
        && item.parentId === core_text.normalizeText(parentId, 120)
    ) || null;
}

function markUserManaged(session) {
    if (session && typeof session === 'object') session.userManaged = true;
    return session;
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
        updated.entries = removeById(updated.entries, id);
    } else if (type === 'calendar-note') {
        updated.stickyNotes = removeById(updated.stickyNotes, id);
    } else if (type === 'calendar-mood') {
        updated.moodNotes = removeById(updated.moodNotes, id);
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
    if (!core_cache.saveSession(runtimeState.activeMode, updated, expectedChatId)) throw new Error('当前派生缓存版本已经变化，本次修改没有写入。');
    runtimeState.activeSession = updated;
    return true;
}

async function deleteManagedTarget(type, id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const record = managedTargetRecord(type, id, parentId);
    if (!record || !ui_contentManager.isManageableTargetType(type) || record.canDelete === false) return;
    if (!confirmExplicitActionTwice(
        `删除「${record.label}」？`,
        '只删除当前心跳回忆派生缓存中的这一项；正式聊天档案 Mxxx、SillyTavern 聊天正文和世界书都不会修改。删除后如想恢复，需要重新生成。',
        { destructive: true },
    )) return;
    try {
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        const memoryBank = archive_repository.requireArchive(context);
        const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
        const base = core_cache.loadSession(runtimeState.activeMode, { context, chatId: expectedChatId, memoryBank, clone: true });
        if (!base) throw new Error('当前分类缓存已经变化，请返回后重新打开再操作。');
        const updated = deleteManagedTargetFromSession(base, type, id, parentId);
        await commitManagedSession(updated, expectedChatId, memoryBank.archiveRevision, origin);
        globalThis.toastr?.success?.(`已删除：${record.label}`, '心跳回忆');
        ui_contentManager.renderContentManager();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
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
    const mode = runtimeState.activeMode;
    try {
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        const memoryBank = archive_repository.requireArchive(context);
        const expectedArchiveRevision = memoryBank.archiveRevision;
        const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
        const base = core_cache.loadSession(mode, { context, chatId: expectedChatId, memoryBank, clone: true });
        if (!base) throw new Error('当前分类缓存已经变化，请返回后重新打开再操作。');
        const taskKey = `manage:${core_context.chatScopeKey(context)}:${core_text.normalizeText(type, 60)}:${core_text.normalizeText(id, 120)}`;
        setInnerLoading(true, `正在重新生成「${record.label}」…`);
        const updated = await generation_contentRegeneration.regenerateManagedTarget(base, type, id, parentId, { context, memoryBank, origin, taskKey });
        await commitManagedSession(updated, expectedChatId, expectedArchiveRevision, origin);
        globalThis.toastr?.success?.(`已重新生成：${record.label}`, '心跳回忆');
        ui_contentManager.renderContentManager();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    } finally {
        setInnerLoading(false);
    }
}

async function deleteManagedCategory() {
    if (!runtimeState.activeMode || !archive_library.requireWritableArchiveAction()) return;
    const mode = runtimeState.activeMode;
    const label = core_constants.MODE_LABEL[mode] || mode;
    const cascade = mode === core_constants.MODE.ROOM ? [core_constants.MODE.ROOM, core_constants.MODE.ITEMS, core_constants.MODE.PHONE] : [mode];
    if (!confirmExplicitActionTwice(
        `删除整个「${label}」？`,
        `${mode === core_constants.MODE.ROOM ? '“他的物品”和“私人终端”依赖房间结构，也会一起清除。' : ''}只删除这些派生缓存，不删除正式档案 Mxxx 或聊天正文。`,
        { destructive: true },
    )) return;
    try {
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        await core_cache.deleteSessions(cascade, expectedChatId);
        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        runtimeState.contentManagerOpen = false;
        globalThis.toastr?.success?.(`已删除整个分类：${label}`, '心跳回忆');
        showChooser();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    }
}

async function regenerateManagedCategory() {
    if (!runtimeState.activeMode || !archive_library.requireWritableArchiveAction()) return;
    const mode = runtimeState.activeMode;
    const label = core_constants.MODE_LABEL[mode] || mode;
    if (!confirmExplicitActionTwice(
        `重新生成整个「${label}」？`,
        `成功后会用全新的分类基础内容替换当前分类；旧内容在新结果成功写入之前会一直保留。${mode === core_constants.MODE.ROOM ? '房间成功替换后，会清除依赖旧结构的“他的物品”和“私人终端”，需要重新生成。' : ''} 实图/可选长正文等独立子内容可继续使用各自的单项重新生成按钮。正式档案不会修改。`,
        { destructive: true },
    )) return;
    runtimeState.contentManagerOpen = false;
    const fresh = await generation_client.generateMode(mode, { background: false, replaceExisting: true });
    if (fresh && mode === core_constants.MODE.ROOM) {
        try {
            const context = core_context.currentCharacterGuard();
            await core_cache.deleteSessions([core_constants.MODE.ITEMS, core_constants.MODE.PHONE], core_context.getChatId(context));
        } catch (error) {
            console.warn('[HeartbeatMemories] room dependent cache invalidation after replacement failed', error);
        }
    }
}

export function handleOverlayClick(event) {
    const generateModeButton = event.target.closest?.('[data-rmt-generate-mode]');
    if (generateModeButton) {
        const mode = generateModeButton.dataset.rmtGenerateMode;
        if (!archive_library.requireWritableArchiveAction()) return;
        if (generateModeButton.dataset.rmtRegenerate === 'true' && !confirmModeRegeneration(mode)) return;
        void generation_client.generateMode(mode, { background: true });
        return;
    }
    const modeButton = event.target.closest?.('[data-rmt-mode]');
    if (modeButton) {
        openCachedOrGenerate(modeButton.dataset.rmtMode);
        return;
    }
    const calendarShift = event.target.closest?.('[data-rmt-calendar-shift]');
    if (calendarShift) return ui_calendarView.shiftCalendarMonth(calendarShift.dataset.rmtCalendarShift);
    const calendarDate = event.target.closest?.('[data-rmt-calendar-date]');
    if (calendarDate) return ui_calendarView.selectCalendarDate(calendarDate.dataset.rmtCalendarDate);
    const calendarPending = event.target.closest?.('[data-rmt-calendar-pending]');
    if (calendarPending) return ui_calendarView.selectCalendarPending(calendarPending.dataset.rmtCalendarPending);
    const calendarMonth = event.target.closest?.('[data-rmt-calendar-month]');
    if (calendarMonth) return ui_calendarView.setCalendarMonth(calendarMonth.dataset.rmtCalendarMonth);
    const node = event.target.closest?.('[data-rmt-node]');
    if (node) return ui_butterflyView.selectButterflyNode(node.dataset.rmtNode);
    const endingView = event.target.closest?.('[data-rmt-ending-view]');
    if (endingView) return ui_endingView.endingSetView(endingView.dataset.rmtEndingView);
    const confessionReplay = event.target.closest?.('[data-rmt-confession-id]');
    if (confessionReplay) return ui_endingView.confessionSelect(confessionReplay.dataset.rmtConfessionId);
    const endingRoute = event.target.closest?.('[data-rmt-ending-id]');
    if (endingRoute) return ui_endingView.endingSelect(endingRoute.dataset.rmtEndingId);
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
    const publicMemoryToggle = event.target.closest?.('[data-rmt-public-memory-toggle]');
    if (publicMemoryToggle) {
        core_settings.updatePluginSettings({ usePublicMemoryProviderReaders: !!publicMemoryToggle.checked });
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
    if (runtimeState.activeArchiveSnapshot && ['regenerate', 'draw-cg', 'clear-cg-image', 'draw-heart-strip', 'clear-heart-strip', 'generate-all-adv', 'repair-failed-adv', 'room-life-refresh', 'import-memory', 'full-rebuild-memory', 'read-memory-plugins', 'memory-worldinfo-picker', 'refresh-ending-confessions', 'heart-generate-part', 'heart-generate-season'].includes(action)) {
        if (!archive_library.requireWritableArchiveAction()) return;
    }
    if (action === 'back') return navigateBack();
    if (action === 'close') return closeArchiveOverlayFromUser();
    if (action === 'home' || action === 'library-home') {
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
    if (action === 'heart-generate-season') return void modes_heart.generateHeartSeasonSection(actionEl.dataset.rmtHeartSeasonTarget || 'postending');
    if (action === 'heart-drama-prev') return ui_heartView.heartStepDrama(-1);
    if (action === 'heart-drama-next') return ui_heartView.heartStepDrama(1);
    if (action === 'heart-firefly-prev') return ui_heartView.heartStepFireflyPage(-1);
    if (action === 'heart-firefly-next') return ui_heartView.heartStepFireflyPage(1);
    if (action === 'avatar-talk-again') return ui_heartView.renderAvatarDialoguePopup(runtimeState.activeAvatarDialogue, { repeat: true });
    if (action === 'avatar-heart-open') return ui_heartView.openHeartFromAvatar();
    if (action === 'avatar-heart-generate') {
        const state = runtimeState.activeAvatarDialogue;
        if (!state?.entry || state.readOnly || !generation_imageGeneration.indexedArchiveMatchesCurrentChat(state.entry, core_context.getContext())) {
            globalThis.toastr?.info?.('只有当前真实聊天对应的档案可以生成角色互动。', '心跳回忆');
            return;
        }
        bodyEl()?.querySelector('.rmt-avatar-dialog-pop')?.remove();
        runtimeState.activeAvatarDialogue = null;
        if (!confirmExplicitAction('生成角色互动？', '先生成关系状态与头像专属时期台词。之后可在角色互动页单独生成未来/春夏秋冬 Drama 与日常一格。', { destructive: false })) return;
        return void generation_client.generateMode(core_constants.MODE.HEART, { background: true });
    }
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
            globalThis.toastr?.success?.('当前聊天的心跳回忆档案已删除；聊天正文没有删除。', '心跳回忆');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'));
        return;
    }
    if (action === 'read-memory-plugins') return void archive_repository.readCurrentChatMemoryPlugins().catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'));
    if (action === 'memory-worldinfo-picker') return void archive_repository.showMemoryWorldInfoPicker();
    if (action === 'memory-worldinfo-close') { document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-memory-wi-picker`)?.remove(); return showChooser(); }
    if (action === 'memory-worldinfo-expand') return void archive_repository.expandMemoryWorldInfoBook(actionEl);
    if (action === 'archive-group-manager') return archive_library.showArchiveGroupManager();
    if (action === 'archive-group-close') { document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`)?.remove(); return archive_library.showArchiveLibrary(); }
    if (action === 'archive-character-delete') {
        const groupId = core_text.normalizeText(actionEl.dataset.rmtArchiveGroupId, 120);
        try {
            const deleted = archive_groups.deleteArchiveCharacterFromLibrary(groupId);
            if (!deleted) return;
            globalThis.toastr?.success?.(`已从档案室删除“${deleted.name}”及其 ${deleted.count} 个聊天档案索引；SillyTavern 正文聊天窗口没有删除。`, '心跳回忆');
            archive_library.showArchiveLibrary();
        } catch (error) { globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'); }
        return;
    }
    if (action === 'character-profile-generate') {
        const groupId = core_text.normalizeText(runtimeState.archiveLibraryCharacterKey, 120);
        if (!groupId) return globalThis.toastr?.info?.('请先打开一个角色档案。', '心跳回忆');
        if (!confirmExplicitAction('读取角色固定设定并生成 Character Profile？', '只会读取该角色卡、当前 User Persona 与本轮激活到的相关世界书，整理全窗口共用的客观资料和故事开始前已经明确成立的人际关系。不会读取聊天正文，也不会把某个聊天窗口的发展写进公共角色档案。', { destructive: false })) return;
        void modes_relations.generateCharacterProfileForGroup(groupId).then(() => {
            globalThis.toastr?.success?.('角色档案与固有人际已更新。', '心跳回忆');
            archive_library.showArchiveCharacter(groupId);
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆 · Character Profile'));
        return;
    }
    if (action === 'relation-select') {
        const key = core_text.normalizeText(actionEl.dataset.rmtRelationKey, 160);
        if (runtimeState.activeMode === core_constants.MODE.RELATIONS) {
            runtimeState.relationSelectedKey = key;
            return modes_relations.renderRelations();
        }
        if (runtimeState.archiveViewLevel === 'character' && runtimeState.archiveLibraryCharacterKey) {
            runtimeState.archiveCharacterRelationSelection = key;
            return archive_library.showArchiveCharacter(runtimeState.archiveLibraryCharacterKey);
        }
        return;
    }
    if (action === 'archive-auto-classify') {
        const changed = archive_groups.autoClassifyArchiveIndex(core_context.getContext(), { confirm: true });
        if (changed) globalThis.toastr?.success?.(`已自动分类 ${changed} 个档案索引。聊天文件没有移动。`, '心跳回忆');
        const manager = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`);
        return manager ? archive_library.showArchiveGroupManager() : archive_library.showArchiveLibrary();
    }
    if (action === 'archive-group-create') {
        const select = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-new-character]`);
        if (!select?.value) return globalThis.toastr?.info?.('先选择一个 SillyTavern char。', '心跳回忆');
        try { archive_groups.createArchiveGroupForCharacter(core_context.getContext(), Number(select.value)); globalThis.toastr?.success?.('已新建角色档案组。现在可以把档案移动进去。', '心跳回忆'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'); }
        return;
    }
    if (action === 'archive-group-move') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        const select = [...document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-archive-move-select]`)].find(node => node.dataset.rmtArchiveMoveSelect === entryId);
        try { archive_groups.moveArchiveIndexEntryToGroup(core_context.getContext(), entryId, select?.value || '__AUTO__'); globalThis.toastr?.success?.('档案分类已更新；聊天文件没有移动。', '心跳回忆'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'); }
        return;
    }
    if (action === 'archive-remove-index') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        try {
            if (archive_groups.removeIndexedArchiveFromLibrary(entryId)) {
                globalThis.toastr?.success?.('已从档案室移除索引；聊天文件和真实档案未删除。', '心跳回忆');
                archive_library.showArchiveGroupManager();
            }
        } catch (error) { globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'); }
        return;
    }
    if (action === 'archive-delete-live') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        void archive_groups.deleteCurrentHeartbeatArchive(entryId).then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.('当前聊天的心跳回忆档案已删除；聊天正文没有删除。', '心跳回忆');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'));
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
    if (action === 'full-rebuild-memory') return requestCurrentArchiveFullRebuild();
    if (action === 'archive-overview-refresh') return archive_snapshots.renderArchiveOverviewAsync({ force: true });
    if (action === 'regenerate') {
        if (!runtimeState.activeMode || !confirmModeRegeneration(runtimeState.activeMode)) return;
        if (runtimeState.activeMode === core_constants.MODE.HEART && runtimeState.activeSession?.kind === core_constants.MODE.HEART) {
            return void modes_heart.generateHeartSection('dialogues');
        }
        return generation_client.generateMode(runtimeState.activeMode, { background: false });
    }
    if (action === 'refresh-ending-confessions') return void ui_endingView.refreshEndingConfessionReplays();
    if (action === 'ending-confession-prev') return ui_endingView.endingConfessionStep(-1);
    if (action === 'ending-confession-next') return ui_endingView.endingConfessionStep(1);
    if (action === 'ending-confession-replay') return ui_endingView.replayEndingConfession();
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
    if (action === 'read-adv') return modes_advEvent.generateAdvForSelected();
    if (action === 'room-presence') return modes_room.roomPresenceNext();
    if (action === 'room-find-presence') return modes_room.roomFindPresence();
    if (action === 'room-life-refresh') {
        if (!confirmRoomLifeRefresh()) return;
        return modes_room.ensureRoomLifePlan({ force: true });
    }
    if (action === 'room-open-items') return modes_room.openRoomDeepMode(core_constants.MODE.ITEMS);
    if (action === 'room-open-phone') return modes_room.openRoomDeepMode(core_constants.MODE.PHONE);
    if (action === 'room-deep-back') return modes_room.returnToRoomFromDeep();
    if (action === 'phone-entry-back') return ui_phoneView.phoneEntryBack();
    if (action === 'items-open') return modes_items.itemsOpenSelected();
    if (action === 'items-back') return modes_items.itemsBack();
    if (action === 'adv-event-prev') return ui_advEventView.advEventStep(-1);
    if (action === 'adv-event-next') return ui_advEventView.advEventStep(1);
    if (action === 'adv-prev') return ui_advEventView.advStep(-1);
    if (action === 'adv-next') return ui_advEventView.advStep(1);
}

export function handleOverlayChange(event) {
    const advSelectEl = event.target.closest?.('[data-rmt-adv-select]');
    if (advSelectEl) return ui_advEventView.advSelect(advSelectEl.value);
    const allToggle = event.target.closest?.('[data-rmt-memory-wi-all]');
    if (allToggle) {
        const context = core_context.currentCharacterGuard();
        const world = core_text.normalizeText(allToggle.dataset.rmtMemoryWiAll, 240);
        const selection = archive_repository.getMemoryWorldInfoSelection(context);
        if (allToggle.checked && !selection.books.some(book => book.name === world) && selection.books.length >= core_constants.MAX_MEMORY_WORLD_INFO_BOOKS) {
            allToggle.checked = false;
            globalThis.toastr?.warning?.(`最多选择 ${core_constants.MAX_MEMORY_WORLD_INFO_BOOKS} 本记忆相关世界书。`, '心跳回忆');
            return;
        }
        archive_repository.updateMemoryWorldInfoBookSelection(context, world, { all: !!allToggle.checked, entryUids: [] });
        const section = allToggle.closest?.('[data-rmt-memory-wi-book]');
        section?.querySelectorAll?.('[data-rmt-memory-wi-entry]').forEach(input => { input.disabled = !!allToggle.checked; if (allToggle.checked) input.checked = false; });
        return;
    }
    const entryToggle = event.target.closest?.('[data-rmt-memory-wi-entry]');
    if (entryToggle) {
        const context = core_context.currentCharacterGuard();
        const world = core_text.normalizeText(entryToggle.dataset.rmtMemoryWiEntry, 240);
        const uid = core_text.normalizeText(entryToggle.dataset.rmtMemoryWiUid, 120);
        const selection = archive_repository.getMemoryWorldInfoSelection(context);
        const current = selection.books.find(item => item.name === world);
        if (entryToggle.checked && !current && selection.books.length >= core_constants.MAX_MEMORY_WORLD_INFO_BOOKS) {
            entryToggle.checked = false;
            globalThis.toastr?.warning?.(`最多选择 ${core_constants.MAX_MEMORY_WORLD_INFO_BOOKS} 本记忆相关世界书。`, '心跳回忆');
            return;
        }
        const set = new Set(current?.all ? [] : (current?.entryUids || []));
        if (entryToggle.checked && !set.has(uid) && set.size >= core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES) {
            entryToggle.checked = false;
            globalThis.toastr?.warning?.(`每次最多精确选择 ${core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES} 个世界书条目。`, '心跳回忆');
            return;
        }
        if (entryToggle.checked) set.add(uid); else set.delete(uid);
        archive_repository.updateMemoryWorldInfoBookSelection(context, world, { all: false, entryUids: [...set] });
        return;
    }
}
