import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    advBatchPrompt,
    advPrompt,
    normalizeAdv,
    normalizeAdvBatch,
} from './testingFacade.mjs';

const root = new URL('../', import.meta.url);

function paragraphs(label, count, firstPerson = true) {
    return Array.from({ length: count }, (_, index) => firstPerson
        ? `我把${label}里的第${index + 1}个念头压在心里，直到现在才明白自己的迟疑从哪里来，也终于承认那份情绪一直没有消失。`
        : `角色在${label}里的第${index + 1}个念头被旁观者完整说明，他的迟疑与动机都由第三人称总结，却从未真正开口讲述自己的感受。`);
}

function validAdv(sectionTypes = ['past', 'during'], countPerSection = 9) {
    return {
        narrator: 'char_first_person',
        sections: sectionTypes.map(type => ({ type, paragraphs: paragraphs(type, countPerSection) })),
    };
}

test('r42.7 ADV prompts require char first-person mood completion and two typed content ranges', () => {
    const context = { name1: '用户', name2: '角色' };
    const memoryBank = {
        archiveName: '当前档案',
        memories: [{ id: 'M001', title: '雨夜', summary: '两个人在雨夜并肩回家。', anchors: ['雨落在共撑的伞上'] }],
    };
    const event = {
        id: 'EV01',
        title: '雨夜同行',
        date: '08/27',
        cgDesc: '雨夜里，两个人共撑一把伞。',
        visualSeed: ['雨', '伞', '路灯', '并肩'],
        sourceMemoryIds: ['M001'],
        sourceMemoryAnchor: '雨落在共撑的伞上',
    };
    for (const prompt of [advPrompt(context, event, memoryBank), advBatchPrompt(context, [event], memoryBank)]) {
        assert.match(prompt, /"narrator": "char_first_person"/);
        assert.match(prompt, /past【过去】/);
        assert.match(prompt, /daily【日常】/);
        assert.match(prompt, /during【共同经历时的当时心情】/);
        assert.match(prompt, /after【后日谈】/);
        assert.match(prompt, /至少 2 个不同 type/);
        assert.match(prompt, /性格、动机与情绪/);
        assert.match(prompt, /禁止第三人称总结|禁止用旁观者口吻/);
    }
});

test('r42.7 ADV validator accepts and flattens at least two substantial first-person sections', () => {
    const normalized = normalizeAdv(validAdv(['past', 'daily'], 9));
    assert.equal(normalized.paragraphs.length, 18);
    assert.deepEqual(normalized.coverageTypes, ['past', 'daily']);
    assert.match(normalized.paragraphs[0], /我/);
});

test('r42.7 ADV validator rejects legacy untyped output, one-category output, and third-person summaries', () => {
    assert.throws(() => normalizeAdv({ paragraphs: paragraphs('旧格式', 18) }), /视角不合格/);
    assert.throws(() => normalizeAdv(validAdv(['during'], 18)), /内容范围不足/);
    const thirdPerson = {
        narrator: 'char_first_person',
        sections: [
            { type: 'daily', paragraphs: paragraphs('日常', 9, false) },
            { type: 'after', paragraphs: paragraphs('后日谈', 9, false) },
        ],
    };
    assert.throws(() => normalizeAdv(thirdPerson), /第一人称密度不足/);
});

test('r42.7 ADV batch keeps only items that satisfy the same POV and two-range contract', () => {
    const data = {
        items: [
            { eventId: 'EV01', ...validAdv(['daily', 'during'], 6) },
            { eventId: 'EV02', narrator: 'char_first_person', sections: [{ type: 'after', paragraphs: paragraphs('后日谈', 12) }] },
        ],
    };
    const result = normalizeAdvBatch(data, [{ id: 'EV01' }, { id: 'EV02' }]);
    assert.equal(result.size, 1);
    assert.equal(result.has('EV01'), true);
    assert.equal(result.has('EV02'), false);
    assert.deepEqual(result.get('EV01').coverageTypes, ['daily', 'during']);
});

test('r42.7 removes firefly and character-profile explanatory annotations without removing controls', async () => {
    const heartView = await readFile(new URL('src/ui/heartView.js', root), 'utf8');
    const relations = await readFile(new URL('src/modes/relations.js', root), 'utf8');
    assert.doesNotMatch(heartView, /像 GS4 一样，颜色代表不同话题/);
    assert.doesNotMatch(heartView, /rmt-firefly-legacy-note/);
    assert.match(heartView, /FIREFLY HABITAT/);
    assert.match(heartView, /rmt-firefly-legend/);
    assert.doesNotMatch(relations, /这里整理所有聊天窗口共用的角色固定资料/);
    assert.doesNotMatch(relations, /rmt-profile-merge-note/);
    assert.match(relations, /data-rmt-action="character-profile-generate"/);
    assert.match(relations, /profile\.introduction/);
});
