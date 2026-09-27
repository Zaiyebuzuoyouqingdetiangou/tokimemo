// r84.164 · 弹出提示跟随心迹回廊主题（行内 important，酒馆和美化主题盖不过）；
// 提示条和信纸颜色跟随设置里的信封；展开内容在电脑、手机浏览器和 TT 里不撑破页面。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './runtime-harness.mjs';

const shellSource = () => readFile(new URL('../src/ui/autoMemoryShell.js', import.meta.url), 'utf8');

test('弹出提示按心迹回廊主题写行内 important 颜色', async () => {
    const src = await shellSource();
    const fn = src.slice(src.indexOf('function themeToast('), src.indexOf('function queueAutomaticRepair('));
    assert.match(fn, /core_theme\.resolveThemePalette\(settings\)/);
    for (const prop of ['background-color', 'background-image', 'color', 'border-left']) {
        assert.ok(fn.includes(`set('${prop}'`), prop);
    }
    assert.match(fn, /setProperty\(name, value, 'important'\)/);
    assert.match(src, /themeToast\(node, core_settings\.getPluginSettings\(context\)\)/);
});

test('信封、提示条、信纸都跟着设置里的信封样式', async () => {
    const src = await shellSource();
    assert.match(src, /data-rmt-envelope="\$\{esc\(envelopeSkin\(\)\)\}"/);
    assert.match(src, /\|\$\{envelopeSkin\(\)\}`;/, '换信封样式后要重画');
    const h = await harness({ messages: 2, bundle: true });
    const css = h.module('autoMemory/shellState.js').floorShellCss();
    for (const skin of ['wax', 'night', 'sakura', 'airmail', 'wash']) {
        assert.ok(css.includes(`.rmt-heart-letter[data-rmt-envelope="${skin}"]{--rmt-letter-accent:`), skin);
    }
    assert.ok(css.includes('.rmt-heart-letter-strip{gap:8px;padding:6px 14px;border:1px solid var(--rmt-letter-border)'));
    assert.ok(css.includes('background:var(--rmt-letter-soft);color:var(--rmt-theme-text)'));
});

test('展开内容：不再套一层 70vh 的内部滚动；宽内容在信里横向滚动，不撑破页面', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const css = h.module('autoMemory/shellState.js').floorShellCss();
    assert.equal(css.includes('max-height:70vh'), false);
    assert.ok(css.includes('.rmt-heart-letter .rmt-floor-body{display:block;height:auto;max-height:none;max-width:100%;min-width:0;min-height:0;margin-top:10px;overflow-x:auto;overflow-y:visible'));
    assert.ok(css.includes('.rmt-heart-letter .rmt-floor-body :is(img,video,canvas,svg,iframe){max-width:100%;height:auto}'));
    assert.ok(css.includes('@media (max-width:600px){.rmt-floor-shell{width:100%}'));
});
