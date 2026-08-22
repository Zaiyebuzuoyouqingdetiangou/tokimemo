import { initMemoryTheater, destroyMemoryTheater } from './src/heartbeatMemories.js?heartbeat=0.8.5';

const VERSION = '0.8.5';

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
