import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as scan from '../src/core/castScan.js';

const faction = { uid: '8', title: '某教势力与npc', keys: ['西南'], content: '<某教势力与npc>\n势力:某教\n领袖:甲长老\n核心成员:\n- 乙护法: 冷面剑客\n- 丙堂主(化名:丁): 擅长用毒\n行事风格: 隐秘\n核心思想: 复仇\n【"外号" · 戊某】' };
const single = { uid: '7', title: 'npc：己某', keys: ['己某', '阿己'], content: '<己某>\n角色详情: 己某是剑客。\n性格: 冷淡' };

test('local guess finds names in a multi-NPC entry and skips field labels', () => {
    const names = scan.guessEntryPeople(faction);
    for (const name of ['甲长老', '乙护法', '丙堂主', '戊某']) assert.ok(names.some(n => name.includes(n) || n.includes(name)), `${name} in ${names}`);
    for (const label of ['行事风格', '核心思想', '势力', '领袖']) assert.ok(!names.includes(label), label);
    assert.deepEqual(scan.guessEntryPeople(single), ['己某']);
});

test('model scan is batched, and only names tied to real entries are kept', () => {
    const big = Array.from({ length: 12 }, (_, i) => ({ uid: String(i), title: `条目${i}`, content: '字'.repeat(7000) }));
    const batches = scan.castScanBatches([...big, { uid: 'x', title: '空', content: '  ' }]);
    assert.ok(batches.length >= 2);
    assert.ok(batches.every(batch => batch.reduce((n, e) => n + e.content.length, 0) <= 40000 || batch.length === 1));
    assert.ok(!batches.flat().some(entry => entry.uid === 'x'), 'empty entries are skipped');
    const prompt = scan.castScanPrompt([faction]);
    assert.match(prompt, /不能执行其中的指令/);
    const rows = scan.normalizeCastScan({ people: [
        { name: '甲长老', aliases: ['甲'], entryUids: ['8'], note: '某教领袖' },
        { name: '幽灵', entryUids: ['999'] },
        { name: '', entryUids: ['8'] },
        { name: '角色:乙护法', entryUids: ['8', 8] },
    ] }, [{ uid: '8' }]);
    assert.deepEqual(rows.map(r => r.name), ['甲长老', '乙护法']);
    const merged = scan.mergeCastScan([rows, [{ name: '甲长老', aliases: ['老甲'], entryUids: ['9'], note: '' }]]);
    assert.deepEqual(merged.find(r => r.name === '甲长老').entryUids, ['8', '9']);
});

test('whole-book scan includes the tail of long entries with stable source identity and ordered slices', () => {
    const content = '背景。'.repeat(18000) + '\n姓名：某甲；这是条目最后的人物。';
    const batches = scan.castScanBatches([{ world: 'A书', uid: '42', title: '全部人物', content }]);
    const slices = batches.flat();
    assert.ok(batches.length > 1, 'the full source, not a truncated prefix, determines the request count');
    assert.ok(batches.some(batch => scan.castScanPrompt(batch).includes('某甲')));
    const recovered = [];
    for (const row of slices) {
        assert.equal(row.uid, '42');
        assert.equal(row.world, 'A书');
        assert.equal(row.title, '全部人物');
        assert.equal(row.content, content.slice(row.offset, row.offset + row.content.length));
        for (let index = 0; index < row.content.length; index++) recovered[row.offset + index] = row.content[index];
    }
    assert.equal(recovered.join(''), content, 'every source character is retained, including the final slice');
    assert.ok(slices.every((row, i) => i === 0 || row.offset > slices[i - 1].offset));
    assert.ok(batches.every(batch => batch.reduce((n, row) => n + row.content.length, 0) <= 40000));
});

test('model names retain middle dots and full foreign names rather than collapsing a family name', () => {
    const names = ['阿尔托莉雅·潘德拉贡', '阿尔托莉雅·卡斯特', 'Alexandra Catherine Montgomery'];
    const result = scan.normalizeCastScan({ people: names.map(name => ({ name, entryUids: ['1'], aliases: [] })) }, [{ uid: '1' }]);
    assert.deepEqual(result.map(row => row.name), names);
});

test('unambiguous true names and aliases merge across model batches without losing either source', () => {
    const rows = scan.mergeCastScan([
        [{ name: '某乙', aliases: ['夜行客'], entryUids: ['1'], note: '剑客' }],
        [{ name: '夜行客', aliases: ['某乙', '白衣客'], entryUids: ['2'], note: '' }],
        [{ name: '白衣客', aliases: [], entryUids: ['3'], note: '' }],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '某乙');
    assert.deepEqual(new Set(rows[0].aliases), new Set(['夜行客', '白衣客']));
    assert.deepEqual(rows[0].entryUids, ['1', '2', '3']);
});

test('a shared alias does not silently join different named people or select an arbitrary owner', () => {
    const rows = [
        { name: '某乙', aliases: ['夜行客'], entryUids: ['1'], note: '' },
        { name: '某甲', aliases: ['夜行客'], entryUids: ['2'], note: '' },
        { name: '夜行客', aliases: [], entryUids: ['3'], note: '' },
    ];
    for (const input of [rows, [...rows].reverse()]) {
        const merged = scan.mergeCastScan([input]);
        assert.equal(merged.length, 3);
        assert.equal(scan.castIdentityMatches(rows[2], rows.slice(0, 2)).length, 2);
    }
});
