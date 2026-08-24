import { initMemoryTheater, destroyMemoryTheater } from './src/heartbeatMemories.js?heartbeat=0.8.10-modular-r35.1-startup-hotfix';

const VERSION = '0.8.10';

// SillyTavern loads the extension entry module, but does not call an exported `init()` hook
// unless the manifest explicitly declares one. Keep the long-standing DOM-ready self-start
// contract so an enabled extension actually mounts its settings/menu UI after an update.
jQuery(() => {
    initMemoryTheater();
    console.log(`[HeartbeatMemories] ${VERSION} loaded`);
});

export function onDisable() {
    destroyMemoryTheater();
}

export function onClean() {
    destroyMemoryTheater();
}
