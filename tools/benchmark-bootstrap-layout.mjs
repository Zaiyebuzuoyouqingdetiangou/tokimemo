import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const css = indexSource.match(/style\.textContent = `([\s\S]*?)`;\n    document\.head/)?.[1] || '';
const viewports = [320, 375, 390, 430, 768];
const labels = ['加载完整设置', '性能诊断（不解压缓存）'];
const note = '普通酒馆启动不会解析 Heartbeat 完整 runtime。只有第一次打开档案室或加载完整设置时才加载。';

const number = (pattern, label) => {
    const value = Number(css.match(pattern)?.[1]);
    assert.ok(Number.isFinite(value), `missing CSS metric: ${label}`);
    return value;
};

const breakpoint = number(/@media\(min-width:(\d+)px\)/, 'desktop breakpoint');
const touchHeight = number(/min-height:(\d+)px!important/, 'touch height');
const actionGap = number(/\.rmt-bootstrap-actions\{[^}]*gap:(\d+)px/, 'action gap');
const panelPadding = number(/data-rmt-bootstrap="1"\]\{[^}]*padding:(\d+)px/, 'panel padding');
const buttonPadding = number(/padding:\d+px (\d+)px!important/, 'button horizontal padding');
const maxButtonFont = number(/font-size:clamp\(\d+px,[^,]+,(\d+)px\)/, 'button font maximum');

assert.equal(breakpoint, 768);
assert.ok(touchHeight >= 44 && touchHeight <= 48);
assert.match(css, /white-space:nowrap!important/);
assert.match(css, /word-break:keep-all!important/);
assert.match(css, /writing-mode:horizontal-tb!important/);

// The fixture reserves 8px on each side for the SillyTavern settings container.
// A 25% font allowance is deliberately stricter than the requested mild text enlargement.
const hostGutter = 16;
const panelBorder = 2;
const safetyFont = maxButtonFont * 1.25;
const labelRequiredWidth = Math.max(...labels.map(label => Array.from(label).length * safetyFont + buttonPadding * 2));
const rows = [];

for (const viewport of viewports) {
    const panelWidth = viewport - hostGutter;
    const actionWidth = panelWidth - panelPadding * 2 - panelBorder;
    const columns = viewport >= breakpoint ? 2 : 1;
    const buttonWidth = (actionWidth - actionGap * (columns - 1)) / columns;
    const actionHeight = columns === 1 ? touchHeight * labels.length + actionGap : touchHeight;
    const noteCharsPerLine = Math.max(1, Math.floor(actionWidth / 9));
    const noteLines = Math.ceil(Array.from(note).length / noteCharsPerLine);
    const estimatedPanelHeight = panelPadding * 2 + panelBorder + 24 + 8 + actionHeight + 8 + noteLines * 13.5;

    assert.ok(panelWidth <= viewport, `${viewport}px panel overflows its viewport`);
    assert.ok(buttonWidth >= labelRequiredWidth, `${viewport}px cannot fit the longest horizontal label at 125% font size`);
    assert.ok(estimatedPanelHeight < 260, `${viewport}px card would contain a large empty-looking vertical area`);
    assert.equal(columns, viewport < 768 ? 1 : 2);

    rows.push({
        viewport,
        layout: columns === 1 ? 'stacked' : 'two-columns',
        panelWidth,
        buttonWidth: Number(buttonWidth.toFixed(1)),
        requiredLabelWidthAt125Percent: labelRequiredWidth,
        buttonHeight: touchHeight,
        estimatedContentHeight: Number(estimatedPanelHeight.toFixed(1)),
        horizontalOverflow: false,
    });
}

console.log(JSON.stringify({ ok: true, benchmark: 'CSS geometry contract', rows }, null, 2));
