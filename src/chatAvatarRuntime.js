import * as avatars from './core/chatAvatarStore.js';
import { startChatAvatarDisplay } from './ui/chatAvatarDisplay.js';

// Loaded by the small bootstrap, not the full archive/generation runtime.
export function startChatAvatarRuntime() {
    const context = () => { try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; } };
    const removeBridge = avatars.installChatAvatarBridge();
    const display = startChatAvatarDisplay({ getContext: context, getSnapshot: avatars.readChatAvatarSnapshot, getScope: avatars.chatAvatarScope });
    let stopped = false, source = null, types = [], retries = 0, timer = 0;
    function refresh() {
        if (stopped) return;
        display.refresh();
        void avatars.loadChatAvatarSnapshot(context()).then(() => { if (!stopped) display.refresh(); }).catch(() => {});
    }
    function bindHost() {
        const host = context(), next = host?.eventSource;
        if (!next?.on || next === source) return !!source;
        for (const type of types) source?.off?.(type, refresh);
        source = next;
        const events = host.eventTypes || host.event_types || {};
        types = [...new Set(['CHAT_CHANGED', 'CHAT_LOADED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED',
            'MESSAGE_UPDATED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'APP_READY'].map(key => events[key]).filter(Boolean))];
        for (const type of types) source.on(type, refresh);
        refresh(); return true;
    }
    const unsubscribe = globalThis.HearttraceAvatars?.subscribe?.(() => display.refresh());
    globalThis.addEventListener?.('focus', refresh);
    if (!bindHost()) timer = setInterval(() => {
        retries++;
        if (bindHost() || retries >= 30) { clearInterval(timer); timer = 0; }
    }, 500);
    refresh();
    return () => {
        if (stopped) return;
        stopped = true; if (timer) clearInterval(timer);
        for (const type of types) source?.off?.(type, refresh);
        globalThis.removeEventListener?.('focus', refresh);
        unsubscribe?.(); display.destroy(); removeBridge();
    };
}
