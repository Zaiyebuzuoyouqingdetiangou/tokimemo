import * as contract from '../core/themeSongContract.js';
import * as contextApi from '../core/context.js';
import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as coordinator from '../core/requestCoordinator.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';
import * as generation from '../generation/client.js';
import * as recoveryView from './recoveryView.js';
import * as overlay from './overlay.js';
import * as text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
const MODE = contract.THEME_SONG_MODE;
const readonly = () => !!runtimeState.activeArchiveSnapshot && (runtimeState.activeArchiveReadOnly || runtimeState.activeArchiveSnapshot.backupOnly);
const shownMemory = () => runtimeState.activeArchiveSnapshot?.memory || repository.getImportedMemory(contextApi.getContext());
const scope = s => JSON.stringify([s?.chatId, s?.archiveRevision, s?.characterName, s?.userName, s?.ownerKey]);
const esc = text.esc;
// Pure UI preference. Never written into a song, archive or recovery request.
let displayMode = 'read';
export function themeSongDisplayMode() { return displayMode; }
export function songLyricsReadingHtml(lyrics) {
    const lines = text.normalizeText(lyrics, contract.SONG_LIMITS.lyrics).split('\n');
    const sections = [];
    let current = { label: '', lines: [] };
    for (const line of lines) {
        const heading = line.match(/^\[([^\]\n]+)\]\s*$/);
        if (!heading) { current.lines.push(line); continue; }
        if (current.label || current.lines.some(value => value.trim())) sections.push(current);
        current = { label: heading[1], lines: [] };
    }
    if (current.label || current.lines.some(value => value.trim())) sections.push(current);
    const label = value => value.replace(/^Final Chorus$/i, '最后的副歌')
        .replace(/^Pre[- ]Chorus/i, '预副歌').replace(/^Chorus/i, '副歌')
        .replace(/^Verse/i, '主歌').replace(/^Bridge/i, '桥段')
        .replace(/^Intro$/i, '前奏').replace(/^Outro$/i, '尾声');
    return sections.filter(section => section.lines.some(value => value.trim())).map(section =>
        `<section class="rmt-song-stanza">${section.label ? `<h3>${esc(label(section.label))}</h3>` : ''}<p>${esc(section.lines.join('\n').trim())}</p></section>`).join('');
}

function busy() {
    return runtimeState.activeArchiveSnapshot ? coordinator.isArchiveTargetModeGenerating(MODE, runtimeState.activeArchiveSnapshot)
        : coordinator.isModeGenerating(MODE);
}
export function assertThemeSongReader() {
    const session = runtimeState.activeSession, memory = shownMemory();
    if (runtimeState.activeMode !== MODE || !session || !memory) throw contract.songError('SOURCE', '请重新打开对应档案的印象曲。');
    contract.normalizeStoredThemeSongs(session, memory);
    if (!runtimeState.activeArchiveSnapshot && session.ownerKey
        && session.ownerKey !== contextApi.currentCharacterRuntimeKey(contextApi.getContext()))
        throw contract.songError('SOURCE', '当前角色已经切换，请重新打开印象曲。');
    return session;
}
export function renderThemeSongs() {
    if (runtimeState.activeSession?.kind !== MODE) return;
    const session = runtimeState.activeSession, memory = shownMemory();
    if (!memory) return;
    overlay.topTitle('角色印象曲');
    const selected = session.songs.find(song => song.id === session.selectedId) || session.songs[0];
    const disabled = readonly() || busy();
    const options = Object.entries(contract.SONG_LANGUAGES).map(([key,label]) => `<option value="${key}">${label}</option>`).join('');
    const voices = Object.entries(contract.SONG_VOICES).map(([key,label]) => `<option value="${key}">${label}</option>`).join('');
    const events = (memory.memories || []).map(m => `<option value="event:${esc(m.id)}">事件 · ${esc(text.normalizeText(m.title || m.id, 120))}</option>`).join('');
    const form = `<details class="rmt-song-composer" ${session.songs.length ? '' : 'open'}><summary>创作方向</summary><div class="rmt-song-form">
      <label class="rmt-song-wide">写给谁 / 哪件事<select data-rmt-song-subject ${disabled ? 'disabled' : ''}><option value="character">${esc(memory.characterName)} · 角色印象</option>${events}</select></label>
      <label>歌词语言<select data-rmt-song-language ${disabled ? 'disabled' : ''}>${options}</select></label>
      <label>演唱者设定<select data-rmt-song-voice ${disabled ? 'disabled' : ''}>${voices}</select></label>
      <label class="rmt-song-wide">想要的感觉（可不填）<input data-rmt-song-direction maxlength="400" placeholder="例如：克制的钢琴抒情，副歌逐渐明亮" ${disabled ? 'disabled' : ''}></label>
      <button type="button" class="rmt-btn rmt-song-write" data-rmt-song="generate" ${disabled ? 'disabled' : ''}>${busy() ? '正在写歌…' : session.songs.length ? '新写一首' : '创作印象曲'}</button></div></details>`;
    const button = (action, label) => `<button type="button" class="rmt-btn" data-rmt-song="${action}" data-rmt-song-id="${esc(selected.id)}">${label}</button>`;
    const formatDetails = selected ? `<article class="rmt-song-sheet" data-rmt-song-presentation="format"><header><small>${esc(selected.subject === 'event' ? '事件印象曲' : '角色印象曲')} · ${esc(selected.subjectTitle)}</small><h2>${esc(selected.title)}</h2><p><b>演唱者</b> ${esc(selected.singer)} <span>· ${esc(contract.SONG_LANGUAGES[selected.language])}</span></p><p>${esc(selected.vocalDescription)}</p></header>
      <section class="rmt-song-style"><h3>曲风</h3><p>${esc(selected.styleDescription)}</p><div class="rmt-song-toolbar">${button('copy-title','复制歌名')}${button('copy-style','复制曲风')}</div><pre>${esc(selected.stylePrompt)}</pre></section>
      <section class="rmt-song-lyrics"><div class="rmt-song-toolbar"><h3>完整歌词</h3>${button('copy-lyrics','复制歌词')}</div><pre>${esc(selected.lyrics)}</pre></section>
      <footer class="rmt-song-toolbar">${button('copy-all','复制全部')}${button('export','导出文本')}${readonly() ? '' : `<button type="button" class="rmt-btn" data-rmt-song="delete" data-rmt-song-id="${esc(selected.id)}" ${busy() ? 'disabled' : ''}>删除这首</button>`}</footer>
      <div data-rmt-song-copy-fallback></div></article>` : '<div class="rmt-song-empty"><span aria-hidden="true">♫</span><h3>让故事有自己的旋律</h3><p>为角色写一首，或选一段真实回忆作为起点。</p></div>';
    const readDetails = selected ? `<article class="rmt-song-sheet rmt-song-readable" data-rmt-song-presentation="read"><header>
      <small>${esc(selected.subject === 'event' ? '事件印象曲' : '角色印象曲')} · ${esc(selected.subjectTitle)}</small>
      <h2>${esc(selected.title)}</h2><p>演唱者 · ${esc(selected.singer)}</p>
      <p class="rmt-song-credit">作者 · 未署名（原创生成）</p>
      <details class="rmt-song-arrangement"><summary>曲风与人声</summary><p>${esc(selected.styleDescription)}</p><p>${esc(selected.vocalDescription)}</p></details></header>
      <div class="rmt-song-reading-lyrics">${songLyricsReadingHtml(selected.lyrics)}</div>
      <footer class="rmt-song-toolbar">${button('copy-lyrics','复制歌词')}${button('export','导出文本')}${readonly() ? '' : `<button type="button" class="rmt-btn" data-rmt-song="delete" data-rmt-song-id="${esc(selected.id)}" ${busy() ? 'disabled' : ''}>删除这首</button>`}</footer>
      <div data-rmt-song-copy-fallback></div></article>` : formatDetails;
    const details = displayMode === 'format' ? formatDetails : readDetails;
    const switcher = `<div class="rmt-song-display-switch" role="group" aria-label="歌曲显示模式"><button type="button" class="rmt-btn" data-rmt-song="view-read" aria-pressed="${displayMode === 'read'}">阅读模式</button><button type="button" class="rmt-btn" data-rmt-song="view-format" aria-pressed="${displayMode === 'format'}">创作格式</button></div>`;
    const list = session.songs.length ? `<nav class="rmt-song-list" aria-label="已保存的印象曲">${[...session.songs].reverse().map(song => `<button type="button" class="${song.id === selected?.id ? 'active' : ''}" data-rmt-song="select" data-rmt-song-id="${esc(song.id)}" aria-current="${song.id === selected?.id ? 'page' : 'false'}"><span aria-hidden="true">♪</span><span><b>${esc(song.title)}</b><small>${esc(song.singer)}</small></span></button>`).join('')}</nav>` : '';
    const allCache = runtimeState.activeArchiveSnapshot?.cache || cache.getCache(contextApi.getContext());
    const recovery = recoveryView.recoveryBannerHtml({ __generationRecoveryV1: { [MODE]: allCache?.__generationRecoveryV1?.[MODE] } }, memory, { readOnly: readonly() });
    overlay.bodyEl().innerHTML = `<main class="rmt-theme-song"><header class="rmt-song-heading"><div class="rmt-song-emblem" aria-hidden="true">♫</div><div><h2>角色印象曲</h2><p>${session.songs.length ? `已收录 ${session.songs.length} 首` : '歌名 · 曲风 · 完整歌词'}</p></div></header><p class="rmt-song-note">生成歌曲文本与编曲说明，不生成音频。</p>${switcher}${recovery}${form}<div class="rmt-song-layout ${list ? 'has-songs' : ''}">${list}${details}</div></main>`;
}
export async function deleteThemeSong(id) {
    const shown = assertThemeSongReader();
    if (readonly() || busy()) return false;
    const targetSong = shown.songs.find(song => song.id === id);
    if (!targetSong) return false;
    const snapshot = runtimeState.activeArchiveSnapshot, shownScope = scope(shown);
    const lifecycle = runtimeState.runtimeLifecycleEpoch;
    if (!overlay.confirmExplicitActionTwice(`删除「${targetSong.title}」？`, '只删除这首印象曲；其他歌曲、档案和聊天保持不变。', { destructive: true })) return false;
    if (runtimeState.activeMode !== MODE || runtimeState.activeSession !== shown || runtimeState.activeArchiveSnapshot !== snapshot
        || scope(assertThemeSongReader()) !== shownScope || readonly() || busy()) return false;
    const fingerprint = JSON.stringify(targetSong);
    const sameView = () => runtimeState.activeMode === MODE && scope(runtimeState.activeSession) === shownScope
        && (runtimeState.activeArchiveSnapshot?.entryId || '') === (snapshot?.entryId || '') && contextApi.runtimeLifecycleStillCurrent(lifecycle);
    const mutate = latest => {
        if (!latest || busy() && sameView()) throw contract.songError('BUSY', '印象曲正在生成或状态已变化，暂未删除。');
        const current = contract.normalizeStoredThemeSongs(latest);
        if (JSON.stringify(current.songs.find(song => song.id === id)) !== fingerprint) throw contract.songError('CONFLICT', '这首印象曲已变化，请重新确认。');
        current.songs = current.songs.filter(song => song.id !== id);
        if (current.selectedId === id) current.selectedId = current.songs[0]?.id || '';
        return current;
    };
    let updated;
    if (snapshot) {
        const options = library.archiveTargetGenerationOptions(snapshot);
        const target = await options.revalidateArchiveTarget(options.archiveTarget, lifecycle);
        if (!sameView() || readonly()) return false;
        options.context.chatMetadata[constants.MEMORY_KEY] = target.memory;
        options.context.chatMetadata[constants.CACHE_KEY] = target.cache;
        const origin = contextApi.captureTaskOrigin(options.context, target.memory.archiveRevision);
        const result = await options.commitArchiveTargetMutation(target, MODE, origin, mutate, null,
            () => contextApi.runtimeLifecycleStillCurrent(lifecycle));
        updated = result.session;
        if (sameView() && result.snapshot) runtimeState.activeArchiveSnapshot = result.snapshot;
    } else {
        const ctx = contextApi.currentCharacterGuard(), memory = repository.requireArchive(ctx);
        const origin = contextApi.captureTaskOrigin(ctx, memory.archiveRevision);
        updated = await cache.commitSessionMutation(MODE, memory.chatId, origin, mutate, null);
    }
    if (!updated) throw contract.songError('SAVE', '未能确认删除已保存，原作品保留。');
    if (sameView()) { runtimeState.activeSession = updated; renderThemeSongs(); }
    return true;
}
export async function handleThemeSongAction(action, id = '') {
    try {
        const session = assertThemeSongReader();
        if (action === 'view-read' || action === 'view-format') {
            const body = overlay.bodyEl();
            // Retain typed but unsent composer fields during this local layout switch.
            const composer = body.querySelector('.rmt-song-composer');
            const draft = ['subject','language','voice','direction'].map(key => [key, body.querySelector(`[data-rmt-song-${key}]`)?.value]);
            const wasOpen = composer?.open, scrollTop = body.scrollTop;
            displayMode = action === 'view-format' ? 'format' : 'read';
            renderThemeSongs();
            for (const [key, value] of draft) {
                const element = body.querySelector(`[data-rmt-song-${key}]`);
                if (element && typeof value === 'string') element.value = value;
            }
            const nextComposer = body.querySelector('.rmt-song-composer');
            if (nextComposer && typeof wasOpen === 'boolean') nextComposer.open = wasOpen;
            body.scrollTop = scrollTop;
            return;
        }
        if (action === 'select') {
            if (session.songs.some(song => song.id === id)) { session.selectedId = id; renderThemeSongs(); }
            return;
        }
        if (action === 'generate') {
            if (readonly() || busy()) return;
            const body = overlay.bodyEl();
            const subject = body.querySelector('[data-rmt-song-subject]')?.value || 'character';
            const songOptions = { subject: subject.startsWith('event:') ? 'event' : 'character', eventId: subject.startsWith('event:') ? subject.slice(6) : '',
                language: body.querySelector('[data-rmt-song-language]')?.value || 'zh',
                voice: body.querySelector('[data-rmt-song-voice]')?.value || 'char',
                direction: body.querySelector('[data-rmt-song-direction]')?.value || '' };
            const target = runtimeState.activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtimeState.activeArchiveSnapshot) : {};
            return await generation.generateMode(MODE, { ...target, songOptions, background: false });
        }
        if (action === 'delete') return await deleteThemeSong(id);
        const song = session.songs.find(s => s.id === id);
        if (!song) return;
        if (action === 'export') {
            const url = URL.createObjectURL(new Blob([contract.themeSongExport(song)], { type: 'text/plain;charset=utf-8' }));
            const link = document.createElement('a'); link.href = url; link.download = 'Hearttrace-ThemeSong.txt'; link.hidden = true;
            try { document.body.appendChild(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
            return;
        }
        const fields = { 'copy-title':'title', 'copy-style':'style', 'copy-lyrics':'lyrics', 'copy-all':'all' };
        if (!Object.hasOwn(fields, action)) return;
        const content = contract.themeSongExport(song, fields[action]);
        try {
            if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error();
            await globalThis.navigator.clipboard.writeText(content);
            globalThis.toastr?.success?.('已复制。', '角色印象曲');
        } catch {
            // Never fall back to executing markup or sending data. Mobile webviews can select text.
            if (runtimeState.activeSession !== session) return;
            const slot = overlay.bodyEl().querySelector('[data-rmt-song-copy-fallback]');
            if (slot) { const box = document.createElement('textarea'); box.readOnly = true; box.value = content; box.setAttribute('aria-label', '长按选择并复制'); slot.replaceChildren(box); box.focus(); box.select(); }
            globalThis.toastr?.info?.('请在文字框内长按复制。', '角色印象曲');
        }
    } catch (error) { globalThis.toastr?.error?.(text.safeErrorSummary(error), '角色印象曲'); }
}
