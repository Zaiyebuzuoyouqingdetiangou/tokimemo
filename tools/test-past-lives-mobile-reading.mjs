import assert from 'node:assert/strict';
import test from 'node:test';
import * as view from '../src/ui/pastLivesView.js';
import * as mobileReading from '../src/ui/pastLivesReading.css.js';

const session = {
    kind: 'pastLives', version: 1, chatId: 'preview', archiveRevision: 'preview-v1', ownerKey: 'preview-owner',
    characterName: '岚', userName: '你', title: '雨灯旧信', presentation: 'modern', selectedId: 'PL01',
    selectedEntryId: 'D01', selectedKey: 'D01-C01', view: 'dossier', pastLivesReadMask: '1', pastLivesDrawn: true,
    pastLivesClosing: false,
    episodes: [{
        id: 'PL01', fiction: true, presentation: 'modern', title: '雨灯旧信',
        opening: { title: '潮湿的信封', motif: '窗边的一盏灯', text: '雨停得很慢。\n\n信封还带着掌心的温度。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '窗边的票根' },
        dossiers: [{ id: 'D01', title: '没有寄出的那一页', era: '旧城的雨季', synopsis: '这是一段保留在卷宗里的虚构故事。\n\n正文按原样阅读，不需要完成探索。', clues: [
            { id: 'D01-C01', kind: 'object', title: '褪色票根', speaker: 'narrator', text: '票根夹在书页里，边缘已经起毛。', revealedText: '' },
            { id: 'D01-C02', kind: 'missing', title: '背面的字', speaker: 'char', text: '有一行字被雨水晕开。', revealedText: '雨停之后，灯还亮着。' },
        ] }],
        echoes: [{ id: 'E01', kind: 'memory', title: '窗边的票根', text: '窗边的票根', reflection: '这一刻仍可由两人自己选择。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '窗边的票根' }],
        annotations: [{ id: 'A01', afterClueIds: [], text: '这不是命定的答案，只是虚构卷宗的一处旁批。' }],
        closing: { text: '故事停在这里，今生仍可继续书写。', signature: '岚' },
    }],
};

test('mobile reading rules keep prose full-size, single-column, and outside nested scroll regions', () => {
    const css = mobileReading.pastLivesReadingCss('#fixture');
    assert.match(css, /@media\(max-width:600px\)/);
    assert.match(css, /\.rmt-past-clues\{grid-template-columns:1fr/);
    assert.match(css, /font-size:16px!important;line-height:1\.9!important/);
    assert.match(css, /rmt-past-lives,.rmt-past-reader,.rmt-past-main,.rmt-past-margin\)\{max-height:none!important;overflow:visible!important/);
    assert.match(css, /\.rmt-past-tabs\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(view.pastLivesCss('#fixture'), /@media\(max-width:600px\)/);
});

test('reader markup preserves the saved story and exposes all local reading actions', () => {
    const html = view.pastLivesHtml(session, { readOnly: true });
    for (const savedText of ['雨灯旧信', '正文按原样阅读，不需要完成探索。', '褪色票根', '票根夹在书页里，边缘已经起毛。']) assert.match(html, new RegExp(savedText));
    assert.match(html, /data-rmt-past-lives="clue"/);
    assert.match(html, /data-rmt-past-lives="read-all"/);
    assert.doesNotMatch(html, /正在续写篇章/);
});
