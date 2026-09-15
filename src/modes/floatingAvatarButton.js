// Presentation only: callers resolve the saved avatar and persist the position.
export function createFloatingAvatarButton({ onOpen, onMove, position = null } = {}) {
    const doc = globalThis.document, win = globalThis.window;
    if (!doc?.createElement || !doc.body || !win) return { update() {}, destroy() {} };
    const button = doc.createElement('button'), image = doc.createElement('img'), heart = doc.createElement('span');
    const style = doc.createElement('style');
    button.id = 'rmt-floating-avatar'; button.type = 'button'; button.hidden = true;
    image.alt = ''; image.draggable = false; image.hidden = true; heart.textContent = '♥';
    heart.setAttribute('aria-hidden', 'true'); button.appendChild(heart); button.appendChild(image);
    style.id = 'rmt-floating-avatar-style';
    style.textContent = `
#rmt-floating-avatar{position:fixed;z-index:9999;display:grid;place-items:center;box-sizing:border-box;width:52px;height:52px;min-width:52px;min-height:52px;max-width:52px;max-height:52px;margin:0;padding:0;right:auto;bottom:auto;border:2px solid #fff;border-radius:50%;overflow:hidden;background:#bd708b;color:#fff;box-shadow:0 2px 12px #0003;font:26px/1 sans-serif;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;appearance:none;--rmt-float-safe-top:env(safe-area-inset-top,0px);--rmt-float-safe-right:env(safe-area-inset-right,0px);--rmt-float-safe-bottom:env(safe-area-inset-bottom,0px);--rmt-float-safe-left:env(safe-area-inset-left,0px)}
#rmt-floating-avatar img{display:block;width:100%;height:100%;margin:0;object-fit:cover;pointer-events:none;border-radius:50%}
#rmt-floating-avatar span{pointer-events:none}
#rmt-floating-avatar[hidden],#rmt-floating-avatar [hidden]{display:none!important}
#rmt-floating-avatar:focus-visible{outline:3px solid #de8fab;outline-offset:3px}`;
    (doc.head || doc.body).appendChild(style); doc.body.appendChild(button);
    const viewport = win.visualViewport, listeners = [];
    const listen = (target, type, fn) => { target?.addEventListener?.(type, fn); listeners.push([target, type, fn]); };
    const unit = (value, fallback) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    const normalized = value => ({ x: unit(value?.x, 1), y: unit(value?.y, 0.75) });
    let point = normalized(position), held = null, suppressClick = false, destroyed = false, source = '';
    let left = 0, top = 0;
    function bounds() {
        const computed = win.getComputedStyle?.(button);
        const safe = side => Math.max(0, parseFloat(computed?.getPropertyValue('--rmt-float-safe-' + side)) || 0);
        const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
        const width = viewport?.width || win.innerWidth || doc.documentElement.clientWidth;
        const height = viewport?.height || win.innerHeight || doc.documentElement.clientHeight;
        const minX = x + safe('left') + 12, minY = y + safe('top') + 12;
        return { minX, minY, maxX: Math.max(minX, x + width - safe('right') - 64),
            maxY: Math.max(minY, y + height - safe('bottom') - 64) };
    }
    function layout() {
        if (destroyed) return;
        const b = bounds();
        left = b.minX + (b.maxX - b.minX) * point.x; top = b.minY + (b.maxY - b.minY) * point.y;
        button.style.left = left + 'px'; button.style.top = top + 'px';
    }
    function release() {
        const previous = held; held = null;
        if (previous?.captured) try { button.releasePointerCapture?.(previous.id); } catch {}
        return previous;
    }
    function cancel() {
        const previous = release();
        if (previous) { suppressClick ||= previous.dragged; point = previous.point; layout(); }
    }
    function move(event) {
        if (!held || event.pointerId !== held.id) return;
        const dx = event.clientX - held.x, dy = event.clientY - held.y;
        if (!held.dragged && Math.hypot(dx, dy) < 6) return;
        held.dragged = true; suppressClick = true;
        const b = bounds();
        point = { x: unit((held.left + dx - b.minX) / (b.maxX - b.minX || 1), point.x),
            y: unit((held.top + dy - b.minY) / (b.maxY - b.minY || 1), point.y) };
        layout();
    }
    listen(button, 'pointerdown', event => {
        if (destroyed || button.hidden || held || event.button !== 0 || event.isPrimary === false) return;
        suppressClick = false;
        held = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top, point: { ...point }, dragged: false, captured: false };
        try { if (button.setPointerCapture) { button.setPointerCapture(event.pointerId); held.captured = true; } } catch {}
    });
    listen(button, 'pointermove', move);
    listen(button, 'pointerup', event => {
        if (!held || event.pointerId !== held.id) return;
        move(event);
        if (release()?.dragged) onMove?.({ ...point });
    });
    for (const type of ['pointercancel', 'lostpointercapture']) listen(button, type, event => {
        if (held?.id === event.pointerId) cancel();
    });
    listen(button, 'pointerleave', () => { if (held && !held.captured) cancel(); });
    listen(button, 'click', event => {
        event.stopPropagation();
        if (destroyed || button.hidden || (suppressClick && event.detail !== 0)) {
            event.preventDefault(); suppressClick = false; return;
        }
        onOpen?.();
    });
    listen(image, 'error', () => { image.hidden = true; heart.hidden = false; });
    const resize = () => { cancel(); layout(); };
    listen(win, 'resize', resize); listen(viewport, 'resize', resize); listen(viewport, 'scroll', resize);
    layout();
    return {
        update({ src = '', label = '心迹回廊', visible = true, position: nextPosition } = {}) {
            if (destroyed) return;
            if (!visible || nextPosition !== undefined) cancel();
            if (nextPosition !== undefined) point = normalized(nextPosition);
            button.hidden = !visible;
            button.setAttribute('aria-label', label); button.title = label;
            if (src !== source) {
                source = src; image.hidden = !src; heart.hidden = !!src;
                if (src) image.src = src; else image.removeAttribute('src');
            }
            layout();
        },
        destroy() {
            if (destroyed) return;
            cancel(); destroyed = true;
            for (const [target, type, fn] of listeners) target?.removeEventListener?.(type, fn);
            listeners.length = 0; button.remove(); style.remove();
        },
    };
}
