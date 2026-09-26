import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
// 重构清单 4-B（r84.96）：设置页的“改设置”“点按钮”两个大监听器从 mountSettings 里搬成具名函数。
// 唯一的改写：mountSettings 里四个会变的局部变量（tagChoices / tagScanned / tagEdited / tagScanEpoch）
// 改成共享对象 tagState 的属性，让搬出去的监听器与原处的扫描函数读写同一份状态。
// 本测试把改写逐步还原：分组调用换回函数体、tagState.X 换回 X、对象声明换回原 let 声明，
// 结果必须与 r84.95 的 mountSettings 逐字相同（指纹 40d4d3ca36ba24594786，也记录在 r84.94 护栏基线里）。
const R8495_MOUNT_SETTINGS = '40d4d3ca36ba24594786';
const source = fs.readFileSync(new URL('../src/ui/settingsPanelHome.js', import.meta.url), 'utf8');
const digest = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);

test('mountSettings reassembles to the r84.95 text after undoing the listener move and the tagState rename', () => {
    const start = source.indexOf('function mountSettings(');
    let text = source.slice(start, source.indexOf('\n}\n', start) + 2);
    const calls = [...text.matchAll(/if \((bindSettings\w+)\(([^)]*)\) !== SETTINGS_BIND_UNHANDLED\) return;/g)];
    assert.equal(calls.length, 2, 'change and click listeners are called from mountSettings');
    for (const [line, name, args] of calls) {
        const head = `function ${name}(${args}) {\n    `;
        const at = source.indexOf(head);
        assert.ok(at >= 0, `${name} takes exactly the arguments it is called with`);
        const end = source.indexOf('\n    return SETTINGS_BIND_UNHANDLED;\n}\n', at);
        text = text.replace(line, () => source.slice(at + head.length, end));
    }
    text = text.replace(/const tagState = \{ tagChoices: new Map\(\), tagScanned: false, tagEdited: false, tagScanEpoch: 0 \};[^\n]*/,
        'let tagChoices = new Map(), tagScanned = false, tagEdited = false, tagScanEpoch = 0;');
    text = text.replace(/\btagState\.(tagChoices|tagScanned|tagEdited|tagScanEpoch)\b/g, '$1');
    assert.equal(/\btagState\b/.test(text), false, 'every tagState use is one of the four renamed locals');
    assert.equal(digest(text), R8495_MOUNT_SETTINGS);
});

test('the two listener functions only receive constants or the shared tagState object', () => {
    for (const name of ['bindSettingsChange', 'bindSettingsClick']) {
        const params = source.match(new RegExp(`function ${name}\\(([^)]*)\\)`))[1].split(',').map(p => p.trim());
        for (const param of params) {
            if (param === 'tagState') continue;
            assert.match(source, new RegExp(`\\n    const ${param} = `), `${param} is a const in mountSettings, so passing it by value is exact`);
        }
    }
});
