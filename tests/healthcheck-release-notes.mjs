import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(`${root}/src/core/selfUpdater.js`, 'utf8');
const body = source.slice(source.indexOf('export function parseHearttraceReadme'), source.indexOf('// The installed README.md beside')).replace('export ', '');
const parse = Function(`${body}\nreturn parseHearttraceReadme;`)();

test('「本次修复」is read, and older 「## x.y.z 更新记录」 blocks stay under their own version', () => {
    const sections = parse(['# 心迹回廊 2.0.2', '', '## 本次修复', '', '- 新修的一条', '', '说明段落', '',
        '## 2.0.1 更新记录', '', '## 本次修复', '', '- 上一版的一条', '',
        '## 2.0.0 更新记录', '', '## 本次变动', '', '- 更早的一条', '- 其他已有功能保持不变。'].join('\n'));
    assert.deepEqual(sections.map(s => s.version), ['2.0.2', '2.0.1', '2.0.0']);
    assert.deepEqual(sections[0].items, ['新修的一条', '说明段落']);
    assert.deepEqual(sections[1].items, ['上一版的一条']);
    assert.deepEqual(sections[2].items, ['更早的一条', '其他已有功能保持不变。']);
});

test('the shipped README shows its own version first with its own notes', () => {
    const readme = readFileSync(`${root}/README.md`, 'utf8');
    const [latest] = parse(readme);
    const version = /^#\s+.+?\s+(\d+\.\d+\.\d+)/m.exec(readme)[1];
    assert.equal(latest.version, version);
    assert.ok(latest.items.length > 0);
    assert.ok(!latest.groups.some(group => group.title === '更新日志模块'), 'older module notes are not shown as this version');
});

test('the old single-version README format still parses the same way', () => {
    const [only] = parse(['# 心迹回廊 1.0.0', '## 更新日志模块', '- 模块说明', '## 本次变动', '- 一', '- 二'].join('\n'));
    assert.equal(only.version, '1.0.0');
    assert.deepEqual(only.items, ['模块说明', '一', '二']);
});
