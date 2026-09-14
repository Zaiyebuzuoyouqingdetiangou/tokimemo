import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.env.BOOTSTRAP_SCREENSHOT_DIR || path.join(repoRoot, 'artifacts', 'bootstrap-layout'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
const indexSource = await readFile(path.join(repoRoot, 'index.js'), 'utf8');
const viewports = [320, 375, 390, 430, 768];
const runtimeRequests = [];

const hostPage = `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:18px;background:#eee}
#extensions_settings2{width:100%;padding:8px}
#extensionsMenu{padding:8px}
.menu_button{width:min-content;min-width:0;align-self:start;font:1.1rem/1.2 sans-serif;padding:7px 8px}
.list-group-item{display:flex}
</style></head><body>
<div id="extensions_settings2"></div><div id="extensionsMenu"></div>
<script type="module" src="/index.js"></script>
</body></html>`;

const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/index.js') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(indexSource);
        return;
    }
    if (url.pathname === '/dist/heartbeatMemories.bundle.js') {
        runtimeRequests.push(request.url || '');
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end('globalThis.__runtimeStubLoads=(globalThis.__runtimeStubLoads||0)+1;export function initMemoryTheater(){};export function openArchiveLibrary(){};');
        return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(hostPage);
});

await mkdir(outputDir, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];

try {
    for (const width of viewports) {
        runtimeRequests.length = 0;
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await page.goto(baseUrl);
        await page.waitForSelector('[data-rmt-bootstrap-load-settings]');
        const before = await page.evaluate(() => {
            const panel = document.querySelector('#heartbeat_memories_settings');
            const actions = panel.querySelector('.rmt-bootstrap-actions');
            const buttons = [...actions.querySelectorAll('button')];
            const rect = element => {
                const value = element.getBoundingClientRect();
                return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            };
            return {
                documentWidth: document.documentElement.scrollWidth,
                panel: rect(panel),
                actions: rect(actions),
                buttons: buttons.map(button => ({
                    ...rect(button),
                    clientWidth: button.clientWidth,
                    clientHeight: button.clientHeight,
                    scrollWidth: button.scrollWidth,
                    scrollHeight: button.scrollHeight,
                    whiteSpace: getComputedStyle(button).whiteSpace,
                    wordBreak: getComputedStyle(button).wordBreak,
                    writingMode: getComputedStyle(button).writingMode,
                })),
            };
        });

        assert.ok(before.documentWidth <= width, `${width}px viewport overflowed to ${before.documentWidth}px`);
        assert.ok(before.panel.width <= width, `${width}px panel overflowed`);
        assert.ok(before.panel.height < 260, `${width}px bootstrap panel is unexpectedly tall: ${before.panel.height}px`);
        for (const button of before.buttons) {
            assert.equal(button.whiteSpace, 'nowrap');
            assert.equal(button.wordBreak, 'keep-all');
            assert.equal(button.writingMode, 'horizontal-tb');
            assert.ok(button.height >= 44 && button.height <= 52, `${width}px touch height ${button.height}px`);
            assert.ok(button.scrollWidth <= button.clientWidth + 1, `${width}px button text overflows horizontally`);
            assert.ok(button.scrollHeight <= button.clientHeight + 1, `${width}px button text wrapped vertically`);
        }

        if (width < 768) {
            assert.ok(before.buttons[1].top >= before.buttons[0].bottom, `${width}px buttons are not stacked`);
            for (const button of before.buttons) assert.ok(button.width >= before.actions.width - 1, `${width}px button did not fill its row`);
        } else {
            assert.ok(Math.abs(before.buttons[0].top - before.buttons[1].top) < 1, 'desktop buttons are not side by side');
            assert.ok(before.buttons[1].left > before.buttons[0].right, 'desktop second button is not in the second column');
        }

        assert.equal(runtimeRequests.length, 0, `${width}px startup loaded runtime`);
        await page.click('[data-rmt-bootstrap-diagnostic]');
        await page.waitForSelector('[data-rmt-bootstrap-diagnostic-output]:not([hidden])');
        assert.equal(runtimeRequests.length, 0, `${width}px diagnostic loaded runtime`);
        await page.screenshot({ path: path.join(outputDir, `bootstrap-${width}.png`), fullPage: true });

        if (width === 768) {
            await page.click('[data-rmt-bootstrap-load-settings]');
            await page.waitForFunction(() => globalThis.__runtimeStubLoads === 1);
            assert.equal(runtimeRequests.length, 1, 'explicit full-settings click did not load exactly one runtime bundle');
        }
        results.push({ width, panelHeight: Math.round(before.panel.height), buttonWidths: before.buttons.map(item => Math.round(item.width)), buttonHeights: before.buttons.map(item => Math.round(item.height)) });
        await page.close();
    }
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}

console.log(JSON.stringify({ ok: true, viewports: results, startupRuntimeRequests: 0, diagnosticRuntimeRequests: 0 }, null, 2));
