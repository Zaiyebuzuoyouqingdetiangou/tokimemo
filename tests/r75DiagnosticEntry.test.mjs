import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installRuntimeDiagnostic, uninstallRuntimeDiagnostic } from '../src/core/diagnosticReport.js';
import { mountSettings } from '../src/ui/settingsPanel.js';
import { mountHomeDiagnostics } from '../src/ui/homeView.js';
import { state } from '../src/core/state.js';

// DOM/event fixture only: it checks the real bootstrap entry and actions, not layout.
class NodeFixture {
    constructor(tag, ownerDocument) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument; this.children = [];
        this.attributes = new Map(); this.listeners = new Map(); this.dataset = {};
        this.hidden = false; this.className = ''; this.textContent = ''; this.style = {};
        if (tag === 'textarea') this.value = '';
        if (tag === 'details') this.open = false;
    }
    get isConnected() { return this === this.ownerDocument || !!this.parentNode?.isConnected; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    hasAttribute(key) { return this.attributes.has(key); }
    matches(selector) {
        return selector.split(',').some(part => {
            const one = part.trim();
            if (one.startsWith('#')) return this.id === one.slice(1);
            if (one.startsWith('.')) return this.className.split(/\s+/).includes(one.slice(1));
            const attr = one.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
            if (attr) return this.hasAttribute(attr[1]) && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
            return this.tagName.toLowerCase() === one;
        });
    }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
    querySelector(selector) {
        for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; }
        return null;
    }
    querySelectorAll(selector) {
        const results = [];
        for (const child of this.children) { if (child.matches(selector)) results.push(child); results.push(...child.querySelectorAll(selector)); }
        return results;
    }
    appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
    remove() { if (!this.parentNode) return; this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    addEventListener(type, callback, options = {}) {
        const list = this.listeners.get(type) || [];
        list.push({ callback, capture: options === true || options.capture === true, once: options.once === true }); this.listeners.set(type, list);
    }
    removeEventListener(type, callback, options = {}) {
        const capture = options === true || options.capture === true;
        this.listeners.set(type, (this.listeners.get(type) || []).filter(row => row.callback !== callback || row.capture !== capture));
    }
    dispatch(type) {
        const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
        const event = { type, target: this, button: 0, preventDefault() {}, composedPath: () => path };
        const deliver = (node, capture) => {
            for (const row of [...(node.listeners.get(type) || [])]) {
                if (row.capture !== capture) continue;
                row.callback(event);
                if (row.once) node.removeEventListener(type, row.callback, { capture });
            }
        };
        for (const node of [...path].reverse()) deliver(node, true);
        for (const node of path) deliver(node, false);
    }
    click() {
        if (this.tagName === 'A') this.ownerDocument.downloads.push({ href: this.href, download: this.download });
        if (this.tagName === 'SUMMARY') { this.parentNode.open = !this.parentNode.open; this.parentNode.dispatch('toggle'); }
        this.dispatch('click');
    }
}

function fixture() {
    const document = new NodeFixture('#document'); document.ownerDocument = document; document.readyState = 'loading';
    document.createElement = tag => new NodeFixture(tag, document);
    document.getElementById = id => document.querySelector('#' + id);
    document.head = document.createElement('head'); document.body = document.createElement('body');
    document.appendChild(document.head); document.appendChild(document.body); document.downloads = [];
    const host = document.createElement('div'); host.id = 'extensions_settings2'; document.body.appendChild(host);
    const menu = document.createElement('div'); menu.id = 'extensionsMenu'; document.body.appendChild(menu);
    const archive = document.createElement('div'); archive.id = 'heartbeat_memories_overlay'; document.body.appendChild(archive);
    const context = { extensionSettings: {}, chatMetadata: {}, chat: [] };
    const forbidden = [];
    context.getCharacterCardFields = () => forbidden.push('card');
    context.getWorldInfoPrompt = () => forbidden.push('worldbook');
    context.getTokenCountAsync = () => forbidden.push('tokenizer');
    context.saveMetadataDebounced = () => forbidden.push('save');
    globalThis.document = document;
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.indexedDB = { open() { forbidden.push('idb'); } };
    globalThis.STBaiBaiImage = { generate() { forbidden.push('provider'); } };
    globalThis.localStorage = { getItem() { forbidden.push('storage-read'); }, setItem() { forbidden.push('storage-write'); }, removeItem() { forbidden.push('storage-delete'); } };
    return { document, host, archive, forbidden, context };
}

let sequence = 0;
test('normal diagnostics belong to plugin home, stay collapsed, and offer manual copy on browser failure', async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    const previousBusy = state.busy;
    const f = fixture(); let api;
    try {
        f.context.chat = new Proxy(new Array(100000), { get(target, key) {
            if (key === 'length') return target.length;
            throw new Error('Chat contents must not be read');
        } });
        f.context.getCurrentChatId = () => { throw new Error('Chat identity must not be read'); };
        f.context.chatMetadata.heartbeatMemoriesArchiveV3 = { memories: new Array(8),
            toJSON() { throw new Error('Archive must not be serialized'); } };
        let modeReads = 0;
        f.context.chatMetadata.heartbeatMemoriesTheaterV3 = {
            format: 'gzip-base64-v1', data: 'x'.repeat(1000000), sourceBytes: 3000000,
            modes: new Proxy(['album', 'PRIVATE_CHAT', ...new Array(1000).fill('room')], { get(target, key) {
                if (key !== 'length') {
                    modeReads += 1;
                    if (!/^\d+$/.test(String(key)) || Number(key) >= 32) throw new Error('Unbounded manifest read');
                }
                return Reflect.get(target, key);
            } }), toJSON() { throw new Error('Cache must not be serialized'); },
        };
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('blocked'); } } } });
        api = await import('../index.js?diagnostic-entry=' + (++sequence));
        assert.equal(api.bootPromise, null);
        f.document.dispatch('DOMContentLoaded');
        assert.equal(f.document.getElementById('heartbeat_memories_external_diagnostic'), null, 'ordinary startup leaves diagnostics out of host settings');
        assert.equal(api.mountExternalDiagnostic(), false, 'external entry requires a real runtime load failure');
        assert.equal(mountHomeDiagnostics(f.archive), true);
        const panel = f.archive.querySelector('[data-rmt-home-diagnostic]');
        assert.ok(panel);
        assert.equal(panel.parentNode, f.archive);
        assert.equal(panel.closest('#heartbeat_memories_overlay'), f.archive);
        assert.equal(panel.tagName, 'DETAILS');
        assert.equal(panel.open, false);
        const action = name => panel.querySelector(`[data-rmt-diagnostic-action="${name}"]`);
        const output = panel.querySelector('textarea');
        assert.equal(output.value, '');
        assert.equal(output.hidden, true);
        assert.equal(modeReads, 0, 'mounting troubleshooting does not create a diagnostic report');
        panel.querySelector('summary').click();
        assert.equal(panel.open, true);
        assert.equal(output.value, '');
        assert.equal(modeReads, 0, 'expanding troubleshooting still does not create a report');
        action('show').click();
        assert.equal(JSON.parse(output.value).plugin.runtimeLoaded, false);
        assert.equal(JSON.parse(output.value).performance.messageCount, 100000);
        assert.equal(JSON.parse(output.value).performance.sourceBytes, 3000000);
        assert.ok(!output.value.includes('PRIVATE_CHAT'));
        assert.equal(modeReads, 32);
        assert.equal(output.closest('[data-rmt-diagnostic-panel]').hidden, false);
        assert.equal(api.bootPromise, null, 'opening a report must not request the runtime bundle');
        action('close').click();
        assert.equal(panel.open, false);
        assert.equal(output.value, '');
        assert.equal(output.closest('[data-rmt-diagnostic-panel]').hidden, true);
        panel.querySelector('summary').click();
        action('copy').click(); await Promise.resolve(); await Promise.resolve();
        assert.match(panel.querySelector('[role="status"]').textContent, /手动复制/);
        assert.ok(output.value.includes('declaredVersion'));
        assert.equal(output.readOnly, true);

        // Settings handover must not add a duplicate diagnostics block to the host.
        f.document.getElementById('heartbeat_memories_settings').remove();
        installRuntimeDiagnostic(); state.busy = true;
        globalThis.__heartbeatMemoriesRuntimeLoaded = true;
        assert.equal(mountSettings(), true);
        assert.equal(mountHomeDiagnostics(f.archive), true);
        assert.equal(f.archive.querySelectorAll('[data-rmt-home-diagnostic]').length, 1);
        assert.equal(f.document.getElementById('heartbeat_memories_external_diagnostic'), null);
        action('copy').click(); await Promise.resolve(); await Promise.resolve();
        assert.equal(JSON.parse(output.value).runtime.busy, true);
        assert.equal(api.bootPromise, null);
        assert.deepEqual(f.forbidden, []);

        // A WebView can report download support and still reject the operation.
        URL.createObjectURL = () => { throw new Error('not supported'); };
        action('export').click();
        assert.match(panel.querySelector('[role="status"]').textContent, /无法下载/);
        assert.equal(JSON.parse(output.value).runtime.busy, true);
        const blobs = [], revoked = [];
        URL.createObjectURL = blob => { blobs.push(blob); return 'blob:diagnostic-test'; };
        URL.revokeObjectURL = url => revoked.push(url);
        action('export').click();
        assert.equal(f.document.downloads.length, 1);
        assert.equal(f.document.downloads[0].download, 'Hearttrace-diagnostic.json');
        assert.equal(JSON.parse(await blobs[0].text()).runtime.busy, true);
        assert.equal(output.hidden, true, 'a successful export does not put technical data in settings');
        assert.equal(output.value, '');
        assert.equal(panel.querySelector('a'), null);
        api.onDisable();
        assert.equal(f.document.getElementById('heartbeat_memories_external_diagnostic'), null);
        assert.equal(api.mountExternalDiagnostic(), false);
        assert.deepEqual(revoked, ['blob:diagnostic-test']);
        assert.equal((f.document.listeners.get('touchstart') || []).length, 0);
        assert.equal((f.document.listeners.get('pointerdown') || []).length, 0);
        assert.equal(globalThis.__heartbeatMemoriesDeliverDiagnostic, undefined);
    } finally {
        api?.onClean(); uninstallRuntimeDiagnostic(); state.busy = previousBusy;
        URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
        for (const key of ['document', 'SillyTavern', 'indexedDB', 'STBaiBaiImage', 'localStorage']) delete globalThis[key];
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    }
});

test('a failed lazy runtime load leaves diagnostics usable and disable prevents late remount', async () => {
    const f = fixture(); let api;
    try {
        // The unchanged entry is loaded with no relative bundle address available,
        // reproducing a missing/unresolvable deployed runtime without mocking it.
        const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
        api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#loader-failure');
        f.document.dispatch('DOMContentLoaded');
        assert.equal(f.document.getElementById('heartbeat_memories_external_diagnostic'), null);
        await assert.rejects(api.ensureRuntime('settings'));
        const panel = f.document.getElementById('heartbeat_memories_external_diagnostic');
        assert.ok(panel, 'only a failed load exposes the host fallback');
        assert.equal(panel.parentNode, f.host);
        assert.equal(api.bootPromise, null);
        assert.equal(f.document.getElementById(panel.id), panel);
        panel.querySelector('summary').click();
        panel.querySelector('[data-rmt-diagnostic-action="show"]').click();
        assert.equal(JSON.parse(panel.querySelector('textarea').value).plugin.runtimeLoaded, false);
        assert.deepEqual(f.forbidden, []);
        const pending = api.ensureRuntime('settings');
        api.onDisable();
        await assert.rejects(pending);
        assert.equal(f.document.getElementById(panel.id), null);
        assert.equal(f.document.getElementById('heartbeat_memories_settings'), null);
        assert.equal((f.document.listeners.get('pointerdown') || []).length, 0);
    } finally {
        api?.onClean();
        for (const key of ['document', 'SillyTavern', 'indexedDB', 'STBaiBaiImage', 'localStorage']) delete globalThis[key];
    }
});

test('copy success stays compact and late clipboard failure cannot reopen a dismissed report', async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const f = fixture(); let api;
    try {
        const copied = [];
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => { copied.push(text); } } } });
        api = await import('../index.js?diagnostic-entry=' + (++sequence));
        f.document.dispatch('DOMContentLoaded');
        assert.equal(mountHomeDiagnostics(f.archive), true);
        const panel = f.archive.querySelector('[data-rmt-home-diagnostic]');
        const action = name => panel.querySelector(`[data-rmt-diagnostic-action="${name}"]`);
        const output = panel.querySelector('textarea');
        panel.querySelector('summary').click();
        action('copy').click(); await Promise.resolve(); await Promise.resolve();
        assert.equal(copied.length, 1);
        assert.equal(JSON.parse(copied[0]).plugin.runtimeLoaded, false);
        assert.equal(output.value, '');
        assert.equal(output.hidden, true);
        assert.match(panel.querySelector('[role="status"]').textContent, /已复制/);

        let rejectCopy;
        globalThis.navigator.clipboard.writeText = () => new Promise((resolve, reject) => { rejectCopy = reject; });
        action('copy').click();
        action('close').click();
        rejectCopy(new Error('clipboard rejected after close'));
        await Promise.resolve(); await Promise.resolve();
        assert.equal(panel.open, false);
        assert.equal(output.value, '');
        assert.equal(output.hidden, true);
        assert.equal(panel.querySelector('[role="status"]').textContent, '');

        panel.querySelector('summary').click();
        action('show').click();
        assert.ok(output.value.includes('declaredVersion'));
        panel.querySelector('summary').click();
        assert.equal(output.value, '', 'collapsing troubleshooting clears the visible report');
        assert.equal(output.hidden, true);
        assert.equal(api.bootPromise, null);
        assert.deepEqual(f.forbidden, []);
    } finally {
        api?.onClean();
        for (const key of ['document', 'SillyTavern', 'indexedDB', 'STBaiBaiImage', 'localStorage']) delete globalThis[key];
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    }
});


test('home diagnostics also copy and export when runtime is loaded without bootstrap delivery', async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    const originalDelivery = globalThis.__heartbeatMemoriesDeliverDiagnostic;
    const lifecycleEpoch = state.runtimeLifecycleEpoch;
    const f = fixture();
    try {
        delete globalThis.__heartbeatMemoriesDeliverDiagnostic;
        const copied = [], blobs = [];
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => copied.push(text) } } });
        URL.createObjectURL = blob => { blobs.push(blob); return 'blob:runtime-diagnostic'; };
        URL.revokeObjectURL = () => {};
        assert.equal(mountHomeDiagnostics(f.archive), true);
        const panel = f.archive.querySelector('[data-rmt-home-diagnostic]');
        const output = panel.querySelector('textarea');
        const action = name => panel.querySelector(`[data-rmt-diagnostic-action="${name}"]`);
        panel.querySelector('summary').click();
        assert.equal(output.value, '');
        action('copy').click(); await Promise.resolve(); await Promise.resolve();
        assert.equal(copied.length, 1);
        assert.ok(JSON.parse(copied[0]).runtime);
        assert.equal(output.hidden, true);
        action('export').click();
        assert.equal(f.document.downloads[0].download, 'Hearttrace-diagnostic.json');
        assert.ok(JSON.parse(await blobs[0].text()).runtime);
        assert.equal(output.hidden, true);
        URL.createObjectURL = () => { throw new Error('unsupported'); };
        action('export').click();
        assert.equal(output.hidden, false);
        assert.match(panel.querySelector('[role="status"]').textContent, /无法下载/);
        action('close').click();
        assert.equal(output.value, '');
        panel.querySelector('summary').click();
        let rejectCopy;
        globalThis.navigator.clipboard.writeText = () => new Promise((resolve, reject) => { rejectCopy = reject; });
        action('copy').click();
        f.archive.remove();
        rejectCopy(new Error('late clipboard failure'));
        await Promise.resolve(); await Promise.resolve();
        assert.equal(output.value, '', 'a removed home cannot be reopened by a late clipboard failure');
        f.document.body.appendChild(f.archive);
        action('copy').click();
        state.runtimeLifecycleEpoch += 1;
        rejectCopy(new Error('runtime destroyed'));
        await Promise.resolve(); await Promise.resolve();
        assert.equal(output.value, '', 'runtime destruction fences late copy results');
        assert.deepEqual(f.forbidden, []);
    } finally {
        state.runtimeLifecycleEpoch = lifecycleEpoch;
        URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
        if (originalDelivery) globalThis.__heartbeatMemoriesDeliverDiagnostic = originalDelivery;
        else delete globalThis.__heartbeatMemoriesDeliverDiagnostic;
        for (const key of ['document', 'SillyTavern', 'indexedDB', 'STBaiBaiImage', 'localStorage']) delete globalThis[key];
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    }
});
