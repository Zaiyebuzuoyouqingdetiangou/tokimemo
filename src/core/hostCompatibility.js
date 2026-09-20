// Public host capabilities only. Do not replace host save timers or change its connection.
const adaptedWorldInfoNameReaders = new WeakSet();

export function isAdaptedWorldInfoNameReader(reader) {
    return typeof reader === 'function' && adaptedWorldInfoNameReaders.has(reader);
}

export function createHostContextAdapter(options = {}) {
    const currentContext = options.getContext || (() => globalThis.SillyTavern?.getContext?.());
    const loadExtensions = options.loadExtensions || (() => import('/scripts/extensions.js'));
    const loadWorldInfo = options.loadWorldInfo || (() => import('/scripts/world-info.js'));
    const getEpoch = options.getEpoch || (() => 0);
    const reportSaveError = options.onSaveError || (() => {
        console.warn('[HeartbeatMemories] host metadata save adapter unavailable');
        globalThis.toastr?.warning?.('酒馆附带档案暂未保存。请保留本机独立备份，刷新后重试；本次没有改写聊天正文。', '心迹回廊');
    });
    let extensions = null, extensionsPromise = null, worldInfoPromise = null;
    const extensionModule = () => {
        if (!extensionsPromise) extensionsPromise = Promise.resolve().then(loadExtensions).then(module => {
            if (typeof module?.saveMetadataDebounced !== 'function') throw new Error('Host metadata debounce unavailable');
            extensions = module;
            return module;
        }).catch(error => { extensionsPromise = null; throw error; });
        return extensionsPromise;
    };
    const worldModule = () => {
        if (!worldInfoPromise) worldInfoPromise = Promise.resolve().then(loadWorldInfo).catch(error => {
            worldInfoPromise = null;
            throw error;
        });
        return worldInfoPromise;
    };
    return function adapt(context) {
        if (!context) return context;
        if (typeof context.getWorldInfoNames !== 'function') {
            context.getWorldInfoNames = async () => {
                const module = await worldModule();
                if (!Array.isArray(module?.world_names)) throw new Error('酒馆世界书列表暂不可读取，请刷新后重试。');
                // Read the live export each time; do not cache a stale list or expose the host array.
                return [...module.world_names];
            };
            adaptedWorldInfoNameReaders.add(context.getWorldInfoNames);
        }
        if (typeof context.saveMetadataDebounced !== 'function') {
            context.saveMetadataDebounced = () => {
                const epoch = getEpoch();
                const chatId = context.getCurrentChatId?.() ?? context.chatId;
                const metadata = context.chatMetadata;
                const stillCurrent = () => {
                    const live = currentContext();
                    return getEpoch() === epoch && !!live && live.characterId === context.characterId
                        && live.groupId === context.groupId && live.chatMetadata === metadata
                        && (live.getCurrentChatId?.() ?? live.chatId) === chatId;
                };
                const queue = module => {
                    // An import may finish after clearChat cancelled the host timer. Never requeue
                    // that old mirror on the new chat. The local archive remains authoritative.
                    if (!stillCurrent()) return false;
                    module.saveMetadataDebounced();
                    return true;
                };
                try {
                    // Once loaded, call synchronously so the host's clearChat cancellation owns it.
                    if (extensions) return queue(extensions);
                    return extensionModule().then(queue).catch(() => { reportSaveError(); return false; });
                } catch {
                    reportSaveError();
                    return false;
                }
            };
        }
        return context;
    };
}

export async function readArchiveRowMetadata(context, avatar, row, options = {}) {
    const assertCurrent = () => {
        if (options.signal?.aborted || options.isCurrent?.() === false) throw new DOMException('Archive scan cancelled', 'AbortError');
    };
    assertCurrent();
    if (row?.chat_metadata && typeof row.chat_metadata === 'object') return row;
    const chatId = String(row?.file_id || row?.file_name || '').replace(/\.jsonl$/i, '');
    if (!chatId || !avatar) return row;
    const response = await (options.fetchImpl || globalThis.fetch)('/api/chats/get', {
        method: 'POST', headers: context.getRequestHeaders(), cache: 'no-cache',
        signal: options.signal,
        body: JSON.stringify({ avatar_url: avatar, file_name: chatId }),
    });
    assertCurrent();
    if (!response.ok) throw new Error(`读取旧档案聊天失败：HTTP ${response.status}`);
    const data = await response.json();
    assertCurrent();
    const metadata = (Array.isArray(data) ? data[0] : data)?.chat_metadata;
    return { ...row, chat_metadata: metadata && typeof metadata === 'object' ? metadata : {} };
}
