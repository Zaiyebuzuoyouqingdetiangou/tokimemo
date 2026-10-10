import * as couple from '../extras/coupleAvatar.js';
import * as appearance from '../extras/coupleAvatarAppearance.js';
import * as avatar_apply from '../extras/coupleAvatarApply.js';
import * as chat_avatars from '../core/chatAvatarStore.js';
import * as presets from '../extras/coupleAvatarStyles.js';
import * as chibi_filter from '../extras/coupleAvatarChibiFilter.js';
import * as crop from '../extras/coupleAvatarCrop.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as runtime from '../core/state.js';
import * as overlay from './overlay.js';
import * as routes from './workspaceState.js';
import * as workspace from './workspace.js';
import * as room from '../modes/room.js';
import * as phone from './phoneView.js';
import * as styles from './coupleAvatarCss.js';

function esc(value) { return text.esc(value); }
const jobs = new Map();
// Derived images stay in memory only. The original and editable crop settings
// remain the persisted source of truth; weak keys release closed views' images.
const previewImages = new WeakMap();
const appearanceReads = new WeakMap();
let active = null, modal = null, sequence = 0;
const settingFields = ['interaction', 'interactionDetail', 'clothing', 'background', 'direction', 'customStyle', 'chibiFilter', 'composition'];
const HISTORY_PAGE_SIZE = 6; // Display page only; stored records are never capped.
function styleFor(id) { return presets.COUPLE_STYLES.find(item => item.id === id); }
function styleLabel(settings) { return settings?.styleId === 'custom' ? '自定义风格' : styleFor(settings?.styleId)?.label || '二头身团子'; }
const OVERLAY_NOTES = Object.freeze({
    form: '只用它的比例、构图或光影；线条和上色交给生图插件里你自己的画师串。',
    mixed: '它也带一点线条/上色倾向，会以较低权重轻轻叠上去；出图不对味就关掉。',
    custom: '自定义风格只写一次、放在最后，画师串在前。',
    medium: '这个画风本身就是换一种画法，和画师串叠在一起两边都不像，所以不能叠。',
});
function overlayKind(settings) {
    if (settings?.styleId === 'custom') return 'custom';
    return presets.coupleStyleBlend(styleFor(settings?.styleId)) || 'medium';
}
function blendBadge(item) {
    const kind = presets.coupleStyleBlend(item);
    return kind === 'form' ? '<small class="rmt-pair-blend">可叠</small>' : kind === 'mixed' ? '<small class="rmt-pair-blend is-light">轻叠</small>' : '';
}
function button(action, label, extra = '') { return `<button type="button" data-pair-action="${action}" ${extra}>${label}</button>`; }
function current(view) {
    try { return active === view && view.root?.isConnected && !view.host.hidden && runtime.state.activeMode === couple.COUPLE_MODE
        && !runtime.state.activeArchiveSnapshot && couple.coupleScope(core_context.currentCharacterGuard()) === view.scope; }
    catch { return false; }
}
function report(view, message) {
    if (!current(view)) return;
    for (const node of view.root.querySelectorAll('[data-pair-status], [data-pair-compose-status]')) node.textContent = message || '';
}
function failure(view, error) { report(view, text.safeErrorSummary(error) || '这次操作没有完成，请重试。'); }
function ensureStyles() {
    if (document.getElementById('rmt-couple-styles')) return;
    const node = document.createElement('style'); node.id = 'rmt-couple-styles'; node.textContent = styles.coupleAvatarCss(); document.head.append(node);
}
function recordFor(view) { return view.records.find(row => row.id === view.currentId) || null; }
function rememberRecord(view, result) {
    if (!result?.record) return;
    view.records = [result.record, ...view.records.filter(row => row.id !== result.record.id)]
        .sort((a, b) => b.createdAt - a.createdAt);
    if (result.durable === false) view.pending.add(result.record.id); else view.pending.delete(result.record.id);
}
function draft(view) {
    const settings = structuredClone(view.settings);
    for (const key of settingFields) {
        const input = view.root.querySelector(`[data-pair-field="${key}"]`); if (input) settings[key] = input.value;
    }
    for (let i = 0; i < 2; i++) for (const key of ['name', 'appearance']) {
        const input = view.root.querySelector(`[data-pair-person="${i}"][data-pair-key="${key}"]`);
        if (!input) continue;
        if (key === 'appearance' && input.value.trim() !== settings.people[i].appearance) settings.people[i].appearanceOverride = true;
        settings.people[i][key] = input.value;
    }
    const overlay = view.root.querySelector('[data-pair-overlay]');
    // A disabled toggle (medium style) keeps the saved choice for later styles.
    if (overlay && !overlay.disabled) { if (overlay.checked) settings.overlayArtist = true; else delete settings.overlayArtist; }
    view.settings = couple.normalizeCoupleSettings(settings, view.context);
    // Resolving a new name or provider may replace the displayed preset. Keep
    // that display in sync before another input event reads the form again.
    for (let i = 0; i < 2; i++) {
        const input = view.root.querySelector(`[data-pair-person="${i}"][data-pair-key="appearance"]`);
        const appearance = view.settings.people[i].appearance;
        if (input && input.value.trim() !== appearance) input.value = appearance;
    }
    return structuredClone(view.settings);
}
function queueDraft(view) {
    const settings = draft(view); clearTimeout(view.draftTimer);
    view.draftTimer = setTimeout(() => {
        void couple.saveCoupleSettings(view.scope, settings).then(result => {
            if (result?.durable === false) report(view, '创作设置暂留本页，暂未写入本机存储。');
        }).catch(error => failure(view, error));
    }, 300);
}

function appearanceStatus(view, index, message) {
    if (!current(view)) return;
    report(view, message);
    const node = view.root.querySelector(`[data-pair-appearance-status="${index}"]`);
    if (node) node.textContent = message;
}
function cancelAppearanceReads(view, index = null, message = '') {
    const reads = appearanceReads.get(view);
    if (!reads) return;
    for (const [side, task] of [...reads]) {
        if (index !== null && side !== index) continue;
        task.controller.abort(); task.cleanup();
        if (message) appearanceStatus(view, side, message);
    }
}
async function refreshAppearance(view, index) {
    if (!current(view) || ![0, 1].includes(index)) return;
    let reads = appearanceReads.get(view);
    if (!reads) { reads = new Map(); appearanceReads.set(view, reads); }
    if (reads.has(index)) { cancelAppearanceReads(view, index, '已取消读取，原内容已保留。'); return; }
    const row = side => {
        const person = { ...view.settings.people[side] };
        for (const key of ['name', 'appearance']) {
            const input = view.root.querySelector(`[data-pair-person="${side}"][data-pair-key="${key}"]`);
            if (input) person[key] = input.value;
        }
        return person;
    };
    const sourceSettings = () => ({ ...view.settings, people: view.settings.people.map((_, side) => row(side)) });
    const context = core_context.currentCharacterGuard();
    const selected = row(index), signature = JSON.stringify(selected);
    const scope = chat_avatars.chatAvatarScope(context);
    const prepared = appearance.prepareCoupleAppearance(sourceSettings(), index, context);
    if (!prepared || prepared.kind === 'missing') {
        appearanceStatus(view, index, '没有找到对应人物的人设或可用外貌，原内容已保留。'); return;
    }
    const buttonNode = view.root.querySelector(`[data-pair-action="refresh-appearance"][data-pair-side="${index}"]`);
    const controller = new AbortController();
    const task = { controller, timer: null, cleanup: () => {
        clearInterval(task.timer);
        if (reads.get(index) !== task) return;
        reads.delete(index);
        if (buttonNode) { buttonNode.textContent = '重新读取外貌'; buttonNode.removeAttribute('aria-busy'); }
    } };
    const stillCurrent = (checkSource = false) => {
        if (reads.get(index) !== task || controller.signal.aborted || !current(view) || signature !== JSON.stringify(row(index))) return false;
        try {
            const live = core_context.currentCharacterGuard();
            return chat_avatars.chatAvatarScope(live) === scope && (!checkSource
                || appearance.prepareCoupleAppearance(sourceSettings(), index, live)?.signature === prepared.signature);
        } catch { return false; }
    };
    reads.set(index, task);
    if (buttonNode) { buttonNode.textContent = '取消读取'; buttonNode.setAttribute('aria-busy', 'true'); }
    appearanceStatus(view, index, prepared.kind === 'persona' ? '正在通过文本模型整理最新人设…可再次点击取消。' : '正在读取外貌…');
    // Stop queued/in-flight extraction when the page, persona or edited field
    // changes. The final source comparison also catches provider/preset edits.
    task.timer = setInterval(() => {
        if (!stillCurrent(true)) cancelAppearanceReads(view, index, '人物、来源或外貌已变化，本次读取已取消。');
    }, 250);
    try {
        const fresh = await appearance.refreshCoupleAppearance(prepared, {
            context, signal: controller.signal, taskKey: `couple-appearance:${view.scope}:${index}`,
        });
        if (!stillCurrent(true)) {
            if (!controller.signal.aborted) appearanceStatus(view, index, '人物、来源或外貌已变化，原内容已保留。');
            return;
        }
        if (!fresh) { appearanceStatus(view, index, '没有找到可用外貌，原内容已保留。'); return; }
        if (fresh.source === 'saved' && fresh.person.appearance === String(selected.appearance || '').trim()) {
            appearanceStatus(view, index, '没有读到对应人设，原内容已保留。'); return;
        }
        clearTimeout(view.draftTimer);
        view.settings = { ...view.settings, people: view.settings.people.map((person, side) => side === index ? fresh.person : person) };
        const input = view.root.querySelector(`[data-pair-person="${index}"][data-pair-key="appearance"]`);
        if (input) input.value = fresh.person.appearance;
        // Stop monitoring before applying our own field update. Preserve all
        // other current draft fields and never write card/persona/castLooks.
        task.cleanup();
        const result = await couple.saveCoupleSettings(view.scope, structuredClone(view.settings));
        if (reads.has(index) || JSON.stringify(row(index)) !== JSON.stringify(fresh.person)) return;
        const message = fresh.source === 'preset' ? '已读取当前生图渠道的人物预设。'
            : fresh.source === 'persona' ? '已从最新人设重新整理外貌。'
                : '没有读到对应人设，已沿用保存的外貌。';
        appearanceStatus(view, index, result?.durable === false ? `${message} 暂留本页，本机保存未确认。` : message);
    } catch (error) {
        if (!controller.signal.aborted) {
            const summary = text.safeErrorSummary(error) || '读取没有完成。';
            appearanceStatus(view, index, summary.includes('原内容已保留') ? summary : `${summary} 原内容已保留。`);
        }
    } finally { task.cleanup(); }
}

export function closeCoupleDialog({ restoreFocus = true } = {}) {
    if (!modal) return false;
    const previous = modal; modal = null; previous.cleanup?.();
    for (const [node, inert] of previous.siblings) node.inert = inert;
    previous.host?.removeEventListener('cancel', previous.cancel, true);
    previous.shade.remove();
    if (restoreFocus && previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    return true;
}
export function disposeCoupleAvatar() {
    if (routes.workspace.route === couple.COUPLE_MODE && active?.root?.isConnected && current(active)) return;
    cancelAppearanceReads(active);
    active?.historyObserver?.disconnect();
    closeCoupleDialog({ restoreFocus: false }); active = null;
}
function dialog(view, title, contents) {
    closeCoupleDialog({ restoreFocus: false });
    if (!current(view)) return null;
    const shell = view.root.closest('.rmt-shell') || view.host;
    const shade = document.createElement('div'); shade.className = 'rmt-pair-shade';
    shade.innerHTML = `<section class="rmt-pair-sheet" role="dialog" aria-modal="true" aria-labelledby="rmt-pair-dialog-title"><header><h2 id="rmt-pair-dialog-title">${esc(title)}</h2><button type="button" data-pair-close aria-label="关闭${esc(title)}">关闭</button></header><div class="rmt-pair-sheet-body">${contents}</div></section>`;
    const siblings = [...shell.children].map(node => [node, node.inert]), focus = document.activeElement;
    const host = shell.closest('dialog');
    const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); closeCoupleDialog(); };
    const m = { shade, body: shade.querySelector('.rmt-pair-sheet-body'), siblings, focus, host, cancel, view, cleanup: null };
    shell.append(shade); modal = m;
    for (const [node] of siblings) node.inert = true;
    host?.addEventListener('cancel', cancel, true);
    shade.addEventListener('click', event => {
        if (event.target === shade || event.target.closest('[data-pair-close]')) { event.preventDefault(); event.stopPropagation(); closeCoupleDialog(); }
    });
    shade.addEventListener('keydown', event => {
        if (event.key === 'Escape') return cancel(event);
        if (event.key !== 'Tab') return;
        const targets = [...shade.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')]
            .filter(node => !node.disabled && node.getClientRects().length);
        if (!targets.length) return;
        if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets[targets.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === targets[targets.length - 1]) { event.preventDefault(); targets[0].focus(); }
    });
    shade.querySelector('[data-pair-close]').focus({ preventScroll: true });
    return m;
}
function pairPreviews(record, loaded) {
    if (!loaded.croppable) return { images: [], error: loaded.error };
    const key = JSON.stringify([record.crops, record.order]);
    const cached = previewImages.get(loaded);
    if (cached?.key === key) return cached;
    try {
        const result = { key, images: crop.cropPairImage(loaded, record.crops, record.order) };
        previewImages.set(loaded, result);
        return result;
    } catch (error) {
        // A browser export failure must not hide a viewable original or make
        // generation fail. Save can still explain the failure and offer import.
        return { images: [], error: error.message };
    }
}
function square(record, display, loaded, className = '', preview = null) {
    const box = document.createElement('div'); box.className = `rmt-pair-square ${className}`;
    const half = record.order?.[display] === 1 ? 1 : 0;
    const img = document.createElement('img'); img.src = preview?.url || loaded.image.src;
    img.alt = `${record.settings.people[half]?.name || (display ? '右边' : '左边')}的头像`;
    img.draggable = false;
    if (preview) {
        // The native image itself is the same square PNG as the save sheet.
        // Circle preview clips only its wrapper, preserving all four PNG corners.
        img.className = 'rmt-pair-cropped-image';
    } else {
        img.className = 'rmt-pair-source-preview';
        Object.assign(img.style, crop.cropPreviewStyle(loaded.width, loaded.height, half, record.crops[half]));
        // CSS-only fallback/editor previews still point at both people. Avoid
        // presenting that original as a single avatar in the native save menu.
        img.addEventListener('contextmenu', event => event.preventDefault());
    }
    box.append(img); return box;
}
function loadRecord(view, record) {
    const key = record.original.url;
    if (!view.images.has(key)) {
        const promise = crop.loadPairImage(key).catch(error => { view.images.delete(key); throw error; });
        view.images.set(key, promise);
    }
    return view.images.get(key);
}
function renderJobs(view) {
    if (!current(view)) return;
    const target = view.root.querySelector('[data-pair-jobs]'); if (!target) return;
    const rows = [...jobs.values()].filter(job => job.scope === view.scope);
    target.innerHTML = rows.map(job => job.status === 'failed'
        ? `<div class="rmt-pair-job is-failed" role="alert"><span><strong>这一对没有完成</strong><small>${esc(job.message)}</small></span>${button('dismiss-job', '知道了', `data-pair-id="${job.id}"`)}</div>`
        : `<div class="rmt-pair-job" role="status"><span>${esc(job.label)}<small>${job.background ? '完成后收进历史，可以继续做别的事。' : '一张原图，一对头像。'}</small></span>${job.background ? '<small>后台等待中</small>' : button('background', '转到后台', `data-pair-id="${job.id}"`)}</div>`).join('');
}
async function renderPreview(view) {
    if (!current(view)) return;
    const host = view.root.querySelector('[data-pair-preview]'), record = recordFor(view), token = ++view.previewEpoch;
    if (!host) return;
    const names = record ? record.order.map(half => record.settings.people[half]?.name || '未命名') : view.settings.people.map(person => person.name || '未命名');
    host.innerHTML = `<div class="rmt-pair-section-head"><h3>${record ? '这一对头像' : '留两个位置，给你们'}</h3><button type="button" data-pair-action="circle" aria-pressed="${view.circle}">${view.circle ? '方形预览' : '圆形预览'}</button></div><div class="rmt-pair-two ${view.circle ? 'is-circle' : ''}">${[0, 1].map(i => `<div class="rmt-pair-person"><div data-pair-image="${i}" class="rmt-pair-square"><div class="rmt-pair-empty"><b>${i ? '♡' : '♧'}</b><span>${record ? '读取原图…' : i ? '右边的 TA' : '左边的 TA'}</span></div></div><strong>${esc(names[i])}</strong>${button('save', i ? '保存右边' : '保存左边', `data-pair-side="${i}" ${record ? '' : 'disabled'}`)}</div>`).join('')}</div><p class="rmt-pair-note">${record ? '左右头像分别保存为方形 PNG；圆形仅用于预览。' : '选个风格，或导入已有横图。生成后这里并排显示两张头像。'}</p><div class="rmt-pair-preview-tools">${button('crop', '调整裁切', record ? '' : 'disabled')}${button('swap', '交换左右', record ? '' : 'disabled')}${button('seam', '检查当前拼接', record ? '' : 'disabled')}${button('original', '查看原图', record ? '' : 'disabled')}${button('favorite', record?.favorite ? '★ 已收藏' : '☆ 收藏这一对', `${record ? '' : 'disabled'} aria-pressed="${record?.favorite === true}"`)}${button('reuse', '沿用这对的设置', record ? '' : 'disabled')}</div><div data-pair-image-info class="rmt-pair-result-meta"></div>${record && view.pending.has(record.id) ? `<div class="rmt-pair-restore-note">这对头像暂未确认保存到本机，请先保存图片或导出备份。${button('retry', '仅重试保存')}</div>` : ''}`;
    const tools = host.querySelector('.rmt-pair-preview-tools');
    if (tools) tools.insertAdjacentHTML('beforeend', `${button('apply-chat-avatar', '应用为本聊天头像', record ? '' : 'disabled')}${button('restore-chat-avatar', '恢复原头像')}`);
    if (!record) return;
    try {
        const loaded = await loadRecord(view, record);
        if (!current(view) || token !== view.previewEpoch) return;
        const previews = pairPreviews(record, loaded);
        for (let i = 0; i < 2; i++) host.querySelector(`[data-pair-image="${i}"]`).replaceWith(square(record, i, loaded, '', previews.images[i]));
        const meta = host.querySelector('[data-pair-image-info]');
        meta.textContent = `${styleLabel(record.settings)} · 原图 ${loaded.width} × ${loaded.height}${previews.error ? ' · ' + previews.error : ''}`;
    } catch (error) {
        if (!current(view) || token !== view.previewEpoch) return;
        for (const node of host.querySelectorAll('.rmt-pair-empty span')) node.textContent = '原图暂未载入';
        host.querySelector('[data-pair-image-info]').textContent = error.message;
    }
}
function selectTab(view, tab) {
    view.tab = tab;
    for (const node of view.root.querySelectorAll('[data-pair-tab]')) node.setAttribute('aria-pressed', String(node.dataset.pairTab === tab));
    view.root.querySelector('[data-pair-main]').hidden = tab !== 'make';
    view.root.querySelector('[data-pair-history]').hidden = tab !== 'history';
    const jobsHost = view.root.querySelector(tab === 'make' ? '[data-pair-compose-jobs]' : '[data-pair-history-jobs]');
    const jobsNode = view.root.querySelector('[data-pair-jobs]');
    if (jobsHost && jobsNode) jobsHost.append(jobsNode);
    if (tab === 'history') void renderHistory(view);
}
async function renderHistory(view) {
    if (!current(view)) return;
    const target = view.root.querySelector('[data-pair-history-grid]'), token = ++view.historyEpoch;
    if (!target) return;
    const rows = view.records.filter(row => !view.favoritesOnly || row.favorite);
    const pages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
    view.historyPage = Math.min(pages, Math.max(1, view.historyPage || 1));
    const visible = rows.slice((view.historyPage - 1) * HISTORY_PAGE_SIZE, view.historyPage * HISTORY_PAGE_SIZE);
    view.root.querySelector('[data-pair-history-count]').textContent = `${view.favoritesOnly ? '已收藏' : '已留下'} ${rows.length} 对`;
    target.innerHTML = visible.length ? visible.map(record => `<button type="button" class="rmt-pair-history-card" data-pair-action="history-open" data-pair-id="${esc(record.id)}"><div class="rmt-pair-mini" data-pair-thumb="${esc(record.id)}" aria-label="头像缩略图"><div class="rmt-pair-square"><span class="rmt-pair-thumb-note">读取中</span></div><div class="rmt-pair-square"></div></div><b>${record.favorite ? '★ ' : ''}${esc(record.order.map(half => record.settings.people[half]?.name || '未命名').join(' · '))}</b><small>${esc(styleLabel(record.settings))} · ${new Date(record.createdAt).toLocaleDateString('zh-CN')}</small></button>`).join('') : `<p class="rmt-pair-muted">${view.favoritesOnly ? '还没有收藏。打开喜欢的头像，点“收藏这一对”即可。' : '还没有头像。做好一对后，会自动收在这里。'}</p>`;
    let pager = view.root.querySelector('[data-pair-history-pages]');
    if (!pager) { pager = document.createElement('nav'); pager.className = 'rmt-pair-pagination'; pager.dataset.pairHistoryPages = ''; pager.setAttribute('aria-label', '头像翻页'); target.after(pager); }
    pager.hidden = !rows.length;
    pager.innerHTML = `${button('history-prev', '上一页', view.historyPage === 1 ? 'disabled' : '')}<span role="status">第 ${view.historyPage} / ${pages} 页</span>${button('history-next', '下一页', view.historyPage === pages ? 'disabled' : '')}`;
    const nodes = [...target.querySelectorAll('[data-pair-thumb]')];
    // Current-page thumbnails load immediately. Some TT WebViews never deliver
    // IntersectionObserver callbacks inside this overlay's nested scroller.
    view.historyObserver?.disconnect();
    const fill = async node => {
        const record = visible.find(row => row.id === node.dataset.pairThumb); if (!record) return;
        try {
            const loaded = await loadRecord(view, record);
            if (current(view) && token === view.historyEpoch && node.isConnected) {
                const previews = pairPreviews(record, loaded);
                node.replaceChildren(square(record, 0, loaded, '', previews.images[0]), square(record, 1, loaded, '', previews.images[1]));
            }
        }
        catch { if (node.isConnected) { node.title = '原图暂时不可用，点击后可查看记录或导入原图。'; const note = node.querySelector('.rmt-pair-thumb-note'); if (note) note.textContent = '原图暂不可用'; } }
    };
    for (const node of nodes) void fill(node);
}
function paintSettings(view) {
    for (const key of settingFields) {
        const input = view.root.querySelector(`[data-pair-field="${key}"]`); if (!input) continue;
        const value = view.settings[key] || '';
        if (key === 'interaction' && value && ![...input.options].some(option => option.value === value)) {
            const option = document.createElement('option'); option.value = value; option.textContent = value; input.append(option);
        }
        input.value = value;
    }
    for (let i = 0; i < 2; i++) for (const key of ['name', 'appearance']) view.root.querySelector(`[data-pair-person="${i}"][data-pair-key="${key}"]`).value = view.settings.people[i][key] || '';
    for (const node of view.root.querySelectorAll('[data-pair-type]')) node.setAttribute('aria-pressed', String(view.settings.pairType === node.dataset.pairType));
    for (const node of view.root.querySelectorAll('[data-pair-style]')) node.setAttribute('aria-pressed', String(view.settings.styleId === node.dataset.pairStyle));
    view.root.querySelector('[data-pair-selected-style]').textContent = styleLabel(view.settings);
    view.root.querySelector('[data-pair-style-description]').textContent = styleFor(view.settings.styleId)?.description || '用自己的话描述想要的画风。';
    view.root.querySelector('[data-pair-custom]').classList.toggle('is-visible', view.settings.styleId === 'custom');
    const overlay = view.root.querySelector('[data-pair-overlay]');
    if (overlay) {
        const kind = overlayKind(view.settings), available = kind !== 'medium';
        overlay.disabled = !available;
        overlay.checked = available && view.settings.overlayArtist === true;
        overlay.closest('.rmt-pair-overlay')?.classList.toggle('is-disabled', !available);
        const note = view.root.querySelector('[data-pair-overlay-note]'); if (note) note.textContent = OVERLAY_NOTES[kind];
    }
    paintInteraction(view);
}
function paintInteraction(view) {
    const custom = view.root.querySelector('[data-pair-interaction-custom]');
    if (custom) custom.hidden = view.settings.interaction !== '自定义互动';
}
function formHtml(view) {
    let providerNote = '';
    try {
        if (core_settings.getPluginSettings(view.context).imageGenerationProvider === 'baibai-image') providerNote = '<p class="rmt-pair-note">使用柏宝绘 NAI 时会沿用其画师串和负面词，本页不能覆盖；想保留画师味道，可打开下面的“叠在我的画师串上”。豆豆眼／Q版若不符，请检查生图插件预设中是否排除了这些特征。</p>';
    } catch { /* Optional advice never blocks the form. */ }
    const groups = [...new Set(presets.INTERACTION_PRESETS.map(item => item.group))];
    return `<form class="rmt-pair-form" data-pair-form>
        <div class="rmt-pair-block"><h3>这次画谁</h3><div class="rmt-pair-fields">${[0, 1].map(i => `<label class="rmt-pair-field"><span>${i ? '右边' : '左边'}</span><input data-pair-person="${i}" data-pair-key="name" aria-label="${i ? '右边' : '左边'}的人物名字" placeholder="可以改成任何人物"></label>`).join('')}</div></div>
        <div class="rmt-pair-block"><div class="rmt-pair-section-head"><h3>画成什么样</h3><small>${presets.COUPLE_STYLES.length} 种画风</small></div>
            <button type="button" class="rmt-pair-style-summary" data-pair-action="styles"><span><b data-pair-selected-style></b><small data-pair-style-description></small></span><span>更换</span></button>
            <div class="rmt-pair-style-custom-action">${button('custom-style', '自己写风格')}</div>
            <label class="rmt-pair-field rmt-pair-custom" data-pair-custom><span>自定义风格</span><textarea data-pair-field="customStyle" placeholder="例如：像旧绘本里的水彩小人，纸张有轻微颗粒。"></textarea></label>
            <label class="rmt-pair-overlay"><input type="checkbox" data-pair-overlay><span><b>叠在我的画师串上</b><small data-pair-overlay-note></small></span></label>
        </div>
        <div class="rmt-pair-block"><h3>两个人的呼应</h3><div class="rmt-pair-choice"><button type="button" data-pair-type="joined" aria-pressed="true">拼接连图</button><button type="button" data-pair-type="echo" aria-pressed="false">独立呼应</button></div>
            <div class="rmt-pair-section-head"><label for="rmt-pair-interaction">互动 <small>${presets.INTERACTION_PRESETS.length} 种</small></label><span class="rmt-pair-actions">${button('random-interaction', '抽一个')}${button('inspiration', '随机灵感')}</span></div>
            <select id="rmt-pair-interaction" data-pair-field="interaction" aria-label="互动">${groups.map(group => `<optgroup label="${esc(group)}">${presets.INTERACTION_PRESETS.filter(item => item.group === group).map(item => `<option value="${esc(item.label)}">${esc(item.label)}</option>`).join('')}</optgroup>`).join('')}<option value="交给灵感">交给灵感</option><option value="自定义互动">自定义互动</option></select>
            <div class="rmt-pair-inspirations" data-pair-ideas hidden></div>
            <label class="rmt-pair-field"><span>构图 <small>随机时每次换一种镜头，仍保持左右各一人、能裁成两张头像</small></span><select data-pair-field="composition"><option value="">随机（每次不同）</option><option value="classic">固定：正面并排</option>${presets.COMPOSITION_VARIANTS.map(row => `<option value="${row.id}">${esc(row.label)}</option>`).join('')}</select></label>
            <label class="rmt-pair-field" data-pair-interaction-custom hidden><span>写下你们的互动</span><textarea data-pair-field="interactionDetail" placeholder="可以选一条随机灵感，再改成你喜欢的动作与表情。"></textarea></label>
        </div>
        <label class="rmt-pair-field"><span>这一对的小心思 <small>选填</small></span><textarea data-pair-field="direction" placeholder="比如：一个忍着笑，一个假装生气；共用一条围巾。"></textarea></label>
        <details class="rmt-pair-options"><summary>外貌、衣着与背景 <small>选填</small></summary><div><p class="rmt-pair-note">点击“重新读取外貌”且无人物预设时，会用文本 API 整理当前人设。</p>${[0, 1].map(i => `<div><label class="rmt-pair-field"><span>${i ? '右边' : '左边'}人物外貌</span><textarea data-pair-person="${i}" data-pair-key="appearance" placeholder="沿用已有外貌，也可以修改或留空。"></textarea></label>${button('refresh-appearance', '重新读取外貌', `data-pair-side="${i}" aria-label="重新读取${i ? '右边' : '左边'}人物外貌"`)}<small data-pair-appearance-status="${i}" role="status" aria-live="polite"></small></div>`).join('')}<label class="rmt-pair-field"><span>衣着</span><input data-pair-field="clothing" placeholder="例如：同款不同色的卫衣"></label><label class="rmt-pair-field"><span>背景</span><input data-pair-field="background" placeholder="例如：左边蓝色，右边粉色"></label><label class="rmt-pair-field"><span>Q 版外貌过滤 <small>Q 版、动物化身时去掉身高体型等写实描述</small></span><select data-pair-field="chibiFilter"><option value="">每次询问</option><option value="auto">自动过滤</option><option value="off">不过滤</option></select></label>${providerNote}</div></details>
        <div><div data-pair-compose-jobs><div class="rmt-pair-jobs" data-pair-jobs></div></div><p class="rmt-pair-status" data-pair-compose-status role="status" aria-live="polite"></p><div class="rmt-pair-create"><button type="submit" class="rmt-pair-primary">生成一对头像</button>${button('import', '导入图片')}</div><p class="rmt-pair-note">一张原图生成一对，完成后自动收进历史。导入已有图片也能裁切。</p></div>
    </form>`;
}

export async function openCoupleAvatar() {
    cancelAppearanceReads(active);
    active?.historyObserver?.disconnect();
    closeCoupleDialog({ restoreFocus: false });
    room.stopRoomClock(); phone.stopPhoneClock(); ensureStyles();
    overlay.openOverlay();
    routes.leaveWorkspaceReader(); routes.workspace.route = couple.COUPLE_MODE; routes.workspace.tab = 'content';
    runtime.state.activeMode = couple.COUPLE_MODE; runtime.state.activeSession = null;
    overlay.topTitle('情侣头像'); overlay.setBackVisible(true, '内容'); overlay.setManageVisible(false); overlay.setRegenerateVisible(false);
    const body = overlay.bodyEl(), host = document.getElementById(constants.OVERLAY_ID);
    if (runtime.state.activeArchiveSnapshot) {
        body.innerHTML = '<main class="rmt-couple"><h2>情侣头像</h2><p>头像记录保存在制作时的聊天中。回到对应聊天即可查看与制作。</p></main>';
        active = null; workspace.syncWorkspaceChrome(); return true;
    }
    const context = core_context.currentCharacterGuard(), scope = couple.coupleScope(context);
    body.innerHTML = '<main class="rmt-couple"><p role="status">正在读取头像记录…</p></main>';
    const view = { root: body.firstElementChild, host, context, scope, settings: couple.defaultCoupleSettings(context), records: [], pending: new Set(), images: new Map(),
        currentId: '', circle: false, tab: 'make', favoritesOnly: false, historyPage: 1, ideas: [], previewEpoch: 0, historyEpoch: 0, draftTimer: 0, selectedEpoch: 0 };
    active = view; workspace.syncWorkspaceChrome();
    try {
        const saved = await couple.readCouples(scope);
        if (!current(view)) return false;
        const combined = new Map((saved.records || []).map(record => [record.id, record]));
        for (const record of view.records) if (!combined.has(record.id) || combined.get(record.id).updatedAt < record.updatedAt) combined.set(record.id, record);
        view.records = [...combined.values()].sort((a, b) => b.createdAt - a.createdAt); view.pending = new Set([...(saved.pendingIds || []), ...view.pending]);
        view.settings = couple.normalizeCoupleSettings(saved.settings || view.settings, context); view.currentId = view.records[0]?.id || '';
        view.root.innerHTML = `<header class="rmt-pair-head"><div><h2>情侣头像</h2><p>各自是你们，放在一起刚刚好。</p></div><nav class="rmt-pair-nav" aria-label="头像页面"><button type="button" data-pair-tab="make" aria-pressed="true">制作头像</button><button type="button" data-pair-tab="history" aria-pressed="false">历史与收藏</button></nav></header><p class="rmt-pair-status" data-pair-status role="status" aria-live="polite"></p><div class="rmt-pair-layout" data-pair-main><section class="rmt-pair-preview"><div class="rmt-pair-stage" data-pair-preview></div></section>${formHtml(view)}</div><section class="rmt-pair-history" data-pair-history hidden><div class="rmt-pair-section-head"><h3 data-pair-history-count></h3><div class="rmt-pair-actions">${button('filter-favorite', '只看收藏', 'aria-pressed="false"')}${button('export', '导出备份')}${button('import-backup', '导入备份')}</div></div><p class="rmt-pair-note">原图、裁切和设置按聊天保存在本设备浏览器中。更换设备前可导出备份。</p><div data-pair-history-jobs></div><div class="rmt-pair-history-grid" data-pair-history-grid></div></section><input type="file" accept="image/*" data-pair-image-file hidden><input type="file" accept=".json,application/json" data-pair-backup-file hidden>`;
        bindView(view); paintSettings(view); void renderPreview(view); renderJobs(view);
        if (saved.durable === false) report(view, '本机存储暂不可用。可以继续制作，完成后请保存图片或导出备份。');
        body.scrollTop = 0; return true;
    } catch (error) {
        if (current(view)) view.root.innerHTML = `<h2>情侣头像</h2><p>${esc(text.safeErrorSummary(error))}</p>`;
        return false;
    }
}

function bindView(view) {
    view.root.addEventListener('input', event => {
        if (event.target.matches('[data-pair-person]')) cancelAppearanceReads(view, Number(event.target.dataset.pairPerson), '外貌已编辑，本次读取已取消。');
        if (event.target.matches('[data-pair-field],[data-pair-person]')) queueDraft(view);
    });
    view.root.addEventListener('change', event => {
        if (event.target.matches('select[data-pair-field]')) { queueDraft(view); paintInteraction(view); }
        if (event.target.matches('[data-pair-overlay]')) { draft(view); paintSettings(view); queueDraft(view); }
    });
    view.root.querySelector('[data-pair-form]').addEventListener('submit', event => { event.preventDefault(); void startGeneration(view); });
    view.root.addEventListener('click', event => {
        const target = event.target.closest('button'); if (!target || !current(view)) return;
        if (target.dataset.pairTab) return selectTab(view, target.dataset.pairTab);
        if (target.dataset.pairStyle) { draft(view); view.settings.styleId = target.dataset.pairStyle; paintSettings(view); queueDraft(view); return; }
        if (target.dataset.pairType) { draft(view); view.settings.pairType = target.dataset.pairType; paintSettings(view); queueDraft(view); return; }
        const action = target.dataset.pairAction; if (!action) return;
        void Promise.resolve().then(() => handleAction(view, action, target)).catch(error => failure(view, error));
    });
    view.root.querySelector('[data-pair-image-file]').addEventListener('change', event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void importImage(view, file).catch(error => failure(view, error));
    });
    view.root.querySelector('[data-pair-backup-file]').addEventListener('change', event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void file.text().then(raw => couple.importCouples(view.scope, raw)).then(async result => {
            const saved = await couple.readCouples(view.scope); if (!current(view)) return;
            view.records = saved.records; view.pending = new Set(saved.pendingIds || []); void renderHistory(view);
            report(view, result.durable ? '备份已合并到当前聊天，已有头像保留。' : '备份已读取，但本机保存未确认。内容暂留本页，请保留备份文件。');
        }).catch(error => failure(view, error));
    });
}
async function updateRecord(view, record, patch) {
    const result = await couple.updateCouple(view.scope, record.id, patch); rememberRecord(view, result);
    if (current(view)) { void renderPreview(view); if (view.tab === 'history') void renderHistory(view); }
    if (result.durable === false) report(view, '调整已暂留本页，请先保存图片或导出备份，再重试本机保存。');
    return result;
}
async function handleAction(view, action, target) {
    const record = recordFor(view);
    if (action === 'restore-chat-avatar') return restoreChatAvatars(view);
    if (action === 'refresh-appearance') return refreshAppearance(view, Number(target.dataset.pairSide));
    if (action === 'styles') return showStyles(view);
    if (action === 'inspiration') {
        draft(view); view.ideas = presets.randomCoupleIdeas(view.ideas);
        const list = view.root.querySelector('[data-pair-ideas]'); list.hidden = false;
        list.innerHTML = view.ideas.map((idea, index) => button('use-idea', `<span>${esc(idea)}</span><small>选用</small>`, `data-pair-idea="${index}"`)).join('');
        target.textContent = '换一组灵感'; return;
    }
    if (action === 'random-interaction') {
        draft(view);
        const choices = presets.INTERACTION_PRESETS.filter(item => item.label !== view.settings.interaction);
        view.settings.interaction = choices[Math.floor(Math.random() * choices.length)]?.label || view.settings.interaction;
        paintSettings(view); queueDraft(view); return;
    }
    if (action === 'use-idea') {
        const idea = view.ideas[Number(target.dataset.pairIdea)]; if (!idea) return;
        draft(view); view.settings.interaction = '自定义互动'; view.settings.interactionDetail = idea;
        paintSettings(view); queueDraft(view); view.root.querySelector('[data-pair-ideas]').hidden = true; return;
    }
    if (action === 'custom-style') { draft(view); view.settings.styleId = 'custom'; paintSettings(view); queueDraft(view); view.root.querySelector('[data-pair-field="customStyle"]').focus(); return; }
    if (action === 'circle') { view.circle = !view.circle; return renderPreview(view); }
    if (action === 'import') return view.root.querySelector('[data-pair-image-file]').click();
    if (action === 'import-backup') return view.root.querySelector('[data-pair-backup-file]').click();
    if (action === 'export') return downloadText(await couple.exportCouples(view.scope));
    if (action === 'dismiss-job') { const job = jobs.get(target.dataset.pairId); if (job?.scope === view.scope && job.status === 'failed') { jobs.delete(job.id); renderJobs(view); } return; }
    if (action === 'background') { const job = jobs.get(target.dataset.pairId); if (job) { job.background = true; job.controller.abort(); renderJobs(view); report(view, '已转到后台等待，出图后会保存在这次聊天的历史中。'); } return; }
    if (action === 'filter-favorite') { view.favoritesOnly = !view.favoritesOnly; view.historyPage = 1; target.setAttribute('aria-pressed', String(view.favoritesOnly)); return renderHistory(view); }
    if (action === 'history-prev' || action === 'history-next') {
        view.historyPage += action === 'history-next' ? 1 : -1;
        await renderHistory(view);
        if (current(view)) view.root.querySelector('[data-pair-history-count]').scrollIntoView({ block: 'start' });
        return;
    }
    if (action === 'history-open') { view.currentId = target.dataset.pairId; view.selectedEpoch++; selectTab(view, 'make'); return renderPreview(view); }
    if (!record) return;
    if (action === 'apply-chat-avatar') return showApplyChatAvatars(view, record);
    if (action === 'save') return showSave(view, record, Number(target.dataset.pairSide));
    if (action === 'crop') return showCrop(view, record);
    if (action === 'swap') return updateRecord(view, record, { order: [record.order[1], record.order[0]] });
    if (action === 'favorite') return updateRecord(view, record, { favorite: !record.favorite });
    if (action === 'original') return showOriginal(view, record, false);
    if (action === 'seam') return showOriginal(view, record, true);
    if (action === 'reuse') { view.settings = structuredClone(record.settings); paintSettings(view); queueDraft(view); report(view, '已填入这一对的创作设置，可以修改后再生成。'); return; }
    if (action === 'retry') { const result = await couple.retryCoupleSave(view.scope, record.id); rememberRecord(view, result); void renderPreview(view); report(view, result.durable ? '这对头像已保存。' : '仍未确认保存，请先保存图片或导出备份。'); }
}
async function restoreChatAvatars(view) {
    if (!current(view)) return;
    const context = core_context.currentCharacterGuard(), scope = chat_avatars.chatAvatarScope(context), originModal = modal;
    // A page-level restore starts with null; a dialog restore belongs only to
    // that dialog. Finishing an old operation must never dismiss a newer one.
    const isCurrent = () => modal === originModal && current(view) && chat_avatars.chatAvatarScope(core_context.currentCharacterGuard()) === scope;
    const previous = await chat_avatars.loadChatAvatarSnapshot(context);
    if (!isCurrent()) return;
    if (!previous) { report(view, '当前聊天已经使用原头像。'); return; }
    if (!await overlay.confirmExplicitAction('恢复本聊天的原头像？', '只取消这次头像应用，不删除情侣头像或修改角色卡。')) return;
    if (!isCurrent()) return;
    await chat_avatars.clearChatAvatarPair({ context: core_context.currentCharacterGuard(), expectedScope: scope });
    if (isCurrent()) { closeCoupleDialog(); report(view, '已恢复本聊天的原头像。'); }
}

async function showApplyChatAvatars(view, record) {
    if (!current(view)) return;
    const context = core_context.currentCharacterGuard(), scope = chat_avatars.chatAvatarScope(context);
    const m = dialog(view, '应用为本聊天头像', '<p role="status">正在准备这对头像…</p>'); if (!m) return;
    const isCurrent = () => modal === m && current(view) && chat_avatars.chatAvatarScope(core_context.currentCharacterGuard()) === scope;
    let previous;
    try { previous = await chat_avatars.loadChatAvatarSnapshot(context); }
    catch (error) { if (isCurrent()) m.body.innerHTML = `<p role="status">${esc(text.safeErrorSummary(error) || '头像设置暂时无法读取，原头像未改变。')}</p>`; return; }
    if (!isCurrent()) return;
    let prepared;
    try {
        const loaded = await loadRecord(view, record);
        if (!isCurrent()) return;
        prepared = avatar_apply.prepareCoupleAvatarApplication(record, loaded, context);
    } catch (error) { if (isCurrent()) imageFailure(view, m, record, error); return; }
    if (!isCurrent()) return;
    m.body.innerHTML = `<p class="rmt-pair-note">确认两张头像分别用于谁。只影响本聊天，可随时恢复原头像。</p><div class="rmt-pair-two">${prepared.images.map(image => {
        const role = prepared.mapping.char === image.halfIndex ? 'char' : prepared.mapping.user === image.halfIndex ? 'user' : '';
        return `<div class="rmt-pair-person"><div class="rmt-pair-square"><img class="rmt-pair-cropped-image" src="${esc(image.url)}" alt="${esc(image.name || '已裁切头像')}"></div><strong>${esc(image.name || '未命名')}</strong><label class="rmt-pair-field"><span>用于</span><select data-pair-avatar-role="${image.halfIndex}" aria-label="${esc(image.name || '这张头像')}用于谁"><option value="">选择人物</option><option value="char" ${role === 'char' ? 'selected' : ''}>角色 · ${esc(prepared.names.char)}</option><option value="user" ${role === 'user' ? 'selected' : ''}>我 · ${esc(prepared.names.user)}</option></select></label></div>`;
    }).join('')}</div><div class="rmt-pair-actions"><button type="button" data-pair-avatar-swap>交换对应</button><button type="button" data-pair-avatar-apply class="rmt-pair-primary">确认应用</button>${previous ? '<button type="button" data-pair-avatar-restore>恢复原头像</button>' : ''}</div><p data-pair-avatar-status role="status"></p>`;
    const selectors = [...m.body.querySelectorAll('[data-pair-avatar-role]')];
    const apply = m.body.querySelector('[data-pair-avatar-apply]');
    const status = m.body.querySelector('[data-pair-avatar-status]');
    const mapping = () => Object.fromEntries(selectors.filter(node => node.value).map(node => [node.value, Number(node.dataset.pairAvatarRole)]));
    const refresh = () => { const value = mapping(); apply.disabled = ![0, 1].includes(value.char) || ![0, 1].includes(value.user) || value.char === value.user; };
    selectors.forEach(node => node.addEventListener('change', refresh)); refresh();
    m.body.querySelector('[data-pair-avatar-swap]').addEventListener('click', () => {
        [selectors[0].value, selectors[1].value] = [selectors[1].value, selectors[0].value]; refresh();
    });
    m.body.querySelector('[data-pair-avatar-restore]')?.addEventListener('click', () => void restoreChatAvatars(view).catch(error => failure(view, error)));
    let saving = false;
    apply.addEventListener('click', () => {
        if (saving || apply.disabled || !isCurrent()) return;
        saving = true; apply.disabled = true;
        void avatar_apply.applyPreparedCoupleAvatars(prepared, mapping(), { context: core_context.currentCharacterGuard(), expectedScope: scope }).then(() => {
            if (isCurrent()) { closeCoupleDialog(); report(view, '已应用为本聊天头像。'); }
        }).catch(error => {
            if (isCurrent()) status.textContent = text.safeErrorSummary(error) || '头像未能保存，原头像未改变。';
        }).finally(() => { saving = false; if (isCurrent()) refresh(); });
    });
}
function downloadText(value) {
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '心迹回廊-情侣头像备份.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function importImage(view, file) {
    const settings = draft(view); report(view, '正在读取原图…');
    const original = await crop.fileToPairOriginal(file);
    const result = await couple.addCouple(view.scope, { settings, original }); rememberRecord(view, result);
    if (!current(view)) return;
    view.currentId = result.record.id; view.selectedEpoch++; selectTab(view, 'make'); void renderPreview(view);
    report(view, result.durable ? '已导入原图。可以分别调整左右头像。' : '原图已打开，但本机保存未确认。请先保存头像或导出备份。');
}
// Q-version / animal styles: offer to drop realistic body detail (height, build,
// bone structure, nose/lip anatomy) for this one drawing. The form keeps the
// user's own appearance; only the generation request receives the filtered copy.
async function chibiFilteredSettings(view, settings) {
    const style = styleFor(settings.styleId);
    if (!style || !chibi_filter.CHIBI_FILTER_GROUPS.includes(style.group)) return settings;
    const mode = chibi_filter.chibiFilterMode(settings.chibiFilter);
    const result = chibi_filter.chibiFilterPeople(settings.people);
    if (!result.changed || mode === 'off') return settings;
    const choice = mode === 'auto' ? { filter: true, texts: result.rows.map(row => row.text) } : await askChibiFilter(view, settings, style, result);
    if (!choice) return null;
    if (choice.remember) {
        view.settings = couple.normalizeCoupleSettings({ ...view.settings, chibiFilter: choice.filter ? 'auto' : 'off' }, view.context);
        paintSettings(view); queueDraft(view);
    }
    if (!choice.filter) return settings;
    return { ...settings, people: settings.people.map((person, index) => ({ ...person, appearance: choice.texts[index], appearanceOverride: true })) };
}
function askChibiFilter(view, settings, style, result) {
    return new Promise(resolve => {
        let done = false; const finish = value => { if (done) return; done = true; resolve(value); };
        const sides = result.rows.map((row, index) => `<section class="rmt-pair-filter-side"><h3>${index ? '右边' : '左边'} · ${esc(settings.people[index].name || (index ? '人物二' : '人物一'))}</h3>
            ${row.removed.length ? `<p class="rmt-pair-note">会去掉：${row.removed.map(part => `<s>${esc(part)}</s>`).join('、')}</p>` : '<p class="rmt-pair-note">这一边没有需要去掉的内容。</p>'}
            <label class="rmt-pair-field"><span>这次用来画的外貌（可以再改）</span><textarea data-pair-filter-text="${index}">${esc(row.text)}</textarea></label></section>`).join('');
        const m = dialog(view, '要不要过滤成更适合 Q 版的外貌？', `<p>这次选的是「${esc(style.label)}」。外貌里有身高、体型、骨相、鼻唇细节这类写实描述，容易把人物拉回正常比例。过滤后只保留发型、眼睛、痣疤、配饰、衣着颜色这些认人的特征；<b>只影响这一张，不会改你填的外貌</b>。</p>
            ${sides}
            <label class="rmt-pair-overlay"><input type="checkbox" data-pair-filter-remember><span><b>以后都这样处理，不再询问</b><small>之后可以在“外貌、衣着与背景”里的“Q 版外貌过滤”改回来。</small></span></label>
            <div class="rmt-pair-create"><button type="button" class="rmt-pair-primary" data-pair-filter="yes">过滤后生成</button><button type="button" data-pair-filter="no">保持原样生成</button></div>`);
        if (!m) return finish(null);
        m.cleanup = () => finish(null);
        m.body.addEventListener('click', event => {
            const target = event.target.closest('[data-pair-filter]'); if (!target) return;
            const value = { filter: target.dataset.pairFilter === 'yes', remember: !!m.body.querySelector('[data-pair-filter-remember]')?.checked,
                texts: result.rows.map((row, index) => m.body.querySelector(`[data-pair-filter-text="${index}"]`)?.value.trim() ?? row.text) };
            finish(value); closeCoupleDialog();
        });
    });
}
// Random composition is resolved here, once per drawing, and stored with the
// record. 'classic' and layout styles keep the fixed side-by-side layout.
function resolveComposition(view, settings) {
    if (settings.composition === 'classic') { const { composition, ...rest } = settings; return rest; }
    const choices = couple.coupleCompositionChoices(settings);
    // An explicitly chosen variation is kept (layout styles ignore it when building the prompt).
    if (settings.composition) return settings;
    if (!choices.length) return settings;
    const fresh = choices.filter(row => row.id !== view.lastComposition);
    const pick = (fresh.length ? fresh : choices)[Math.floor(Math.random() * (fresh.length ? fresh : choices).length)];
    view.lastComposition = pick.id;
    return { ...settings, composition: pick.id };
}
async function startGeneration(view) {
    if (!current(view)) return;
    let settings = draft(view);
    const filtered = await chibiFilteredSettings(view, settings);
    if (!filtered || !current(view)) return;
    settings = resolveComposition(view, filtered);
    const id = `pair-job-${++sequence}`, controller = new AbortController(), epoch = view.selectedEpoch;
    const job = { id, scope: view.scope, controller, background: false, status: 'running', label: '正在绘制 · ' + styleLabel(settings) + (presets.COMPOSITION_VARIANTS.find(row => row.id === settings.composition) ? ' · ' + presets.COMPOSITION_VARIANTS.find(row => row.id === settings.composition).label : '') };
    jobs.set(id, job); renderJobs(view); report(view, '');
    try {
        const result = await couple.generateCouple(settings, { context: view.context, signal: controller.signal,
            onProgress: update => {
                const phase = { queued: '等待通道', 'queued-remote': '等待通道', waiting: '等待出图', generating: '正在绘制', saving: '正在保存头像' }[update?.phase] || '正在绘制';
                job.label = update?.providerLabel ? `${update.providerLabel} · ${phase}` : phase;
                if (active?.scope === job.scope) renderJobs(active);
            } });
        const receiver = active?.scope === job.scope ? active : view; rememberRecord(receiver, result);
        if (current(receiver)) {
            if (!job.background && (receiver !== view || receiver.selectedEpoch === epoch)) { receiver.currentId = result.record.id; void renderPreview(receiver); }
            if (receiver.tab === 'history') void renderHistory(receiver);
            report(receiver, result.durable ? '新的一对已收进历史。' : '已出图，本机保存未确认。请先保存图片或导出备份。');
        }
    } catch (error) {
        job.status = 'failed';
        job.message = text.safeErrorSummary(error) || '这次绘制没有完成，请重试。';
    } finally {
        if (job.status !== 'failed') jobs.delete(id);
        if (active?.scope === job.scope) renderJobs(active);
    }
}

function showStyles(view) {
    const m = dialog(view, '选择画风', `<div class="rmt-pair-picker-toolbar">
        <label class="rmt-pair-field"><span class="rmt-pair-visually-hidden">搜索画风</span><input data-pair-search aria-label="搜索风格" placeholder="搜索名称，例如：小猫、水彩、像素"></label>
        <div class="rmt-pair-picker-filter"><label class="rmt-pair-field"><span class="rmt-pair-visually-hidden">风格分类</span><select data-pair-group-select aria-label="风格分类"><option value="all">全部画风</option>${presets.STYLE_GROUPS.map(group => `<option value="${group.id}">${esc(group.label)}</option>`).join('')}</select></label><small data-pair-style-count role="status"></small><button type="button" data-pair-random-style>随机一个</button></div>
        <p class="rmt-pair-note">标“可叠”的画风能叠在你的画师串上；“轻叠”会降低权重叠加；没有标记的会换掉画法。</p>
        </div><div class="rmt-pair-picker-scroll" data-pair-picker-results></div>`);
    if (!m) return;
    m.body.classList.add('rmt-pair-style-browser');
    const filter = m.body.querySelector('[data-pair-group-select]'), search = m.body.querySelector('[data-pair-search]');
    filter.value = styleFor(view.settings.styleId)?.group || 'all';
    const draw = () => {
        const query = search.value.trim().toLowerCase();
        if (query) filter.value = 'all';
        const rows = presets.COUPLE_STYLES.filter(item => (query || filter.value === 'all' || item.group === filter.value) && `${item.label} ${item.description} ${presets.STYLE_GROUPS.find(g => g.id === item.group)?.label || ''}`.toLowerCase().includes(query));
        m.body.querySelector('[data-pair-style-count]').textContent = `${rows.length} 种`;
        m.body.querySelector('[data-pair-picker-results]').innerHTML = rows.length ? presets.STYLE_GROUPS.map(group => {
            const items = rows.filter(item => item.group === group.id);
            return items.length ? `<section class="rmt-pair-picker-group"><h3>${esc(group.label)}</h3><div class="rmt-pair-picker-results">${items.map(item => `<button type="button" data-pair-pick-style="${item.id}" aria-pressed="${view.settings.styleId === item.id}" title="${esc(item.description)}"><span>${esc(item.label)}${blendBadge(item)}</span>${view.settings.styleId === item.id ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div></section>` : '';
        }).join('') : '<p class="rmt-pair-note">没有找到，换个词试试，或回到页面自己写风格。</p>';
        m.body.querySelector('[data-pair-picker-results]').scrollTop = 0;
    };
    search.addEventListener('input', draw);
    filter.addEventListener('change', () => { search.value = ''; draw(); });
    m.body.addEventListener('click', event => {
        if (event.target.closest('[data-pair-random-style]')) {
            const options = [...m.body.querySelectorAll('[data-pair-pick-style]')].filter(node => node.dataset.pairPickStyle !== view.settings.styleId);
            const pick = options[Math.floor(Math.random() * options.length)]; if (!pick) return;
            draft(view); view.settings.styleId = pick.dataset.pairPickStyle; paintSettings(view); queueDraft(view); closeCoupleDialog(); return;
        }
        const target = event.target.closest('[data-pair-pick-style]'); if (!target) return;
        draft(view); view.settings.styleId = target.dataset.pairPickStyle; paintSettings(view); queueDraft(view); closeCoupleDialog();
    });
    draw();
}
async function showCrop(view, record) {
    const m = dialog(view, '分别调整头像', '<p role="status">正在读取原图…</p>'); if (!m) return;
    let loaded;
    try { loaded = await loadRecord(view, record); } catch (error) { return imageFailure(view, m, record, error); }
    if (modal !== m) return;
    let side = 0; const edited = structuredClone(record.crops);
    m.body.innerHTML = `<div class="rmt-pair-choice">${[0, 1].map(i => `<button type="button" data-pair-crop-side="${i}" aria-pressed="${i === 0}">${i ? '右边' : '左边'} · ${esc(record.settings.people[record.order[i]]?.name || '')}</button>`).join('')}</div><p class="rmt-pair-note">只调整选中的这一边。保存后仍保留原图，随时可以重置。</p><div class="rmt-pair-crop-layout" style="margin-top:16px"><div data-pair-crop-stage></div><div class="rmt-pair-sliders">${[['zoom', '放大', 1, 3, .01], ['x', '左右移动', -100, 100, 1], ['y', '上下移动', -100, 100, 1]].map(([key, label, min, max, step]) => `<label>${label}<input type="range" data-pair-crop-control="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`).join('')}<small data-pair-crop-pixels></small><button type="button" data-pair-crop-reset>重置这一边</button></div></div><div class="rmt-pair-actions"><button type="button" data-pair-crop-save class="rmt-pair-primary">保存裁切</button><button type="button" data-pair-close>取消</button></div>`;
    const draw = () => {
        const half = record.order[side], c = edited[half], preview = { ...record, crops: edited };
        const stage = m.body.querySelector('[data-pair-crop-stage]'), image = stage.querySelector('img');
        if (image) {
            Object.assign(image.style, crop.cropPreviewStyle(loaded.width, loaded.height, half, c));
            image.alt = `${record.settings.people[half]?.name || (side ? '右边' : '左边')}的头像`;
        } else {
            const next = square(preview, side, loaded, view.circle ? 'is-circle' : ''); next.setAttribute('data-pair-crop-stage', ''); stage.replaceWith(next);
        }
        for (const slider of m.body.querySelectorAll('[data-pair-crop-control]')) slider.value = c[slider.dataset.pairCropControl];
        const size = crop.cropRect(loaded.width, loaded.height, half, c).outputSize;
        m.body.querySelector('[data-pair-crop-pixels]').textContent = loaded.croppable ? `保存尺寸 ${size} × ${size} 像素` : loaded.error;
        for (const tab of m.body.querySelectorAll('[data-pair-crop-side]')) tab.setAttribute('aria-pressed', String(Number(tab.dataset.pairCropSide) === side));
    };
    m.body.addEventListener('input', event => { const key = event.target.dataset.pairCropControl; if (key) { edited[record.order[side]][key] = Number(event.target.value); draw(); } });
    m.body.addEventListener('click', event => {
        const target = event.target.closest('button'); if (!target) return;
        if (target.hasAttribute('data-pair-crop-side')) { side = Number(target.dataset.pairCropSide); draw(); }
        if (target.hasAttribute('data-pair-crop-reset')) { edited[record.order[side]] = crop.normalizeCrop(null); draw(); }
        if (target.hasAttribute('data-pair-crop-save')) {
            target.disabled = true;
            void updateRecord(view, record, { crops: edited }).then(() => { if (modal === m) closeCoupleDialog(); }).catch(error => { target.disabled = false; failure(view, error); });
        }
    }); draw();
}
async function showOriginal(view, record, seam) {
    const m = dialog(view, seam ? '检查当前拼接' : '保留的原图', '<p role="status">正在读取原图…</p>'); if (!m) return;
    if (seam) {
        let loaded;
        try { loaded = await loadRecord(view, record); } catch (error) { return imageFailure(view, m, record, error); }
        if (modal !== m) return;
        m.body.innerHTML = '<div class="rmt-pair-seam" data-pair-seam></div><p>这里展示当前裁切后的拼接。分别移动或放大后，中间的图案可能需要重新对齐。</p><div class="rmt-pair-actions"><button type="button" data-pair-recrop>调整裁切</button></div>';
        const previews = pairPreviews(record, loaded);
        m.body.querySelector('[data-pair-seam]').append(square(record, 0, loaded, '', previews.images[0]), square(record, 1, loaded, '', previews.images[1]));
        m.body.querySelector('[data-pair-recrop]').addEventListener('click', () => void showCrop(view, record).catch(error => failure(view, error)));
    } else {
        m.body.innerHTML = `<img class="rmt-pair-full-image" src="${esc(record.original.url)}" alt="这一对头像的完整原图"><p>这是未裁切的完整原图。手机和 TT 可长按图片保存。</p><div class="rmt-pair-actions"><a class="rmt-pair-button" href="${esc(record.original.url)}" target="_blank" rel="noopener noreferrer">单独打开原图</a><a class="rmt-pair-button" href="${esc(record.original.url)}" download="情侣头像-原图">下载原图</a></div>`;
    }
}
function imageFailure(view, m, record, error) {
    if (modal !== m) return;
    m.body.innerHTML = `<p role="status">${esc(error.message || '原图暂时无法打开。')}</p><p>头像记录与裁切设置仍然保留。可以打开原地址，或导入本地原图继续制作。</p><div class="rmt-pair-actions"><a class="rmt-pair-button" href="${esc(record.original.url)}" target="_blank" rel="noopener noreferrer">打开原地址</a><button type="button" data-pair-reimport>导入本地原图</button></div>`;
    m.body.querySelector('[data-pair-reimport]').addEventListener('click', () => { closeCoupleDialog(); view.root.querySelector('[data-pair-image-file]').click(); });
}
async function showSave(view, record, side) {
    const m = dialog(view, side ? '保存右边头像' : '保存左边头像', '<p role="status">正在从原图裁出头像…</p>'); if (!m) return;
    let image;
    try { const loaded = await loadRecord(view, record); if (modal !== m) return; image = crop.cropPairImage(loaded, record.crops, record.order)[side]; }
    catch (error) {
        if (modal !== m) return;
        m.body.innerHTML = `<img class="rmt-pair-full-image" src="${esc(record.original.url)}" alt="完整原图"><div class="rmt-pair-restore-note"><p>${esc(error.message)}</p><p>这里展示的是完整原图。保存后可自行裁切，也可导入本地原图继续调整。</p></div><div class="rmt-pair-actions"><a class="rmt-pair-button" href="${esc(record.original.url)}" target="_blank" rel="noopener noreferrer">单独打开原图</a><button type="button" data-pair-save-import>导入本地原图</button></div>`;
        m.body.querySelector('[data-pair-save-import]').addEventListener('click', () => { closeCoupleDialog(); view.root.querySelector('[data-pair-image-file]').click(); }); return;
    }
    if (modal !== m) return;
    const filename = `情侣头像-${side ? '右边' : '左边'}.png`;
    const file = await crop.pngFile(image.url, filename); if (modal !== m) return;
    const url = URL.createObjectURL(file); m.cleanup = () => setTimeout(() => URL.revokeObjectURL(url), 30000);
    let canShare = false; try { canShare = !!navigator.share && typeof File === 'function' && file instanceof File && navigator.canShare?.({ files: [file] }) === true; } catch {}
    m.body.innerHTML = `<img class="rmt-pair-full-image" src="${esc(image.url)}" alt="${side ? '右边' : '左边'}头像，可长按保存"><p>手机和 TT：长按上方图片保存。电脑：点击下载。</p><small>${image.width} × ${image.height} 像素 · PNG · 从原图裁切</small><div class="rmt-pair-actions"><a class="rmt-pair-button rmt-pair-primary" href="${esc(url)}" download="${filename}">下载头像</a><a class="rmt-pair-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">单独打开图片</a>${canShare ? '<button type="button" data-pair-share>系统分享 / 存储</button>' : ''}</div><p data-pair-share-status role="status"></p>`;
    m.body.querySelector('[data-pair-share]')?.addEventListener('click', () => {
        void navigator.share({ files: [file], title: '情侣头像' }).catch(error => {
            if (modal === m && error?.name !== 'AbortError') m.body.querySelector('[data-pair-share-status]').textContent = '系统分享暂不可用，可以长按图片，或点击下载。';
        });
    });
}
