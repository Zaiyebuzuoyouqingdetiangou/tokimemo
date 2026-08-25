// Heartbeat Memories r40 calendar mode.
// Calendar is a derived, evidence-gated personal calendar. It intentionally does NOT mirror every
// dated archive memory. The model may nominate only calendar-worthy moments; the plugin validates
// their archive evidence and derives past dates from the anchored memory instead of trusting model dates.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';

export const CALENDAR_STATUS = Object.freeze({
    PAST: 'past',
    PROMISED: 'promised',
    FUTURE: 'future',
});

export const CALENDAR_TAG_ALLOWLIST = Object.freeze([
    '约会', '接送', '出行', '见面', '生日', '纪念日', '约定', '活动', '重要日', '设定日',
]);

export const CALENDAR_NOTE_KIND = Object.freeze({
    MEMO: 'memo',
    SPECIAL: 'special',
});

export const CALENDAR_NOTE_SOURCE = Object.freeze({
    ARCHIVE: 'archive',
    SETTING: 'setting',
});

export function normalizeCalendarTags(value, fallback = '') {
    const allowed = new Set(CALENDAR_TAG_ALLOWLIST);
    const tags = core_text.cleanArray(value, 6, 24).filter(tag => allowed.has(tag));
    if (!tags.length && fallback && allowed.has(fallback)) tags.push(fallback);
    return [...new Set(tags)].slice(0, 3);
}

export function normalizeCalendarDate(value, { allowPending = false } = {}) {
    const text = core_text.normalizeText(value, 80).trim();
    if (allowPending && /^(?:待定|未定|unknown|tbd)$/i.test(text)) {
        return { date: '待定', mmdd: '', sortKey: 99999999, hasYear: false, year: 0, month: 0, day: 0 };
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
        year,
        month,
        day,
    };
}

function memoryAnchorTerms(memory) {
    return [
        core_text.normalizeText(memory?.title, 120),
        ...core_text.cleanArray(memory?.anchors, 8, 120),
    ].filter(Boolean);
}

function folded(value) {
    return core_text.normalizeText(value, 180).replace(/\s+/g, '').toLowerCase();
}

function resolveAnchoredMemory(memoryBank, sourceMemoryIds, sourceMemoryAnchor) {
    const ids = new Set(core_text.cleanArray(sourceMemoryIds, 16, 40));
    const requested = folded(sourceMemoryAnchor);
    if (!ids.size || !requested) return null;
    for (const memory of Array.isArray(memoryBank?.memories) ? memoryBank.memories : []) {
        if (!ids.has(core_text.normalizeText(memory?.id, 40))) continue;
        if (!memoryAnchorTerms(memory).some(term => folded(term) === requested)) continue;
        return memory;
    }
    return null;
}

function resolveAnchoredDatedMemory(memoryBank, sourceMemoryIds, sourceMemoryAnchor) {
    const memory = resolveAnchoredMemory(memoryBank, sourceMemoryIds, sourceMemoryAnchor);
    if (!memory) return null;
    const parsed = normalizeCalendarDate(memory?.date);
    return parsed ? { memory, parsed } : null;
}

function citedEvidenceText(memoryBank, sourceMemoryIds) {
    const ids = new Set(core_text.cleanArray(sourceMemoryIds, 16, 40));
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .filter(memory => ids.has(core_text.normalizeText(memory?.id, 40)))
        .map(memory => [memory?.date, memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].join('\n'))
        .join('\n');
}

function promisedDateIsGrounded(parsed, sourceMemoryIds, memoryBank) {
    if (!parsed || parsed.date === '待定') return parsed?.date === '待定';
    const evidence = citedEvidenceText(memoryBank, sourceMemoryIds);
    if (!evidence) return false;
    const year = parsed.year;
    const month = parsed.month;
    const day = parsed.day;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateVariants = year
        ? [
            `${year}/${mm}/${dd}`, `${year}/${month}/${day}`,
            `${year}-${mm}-${dd}`, `${year}-${month}-${day}`,
            `${year}.${mm}.${dd}`, `${year}.${month}.${day}`,
            `${year}年${month}月${day}日`, `${year}年${mm}月${dd}日`,
        ]
        : [
            `${mm}/${dd}`, `${month}/${day}`,
            `${mm}-${dd}`, `${month}-${day}`,
            `${mm}.${dd}`, `${month}.${day}`,
            `${month}月${day}日`, `${mm}月${dd}日`,
        ];
    const compactEvidence = evidence.replace(/\s+/g, '');
    return dateVariants.some(value => compactEvidence.includes(value.replace(/\s+/g, '')));
}

// Legacy diagnostic helper retained for tests/tools. It returns dated archive candidates only;
// normalizeCalendar() no longer auto-promotes these into visible calendar entries.
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
            id: `CAL_CANDIDATE_${core_text.safeId(memoryId, String(out.length + 1))}`,
            status: CALENDAR_STATUS.PAST,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            sourceKind: 'archive-candidate',
            sourceLabel: '剧情档案候选',
            sourceMemoryIds: [memoryId],
            sourceMemoryAnchor: anchor,
            recurring: false,
        });
    }
    return out.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS);
}

function normalizePastMarkedEntries(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 36)) {
        const title = core_text.normalizeText(item?.title, 48);
        if (!title) continue;
        const ref = core_evidence.normalizeMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            `${title}
${core_text.normalizeText(item?.sourceMemoryAnchor, 160)}`,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        const anchored = resolveAnchoredDatedMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
        if (!anchored) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_PAST_${String(out.length + 1).padStart(2, '0')}`),
            status: CALENDAR_STATUS.PAST,
            date: anchored.parsed.date,
            mmdd: anchored.parsed.mmdd,
            title,
            tags: normalizeCalendarTags(item?.tags),
            note: '',
            summary: '',
            sourceKind: 'archive-highlight',
            sourceLabel: '剧情档案',
            sourceMemoryIds: ref.sourceMemoryIds,
            sourceMemoryAnchor: ref.sourceMemoryAnchor,
            recurring: false,
        });
    }
    return out;
}

function normalizePromisedEntries(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 32)) {
        const parsed = normalizeCalendarDate(item?.date, { allowPending: true });
        if (!parsed) continue;
        const title = core_text.normalizeText(item?.title, 48);
        if (!title) continue;
        const ref = core_evidence.normalizeMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            `${title}
${core_text.normalizeText(item?.sourceMemoryAnchor, 160)}`,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        if (!promisedDateIsGrounded(parsed, ref.sourceMemoryIds, memoryBank)) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_PROMISE_${String(out.length + 1).padStart(2, '0')}`),
            status: CALENDAR_STATUS.PROMISED,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            tags: normalizeCalendarTags(item?.tags, '约定'),
            note: '',
            summary: '',
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
    for (const item of raw.slice(0, 24)) {
        const parsed = normalizeCalendarDate(item?.date);
        if (!parsed) continue;
        const title = core_text.normalizeText(item?.title, 48);
        if (!title) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_FUTURE_${String(out.length + 1).padStart(2, '0')}`),
            status: CALENDAR_STATUS.FUTURE,
            date: parsed.date,
            mmdd: parsed.mmdd,
            title,
            tags: normalizeCalendarTags(item?.tags, '设定日'),
            note: '',
            summary: '',
            sourceKind: 'world-setting',
            sourceLabel: core_text.normalizeText(item?.sourceLabel, 120) || '世界设定',
            sourceMemoryIds: [],
            sourceMemoryAnchor: '',
            recurring: item?.recurring === true || !parsed.hasYear,
        });
    }
    return out;
}

function normalizeStickyNotes(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const item of raw.slice(0, 8)) {
        const kind = item?.kind === CALENDAR_NOTE_KIND.SPECIAL ? CALENDAR_NOTE_KIND.SPECIAL : CALENDAR_NOTE_KIND.MEMO;
        const sourceType = item?.sourceType === CALENDAR_NOTE_SOURCE.SETTING ? CALENDAR_NOTE_SOURCE.SETTING : CALENDAR_NOTE_SOURCE.ARCHIVE;
        const title = core_text.normalizeText(item?.title, 24) || (kind === CALENDAR_NOTE_KIND.SPECIAL ? '特别备注' : '便签');
        const text = core_text.normalizeText(item?.text, 180);
        if (!text) continue;
        const textKey = folded(text);
        if (!textKey || seen.has(textKey)) continue;
        if (sourceType === CALENDAR_NOTE_SOURCE.ARCHIVE) {
            const ref = core_evidence.normalizeMemoryReference(
                item?.sourceMemoryIds,
                item?.sourceMemoryAnchor,
                `${title}\n${text}\n${core_text.normalizeText(item?.sourceMemoryAnchor, 160)}`,
                memoryBank,
                1,
            );
            if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
            const memory = resolveAnchoredMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
            if (!memory) continue;
            out.push({
                id: core_text.safeId(item?.id, `CAL_NOTE_${String(out.length + 1).padStart(2, '0')}`),
                kind, sourceType, title, text,
                sourceKind: 'archive-note',
                sourceLabel: '剧情档案',
                sourceMemoryIds: ref.sourceMemoryIds,
                sourceMemoryAnchor: ref.sourceMemoryAnchor,
            });
        } else {
            const sourceLabel = core_text.normalizeText(item?.sourceLabel, 80) || '角色 / 世界设定';
            out.push({
                id: core_text.safeId(item?.id, `CAL_NOTE_${String(out.length + 1).padStart(2, '0')}`),
                kind, sourceType, title, text,
                sourceKind: 'world-setting-note',
                sourceLabel,
                sourceMemoryIds: [],
                sourceMemoryAnchor: '',
            });
        }
        seen.add(textKey);
        if (out.length >= 6) break;
    }
    return out;
}

function normalizeMoodNotes(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const item of raw.slice(0, 5)) {
        const text = core_text.normalizeText(item?.text, 220);
        if (!text || text.length < 8) continue;
        const ref = core_evidence.normalizeMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            `${text}\n${core_text.normalizeText(item?.sourceMemoryAnchor, 160)}`,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        const memory = resolveAnchoredMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
        if (!memory) continue;
        const key = folded(text);
        if (!key || seen.has(key)) continue;
        const parsed = normalizeCalendarDate(memory?.date);
        out.push({
            id: core_text.safeId(item?.id, `CAL_MOOD_${String(out.length + 1).padStart(2, '0')}`),
            text,
            date: parsed?.date || '',
            sourceKind: 'archive-mood',
            sourceLabel: '剧情档案 · 角色随笔',
            sourceMemoryIds: ref.sourceMemoryIds,
            sourceMemoryAnchor: ref.sourceMemoryAnchor,
        });
        seen.add(key);
        if (out.length >= 3) break;
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

export function calendarMonthKey(item) {
    const parsed = normalizeCalendarDate(item?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return '';
    const mm = String(parsed.month).padStart(2, '0');
    return parsed.hasYear ? `${String(parsed.year).padStart(4, '0')}-${mm}` : `annual-${mm}`;
}

export function calendarEntryMatchesMonth(item, monthKey) {
    const parsed = normalizeCalendarDate(item?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return false;
    const match = String(monthKey || '').match(/^(?:(\d{4})|(annual))-(0[1-9]|1[0-2])$/);
    if (!match) return false;
    const selectedYear = match[1] ? Number(match[1]) : 0;
    const selectedMonth = Number(match[3]);
    if (parsed.month !== selectedMonth) return false;
    if (!selectedYear) return !parsed.hasYear;
    return !parsed.hasYear || parsed.year === selectedYear;
}

export function calendarDateKeyForMonth(item, monthKey) {
    if (!calendarEntryMatchesMonth(item, monthKey)) return '';
    const parsed = normalizeCalendarDate(item?.date, { allowPending: true });
    if (!parsed || parsed.date === '待定') return '';
    const match = String(monthKey || '').match(/^(?:(\d{4})|(annual))-(0[1-9]|1[0-2])$/);
    const day = String(parsed.day).padStart(2, '0');
    if (match?.[1]) return `${match[1]}/${match[3]}/${day}`;
    return `${match?.[3] || String(parsed.month).padStart(2, '0')}/${day}`;
}

export function defaultCalendarMonth(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const pastWithYear = list
        .filter(item => item.status === CALENDAR_STATUS.PAST)
        .map(item => ({ item, parsed: normalizeCalendarDate(item?.date) }))
        .filter(row => row.parsed?.hasYear)
        .sort((a, b) => b.parsed.sortKey - a.parsed.sortKey);
    if (pastWithYear.length) return calendarMonthKey(pastWithYear[0].item);
    const promisedWithYear = list
        .filter(item => item.status === CALENDAR_STATUS.PROMISED)
        .map(item => ({ item, parsed: normalizeCalendarDate(item?.date, { allowPending: true }) }))
        .filter(row => row.parsed?.hasYear)
        .sort((a, b) => a.parsed.sortKey - b.parsed.sortKey);
    if (promisedWithYear.length) return calendarMonthKey(promisedWithYear[0].item);
    return list.map(calendarMonthKey).find(Boolean) || '';
}

export function normalizeCalendar(data, memoryBank) {
    const past = normalizePastMarkedEntries(data?.past, memoryBank);
    const promised = normalizePromisedEntries(data?.promised, memoryBank);
    const future = normalizeFutureEntries(data?.future);
    const stickyNotes = normalizeStickyNotes(data?.stickyNotes, memoryBank);
    const moodNotes = normalizeMoodNotes(data?.moodNotes, memoryBank);
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
        calendarVersion: core_constants.CALENDAR_SESSION_VERSION,
        title: core_text.normalizeText(data?.title, 120) || '两个人的日历',
        entries: entries.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
        stickyNotes,
        moodNotes,
        selectedMonth: defaultCalendarMonth(entries),
        selectedDateKey: '',
        generatedAt: Date.now(),
    };
}
