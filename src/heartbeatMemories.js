// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_cache from './core/cache.js';
import * as core_constants from './core/constants.js';
import * as core_context from './core/context.js';
import * as core_requestCoordinator from './core/requestCoordinator.js';
import { state as runtimeState } from './core/state.js';
import * as generation_imageGeneration from './generation/imageGeneration.js';
import * as modes_room from './modes/room.js';
import * as ui_archivePortal from './ui/archivePortal.js';
import * as ui_phoneView from './ui/phoneView.js';
import * as ui_settingsPanel from './ui/settingsPanel.js';
import * as ui_styles from './ui/styles.js';

export function openArchiveLibrary(source = 'runtime-api') {
    return ui_archivePortal.safeShowArchiveLibrary(source);
}

export function initMemoryTheater() {
    try {
        const settingsMounted = ui_settingsPanel.mountSettings();
        const menuMounted = ui_archivePortal.mountMenuItem();
        ui_archivePortal.bindChatStateEvents();
        ui_archivePortal.bindRobustArchiveOpenHandlers();
        ui_archivePortal.scheduleMounts(settingsMounted, menuMounted);
        console.log('[HeartbeatMemories] initialized');
    } catch (error) {
        console.error('[HeartbeatMemories] init failed', error);
    }
}

export function destroyMemoryTheater() {
    try {
        // Extension updates/reloads can destroy the module before the short gzip debounce fires.
        // Persist the current in-memory theater cache as a raw compatibility copy first; the next
        // explicit open/save will compress it again. This prevents a version update from making
        // already generated Album/ADV EVENT/etc. appear missing after login.
        try {
            const liveContext = core_context.currentCharacterGuard();
            const liveScope = core_cache.cacheScopeFromContext(liveContext);
            const liveCache = runtimeState.runtimeSessionCache.get(liveScope);
            if (liveCache && typeof liveCache === 'object' && Object.values(core_constants.MODE).some(mode => liveCache?.[mode]?.kind === mode)) {
                let rawChars = 0;
                try { rawChars = JSON.stringify(liveCache).length; } catch {}
                if (rawChars > 2_000_000) {
                    console.warn('[HeartbeatMemories] preserving a large raw theater-cache fallback during extension shutdown', { chars: rawChars });
                }
                liveContext.chatMetadata[core_constants.CACHE_KEY] = liveCache;
                liveContext.saveMetadataDebounced?.();
            }
        } catch {}
        // Invalidate every asynchronous state writer before clearing containers. Results that
        // started in the old runtime lifetime must not refill caches after disable/clean.
        runtimeState.runtimeLifecycleEpoch += 1;
        const timer = globalThis.__heartbeatMemoriesMountTimer;
        if (timer) clearInterval(timer);
        globalThis.__heartbeatMemoriesMountTimer = null;
        try { globalThis.__heartbeatMemoriesEventCleanup?.(); } catch {}
        globalThis.__heartbeatMemoriesEventCleanup = null;
        try { globalThis.__heartbeatMemoriesOpenCleanup?.(); } catch {}
        globalThis.__heartbeatMemoriesOpenCleanup = null;
        document.getElementById(core_constants.OVERLAY_ID)?.remove();
        document.getElementById(core_constants.SETTINGS_ID)?.remove();
        document.getElementById(core_constants.MENU_ID)?.remove();
        document.getElementById(core_constants.STYLE_ID)?.remove();
        document.getElementById(core_constants.SETTINGS_STYLE_ID)?.remove();
        modes_room.stopRoomClock();
        ui_phoneView.stopPhoneClock();
        try { runtimeState.activeTaskAbortController?.abort?.(); } catch {}
        runtimeState.activeTaskAbortController = null;
        for (const task of runtimeState.activeGenerationTasks.values()) {
            try { task.controller?.abort?.(); } catch {}
        }
        generation_imageGeneration.abortActiveCgImageTasks();
        while (runtimeState.providerRequestQueue.length) {
            const waiter = runtimeState.providerRequestQueue.shift();
            try { waiter?.signal?.removeEventListener?.('abort', waiter.onAbort); } catch {}
            try { waiter?.reject?.(core_requestCoordinator.createGenerationAbortError()); } catch {}
        }
        runtimeState.activeProviderRequestCount = 0;
        runtimeState.activeGenerationTasks.clear();
        runtimeState.activeModeBuildScopes.clear();
        runtimeState.activeAdvBulkScopes.clear();
        runtimeState.cgImageLifecycleEpoch += 1;
        runtimeState.activeCgImageTasks.clear();
        runtimeState.avatarDialogueRequestEpoch += 1;
        runtimeState.activeAvatarDialogue = null;
        runtimeState.roomLifeRefreshPromise = null;
        if (runtimeState.butterflyTransitionTimer) clearTimeout(runtimeState.butterflyTransitionTimer);
        runtimeState.butterflyTransitionTimer = 0;
        if (runtimeState.chooserRefreshTimer) clearTimeout(runtimeState.chooserRefreshTimer);
        runtimeState.chooserRefreshTimer = 0;
        runtimeState.archiveOverviewPromise = null;
        runtimeState.archiveOverviewPromiseKey = '';
        runtimeState.archiveOverviewCache = { key: '', fetchedAt: 0, items: [] };
        runtimeState.archiveOverviewAllowedChats.clear();
        runtimeState.archiveOverviewKnownArchives.clear();
        runtimeState.archiveOverviewLastKey = '';
        runtimeState.memoryProviderDiscoveryCache = { signature: '', scannedAt: 0, items: [] };
        runtimeState.memoryPreflightCache.clear();
        runtimeState.deferredChatCommits.clear();
        runtimeState.archiveSnapshotCache.clear();
        runtimeState.connectionModelCache.clear();
        for (const timer of runtimeState.cachePersistTimers.values()) clearTimeout(timer);
        runtimeState.cachePersistTimers.clear();
        runtimeState.cacheHydrationPromises.clear();
        runtimeState.cacheHydrationErrors.clear();
        runtimeState.runtimeSessionCache.clear();
        runtimeState.pendingCompressedCacheWrites.clear();
        runtimeState.usableMessageCountCache.clear();
        runtimeState.busy = false;
        runtimeState.contentManagerOpen = false;
        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        runtimeState.activeTaskLabel = '';
        runtimeState.activeTaskBackgrounded = false;
        runtimeState.activeTaskOrigin = null;
        runtimeState.archiveViewLevel = 'library';
        runtimeState.archiveLibraryCharacterKey = '';
        runtimeState.archiveCharacterRelationSelection = '';
        runtimeState.relationSelectedKey = '';
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
        console.log('[HeartbeatMemories] destroyed');
    } catch (error) {
        console.warn('[HeartbeatMemories] destroy failed', error);
    }
}
