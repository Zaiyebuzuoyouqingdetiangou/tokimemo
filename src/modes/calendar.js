// Heartbeat Memories r40 calendar mode.
// Calendar is a derived, evidence-gated personal calendar. It intentionally does NOT mirror every
// dated archive memory. The model may nominate only calendar-worthy moments; the plugin validates
// their archive evidence and derives past dates from the anchored memory instead of trusting model dates.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_presentExpression from '../core/presentExpression.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';

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

export const CALENDAR_LEGACY_PAGE_KEY = 'legacy:unassigned';

export const HOLIDAY_CARD_EXPRESSIONS = Object.freeze(['text', 'drawing', 'writing', 'mixed', 'minimal']);
export const HOLIDAY_CARD_MOTIFS = Object.freeze(['celestial', 'botanical', 'light', 'ribbon', 'snow', 'wave', 'cloud', 'flame', 'petal', 'leaf', 'spark', 'geometric']);
export const HOLIDAY_CARD_PALETTES = Object.freeze(['paper', 'dawn', 'night', 'jade', 'rose', 'frost', 'festival']);
export const HOLIDAY_CARD_MEDIA = Object.freeze(['card', 'paper', 'letter', 'scroll', 'folio', 'screen']);
export const HOLIDAY_CARD_STROKES = Object.freeze(['fine', 'soft', 'bold', 'dry', 'round']);
export const HOLIDAY_CARD_FLOWS = Object.freeze(['horizontal', 'vertical']);

const CALENDAR_PAGE_KEY_RE = /^(?:date:\d{4}\/\d{2}\/\d{2}|annual:\d{2}\/\d{2}|pending:[A-Za-z0-9_-]{1,120}|legacy:unassigned)$/;

function pageMetaForKey(key) {
    const safeKey = core_text.normalizeText(key, 160);
    if (!CALENDAR_PAGE_KEY_RE.test(safeKey)) return null;
    if (safeKey === CALENDAR_LEGACY_PAGE_KEY) return { key: safeKey, kind: 'legacy', date: '' };
    if (safeKey.startsWith('pending:')) return { key: safeKey, kind: 'pending', date: '待定' };
    if (safeKey.startsWith('annual:')) return { key: safeKey, kind: 'annual', date: safeKey.slice(7) };
    return { key: safeKey, kind: 'date', date: safeKey.slice(5) };
}

export function calendarPageKeyForDate(value, { pendingId = '' } = {}) {
    const parsed = normalizeCalendarDate(value, { allowPending: true });
    if (!parsed) return '';
    if (parsed.date === '待定') {
        const id = core_text.safeId(pendingId, 'UNASSIGNED');
        return `pending:${id}`;
    }
    return parsed.hasYear ? `date:${parsed.date}` : `annual:${parsed.date}`;
}

export function calendarEntryPageKey(item) {
    return calendarPageKeyForDate(item?.date, { pendingId: item?.id });
}

export function createCalendarDayPage(key) {
    const meta = pageMetaForKey(key);
    if (!meta) return null;
    return {
        ...meta,
        entryIds: [],
        drafts: [],
        stickyNotes: [],
        moodNotes: [],
        holidayCards: [],
        manualTodos: [],
    };
}

function ensureCalendarDayPage(pages, key) {
    if (!key) return null;
    if (!pages[key]) pages[key] = createCalendarDayPage(key);
    return pages[key] || null;
}

export function calendarDayPage(session, key) {
    const safeKey = core_text.normalizeText(key, 160);
    if (!CALENDAR_PAGE_KEY_RE.test(safeKey)) return null;
    return session?.dayPages && typeof session.dayPages === 'object' ? session.dayPages[safeKey] || null : null;
}

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

export function currentCalendarDate(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) return '';
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function calendarDateEvidenceVariants(parsed) {
    if (!parsed || parsed.date === '待定') return [];
    const { year, month, day } = parsed;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return year ? [
        `${year}/${mm}/${dd}`, `${year}/${month}/${day}`, `${year}-${mm}-${dd}`, `${year}-${month}-${day}`,
        `${year}.${mm}.${dd}`, `${year}.${month}.${day}`, `${year}年${month}月${day}日`, `${year}年${mm}月${dd}日`,
    ] : [
        `${mm}/${dd}`, `${month}/${day}`, `${mm}-${dd}`, `${month}-${day}`,
        `${mm}.${dd}`, `${month}.${day}`, `${month}月${day}日`, `${mm}月${dd}日`,
    ];
}

export function calendarDateMatchesToday(value, today = currentCalendarDate()) {
    const parsed = normalizeCalendarDate(value);
    const current = normalizeCalendarDate(today);
    if (!parsed || !current?.hasYear) return false;
    if (parsed.month !== current.month || parsed.day !== current.day) return false;
    return !parsed.hasYear || parsed.year === current.year;
}

function memoryAnchorTerms(memory) {
    return [
        core_text.normalizeText(memory?.title, 120),
        ...core_text.cleanArray(memory?.anchors, 8, 120),
    ].filter(Boolean);
}

function folded(value, max = 180) {
    return core_text.normalizeText(value, max).replace(/\s+/g, '').toLowerCase();
}

function uniqueCalendarId(baseValue, fallback, used) {
    const base = core_text.safeId(baseValue, fallback);
    let candidate = base;
    let suffixNumber = 2;
    while (used.has(candidate)) {
        const suffix = `_${suffixNumber}`;
        candidate = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
        suffixNumber += 1;
    }
    used.add(candidate);
    return candidate;
}

function ensureUniqueCalendarEntryIds(value) {
    const used = new Set();
    return (Array.isArray(value) ? value : []).map((item, index) => {
        const fallback = `CAL_ENTRY_${String(index + 1).padStart(2, '0')}`;
        const currentId = core_text.safeId(item?.id, fallback);
        const sourceId = core_text.safeId(item?.calendarEntrySourceId, currentId);
        return {
            ...structuredClone(item),
            id: uniqueCalendarId(currentId, fallback, used),
            // Keep the pre-uniquing identifier so a legacy calendarEntryId can be
            // resolved only when that source identifier is genuinely unambiguous.
            calendarEntrySourceId: sourceId,
        };
    });
}

function ensureUniqueCalendarPageItems(value, prefix, { semanticKey = null, dedupeSemantic = false } = {}) {
    const usedIds = new Set();
    const seenSemantic = new Set();
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
        const semantic = semanticKey ? semanticKey(item) : '';
        if (dedupeSemantic && semantic && seenSemantic.has(semantic)) continue;
        if (semantic) seenSemantic.add(semantic);
        const fallback = `${prefix}_${String(out.length + 1).padStart(2, '0')}`;
        out.push({
            ...structuredClone(item),
            id: uniqueCalendarId(item?.id, fallback, usedIds),
        });
    }
    return out;
}

function normalizeCalendarPageCollections(page) {
    page.drafts = ensureUniqueCalendarPageItems(page.drafts, 'CAL_DRAFT');
    page.manualTodos = ensureUniqueCalendarPageItems(page.manualTodos, 'CAL_TODO');
    page.stickyNotes = ensureUniqueCalendarPageItems(page.stickyNotes, 'CAL_NOTE', {
        semanticKey: item => `${item?.kind || CALENDAR_NOTE_KIND.MEMO}|${folded(item?.text)}`,
        dedupeSemantic: true,
    });
    page.moodNotes = ensureUniqueCalendarPageItems(page.moodNotes, 'CAL_MOOD', {
        semanticKey: item => folded(item?.text),
        dedupeSemantic: true,
    });
    page.holidayCards = ensureUniqueCalendarPageItems(page.holidayCards, 'CAL_CARD', {
        semanticKey: item => core_text.safeId(item?.calendarEntryId, ''),
        dedupeSemantic: true,
    });
    return page;
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

function citedNarrativeEvidenceText(memoryBank, sourceMemoryIds) {
    const ids = new Set(core_text.cleanArray(sourceMemoryIds, 16, 40));
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .filter(memory => ids.has(core_text.normalizeText(memory?.id, 40)))
        .map(memory => [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].join('\n'))
        .join('\n');
}

function calendarEvidenceTitle(reference, memoryBank) {
    const memory = resolveAnchoredMemory(memoryBank, reference?.sourceMemoryIds, reference?.sourceMemoryAnchor);
    return core_text.normalizeText(memory?.title, 48)
        || core_text.normalizeText(reference?.sourceMemoryAnchor, 48)
        || '档案记事';
}

function explicitPromiseEvidence(value) {
    const clauses = core_text.normalizeText(value, 32000).split(/[。！？!?；;\n]+/u).map(item => item.trim()).filter(Boolean);
    const uncertain = /(?:也许|或许|可能|希望|想要|想过|有机会|如果可以|maybe|perhaps|might|hope|wish|would\s+like)/iu;
    const negated = /(?:不会|不再|(?:没有|并未|尚未|未曾|从未|没)(?:明确)?(?:答应|同意|约好|说好|约定|决定|预约|订好|定下)|取消|撤销|拒绝|否定|未达成|不(?:会|要|去|见|约)|\b(?:will\s+not|won't|would\s+not|wouldn't|(?:did\s+not|didn't|never|not)\s+(?:agree|promise|decide|book|schedule)|cancelled|canceled|declined|refused|no\s+agreement|not\s+agreed)\b)/iu;
    const positive = /(?:双方|两人|我们|咱们).{0,16}(?:约好|说好|约定|同意|决定|答应|预约|订好|定下|会|要)|(?:约好|说好|约定|共同决定|双方同意|彼此答应|已经预约|已经订好)|\bwe\b.{0,20}\b(?:agreed|promised|decided|booked|scheduled|will|shall|are\s+going\s+to)\b|\b(?:mutually\s+agreed|agreed\s+together)\b/iu;
    return clauses.filter(clause => !uncertain.test(clause) && !negated.test(clause) && positive.test(clause)).join('\n');
}

function promisedDateIsGrounded(parsed, sourceMemoryIds, memoryBank) {
    if (!parsed || parsed.date === '待定') return parsed?.date === '待定';
    // A memory's own record date is when the conversation happened, not necessarily the date
    // promised inside it. Only narrative evidence may prove the scheduled target date.
    const evidence = explicitPromiseEvidence(citedNarrativeEvidenceText(memoryBank, sourceMemoryIds));
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
        const requestedTitle = core_text.normalizeText(item?.title, 48);
        if (!requestedTitle) continue;
        const ref = core_evidence.normalizeExactMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        const anchored = resolveAnchoredDatedMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
        if (!anchored) continue;
        const title = calendarEvidenceTitle(ref, memoryBank);
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
        const requestedTitle = core_text.normalizeText(item?.title, 48);
        if (!requestedTitle) continue;
        const ref = core_evidence.normalizeExactMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        if (!explicitPromiseEvidence(citedNarrativeEvidenceText(memoryBank, ref.sourceMemoryIds))) continue;
        if (!promisedDateIsGrounded(parsed, ref.sourceMemoryIds, memoryBank)) continue;
        const title = calendarEvidenceTitle(ref, memoryBank);
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

function worldSettingEvidenceMatches(item, parsed, worldEvidenceText) {
    const evidence = folded(worldEvidenceText, 30000);
    const anchor = folded(item?.sourceEvidence, 260);
    const title = folded(item?.title);
    if (!evidence || !anchor || anchor.length < 4 || !title) return false;
    if (!evidence.includes(anchor) || !anchor.includes(title)) return false;
    return calendarDateEvidenceVariants(parsed).some(value => anchor.includes(folded(value)));
}

function holidaySemanticEvidenceMatches(item) {
    const title = core_text.normalizeText(item?.title, 120);
    const source = core_text.normalizeText(item?.sourceEvidence, 500);
    if (!title || !source) return false;
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Reject negation before considering either a familiar name or a positive relation. A suffix
    // such as “音乐节” merely names an event and cannot, by itself, establish a calendar holiday.
    const negated = new RegExp(`${escapedTitle}.{0,28}(?:(?:不是|并非|绝非|不属于|不算|仅仅?是|只是).{0,20}|(?:不|未|从未|并未|尚未|未曾|没有|不再).{0,14}(?:是|为|属于|成为|被视为|被列为|被称为|被认定为).{0,20})(?:节日|祭典|庆典|节庆)|${escapedTitle}.{0,28}(?:is\\s+(?:not|never|no)|isn't|isnt|is\\s+merely|does\\s+not\\s+count\\s+as|has\\s+never\\s+been|was\\s+never|is\\s+no\\s+longer|has\\s+not\\s+been|is\\s+not\\s+(?:considered|recognized)\\s+as).{0,24}(?:a\\s+)?(?:holiday|festival|holy\\s*day|feast\\s*day|festival[- ]themed)`, 'iu').test(source);
    if (negated) return false;
    // Even a familiar real-world name is not self-authenticating: a world book can say that
    // Christmas does not exist, or use “春节” as a magazine/shop name. Require this exact source
    // excerpt to classify the title as a holiday instead of maintaining a title whitelist.
    const explicitField = new RegExp(`(?:法定节日|传统节日|宗教节日|世界节日|节日|holiday|holy\\s*day)\\s*[:：=]\\s*.{0,12}${escapedTitle}`, 'iu').test(source);
    const directHoliday = new RegExp(`${escapedTitle}.{0,20}(?:是|为|乃|属于|被视为|被列为|被称为|is|serves\\s+as|counts\\s+as).{0,22}(?:(?:世界|国家|王国|帝国|族群|当地|全城|全国|法定|传统|宗教|正式|年度|一年一度|每年).{0,8})?(?:节日|庆祝日|圣日|斋日|岁首|(?:an?\\s+)?(?:annual\\s+|traditional\\s+|official\\s+|public\\s+|religious\\s+)?holiday|holy\\s*day)`, 'iu').test(source);
    const namedHoliday = new RegExp(`(?:节日|法定节日|传统节日|宗教节日|holiday|holy\\s*day).{0,12}(?:名为|叫作|称作|called|named).{0,10}${escapedTitle}`, 'iu').test(source);
    return explicitField || directHoliday || namedHoliday;
}

function normalizeFutureEntries(value, { futureEvidenceText = '', holidayEvidenceText = '' } = {}) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 24)) {
        const parsed = normalizeCalendarDate(item?.date);
        if (!parsed) continue;
        const title = core_text.normalizeText(item?.title, 48);
        if (!title) continue;
        const requestedOccasionType = ['holiday', 'birthday', 'anniversary', 'setting'].includes(item?.occasionType) ? item.occasionType : 'setting';
        const occasionType = requestedOccasionType === 'holiday' && !holidaySemanticEvidenceMatches({ ...item, title })
            ? 'setting'
            : requestedOccasionType;
        const evidenceText = occasionType === 'holiday' ? holidayEvidenceText : futureEvidenceText;
        if (!worldSettingEvidenceMatches(item, parsed, evidenceText)) continue;
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
            sourceLabel: '角色 / 世界设定（已核验）',
            sourceMemoryIds: [],
            sourceMemoryAnchor: '',
            recurring: item?.recurring === true || !parsed.hasYear,
            occasionType,
            worldEvidenceVerified: true,
            worldEvidenceRef: `world:${core_text.hashString(folded(item?.sourceEvidence))}`,
        });
    }
    return out;
}

function clampCardNumber(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(100, Math.round(number)));
}

export function holidayCardClaimsSharedHistory(value) {
    const text = core_text.normalizeText([
        value?.message,
        value?.calligraphy,
        value?.signature,
    ].filter(Boolean).join('\n'), 900);
    if (!text) return false;
    const historyPatterns = [
        /(?:去年|前年|往年|上次|那年|那天|那晚|那一晚|那次|当年|当时|曾经|从前|还记得|记得我们|初见|初次见面|第一次见面)/iu,
        /我们(?:曾经|已经|第一次|第一个|做过|去过|看过|度过|庆祝过|相遇|拥抱过|留下过|点亮过)/iu,
        /我(?:还|仍然?|一直).{0,24}(?:留着|保存|珍藏|记得|想起|忘不了|收着|戴着|放着|挂着)/iu,
        /(?:这|那).{0,12}(?:我们|一起).{0,20}(?:做的|去的|留下的|拥抱|灯笼|约定)/iu,
        // Chinese present-tense wishes such as “现在你牵着我的手就好” are valid card
        // copy. Require a completed/resultative marker or an attributive object instead of
        // treating every “你 + 动作 + 我” sentence as shared history.
        /你(?:亲手|曾经|那时)?(?:替|为|给|帮)?\s*我?.{0,10}(?:系|做|送|留|写|画|准备|撑|递|戴|挂|握|牵|抱|吻|买)(?:过|了)(?:的)?/iu,
        /你(?:亲手)?(?:替|为|给|帮)我(?:做|写|画|准备|买|留|织|刻|拍)(?:下|出|好|来)?的.{0,20}(?:画|信|礼物|花|灯笼|护身符|发簪|照片|相片|戒指|项链|手链|丝带|物件|东西)/iu,
        /你(?:亲手)?(?:写|寄|送|画|做|买|留|织|刻|拍)(?:来|给|过|下)?(?:我的?|的).{0,20}(?:信|画|礼物|花|灯笼|护身符|发簪|照片|相片|戒指|项链|手链|丝带|物件|东西)/iu,
        /你给我的.{0,20}(?:还|仍|一直|藏|留|在|戴|挂|放|收|保存|珍藏)/iu,
        /是你(?:亲手)?(?:做|写|画|买|送|留|准备|织|刻|拍)(?:给)?我的/iu,
        /你.{0,12}(?:给|替|为|帮)我.{0,14}(?:寄|写|织|缝|捡|唱|拍|系|送|做|画|带|背|包扎|救|赠|题|刻|买).{0,10}(?:的|过|了|后|好|上|下|来)/iu,
        /你.{0,12}(?:寄|写|织|缝|捡|唱|拍|系|送|做|画|带|背|包扎|救|赠|题|刻|买).{0,14}(?:(?:给|替|为)我.{0,10}(?:的|过|了|后|好|上|下|来)|我的)/iu,
        /你.{0,18}(?:寄|写|织|缝|捡|唱|拍|系|送|做|画|带|背|包扎|救|赠|题|刻|买)(?:给|上|下|来|好)?的/iu,
        /(?:旧|昔日|从前|当年|那时|那晚).{0,18}(?:信|明信片|围巾|贝壳|纽扣|红绳|书|照片|相片|戒指|手链|礼物)|(?:信|明信片|围巾|贝壳|纽扣|红绳|书|照片|相片|戒指|手链|礼物).{0,20}(?:还|仍|一直|至今|已经|翻旧|留着|藏着|摆着|挂着|戴着|收着|保存|珍藏)/iu,
        /(?:这|那)(?:场|次|天|晚|段).{0,28}你.{0,28}我/iu,
        /last\s+(?:year|spring|summer|autumn|fall|winter|month|week|night|holiday)|yesterday|\b\d+\s+(?:days?|weeks?|months?|years?)\s+ago\b|remember\s+when|when\s+we\s+(?:first|met)|our\s+first/iu,
        /we\s+(?:once|used\s+to|went|spent|celebrated|made|shared|were)|we.{0,28}(?:our\s+first|the\s+first)/iu,
        /i\s+(?:still|always|keep|remember).{0,36}\b(?:we|you)\b/iu,
        /the\s+\w+(?:\s+\w+){0,5}\s+we\s+(?:made|shared|kept)/iu,
        /(?:letter|gift|present|photo|picture|ring|necklace|bracelet|flower|ribbon|keepsake).{0,32}\byou\b.{0,28}(?:wrote|made|gave|sent|bought|left|held|kept|took|tied|painted|drew)/iu,
        /\byour\b.{0,20}(?:letter|gift|present|photo|picture|ring|necklace|bracelet|flower|keepsake).{0,28}(?:still|remain|kept|beside|drawer|wear|hold|have)/iu,
        /\byou\b.{0,32}(?:wrote|made|gave|sent|bought|kept|left|hung|tied|held|took|painted|drew).{0,24}(?:for\s+me|of\s+us|me|my\s+(?:wrist|hand|neck|finger)).{0,32}(?:still|remain|hang|keep|kept|beside|drawer|wear|hold|have)?/iu,
        /\b(?:i|we|you|the|this|that|my|our|a|an)\b.{0,56}\b(?:[a-z]+ed|met|gave|sent|wrote|made|took|found|sang|tied|knit|knitted|carried|left|held|kept|bought|wore|was|were)\b/iu,
        /\b(?:letter|postcard|scarf|shell|song|ribbon|book|note|bracelet|ring|gift|photo|picture|keepsake)\b.{0,40}\b(?:old|worn|faded|still|remains?|kept|saved|mailed|never\s+leaves?)\b/iu,
        /\b(?:from|by)\s+you\b.{0,28}\b(?:still|remains?|never|keep|wear|have|leaves?)\b/iu,
    ];
    if (historyPatterns.some(pattern => pattern.test(text))) return true;

    // Novel prose cannot be proven against Mxxx by an id alone. For new cards, fail closed on
    // personal clauses that are not explicitly framed as a current feeling, present action,
    // blessing, request or future wish. Short non-personal calligraphy remains available.
    const participant = /(?:你|我|我们|咱们|\b(?:you|i|me|my|we|us|our)\b)/iu;
    const presentOrWish = /(?:现在|此刻|今天|今日|今夜|当下|此时|这一刻|愿|祝|希望|请|吧|以后|未来|接下来|从今|正在|正要|会|只要|如果|无论|让我们|我(?:只)?(?:爱|喜欢|珍惜|在意|思念|想念|希望|愿意|觉得|感到)|我(?:只)?想(?:你|要|把|让|和)|你(?:是|在这里|正在|正|现在|此刻|今天|今夜|让)|我的(?:心|世界|目光|思念|愿望)|我们(?:会|要|正在|正|可以|现在|此刻|今天)|\b(?:now|today|tonight|this\s+(?:moment|day|night)|may|wish|hope|please|want|love|miss|care|feel|will|shall|always|every\s+day|you\s+are|i\s+(?:am|feel)|we\s+are|my\s+heart|as\s+long\s+as|if|let\s+us|let['’]?s)\b)/iu;
    const clauses = text.split(/[，,。！？!?；;\n]+/u).map(value => value.trim()).filter(Boolean);
    return clauses.some(clause => participant.test(clause) && !presentOrWish.test(clause));
}

function holidayAnchoredExcerpt(item, memoryBank) {
    const reference = core_evidence.normalizeExactMemoryReference(
        item?.sourceMemoryIds,
        item?.sourceMemoryAnchor,
        memoryBank,
        1,
    );
    if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) {
        return { reference: { sourceMemoryIds: [], sourceMemoryAnchor: '' }, message: '', calligraphy: '', signature: '' };
    }
    const anchor = folded(reference.sourceMemoryAnchor, 240);
    const supported = (value, max) => {
        const text = core_text.normalizeText(value, max);
        const needle = folded(text, max);
        return needle.length >= 2 && anchor.includes(needle) ? text : '';
    };
    const characterName = core_text.normalizeText(memoryBank?.characterName, 40);
    const requestedSignature = core_text.normalizeText(item?.signature, 40);
    return {
        reference,
        message: supported(item?.message, 360),
        calligraphy: supported(item?.calligraphy, 80),
        signature: requestedSignature && folded(requestedSignature, 80) === folded(characterName, 80) ? characterName : '',
    };
}

function holidayPresentExpression(item, expression, memoryBank) {
    const presentExpression = core_presentExpression.normalizePresentExpression(item?.presentExpression, {
        relationshipTier: core_presentExpression.relationshipExpressionTier(memoryBank),
    });
    const fullLines = core_presentExpression.renderPresentExpressionLines(presentExpression);
    const compact = core_presentExpression.renderPresentExpressionText(presentExpression, { compact: true });
    let message = '';
    let calligraphy = '';
    if (expression === 'text') message = fullLines.join('\n');
    else if (expression === 'writing' || expression === 'minimal') calligraphy = compact;
    else if (expression === 'mixed') message = fullLines.join('\n');
    const characterName = core_text.normalizeText(memoryBank?.characterName, 40);
    return {
        presentExpression,
        message,
        calligraphy,
        signature: item?.sign === true && characterName ? characterName : '',
    };
}

function normalizeHolidayCards(value, entries, { currentDate = '', allowStored = false, memoryBank = null } = {}) {
    const raw = Array.isArray(value) ? value : [];
    const expressionSet = new Set(HOLIDAY_CARD_EXPRESSIONS);
    const motifSet = new Set(HOLIDAY_CARD_MOTIFS);
    const paletteSet = new Set(HOLIDAY_CARD_PALETTES);
    const mediumSet = new Set(HOLIDAY_CARD_MEDIA);
    const strokeSet = new Set(HOLIDAY_CARD_STROKES);
    const flowSet = new Set(HOLIDAY_CARD_FLOWS);
    const eligible = (Array.isArray(entries) ? entries : [])
        .filter(item => item?.status === CALENDAR_STATUS.FUTURE
            && item?.occasionType === 'holiday'
            && (allowStored || (item?.worldEvidenceVerified === true && calendarDateMatchesToday(item?.date, currentDate))));
    const out = [];
    const usedEntries = new Set();
    for (const item of raw.slice(0, 12)) {
        const requestedId = core_text.safeId(item?.calendarEntryId, '');
        const matches = eligible.filter(entry => entry.id === requestedId || core_text.safeId(entry?.calendarEntrySourceId, entry?.id) === requestedId);
        if (matches.length !== 1) continue;
        const entry = matches[0];
        if (usedEntries.has(entry.id)) continue;
        let expression = expressionSet.has(item?.expression) ? item.expression : 'mixed';
        const requestedTextMode = core_text.normalizeText(item?.textMode, 40).toLowerCase();
        const textMode = ['none', 'present-expression', 'evidence-excerpt'].includes(requestedTextMode) ? requestedTextMode : '';
        let message = '';
        let calligraphy = '';
        let signature = '';
        let presentExpression = null;
        let reference = { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        let legacyUnverified = false;
        if (textMode === 'present-expression') {
            const rendered = holidayPresentExpression(item, expression, memoryBank);
            ({ message, calligraphy, signature, presentExpression } = rendered);
        } else if (textMode === 'evidence-excerpt') {
            const anchored = holidayAnchoredExcerpt(item, memoryBank);
            ({ message, calligraphy, signature, reference } = anchored);
        } else if (allowStored) {
            // r48 and earlier stored arbitrary prose. Preserve it for migration, but never silently
            // promote it to the r49 structured present-tense or exact-anchor boundary.
            message = core_text.normalizeText(item?.message, 360);
            calligraphy = core_text.normalizeText(item?.calligraphy, 80);
            signature = core_text.normalizeText(item?.signature, 40);
            legacyUnverified = !!(message || calligraphy || signature);
        }
        const motifs = [...new Set(core_text.cleanArray(item?.motifs, 6, 32).filter(value => motifSet.has(value)))].slice(0, 4);
        let hasWords = !!(message || calligraphy || signature);
        const hasDrawing = motifs.length > 0;
        if (!hasWords && hasDrawing && expression !== 'drawing') expression = 'drawing';
        hasWords = !!(message || calligraphy || signature);
        if (!hasWords && !hasDrawing) continue;
        if (expression === 'text' && !message) continue;
        if (expression === 'writing' && !calligraphy && !message) continue;
        if (expression === 'drawing' && !hasDrawing) continue;
        const anchoredExcerpt = reference.sourceMemoryIds.length > 0 && !!(message || calligraphy);
        const historyVerification = legacyUnverified
            ? 'legacy-unverified'
            : anchoredExcerpt
                ? 'memory-anchor-excerpt'
                : hasWords
                    ? 'present-structured'
                    : 'visual-only';
        const art = item?.art && typeof item.art === 'object' ? item.art : {};
        out.push({
            id: core_text.safeId(item?.id, `CAL_CARD_${String(out.length + 1).padStart(2, '0')}`),
            calendarEntryId: entry.id,
            holidayLabel: entry.title,
            date: entry.date,
            sourceLabel: legacyUnverified ? `${entry.sourceLabel} · 旧版自由文字未重新核验` : entry.sourceLabel,
            expression,
            textMode: textMode || (legacyUnverified ? 'legacy-free-text' : 'none'),
            message,
            calligraphy,
            signature,
            presentExpression,
            sign: textMode === 'present-expression' && item?.sign === true,
            sourceMemoryIds: anchoredExcerpt ? reference.sourceMemoryIds : [],
            sourceMemoryAnchor: anchoredExcerpt ? reference.sourceMemoryAnchor : '',
            historyVerification,
            motifs,
            art: {
                medium: mediumSet.has(art?.medium) ? art.medium : 'card',
                palette: paletteSet.has(art?.palette) ? art.palette : 'paper',
                stroke: strokeSet.has(art?.stroke) ? art.stroke : 'fine',
                flow: flowSet.has(art?.flow) ? art.flow : 'horizontal',
                density: clampCardNumber(art?.density, 42),
                whitespace: clampCardNumber(art?.whitespace, 58),
                asymmetry: clampCardNumber(art?.asymmetry, 48),
                visualWeight: clampCardNumber(art?.visualWeight, 54),
            },
        });
        usedEntries.add(entry.id);
    }
    return out;
}

function normalizeStickyNotes(value, memoryBank, { controlledEvidence = '' } = {}) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 8)) {
        const kind = item?.kind === CALENDAR_NOTE_KIND.SPECIAL ? CALENDAR_NOTE_KIND.SPECIAL : CALENDAR_NOTE_KIND.MEMO;
        const sourceType = item?.sourceType === CALENDAR_NOTE_SOURCE.SETTING ? CALENDAR_NOTE_SOURCE.SETTING : CALENDAR_NOTE_SOURCE.ARCHIVE;
        const title = kind === CALENDAR_NOTE_KIND.SPECIAL ? '特别备注' : '便签';
        const requestedText = core_text.normalizeText(item?.text, 180);
        if (!requestedText || !folded(requestedText)) continue;
        if (sourceType === CALENDAR_NOTE_SOURCE.ARCHIVE) {
            const ref = core_evidence.normalizeExactMemoryReference(
                item?.sourceMemoryIds,
                item?.sourceMemoryAnchor,
                memoryBank,
                1,
            );
            if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
            const memory = resolveAnchoredMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
            if (!memory) continue;
            const evidence = citedNarrativeEvidenceText(memoryBank, ref.sourceMemoryIds);
            const text = folded(evidence, 32000).includes(folded(requestedText, 400))
                ? requestedText
                : core_text.normalizeText(ref.sourceMemoryAnchor, 180);
            if (!text) continue;
            out.push({
                id: core_text.safeId(item?.id, `CAL_NOTE_${String(out.length + 1).padStart(2, '0')}`),
                kind, sourceType, title, text,
                date: core_text.normalizeText(item?.date, 40),
                calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
                sourceKind: 'archive-note',
                sourceLabel: '剧情档案',
                sourceMemoryIds: ref.sourceMemoryIds,
                sourceMemoryAnchor: ref.sourceMemoryAnchor,
                sourceEvidence: '',
                evidenceMode: 'memory-excerpt',
            });
        } else {
            const sourceLabel = core_text.normalizeText(item?.sourceLabel, 80) || '角色 / 世界设定';
            const sourceEvidence = core_text.normalizeText(item?.sourceEvidence, 800);
            if (!sourceEvidence || !core_worldPresentation.controlledEvidenceContains(controlledEvidence, sourceEvidence)) continue;
            const text = folded(sourceEvidence, 1200).includes(folded(requestedText, 400))
                ? requestedText
                : core_text.normalizeText(sourceEvidence, 180);
            if (!text) continue;
            out.push({
                id: core_text.safeId(item?.id, `CAL_NOTE_${String(out.length + 1).padStart(2, '0')}`),
                kind, sourceType, title, text,
                date: normalizeCalendarDate(item?.date)?.date || '',
                calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
                sourceKind: 'world-setting-note',
                sourceLabel,
                sourceMemoryIds: [],
                sourceMemoryAnchor: '',
                sourceEvidence,
                evidenceMode: 'setting-excerpt',
            });
        }
        if (out.length >= 6) break;
    }
    return out;
}

function normalizeMoodNotes(value, memoryBank) {
    const raw = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of raw.slice(0, 5)) {
        const ref = core_evidence.normalizeExactMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            memoryBank,
            1,
        );
        if (!ref.sourceMemoryIds.length || !ref.sourceMemoryAnchor) continue;
        const memory = resolveAnchoredMemory(memoryBank, ref.sourceMemoryIds, ref.sourceMemoryAnchor);
        if (!memory) continue;
        const textMode = core_text.normalizeText(item?.textMode, 40).toLowerCase();
        let text = '';
        let presentExpression = null;
        if (textMode === 'present-expression') {
            presentExpression = core_presentExpression.normalizePresentExpression(item?.presentExpression, {
                relationshipTier: core_presentExpression.relationshipExpressionTier(memoryBank),
            });
            text = core_presentExpression.renderPresentExpressionText(presentExpression);
        } else if (textMode === 'evidence-excerpt') {
            const requestedText = core_text.normalizeText(item?.text, 220);
            if (requestedText && folded(ref.sourceMemoryAnchor, 240).includes(folded(requestedText, 440))) text = requestedText;
        }
        if (!text || !folded(text)) continue;
        const parsed = normalizeCalendarDate(memory?.date);
        out.push({
            id: core_text.safeId(item?.id, `CAL_MOOD_${String(out.length + 1).padStart(2, '0')}`),
            text,
            textMode,
            presentExpression,
            evidenceMode: textMode === 'evidence-excerpt' ? 'memory-anchor-excerpt' : 'present-structured',
            date: parsed?.date || '',
            calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
            sourceKind: 'archive-mood',
            sourceLabel: '剧情档案 · 角色随笔',
            sourceMemoryIds: ref.sourceMemoryIds,
            sourceMemoryAnchor: ref.sourceMemoryAnchor,
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
        const evidenceMode = ['memory-anchor-excerpt', 'present-structured'].includes(item?.evidenceMode) ? item.evidenceMode : 'legacy-unverified';
        return {
            id: core_text.safeId(item?.id, `CAL_MOOD_${String(index + 1).padStart(2, '0')}`),
            text,
            date: core_text.normalizeText(item?.date, 40),
            calendarEntryId: core_text.safeId(item?.calendarEntryId, ''),
            sourceKind: core_text.normalizeText(item?.sourceKind, 60),
            sourceLabel: core_text.normalizeText(item?.sourceLabel, 120),
            sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 16, 40),
            sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
            textMode: ['present-expression', 'evidence-excerpt'].includes(item?.textMode) ? item.textMode : 'legacy-free-text',
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
    const migrated = {
        ...structuredClone(session),
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
    const moodNotes = normalizeMoodNotes(data?.moodNotes, memoryBank);
    const entries = ensureUniqueCalendarEntryIds([...past, ...promised, ...future]);
    const currentDate = core_text.normalizeText(options.currentDate, 20) || currentCalendarDate();
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
        selectedMonth: defaultCalendarMonth(entries),
        selectedDateKey: '',
        generatedAt: Date.now(),
    };
}
