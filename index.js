import { initMemoryTheater, destroyMemoryTheater } from './src/heartbeatMemories.js?heartbeat=0.8.10-butterfly-r7';

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
