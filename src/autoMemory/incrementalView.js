// 楼层里只放这一轮新增的段落。旧信、旧章节和旧日记留在插件页面。

const LIST_KEYS = [
    'items', 'letters', 'entries', 'chapters', 'stories', 'songs', 'apps', 'events', 'routes',
    'episodes', 'pages', 'nodes', 'locations', 'spaces', 'containers', 'endings', 'confessionReplays', 'relationships',
];
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
        blocks.push(`<div class="rmt-phone"><div class="rmt-phone-shell rmt-device-phone rmt-phone-view-detail"><div class="rmt-phone-notch" aria-hidden="true"></div><div class="rmt-phone-screen"><main class="rmt-phone-content rmt-phone-content-single"><p class="rmt-phone-lock"><b>${esc(label)}</b></p>${inner}</main></div></div></div>`);
    }
    return blocks.join('');
}

function textOf(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function relationsSurface(session) {
    const rows = (Array.isArray(session.relationships) ? session.relationships : []).slice(0, 18);
    if (!rows.length) return '';
    const positions = rows.map((_, index) => {
        const angle = (-Math.PI / 2) + (Math.PI * 2 * index / rows.length);
        return { x: 50 + Math.cos(angle) * 32, y: 50 + Math.sin(angle) * 30 };
    });
    const edges = positions.map(pos => `<line class="rmt-relation-edge dynamic" x1="50" y1="50" x2="${pos.x.toFixed(2)}" y2="${pos.y.toFixed(2)}"/>`).join('');
    const nodes = rows.map((item, index) => {
        const pos = positions[index];
        const name = textOf(item.name) || '人物';
        const title = textOf(item.relation) || textOf(item.dynamic?.relation) || '关系';
        return `<div class="rmt-relation-node${item.isUser ? ' user' : ''} has-dynamic" style="left:${pos.x.toFixed(2)}%;top:${pos.y.toFixed(2)}%"><span class="rmt-relation-node-avatar">${item.isUser ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-solid fa-user"></i>'}</span><b>${esc(name)}</b><small>${esc(title)}</small></div>`;
    }).join('');
    const details = rows.map(item => {
        const relation = textOf(item.relation) || textOf(item.dynamic?.relation);
        const state = textOf(item.state) || textOf(item.dynamic?.state);
        const summary = textOf(item.summary) || textOf(item.dynamic?.summary);
        return `<article class="rmt-relation-detail"><div class="rmt-relation-detail-head"><b>${esc(textOf(item.name) || '人物')}</b></div><div class="rmt-relation-layer-row dynamic"><strong>本世界线</strong><span>${esc(relation)}${state ? ` · ${esc(state)}` : ''}</span><small>${esc(summary)}</small></div></article>`;
    }).join('');
    const center = textOf(session.characterName) || '角色';
    return `<section class="rmt-relations-mode"><section class="rmt-relation-garden-wrap"><div class="rmt-relation-legend"><span><i class="dynamic"></i>本世界线</span></div><div class="rmt-relation-garden"><svg class="rmt-relation-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges}</svg><div class="rmt-relation-center"><i class="fa-solid fa-user"></i><b>${esc(center)}</b></div>${nodes}</div>${details}</section></section>`;
}

function albumSurface(session) {
    const entries = Array.isArray(session.entries) ? session.entries : [];
    if (!entries.length) return '';
    const cards = entries.map(item => `<article class="rmt-card"><div class="rmt-thumb"><div class="rmt-abstract"></div></div><div class="rmt-card-meta"><div class="rmt-card-title">${esc(textOf(item.title) || '回忆')}</div><div class="rmt-card-date">${esc(textOf(item.date))}</div><div class="rmt-card-desc">${esc(textOf(item.desc) || textOf(item.comment))}</div></div></article>`).join('');
    const info = entries.map(item => `<h3>${esc(textOf(item.title) || '回忆')}</h3><div class="rmt-info-date">${esc(textOf(item.date))}</div><div class="rmt-info-desc">${esc(textOf(item.desc) || textOf(item.comment))}</div>`).join('');
    return `<div class="rmt-album"><div class="rmt-album-head"><h2>${esc(textOf(session.title) || '回忆相簿')}</h2></div><div class="rmt-album-layout"><section class="rmt-grid-wrap"><div class="rmt-grid">${cards}</div></section><aside class="rmt-info">${info}</aside></div></div>`;
}

function advSurface(session) {
    const events = Array.isArray(session.events) ? session.events : [];
    if (!events.length) return '';
    const list = events.map((item, index) => `<div class="rmt-event"><span class="rmt-event-index">${String(index + 1).padStart(2, '0')}</span><span class="rmt-event-copy"><b>${esc(textOf(item.title))}</b><small>${esc(textOf(item.date))}</small></span></div>`).join('');
    const picker = `<div class="rmt-adv-mobile-picker"><div class="rmt-adv-picker-status"><b>事件</b><span>${esc(events.map(item => textOf(item.title)).filter(Boolean).join(' · ') || '这一轮')}</span></div></div>`;
    const reading = events.map(item => {
        const paras = Array.isArray(item.adv?.paragraphs) ? item.adv.paragraphs : [];
        return `<div class="rmt-adv-reading-copy"><h3>${esc(textOf(item.title))}</h3>${paras.map(paragraph => `<div class="rmt-adv-para">${esc(textOf(paragraph))}</div>`).join('')}</div>`;
    }).join('');
    return `<div class="rmt-adv rmt-adv-reading"><aside class="rmt-event-list">${picker}<div class="rmt-event-items">${list}</div></aside><section class="rmt-event-detail"><div class="rmt-adv-reading-layout rmt-adv-text-first">${reading}</section></section></div>`;
}

function inboxSurface(session) {
    const letters = Array.isArray(session.letters) ? session.letters : [];
    if (!letters.length) return '';
    const papers = letters.map(letter => `<div class="rmt-mail-row"><b>${esc(textOf(letter.title) || '来信')}</b></div><div class="rmt-mail-paper"><header><h2>${esc(textOf(letter.title) || '来信')}</h2></header><b>${esc(textOf(letter.greeting))}</b><p>${esc(textOf(letter.body))}</p><footer>${esc(textOf(letter.closing))}</footer></div>`).join('');
    return `<section class="rmt-inbox"><header class="rmt-mail-header"><div><h2>${esc(textOf(session.recipient) || '你')}的邮箱</h2></div></header>${papers}</section>`;
}

function cabinetSurface(session) {
    const items = Array.isArray(session.items) ? session.items : [];
    if (!items.length) return '';
    return `<section class="rmt-cabinet"><div class="rmt-cabinet-shelves">${items.map((item, index) => `<details class="rmt-cabinet-piece" open><summary><small>No. ${String(index + 1).padStart(2, '0')}</small><b>${esc(textOf(item.name) || '纪念')}</b></summary><div class="rmt-cabinet-detail"><blockquote>${esc(textOf(item.objectEvidence) || textOf(item.summary) || textOf(item.text))}</blockquote></div></details>`).join('')}</div></section>`;
}

const ROOM_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 12 7v13l-12 7L4 23V10z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

function roomObjectHtml(item, index, scene) {
    const label = textOf(item?.label) || textOf(item?.name) || '物件';
    const klass = scene ? 'rmt-room-layout-object' : 'rmt-room-object-chip rmt-room-layout-chip';
    return `<div class="${klass}" data-rmt-visual-kind="other"><span class="rmt-room-layout-number">${index + 1}</span>${ROOM_ICON}<b class="rmt-room-layout-name">${esc(label)}</b></div>`;
}

function roomSurface(session) {
    const spaces = Array.isArray(session.spaces) ? session.spaces : [];
    const focus = spaces[0] || null;
    const focusObjects = Array.isArray(focus?.objects) ? focus.objects : [];
    const map = spaces.map((space, index) => `<div class="rmt-room-space${index === 0 ? ' active present' : ''}"><b>${esc(textOf(space?.label) || '房间')}</b></div>`).join('');
    const scene = focusObjects.map((item, index) => roomObjectHtml(item, index, true)).join('');
    const rail = [];
    const cards = [];
    spaces.forEach(space => {
        const objects = Array.isArray(space?.objects) ? space.objects : [];
        objects.forEach((item, index) => {
            rail.push(roomObjectHtml(item, index, false));
            cards.push(`<section class="rmt-room-card"><div class="rmt-room-card-kicker">${esc(textOf(space?.label) || '房间')}</div><div class="rmt-room-object-title">${esc(textOf(item.label) || textOf(item.name) || '物件')}</div><div class="rmt-room-object-desc">${esc(textOf(item.description))}</div>${textOf(item.line) ? `<div class="rmt-room-object-line"><p>${esc(textOf(item.line))}</p></div>` : ''}</section>`);
        });
    });
    if (!map && !scene && !cards.length && !textOf(session.homeSummary)) return '';
    const summary = textOf(focus?.atmosphere) || textOf(session.homeSummary);
    return `<div class="rmt-room-view" data-rmt-room-daypart="daytime">
      <div class="rmt-room-map" aria-label="私人空间地图">${map}</div>
      <div class="rmt-room-location"><div><b>${esc(textOf(focus?.label) || textOf(session.homeName) || '他的房间')}</b><small>${esc(textOf(session.homeName) || '')} · ${spaces.length} 个可观察区域</small></div></div>
      <div class="rmt-room-flow">
        <section class="rmt-room-stage">
          <div class="rmt-room-stage-head"><b>${esc(textOf(focus?.label) || '房间')}</b></div>
          <div class="rmt-room-scene rmt-room-layout-scene" data-rmt-room-daypart="daytime"><div class="rmt-room-interior-layout"><div class="rmt-room-object-layout">${scene}</div></div></div>
          <div class="rmt-room-object-rail" aria-label="房间物件">${rail.join('')}</div>
          <div class="rmt-room-caption"><b>${esc(textOf(focus?.label) || '房间')}：</b>${esc(summary)}</div>
        </section>
        ${cards.join('')}
        <section class="rmt-room-card rmt-room-private-life-card"><div class="rmt-room-card-kicker">房间介绍</div><div class="rmt-room-atmosphere">${esc(summary)}</div></section>
      </div>
    </div>`;
}

function itemsSurface(session) {
    const nodes = [];
    const walk = list => {
        for (const node of Array.isArray(list) ? list : []) {
            if (!node || typeof node !== 'object') continue;
            nodes.push(node);
            walk(node.children);
        }
    };
    for (const box of Array.isArray(session.containers) ? session.containers : []) walk(box?.nodes);
    if (!nodes.length) return '';
    const boxes = (Array.isArray(session.containers) ? session.containers : []).map((box, index) => `<div class="rmt-event${index === 0 ? ' active' : ''}"><b>${esc(textOf(box?.label) || '收纳')}</b><small>${esc(textOf(box?.containerType))}</small></div>`).join('');
    const list = nodes.map(node => `<div class="rmt-item-node"><span><b>${esc(textOf(node.label) || '物品')}</b><small>${esc(textOf(node.summary))}</small></span></div>`).join('');
    const detail = nodes.map(node => `<div class="rmt-item-detail"><div class="rmt-item-detail-head"><b>${esc(textOf(node.label) || '物品')}</b></div><p>${esc(textOf(node.summary))}</p>${textOf(node.line) ? `<blockquote>${esc(textOf(node.line))}</blockquote>` : ''}</div>`).join('');
    return `<div class="rmt-items"><aside class="rmt-items-boxes">${boxes}</aside><section class="rmt-items-main"><div class="rmt-items-grid"><div class="rmt-items-list">${list}</div><div>${detail}</div></div></section></div>`;
}

function calendarSurface(session) {
    const entries = Array.isArray(session.entries) ? session.entries : [];
    if (!entries.length) return '';
    const days = entries.map(item => `<div class="rmt-calendar-day marked"><span class="rmt-calendar-day-number">${esc((textOf(item.date).match(/\d{1,2}(?!\d)/) || [''])[0] || '·')}</span><span class="rmt-calendar-day-title">${esc(textOf(item.title) || '日子')}</span></div>`).join('');
    const notes = entries.map(item => `<article class="rmt-calendar-sticky memo"><span class="rmt-calendar-sticky-pin" aria-hidden="true"></span><small>STICKY NOTE</small><h3>${esc(textOf(item.title) || '日子')}</h3><p>${esc(textOf(item.text) || textOf(item.note) || textOf(item.summary))}</p><footer>${esc(textOf(item.date))}</footer></article>`).join('');
    return `<div class="rmt-calendar-shell rmt-calendar-v3"><section class="rmt-calendar-hero compact"><div><h2>${esc(textOf(session.title) || '两个人的日历')}</h2></div><div class="rmt-calendar-counts"><span><b>${entries.length}</b> 日子</span></div></section><section class="rmt-calendar-paper"><div class="rmt-calendar-grid">${days}</div></section><section class="rmt-calendar-notebook-board"><section class="rmt-calendar-sticky-panel"><div class="rmt-calendar-sticky-grid">${notes}</div></section></section></div>`;
}

function travelSurface(session) {
    const locations = Array.isArray(session.locations) ? session.locations : (Array.isArray(session.routes) ? session.routes : []);
    if (!locations.length) return '';
    const cards = locations.map(item => {
        const name = textOf(item.name) || textOf(item.title) || '地点';
        const region = textOf(item.region);
        const summary = textOf(item.summary) || textOf(item.note) || textOf(item.description);
        const lines = Array.isArray(item.dialogueLines) ? item.dialogueLines.map(textOf).filter(Boolean) : [];
        const talk = lines.length ? `<blockquote>${lines.map(line => esc(line)).join('<br>')}</blockquote>` : '';
        return `<article class="rmt-letter-travel-stop"><h3>${esc(name)}</h3>${region ? `<small>${esc(region)}</small>` : ''}${summary ? `<p>${esc(summary)}</p>` : ''}${talk}</article>`;
    }).join('');
    return `<div class="rmt-travel rmt-letter-travel"><header class="rmt-travel-head"><div><h2>${esc(textOf(session.title) || '他的出行路线')}</h2><p>${esc(textOf(session.routeSummary))}</p></div></header><div class="rmt-letter-travel-list">${cards}</div></div>`;
}

function endingSurface(session) {
    const endings = Array.isArray(session.endings) ? session.endings : [];
    const replays = Array.isArray(session.confessionReplays) ? session.confessionReplays : [];
    if (!endings.length && !replays.length) return '';
    const routes = endings.map(item => `<div class="rmt-ending-route"><b>${esc(textOf(item.title) || '结局')}</b><span>${esc(textOf(item.summary) || textOf(item.epilogue) || textOf(item.body))}</span></div>`).join('');
    const detail = endings.map(item => `<article class="rmt-ending-detail"><div class="rmt-ending-head"><h2>${esc(textOf(item.title) || '结局')}</h2></div><p class="rmt-ending-prose">${esc(textOf(item.summary) || textOf(item.epilogue) || textOf(item.body))}</p></article>`).join('');
    const confessions = replays.map(item => `<div class="rmt-confession-card"><b>${esc(textOf(item.title))}</b><span>${esc(textOf(item.scene) || textOf(item.subtitle))}</span></div>`).join('');
    return `<div class="rmt-ending"><nav class="rmt-ending-list">${routes}${confessions}</nav><main class="rmt-ending-detail">${detail}</main></div>`;
}

function butterflySurface(session) {
    const nodes = Array.isArray(session.nodes) ? session.nodes : [];
    if (!nodes.length) return '';
    const branches = nodes.map((node, index) => `<div class="rmt-node rmt-branch-node"><span>${String(index + 1).padStart(2, '0')}</span>${esc(textOf(node.label) || textOf(node.code) || '观测')}</div>`).join('');
    const blocks = nodes.map(node => `<section class="rmt-terminal-block rmt-observation-screen"><div class="rmt-terminal-section-title">${esc(textOf(node.label) || textOf(node.code) || '观测')}</div><div class="rmt-mono">${esc(textOf(node.monologue) || textOf(node.intervention) || textOf(node.systemNote))}</div></section>`).join('');
    return `<div class="rmt-crt"><div class="rmt-crt-content"><div class="rmt-tree-branches">${branches}</div>${blocks}</div></div>`;
}

const STANZA_LABELS = [
    [/^Final Chorus$/i, '最后的副歌'], [/^Pre[- ]Chorus/i, '预副歌'], [/^Chorus/i, '副歌'],
    [/^Verse/i, '主歌'], [/^Bridge/i, '桥段'], [/^Intro$/i, '前奏'], [/^Outro$/i, '尾声'],
];

// 和插件里的阅读模式同一套分段：[Verse] 这类标记单独成标题，其余行原样留在段里。
function songLyrics(lyrics) {
    const sections = [];
    let current = { label: '', lines: [] };
    for (const line of String(textOf(lyrics) || '').replace(/\r\n?/g, '\n').split('\n')) {
        const heading = line.match(/^\[([^\]\n]+)\]\s*$/);
        if (!heading) { current.lines.push(line); continue; }
        if (current.label || current.lines.some(value => value.trim())) sections.push(current);
        current = { label: heading[1], lines: [] };
    }
    if (current.label || current.lines.some(value => value.trim())) sections.push(current);
    const label = value => STANZA_LABELS.reduce((text, [pattern, name]) => text.replace(pattern, name), value);
    return sections.filter(section => section.lines.some(value => value.trim())).map(section =>
        `<section class="rmt-letter-song-stanza">${section.label ? `<h3 class="rmt-letter-song-label">${esc(label(section.label))}</h3>` : ''}<p class="rmt-letter-song-line">${esc(section.lines.join('\n').trim())}</p></section>`).join('');
}

function songSurface(session) {
    const songs = Array.isArray(session.songs) ? session.songs : [];
    if (!songs.length) return '';
    const sheets = songs.map(song => {
        const style = textOf(song.styleDescription);
        const vocal = textOf(song.vocalDescription);
        const arrangement = style || vocal
            ? `<section class="rmt-letter-song-block"><div class="rmt-letter-song-label">曲风</div><p class="rmt-letter-song-line">${esc([style, vocal].filter(Boolean).join('\n'))}</p></section>`
            : '';
        return `<article class="rmt-letter-song-sheet"><h2 class="rmt-letter-song-title">${esc(textOf(song.title) || '印象曲')}</h2>${textOf(song.singer) ? `<p class="rmt-letter-song-line">演唱者 · ${esc(textOf(song.singer))}</p>` : ''}${arrangement}<section class="rmt-letter-song-block"><div class="rmt-letter-song-label">歌词</div>${songLyrics(song.lyrics)}</section></article>`;
    }).join('');
    return `<div class="rmt-letter-song rmt-theme-song">${sheets}</div>`;
}

function bedtimeSurface(session) {
    const stories = Array.isArray(session.stories) ? session.stories : [];
    if (!stories.length) return '';
    const html = stories.map(story => {
        const chapters = (Array.isArray(story.chapters) ? story.chapters : []).map((chapter, index) => `<section class="rmt-bedtime-chapter"><small>第 ${index + 1} 章</small><h3>${esc(textOf(chapter.title) || '本章')}</h3><p>${esc(textOf(chapter.text))}</p></section>`).join('');
        return `<article class="rmt-bedtime-reader"><header><small>${esc(textOf(story.genre))} · 睡前故事</small><h2>${esc(textOf(story.title) || '故事')}</h2><p>${esc(textOf(story.premise))}</p></header>${chapters}</article>`;
    }).join('');
    return `<section class="rmt-bedtime">${html}</section>`;
}

function pastSurface(session) {
    const episodes = Array.isArray(session.episodes) ? session.episodes : [];
    if (session.kind === 'timeEcho') return '';
    if (!episodes.length) return '';
    const html = episodes.map(episode => {
        const opening = episode?.opening ? `<article class="rmt-past-slip"><h3>${esc(textOf(episode.opening.motif) || textOf(episode.title))}</h3><p>${esc(textOf(episode.opening.text))}</p></article>` : '';
        const dossiers = (Array.isArray(episode?.dossiers) ? episode.dossiers : []).map(dossier => `<article class="rmt-past-paper"><header><h3>${esc(textOf(dossier.title))}</h3></header><p>${esc(textOf(dossier.synopsis))}</p></article>`).join('');
        return `<article class="rmt-past-draw is-open"><h3>${esc(textOf(episode.title))}</h3>${opening}${dossiers}</article>`;
    }).join('');
    return `<section class="rmt-past-lives">${html}</section>`;
}

function timeSurface(session) {
    const episodes = Array.isArray(session.episodes) ? session.episodes : [];
    if (!episodes.length) return '';
    const html = episodes.map(episode => {
        const lines = Array.isArray(episode?.lines) ? episode.lines : (Array.isArray(episode?.dialogue) ? episode.dialogue : []);
        const body = lines.map(line => {
            const speaker = line?.speaker === 'b' ? 'b' : line?.speaker === 'a' ? 'a' : 'narrator';
            const text = textOf(line?.text) || textOf(line);
            return text ? `<article class="rmt-time-line" data-rmt-time-speaker="${speaker}"><p>${esc(text)}</p></article>` : '';
        }).join('');
        return `<div><h3>${esc(textOf(episode.title))}</h3>${body}</div>`;
    }).join('');
    return `<section class="rmt-time-stories">${html}</section>`;
}

function moduleSurface(session) {
    const kind = typeof session.kind === 'string' ? session.kind : '';
    if (kind === 'relations') return relationsSurface(session);
    if (kind === 'album') return albumSurface(session);
    if (kind === 'adv') return advSurface(session);
    if (kind === 'inbox') return inboxSurface(session);
    if (kind === 'cabinet') return cabinetSurface(session);
    if (kind === 'room') return roomSurface(session);
    if (kind === 'items') return itemsSurface(session);
    if (kind === 'calendar') return calendarSurface(session);
    if (kind === 'travel') return travelSurface(session);
    if (kind === 'ending') return endingSurface(session);
    if (kind === 'butterfly') return butterflySurface(session);
    if (kind === 'themeSong') return songSurface(session);
    if (kind === 'bedtime') return bedtimeSurface(session);
    if (kind === 'pastLives') return pastSurface(session);
    if (kind === 'timeEcho') return timeSurface(session);
    return '';
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
    const heartBody = heartHtml(session, who);
    const heart = heartBody ? `<div class="rmt-heart"><div class="rmt-heart-drama-layout"><main>${heartBody}</main></div></div>` : '';
    const phone = phoneHtml(session);
    const surface = moduleSurface(session);
    if (heart || phone || surface) return `<div class="rmt-round-reading">${heart}${phone}${surface}</div>`;
    return plainHtml(session);
}
