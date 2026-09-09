import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(process.env.R54_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const out = path.resolve(process.env.R54_BROWSER_OUTPUT || path.join(root, 'artifacts/r54-tt'));
const ttCss = process.env.R54_TT_CSS ? await readFile(process.env.R54_TT_CSS, 'utf8') : '';
const server = http.createServer(async (req, res) => {
    try {
        const name = new URL(req.url, 'http://localhost').pathname;
        if (name === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}.inline-drawer-content{display:block!important}#extensions_settings2{height:100dvh;overflow:auto}</style><div id="extensions_settings2"></div><button id="option_select_chat">切换宿主聊天</button>'); return; }
        if (name === '/host.css') { res.setHeader('Content-Type', 'text/css'); res.end(ttCss); return; }
        const file = path.resolve(root, '.' + name);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript;charset=utf-8' : 'text/plain');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await mkdir(out, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
const results = [], errors = [];
try {
    for (const [width, light] of [[320, false], [390, false], [844, false], [390, true]]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, reducedMotion: 'reduce' });
        await ctx.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        // TT imports remote fonts; network is deliberately blocked, so do not await their load event.
        if (ttCss) await page.evaluate(css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); }, ttCss);
        if (light) await page.evaluate(() => { document.body.style.setProperty('background', '#f5f6fb'); document.body.style.setProperty('color', '#27364b'); });
        await page.evaluate(async () => {
            globalThis.fixture = { characterId: 0, chatId: 'A', name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'a.png' }], chat: [], chatMetadata: {},
                extensionSettings: { heartbeatMemories: { themeMode: 'host' } }, eventSource: { on() {}, off() {} }, saveSettingsDebounced() {} };
            globalThis.SillyTavern = { getContext: () => fixture };
            (await import('/src/ui/styles.js')).ensureStyles();
            (await import('/src/ui/settingsPanel.js')).mountSettings();
            // Representative user beautification fault, deliberately loaded AFTER plugin styles.
            const pollution = document.createElement('style');
            pollution.textContent = 'body label{height:28px!important;max-height:28px!important;overflow:hidden!important;font-family:serif!important;line-height:3!important}body label:after{content:""!important;position:absolute;inset:12px 0 0;background:white;z-index:3}body input[type=checkbox]{min-height:44px!important}';
            document.head.append(pollution);
        });
        await page.locator('.rmt-settings-header').click();
        await page.locator('[data-rmt-settings-section=api]>summary').click();
        await page.locator('[data-rmt-api-select-manual]').click();
        await page.locator('[data-rmt-manual-api-model]').fill('fixture-model');
        await page.locator('[data-rmt-tt-display]').scrollIntoViewIfNeeded();
        const layout = await page.locator('[data-rmt-settings-section=api] .rmt-settings-check').evaluateAll(labels => labels.map(label => {
            const box = label.getBoundingClientRect(), span = label.querySelector('span'), text = span?.getBoundingClientRect();
            const style = getComputedStyle(label), input = label.querySelector('input');
            return { height: box.height, scroll: label.scrollHeight, client: label.clientHeight, after: getComputedStyle(label, '::after').content,
                font: style.fontFamily, opacity: style.opacity, textInside: !!text && text.left >= box.left && text.right <= box.right + 1 && text.bottom <= box.bottom + 1,
                checkboxHeight: input.getBoundingClientRect().height, appearance: getComputedStyle(input).appearance };
        }));
        for (const label of layout) { assert.ok(label.height >= 44); assert.ok(label.scroll <= label.client + 1); assert.equal(label.after, 'none'); assert.equal(label.textInside, true); assert.equal(label.checkboxHeight, 20); }
        const fields = await page.locator('.rmt-settings-field:visible').evaluateAll(labels => labels.map(label => {
            const box = label.getBoundingClientRect();
            return [...label.querySelectorAll('input,select,textarea')].filter(input => input.getClientRects().length).every(input => {
                const child = input.getBoundingClientRect();
                return child.height >= 40 && child.top >= box.top && child.bottom <= box.bottom + 1;
            });
        }));
        assert.ok(fields.length >= 6 && fields.every(Boolean), 'field inputs must remain fully visible inside their labels');
        await page.locator('[data-rmt-room-life-auto]').check();
        assert.equal(await page.locator('[data-rmt-room-life-auto]').isChecked(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(out, `settings-${width}${light ? '-light' : ''}.png`) });
        const modal = await page.evaluate(async () => {
            const overlay = await import('/src/ui/overlay.js'), portal = await import('/src/ui/archivePortal.js');
            const { state } = await import('/src/core/state.js');
            globalThis.confirmCalls = 0; globalThis.confirm = () => { confirmCalls++; return false; };
            globalThis.fixtureController = new AbortController();
            state.activeGenerationTasks.set('fixture-task', { label: '房间', controller: fixtureController });
            portal.bindGenerationNavigationGuards();
            const element = overlay.openOverlay();
            globalThis.hostClicks = 0;
            document.getElementById('option_select_chat').addEventListener('click', () => { hostClicks++; fixture.chatId = 'B'; });
            return { open: element.open, tag: element.tagName };
        });
        assert.equal(modal.tag, 'DIALOG'); assert.equal(modal.open, true);
        await page.locator('.rmt-topbar > [data-rmt-action=close]').click();
        await page.evaluate(() => { document.getElementById('extensions_settings2').style.display = 'none'; });
        await page.locator('#option_select_chat').click();
        const closed = await page.evaluate(async () => { const { state } = await import('/src/core/state.js');
            return { open: document.getElementById('heartbeat_memories_overlay').open, hidden: document.getElementById('heartbeat_memories_overlay').hidden,
                hostClicks, confirmCalls, aborted: fixtureController.signal.aborted, tasks: state.activeGenerationTasks.size, chat: fixture.chatId }; });
        assert.deepEqual(closed, { open: false, hidden: true, hostClicks: 1, confirmCalls: 0, aborted: false, tasks: 1, chat: 'B' });
        results.push({ width, light, layout, fields, closed });
        await ctx.close();
    }
    // Actual settings -> host event -> scheduler -> archive generation/commit, with only provider HTTP mocked.
    const autoContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const paid = [];
    await autoContext.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/api/backends/chat-completions/generate') {
            const body = request.postDataJSON(); paid.push(body);
            const result = paid.length === 1 ? { memories: [{ title: '一起看海', summary: '林舟和小雨在海边看到了灯塔。', anchors: ['灯塔', '海边'], messageStart: 3, messageEnd: 4 }] }
                : { archiveName: '沿途的光', archiveSummary: '两个人散步和看海的记录。', keywords: ['散步', '灯塔'] };
            return route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] } });
        }
        if (url.pathname.startsWith('/api/')) return route.abort();
        return route.continue();
    });
    const auto = await autoContext.newPage(); auto.on('pageerror', error => errors.push(error.message));
    await auto.goto(base);
    await auto.evaluate(async () => {
        const constants = await import('/src/core/constants.js'), core = await import('/src/core/context.js');
        globalThis.autoListeners = new Map(); globalThis.savedMetadata = 0;
        globalThis.autoFixture = { characterId: 0, chatId: 'auto-A', name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'auto-a.png' }],
            chat: [{ name: '小雨', is_user: true, mes: '刚才我们在河边散步。' }, { name: '林舟', is_user: false, mes: '河边的风很凉。' }],
            chatMetadata: {}, extensionSettings: { heartbeatMemories: { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://fixture.invalid/v1', manualApiModel: 'fixture', useCurrentChatExternalMemory: false } },
            event_types: { MESSAGE_RECEIVED: 'fixture-message' }, eventSource: { on(name, fn) { autoListeners.set(name, fn); }, off(name) { autoListeners.delete(name); } },
            saveMetadataDebounced() { savedMetadata++; }, saveSettingsDebounced() {}, getRequestHeaders() { return { 'Content-Type': 'application/json' }; } };
        globalThis.SillyTavern = { getContext: () => autoFixture };
        const snap = await core.buildChatSnapshot(autoFixture);
        autoFixture.chatMetadata[constants.MEMORY_KEY] = { version: 3, chatId: 'auto-A', archiveRevision: 'before-r54', characterName: '林舟', userName: '小雨', archiveName: '沿途的光',
            sourceMessageCount: 2, sourceFingerprint: snap.fingerprint + ':disabled', externalMemoryFingerprint: 'disabled',
            memories: [{ id: 'M001', title: '河边散步', summary: '两个人在河边散步。', anchors: ['河边'], messageStart: 1, messageEnd: 2 }] };
        globalThis.oldMemory = JSON.stringify(autoFixture.chatMetadata[constants.MEMORY_KEY].memories[0]);
        (await import('/src/ui/styles.js')).ensureStyles();
        (await import('/src/ui/settingsPanel.js')).mountSettings();
    });
    await auto.locator('.rmt-settings-header').click();
    await auto.locator('[data-rmt-settings-section=auto]>summary').click();
    await auto.locator('[data-rmt-auto-enabled=archive]').check();
    await auto.locator('[data-rmt-auto-every=archive]').fill('2');
    await auto.locator('[data-rmt-auto-every=archive]').press('Tab');
    await auto.waitForFunction(() => document.querySelector('[data-rmt-auto-status=archive]').textContent.includes('已待命'), { timeout: 10000 });
    assert.equal(paid.length, 0, 'enabling a rule arms the current floor without retrospective requests');
    await auto.evaluate(() => {
        autoFixture.chat.forEach(message => { message.is_system = true; });
        autoFixture.chat.push({ name: '小雨', is_user: true, mes: '今天我们在海边看到了灯塔。', is_system: true }, { name: '林舟', is_user: false, mes: '灯塔亮起来了。' });
        autoListeners.get('fixture-message')();
    });
    await auto.waitForFunction(() => document.querySelector('[data-rmt-auto-status=archive]').textContent.includes('已完成'), { timeout: 10000 });
    const increment = await auto.evaluate(async () => {
        const { MEMORY_KEY } = await import('/src/core/constants.js'), memory = autoFixture.chatMetadata[MEMORY_KEY];
        const result = { count: memory.sourceMessageCount, ids: memory.memories.map(item => item.id), oldUnchanged: JSON.stringify(memory.memories[0]) === oldMemory,
            saved: savedMetadata > 0, scope: memory.chatId, transcript: autoFixture.chat.map(item => item.mes), eventBound: autoListeners.has('fixture-message'),
            status: document.querySelector('[data-rmt-auto-status=archive]').textContent, overlayOpened: !!document.querySelector('dialog[open]') };
        return result;
    });
    assert.equal(paid.length, 2); assert.deepEqual(increment.ids, ['M001', 'M002']); assert.equal(increment.count, 4);
    assert.equal(increment.oldUnchanged, true); assert.equal(increment.saved, true); assert.equal(increment.eventBound, true); assert.equal(increment.overlayOpened, false);
    assert.equal(increment.scope, 'auto-A');
    assert.deepEqual(increment.transcript, ['刚才我们在河边散步。', '河边的风很凉。', '今天我们在海边看到了灯塔。', '灯塔亮起来了。']);
    assert.match(paid[0].messages[0].content, /今天我们在海边看到了灯塔/);
    assert.doesNotMatch(paid[0].messages[0].content, /刚才我们在河边散步/);
    await auto.evaluate(() => {
        autoFixture.chat[0].mes = '历史正文被编辑';
        autoFixture.chat.push({ name: '小雨', is_user: true, mes: '新的一句' }, { name: '林舟', is_user: false, mes: '另一句' });
        autoListeners.get('fixture-message')();
    });
    await auto.waitForFunction(() => document.querySelector('[data-rmt-auto-status=archive]').textContent.includes('基线不一致'), { timeout: 10000 });
    const mismatch = await auto.evaluate(async () => {
        (await import('/src/core/autoUpdates.js')).stopAutoUpdates();
        const { MEMORY_KEY } = await import('/src/core/constants.js');
        return { status: document.querySelector('[data-rmt-auto-status=archive]').textContent, count: autoFixture.chatMetadata[MEMORY_KEY].sourceMessageCount };
    });
    assert.equal(mismatch.count, 4); assert.equal(paid.length, 2, 'edited history must stop before requesting and keep the previous archive');
    results.push({ automaticIncrement: increment, mismatch, simulatedProviderRequests: paid.length });
    await autoContext.close();
    assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
const report = { ok: true, pinnedTtCommit: '9693a4ec47cd4552f90878bccab453f176de0f18', fullTtStylesheet: !!ttCss, results, errors,
    limits: 'Local Edge with actual TT CSS and additional synthetic decorations. Not TT native WebView or the user custom theme; no real provider requests.' };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, cases: results.length, errors }));
