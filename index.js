import { initMemoryTheater, destroyMemoryTheater } from './src/heartbeatMemories.js?heartbeat=0.8.10-state-r13';

const VERSION = '0.8.10';

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
