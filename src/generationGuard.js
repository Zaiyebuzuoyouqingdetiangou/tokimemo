import { getCurrentChatKey } from './storage.js?rmv=1.4.30.12';
import { recordRabbitMirrorRecipe } from './blacklist.js?rmv=1.4.30.12';

const SNAPSHOT_STORAGE_KEY = 'rabbit_mirror_theater:generation_snapshots:v1';
const ACTIVE_ATTEMPT_STORAGE_KEY = 'rabbit_mirror_theater:active_generation_attempt:v1';
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const MAX_SNAPSHOTS = 16;
const MAX_SNAPSHOT_SOURCE_CHARS = 240000;

function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function normalizeText(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function cssStructuralBalance(cssText) {
    const source = String(cssText || '');
    let depth = 0;
    let minDepth = 0;
    let quote = '';
    let escaped = false;
    let inComment = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';
        if (inComment) {
            if (char === '*' && next === '/') {
                inComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            inComment = true;
            index += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            minDepth = Math.min(minDepth, depth);
        }
    }
    return {
        depth,
        extraClosingBrace: minDepth < 0,
        unterminatedString: !!quote,
        unterminatedComment: inComment,
    };
}

function findBalancedDetailsEnd(source, detailsStart) {
    const text = String(source || '');
    if (detailsStart < 0) return -1;
    const tagRe = /<\s*(\/?)\s*details\b[^>]*>/gi;
    tagRe.lastIndex = detailsStart;
    let depth = 0;
    let match;
    while ((match = tagRe.exec(text))) {
        if (match.index < detailsStart) continue;
        if (match[1]) {
            depth -= 1;
            if (depth === 0) return tagRe.lastIndex;
        } else if (!/\/\s*>$/.test(match[0])) {
            depth += 1;
        }
    }
    return -1;
}

function extractRabbitMirrorCandidates(source) {
    const text = String(source || '');
    const candidates = [];
    const summaryRe = /<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/gi;
    let match;
    while ((match = summaryRe.exec(text))) {
        const title = normalizeText(match[1]);
        if (!title.includes('兔子镜')) continue;
        const detailsStart = text.slice(0, match.index).toLowerCase().lastIndexOf('<details');
        if (detailsStart < 0) continue;
        const detailsEnd = findBalancedDetailsEnd(text, detailsStart);
        const isolatedSource = detailsEnd > detailsStart
            ? text.slice(detailsStart, detailsEnd).trim()
            : text.slice(detailsStart).trim();
        candidates.push({
            title,
            detailsStart,
            detailsEnd,
            isolatedSource,
            summaryClosed: true,
        });
    }
    return candidates;
}

function sourceBodyEvidence(isolatedSource) {
    const stylesheetText = [...String(isolatedSource || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
        .map(match => String(match[1] || ''))
        .join('\n');
    const stylesheetVisualProgramCount = (stylesheetText.match(/@keyframes\b|content\s*:|background(?:-image)?\s*:[^;{}]*(?:url\(|gradient\()|mask(?:-image)?\s*:|clip-path\s*:/gi) || []).length;
    const withoutNonBody = String(isolatedSource || '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/?(?:toto|details)\b[^>]*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ');
    const bodyTagCount = (withoutNonBody.match(/<(?:div|section|article|label|input|button|p|span|h[1-6]|ul|ol|li|table|form|figure|main|header|footer|nav|img|svg|canvas|video|audio|meter|progress)\b/gi) || []).length;
    const bodyTextLength = normalizeText(withoutNonBody).length;
    const visualProgramCount = stylesheetVisualProgramCount
        + (withoutNonBody.match(/(?:background(?:-image)?\s*:[^;]*(?:url\(|gradient\()|mask(?:-image)?\s*:|clip-path\s*:|filter\s*:|@keyframes\b|<svg\b|<canvas\b|<img\b|<video\b)/gi) || []).length;
    return {
        bodyTagCount,
        bodyTextLength,
        visualProgramCount,
        bodyMissing: bodyTagCount === 0 && bodyTextLength === 0 && visualProgramCount === 0,
    };
}

export function inspectRabbitMirrorGenerationSource(source, expectedTitle = '') {
    const candidates = extractRabbitMirrorCandidates(source);
    const wanted = normalizeText(expectedTitle);
    const candidate = wanted
        ? [...candidates].reverse().find(item => item.title === wanted || item.title.includes(wanted) || wanted.includes(item.title))
        : candidates[candidates.length - 1];
    if (!candidate) {
        return {
            hasMirror: false,
            complete: false,
            reason: 'missing-rabbit-mirror',
            title: '',
            isolatedSource: '',
        };
    }

    const isolated = candidate.isolatedSource;
    const styleOpenCount = (isolated.match(/<style\b/gi) || []).length;
    const styleCloseCount = (isolated.match(/<\/style\s*>/gi) || []).length;
    const styleBlocks = [...isolated.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
        .map(match => String(match[1] || ''));
    const cssBalance = cssStructuralBalance(styleBlocks.join('\n'));
    const body = sourceBodyEvidence(isolated);
    const detailsClosed = candidate.detailsEnd > candidate.detailsStart;
    const styleClosed = styleOpenCount === styleCloseCount;
    const cssTruncated = styleOpenCount > 0 && (
        !styleClosed
        || cssBalance.depth !== 0
        || cssBalance.extraClosingBrace
        || cssBalance.unterminatedString
        || cssBalance.unterminatedComment
    );

    let reason = '';
    if (!detailsClosed) reason = 'details-not-closed';
    else if (cssTruncated) reason = 'css-truncated';
    else if (body.bodyMissing) reason = 'body-missing';

    return {
        hasMirror: true,
        complete: !reason,
        reason: reason || 'complete',
        title: candidate.title,
        isolatedSource: isolated,
        detailsClosed,
        styleOpenCount,
        styleCloseCount,
        cssTruncated,
        ...body,
    };
}

function readSnapshots() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(SNAPSHOT_STORAGE_KEY) || '[]');
        const now = Date.now();
        return Array.isArray(parsed)
            ? parsed.filter(item => item && now - Number(item.ts || 0) <= SNAPSHOT_TTL_MS)
            : [];
    } catch {
        return [];
    }
}

function writeSnapshots(items) {
    try {
        sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify((items || []).slice(-MAX_SNAPSHOTS)));
        return true;
    } catch (error) {
        console.debug('[RabbitMirror] generation snapshot store unavailable:', error);
        return false;
    }
}

function readActiveAttempt() {
    try {
        const value = JSON.parse(sessionStorage.getItem(ACTIVE_ATTEMPT_STORAGE_KEY) || 'null');
        return value && typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
}

function writeActiveAttempt(value) {
    try {
        sessionStorage.setItem(ACTIVE_ATTEMPT_STORAGE_KEY, JSON.stringify(value || null));
    } catch {
        // Session state is optional; generation still works without it.
    }
}

function snapshotKey(chatKey, messageIndex, swipeId) {
    return `${chatKey}|m:${messageIndex}|s:${swipeId}`;
}

function currentSwipeId(message) {
    return Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
}

export function beginRabbitMirrorGenerationAttempt(chat, attemptId) {
    const list = Array.isArray(chat) ? chat : [];
    const chatKey = getCurrentChatKey(list);
    const lastAssistantIndex = (() => {
        for (let index = list.length - 1; index >= 0; index -= 1) {
            if (list[index] && !list[index].is_user) return index;
        }
        return -1;
    })();
    const endsWithAssistant = !!(list.length && list[list.length - 1] && !list[list.length - 1].is_user);
    const targetMessageIndex = endsWithAssistant ? list.length - 1 : list.length;
    const snapshots = readSnapshots().filter(item => {
        if (item.chatKey !== chatKey) return true;
        if (item.messageIndex === targetMessageIndex) return false;
        if (endsWithAssistant && item.messageIndex === lastAssistantIndex) return false;
        return true;
    });
    writeSnapshots(snapshots);
    const active = {
        chatKey,
        attemptId: String(attemptId || ''),
        startedAt: Date.now(),
        targetMessageIndex,
        selectionMetadata: null,
    };
    writeActiveAttempt(active);
    return active;
}


export function attachRabbitMirrorGenerationSelection(metadata = null) {
    const active = readActiveAttempt();
    if (!active || !metadata || typeof metadata !== 'object') return false;
    active.selectionMetadata = {
        samplingMode: String(metadata.samplingMode || 'classic'),
        themeIds: Array.isArray(metadata.themeIds) ? [...metadata.themeIds] : [],
        formatIds: Array.isArray(metadata.formatIds) ? [...metadata.formatIds] : [],
        userDirectiveApplied: !!metadata.userDirectiveApplied,
        forcedVisualScenery: !!metadata.forcedVisualScenery,
    };
    writeActiveAttempt(active);
    return true;
}

function messageSourceCandidates(message) {
    const values = [];
    const seen = new Set();
    const push = (label, source) => {
        if (typeof source !== 'string') return;
        const text = source.trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        values.push({ label, source: text });
    };
    const swipeId = currentSwipeId(message);
    if (swipeId >= 0) push('当前 swipe', message?.swipes?.[swipeId]);
    push('mes', message?.mes);
    push('display_text', message?.extra?.display_text);
    return values;
}

export function captureRabbitMirrorGenerationSnapshots(chat) {
    const list = Array.isArray(chat) ? chat : [];
    if (!list.length) return 0;
    const chatKey = getCurrentChatKey(list);
    const active = readActiveAttempt();
    const indexes = [];
    if (active?.chatKey === chatKey && Number.isInteger(active?.targetMessageIndex) && list[active.targetMessageIndex] && !list[active.targetMessageIndex].is_user) {
        indexes.push(active.targetMessageIndex);
    } else {
        for (let index = list.length - 1; index >= 0 && indexes.length < 4; index -= 1) {
            if (list[index] && !list[index].is_user) indexes.push(index);
        }
    }
    let snapshots = readSnapshots();
    let changed = 0;

    for (const messageIndex of indexes) {
        const message = list[messageIndex];
        const swipeId = currentSwipeId(message);
        const key = snapshotKey(chatKey, messageIndex, swipeId);
        const attemptId = active?.chatKey === chatKey && active?.targetMessageIndex === messageIndex
            ? String(active.attemptId || '')
            : '';
        for (const candidate of messageSourceCandidates(message)) {
            const inspection = inspectRabbitMirrorGenerationSource(candidate.source);
            if (!inspection.hasMirror || inspection.isolatedSource.length > MAX_SNAPSHOT_SOURCE_CHARS) continue;
            const existingIndex = snapshots.findIndex(item => item.key === key);
            const existing = existingIndex >= 0 ? snapshots[existingIndex] : null;
            const staleAttempt = !!(attemptId && existing?.attemptId && existing.attemptId !== attemptId);
            const staleTitle = !!(existing?.title && inspection.title && normalizeText(existing.title) !== normalizeText(inspection.title));
            const base = staleAttempt || staleTitle ? null : existing;
            const next = {
                key,
                chatKey,
                messageIndex,
                swipeId,
                attemptId,
                title: inspection.title,
                titleHash: hashText(inspection.title),
                longestSource: !base?.longestSource || inspection.isolatedSource.length > base.longestSource.length
                    ? inspection.isolatedSource
                    : base.longestSource,
                completeSource: inspection.complete && (!base?.completeSource || inspection.isolatedSource.length >= base.completeSource.length)
                    ? inspection.isolatedSource
                    : (base?.completeSource || ''),
                complete: !!(inspection.complete || base?.completeSource),
                reason: inspection.complete ? 'complete' : inspection.reason,
                sourceLabel: candidate.label,
                selectionMetadata: attemptId && active?.selectionMetadata ? { ...active.selectionMetadata } : (base?.selectionMetadata || null),
                ts: Date.now(),
            };
            if (existingIndex >= 0) snapshots.splice(existingIndex, 1);
            snapshots.push(next);
            if (next.selectionMetadata) {
                recordRabbitMirrorRecipe({
                    chat: list,
                    chatKey,
                    messageIndex,
                    swipeId,
                    message,
                    metadata: next.selectionMetadata,
                    source: 'follow',
                });
            }
            changed += 1;
        }
    }
    if (changed) writeSnapshots(snapshots);
    return changed;
}

export function getRabbitMirrorGenerationSnapshot(message, chat, messageIndex, expectedTitle = '') {
    const list = Array.isArray(chat) ? chat : [];
    const index = Number.isInteger(messageIndex) ? messageIndex : list.lastIndexOf(message);
    if (index < 0) return null;
    const chatKey = getCurrentChatKey(list);
    const swipeId = currentSwipeId(message);
    const key = snapshotKey(chatKey, index, swipeId);
    const wanted = normalizeText(expectedTitle);
    const item = [...readSnapshots()].reverse().find(snapshot => {
        if (snapshot.key !== key || !snapshot.completeSource) return false;
        if (!wanted) return true;
        const title = normalizeText(snapshot.title);
        return title === wanted || title.includes(wanted) || wanted.includes(title);
    });
    if (!item) return null;
    const inspection = inspectRabbitMirrorGenerationSource(item.completeSource, wanted);
    if (!inspection.complete) return null;
    return {
        source: item.completeSource,
        title: item.title,
        sourceLabel: item.sourceLabel,
        attemptId: item.attemptId,
        ts: item.ts,
        selectionMetadata: item.selectionMetadata ? { ...item.selectionMetadata } : null,
    };
}

export function clearRabbitMirrorGenerationSnapshots() {
    try {
        sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
        sessionStorage.removeItem(ACTIVE_ATTEMPT_STORAGE_KEY);
    } catch {
        // no-op
    }
}
