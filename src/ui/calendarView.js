// Heartbeat Memories r40.2 private-calendar / notebook view.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
import * as modes_calendar from '../modes/calendar.js';
import * as ui_overlay from './overlay.js';

const STATUS_META = Object.freeze({
    past: { label: '已经发生', short: '已发生', dot: 'past' },
    promised: { label: '已经约好', short: '约定', dot: 'promised' },
    future: { label: '设定日期', short: '设定', dot: 'future' },
});

function parseMonthKey(value) {
    const match = String(value || '').match(/^(?:(\d{4})|(annual))-(0[1-9]|1[0-2])$/);
    if (!match) return null;
    return { year: match[1] ? Number(match[1]) : 0, annual: !!match[2], month: Number(match[3]), mm: match[3] };
}

function monthLabel(value) {
    const info = parseMonthKey(value);
    if (!info) return '未选择月份';
    return info.year ? `${info.year}年 ${info.month}月` : `${info.month}月 · 每年`;
}

function monthDays(info) {
    if (!info) return 31;
    const year = info.year || 2000;
    return new Date(Date.UTC(year, info.month, 0)).getUTCDate();
}

function firstWeekdayOffset(info) {
    if (!info || !info.year) return 0;
    const sundayFirst = new Date(Date.UTC(info.year, info.month - 1, 1)).getUTCDay();
    return (sundayFirst + 6) % 7;
}

function shiftMonthKey(value, delta) {
    const info = parseMonthKey(value);
    if (!info) return '';
    if (!info.year) {
        const next = ((info.month - 1 + Number(delta || 0)) % 12 + 12) % 12 + 1;
        return `annual-${String(next).padStart(2, '0')}`;
    }
    const date = new Date(Date.UTC(info.year, info.month - 1 + Number(delta || 0), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function availableMonthKeys(entries, dayPages = {}) {
    const full = new Set();
    const annual = new Set();
    for (const item of Array.isArray(entries) ? entries : []) {
        const key = modes_calendar.calendarMonthKey(item);
        if (!key) continue;
        if (key.startsWith('annual-')) annual.add(key);
        else full.add(key);
    }
    for (const [pageKey, page] of Object.entries(dayPages && typeof dayPages === 'object' ? dayPages : {})) {
        if (!pageHasNotebookContent(page)) continue;
        if (pageKey.startsWith('date:')) {
            const parsed = modes_calendar.normalizeCalendarDate(pageKey.slice(5));
            if (parsed?.hasYear) full.add(`${parsed.year}-${String(parsed.month).padStart(2, '0')}`);
        } else if (pageKey.startsWith('annual:')) {
            const parsed = modes_calendar.normalizeCalendarDate(pageKey.slice(7));
            if (parsed) annual.add(`annual-${String(parsed.month).padStart(2, '0')}`);
        }
    }
    return [
        ...[...full].sort(),
        ...[...annual].sort(),
    ];
}

function dateValueForCell(monthKey, day) {
    const info = parseMonthKey(monthKey);
    if (!info) return '';
    const dd = String(day).padStart(2, '0');
    return info.year ? `${info.year}/${info.mm}/${dd}` : `${info.mm}/${dd}`;
}

function pageKeyForCell(monthKey, day) {
    return modes_calendar.calendarPageKeyForDate(dateValueForCell(monthKey, day));
}

function entriesForCell(entries, monthKey, dateValue) {
    return (Array.isArray(entries) ? entries : []).filter(item => modes_calendar.calendarDateKeyForMonth(item, monthKey) === dateValue);
}

function pageEntries(session, pageKey) {
    const page = modes_calendar.calendarDayPage(session, pageKey);
    if (!page) return [];
    const ids = new Set(Array.isArray(page.entryIds) ? page.entryIds : []);
    return (Array.isArray(session?.entries) ? session.entries : []).filter(item =>
        ids.has(item?.id) && modes_calendar.calendarEntryPageKey(item) === pageKey
    );
}

function pageHasNotebookContent(page) {
    return !!page && [page.entryIds, page.drafts, page.stickyNotes, page.moodNotes, page.manualTodos]
        .some(list => Array.isArray(list) && list.length > 0);
}

function pageKeyMatchesMonth(pageKey, monthKey) {
    const info = parseMonthKey(monthKey);
    const key = core_text.normalizeText(pageKey, 160);
    if (!info || !key) return false;
    if (key === modes_calendar.CALENDAR_LEGACY_PAGE_KEY || key.startsWith('pending:')) return true;
    if (key.startsWith('date:')) {
        const parsed = modes_calendar.normalizeCalendarDate(key.slice(5));
        return !!parsed?.hasYear && info.year === parsed.year && info.month === parsed.month;
    }
    if (key.startsWith('annual:')) {
        const parsed = modes_calendar.normalizeCalendarDate(key.slice(7));
        return !!parsed && info.month === parsed.month;
    }
    return false;
}

function preferredPageKeyForCell(session, monthKey, day, dayEntries) {
    const directKey = pageKeyForCell(monthKey, day);
    if (modes_calendar.calendarDayPage(session, directKey)) return directKey;
    const info = parseMonthKey(monthKey);
    if (info?.year) {
        const annualKey = (Array.isArray(dayEntries) ? dayEntries : [])
            .map(item => modes_calendar.calendarEntryPageKey(item))
            .find(key => key.startsWith('annual:') && modes_calendar.calendarDayPage(session, key));
        if (annualKey) return annualKey;
    }
    return directKey;
}

function defaultPageKeyForMonth(session, monthKey, entries) {
    const info = parseMonthKey(monthKey);
    if (!info) return '';
    for (let day = 1; day <= monthDays(info); day += 1) {
        const dateValue = dateValueForCell(monthKey, day);
        const dayEntries = entriesForCell(entries, monthKey, dateValue);
        if (dayEntries.length) return preferredPageKeyForCell(session, monthKey, day, dayEntries);
    }
    for (let day = 1; day <= monthDays(info); day += 1) {
        const key = pageKeyForCell(monthKey, day);
        if (pageHasNotebookContent(modes_calendar.calendarDayPage(session, key))) return key;
    }
    return pageKeyForCell(monthKey, 1);
}

function pageLabel(pageKey, entries) {
    const key = core_text.normalizeText(pageKey, 160);
    if (key === modes_calendar.CALENDAR_LEGACY_PAGE_KEY) return '旧版未归日期';
    if (key.startsWith('pending:')) {
        const pending = (Array.isArray(entries) ? entries : []).find(item => modes_calendar.calendarEntryPageKey(item) === key);
        return pending?.title ? `日期待定 · ${pending.title}` : `日期待定 · ${key.slice(8)}`;
    }
    const annual = key.startsWith('annual:');
    const parsed = modes_calendar.normalizeCalendarDate(key.replace(/^(?:date|annual):/, ''));
    if (!parsed) return '这一天';
    return annual ? `${parsed.month}月${parsed.day}日 · 每年` : `${parsed.year}年${parsed.month}月${parsed.day}日`;
}

function normalizeSelectablePageKey(session, value) {
    const key = core_text.normalizeText(value, 160);
    if (!key) return '';
    if (key === modes_calendar.CALENDAR_LEGACY_PAGE_KEY) {
        return modes_calendar.calendarDayPage(session, key) ? key : '';
    }
    if (key.startsWith('pending:')) {
        const exists = !!modes_calendar.calendarDayPage(session, key)
            || (session?.entries || []).some(item => modes_calendar.calendarEntryPageKey(item) === key);
        return exists ? key : '';
    }
    if (key.startsWith('date:')) return modes_calendar.calendarPageKeyForDate(key.slice(5)) === key ? key : '';
    if (key.startsWith('annual:')) return modes_calendar.calendarPageKeyForDate(key.slice(7)) === key ? key : '';
    return '';
}

function ensureSessionDayPage(session, pageKey) {
    const key = normalizeSelectablePageKey(session, pageKey);
    if (!key) return null;
    if (!session.dayPages || typeof session.dayPages !== 'object') session.dayPages = Object.create(null);
    if (!session.dayPages[key]) session.dayPages[key] = modes_calendar.createCalendarDayPage(key);
    return session.dayPages[key] || null;
}

function shortDate(item) {
    const parsed = modes_calendar.normalizeCalendarDate(item?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return '待定';
    return parsed.hasYear ? `${parsed.month}/${parsed.day}` : `${parsed.month}/${parsed.day}`;
}

function calendarTodoRow(item, { completed = false, manual = false, pageKey = '' } = {}) {
    const marker = completed ? '✓' : '□';
    const tags = (Array.isArray(item?.tags) ? item.tags : []).slice(0, 3).map(tag => `<span>#${core_text.esc(tag)}</span>`).join('');
    const meta = manual ? '手动待办' : shortDate(item);
    const check = manual
        ? `<button type="button" class="rmt-calendar-master-check" data-rmt-action="calendar-toggle-todo" data-rmt-calendar-page="${core_text.esc(pageKey)}" data-rmt-calendar-todo="${core_text.esc(item?.id || '')}" aria-label="${completed ? '标记为未完成' : '标记为已完成'}">${marker}</button>`
        : `<span class="rmt-calendar-master-check" aria-hidden="true">${marker}</span>`;
    return `<div class="rmt-calendar-master-todo-row ${completed ? 'done' : 'open'}">
      ${check}
      <div><b>${core_text.esc(item?.title || '未命名事项')}</b><small>${core_text.esc(meta)}${tags ? ` · ${tags}` : ''}</small></div>
    </div>`;
}

function draftCard(draft) {
    return `<article class="rmt-calendar-sticky memo">
      <span class="rmt-calendar-sticky-pin" aria-hidden="true"></span>
      <small>DATE DRAFT</small>
      <h3>草稿</h3>
      <p>${core_text.esc(draft?.text || '')}</p>
      <footer>只属于当前日期</footer>
    </article>`;
}

function stickyNoteCard(note) {
    const special = note?.kind === 'special';
    const source = note?.legacyUnassigned === true
        ? `旧版未归日期 · ${core_text.esc(note?.sourceLabel || '原日历内容')}`
        : note?.sourceType === 'setting'
        ? `${core_text.esc(note?.sourceLabel || '角色 / 世界设定')} · 设定提醒`
        : `${core_text.esc(note?.sourceLabel || '剧情档案')}${note?.sourceMemoryAnchor ? ` · ${core_text.esc(note.sourceMemoryAnchor)}` : ''}`;
    return `<article class="rmt-calendar-sticky ${special ? 'special' : 'memo'}">
      <span class="rmt-calendar-sticky-pin" aria-hidden="true"></span>
      <small>${special ? 'SPECIAL NOTE' : 'STICKY NOTE'}</small>
      <h3>${core_text.esc(note?.title || (special ? '特别备注' : '便签'))}</h3>
      <p>${core_text.esc(note?.text || '')}</p>
      <footer>${source}</footer>
    </article>`;
}

function moodNoteCard(note) {
    const date = note?.date ? core_text.esc(note.date) : '';
    const source = note?.legacyUnassigned === true
        ? `旧版未归日期 · ${core_text.esc(note?.sourceLabel || '角色随笔')}`
        : `${core_text.esc(note?.sourceLabel || '剧情档案 · 角色随笔')}${note?.sourceMemoryAnchor ? ` · ${core_text.esc(note.sourceMemoryAnchor)}` : ''}`;
    return `<article class="rmt-calendar-mood-note">
      <span class="rmt-calendar-mood-mark">〝</span>
      <p>${core_text.esc(note?.text || '')}</p>
      <footer>${date ? `<b>${date}</b>` : ''}<small>${source}</small></footer>
    </article>`;
}

function selectedDayStrip(label, entries) {
    const chips = entries.length ? entries.map(item => {
        const meta = STATUS_META[item?.status] || STATUS_META.future;
        const marker = item?.status === 'past' ? '✓' : item?.status === 'promised' ? '□' : '◌';
        return `<span class="rmt-calendar-selected-chip ${core_text.esc(meta.dot)}"><i>${marker}</i>${core_text.esc(item?.title || '')}</span>`;
    }).join('') : '<span class="rmt-calendar-selected-chip">这个日期还没有圈记事项</span>';
    return `<div class="rmt-calendar-selected-strip"><b>${core_text.esc(label || '这一天')}</b><div>${chips}</div></div>`;
}

export function setCalendarStatus() {
    // Compatibility shim for r36-r39 cached DOM; r40+ no longer uses list-status filters.
    renderCalendar();
}

export function setCalendarMonth(monthKey) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    if (!parseMonthKey(monthKey)) return;
    runtimeState.activeSession.selectedMonth = String(monthKey);
    runtimeState.activeSession.selectedDateKey = '';
    renderCalendar();
}

export function shiftCalendarMonth(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    const next = shiftMonthKey(runtimeState.activeSession.selectedMonth, Number(delta) < 0 ? -1 : 1);
    if (!next) return;
    runtimeState.activeSession.selectedMonth = next;
    runtimeState.activeSession.selectedDateKey = '';
    renderCalendar();
}

export function selectCalendarDate(dateKey) {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.CALENDAR) return;
    const pageKey = normalizeSelectablePageKey(session, dateKey);
    if (!pageKey || !ensureSessionDayPage(session, pageKey)) return;
    session.selectedDateKey = pageKey;
    renderCalendar();
}

export function selectCalendarPending(entryId) {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.CALENDAR) return;
    const safeId = core_text.normalizeText(entryId, 120);
    const entry = (session.entries || []).find(item => item.date === '待定' && item.id === safeId);
    if (!entry) return;
    selectCalendarDate(modes_calendar.calendarEntryPageKey(entry));
}

export function renderCalendar() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.CALENDAR) return;
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.CALENDAR]);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    const regenerate = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="regenerate"]`);
    if (regenerate) regenerate.textContent = '刷新日历';

    const entries = Array.isArray(session.entries) ? session.entries : [];
    const monthKeys = availableMonthKeys(entries, session.dayPages);
    let selectedMonth = parseMonthKey(session.selectedMonth) ? session.selectedMonth : modes_calendar.defaultCalendarMonth(entries);
    if (!selectedMonth && monthKeys.length) selectedMonth = monthKeys[0];
    if (!selectedMonth) selectedMonth = `annual-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    session.selectedMonth = selectedMonth;
    const info = parseMonthKey(selectedMonth);

    const pendingEntries = entries.filter(item => item.status === 'promised' && item.date === '待定');
    let selectedPageKey = normalizeSelectablePageKey(session, session.selectedDateKey);
    if (!selectedPageKey || !pageKeyMatchesMonth(selectedPageKey, selectedMonth)) {
        selectedPageKey = defaultPageKeyForMonth(session, selectedMonth, entries);
    }
    const selectedPage = ensureSessionDayPage(session, selectedPageKey);
    session.selectedDateKey = selectedPage?.key || '';
    const selectedEntries = pageEntries(session, session.selectedDateKey);
    const selectedDateLabel = pageLabel(session.selectedDateKey, entries);

    const monthJump = monthKeys.map(key => `<button type="button" class="rmt-calendar-jump ${key === selectedMonth ? 'active' : ''}" data-rmt-calendar-month="${core_text.esc(key)}">${core_text.esc(monthLabel(key))}</button>`).join('');
    const weekdays = info?.year ? ['一', '二', '三', '四', '五', '六', '日'].map(day => `<span>${day}</span>`).join('') : '';
    const blanks = Array.from({ length: firstWeekdayOffset(info) }, () => '<span class="rmt-calendar-day blank" aria-hidden="true"></span>').join('');
    const cells = Array.from({ length: monthDays(info) }, (_, index) => {
        const day = index + 1;
        const dateValue = dateValueForCell(selectedMonth, day);
        const dayEntries = entriesForCell(entries, selectedMonth, dateValue);
        const pageKey = preferredPageKeyForCell(session, selectedMonth, day, dayEntries);
        const statuses = new Set(dayEntries.map(item => item.status));
        const marked = dayEntries.length > 0;
        const selected = session.selectedDateKey === pageKey;
        const first = dayEntries[0];
        const caption = first ? `${core_text.esc(first.title)}${dayEntries.length > 1 ? ` +${dayEntries.length - 1}` : ''}` : '';
        const statusDots = [...statuses].map(status => `<i class="${core_text.esc(status)}"></i>`).join('');
        const aria = marked ? `${dateValue} ${dayEntries.map(item => item.title).join('、')}` : `${dateValue} 空白日期`;
        return `<button type="button" class="rmt-calendar-day ${marked ? 'marked' : ''} ${selected ? 'selected' : ''} ${statuses.has('past') ? 'has-past' : ''} ${statuses.has('promised') ? 'has-promised' : ''} ${statuses.has('future') ? 'has-future' : ''}" data-rmt-calendar-date="${core_text.esc(pageKey)}" aria-label="${core_text.esc(aria)}">
          <span class="rmt-calendar-day-number">${day}</span>
          <span class="rmt-calendar-day-title">${caption}</span>
          <span class="rmt-calendar-day-dots">${statusDots}</span>
        </button>`;
    }).join('');

    const legacyPage = modes_calendar.calendarDayPage(session, modes_calendar.CALENDAR_LEGACY_PAGE_KEY);
    const pendingPageKeys = [...new Set([
        ...pendingEntries.map(item => modes_calendar.calendarEntryPageKey(item)),
        ...Object.entries(session.dayPages || {})
            .filter(([key, page]) => key.startsWith('pending:') && pageHasNotebookContent(page))
            .map(([key]) => key),
    ])];
    const pendingButtons = pendingPageKeys.map(key => {
        const item = pendingEntries.find(candidate => modes_calendar.calendarEntryPageKey(candidate) === key);
        const label = item?.title || `待定 · ${key.slice(8)}`;
        return `<button type="button" class="${session.selectedDateKey === key ? 'active' : ''}" data-rmt-calendar-date="${core_text.esc(key)}">${core_text.esc(label)}</button>`;
    }).join('');
    const legacyButton = pageHasNotebookContent(legacyPage)
        ? `<button type="button" class="${session.selectedDateKey === modes_calendar.CALENDAR_LEGACY_PAGE_KEY ? 'active' : ''}" data-rmt-calendar-date="${modes_calendar.CALENDAR_LEGACY_PAGE_KEY}">旧版未归日期</button>`
        : '';
    const pendingHtml = pendingButtons || legacyButton
        ? `<div class="rmt-calendar-pending"><span>特殊日期页</span><div>${pendingButtons}${legacyButton}</div></div>`
        : '';

    const page = selectedPage || { drafts: [], stickyNotes: [], moodNotes: [], manualTodos: [] };
    const drafts = Array.isArray(page.drafts) ? page.drafts : [];
    const stickyNotes = Array.isArray(page.stickyNotes) ? page.stickyNotes : [];
    const moodNotes = Array.isArray(page.moodNotes) ? page.moodNotes : [];
    const manualTodos = Array.isArray(page.manualTodos) ? page.manualTodos : [];
    const memoNotes = stickyNotes.filter(note => note?.kind !== 'special');
    const specialNotes = stickyNotes.filter(note => note?.kind === 'special');
    const promised = selectedEntries.filter(item => item.status === 'promised');
    const completedEntries = selectedEntries.filter(item => item.status === 'past');
    const manualOpen = manualTodos.filter(item => item?.completed !== true);
    const manualDone = manualTodos.filter(item => item?.completed === true);

    const memoCards = [...drafts.map(draftCard), ...memoNotes.map(stickyNoteCard)];
    const memoBoard = memoCards.length
        ? memoCards.join('')
        : '<div class="rmt-calendar-board-empty">这一天还没有草稿或便签。</div>';
    const openTodoRows = [
        ...promised.map(item => calendarTodoRow(item)),
        ...manualOpen.map(item => calendarTodoRow(item, { manual: true, pageKey: session.selectedDateKey })),
    ];
    const doneTodoRows = [
        ...completedEntries.map(item => calendarTodoRow(item, { completed: true })),
        ...manualDone.map(item => calendarTodoRow(item, { completed: true, manual: true, pageKey: session.selectedDateKey })),
    ];
    const todoBoard = openTodoRows.length
        ? openTodoRows.join('')
        : '<div class="rmt-calendar-board-empty">这一天目前没有待办。</div>';
    const doneBoard = doneTodoRows.length
        ? `<div class="rmt-calendar-done-label">这一天已划掉的</div>${doneTodoRows.join('')}`
        : '';
    const specialCards = specialNotes.length
        ? specialNotes.map(stickyNoteCard).join('')
        : '<div class="rmt-calendar-board-empty">这一天没有特别备注。</div>';
    const moodCards = moodNotes.length
        ? moodNotes.map(moodNoteCard).join('')
        : '<div class="rmt-calendar-board-empty">这一天还没有页角随笔。</div>';
    const allPromisedCount = entries.reduce((count, item) => count + (item?.status === 'promised' ? 1 : 0), 0);

    body.innerHTML = `<div class="rmt-calendar-shell rmt-calendar-v3">
      <section class="rmt-calendar-hero compact">
        <div><div class="rmt-archive-kicker">RELATIONSHIP CALENDAR</div><h2>${core_text.esc(session.title || '两个人的日历')}</h2><p>点选任意日期；每一天都有完全独立的草稿、便签、To-Do、特别备注和页角随笔，不会串到其他日期。</p></div>
        <div class="rmt-calendar-counts"><span><b>${entries.filter(item => item.status === 'past').length}</b> 已发生</span><span><b>${allPromisedCount}</b> 待办</span><span><b>${entries.filter(item => item.status === 'future').length}</b> 提醒</span></div>
      </section>

      <section class="rmt-calendar-paper">
        <header class="rmt-calendar-month-head">
          <button type="button" data-rmt-calendar-shift="-1" aria-label="上一个月">‹</button>
          <div><small>${info?.year ? 'OUR DAYS' : 'ANNUAL DATES'}</small><h3>${core_text.esc(monthLabel(selectedMonth))}</h3></div>
          <button type="button" data-rmt-calendar-shift="1" aria-label="下一个月">›</button>
        </header>
        ${monthJump ? `<div class="rmt-calendar-jumps">${monthJump}</div>` : ''}
        ${info?.year ? `<div class="rmt-calendar-weekdays">${weekdays}</div>` : ''}
        <div class="rmt-calendar-grid ${info?.year ? '' : 'annual'}">${blanks}${cells}</div>
        <div class="rmt-calendar-legend compact">
          <span><i class="past"></i>已经发生</span><span><i class="promised"></i>已经约好 · 还没发生</span><span><i class="future"></i>世界设定日期</span>
        </div>
        ${pendingHtml}
        ${selectedDayStrip(selectedDateLabel, selectedEntries)}
      </section>

      <section class="rmt-calendar-notebook-board">
        <section class="rmt-calendar-sticky-panel">
          <header><div><small>DATE DRAFTS / STICKY NOTES</small><h3>草稿与便签</h3></div><span>${drafts.length + memoNotes.length}</span></header>
          <div class="rmt-calendar-sticky-grid">${memoBoard}</div>
          <div class="rmt-calendar-detail"><textarea class="text_pole" rows="2" data-rmt-calendar-draft-input placeholder="给${core_text.esc(selectedDateLabel)}写一条草稿…"></textarea><button type="button" class="rmt-btn" data-rmt-action="calendar-add-draft" data-rmt-calendar-page="${core_text.esc(session.selectedDateKey)}">保存到这一天</button></div>
        </section>
        <section class="rmt-calendar-master-todo">
          <header><div><small>DATE TO DO LIST</small><h3>这一天的待办</h3></div><span>${promised.length + manualTodos.length}</span></header>
          <div class="rmt-calendar-master-todo-list">${todoBoard}${doneBoard}</div>
          <div class="rmt-calendar-detail"><input class="text_pole" data-rmt-calendar-todo-input placeholder="给这一天添加手动待办…"><button type="button" class="rmt-btn" data-rmt-action="calendar-add-todo" data-rmt-calendar-page="${core_text.esc(session.selectedDateKey)}">添加待办</button></div>
        </section>
      </section>

      <section class="rmt-calendar-special-notes"><header><div><small>IMPORTANT / LITTLE THINGS</small><h3>特别备注</h3></div><span>${specialNotes.length}</span></header><div>${specialCards}</div></section>
      <section class="rmt-calendar-mood-section"><header><div><small>MARGIN NOTES</small><h3>页角随笔</h3></div><span>${moodNotes.length}</span></header><div class="rmt-calendar-mood-grid">${moodCards}</div></section>
    </div>`;
}
