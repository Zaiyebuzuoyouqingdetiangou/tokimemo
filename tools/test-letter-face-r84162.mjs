// r84.162 · 聊天里的回忆信：只有最新一楼用迷你信封，更早的楼压缩成提示条（没拆的带红点）；
// 信纸改成素笺卡，「打开回忆」仍在信里展开，另有「去心迹回廊看」；弹出提示仍用酒馆原生，颜色跟随插件主题。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './runtime-harness.mjs';

const shellSource = () => readFile(new URL('../src/ui/autoMemoryShell.js', import.meta.url), 'utf8');

test('只有最新一楼是信封，其余是提示条；提示条区分未拆和已读', async () => {
    const src = await shellSource();
    assert.match(src, /const newest = slots\.reduce\(\(max, slot\) => Math\.max\(max, slot\.messageIndex\), -1\);/);
    assert.match(src, /compact: slot\.messageIndex < newest/);
    assert.match(src, /opened: reveal\.status === 'opened'/);
    assert.match(src, /rmt-heart-letter-strip/);
    assert.match(src, /view\.opened \? '已读' : '未拆'/);
    assert.match(src, /rmt-letter-dot/);
    // 信封和提示条切换时要重画，不能沿用旧的外观。
    assert.match(src, /host\.dataset\.rmtFace === face/);
});

test('信纸：在信里展开、去心迹回廊看、收起三个按钮；跳转只打开已保存的模块', async () => {
    const src = await shellSource();
    assert.match(src, /data-rmt-letter-read/);
    assert.match(src, /data-rmt-letter-jump/);
    assert.match(src, /去心迹回廊看/);
    const handler = src.slice(src.indexOf("closest?.('[data-rmt-letter-jump]')"), src.indexOf("closest?.('[data-rmt-letter-read]')"));
    assert.match(handler, /Object\.values\(core_constants\.MODE\)\.includes\(mode\)/);
    assert.match(handler, /ui_overlay\.openCachedOrGenerate\(mode\)/);
    const overlay = await readFile(new URL('../src/ui/overlayCore.js', import.meta.url), 'utf8');
    const open = overlay.slice(overlay.indexOf('export function openCachedOrGenerate'), overlay.indexOf('export function renderActive'));
    assert.equal(/generate[A-Z]\w*\(|requestGeneration|startGeneration/.test(open), false, '跳转入口不能发起生成');
});

test('弹出提示仍用酒馆原生，加主题类名和主题颜色', async () => {
    const src = await shellSource();
    assert.match(src, /toastClass: 'toast rmt-heart-toast'/);
    assert.match(src, /core_theme\.applyThemeToElement\(node,/);
    const h = await harness({ messages: 2, bundle: true });
    const css = h.module('autoMemory/shellState.js').floorShellCss();
    assert.ok(css.includes('#toast-container>.toast.rmt-heart-toast{'));
    assert.ok(css.includes('.rmt-heart-letter-strip{'));
    assert.ok(css.includes('.rmt-heart-letter-seal .rmt-envelope{flex:0 0 72px;width:72px'));
    assert.equal(css.includes('repeating-linear-gradient'), false, '信纸不再用横线底纹');
});
