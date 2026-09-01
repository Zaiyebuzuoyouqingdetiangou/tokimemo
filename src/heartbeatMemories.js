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
import * as ui_endingView from './ui/endingView.js';
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
        ui_archivePortal.bindGenerationNavigationGuards();
        ui_archivePortal.scheduleMounts(settingsMounted, menuMounted);
        // This runs only after the user explicitly loaded the full runtime. It lazily migrates the
        // current chat's existing archive into the independent local backup without touching startup.
        void core_cache.ensureCurrentArchiveBackup().catch(error => {
            console.warn('[HeartbeatMemories] current archive backup seed failed', error);
            globalThis.toastr?.warning?.(`当前档案可正常使用，但独立备份没有更新：${error?.message || error}`, '心跳回忆');
        });
        console.log('[HeartbeatMemories] initialized');
    } catch (error) {
        console.error('[HeartbeatMemories] init failed', error);
    }
}

export function destroyMemoryTheater() {
    try {
        // Extension updates/reloads can destroy the module before the short gzip debounce fires.
        // A destroy path cannot await gzip. Persist a detached raw compatibility copy only when it
        // satisfies the same UTF-8 byte cap as every other sink; otherwise preserve the previous
        // valid compressed/raw metadata instead of replacing it with an unreadable oversized value.
        try {
            const liveContext = core_context.currentCharacterGuard();
            const liveScope = core_cache.cacheScopeFromContext(liveContext);
            const liveCache = runtimeState.runtimeSessionCache.get(liveScope);
            if (liveCache && typeof liveCache === 'object'
                && core_cache.cacheStillMatchesLiveArchive(liveCache, liveContext, liveScope)
                && Object.values(core_constants.MODE).some(mode => liveCache?.[mode]?.kind === mode)) {
                const prepared = core_cache.prepareBoundedRawCache(liveCache);
                liveContext.chatMetadata[core_constants.CACHE_KEY] = prepared.value;
                liveContext.saveMetadataDebounced?.();
            }
        } catch (error) {
            console.warn('[HeartbeatMemories] destroy-time cache preservation skipped', error);
            globalThis.toastr?.warning?.(`${error?.message || error} 销毁流程没有覆盖上一份有效缓存。`, '心跳回忆');
        }
        // Invalidate every asynchronous state writer before clearing containers. Results that
        // started in the old runtime lifetime must not refill caches after disable/clean.
        runtimeState.runtimeLifecycleEpoch += 1;
        runtimeState.apiConfigurationEpoch += 1;
        const timer = globalThis.__heartbeatMemoriesMountTimer;
        if (timer) clearInterval(timer);
        globalThis.__heartbeatMemoriesMountTimer = null;
        try { globalThis.__heartbeatMemoriesEventCleanup?.(); } catch {}
        globalThis.__heartbeatMemoriesEventCleanup = null;
        try { globalThis.__heartbeatMemoriesOpenCleanup?.(); } catch {}
        globalThis.__heartbeatMemoriesOpenCleanup = null;
        try { globalThis.__heartbeatMemoriesNavigationGuardCleanup?.(); } catch {}
        globalThis.__heartbeatMemoriesNavigationGuardCleanup = null;
        document.getElementById(core_constants.OVERLAY_ID)?.remove();
        document.getElementById(core_constants.SETTINGS_ID)?.remove();
        document.getElementById(core_constants.MENU_ID)?.remove();
        document.getElementById(core_constants.STYLE_ID)?.remove();
        document.getElementById(core_constants.SETTINGS_STYLE_ID)?.remove();
        modes_room.stopRoomClock();
        ui_phoneView.stopPhoneClock();
        ui_endingView.stopEndingEasterEggTimer();
        runtimeState.endingEasterEggRuntime = null;
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
        runtimeState.roomLifeRefreshOrigin = null;
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
        // Completed results waiting for their origin chat are intentionally durable.
        // Disabling/reloading the runtime must not erase them; the next initialization
        // will validate their chat/archive identity before attempting writeback.
        runtimeState.archiveSnapshotCache.clear();
        runtimeState.connectionModelCache.clear();
        runtimeState.connectionModelRequestEpochs.clear();
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
