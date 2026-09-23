import * as assert from 'node:assert/strict';
import * as testApi from 'node:test';
import * as contract from '../src/core/bedtimeContract.js';
import * as view from '../src/ui/bedtimeView.js';

const memory = { chatId: 'chat', archiveRevision: 'rev', characterName: '甲', userName: '乙' };
const session = contract.emptyBedtime(memory, 'owner');
session.stories.push({
    id: 'BED_story', title: '<img src=x onerror=alert(1)>', genre: '都市悬疑', premise: '一封没有寄件人的信。',
    chapters: [
        { id: 'BED_story-C01', title: '第一封信', text: '正文一\n\n第二段', createdAt: 1 },
        { id: 'BED_story-C02', title: '空房间', text: '正文二', createdAt: 2 },
    ], createdAt: 1, updatedAt: 2, fiction: true,
});
session.selectedId = 'BED_story'; session.view = 'story'; session.chapterIndex = 1;

testApi.test('reader escapes model text and renders local chapter navigation', () => {
    const html = view.bedtimeHtml(session);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /空房间/);
    assert.match(html, /2 \/ 2/);
    assert.match(html, /data-rmt-bedtime="continue"/);
    assert.match(html, /追加下一章/);
});

testApi.test('library is an independent entry with concise new-or-continue guidance', () => {
    const library = structuredClone(session); library.view = 'library';
    const html = view.bedtimeHtml(library);
    assert.match(html, /写一个新故事/);
    assert.match(html, /写一个新故事，或接着喜欢的故事读下一章。/);
    assert.match(html, /data-rmt-bedtime="open"/);
    assert.match(html, /已保存 1 篇/);
});

testApi.test('unfinished chapter stays readable and continuation is disabled until recovery completes', () => {
    const partial = structuredClone(session);
    partial.stories[0].chapters[1].generationIncomplete = true;
    partial.readableProgress = { version: 1, complete: false, draftId: 'draft' };
    const html = view.bedtimeHtml(partial);
    assert.match(html, /这一章尚未完成/);
    assert.match(html, /data-rmt-bedtime="continue"[^>]* disabled/);
    assert.match(html, /正文二/);
});

testApi.test('read-only archive has no generation controls', () => {
    const html = view.bedtimeHtml(session, { locked: true });
    assert.doesNotMatch(html, /data-rmt-bedtime="(?:new|continue)"/);
    assert.match(html, /只读/);
});
