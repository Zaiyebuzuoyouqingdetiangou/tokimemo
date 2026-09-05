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

function pageEntries(session, pageKey, visibleEntries = session?.entries) {
    const page = modes_calendar.calendarDayPage(session, pageKey);
    if (!page) return [];
    const ids = new Set(Array.isArray(page.entryIds) ? page.entryIds : []);
    return (Array.isArray(visibleEntries) ? visibleEntries : []).filter(item =>
        ids.has(item?.id) && modes_calendar.calendarEntryPageKey(item) === pageKey
    );
}

function normalizedCalendarTags(entry) {
    return [...new Set((Array.isArray(entry?.tags) ? entry.tags : [])
        .map(tag => core_text.normalizeText(tag, 40))
        .filter(Boolean))];
}

export function calendarEntryMatchesTags(entry, selectedTags = []) {
    const selected = new Set((selectedTags instanceof Set ? [...selectedTags] : Array.isArray(selectedTags) ? selectedTags : [])
        .map(tag => core_text.normalizeText(tag, 40))
        .filter(Boolean));
    if (!selected.size) return true;
    return normalizedCalendarTags(entry).some(tag => selected.has(tag));
}

function calendarFilterScope(session) {
    const snapshot = runtimeState.activeArchiveSnapshot;
    const target = core_text.normalizeText(snapshot?.entryId || snapshot?.characterKey || 'live', 300);
    const chatId = core_text.normalizeText(session?.chatId || snapshot?.chatId, 240);
    const revision = core_text.normalizeText(session?.archiveRevision || snapshot?.memory?.archiveRevision, 240);
    return `${target}|${chatId}|${revision}`;
}

function availableTagCounts(entries) {
    const counts = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        for (const tag of normalizedCalendarTags(entry)) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN')).slice(0, 40);
}

function selectedCalendarTags(session, tagCounts = availableTagCounts(session?.entries)) {
    const scope = calendarFilterScope(session);
    const available = new Set(tagCounts.map(([tag]) => tag));
    const stored = runtimeState.calendarTagFilters.get(scope);
    const selected = new Set((stored instanceof Set ? [...stored] : []).filter(tag => available.has(tag)));
    if (stored && selected.size !== stored.size) {
        if (selected.size) runtimeState.calendarTagFilters.set(scope, selected);
        else runtimeState.calendarTagFilters.delete(scope);
    }
    return selected;
}

function rememberCalendarTags(session, selected) {
    const scope = calendarFilterScope(session);
    runtimeState.calendarTagFilters.delete(scope);
    if (selected.size) runtimeState.calendarTagFilters.set(scope, new Set(selected));
    while (runtimeState.calendarTagFilters.size > 32) {
        runtimeState.calendarTagFilters.delete(runtimeState.calendarTagFilters.keys().next().value);
    }
}

export function toggleCalendarTag(tag) {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.CALENDAR) return;
    const normalized = core_text.normalizeText(tag, 40);
    const counts = availableTagCounts(session.entries);
    if (!normalized || !counts.some(([candidate]) => candidate === normalized)) return;
    const selected = selectedCalendarTags(session, counts);
    if (selected.has(normalized)) selected.delete(normalized);
    else selected.add(normalized);
    rememberCalendarTags(session, selected);
    renderCalendar();
}

export function clearCalendarTags() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.CALENDAR) return;
    runtimeState.calendarTagFilters.delete(calendarFilterScope(session));
    renderCalendar();
}

function pageHasNotebookContent(page) {
    return !!page && [page.entryIds, page.stickyNotes, page.moodNotes, page.holidayCards]
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

function calendarTodoRow(item, { completed = false } = {}) {
    const marker = completed ? '✓' : '□';
    const tags = (Array.isArray(item?.tags) ? item.tags : []).slice(0, 3).map(tag => `<span>#${core_text.esc(tag)}</span>`).join('');
    const meta = shortDate(item);
    return `<div class="rmt-calendar-master-todo-row ${completed ? 'done' : 'open'}">
      <span class="rmt-calendar-master-check" aria-hidden="true">${marker}</span>
      <div><b>${core_text.esc(item?.title || '未命名事项')}</b><small>${core_text.esc(meta)}${tags ? ` · ${tags}` : ''}</small></div>
    </div>`;
}

function stickyNoteCard(note) {
    const special = note?.kind === 'special';
    const source = note?.legacyEvidenceUnverified === true
        ? `旧版文字 · 证据未重新核验 · ${core_text.esc(note?.sourceLabel || '原日历内容')}`
        : note?.legacyUnassigned === true
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
    const source = note?.legacyEvidenceUnverified === true
        ? `旧版文字 · 证据未重新核验 · ${core_text.esc(note?.sourceLabel || '角色随笔')}`
        : note?.legacyUnassigned === true
        ? `旧版未归日期 · ${core_text.esc(note?.sourceLabel || '角色随笔')}`
        : `${core_text.esc(note?.sourceLabel || '剧情档案 · 角色随笔')}${note?.sourceMemoryAnchor ? ` · ${core_text.esc(note.sourceMemoryAnchor)}` : ''}`;
    return `<article class="rmt-calendar-mood-note">
      <span class="rmt-calendar-mood-mark">〝</span>
      <p>${core_text.esc(note?.text || '')}</p>
      <footer>${date ? `<b>${date}</b>` : ''}<small>${source}</small></footer>
    </article>`;
}

const HOLIDAY_CARD_COLORS = Object.freeze({
    paper: ['#fffdf7', '#67717f', '#c8a98e', '#b7c5cf'],
    dawn: ['#fff8f5', '#6e6878', '#d59bad', '#a8c8c6'],
    night: ['#273141', '#f4f1ea', '#9eb4d4', '#d6b8cc'],
    jade: ['#f5fbf8', '#4f6a68', '#7fb2a8', '#c2a993'],
    rose: ['#fff8fa', '#735f6b', '#d59aad', '#9cb7c3'],
    frost: ['#f6fbfd', '#596c7d', '#9dbccc', '#c4b7d3'],
    festival: ['#fff8f0', '#735f55', '#c98278', '#d4b16f'],
});

function cardHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function cardRandom(seedValue) {
    let seed = cardHash(seedValue) || 1;
    return () => {
        seed += 0x6d2b79f5;
        let value = seed;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function holidayMotifSvg(kind, x, y, size, rotation, stroke, fill, lineWidth) {
    const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${size.toFixed(3)})`;
    if (kind === 'celestial') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"><circle r="12" opacity=".45"/><path d="M0-22V22M-22 0H22M-15-15L15 15M15-15L-15 15" opacity=".8"/></g>`;
    if (kind === 'botanical' || kind === 'leaf') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"><path d="M-24 18C-8 5 7-7 24-20"/><ellipse cx="-8" cy="5" rx="8" ry="3.5" transform="rotate(-28 -8 5)"/><ellipse cx="8" cy="-8" rx="8" ry="3.5" transform="rotate(-28 8 -8)"/></g>`;
    if (kind === 'light' || kind === 'spark') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"><path d="M0-20V20M-20 0H20M-12-12L12 12M12-12L-12 12"/><circle r="3" fill="${fill}" stroke="none"/></g>`;
    if (kind === 'ribbon') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"><path d="M-30 8C-12-18 8 23 30-8"/><path d="M-24 15C-7-5 10 29 27 0" opacity=".45"/></g>`;
    if (kind === 'snow') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"><path d="M0-23V23M-20-12L20 12M-20 12L20-12"/><path d="M0-14L-5-9M0-14L5-9M12 7L6 8M12 7L10 13M-12 7L-6 8M-12 7L-10 13" opacity=".72"/></g>`;
    if (kind === 'wave') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"><path d="M-34 4C-20-11-8 18 6 3S29-7 35 6"/><path d="M-31 13C-18 2-5 23 9 11S29 4 34 13" opacity=".45"/></g>`;
    if (kind === 'cloud') return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"><path d="M-28 9C-25-1-16-4-9 0C-4-14 17-12 20 2C32 2 34 18 23 20H-20C-31 20-35 11-28 9Z"/></g>`;
    if (kind === 'flame') return `<g transform="${t}" fill="${fill}" fill-opacity=".18" stroke="${stroke}" stroke-width="${lineWidth}"><path d="M0-27C14-11 19 3 11 17C5 28-10 27-16 17C-23 4-13-9 0-27Z"/><path d="M2-12C8-2 9 7 3 13C-2 18-8 11-7 6C-6 0-2-6 2-12Z" fill-opacity=".35"/></g>`;
    if (kind === 'petal') return `<g transform="${t}" fill="${fill}" fill-opacity=".18" stroke="${stroke}" stroke-width="${lineWidth}"><ellipse cy="-11" rx="7" ry="16"/><ellipse cx="10" cy="5" rx="7" ry="16" transform="rotate(120 10 5)"/><ellipse cx="-10" cy="5" rx="7" ry="16" transform="rotate(-120 -10 5)"/></g>`;
    return `<g transform="${t}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"><circle r="18"/><rect x="-11" y="-11" width="22" height="22" rx="4" transform="rotate(22)" opacity=".55"/></g>`;
}

function holidayArtSvg(card) {
    const palette = HOLIDAY_CARD_COLORS[card?.art?.palette] || HOLIDAY_CARD_COLORS.paper;
    const rand = cardRandom(`${card?.id}|${card?.holidayLabel}|${card?.expression}|${card?.motifs?.join(',')}`);
    const motifs = Array.isArray(card?.motifs) ? card.motifs : [];
    const density = Math.max(0, Math.min(100, Number(card?.art?.density) || 0));
    const whitespace = Math.max(0, Math.min(100, Number(card?.art?.whitespace) || 0));
    const asymmetry = Math.max(0, Math.min(100, Number(card?.art?.asymmetry) || 0));
    const visualWeight = Math.max(0, Math.min(100, Number(card?.art?.visualWeight) || 0));
    const strokeWidth = card?.art?.stroke === 'bold' ? 2.2 : card?.art?.stroke === 'dry' ? 1.7 : card?.art?.stroke === 'soft' ? 1.35 : 1.1;
    const count = motifs.length ? Math.max(2, Math.min(18, 2 + Math.round(density / 8))) : 0;
    const edgeBias = 0.58 + whitespace / 260;
    const parts = [];
    for (let index = 0; index < count; index += 1) {
        const kind = motifs[index % motifs.length];
        const side = rand() < (0.5 + (asymmetry - 50) / 180) ? 1 : -1;
        const x = side > 0
            ? 360 + (360 * (edgeBias + rand() * (1 - edgeBias)))
            : 360 - (360 * (edgeBias + rand() * (1 - edgeBias)));
        const y = 35 + rand() * 350;
        const size = 0.45 + rand() * (0.5 + visualWeight / 135);
        const rotation = -35 + rand() * 70;
        parts.push(holidayMotifSvg(kind, x, y, size, rotation, palette[2], palette[3], strokeWidth));
    }
    const medium = modes_calendar.HOLIDAY_CARD_MEDIA.includes(card?.art?.medium) ? card.art.medium : 'card';
    const radius = medium === 'scroll' || medium === 'paper' ? 8 : medium === 'letter' ? 16 : medium === 'screen' ? 28 : 34;
    return `<svg class="rmt-calendar-holiday-art" viewBox="0 0 720 420" aria-hidden="true"><rect width="720" height="420" rx="${radius}" fill="${palette[0]}"/><g opacity=".82">${parts.join('')}</g></svg>`;
}

function holidayCardMarkup(card) {
    const expression = modes_calendar.HOLIDAY_CARD_EXPRESSIONS.includes(card?.expression) ? card.expression : 'mixed';
    const flow = card?.art?.flow === 'vertical' ? 'vertical' : 'horizontal';
    const calligraphy = core_text.esc(card?.calligraphy || '');
    const message = core_text.esc(card?.message || '');
    const signature = core_text.esc(card?.signature || '');
    let content = '';
    if (expression === 'writing') {
        content = `<div class="rmt-calendar-holiday-calligraphy ${flow}">${calligraphy || message}</div>`;
    } else if (expression === 'drawing') {
        content = '';
    } else if (expression === 'text') {
        content = `<div class="rmt-calendar-holiday-message">${message}</div>`;
    } else if (expression === 'minimal') {
        content = calligraphy
            ? `<div class="rmt-calendar-holiday-calligraphy ${flow}">${calligraphy}</div>`
            : message ? `<div class="rmt-calendar-holiday-message minimal">${message}</div>` : '';
    } else {
        content = `${calligraphy ? `<div class="rmt-calendar-holiday-calligraphy ${flow}">${calligraphy}</div>` : ''}${message ? `<div class="rmt-calendar-holiday-message">${message}</div>` : ''}`;
    }
    return `<article class="rmt-calendar-holiday-card ${expression}" data-medium="${core_text.esc(card?.art?.medium || 'card')}" data-palette="${core_text.esc(card?.art?.palette || 'paper')}" aria-label="${core_text.esc(card?.holidayLabel || '节日')}贺卡">
      ${holidayArtSvg(card)}
      <div class="rmt-calendar-holiday-content">${content}${signature ? `<div class="rmt-calendar-holiday-signature">${signature}</div>` : ''}</div>
      ${card?.historyVerification === 'legacy-unverified' ? '<div class="rmt-calendar-holiday-legacy">旧版文字 · 历史证据未重新核验</div>' : ''}
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
    const tagCounts = availableTagCounts(entries);
    const selectedTags = selectedCalendarTags(session, tagCounts);
    const visibleEntries = entries.filter(item => calendarEntryMatchesTags(item, selectedTags));
    const monthKeys = availableMonthKeys(entries, session.dayPages);
    let selectedMonth = parseMonthKey(session.selectedMonth) ? session.selectedMonth : modes_calendar.defaultCalendarMonth(entries);
    if (!selectedMonth && monthKeys.length) selectedMonth = monthKeys[0];
    if (!selectedMonth) selectedMonth = `annual-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    session.selectedMonth = selectedMonth;
    const info = parseMonthKey(selectedMonth);

    const pendingEntries = visibleEntries.filter(item => item.status === 'promised' && item.date === '待定');
    let selectedPageKey = normalizeSelectablePageKey(session, session.selectedDateKey);
    if (!selectedPageKey || !pageKeyMatchesMonth(selectedPageKey, selectedMonth)) {
        selectedPageKey = defaultPageKeyForMonth(session, selectedMonth, visibleEntries);
    }
    const selectedPage = ensureSessionDayPage(session, selectedPageKey);
    session.selectedDateKey = selectedPage?.key || '';
    const selectedEntries = pageEntries(session, session.selectedDateKey, visibleEntries);
    const selectedDateLabel = pageLabel(session.selectedDateKey, visibleEntries);

    const monthJump = monthKeys.map(key => `<button type="button" class="rmt-calendar-jump ${key === selectedMonth ? 'active' : ''}" data-rmt-calendar-month="${core_text.esc(key)}">${core_text.esc(monthLabel(key))}</button>`).join('');
    const weekdays = info?.year ? ['一', '二', '三', '四', '五', '六', '日'].map(day => `<span>${day}</span>`).join('') : '';
    const blanks = Array.from({ length: firstWeekdayOffset(info) }, () => '<span class="rmt-calendar-day blank" aria-hidden="true"></span>').join('');
    const cells = Array.from({ length: monthDays(info) }, (_, index) => {
        const day = index + 1;
        const dateValue = dateValueForCell(selectedMonth, day);
        const dayEntries = entriesForCell(visibleEntries, selectedMonth, dateValue);
        const pageKey = preferredPageKeyForCell(session, selectedMonth, day, dayEntries);
        const statuses = new Set(dayEntries.map(item => item.status));
        const dayPage = modes_calendar.calendarDayPage(session, pageKey);
        const hasHolidayCard = Array.isArray(dayPage?.holidayCards) && dayPage.holidayCards.length > 0;
        const marked = dayEntries.length > 0 || hasHolidayCard;
        const selected = session.selectedDateKey === pageKey;
        const first = dayEntries[0];
        const caption = first ? `${core_text.esc(first.title)}${dayEntries.length > 1 ? ` +${dayEntries.length - 1}` : ''}` : '';
        const statusDots = [...statuses]
            .map(status => STATUS_META[status]?.dot || '')
            .filter(Boolean)
            .map(dot => `<i class="${dot}"></i>`)
            .join('');
        const aria = marked ? `${dateValue} ${dayEntries.map(item => item.title).join('、')}${hasHolidayCard ? ' 有节日贺卡' : ''}` : `${dateValue} 空白日期`;
        return `<button type="button" class="rmt-calendar-day ${marked ? 'marked' : ''} ${selected ? 'selected' : ''} ${hasHolidayCard ? 'has-card' : ''} ${statuses.has('past') ? 'has-past' : ''} ${statuses.has('promised') ? 'has-promised' : ''} ${statuses.has('future') ? 'has-future' : ''}" data-rmt-calendar-date="${core_text.esc(pageKey)}" aria-label="${core_text.esc(aria)}">
          <span class="rmt-calendar-day-number">${day}</span>
          ${hasHolidayCard ? '<span class="rmt-calendar-card-mark" aria-hidden="true">✦</span>' : ''}
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

    const page = selectedPage || { stickyNotes: [], moodNotes: [] };
    const stickyNotes = Array.isArray(page.stickyNotes) ? page.stickyNotes : [];
    const moodNotes = Array.isArray(page.moodNotes) ? page.moodNotes : [];
    const holidayCards = Array.isArray(page.holidayCards) ? page.holidayCards : [];
    const memoNotes = stickyNotes.filter(note => note?.kind !== 'special');
    const specialNotes = stickyNotes.filter(note => note?.kind === 'special');
    const promised = selectedEntries.filter(item => item.status === 'promised');
    const completedEntries = selectedEntries.filter(item => item.status === 'past');

    const memoCards = memoNotes.map(stickyNoteCard);
    const memoBoard = memoCards.length
        ? memoCards.join('')
        : '<div class="rmt-calendar-board-empty">这一天还没有他写下的备忘。</div>';
    const openTodoRows = promised.map(item => calendarTodoRow(item));
    const doneTodoRows = completedEntries.map(item => calendarTodoRow(item, { completed: true }));
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
    const allPromisedCount = visibleEntries.reduce((count, item) => count + (item?.status === 'promised' ? 1 : 0), 0);
    const tagFilterHtml = tagCounts.length ? `<section class="rmt-calendar-filter" aria-label="日历事项标签筛选">
      <header><div><small>ENTRY TAGS</small><h3>标签筛选</h3></div>${selectedTags.size ? '<button type="button" data-rmt-calendar-tag-clear>清除</button>' : ''}</header>
      <div>${tagCounts.map(([tag, count]) => `<button type="button" class="${selectedTags.has(tag) ? 'active' : ''}" data-rmt-calendar-tag="${core_text.esc(tag)}" aria-pressed="${selectedTags.has(tag) ? 'true' : 'false'}"><span>#${core_text.esc(tag)}</span><i>${count}</i></button>`).join('')}</div>
      <small>${selectedTags.size ? `已显示命中任一标签的 ${visibleEntries.length} 项` : '多选按“任一标签”显示'}</small>
    </section>` : '';
    const holidaySection = holidayCards.length
        ? `<section class="rmt-calendar-holiday-section"><header><small>HOLIDAY CARD</small><h3>${core_text.esc(holidayCards[0]?.holidayLabel || '节日贺卡')}</h3></header><div class="rmt-calendar-holiday-cards">${holidayCards.map(holidayCardMarkup).join('')}</div></section>`
        : '';

    body.innerHTML = `<div class="rmt-calendar-shell rmt-calendar-v3">
      <section class="rmt-calendar-hero compact">
        <div><div class="rmt-archive-kicker">RELATIONSHIP CALENDAR</div><h2>${core_text.esc(session.title || '两个人的日历')}</h2><p>点选任意日期，查看他为这一天留下的备忘、自动待办、特别备注和页角随笔。</p></div>
        <div class="rmt-calendar-counts"><span><b>${visibleEntries.filter(item => item.status === 'past').length}</b> 已发生</span><span><b>${allPromisedCount}</b> 待办</span><span><b>${visibleEntries.filter(item => item.status === 'future').length}</b> 提醒</span></div>
      </section>

      ${tagFilterHtml}

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

      ${holidaySection}

      <section class="rmt-calendar-notebook-board">
        <section class="rmt-calendar-sticky-panel">
          <header><div><small>CHARACTER MEMOS</small><h3>他的备忘</h3></div><span>${memoNotes.length}</span></header>
          <div class="rmt-calendar-sticky-grid">${memoBoard}</div>
        </section>
        <section class="rmt-calendar-master-todo">
          <header><div><small>CHARACTER TO DO LIST</small><h3>他的自动待办</h3></div><span>${promised.length}</span></header>
          <div class="rmt-calendar-master-todo-list">${todoBoard}${doneBoard}</div>
        </section>
      </section>

      <section class="rmt-calendar-special-notes"><header><div><small>IMPORTANT / LITTLE THINGS</small><h3>特别备注</h3></div><span>${specialNotes.length}</span></header><div>${specialCards}</div></section>
      <section class="rmt-calendar-mood-section"><header><div><small>MARGIN NOTES</small><h3>页角随笔</h3></div><span>${moodNotes.length}</span></header><div class="rmt-calendar-mood-grid">${moodCards}</div></section>
    </div>`;
}
