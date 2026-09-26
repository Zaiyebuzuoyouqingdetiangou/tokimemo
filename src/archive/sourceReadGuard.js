// User-triggered reads only. No module-load discovery, timers, storage, or model calls.
import * as contextApi from '../core/context.js';
import * as settingsApi from '../core/settings.js';
import * as constants from '../core/constants.js';
import * as contextTags from '../core/contextTags.js';
import * as stateModule from '../core/state.js';
import * as core_archiveBridge from '../core/archiveBridge.js';

export function sourceReadSignature(context) {
    const settings = settingsApi.getPluginSettings(context);
    return JSON.stringify([
        contextApi.chatScopeKey(context), stateModule.state.runtimeLifecycleEpoch,
        String(context?.userAvatar ?? context?.personaAvatar ?? context?.user_avatar ?? globalThis.user_avatar ?? ''), String(context?.name1 ?? ''),
        String(context?.powerUserSettings?.persona_description ?? ''),
        settings.useCurrentChatExternalMemory === true, settings.useActivatedWorldInfo !== false,
        context?.chatMetadata?.[constants.MEMORY_WORLD_INFO_SETTINGS_KEY]?.books || [],
        contextTags.tagPolicyForSettings(settings),
    ]);
}

export function createSourceReadGuard(context, expectedChatId = contextApi.getChatId(context), signal = null) {
    const signature = sourceReadSignature(context);
    const chatId = contextApi.comparableChatId(expectedChatId);
    return () => {
        if (signal?.aborted) throw new DOMException('Read cancelled', 'AbortError');
        let current;
        try { current = contextApi.currentCharacterGuard(); } catch { throw new DOMException('Source changed', 'AbortError'); }
        if (!chatId || contextApi.comparableChatId(contextApi.getChatId(current)) !== chatId
            || sourceReadSignature(current) !== signature) throw new DOMException('Source changed', 'AbortError');
    };
}

// Stop waiting even when a host API ignores AbortSignal. Only use for reads;
// writes must still acknowledge their transaction before an owner is released.
export function waitForSourceRead(read, signal = null, timeoutMs = 0) {
    if (signal?.aborted) return Promise.reject(new DOMException('Read cancelled', 'AbortError'));
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn, value) => {
            if (done) return;
            done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', abort);
            fn(value);
        };
        const abort = () => finish(reject, new DOMException('Read cancelled', 'AbortError'));
        const timer = timeoutMs > 0 ? setTimeout(() => finish(reject, Object.assign(new Error('Memory reader timed out'), { code: 'RMT_MEMORY_READ_TIMEOUT' })), timeoutMs) : 0;
        signal?.addEventListener?.('abort', abort, { once: true });
        Promise.resolve().then(() => done ? undefined : read()).then(value => finish(resolve, value), error => finish(reject, error));
    });
}

export function boundedSourceRead(read, signal = null, timeoutMs = 15000) {
    return waitForSourceRead(read, signal, Math.max(1, Math.min(15000, Number(timeoutMs) || 15000)));
}

// 重构清单 C-3c（r84.100）：把 core 层要用的函数登记到 core/archiveBridge.js（core 不再 import 本文件）。
core_archiveBridge.registerArchiveBridge({ boundedSourceRead, waitForSourceRead });
