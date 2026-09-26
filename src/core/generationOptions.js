import * as contextApi from './context.js';
// C-3c（r84.100）：别名沿用 repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as repository from './archiveBridge.js';
const PREFIX = 'heartbeatMemoriesComposerV1:';
const volatile = new Map();
export function composerScope(context, memory) {
    return JSON.stringify([contextApi.currentCharacterRuntimeKey(context), memory?.chatId, memory?.archiveRevision]);
}
export function readSongOptions(context = contextApi.getContext(), memory = repository.getImportedMemory(context), storage = globalThis.localStorage) {
    const key = PREFIX + composerScope(context, memory);
    try { return JSON.parse(storage?.getItem(key) || volatile.get(key) || '{}'); }
    catch { return JSON.parse(volatile.get(key) || '{}'); }
}
export function writeSongOptions(options, context, memory, storage = globalThis.localStorage) {
    const value = Object.fromEntries(['subject', 'eventId', 'language', 'customLanguage', 'voice', 'direction']
        .filter(key => typeof options?.[key] === 'string').map(key => [key, options[key]]));
    const key = PREFIX + composerScope(context, memory), encoded = JSON.stringify(value);
    volatile.set(key, encoded);
    try { storage?.setItem(key, encoded); return true; } catch { return false; }
}
