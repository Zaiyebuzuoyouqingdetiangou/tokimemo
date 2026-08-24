// Heartbeat Memories r36 calendar mode.
// Calendar is a derived organizer: past facts come from archive evidence, promises must cite
// archive evidence, and future setting dates are explicitly non-canonical setting references.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';

export const CALENDAR_STATUS = Object.freeze({
    PAST: 'past',
    PROMISED: 'promised',
    FUTURE: 'future',
});

export function normalizeCalendarDate(value, { allowPending = false } = {}) {
    const text = core_text.normalizeText(value, 80).trim();
    if (allowPending && /^(?:待定|未定|unknown|tbd)$/i.test(text)) {
        return { date: '待定', mmdd: '', sortKey: 99999999, hasYear: false };
    }
    let match = text.match(/\b(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})(?:日)?\b/);
    let year = 0;
    let month = 0;
    let day = 0;
    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else {
        match = text.match(/(?:^|\D)(\d{1,2})[\/.\-月](\d{1,2})(?:日)?(?:$|\D)/);
        if (!match) return null;
        month = Number(match[1]);
        day = Number(match[2]);
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const validationYear = year || 2000;
    const date = new Date(Date.UTC(validationYear, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return {
        date: year ? `${String(year).padStart(4, '0')}/${mm}/${dd}` : `${mm}/${dd}`,
        mmdd: `${mm}/${dd}`,
        sortKey: (year || 9999) * 10000 + month * 100 + day,
        hasYear: !!year,
    };
}

export function derivePastCalendarEntries(memoryBank) {
    const out = [];
    for (const memory of Array.isArray(memoryBank?.memories) ? memoryBank.memories : []) {
        const parsed = normalizeCalendarDate(memory?.date);
        const memoryId = core_text.normalizeText(memory?.id, 40);
        if (!parsed || !memoryId) continue;
        const title = core_text.normalizeText(memory?.title, 120) || '共同经历';
        const anchors = core_text.cleanArray(memory?.anchors, 8, 120);
        const anchor = anchors.find(item => item.length >= 2) || title;
        out.push({
            id: `CAL_PAST_${core_text.safeId(memoryId, String(out.length + 1))}`,
            status: CALENDAR_STATUS.PAST,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            summary: core_text.normalizeText(memory?.summary, 900),
            sourceKind: 'archive',
            sourceLabel: '剧情档案',
            sourceMemoryIds: [memoryId],
            sourceMemoryAnchor: anchor,
            recurring: false,
        });
    }
    return out.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS);
}

function normalizePromisedEntries(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 48)) {
        const parsed = normalizeCalendarDate(item?.date, { allowPending: true });
        if (!parsed) continue;
        const title = core_text.normalizeText(item?.title, 120);
        const summary = core_text.normalizeText(item?.summary, 900);
        if (!title || !summary) continue;
        const ref = core_evidence.normalizeMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            `${title}\n${summary}\n${core_text.normalizeText(item?.sourceMemoryAnchor, 160)}`,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_PROMISE_${String(out.length + 1).padStart(2, '0')}`),
            status: CALENDAR_STATUS.PROMISED,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            summary,
            sourceKind: 'archive-promise',
            sourceLabel: '剧情中的约定',
            sourceMemoryIds: ref.sourceMemoryIds,
            sourceMemoryAnchor: ref.sourceMemoryAnchor,
            recurring: false,
        });
    }
    return out;
}

function normalizeFutureEntries(value) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 48)) {
        const parsed = normalizeCalendarDate(item?.date);
        if (!parsed) continue;
        const title = core_text.normalizeText(item?.title, 120);
        const summary = core_text.normalizeText(item?.summary, 900);
        if (!title || !summary) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_FUTURE_${String(out.length + 1).padStart(2, '0')}`),
            status: CALENDAR_STATUS.FUTURE,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            summary,
            sourceKind: 'world-setting',
            sourceLabel: core_text.normalizeText(item?.sourceLabel, 120) || '世界设定',
            sourceMemoryIds: [],
            sourceMemoryAnchor: '',
            recurring: item?.recurring === true || !parsed.hasYear,
        });
    }
    return out;
}

export function calendarEntryKey(item) {
    const status = core_text.normalizeText(item?.status, 20);
    const date = core_text.normalizeText(item?.date, 40);
    const title = core_text.normalizeText(item?.title, 120).replace(/\s+/g, '').toLowerCase();
    const evidence = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    return `${status}|${date}|${title}|${evidence}`;
}

export function normalizeCalendar(data, memoryBank) {
    const past = derivePastCalendarEntries(memoryBank);
    const promised = normalizePromisedEntries(data?.promised, memoryBank);
    const future = normalizeFutureEntries(data?.future);
    const entries = [];
    const seen = new Set();
    for (const item of [...past, ...promised, ...future]) {
        const key = calendarEntryKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push(item);
    }
    const statusRank = { past: 0, promised: 1, future: 2 };
    entries.sort((a, b) => {
        const da = normalizeCalendarDate(a.date, { allowPending: true })?.sortKey ?? 99999999;
        const db = normalizeCalendarDate(b.date, { allowPending: true })?.sortKey ?? 99999999;
        return da - db || (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || String(a.title).localeCompare(String(b.title), 'zh-CN');
    });
    return {
        kind: core_constants.MODE.CALENDAR,
        title: core_text.normalizeText(data?.title, 120) || '两个人的日历',
        entries: entries.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
        viewStatus: 'all',
        selectedMonth: '',
        generatedAt: Date.now(),
    };
}
