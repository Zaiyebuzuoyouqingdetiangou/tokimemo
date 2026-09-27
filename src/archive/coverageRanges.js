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
        const saved = progress.batches.slice(0, Math.max(0, Number(progress.nextBatch) || 0))
            .flatMap(parts => (Array.isArray(parts) ? parts : []).flatMap(part => Array.isArray(part?.refs) ? part.refs : []))
            .filter(ref => ref?.kind === 'chat' && floor(ref.index) >= window.start && floor(ref.index) <= window.end)
            .map(ref => floor(ref.index));
        if (!saved.length) return base;
        covered = { start: Math.min(...saved), end: Math.max(...saved) };
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

// Display-only coverage line for archive views; empty when nothing is recorded yet.
export function archiveCoverageText(bank) {
    const covered = bankCoveredRanges(bank);
    if (!covered.length) return '';
    const total = Math.max(0, Number(bank?.sourceMessageCount) || 0);
    const gaps = total ? rangeGaps(covered, 1, total) : [];
    return `楼层覆盖：已整理 ${formatCoveredRanges(covered)}${total ? (gaps.length ? `；缺口 ${formatFloorGaps(gaps)}` : `；第 1–${total} 楼无缺口`) : ''}`;
}
