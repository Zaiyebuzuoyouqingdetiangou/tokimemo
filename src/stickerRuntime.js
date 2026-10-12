import * as store from './core/stickerStore.js';
import * as sticker_lore from './core/stickerLore.js';

// Loaded by the small bootstrap together with the chat avatars. Two jobs:
// turning [表情:名字·表情名] into pictures in the native chat, and the
// floating sticker button that drops a token into ST's input box.
// Other plugins' own rendered blocks are left untouched.
const SKIP = 'code, pre, script, style, textarea, toto, iframe, svg, .hearttrace-sticker, details[data-rabbit-mirror-external-details]';
const TABS = [['user', '我的'], ['char', '他的'], ['pair', '双人'], ['other', '其他']];
const POSITION_KEY = 'hearttrace:sticker-float:v1';
// Same rabbit as the 心迹回廊 entry in ST's magic-wand menu.
const RABBIT = '<svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 16C4 2 11 1 14 14M18 14C20 1 27 2 23 16M9 16c-7 11 3 15 9 14s13-8 5-14c-4-3-10-3-14 0Z"/><path d="M12 22h1m6 0h1m-6 4 2 1 2-1"/></svg>';

function context() { try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; } }
const CSS = `
.hearttrace-sticker{display:inline-block;vertical-align:bottom;line-height:0;margin:2px 0}
.hearttrace-sticker img{width:var(--hearttrace-sticker-size,120px)!important;height:var(--hearttrace-sticker-size,120px)!important;max-width:40vw!important;object-fit:contain!important;border-radius:10px;margin:0!important;cursor:default}
#hearttrace_sticker_button{position:fixed;z-index:9998;box-sizing:border-box;width:46px;height:46px;margin:0;padding:0;border:2px solid #fff;border-radius:50%;background:#bd708b;color:#fff;box-shadow:0 2px 12px #0003;display:grid;place-items:center;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;appearance:none}
#hearttrace_sticker_button svg{display:block;pointer-events:none}
#hearttrace_sticker_button[aria-expanded=true]{box-shadow:0 0 0 3px #de8fab88,0 2px 12px #0003}
#hearttrace_sticker_button:focus-visible{outline:3px solid #de8fab;outline-offset:3px}
#hearttrace_sticker_button[hidden]{display:none!important}
#hearttrace-sticker-panel{position:fixed;z-index:9999;box-sizing:border-box;width:min(400px,calc(100vw - 16px));padding:10px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2));border-radius:16px;background:var(--SmartThemeBlurTintColor,rgba(28,28,30,.96));color:var(--SmartThemeBodyColor,#eee);backdrop-filter:blur(var(--SmartThemeBlurStrength,10px));-webkit-backdrop-filter:blur(var(--SmartThemeBlurStrength,10px));box-shadow:0 8px 28px #0005;display:flex;flex-direction:column;gap:8px;font-size:14px}
#hearttrace-sticker-panel[hidden]{display:none!important}
#hearttrace-sticker-panel *{box-sizing:border-box}
.hearttrace-sticker-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:3px;border-radius:999px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.2))}
.hearttrace-sticker-tabs button{min-height:34px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.hearttrace-sticker-tabs button[aria-selected=true]{background:var(--SmartThemeQuoteColor,#e18a9b);color:var(--SmartThemeBlurTintColor,#111);font-weight:600}
.hearttrace-sticker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;max-height:min(38vh,320px);overflow:auto;overscroll-behavior:contain}
.hearttrace-sticker-grid button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 2px 4px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.18));border-radius:12px;background:rgba(127,127,127,.08);color:inherit;font:inherit;font-size:12px;cursor:pointer;min-width:0}
.hearttrace-sticker-grid img{width:56px;height:56px;object-fit:contain}
.hearttrace-sticker-grid span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hearttrace-sticker-empty{grid-column:1/-1;margin:8px 0;opacity:.75;font-size:12px;line-height:1.6;text-align:center}
.hearttrace-sticker-note{font-size:11px;opacity:.7;line-height:1.5}
`;

export function renderStickerTokens(root, ctx = context(), data = store.readStickerData(ctx)) {
    const doc = root?.ownerDocument || globalThis.document;
    if (!root || !doc) return 0;
    let changed = 0;
    // Already rendered pictures follow renames, deletions and caption edits.
    for (const span of [...root.querySelectorAll('.hearttrace-sticker[data-hearttrace-token]')]) {
        const token = span.getAttribute('data-hearttrace-token') || '';
        const match = new RegExp(store.STICKER_TOKEN.source, 'u').exec(token);
        const row = match && data.packs.length ? store.resolveSticker(match[1] || '', match[2], ctx, data) : null;
        if (!row) { span.replaceWith(doc.createTextNode(token)); changed++; continue; }
        const image = span.querySelector('img');
        if (image && image.getAttribute('src') !== row.url) { image.setAttribute('src', row.url); changed++; }
    }
    if (!data.packs.length) return changed;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (/[\[【]\s*表情/u.test(node.nodeValue) && !node.parentElement?.closest(SKIP)) nodes.push(node);
    }
    for (const node of nodes) {
        const value = node.nodeValue, pattern = new RegExp(store.STICKER_TOKEN.source, 'gu');
        const fragment = doc.createDocumentFragment();
        let last = 0, hits = 0;
        for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
            const row = store.resolveSticker(match[1] || '', match[2], ctx, data);
            if (!row) continue;
            if (match.index > last) fragment.append(doc.createTextNode(value.slice(last, match.index)));
            const span = doc.createElement('span');
            span.className = 'hearttrace-sticker';
            span.setAttribute('data-hearttrace-token', match[0]);
            const image = doc.createElement('img');
            image.setAttribute('src', row.url); image.setAttribute('alt', `[表情:${row.name}]`);
            image.setAttribute('title', row.meaning ? `${row.name}：${row.meaning}` : row.name);
            image.setAttribute('loading', 'lazy'); image.setAttribute('draggable', 'false');
            span.append(image); fragment.append(span);
            last = match.index + match[0].length; hits++;
        }
        if (!hits) continue;
        if (last < value.length) fragment.append(doc.createTextNode(value.slice(last)));
        node.replaceWith(fragment); changed += hits;
    }
    return changed;
}

// caret: the last place the user actually typed or clicked; untouched input → append.
export function insertAtCursor(textarea, value, caret = null) {
    if (!textarea) return false;
    const length = textarea.value.length;
    const start = Math.min(length, Number.isInteger(caret?.start) ? caret.start : length);
    const end = Math.min(length, Math.max(start, Number.isInteger(caret?.end) ? caret.end : start));
    textarea.value = textarea.value.slice(0, start) + value + textarea.value.slice(end);
    const next = start + value.length;
    try { textarea.setSelectionRange(next, next); } catch { /* Hidden inputs. */ }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

export function startStickerRuntime({ document: doc = globalThis.document } = {}) {
    if (!doc) return () => {};
    let stopped = false, queued = false, observer = null, chatRoot = null, source = null, types = [], timer = 0, retries = 0;
    let tab = 'user', button = null, panel = null, caret = null;
    const remember = event => {
        if (event.target?.id !== 'send_textarea') return;
        caret = { start: event.target.selectionStart, end: event.target.selectionEnd };
    };
    for (const type of ['keyup', 'mouseup', 'input', 'select', 'touchend']) doc.addEventListener(type, remember, true);
    const style = doc.createElement('style'); style.id = 'hearttrace-sticker-styles'; style.textContent = CSS;
    if (!doc.getElementById(style.id)) doc.head.append(style);

    function data() { return store.readStickerData(context()); }
    const dirty = new Set();
    let full = true;
    function scan() {
        queued = false;
        if (stopped) return;
        const ctx = context(), current = store.readStickerData(ctx);
        const root = doc.getElementById('chat');
        if (root !== chatRoot) { connect(root); full = true; }
        if (root) {
            const blocks = full ? [...root.querySelectorAll('.mes .mes_text')] : [...dirty].filter(block => block.isConnected && root.contains(block));
            full = false; dirty.clear();
            observer?.disconnect();
            try { for (const block of blocks) renderStickerTokens(block, ctx, current); }
            finally { if (observer && chatRoot) observer.observe(chatRoot, { childList: true, subtree: true, characterData: true }); }
        }
        syncButton(current);
    }
    function queue(records = null) {
        if (stopped) return;
        if (!records) full = true;
        else for (const record of records) {
            const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
            const block = target?.closest?.('.mes_text');
            if (block) dirty.add(block);
            else for (const node of record.addedNodes || []) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('.mes_text')) dirty.add(node);
                for (const inner of node.querySelectorAll?.('.mes_text') || []) dirty.add(inner);
            }
        }
        if (queued) return;
        queued = true;
        (globalThis.requestAnimationFrame || setTimeout)(scan);
    }
    function connect(root) {
        observer?.disconnect(); observer = null; chatRoot = root;
        if (root && typeof MutationObserver === 'function') {
            observer = new MutationObserver(records => queue(records));
            observer.observe(root, { childList: true, subtree: true, characterData: true });
        }
    }

    function available(current) {
        const ctx = context();
        return !!ctx && !ctx.groupId && ctx.characterId !== undefined && ctx.characterId !== null && ctx.characterId !== ''
            && current.packs.some(pack => pack.stickers.length);
    }
    function syncButton(current = data()) {
        if (!button?.isConnected) mountButton();
        const show = available(current);
        if (button) { button.hidden = !show; if (show) layout(); }
        if (!show) closePanel();
        else if (panel && !panel.hidden) { paintPanel(current); place(); }
    }

    // ---- floating button: draggable, remembered per browser ----
    const unit = (value, fallback) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    let point = { x: 1, y: 0.58 }, held = null, suppressClick = false;
    try { const saved = JSON.parse(globalThis.localStorage?.getItem(POSITION_KEY) || 'null'); point = { x: unit(saved?.x, 1), y: unit(saved?.y, 0.58) }; } catch { /* Default spot. */ }
    function bounds() {
        const view = globalThis.visualViewport, w = view?.width || globalThis.innerWidth || 360, h = view?.height || globalThis.innerHeight || 640;
        const x = view?.offsetLeft || 0, y = view?.offsetTop || 0;
        return { minX: x + 10, minY: y + 60, maxX: Math.max(x + 10, x + w - 56), maxY: Math.max(y + 60, y + h - 120) };
    }
    function layout() {
        if (!button || button.hidden) return;
        const b = bounds();
        button.style.left = `${b.minX + (b.maxX - b.minX) * point.x}px`;
        button.style.top = `${b.minY + (b.maxY - b.minY) * point.y}px`;
    }
    function mountButton() {
        if (!doc.body) return;
        button = doc.getElementById('hearttrace_sticker_button');
        if (!button) {
            button = doc.createElement('button');
            button.id = 'hearttrace_sticker_button'; button.type = 'button';
            button.setAttribute('title', '表情包'); button.setAttribute('aria-label', '表情包');
            button.setAttribute('aria-expanded', 'false'); button.hidden = true;
            button.innerHTML = RABBIT;
            doc.body.append(button);
        }
        button.onclick = () => { if (suppressClick) { suppressClick = false; return; } togglePanel(); };
        button.onpointerdown = event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            const rect = button.getBoundingClientRect();
            held = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, dragged: false };
            try { button.setPointerCapture(event.pointerId); } catch { /* Older WebViews. */ }
        };
        button.onpointermove = event => {
            if (!held || event.pointerId !== held.id) return;
            const dx = event.clientX - held.x, dy = event.clientY - held.y;
            if (!held.dragged && Math.hypot(dx, dy) < 6) return;
            held.dragged = true;
            const b = bounds();
            point = { x: unit((held.left + dx - b.minX) / (b.maxX - b.minX || 1), point.x), y: unit((held.top + dy - b.minY) / (b.maxY - b.minY || 1), point.y) };
            layout(); if (panel && !panel.hidden) place();
        };
        const end = event => {
            if (!held || event.pointerId !== held.id) return;
            if (held.dragged) {
                suppressClick = true;
                // Snap to the nearer side so it never covers the middle of a message.
                point = { x: point.x < 0.5 ? 0 : 1, y: point.y }; layout(); if (panel && !panel.hidden) place();
                try { globalThis.localStorage?.setItem(POSITION_KEY, JSON.stringify(point)); } catch { /* Position only. */ }
            }
            try { button.releasePointerCapture(event.pointerId); } catch {}
            held = null;
        };
        button.onpointerup = end; button.onpointercancel = end;
    }
    const relayout = () => { layout(); if (panel && !panel.hidden) place(); };
    globalThis.addEventListener?.('resize', relayout);
    globalThis.visualViewport?.addEventListener?.('resize', relayout);

    function ensurePanel() {
        if (panel?.isConnected) return panel;
        if (!doc.body) return null;
        panel = doc.getElementById('hearttrace-sticker-panel') || doc.createElement('section');
        panel.id = 'hearttrace-sticker-panel'; panel.hidden = true;
        panel.setAttribute('aria-label', '表情包');
        doc.body.append(panel);
        panel.addEventListener('click', event => {
            const target = event.target.closest('button');
            if (!target) return;
            if (target.dataset.stickerTab) { tab = target.dataset.stickerTab; paintPanel(data()); place(); return; }
            if (target.dataset.stickerToken) {
                const area = doc.getElementById('send_textarea');
                insertAtCursor(area, target.dataset.stickerToken, area && caret && area.value.length >= (caret.end || 0) ? caret : null);
                caret = area ? { start: area.selectionStart, end: area.selectionEnd } : null;
                closePanel(); area?.focus?.({ preventScroll: true });
            }
        });
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') { closePanel(); button?.focus?.(); } });
        return panel;
    }
    // Beside the rabbit: same side of the screen, above it when there is room.
    function place() {
        if (!panel || !button) return;
        const rect = button.getBoundingClientRect(), view = globalThis.visualViewport;
        const vw = view?.width || globalThis.innerWidth, vh = view?.height || globalThis.innerHeight, ox = view?.offsetLeft || 0, oy = view?.offsetTop || 0;
        const width = panel.offsetWidth, height = panel.offsetHeight;
        let left = rect.left + rect.width / 2 > ox + vw / 2 ? rect.right - width : rect.left;
        left = Math.min(ox + vw - width - 8, Math.max(ox + 8, left));
        let top = rect.top - height - 8;
        if (top < oy + 8) top = rect.bottom + 8;
        top = Math.min(oy + vh - height - 8, Math.max(oy + 8, top));
        panel.style.left = `${left}px`; panel.style.top = `${top}px`;
    }
    function paintPanel(current) {
        if (!panel) return;
        const ctx = context(), rows = store.allStickers(current, tab);
        const esc = value => String(value).replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
        panel.innerHTML = `<div class="hearttrace-sticker-tabs" role="tablist">${TABS.map(([key, label]) => `<button type="button" role="tab" data-sticker-tab="${key}" aria-selected="${tab === key}">${label}</button>`).join('')}</div>`
            + `<div class="hearttrace-sticker-grid">${rows.length ? rows.map(row => `<button type="button" data-sticker-token="${esc(store.stickerToken(row.owner, row.name, ctx))}" title="${esc(row.meaning || row.name)}"><img src="${esc(row.url)}" alt="" loading="lazy"><span>${esc(row.name)}</span></button>`).join('')
                : '<p class="hearttrace-sticker-empty">这一栏还没有表情。可以在心迹回廊 · 互动 · 表情包里做一组。</p>'}</div>`
            + `<div class="hearttrace-sticker-note">点一下放进输入框。发出去的是暗号，${esc(store.ownerLabel('char', ctx))}从世界书知道它的意思。拖动小兔子可以换位置。</div>`;
    }
    function togglePanel() { if (panel && !panel.hidden) closePanel(); else openPanel(); }
    function openPanel() {
        const current = data();
        if (!available(current) || !ensurePanel()) return;
        if (!store.allStickers(current, tab).length) tab = TABS.find(([key]) => store.allStickers(current, key).length)?.[0] || 'user';
        paintPanel(current); panel.hidden = false; place(); button?.setAttribute('aria-expanded', 'true');
        panel.querySelector('[aria-selected="true"]')?.focus?.({ preventScroll: true });
    }
    function closePanel() {
        if (panel) panel.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
    }
    const outside = event => {
        if (!panel || panel.hidden) return;
        if (panel.contains(event.target) || button?.contains(event.target)) return;
        closePanel();
    };
    doc.addEventListener('pointerdown', outside, true);

    const changed = () => queue();
    globalThis.addEventListener?.(store.STICKER_EVENTS.changed, changed);
    // An update can change the lorebook wording; keep an entry the user already
    // wrote current (only ours, only when it differs), once per chat open.
    let loreTimer = 0, loreBusy = false;
    function syncLore() {
        if (loreTimer) clearTimeout(loreTimer);
        loreTimer = setTimeout(() => {
            loreTimer = 0;
            const ctx = context();
            if (stopped || loreBusy || !ctx || typeof ctx.saveWorldInfo !== 'function') return;
            let state;
            try { state = sticker_lore.loreState(store.readStickerData(ctx), ctx); } catch { return; }
            if (!state.written || !state.stale) return;
            loreBusy = true;
            void sticker_lore.refreshStickerLore(ctx).catch(error => console.warn('[HeartbeatMemories] sticker lorebook sync skipped', error?.message))
                .finally(() => { loreBusy = false; });
        }, 1500);
    }
    function hostEvent() {
        syncLore();
        try { globalThis.dispatchEvent?.(new CustomEvent(store.STICKER_EVENTS.changed)); } catch { changed(); }
    }
    function bindHost() {
        const host = context(), next = host?.eventSource;
        if (!next?.on || next === source) return !!source;
        for (const type of types) source?.off?.(type, hostEvent);
        source = next;
        const events = host.eventTypes || host.event_types || {};
        types = [...new Set(['CHAT_CHANGED', 'CHAT_LOADED', 'CHARACTER_EDITED', 'APP_READY'].map(key => events[key]).filter(Boolean))];
        for (const type of types) source.on(type, hostEvent);
        return true;
    }
    if (!bindHost()) timer = setInterval(() => {
        retries++;
        if (bindHost() || retries >= 30) { clearInterval(timer); timer = 0; }
    }, 500);
    queue(); syncLore();
    return () => {
        if (stopped) return;
        stopped = true; if (timer) clearInterval(timer); if (loreTimer) clearTimeout(loreTimer);
        observer?.disconnect();
        for (const type of types) source?.off?.(type, hostEvent);
        globalThis.removeEventListener?.(store.STICKER_EVENTS.changed, changed);
        doc.removeEventListener('pointerdown', outside, true);
        globalThis.removeEventListener?.('resize', relayout);
        globalThis.visualViewport?.removeEventListener?.('resize', relayout);
        for (const type of ['keyup', 'mouseup', 'input', 'select', 'touchend']) doc.removeEventListener(type, remember, true);
        button?.remove(); panel?.remove(); style.remove();
        // Leave the original tokens visible once the plugin is off.
        for (const span of [...doc.querySelectorAll('.hearttrace-sticker[data-hearttrace-token]')]) span.replaceWith(doc.createTextNode(span.getAttribute('data-hearttrace-token') || ''));
    };
}
