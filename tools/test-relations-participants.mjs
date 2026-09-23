import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRelations, relationGardenHtml, relationsPrompt } from '../src/modes/relations.js';

const context = { name1: '你', name2: '群像卡' };
const memory = {
    chatId: 'relations-chat', archiveRevision: 'relations-rev', characterName: '群像卡', userName: '你',
    participantsV1: { version: 1, cardType: 'multi', revision: 'r1', selectedIds: ['a', 'b'], people: [
        { id: 'a', name: '岚', sourceRefs: [] }, { id: 'b', name: '澄', sourceRefs: [] },
    ] },
    memories: [{ id: 'M001', title: '岚与灯里在雨中和解', summary: '岚承认一直在意灯里；澄和真在社团准备演出。',
        anchors: ['岚对灯里说会留下。', '澄与真约好排练。'], participants: ['岚', '灯里', '澄', '真'] }],
};

function dynamic(ownerName, name, relation, anchor) {
    return { ownerName, name, relation, summary: `${ownerName} 与 ${name} 的当前关系。`, category: 'friend', state: '友好',
        isUser: false, npcPerspective: `${name} 知道 ${ownerName} 很认真。`, sourceMemoryIds: ['M001'], sourceMemoryAnchor: anchor };
}

test('relations freeze two real owners and render separate edges with an owner switch', () => {
    const session = normalizeRelations({ relationships: [
        dynamic('岚', '灯里', '和解后的朋友', '岚对灯里说会留下。'),
        dynamic('澄', '真', '社团搭档', '澄与真约好排练。'),
    ], discoveries: [] }, memory, context);
    assert.deepEqual(session.participantNames, ['岚', '澄']);
    assert.deepEqual(session.relationships.map(item => item.ownerName), ['岚', '澄']);
    const html = relationGardenHtml({ participantNames: session.participantNames, dynamicRelations: session.relationships, selectedOwner: '岚' });
    assert.match(html, /data-rmt-action="relation-owner-select"/);
    assert.match(html, /data-rmt-relation-owner="澄"/);
    assert.match(html, /灯里/);
    assert.doesNotMatch(html, /社团搭档/);
    assert.match(html, /rmt-relation-garden-scroll/);
    const positions = [...html.matchAll(/style="left:(\d+)px;top:(\d+)px"/g)].map(match => `${match[1]},${match[2]}`);
    assert.equal(new Set(positions).size, positions.length);
});

test('relations reject an owner outside the frozen roster or absent from its Mxxx evidence', () => {
    const foreignOwner = normalizeRelations({ relationships: [dynamic('卡名', '灯里', '朋友', '岚对灯里说会留下。')], discoveries: [] }, memory, context);
    assert.equal(foreignOwner.relationships.length, 0);
    const memoryWithoutCheng = { ...memory, memories: [{ ...memory.memories[0], summary: '岚承认一直在意灯里。', anchors: ['岚对灯里说会留下。'], participants: ['岚', '灯里'] }] };
    const unprovenOwner = normalizeRelations({ relationships: [dynamic('澄', '灯里', '朋友', '岚对灯里说会留下。')], discoveries: [] }, memoryWithoutCheng, context);
    assert.equal(unprovenOwner.relationships.length, 0);
    assert.match(relationsPrompt(context, memory), /ownerName/);
    assert.match(relationsPrompt(context, memory), /岚、澄/);
});

test('legacy relations keep their original single-centre graph and do not require an owner', () => {
    const html = relationGardenHtml({ characterName: '旧卡名', sharedRelations: [{ name: '旧友', relation: '旧设定', category: 'friend' }],
        dynamicRelations: [{ name: '灯里', relation: '旧关系', summary: '旧存档原文', category: 'friend', state: '友好', isUser: false }] });
    assert.match(html, /旧卡名/);
    assert.match(html, /固有设定/);
    assert.doesNotMatch(html, /relation-owner-select/);
});

test('group garden keeps every supplied owner in a scrollable canvas', () => {
    const names = Array.from({ length: 17 }, (_, index) => `人物${index + 1}`);
    const html = relationGardenHtml({ participantNames: names, dynamicRelations: names.map((ownerName, index) => ({
        ownerName, name: `关系${index + 1}`, relation: '朋友', summary: '已保存关系', category: 'friend', state: '友好', isUser: false,
    })) });
    assert.match(html, /人物17/);
    assert.match(html, /width:2508px/);
    assert.match(html, /rmt-relation-garden-scroll/);
});
