import assert from 'node:assert/strict';
import { introduction } from '../tests/fixtures/r57Introduction.mjs';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.R57_BROWSER_OUTPUT || path.join(root, 'artifacts/r57-browser'));
const server = http.createServer(async (req, res) => {
    try {
        const name = new URL(req.url, 'http://localhost').pathname;
        if (name === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#152033;color:#edf2fb}</style>'); return; }
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
const errors = [], cases = [];
const guard = setTimeout(() => { console.error('r57 browser verification exceeded 50 seconds'); process.exit(1); }, 50000);
async function openFixture(page, theme) {
    await page.goto(base);
    await page.evaluate(async theme => {
        const c = await import('/src/core/constants.js'), cache = await import('/src/core/cache.js'), core = await import('/src/core/context.js');
        const evidence = '晚间聊天，林舟问小雨：“明天还来吗？”小雨回答：“我会等你。”';
        globalThis.fixture = { characterId: 0, chatId: 'browser-A', name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'fixture.png' }],
            chat: [], chatMetadata: JSON.parse(localStorage.getItem('fixtureMetadata') || '{}'),
            extensionSettings: { heartbeatMemories: { themeMode: theme, apiConnectionMode: 'manual', manualApiBaseUrl: 'https://fixture.invalid/v1', manualApiModel: 'fixture', useCurrentChatExternalMemory: false, bannedGeneratedPhrases: [] } },
            saveSettingsDebounced() {}, saveMetadataDebounced() { localStorage.setItem('fixtureMetadata', JSON.stringify(this.chatMetadata)); },
            getRequestHeaders() { return { 'Content-Type': 'application/json' }; } };
        globalThis.SillyTavern = { getContext: () => fixture };
        globalThis.confirm = () => true;
        globalThis.toastr = { warning: m => { globalThis.lastWarning = m; }, success() {} };
        if (!fixture.chatMetadata[c.MEMORY_KEY]) {
            fixture.chatMetadata[c.MEMORY_KEY] = { version: 3, chatId: 'browser-A', archiveRevision: 'browser-rev', characterName: '林舟', userName: '小雨',
                archiveName: '旧的聊天标题', archiveSummary: evidence, sourceFingerprint: 'old-fingerprint', sourceMessageCount: 2,
                memories: [{ id: 'M001', title: '晚间聊天', summary: evidence, anchors: ['晚间聊天'] }] };
            const bank = fixture.chatMetadata[c.MEMORY_KEY];
            const plan = (await import('/src/modes/phone.js')).normalizePhonePlan({ deviceKind: 'folio', apps: [{ id: 'NOTES', kind: 'notes', entries: [{ id: 'N1' }] }] }, bank);
            await cache.savePhoneGenerationDraft(fixture, bank, plan, [], 'NOTES', '', core.captureTaskOrigin(fixture, bank.archiveRevision), { failure: { code: 'RMT_CONNECTION_AUTH', status: 401 } });
        }
        await cache.ensureCacheHydrated(fixture);
        (await import('/src/ui/styles.js')).ensureStyles();
        const overlay = await import('/src/ui/overlay.js'); overlay.openOverlay(); overlay.showChooser();
    }, theme);
}
try {
    for (const [width, theme] of [[390, 'default'], [390, 'night'], [1280, 'default'], [390, 'host']]) {
        let requests = 0;
        const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== base) return route.abort();
            if (url.pathname === '/api/backends/chat-completions/generate') {
                requests++;
                return route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(introduction) } }] } });
            }
            if (url.pathname.startsWith('/api/')) return route.abort();
            return route.continue();
        });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await openFixture(page, theme);
        assert.equal(requests, 0);
        assert.equal(await page.locator('.rmt-archive-source-fold').getAttribute('open'), null);
        assert.equal(await page.locator('.rmt-archive-source-fold p').first().isVisible(), false);
        const before = await page.evaluate(async () => {
            const c = await import('/src/core/constants.js'), cache = await import('/src/core/cache.js');
            return { bank: structuredClone(fixture.chatMetadata[c.MEMORY_KEY]), draft: structuredClone(cache.getCache(fixture)[c.PHONE_DRAFT_CACHE_KEY]) };
        });
        await page.locator('[data-rmt-action=rewrite-archive-verdict]').click();
        await page.waitForFunction(() => !!document.querySelector('.rmt-archive-verdict'), { timeout: 8000 });
        assert.equal(requests, 1);
        const result = await page.evaluate(async () => {
            const c = await import('/src/core/constants.js'), cache = await import('/src/core/cache.js');
            const quote = document.querySelector('.rmt-archive-verdict'), bounds = quote.getBoundingClientRect(), style = getComputedStyle(quote);
            return { bank: fixture.chatMetadata[c.MEMORY_KEY], draft: cache.getCache(fixture)[c.PHONE_DRAFT_CACHE_KEY],
                quote: { left: bounds.left, right: bounds.right, font: style.fontSize, weight: style.fontWeight, text: style.color, background: style.backgroundColor },
                overflow: document.querySelector('.rmt-body')?.scrollWidth > innerWidth };
        });
        for (const [key, value] of Object.entries(before.bank)) if (key !== 'archiveName') assert.deepEqual(result.bank[key], value);
        assert.deepEqual(result.draft, before.draft);
        assert.equal(result.overflow, false); assert.ok(result.quote.left >= 12 && result.quote.right <= width - 12);
        assert.notEqual(result.quote.text, result.quote.background);
        assert.ok(Number.parseFloat(result.quote.font) >= 16);
        await page.locator('.rmt-archive-card').screenshot({ path: path.join(out, 'cover-' + width + '-' + theme + '.png') });
        await page.locator('.rmt-archive-source-fold summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('.rmt-archive-source-fold p').first().isVisible(), true);
        await page.locator('.rmt-archive-source-fold summary').click();
        assert.match(await page.locator('.rmt-phone-draft-status').textContent(), /0\/1.*认证.*401/);
        await openFixture(page, theme);
        assert.equal(requests, 1, 'reopening must not generate automatically');
        assert.equal(await page.locator('.rmt-archive-verdict p').count(), 2);
        assert.equal((await page.locator('.rmt-archive-verdict').textContent()).replace(/\s/g, ''), result.bank.archiveVerdict.text.replace(/\s/g, ''));
        assert.equal(await page.locator('.rmt-archive-source-fold').getAttribute('open'), null);
        assert.match(await page.locator('.rmt-phone-draft-status').textContent(), /认证/);
        cases.push({ width, theme, quote: result.quote, requests, persistence: true, keyboardDisclosure: true });
        await context.close();
    }
    assert.deepEqual(errors, []);
} finally { clearTimeout(guard); await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(out, 'report.json'), JSON.stringify({ ok: true, cases, errors,
    limits: 'Local Edge, simulated host and provider. Real TT/iOS/provider and literary output quality require user acceptance.' }, null, 2));
console.log(JSON.stringify({ ok: true, cases: cases.length, errors }));
