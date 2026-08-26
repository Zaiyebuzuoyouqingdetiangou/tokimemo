import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const indexSource = await readFile(new URL('index.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));

function functionBlock(name, nextName) {
    const start = indexSource.indexOf(`function ${name}(`);
    const plainEnd = indexSource.indexOf(`\nfunction ${nextName}(`, start + 1);
    const exportedEnd = indexSource.indexOf(`\nexport function ${nextName}(`, start + 1);
    const end = [plainEnd, exportedEnd].filter(value => value >= 0).sort((a, b) => a - b)[0] ?? -1;
    assert.notEqual(start, -1, `missing ${name}`);
    assert.notEqual(end, -1, `missing boundary after ${name}`);
    return indexSource.slice(start, end);
}

test('release identity keeps manifest, entrypoint and versioned runtime token aligned', () => {
    const version = indexSource.match(/const VERSION = '([^']+)'/)?.[1];
    const build = indexSource.match(/const BUILD = '([^']+)'/)?.[1];
    assert.equal(version, manifest.version);
    assert.equal(manifest.js, `index.js?heartbeat=${build}`);
    assert.ok(build.startsWith(`${version}-`));
    assert.match(indexSource, /import\(`\.\/dist\/heartbeatMemories\.bundle\.js\?heartbeat=\$\{BUILD\}`\)/);
});

test('bootstrap actions are mobile-first, full-width and cannot collapse into vertical CJK labels', () => {
    const css = indexSource.match(/style\.textContent = `([\s\S]*?)`;\n    document\.head/)?.[1] || '';
    assert.match(css, /\.rmt-bootstrap-actions\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*width:100%[^}]*min-width:0/);
    assert.match(css, /\.rmt-bootstrap-actions>button\.menu_button\{[^}]*width:100%!important/);
    assert.match(css, /\.rmt-bootstrap-actions>button\.menu_button\{[^}]*min-height:46px!important/);
    assert.match(css, /\.rmt-bootstrap-actions>button\.menu_button\{[^}]*white-space:nowrap!important/);
    assert.match(css, /\.rmt-bootstrap-actions>button\.menu_button\{[^}]*word-break:keep-all!important/);
    assert.match(css, /\.rmt-bootstrap-actions>button\.menu_button\{[^}]*writing-mode:horizontal-tb!important/);
    assert.match(css, /@media\(min-width:768px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.doesNotMatch(css, /grid-template-columns:\s*1fr 1fr/);
});

test('DOM ready stays bootstrap-only and the diagnostic branch cannot import the runtime', () => {
    const ensureRuntimeStart = indexSource.indexOf('async function ensureRuntime(');
    const runtimeImport = indexSource.indexOf('await import(`./dist/heartbeatMemories.bundle.js');
    const requestArchiveStart = indexSource.indexOf('\nfunction requestArchiveOpen(', ensureRuntimeStart);
    assert.ok(ensureRuntimeStart >= 0 && runtimeImport > ensureRuntimeStart && runtimeImport < requestArchiveStart);
    assert.equal(indexSource.match(/\bimport\s*\(/g)?.length, 1);

    const startup = functionBlock('startBootstrap', 'onDisable');
    assert.doesNotMatch(startup, /ensureRuntime\s*\(|\bimport\s*\(/);
    assert.match(indexSource, /DOMContentLoaded', startBootstrap/);
    assert.match(indexSource, /else queueMicrotask\(startBootstrap\)/);

    const mount = functionBlock('mountBootstrapSettings', 'removeBootstrapShells');
    const diagnostic = mount.match(/if \(diag\) \{[\s\S]*?return;\n        \}/)?.[0] || '';
    assert.match(diagnostic, /toggleDiagnostic\(/);
    assert.doesNotMatch(diagnostic, /ensureRuntime\s*\(|\bimport\s*\(/);
});

test('zero-decompression diagnostic remains observational', () => {
    const diagnostic = functionBlock('getHeartbeatPerformanceDiagnostic', 'renderDiagnostic');
    assert.match(diagnostic, /stored\.data\.length/);
    assert.match(diagnostic, /stored\.sourceBytes/);
    assert.match(diagnostic, /memory\.memories\.length/);
    assert.doesNotMatch(diagnostic, /\batob\s*\(|DecompressionStream|TextEncoder|JSON\.stringify|ensureRuntime\s*\(|\bimport\s*\(/);
});

test('bootstrap and full settings diagnostics both expose an explicit reversible close path', async () => {
    const settingsSource = await readFile(new URL('src/ui/settingsPanel.js', root), 'utf8');
    const bootstrapMount = functionBlock('mountBootstrapSettings', 'removeBootstrapShells');
    assert.match(bootstrapMount, /data-rmt-bootstrap-diagnostic-close/);
    assert.match(bootstrapMount, /data-rmt-diagnostic-panel hidden/);
    assert.match(bootstrapMount, /toggleDiagnostic\(/);
    assert.match(bootstrapMount, /hideDiagnostic\(/);
    assert.doesNotMatch(bootstrapMount, /ensureRuntime\s*\([^)]*diagnostic|\batob\s*\(|DecompressionStream/);

    assert.match(settingsSource, /data-rmt-performance-diagnostic-close/);
    assert.match(settingsSource, /data-rmt-diagnostic-panel hidden/);
    assert.match(settingsSource, /__heartbeatMemoriesTogglePerformanceDiagnostic/);
    assert.match(settingsSource, /__heartbeatMemoriesHidePerformanceDiagnostic/);
});

test('diagnostic toggle opens, closes on a second press, and closes from the explicit control', () => {
    const start = indexSource.indexOf('function diagnosticPanelFor(');
    const end = indexSource.indexOf('\nfunction ensureBootstrapStyle(', start);
    assert.ok(start >= 0 && end > start);
    const helperSource = indexSource.slice(start, end);
    let renderCount = 0;
    const globalObject = {};
    const api = Function('globalThis', 'renderDiagnostic', `${helperSource}\nreturn { hideDiagnostic, toggleDiagnostic };`)(
        globalObject,
        output => { renderCount += 1; output.textContent = 'diagnostic'; output.hidden = false; },
    );
    const diagnosticPanel = { hidden: true };
    const output = {
        hidden: false,
        textContent: '',
        closest: selector => selector === '[data-rmt-diagnostic-panel]' ? diagnosticPanel : null,
    };
    const label = { textContent: '性能诊断（不解压缓存）' };
    const attributes = new Map();
    const trigger = {
        setAttribute: (name, value) => attributes.set(name, value),
        querySelector: selector => selector === '[data-rmt-diagnostic-label]' ? label : null,
    };

    assert.equal(api.toggleDiagnostic(output, trigger), true);
    assert.equal(renderCount, 1);
    assert.equal(diagnosticPanel.hidden, false);
    assert.equal(attributes.get('aria-expanded'), 'true');
    assert.equal(label.textContent, '关闭性能诊断');

    assert.equal(api.toggleDiagnostic(output, trigger), false);
    assert.equal(renderCount, 1);
    assert.equal(diagnosticPanel.hidden, true);
    assert.equal(attributes.get('aria-expanded'), 'false');
    assert.equal(label.textContent, '性能诊断（不解压缓存）');

    api.toggleDiagnostic(output, trigger);
    assert.equal(api.hideDiagnostic(output, trigger), false);
    assert.equal(diagnosticPanel.hidden, true);
    assert.equal(label.textContent, '性能诊断（不解压缓存）');
});
