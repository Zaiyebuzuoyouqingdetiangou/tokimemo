import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { normalizeTravel } from '../src/modes/travel.js';
import { captureTaskOrigin } from '../src/core/context.js';
import { state as runtimeState } from '../src/core/state.js';

// ---------------------------------------------------------------------------
// Minimal DOM so the view modules can render into a stub body.
// ---------------------------------------------------------------------------
function makeEl(tag = 'div') {
    return {
        tagName: String(tag).toUpperCase(), id: '', className: '', textContent: '', innerHTML: '',
        hidden: false, disabled: false, dataset: {}, children: [],
        style: { setProperty() {}, removeProperty() {} },
        classList: { add() {}, remove() {}, contains() { return false; } },
        appendChild(c) { this.children.push(c); return c; },
        prepend(c) { this.children.unshift(c); return c; },
        replaceChildren() { this.children = []; },
        remove() {}, addEventListener() {}, removeEventListener() {},
        setAttribute() {}, removeAttribute() {}, getAttribute() { return ''; }, focus() {},
        showModal() {}, close() {}, matches() { return false; }, closest() { return null; },
        querySelector() { return null; }, querySelectorAll() { return []; },
    };
}

const overlayBody = makeEl();
const registry = new Map();
globalThis.document = {
    getElementById(id) { return registry.get(id) || null; },
    querySelector(sel) { return sel.includes('.rmt-body') ? overlayBody : (registry.get((sel.match(/^#([\w-]+)$/) || [])[1]) || null); },
    querySelectorAll() { return []; },
    createElement(t) { return makeEl(t); },
    body: { appendChild() {} }, head: { appendChild() {} },
    addEventListener() {}, removeEventListener() {},
};
const toasts = [];
globalThis.toastr = { info: m => toasts.push(m), success() {}, warning() {}, error() {} };

const memoryBank = {
    archiveName: '路线测试档案', archiveRevision: 'rev-postcard', characterName: '林砚', userName: '阿澄',
    memories: [{ id: 'M001', date: '2026/08/01', title: '河边散步', summary: '两个人在河边散步。', anchors: ['河边散步'] }],
};

const SETTING_EVIDENCE = '林砚常去旧河堤和夜间书店，也可能抵达北方海港、山间终点与远方据点；地点位于城南、旧街、北岸、西岭和远方区域。';
const presentActs = () => [
    { time: 'today', wish: 'peace', gesture: 'walk', tone: 'quiet', register: 'plain', image: 'path', intensity: 'low', cadence: 'fragments' },
    { time: 'now', emotion: 'grateful', wish: 'joy', tone: 'warm', register: 'restrained', image: 'light', intensity: 'medium', cadence: 'single' },
    { time: 'tonight', wish: 'good-dreams', gesture: 'listen', tone: 'quiet', register: 'lyrical', image: 'stars', intensity: 'low', cadence: 'stacked' },
];

function travelSession(tone = 'ocean', mapTheme = 'coast', extraPostcard = {}, sceneTheme = undefined, neutralScene = false) {
    const farName = neutralScene ? '远方据点' : '北方海港';
    const farRegion = neutralScene ? '远方区域' : '北岸';
    const farSummary = neutralScene ? '工作路线可能抵达的一处远方地点。' : '工作路线可能抵达的远方港口。';
    return normalizeTravel({
        title: '他的出行路线', mapTheme, routeSummary: '他的日常路线。',
        locations: [
            { id: 'N1', kind: 'near', name: '旧河堤', region: '城南', distanceToken: 'walk', summary: '模型简介被忽略。', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, dialogueActs: presentActs() },
            { id: 'N2', kind: 'near', name: '夜间书店', region: '旧街', distanceToken: 'local', summary: '模型简介被忽略。', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, dialogueActs: presentActs() },
            { id: 'F1', kind: 'far', name: farName, region: farRegion, distanceLabel: '夜车一程', summary: farSummary, basis: '设定', sceneTheme,
              distanceToken: 'journey', sourceSettingEvidence: SETTING_EVIDENCE, keepsake: { kind: 'postcard', tone, presentExpressions: presentActs(), ...extraPostcard } },
            { id: 'F2', kind: 'far', name: '山间终点', region: '西岭', distanceLabel: '很远', summary: '地图尽头的高地。', basis: '设定',
              distanceToken: 'distant', sourceSettingEvidence: SETTING_EVIDENCE, keepsake: { kind: 'postcard', tone: 'forest', presentExpressions: presentActs() } },
        ],
    }, memoryBank, { controlledEvidence: SETTING_EVIDENCE });
}

async function renderPostcard(session, locationId = 'F1') {
    const ui_travelView = await import('../src/ui/travelView.js');
    runtimeState.activeMode = 'travel';
    runtimeState.activeSession = session;
    runtimeState.activeSession.selectedLocationId = locationId;
    runtimeState.activeArchiveSnapshot = { characterName: '林砚', memory: { userName: '阿澄' } };
    ui_travelView.renderTravel();
    return overlayBody.innerHTML;
}

test('far-away postcard renders an HTML/SVG/CSS picture side alongside the text', async () => {
    const html = await renderPostcard(travelSession());

    // Picture side exists and is real SVG, not text.
    assert.match(html, /<figure class="rmt-travel-postcard-face">/);
    assert.match(html, /<svg class="rmt-travel-postcard-scene"/);
    assert.match(html, /viewBox="0 0 120 60"/);
    assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
    for (const cls of ['pc-sky', 'pc-ground', 'pc-orb', 'pc-path']) {
        assert.ok(html.includes(`class="${cls}"`), `scene layer ${cls} missing`);
    }
    // Written side survives intact.
    assert.match(html, /<div class="rmt-travel-postcard-back">/);
    assert.match(html, /北方海港 · 寄页/);
    assert.match(html, /林砚/);
    assert.match(html, /class="rmt-travel-postcard-mark"/);
    // Theme token reaches the CSS hook.
    assert.match(html, /data-rmt-postcard-theme="coast"/);
    assert.match(html, /rmt-travel-postcard tone-ocean/);
});

test('legacy far-away locations infer different allowlisted scenes inside one map', async () => {
    const session = travelSession('paper', 'coast');
    assert.equal(session.locations.find(item => item.id === 'F1')?.sceneTheme, 'coast');
    assert.equal(session.locations.find(item => item.id === 'F2')?.sceneTheme, 'mountain');

    const coast = await renderPostcard(session, 'F1');
    assert.match(coast, /data-rmt-postcard-theme="coast"/);
    assert.match(coast, /class="pc-sea"/);
    assert.doesNotMatch(coast, /class="pc-snow"/);

    const mountain = await renderPostcard(session, 'F2');
    assert.match(mountain, /data-rmt-postcard-theme="mountain"/);
    assert.match(mountain, /class="pc-snow"/);
    assert.doesNotMatch(mountain, /class="pc-sea"/);
});

test('postcard illustration keeps its complete two-to-one scene at desktop and mobile widths', async () => {
    const styles = await readFile(new URL('../src/ui/styles.js', import.meta.url), 'utf8');
    const html = await renderPostcard(travelSession());
    const svg = html.match(/<svg class="rmt-travel-postcard-scene"[\s\S]*?<\/svg>/)?.[0] || '';

    assert.match(svg, /viewBox="0 0 120 60"/);
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
    assert.match(svg, /class="pc-sea"[^>]*d="M0 46 L120 46 L120 60 L0 60 Z"/);
    assert.match(svg, /class="pc-ground"[^>]*d="M0 52 L120 52 L120 60 L0 60 Z"/);
    assert.match(styles, /\.rmt-travel-postcard-scene\{display:block;width:100%;height:auto;aspect-ratio:2\/1\}/);
    assert.doesNotMatch(styles, /\.rmt-travel-postcard-scene\{height:132px\}/);
});

test('each map theme draws its own scene and the drawing is deterministic', async () => {
    const seen = new Map();
    for (const theme of ['city', 'coast', 'forest', 'mountain', 'campus', 'historic', 'fantasy', 'scifi']) {
        const html = await renderPostcard(travelSession('paper', theme, {}, theme, true));
        const svg = html.match(/<svg class="rmt-travel-postcard-scene"[\s\S]*?<\/svg>/)[0];
        assert.ok(svg.length > 200, `${theme} scene is suspiciously small`);
        seen.set(theme, svg);
        // Same input renders byte-identical output on a second pass.
        const again = await renderPostcard(travelSession('paper', theme, {}, theme, true));
        assert.equal(again.match(/<svg class="rmt-travel-postcard-scene"[\s\S]*?<\/svg>/)[0], svg, `${theme} is not deterministic`);
    }
    assert.equal(new Set(seen.values()).size, 8, 'themes must not all draw the same picture');
});

test('the scene and prose are code-owned: model free text cannot inject geometry, colour or markup', async () => {
    const hostile = {
        tone: 'javascript:alert(1)',
        title: '<script>alert(1)</script>',
        postmark: '"><svg onload=alert(1)>',
        stampLabel: 'url(https://evil.example/x.png)',
        body: '正文很长。'.repeat(40) + '<img src=x onerror=alert(1)> #ff0000 translate(99,99)',
        closing: '</svg><script>x</script>',
    };
    const session = travelSession('night', 'scifi', hostile, '"><svg onload=alert(1)>');
    const html = await renderPostcard(session);

    // New-schema free-text fields are ignored altogether; only local structured prose renders.
    assert.ok(!html.includes('<script'), 'raw script tag leaked into the postcard');
    assert.ok(!html.includes('&lt;script&gt;'), 'ignored script payload leaked as text');
    assert.ok(!html.includes('&lt;svg onload'), 'ignored svg payload leaked as text');
    assert.ok(!html.includes('&lt;img src=x onerror'), 'ignored image payload leaked as text');
    // Inside the postcard, exactly one real <svg> exists: the scene this module draws.
    // (The map's own route <svg> lives elsewhere in the same body and is code-owned too.)
    const postcard = html.match(/<section class="rmt-travel-postcard[\s\S]*?<\/section>/)[0];
    assert.equal((postcard.match(/<svg/g) || []).length, 1, 'a second svg element was injected into the postcard');
    // Structural check: escaping turned every hostile '<' into '&lt;', so any real tag
    // left in the postcard is one this module emitted. None of them may carry an on* handler.
    for (const [, inner] of postcard.matchAll(/<([a-zA-Z][^>]*)>/g)) {
        assert.ok(!/\son[a-z]+\s*=/i.test(inner), `live event attribute on emitted tag: <${inner.slice(0, 60)}>`);
    }
    // A url may appear as inert escaped *text* (the stamp label prints it), but it must never
    // land inside an attribute value of an emitted tag, which is the only place it could load.
    for (const [, inner] of postcard.matchAll(/<([a-zA-Z][^>]*)>/g)) {
        for (const [, value] of inner.matchAll(/=\s*"([^"]*)"/g)) {
            assert.ok(!/https?:|url\(/i.test(value), `url reached an attribute: ${value.slice(0, 60)}`);
        }
    }
    // Rejected tone falls back to the allowlist default, never the hostile string.
    assert.ok(!html.includes('tone-javascript'), 'tone allowlist bypassed');
    assert.ok(!html.includes('data-rmt-postcard-theme="&quot;'), 'sceneTheme allowlist bypassed');
    // Every number inside the <svg> is locally generated, so no hostile literal survives there.
    const svg = html.match(/<svg class="rmt-travel-postcard-scene"[\s\S]*?<\/svg>/)[0];
    assert.ok(!svg.includes('#ff0000'), 'model colour reached the svg');
    assert.ok(!svg.includes('translate(99,99)'), 'model transform reached the svg');
    assert.ok(!/https?:/.test(svg), 'url reached the svg');
});

// ---------------------------------------------------------------------------
// Generation navigation lock
// ---------------------------------------------------------------------------

function resetTasks() {
    runtimeState.busy = false;
    runtimeState.activeTaskLabel = '';
    runtimeState.activeTaskOrigin = null;
    runtimeState.activeGenerationTasks.clear();
    runtimeState.activeCgImageTasks.clear();
    runtimeState.roomLifeRefreshPromise = null;
}

function installContext(chatId = 'chat-A') {
    globalThis.SillyTavern = {
        getContext: () => ({
            chat: [], chatMetadata: {}, characterId: 0, groupId: null, name1: '阿澄', name2: '林砚',
            characters: [{ avatar: 'lin.png', name: '林砚' }],
            extensionSettings: {}, extensionPrompts: {},
            getCurrentChatId: () => chatId,
            saveSettingsDebounced() {}, saveMetadataDebounced() {},
            eventSource: { on() {}, off() {} }, eventTypes: {},
        }),
    };
}

test('a task bound to the current chat is reported; one bound elsewhere is not', async () => {
    const coordinator = await import('../src/core/requestCoordinator.js');
    installContext('chat-A');
    resetTasks();
    assert.equal(coordinator.hasCurrentChatBlockingTask(), false);

    runtimeState.activeGenerationTasks.set('t1', {
        key: 't1', label: '正在生成回忆相簿', mode: 'album',
        origin: captureTaskOrigin(undefined, 'rev-postcard'),
    });
    assert.equal(coordinator.hasCurrentChatBlockingTask(), true);
    assert.deepEqual(coordinator.currentChatBlockingTasks(), ['正在生成回忆相簿']);

    // Same task, but the user is now standing in a different chat.
    installContext('chat-B');
    assert.equal(coordinator.hasCurrentChatBlockingTask(), false, 'a foreign-chat task must not lock this chat');
    resetTasks();
});

test('closing the archive room is blocked while generating, and allowed after confirming', async () => {
    const ui_overlay = await import('../src/ui/overlay.js');
    installContext('chat-A');
    resetTasks();

    const overlay = makeEl('div');
    overlay.id = 'heartbeat_memories_overlay';
    overlay.hidden = false;
    registry.set('heartbeat_memories_overlay', overlay);

    runtimeState.busy = true;
    runtimeState.activeTaskLabel = '正在整理聊天档案';
    runtimeState.activeTaskOrigin = captureTaskOrigin(undefined, 'rev-postcard');

    let asked = 0;
    globalThis.confirm = message => { asked += 1; globalThis.__lastConfirm = message; return false; };
    ui_overlay.closeArchiveOverlayFromUser();
    assert.equal(asked, 1, 'user must be asked before leaving mid-generation');
    assert.equal(overlay.hidden, false, 'overlay must stay open when the user declines');
    assert.match(globalThis.__lastConfirm, /正在整理聊天档案/);

    globalThis.confirm = () => true;
    ui_overlay.closeArchiveOverlayFromUser();
    assert.equal(overlay.hidden, true, 'overlay must close once the user confirms');

    // With nothing running, closing is silent as before.
    resetTasks();
    overlay.hidden = false;
    let askedAgain = 0;
    globalThis.confirm = () => { askedAgain += 1; return true; };
    ui_overlay.closeArchiveOverlayFromUser();
    assert.equal(askedAgain, 0, 'idle close must not nag the user');
    assert.equal(overlay.hidden, true);
    registry.delete('heartbeat_memories_overlay');
});

test('host chat-navigation clicks are matched only for real switch controls', async () => {
    const portal = await import('../src/ui/archivePortal.js');
    const node = { matches: () => true };
    const event = { target: { closest: sel => (sel.includes('.character_select') ? node : null) } };
    assert.equal(portal.hostChatNavigationTargetFromEvent(event), node);
    assert.equal(portal.hostChatNavigationTargetFromEvent({ target: { closest: () => null } }), null);
    assert.equal(portal.hostChatNavigationTargetFromEvent({}), null);
    assert.equal(portal.hostChatNavigationTargetFromEvent(null), null);
});
