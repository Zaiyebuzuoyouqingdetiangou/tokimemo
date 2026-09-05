import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CALENDAR_SESSION_VERSION } from '../src/core/constants.js';
import { mergeCalendarRefresh, migrateCalendarSession, normalizeCalendar } from '../src/modes/calendar.js';
import { calendarPrompt } from '../src/generation/prompts.js';
import { renderCalendar } from '../src/ui/calendarView.js';
import { state as runtimeState } from '../src/core/state.js';

const memoryBank = {
    archiveName: '薄明',
    archiveRevision: 'rev-r48',
    characterName: '林砚',
    userName: '阿澄',
    archiveSummary: '两个人已经熟悉彼此，但表达仍然克制。',
    memories: [{ id: 'M001', date: '2026/09/01', title: '雨后同行', summary: '两个人一起回去。', anchors: ['雨后同行'] }],
};

const HOLIDAY_EVIDENCE = '星降祭是当地每年的世界节日，日期为 09/09。角色生日为 09/10。';

function normalizeHoliday(input) {
    return normalizeCalendar(input, memoryBank, {
        currentDate: '2026/09/09',
        futureEvidenceText: HOLIDAY_EVIDENCE,
        holidayEvidenceText: HOLIDAY_EVIDENCE,
    });
}

function holidayInput(card = {}) {
    return {
        title: '两个人的日历',
        future: [
            { id: 'FEST', date: '09/09', title: '星降祭', tags: ['设定日', '活动'], sourceLabel: '世界书', sourceEvidence: '星降祭是当地每年的世界节日，日期为 09/09', recurring: true, occasionType: 'holiday' },
            { id: 'BIRTH', date: '09/10', title: '角色生日', tags: ['生日'], sourceLabel: '角色卡', sourceEvidence: '角色生日为 09/10', recurring: true, occasionType: 'birthday' },
        ],
        holidayCards: [{
            id: 'CARD', calendarEntryId: 'FEST', expression: 'drawing', textMode: 'none', message: '', calligraphy: '', signature: '', motifs: ['celestial', 'spark'],
            art: { palette: 'night', stroke: 'fine', flow: 'horizontal', density: 38, whitespace: 72, asymmetry: 63, visualWeight: 54 },
            ...card,
        }],
    };
}

test('r48 holiday cards attach only to explicit world holidays and allow drawing-only expression', () => {
    const calendar = normalizeHoliday(holidayInput());
    assert.equal(calendar.calendarVersion, CALENDAR_SESSION_VERSION);
    assert.equal(CALENDAR_SESSION_VERSION, 6);
    const page = calendar.dayPages['annual:09/09'];
    assert.equal(page.holidayCards.length, 1);
    assert.equal(page.holidayCards[0].expression, 'drawing');
    assert.equal(page.holidayCards[0].message, '');
    assert.deepEqual(page.holidayCards[0].motifs, ['celestial', 'spark']);
    assert.equal(calendar.dayPages['annual:09/10'].holidayCards.length, 0);

    const rejected = normalizeHoliday(holidayInput({ calendarEntryId: 'BIRTH' }));
    assert.equal(Object.values(rejected.dayPages).flatMap(item => item.holidayCards).length, 0);
});

test('r48 holiday cards allow writing-only output and discard arbitrary visual/code fields', () => {
    const calendar = normalizeHoliday(holidayInput({
        expression: 'writing', textMode: 'present-expression', presentExpression: { wish: 'peace', tone: 'quiet' }, calligraphy: '会被忽略', motifs: [], html: '<script>bad()</script>', svg: '<svg onload=bad()>', url: 'javascript:bad()',
        art: { palette: 'not-a-palette', stroke: 'not-a-stroke', flow: 'vertical', density: 999, whitespace: -5, asymmetry: 40, visualWeight: 55, css: 'position:fixed' },
    }));
    const card = calendar.dayPages['annual:09/09'].holidayCards[0];
    assert.equal(card.calligraphy, '平安');
    assert.equal(card.art.palette, 'paper');
    assert.equal(card.art.stroke, 'fine');
    assert.equal(card.art.flow, 'vertical');
    assert.equal(card.art.density, 100);
    assert.equal(card.art.whitespace, 0);
    assert.equal('html' in card, false);
    assert.equal('svg' in card, false);
    assert.equal('url' in card, false);
    assert.equal('css' in card.art, false);
});

test('r48 v5 calendar migration preserves date-owned content and adds holiday card collection', () => {
    const legacy = {
        kind: 'calendar', calendarVersion: 5, title: '旧日历',
        entries: [{ id: 'P1', status: 'past', date: '2026/09/01', title: '雨后同行', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '雨后同行' }],
        dayPages: {
            'date:2026/09/01': {
                key: 'date:2026/09/01', kind: 'date', date: '2026/09/01', entryIds: ['P1'],
                drafts: [{ id: 'D1', text: '原来的草稿' }], stickyNotes: [], moodNotes: [], manualTodos: [{ id: 'T1', title: '原来的待办' }],
            },
        },
        selectedMonth: '2026-09', selectedDateKey: 'date:2026/09/01',
    };
    const migrated = migrateCalendarSession(legacy, memoryBank);
    assert.equal(migrated.calendarVersion, 6);
    assert.equal(migrated.dayPages['date:2026/09/01'].drafts[0].text, '原来的草稿');
    assert.equal(migrated.dayPages['date:2026/09/01'].manualTodos[0].title, '原来的待办');
    assert.deepEqual(migrated.dayPages['date:2026/09/01'].holidayCards, []);
});

test('r48 calendar refresh keeps an existing holiday card when generation omits it and replaces it when a fresh card arrives', () => {
    const previous = normalizeHoliday(holidayInput({ expression: 'writing', textMode: 'present-expression', presentExpression: { wish: 'peace' }, motifs: [] }));
    const withoutCard = normalizeHoliday({ ...holidayInput(), holidayCards: [] });
    const kept = mergeCalendarRefresh(previous, withoutCard, memoryBank);
    assert.equal(kept.dayPages['annual:09/09'].holidayCards[0].calligraphy, '平安');

    const fresh = normalizeHoliday(holidayInput({ expression: 'writing', textMode: 'present-expression', presentExpression: { wish: 'joy' }, motifs: [] }));
    const replaced = mergeCalendarRefresh(previous, fresh, memoryBank);
    assert.equal(replaced.dayPages['annual:09/09'].holidayCards[0].calligraphy, '快乐');
});

test('r48 calendar prompt requires structured non-template card art direction without executable markup', () => {
    const prompt = calendarPrompt({ name1: '阿澄', name2: '林砚' }, memoryBank);
    assert.match(prompt, /holidayCards：节日贺卡/);
    assert.match(prompt, /不要选择模板编号/);
    assert.match(prompt, /文字、图画、书写、图文结合或极简/);
    assert.match(prompt, /present-expression/);
    assert.match(prompt, /evidence-excerpt/);
    assert.match(prompt, /禁止输出 HTML、CSS、JavaScript、SVG、path、URL/);
    assert.match(prompt, /occasionType="holiday"/);
});

test('r48 calendar renderer builds local SVG, relationship-gates prose and ignores executable markup', () => {
    const calendar = normalizeHoliday(holidayInput({ expression: 'mixed', textMode: 'present-expression', presentExpression: { emotion: 'love', wish: 'peace', tone: 'direct' }, message: '<img src=x onerror=bad()>', calligraphy: '星夜', signature: '<script>bad()</script>' }));
    calendar.selectedMonth = 'annual-09';
    calendar.selectedDateKey = 'annual:09/09';
    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const regen = { textContent: '' };
    const previousDocument = globalThis.document;
    const previousSession = runtimeState.activeSession;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="regenerate"]')) return regen;
            return null;
        },
    };
    runtimeState.activeSession = calendar;
    try {
        renderCalendar();
        assert.match(body.innerHTML, /rmt-calendar-holiday-card/);
        assert.match(body.innerHTML, /<svg class="rmt-calendar-holiday-art"/);
        assert.match(body.innerHTML, /平安/);
        assert.doesNotMatch(body.innerHTML, /我爱你/);
        assert.doesNotMatch(body.innerHTML, /&lt;img src=x onerror=bad\(\)&gt;/);
        assert.doesNotMatch(body.innerHTML, /<img src=x onerror=bad\(\)>/);
        assert.doesNotMatch(body.innerHTML, /<script|javascript:/i);
    } finally {
        runtimeState.activeSession = previousSession;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r48 writing-only card stays visually writing-only when no motifs are requested', () => {
    const calendar = normalizeHoliday(holidayInput({ expression: 'writing', textMode: 'present-expression', presentExpression: { wish: 'peace' }, message: '', calligraphy: '', signature: '', motifs: [], art: { medium: 'scroll', palette: 'paper', stroke: 'dry', flow: 'vertical', density: 80, whitespace: 70, asymmetry: 40, visualWeight: 60 } }));
    calendar.selectedMonth = 'annual-09';
    calendar.selectedDateKey = 'annual:09/09';
    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const regen = { textContent: '' };
    const previousDocument = globalThis.document;
    const previousSession = runtimeState.activeSession;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="regenerate"]')) return regen;
            return null;
        },
    };
    runtimeState.activeSession = calendar;
    try {
        renderCalendar();
        assert.match(body.innerHTML, /data-medium="scroll"/);
        assert.match(body.innerHTML, /平安/);
        assert.doesNotMatch(body.innerHTML, /<path|<ellipse|<circle/);
    } finally {
        runtimeState.activeSession = previousSession;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r49 minimal holiday card keeps intentional whitespace without invented decoration or extra copy', () => {
    const calendar = normalizeHoliday(holidayInput({
        expression: 'minimal', textMode: 'present-expression', presentExpression: { wish: 'peace', tone: 'quiet' },
        message: '不应采用的自由正文', calligraphy: '不应采用的自由题字', signature: '不应采用的自由落款', sign: false,
        motifs: [], art: { medium: 'paper', palette: 'paper', stroke: 'fine', flow: 'horizontal', density: 100, whitespace: 94, asymmetry: 50, visualWeight: 30 },
    }));
    calendar.selectedMonth = 'annual-09';
    calendar.selectedDateKey = 'annual:09/09';
    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const regen = { textContent: '' };
    const previousDocument = globalThis.document;
    const previousSession = runtimeState.activeSession;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="regenerate"]')) return regen;
            return null;
        },
    };
    runtimeState.activeSession = calendar;
    try {
        renderCalendar();
        const article = body.innerHTML.match(/<article class="rmt-calendar-holiday-card minimal"[\s\S]*?<\/article>/u)?.[0] || '';
        assert.ok(article);
        assert.match(article, />平安<\/div>/u);
        assert.doesNotMatch(article, /rmt-calendar-holiday-message|rmt-calendar-holiday-signature/u);
        assert.doesNotMatch(article, /<(?:path|ellipse|circle)\b/u);
        assert.doesNotMatch(article, /不应采用|✦|★|☆/u);
    } finally {
        runtimeState.activeSession = previousSession;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r48 calendar UI keeps the holiday card compact and does not add a tutorial block', async () => {
    const view = await readFile(new URL('../src/ui/calendarView.js', import.meta.url), 'utf8');
    assert.match(view, /HOLIDAY CARD/);
    assert.match(view, /rmt-calendar-card-mark/);
    assert.doesNotMatch(view, /什么是节日贺卡|这个功能怎么玩|生成原理|世界观判定说明/);
});
