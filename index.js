const VERSION = '0.8.13';
const BUILD = '0.8.13-calendar-phone-r38';
const BUILD_STORAGE_KEY = 'heartbeatMemoriesLoadedBuildV1';

let runtimeModule = null;
let bootPromise = null;

function shouldReloadForFreshModuleGraph() {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return false;
        const previous = storage.getItem(BUILD_STORAGE_KEY) || '';
        if (previous === BUILD) return false;
        storage.setItem(BUILD_STORAGE_KEY, BUILD);
        return typeof globalThis.location?.reload === 'function';
    } catch {
        return false;
    }
}

async function bootHeartbeatMemories() {
    // r35 modularization introduced many child ES modules. A SillyTavern in-place extension
    // update can keep those query-less child module URLs in the browser module map even when
    // index.js itself changed. One reload per release guarantees the complete module graph is
    // read from the newly installed version, preventing new portals such as Calendar from being
    // hidden by stale constants/snapshot modules.
    if (shouldReloadForFreshModuleGraph()) {
        globalThis.location.reload();
        return;
    }
    runtimeModule = await import(`./src/heartbeatMemories.js?heartbeat=${BUILD}`);
    runtimeModule.initMemoryTheater();
    globalThis.__heartbeatMemoriesBuild = BUILD;
    console.log(`[HeartbeatMemories] ${VERSION} loaded (${BUILD})`);
}

jQuery(() => {
    bootPromise = bootHeartbeatMemories().catch(error => {
        console.error('[HeartbeatMemories] boot failed', error);
    });
});

export function onDisable() {
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] disable cleanup failed', error); }
}

export function onClean() {
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] clean cleanup failed', error); }
}

export { VERSION, BUILD, bootPromise };
