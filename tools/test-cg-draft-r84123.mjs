import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { preparationFixture } from './preparation-harness-r8481.mjs';

async function fixture() {
    const f = await preparationFixture();
    f.data = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, f.sandbox);
    f.sandbox.structuredClone = value => f.data(value);
    f.targets = await f.api('core/cgTargets.js');
    f.visual = await f.api('core/cgVisualRules.js');
    f.core = await f.api('generation/cgImageCore.js');
    f.patch = await f.api('core/cgImagePatch.js');
    return f;
}

const monologue = '我拿汗巾抹了把脸，抬头就能看见遂婆坐在门槛边上，手里捏着我昨晚给她编的红黑麻绳，低着头安安静静地打结。旁人都说那是块废铁，硬得砸不开、熔不化，偏我脾气倔，愣是搬回铺子里，拉了整整三年的风箱。“你别走。”直到那天半夜，炉膛里的火全变成了金红色，你就那么光着脚从灰堆里走出来。';
const worldSpec = { primaryAxis: 'occupation', era: '山河未定的旧王朝末年，官府管不到小镇', location: '青石镇流水巷方记铁铺', identity: '寻常打铁客', occupation: '铁匠' };
function butterfly(node = {}) {
    return { kind: 'butterfly', chatId: 'preparation-check', archiveRevision: 'rev1', subject: '方祁洛',
        nodes: [{ id: 'EG02', label: '分歧点 B：寻常打铁客与未琢之胚', monologue, intervention: '现世的回应', systemNote: '判定', worldSpec, ...node }] };
}

test('a butterfly node without an authored image prompt gets a composed third-person draft, not the monologue', async () => {
    const f = await fixture();
    const session = f.data(butterfly());
    const descriptor = f.targets.describeExpandedCgTarget(session, { kind: 'butterfly-node', containerId: 'EG02' });
    const item = f.targets.expandedCgItem(session, descriptor).item;
    const draft = item.cgComposedDraft;
    assert.ok(draft.startsWith('青石镇流水巷方记铁铺'), draft);
    assert.match(draft, /方祁洛是寻常打铁客/);
    assert.match(draft, /方祁洛拿汗巾抹了把脸/);
    assert.match(draft, /遂婆坐在门槛边上/);
    assert.doesNotMatch(draft, /我|你|都说|废铁|别走/);
    assert.ok(draft.length < 200, String(draft.length));
    assert.equal(f.core.cgImagePromptForItem(item, '', 'nai5-natural'), draft);
    // The capture signature still uses the old excerpt, so earlier targets stay comparable.
    assert.equal(item.cgDesc, f.visual.legacyCgSceneExcerpt([worldSpec.era, worldSpec.location, monologue].join('\n'), worldSpec.location));
    assert.doesNotMatch(f.patch.cgItemSignature(item), /cgComposedDraft|方祁洛是寻常打铁客/);
    assert.equal(f.providerCalls, 0);
});

test('an authored image prompt still wins and gets no composed draft', async () => {
    const f = await fixture();
    const imagePrompt = '铁铺里炉火通红，少女赤脚站在灰堆旁，铁匠放下铁锤回头看她。';
    const session = f.data(butterfly({ imagePrompt }));
    const descriptor = f.targets.describeExpandedCgTarget(session, { kind: 'butterfly-node', containerId: 'EG02' });
    const item = f.targets.expandedCgItem(session, descriptor).item;
    assert.equal(item.cgComposedDraft, undefined);
    assert.equal(f.core.cgImagePromptForItem(item, '', 'nai5-natural'), imagePrompt);
});

test('third-person drafts keep visible narration and drop dialogue, thoughts and addressed lines', async () => {
    const f = await fixture();
    const draft = f.visual.composedCgSceneDraft('narrator: 他站在窗边，手里握着书，灯光照亮了桌面。\nchar: 这是不应进入提示词的对白\nnarrator: 他心里想着明天，你一定会来。', { setting: ['雨夜'] });
    assert.equal(draft, '雨夜。他站在窗边，手里握着书，灯光照亮了桌面。');
    assert.equal(f.visual.composedCgSceneDraft('我知道你会来。', { firstPerson: true }), '');
});

test('the butterfly prose request asks for image fields on the same repairs row', async () => {
    const f = await fixture();
    const butterflyMode = await f.api('modes/butterfly.js');
    const memoryBank = f.data({ version: 3, chatId: 'preparation-check', archiveRevision: 'rev1', characterName: '岚', userName: '阿宁',
        memories: [{ id: 'M001', title: '读书', summary: '一起读完了窗边的书。', anchors: ['窗边的书'] }] });
    let sent = '';
    const session = f.data({ kind: 'butterfly', nodes: [{ id: 'EG01', label: '分歧点 A', prosePending: true, primaryAxis: 'era', worldSpec }] });
    await butterflyMode.fillButterflyProse(f.host, memoryBank, {}, 'task', session, { request: async prompt => { sent = prompt; return null; } });
    assert.match(sent, /只输出 \{"repairs"/);
    assert.match(sent, /imagePrompt 与可选 cgPromptDraft 写在同一个 repairs 条目里/);
    assert.match(sent, /OMEGA 不写画面字段/);
    assert.equal(f.providerCalls, 0);
});
