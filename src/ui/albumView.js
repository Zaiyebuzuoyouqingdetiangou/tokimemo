import * as modes_album from '../modes/album.js';
import * as core_participants from '../core/participants.js';
import * as core_cache from '../core/cache.js';
import * as cg_format_ui from './cgFormatControl.js';
import * as story_chronology from '../core/storyChronology.js';
import * as ui_albumCategory from './albumCategory.js';
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
    const entries = story_chronology.sortByStoryDate(runtimeState.activeSession.entries);
    return category === '全部' ? entries : entries.filter(x => ui_albumCategory.albumDisplayCategory(x) === category);
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
    if (selected && session.category !== '全部' && ui_albumCategory.albumDisplayCategory(selected) !== session.category) {
        selected = pageItems[0] || list[0] || null;
        session.selectedId = selected?.id || '';
    } else if (session.selectedId && !selected) {
        selected = pageItems[0] || list[0] || null;
        session.selectedId = selected?.id || '';
    }
    const unlocked = session.entries.filter(x => x.unlocked).length;
    const readOnlyArchive = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    const filters = ui_albumCategory.ALBUM_DISPLAY_CATEGORIES.map(cat => `<button type="button" class="rmt-btn ${session.category === cat ? 'active' : ''}" data-rmt-category="${cat}">${cat}</button>`).join('');
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
      <div class="rmt-info-date">${core_text.esc(selected.date)} · ${core_text.esc(ui_albumCategory.albumDisplayCategory(selected))}</div>
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
      ${session.readableProgress?.complete === false ? '<p role="status">未完成 · 已生成的画面和对白已保留，可继续阅读。</p>' : ''}
      <div class="rmt-album-head"><h2>${core_text.esc(session.title)}</h2><span class="rmt-count">已解锁 ${unlocked} / 总数 ${session.entries.length}</span><div class="rmt-filter">${filters}</div></div>
      ${generation_imageGeneration.cgImageProviderBar({ readOnly: readOnlyArchive })}
      <div class="rmt-album-layout">
        <section class="rmt-grid-wrap"><div class="rmt-grid">${cards}</div>
          <div class="rmt-pager"><button type="button" class="rmt-btn" data-rmt-action="album-prev" ${session.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${session.page} 页 / 共 ${totalPages} 页</span><button type="button" class="rmt-btn" data-rmt-action="album-next" ${session.page >= totalPages ? 'disabled' : ''}>下一页</button></div>
        </section>
        ${info}
      </div>
    </div>`;
    cg_format_ui.mountCgFormatControl(body, 'album', '', readOnlyArchive);
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
    if (!ui_albumCategory.ALBUM_DISPLAY_CATEGORIES.includes(category)) return;
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

export function albumSpeakerSnapshot(item, session = runtimeState.activeSession) {
    // A saved item's identities win over a later roster edit. Legacy rows may be
    // attributed manually using the active archive's explicitly selected people.
    return modes_album.normalizeAlbumSpeakerSnapshot(item?.speakerSnapshot)
        || core_participants.normalizeParticipantSnapshot(session?.participantSnapshot || null)
        || core_participants.selectedParticipantSnapshot(runtimeState.activeArchiveSnapshot
            ? runtimeState.activeArchiveSnapshot.cache?.participantsV1 || runtimeState.activeArchiveSnapshot.memory?.participantsV1
            : core_cache.readParticipantRoster(core_context.getContext()));
}

export async function albumSetCommentSpeaker(entryId, index, speakerId) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const item = runtimeState.activeSession?.entries?.find(entry => entry.id === entryId);
    const snapshot = albumSpeakerSnapshot(item);
    const person = snapshot?.people.find(person => person.id === speakerId);
    if (!item || !Number.isInteger(index) || index < 0 || index >= item.comments.length || (speakerId && !person)) return;
    await ui_overlay.saveActiveSessionEdit(session => {
        const latest = session.entries.find(entry => entry.id === entryId);
        latest.speakerSnapshot = modes_album.albumSpeakerIdentities(snapshot);
        latest.commentSpeakers = latest.comments.map((_, lineIndex) => lineIndex === index
            ? { speakerId: person?.id || '', speakerName: person?.name || '' }
            : latest.commentSpeakers?.[lineIndex] || { speakerId: '', speakerName: '' });
        return session;
    }, { select: session => session.entries?.find(entry => entry.id === entryId) });
    renderSharedMemory();
}

export function renderSharedMemory() {
    const session = runtimeState.activeSession;
    const item = selectedAlbumEntry();
    if (!session || session.kind !== core_constants.MODE.ALBUM || !item?.unlocked) return renderAlbum();
    const comments = item.comments;
    session.dialogueIndex = Math.max(0, Math.min(session.dialogueIndex, comments.length - 1));
    const last = session.dialogueIndex >= comments.length - 1;
    const snapshot = albumSpeakerSnapshot(item, session);
    const speaker = snapshot?.people.find(person => person.id === item.commentSpeakers?.[session.dialogueIndex]?.speakerId);
    const charName = snapshot ? (speaker?.name || '未标注人物')
        : core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext()?.name2, 80) || '他';
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
        ${item.progressPending?.length ? `<p role="status">共同回忆未完成 · 已生成 ${comments.length} 段对白。</p>` : ''}
        <div class="rmt-dialogue-speaker">${core_text.esc(charName)}</div>
        ${snapshot && comments.length && !readOnly ? `<label>本句说话人 <select data-rmt-album-speaker="${core_text.esc(item.id)}" data-rmt-dialogue-index="${session.dialogueIndex}"><option value="">未标注人物</option>${snapshot.people.map(person => `<option value="${core_text.esc(person.id)}"${person.id === speaker?.id ? ' selected' : ''}>${core_text.esc(person.name)}</option>`).join('')}</select></label>` : ''}
        <div class="rmt-dialogue-text">${core_text.esc(comments[session.dialogueIndex] || (item.progressPending?.length ? '对白尚未生成，画面描述已保留。' : ''))}</div>
        <div class="rmt-dialogue-actions">
          <button type="button" class="rmt-btn" data-rmt-action="shared-prev" ${!comments.length || session.dialogueIndex <= 0 ? 'disabled' : ''}>上一句</button>
          <button type="button" class="rmt-btn" data-rmt-action="shared-next" ${!comments.length || last ? 'disabled' : ''}>下一句</button>
        </div>
      </div>
      ${readOnly ? '' : '<div class="rmt-cg-card-actions rmt-cg-memory-actions"><button type="button" class="rmt-btn" data-rmt-action="edit-cg-prompt">图片设置</button></div>'}
      ${generation_imageGeneration.cgImageProgressHtml()}
    </div>`;
    body.querySelector?.('[data-rmt-album-speaker]')?.addEventListener('change', event => {
        const select = event.currentTarget;
        void albumSetCommentSpeaker(select.dataset.rmtAlbumSpeaker, Number(select.dataset.rmtDialogueIndex), select.value)
            .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    });
}
