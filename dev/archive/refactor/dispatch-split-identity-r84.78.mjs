// 已退役（r84.93）：它证明 r84.78 的分发拆分与 r84.71 逐字相同。r84.80 之后这些函数按功能需求改过，不再与 r84.71 相同，所以不再运行，只作记录。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
// 重构阶段 3：超大分发函数拆成连续语句分组（tools/split-dispatch.mjs）。
// 这里把每一行“分组调用”换回分组函数的函数体，拼回来的原函数必须与 r84.71 基线逐字相同
// （verification/refactor-baseline-r84.71.json 里记录的声明指纹），同时核对调用参数与分组函数参数一致。
const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(`src/${file}`, root), 'utf8');
const digest = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);
const baseline = JSON.parse(fs.readFileSync(new URL('verification/refactor-baseline-r84.71.json', root), 'utf8'));
const SPLITS = [
    { source: 'ui/overlayCore.js', fn: 'handleOverlayClick', sentinel: 'OVERLAY_CLICK_UNHANDLED', baseline: 'ui/overlay.js:handleOverlayClick@' },
    { source: 'ui/settingsPanelHome.js', fn: 'mountSettings', sentinel: 'SETTINGS_MOUNT_UNHANDLED', baseline: 'ui/settingsPanel.js:mountSettings@' },
];

for (const split of SPLITS) test(`${split.fn} reassembles byte-for-byte to the r84.71 text`, () => {
    const source = read(split.source);
    const aliases = Object.fromEntries([...source.matchAll(/^import \* as (\w+) from '\.\/([\w/]+\.js)';$/gm)].map(m => [m[1], `ui/${m[2]}`]));
    const start = source.indexOf(`function ${split.fn}(`);
    const end = source.indexOf('\n}\n', start) + 2;
    let text = source.slice(start, end);
    const calls = [...text.matchAll(new RegExp(`if \\((\\w+)\\.(\\w+)\\(([^)]*)\\) !== ${split.sentinel}\\) return;`, 'g'))];
    assert.ok(calls.length > 0, 'no group calls found');
    for (const [line, alias, name, args] of calls) {
        const module = read(aliases[alias]);
        const head = `export function ${name}(${args}) {\n    `;
        const at = module.indexOf(head);
        assert.ok(at >= 0, `${name}(${args}) not found with the same parameters in ${aliases[alias]}`);
        const tail = `\n    return ${split.sentinel};\n}\n`;
        const bodyEnd = module.indexOf(tail, at);
        text = text.replace(line, () => module.slice(at + head.length, bodyEnd));
    }
    const row = Object.values(baseline.declarations).find(entry => entry.where.startsWith(split.baseline));
    const key = Object.keys(baseline.declarations).find(k => baseline.declarations[k] === row);
    assert.equal(digest(text), key);
});
