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
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}

console.log(JSON.stringify({ ok: true, engine: 'Edge/Chromium computed style', cases: results }, null, 2));
