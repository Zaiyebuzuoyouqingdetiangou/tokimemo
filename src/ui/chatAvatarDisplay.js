// Native chat only. RabbitMirror owns its explicit avatar slots separately.
// No card, Persona, message, or avatar filename is modified here.
export function startChatAvatarDisplay({ getContext, getSnapshot, getScope, document: doc = globalThis.document } = {}) {
    const applied = new Map(), owners = new WeakMap(), ownWrites = new WeakMap();
    let stopped = false, queued = false, observer = null;
    function attr(element, name, value) {
        if (value == null) element.removeAttribute(name); else element.setAttribute(name, value);
        ownWrites.set(element, { src: element.getAttribute('src'), srcset: element.getAttribute('srcset') });
    }
    function restore(image, state) {
        if (image.getAttribute('src') === state.url) {
            attr(image, 'src', state.src);
            if (image.getAttribute('srcset') === null) attr(image, 'srcset', state.srcset);
        }
        applied.delete(image);
    }
    function actor(image, context) {
        const row = image.closest('.mes[mesid]');
        if (!row || !row.closest('#chat') || image.closest('.mes_text, toto, iframe')
            || !image.closest('.avatar') || !/^\d+$/.test(row.getAttribute('mesid') || '')) return null;
        const message = context?.chat?.[Number(row.getAttribute('mesid'))];
        if (!message || message.is_system) return null;
        const role = message.is_user === true ? 'user' : message.is_user === false ? 'char' : '';
        const name = role === 'user' ? context.name1 : context.name2;
        // A narrated NPC or another named speaker is not the active char/user.
        if (!role || !name || String(message.name || '').trim() !== String(name).trim()) return null;
        const declared = row.getAttribute('is_user');
        if (declared !== null && declared !== String(message.is_user)) return null;
        return { role, message };
    }
    function scan() {
        queued = false;
        if (stopped) return;
        const context = getContext(), scope = getScope(context), snapshot = getSnapshot(context);
        let chatId = context?.chatId;
        try { chatId = context?.getCurrentChatId?.() ?? chatId; } catch { /* Host fallback. */ }
        const card = context?.characters?.[context?.characterId];
        // Persona changes share the same native messages. Chat/card switches do not.
        const nativeScope = JSON.stringify([context?.characterId, card?.avatar || card?.data?.avatar, context?.name2, chatId]);
        for (const [image, state] of applied) {
            const current = actor(image, context);
            if (!image.isConnected || !snapshot || snapshot.scope !== scope || state.scope !== scope
                || !current || current.message !== state.message || current.role !== state.role) restore(image, state);
        }
        if (!scope) return;
        for (const image of doc.querySelectorAll('#chat .mes[mesid] .avatar img')) {
            const current = actor(image, context);
            if (!current) continue;
            const owner = owners.get(image);
            if (owner && (owner.nativeScope !== nativeScope || owner.message !== current.message)) continue;
            owners.set(image, { nativeScope, message: current.message });
            if (!snapshot || snapshot.scope !== scope) continue;
            const url = snapshot[current.role]?.url;
            if (!url) continue;
            let state = applied.get(image);
            if (!state) state = { src: image.getAttribute('src'), srcset: image.getAttribute('srcset'),
                scope, message: current.message, role: current.role, url: '' };
            else if (image.getAttribute('src') !== state.url) {
                state.src = image.getAttribute('src'); state.srcset = image.getAttribute('srcset');
            }
            state.url = url; applied.set(image, state);
            if (image.getAttribute('src') !== url) attr(image, 'src', url);
            if (image.hasAttribute('srcset')) attr(image, 'srcset', null);
        }
    }
    function refresh() {
        if (stopped || queued) return;
        queued = true; queueMicrotask(scan);
    }
    const Observer = doc?.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (Observer && doc?.body) {
        observer = new Observer(records => {
            let relevant = false;
            const consumed = new Set();
            for (const record of records) {
                // Own mutations already have the desired values; do not schedule a loop.
                if (record.type === 'attributes') {
                    const image = record.target;
                    const own = ownWrites.get(image);
                    if (own) consumed.add(image);
                    if (['src', 'srcset'].includes(record.attributeName) && own
                        && image.getAttribute('src') === own.src && image.getAttribute('srcset') === own.srcset) continue;
                    if (!image.closest?.('#chat, #user_avatar_block')) continue;
                    if (image.tagName === 'IMG' && image.closest?.('.avatar') && !image.closest('.mes_text, toto')) {
                        // A host render can reuse an IMG for a new message. Only its own
                        // native src change releases the previous DOM ownership binding.
                        if (record.attributeName === 'src') owners.delete(image);
                    }
                    relevant = true;
                } else {
                    for (const node of [...record.addedNodes, ...record.removedNodes]) {
                        if (node.nodeType !== 1) continue;
                        if (node.matches?.('#chat, #chat *, #user_avatar_block, #user_avatar_block *')
                            || node.querySelector?.('#chat, #user_avatar_block') || record.target.closest?.('#chat, #user_avatar_block')) relevant = true;
                    }
                }
            }
            for (const image of consumed) ownWrites.delete(image);
            if (relevant) refresh();
        });
        observer.observe(doc.body, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['src', 'srcset', 'mesid', 'is_user', 'class', 'data-avatar-id'] });
    }
    refresh();
    return { refresh, destroy() {
        if (stopped) return;
        stopped = true; observer?.disconnect();
        for (const [image, state] of applied) restore(image, state);
    } };
}
