// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_cgPromptEditor from './cgPromptEditor.js';
import * as ui_overlay from './overlay.js';
import * as ui_styles from './styles.js';
export function filteredAlbumEntries() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return [];
    const category = runtimeState.activeSession.category || '全部';
    return category === '全部' ? runtimeState.activeSession.entries : runtimeState.activeSession.entries.filter(x => x.category === category);
}

export function selectedAlbumEntry() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM || !runtimeState.activeSession.selectedId) return null;
    return runtimeState.activeSession.entries.find(x => x.id === runtimeState.activeSession.selectedId) || null;
}

export function renderAlbum() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.ALBUM) return;
    if (session.sharedMemory) return renderSharedMemory();
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.ALBUM]);
    const list = filteredAlbumEntries();
    const totalPages = Math.max(1, Math.ceil(list.length / session.pageSize));
    session.page = Math.max(1, Math.min(session.page, totalPages));
    const start = (session.page - 1) * session.pageSize;
    const pageItems = list.slice(start, start + session.pageSize);
    let selected = selectedAlbumEntry();
    if (selected && session.category !== '全部' && selected.category !== session.category) {
        selected = pageItems[0] || list[0] || null;
        session.selectedId = selected?.id || '';
    } else if (session.selectedId && !selected) {
        selected = pageItems[0] || list[0] || null;
        session.selectedId = selected?.id || '';
    }
    const unlocked = session.entries.filter(x => x.unlocked).length;
    const readOnlyArchive = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    const filters = ['全部', '日常', '约会', '结局'].map(cat => `<button type="button" class="rmt-btn ${session.category === cat ? 'active' : ''}" data-rmt-category="${cat}">${cat}</button>`).join('');
    const cards = pageItems.map(item => {
        const drawing = item.unlocked && !readOnlyArchive && generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ALBUM, item.id);
        const cardActions = item.unlocked
            ? `<div class="rmt-cg-card-actions"><button type="button" class="rmt-btn rmt-memory-primary" data-rmt-album-memory="${core_text.esc(item.id)}" aria-label="${core_text.esc(item.title)}：共同回忆">共同回忆</button>${readOnlyArchive ? '' : `<button type="button" class="rmt-btn" data-rmt-album-prompt="${core_text.esc(item.id)}" ${drawing ? 'disabled' : ''} aria-label="${core_text.esc(item.title)}：图片设置">${drawing ? '绘制中…' : '图片设置'}</button>`}</div>`
            : '';
        return `<article class="rmt-card ${item.id === session.selectedId ? 'active' : ''} ${item.unlocked ? '' : 'locked'}" data-rmt-album-id="${core_text.esc(item.id)}">
      <div class="rmt-thumb">${item.unlocked ? generation_imageGeneration.cgImageLayerHtml(item) : `<div class="rmt-abstract" style="${ui_styles.abstractStyle(item.visualSeed, item.id)}"></div>`}</div>
      <div class="rmt-card-meta">
        <div class="rmt-card-title">${core_text.esc(item.unlocked ? item.title : `（未解锁）${item.title}`)}</div>
        <div class="rmt-card-date">${core_text.esc(item.date)}</div>
        <div class="rmt-card-desc">${core_text.esc(item.desc)}</div>
        ${cardActions}
      </div>
    </article>`;
    }).join('');
    const hint = selected && !selected.unlocked && session.hintVisible ? selected.hintLines.join('\n') : '';
    const info = selected ? `<aside class="rmt-info">
      <h3>${core_text.esc(selected.unlocked ? selected.title : `（未解锁）${selected.title}`)}</h3>
      <div class="rmt-info-date">${core_text.esc(selected.date)} · ${core_text.esc(selected.category)}</div>
      <div class="rmt-info-desc">${core_text.esc(selected.desc)}</div>
      <div class="rmt-actions">
        <button type="button" class="rmt-btn rmt-memory-primary" data-rmt-action="shared-memory" ${selected.unlocked ? '' : 'disabled'}>${selected.unlocked ? '走进共同回忆' : '尚未解锁'}</button>
        ${selected.unlocked ? '' : '<button type="button" class="rmt-btn" data-rmt-action="show-hint">解锁提示</button>'}
        <button type="button" class="rmt-btn" data-rmt-action="album-cancel">取消选择</button>
      </div>
      <div class="rmt-hint" ${hint ? '' : 'hidden'}>${core_text.esc(hint)}</div>
    </aside>` : '<aside class="rmt-info">当前分类没有条目。</aside>';
    const body = ui_overlay.bodyEl();
    body.innerHTML = `<div class="rmt-album">
      <div class="rmt-album-head"><h2>${core_text.esc(session.title)}</h2><span class="rmt-count">已解锁 ${unlocked} / 总数 ${session.entries.length}</span><div class="rmt-filter">${filters}</div></div>
      ${generation_imageGeneration.cgImageProviderBar({ readOnly: readOnlyArchive })}
      <div class="rmt-album-layout">
        <section class="rmt-grid-wrap"><div class="rmt-grid">${cards}</div>
          <div class="rmt-pager"><button type="button" class="rmt-btn" data-rmt-action="album-prev" ${session.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${session.page} 页 / 共 ${totalPages} 页</span><button type="button" class="rmt-btn" data-rmt-action="album-next" ${session.page >= totalPages ? 'disabled' : ''}>下一页</button></div>
        </section>
        ${info}
      </div>
    </div>`;
}

export function albumDrawCg(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const item = runtimeState.activeSession.entries.find(entry => entry.id === id);
    if (!item?.unlocked) return;
    runtimeState.activeSession.selectedId = item.id;
    runtimeState.activeSession.hintVisible = false;
    renderAlbum();
    void generation_imageGeneration.drawSelectedCgImage();
}

export function albumEditCgPrompt(id) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const session = runtimeState.activeSession;
    if (session?.kind !== core_constants.MODE.ALBUM || !session.entries.find(item => item.id === id)?.unlocked) return;
    session.selectedId = id;
    session.hintVisible = false;
    renderAlbum();
    // Rendering replaced the clicked card. The editor must remember its new
    // button so cancelling can restore keyboard focus to the same picture.
    [...(ui_overlay.bodyEl()?.querySelectorAll('[data-rmt-album-prompt]') || [])]
        .find(button => button.dataset.rmtAlbumPrompt === id)?.focus();
    ui_cgPromptEditor.openCgPromptEditor();
}

export function albumEnterSharedMemory(id) {
    const session = runtimeState.activeSession;
    if (session?.kind !== core_constants.MODE.ALBUM || !session.entries.find(item => item.id === id)?.unlocked) return;
    session.selectedId = id; session.hintVisible = false;
    enterSharedMemory();
}

export function albumSelect(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    const item = runtimeState.activeSession.entries.find(x => x.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedId = item.id;
    runtimeState.activeSession.hintVisible = false;
    renderAlbum();
}

export function albumFilter(category) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    if (!['全部', ...core_constants.CATEGORY_VALUES].includes(category)) return;
    runtimeState.activeSession.category = category;
    runtimeState.activeSession.page = 1;
    runtimeState.activeSession.hintVisible = false;
    const first = filteredAlbumEntries()[0];
    runtimeState.activeSession.selectedId = first?.id || '';
    renderAlbum();
}

export function albumPage(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    const albumSession = runtimeState.activeSession;
    const category = albumSession.category;
    const selectedId = albumSession.selectedId;
    const sharedMemory = albumSession.sharedMemory === true;
    const list = filteredAlbumEntries();
    const pageSize = albumSession.pageSize;
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const next = Math.max(1, Math.min(pages, albumSession.page + delta));
    if (next === albumSession.page) return;
    const grid = document.querySelector('.rmt-grid');
    grid?.classList.add('fade');
    setTimeout(() => {
        if (runtimeState.activeSession !== albumSession
            || albumSession.kind !== core_constants.MODE.ALBUM
            || albumSession.category !== category
            || albumSession.selectedId !== selectedId
            || (albumSession.sharedMemory === true) !== sharedMemory) return;
        albumSession.page = next;
        const first = list[(next - 1) * pageSize];
        albumSession.selectedId = first?.id || albumSession.selectedId;
        albumSession.hintVisible = false;
        renderAlbum();
    }, 180);
}

export function showAlbumHint() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    runtimeState.activeSession.hintVisible = true;
    renderAlbum();
}

export function enterSharedMemory() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ALBUM) return;
    const item = selectedAlbumEntry();
    if (!item?.unlocked) return;
    runtimeState.activeSession.sharedMemory = true;
    runtimeState.activeSession.dialogueIndex = 0;
    renderSharedMemory();
}

export function renderSharedMemory() {
    const session = runtimeState.activeSession;
    const item = selectedAlbumEntry();
    if (!session || session.kind !== core_constants.MODE.ALBUM || !item?.unlocked) return renderAlbum();
    const comments = item.comments;
    session.dialogueIndex = Math.max(0, Math.min(session.dialogueIndex, comments.length - 1));
    const last = session.dialogueIndex >= comments.length - 1;
    const charName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext()?.name2, 80) || '他';
    const readOnly = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    ui_overlay.setBackVisible(true, '回忆相簿');
    ui_overlay.topTitle(`共同回忆 · ${item.title}`);
    const body = ui_overlay.bodyEl();
    body.innerHTML = `<div class="rmt-memory-scene">
      <div class="rmt-memory-cg rmt-reading-image${generation_imageGeneration.normalizeCgImageRecord(item.cgImage) ? ' rmt-reading-image-saved' : ''}">
        ${generation_imageGeneration.cgImageLayerHtml(item, { lazy: false })}
      </div>
      <div class="rmt-memory-caption"><b>${core_text.esc(item.title)}</b><span>${core_text.esc(item.date)}</span><p>${core_text.esc(item.desc)}</p></div>
      <div class="rmt-dialogue">
        <div class="rmt-dialogue-speaker">${core_text.esc(charName)}</div>
        <div class="rmt-dialogue-text">${core_text.esc(comments[session.dialogueIndex] || '')}</div>
        <div class="rmt-dialogue-actions">
          <button type="button" class="rmt-btn" data-rmt-action="shared-back">返回相簿</button>
          <button type="button" class="rmt-btn" data-rmt-action="${last ? 'shared-replay' : 'shared-next'}">${last ? '重看' : '下一句'}</button>
        </div>
      </div>
      ${readOnly ? '' : '<div class="rmt-cg-card-actions rmt-cg-memory-actions"><button type="button" class="rmt-btn" data-rmt-action="edit-cg-prompt">图片设置</button></div>'}
      ${generation_imageGeneration.cgImageProgressHtml()}
    </div>`;
}
