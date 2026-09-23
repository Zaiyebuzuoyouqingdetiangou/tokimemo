import * as assert from 'node:assert/strict';
import * as testApi from 'node:test';
import * as contract from '../src/core/bedtimeContract.js';
import * as constants from '../src/core/constants.js';
import * as bedtime from '../src/modes/bedtime.js';

const memory = { chatId: 'chat-bedtime', archiveRevision: 'rev-1', characterName: '林舟', userName: '阿遥', memories: [] };
const body = marker => `${marker}。` + '夜色越过废弃的观测窗，记录员沿着失去重力的走廊寻找那枚被调换的星图芯片。'.repeat(12);

function firstStory() {
    const plan = bedtime.createBedtimePlan({ direction: '太空站里的密室悬疑，不写恋爱线' }, memory, null, 1700000000000);
    return bedtime.normalizeGeneratedBedtime({
        title: '零点观测窗', genre: '太空悬疑', premise: '一枚失踪芯片让整座空间站失去方向。',
        chapter: { title: '停转的星图', text: body('第一章') },
    }, plan, memory, null, 'owner-1');
}

testApi.test('new bedtime story accepts a freely chosen non-fairy-tale genre', () => {
    const session = firstStory();
    assert.equal(contract.readableBedtime(session, memory), true);
    assert.equal(session.stories[0].genre, '太空悬疑');
    assert.equal(session.stories[0].chapters.length, 1);
    const plan = bedtime.createBedtimePlan({ direction: '硬核犯罪推理' }, memory, null, 1700000000100);
    const prompt = bedtime.bedtimePrompt(plan, memory);
    assert.match(prompt, /不限定甜宠、治愈、童话或儿童题材/);
    assert.match(prompt, /硬核犯罪推理/);
    assert.doesNotMatch(prompt, /必须.*甜|必须.*童话/u);
});

testApi.test('continuation freezes the next chapter identity and appends without changing old prose', () => {
    const original = firstStory();
    const frozen = structuredClone(original);
    const plan = bedtime.createBedtimePlan({ action: 'continue', storyId: original.stories[0].id, direction: '揭开供氧系统的误导线索' }, memory, original, 1700000100000);
    assert.equal(plan.chapterId.endsWith('-C02'), true);
    const continued = bedtime.normalizeGeneratedBedtime({ chapter: { title: '无声警报', text: body('第二章') } }, plan, memory, frozen, 'owner-1');
    assert.deepEqual(continued.stories[0].chapters[0], original.stories[0].chapters[0]);
    assert.equal(continued.stories[0].chapters.length, 2);
    assert.equal(continued.stories[0].chapters[1].id, plan.chapterId);
    assert.equal(bedtime.validateBedtimePlan(plan, memory, frozen).direction, '揭开供氧系统的误导线索');
});

testApi.test('stored chapter text preserves every original whitespace character', () => {
    const plan = bedtime.createBedtimePlan({ direction: '留白很多的书信体' }, memory, null, 1700000050000);
    const exact = `\r\n  ${body('带缩进的正文')}  \n\n`;
    const session = bedtime.normalizeGeneratedBedtime({ title: '留白', genre: '书信体', premise: '一封慢慢展开的信。',
        chapter: { title: '纸边', text: exact } }, plan, memory, null, 'owner-1');
    assert.equal(session.stories[0].chapters[0].text, exact);
    assert.equal(contract.normalizeStoredBedtime(structuredClone(session), memory).stories[0].chapters[0].text, exact);
});

testApi.test('append merge preserves every saved story and rejects attempts to replace an old chapter', () => {
    const original = firstStory();
    const plan = bedtime.createBedtimePlan({ action: 'continue', storyId: original.stories[0].id }, memory, original, 1700000200000);
    const incoming = bedtime.normalizeGeneratedBedtime({ chapter: { title: '盲区', text: body('第二章') } }, plan, memory, original, 'owner-1');
    const merged = contract.mergeBedtime(original, incoming);
    assert.deepEqual(merged.stories[0].chapters[0], original.stories[0].chapters[0]);
    assert.equal(merged.stories[0].chapters.length, 2);

    const tampered = structuredClone(incoming);
    tampered.stories[0].chapters[0].text = body('被替换的第一章');
    assert.throws(() => contract.mergeBedtime(original, tampered), { code: 'RMT_BEDTIME_CONFLICT' });
});

testApi.test('a frozen continuation refuses a different live chapter boundary', () => {
    const original = firstStory();
    const plan = bedtime.createBedtimePlan({ action: 'continue', storyId: original.stories[0].id }, memory, original, 1700000300000);
    const changed = structuredClone(original);
    changed.stories[0].chapters.push({ id: `${original.stories[0].id}-C02`, title: '别的第二章', text: body('并发章节'), createdAt: 1700000250000 });
    changed.stories[0].updatedAt = 1700000250000;
    assert.throws(() => bedtime.validateBedtimePlan(plan, memory, changed), { code: 'RMT_BEDTIME_SOURCE' });
    assert.deepEqual(original, firstStory());
});

testApi.test('partial projection is readable but never passes as a complete saved story', () => {
    const plan = bedtime.createBedtimePlan({ direction: '荒诞喜剧' }, memory, null, 1700000400000);
    const projected = bedtime.projectBedtimeProgress({
        segments: [{ value: { title: '值夜班的月亮', genre: '荒诞喜剧', premise: '月亮临时请假。', chapter: { title: '请假条', text: '月亮把请假条塞进了云层。' } },
            has: path => ['/title', '/genre', '/premise', '/chapter/title', '/chapter/text'].includes(path) }],
        memoryBank: memory, context: {}, previousSession: null, operation: { bedtimePlan: plan },
    });
    projected.readableProgress = { version: 1, complete: false, draftId: 'draft-1', pageId: 'bedtime' };
    assert.ok(bedtime.readableBedtimeProgressSession(projected, memory));
    assert.equal(contract.readableBedtime(projected, memory), false);
    assert.equal(projected.stories[0].chapters[0].text, '月亮把请假条塞进了云层。');
});

testApi.test('archive capacity uses the project byte ceiling without story or chapter count caps', () => {
    const session = contract.emptyBedtime(memory, 'owner-1');
    for (let storyNumber = 1; storyNumber <= 90; storyNumber += 1) {
        const id = `BED_bulk_${storyNumber}`;
        const chapterCount = storyNumber === 1 ? 99 : 1;
        const chapters = Array.from({ length: chapterCount }, (_, index) => ({
            id: `${id}-C${String(index + 1).padStart(2, '0')}`,
            title: `第 ${index + 1} 章`, text: `原文 ${index + 1}`, createdAt: storyNumber + index,
        }));
        session.stories.push({ id, title: `故事 ${storyNumber}`, genre: '自由题材', premise: '不限制篇数或章节数。',
            chapters, createdAt: storyNumber, updatedAt: storyNumber + chapterCount - 1, fiction: true });
    }
    const stored = contract.normalizeStoredBedtime(session, memory);
    assert.equal(stored.stories.length, 90);
    assert.equal(stored.stories[0].chapters.length, 99);
    const plan = bedtime.createBedtimePlan({ action: 'continue', storyId: 'BED_bulk_1' }, memory, stored, 200);
    assert.equal(plan.chapterId, 'BED_bulk_1-C100');
    assert.equal(bedtime.validateBedtimePlan(plan, memory, stored).chapterNumber, 100);
    assert.equal(constants.MAX_CACHE_DECOMPRESSED_BYTES, 12000000);
    assert.throws(() => contract.bedtimeData({ prose: '一段原文' }, 8), { code: 'RMT_BEDTIME_STRUCTURE' });
});
