import assert from 'node:assert/strict';
import { calendarPrintContentFromRoot, calendarPrintDocument, calendarPrintNoteHtml,
    calendarPrintSelectionFromPanel, calendarPrintSelectionPanelHtml, normalizeCalendarPrintSelection, printCalendarSelection } from '../src/ui/calendarPrint.js';

const documentHtml = calendarPrintDocument({
    title: '<手帐>', label: '2026年9月23日', contentHtml: '<section class="rmt-calendar-shell"><svg viewBox="0 0 2 1"></svg><img src="data:image/png;base64,AA=="></section>',
});
assert.match(documentHtml, /<title>&lt;手帐&gt; · 2026年9月23日<\/title>/);
assert.match(documentHtml, /@page\{size:auto;margin:12mm\}/);
assert.match(documentHtml, /Microsoft YaHei/);
assert.match(documentHtml, /width:auto;max-width:100%;height:auto;object-fit:contain/);
assert.match(documentHtml, /svg\.rmt-calendar-holiday-art\{display:block;width:100%;max-width:100%;height:auto;aspect-ratio:auto\}/);
assert.match(documentHtml, /white-space:pre-wrap/);
assert.match(documentHtml, /data-rmt-calendar-print-manual/);
assert.match(documentHtml, /<svg viewBox="0 0 2 1"><\/svg>/);
assert.equal(printCalendarSelection({ root: null }).reason, 'print-source-unavailable');

const selectionPanel = calendarPrintSelectionPanelHtml({ counts: { calendar: 1, memos: 2, todos: 1, special: 1, mood: 1, holiday: 1 }, imageCount: 1 });
assert.match(selectionPanel, /选择本次导出内容/);
assert.equal((selectionPanel.match(/data-rmt-calendar-export-choice checked/g) || []).length, 6);
assert.match(selectionPanel, /本次附言（仅加入导出稿）/);
assert.deepEqual(normalizeCalendarPrintSelection({ blocks: ['memos', 'unknown', 'memos'], includeImages: false, note: '中文\n换行' }),
    { blocks: ['memos'], includeImages: false, note: '中文\n换行' });
assert.deepEqual(calendarPrintSelectionFromPanel({
    querySelectorAll: () => [{ checked: true, disabled: false, value: 'memos' }, { checked: false, disabled: false, value: 'todos' }],
    querySelector: selector => selector.includes('images') ? { checked: false } : { value: '本次中文附言\n第二行' },
}), { blocks: ['memos'], includeImages: false, note: '本次中文附言\n第二行' });
assert.equal(calendarPrintNoteHtml('甲\n乙<script>'), '<section class="rmt-calendar-print-note"><small>本次导出附言</small><p>甲\n乙&lt;script&gt;</p></section>');

function selectableRoot() {
    const removed = new Set();
    const blocks = ['calendar', 'holiday', 'memos', 'todos', 'special', 'mood'];
    const blockNodes = blocks.map(key => ({
        key,
        getAttribute(name) { return name === 'data-rmt-calendar-export-block' ? key : ''; },
        remove() { removed.add(key); },
    }));
    const group = { remove() { removed.add('group'); }, querySelector() {
        return removed.has('memos') && removed.has('todos') ? null : {};
    } };
    const image = { remove() { removed.add('image'); } };
    let suffix = '';
    const clone = {
        querySelectorAll(selector) {
            if (selector === '[data-rmt-calendar-export-block]') return blockNodes;
            if (selector === '[data-rmt-calendar-export-group]') return [group];
            if (selector === 'img, svg, picture') return [image];
            return [];
        },
        insertAdjacentHTML(_position, html) { suffix += html; },
        get outerHTML() {
            const content = blocks.filter(key => !removed.has(key)).map(key => `<section>${key.toUpperCase()}</section>`).join('');
            return `<main>${content}${removed.has('image') ? '' : '<svg viewBox="0 0 12 7"></svg>'}${suffix}</main>`;
        },
    };
    return { ownerDocument: { createElement() { return {}; } }, cloneNode() { return clone; }, querySelectorAll() { return []; } };
}

const longNote = `中文第一行\n第二行 & <安全>${'长内容'.repeat(6000)}结尾标记`;
const selectedHtml = calendarPrintContentFromRoot(selectableRoot(), { blocks: ['memos'], includeImages: false, note: longNote });
assert.match(selectedHtml, /MEMOS/);
for (const excluded of ['CALENDAR', 'HOLIDAY', 'TODOS', 'SPECIAL', 'MOOD']) assert.doesNotMatch(selectedHtml, new RegExp(excluded));
assert.doesNotMatch(selectedHtml, /<svg/);
assert.match(selectedHtml, /中文第一行\n第二行 &amp; &lt;安全&gt;/);
assert.match(selectedHtml, /结尾标记/);

const written = [];
let printed = 0;
const fakePopup = {
    document: { readyState: 'complete', open() {}, write(value) { written.push(value); }, close() {}, querySelector() { return null; } },
    addEventListener() {}, focus() {}, print() { printed += 1; },
};
const fakeRoot = {
    ownerDocument: { createElement() { return { className: '', innerHTML: '' }; } },
    cloneNode() { return { querySelectorAll() { return []; }, outerHTML: '<section class="rmt-calendar-shell">已保存内容</section>' }; },
    querySelectorAll() { return []; },
};
const result = printCalendarSelection({ session: { title: '小手帐' }, label: '当前日期', root: fakeRoot, opener: { open() { return fakePopup; } } });
assert.equal(result.opened, true);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(printed, 1);
assert.match(written[0], /小手帐/);

const status = { textContent: '' };
const manual = { hidden: true, addEventListener(_event, handler) { this.handler = handler; } };
const failedPopup = {
    document: { readyState: 'complete', open() {}, write() {}, close() {}, querySelector(selector) { return selector.includes('status') ? status : manual; } },
    addEventListener() {}, focus() {}, print() { throw new Error('print denied'); },
};
printCalendarSelection({ session: { title: '手帐' }, root: fakeRoot, opener: { open() { return failedPopup; } } });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(manual.hidden, false);
assert.match(status.textContent, /自动打开打印失败/);

const previousFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls += 1; throw new Error('printing must stay local'); };
printCalendarSelection({ session: { title: '离线手帐' }, root: fakeRoot, selection: { blocks: ['calendar'], includeImages: false }, opener: { open() { return fakePopup; } } });
await new Promise(resolve => setTimeout(resolve, 0));
globalThis.fetch = previousFetch;
assert.equal(networkCalls, 0);
console.log('calendar-print-ok');
