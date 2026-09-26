// 楼层里只放这一轮新增的段落。旧信、旧章节和旧日记留在插件页面。

const LIST_KEYS = ['items', 'letters', 'entries', 'chapters', 'stories', 'songs', 'apps', 'events', 'routes', 'episodes', 'pages', 'nodes'];
const MODULE_BODY_KEYS = ['dailyStrips', 'fireflyVoices', 'voiceDramas', 'scenarioDramas', 'greetings', 'dialogues'];

function listedIds(item) {
    const rows = [];
    if (Array.isArray(item?.sourceMemoryIds)) rows.push(...item.sourceMemoryIds);
    if (Array.isArray(item?.sourceArchiveMemoryIds)) rows.push(...item.sourceArchiveMemoryIds);
    if (typeof item?.sourceMemoryId === 'string') rows.push(item.sourceMemoryId);
    return rows;
}

function itemKey(item) {
    if (item && typeof item === 'object' && typeof item.id === 'string' && item.id) return `id:${item.id}`;
    try { return `json:${JSON.stringify(item)}`; }
    catch { return ''; }
}

function stampOf(item) {
    const created = Number(item?.createdAt);
    const generated = Number(item?.generatedAt);
    if (Number.isFinite(created) && created > 0) return created;
    if (Number.isFinite(generated) && generated > 0) return generated;
    return 0;
}

function roundStart(createdAt, since) {
    const bounds = [Number(since) || 0, Number(createdAt) || 0].filter(value => value > 0);
    return bounds.length ? Math.min(...bounds) : 0;
}

function matches(item, ids, createdAt, since) {
    if (!item || typeof item !== 'object') return false;
    if (listedIds(item).some(id => ids.has(id))) return true;
    const stamp = stampOf(item);
    const start = roundStart(createdAt, since);
    return stamp > 0 && start > 0 && stamp >= start;
}

function trimStory(story, ids, createdAt, since) {
    if (!Array.isArray(story?.chapters)) return matches(story, ids, createdAt, since) ? story : null;
    const chapters = story.chapters.filter(chapter => matches(chapter, ids, createdAt, since) || matches(story, ids, createdAt, since));
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
            ? original.map(story => trimStory(story, ids, createdAt, sinceAt)).filter(Boolean)
            : original.filter(item => matches(item, ids, createdAt, sinceAt));
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

// 把这一轮已经写进模块里的段落拿掉，留下更早的。重 roll 先撤回，再按新正文重写。
export function sessionWithoutRound(session, query = {}) {
    if (!session || typeof session !== 'object') return session;
    const projected = incrementalProjection(session, query);
    const next = structuredClone(session);
    if (!projected.kept || !projected.session) return next;
    const round = projected.session;
    const ids = new Set(Array.isArray(query.sourceMemoryIds) ? query.sourceMemoryIds : []);
    const createdAt = Number(query.createdAt) || 0;
    const since = Number(query.since) || 0;
    for (const key of [...LIST_KEYS, ...MODULE_BODY_KEYS]) {
        if (!Array.isArray(next[key]) || !Array.isArray(round[key]) || !round[key].length) continue;
        const drop = new Set(round[key].map(itemKey).filter(Boolean));
        next[key] = next[key].filter(item => !drop.has(itemKey(item)));
    }
    if (Array.isArray(next.apps)) {
        next.apps = next.apps.map(app => {
            if (!app || !Array.isArray(app.entries)) return app;
            return { ...app, entries: app.entries.filter(entry => !matches(entry, ids, createdAt, since)) };
        });
    }
    if (round.relationshipSummary && next.relationshipSummary === round.relationshipSummary) next.relationshipSummary = '';
    const meta = next.generationMeta;
    if (meta?.parts && typeof meta.parts === 'object') {
        for (const part of Object.values(meta.parts)) {
            if (Array.isArray(part?.coveredMemoryIds)) part.coveredMemoryIds = part.coveredMemoryIds.filter(id => !ids.has(id));
        }
    }
    if (Array.isArray(meta?.lastUpdate?.consumedMemoryIds)) {
        meta.lastUpdate.consumedMemoryIds = meta.lastUpdate.consumedMemoryIds.filter(id => !ids.has(id));
        meta.lastUpdate.added = 0;
    }
    return next;
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

const SEASON_LABEL = { spring: '春', summer: '夏', autumn: '秋', winter: '冬', postending: '未来 / 后日谈' };

function heartLine(line, identity) {
    const speaker = line?.speaker === 'user' || line?.speaker === 'npc' || line?.speaker === 'narrator' ? line.speaker : 'char';
    const text = typeof line?.text === 'string' ? line.text.trim() : '';
    if (!text) return '';
    if (speaker === 'narrator') return `<div class="rmt-heart-narration">${esc(text)}</div>`;
    const isUser = speaker === 'user';
    const name = isUser ? (identity.userName || '你') : (line.speakerName || identity.characterName || '角色');
    const avatar = isUser ? identity.userAvatar : identity.charAvatar;
    const face = avatar
        ? `<img src="${esc(avatar)}" alt="">`
        : `<i class="fa-solid ${isUser ? 'fa-user' : 'fa-heart'}"></i>`;
    return `<div class="rmt-heart-line ${isUser ? 'user' : 'char'}"><span class="rmt-heart-line-avatar">${face}</span><div><small>${esc(name)}</small><p>${esc(text)}</p></div></div>`;
}

function heartScript(lines, identity) {
    const html = (Array.isArray(lines) ? lines : []).map(line => heartLine(line, identity)).filter(Boolean).join('');
    return html ? `<div class="rmt-heart-script">${html}</div>` : '';
}

function heartPiece(title, body) {
    if (!body && !title) return '';
    const heading = title ? `<h3>${esc(title)}</h3>` : '';
    return `<section class="rmt-letter-piece">${heading}${body || ''}</section>`;
}

function heartHtml(session, identity) {
    const blocks = [];
    if (session.relationshipSummary) blocks.push(heartPiece('', `<div class="rmt-heart-narration">${esc(session.relationshipSummary)}</div>`));
    for (const drama of [...(session.voiceDramas || []), ...(session.scenarioDramas || [])]) {
        const season = SEASON_LABEL[drama.season || drama.kind] || '';
        const title = [season, drama.title].filter(Boolean).join(' · ');
        const setting = drama.setting ? `<div class="rmt-heart-narration">${esc(drama.setting)}</div>` : '';
        blocks.push(heartPiece(title, `${setting}${heartScript(drama.script, identity)}`));
    }
    for (const strip of session.dailyStrips || []) {
        const lines = [];
        for (const panel of strip.panels || []) {
            if (panel.caption) lines.push({ speaker: 'narrator', text: panel.caption });
            if (panel.action) lines.push({ speaker: 'narrator', text: panel.action });
            if (panel.charLine) lines.push({ speaker: 'char', text: panel.charLine });
            if (panel.userLine) lines.push({ speaker: 'user', text: panel.userLine });
        }
        blocks.push(heartPiece(strip.title || '日常', heartScript(lines, identity)));
    }
    for (const voice of session.fireflyVoices || []) {
        blocks.push(heartPiece(voice.title || '萤火虫', heartScript(voice.script, identity)));
    }
    return blocks.filter(Boolean).join('');
}

function phoneMessages(entry) {
    const rows = Array.isArray(entry?.messages) ? entry.messages : [];
    return rows.map(message => {
        const text = typeof message?.text === 'string' ? message.text.trim() : '';
        if (!text) return '';
        const role = message.speakerRole === 'owner' ? 'owner' : 'contact';
        const speaker = message.speaker || (role === 'owner' ? '他' : '联系人');
        return `<div class="rmt-phone-message rmt-phone-message-${role}"><div><b>${esc(speaker)}</b></div><p>${esc(text)}</p></div>`;
    }).filter(Boolean).join('');
}

function phoneHtml(session) {
    const apps = Array.isArray(session.apps) ? session.apps : [];
    const blocks = [];
    for (const app of apps) {
        const entries = Array.isArray(app?.entries) ? app.entries : [];
        const inner = entries.map(entry => {
            const thread = phoneMessages(entry);
            const title = entry?.title ? `<h3>${esc(entry.title)}</h3>` : '';
            const detail = typeof entry?.detail === 'string' && entry.detail.trim() ? `<p class="rmt-phone-record-copy">${esc(entry.detail.trim())}</p>` : '';
            if (!thread && !detail && !title) return '';
            return `<section class="rmt-phone-conversation">${title}${detail}${thread ? `<div class="rmt-phone-chat-thread">${thread}</div>` : ''}</section>`;
        }).join('');
        if (!inner) continue;
        const label = app.label || app.title || '私人终端';
        blocks.push(`<div class="rmt-phone"><div class="rmt-phone-shell"><div class="rmt-phone-notch"></div><p class="rmt-phone-lock"><b>${esc(label)}</b></p>${inner}</div></div>`);
    }
    return blocks.join('');
}

function plainHtml(session) {
    const lines = [];
    pushLine(lines, session.relationshipSummary);
    for (const key of [...MODULE_BODY_KEYS, ...LIST_KEYS]) {
        if (Array.isArray(session[key]) && session[key].length) collectLines(session[key], lines, 0);
    }
    if (!lines.length) return '';
    return `<div class="rmt-round-reading">${lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>`;
}

export function roundReadingHtml(session, identity = {}) {
    if (!session || typeof session !== 'object') return '';
    const who = {
        characterName: identity.characterName || '角色',
        userName: identity.userName || '你',
        charAvatar: identity.charAvatar || '',
        userAvatar: identity.userAvatar || '',
    };
    const heart = heartHtml(session, who);
    const phone = phoneHtml(session);
    if (heart || phone) return `<div class="rmt-round-reading">${heart}${phone}</div>`;
    return plainHtml(session);
}
