import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { WORKSPACE_ROUTES } from '../src/ui/workspaceState.js';

async function load(file, dependencies, globals = {}) {
    const context = vm.createContext({ console, ...globals });
    const module = new vm.SourceTextModule(await readFile(new URL(file, import.meta.url), 'utf8'), { context });
    await module.link(specifier => {
        const values = dependencies[specifier] || {};
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

// DOM boundary double: retain node identity and count writes, rather than testing
// string replacements in the placement helpers. No host or provider is connected.
class Element {
    constructor() { this.children = []; this.nodes = new Map(); this.options = []; this.value = ''; this.dataset = {}; this.writes = 0; }
    set hidden(value) { this._hidden = value; this.writes++; }
    get hidden() { return this._hidden; }
    set open(value) { this._open = value; this.writes++; }
    get open() { return this._open; }
    set innerHTML(value) { this.html = value; }
    append(node) { node.remove(); this.children.push(node); node.parentElement = this; this.writes++; }
    appendChild(node) { this.append(node); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
    querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new Element()); return this.nodes.get(selector); }
    replaceChildren(...nodes) { this.options = nodes; }
    add(option) { this.options.push(option); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    addEventListener() {}
    removeEventListener() {}
}

test('settings reader survives park, detached cached panel and remount with no synthesis or redundant DOM writes', async () => {
    const overlay = new Element(), target = new Element();
    let reads = 0, inspections = 0, stops = 0;
    const reader = { stop() { stops++; }, snapshot: () => ({ locked: false }), subscribe: () => () => {}, read() { reads++; } };
    const doc = { createElement: () => new Element(), addEventListener() {}, removeEventListener() {} };
    const module = await load('../src/ui/mirrorTtsReader.js', { '../core/mirrorTts.js': {
        createMirrorReader: () => reader,
        inspectMirror: () => { inspections++; return { ok: true, voices: [{ name: '角色音色', hasOwnVoice: true }], message: '已连接' }; },
    } }, { document: doc, window: doc, Option: class { constructor(text, value) { this.text = text; this.value = value; } },
        MutationObserver: class { observe() {} disconnect() {} } });
    module.mountMirrorReader(overlay);
    assert.equal(module.showMirrorSettings(target), true);
    const bar = target.children[0];
    bar.querySelector('select').value = '角色音色';
    const writes = target.writes + bar.writes;
    module.showMirrorSettings(target);
    assert.equal(target.writes + bar.writes, writes, 'sync must not trigger a mutation observer loop');
    module.parkMirrorSettings();
    assert.equal(bar.parentElement, overlay);
    assert.equal(bar.hidden, true);
    module.showMirrorSettings(target);
    assert.equal(target.children[0], bar);
    assert.equal(bar.querySelector('select').value, '角色音色');
    // Replacing the home body detaches its cached panel; parking still rescues it.
    target.remove(); module.parkMirrorSettings();
    const freshTarget = new Element(); module.showMirrorSettings(freshTarget);
    assert.equal(freshTarget.children[0], bar);
    assert.equal(inspections, 1); assert.equal(reads, 0);
    module.disposeMirrorReader();
    assert.equal(bar.parentElement, null);
    assert.ok(stops > 0);
});

test('home voice shortcut opens and scrolls to settings without hydrating generation controls', async () => {
    const events = [], body = new Element(), home = new Element(), target = new Element();
    const card = { open: false, closest: () => null, scrollIntoView() { events.push('scroll'); } };
    home.querySelector = () => ({}); // diagnostics already mounted
    body.querySelector = selector => selector === '.rmt-home' ? home : selector.includes('settings-section') ? card : target;
    const runtime = {}, workspace = {};
    const module = await load('../src/ui/homeView.js', {
        '../core/context.js': { getContext: () => ({ name2: '角色' }) },
        '../core/text.js': { normalizeText: value => value, esc: value => value },
        '../archive/repository.js': { getImportedMemory: () => null },
        './overlay.js': { openOverlay() {}, topTitle() {}, setBackVisible() {}, setRegenerateVisible() {}, setManageVisible() {}, bodyEl: () => body },
        './settingsPanel.js': { mountSettings({ homeTarget }) { assert.equal(homeTarget, target); events.push('mount'); }, hydrateSettingsPanel() { throw Error('voice does not need API hydration'); } },
        './navigationBookmark.js': { rememberReadingPosition() {} },
        '../modes/room.js': { stopRoomClock() {} }, './phoneView.js': { stopPhoneClock() {} },
        '../core/state.js': { state: runtime }, './workspace.js': { arrangeSettingsHome() { events.push('arrange'); } },
        './workspaceState.js': { workspace, leaveWorkspaceReader() {} },
        './mirrorTtsReader.js': { parkMirrorSettings() { events.push('park'); } },
    });
    assert.equal(module.showHome({ section: 'voice' }), true);
    assert.equal(runtime.archiveViewLevel, 'home'); assert.equal(runtime.activeMode, null);
    assert.equal(workspace.tab, 'settings'); assert.equal(card.open, true);
    assert.deepEqual(events, ['park', 'mount', 'arrange', 'scroll']);
});

test('page reader includes hand journal prose without widening into composer inputs', async () => {
    const body = { contains: node => node === prose, querySelectorAll(selector) {
        assert.ok(selector.split(',').map(value => value.trim()).includes('.rmt-journal-prose'));
        assert.doesNotMatch(selector, /textarea|input|\.rmt-journal(?:,|$)/);
        return [prose];
    } };
    const prose = { textContent: '保留在手帐中的正文', parentElement: body, closest: () => null,
        matches: () => false, getClientRects: () => [{}] };
    const module = await load('../src/ui/mirrorTtsReader.js', { '../core/mirrorTts.js': { createMirrorReader: () => ({}) } },
        { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
    const nodes = module.collectReadingNodes(body);
    assert.equal(nodes.length, 1); assert.equal(nodes[0], prose);
});

test('home bookmark retains the open voice card and restores its scroll position', async () => {
    const runtime = { activeMode: null, activeSession: null, activeArchiveSnapshot: null, archiveViewLevel: 'home', runtimeLifecycleEpoch: 1 };
    const voice = { open: true }, scroller = { scrollTop: 271 }, workspace = { tab: 'settings' };
    const module = await load('../src/ui/navigationBookmark.js', {
        '../core/context.js': { currentCharacterGuard: () => ({}), chatScopeKey: () => 'same-chat', runtimeLifecycleStillCurrent: () => true },
        '../core/constants.js': { OVERLAY_ID: 'test-overlay' }, '../core/state.js': { state: runtime },
        './workspaceState.js': { workspace },
    }, { document: { querySelector: selector => selector.includes('.rmt-body') ? scroller : selector.includes('"voice"') ? voice : null,
        getElementById: () => ({ hidden: false }) } });
    module.rememberReadingPosition(); voice.open = false; scroller.scrollTop = 0;
    let section;
    assert.equal(module.restorePagePosition({ home(options) { section = options.section; } }), true);
    assert.equal(section, 'voice'); assert.equal(voice.open, true); assert.equal(scroller.scrollTop, 271);
});

test('voice card is a mount target rather than credential fields; interaction call is last', async () => {
    const module = await load('../src/ui/settingsPanel.js', {
        '../core/constants.js': { SETTINGS_ID: 'settings' }, '../core/state.js': { state: {} },
    });
    const html = module.voiceSettingsHtml();
    assert.match(html, /data-rmt-settings-section="voice"/);
    assert.match(html, /data-rmt-voice-settings/);
    assert.doesNotMatch(html, /<input|api.key|password/i);
    const interaction = Object.entries(WORKSPACE_ROUTES).filter(([, route]) => route.group === 'interaction');
    assert.equal(interaction.at(-1)[0], 'mirrorCall');
    assert.equal(WORKSPACE_ROUTES.mirrorVoice.group, 'settings');
});
