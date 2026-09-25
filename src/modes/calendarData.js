import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_presentExpression from '../core/presentExpression.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import { CALENDAR_LEGACY_PAGE_KEY, CALENDAR_NOTE_KIND, CALENDAR_NOTE_SOURCE, CALENDAR_STATUS, calendarEntryPageKey, calendarPageKeyForDate, createCalendarDayPage, ensureCalendarDayPage, ensureUniqueCalendarEntryIds, ensureUniqueCalendarPageItems, folded, normalizeCalendarDate, normalizeCalendarPageCollections, normalizeFutureEntries, normalizeHolidayCards, normalizePastMarkedEntries, normalizePromisedEntries, normalizeStickyNotes, pageMetaForKey, resolveAnchoredDatedMemory, resolveAnchoredMemory, storyCalendarDate } from './calendarBasics.js';
// 日历数据：条目键与月份、旧会话迁移、刷新合并、整体规范化与进度
// 从 modes/calendar.js 原样搬出（重构阶段 2），声明文本一字未改；modes/calendar.js 仍转发原有导出。

function normalizeMoodNotes(value, memoryBank, { entries = [], currentDate = '' } = {}) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 5)) {
        const textMode = core_text.normalizeText(item?.textMode, 40).toLowerCase();
        const ref = core_evidence.normalizeExactMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            memoryBank,
            1,
        );
        const memory = ref.sourceMemoryIds.length && ref.sourceMemoryAnchor
            ? resolveAnchoredMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor) : null;
        let text = '';
        let presentExpression = null;
        let evidenceMode = 'persona-present';
        if (textMode === 'present-expression') {
            presentExpression = core_presentExpression.normalizePresentExpression(item?.presentExpression, {
                relationshipTier: core_presentExpression.relationshipExpressionTier(memoryBank),
            });
            text = core_presentExpression.renderPresentExpressionText(presentExpression);
            evidenceMode = 'present-structured';
        } else if (textMode === 'evidence-excerpt') {
            if (!memory) continue;
            const requestedText = core_text.normalizeText(item?.text, 220);
            if (requestedText && folded(ref.sourceMemoryAnchor, 240).includes(folded(requestedText, 440))) text = requestedText;
            evidenceMode = 'memory-anchor-excerpt';
        } else if (textMode === 'persona-expression') {
            text = core_text.normalizeText(item?.text, 220);
            // Free page-corner prose is a present/persona expression. It may not turn an
            // unanchored shared past into a calendar fact.
            if (text && core_narrativeAuthority.narrativeClaimsSharedHistory(text, { userName: memoryBank?.userName })) continue;
        }
        if (!text || !folded(text)) continue;
        const parsed = memory ? normalizeCalendarDate(memory?.date) : null;
        const isPersona = evidenceMode === 'persona-present' || !memory && evidenceMode === 'present-structured';
        const targetId = core_text.safeId(item?.calendarEntryId, '');
        const targets = entries.filter(entry => entry.id === targetId
            || targetId && entry.calendarEntrySourceId === targetId);
        const target = targets.length === 1 ? targets[0] : null;
        // Only a locally validated calendar entry or the locally captured current day
        // chooses the page. Provider date strings cannot create or move historical dates.
        const date = isPersona ? (target?.date || normalizeCalendarDate(currentDate)?.date || '待定') : parsed?.date || '';
        if (isPersona && !normalizeCalendarDate(date, { allowPending: true })) continue;
        out.push({
            id: core_text.safeId(item?.id, `CAL_MOOD_${String(out.length + 1).padStart(2, '0')}`),
            text,
            textMode: evidenceMode === 'persona-present' ? 'persona-expression' : textMode,
            presentExpression,
            evidenceMode,
            date,
            calendarEntryId: isPersona ? target?.id || '' : targetId,
            sourceKind: isPersona ? 'persona-mood' : 'archive-mood',
            sourceLabel: isPersona ? '角色人设 · 此刻随笔' : '剧情档案 · 角色随笔',
            sourceMemoryIds: !isPersona && memory ? ref.sourceMemoryIds : [],
            sourceMemoryAnchor: !isPersona && memory ? ref.sourceMemoryAnchor : '',
        });
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

function calendarItemEvidenceMatches(entry, item) {
    const entryIds = new Set(core_text.cleanArray(entry?.sourceMemoryIds, 16, 40));
    const itemIds = core_text.cleanArray(item?.sourceMemoryIds, 16, 40);
    if (!itemIds.length || !itemIds.some(id => entryIds.has(id))) return false;
    const entryAnchor = folded(entry?.sourceMemoryAnchor);
    const itemAnchor = folded(item?.sourceMemoryAnchor);
    return !!entryAnchor && entryAnchor === itemAnchor;
}

function calendarSupplementPageKey(item, entries, memoryBank, { legacy = false } = {}) {
    const explicitId = core_text.safeId(item?.calendarEntryId, '');
    const personaMood = item?.sourceKind === 'persona-mood'
        && ['persona-present', 'present-structured'].includes(item?.evidenceMode);
    if (personaMood) {
        const target = entries.filter(entry => entry.id === explicitId);
        if (target.length === 1) return calendarEntryPageKey(target[0]);
        // date was assigned locally at generation; legacy records keep their stored page.
        if (normalizeCalendarDate(item.date, { allowPending: true })) return calendarPageKeyForDate(item.date, { pendingId: item.id });
        return CALENDAR_LEGACY_PAGE_KEY;
    }
    if (explicitId) {
        const explicitMatches = entries.filter(entry => (
            entry.id === explicitId
            || core_text.safeId(entry?.calendarEntrySourceId, entry?.id) === explicitId
        ));
        if (explicitMatches.length === 1
            && (item?.sourceType === CALENDAR_NOTE_SOURCE.SETTING
                || calendarItemEvidenceMatches(explicitMatches[0], item))) {
            return calendarEntryPageKey(explicitMatches[0]);
        }
    }

    const evidenceMatches = entries.filter(entry => calendarItemEvidenceMatches(entry, item));
    if (evidenceMatches.length === 1) return calendarEntryPageKey(evidenceMatches[0]);

    if (item?.sourceType !== CALENDAR_NOTE_SOURCE.SETTING) {
        const anchored = resolveAnchoredDatedMemory(memoryBank, item?.sourceMemoryIds, item?.sourceMemoryAnchor);
        if (anchored) return calendarPageKeyForDate(anchored.parsed.date, { pendingId: item?.id });
    } else {
        const explicitDate = normalizeCalendarDate(item?.date, { allowPending: true });
        if (explicitDate) return calendarPageKeyForDate(explicitDate.date, { pendingId: item?.id });
    }
    return legacy ? CALENDAR_LEGACY_PAGE_KEY : CALENDAR_LEGACY_PAGE_KEY;
}

function normalizeCalendarDrafts(value) {
    return (Array.isArray(value) ? value : []).slice(0, 24).map((item, index) => {
        const text = core_text.normalizeText(typeof item === 'string' ? item : item?.text, 1200);
        if (!text) return null;
        return {
            id: core_text.safeId(typeof item === 'object' ? item?.id : '', `CAL_DRAFT_${String(index + 1).padStart(2, '0')}`),
            text,
            createdAt: Math.max(0, Number(typeof item === 'object' ? item?.createdAt : 0) || 0),
        };
    }).filter(Boolean);
}

function normalizeCalendarManualTodos(value) {
    return (Array.isArray(value) ? value : []).slice(0, 32).map((item, index) => {
        const title = core_text.normalizeText(item?.title, 120);
        if (!title) return null;
        return {
            id: core_text.safeId(item?.id, `CAL_TODO_${String(index + 1).padStart(2, '0')}`),
            title,
            completed: item?.completed === true,
            origin: 'user',
        };
    }).filter(Boolean);
}

function boundedLegacyStickyNotes(value) {
    return (Array.isArray(value) ? value : []).slice(0, 24).map((item, index) => {
        const text = core_text.normalizeText(item?.text, 180);
        if (!text) return null;
        const kind = item?.kind === CALENDAR_NOTE_KIND.SPECIAL ? CALENDAR_NOTE_KIND.SPECIAL : CALENDAR_NOTE_KIND.MEMO;
        const sourceType = item?.sourceType === CALENDAR_NOTE_SOURCE.SETTING ? CALENDAR_NOTE_SOURCE.SETTING : CALENDAR_NOTE_SOURCE.ARCHIVE;
        const evidenceMode = ['memory-excerpt', 'setting-excerpt'].includes(item?.evidenceMode) ? item.evidenceMode : 'legacy-unverified';
        return {
            id: core_text.safeId(item?.id, `CAL_NOTE_${String(index + 1).padStart(2, '0')}`),
            kind,
            sourceType,
            title: core_text.normalizeText(item?.title, 24) || (kind === CALENDAR_NOTE_KIND.SPECIAL ? '特别备注' : '便签'),
            text,
            date: core_text.normalizeText(item?.date, 40),
            calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
            sourceKind: core_text.normalizeText(item?.sourceKind, 60),
            sourceLabel: core_text.normalizeText(item?.sourceLabel, 120),
            sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 16, 40),
            sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
            sourceEvidence: core_text.normalizeText(item?.sourceEvidence, 800),
            evidenceMode,
            legacyEvidenceUnverified: evidenceMode === 'legacy-unverified' || item?.legacyEvidenceUnverified === true,
            legacyUnassigned: item?.legacyUnassigned === true,
        };
    }).filter(Boolean);
}

function boundedLegacyMoodNotes(value) {
    return (Array.isArray(value) ? value : []).slice(0, 16).map((item, index) => {
        const text = core_text.normalizeText(item?.text, 220);
        if (!text) return null;
        const evidenceMode = ['memory-anchor-excerpt', 'present-structured', 'persona-present'].includes(item?.evidenceMode) ? item.evidenceMode : 'legacy-unverified';
        return {
            id: core_text.safeId(item?.id, `CAL_MOOD_${String(index + 1).padStart(2, '0')}`),
            text,
            date: core_text.normalizeText(item?.date, 40),
            calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
            sourceKind: core_text.normalizeText(item?.sourceKind, 60),
            sourceLabel: core_text.normalizeText(item?.sourceLabel, 120),
            sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 16, 40),
            sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
            textMode: ['present-expression', 'evidence-excerpt', 'persona-expression'].includes(item?.textMode) ? item.textMode : 'legacy-free-text',
            presentExpression: item?.presentExpression && typeof item.presentExpression === 'object'
                ? core_presentExpression.normalizePresentExpression(item.presentExpression) : null,
            evidenceMode,
            legacyEvidenceUnverified: evidenceMode === 'legacy-unverified' || item?.legacyEvidenceUnverified === true,
            legacyUnassigned: item?.legacyUnassigned === true,
        };
    }).filter(Boolean);
}

function buildCalendarDayPages(entries, stickyNotes, moodNotes, memoryBank, holidayCards = [], { legacy = false, currentDate = '' } = {}) {
    const pages = Object.create(null);
    for (const entry of entries) {
        const page = ensureCalendarDayPage(pages, calendarEntryPageKey(entry));
        if (page && !page.entryIds.includes(entry.id)) page.entryIds.push(entry.id);
    }
    for (const note of boundedLegacyStickyNotes(stickyNotes)) {
        const key = calendarSupplementPageKey(note, entries, memoryBank, { legacy });
        const page = ensureCalendarDayPage(pages, key);
        if (!page) continue;
        page.stickyNotes.push(key === CALENDAR_LEGACY_PAGE_KEY ? { ...note, legacyUnassigned: true } : note);
    }
    for (const note of boundedLegacyMoodNotes(moodNotes)) {
        const key = calendarSupplementPageKey(note, entries, memoryBank, { legacy });
        const page = ensureCalendarDayPage(pages, key);
        if (!page) continue;
        page.moodNotes.push(key === CALENDAR_LEGACY_PAGE_KEY ? { ...note, legacyUnassigned: true } : note);
    }
    for (const card of normalizeHolidayCards(holidayCards, entries, { currentDate, allowStored: legacy, memoryBank })) {
        const entry = entries.find(item => item.id === card.calendarEntryId);
        const page = entry ? ensureCalendarDayPage(pages, calendarEntryPageKey(entry)) : null;
        if (page) page.holidayCards.push(card);
    }
    for (const page of Object.values(pages)) normalizeCalendarPageCollections(page);
    return pages;
}

function normalizeCalendarDayPages(value, entries, memoryBank) {
    const pages = Object.create(null);
    const validEntryIds = new Set(entries.map(item => item.id));
    // Date pages contain user-owned drafts and To-Do rows, so never truncate the page map during
    // normalization. The shared 12 MB cache boundary already limits persisted input size; silently
    // slicing here would destroy the oldest/newest valid day once a long-running calendar grew.
    for (const [rawKey, rawPage] of Object.entries(value && typeof value === 'object' ? value : {})) {
        const meta = pageMetaForKey(rawKey);
        if (!meta || !rawPage || typeof rawPage !== 'object') continue;
        const page = createCalendarDayPage(meta.key);
        page.entryIds = [...new Set(core_text.cleanArray(rawPage.entryIds, 64, 120).filter(id => validEntryIds.has(id)))];
        page.drafts = normalizeCalendarDrafts(rawPage.drafts);
        page.stickyNotes = boundedLegacyStickyNotes(rawPage.stickyNotes);
        page.moodNotes = boundedLegacyMoodNotes(rawPage.moodNotes);
        page.holidayCards = normalizeHolidayCards(rawPage.holidayCards, entries, { allowStored: true, memoryBank }).filter(card => calendarEntryPageKey(entries.find(item => item.id === card.calendarEntryId)) === meta.key);
        page.manualTodos = normalizeCalendarManualTodos(rawPage.manualTodos);
        normalizeCalendarPageCollections(page);
        pages[meta.key] = page;
    }
    for (const entry of entries) {
        const page = ensureCalendarDayPage(pages, calendarEntryPageKey(entry));
        if (page && !page.entryIds.includes(entry.id)) page.entryIds.push(entry.id);
    }
    return pages;
}

export function migrateCalendarSession(session, memoryBank) {
    if (!session || session.kind !== core_constants.MODE.CALENDAR || !Array.isArray(session.entries)) return null;
    const entries = ensureUniqueCalendarEntryIds(
        structuredClone(session.entries).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
    );
    const existingPages = Number(session.calendarVersion) >= 5 && session.dayPages && typeof session.dayPages === 'object';
    const dayPages = existingPages
        ? normalizeCalendarDayPages(session.dayPages, entries, memoryBank)
        : buildCalendarDayPages(entries, session.stickyNotes, session.moodNotes, memoryBank, [], { legacy: true });
    const selectedRaw = core_text.normalizeText(session.selectedDateKey, 160);
    const selectedDateKey = pageMetaForKey(selectedRaw)?.key
        || calendarPageKeyForDate(selectedRaw, { pendingId: selectedRaw.replace(/^pending:/, '') });
    const storyDate = storyCalendarDate(memoryBank);
    const migrated = {
        ...structuredClone(session),
        storyDate,
        selectedMonth: !session.dateBasis && !selectedDateKey && storyDate
            ? calendarMonthKey({ date: storyDate }) : session.selectedMonth,
        dateBasis: session.dateBasis || 'story',
        calendarVersion: core_constants.CALENDAR_SESSION_VERSION,
        entries,
        dayPages,
        selectedDateKey: selectedDateKey && pageMetaForKey(selectedDateKey) ? selectedDateKey : '',
    };
    delete migrated.stickyNotes;
    delete migrated.moodNotes;
    return migrated;
}

function mergeCalendarItems(existing, incoming, prefix, semanticKey) {
    return ensureUniqueCalendarPageItems(
        [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])],
        prefix,
        { semanticKey, dedupeSemantic: true },
    );
}

function mergeHolidayCards(existing, incoming, entries) {
    const allowed = new Set((Array.isArray(entries) ? entries : []).filter(item => item?.occasionType === 'holiday').map(item => item.id));
    const byEntry = new Map();
    for (const card of Array.isArray(existing) ? existing : []) if (allowed.has(card?.calendarEntryId)) byEntry.set(card.calendarEntryId, structuredClone(card));
    for (const card of Array.isArray(incoming) ? incoming : []) if (allowed.has(card?.calendarEntryId)) byEntry.set(card.calendarEntryId, structuredClone(card));
    return [...byEntry.values()].slice(0, 12);
}

export function mergeCalendarRefresh(previous, fresh, memoryBank) {
    const oldSession = migrateCalendarSession(previous, memoryBank);
    const next = migrateCalendarSession(fresh, memoryBank);
    if (!oldSession) return next;
    if (!next) return oldSession;
    for (const [key, oldPage] of Object.entries(oldSession.dayPages || {})) {
        const target = ensureCalendarDayPage(next.dayPages, key);
        if (!target) continue;
        target.drafts = mergeCalendarItems(oldPage.drafts, target.drafts, 'CAL_DRAFT', item => folded(item?.text)).slice(0, 24);
        target.manualTodos = mergeCalendarItems(oldPage.manualTodos, target.manualTodos, 'CAL_TODO', item => folded(item?.title)).slice(0, 32);
        target.stickyNotes = mergeCalendarItems(
            oldPage.stickyNotes,
            target.stickyNotes,
            'CAL_NOTE',
            item => `${item?.kind || CALENDAR_NOTE_KIND.MEMO}|${folded(item?.text)}`,
        ).slice(0, 24);
        target.moodNotes = mergeCalendarItems(oldPage.moodNotes, target.moodNotes, 'CAL_MOOD', item => folded(item?.text)).slice(0, 16);
        target.holidayCards = mergeHolidayCards(oldPage.holidayCards, target.holidayCards, next.entries);
    }
    if (oldSession.selectedMonth) next.selectedMonth = oldSession.selectedMonth;
    if (oldSession.selectedDateKey && next.dayPages[oldSession.selectedDateKey]) next.selectedDateKey = oldSession.selectedDateKey;
    return next;
}

export function normalizeCalendar(data, memoryBank, options = {}) {
    const past = normalizePastMarkedEntries(data?.past, memoryBank);
    const promised = normalizePromisedEntries(data?.promised, memoryBank);
    const future = normalizeFutureEntries(data?.future, {
        futureEvidenceText: options.futureEvidenceText || options.worldEvidenceText,
        holidayEvidenceText: options.holidayEvidenceText || options.worldEvidenceText,
    });
    const stickyNotes = normalizeStickyNotes(data?.stickyNotes, memoryBank, {
        controlledEvidence: options.futureEvidenceText || options.worldEvidenceText,
    });
    const entries = ensureUniqueCalendarEntryIds([...past, ...promised, ...future]);
    const currentDate = options.dateBasis === 'legacy-local'
        ? (normalizeCalendarDate(options.currentDate)?.date || '') : storyCalendarDate(memoryBank);
    const moodNotes = normalizeMoodNotes(data?.moodNotes, memoryBank, { entries, currentDate });
    const holidayCards = normalizeHolidayCards(data?.holidayCards, entries, { currentDate, memoryBank });
    const statusRank = { past: 0, promised: 1, future: 2 };
    entries.sort((a, b) => {
        const da = normalizeCalendarDate(a.date, { allowPending: true })?.sortKey ?? 99999999;
        const db = normalizeCalendarDate(b.date, { allowPending: true })?.sortKey ?? 99999999;
        return da - db || (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || String(a.title).localeCompare(String(b.title), 'zh-CN');
    });
    const dayPages = buildCalendarDayPages(entries, stickyNotes, moodNotes, memoryBank, holidayCards, { currentDate });
    return {
        kind: core_constants.MODE.CALENDAR,
        calendarVersion: core_constants.CALENDAR_SESSION_VERSION,
        title: core_text.normalizeText(data?.title, 120) || '两个人的日历',
        entries: entries.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
        dayPages,
        dateBasis: options.dateBasis === 'legacy-local' ? 'legacy-local' : 'story',
        storyDate: options.dateBasis === 'legacy-local' ? '' : currentDate,
        selectedMonth: calendarMonthKey({ date: currentDate }) || defaultCalendarMonth(entries),
        selectedDateKey: currentDate ? calendarPageKeyForDate(currentDate) : '',
        generatedAt: Date.now(),
    };
}

export function projectCalendarProgress({ segments, memoryBank, previousSession, frozenInputs = {}, operation = {}, createdAt }) {
    const keys = ['past', 'promised', 'future', 'stickyNotes', 'moodNotes', 'holidayCards'];
    const segment = segments.findLast(item => keys.some(key => item.items('/' + key).length));
    if (!segment) return null;
    const raw = Object.fromEntries(keys.map(key => [key, segment.items('/' + key)]));
    if (segment.has('/title')) raw.title = segment.value.title;
    const envelope = frozenInputs['context:calendar'] || '';
    const fresh = normalizeCalendar(raw, memoryBank, {
        currentDate: operation.calendarDate || '', dateBasis: operation.calendarDate && operation.calendarTimeBasis !== 'story' ? 'legacy-local' : 'story',
        futureEvidenceText: core_worldPresentation.controlledCalendarEvidence(envelope),
        holidayEvidenceText: core_worldPresentation.controlledSettingEvidence(envelope),
    });
    const hasNotes = Object.values(fresh.dayPages).some(page => ['stickyNotes', 'moodNotes', 'holidayCards'].some(key => page[key]?.length));
    if (!fresh.entries.length && !hasNotes) return null;
    if (Number.isFinite(createdAt)) fresh.generatedAt = createdAt;
    if (!previousSession) return fresh;
    const entries = new Map((previousSession.entries || []).map(item => [item.id, structuredClone(item)]));
    for (const item of fresh.entries) entries.set(item.id, item);
    // Rebuild page membership against the whole readable entry collection before
    // merging old notes/cards, so a partial refresh cannot strand an old entry.
    return mergeCalendarRefresh(previousSession, { ...fresh, entries: [...entries.values()] }, memoryBank);
}
