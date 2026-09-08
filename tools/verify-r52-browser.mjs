import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.R52_BROWSER_OUTPUT || path.join(root, 'artifacts', 'r52-browser'));
const installPrefix = '/scripts/extensions/third-party/tokimemo';
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/' || url.pathname === installPrefix + '/') {
            res.setHeader('Content-Type', 'text/html;charset=utf-8');
            res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}.inline-drawer-content{display:block!important}</style><div id="extensions_settings2"></div>'); return;
        }
        const pathname = url.pathname.startsWith(installPrefix + '/') ? url.pathname.slice(installPrefix.length) : url.pathname;
        const file = path.resolve(root, '.' + decodeURIComponent(pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript;charset=utf-8' : 'text/plain');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await mkdir(out, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath() });
const cases = [], errors = [], apiCalls = [];
let mockUpdate = false;
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route('**/api/**', route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    apiCalls.push({ endpoint, body: request.postDataJSON() });
    if (!mockUpdate) return route.abort();
    const remoteUrl = 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo';
    const data = endpoint.endsWith('/discover') ? [{ name: 'third-party/tokimemo', type: 'local' }]
        : endpoint.endsWith('/version') ? { currentCommitHash: 'a'.repeat(40), remoteUrl, isUpToDate: false }
        : endpoint.endsWith('/update') ? { remoteUrl, shortCommitHash: 'bbbbbbb', isUpToDate: false } : null;
    return data ? route.fulfill({ json: data }) : route.abort();
});
const observe = page => page.on('pageerror', error => errors.push(error.message));
async function mountScheduler(page, floor = 20) {
    await page.goto(url);
    await page.evaluate(async floor => {
        const { createFloorScheduler, normalizeAutoUpdates } = await import('/src/core/autoUpdatePolicy.js');
        globalThis.current = { scope: 'A', floor, ready: true, lifetime: 1, revision: 'R1',
            rules: normalizeAutoUpdates({ adv: { enabled: true, every: 10 } }) };
        globalThis.scheduler = createFloorScheduler({
            snapshot: () => current, busy: () => false,
            read: scope => JSON.parse(localStorage.getItem('checkpoint:' + scope) || '{}'),
            write: (scope, data) => localStorage.setItem('checkpoint:' + scope, JSON.stringify(data)),
            lock: (scope, job) => navigator.locks.request('fixture-auto:' + scope, { ifAvailable: true }, lock => lock ? job() : undefined),
            run: async mode => {
                const calls = JSON.parse(localStorage.getItem('paidCalls') || '[]');
                calls.push([current.scope, mode, current.floor]);
                localStorage.setItem('paidCalls', JSON.stringify(calls));
                await new Promise(resolve => setTimeout(resolve, 100));
                return { status: 'committed' };
            },
        });
    }, floor);
}
async function mountSettings(page, prefix = '') {
    await page.goto(url + prefix + '/');
    await page.evaluate(async prefix => {
        const settings = JSON.parse(localStorage.getItem('fixture-settings') || '{"themeMode":"gs2"}');
        const ctx = { characterId: 0, chatId: 'fixture-A', name1: '小雨', name2: '林舟', chat: [], chatMetadata: {},
            characters: [{ name: '林舟', avatar: 'lin.png' }], eventSource: { on() {}, off() {} },
            getRequestHeaders() { return { 'Content-Type': 'application/json', 'X-CSRF-Token': 'fixture-only' }; },
            extensionSettings: { heartbeatMemories: settings },
            saveSettingsDebounced() { localStorage.setItem('fixture-settings', JSON.stringify(ctx.extensionSettings.heartbeatMemories)); } };
        globalThis.SillyTavern = { getContext: () => ctx };
        globalThis.settingsContext = ctx;
        (await import(prefix + '/src/ui/styles.js')).ensureStyles();
        (await import(prefix + '/src/ui/settingsPanel.js')).mountSettings();
    }, prefix);
    await page.locator('.rmt-settings-header').click();
    await page.locator('[data-rmt-settings-section="auto"]>summary').click();
}
try {
    const a = await context.newPage(), b = await context.newPage(); observe(a); observe(b);
    await Promise.all([mountScheduler(a), mountScheduler(b)]);
    await Promise.all([a.evaluate(() => scheduler.tick()), b.evaluate(() => scheduler.tick())]);
    await Promise.all([a.evaluate(() => { current.floor = 30; }), b.evaluate(() => { current.floor = 30; })]);
    await Promise.all([a.evaluate(() => scheduler.tick()), b.evaluate(() => scheduler.tick())]);
    assert.deepEqual(await a.evaluate(() => JSON.parse(localStorage.getItem('paidCalls'))), [['A', 'adv', 30]]);
    await mountScheduler(a, 30); await a.evaluate(() => scheduler.tick());
    assert.equal(await a.evaluate(() => JSON.parse(localStorage.getItem('paidCalls')).length), 1);
    await a.evaluate(async () => { current.scope = 'B'; await scheduler.tick(); });
    assert.equal(await a.evaluate(() => JSON.parse(localStorage.getItem('paidCalls')).length), 1);
    await a.evaluate(async () => { current.scope = 'A'; current.floor = 40; await scheduler.tick(); });
    assert.equal(await a.evaluate(() => JSON.parse(localStorage.getItem('paidCalls')).length), 2);
    cases.push('two real browser pages: Web Locks, persisted interval dedupe, reload and A/B isolation');
    const availability = await b.evaluate(async () => {
        Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
        return (await import('/src/core/autoUpdates.js')).autoUpdateAvailability();
    });
    assert.match(availability, /自动更新暂不可用/);
    cases.push('missing Web Locks: automatic work disabled');
    await a.close(); await b.close();

    const page = await context.newPage(); observe(page);
    await mountSettings(page);
    await page.locator('[data-rmt-auto-enabled="adv"]').check();
    await page.locator('[data-rmt-auto-every="adv"]').fill('7');
    await page.locator('[data-rmt-auto-every="adv"]').press('Tab');
    let settings = await page.evaluate(() => settingsContext.extensionSettings.heartbeatMemories);
    assert.equal(settings.autoUpdates.adv.enabled, true); assert.equal(settings.autoUpdates.adv.every, 7);
    assert.ok(Object.entries(settings.autoUpdates).every(([mode, rule]) => mode === 'adv' || !rule.enabled));
    await page.locator('[data-rmt-auto-enabled="archive"]').scrollIntoViewIfNeeded();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        rows: document.querySelectorAll('[data-rmt-auto-status]').length }));
    assert.ok(dimensions.scroll <= dimensions.width); assert.equal(dimensions.rows, 13);
    await page.screenshot({ path: path.join(out, 'auto-settings-390.png') });
    await mountSettings(page);
    assert.equal(await page.locator('[data-rmt-auto-enabled="adv"]').isChecked(), true);
    assert.equal(await page.locator('[data-rmt-auto-every="adv"]').inputValue(), '7');
    await page.locator('[data-rmt-auto-enabled="adv"]').uncheck();
    assert.equal(await page.locator('[data-rmt-auto-status="adv"]').textContent(), '已关闭');
    await page.evaluate(async () => {
        settingsContext.groupId = 'group';
        (await import('/src/core/autoUpdates.js')).refreshAutoUpdateStatus();
    });
    assert.equal(await page.locator('[data-rmt-auto-status="adv"]').textContent(), '未选择可用聊天');
    cases.push('production settings: checkbox/number persist, default-off siblings, status reset and mobile width');
    await page.close();
    assert.deepEqual(apiCalls, []); assert.deepEqual(errors, []);
    mockUpdate = true;
    const updater = await context.newPage(); observe(updater);
    await mountSettings(updater, installPrefix);
    await updater.locator('[data-rmt-self-update]').click();
    await updater.locator('[data-rmt-self-update-status]').filter({ hasText: '已拉取更新' }).waitFor();
    assert.equal(updater.url(), url + installPrefix + '/');
    assert.deepEqual(apiCalls.map(call => call.endpoint), ['/api/extensions/discover', '/api/extensions/version', '/api/extensions/update']);
    for (const call of apiCalls.slice(1)) assert.deepEqual(call.body, { extensionName: 'tokimemo', global: false });
    assert.equal(await updater.locator('[data-rmt-self-update]').isDisabled(), false);
    cases.push('production update button: own-install discovery/version/update against local mocked host, no reload');
    await updater.close(); assert.deepEqual(errors, []);
} finally {
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
const report = { ok: true, engine: 'Edge/Chromium', cases, apiCalls, errors, limits: 'Local synthetic chat fixture; not a live SillyTavern/provider test.' };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
