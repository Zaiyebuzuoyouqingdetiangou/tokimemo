// 楼层里只放这一轮新增的段落。旧信、旧章节和旧日记留在插件页面。

const LIST_KEYS = ['items', 'letters', 'entries', 'chapters', 'stories', 'songs', 'apps', 'events', 'routes', 'episodes', 'pages', 'nodes'];
const MODULE_BODY_KEYS = ['dailyStrips', 'fireflyVoices', 'voiceDramas', 'scenarioDramas', 'greetings', 'dialogues'];

function listedIds(item) {
    const rows = [];
    if (Array.isArray(item?.sourceMemoryIds)) rows.push(...item.sourceMemoryIds);
    if (typeof item?.sourceMemoryId === 'string') rows.push(item.sourceMemoryId);
    return rows;
}

function matches(item, ids, createdAt) {
    if (!item || typeof item !== 'object') return false;
    if (listedIds(item).some(id => ids.has(id))) return true;
    return Number.isFinite(item.createdAt) && createdAt > 0 && item.createdAt >= createdAt;
}

function trimStory(story, ids, createdAt) {
    if (!Array.isArray(story?.chapters)) return matches(story, ids, createdAt) ? story : null;
    const chapters = story.chapters.filter(chapter => matches(chapter, ids, createdAt) || matches(story, ids, createdAt));
    if (!chapters.length) return null;
    return { ...story, chapters };
}

function lastUpdateOf(session) {
    const last = session?.generationMeta?.lastUpdate;
    if (!last || typeof last !== 'object') return null;
    return {
        added: Math.max(0, Math.floor(Number(last.added) || 0)),
        updatedAt: Number(last.updatedAt) || 0,
        consumed: Array.isArray(last.consumedMemoryIds) ? last.consumedMemoryIds : [],
    };
}

function narrowToRound(original, filtered, added) {
    if (!Array.isArray(original) || added < 1) return filtered;
    const tail = original.slice(-added);
    if (!filtered.length) return tail;
    if (filtered.length <= added) return filtered;
    const tailIds = new Set(tail.map(item => item?.id).filter(Boolean));
    const narrowed = filtered.filter(item => tailIds.has(item?.id));
    return narrowed.length ? narrowed : tail;
}

export function incrementalProjection(session, { sourceMemoryIds = [], createdAt = 0, since = 0 } = {}) {
    if (!session || typeof session !== 'object') return { kept: false, session: null };
    const ids = new Set(Array.isArray(sourceMemoryIds) ? sourceMemoryIds : []);
    const copy = structuredClone(session);
    const last = lastUpdateOf(session);
    const sinceAt = Number(since) || 0;
    const predates = !!(last && sinceAt > 0 && last.updatedAt > 0 && last.updatedAt < sinceAt);
    const belongs = !!(last && !predates && ((sinceAt > 0 && last.updatedAt >= sinceAt) || last.consumed.some(id => ids.has(id))));
    let kept = false;
    for (const key of [...LIST_KEYS, ...MODULE_BODY_KEYS]) {
        if (!Array.isArray(copy[key])) continue;
        if (predates || (belongs && last.added < 1)) {
            copy[key] = [];
            continue;
        }
        const original = Array.isArray(session[key]) ? session[key] : [];
        const filtered = key === 'stories'
            ? original.map(story => trimStory(story, ids, createdAt)).filter(Boolean)
            : original.filter(item => matches(item, ids, createdAt));
        copy[key] = key === 'stories' || !belongs ? filtered : narrowToRound(original, filtered, last.added);
        if (copy[key].length) kept = true;
    }
    const summary = typeof session.relationshipSummary === 'string' ? session.relationshipSummary.trim() : '';
    const summaryKept = !!summary && !predates && (belongs || (!last && ids.size > 0));
    copy.relationshipSummary = summaryKept ? summary : '';
    if (summaryKept) kept = true;
    copy.incrementalOnly = true;
    return { kept, session: copy };
}

function pushLine(lines, value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || lines[lines.length - 1] === text) return;
    if (lines.length >= 80) return;
    lines.push(text);
}

function collectLines(node, lines, depth) {
    if (depth > 6 || lines.length >= 80) return;
    if (typeof node === 'string') { pushLine(lines, node); return; }
    if (Array.isArray(node)) { node.forEach(item => collectLines(item, lines, depth + 1)); return; }
    if (!node || typeof node !== 'object') return;
    for (const key of ['title', 'subtitle', 'summary', 'text', 'body', 'content', 'line', 'setting', 'description', 'caption', 'action', 'charLine', 'userLine']) {
        pushLine(lines, node[key]);
    }
    if (Array.isArray(node.script)) collectLines(node.script, lines, depth + 1);
    if (Array.isArray(node.panels)) collectLines(node.panels, lines, depth + 1);
    if (Array.isArray(node.chapters)) collectLines(node.chapters, lines, depth + 1);
    if (Array.isArray(node.thoughts)) collectLines(node.thoughts, lines, depth + 1);
}

function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function roundReadingHtml(session) {
    if (!session || typeof session !== 'object') return '';
    const lines = [];
    pushLine(lines, session.relationshipSummary);
    for (const key of [...MODULE_BODY_KEYS, ...LIST_KEYS]) {
        if (Array.isArray(session[key]) && session[key].length) collectLines(session[key], lines, 0);
    }
    if (!lines.length) return '';
    return `<div class="rmt-round-reading">${lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>`;
}
