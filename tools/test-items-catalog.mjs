import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItems } from '../src/modes/items.js';

const catalog = {
    title: '他的物品',
    containers: [{
        id: 'BOX01',
        label: '抽屉',
        nodes: [
            { id: 'IT01', label: '票据', kind: 'item', basis: '设定', summary: '', line: '', sourceMemoryIds: [], sourceMemoryAnchor: '', children: [] },
            { id: 'IT02', label: '旧信', kind: 'item', basis: '记忆', summary: '一封信', line: '还在。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '并不存在的原句', children: [] },
        ],
    }],
};

test('an empty line keeps a setting item in the catalog and still drops a memory item with no anchor', () => {
    assert.throws(() => normalizeItems(catalog, null), /内容不足|他的物品/);
    const saved = normalizeItems(catalog, null, { structureOnly: true });
    assert.equal(saved.containers.length, 1);
    assert.deepEqual(saved.containers[0].nodes.map(node => node.id), ['IT01']);
    assert.equal(saved.containers[0].nodes[0].line, '');
    assert.equal(saved.containers[0].nodes[0].basis, '设定');
});

test('a full item still needs both the description and the line', () => {
    const ready = structuredClone(catalog);
    ready.containers[0].nodes[0].summary = '一张折过的票据。';
    ready.containers[0].nodes[0].line = '这张先放着。';
    const saved = normalizeItems(ready, null);
    assert.equal(saved.containers[0].nodes[0].id, 'IT01');
    assert.equal(saved.containers[0].nodes[0].line, '这张先放着。');
});
