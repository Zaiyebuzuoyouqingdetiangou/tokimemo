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

function availableMonthKeys(entries) {
    const full = new Set();
    const annual = new Set();
    for (const item of Array.isArray(entries) ? entries : []) {
        const key = modes_calendar.calendarMonthKey(item);
        if (!key) continue;
        if (key.startsWith('annual-')) annual.add(key);
        else full.add(key);
    }
    const representedMonths = new Set([...full].map(key => key.slice(-2)));
    return [
        ...[...full].sort(),
        ...[...annual].filter(key => !representedMonths.has(key.slice(-2))).sort(),
    ];
}

function dateKeyForCell(monthKey, day) {
    const info = parseMonthKey(monthKey);
    if (!info) return '';
    const dd = String(day).padStart(2, '0');
    return info.year ? `${info.year}/${info.mm}/${dd}` : `${info.mm}/${dd}`;
}

function entriesForDateKey(entries, monthKey, dateKey) {
    return (Array.isArray(entries) ? entries : []).filter(item => modes_calendar.calendarDateKeyForMonth(item, monthKey) === dateKey);
}

function selectedPendingEntry(entries, selectedDateKey) {
    const match = String(selectedDateKey || '').match(/^pending:(.+)$/);
    if (!match) return null;
    return (Array.isArray(entries) ? entries : []).find(item => item.date === '待定' && item.id === match[1]) || null;
}

function shortDate(item) {
    const parsed = modes_calendar.normalizeCalendarDate(item?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return '待定';
    return parsed.hasYear ? `${parsed.month}/${parsed.day}` : `${parsed.month}/${parsed.day}`;
}

function calendarTodoRow(item, { completed = false } = {}) {
    const marker = completed ? '✓' : '□';
    const tags = (Array.isArray(item?.tags) ? item.tags : []).slice(0, 3).map(tag => `<span>#${core_text.esc(tag)}</span>`).join('');
    return `<div class="rmt-calendar-master-todo-row ${completed ? 'done' : 'open'}">
      <span class="rmt-calendar-master-check" aria-hidden="true">${marker}</span>
      <div><b>${core_text.esc(item?.title || '未命名事项')}</b><small>${core_text.esc(shortDate(item))}${tags ? ` · ${tags}` : ''}</small></div>
    </div>`;
}

function stickyNoteCard(note) {
    const special = note?.kind === 'special';
    const source = note?.sourceType === 'setting'
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
    const source = `${core_text.esc(note?.sourceLabel || '剧情档案 · 角色随笔')}${note?.sourceMemoryAnchor ? ` · ${core_text.esc(note.sourceMemoryAnchor)}` : ''}`;
    return `<article class="rmt-calendar-mood-note">
      <span class="rmt-calendar-mood-mark">〝</span>
      <p>${core_text.esc(note?.text || '')}</p>
      <footer>${date ? `<b>${date}</b>` : ''}<small>${source}</small></footer>
    </article>`;
}

function selectedDayStrip(label, entries) {
    if (!entries.length) return '';
    const chips = entries.map(item => {
        const meta = STATUS_META[item?.status] || STATUS_META.future;
        const marker = item?.status === 'past' ? '✓' : item?.status === 'promised' ? '□' : '◌';
        return `<span class="rmt-calendar-selected-chip ${core_text.esc(meta.dot)}"><i>${marker}</i>${core_text.esc(item?.title || '')}</span>`;
    }).join('');
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
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    runtimeState.activeSession.selectedDateKey = core_text.normalizeText(dateKey, 40);
    renderCalendar();
}

export function selectCalendarPending(entryId) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    const safeId = core_text.normalizeText(entryId, 120);
    if (!(runtimeState.activeSession.entries || []).some(item => item.date === '待定' && item.id === safeId)) return;
    runtimeState.activeSession.selectedDateKey = `pending:${safeId}`;
    renderCalendar();
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
    const stickyNotes = Array.isArray(session.stickyNotes) ? session.stickyNotes : [];
    const moodNotes = Array.isArray(session.moodNotes) ? session.moodNotes : [];
    const monthKeys = availableMonthKeys(entries);
    let selectedMonth = parseMonthKey(session.selectedMonth) ? session.selectedMonth : modes_calendar.defaultCalendarMonth(entries);
    if (!selectedMonth && monthKeys.length) selectedMonth = monthKeys[0];
    if (!selectedMonth) selectedMonth = `annual-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    session.selectedMonth = selectedMonth;
    const info = parseMonthKey(selectedMonth);

    const datedEntries = entries.filter(item => item.date !== '待定' && modes_calendar.calendarEntryMatchesMonth(item, selectedMonth));
    const pendingEntries = entries.filter(item => item.status === 'promised' && item.date === '待定');
    const markedKeys = [...new Set(datedEntries.map(item => modes_calendar.calendarDateKeyForMonth(item, selectedMonth)).filter(Boolean))].sort();
    const pendingSelected = selectedPendingEntry(entries, session.selectedDateKey);
    if (!pendingSelected && (!session.selectedDateKey || !markedKeys.includes(session.selectedDateKey))) {
        session.selectedDateKey = markedKeys[0] || '';
    }

    const selectedEntries = pendingSelected
        ? [pendingSelected]
        : entriesForDateKey(entries, selectedMonth, session.selectedDateKey);
    const selectedDateLabel = pendingSelected
        ? '日期待定'
        : session.selectedDateKey
            ? (() => {
                const parsed = modes_calendar.normalizeCalendarDate(session.selectedDateKey);
                return parsed?.hasYear ? `${parsed.year}年${parsed.month}月${parsed.day}日` : parsed ? `${parsed.month}月${parsed.day}日` : '';
            })()
            : '';

    const monthJump = monthKeys.map(key => `<button type="button" class="rmt-calendar-jump ${key === selectedMonth ? 'active' : ''}" data-rmt-calendar-month="${core_text.esc(key)}">${core_text.esc(monthLabel(key))}</button>`).join('');
    const weekdays = info?.year ? ['一', '二', '三', '四', '五', '六', '日'].map(day => `<span>${day}</span>`).join('') : '';
    const blanks = Array.from({ length: firstWeekdayOffset(info) }, () => '<span class="rmt-calendar-day blank" aria-hidden="true"></span>').join('');
    const cells = Array.from({ length: monthDays(info) }, (_, index) => {
        const day = index + 1;
        const dateKey = dateKeyForCell(selectedMonth, day);
        const dayEntries = entriesForDateKey(entries, selectedMonth, dateKey);
        const statuses = new Set(dayEntries.map(item => item.status));
        const marked = dayEntries.length > 0;
        const selected = session.selectedDateKey === dateKey;
        const first = dayEntries[0];
        const caption = first ? `${core_text.esc(first.title)}${dayEntries.length > 1 ? ` +${dayEntries.length - 1}` : ''}` : '';
        const statusDots = [...statuses].map(status => `<i class="${core_text.esc(status)}"></i>`).join('');
        return `<button type="button" class="rmt-calendar-day ${marked ? 'marked' : ''} ${selected ? 'selected' : ''} ${statuses.has('past') ? 'has-past' : ''} ${statuses.has('promised') ? 'has-promised' : ''} ${statuses.has('future') ? 'has-future' : ''}" ${marked ? `data-rmt-calendar-date="${core_text.esc(dateKey)}"` : 'disabled'} aria-label="${marked ? core_text.esc(`${dateKey} ${dayEntries.map(item => item.title).join('、')}`) : core_text.esc(dateKey)}">
          <span class="rmt-calendar-day-number">${day}</span>
          <span class="rmt-calendar-day-title">${caption}</span>
          <span class="rmt-calendar-day-dots">${statusDots}</span>
        </button>`;
    }).join('');

    const pendingHtml = pendingEntries.length
        ? `<div class="rmt-calendar-pending"><span>还没定日期的约定</span><div>${pendingEntries.map(item => `<button type="button" class="${session.selectedDateKey === `pending:${item.id}` ? 'active' : ''}" data-rmt-calendar-pending="${core_text.esc(item.id)}">${core_text.esc(item.title)}</button>`).join('')}</div></div>`
        : '';

    const memoNotes = stickyNotes.filter(note => note?.kind !== 'special');
    const specialNotes = stickyNotes.filter(note => note?.kind === 'special');
    const promised = entries.filter(item => item.status === 'promised');
    const recentDone = entries
        .filter(item => item.status === 'past')
        .map(item => ({ item, parsed: modes_calendar.normalizeCalendarDate(item.date) }))
        .filter(row => row.parsed)
        .sort((a, b) => b.parsed.sortKey - a.parsed.sortKey)
        .slice(0, 3)
        .map(row => row.item);

    const memoBoard = memoNotes.length
        ? memoNotes.map(stickyNoteCard).join('')
        : '<div class="rmt-calendar-board-empty">还没有随手便签。</div>';
    const todoBoard = promised.length
        ? promised.map(item => calendarTodoRow(item)).join('')
        : '<div class="rmt-calendar-board-empty">目前没有还没兑现的明确约定。</div>';
    const doneBoard = recentDone.length
        ? `<div class="rmt-calendar-done-label">最近划掉的</div>${recentDone.map(item => calendarTodoRow(item, { completed: true })).join('')}`
        : '';
    const specialBoard = specialNotes.length
        ? `<section class="rmt-calendar-special-notes"><header><div><small>IMPORTANT / LITTLE THINGS</small><h3>特别备注</h3></div><span>${specialNotes.length}</span></header><div>${specialNotes.map(stickyNoteCard).join('')}</div></section>`
        : '';
    const moodBoard = moodNotes.length
        ? `<section class="rmt-calendar-mood-section"><header><div><small>MARGIN NOTES</small><h3>页角随笔</h3></div><span>偶尔写一点</span></header><div class="rmt-calendar-mood-grid">${moodNotes.map(moodNoteCard).join('')}</div></section>`
        : '';

    body.innerHTML = `<div class="rmt-calendar-shell rmt-calendar-v3">
      <section class="rmt-calendar-hero compact">
        <div><div class="rmt-archive-kicker">RELATIONSHIP CALENDAR</div><h2>${core_text.esc(session.title || '两个人的日历')}</h2><p>像一本真正会被使用的私人手账：上面圈日期，下面留便签、To-Do、特别备注和偶尔几句页角随笔。不是剧情目录，也不是每件事都要写感想。</p></div>
        <div class="rmt-calendar-counts"><span><b>${entries.filter(item => item.status === 'past').length}</b> 已发生</span><span><b>${promised.length}</b> 待办</span><span><b>${entries.filter(item => item.status === 'future').length}</b> 提醒</span></div>
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
          <header><div><small>STICKY NOTES</small><h3>便签夹</h3></div><span>${memoNotes.length}</span></header>
          <div class="rmt-calendar-sticky-grid">${memoBoard}</div>
        </section>
        <section class="rmt-calendar-master-todo">
          <header><div><small>TO DO LIST</small><h3>还要做的事</h3></div><span>${promised.length}</span></header>
          <div class="rmt-calendar-master-todo-list">${todoBoard}${doneBoard}</div>
        </section>
      </section>

      ${specialBoard}
      ${moodBoard}
    </div>`;
}
