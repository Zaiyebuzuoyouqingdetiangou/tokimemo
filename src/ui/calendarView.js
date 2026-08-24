// Heartbeat Memories r36 calendar view.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
import * as modes_calendar from '../modes/calendar.js';
import * as ui_overlay from './overlay.js';

const STATUS_META = Object.freeze({
    past: { label: '已经度过', note: '来自剧情档案的已发生事实' },
    promised: { label: '已约定 · 未发生', note: '剧情中明确约好，但档案尚未记录兑现或取消' },
    future: { label: '未来 · 世界设定', note: '来自角色卡 / 世界书；不是已经约定，也不是已经发生' },
});

function entryMonth(entry) {
    const parsed = modes_calendar.normalizeCalendarDate(entry?.date, { allowPending: true });
    return parsed?.mmdd ? parsed.mmdd.slice(0, 2) : '';
}

function entryDateParts(entry) {
    const parsed = modes_calendar.normalizeCalendarDate(entry?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return { main: '待定', sub: 'DATE TBD' };
    const bits = parsed.date.split('/');
    if (bits.length === 3) return { main: `${bits[1]}/${bits[2]}`, sub: bits[0] };
    return { main: parsed.date, sub: entry?.recurring ? '每年' : '日期' };
}

export function setCalendarStatus(status) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    runtimeState.activeSession.viewStatus = ['all', 'past', 'promised', 'future'].includes(status) ? status : 'all';
    renderCalendar();
}

export function setCalendarMonth(month) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.CALENDAR) return;
    runtimeState.activeSession.selectedMonth = /^(0[1-9]|1[0-2])$/.test(String(month || '')) ? String(month) : '';
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

    const status = ['all', 'past', 'promised', 'future'].includes(session.viewStatus) ? session.viewStatus : 'all';
    const month = /^(0[1-9]|1[0-2])$/.test(String(session.selectedMonth || '')) ? String(session.selectedMonth) : '';
    const entries = Array.isArray(session.entries) ? session.entries : [];
    const counts = {
        past: entries.filter(item => item.status === 'past').length,
        promised: entries.filter(item => item.status === 'promised').length,
        future: entries.filter(item => item.status === 'future').length,
    };
    const filtered = entries.filter(item => (status === 'all' || item.status === status) && (!month || entryMonth(item) === month));
    const monthsWithEntries = new Set(entries.map(entryMonth).filter(Boolean));
    const monthButtons = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(mm =>
        `<button type="button" class="rmt-calendar-month ${month === mm ? 'active' : ''} ${monthsWithEntries.has(mm) ? 'has-entry' : ''}" data-rmt-calendar-month="${mm}">${Number(mm)}月</button>`
    ).join('');

    const cards = filtered.map(item => {
        const meta = STATUS_META[item.status] || { label: item.status, note: '' };
        const date = entryDateParts(item);
        const evidence = item.status === 'past' || item.status === 'promised'
            ? `<small class="rmt-calendar-source">${core_text.esc(item.sourceLabel || '剧情档案')}${item.sourceMemoryAnchor ? ` · ${core_text.esc(item.sourceMemoryAnchor)}` : ''}</small>`
            : `<small class="rmt-calendar-source">${core_text.esc(item.sourceLabel || '世界设定')} · 设定项，不代表已发生</small>`;
        return `<article class="rmt-calendar-entry rmt-calendar-${core_text.esc(item.status)}">
          <div class="rmt-calendar-date"><b>${core_text.esc(date.main)}</b><small>${core_text.esc(date.sub)}</small></div>
          <div class="rmt-calendar-entry-main">
            <div class="rmt-calendar-entry-head"><span class="rmt-calendar-badge">${core_text.esc(meta.label)}</span><b>${core_text.esc(item.title)}</b></div>
            <p>${core_text.esc(item.summary)}</p>
            ${evidence}
          </div>
        </article>`;
    }).join('');

    body.innerHTML = `<div class="rmt-calendar-shell">
      <section class="rmt-calendar-hero">
        <div><div class="rmt-archive-kicker">RELATIONSHIP CALENDAR</div><h2>${core_text.esc(session.title || '两个人的日历')}</h2><p>这里只整理时间状态，不自动续写剧情。过去必须有档案证据；约定必须能回指真实记忆；未来只表示世界设定中存在的日期。</p></div>
        <div class="rmt-calendar-counts"><span><b>${counts.past}</b> 已度过</span><span><b>${counts.promised}</b> 已约定</span><span><b>${counts.future}</b> 未来</span></div>
      </section>
      <nav class="rmt-calendar-status-tabs">
        <button type="button" class="${status === 'all' ? 'active' : ''}" data-rmt-calendar-status="all">全部</button>
        <button type="button" class="${status === 'past' ? 'active' : ''}" data-rmt-calendar-status="past">已度过</button>
        <button type="button" class="${status === 'promised' ? 'active' : ''}" data-rmt-calendar-status="promised">已约定 · 未发生</button>
        <button type="button" class="${status === 'future' ? 'active' : ''}" data-rmt-calendar-status="future">未来</button>
      </nav>
      <div class="rmt-calendar-months"><button type="button" class="rmt-calendar-month ${!month ? 'active' : ''}" data-rmt-calendar-month="">全部月份</button>${monthButtons}</div>
      <div class="rmt-calendar-legend">
        <span><i class="past"></i>${core_text.esc(STATUS_META.past.note)}</span>
        <span><i class="promised"></i>${core_text.esc(STATUS_META.promised.note)}</span>
        <span><i class="future"></i>${core_text.esc(STATUS_META.future.note)}</span>
      </div>
      <section class="rmt-calendar-list">${cards || '<div class="rmt-calendar-empty">这个筛选下暂时没有日期。若是“已约定”或“未来”为空，说明当前档案 / 世界设定里没有足够明确的日期信息。</div>'}</section>
    </div>`;
}
