import * as stickers from '../extras/stickers.js';
import * as store from '../core/stickerStore.js';
import * as couple_styles from '../extras/coupleAvatarStyles.js';
import * as chibi_filter from '../extras/coupleAvatarChibiFilter.js';
import * as core_context from '../core/context.js';
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as runtime from '../core/state.js';
import * as overlay from './overlay.js';
import * as routes from './workspaceState.js';
import * as workspace from './workspace.js';
import * as styles from './stickersCss.js';

// 表情包编辑页。首页一组一个图标；点进一组再看里面的每个表情。
const esc = value => text.esc(value);
const OWNER_TABS = ['char', 'user', 'pair', 'other'];
const drafts = new Map(); // scope → unsaved drawing, kept while the page is closed
const redrawing = new Set(); // saved sticker ids being redrawn one at a time
const imageEdits = new Map(); // scope + sticker → latest explicit picture/caption operation
let active = null, modal = null;

function ensureStyles() {
    if (document.getElementById('rmt-stk-styles')) return;
    const node = document.createElement('style'); node.id = 'rmt-stk-styles'; node.textContent = styles.stickersCss(); document.head.append(node);
}
function hostContext() { return globalThis.SillyTavern?.getContext?.() || null; }
function current(view) {
    try { return active === view && view.root?.isConnected && !view.host.hidden && runtime.state.activeMode === stickers.STICKER_MODE
        && store.stickerScope(hostContext()) === view.scope; }
    catch { return false; }
}
function report(view, message) {
    if (!current(view)) return;
    view.message = message || '';
    const node = view.root.querySelector('[data-stk-status]'); if (node) node.textContent = view.message;
}
function failure(view, error) { report(view, text.safeErrorSummary(error) || '这次操作没有完成，请重试。'); }
function data() { return store.readStickerData(hostContext()); }
function imageEditKey(context, id) { return JSON.stringify([store.stickerScope(context), id]); }
function beginImageEdit(context, id) {
    const key = imageEditKey(context, id), scope = store.stickerScope(context), token = {};
    imageEdits.set(key, token);
    return {
        isCurrent: () => imageEdits.get(key) === token && store.stickerScope(context) === scope && store.stickerScope(hostContext()) === scope,
        finish: () => { if (imageEdits.get(key) === token) imageEdits.delete(key); },
    };
}
function cancelImageEdit(context, id) { imageEdits.delete(imageEditKey(context, id)); }
function label(owner) {
    const ctx = hostContext();
    return owner === 'user' ? '我' : store.ownerLabel(owner, ctx);
}
function packTitle(pack) { return pack.title || (pack.owner === 'other' ? '导入的表情' : '一组表情'); }
function coverOf(pack) { return pack.stickers.find(row => row.id === pack.cover) || pack.stickers[0] || null; }
function head(title, subtitle = '', back = true) {
    return `<header class="rmt-stk-head">${back ? '<button type="button" class="rmt-stk-back" data-stk-action="home" aria-label="返回表情包首页">‹</button>' : ''}<div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></header><p class="rmt-stk-status" data-stk-status role="status" aria-live="polite">${esc(active?.message || '')}</p>`;
}

// ---------- 弹层 ----------
export function closeStickerDialog({ restoreFocus = true } = {}) {
    if (!modal) return false;
    const previous = modal; modal = null; previous.cleanup?.();
    previous.host?.removeEventListener('cancel', previous.cancel, true);
    previous.shade.remove();
    if (restoreFocus && previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    return true;
}
function dialog(view, title, contents) {
    closeStickerDialog({ restoreFocus: false });
    if (!current(view)) return null;
    const shell = view.root.closest('.rmt-shell') || view.host;
    const shade = document.createElement('div'); shade.className = 'rmt-stk-shade';
    shade.innerHTML = `<section class="rmt-stk-sheet" role="dialog" aria-modal="true" aria-labelledby="rmt-stk-dialog-title"><header><h2 id="rmt-stk-dialog-title">${esc(title)}</h2><button type="button" class="rmt-stk-close" data-stk-close aria-label="关闭">✕</button></header><div class="rmt-stk-sheet-body" style="display:flex;flex-direction:column;gap:12px">${contents}</div></section>`;
    const host = shell.closest('dialog'), focus = document.activeElement;
    const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); closeStickerDialog(); };
    const m = { shade, body: shade.querySelector('.rmt-stk-sheet-body'), host, cancel, focus, cleanup: null };
    shell.append(shade); modal = m;
    host?.addEventListener('cancel', cancel, true);
    shade.addEventListener('click', event => {
        if (event.target === shade || event.target.closest('[data-stk-close]')) { event.preventDefault(); event.stopPropagation(); closeStickerDialog(); }
    });
    shade.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(event); });
    shade.querySelector('[data-stk-close]').focus({ preventScroll: true });
    return m;
}
function confirmDialog(view, title, message, okLabel) {
    return new Promise(resolve => {
        const m = dialog(view, title, `<p>${esc(message)}</p><div class="rmt-stk-two"><button type="button" data-stk-no>取消</button><button type="button" class="rmt-stk-primary" data-stk-yes>${esc(okLabel)}</button></div>`);
        if (!m) return resolve(false);
        let done = false;
        m.cleanup = () => { if (!done) { done = true; resolve(false); } };
        m.body.querySelector('[data-stk-no]').addEventListener('click', () => closeStickerDialog());
        m.body.querySelector('[data-stk-yes]').addEventListener('click', () => { done = true; closeStickerDialog(); resolve(true); });
    });
}
function askText(view, title, value, placeholder) {
    return new Promise(resolve => {
        const m = dialog(view, title, `<input data-stk-input maxlength="20" value="${esc(value)}" placeholder="${esc(placeholder)}"><div class="rmt-stk-two"><button type="button" data-stk-no>取消</button><button type="button" class="rmt-stk-primary" data-stk-yes>保存</button></div>`);
        if (!m) return resolve(null);
        let done = false;
        m.cleanup = () => { if (!done) { done = true; resolve(null); } };
        const input = m.body.querySelector('[data-stk-input]'); input.focus(); input.select();
        m.body.querySelector('[data-stk-no]').addEventListener('click', () => closeStickerDialog());
        const ok = () => { done = true; const result = input.value; closeStickerDialog(); resolve(result); };
        m.body.querySelector('[data-stk-yes]').addEventListener('click', ok);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); ok(); } });
    });
}

// ---------- 页面 ----------
function loreSummary(current) {
    const state = stickers.loreState(current, hostContext());
    if (state.unconfirmed) return state.removed ? '撤除已提交 · 待确认' : '已提交 · 保存未确认';
    if (state.written) return `已加入「${state.book}」`;
    return state.book ? `未加入 · 主世界书「${state.book}」` : '未加入';
}
function floatRow() {
    const on = store.stickerFloatEnabled(hostContext());
    return `<button type="button" class="rmt-stk-row" role="switch" aria-checked="${on}" data-stk-action="float"><span>悬浮小兔子</span><span>${on ? '聊天页显示，可以拖动' : '已关 · 从魔法棒菜单「表情包」打开'}</span><span class="rmt-stk-switch" aria-hidden="true"></span></button>`;
}
function draftBanner(view) {
    const draft = drafts.get(view.scope);
    if (!draft) return '';
    const textValue = draft.status === 'running' ? `正在画${label(draft.owner)}的一组 · ${draft.progress || '准备中'}`
        : draft.status === 'failed' ? `上次没画完：${draft.message}` : `${label(draft.owner)}的一组画好了，等你确认`;
    return `<button type="button" class="rmt-stk-row" data-stk-action="cut"><span>${esc(textValue)}</span><span></span><span aria-hidden="true">›</span></button>`;
}
function homeHtml(view) {
    const current = data(), tab = view.tab;
    const packs = current.packs.filter(pack => pack.owner === tab);
    const cards = packs.map(pack => {
        const cover = coverOf(pack);
        return `<button type="button" class="rmt-stk-pack" data-stk-pack="${esc(pack.id)}">${cover ? `<img src="${esc(cover.url)}" alt="" loading="lazy">` : '<span class="rmt-stk-plus">·</span>'}<b>${esc(packTitle(pack))}</b><small>${pack.stickers.length} 个</small></button>`;
    }).join('');
    const add = tab === 'other'
        ? '<button type="button" class="rmt-stk-pack rmt-stk-dashed" data-stk-action="import-new"><span class="rmt-stk-plus">＋</span><b>导入图片</b><small>两边都能发</small></button>'
        : `<button type="button" class="rmt-stk-pack rmt-stk-dashed" data-stk-action="idea" data-stk-owner="${tab}"><span class="rmt-stk-plus">＋</span><b>新的一组</b><small>写想法出图</small></button>`;
    return `<main class="rmt-stk">${head('表情包', `给${label('char')}和你做几组表情，在聊天页点小兔子就能发。`, false)}`
        + draftBanner(view)
        + `<button type="button" class="rmt-stk-row" data-stk-action="lore"><span>世界书</span><span>${esc(loreSummary(current))}</span><span aria-hidden="true">›</span></button>`
        + floatRow()
        + `<nav class="rmt-stk-seg is-4" aria-label="表情分组">${OWNER_TABS.map(owner => `<button type="button" data-stk-tab="${owner}" aria-pressed="${tab === owner}">${esc(label(owner))}</button>`).join('')}</nav>`
        + `<section class="rmt-stk-packs">${cards}${add}</section>`
        + `<p class="rmt-stk-muted">${tab === 'other' ? '导入的图片放在「其他」，你和' + esc(label('char')) + '都能发。' : tab === 'pair' ? '双人表情一张图切成 4 个，两个人一起出现。' : '单人表情一张竖图切成 6 个。'}图片存在你自己酒馆的图片文件夹里，不用图床。</p></main>`;
}
function packHtml(view) {
    const pack = data().packs.find(row => row.id === view.packId);
    if (!pack) { view.page = 'home'; return homeHtml(view); }
    const cells = pack.stickers.map(row => `<button type="button" class="rmt-stk-cell" data-stk-sticker="${esc(row.id)}"><img src="${esc(row.url)}" alt="" loading="lazy"><span>${esc(row.name)}</span>${row.id === pack.cover ? '<em>封面</em>' : ''}</button>`).join('');
    return `<main class="rmt-stk">${head(packTitle(pack), `${label(pack.owner)} · ${pack.stickers.length} 个${pack.style ? ' · ' + stickers.stickerStyleLabel(pack.style) : ''}`)}`
        + `<section class="rmt-stk-grid">${cells || '<p class="rmt-stk-empty">这一组空了。</p>'}</section>`
        + (pack.owner === 'other' ? '<button type="button" data-stk-action="import-more">导入更多图片</button>' : '')
        + `<div class="rmt-stk-two"><button type="button" data-stk-action="rename-pack">改组名</button><button type="button" class="rmt-stk-danger" data-stk-action="delete-pack">删除这一组</button></div></main>`;
}
function ideaHtml(view) {
    const idea = view.idea, size = stickers.sheetSize(idea.owner), count = idea.items.length;
    const sheets = Math.ceil(count / size);
    const styleButtons = stickers.STICKER_STYLES.map(id => {
        const style = couple_styles.COUPLE_STYLES.find(row => row.id === id);
        return `<button type="button" class="rmt-stk-style" data-stk-style="${id}" aria-pressed="${idea.styleId === id}"><b>${esc(style?.label || id)}</b><small>${esc(style?.description || '')}</small></button>`;
    }).join('');
    const items = idea.items.map((item, index) => `<div class="rmt-stk-item" data-stk-item="${index}"><b>${index + 1}</b><div><input data-stk-item-field="name" maxlength="8" value="${esc(item.name)}" aria-label="第 ${index + 1} 个的名字" placeholder="名字"><input data-stk-item-field="meaning" maxlength="60" value="${esc(item.meaning)}" aria-label="第 ${index + 1} 个的意思" placeholder="意思（写进世界书）"><textarea data-stk-item-field="prompt" rows="2" aria-label="第 ${index + 1} 个的画面" placeholder="画面（英文更稳）">${esc(item.prompt)}</textarea></div><button type="button" data-stk-action="remove-item" data-stk-index="${index}" aria-label="删除第 ${index + 1} 项">✕</button></div>`).join('');
    const people = idea.people.map((person, index) => `<label class="rmt-stk-field">${esc(person.name)}<textarea data-stk-person="${index}" rows="2">${esc(person.appearance)}</textarea></label>`).join('');
    return `<main class="rmt-stk">${head('写想法出一组')}`
        + `<div class="rmt-stk-field">给谁画<div class="rmt-stk-seg is-3">${['char', 'user', 'pair'].map(owner => `<button type="button" data-stk-idea-owner="${owner}" aria-pressed="${idea.owner === owner}">${esc(label(owner))}</button>`).join('')}</div><small>${idea.owner === 'pair' ? '一张横图切成 4 个，两个人一起出现。' : '一张竖图切成 6 个。'}多于一张的部分会分几张画。</small></div>`
        + `<div class="rmt-stk-field">画风<div class="rmt-stk-two">${styleButtons}</div></div>`
        + `<details class="rmt-stk-card"><summary class="rmt-stk-check"><span>外貌（沿用情侣头像里的）</span><small>点开可改，只用于这次</small></summary>${people}`
        + `<label class="rmt-stk-field">Q 版外貌过滤 <small>去掉身高、体型、骨相这类写实描述，免得画回正常比例；只影响这次出图</small><select data-stk-chibi>${[['', '每次询问'], ['auto', '自动过滤'], ['off', '不过滤']].map(([value, name]) => `<option value="${value}"${(data().settings.chibiFilter || '') === value ? ' selected' : ''}>${name}</option>`).join('')}</select></label></details>`
        + `<label class="rmt-stk-field">想要什么样的表情<textarea data-stk-idea-text rows="3" placeholder="比如：一组绿色外星人主题，发呆、想回家、躺平、委屈巴巴，戴触角发箍。">${esc(idea.text)}</textarea></label>`
        + `<div class="rmt-stk-four">${stickers.IDEA_CHIPS.map(([name], index) => `<button type="button" data-stk-chip="${index}">${esc(name)}</button>`).join('')}</div>`
        + `<p class="rmt-stk-muted">模型能联网时会先查这个题材常见的表情包；不能联网就按它已知的写。只学题材、情绪和动作，不照抄别人的角色造型和名字。</p>`
        + `<button type="button" data-stk-action="list"${idea.busy ? ' disabled' : ''}>${idea.busy ? '正在列清单…' : `生成表情清单（${size} 个，不花出图次数）`}</button>`
        + `<div class="rmt-stk-head"><div><h3>表情清单 · ${count} 个</h3></div><small>每一项都能改，可删</small></div>`
        + `<section class="rmt-stk-items">${items || '<p class="rmt-stk-empty">先写想法生成清单，或者自己加。</p>'}</section>`
        + `<button type="button" class="rmt-stk-dashed" data-stk-action="add-item">＋ 自己加一项</button>`
        + `<div class="rmt-stk-foot"><p class="rmt-stk-warn">出图前请在柏宝绘里临时去掉负面词 multiple views，否则可能只画出一两个。</p>`
        + `<button type="button" class="rmt-stk-primary" data-stk-action="draw"${count ? '' : ' disabled'}>${count ? `开始出图 · ${sheets} 张切成 ${count} 个` : '开始出图'}</button></div></main>`;
}
function cutHtml(view) {
    const draft = drafts.get(view.scope);
    if (!draft) { view.page = 'home'; return homeHtml(view); }
    let body = '';
    const missing = draft.failed?.length || 0;
    if (draft.status === 'running') body = `<div class="rmt-stk-progress" role="status"><span>${esc(draft.progress || '准备中…')}</span></div><p class="rmt-stk-muted">可以先离开这一页，画好后回到表情包首页确认。</p><button type="button" data-stk-action="stop-draw">停止等待</button>`;
    else if (draft.status === 'failed' && !draft.sheets.length) body = `<div class="rmt-stk-progress" role="alert"><span>${esc(draft.message)}</span></div><div class="rmt-stk-two"><button type="button" data-stk-action="discard">放弃</button><button type="button" class="rmt-stk-primary" data-stk-action="redraw">再画一次</button></div>`;
    else {
        const notes = draft.sheets.map(sheet => sheet.mode === 'grid' ? `第 ${sheet.chunk + 1} 张没找到清楚的白边，已按 ${sheet.layout.rows}×${sheet.layout.cols} 格子切开。` : '').filter(Boolean);
        const cells = draft.sheets.flatMap(sheet => sheet.pieces.map((piece, p) => `<button type="button" class="rmt-stk-cell${piece.removed ? ' is-removed' : ''}" data-stk-piece="${sheet.chunk}:${p}"><img src="${esc(piece.preview)}" alt=""><span>${esc(sheet.items[p]?.name || '未命名')}</span>${piece.removed ? '<em>已去掉</em>' : ''}</button>`)).join('');
        const kept = draft.sheets.reduce((sum, sheet) => sum + sheet.pieces.filter(piece => !piece.removed).length, 0);
        body = `<div class="rmt-stk-sheets">${draft.sheets.map(sheet => `<a href="${esc(sheet.url)}" target="_blank" rel="noopener noreferrer" aria-label="查看第 ${sheet.chunk + 1} 张原图"><img src="${esc(sheet.url)}" alt=""></a>`).join('')}</div>`
            + (notes.length ? `<p class="rmt-stk-muted">${esc(notes.join(' '))}点单个表情可以单张重画。</p>` : '<p class="rmt-stk-muted">点单个表情可以改名、配字、单张重画。</p>')
            + (draft.status === 'failed' ? `<p class="rmt-stk-warn">${esc(draft.message)}</p>` : '')
            + `<section class="rmt-stk-grid">${cells}</section>`
            + `<div class="rmt-stk-two">${missing ? `<button type="button" class="rmt-stk-primary" data-stk-action="redraw-missing"${draft.saving ? ' disabled' : ''}>只补画没画好的 ${missing} 张</button>` : ''}<button type="button" data-stk-action="regrid"${draft.saving ? ' disabled' : ''}>按格子重切</button><button type="button" data-stk-action="redraw"${draft.saving ? ' disabled' : ''}>整张重画</button><button type="button" data-stk-action="discard"${draft.saving ? ' disabled' : ''}>放弃这一组</button><button type="button" class="rmt-stk-primary" data-stk-action="save-draft"${kept && !draft.saving ? '' : ' disabled'}>${draft.saving ? '正在保存…' : `保存这 ${kept} 个`}</button></div>`;
    }
    return `<main class="rmt-stk">${head('切好的表情', `${label(draft.owner)} · ${stickers.stickerStyleLabel(draft.styleId)}`)}${body}</main>`;
}
function loreHtml(view) {
    const current = data(), ctx = hostContext(), state = stickers.loreState(current, ctx);
    const where = state.unconfirmed ? `已向「${state.book}」提交${state.removed ? '撤除' : '表情规则'}，酒馆未提供保存回执。请刷新酒馆后在世界书中核对；也可以手动重试。`
        : state.written ? `已在主世界书「${state.book}」里写了一条「${store.LORE_COMMENT}」。撤掉时只移除本角色可确认归属的条目。`
        : state.book ? `${label('char')}已有主世界书「${state.book}」，会在里面追加一条「${store.LORE_COMMENT}」，不动其他条目。`
            : `${label('char')}还没有主世界书，会新建一份带独立后缀的表情包世界书并绑定，不覆盖已有同名书。`;
    const char = esc(label('char'));
    return `<main class="rmt-stk">${head('世界书')}`
        + `<section class="rmt-stk-card"><h3>加入世界书</h3><p class="rmt-stk-muted">${esc(where)}</p><p class="rmt-stk-muted">剧情里写到${char}用手机等通讯设备发消息时，${char}会在那些消息里挑合适的表情发；正文叙述里不发。</p><div class="rmt-stk-two"><button type="button" class="rmt-stk-primary" data-stk-action="lore-write"${state.empty ? ' disabled' : ''}>${state.written ? '更新世界书' : '加入世界书'}</button><button type="button" class="rmt-stk-danger" data-stk-action="lore-remove"${state.tracked ? '' : ' disabled'}>${state.removed ? '重试撤除' : '撤掉这一条'}</button></div></section>`
        + `<section class="rmt-stk-field">条目预览<pre class="rmt-stk-pre">${esc(state.content || '还没有表情。')}</pre><small>只写名字和一句意思，不放图片地址${state.content ? `，约 ${state.content.length} 字` : ''}；放在最新几条消息之前，不受世界书预算限制，只在正常回复、继续、重新生成和换一条时生效，不进其他插件的后台请求。改了表情、或插件更新后打开聊天，都会自动更新已写入的条目。</small></section></main>`;
}

function paint(view) {
    if (!current(view)) return;
    const html = view.page === 'pack' ? packHtml(view) : view.page === 'idea' ? ideaHtml(view) : view.page === 'cut' ? cutHtml(view)
        : view.page === 'lore' ? loreHtml(view) : homeHtml(view);
    const scroll = view.page === view.paintedPage ? view.body.scrollTop : 0;
    view.root.innerHTML = html; view.paintedPage = view.page;
    view.body.scrollTop = scroll;
}
function go(view, page, extra = {}) {
    closeStickerDialog({ restoreFocus: false });
    Object.assign(view, extra, { page, message: '' });
    paint(view);
}

// ---------- 动作 ----------
async function openIdea(view, owner) {
    const ctx = core_context.currentCharacterGuard();
    view.idea = { owner: ['char', 'user', 'pair'].includes(owner) ? owner : 'char', styleId: view.idea?.styleId || 'chibi-dumpling', text: view.idea?.text || '',
        items: [], busy: false, people: view.idea?.people || await stickers.stickerPeople(ctx) };
    go(view, 'idea');
}
function readIdeaForm(view) {
    const idea = view.idea; if (!idea) return;
    const area = view.root.querySelector('[data-stk-idea-text]'); if (area) idea.text = area.value;
    for (const node of view.root.querySelectorAll('[data-stk-person]')) idea.people[Number(node.dataset.stkPerson)].appearance = node.value;
    for (const row of view.root.querySelectorAll('[data-stk-item]')) {
        const item = idea.items[Number(row.dataset.stkItem)]; if (!item) continue;
        for (const field of row.querySelectorAll('[data-stk-item-field]')) item[field.dataset.stkItemField] = field.value;
    }
}
async function makeList(view) {
    readIdeaForm(view);
    const idea = view.idea; idea.busy = true; paint(view);
    try {
        const items = await stickers.requestStickerList({ owner: idea.owner, idea: idea.text, people: idea.people, context: core_context.currentCharacterGuard() });
        idea.items = items; report(view, '');
    } catch (error) { idea.busy = false; paint(view); return failure(view, error); }
    idea.busy = false; paint(view);
}
function progressText(update) {
    const sheet = update?.sheets > 1 ? `第 ${update.sheet}/${update.sheets} 张 · ` : '';
    const phase = { queued: '等待通道', 'queued-remote': '等待通道', waiting: '等待出图', generating: '正在绘制', saving: '正在保存', cutting: '正在切开' }[update?.phase] || '正在绘制';
    return `${sheet}${update?.providerLabel ? update.providerLabel + ' · ' : ''}${phase}`;
}
function repaintDraft(scope) { if (active?.scope === scope && current(active) && (active.page === 'cut' || active.page === 'home')) paint(active); }
function revokeSheets(sheets) { for (const sheet of sheets || []) for (const piece of sheet.pieces) URL.revokeObjectURL(piece.preview); }
function sheetNumbers(failed) { return failed.map(row => row.chunk + 1).sort((a, b) => a - b).join('、'); }
const SETTLING_MESSAGE = '上一组还在收尾，画好的会自动留下，稍等几秒再补画。';
// A provider that never answers must not block 补画 forever.
const SETTLE_CAP_MS = 10 * 60 * 1000;
function clearSettling(scope) { if (active?.scope === scope && active.message === SETTLING_MESSAGE) active.message = ''; }
function sheetChunks(draft) { return new Set(draft.sheets.map(sheet => sheet.chunk)); }
// A sheet joins the draft the moment it is cut, replacing an older sheet of the same chunk.
function mergeSheet(draft, sheet) {
    revokeSheets(draft.sheets.filter(row => row.chunk === sheet.chunk && row !== sheet));
    draft.sheets = [...draft.sheets.filter(row => row.chunk !== sheet.chunk), sheet].sort((a, b) => a.chunk - b.chunk);
    draft.failed = (draft.failed || []).filter(row => row.chunk !== sheet.chunk);
}
function stoppedMessage(draft) {
    return draft.sheets.length ? `已停止等待。画好的 ${draft.sheets.length} 张已保留，正在画的那张好了也会留下。` : '已停止等待，这一组还没有画好的。正在画的那张好了会留下。';
}
// missingOnly: draw only the sheets that failed last time; finished sheets stay.
async function runDraw(view, draft, { missingOnly = false } = {}) {
    if (draft.status === 'running' || draft.saving) return;
    // A stopped run is still finishing: its sheet may yet arrive, so a new run
    // now would pay for that sheet twice.
    if (draft.run && Date.now() - (draft.run.stoppedAt || 0) < SETTLE_CAP_MS) return report(view, SETTLING_MESSAGE);
    const all = stickers.chunkItems(draft.owner, draft.items).map((items, index) => ({ index, items }));
    const have = sheetChunks(draft);
    const retry = missingOnly && draft.failed?.length
        ? draft.failed.filter(row => !have.has(row.chunk)).map(row => ({ index: row.chunk, items: row.items, url: row.url })) : null;
    if (!retry) { revokeSheets(draft.sheets); draft.sheets = []; }
    const chunks = retry || all, controller = new AbortController();
    draft.status = 'running'; draft.progress = '准备中…'; draft.message = ''; draft.failed = [];
    const run = { controller, chunks, stopped: false, stoppedAt: 0 };
    draft.run = run;
    clearSettling(draft.scope);
    repaintDraft(draft.scope);
    const kept = () => drafts.get(draft.scope) === draft, live = () => kept() && draft.run === run;
    let outcome;
    try {
        outcome = await stickers.drawStickerSheets({ owner: draft.owner, styleId: draft.styleId, chunks, total: all.length, people: draft.people,
            context: core_context.currentCharacterGuard(), signal: controller.signal, setKey: draft.id, onProgress: update => {
                if (!live() || controller.signal.aborted) return;
                draft.progress = progressText(update);
                const node = active?.scope === draft.scope && active.page === 'cut' ? active.root.querySelector('.rmt-stk-progress span') : null;
                if (node) node.textContent = draft.progress;
            }, onSheet: sheet => {
                // Discarded meanwhile: release the previews this run made.
                if (!kept()) { revokeSheets([sheet]); return; }
                // Kept even when it arrives after 停止等待: it is already paid for.
                mergeSheet(draft, sheet);
                if (run.stopped && live()) draft.message = stoppedMessage(draft);
                if (run.stopped) repaintDraft(draft.scope);
            } });
    } catch (error) {
        const message = text.safeErrorSummary(error) || '这次没有画完，可以再试一次。';
        outcome = { sheets: [], failed: chunks.map(row => ({ chunk: row.index, items: row.items, url: row.url || '', message })) };
    }
    if (!live()) return;
    draft.run = null;
    finishDraw(draft, outcome, all.length, run.stopped);
    clearSettling(draft.scope);
    repaintDraft(draft.scope);
}
function finishDraw(draft, outcome, total, stopped) {
    // Sheets already joined the draft as they were cut.
    for (const sheet of outcome.sheets) if (!draft.sheets.includes(sheet)) mergeSheet(draft, sheet);
    const have = sheetChunks(draft);
    draft.failed = outcome.failed.filter(row => !have.has(row.chunk));
    if (!draft.failed.length) { draft.status = 'done'; draft.message = ''; return; }
    draft.status = 'failed';
    const first = draft.failed[0]?.message || '这一张没有画好。';
    draft.message = !draft.sheets.length ? (stopped ? '已停止等待，这一组还没有画好的。' : first)
        : `${total} 张里第 ${sheetNumbers(draft.failed)} 张没画好${stopped ? '（已停止等待）' : `：${first}`}。画好的已保留，可以只补画缺的。`;
}
// Stop waiting: the page is usable again right away. The sheet being drawn or
// cut keeps going and joins the draft when it is done; until that run settles,
// runDraw refuses a new one so the same sheet is never paid for twice.
function stopDraw(view) {
    const draft = drafts.get(view.scope), run = draft?.run;
    if (!draft || draft.status !== 'running' || !run) return;
    run.stopped = true; run.stoppedAt = Date.now();
    run.controller.abort();
    draft.status = 'failed';
    const have = sheetChunks(draft);
    draft.failed = run.chunks.filter(row => !have.has(row.index)).map(row => ({ chunk: row.index, items: row.items, url: row.url || '', message: '已停止等待这一张。' }));
    draft.message = stoppedMessage(draft);
    repaintDraft(draft.scope);
}
async function startDraw(view) {
    readIdeaForm(view);
    const idea = view.idea, items = stickers.normalizeStickerItems(idea.items, 24);
    if (!items.length) return report(view, '清单是空的，先生成或自己加一项。');
    const previous = drafts.get(view.scope);
    if (previous?.status === 'running') { go(view, 'cut'); return report(view, '上一组还在画，等它画完再开始新的。'); }
    if (previous && !await confirmDialog(view, '还有一组没保存', '开始新的会放弃上一组还没保存的表情。', '放弃并开始')) return;
    const people = await chibiFilteredPeople(view, idea.owner, idea.people.map(row => ({ ...row })));
    if (!people) return;
    discardDraft(view.scope);
    const draft = { id: store.newStickerId('set'), scope: view.scope, owner: idea.owner, styleId: idea.styleId, idea: idea.text, items, people, sheets: [], failed: [], status: 'idle' };
    drafts.set(view.scope, draft);
    void runDraw(view, draft);
    go(view, 'cut');
}
// Same Q-version filter as the couple avatars: only the people this set draws.
async function chibiFilteredPeople(view, owner, people) {
    const mode = chibi_filter.chibiFilterMode(data().settings.chibiFilter);
    const sides = owner === 'char' ? [0] : owner === 'user' ? [1] : [0, 1];
    const result = chibi_filter.chibiFilterPeople(people);
    const changed = sides.some(index => result.rows[index]?.removed.length);
    if (mode === 'off' || !changed) return people;
    const apply = texts => people.map((person, index) => sides.includes(index) ? { ...person, appearance: texts[index] ?? person.appearance } : person);
    if (mode === 'auto') return apply(result.rows.map(row => row.text));
    return new Promise(resolve => {
        let done = false; const finish = value => { if (done) return; done = true; resolve(value); };
        const parts = sides.map(index => { const row = result.rows[index];
            return `<section class="rmt-stk-field">${esc(people[index].name)}${row.removed.length ? `<small>会去掉：${row.removed.map(part => `<s>${esc(part)}</s>`).join('、')}</small>` : '<small>这一位没有需要去掉的内容。</small>'}<textarea data-stk-filter-text="${index}" rows="3">${esc(row.text)}</textarea></section>`; }).join('');
        const m = dialog(view, '要不要过滤成更适合 Q 版的外貌？', `<p class="rmt-stk-muted">外貌里有身高、体型、骨相、鼻唇细节这类写实描述，容易把表情包画回正常比例。过滤后只留发型、眼睛、痣疤、配饰、衣着颜色这些认人的特征；只影响这一次，不改你填的外貌。</p>${parts}`
            + '<label class="rmt-stk-check"><span>以后都这样处理，不再询问<br><small>可以在“外貌”里的“Q 版外貌过滤”改回来</small></span><input type="checkbox" data-stk-filter-remember></label>'
            + '<div class="rmt-stk-two"><button type="button" data-stk-filter="no">保持原样出图</button><button type="button" class="rmt-stk-primary" data-stk-filter="yes">过滤后出图</button></div>');
        if (!m) return finish(people);
        m.cleanup = () => finish(null);
        m.body.addEventListener('click', event => {
            const target = event.target.closest('[data-stk-filter]'); if (!target) return;
            const filter = target.dataset.stkFilter === 'yes', remember = !!m.body.querySelector('[data-stk-filter-remember]')?.checked;
            const texts = result.rows.map((row, index) => m.body.querySelector(`[data-stk-filter-text="${index}"]`)?.value.trim() ?? row.text);
            finish(filter ? apply(texts) : people); closeStickerDialog();
            if (remember) void stickers.saveStickerData(current => ({ ...current, settings: { ...current.settings, chibiFilter: filter ? 'auto' : 'off' } }), hostContext()).catch(() => {});
        });
    });
}
function discardDraft(scope) {
    const draft = drafts.get(scope); if (!draft) return;
    draft.run?.controller.abort();
    revokeSheets(draft.sheets);
    drafts.delete(scope);
}
async function regrid(view) {
    const draft = drafts.get(view.scope); if (!draft || draft.status === 'running' || draft.saving) return;
    report(view, '正在按格子重切…');
    for (const sheet of draft.sheets) {
        const cut = await stickers.cutSheet(sheet.url, sheet.layout, { forceGrid: true });
        for (const piece of sheet.pieces) URL.revokeObjectURL(piece.preview);
        sheet.pieces = cut.pieces; sheet.mode = 'grid';
    }
    paint(view); report(view, '已按格子重新切开。');
}
async function saveDraft(view) {
    const draft = drafts.get(view.scope); if (!draft || draft.status === 'running' || draft.saving) return;
    const ctx = core_context.currentCharacterGuard(), list = [];
    if (store.stickerScope(ctx) !== draft.scope) return report(view, '现在打开的不是这组表情的角色，没有保存。回到原来的角色再保存。');
    if (draft.sheets.some(sheet => sheet.pieces.some(piece => piece.redrawing))) return report(view, '还有一张在重画，等它画完再保存。');
    draft.saving = true; paint(view);
    try {
        report(view, '正在存进酒馆图片文件夹…');
        for (const sheet of draft.sheets) for (let i = 0; i < sheet.pieces.length; i++) {
            const piece = sheet.pieces[i], item = sheet.items[i];
            if (piece.removed || !item) continue;
            // A retry after a failed save reuses pictures already uploaded.
            const caption = item.caption || '';
            const saved = piece.saved?.caption === caption ? piece.saved.result
                : await stickers.saveStickerPicture({ blob: piece.blob, caption }, ctx);
            piece.saved = { caption, result: saved };
            list.push({ id: store.newStickerId(), name: item.name, meaning: item.meaning, caption, prompt: item.prompt, ...saved });
            report(view, `正在存进酒馆图片文件夹… ${list.length}`);
        }
        if (!list.length) return report(view, '没有要保存的表情。');
        if (drafts.get(view.scope) !== draft) return;
        if (store.stickerScope(hostContext()) !== draft.scope) {
            return report(view, '保存途中换了角色，这组表情没有写进去。回到原来的角色再点保存，不会重复上传。');
        }
        const title = store.cleanLine(draft.idea, 10) || `${label(draft.owner)}的一组`;
        const pack = { id: store.newStickerId('pack'), owner: draft.owner, title, style: draft.styleId, idea: draft.idea, createdAt: Date.now(), cover: list[0].id, people: draft.people, stickers: list };
        await stickers.saveStickerData(current => ({ ...current, packs: [...current.packs, pack] }), ctx,
            { isCurrent: () => drafts.get(view.scope) === draft && store.stickerScope(hostContext()) === draft.scope });
        discardDraft(view.scope);
        const saved = store.readStickerData(ctx).packs.find(row => row.id === pack.id);
        go(view, 'pack', { packId: pack.id, tab: draft.owner });
        report(view, `已保存 ${saved?.stickers.length || list.length} 个。${stickers.loreState(store.readStickerData(ctx), ctx).written ? '世界书已同步。' : '回首页点「世界书」写进去，角色就知道怎么用了。'}`);
    } finally {
        draft.saving = false;
        if (drafts.get(view.scope) === draft && view.page === 'cut') paint(view);
    }
}

function findSticker(id, context = hostContext()) {
    const current = store.readStickerData(context);
    for (const pack of current.packs) { const sticker = pack.stickers.find(row => row.id === id); if (sticker) return { current, pack, sticker }; }
    return null;
}
async function updateSticker(view, id, change, { context = hostContext(), isCurrent = null } = {}) {
    const scope = store.stickerScope(context);
    if (view.scope && view.scope !== scope) return null;
    const result = await stickers.saveStickerData(current => {
        if (!current.packs.some(pack => pack.stickers.some(row => row.id === id))) return null;
        return { ...current, packs: current.packs.map(pack => ({ ...pack, stickers: pack.stickers.map(row => row.id === id ? { ...row, ...change } : row) })) };
    }, context, { isCurrent: () => store.stickerScope(hostContext()) === scope && (!isCurrent || isCurrent()) });
    return result ? findSticker(id, context) : null;
}
function stickerDialog(view, id) {
    const found = findSticker(id); if (!found) return;
    const { pack, sticker } = found, token = store.stickerToken(pack.owner, sticker.name, hostContext());
    const m = dialog(view, `${label(pack.owner)} · ${sticker.name}`, `<div class="rmt-stk-preview"><img src="${esc(sticker.url)}" alt="${esc(sticker.name)}"></div><code class="rmt-stk-token">${esc(token)}</code>`
        + `<label class="rmt-stk-field">名字<input data-stk-edit="name" maxlength="8" value="${esc(sticker.name)}"></label>`
        + `<label class="rmt-stk-field">意思 <small>写进世界书，告诉对方这个表情代表什么</small><input data-stk-edit="meaning" maxlength="60" value="${esc(sticker.meaning)}"></label>`
        + `<label class="rmt-stk-field">配字 <small>可留空，字由插件叠上去</small><input data-stk-edit="caption" maxlength="16" value="${esc(sticker.caption)}"></label>`
        + `<p class="rmt-stk-status" data-stk-dialog-status role="status"></p>`
        + `<div class="rmt-stk-two">${pack.owner === 'other' ? '<button type="button" disabled>单张重画</button>' : '<button type="button" data-stk-do="redraw">单张重画</button>'}<button type="button" data-stk-do="replace">换成自己的图</button>`
        + `<button type="button" data-stk-do="cover"${pack.cover === sticker.id ? ' disabled' : ''}>设为这组封面</button><button type="button" data-stk-do="copy">复制暗号</button>`
        + `<a class="rmt-stk-button" href="${esc(sticker.url)}" download="${esc(sticker.name)}.png">保存到本机</a><button type="button" class="rmt-stk-danger" data-stk-do="delete">删掉这个表情</button></div>`
        + `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-stk-replace-file hidden>`);
    if (!m) return;
    const status = value => { const node = m.body.querySelector('[data-stk-dialog-status]'); if (node) node.textContent = value || ''; };
    const setRedrawButton = busy => { const node = m.body.querySelector('[data-stk-do="redraw"]'); if (node) { node.disabled = busy; node.textContent = busy ? '正在重画…' : '单张重画'; } };
    const redrawKey = imageEditKey(hostContext(), id);
    if (redrawing.has(redrawKey)) { setRedrawButton(true); status('这一张正在重画…'); }
    const reopen = () => { if (modal === m) { paint(view); stickerDialog(view, id); } };
    const run = work => Promise.resolve().then(work).catch(error => { if (modal === m) status(text.safeErrorSummary(error) || '这次没有完成，请重试。'); });
    m.body.addEventListener('change', event => {
        const field = event.target.dataset?.stkEdit; if (!field) return;
        void run(async () => {
            const value = event.target.value, ctx = hostContext();
            if (store.stickerScope(ctx) !== view.scope) return;
            if (field === 'name') {
                const name = store.cleanStickerName(value, 8);
                if (!name) { event.target.value = findSticker(id)?.sticker.name || ''; return status('名字不能为空。'); }
                await updateSticker(view, id, { name }, { context: ctx });
                if (findSticker(id)?.sticker.name !== name) status('同组里已有这个名字，已自动加了数字。');
                return reopen();
            }
            if (field === 'meaning') { await updateSticker(view, id, { meaning: value }, { context: ctx }); return status('已保存。'); }
            status('正在叠字…');
            const now = findSticker(id, ctx)?.sticker; if (!now) return;
            const edit = beginImageEdit(ctx, id);
            try {
                const saved = await stickers.saveStickerPicture({ base: now.base, caption: value }, ctx);
                await updateSticker(view, id, { caption: value, ...saved }, { context: ctx, isCurrent: edit.isCurrent });
                reopen();
            } finally { edit.finish(); }
        });
    });
    m.body.addEventListener('click', event => {
        const action = event.target.closest('[data-stk-do]')?.dataset.stkDo; if (!action) return;
        void run(async () => {
            const ctx = hostContext(); if (store.stickerScope(ctx) !== view.scope) return;
            const now = findSticker(id, ctx); if (!now) return closeStickerDialog();
            if (action === 'copy') {
                await navigator.clipboard?.writeText(store.stickerToken(now.pack.owner, now.sticker.name, hostContext()));
                return status('暗号已复制，粘进输入框就能发。');
            }
            if (action === 'cover') {
                await stickers.saveStickerData(current => ({ ...current, packs: current.packs.map(pack => pack.id === now.pack.id ? { ...pack, cover: id } : pack) }), ctx);
                return reopen();
            }
            if (action === 'replace') return m.body.querySelector('[data-stk-replace-file]').click();
            if (action === 'delete') {
                cancelImageEdit(ctx, id);
                await stickers.saveStickerData(current => ({ ...current, packs: current.packs.map(pack => pack.id === now.pack.id ? { ...pack, stickers: pack.stickers.filter(row => row.id !== id) } : pack) }), ctx);
                closeStickerDialog(); paint(view); return report(view, `已删掉「${now.sticker.name}」。`);
            }
            if (action === 'redraw') {
                if (redrawing.has(redrawKey)) return status('这一张正在重画，请等它画完。');
                redrawing.add(redrawKey); setRedrawButton(true);
                const edit = beginImageEdit(ctx, id);
                let piece = null;
                try {
                    status('正在单张重画…');
                    // Redraw with the appearance this set was drawn with, so it still matches.
                    const people = now.pack.people?.length === 2 ? now.pack.people : await stickers.stickerPeople(ctx);
                    piece = await stickers.drawSingleSticker({ owner: now.pack.owner, styleId: now.pack.style || 'chibi-dumpling',
                        item: { name: now.sticker.name, prompt: now.sticker.prompt || now.sticker.meaning || now.sticker.name }, people, context: ctx,
                        targetKey: `single:${redrawKey}`, onProgress: update => { if (modal === m) status(progressText(update)); } });
                    status('正在保存…');
                    const saved = await stickers.saveStickerPicture({ blob: piece.blob, caption: now.sticker.caption }, ctx);
                    await updateSticker(view, id, saved, { context: ctx, isCurrent: edit.isCurrent });
                } finally {
                    if (piece) URL.revokeObjectURL(piece.preview);
                    edit.finish(); redrawing.delete(redrawKey); setRedrawButton(false);
                }
                return reopen();
            }
        });
    });
    m.body.querySelector('[data-stk-replace-file]').addEventListener('change', event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        void run(async () => {
            const ctx = hostContext(); if (store.stickerScope(ctx) !== view.scope) return;
            const now = findSticker(id, ctx)?.sticker; if (!now) return;
            const edit = beginImageEdit(ctx, id);
            status('正在保存图片…');
            try {
                const blob = await stickers.prepareImport(file);
                if (!edit.isCurrent()) return;
                const saved = blob.type === 'image/gif' || blob.type === 'image/webp'
                    ? { base: await stickers.uploadStickerImage(blob, ctx) } : await stickers.saveStickerPicture({ blob, caption: now.caption }, ctx);
                await updateSticker(view, id, { base: saved.base, url: saved.url || saved.base, ...(saved.url ? {} : { caption: '' }) }, { context: ctx, isCurrent: edit.isCurrent });
                reopen();
            } finally { edit.finish(); }
        });
    });
}
function pieceDialog(view, key) {
    const draft = drafts.get(view.scope); if (!draft || draft.status === 'running') return;
    const [chunk, p] = key.split(':').map(Number), sheet = draft.sheets.find(row => row.chunk === chunk), piece = sheet?.pieces[p], item = sheet?.items[p];
    if (!piece || !item) return;
    const m = dialog(view, item.name || '未命名', `<div class="rmt-stk-preview"><img src="${esc(piece.preview)}" alt=""></div>`
        + `<label class="rmt-stk-field">名字<input data-stk-draft="name" maxlength="8" value="${esc(item.name)}"></label>`
        + `<label class="rmt-stk-field">意思 <small>写进世界书</small><input data-stk-draft="meaning" maxlength="60" value="${esc(item.meaning)}"></label>`
        + `<label class="rmt-stk-field">配字 <small>可留空，保存时叠上去</small><input data-stk-draft="caption" maxlength="16" value="${esc(item.caption || '')}"></label>`
        + `<label class="rmt-stk-field">画面<textarea data-stk-draft="prompt" rows="2">${esc(item.prompt)}</textarea></label>`
        + `<p class="rmt-stk-status" data-stk-dialog-status role="status"></p>`
        + `<div class="rmt-stk-two"><button type="button" data-stk-do="redraw">单张重画</button><button type="button" class="rmt-stk-danger" data-stk-do="toggle">${piece.removed ? '放回这一组' : '去掉这个'}</button></div>`);
    if (!m) return;
    m.body.addEventListener('input', event => {
        const field = event.target.dataset?.stkDraft; if (!field) return;
        item[field] = field === 'name' ? store.cleanStickerName(event.target.value, 8) || item.name : event.target.value;
    });
    m.cleanup = () => { if (active === view && view.page === 'cut') queueMicrotask(() => paint(view)); };
    const status = value => { const node = m.body.querySelector('[data-stk-dialog-status]'); if (node) node.textContent = value || ''; };
    const setBusy = busy => { const node = m.body.querySelector('[data-stk-do="redraw"]'); if (node) { node.disabled = busy; node.textContent = busy ? '正在重画…' : '单张重画'; } };
    if (piece.redrawing) { setBusy(true); status('这一张正在重画…'); }
    m.body.addEventListener('click', event => {
        const action = event.target.closest('[data-stk-do]')?.dataset.stkDo; if (!action) return;
        if (action === 'toggle') { if (!piece.redrawing) { piece.removed = !piece.removed; closeStickerDialog(); } return; }
        if (piece.redrawing || draft.saving) return status(piece.redrawing ? '这一张正在重画，请等它画完。' : '正在保存，请稍等。');
        piece.redrawing = true; setBusy(true);
        status('正在单张重画…');
        void stickers.drawSingleSticker({ owner: draft.owner, styleId: draft.styleId, item, people: draft.people, context: core_context.currentCharacterGuard(),
            targetKey: `${draft.id}:piece:${sheet.chunk}:${p}`, onProgress: update => { if (modal === m) status(progressText(update)); } }).then(next => {
            // The set may have been redrawn, saved or discarded meanwhile.
            if (drafts.get(draft.scope) !== draft || !draft.sheets.includes(sheet) || sheet.pieces[p] !== piece) { URL.revokeObjectURL(next.preview); return; }
            URL.revokeObjectURL(piece.preview);
            piece.blob = next.blob; piece.preview = next.preview; piece.removed = false; piece.saved = null;
            if (modal === m) { piece.redrawing = false; closeStickerDialog({ restoreFocus: false }); pieceDialog(view, key); }
        }).catch(error => { if (modal === m) status(text.safeErrorSummary(error) || '这次没有画好，请重试。'); })
            .finally(() => { piece.redrawing = false; if (modal === m) setBusy(false); });
    });
}
async function importFiles(view, files, packId = '') {
    const ctx = core_context.currentCharacterGuard(), added = [];
    report(view, '正在导入…');
    for (const [index, file] of [...files].slice(0, 24).entries()) {
        try {
            const blob = await stickers.prepareImport(file);
            const url = await stickers.uploadStickerImage(blob, ctx);
            added.push({ id: store.newStickerId(), name: stickers.importName(file, index), meaning: '', caption: '', prompt: '', url, base: url });
            report(view, `正在导入… ${added.length}`);
        } catch (error) { report(view, text.safeErrorSummary(error)); }
    }
    if (!added.length) return;
    if (store.stickerScope(hostContext()) !== store.stickerScope(ctx)) {
        return report(view, `导入途中换了角色，${added.length} 张图片已存进酒馆图片文件夹，但没有加进表情包。回到原来的角色再导入。`);
    }
    const target = packId || store.newStickerId('pack');
    const saved = await stickers.saveStickerData(current => {
        if (packId && !current.packs.some(pack => pack.id === packId)) return null;
        const packs = packId ? current.packs.map(pack => pack.id === packId ? { ...pack, stickers: [...pack.stickers, ...added] } : pack)
            : [...current.packs, { id: target, owner: 'other', title: '导入的表情', createdAt: Date.now(), cover: added[0].id, stickers: added }];
        return { ...current, packs };
    }, ctx, { isCurrent: () => store.stickerScope(hostContext()) === view.scope });
    if (!saved) return report(view, '原来那组已经删除，图片文件已保留，但没有重新创建这一组。');
    go(view, 'pack', { packId: target, tab: 'other' });
    report(view, `已导入 ${added.length} 张。点开每张可以改名字和意思，名字就是暗号里的表情名。`);
}

async function handleAction(view, action, target) {
    if (action === 'home') return go(view, 'home');
    if (action === 'lore') return go(view, 'lore');
    if (action === 'cut') return go(view, 'cut');
    if (action === 'idea') return openIdea(view, target.dataset.stkOwner || view.tab);
    if (action === 'import-new' || action === 'import-more') {
        view.importTarget = action === 'import-more' ? view.packId : '';
        return view.fileInput.click();
    }
    if (action === 'rename-pack') {
        const ctx = hostContext(), pack = store.readStickerData(ctx).packs.find(row => row.id === view.packId); if (!pack) return;
        const value = await askText(view, '改组名', pack.title, '比如：外星人日常');
        if (value === null || !current(view)) return;
        await stickers.saveStickerData(latest => ({ ...latest, packs: latest.packs.map(row => row.id === pack.id ? { ...row, title: store.cleanLine(value, 20) } : row) }), ctx);
        return paint(view);
    }
    if (action === 'delete-pack') {
        const ctx = hostContext(), pack = store.readStickerData(ctx).packs.find(row => row.id === view.packId); if (!pack) return;
        if (!await confirmDialog(view, '删除这一组', `「${packTitle(pack)}」里的 ${pack.stickers.length} 个表情会从表情面板和世界书里去掉。图片文件仍留在酒馆图片文件夹。`, '删除')) return;
        if (!current(view)) return;
        for (const sticker of pack.stickers) cancelImageEdit(ctx, sticker.id);
        await stickers.saveStickerData(latest => ({ ...latest, packs: latest.packs.filter(row => row.id !== pack.id) }), ctx);
        go(view, 'home'); return report(view, '已删除这一组。');
    }
    if (action === 'list') return makeList(view);
    if (action === 'add-item') { readIdeaForm(view); view.idea.items.push({ name: '', meaning: '', prompt: '' }); paint(view); view.root.querySelector(`[data-stk-item="${view.idea.items.length - 1}"] input`)?.focus(); return; }
    if (action === 'remove-item') { readIdeaForm(view); view.idea.items.splice(Number(target.dataset.stkIndex), 1); return paint(view); }
    if (action === 'draw') return startDraw(view);
    if (action === 'regrid') return regrid(view);
    if (action === 'redraw' || action === 'redraw-missing') {
        const draft = drafts.get(view.scope);
        if (draft && draft.status !== 'running') void runDraw(view, draft, { missingOnly: action === 'redraw-missing' });
        return;
    }
    if (action === 'stop-draw') return stopDraw(view);
    if (action === 'discard') {
        if (!await confirmDialog(view, '放弃这一组', '切好的表情还没保存，放弃后不会留下。', '放弃')) return;
        discardDraft(view.scope); return go(view, 'home');
    }
    if (action === 'save-draft') return saveDraft(view);
    if (action === 'lore-write') {
        const result = await stickers.writeStickerLore(hostContext());
        paint(view); return report(view, `已向「${result.book}」提交表情规则，保存尚未确认。请刷新酒馆后核对。`
            + (result.legacyPreserved ? '归属不明的旧表情包条目已保留，请在世界书中确认。' : ''));
    }
    if (action === 'float') {
        const on = store.setStickerFloat(!store.stickerFloatEnabled(hostContext()), hostContext());
        paint(view); return report(view, on ? '聊天页会显示悬浮小兔子。' : '悬浮小兔子已关，可以从魔法棒菜单里的「表情包」打开。');
    }
    if (action === 'lore-remove') {
        const ctx = hostContext();
        if (!await confirmDialog(view, '撤掉这一条', `会从世界书里删掉「${store.LORE_COMMENT}」这一条，其他条目不动。`, '撤掉')) return;
        if (!current(view)) return;
        const book = await stickers.removeStickerLore(ctx);
        paint(view); return report(view, (book ? `已向「${book}」提交撤除请求，尚未确认保存。请刷新酒馆后核对。` : '没有已关联的表情规则。')
            + (store.readStickerData(hostContext()).lore.legacyPreserved ? '归属不明的旧表情包条目已保留，请在世界书中确认。' : ''));
    }
}

function bindView(view) {
    view.root.addEventListener('click', event => {
        const target = event.target.closest('button'); if (!target || !current(view) || target.disabled) return;
        const d = target.dataset;
        if (d.stkTab) { view.tab = d.stkTab; return paint(view); }
        if (d.stkPack) return go(view, 'pack', { packId: d.stkPack });
        if (d.stkSticker) return stickerDialog(view, d.stkSticker);
        if (d.stkPiece) return pieceDialog(view, d.stkPiece);
        if (d.stkIdeaOwner) { readIdeaForm(view); if (view.idea.owner !== d.stkIdeaOwner) { view.idea.owner = d.stkIdeaOwner; view.idea.items = []; } return paint(view); }
        if (d.stkStyle) { readIdeaForm(view); view.idea.styleId = d.stkStyle; return paint(view); }
        if (d.stkChip) { readIdeaForm(view); view.idea.text = stickers.IDEA_CHIPS[Number(d.stkChip)]?.[1] || view.idea.text; return paint(view); }
        if (!d.stkAction) return;
        void Promise.resolve().then(() => handleAction(view, d.stkAction, target)).catch(error => failure(view, error));
    });
    view.root.addEventListener('change', event => {
        if (event.target.matches('[data-stk-chibi]')) {
            readIdeaForm(view);
            const value = event.target.value;
            void stickers.saveStickerData(latest => {
                const settings = { ...latest.settings }; if (value) settings.chibiFilter = value; else delete settings.chibiFilter;
                return { ...latest, settings };
            }, hostContext()).catch(error => failure(view, error));
        }
    });
}

export function navigateStickersBack() {
    if (!active || !current(active)) return false;
    if (closeStickerDialog()) return true;
    if (active.page === 'home') return false;
    go(active, 'home');
    return true;
}
export function disposeStickers() {
    if (routes.workspace.route === stickers.STICKER_MODE && active && current(active)) return;
    closeStickerDialog({ restoreFocus: false });
    active?.fileInput?.remove(); active = null;
}

export function openStickers() {
    closeStickerDialog({ restoreFocus: false });
    ensureStyles();
    overlay.openOverlay();
    routes.leaveWorkspaceReader(); routes.workspace.route = stickers.STICKER_MODE; routes.workspace.tab = 'content';
    runtime.state.activeMode = stickers.STICKER_MODE; runtime.state.activeSession = null;
    overlay.topTitle('表情包'); overlay.setBackVisible(true, '内容'); overlay.setManageVisible(false); overlay.setRegenerateVisible(false);
    const body = overlay.bodyEl(), host = document.getElementById(constants.OVERLAY_ID);
    if (runtime.state.activeArchiveSnapshot) {
        body.innerHTML = '<main class="rmt-stk"><h2>表情包</h2><p>表情包跟着角色走。回到对应角色的聊天即可查看与制作。</p></main>';
        active = null; workspace.syncWorkspaceChrome(); return true;
    }
    let scope = '';
    try { core_context.currentCharacterGuard(); scope = store.stickerScope(hostContext()); }
    catch (error) { body.innerHTML = `<main class="rmt-stk"><h2>表情包</h2><p>${esc(text.safeErrorSummary(error))}</p></main>`; active = null; workspace.syncWorkspaceChrome(); return false; }
    const previous = active?.scope === scope ? active : null;
    body.innerHTML = '<div class="rmt-stk-root"></div>';
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif'; fileInput.multiple = true; fileInput.hidden = true;
    const view = { root: body.firstElementChild, body, host, scope, page: drafts.get(scope)?.status === 'done' ? 'cut' : 'home', tab: previous?.tab || 'char',
        packId: '', idea: previous?.idea || null, message: '', fileInput, importTarget: '' };
    view.root.after(fileInput);
    fileInput.addEventListener('change', () => {
        const files = [...(fileInput.files || [])]; fileInput.value = '';
        if (files.length) void importFiles(view, files, view.importTarget).catch(error => failure(view, error));
    });
    active?.fileInput?.remove();
    active = view; workspace.syncWorkspaceChrome();
    bindView(view); paint(view); body.scrollTop = 0;
    // Bring an entry written by an earlier version up to date.
    void stickers.refreshStickerLore(hostContext()).then(changed => { if (changed && current(view)) paint(view); }).catch(() => {});
    return true;
}
