import test from 'node:test';
import assert from 'node:assert/strict';
import { createFloatingAvatarButton } from '../src/ui/floatingAvatarButton.js';

// DOM/event boundary only: production dragging, image fallback and cleanup run
// unchanged. This fixture deliberately has no document-wide pointer support.
class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== fn)); }
    dispatch(type, values = {}) {
        const event = { type, button: 0, isPrimary: true, pointerId: 1, clientX: 200, clientY: 200, detail: 1,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
        for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
        return event;
    }
    count() { return [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0); }
}
class Element extends Target {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); if (key === 'src') this.src = ''; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    setPointerCapture(id) { this.capture = id; }
    releasePointerCapture(id) { if (this.capture === id) this.capture = null; }
}
function fixture(t, { capture = true } = {}) {
    const names = ['document', 'window', 'getComputedStyle'];
    const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const doc = new Target(); doc.head = new Element('head'); doc.body = new Element('body');
    doc.documentElement = { clientWidth: 400, clientHeight: 800 };
    doc.createElement = tag => {
        const node = new Element(tag);
        if (!capture) node.setPointerCapture = node.releasePointerCapture = undefined;
        return node;
    };
    const win = new Target(); win.innerWidth = 400; win.innerHeight = 800;
    win.visualViewport = Object.assign(new Target(), { width: 400, height: 800, offsetLeft: 0, offsetTop: 0 });
    const safe = { top: 20, right: 0, bottom: 30, left: 0 };
    const computed = () => ({ getPropertyValue: key => String(safe[key.match(/(top|right|bottom|left)$/)?.[1]] || 0) });
    win.getComputedStyle = computed;
    globalThis.document = doc; globalThis.window = win; globalThis.getComputedStyle = computed;
    let opens = 0; const moves = [];
    const api = createFloatingAvatarButton({ onOpen: () => opens++, onMove: value => moves.push(value), position: { x: 1, y: 1 } });
    const button = doc.body.children.find(node => node.tagName === 'button');
    const image = button.children.find(node => node.tagName === 'img');
    t.after(() => {
        api.destroy();
        for (const [name, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
    });
    return { doc, win, safe, api, button, image, moves, opens: () => opens };
}

test('a native button opens on click/keyboard and shows a heart for missing or failed avatars', t => {
    const f = fixture(t);
    f.api.update({ src: '/characters/a.png', label: '角色甲的档案' });
    assert.equal(f.button.type, 'button'); assert.equal(f.button.hidden, false);
    assert.equal(f.button.getAttribute('aria-label'), '角色甲的档案');
    assert.equal(f.image.src, '/characters/a.png');
    f.image.dispatch('error'); assert.equal(f.image.hidden, true);
    assert.ok(f.button.children.some(node => !node.hidden && /♥|♡|💗/.test(node.textContent || '')));
    f.button.dispatch('click'); f.button.dispatch('click', { detail: 0 }); assert.equal(f.opens(), 2);
    f.api.update({ src: '/characters/b.png' }); assert.equal(f.image.hidden, false);
    f.api.update({ src: '' }); assert.equal(f.image.hidden, true);
    assert.equal(f.image.src, '', 'clearing an avatar must release the previous URL');
    assert.equal(f.moves.length, 0); assert.equal(f.doc.count(), 0);
});

test('drag release saves one normalized position and does not accidentally open the archive', t => {
    const f = fixture(t); f.api.update();
    f.button.dispatch('pointerdown');
    f.button.dispatch('pointermove', { clientX: 100, clientY: 100 });
    assert.equal(f.moves.length, 0);
    f.button.dispatch('pointerup', { clientX: 100, clientY: 100 });
    assert.equal(f.moves.length, 1); assert.ok(f.moves[0].x >= 0 && f.moves[0].x < 1);
    assert.ok(f.moves[0].y >= 0 && f.moves[0].y < 1);
    f.button.dispatch('click'); assert.equal(f.opens(), 0);
    f.button.dispatch('click', { detail: 0 }); assert.equal(f.opens(), 1, 'native keyboard activation remains available after dragging');
    assert.equal(f.button.capture, null);
});

test('a tap with small movement, secondary pointers and unrelated host gestures never save a drag', t => {
    const f = fixture(t); f.api.update();
    f.button.dispatch('pointerdown', { button: 2 }); f.button.dispatch('pointermove', { clientX: 40 }); f.button.dispatch('pointerup');
    f.button.dispatch('pointerdown');
    f.button.dispatch('pointermove', { pointerId: 2, clientX: 0 });
    f.button.dispatch('pointermove', { clientX: 202, clientY: 203 });
    f.button.dispatch('pointerup', { clientX: 202, clientY: 203 }); f.button.dispatch('click');
    assert.equal(f.moves.length, 0); assert.equal(f.opens(), 1); assert.equal(f.doc.count(), 0);
    assert.deepEqual([...f.win.listeners.keys()].sort(), ['resize']);
});

test('safe area and the visible viewport bound the button on resize without persisting layout changes', t => {
    const f = fixture(t); f.api.update();
    assert.ok(parseFloat(f.button.style.top) + 52 <= 800 - f.safe.bottom);
    assert.ok(parseFloat(f.button.style.left) + 52 <= 400);
    Object.assign(f.win.visualViewport, { width: 250, height: 300, offsetLeft: 40, offsetTop: 90 });
    f.win.visualViewport.dispatch('resize');
    assert.ok(parseFloat(f.button.style.top) >= 90 + f.safe.top);
    assert.ok(parseFloat(f.button.style.top) + 52 <= 390 - f.safe.bottom);
    assert.ok(parseFloat(f.button.style.left) >= 40);
    assert.ok(parseFloat(f.button.style.left) + 52 <= 290);
    f.api.update({ position: { x: -9, y: Infinity } });
    assert.ok(Number.isFinite(parseFloat(f.button.style.left))); assert.ok(Number.isFinite(parseFloat(f.button.style.top)));
    assert.equal(f.moves.length, 0);
});

for (const termination of ['pointercancel', 'lostpointercapture']) {
    test(`${termination} restores the last saved placement and does not commit/open a partial drag`, t => {
        const f = fixture(t); f.api.update(); const before = { ...f.button.style };
        f.button.dispatch('pointerdown'); f.button.dispatch('pointermove', { clientX: 0 });
        f.button.dispatch(termination); f.button.dispatch('pointerup', { clientX: 0 }); f.button.dispatch('click');
        assert.equal(f.button.style.left, before.left); assert.equal(f.button.style.top, before.top);
        assert.equal(f.moves.length, 0); assert.equal(f.opens(), 0);
    });
}

test('without pointer capture, leaving the button cancels locally without global touch listeners', t => {
    const f = fixture(t, { capture: false }); f.api.update(); const left = f.button.style.left;
    f.button.dispatch('pointerdown'); f.button.dispatch('pointermove', { clientX: 160 });
    f.button.dispatch('pointerleave'); f.button.dispatch('click');
    assert.equal(f.button.style.left, left); assert.equal(f.moves.length, 0); assert.equal(f.opens(), 0);
    assert.equal(f.doc.count(), 0);
});

test('hiding and repeated destroy cancel active interaction and release every listener and DOM node', t => {
    const f = fixture(t); f.api.update();
    f.button.dispatch('pointerdown'); f.button.dispatch('pointermove', { clientX: 20 });
    f.api.update({ visible: false }); f.button.dispatch('pointerup'); f.button.dispatch('click');
    assert.equal(f.button.hidden, true); assert.equal(f.moves.length, 0); assert.equal(f.opens(), 0);
    f.api.destroy(); f.api.destroy(); f.api.update();
    assert.equal(f.doc.body.children.length, 0); assert.equal(f.doc.head.children.length, 0);
    assert.equal(f.button.count(), 0); assert.equal(f.image.count(), 0);
    assert.equal(f.win.count(), 0); assert.equal(f.win.visualViewport.count(), 0);
});
