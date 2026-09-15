import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as viewer from '../src/ui/cgImageViewer.js';
import * as overlay from '../src/ui/overlay.js';
import { state } from '../src/core/state.js';
import { OVERLAY_ID } from '../src/core/constants.js';

// A small DOM/event fixture, not a browser/layout emulator. It exercises the
// production view and listener lifecycle without installing a browser package.
const observers = new Set();
function changed(target) {
    for (const observer of observers) if (observer.targets.has(target) && !observer.queued) {
        observer.queued = true;
        queueMicrotask(() => {
            observer.queued = false;
            if (observers.has(observer)) observer.callback();
        });
    }
}
class FixtureObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); }
    observe(target) { this.targets.add(target); observers.add(this); }
    disconnect() { this.targets.clear(); observers.delete(this); }
}
class FixtureNode {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = document;
        this.children = []; this.listeners = new Map(); this.attributes = new Map();
        this.className = ''; this.hidden = false; this.disabled = false; this.textContent = '';
    }
    get firstChild() { return this.children[0] || null; }
    get isConnected() { return this === this.ownerDocument || !!this.parentNode?.isConnected; }
    get classList() {
        return { contains: name => this.className.split(/\s+/).includes(name), toggle: (name, force) => {
            const values = new Set(this.className.split(/\s+/).filter(Boolean));
            const enabled = force ?? !values.has(name);
            if (enabled) values.add(name); else values.delete(name);
            this.className = [...values].join(' '); return enabled;
        } };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; changed(this); return node; }
    remove() {
        const parent = this.parentNode;
        if (!parent) return;
        parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null; changed(parent);
    }
    replaceChildren(...nodes) { [...this.children].forEach(node => node.remove()); nodes.forEach(node => this.appendChild(node)); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelector(selector) {
        const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1))
            : selector.startsWith('#') ? node.id === selector.slice(1) : node.tagName.toLowerCase() === selector;
        for (const child of this.children) { if (matches(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
        return null;
    }
    focus() { this.ownerDocument.activeElement = this; }
    addEventListener(type, callback, capture = false) {
        const entries = this.listeners.get(type) || [];
        entries.push({ callback, capture: capture === true || capture?.capture === true }); this.listeners.set(type, entries);
    }
    removeEventListener(type, callback, capture = false) {
        const isCapture = capture === true || capture?.capture === true;
        this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.callback !== callback || entry.capture !== isCapture));
    }
    dispatch(type, values = {}) {
        const event = { type, target: this, defaultPrevented: false, stopped: false, immediate: false,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.immediate = this.stopped = true; }, ...values };
        const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
        const deliver = (node, capture) => {
            for (const entry of [...(node.listeners.get(type) || [])]) {
                if (entry.capture === capture) entry.callback(event);
                if (event.immediate) break;
            }
        };
        for (const node of [...path].reverse()) { deliver(node, true); if (event.stopped) return event; }
        for (const node of path) { deliver(node, false); if (event.stopped) break; }
        return event;
    }
}
function fixture(href = 'https://cloud.example/') {
    const document = new FixtureNode('#document'); document.ownerDocument = document;
    document.createElement = tag => new FixtureNode(tag, document);
    document.getElementById = id => document.querySelector('#' + id);
    document.body = document.createElement('body'); document.appendChild(document.body);
    const host = document.createElement('dialog'); host.id = OVERLAY_ID; host.open = true;
    const shell = document.createElement('div'); shell.className = 'rmt-shell';
    const body = document.createElement('div'); body.className = 'rmt-body';
    const opener = document.createElement('button'); body.appendChild(opener);
    shell.appendChild(body); host.appendChild(shell); document.body.appendChild(host); opener.focus();
    globalThis.document = document; globalThis.MutationObserver = FixtureObserver;
    globalThis.location = { href, origin: new URL(href).origin };
    const sideEffects = [];
    globalThis.window = { open: () => sideEffects.push('window.open') };
    globalThis.STBaiBaiImage = { generate: () => sideEffects.push('generate') };
    globalThis.toastr = { warning: text => sideEffects.push(text) };
    return { document, host, shell, body, opener, sideEffects };
}
const record = Object.freeze({ url: '/user/images/fixture/event.png', provider: 'baibai-image', prompt: '已保存提示' });
afterEach(() => {
    viewer.closeCgImageViewer({ restoreFocus: false });
    for (const key of ['document', 'MutationObserver', 'location', 'window', 'STBaiBaiImage', 'toastr']) delete globalThis[key];
    assert.equal(observers.size, 0, 'view observers must be released');
});

for (const href of ['https://cloud.example/', 'tauri://localhost/']) {
    test(`view saved image in the same dialog without new windows or provider calls: ${href}`, () => {
        const f = fixture(href), before = JSON.stringify(record);
        assert.equal(viewer.openCgImageViewer(record, '<script>title</script>', { opener: f.opener }), true);
        const element = f.shell.querySelector('.rmt-cg-viewer'), image = element.querySelector('img');
        assert.equal(image.src, record.url);
        assert.equal(element.parentNode, f.shell);
        assert.equal(element.querySelector('.rmt-cg-viewer-title').textContent, '<script>title</script>');
        image.dispatch('load');
        const toggle = element.querySelector('.rmt-cg-viewer-toggle');
        assert.equal(toggle.disabled, false);
        toggle.dispatch('click');
        assert.equal(toggle.textContent, '适屏');
        assert.equal(toggle.getAttribute('aria-pressed'), 'true');
        toggle.dispatch('click');
        assert.equal(toggle.textContent, '原尺寸');
        assert.equal(toggle.getAttribute('aria-pressed'), 'false');
        element.querySelector('.rmt-cg-viewer-close').dispatch('click');
        assert.equal(viewer.hasCgImageViewer(), false);
        assert.equal(f.document.activeElement, f.opener);
        assert.equal(JSON.stringify(record), before);
        assert.deepEqual(f.sideEffects, []);
        assert.equal((f.document.listeners.get('keydown') || []).length, 0);
        assert.equal((f.host.listeners.get('cancel') || []).length, 0);
    });
}

test('invalid external or executable URLs never create a viewer or attach listeners', () => {
    const f = fixture();
    for (const url of ['https://outside.example/a.png', 'javascript:alert(1)', 'data:image/png;base64,AA', 'blob:https://cloud.example/a']) {
        assert.equal(viewer.openCgImageViewer({ url }), false);
    }
    assert.equal(viewer.hasCgImageViewer(), false);
    assert.equal(f.shell.querySelector('.rmt-cg-viewer'), null);
    assert.equal((f.document.listeners.get('keydown') || []).length, 0);
    assert.ok(f.sideEffects.every(value => value.includes('本地路径')));
});

test('load errors are visible and leave the saved record unchanged without retries', () => {
    const f = fixture(); viewer.openCgImageViewer(record, '旧图');
    const element = f.shell.querySelector('.rmt-cg-viewer'), image = element.querySelector('img');
    image.dispatch('error');
    assert.equal(image.hidden, true);
    assert.equal(element.querySelector('.rmt-cg-viewer-status').getAttribute('role'), 'alert');
    assert.match(element.querySelector('.rmt-cg-viewer-status').textContent, /图片加载失败/);
    assert.equal(element.querySelector('.rmt-cg-viewer-toggle').disabled, true);
    assert.equal(image.src, record.url);
    assert.deepEqual(f.sideEffects, []);
});

test('Tab stays in the viewer, and Escape or host cancel closes only the viewer', () => {
    const f = fixture(); let hostCancelled = 0;
    f.host.addEventListener('cancel', () => { hostCancelled++; });
    viewer.openCgImageViewer(record, '旧图');
    let element = f.shell.querySelector('.rmt-cg-viewer'); element.querySelector('img').dispatch('load');
    const stage = element.querySelector('.rmt-cg-viewer-stage'), close = element.querySelector('.rmt-cg-viewer-close');
    close.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(f.document.activeElement, stage);
    stage.dispatch('keydown', { key: 'Tab' }); assert.equal(f.document.activeElement, close);
    assert.equal(close.dispatch('keydown', { key: 'Escape' }).defaultPrevented, true);
    assert.equal(f.host.isConnected, true); assert.equal(f.host.open, true); assert.equal(f.document.activeElement, f.opener);
    viewer.openCgImageViewer(record, '旧图');
    assert.equal(f.host.dispatch('cancel').defaultPrevented, true);
    assert.equal(hostCancelled, 0); assert.equal(viewer.hasCgImageViewer(), false);
    f.host.dispatch('cancel'); assert.equal(hostCancelled, 1, 'host cancellation resumes after view cleanup');
});

test('archive back and close actions dismiss the viewer before changing the active session', () => {
    const f = fixture(), session = { kind: 'album', selectedId: 'fixture' };
    const oldSession = state.activeSession, oldMode = state.activeMode;
    state.activeSession = session; state.activeMode = 'album';
    try {
        viewer.openCgImageViewer(record, '旧图'); overlay.navigateBack();
        assert.equal(viewer.hasCgImageViewer(), false); assert.equal(state.activeSession, session);
        viewer.openCgImageViewer(record, '旧图'); overlay.closeArchiveOverlayFromUser();
        assert.equal(viewer.hasCgImageViewer(), false); assert.equal(state.activeSession, session); assert.equal(f.host.hidden, false);
    } finally { state.activeSession = oldSession; state.activeMode = oldMode; }
});

test('content replacement and host removal release observers and keyboard listeners', async () => {
    const f = fixture(); viewer.openCgImageViewer(record, '旧图');
    f.body.replaceChildren(f.document.createElement('main')); await Promise.resolve();
    assert.equal(viewer.hasCgImageViewer(), false); assert.equal(observers.size, 0);
    assert.equal((f.document.listeners.get('keydown') || []).length, 0);
    viewer.openCgImageViewer(record, '旧图'); f.host.remove(); await Promise.resolve();
    assert.equal(viewer.hasCgImageViewer(), false); assert.equal(observers.size, 0);
    assert.equal((f.host.listeners.get('cancel') || []).length, 0);
});

test('both original-image entry points avoid browser navigation', async () => {
    for (const path of ['src/ui/cgPromptEditor.js', 'src/ui/heartView.js']) {
        const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /target=["']_blank|window\.open\(/);
        assert.match(source, /openCgImageViewer\(/);
    }
});
