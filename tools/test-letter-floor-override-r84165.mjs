// r84.165 · 楼层壳尾部带 !important 的规则（mirrorModuleCss）曾把 r84.164 的适配盖回去：
// 壳宽锁在 420px、信里内容锁在 70vh 内部滚动。这里要求尾部规则本身就给出拆开信的宽度和不限高。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tail = async () => {
    const src = await readFile(new URL('../src/ui/autoMemoryShell.js', import.meta.url), 'utf8');
    const start = src.indexOf('.rmt-floor-shell{position:relative!important');
    return src.slice(start, src.indexOf('`;', start));
};

test('拆开的信：电脑上壳宽 640px，600px 以下占满', async () => {
    const css = await tail();
    assert.ok(css.includes('.rmt-floor-shell:has(.rmt-heart-letter-paper:not([hidden])){width:min(96%,640px)!important}'));
    assert.ok(css.includes('@media (max-width:600px){.rmt-floor-shell,.rmt-floor-shell:has(.rmt-heart-letter-paper:not([hidden])){width:100%!important}}'));
});

test('信里内容不再锁 70vh 内部滚动，宽内容只横向滚动', async () => {
    const css = await tail();
    assert.equal(css.includes('max-height:70vh'), false);
    assert.ok(css.includes('max-height:none!important'));
    assert.ok(css.includes('overflow-x:auto!important;overflow-y:visible!important'));
});
