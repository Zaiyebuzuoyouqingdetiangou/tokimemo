const VERSION = '0.8.26';
const BUILD = '0.8.26-performance-closure-r41.5';

let runtimeModule = null;
let bootPromise = null;

async function bootHeartbeatMemories() {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    // Runtime is bundled into one versioned file. Keep modular source for maintenance/tests,
    // but do not make cloud-hosted SillyTavern fetch the modular dependency graph at startup.
    runtimeModule = await import(`./dist/heartbeatMemories.bundle.js?heartbeat=${BUILD}`);
    runtimeModule.initMemoryTheater();
    globalThis.__heartbeatMemoriesBuild = BUILD;
    const finishedAt = globalThis.performance?.now?.() ?? Date.now();
    console.log(`[HeartbeatMemories] ${VERSION} loaded (${BUILD}) in ${Math.max(0, Math.round(finishedAt - startedAt))}ms`);
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
