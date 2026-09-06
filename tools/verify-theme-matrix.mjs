import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.env.THEME_SCREENSHOT_DIR || path.join(repoRoot, 'artifacts', 'theme-matrix'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
const viewports = [320, 375, 390, 430];

const pageSource = `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:sans-serif}
body[data-host-theme="light"]{background:#f4f6f8;color:#253040}
body[data-host-theme="dark"]{background:#121820;color:#e8edf2}
</style>
</head><body></body></html>`;

const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(pageSource);
            return;
        }
        const requestedPath = path.resolve(repoRoot, `.${decodeURIComponent(url.pathname)}`);
        if (!requestedPath.startsWith(`${repoRoot}${path.sep}`)) {
            response.statusCode = 403;
            response.end('forbidden');
            return;
        }
        response.setHeader('Content-Type', requestedPath.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8');
        response.end(await readFile(requestedPath));
    } catch {
        response.statusCode = 404;
        response.end('not found');
    }
});

async function mountThemeProbe(page, { hostTheme, themeMode, themeAlpha = 0.72, hostile = false }) {
    await page.goto(baseUrl);
    await page.evaluate(async ({ hostTheme, themeMode, themeAlpha, hostile }) => {
        document.body.dataset.hostTheme = hostTheme;
        const styles = await import('/src/ui/styles.js');
        const theme = await import('/src/core/theme.js');
        styles.ensureStyles();
        const overlay = document.createElement('div');
        overlay.id = 'heartbeat_memories_overlay';
        overlay.innerHTML = `
          <div class="rmt-shell">
            <div class="rmt-topbar">
              <div class="rmt-topbar-title">主题探针</div>
              <button type="button" data-rmt-action="close">关闭</button>
            </div>
            <div class="rmt-body">
              <article class="rmt-archive-card"><b>卡片标题</b><span>卡片正文保持清晰</span></article>
              <input class="rmt-theme-probe-input" value="输入框保持可读">
              <button type="button" class="rmt-btn">普通按钮</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const applied = theme.applyThemeToElement(overlay, { themeMode, themeAlpha });
        globalThis.__rmtThemeProbe = { theme, overlay, applied };
        if (hostile) {
            const hostileStyle = document.createElement('style');
            hostileStyle.textContent = `body div,body article,body button,body input{background:#00ff00!important;color:#00ff00!important;-webkit-text-fill-color:#00ff00!important;opacity:.13!important;writing-mode:vertical-rl!important}`;
            document.head.appendChild(hostileStyle);
        }
    }, { hostTheme, themeMode, themeAlpha, hostile });
}

async function readProbe(page) {
    return page.evaluate(() => {
        const overlay = document.getElementById('heartbeat_memories_overlay');
        const shell = overlay.querySelector('.rmt-shell');
        const topbar = overlay.querySelector('.rmt-topbar');
        const title = overlay.querySelector('.rmt-topbar-title');
        const body = overlay.querySelector('.rmt-body');
        const close = overlay.querySelector('[data-rmt-action="close"]');
        const card = overlay.querySelector('.rmt-archive-card');
        const input = overlay.querySelector('input');
        const button = overlay.querySelector('.rmt-btn');
        const style = element => {
            const computed = getComputedStyle(element);
            return {
                backgroundColor: computed.backgroundColor,
                color: computed.color,
                opacity: computed.opacity,
                writingMode: computed.writingMode,
            };
        };
        const rect = element => {
            const value = element.getBoundingClientRect();
            return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
        };
        const vars = getComputedStyle(overlay);
        return {
            mode: overlay.dataset.rmtThemeMode,
            palette: globalThis.__rmtThemeProbe.applied.palette,
            alpha: globalThis.__rmtThemeProbe.applied.alpha,
            variables: {
                background: vars.getPropertyValue('--rmt-theme-bg').trim(),
                surface: vars.getPropertyValue('--rmt-theme-surface').trim(),
                surfaceAlpha: vars.getPropertyValue('--rmt-theme-surface-alpha').trim(),
                text: vars.getPropertyValue('--rmt-theme-text').trim(),
            },
            styles: { overlay: style(overlay), shell: style(shell), topbar: style(topbar), title: style(title), body: style(body), close: style(close), card: style(card), input: style(input), button: style(button) },
            dimensions: {
                viewportWidth: innerWidth,
                documentScrollWidth: document.documentElement.scrollWidth,
                overlayClientWidth: overlay.clientWidth,
                overlayScrollWidth: overlay.scrollWidth,
                bodyClientWidth: body.clientWidth,
                bodyScrollWidth: body.scrollWidth,
                close: rect(close),
            },
            contrast: {
                textOnSurface: globalThis.__rmtThemeProbe.theme.contrastRatio(globalThis.__rmtThemeProbe.applied.palette.text, globalThis.__rmtThemeProbe.applied.palette.surface),
                mutedOnSurface: globalThis.__rmtThemeProbe.theme.contrastRatio(globalThis.__rmtThemeProbe.applied.palette.muted, globalThis.__rmtThemeProbe.applied.palette.surface),
            },
        };
    });
}

await mkdir(outputDir, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];

try {
    for (const hostTheme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width: 768, height: 900 }, deviceScaleFactor: 1 });
        await mountThemeProbe(page, { hostTheme, themeMode: 'host' });
        const probe = await readProbe(page);
        assert.equal(probe.mode, 'host');
        assert.equal(probe.variables.background, hostTheme === 'light' ? '#f4f6f8' : '#121820');
        assert.ok(probe.contrast.textOnSurface >= 4.5, `${hostTheme} text contrast is ${probe.contrast.textOnSurface}`);
        assert.ok(probe.contrast.mutedOnSurface >= 4.5, `${hostTheme} muted contrast is ${probe.contrast.mutedOnSurface}`);
        results.push({ case: `host-${hostTheme}`, background: probe.variables.background, text: probe.variables.text, contrast: probe.contrast });
        await page.close();
    }

    {
        const page = await browser.newPage({ viewport: { width: 768, height: 900 }, deviceScaleFactor: 1 });
        await mountThemeProbe(page, { hostTheme: 'light', themeMode: 'default', themeAlpha: 0.72 });
        const translucent = await readProbe(page);
        assert.equal(translucent.alpha, 0.72);
        assert.match(translucent.styles.card.backgroundColor, /^rgba\(/);
        assert.equal(translucent.styles.card.opacity, '1');
        assert.equal(translucent.styles.title.opacity, '1');
        await page.evaluate(() => {
            const { theme, overlay } = globalThis.__rmtThemeProbe;
            globalThis.__rmtThemeProbe.applied = theme.applyThemeToElement(overlay, { themeMode: 'default', themeAlpha: 1 });
        });
        const opaque = await readProbe(page);
        assert.notEqual(opaque.styles.card.backgroundColor, translucent.styles.card.backgroundColor);
        assert.equal(opaque.styles.card.backgroundColor, 'rgb(255, 255, 255)');
        results.push({ case: 'card-alpha', translucent: translucent.styles.card.backgroundColor, opaque: opaque.styles.card.backgroundColor, textOpacity: opaque.styles.title.opacity });
        await page.close();
    }

    for (const width of viewports) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await mountThemeProbe(page, { hostTheme: 'dark', themeMode: 'default', themeAlpha: 0.82, hostile: true });
        const probe = await readProbe(page);
        assert.ok(probe.dimensions.documentScrollWidth <= width, `${width}px document overflowed to ${probe.dimensions.documentScrollWidth}px`);
        assert.ok(probe.dimensions.overlayScrollWidth <= probe.dimensions.overlayClientWidth, `${width}px overlay overflowed`);
        assert.ok(probe.dimensions.bodyScrollWidth <= probe.dimensions.bodyClientWidth, `${width}px body overflowed`);
        assert.ok(probe.dimensions.close.width >= 44 && probe.dimensions.close.height >= 44, `${width}px close target is too small`);
        assert.ok(probe.dimensions.close.left >= 0 && probe.dimensions.close.right <= width, `${width}px close target is outside the viewport`);
        assert.ok(probe.dimensions.close.top >= 0 && probe.dimensions.close.bottom <= 64, `${width}px hostile CSS moved the close target out of the top bar`);
        for (const key of ['overlay', 'shell', 'topbar', 'title', 'body', 'close', 'card', 'input', 'button']) {
            assert.equal(probe.styles[key].opacity, '1', `${width}px ${key} inherited hostile opacity`);
            assert.notEqual(probe.styles[key].backgroundColor, 'rgb(0, 255, 0)', `${width}px ${key} inherited hostile background`);
            assert.notEqual(probe.styles[key].color, 'rgb(0, 255, 0)', `${width}px ${key} inherited hostile text colour`);
        }
        for (const key of ['overlay', 'shell', 'topbar', 'title', 'body', 'card', 'close', 'input', 'button']) assert.equal(probe.styles[key].writingMode, 'horizontal-tb', `${width}px ${key} inherited hostile writing mode`);
        await page.screenshot({ path: path.join(outputDir, `theme-hostile-${width}.png`), fullPage: true });
        results.push({ case: `hostile-${width}`, close: probe.dimensions.close, overflow: probe.dimensions.documentScrollWidth - width });
        await page.close();
    }
    // Exercise production renderers, not only palette tokens or a synthetic card.
    for (const themeMode of ['default', 'night', 'host', 'custom']) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
        await page.goto(baseUrl);
        await page.evaluate(async themeMode => {
            document.body.dataset.hostTheme = 'dark';
            document.body.innerHTML = '<div id="extensions_settings2"></div>';
            const host = document.createElement('style');
            host.textContent = 'body,body div,body p,body span,body h2{font-weight:900;font-family:serif}body button{background:black;color:white}body small{opacity:.3}.inline-drawer-content{display:block!important}';
            document.head.appendChild(host);
            const context = { characterId: 0, chatId: 'fixture-A', name1: '小雨', name2: '林舟', chat: [], chatMetadata: {},
                characters: [{ name: '林舟', avatar: 'lin.png', description: '住在河边的木匠' }], extensionSettings: { heartbeatMemories: { themeMode, themeAlpha: 1, themeCustom: { background: '#1e293b', surface: '#273449', text: '#ffffff', muted: '#cbd5e1' } } }, saveSettingsDebounced() {} };
            globalThis.SillyTavern = { getContext: () => context };
            const styles = await import('/src/ui/styles.js');
            styles.ensureStyles();
            const settings = await import('/src/ui/settingsPanel.js');
            settings.mountSettings();
            globalThis.fixture = { context, state: (await import('/src/core/state.js')).state, overlay: await import('/src/ui/overlay.js') };
        }, themeMode);
        for (const view of ['settings', 'archive', 'adv', 'heart', 'avatar', 'cabinet', 'relations']) {
            await page.evaluate(async view => {
                const { overlay, state } = globalThis.fixture;
                if (view === 'settings') return;
                overlay.openOverlay();
                if (view === 'archive') { overlay.showChooser(); return; }
                if (view === 'adv') {
                    state.activeSession = { kind: 'adv', events: [{ id: 'E1', title: '一起留下车票', date: '初秋', cgDesc: '河岸边，两人一起看着归程车票。', adv: { paragraphs: ['我把车票小心地收进盒子，想起你认真写下日期时的样子。'] } }], selectedId: 'E1', view: 'adv', paragraphIndex: 0 };
                    (await import('/src/ui/advEventView.js')).renderAdvMode();
                } else if (view === 'heart' || view === 'avatar') {
                    state.activeSession = { kind: 'heart', characterName: '林舟', relationshipSummary: '从初识到愿意分享日常，两人慢慢认识彼此。', greetings: { morning: ['早上好，一起去河边走走吧。'] }, voiceDramas: [{ id: 'V1', kind: 'postending', title: '河边的午后', setting: '阳光从树叶间落下来。', script: [{ speaker: 'char', text: '“坐一会儿吧。”林舟把书放在桌边。' }, { speaker: 'char', text: '小雨问道：“你在读什么？”' }, { speaker: '店员', text: '您的茶来了。' }] }], scenarioDramas: [], dailyStrips: [], fireflyVoices: [], view: 'seasons' };
                    const heart = await import('/src/ui/heartView.js');
                    heart.renderHeart();
                    if (view === 'avatar') {
                        const previous = state.activeArchiveSnapshot;
                        state.activeArchiveSnapshot = { characterName: '背景角色', memory: { userName: '背景用户' } };
                        const session = { ...state.activeSession, greetings: Object.fromEntries(['morning','noon','evening','night','weekend','birthday','userBirthday','holiday','absenceWorry','absenceSulky','absenceJealous'].map(key => [key, ['小雨问道：“要一起去河边吗？”']])) };
                        heart.renderAvatarDialoguePopup({ characterKey: 'lin.png', characterName: '林舟', snapshot: { memory: { userName: '小雨' } }, session, readOnly: true });
                        const pop = document.querySelector('.rmt-avatar-dialog-card');
                        if (!pop.querySelector('.rmt-heart-line.user') || pop.textContent.includes('背景用户')) throw new Error('avatar identity crossed archive boundary');
                        state.activeArchiveSnapshot = previous;
                    }
                } else if (view === 'cabinet') {
                    overlay.bodyEl().innerHTML = (await import('/src/modes/cabinet.js')).cabinetHtml({ items: [{ id: 'K1', name: '回程车票', objectEvidence: '林舟和小雨一起把回程车票放进盒子。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '一起留下车票' }] });
                    overlay.bodyEl().querySelector('details').open = true;
                } else if (view === 'relations') {
                    state.activeSession = { kind: 'relations', characterName: '林舟', summary: '尚未在剧情中相遇的设定人物也可以在这里查看。', relationships: [], settingRelationships: [{ name: '阿南', relation: '设定人物', summary: '住在城中的木匠', settingOnly: true, npcPerspective: '我每天都在木工店工作。' }] };
                    (await import('/src/modes/relations.js')).renderRelations();
                }
            }, view);
            const inspection = await page.evaluate(view => {
                const root = document.getElementById(view === 'settings' ? 'heartbeat_memories_settings' : 'heartbeat_memories_overlay');
                const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
                const blend = (a, b) => a.slice(0, 3).map((v, i) => v * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
                const background = el => { if (!el) return [255,255,255]; const c = rgb(getComputedStyle(el).backgroundColor); return blend(c, c[3] === 1 ? [255,255,255] : background(el.parentElement)); };
                const luminance = c => c.slice(0,3).map(n => { n /= 255; return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4; }).reduce((s,v,i) => s+v*[.2126,.7152,.0722][i],0);
                const bad = [], samples = [];
                for (const el of root.querySelectorAll('.rmt-api-source-card,.rmt-model-refresh,.rmt-heart-summary,.rmt-avatar-dialog-card')) {
                    if (getComputedStyle(el).backgroundImage !== 'none') bad.push({ cls: el.className, error: 'uncontrolled gradient over theme surface' });
                }
                for (const el of root.querySelectorAll('p,b,small,label,.rmt-adv-para,.rmt-avatar-dialog-bubble')) {
                    if (!el.textContent.trim() || !el.getClientRects().length || el.closest('[hidden]')) continue;
                    const s = getComputedStyle(el), bg = background(el), ink = rgb(s.webkitTextFillColor === 'currentcolor' ? s.color : s.webkitTextFillColor);
                    const a = luminance(ink), b = luminance(bg), contrast = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
                    const sample = { text: el.textContent.trim().slice(0,32), cls: el.className, contrast: +contrast.toFixed(2), fontSize: s.fontSize, weight: s.fontWeight };
                    samples.push(sample);
                    if (contrast < 4.45) bad.push(sample);
                    if (el.tagName === 'P' && Number(s.fontWeight) > 500) bad.push({ ...sample, error: 'host weight leaked into body prose' });
                }
                for (const el of root.querySelectorAll('.rmt-relations-head,.rmt-profile-discoveries,.rmt-heart-line>div')) {
                    const s = getComputedStyle(el);
                    if (parseFloat(s.paddingLeft) < 16 || parseFloat(s.paddingRight) < 16) bad.push({ cls: el.className, error: 'missing card gutters' });
                }
                if (view === 'heart') {
                    if (!root.querySelector('.rmt-heart-line.user') || root.querySelectorAll('.rmt-heart-line.char').length !== 1) bad.push({ error: 'wrong legacy dialogue attribution' });
                    if (!root.querySelector('.rmt-heart-narration')?.textContent.includes('林舟')) bad.push({ error: 'action not outside bubble' });
                }
                return { count: samples.length, bad, overflow: root.scrollWidth - root.clientWidth };
            }, view);
            assert.ok(inspection.count > 0, `${themeMode}/${view} did not render text`);
            assert.deepEqual(inspection.bad, [], `${themeMode}/${view} unreadable production text: ${JSON.stringify(inspection.bad)}`);
            assert.ok(inspection.overflow <= 1, `${themeMode}/${view} overflow ${inspection.overflow}`);
            await page.screenshot({ path: path.join(outputDir, `production-${themeMode}-${view}.png`) });
            if (themeMode === 'default' && view === 'heart') {
                await page.evaluate(() => document.querySelector('.rmt-heart-script').scrollIntoView({ block: 'center' }));
                await page.screenshot({ path: path.join(outputDir, 'production-default-dialogue-detail.png') });
                for (const viewport of [{ width: 375, height: 844 }, { width: 844, height: 390 }]) {
                    await page.setViewportSize(viewport);
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    const layout = await page.evaluate(() => {
                        const body = document.querySelector('.rmt-body');
                        const close = document.querySelector('[data-rmt-action="close"]');
                        const r = close.getBoundingClientRect();
                        const dot = document.querySelector('.rmt-heart-drama-dot');
                        return { overflow: body.scrollWidth - body.clientWidth, close: { width: r.width, height: r.height, right: r.right }, dotWidth: dot.getBoundingClientRect().width, transition: getComputedStyle(close).transitionDuration };
                    });
                    assert.ok(layout.overflow <= 1);
                    assert.ok(layout.close.width >= 44 && layout.close.height >= 44 && layout.close.right <= viewport.width);
                    assert.equal(layout.dotWidth, 44);
                    results.push({ case: 'dialogue-layout-' + viewport.width, ...layout });
                    await page.screenshot({ path: path.join(outputDir, 'dialogue-layout-' + viewport.width + '.png') });
                }
                await page.setViewportSize({ width: 390, height: 844 });
            }
            results.push({ case: `production-${themeMode}-${view}`, ...inspection });
        }
        await page.close();
    }
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}

console.log(JSON.stringify({ ok: true, engine: 'Edge/Chromium computed style', cases: results }, null, 2));
