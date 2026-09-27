import * as ui_workspaceState from './workspaceState.js';
import * as ui_workspace from './workspace.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as archive_importRecovery from '../archive/importRecovery.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_diagnosticReport from '../core/diagnosticReport.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_endingView from './endingView.js';
import * as ui_overlay from './overlay.js';
import * as navigation_bookmark from './navigationBookmark.js';
import * as room from '../modes/room.js';
import * as ui_settingsPanel from './settingsPanel.js';
import * as home_view from './homeView.js';
export const showHome = options => home_view.showHome(options);

export function mountMenuItem() {
    if (document.getElementById(core_constants.MENU_ID)) return true;
    const menu = document.querySelector('#extensionsMenu');
    if (!menu) return false;
    const item = document.createElement('div');
    item.id = core_constants.MENU_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = '<span class="rmt-wand-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 auto"><svg style="display:block;width:18px;height:18px" focusable="false" viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 16C4 2 11 1 14 14M18 14C20 1 27 2 23 16M9 16c-7 11 3 15 9 14s13-8 5-14c-4-3-10-3-14 0Z"/><path d="M12 22h1m6 0h1m-6 4 2 1 2-1"/></svg></span><span>心迹回廊</span>';
    const open = () => safeShowArchiveLibrary('extensions-menu');
    item.addEventListener('click', open);
    item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    });
    menu.appendChild(item);
    return true;
}

export function archiveOpenButtonFromEvent(event) {
    const selector = '#heartbeat_memories_menu_item';
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
        if (node?.matches?.(selector)) return node;
    }
    return event?.target?.closest?.(selector) || null;
}

export function safeShowArchiveLibrary(source = 'unknown') {
    try {
        ui_workspaceState.loadWorkspacePreferences();
        if (runtimeState.pendingArchiveEntry === 'chooser') {
            runtimeState.pendingArchiveEntry = '';
            ui_overlay.showChooser();
            return true;
        }
        if (ui_workspaceState.workspace.restore && navigation_bookmark.restorePagePosition({ home: showHome, chooser: ui_overlay.showChooser,
            library: archive_library.showArchiveLibrary, character: archive_library.showArchiveCharacter })) return true;
        if (ui_workspaceState.workspace.restore && navigation_bookmark.restoreReadingPosition({ open: ui_overlay.openOverlay, render: ui_overlay.renderActive, stopAutomaticLife: room.stopRoomClock })) return true;
        if (ui_workspaceState.workspace.restore && navigation_bookmark.hasIndexedReadingPosition()) {
            // Keep the public synchronous boolean contract. Indexed restoration
            // performs a read-only canonical fetch and cancels on chat/lifecycle changes.
            void navigation_bookmark.restoreIndexedReadingPosition({ open: ui_overlay.openOverlay, render: ui_overlay.renderActive,
                renderSnapshot: archive_library.showIndexedArchiveSnapshot, stopAutomaticLife: room.stopRoomClock, fallback: () => {
                    showHome();
                } });
            return true;
        }
        if (ui_workspaceState.workspace.startup === 'settings') showHome();
        else ui_workspace.openWorkspaceTab(ui_workspaceState.workspace.startup);
        return true;
    } catch (error) {
        console.error(`[HeartbeatMemories] open archive failed (${core_text.normalizeText(source, 80)})`, core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.(`档案室打开失败：${core_text.toastText(core_text.safeErrorSummary(error))}`, '心迹回廊');
        return false;
    }
}

export function bindRobustArchiveOpenHandlers() {
    try { globalThis.__heartbeatMemoriesOpenCleanup?.(); } catch {}
    let lastOpenAt = 0;
    const earlyHandler = event => {
        const button = archiveOpenButtonFromEvent(event);
        if (!button) return;
        if (event.type === 'pointerdown' && Number(event.button ?? 0) !== 0) return;
        const now = Date.now();
        if (now - lastOpenAt < 700) return;
        lastOpenAt = now;
        // Do NOT preventDefault/stopPropagation here. SillyTavern mobile sets body touch-action:none
        // and owns the settings drawer gesture lifecycle. We only observe the earliest gesture and
        // open our mobile dialog in the browser top layer, then let the host finish its own gesture.
        safeShowArchiveLibrary(`early-${event.type}`);
    };
    const touchOptions = { capture: true, passive: true };
    document.addEventListener('touchstart', earlyHandler, touchOptions);
    document.addEventListener('pointerdown', earlyHandler, true);
    globalThis.__heartbeatMemoriesOpenCleanup = () => {
        document.removeEventListener('touchstart', earlyHandler, touchOptions);
        document.removeEventListener('pointerdown', earlyHandler, true);
    };
}

// SillyTavern controls that leave or destroy the chat the user is generating in.
// Matching one of these while a chat-bound task is running raises a confirmation
// instead of silently pushing the result into the deferred-commit queue.
const HOST_CHAT_NAVIGATION_SELECTOR = [
    '.character_select',
    '.group_select',
    '.select_chat_block',
    '#rm_button_characters',
    '#rm_button_group_chats',
    '#option_select_chat',
    '#option_start_new_chat',
    '#option_close_chat',
    '#option_delete_chat',
    '#option_delete_mes',
    '#your_name_button',
    '.renew_chat_button',
    '.delete_chat_button',
].join(', ');

export function hostChatNavigationTargetFromEvent(event) {
    const target = event?.target;
    if (!target?.closest) return null;
    try { return target.closest(HOST_CHAT_NAVIGATION_SELECTOR); } catch { return null; }
}

// Diagnostics must stay reachable when the archive room will not open, so this is bound
// on the settings page and never calls a generation API, writes an archive, or retries.
export function bindDiagnosticCopy() {
    try { globalThis.__heartbeatMemoriesDiagnosticCleanup?.(); } catch {}
    const onClick = event => {
        const button = event.target?.closest?.('[data-rmt-copy-diagnostic], [data-rmt-export-diagnostic]');
        if (!button) return;
        const panel = button.closest?.('[data-rmt-diagnostic-panel]');
        if (!panel?.closest?.('#' + core_constants.SETTINGS_ID)) return;
        event.preventDefault();
        const output = panel.querySelector('[data-rmt-performance-diagnostic-output]');
        const status = panel.querySelector('[data-rmt-diagnostic-status]');
        if (typeof globalThis.__heartbeatMemoriesDeliverDiagnostic === 'function') {
            void globalThis.__heartbeatMemoriesDeliverDiagnostic(
                button.hasAttribute('data-rmt-export-diagnostic') ? 'export' : 'copy', { output, status });
            return;
        }
        const text = core_diagnosticReport.diagnosticReportText();
        panel.hidden = false;
        if (output) { output.hidden = false; output.textContent = text; }
        const done = ok => globalThis.toastr?.[ok ? 'success' : 'info']?.(
            ok ? '诊断报告已复制，可直接发给开发者。' : '无法访问剪贴板，报告已显示在下方，可手动复制。', '心迹回廊 · 诊断');
        try {
            const write = globalThis.navigator?.clipboard?.writeText?.(text);
            if (write?.then) write.then(() => done(true)).catch(() => done(false));
            else done(false);
        } catch { done(false); }
    };
    document.addEventListener('click', onClick, true);
    globalThis.__heartbeatMemoriesDiagnosticCleanup = () => document.removeEventListener('click', onClick, true);
}

export function bindGenerationNavigationGuards() {
    try { globalThis.__heartbeatMemoriesNavigationGuardCleanup?.(); } catch {}
    const navigationGuard = event => {
        const target = hostChatNavigationTargetFromEvent(event);
        if (!target) return;
        if (!core_requestCoordinator.hasCurrentChatBlockingTask()) return;
        const tasks = core_requestCoordinator.currentChatBlockingTasks();
        const confirmed = ui_overlay.confirmExplicitAction(
            '切换聊天会中止当前任务',
            `当前聊天还有这些任务：\n${tasks.map(label => `· ${label}`).join('\n')}\n\n继续切换会中止它们。已经确认落盘的成果会保留，未完成部分会停止，不会自动重试。`,
            { destructive: true },
        );
        if (!confirmed) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        let scope = '';
        try { scope = core_context.chatScopeKey(core_context.currentCharacterGuard()); } catch {}
        runtimeState.chatNavigationPermit = {
            scope,
            at: Date.now(),
            targetKind: String(target.id || target.className || 'host-nav').slice(0, 80),
        };
        core_requestCoordinator.cancelCurrentChatBlockingTasks(null, 'chat-navigation-confirm');
        ui_overlay.invalidateArchiveViewForChatNavigation('');
    };

    const unloadGuard = event => {
        // A full-page unload affects every chat-bound task, not only the chat currently
        // visible. It can also interrupt a completed result while it is awaiting writeback.
        if (!core_requestCoordinator.hasUnloadRisk()) return;
        event.preventDefault();
        event.returnValue = '';
        return '';
    };

    document.addEventListener('click', navigationGuard, true);
    globalThis.addEventListener?.('beforeunload', unloadGuard);
    globalThis.__heartbeatMemoriesNavigationGuardCleanup = () => {
        document.removeEventListener('click', navigationGuard, true);
        globalThis.removeEventListener?.('beforeunload', unloadGuard);
    };
}

// Emergency persist when the page is about to be frozen: switching to another
// app/tab, locking the screen, or the host page being discarded. This only
// re-saves data that has already been received; it never starts, cancels or
// retries a task, and it deliberately does not touch runtimeLifecycleEpoch —
// bumping the epoch here would kill in-flight tasks and their deferred writeback.
export async function persistPendingResultsForBackground(reason = 'hidden') {
    try { runtimeState.deferredChatCommits?.persistNow?.(); } catch (error) {
        console.warn(`[HeartbeatMemories] background deferred-commit persist failed (${core_text.normalizeText(reason, 40)})`, core_text.safeErrorDiagnostic(error));
    }
    void core_cache.flushPendingCompressedCacheForCurrentChat().catch(error => {
        console.warn('[HeartbeatMemories] background pending cache flush failed', core_text.safeErrorDiagnostic(error));
    });
    const origins = [];
    try { origins.push(core_context.captureTaskOrigin(core_context.currentCharacterGuard(), '')); } catch {}
    if (runtimeState.activeTaskOrigin?.characterKey && runtimeState.activeTaskOrigin?.chatId) origins.push(runtimeState.activeTaskOrigin);
    const seen = new Set();
    for (const origin of origins) {
        const fingerprint = JSON.stringify([origin?.characterId ?? '', origin?.characterAvatar || origin?.characterKey || '', origin?.chatId || '']);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        for (const operation of ['import', 'profile']) {
            try {
                if (!archive_importRecovery.listArchiveRecoveryDrafts(origin, operation).length) continue;
                await archive_importRecovery.flushArchiveRecovery(origin, operation);
            } catch (error) {
                console.warn('[HeartbeatMemories] background archive draft flush failed', core_text.safeErrorDiagnostic(error));
            }
        }
    }
}

function bindBackgroundLifecycleGuards() {
    const onVisibility = () => {
        if (globalThis.document?.visibilityState !== 'hidden') return;
        void persistPendingResultsForBackground('hidden');
    };
    const onPageHide = () => { void persistPendingResultsForBackground('pagehide'); };
    globalThis.document?.addEventListener?.('visibilitychange', onVisibility);
    globalThis.addEventListener?.('pagehide', onPageHide);
    return () => {
        globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
        globalThis.removeEventListener?.('pagehide', onPageHide);
    };
}

export function bindChatStateEvents() {
    try { globalThis.__heartbeatMemoriesEventCleanup?.(); } catch {}
    const backgroundCleanup = bindBackgroundLifecycleGuards();
    const context = core_context.getContext();
    const source = context.eventSource;
    const types = context.eventTypes || context.event_types || {};
    if (!source?.on) {
        globalThis.__heartbeatMemoriesEventCleanup = backgroundCleanup;
        return;
    }

    try { runtimeState.chatNavigationScope = core_context.chatScopeKey(core_context.currentCharacterGuard()); } catch {}
    const chatEvents = [types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean);
    const messageEvents = [
        types.MESSAGE_SENT,
        types.MESSAGE_RECEIVED,
        types.MESSAGE_EDITED,
        types.MESSAGE_DELETED,
        types.MESSAGE_UPDATED,
    ].filter(Boolean);

    const chatHandler = () => {
        runtimeState.chatNavigationEpoch += 1;
        ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
        let nextScope = '';
        let nextChatId = '';
        try {
            const latest = core_context.currentCharacterGuard();
            nextScope = core_context.chatScopeKey(latest);
            nextChatId = core_context.comparableChatId(core_context.getChatId(latest));
        } catch {}
        const previousScope = runtimeState.chatNavigationScope || '';
        const permit = runtimeState.chatNavigationPermit;
        const permitFresh = !!permit && permit.scope === previousScope && Date.now() - permit.at < 8000;
        runtimeState.chatNavigationPermit = null;
        if (previousScope && previousScope !== nextScope) {
            const result = core_requestCoordinator.cancelBlockingTasksForScope(previousScope, 'chat-changed');
            if (result.cancelled > 0 && !permitFresh) {
                globalThis.toastr?.warning?.('已切换聊天，原聊天未完成任务已中止。已保存的成果保留，未完成部分不会自动重试。', '心迹回廊');
            }
            ui_overlay.invalidateArchiveViewForChatNavigation(nextChatId);
        }
        runtimeState.chatNavigationScope = nextScope;
        ui_settingsPanel.refreshSettingsMemoryStatus({ lightweight: true });
        // Chat events must not hydrate the new chat or reopen the archive.
        setTimeout(() => {
            void core_cache.flushPendingCompressedCacheForCurrentChat().catch(error => {
                console.warn('[HeartbeatMemories] pending compressed cache flush failed', core_text.safeErrorDiagnostic(error));
            });
            void archive_repository.flushDeferredCommitsForCurrentChat();
        }, 160);
    };

    const messageHandler = () => {
        // Important: message changes NEVER mutate or invalidate the archive.
        // They only refresh the optional “not yet archived” counter. The user decides when to update.
        try {
            const latest = core_context.currentCharacterGuard();
            archive_repository.clearMemoryPreflight(latest);
            runtimeState.usableMessageCountCache.delete(core_context.chatScopeKey(latest));
        } catch {}
        ui_settingsPanel.refreshSettingsMemoryStatus({ lightweight: true });
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        if (overlay && !overlay.hidden && !runtimeState.activeMode && !runtimeState.busy) archive_snapshots.scheduleChooserRefresh(80);
    };

    for (const type of chatEvents) source.on(type, chatHandler);
    for (const type of messageEvents) source.on(type, messageHandler);
    // The full runtime can load after SillyTavern's initial CHAT_LOADED event. Recover
    // durable results for the already-open chat instead of waiting for another navigation.
    void archive_repository.flushDeferredCommitsForCurrentChat().catch(error => {
        console.warn('[HeartbeatMemories] initial deferred commit recovery failed', core_text.safeErrorDiagnostic(error));
    });
    globalThis.__heartbeatMemoriesEventCleanup = () => {
        backgroundCleanup();
        for (const type of chatEvents) {
            try { source.off?.(type, chatHandler); } catch {}
        }
        for (const type of messageEvents) {
            try { source.off?.(type, messageHandler); } catch {}
        }
    };
}

export function scheduleMounts(initialSettingsMounted = false, initialMenuMounted = false) {
    let tries = 0;
    let settingsMounted = !!initialSettingsMounted || !!document.getElementById(core_constants.SETTINGS_ID);
    let menuMounted = !!initialMenuMounted || !!document.getElementById(core_constants.MENU_ID);
    if (settingsMounted && menuMounted) return;
    const timer = setInterval(() => {
        tries += 1;
        // Retry only the missing mount. Calling mountSettings() after it already exists used
        // to rebuild profile/model controls every 500 ms while #extensionsMenu was not ready.
        if (!settingsMounted) settingsMounted = !!document.getElementById(core_constants.SETTINGS_ID) || ui_settingsPanel.mountSettings();
        if (!menuMounted) menuMounted = !!document.getElementById(core_constants.MENU_ID) || mountMenuItem();
        if ((settingsMounted && menuMounted) || tries >= 30) {
            clearInterval(timer);
            if (globalThis.__heartbeatMemoriesMountTimer === timer) globalThis.__heartbeatMemoriesMountTimer = null;
        }
    }, 500);
    globalThis.__heartbeatMemoriesMountTimer = timer;
}
