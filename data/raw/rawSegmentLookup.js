import { RAW_THEMATIC_CATEGORIES } from './rawThematicCategories.js?rmv=1.3.7';
import { RAW_PRESENTATION_FORMATS } from './rawPresentationFormats.js?rmv=1.3.7';

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function leadingSpaces(line) {
    const match = line.match(/^\s*/);
    return match ? match[0].length : 0;
}

function isBulletLike(line) {
    return /^\s*(?:[-*]|\d+[.)])\s+/.test(line);
}

function isHeading(line) {
    return /^\s*#{1,6}\s+/.test(line);
}

function hasIdMarker(line, id) {
    if (!id) return false;
    const escaped = escapeRegExp(id);
    const patterns = [
        new RegExp(`\\*\\*\\s*${escaped}(?:\\s|[：:（(]|$)`),
        new RegExp(`\\*\\*\\s*[·•]?${escaped}(?:\\s|[：:（(]|$)`),
        new RegExp(`(?:^|\\s)${escaped}(?:\\s|[：:（(]|$)`),
    ];
    return patterns.some(pattern => pattern.test(line));
}

function hasTitleMarker(line, title) {
    if (!title) return false;
    const normalizedTitle = String(title).replace(/\s+/g, '').toLowerCase();
    const normalizedLine = String(line).replace(/\s+/g, '').toLowerCase();
    return normalizedTitle.length >= 2 && normalizedLine.includes(normalizedTitle);
}

function findStartLine(lines, item) {
    let index = lines.findIndex(line => hasIdMarker(line, item.id));
    if (index >= 0) return index;

    // Some custom items do not have numeric ids in the raw document, e.g. Lookus / Bingo / 直白翻译机.
    index = lines.findIndex(line => isBulletLike(line) && hasTitleMarker(line, item.title));
    if (index >= 0) return index;

    // Last fallback: title anywhere in a non-empty line.
    return lines.findIndex(line => line.trim() && hasTitleMarker(line, item.title));
}

function collectSegment(lines, startIndex) {
    if (startIndex < 0) return '';

    const startLine = lines[startIndex];
    const baseIndent = leadingSpaces(startLine);
    const segment = [startLine];

    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            segment.push(line);
            continue;
        }

        const indent = leadingSpaces(line);
        const startsNewSiblingOrParent = indent <= baseIndent && (isBulletLike(line) || isHeading(line));
        if (startsNewSiblingOrParent) break;

        segment.push(line);
    }

    return segment.join('\n').trim();
}

function findRawSegment(rawText, item) {
    const lines = String(rawText || '').split(/\r?\n/);
    const start = findStartLine(lines, item);
    const segment = collectSegment(lines, start);
    return segment || item.raw || `【${item.id} ${item.title}】${item.summary || ''}`;
}

export function resolveThemeRaw(item) {
    return findRawSegment(RAW_THEMATIC_CATEGORIES, item);
}

export function resolvePresentationRaw(item) {
    return findRawSegment(RAW_PRESENTATION_FORMATS, item);
}

export function resolveRawForItem(item, kind) {
    if (kind === 'theme') return resolveThemeRaw(item);
    if (kind === 'presentation') return resolvePresentationRaw(item);
    return item.raw || `【${item.id} ${item.title}】${item.summary || ''}`;
}

const RAW_SNIPPET_CACHE = new Map();

function normalizeComparable(text) {
    return String(text || '')
        .replace(/\{\{\s*(?:user|char)\s*\}\}/gi, token => token.toLowerCase())
        .replace(/[\s*_`#>\-—–:：；;，,。.!！?？()（）\[\]【】]/g, '')
        .toLowerCase();
}

function cleanSegmentLine(line) {
    return String(line || '')
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function removeOwnMarker(line, item) {
    let value = cleanSegmentLine(line);
    const id = String(item?.id || '').trim();
    const title = String(item?.title || '').trim();
    if (id) value = value.replace(new RegExp(`^${escapeRegExp(id)}\\s*`), '');
    if (title) value = value.replace(new RegExp(`^${escapeRegExp(title)}\\s*`), '');
    return value.replace(/^[:：\-—–]+\s*/, '').trim();
}

function truncateAtBoundary(text, maxChars) {
    const raw = String(text || '').trim();
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || !raw) return '';
    if (raw.length <= limit) return raw;
    const slice = raw.slice(0, Math.max(1, limit - 1));
    const boundary = Math.max(
        slice.lastIndexOf('；'),
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
        slice.lastIndexOf('\n'),
    );
    const safe = boundary >= Math.floor(limit * 0.55) ? slice.slice(0, boundary + 1) : slice;
    return `${safe.trim()}…`;
}

/**
 * Resolve only the non-duplicate, bounded supplement for one selected item.
 * The full raw segment is still resolved first, so every non-compact policy
 * performs an exact ID/title lookup against the mother library. The item's
 * own line is omitted when it merely repeats the structured index summary.
 */
export function resolveRawSnippetForItem(item, kind, maxChars = 320) {
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!item || !limit) return '';
    const cacheKey = `${kind || 'unknown'}:${item.id || item.title || '?'}:${limit}`;
    if (RAW_SNIPPET_CACHE.has(cacheKey)) return RAW_SNIPPET_CACHE.get(cacheKey);

    const rawSegment = resolveRawForItem(item, kind);
    const rawLines = String(rawSegment || '').split(/\r?\n/).filter(line => line.trim());
    const summaryComparable = normalizeComparable(item.summary || '');
    const rawComparable = normalizeComparable(item.raw || '');
    const seen = new Set();
    const supplements = [];

    rawLines.forEach((line, index) => {
        const cleaned = index === 0 ? removeOwnMarker(line, item) : cleanSegmentLine(line);
        if (!cleaned) return;
        const comparable = normalizeComparable(cleaned);
        if (!comparable || seen.has(comparable)) return;
        seen.add(comparable);

        // The matched item's first line is usually identical to the structured
        // index. Keep only genuinely additional wording or child entries.
        if (index === 0 && (
            comparable === summaryComparable
            || comparable === rawComparable
            || (summaryComparable && comparable.includes(summaryComparable) && comparable.length <= summaryComparable.length + 10)
        )) return;

        // Avoid re-injecting any later line that is only the same summary again.
        if (summaryComparable && comparable === summaryComparable) return;
        supplements.push(cleaned);
    });

    const snippet = truncateAtBoundary(supplements.join('；'), limit);
    RAW_SNIPPET_CACHE.set(cacheKey, snippet);
    return snippet;
}

