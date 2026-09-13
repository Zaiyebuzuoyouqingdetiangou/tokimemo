// Bootstrap-owned, static launcher. No runtime imports, chat reads or polling.
export const FLOATING_LAUNCHER_ID = 'heartbeat_memories_floating_launcher';
export const FLOATING_LAUNCHER_STORAGE = 'heartbeatMemoriesFloatingLauncherV1';
export const FLOATING_LAUNCHER_SIZE = 48;
const DEFAULT_POSITION = Object.freeze({ x: 1, y: 0.62 });
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const unit = (value, fallback) => Math.max(0, Math.min(1, finite(value, fallback)));

export function decodeFloatingPreference(raw) {
    const fallback = { enabled: true, ...DEFAULT_POSITION };
    if (typeof raw !== 'string' || raw.length > 256) return fallback;
    try {
        const value = JSON.parse(raw);
        if (!value || value.v !== 1) return fallback;
        return { enabled: value.enabled !== false, x: unit(value.x, 1), y: unit(value.y, 0.62) };
    } catch { return fallback; }
}

export function floatingBounds(view = {}, safe = {}) {
    const width = Math.max(FLOATING_LAUNCHER_SIZE, finite(view.width, 390));
    const height = Math.max(FLOATING_LAUNCHER_SIZE, finite(view.height, 844));
    const ox = Math.max(0, finite(view.left, 0)), oy = Math.max(0, finite(view.top, 0));
    const pad = (key, dimension) => Math.min(Math.max(0, finite(safe[key], 0)) + 8, (dimension - FLOATING_LAUNCHER_SIZE) / 2);
    const left = ox + pad('left', width), top = oy + pad('top', height);
    return { left, top, right: Math.max(left, ox + width - FLOATING_LAUNCHER_SIZE - pad('right', width)),
        bottom: Math.max(top, oy + height - FLOATING_LAUNCHER_SIZE - pad('bottom', height)) };
}

export function floatingPoint(position, bounds) {
    return { x: bounds.left + unit(position.x, 1) * (bounds.right - bounds.left),
        y: bounds.top + unit(position.y, 0.62) * (bounds.bottom - bounds.top) };
}

export function floatingRatio(point, bounds) {
    return { x: bounds.right === bounds.left ? 0 : unit((point.x - bounds.left) / (bounds.right - bounds.left), 1),
        y: bounds.bottom === bounds.top ? 0 : unit((point.y - bounds.top) / (bounds.bottom - bounds.top), 0.62) };
}

export function mountFloatingLauncher({ assetUrl, onOpen, onError = () => {}, root = globalThis } = {}) {
    const doc = root.document;
    if (!doc?.body || typeof onOpen !== 'function') return null;
    let storage;
    try { storage = root.localStorage; } catch {}
    let raw;
    try { raw = storage?.getItem(FLOATING_LAUNCHER_STORAGE); } catch {}
    let preference = decodeFloatingPreference(raw);
    let button = null, sheet = null, disposed = false, covered = false, opening = false;
    let gesture = null, swallowUntil = 0;
    const listeners = [];
    const now = () => root.performance?.now?.() ?? Date.now();
    const listen = (target, name, fn, options) => {
        target?.addEventListener?.(name, fn, options);
        listeners.push(() => target?.removeEventListener?.(name, fn, options));
    };
    const save = () => {
        if (disposed) return;
        try { storage?.setItem(FLOATING_LAUNCHER_STORAGE, JSON.stringify({ v: 1, enabled: preference.enabled,
            x: +preference.x.toFixed(5), y: +preference.y.toFixed(5) })); } catch {}
    };
    const bounds = () => {
        const v = root.visualViewport;
        const result = { width: v?.width || doc.documentElement?.clientWidth || root.innerWidth,
            height: v?.height || root.innerHeight || doc.documentElement?.clientHeight,
            left: v?.offsetLeft, top: v?.offsetTop };
        const safe = {};
        try {
            const css = root.getComputedStyle(button);
            for (const edge of ['top', 'bottom', 'left', 'right']) safe[edge] = parseFloat(css.getPropertyValue('--ht-safe-' + edge)) || 0;
        } catch {}
        return floatingBounds(result, safe);
    };
    const place = point => {
        if (!button) return;
        button.style.setProperty('left', point.x.toFixed(2) + 'px', 'important');
        button.style.setProperty('top', point.y.toFixed(2) + 'px', 'important');
    };
    const release = () => {
        const previous = gesture;
        gesture = null;
        if (previous) {
            try { button?.releasePointerCapture?.(previous.id); } catch {}
        }
        return previous;
    };
    const reposition = () => {
        if (disposed || !button) return;
        // Keyboard/orientation/pinch changes must not overwrite the saved placement.
        if (gesture) { release(); swallowUntil = now() + 700; }
        place(floatingPoint(preference, bounds()));
    };
    const activate = async () => {
        if (disposed || covered || !preference.enabled || opening) return;
        opening = true;
        button?.setAttribute('aria-busy', 'true');
        try { await onOpen(); }
        catch { if (!disposed) onError(); }
        finally { opening = false; button?.removeAttribute('aria-busy'); }
    };
    const down = event => {
        if (disposed || covered || gesture || !preference.enabled || event.isPrimary === false || event.button !== 0) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        event.preventDefault(); event.stopPropagation();
        // Only this button captures pointer events. Ordinary chat scrolling is untouched.
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
            point: floatingPoint(preference, bounds()), bounds: bounds(), moved: false };
        try { button.setPointerCapture(event.pointerId); }
        catch { gesture = null; }
    };
    const move = event => {
        const g = gesture;
        if (!g || g.id !== event.pointerId || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        const dx = event.clientX - g.x, dy = event.clientY - g.y;
        if (Math.hypot(dx, dy) >= 6) g.moved = true;
        if (!g.moved) return;
        event.preventDefault(); event.stopPropagation();
        g.latest = { x: Math.max(g.bounds.left, Math.min(g.bounds.right, g.point.x + dx)),
            y: Math.max(g.bounds.top, Math.min(g.bounds.bottom, g.point.y + dy)) };
        place(g.latest);
    };
    const up = event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        move(event);
        event.preventDefault(); event.stopPropagation();
        const g = release();
        swallowUntil = now() + 700; // suppress the compatibility click after both taps and drags
        if (g.moved) {
            preference = { ...preference, ...floatingRatio(g.latest || g.point, g.bounds) };
            save(); reposition();
        } else void activate();
    };
    const cancel = event => {
        if (!gesture || (event?.pointerId !== undefined && gesture.id !== event.pointerId)) return;
        release(); swallowUntil = now() + 700; reposition();
    };
    const syncControls = () => {
        // Our two settings views only; no observers, message hooks or external DOM.
        for (const input of doc.querySelectorAll('[data-rmt-floating-enabled]')) input.checked = preference.enabled;
    };
    const render = () => {
        if (disposed) return;
        if (preference.enabled && !button) {
            sheet = doc.createElement('style'); sheet.id = FLOATING_LAUNCHER_ID + '_style';
            sheet.textContent = `
#${FLOATING_LAUNCHER_ID}{all:initial!important;position:fixed!important;z-index:9990!important;display:block!important;box-sizing:border-box!important;width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;max-width:48px!important;max-height:48px!important;margin:0!important;padding:0!important;border:0!important;border-radius:50%!important;background:transparent!important;box-shadow:0 2px 6px rgba(23,28,53,.24)!important;overflow:hidden!important;cursor:grab!important;touch-action:none!important;user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important;animation:none!important;transition:none!important;transform:none!important;filter:none!important;opacity:1!important;--ht-safe-top:env(safe-area-inset-top,0px);--ht-safe-bottom:env(safe-area-inset-bottom,0px);--ht-safe-left:env(safe-area-inset-left,0px);--ht-safe-right:env(safe-area-inset-right,0px)}
#${FLOATING_LAUNCHER_ID}[hidden]{display:none!important}
#${FLOATING_LAUNCHER_ID}::before,#${FLOATING_LAUNCHER_ID}::after{content:none!important;display:none!important;animation:none!important}
#${FLOATING_LAUNCHER_ID}:focus-visible{outline:2px solid #9fa8e9!important;outline-offset:3px!important}
#${FLOATING_LAUNCHER_ID}>img{all:initial!important;display:block!important;width:48px!important;height:48px!important;pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important;animation:none!important;transition:none!important;transform:none!important}
#${FLOATING_LAUNCHER_ID}>img[hidden]{display:none!important}
#${FLOATING_LAUNCHER_ID}>span{display:block!important;text-align:center!important;line-height:48px!important;font:28px/48px serif!important;color:#ffefd7!important;background:#333b63!important}
#${FLOATING_LAUNCHER_ID}>span[hidden]{display:none!important}`;
            doc.head.appendChild(sheet);
            button = doc.createElement('button'); button.id = FLOATING_LAUNCHER_ID; button.type = 'button';
            button.setAttribute('aria-label', '打开心迹回廊档案室');
            button.title = '心迹回廊 · 点击打开，拖动换位置';
            const image = doc.createElement('img'); image.src = assetUrl; image.alt = ''; image.draggable = false;
            image.width = image.height = 144; image.decoding = 'async';
            const fallback = doc.createElement('span'); fallback.textContent = '♡'; fallback.hidden = true; fallback.setAttribute('aria-hidden', 'true');
            listen(image, 'error', () => { image.hidden = true; fallback.hidden = false; });
            button.append(image, fallback); doc.body.appendChild(button);
            listen(button, 'pointerdown', down); listen(button, 'pointermove', move);
            listen(button, 'pointerup', up); listen(button, 'pointercancel', cancel); listen(button, 'lostpointercapture', cancel);
            listen(button, 'click', event => {
                event.preventDefault(); event.stopPropagation();
                if (!gesture && (event.detail === 0 || now() >= swallowUntil)) void activate();
            });
            listen(button, 'contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
            listen(button, 'dragstart', event => event.preventDefault());
            listen(button, 'keydown', event => {
                const delta = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
                if (!delta || covered || !preference.enabled) return;
                event.preventDefault(); event.stopPropagation();
                const b = bounds(), point = floatingPoint(preference, b);
                preference = { ...preference, ...floatingRatio({ x: point.x + delta[0], y: point.y + delta[1] }, b) };
                reposition(); save();
            });
        }
        if (button) { button.hidden = !preference.enabled || covered; reposition(); }
        syncControls();
    };
    listen(root, 'resize', reposition);
    listen(root.visualViewport, 'resize', reposition);
    listen(root.visualViewport, 'scroll', reposition);
    listen(root, 'blur', () => cancel());
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
    render();
    const dispose = () => {
        if (disposed) return;
        disposed = true; release();
        for (const off of listeners.splice(0)) off();
        button?.remove(); sheet?.remove(); button = null; sheet = null;
    };
    // Event-driven viewport checks only. Nothing runs while the page is idle.
    return Object.freeze({ isEnabled: () => preference.enabled,
        setEnabled(enabled) { if (disposed) return; release(); preference = { ...preference, enabled: enabled === true }; save(); render(); },
        resetPosition() { if (disposed) return; release(); preference = { ...preference, ...DEFAULT_POSITION }; save(); render(); },
        setCovered(value) { if (disposed) return; covered = value === true; release(); render(); },
        dispose });
}
