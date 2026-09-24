// Pure archive floor-coverage bookkeeping: which 1-based host floor intervals a
// bank has actually organized, the gaps inside a selected range, and the next
// suggested backfill segment. No chat/storage mutation or provider work.
import * as chat_read_range from '../core/chatReadRange.js';

export const COVERAGE_KINDS = Object.freeze(['backfill', 'incremental', 'full']);
export const COVERAGE_KIND_LABEL = Object.freeze({ backfill: '补录历史', incremental: '增量更新', full: '全量整理' });
export const OPERATION_KIND_LABEL = COVERAGE_KIND_LABEL;

export function archiveOperationKind({ existing = null, fullRebuild = false, rangeChanged = false } = {}) {
    return fullRebuild || !existing ? 'full' : rangeChanged ? 'backfill' : 'incremental';
}

function floor(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.floor(number) : 0;
}

// Merge overlapping or directly adjacent intervals. When two kinds meet, the
// interval covering more floors keeps its label; a tie keeps the newer entry.
export function mergeCoveredRanges(ranges) {
    const sorted = (Array.isArray(ranges) ? ranges : []).filter(row => floor(row?.start) && floor(row?.end) && floor(row.start) <= floor(row.end))
        .map(row => ({ start: floor(row.start), end: floor(row.end),
            revision: typeof row?.revision === 'string' ? row.revision.slice(0, 240) : '',
            kind: COVERAGE_KINDS.includes(row?.kind) ? row.kind : 'full' }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const row of sorted) {
        const last = merged.at(-1);
        if (!last || row.start > last.end + 1) { merged.push({ ...row }); continue; }
        const rowSpan = row.end - row.start, lastSpan = last.end - last.start;
        if (row.kind !== last.kind && rowSpan >= lastSpan) last.kind = row.kind;
        if (row.end > last.end) { last.end = row.end; if (row.revision) last.revision = row.revision; }
    }
    return merged;
}

export function normalizeCoveredRanges(value) {
    return mergeCoveredRanges(Array.isArray(value) ? value : []);
}

// Conservative legacy migration: only a bank that provably read the complete
// window (full-window, not truncated/sampled) yields one initial interval.
// Anything less certain starts recording from the next real run instead of
// fabricating precision the old record never had.
export function legacyCoveredRanges(bank) {
    const total = Math.max(0, Number(bank?.sourceMessageCount) || 0);
    if (!total || bank?.coverageMode !== 'full-window' || bank?.truncated) return [];
    return [{ start: 1, end: total, revision: typeof bank?.archiveRevision === 'string' ? bank.archiveRevision : '', kind: 'full' }];
}

export function bankCoveredRanges(bank) {
    if (Array.isArray(bank?.coveredRanges)) return normalizeCoveredRanges(bank.coveredRanges);
    return legacyCoveredRanges(bank);
}

// The chat floor window this run actually reads. A plain incremental update only
// covers floors appended after the archived baseline; a changed/rebuilt selection
// covers its whole window again.
export function runCoverageWindow(snapshot, { incrementalUpdate = false, rangeChanged = false, previousMessageCount = 0 } = {}) {
    const total = Math.max(0, Number(snapshot?.totalMessages) || 0);
    if (!total) return null;
    if (incrementalUpdate && !rangeChanged) {
        const start = Math.max(1, Math.floor(Number(previousMessageCount) || 0) + 1);
        return start > total ? null : { start, end: total };
    }
    const range = snapshot?.readRange;
    if (!range) return { start: 1, end: total };
    const { start, end } = chat_read_range.chatReadRangeWindow(total, range);
    return start ? { start, end } : null;
}

// Only floors whose paid batch is durably checkpointed count as covered: a
// pending batch plan never claims its unread tail, and a later failure cannot
// roll back or double-charge an already saved interval.
export function coveredRangesForSave(existingBank, { window = null, kind = 'full', revision = '', progress = null } = {}) {
    const base = bankCoveredRanges(existingBank);
    if (!window?.start || !window?.end) return base;
    let covered = { start: window.start, end: window.end };
    if (progress && Array.isArray(progress.batches)) {
        // A split source floor is covered only after ALL of its fragments have
        // committed. Never bridge a failed floor between two successful chunks.
        const savedFloors = new Set(), pendingFloors = new Set();
        for (const [batchIndex, parts] of progress.batches.entries()) {
            for (const [partIndex, part] of parts.entries()) {
                const saved = batchIndex < progress.nextBatch
                    || batchIndex === progress.nextBatch && progress.partialParts?.includes(partIndex);
                for (const ref of part.refs || []) if (ref.kind === 'chat'
                    && floor(ref.index) >= window.start && floor(ref.index) <= window.end) {
                    (saved ? savedFloors : pendingFloors).add(floor(ref.index));
                }
            }
        }
        const complete = [...savedFloors].filter(index => !pendingFloors.has(index));
        return mergeCoveredRanges([...base, ...spansFromFloors(complete).map(span => ({ ...span, revision: String(revision || ''), kind }))]);
    }
    return mergeCoveredRanges([...base, { ...covered, revision: String(revision || ''), kind }]);
}

export function rangeGaps(covered, start, end) {
    const first = floor(start), last = floor(end);
    if (!first || !last || first > last) return [];
    const gaps = [];
    let cursor = first;
    for (const row of normalizeCoveredRanges(covered)) {
        if (row.end < cursor) continue;
        if (row.start > last) break;
        if (row.start > cursor) gaps.push({ start: cursor, end: Math.min(row.start - 1, last) });
        cursor = Math.max(cursor, row.end + 1);
        if (cursor > last) break;
    }
    if (cursor <= last) gaps.push({ start: cursor, end: last });
    return gaps;
}

export function suggestNextRange(covered, start, end, size = 100) {
    const gap = rangeGaps(covered, start, end)[0];
    if (!gap) return null;
    const span = Math.max(1, Math.floor(Number(size)) || 100);
    return { start: gap.start, end: Math.min(gap.end, gap.start + span - 1) };
}

// window: {start,end} of the currently selected floors (readRangePreview shape).
export function archiveCoverageSummary(bank, window = null) {
    const covered = bankCoveredRanges(bank);
    const gaps = window?.start ? rangeGaps(covered, window.start, window.end) : [];
    const suggested = window?.start ? suggestNextRange(covered, window.start, window.end, Math.max(1, window.end - window.start + 1)) : null;
    return { covered, gaps, suggested };
}

export function formatCoveredRanges(ranges) {
    return normalizeCoveredRanges(ranges).map(row => `第 ${row.start}–${row.end} 楼（${COVERAGE_KIND_LABEL[row.kind]}）`).join('、');
}

export function formatFloorGaps(gaps) {
    return (Array.isArray(gaps) ? gaps : []).map(gap => `第 ${gap.start}–${gap.end} 楼`).join('、');
}

function spansFromFloors(floors) {
    const sorted = [...new Set((Array.isArray(floors) ? floors : []).map(floor).filter(Boolean))].sort((a, b) => a - b);
    const spans = [];
    for (const value of sorted) {
        const last = spans.at(-1);
        if (last && value <= last.end + 1) last.end = value;
        else spans.push({ start: value, end: value });
    }
    return spans;
}

export function memoryFloorSpans(memories) {
    const spans = [];
    for (const item of Array.isArray(memories) ? memories : []) {
        const kind = String(item?.sourceKind || 'chat');
        if (kind !== 'chat' && !kind.startsWith('chat')) continue;
        const start = floor(item?.messageStart), end = floor(item?.messageEnd);
        if (!start || !end || start > end) continue;
        spans.push({ start, end });
    }
    return mergeCoveredRanges(spans).map(row => ({ start: row.start, end: row.end }));
}

function spanContains(spans, value) {
    return spans.some(row => value >= row.start && value <= row.end);
}

// Three visible states, collapsed into runs. A floor already sent through an
// archive window but never turned into its own Mxxx stays "scanned", so a gap
// click does not offer to pay for it again.
export function buildFloorCoverage({ totalFloors = 0, memories = [], summaryFloors = [], coveredRanges = [] } = {}) {
    const total = Math.max(0, Math.floor(Number(totalFloors) || 0));
    const memory = memoryFloorSpans(memories);
    const summary = spansFromFloors(summaryFloors);
    const scanned = normalizeCoveredRanges(coveredRanges);
    const runs = [];
    const push = (kind, value) => {
        const last = runs.at(-1);
        if (last && last.kind === kind && value === last.end + 1) last.end = value;
        else runs.push({ kind, start: value, end: value });
    };
    for (let value = 1; value <= total; value += 1) {
        const kind = spanContains(memory, value) ? 'memory'
            : spanContains(summary, value) ? 'summary'
                : spanContains(scanned, value) ? 'scanned' : 'open';
        push(kind, value);
    }
    return runs;
}

export function coverageGapSlices(runs, size = 100) {
    const span = Math.max(1, Math.floor(Number(size)) || 100);
    return (Array.isArray(runs) ? runs : []).filter(row => row.kind === 'open' || row.kind === 'summary').map(row => ({
        kind: row.kind,
        start: row.start,
        end: Math.min(row.end, row.start + span - 1),
        fullEnd: row.end,
    }));
}

export function summaryFloorsFromChat(chat) {
    const floors = [];
    (Array.isArray(chat) ? chat : []).forEach((message, index) => {
        const leaf = message?.extra?.bbs_leaf;
        if (typeof leaf === 'string' ? leaf.trim() : leaf && typeof leaf === 'object') floors.push(index + 1);
    });
    return floors;
}

// Display-only coverage line for archive views; empty when nothing is recorded yet.
export function archiveCoverageText(bank) {
    const covered = bankCoveredRanges(bank);
    if (!covered.length) return '';
    const total = Math.max(0, Number(bank?.sourceMessageCount) || 0);
    const gaps = total ? rangeGaps(covered, 1, total) : [];
    return `楼层覆盖：已整理 ${formatCoveredRanges(covered)}${total ? (gaps.length ? `；缺口 ${formatFloorGaps(gaps)}` : `；第 1–${total} 楼无缺口`) : ''}`;
}
