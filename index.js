import { initMemoryTheater, destroyMemoryTheater } from './src/heartbeatMemories.js?heartbeat=0.8.10-modular-r35';

const VERSION = '0.8.10';

export function init() {
    initMemoryTheater();
}

export function onDisable() {
    destroyMemoryTheater();
}

export function onClean() {
    destroyMemoryTheater();
}

export { VERSION };
