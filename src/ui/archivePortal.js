// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_settingsPanel from './settingsPanel.js';

export function mountMenuItem() {
    if (document.getElementById(core_constants.MENU_ID)) return true;
    const menu = document.querySelector('#extensionsMenu');
    if (!menu) return false;
    const item = document.createElement('div');
    item.id = core_constants.MENU_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>心跳回忆 · 档案室</span>';
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
    const selector = '[data-rmt-settings-open-archive], #heartbeat_memories_menu_item';
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
        if (node?.matches?.(selector)) return node;
    }
    return event?.target?.closest?.(selector) || null;
}

export function safeShowArchiveLibrary(source = 'unknown') {
    try {
        archive_library.showArchiveLibrary();
        return true;
    } catch (error) {
        console.error(`[HeartbeatMemories] open archive failed (${source})`, error);
        globalThis.toastr?.error?.(`档案室打开失败：${core_text.toastText(error?.message || error)}`, '心跳回忆');
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

export function bindChatStateEvents() {
    try { globalThis.__heartbeatMemoriesEventCleanup?.(); } catch {}
    const context = core_context.getContext();
    const source = context.eventSource;
    const types = context.eventTypes || context.event_types || {};
    if (!source?.on) return;

    const chatEvents = [types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean);
    const messageEvents = [
        types.MESSAGE_SENT,
        types.MESSAGE_RECEIVED,
        types.MESSAGE_EDITED,
        types.MESSAGE_DELETED,
        types.MESSAGE_UPDATED,
    ].filter(Boolean);

    const chatHandler = () => {
        // Chat navigation must not cancel a request that is already running. Results are
        // bound to their origin chat and are committed when that chat is current again.
        if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        ui_settingsPanel.refreshSettingsMemoryStatus({ lightweight: true });
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        try {
            const latest = core_context.currentCharacterGuard();
            // Keep ordinary chat entry extremely light. Archive overview bookkeeping is only
            // needed while the Heartbeat UI is visible. IMPORTANT: do not compress, hydrate,
            // scan or migrate theater caches here; chat startup/navigation must remain inert.
            if (overlay && !overlay.hidden) {
                archive_snapshots.resetArchiveOverviewForCharacter(latest);
                archive_snapshots.syncArchiveOverviewCurrentRow(latest);
            }
        } catch {}
        // SillyTavern emits CHAT_CHANGED and CHAT_LOADED during one navigation. Do not
        // synchronously rebuild the whole archive UI inside its awaited event path.
        if (overlay && !overlay.hidden) archive_snapshots.scheduleChooserRefresh(80);
        setTimeout(() => {
            void core_cache.flushPendingCompressedCacheForCurrentChat().catch(error => {
                console.warn('[HeartbeatMemories] pending compressed cache flush failed', error);
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
    globalThis.__heartbeatMemoriesEventCleanup = () => {
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
