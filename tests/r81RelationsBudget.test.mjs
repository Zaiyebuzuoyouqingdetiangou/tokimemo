import test from 'node:test';
import assert from 'node:assert/strict';
import * as relations from '../src/modes/relations.js';
import * as constants from '../src/core/constants.js';

const context = { name1: '小月', name2: '林舟' };
const entry = (uid, name, extra = '') => ({ world: '庭院设定', uid: String(uid), title: name,
    content: `${name}是林舟的邻居，常在庭院种花。${extra}`, historySource: false,
    keys: ['不应重复发送的扫描词'], originalChars: 999999, disabled: false, contentTruncated: false });
const node = (source, name) => ({ name, sourceWorld: source.world, sourceUid: source.uid,
    sourceEvidence: `${name}是林舟的邻居，常在庭院种花。`, npcPerspective: '我喜欢与他一起照料花。' });

test('relation request keeps whole setting entries and source IDs within its serialized setting budget', () => {
    const sources = [entry(1, '白露', '雨'.repeat(6000)), entry(2, '青禾', '花'.repeat(6000)), entry(3, '秋明')];
    const before = structuredClone(sources);
    const result = relations.fitRelationSettingEntries(sources);
    assert.ok(JSON.stringify(result.entries).length <= constants.MAX_SELECTED_SETTING_CHARS);
    assert.deepEqual(result.entries.map(value => value.uid), ['1', '3']);
    assert.equal(result.entries[0].content, sources[0].content);
    assert.deepEqual(Object.keys(result.entries[0]).sort(), ['content', 'title', 'uid', 'world']);
    assert.deepEqual(result.omittedEntries.map(value => value.uid), ['2']);
    assert.equal(result.omittedEntries[0].content, sources[1].content);
    assert.equal(result.coverage.status, 'truncated'); assert.equal(result.coverage.returned, 2); assert.equal(result.coverage.total, 3);
    assert.deepEqual(sources, before, 'fitting must not rewrite the selected worldbook records');
});

test('an oversized first entry does not prevent later complete entries from fitting; JSON escaping is counted', () => {
    const oversized = entry(1, '白露', '长'.repeat(20000));
    const escaped = entry(2, '青禾', '\n"\\'.repeat(80));
    const small = entry(3, '秋明');
    const result = relations.fitRelationSettingEntries([oversized, escaped, small], { maxChars: 300 });
    assert.deepEqual(result.entries.map(value => value.uid), ['3']);
    assert.deepEqual(result.omittedEntries.map(value => value.uid), ['1', '2']);
    assert.equal(result.entries[0].content, small.content); assert.ok(JSON.stringify(result.entries).length <= 300);
});

test('empty selections and history sources do not claim setting coverage or retain former setting people', () => {
    const source = entry(1, '白露'); const previous = [node(source, '白露')];
    for (const supplied of [[], [{ ...source, historySource: true }]]) {
        const result = relations.fitRelationSettingEntries(supplied);
        assert.deepEqual(result.entries, []); assert.deepEqual(result.omittedEntries, []);
        assert.equal(result.coverage.status, 'complete'); assert.equal(result.coverage.returned, 0); assert.equal(result.coverage.total, 0);
        assert.deepEqual(relations.mergeBudgetRetainedSettingRelations([], previous, result, context), []);
    }
    const unreadable = relations.fitRelationSettingEntries([], { coverage: { status: 'partial', returned: 0, total: null, reason: '读取失败' } });
    assert.equal(unreadable.coverage.status, 'partial'); assert.equal(unreadable.coverage.total, null);
});

test('only still-selected omitted sources with matching evidence can retain an old setting person', () => {
    const big = entry(1, '白露', '长'.repeat(20000)), small = entry(2, '青禾');
    const selection = relations.fitRelationSettingEntries([big, small]);
    const previous = [node(big, '白露'), node(small, '青禾'), node(entry(9, '已取消选择'), '已取消选择')];
    const result = relations.mergeBudgetRetainedSettingRelations([], previous, selection, context);
    assert.deepEqual(result.map(value => value.name), ['白露']);
    assert.equal(result[0].sourceEvidence, previous[0].sourceEvidence); assert.equal(result[0].sourceWorld, big.world);
    assert.equal(result[0].sourceUid, big.uid); assert.equal(result[0].settingOnly, true);
    assert.equal(result[0].npcPerspective, previous[0].npcPerspective);
    const revised = { ...big, content: '白露现在独自居住。' + '长'.repeat(20000) };
    assert.deepEqual(relations.mergeBudgetRetainedSettingRelations([], previous,
        relations.fitRelationSettingEntries([revised, small]), context), [], 'changed or removed evidence cannot be kept');
});

test('generated nodes use only sent evidence, take priority over retained names and keep unique local IDs', () => {
    const big = entry(1, '白露', '长'.repeat(20000)), fresh = entry(2, '青禾');
    const selection = relations.fitRelationSettingEntries([big, fresh]);
    const result = relations.mergeBudgetRetainedSettingRelations([node(fresh, '青禾'), node(big, '白露')],
        [node(big, '白露')], selection, context);
    assert.deepEqual(result.map(value => value.name), ['青禾', '白露']);
    assert.equal(new Set(result.map(value => value.id)).size, result.length);
    assert.deepEqual(relations.mergeBudgetRetainedSettingRelations([node(big, '白露')], [], selection, context), [],
        'the model cannot cite an entry it was never sent');
    const sameName = { ...fresh, content: '白露是林舟的邻居，常在庭院种花。' };
    const replaced = relations.mergeBudgetRetainedSettingRelations([node(sameName, '白露')], [node(big, '白露')],
        relations.fitRelationSettingEntries([big, sameName]), context);
    assert.equal(replaced.length, 1); assert.equal(replaced[0].sourceUid, sameName.uid);
});

test('projected setting context occurs once in the relations prompt and omits skipped prose and collector metadata', () => {
    const big = entry(1, '白露', 'DO_NOT_SEND_OMITTED'.repeat(1000)), small = entry(2, '青禾', 'SENT_ONCE_MARKER');
    const selected = relations.fitRelationSettingEntries([big, small]);
    const prompt = relations.relationsPrompt(context, { memories: [] }, selected.entries);
    assert.equal(prompt.split('SENT_ONCE_MARKER').length - 1, 1);
    assert.doesNotMatch(prompt, /DO_NOT_SEND_OMITTED|originalChars|contentTruncated|不应重复发送的扫描词/);
    assert.match(prompt, /sourceWorld/); assert.match(prompt, /sourceUid/); assert.match(prompt, /sourceEvidence/);
});
