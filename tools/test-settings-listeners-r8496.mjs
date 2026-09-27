import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// 重构清单 4-B（r84.96）：设置页的“改设置”“点按钮”两个大监听器从 mountSettings 里搬成具名函数。
// 唯一的改写：mountSettings 里四个会变的局部变量（tagChoices / tagScanned / tagEdited / tagScanEpoch）
// 改成共享对象 tagState 的属性，让搬出去的监听器与原处的扫描函数读写同一份状态。
// 逐字比对 r84.95 的那一项已于 r84.158 退役，移到 dev/archive/refactor/settings-listeners-identity-r84.96.mjs。
const source = fs.readFileSync(new URL('../src/ui/settingsPanelHome.js', import.meta.url), 'utf8');

test('the two listener functions only receive constants or the shared tagState object', () => {
    // r84.158：mountSettings 已重新排版成 2 空格缩进，参数列表末尾多了逗号。这里只适配排版：
    // 不限缩进地找 const 声明，去掉末尾逗号产生的空参数。并且只在 mountSettings 里找，
    // 同文件其他函数里的同名 const 不算数（排版改成 2 空格后，别处也有 const panel）。
    const start = source.indexOf('function mountSettings(');
    const mount = source.slice(start, source.indexOf('\n}\n', start) + 2);
    for (const name of ['bindSettingsChange', 'bindSettingsClick']) {
        const params = source.match(new RegExp(`function ${name}\\(([^)]*)\\)`))[1].split(',').map(p => p.trim()).filter(Boolean);
        assert.ok(params.length > 0, `${name} has parameters`);
        for (const param of params) {
            if (param === 'tagState') continue;
            assert.match(mount, new RegExp(`\\n\\s*const ${param} = `), `${param} is a const in mountSettings, so passing it by value is exact`);
        }
    }
});
