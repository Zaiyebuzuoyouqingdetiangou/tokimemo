import test from 'node:test';
import assert from 'node:assert/strict';

import { MODE } from '../src/core/constants.js';
import { state as runtimeState } from '../src/core/state.js';
import { migrateCalendarSession, normalizeCalendar } from '../src/modes/calendar.js';
import {
    calendarEntryMatchesTags,
    clearCalendarTags,
    renderCalendar,
    toggleCalendarTag,
} from '../src/ui/calendarView.js';

const memoryBank = {
    archiveName: '薄明', archiveRevision: 'rev-r49-calendar', characterName: '林砚', userName: '阿澄',
    archiveSummary: '两个人仍在慢慢靠近。',
    memories: [{
        id: 'M001', date: '2026/09/01', title: '雨后同行', summary: '去年一起挂灯笼。',
        anchors: ['去年一起挂灯笼'], sourceKind: 'chat', messageStart: 1, messageEnd: 3,
    }],
};

function holidayModel(card = {}, sourceEvidence = '星降祭是当地每年的世界节日，日期为 09/09') {
    return {
        title: '两个人的日历',
        future: [{
            id: 'FEST', date: '09/09', title: '星降祭', tags: ['设定日', '活动'],
            sourceEvidence, recurring: true, occasionType: 'holiday',
        }],
        holidayCards: [{
            id: 'CARD', calendarEntryId: 'FEST', expression: 'drawing', textMode: 'none',
            motifs: ['celestial', 'spark'],
            art: { medium: 'card', palette: 'night', stroke: 'fine', flow: 'horizontal', density: 38, whitespace: 72, asymmetry: 63, visualWeight: 54 },
            ...card,
        }],
    };
}

function normalizeHoliday(model, evidence) {
    return normalizeCalendar(model, memoryBank, {
        currentDate: '2026/09/09',
        futureEvidenceText: evidence,
        holidayEvidenceText: evidence,
    });
}

function renderWithStub(session) {
    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const regenerate = { textContent: '' };
    const previousDocument = globalThis.document;
    const previousSession = runtimeState.activeSession;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="regenerate"]')) return regenerate;
            return null;
        },
    };
    runtimeState.activeSession = session;
    try {
        renderCalendar();
        return body.innerHTML;
    } finally {
        runtimeState.activeSession = previousSession;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

test.afterEach(() => {
    runtimeState.calendarTagFilters.clear();
    runtimeState.activeSession = null;
});

test('r49 holiday cards require an exact positive current-world holiday and today match', () => {
    const positive = '星降祭是当地每年的世界节日，日期为 09/09。';
    const accepted = normalizeHoliday(holidayModel(), positive);
    assert.equal(accepted.dayPages['annual:09/09'].holidayCards.length, 1);

    const noSource = normalizeHoliday(holidayModel(), '');
    assert.equal(Object.values(noSource.dayPages).flatMap(page => page.holidayCards).length, 0);

    const negated = '星降祭并不是当地世界节日，日期为 09/09。';
    const rejected = normalizeHoliday(holidayModel({}, negated), negated);
    assert.equal(Object.values(rejected.dayPages).flatMap(page => page.holidayCards).length, 0);

    const wrongDate = normalizeCalendar(holidayModel(), memoryBank, {
        currentDate: '2026/09/10', futureEvidenceText: positive, holidayEvidenceText: positive,
    });
    assert.equal(Object.values(wrongDate.dayPages).flatMap(page => page.holidayCards).length, 0);
});

test('r49 holiday prose cannot invent past celebrations and arbitrary renderer instructions are discarded', () => {
    const evidence = '星降祭是当地每年的世界节日，日期为 09/09。';
    const calendar = normalizeHoliday(holidayModel({
        expression: 'mixed', textMode: 'evidence-excerpt', message: '去年我们一起秘密结婚。',
        calligraphy: '永远记得去年', signature: '<img src=x onerror=bad()>',
        sourceMemoryIds: ['M001'], sourceMemoryAnchor: '雨后同行',
        html: '<script>bad()</script>', css: 'position:fixed', svg: '<svg onload=bad()>',
        path: 'M0 0L9 9', url: 'javascript:bad()', class: 'evil', dom: { append: true },
        art: { palette: 'night', path: 'M0 0L9 9', css: 'position:fixed', nodes: 999999 },
    }), evidence);
    const card = calendar.dayPages['annual:09/09'].holidayCards[0];
    assert.equal(card.expression, 'drawing');
    assert.equal(card.message, '');
    assert.equal(card.calligraphy, '');
    assert.equal(card.signature, '');
    assert.deepEqual(card.sourceMemoryIds, []);
    for (const key of ['html', 'css', 'svg', 'path', 'url', 'class', 'dom']) assert.equal(key in card, false);
    assert.equal('path' in card.art, false);
    assert.equal('css' in card.art, false);
    assert.equal('nodes' in card.art, false);

    const anchored = normalizeHoliday(holidayModel({
        expression: 'text', textMode: 'evidence-excerpt', message: '去年一起挂灯笼',
        sourceMemoryIds: ['M001'], sourceMemoryAnchor: '去年一起挂灯笼', motifs: [],
    }), evidence).dayPages['annual:09/09'].holidayCards[0];
    assert.equal(anchored.message, '去年一起挂灯笼');
    assert.deepEqual(anchored.sourceMemoryIds, ['M001']);
    assert.equal(anchored.historyVerification, 'memory-anchor-excerpt');
});

test('r49 a saved holiday card renders deterministically after calendar reload with bounded local SVG', () => {
    const evidence = '星降祭是当地每年的世界节日，日期为 09/09。';
    const original = normalizeHoliday(holidayModel({ expression: 'mixed', textMode: 'present-expression', presentExpression: { wish: 'peace', tone: 'quiet' } }), evidence);
    original.selectedMonth = 'annual-09';
    original.selectedDateKey = 'annual:09/09';
    const first = renderWithStub(structuredClone(original));
    const reloaded = migrateCalendarSession(structuredClone(original), memoryBank);
    const second = renderWithStub(reloaded);
    assert.equal(second, first);
    assert.match(first, /<svg class="rmt-calendar-holiday-art"/);
    assert.doesNotMatch(first, /<script|javascript:|onerror=|onload=/i);
    assert.ok((first.match(/<(?:path|circle|ellipse|line|rect|polygon)\b/g) || []).length < 80);
});

test('r49 calendar tag filtering supports multi-select OR, clear and scoped state retention', () => {
    const entries = [
        { id: 'A', status: 'past', date: '2026/09/01', title: '见面A', tags: ['约会'] },
        { id: 'B', status: 'past', date: '2026/09/02', title: '出行B', tags: ['出行'] },
        { id: 'C', status: 'past', date: '2026/09/03', title: '工作C', tags: ['活动'] },
    ];
    assert.equal(calendarEntryMatchesTags(entries[0], new Set(['约会', '出行'])), true);
    assert.equal(calendarEntryMatchesTags(entries[1], new Set(['约会', '出行'])), true);
    assert.equal(calendarEntryMatchesTags(entries[2], new Set(['约会', '出行'])), false);
    const session = {
        kind: MODE.CALENDAR, calendarVersion: 6, chatId: 'tag-chat', archiveRevision: 'tag-rev', title: '标签日历',
        entries, selectedMonth: '2026-09', selectedDateKey: 'date:2026/09/01',
        dayPages: Object.fromEntries(entries.map(entry => [`date:${entry.date}`, {
            key: `date:${entry.date}`, kind: 'date', date: entry.date, entryIds: [entry.id],
            drafts: [], stickyNotes: [], moodNotes: [], holidayCards: [], manualTodos: [],
        }])),
    };
    const body = { innerHTML: '' };
    const previousDocument = globalThis.document;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return { textContent: '' };
            if (selector.includes('[data-rmt-action="regenerate"]')) return { textContent: '' };
            return null;
        },
    };
    runtimeState.activeSession = session;
    try {
        renderCalendar();
        toggleCalendarTag('约会');
        assert.match(body.innerHTML, /见面A/);
        assert.doesNotMatch(body.innerHTML, /出行B|工作C/);
        assert.equal(runtimeState.calendarTagFilters.size, 1);
        renderCalendar();
        assert.match(body.innerHTML, /已显示命中任一标签的 1 项/);

        toggleCalendarTag('出行');
        assert.match(body.innerHTML, /见面A|出行B/);
        assert.doesNotMatch(body.innerHTML, /工作C/);
        assert.match(body.innerHTML, /已显示命中任一标签的 2 项/);
        clearCalendarTags();
        assert.equal(runtimeState.calendarTagFilters.size, 0);
        assert.match(body.innerHTML, /工作C/);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r49 calendar ignores poisoned cached status class tokens at the final renderer', () => {
    const status = 'past injected-token"><img src=x onerror=alert(1)>';
    const entry = { id: 'POISON', status, date: '2026/09/06', title: '普通事项', tags: [] };
    const html = renderWithStub({
        kind: MODE.CALENDAR,
        calendarVersion: 6,
        chatId: 'poisoned-status-chat',
        archiveRevision: 'poisoned-status-rev',
        title: '日历',
        entries: [entry],
        selectedMonth: '2026-09',
        selectedDateKey: 'date:2026/09/06',
        dayPages: {
            'date:2026/09/06': {
                key: 'date:2026/09/06', kind: 'date', date: '2026/09/06', entryIds: ['POISON'],
                drafts: [], stickyNotes: [], moodNotes: [], holidayCards: [], manualTodos: [],
            },
        },
    });
    assert.doesNotMatch(html, /injected-token|<img\s|onerror=/i);
    assert.match(html, /rmt-calendar-selected-chip future/);
});

test('r49 legacy daily memo and todo collections remain isolated by date after migration', () => {
    const legacy = {
        kind: MODE.CALENDAR, calendarVersion: 5, chatId: 'daily-chat', archiveRevision: memoryBank.archiveRevision,
        entries: [
            { id: 'A', status: 'past', date: '2026/09/01', title: '第一天', tags: [] },
            { id: 'B', status: 'past', date: '2026/09/02', title: '第二天', tags: [] },
        ],
        dayPages: {
            'date:2026/09/01': { key: 'date:2026/09/01', entryIds: ['A'], drafts: [{ text: '第一天草稿' }], manualTodos: [{ title: '第一天待办' }], stickyNotes: [], moodNotes: [] },
            'date:2026/09/02': { key: 'date:2026/09/02', entryIds: ['B'], drafts: [{ text: '第二天草稿' }], manualTodos: [{ title: '第二天待办' }], stickyNotes: [], moodNotes: [] },
        },
    };
    const migrated = migrateCalendarSession(legacy, memoryBank);
    assert.deepEqual(migrated.dayPages['date:2026/09/01'].drafts.map(item => item.text), ['第一天草稿']);
    assert.deepEqual(migrated.dayPages['date:2026/09/02'].drafts.map(item => item.text), ['第二天草稿']);
    assert.deepEqual(migrated.dayPages['date:2026/09/01'].manualTodos.map(item => item.title), ['第一天待办']);
    assert.deepEqual(migrated.dayPages['date:2026/09/02'].manualTodos.map(item => item.title), ['第二天待办']);
});
