// 印象曲 MV 页面：三步开始、镜头清单、对时间、手书剪辑台、视频单镜、拼成 MV。
// 播放由同一音轨驱动画面；可用的音频文件缓存在本机，不写入聊天。
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
import * as overlay from './overlay.js';
import * as ui_workspaceState from './workspaceState.js';
import * as extras_styles from './extrasStyles.js';
import * as mv from '../extras/mv.js';
import * as mv_media from '../extras/mvMedia.js';
import * as music_link from '../extras/mvMusicLink.js';
import * as audio_source from '../extras/mvAudioSource.js';
import * as core_castLooks from '../core/castLooks.js';
import * as archive_repository from '../archive/repository.js';
import * as mv_cast from '../extras/mvCast.js';
import * as mv_direction from '../extras/mvDirection.js';
import * as mv_stage from '../extras/mvStage.js';
import * as stage_canvas from './mvStageCanvas.js';
import * as cast_controls from './mvCastControls.js';
import * as participant_picker from './participantPicker.js';
import * as image_editor from './mvImageEditor.js';
import * as image_editor_ui from './mvImageEditorUi.js';
import * as image_tools from '../extras/mvImageTools.js';
import * as editor_ui from './mvEditorUi.js';
import * as editor_dialog from './mvEditorDialog.js';

const esc = core_text.esc;
export const MV_MODE = 'songMv';
const view = { songId: '', scope: '', epoch: 0, sub: 'board', step: 1, draft: null, mode: 'tegaki', shotId: '', copied: '', selected: '', drawingAll: false, stopAll: false, tapIndex: 0 };
const audioBySong = new Map();
const images = new Map();
const localUrls = new Map();
const loadingLocal = new Map();
const imageImports = new Map();
const audioTried = new Set();
const audioLoads = new Map();
let musicLinkImport = null;
let assetEditor = null;
let editSequence = 0;
let mediaSequence = 0;
// Navigation is local to this opened song, never part of the saved MV/archive.
const navigation = [];
let renderedPage = '';
let imageRefreshTimer = 0;
let imageLayoutPending = false;
let layoutBody = null;
let layoutBodyObserver = null;
let editorDialog = null;

function closeEditorDrawer() {
    const previous = view.editorDrawer;
    editorDialog?.dispose(); editorDialog = null;
    view.editorDrawer = ''; view.clearPendingIds = null; renderMv();
    body()?.querySelector?.(`[data-rmt-mv="editor-drawer"][data-rmt-mv-id="${previous}"]`)?.focus?.({ preventScroll: true });
}

function editorBody(enabled) {
    if (!enabled) { editorDialog?.dispose(); editorDialog = null; }
    const el = body();
    if (layoutBody && (layoutBody !== el || !enabled)) {
        layoutBody.closest?.('.rmt-shell')?.classList?.remove('rmt-mvi-focus');
        layoutBody.classList?.remove('rmt-mve-body');
        layoutBodyObserver?.disconnect(); layoutBodyObserver = null; layoutBody = null;
    }
    el?.classList?.toggle('rmt-mve-body', enabled);
    el?.closest?.('.rmt-shell')?.classList?.toggle('rmt-mvi-focus', enabled && view.sub === 'asset-editor');
    if (!enabled || !el || layoutBody === el) return;
    layoutBody = el;
    if (typeof globalThis.MutationObserver === 'function') {
        // Only direct page replacement is observed, never animation frames,
        // thumbnail loads or brush strokes. Other modules keep their own scroll.
        layoutBodyObserver = new globalThis.MutationObserver(() => {
            if (!el.querySelector('.rmt-mve-layout-scope,[data-rmt-mv-editor-host]')) {
                editorDialog?.dispose(); editorDialog = null;
                el.classList.remove('rmt-mve-body');
                el.closest?.('.rmt-shell')?.classList?.remove('rmt-mvi-focus');
                layoutBodyObserver?.disconnect(); layoutBodyObserver = null; layoutBody = null;
            }
        });
        layoutBodyObserver.observe(el, { childList: true });
    }
}

function queueImageRefresh(layout = false) {
    imageLayoutPending = imageLayoutPending || layout;
    if (imageRefreshTimer) return;
    const opened = viewTarget();
    imageRefreshTimer = setTimeout(() => {
        imageRefreshTimer = 0; const repaint = imageLayoutPending; imageLayoutPending = false;
        if (!isView(opened) || view.sub === 'asset-editor') return;
        if (repaint && view.sub === 'board') renderMv(); else drawNow();
    }, 24);
}

function cacheValue(map, key, value, limit) {
    map.delete(key); map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
    return value;
}

function assetPreviewHtml(image) {
    if (!mv.hasAssetImage(image)) return '';
    const url = assetImageUrl(image);
    return `<img${url ? ` src="${esc(url)}"` : ''}${image.local ? ` data-rmt-mv-local="${esc(image.local)}"` : ''} alt="" loading="lazy" decoding="async">`;
}

function capturePagePosition(assetKey = '') {
    const el = body();
    if (!el) return null;
    const anchors = [...(el.querySelectorAll?.('[data-rmt-mv-anchor]') || [])];
    const top = el.getBoundingClientRect?.().top || 0;
    const anchor = assetKey ? anchors.find(node => node.dataset.rmtMvAnchor === assetKey)
        : anchors.find(node => node.getBoundingClientRect?.().bottom > top);
    return { top: el.scrollTop, left: el.scrollLeft || 0,
        anchor: anchor?.dataset.rmtMvAnchor, offset: anchor?.getBoundingClientRect?.().top - top,
        // Inspection expansion is controlled by view.inspect; never undo its click.
        details: [...(el.querySelectorAll?.('details:not(.rmt-mv-inspect):not(.rmt-mve-group-fold)') || [])].map(node => node.open),
        strips: [...(el.querySelectorAll?.('.rmt-mv-assets, .rmt-mv-strip') || [])].map(node => node.scrollLeft),
        panels: [...(el.querySelectorAll?.('[data-rmt-mv-scroll]') || [])].map(node => ({ key: node.dataset.rmtMvScroll, top: node.scrollTop })) };
}

function restorePagePosition(position) {
    const el = body();
    if (!el || !position) return;
    const details = [...(el.querySelectorAll?.('details:not(.rmt-mv-inspect):not(.rmt-mve-group-fold)') || [])];
    if (details.length === position.details.length) details.forEach((node, i) => { node.open = position.details[i]; });
    [...(el.querySelectorAll?.('.rmt-mv-assets, .rmt-mv-strip') || [])].forEach((node, i) => { node.scrollLeft = position.strips[i] || 0; });
    for (const node of el.querySelectorAll?.('[data-rmt-mv-scroll]') || []) {
        const saved = position.panels?.find(row => row.key === node.dataset.rmtMvScroll);
        if (saved) node.scrollTop = saved.top;
    }
    el.scrollTop = position.top; el.scrollLeft = position.left;
    const anchor = [...(el.querySelectorAll?.('[data-rmt-mv-anchor]') || [])].find(node => node.dataset.rmtMvAnchor === position.anchor);
    if (anchor && Number.isFinite(position.offset) && anchor.getBoundingClientRect) {
        el.scrollTop += anchor.getBoundingClientRect().top - (el.getBoundingClientRect?.().top || 0) - position.offset;
    }
}

function currentPage(assetKey = '') { return { sub: view.sub, shotId: view.shotId, position: capturePagePosition(assetKey) }; }
function restoreParentPage() {
    const parent = navigation.pop() || { sub: 'board', shotId: '' };
    Object.assign(view, { sub: parent.sub, shotId: parent.shotId });
    renderMv(); restorePagePosition(parent.position);
}

// 用户自己的图存在本机；url 来自生图渠道。两者都没有时返回空字符串。
function hasImg(shot) { return mv.hasAssetImage(mv.shotImage(view.cache?.record, shot)); }

function imgUrl(shot, record = view.cache?.record) {
    return assetImageUrl(mv.shotImage(record, shot));
}

function assetImageUrl(image) {
    if (image?.url) return image.url;
    const key = image?.local;
    if (!key) return '';
    if (localUrls.has(key)) return localUrls.get(key);
    if (!loadingLocal.has(key)) {
        const epoch = view.epoch;
        const pending = mv_media.getMedia(key).then(row => {
            if (row?.blob && epoch === view.epoch) {
                const url = URL.createObjectURL(row.blob); localUrls.set(key, url);
                for (const node of body()?.querySelectorAll?.('[data-rmt-mv-local]') || []) if (node.dataset.rmtMvLocal === key) node.src = url;
                queueImageRefresh(view.sub === 'board');
            }
        }).catch(() => {}).finally(() => { if (loadingLocal.get(key) === pending) loadingLocal.delete(key); });
        loadingLocal.set(key, pending);
    }
    return '';
}

async function resolveAssetImage(image) {
    assetImageUrl(image);
    if (image?.local) await loadingLocal.get(image.local);
    return assetImageUrl(image);
}

function closeAssetEditor() {
    assetEditor?.dispose(); assetEditor = null;
    if (view.sub === 'asset-editor') restoreParentPage();
}

async function openAssetEditor(key, autoCutout = false, frameId = '') {
    const opened = viewTarget(), target = frameId ? mv.captureMvTarget(ctx(), view.songId) : mv.captureAssetEdit(view.songId, key);
    const record = target.base.songs[target.songId];
    const frame = frameId ? record.shots.find(s => s.id === frameId) : null;
    if (frameId && !frame) return;
    const found = frame ? { kind: 'frame', image: mv.shotImage(record, frame) } : mv.assetOf(record, key);
    const parent = view.sub === 'asset-editor' ? navigation.at(-1)?.sub : view.sub;
    const selected = record.shots.find(s => s.id === view.selected);
    const inEditor = ['tegaki', 'sync'].includes(parent) && (frameId === selected?.id || (!frameId && key === `${selected?.group}:${selected?.diff}`));
    const rows = inEditor ? mv.shotTimeline(record, currentSong()).rows : [];
    const selectedIndex = rows.findIndex(row => row.shot.id === view.selected);
    const nextId = rows[selectedIndex + 1]?.shot.id;
    stopPlayback(); assetEditor?.dispose(); assetEditor = null;
    const token = ++editSequence;
    if (view.sub !== 'asset-editor') navigation.push(currentPage(key));
    view.sub = 'asset-editor'; page('图片编辑', inEditor ? '剪辑台' : '构图卡片', `<section data-rmt-mv-editor-host><div class="rmt-mvi-loading">${btn('back', '返回')}<p role="status">正在打开素材…</p></div></section>`);
    if (body()) body().scrollTop = 0;
    const image = found.image, original = image?.original || image;
    const [sourceUrl, imageUrl] = await Promise.all([resolveAssetImage(original), resolveAssetImage(image)]);
    if (!isView(opened) || view.sub !== 'asset-editor' || token !== editSequence) return;
    const host = body().querySelector('[data-rmt-mv-editor-host]'); if (!host) return;
    assetEditor = image_editor.mountAssetEditor(host, {
        title: inEditor ? `第 ${selectedIndex + 1} 镜 · 图片编辑` : '素材编辑',
        scopeLabel: frame ? '修改当前镜图片' : inEditor ? '修改共享素材，关联镜头同步更新' : '选格、裁切与修边',
        showPrompt: !frame,
        motif: key === 'motif', autoCutout, autoCharacter: !autoCutout && found.kind === 'char' && found.group.layer !== 'full' && image?.editMode !== 'full',
        multipleCharacters: found.group?.who === 'both' || (found.group?.cast?.length || 0) > 1,
        sourceUrl, imageUrl, image, prompt: frame ? '' : mv.assetPrompt(record, key, ctx()), defaultPrompt: frame ? '' : mv.defaultAssetPrompt(record, key, ctx()),
        onClose: () => { if (isView(opened) && token === editSequence) closeAssetEditor(); },
        onNext: inEditor && nextId ? async () => {
            if (!isView(opened) || token !== editSequence) return;
            const nextRecord = currentRecord(), timeline = mv.shotTimeline(nextRecord, currentSong()).rows;
            const index = timeline.findIndex(row => row.shot.id === nextId), next = timeline[index];
            if (!next) { closeAssetEditor(); return; }
            view.selected = nextId; view.stripStart = Math.floor(index / 12) * 12;
            seekEditor(next.start);
            const nextKey = `${next.shot.group}:${next.shot.diff}`;
            if (!mv.hasAssetImage(next.shot.image) && mv.assetOf(nextRecord, nextKey)) await openAssetEditor(nextKey);
            else await openAssetEditor(`shot:${nextId}`, false, nextId);
        } : undefined,
        onSave: async draft => {
            if (!isView(opened) || token !== editSequence) return false;
            const patch = frame ? {} : { prompt: draft.prompt };
            if (draft.image) {
                if (draft.image.restoreOriginal) {
                    if (!original) return false;
                    patch.image = { ...original, split: 'none', editMode: 'full', at: Date.now() };
                } else {
                    const persist = async (blob, suffix) => {
                        const mediaKey = mv_media.mediaKey('img', target.scope, target.songId, `${key}:${Date.now()}:${++mediaSequence}:${suffix}`);
                        // Do not overwrite the previous blob or commit a reference before its transaction succeeds.
                        if (!await mv_media.putMedia(mediaKey, blob, 'hearttrace-frame.png')) throw core_text.safeUserError('图片未能保存，可先下载 PNG。', 'RMT_MV_SAVE_FAILED');
                        localUrls.set(mediaKey, URL.createObjectURL(blob)); return { local: mediaKey };
                    };
                    const sourceRef = draft.image.sourceBlob ? await persist(draft.image.sourceBlob, 'original') : draft.image.originalRef;
                    const result = await persist(draft.image.blob, 'edited');
                    patch.image = { ...result, original: sourceRef, crop: draft.image.crop, editMode: draft.image.mode, split: 'none', at: Date.now() };
                }
            }
            // Shot replacements use the existing frame journal. The shared
            // material and its editable prompt remain available in the library.
            const result = frame ? (patch.image ? await mv.saveFrameImage(target, frameId, patch.image) : null) : await mv.saveAssetEdit(target, patch);
            reportResult(result, '素材修改已保存。');
            return !result?.pending;
        },
    });
}

function audioKey(target = view) { return mv_media.mediaKey('audio', target.scope, target.songId); }
function viewTarget() { return { scope: view.scope, songId: view.songId, epoch: view.epoch }; }
function isView(target = viewTarget()) {
    const context = ctx();
    return runtimeState.activeMode === MV_MODE && !runtimeState.activeArchiveSnapshot && !!context
        && mv.mvScope(context) === target.scope && view.scope === target.scope
        && view.songId === target.songId && view.epoch === target.epoch;
}

function restoreAudio() {
    const context = ctx();
    if (!context || audioBySong.has(audioKey())) return;
    // 恢复歌曲只是顺手的便利；读不到时静默跳过，绝不能让整页打不开。
    let target;
    try { target = mv.captureMvTarget(context, view.songId); } catch { return; }
    const key = audioKey(target);
    if (audioTried.has(key)) return;
    audioTried.add(key);
    const token = {}, opened = viewTarget();
    audioLoads.set(key, token);
    void mv_media.getMedia(key).then(row => {
        if ((row?.blob || row?.mediaUrl) && audioLoads.get(key) === token) {
            if (audio_source.isVideoAudioSource(row.blob, row.name) && !isView(opened)) {
                audioTried.delete(key); audioLoads.delete(key); return;
            }
            return acceptAudio(row.blob || row.mediaUrl, row.name || '已保存的歌曲', false, target, token, { sourceUrl: row.sourceUrl || '', mediaUrl: row.mediaUrl || '' });
        }
    }).catch(() => audioTried.delete(key));
}

function acceptAudio(blob, name, persist, target = mv.captureMvTarget(ctx(), view.songId), token = {}, details = {}) {
    const key = audioKey(target);
    const opened = viewTarget();
    if (isView(opened) && audioKey() === key) view.audioStatus = '';
    if (audioLoads.get(key) !== token) audioLoads.get(key)?.cancel?.();
    audioLoads.set(key, token);
    const streaming = typeof blob === 'string';
    const fromVideo = !streaming && audio_source.isVideoAudioSource(blob, name);
    const sourceController = fromVideo ? new AbortController() : null;
    token.videoSource = fromVideo;
    const url = streaming ? music_link.musicUrl(blob) : URL.createObjectURL(blob);
    const probe = new Audio(); probe.preload = fromVideo ? 'auto' : 'metadata';
    return new Promise(resolve => {
        let settled = false;
        const finish = (ok, error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            sourceController?.abort();
            token.signal?.removeEventListener('abort', cancel);
            delete token.cancel;
            probe.onloadedmetadata = null; probe.onloadeddata = null; probe.oncanplay = null; probe.onerror = null;
            try { probe.removeAttribute?.('src'); probe.load?.(); } catch {}
            if (!ok) {
                URL.revokeObjectURL(url);
                // Failed automatic restore gets one attempt per open, otherwise
                // its error redraw would restore the same bad recording forever.
                if (audioLoads.get(key) === token && !(fromVideo && !persist && error)) audioTried.delete(key);
                if (error && isView(opened) && audioLoads.get(key) === token) toastError(error);
            }
            if (fromVideo && isView(opened) && audioLoads.get(key) === token) {
                view.audioStatus = '';
                if (!ok && error) renderMv();
            }
            resolve(ok);
        };
        const cancel = () => finish(false);
        token.cancel = cancel;
        const timer = details.sourceUrl || fromVideo ? setTimeout(() => finish(false, core_text.safeUserError('音频读取超时，原有歌曲未替换。', 'RMT_MV_AUDIO_TIMEOUT')), 30000) : 0;
        token.signal?.addEventListener('abort', cancel, { once: true });
        const ready = () => {
            if (settled || audioLoads.get(key) !== token || token.signal?.aborted || ((details.sourceUrl || fromVideo) && !isView(opened))) { finish(false); return; }
            // A video container must have a real audio track (checked below)
            // and decoded media data, not merely a readable duration header.
            if (fromVideo && probe.readyState < 2) return;
            const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
            if ((details.sourceUrl || fromVideo) && duration <= 0) { finish(false, core_text.safeUserError('这段音频无法取得完整时长，原有歌曲未替换。', 'RMT_MV_AUDIO')); return; }
            try {
                const updated = mv.patchRecord(target.songId, { duration }, target);
                if ((details.sourceUrl || fromVideo) && !updated) { finish(false, core_text.safeUserError('当前歌曲已变化，音频未替换。', 'RMT_MV_AUDIO')); return; }
            }
            catch (error) { finish(false, error); return; }
            const old = audioBySong.get(key);
            if (isView(opened) && audioKey() === key) { stopPlayback(); player.audio = null; }
            audioBySong.set(key, { url, name: core_text.normalizeText(name, 80), duration, target, sourceUrl: details.sourceUrl || '', streaming, fromVideo });
            if (old) { try { URL.revokeObjectURL(old.url); } catch {} }
            if (persist) void mv_media.putMedia(key, streaming ? null : blob, name, { ...details, ...(streaming ? { mediaUrl: url } : {}) }).then(ok => { if (!ok && isView(opened)) globalThis.toastr?.info?.('这台设备没能记住这首歌，下次打开需要重新选择。', '心迹回廊 · MV'); });
            finish(true);
            if (isView(opened) && audioKey() === key) renderMv();
        };
        probe.onloadedmetadata = ready;
        if (fromVideo) { probe.onloadeddata = ready; probe.oncanplay = ready; }
        probe.onerror = () => finish(false, core_text.safeUserError('这段音频没法播放，原有歌曲未替换。', 'RMT_MV_AUDIO'));
        if (token.signal?.aborted) cancel();
        else if (fromVideo) {
            audioTried.add(key);
            if (isView(opened) && audioKey() === key) { view.audioStatus = '正在检查视频音轨…'; renderMv(); }
            void audio_source.inspectVideoAudioSource(blob, { signal: sourceController.signal }).then(() => {
                if (settled || audioLoads.get(key) !== token || !isView(opened)) { finish(false); return; }
                probe.src = url;
            }).catch(error => {
                if (!settled) finish(false, error?.code?.startsWith('RMT_MV_VIDEO_') ? error : core_text.safeUserError('这个视频无法读取音轨，原有歌曲未替换。', 'RMT_MV_VIDEO_AUDIO'));
            });
        } else probe.src = url;
    });
}

function cancelMusicLink() {
    const pending = musicLinkImport;
    musicLinkImport = null;
    pending?.controller.abort();
    if (pending && audioLoads.get(pending.key) === pending.token) audioLoads.delete(pending.key);
    if (pending && !audioBySong.has(pending.key)) audioTried.delete(pending.key);
    view.musicLinkStatus = '';
}

async function importMusicLink(value) {
    const opened = viewTarget();
    if (!isView(opened) || player.exporting) return;
    let sourceUrl;
    try { sourceUrl = music_link.musicUrl(value); }
    catch (error) { view.musicLinkStatus = error.message; renderMv(); return; }
    cancelMusicLink();
    const target = mv.captureMvTarget(ctx(), opened.songId), key = audioKey(target);
    const controller = new AbortController(), token = { signal: controller.signal };
    audioLoads.get(key)?.cancel?.();
    audioLoads.set(key, token); audioTried.add(key);
    const pending = musicLinkImport = { key, controller, token };
    view.musicLinkInput = sourceUrl; view.musicLinkStatus = '正在读取音乐…';
    renderMv();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    try {
        const media = await music_link.readMusicLink(sourceUrl, { signal: controller.signal });
        if (musicLinkImport !== pending || !isView(opened) || controller.signal.aborted) return;
        view.musicLinkStatus = '正在检查音频…'; renderMv();
        const ok = await acceptAudio(media.blob || media.url, media.name, true, target, token, { sourceUrl: media.sourceUrl });
        if (musicLinkImport === pending && isView(opened)) view.musicLinkStatus = ok ? (media.streaming ? '已接入在线音轨，与画面共用播放进度。' : '已导入，与画面共用播放进度。') : '音频未能导入，原有歌曲未替换。';
    } catch (error) {
        if (musicLinkImport === pending && isView(opened)) view.musicLinkStatus = timedOut ? '音乐读取超时，原有歌曲未替换。' : controller.signal.aborted ? '' : /^RMT_MV_LINK_/.test(error?.code || '') ? String(error.message) : '音乐读取失败，原有歌曲未替换。';
    } finally {
        clearTimeout(timer);
        if (musicLinkImport === pending) {
            musicLinkImport = null;
            if (!audioBySong.has(key)) audioTried.delete(key);
            if (timedOut && isView(opened)) view.musicLinkStatus = '音乐读取超时，原有歌曲未替换。';
            if (isView(opened)) renderMv();
        }
    }
}

async function removeMusic() {
    const opened = viewTarget(), key = audioKey(), entry = audioBySong.get(key);
    if (!entry || !isView(opened) || player.exporting || audioLoads.get(key)?.removing) return;
    cancelMusicLink(); audioLoads.get(key)?.cancel?.();
    const token = { removing: true };
    audioLoads.set(key, token); audioTried.add(key);
    view.audioStatus = '正在移除音源…'; renderMv();
    try {
        if (!await mv_media.deleteMedia(key)) throw core_text.safeUserError('音源未能移除，原有音源保留。', 'RMT_MV_AUDIO_REMOVE');
        // A newer import or another song must not be cleared by this completion.
        if (audioLoads.get(key) !== token || audioBySong.get(key) !== entry) return;
        if (isView(opened)) {
            const time = currentTime(); stopPlayback();
            try { player.audio?.removeAttribute?.('src'); player.audio?.load?.(); } catch {}
            player.audio = null; player.clockOffset = time;
            view.musicLinkInput = ''; view.musicLinkStatus = '';
        }
        audioBySong.delete(key); URL.revokeObjectURL(entry.url);
    } catch (error) {
        if (isView(opened) && audioLoads.get(key) === token) toastError(error);
    } finally {
        if (audioLoads.get(key) === token) {
            audioLoads.delete(key);
            if (isView(opened)) { view.audioStatus = ''; renderMv(); }
        }
    }
}

function uploadLabel(shotId, label = '换用自己的图') {
    const record = view.cache?.record, shot = record?.shots?.find(s => s.id === shotId);
    return `<label class="rmt-x-secondary rmt-mv-upload">${label}<input type="file" accept="image/*" data-rmt-mv-image data-rmt-mv-id="${esc(shotId)}"></label>`
        + (mv.isV2(record) && mv.hasAssetImage(shot?.image) ? btn('use-group-image', '恢复构图素材', { id: shotId }) : '');
}

function looksEditor() {
    const context = ctx();
    const looks = context ? core_castLooks.readCastLooks(context) : null;
    const value = side => looks ? (looks.manual ? looks[side] : core_castLooks.lookFromDescription(looks[side])) : '';
    return `<details class="rmt-x-card"><summary><b>外貌设定</b>（和 CG 共用）</summary>
      <label class="rmt-mv-look"><span>他的外貌</span><textarea data-rmt-mv-look="char" rows="3" maxlength="600" placeholder="例如：黑色短发、灰蓝色眼睛、身形清瘦">${esc(value('char') || '')}</textarea></label>
      <label class="rmt-mv-look"><span>你的外貌</span><textarea data-rmt-mv-look="user" rows="3" maxlength="600" placeholder="例如：栗色长发、圆眼睛、个子不高">${esc(value('user') || '')}</textarea></label>
      ${btn('save-looks', '保存外貌', { cls: 'rmt-x-primary rmt-x-dark' })}<p class="rmt-x-note">只写稳定的长相（发色、发型、眼睛、体型），衣服和动作由每一镜决定。</p></details>`;
}
const player = { playing: false, raf: 0, audio: null, clockStart: 0, clockOffset: 0, exporting: null };
const STYLE_ID = 'heartbeat_memories_mv_styles';

function ctx() { try { return core_context.currentCharacterGuard(); } catch { return null; } }
function body() { return overlay.bodyEl(); }
function toastError(error) { if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊 · MV'); }
function toastOk(text) { globalThis.toastr?.success?.(text, '心迹回廊 · MV'); }

function ensureStyles() {
    extras_styles.ensureExtrasStyles();
    if (document.getElementById(STYLE_ID)) return;
    const r = '#' + core_constants.OVERLAY_ID;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
${r} .rmt-mv-steps{display:flex;gap:6px}
${r} .rmt-mv-steps span{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;height:40px;border-radius:999px;font-size:12px;border:1px solid var(--rmt-theme-border,#cfdae5);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-steps span.on{--rmt-content-ink:var(--rmt-theme-wash-ink,#34495d);background:var(--rmt-theme-wash,#fbf0f5);color:var(--rmt-content-ink);border-color:var(--rmt-theme-accent-ink,#a8527a)}
${r} .rmt-mv-steps span.done{background:var(--rmt-theme-soft,#e2f0ee)}
${r} .rmt-mv-choice{display:flex;gap:12px;align-items:center;padding:12px 14px;min-height:56px;border-radius:14px;cursor:pointer;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5);color:var(--rmt-theme-text,#34495d);text-align:left;width:100%}
${r} .rmt-mv-choice.on{border:2px solid var(--rmt-theme-accent-ink,#a8527a);background:var(--rmt-theme-wash,#fbf0f5)}
${r} .rmt-mv-choice span{display:flex;flex-direction:column;gap:3px;flex:1}
${r} .rmt-mv-choice b{font-size:15px}
${r} .rmt-mv-choice small{font-size:12px;line-height:1.5;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-choice em{font-style:normal;font-size:12px;font-weight:600;color:#2f6b66}
${r} .rmt-mv-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
${r} .rmt-mv-group{display:flex;flex-direction:column;gap:2px;padding:10px 4px 0}
${r} .rmt-mv-group b{font-size:14px;color:#8a3f63}
${r} .rmt-mv-group span{font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-link{font-size:12px;color:#8a5a3b;padding:0 8px}
${r} .rmt-mv-look input,${r} .rmt-mv-look select{width:100%;min-width:0;box-sizing:border-box;min-height:44px;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:10px;padding:0 10px;font:inherit;font-size:14px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-cast-person{padding:10px 0;border-top:1px dashed var(--rmt-theme-border,#cfdae5);overflow-wrap:anywhere;min-width:0}
${r} .rmt-mv-cast-person>small{display:block}
${r} [data-rmt-mv-binding-person]>label:first-child{display:flex;align-items:center;gap:8px;min-height:44px}
${r} [data-rmt-mv-binding="selected"]{width:20px;height:20px;flex-shrink:0}
${r} .rmt-mv-gcard{display:flex;flex-direction:column;gap:10px;border-radius:18px;padding:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-gname{color:#8a3f63}
${r} .rmt-mv-assets{display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:2px}
${r} .rmt-mv-assets>div{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
${r} .rmt-mv-assets small{font-size:11px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-plus{font-size:18px;color:#b7c3cf;padding-bottom:28px}
${r} .rmt-mv-asset{position:relative;box-sizing:border-box;flex-shrink:0;width:62px;height:auto;min-width:0;min-height:0;max-height:none;aspect-ratio:9/16;border-radius:10px;overflow:hidden;padding:0;cursor:pointer;border:1px solid var(--rmt-theme-border,#cfdae5);background:repeating-linear-gradient(135deg,#e6e9f0 0 6px,#f2f4f8 6px 12px)}
${r} .rmt-mv-asset.wide{box-sizing:border-box;flex-shrink:0;width:160px;height:auto;min-width:0;min-height:0;max-height:none;aspect-ratio:16/9;padding:0}
${r} .rmt-mv-background-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin-top:10px}
${r} .rmt-mv-background-tile{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;align-items:start;min-width:0}
${r} .rmt-mv-background-tile .rmt-mv-assets{overflow:visible}
${r} .rmt-mv-background-tile .rmt-mv-asset.wide{width:110px}
${r} .rmt-mv-background-tile .rmt-mv-actions{margin:0;gap:6px}
${r} .rmt-mv-background-tile .rmt-mv-actions button{padding:6px 9px;min-height:36px;font-size:12px}
${r} .rmt-mv-background-tile>details{grid-column:1/-1;min-width:0;font-size:12px}
${r} .rmt-mv-background-tile>details[open]{padding-top:6px}
${r} .rmt-mv-asset.cut.done{background:repeating-conic-gradient(#dce0e6 0 25%,#ffffff 0 50%) 0 0/12px 12px!important}
${r} .rmt-mv-asset-actions{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:160px}
${r} .rmt-mv-asset-actions .rmt-btn{padding:6px 8px;font-size:12px;min-height:40px}
${r} .rmt-mv-asset img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
${r} .rmt-mv-asset.wide img{display:block;min-width:0;min-height:0;max-width:none;max-height:none;margin:0;padding:0;object-fit:cover;object-position:center}
${r} .rmt-mv-asset i{position:absolute;left:4px;top:4px;font-style:normal;font-size:10px;border-radius:4px;padding:1px 5px;background:#ecebf1;color:#5d5566}
${r} .rmt-mv-asset.done i{background:#e2f0ee;color:#2f6b66}
${r} .rmt-mv-palette{display:flex;gap:12px;align-items:center;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:16px;padding:12px 14px}
${r} .rmt-mv-cover{width:52px;height:52px;border-radius:10px;overflow:hidden;flex-shrink:0;background:linear-gradient(150deg,#2f3a45,#7d8fa3)}
${r} .rmt-mv-cover img{width:100%;height:100%;object-fit:cover}
${r} .rmt-mv-palette>div{display:flex;flex-direction:column;gap:6px;flex:1}
${r} .rmt-mv-palette>div span{display:flex;gap:6px}
${r} .rmt-mv-palette>div i{width:22px;height:22px;border-radius:6px;display:block}
${r} .rmt-mv-palette>small{font-size:12px;color:var(--rmt-theme-muted,#586b7c);text-align:right}
${r} .rmt-mv-split{margin-top:4px;min-height:32px;max-width:92px;font-size:11px;border-radius:8px;border:1px solid var(--rmt-theme-border,#cfdae5);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-inspect summary{cursor:pointer;font-size:13px;font-weight:600;padding:6px 0}
${r} .rmt-mv-inspect-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px dashed var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-inspect-row figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:2px}
${r} .rmt-mv-inspect-row img{width:72px;height:auto;aspect-ratio:9/16;object-fit:contain;border-radius:8px;background:#e9edf2}
${r} .rmt-mv-inspect-row.wide{flex-wrap:wrap}
${r} .rmt-mv-inspect-row.wide img{width:110px;height:auto;aspect-ratio:16/9}
${r} .rmt-mv-inspect-row.wide figure.cut img{object-fit:cover}
${r} .rmt-mv-inspect-row figure.cut img{background:repeating-conic-gradient(#e6e9f0 0 25%,#fff 0 50%) 0 0/10px 10px}
${r} .rmt-mv-inspect-row figcaption{font-size:10px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-inspect-row>div{display:flex;flex-direction:column;gap:3px;font-size:12px;min-width:0}
${r} .rmt-mv-inspect-row small{font-size:11px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-range-selects{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
${r} .rmt-mv-range-selects label{display:flex;flex-direction:column;gap:4px;font-size:12px}
${r} .rmt-mv-range-selects select{min-height:40px;border-radius:10px;border:1px solid var(--rmt-theme-border,#cfdae5);padding:0 8px;font:inherit;font-size:13px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
${r} .rmt-mv-toggle{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;background:var(--rmt-theme-soft,#e9e7f2);border-radius:14px}
${r} .rmt-mv-toggle button{height:40px;border-radius:10px;border:0;font-size:14px;font-weight:600;cursor:pointer;background:transparent;color:#586b7c}
${r} .rmt-mv-toggle button.on{background:#fff;color:#34495d}
${r} .rmt-mv-lyric{--rmt-content-ink:var(--rmt-paper-letter-ink,#6b5a44);padding:12px 14px;background:var(--rmt-paper-letter,#fffaf2);border:1px solid var(--rmt-theme-border,#ecdcc3);border-radius:14px;display:flex;flex-direction:column;gap:4px;color:var(--rmt-content-ink)}
${r} .rmt-mv-lyric small{font-size:11px;letter-spacing:2px;color:var(--rmt-content-ink)}
${r} .rmt-mv-lyric p{margin:0;font-size:14px;line-height:1.8;white-space:pre-line}
${r} .rmt-mv-shot{display:flex;flex-direction:column;gap:12px;border-radius:16px;padding:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-shot.done{border-color:#b9dcd6}
${r} .rmt-mv-shot-row{display:flex;gap:12px}
${r} .rmt-mv-thumb{width:64px;height:auto;aspect-ratio:9/16;flex-shrink:0;align-self:flex-start;border-radius:10px;overflow:hidden;background:repeating-linear-gradient(135deg,#e6e9f0 0 6px,#f2f4f8 6px 12px);display:flex;align-items:flex-end;justify-content:flex-start;position:relative}
${r} .rmt-mv-thumb.wide{width:114px;aspect-ratio:16/9}
${r} .rmt-mv-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${r} .rmt-mv-thumb i{position:relative;font-style:normal;font-size:10px;color:#f3eee6;background:rgba(29,27,38,.7);border-radius:4px;padding:2px 5px;margin:4px}
${r} .rmt-mv-shot-copy{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
${r} .rmt-mv-shot-copy small{font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-shot-copy b{font-size:15px;line-height:1.7}
${r} .rmt-mv-actions{display:flex;gap:8px}
${r} .rmt-mv-actions>*{flex:1}
${r} .rmt-mv-canvas-wrap{align-self:center;max-width:100%;border-radius:16px;overflow:hidden;background:#fbf6ee;line-height:0}
${r} .rmt-mv-canvas-wrap canvas{width:100%;height:auto;display:block}
${r} .rmt-mv-bar{display:flex;align-items:center;gap:12px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:16px;padding:10px 14px}
${r} .rmt-mv-play{width:44px;height:44px;border-radius:50%;border:0;background:#a8527a;color:#fff;cursor:pointer;flex-shrink:0;font-size:16px}
${r} .rmt-mv-track{flex:1;display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-track>div{height:6px;border-radius:999px;background:#efe6ee;overflow:hidden}
${r} .rmt-mv-track>div i{display:block;height:100%;background:#ce729c;width:0}
${r} .rmt-mv-strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
${r} .rmt-mv-strip button{height:86px;flex-shrink:0;border-radius:10px;cursor:pointer;border:1px solid var(--rmt-theme-border,#cfdae5);padding:0;overflow:hidden;position:relative;background:repeating-linear-gradient(135deg,#e6e9f0 0 6px,#f2f4f8 6px 12px)}
${r} .rmt-mv-strip button.on{border:2px solid #a8527a}
${r} .rmt-mv-strip img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${r} .rmt-mv-strip span{--rmt-content-ink:#34495d;position:absolute;left:4px;top:4px;font-size:10px;background:#fff;color:var(--rmt-content-ink);border-radius:4px;padding:1px 4px}
${r} .rmt-mv-tap{width:100%;height:110px;border:0;border-radius:20px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#fff;background:#a8527a}
${r} .rmt-mv-tap.done{background:#2f6b66}
${r}[data-rmt-theme-mode] button.rmt-mv-tap.rmt-mv-tap{--rmt-content-ink:var(--rmt-theme-wash-ink);background:var(--rmt-theme-wash)!important;color:var(--rmt-content-ink)!important;border:2px solid var(--rmt-theme-accent-ink)!important}
${r} .rmt-mv-tap small{font-size:13px;opacity:.85}
${r} .rmt-mv-tap b{font-size:22px}
${r} .rmt-mv-clock{font-size:34px;font-weight:700}
${r} .rmt-mv-sec{display:flex;align-items:center;gap:8px;padding:0 8px 0 0;border-radius:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-sec.cur{border:2px solid var(--rmt-theme-accent-ink,#a8527a)}
${r} .rmt-mv-section-pick{display:flex;align-items:center;gap:12px;padding:10px 12px;border:0;border-radius:12px;flex:1;min-width:0;text-align:left;cursor:pointer;font:inherit;color:var(--rmt-theme-text,#34495d);background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mv-section-pick>i{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-style:normal;background:#fbf0f5;color:#a8527a}
${r} .rmt-mv-sec.tapped .rmt-mv-section-pick>i{background:#ce729c;color:#fff}
${r} .rmt-mv-section-copy{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${r} .rmt-mv-section-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-section-pick>em{font-style:normal;font-size:15px;font-weight:700;color:var(--rmt-theme-muted,#8b95a3);text-align:right;flex-shrink:0}
${r} .rmt-mv-sec.tapped .rmt-mv-section-pick>em{color:var(--rmt-theme-accent-ink,#a8527a)}
${r} .rmt-mv-sec>span{display:flex;flex-direction:column;gap:4px}
${r} .rmt-mv-sec>span button{width:40px;height:30px;border:1px solid var(--rmt-theme-border,#cfdae5);background:#fff;border-radius:8px;font-size:12px;cursor:pointer;color:#34495d}
${r} .rmt-mv-prompt{padding:12px;background:var(--rmt-theme-soft,#f5f4fb);border-radius:12px;font-size:14px;line-height:1.75;white-space:pre-wrap;word-break:break-word;color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-step{display:flex;flex-direction:column;gap:12px;border-radius:16px;padding:16px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-step.on{border:2px solid #a8527a}
${r} .rmt-mv-step.done{border-color:#b9dcd6}
${r} .rmt-mv-step header{display:flex;align-items:center;gap:10px}
${r} .rmt-mv-step header i{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;font-style:normal;background:#fbf0f5;color:#a8527a}
${r} .rmt-mv-step.done header i{background:#2f6b66;color:#fff}
${r} .rmt-mv-step ol{margin:0;padding-left:20px;font-size:14px;line-height:1.9}
${r} .rmt-mv-dots{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
${r} .rmt-mv-dots span{height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:var(--rmt-theme-soft,#f5f4fb);color:var(--rmt-theme-muted,#8b95a3);border:1px dashed var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-dots span.ok{--rmt-content-ink:var(--rmt-theme-wash-ink,#2f6b66);background:var(--rmt-theme-wash,#e2f0ee);color:var(--rmt-content-ink);border-style:solid;border-color:var(--rmt-theme-accent-ink,#2f6b66)}
${r} .rmt-mv-warn{--rmt-content-ink:var(--rmt-paper-note-ink,#7a5530);display:flex;flex-direction:column;gap:6px;padding:12px 14px;background:var(--rmt-paper-note,#fff6ec);border:1px solid var(--rmt-theme-border,#f0d9bd);border-radius:12px;font-size:13px;line-height:1.7;color:var(--rmt-content-ink)}
${r} .rmt-mv-info{--rmt-content-ink:var(--rmt-theme-wash-ink,#2f5f5b);padding:12px 14px;background:var(--rmt-theme-wash,#eef5f4);border-radius:12px;font-size:12px;line-height:1.7;color:var(--rmt-content-ink)}
${r} .rmt-mv-file{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--rmt-theme-soft,#f5f4fb);border-radius:12px}
${r} .rmt-mv-file div{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${r} .rmt-mv-file small{font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-file label{min-height:36px;padding:0 12px;border:1px solid var(--rmt-theme-border,#cfdae5);background:var(--rmt-theme-surface-solid,#fff);border-radius:10px;font-size:13px;display:flex;align-items:center;cursor:pointer;color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-file input,${r} .rmt-mv-upload input{position:absolute;width:1px;height:1px;opacity:0}
${r} .rmt-mv-music-link{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
${r} .rmt-mv-music-link label{flex:1 1 100%;font-size:13px}
${r} .rmt-mv-music-link input{flex:1 1 180px;min-width:0;width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:10px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d);font:inherit;font-size:16px}
${r} .rmt-mv-music-link button{flex:0 0 auto;min-height:44px}
${r} .rmt-mv-music-link .rmt-x-note{flex:1 1 100%;margin:0;overflow-wrap:anywhere}
${r} .rmt-mv-upload{position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer}
${r} .rmt-mv-edit-open{font:inherit;font-size:12px;min-height:44px;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:8px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d);padding:4px 8px}
${r} .rmt-mv-editor{min-width:0;overflow:hidden;color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-editor [hidden]{display:none!important}
${r} .rmt-mv-editor label{display:flex;flex-direction:column;gap:6px;margin:8px 0;min-width:0}
${r} .rmt-mv-editor textarea,${r} .rmt-mv-editor select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:8px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d);font:inherit}
${r} .rmt-mv-editor-tools{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}
${r} .rmt-mv-editor-tools button,${r} .rmt-mv-editor-upload{font:inherit;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--rmt-theme-border,#cfdae5);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d);cursor:pointer;box-sizing:border-box}
${r} .rmt-mv-editor-tools button[aria-pressed="true"]{border:2px solid var(--rmt-theme-accent-ink,#a8527a)}
${r} .rmt-mv-editor-upload{position:relative;justify-content:center}
${r} .rmt-mv-editor-upload input{position:absolute;width:1px;height:1px;opacity:0}
${r} .rmt-mv-editor-viewport{overflow:auto;max-height:60vh;min-height:80px;max-width:100%;background:repeating-conic-gradient(#b7bec7 0 25%,#fff 0 50%) 0 0/16px 16px}
${r} [data-editor-canvas]{display:block;height:auto;touch-action:none}
${r} .rmt-mv-look{display:flex;flex-direction:column;gap:6px;font-size:13px;margin-top:10px}
${r} .rmt-mv-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;cursor:pointer}
${r} .rmt-mv-check input[type="checkbox"]{width:18px;height:18px;min-height:18px;flex:0 0 18px;margin:0}
${r} .rmt-mv-look textarea{width:100%;box-sizing:border-box;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:10px;padding:8px 10px;font:inherit;font-size:14px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
.rmt-mv-rec{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;align-items:center;justify-content:center}
.rmt-mv-rec canvas{max-width:100vw;max-height:100vh;width:auto;height:auto}
.rmt-mv-rec b{position:absolute;color:#fff;font-size:72px;font-family:sans-serif}
.rmt-mv-rec button{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;min-height:44px;padding:0 16px;border-radius:12px;border:0;background:rgba(255,255,255,.9);color:#000;font-size:15px}
${editor_ui.editorCss(r)}
${image_editor_ui.imageEditorCss(r)}
`;
    document.head.appendChild(style);
}

// ---------- 打开与导航 ----------

export function openMv(options = {}) {
    const context = ctx();
    if (!context || runtimeState.activeArchiveSnapshot) { toastError(core_text.safeUserError('MV 只在当前聊天里制作。', 'RMT_MV_SCOPE')); return false; }
    ui_workspaceState.leaveWorkspaceReader();
    ui_workspaceState.workspace.route = MV_MODE; ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.empty = null;
    runtimeState.activeMode = MV_MODE; runtimeState.activeSession = null;
    const songId = core_text.normalizeText(options.songId, 120) || view.songId;
    disposeMv();
    view.songId = songId; view.scope = mv.mvScope(context);
    view.musicLinkInput = null; view.musicLinkStatus = ''; view.audioStatus = '';
    view.clearPendingIds = null;
    const record = mv.readMv(context, view.songId);
    view.castDraft = mv_cast.initialMvCast(context, record);
    const ready = record?.shots?.length && mv.normalizeSettings(record.settings).output === 'tegaki' && record.shots.some(s => mv.hasAssetImage(mv.shotImage(record, s)));
    view.sub = record?.shots?.length ? options.page === 'board' || !ready ? 'board' : 'tegaki' : 'setup';
    view.editorTab = 'shots'; view.editorDrawer = ''; view.previewOnly = false; view.editorTiming = { kind: 'line', key: '' }; view.editorSection = null; view.editorUndo = []; view.editorAutoNext = true; view.stripStart = 0; view.editorPlayhead = ''; view.inspect = ''; view.groupOpen = '';
    view.step = 1; view.draft = mv.normalizeSettings(record?.settings); view.mode = view.draft.output; view.shotId = ''; view.copied = ''; view.tapIndex = -1; view.tapUndo = [];
    overlay.openOverlay();
    renderMv();
    const el = body(); if (el) el.scrollTop = 0;
    return true;
}

export function navigateMvBack() {
    if (runtimeState.activeMode !== MV_MODE) return false;
    if (view.editorDrawer) { closeEditorDrawer(); return true; }
    stopExport();
    stopPlayback();
    if (view.sub === 'asset-editor') { closeAssetEditor(); return true; }
    const record = currentRecord();
    if (view.sub === 'setup' && view.step > 1) { view.step -= 1; renderMv(); return true; }
    if (navigation.length) { restoreParentPage(); return true; }
    if (['shot', 'sync', 'tegaki', 'finish'].includes(view.sub) || (view.sub === 'setup' && record?.shots?.length)) {
        view.sub = view.sub === 'sync' ? 'tegaki' : 'board'; renderMv(); return true;
    }
    editorBody(false);
    void overlay.openCachedOrGenerate(core_constants.MODE.THEME_SONG, { workspaceRoute: 'themeSong' });
    return true;
}

function go(sub, extra = {}) {
    if (sub !== 'tegaki' && sub !== 'sync') stopPlayback();
    let position;
    if (sub === 'board') {
        position = navigation.find(entry => entry.sub === 'board')?.position;
        navigation.length = 0; // A successful first generation is not a child of its wizard.
    } else if (sub !== view.sub) {
        const existing = navigation.findIndex(entry => entry.sub === sub);
        if (existing >= 0) position = navigation.splice(existing)[0].position;
        else navigation.push(currentPage());
    }
    Object.assign(view, { sub }, extra);
    renderMv();
    const el = body(); if (el) el.scrollTop = 0;
    restorePagePosition(position);
}

function currentRecord() { const c = ctx(); return c ? mv.readMv(c, view.songId) : null; }
function currentSong() { const c = ctx(); return c ? mv.loadSong(c, view.songId).song : null; }

// ---------- 渲染 ----------

export function renderMv() {
    const previous = view.sub;
    const position = renderedPage === previous && previous !== 'asset-editor' ? capturePagePosition() : null;
    try { renderMvUnsafe(); if (isView() && view.sub === previous) restorePagePosition(position); }
    catch (error) {
        console.error('[HeartbeatMemories] MV page failed', error);
        editorBody(false);
        try {
            overlay.topTitle('做成 MV'); overlay.setBackVisible(true, '印象曲');
            const el = body();
            if (el) el.innerHTML = `<main class="rmt-x-page"><header class="rmt-x-head"><h2>这一页没能打开</h2><p>${esc(core_text.safeErrorSummary(error))}</p><p class="rmt-x-note">${esc(String(error?.message || error).slice(0, 300))}</p></header></main>`;
        } catch {}
        toastError(error);
    }
}

function renderMvUnsafe() {
    if (!isView()) { disposeMv(); return; }
    if (view.sub === 'asset-editor') return; // Image loads and background jobs must not erase an unsaved draft.
    ensureStyles();
    overlay.setManageVisible(false); overlay.setRegenerateVisible(false);
    let song;
    try { song = currentSong(); }
    catch (error) {
        editorBody(false);
        overlay.topTitle('做成 MV'); overlay.setBackVisible(true, '印象曲');
        body().innerHTML = `<main class="rmt-x-page">${recoveryPanel()}<header class="rmt-x-head"><h2>做成 MV</h2><p>${esc(core_text.safeErrorSummary(error))}</p></header></main>`;
        return;
    }
    const record = currentRecord();
    view.cache = { record, song };
    const cachedAudio = audioBySong.get(audioKey());
    if (cachedAudio && record && record.duration !== cachedAudio.duration) {
        try { const saved = mv.patchRecord(view.songId, { duration: cachedAudio.duration }, cachedAudio.target); if (saved) record.duration = cachedAudio.duration; } catch {}
    }
    restoreAudio();
    if (!record?.shots?.length && view.sub !== 'setup') view.sub = 'setup';
    const pages = { setup: renderSetup, board: renderBoard, shot: renderShot, sync: renderSync, tegaki: renderTegaki, finish: renderFinish };
    (pages[view.sub] || renderBoard)(song, record);
    if (view.sub === 'tegaki' || view.sub === 'sync') { drawNow(); ensureLoop(); }
}

function page(title, back, html) {
    editorDialog?.dispose(); editorDialog = null;
    if (navigation.at(-1)?.sub === 'shot') back = '镜头详情';
    if (view.sub === 'setup' && view.step > 1) back = '上一步';
    overlay.topTitle(title); overlay.setBackVisible(true, back);
    const editor = view.sub === 'tegaki' || view.sub === 'sync';
    const imageEditor = view.sub === 'asset-editor';
    const returnButton = view.sub !== 'board' && !editor && !imageEditor ? btn('back', `← 返回${esc(back)}`) : '';
    editorBody(editor || imageEditor);
    body().innerHTML = `<main class="rmt-x-page${editor ? ' rmt-mv-editor' : imageEditor ? ' rmt-mve-image-page' : ''}">${returnButton}${editor || imageEditor ? '' : recoveryPanel()}${html}${editor || imageEditor ? '' : `<details class="rmt-x-card"><summary>MV 备份</summary>${btn('export-recovery', '导出 MV 数据与暂存结果')}</details>`}</main>`;
    renderedPage = view.sub;
}

function recoveryPanel(compact = false) {
    const rows = mv.pendingMv(view.scope);
    if (!rows.length) return '';
    const content = `${rows.map(row => `<div><p class="rmt-x-note">${esc(row.song?.title || 'MV')} · ${esc(row.reason || '等待保存')}</p><div class="rmt-mve-recovery-actions">${btn('retry-save', '仅重试保存', { id: row.id })}${btn('clear-pending', '清除', { id: row.id })}</div></div>`).join('')}<div class="rmt-mve-recovery-actions">${btn('export-recovery', '导出暂存结果')}${btn('clear-pending', '全部清除', { id: 'all' })}</div>${view.clearPendingIds?.length ? `<div class="rmt-mve-clear-confirm" role="alert"><p>清除这 ${view.clearPendingIds.length} 份暂存结果？已保存的分镜和图片会保留。</p><div class="rmt-mve-recovery-actions">${btn('confirm-clear-pending', '确认清除')}${btn('cancel-clear-pending', '取消')}</div></div>` : ''}`;
    return compact || view.sub === 'board' ? `<details class="rmt-mve-recovery"${view.clearPendingIds?.length ? ' open' : ''}><summary>${rows.length} 份结果待保存</summary>${content}</details>` : `<section class="rmt-x-card"><b>有 ${rows.length} 份 MV 结果待保存</b>${content}</section>`;
}
function reportResult(result, success) {
    if (result?.pending) globalThis.toastr?.info?.(result.message, '心迹回廊 · MV');
    else if (success) toastOk(success);
}

function head(small, title, text) {
    return `<header class="rmt-x-head"><small>${esc(small)}</small><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</header>`;
}

function btn(action, label, { cls = 'rmt-x-secondary', id = '', disabled = false, extra = '' } = {}) {
    return `<button type="button" class="${cls}" data-rmt-mv="${action}"${id ? ` data-rmt-mv-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}${extra}>${label}</button>`;
}

// ---------- ① 三步开始 ----------

function rangePicker(scope, state, sections) {
    const ranges = { chorus: '第一段副歌', verseChorus: '一段主歌 + 副歌', full: '整首', custom: '自己选' };
    const idx = mv.selectedSectionIndexes(sections, state.range, state.rangeFrom, state.rangeTo);
    const buttons = Object.entries(ranges).map(([id, label]) => btn('range-pick', label, { id, cls: 'rmt-x-seg' + (state.range === id ? ' active' : ''), extra: ` aria-pressed="${state.range === id}" data-rmt-mv-scope="${scope}"` })).join('');
    const options = value => sections.map((s, i) => `<option value="${i}"${i === value ? ' selected' : ''}>${i + 1}. ${esc(s.name)}${s.lines[0] ? ' · ' + esc(Array.from(s.lines[0]).slice(0, 10).join('')) : ''}</option>`).join('');
    const custom = state.range === 'custom' ? `<div class="rmt-mv-range-selects"><label>从<select data-rmt-mv-range="from" data-rmt-mv-scope="${scope}">${options(state.rangeFrom)}</select></label><label>到<select data-rmt-mv-range="to" data-rmt-mv-scope="${scope}">${options(state.rangeTo)}</select></label></div>` : '';
    const lines = idx.reduce((n, i) => n + (sections[i]?.lines.length || 1), 0);
    return `<div class="rmt-mv-grid2">${buttons}</div>${custom}<p class="rmt-x-note">这次做：${idx.length ? esc(sections[idx[0]].name) + (idx.length > 1 ? ' → ' + esc(sections[idx.at(-1)].name) : '') : '整首'} · ${idx.length} 段 · 约 ${lines} 句歌词。手书通常只做一段，镜头少、节奏紧。</p>`;
}

function continueControl(record, song) {
    const missing = mv.missingStoryboardSections(record, song);
    const busy = mv.isMvRunning(`story:${view.scope}:${view.songId}`);
    return missing.length ? `<p class="rmt-x-note">所选范围还有 ${missing.length} 段没有分镜，已有分镜和图片会保留。每次点击补写一批，剩余部分可再点继续。</p>${btn('continue-board', busy ? '正在补写分镜…' : `继续分镜 · 补上 ${missing.length} 段`, { cls: 'rmt-x-primary', disabled: busy })}`
        : '<p class="rmt-x-note">所选范围已有分镜；想继续后面的段落，可以把范围改为整首。</p>';
}

function exportControls(record, song) {
    const sections = mv.parseSections(song.lyrics);
    const o = mv.exportOptions(record, song);
    const idx = mv.selectedSectionIndexes(sections, o.range, o.rangeFrom, o.rangeTo);
    const options = value => sections.map((s, i) => `<option value="${i}"${i === value ? ' selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join('');
    const ready = mv.completedMvRanges(record, song);
    const range = mv.exportRange(record, song);
    return `<b style="font-size:14px">导出哪一段</b><div class="rmt-mv-actions">${btn('export-range', '整首', { id: 'full' })}${ready.map(r => btn('export-range', `已完成：${r.rangeFrom + 1}–${r.rangeTo + 1} 段`, { id: `${r.rangeFrom}:${r.rangeTo}` })).join('')}</div>
      <div class="rmt-mv-range-selects"><label>从<select data-rmt-mv-export-range="from">${options(idx[0] ?? 0)}</select></label><label>到<select data-rmt-mv-export-range="to">${options(idx.at(-1) ?? 0)}</select></label></div>
      <p class="rmt-x-note">导出第 ${(idx[0] ?? 0) + 1}–${(idx.at(-1) ?? 0) + 1} 段 · ${mv.formatTime(range.start)}–${mv.formatTime(range.end)}（约 ${Math.max(0, Math.round(range.end - range.start))} 秒）。只截取这一段的画面和声音，不改变制作范围。</p>`;
}

function renderSetup(song, record) {
    const d = view.draft || mv.normalizeSettings(null);
    const steps = ['做成什么', '分镜与出镜', '确认'].map((label, i) => `<span class="${view.step === i + 1 ? 'on' : view.step > i + 1 ? 'done' : ''}"><b>${view.step > i + 1 ? '✓' : i + 1}</b>${label}</span>`).join('');
    let content = '';
    if (view.step === 1) {
        content = `<h3 class="rmt-x-section-title">做成什么？</h3>
          ${choice('set-output', 'tegaki', d.output === 'tegaki', '手书 · 推荐', '一张张手绘风的画，跟着歌词切换、轻轻移动，像同人手书。', '全程在插件里完成，可以直接导出视频')}
          ${choice('set-output', 'video', d.output === 'video', '视频 · 进阶', '画面真正动起来，像电影片段。', '需要把提示词拿到视频工具里生成')}`;
    } else if (view.step === 2) {
        const styles = mv.MV_STYLES[d.output];
        const sectionsForRange = mv.parseSections(song.lyrics);
        content = `${d.output === 'tegaki' ? `<h3 class="rmt-x-section-title">做哪一段</h3>${rangePicker('draft', d, sectionsForRange)}` : ''}
          ${cast_controls.directionControls(song, d)}
          ${cast_controls.castControls(view.castDraft, d)}
          <h3 class="rmt-x-section-title">画风</h3><div class="rmt-mv-grid2">${styles.map(s => choice('set-style', s.id, d.style === s.id, s.name, s.desc)).join('')}</div>
          ${view.castDraft?.people.some(person => person.identity === 'user' && view.castDraft.selectedIds.includes(person.id)) ? `<h3 class="rmt-x-section-title">你要出镜吗？</h3>
          ${choice('set-appear', 'face', d.appear === 'face', '露脸出镜', '按你填写的外貌来画。')}
          ${choice('set-appear', 'back', d.appear === 'back', '只拍背影或手', '有你的存在感，但不画脸。')}
          ${choice('set-appear', 'none', d.appear === 'none', '不出镜', '不画用户，其他已选人物不受影响。')}` : ''}
          <h3 class="rmt-x-section-title">比例</h3><div class="rmt-mv-grid2">${choice('set-ratio', '9:16', d.ratio === '9:16', '竖屏 9:16', '手机看')}${choice('set-ratio', '16:9', d.ratio === '16:9', '横屏 16:9', '电脑看')}</div>
          ${d.output === 'video' ? `<h3 class="rmt-x-section-title">你打算用什么做视频？</h3>
            ${choice('set-lang', 'zh', d.lang === 'zh', '国内的视频 App', '比如可灵、即梦。提示词用中文写。')}
            ${choice('set-lang', 'en', d.lang === 'en', '国外的视频工具', '比如 Runway。提示词用英文写。')}
            ${choice('set-lang', 'both', d.lang === 'both', '还没想好', '中英文都给你，到时候挑一个复制。')}` : ''}`;
    } else {
        const style = mv.MV_STYLES[d.output].find(s => s.id === d.style);
        const lines = [['做成', d.output === 'video' ? '视频' : '手书'], ['分镜类型', mv_direction.directionOf(d.storyType).name], ['画风', style?.name || ''],
            ['出镜人物', mv_cast.selectedMvPeople(view.castDraft, d).map(person => person.name || '未命名').join('、') || '空镜'], ['比例', d.ratio === '9:16' ? '竖屏 9:16' : '横屏 16:9'],
            ['写分镜', '1 次文字请求'], ['画图', '之后由你逐张手动画']];
        content = `<section class="rmt-x-card">${lines.map(([k, v]) => `<div class="rmt-x-row-head"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>
          <p class="rmt-x-note">生成分镜时不会画图。画几张、什么时候画，都由你在下一页决定。${record?.shots?.length ? '重新写分镜会替换现在的镜头，已画的图不会保留在新镜头上。' : ''}</p>`;
    }
    const running = mv.isMvRunning(`story:${mv.mvScope(ctx())}:${view.songId}`);
    const nav = `<div class="rmt-mv-actions">${view.step > 1 ? btn('setup-prev', '上一步') : ''}${view.step < 3 ? btn('setup-next', '下一步', { cls: 'rmt-x-primary rmt-x-dark' })
        : btn('setup-generate', running ? '正在写分镜…' : record?.shots?.length ? '重新写分镜' : '生成分镜', { cls: 'rmt-x-primary', disabled: running })}</div>`;
    page('做成 MV', view.step > 1 ? '上一步' : '印象曲', `${head(song.title + ' · 做成 MV', '把这首歌做成 MV', '先写一张分镜表，再选做成手书还是视频。之后随时可以换另一种。')}<div class="rmt-mv-steps">${steps}</div>${content}${nav}`);
}

function choice(action, value, on, title, desc, note = '') {
    return `<button type="button" class="rmt-mv-choice${on ? ' on' : ''}" aria-pressed="${on}" data-rmt-mv="${action}" data-rmt-mv-id="${esc(value)}"><span><b>${esc(title)}</b><small>${esc(desc)}</small>${note ? `<em>${esc(note)}</em>` : ''}</span></button>`;
}

// ---------- ② 镜头清单 ----------

function thumb(shot, record, label) {
    const wide = mv.normalizeSettings(record.settings).ratio === '16:9';
    return `<span class="rmt-mv-thumb${wide ? ' wide' : ''}">${imgUrl(shot) ? `<img src="${esc(thumbnailPreview(imgUrl(shot)))}" alt="" loading="lazy">` : ''}<i>${esc(label)}</i></span>`;
}

function renderBoard(song, record) {
    if (mv.isV2(record)) return renderGroupsBoard(song, record);
    const context = ctx();
    const scope = mv.mvScope(context);
    const tegaki = view.mode === 'tegaki';
    const shots = record.shots;
    const drawn = shots.filter(hasImg).length;
    const videos = shots.filter(s => s.videoDone).length;
    const done = tegaki ? drawn : videos;
    const sections = mv.parseSections(song.lyrics);
    let rangeShots = shots;
    if (tegaki) { try { rangeShots = mv.shotsInRange(record, song); } catch { rangeShots = shots; } }
    const remaining = rangeShots.filter(s => !hasImg(s)).length;
    const who = { char: '他', both: mv.normalizeSettings(record.settings).appear === 'back' ? '他 · 你（背影）' : '他 · 你', user: '你', none: '空镜' };
    let number = 0;
    const groups = sections.map((section, index) => {
        const own = shots.filter(s => s.sectionIndex === index);
        if (!own.length) return '';
        return `<div class="rmt-mv-lyric"><small>${esc(section.name)}</small><p>${esc(section.lines.slice(0, 2).join('\n') || '（器乐）')}</p></div>` + own.map(shot => {
            number += 1;
            const groupHead = shot.group && shot.groupIndex === 0 ? `<div class="rmt-mv-group"><b>构图 ${esc(shot.group.slice(1))}</b><span>${esc(shot.composition || '')}${shot.groupSize ? ` · ${shot.groupSize} 张连续变化` : ''}</span></div>` : '';
            const groupLink = shot.groupNext && shot.link ? `<div class="rmt-mv-link">↓ 承接：${esc(shot.link)}</div>` : '';
            const drawing = mv.isFrameDrawing(scope, view.songId, shot.id);
            const ok = tegaki ? !!imgUrl(shot) : shot.videoDone;
            const status = tegaki ? (imgUrl(shot) ? '✓ 画好了' : '○ 还没画') : (shot.videoDone ? '✓ 视频做好了' : imgUrl(shot) ? '○ 视频还没做' : '○ 还没画图');
            return `<article class="rmt-mv-shot${ok ? ' done' : ''}"><div class="rmt-mv-shot-row">${thumb(shot, record, `第 ${number} 镜`)}
              <div class="rmt-mv-shot-copy"><small>${esc(shot.shot || '')}${shot.move ? ' · ' + esc(shot.move) : ''}</small><b>${esc(shot.plain)}</b>
              <div class="rmt-x-chips"><span class="rmt-x-chip muted">${esc(mv_cast.castLabel(record, shot) || who[shot.who] || '他')}</span><span class="rmt-x-chip${ok ? '' : ' muted'}">${status}</span></div></div></div>
              ${cast_controls.shotCastControls(record, shot)}
              <div class="rmt-mv-actions">${btn('draw', drawing ? '正在画…' : imgUrl(shot) ? '重画这张' : '画这一张', { id: shot.id, disabled: drawing || view.drawingAll, cls: imgUrl(shot) ? 'rmt-x-secondary' : 'rmt-x-primary' })}
              ${!tegaki ? btn('open-shot', shot.videoDone ? '再看看' : '去生成视频', { id: shot.id, cls: 'rmt-x-primary rmt-x-dark' }) : uploadLabel(shot.id, '用自己的图')}</div></article>${groupLink}`.replace(/^/, () => groupHead);
        }).join('');
    }).join('');
    const wd = record.wardrobe || {};
    const wardrobeCard = `<details class="rmt-x-card"${wd.char || wd.user || wd.era ? '' : ' open'}><summary><b>时代与衣着</b>（每一张都用同一套）</summary>
      <label class="rmt-mv-look"><span>时代 / 场景</span><input type="text" maxlength="200" data-rmt-mv-wardrobe="era" value="${esc(wd.era || '')}" placeholder="例如 ancient Chinese wuxia, bamboo forest sect"></label>
      ${record.cast ? '' : `<label class="rmt-mv-look"><span>他的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="char" value="${esc(wd.char || '')}" placeholder="例如 white layered hanfu robe, silver hairpin"></label>
      ${mv.normalizeSettings(record.settings).appear === 'none' ? '' : `<label class="rmt-mv-look"><span>你的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="user" value="${esc(wd.user || '')}" placeholder="例如 pale pink ruqun dress, jade hairpin"></label>`}`}
      <p class="rmt-x-note">外貌设定只管长相；衣着在这里统一，写分镜时会按角色设定和世界观自动填好，可以改。用英文写效果最稳。改完之后重画的图才会生效。</p></details>`;
    const warn = mv.frameNeedsUserLooks(record, context) && shots.some(s => s.who === 'both' || s.who === 'user')
        ? `<div class="rmt-mv-warn">还没有填写你的外貌，画出来的你可能每张不一样。</div>${looksEditor()}` : '';
    const rangeCard = tegaki ? (() => {
        const o = mv.tegakiOptions(record);
        return `<section class="rmt-x-card"><b>做哪一段</b>${rangePicker('record', o, sections)}${continueControl(record, song)}</section>`;
    })() : '';
    const tools = tegaki ? `${remaining ? btn(view.drawingAll ? 'draw-stop' : 'draw-all', view.drawingAll ? '停止连续绘制' : `一次画完剩下的 ${remaining} 张（会用 ${remaining} 次生图）`) : ''}
        ${btn('go-tegaki', '去手书剪辑台', { cls: 'rmt-x-primary' })}<p class="rmt-x-note">没画的镜头在剪辑台里会先用上一张代替，随时能预览。</p>`
        : `${btn('music-preview', '配乐与预览')}${btn('go-finish', '全部做完后：拼成 MV', { cls: 'rmt-x-primary rmt-x-dark' })}`;
    page('镜头清单', '印象曲', `${head(song.title, '镜头清单', `${shots.length} 镜 · ${mv.normalizeSettings(record.settings).ratio === '9:16' ? '竖屏' : '横屏'}。同一张分镜表，可以做成手书，也可以做成视频。`)}
      <div class="rmt-mv-toggle">${['tegaki', 'video'].map(m => `<button type="button" class="${view.mode === m ? 'on' : ''}" aria-pressed="${view.mode === m}" data-rmt-mv="mode" data-rmt-mv-id="${m}">${m === 'tegaki' ? '手书' : '视频'}</button>`).join('')}</div>
      ${rangeCard}
      ${cast_controls.directionControls(song, record.settings, 'record')}
      ${record.cast ? cast_controls.castControls(record.cast, record.settings, wd, 'record') : btn('edit-cast', '设置本曲人物／世界书')}
      ${wardrobeCard}
      <section class="rmt-x-card"><div class="rmt-x-row-head"><b>${tegaki ? `已画好 ${drawn} / ${shots.length} 张` : `视频已做好 ${videos} / ${shots.length} 镜`}</b><span>${tegaki ? '画好的图两边通用' : '先画第一张图再做视频'}</span></div>
        <div class="rmt-x-bar"><i style="width:${shots.length ? Math.round(done / shots.length * 100) : 0}%"></i></div>${tools}</section>
      ${warn}${groups}
      <div class="rmt-mv-actions">${btn('rewrite-board', '重新写分镜')}</div>`);
}

// ---------- 视频 · 做这一镜 ----------

function renderShot(song, record) {
    const shots = record.shots;
    const index = Math.max(0, shots.findIndex(s => s.id === view.shotId));
    const shot = shots[index];
    const settings = mv.normalizeSettings(record.settings);
    const drawing = mv.isFrameDrawing(mv.mvScope(ctx()), view.songId, shot.id);
    const copied = view.copied === shot.id;
    const current = !imgUrl(shot) ? 1 : !copied && !shot.videoDone ? 2 : !shot.videoDone ? 3 : 4;
    const step = (no, title, text, inner, done) => `<section class="rmt-mv-step${current === no ? ' on' : done ? ' done' : ''}"><header><i>${done ? '✓' : no}</i><b>${esc(title)}</b></header><p class="rmt-x-note">${esc(text)}</p>${inner}</section>`;
    const prompts = settings.lang === 'both' ? [['中文', shot.videoZh], ['English', shot.videoEn]] : settings.lang === 'en' ? [['', shot.videoEn || shot.videoZh]] : [['', shot.videoZh || shot.videoEn]];
    const promptHtml = prompts.map(([label, text], i) => `${label ? `<small class="rmt-x-note">${label}</small>` : ''}<div class="rmt-mv-prompt">${esc(text)}</div>${btn('copy', copied ? '✓ 已复制' : '复制这段话', { id: String(i), cls: copied ? 'rmt-x-secondary' : 'rmt-x-primary' })}`).join('');
    page(`第 ${index + 1} 镜`, '镜头清单', `${head(`视频 · 第 ${index + 1} / ${shots.length} 镜`, shot.plain, shot.lyric ? `对应歌词：${shot.lyric}` : '')}
      <div class="rmt-x-chips">${shot.shot ? `<span class="rmt-x-chip muted">${esc(shot.shot)}</span>` : ''}${shot.move ? `<span class="rmt-x-chip muted">${esc(shot.move)}</span>` : ''}</div>
      ${step(1, '画第一张图', '先画出这一镜开头的样子。视频工具会照着这张图让画面动起来，人物才不会变脸。',
        `<div class="rmt-mv-shot-row">${thumb(shot, record, imgUrl(shot) ? '第一张图' : '还没画')}<div class="rmt-mv-shot-copy">${btn('draw', drawing ? '正在画…' : imgUrl(shot) ? '✓ 已画好 · 重画' : '画第一张图', { id: shot.id, disabled: drawing, cls: imgUrl(shot) ? 'rmt-x-secondary' : 'rmt-x-primary' })}
         ${imgUrl(shot) ? `<a class="rmt-x-secondary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="${esc(imgUrl(shot))}" download target="_blank" rel="noopener">保存图片</a>` : ''}${uploadLabel(shot.id)}</div></div>`, !!imgUrl(shot))}
      ${step(2, '复制这段话', settings.lang === 'both' ? '中英文都准备好了，按你用的工具挑一个。' : `这是给视频工具看的说明，已经写成${settings.lang === 'en' ? '英文' : '中文'}。`,
        `${promptHtml}<details class="rmt-x-note"><summary>这段话在说什么？</summary><p>前半句告诉工具“画面里有什么”，中间告诉它“镜头怎么动”，最后是光线和时长。你不用改，直接复制就行。</p></details><div data-rmt-mv-copy-fallback></div>`, copied || shot.videoDone)}
      ${step(3, '去视频工具里生成', '按下面五步做，大约一两分钟。',
        `<ol><li>打开你的视频工具，选<b>“图生视频”</b>（有的叫“图片生成视频”）。</li><li>上传刚才保存的<b>第一张图</b>。</li><li>在描述框里<b>粘贴</b>刚才复制的那段话。</li><li>时长选 <b>5 秒</b>左右，比例选 <b>${settings.ratio === '9:16' ? '竖屏 9:16' : '横屏 16:9'}</b>，点生成。</li><li>生成好后保存视频，文件名可以写“第${index + 1}镜”。</li></ol>
         ${btn('video-done', shot.videoDone ? '✓ 这一镜做好了（点此取消）' : '我生成好了，打个勾', { id: shot.id, cls: shot.videoDone ? 'rmt-x-secondary' : 'rmt-x-primary rmt-x-dark' })}`, shot.videoDone)}
      <details class="rmt-x-card"><summary><b>生成出来不满意？</b></summary><p class="rmt-x-note"><b>人脸变了、不像他</b>：一定要用“图生视频”并上传第一张图。<br><b>动作太夸张</b>：点“让动作小一点”，再复制一次。<br><b>画面乱闪、多出人</b>：重新生成一次通常就好；还不行就点“换个拍法”。</p>
        <div class="rmt-mv-actions">${btn('rewrite-calm', '让动作小一点', { id: shot.id })}${btn('rewrite-alt', '换个拍法', { id: shot.id })}</div></details>
      <div class="rmt-mv-actions">${index > 0 ? btn('open-shot', '上一镜', { id: shots[index - 1].id }) : ''}${index < shots.length - 1 ? btn('open-shot', '下一镜', { id: shots[index + 1].id, cls: 'rmt-x-primary rmt-x-dark' }) : btn('go-finish', '去拼成 MV', { cls: 'rmt-x-primary rmt-x-dark' })}</div>`);
}

// ---------- 视频 · 拼成 MV ----------

function renderFinish(song, record) {
    const shots = record.shots;
    const missing = shots.map((s, i) => s.videoDone ? 0 : i + 1).filter(Boolean);
    page('拼成 MV', '镜头清单', `${head(song.title + ' · 最后一步', '把镜头拼成 MV', '用手机上的剪辑 App（比如剪映）就能完成。插件已经把顺序和时间算好了。')}
      <section class="rmt-x-card"><div class="rmt-x-row-head"><b>镜头准备情况</b><span>${shots.length - missing.length} / ${shots.length} 已做好</span></div>
        <div class="rmt-mv-dots">${shots.map((s, i) => `<span class="${s.videoDone ? 'ok' : ''}">${i + 1}</span>`).join('')}</div>
        ${missing.length ? `<p class="rmt-x-note">第 ${missing.slice(0, 8).join('、')}${missing.length > 8 ? ' 等' : ''} 镜还没做，也可以先跳过，用前一镜多停一会儿。</p>` : ''}</section>
      <section class="rmt-x-card"><b>先把这两样拿到手</b>${btn('export-recovery', '导出 MV 备份')}${btn('download-table', '下载镜头时间表 (.txt)', { cls: 'rmt-x-primary' })}${btn('download-srt', '下载歌词字幕 (.srt)')}
        <p class="rmt-x-note">时间表写着每一镜从第几秒开始；字幕文件导入剪辑 App 后，歌词会自动对上时间。想更准，可以先去手书剪辑台“对时间”。</p></section>
      <section class="rmt-x-card"><b>照着做</b><ol class="rmt-x-note" style="padding-left:20px;line-height:1.9">
        <li><b>新建项目，按顺序导入视频</b>：从第 1 镜到第 ${shots.length} 镜依次导入。</li>
        <li><b>加入歌曲</b>：在“音频”里导入你从 Suno 下载的歌，放在最下面一条轨道。</li>
        <li><b>对齐时间</b>：照时间表调整每段视频的长度。</li>
        <li><b>加字幕（可选）</b>：在“文本”里选“导入字幕”，选刚下载的 .srt 文件。</li>
        <li><b>导出</b>：选 1080P 导出，就是你们的 MV 了。</li></ol></section>
      <div class="rmt-mv-info">视频片段短一点没关系，剪辑 App 里把它拉长到时间表写的秒数就行。</div>`);
}

// ---------- 手书剪辑台 ----------

function canvasSize(record) {
    return mv.normalizeSettings(record?.settings).ratio === '16:9' ? [960, 540] : [540, 960];
}

function audioCard(song) {
    const audio = audioBySong.get(audioKey());
    const busy = !!musicLinkImport, value = view.musicLinkInput ?? audio?.sourceUrl ?? '';
    return `<div class="rmt-mv-file"><span aria-hidden="true">♫</span><div><b>${esc(audio ? audio.name : '选择音源')}</b><small role="status">${esc(view.audioStatus || (audio ? `${mv.formatTime(audio.duration)} · ${audio.streaming ? '在线音轨' : audio.fromVideo ? '视频音轨 · 只在本机使用' : '只在本机使用，不上传'}` : `为「${song.title}」选择音频、录屏或导入音乐链接`))}</small></div>
      <label>${audio ? '更换文件' : '选择文件'}<input type="file" accept="audio/*,video/mp4,video/quicktime,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.m4v" data-rmt-mv-audio${player.exporting ? ' disabled' : ''}></label></div>
      ${audio ? btn('audio-remove', '移除当前音乐', { disabled: !!player.exporting || !!audioLoads.get(audioKey())?.removing }) : ''}
      <div class="rmt-mv-music-link" data-rmt-mv-link-box><label for="rmt-mv-music-link">音乐链接（试验）</label>
      <input id="rmt-mv-music-link" type="url" inputmode="url" autocomplete="off" spellcheck="false" data-rmt-mv-music-link value="${esc(value)}" placeholder="粘贴 Suno 歌曲链接或音频直链"${busy ? ' disabled' : ''}>
      ${busy ? btn('audio-link-cancel', '取消') : btn('audio-link', '导入链接', { disabled: !!player.exporting })}
      <p class="rmt-x-note" role="status" aria-live="polite">${esc(view.musicLinkStatus || 'Suno 分享链接试接中；成功后与画面共用播放进度。')}</p></div>`;
}

function exportSupport() {
    const canvas = document.createElement('canvas');
    const ok = typeof globalThis.MediaRecorder === 'function' && typeof canvas.captureStream === 'function'
        && (typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function');
    if (!ok) return { ok: false, mime: '', ext: '' };
    const types = [['video/mp4;codecs=avc1,mp4a', 'mp4'], ['video/mp4', 'mp4'], ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm']];
    const found = types.find(([type]) => { try { return MediaRecorder.isTypeSupported(type); } catch { return false; } });
    return found ? { ok: true, mime: found[0], ext: found[1] } : { ok: false, mime: '', ext: '' };
}

function tegakiControls(record, song) {
    const o = mv.tegakiOptions(record);
    const range = mv.playRange(record, song);
    const seg2 = (action, map, value) => Object.entries(map).map(([id, label]) => btn(action, label, { id, cls: 'rmt-x-seg' + (value === id ? ' active' : ''), extra: ` aria-pressed="${value === id}"` })).join('');
    const presets = Object.entries(mv.TEGAKI_PRESETS).map(([id, p]) => `<button type="button" class="rmt-mv-choice${o.preset === id ? ' on' : ''}" aria-pressed="${o.preset === id}" data-rmt-mv="tegaki-preset" data-rmt-mv-id="${id}"><span><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span></button>`).join('');
    return `${mv.isV2(record) ? `<b>片头与片尾</b><label class="rmt-mv-look"><span>片头时长（秒）</span><input type="number" min="0" step="0.5" inputmode="decimal" data-rmt-mv-intro-seconds value="${o.introSeconds}"></label><label class="rmt-mv-look"><span>片尾时长（秒）</span><input type="number" min="0" step="0.5" inputmode="decimal" data-rmt-mv-outro-seconds value="${o.outroSeconds}"></label><p class="rmt-x-note">0 为关闭。片头最多占首镜头一半，开唱时结束；片尾最多占所选片段末镜头一半。</p>` : ''}
      <details open><summary>字幕与装饰</summary><div><b>歌词样式</b><div class="rmt-x-segs">${seg2('tegaki-lyric', Object.fromEntries(Object.entries(mv.TEGAKI_LYRICS).filter(([key]) => key !== 'stage' || record.stage)), o.lyric)}</div>
      ${mv.isV2(record) ? `<label class="rmt-mv-check"><input type="checkbox" data-rmt-mv-overlay="keyword" ${o.showKeyword ? 'checked' : ''}>副歌关键词（随歌词隐藏）</label><label class="rmt-mv-check"><input type="checkbox" data-rmt-mv-overlay="motif" ${o.showMotif ? 'checked' : ''}>漂浮装饰</label>` : ''}
      ${o.lyric === 'none' ? '' : `<b>字体</b><div class="rmt-x-segs">${seg2('tegaki-font', Object.fromEntries(Object.entries(mv.TEGAKI_FONTS).map(([k, v]) => [k, v.name])), o.font)}</div><p class="rmt-x-note">字体用设备自带的，不同手机效果会略有差异。</p>`}${motifNotice(record)}</div></details>
      <details><summary>节奏模板与切换</summary><div><div class="rmt-mv-presets">${presets}</div><p class="rmt-x-note">模板会统一修改镜头切换、停留和歌词样式；之后仍可逐镜调整。</p><b>切换节奏</b><div class="rmt-mv-grid2">${seg2('tegaki-rhythm', mv.TEGAKI_RHYTHMS, o.rhythm)}</div></div></details>
      <details><summary>截取范围 · ${mv.formatTime(range.start)}–${mv.formatTime(range.end)}</summary><div>${rangePicker('record', o, mv.parseSections(song.lyrics))}<p class="rmt-x-note">约 ${Math.max(0, Math.round(range.end - range.start))} 秒。只改变预览范围，不删除其他分镜。</p></div></details>`;
}

function stageShotControls(record, shot) {
    const bg = mv_stage.background(record, shot);
    if (!bg) return '';
    const cue = shot.stage || {};
    const select = (field, label, values, value) => `<label class="rmt-mv-look"><span>${label}</span><select data-rmt-mv-stage-cue="${field}" data-shot="${esc(shot.id)}">${Object.entries(values).map(([id, name]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
    return `<details><summary>舞台编排</summary>
      ${select('background', '共享背景', Object.fromEntries(record.stage.backgrounds.map(b => [b.id, b.label])), bg.id)}
      <label class="rmt-mv-look"><span>画面文字</span><input type="text" data-rmt-mv-stage-cue="text" data-shot="${esc(shot.id)}" value="${esc(cue.text || '')}" placeholder="${esc(shot.lyric || '')}"></label>
      ${select('layout', '文字位置', mv_stage.LAYOUTS, cue.layout || 'sides')}
      ${select('depth', '文字层', { back: '人物后方', front: '人物前方' }, cue.depth || 'back')}
      ${select('entrance', '人物入场', { cut: '直接切', pop: '轻弹入', slide: '滑入' }, cue.entrance || 'cut')}
      ${select('tone', '背景变化', { base: '原配色', accent: '强调色', dark: '压暗' }, cue.tone || 'base')}
      <label class="rmt-mv-check"><input type="checkbox" data-rmt-mv-stage-cue="shadow" data-shot="${esc(shot.id)}"${cue.shadow ? ' checked' : ''}>人物剪影</label></details>`;
}

function markedTime(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0; }

function editorTimingTarget(record, song) {
    const timeline = mv.shotTimeline(record, song), sections = timeline.sections, times = timeline.times;
    const selected = view.editorTiming || { kind: 'line', key: '' };
    if (selected.kind === 'section') {
        const index = syncTapIndex(sections, record.timing?.taps || {});
        return { kind: 'section', index, time: times[index]?.start || 0, label: index < 0 ? '全部段落已对齐' : sections[index].name };
    }
    const lines = mv.syncLines(record, song);
    const line = lines.find(l => l.key === selected.key) || (selected.complete ? null : lines.find(l => !markedTime(record.timing?.lineTaps?.[l.key])));
    if (!line) return { kind: 'line', key: '', index: -1, time: 0, label: '全部句子已对齐' };
    const [index, li] = line.key.split(':').map(Number);
    const estimate = times[index] ? times[index].start + (times[index].end - times[index].start) * li / Math.max(1, sections[index].lines.length) : 0;
    return { kind: 'line', key: line.key, index, time: markedTime(record.timing?.lineTaps?.[line.key]) ? Number(record.timing.lineTaps[line.key]) : estimate, label: line.text, section: line.section };
}

function saveEditorTime(value, advance = false) {
    const record = currentRecord(), song = currentSong(), target = editorTimingTarget(record, song);
    if (!Number.isFinite(value) || value < 0 || target.index < 0) return;
    if (target.kind === 'section') {
        setTap(target.index, Math.round((value - (Number(record.timing?.shift) || 0)) * 10) / 10);
        view.tapIndex = target.index;
        if (advance && view.editorAutoNext !== false) view.editorTiming = { kind: 'line', key: mv.syncLines(record, song).find(l => l.key.startsWith(target.index + ':'))?.key || '' };
    } else {
        const timing = structuredClone(record.timing || {}), lineTaps = { ...(timing.lineTaps || {}), [target.key]: Math.round(value * 10) / 10 };
        mv.patchRecord(view.songId, { timing: { ...timing, lineTaps } });
        view.editorUndo.push({ timing, selected: { ...view.editorTiming }, tapIndex: view.tapIndex });
        if (advance && view.editorAutoNext !== false) {
            const lines = mv.syncLines(record, song), next = lines[lines.findIndex(l => l.key === target.key) + 1];
            view.editorTiming = { kind: 'line', key: next?.key || '', complete: !next };
            if (next) view.editorSection = Number(next.key.split(':')[0]);
        }
    }
    renderMv();
}

function editorTimingPanel(song, record) {
    const { sections, times } = mv.shotTimeline(record, song), lines = mv.syncLines(record, song);
    const taps = record.timing?.taps || {}, lineTaps = record.timing?.lineTaps || {};
    const target = editorTimingTarget(record, song);
    const open = Number.isInteger(view.editorSection) ? view.editorSection : Math.max(0, target.index);
    const groups = sections.map((s, i) => {
        const own = lines.filter(l => Number(l.key.split(':')[0]) === i);
        const picked = target.kind === 'section' && target.index === i;
        return `<div class="rmt-mve-sync-group"><div class="rmt-mve-section"><button type="button" class="rmt-mve-section-pick${picked ? ' on' : ''}" data-rmt-mv="select-section" data-rmt-mv-id="${i}" aria-pressed="${picked}"><small>段</small><b>${esc(s.name)}</b><time>${mv.formatTime(times[i].start, true)}</time><small>${markedTime(taps[i]) ? '已定' : '估计'}</small></button>${btn('editor-section', open === i ? '⌄' : '›', { id: String(i), cls: 'rmt-mve-fold', extra: ` aria-label="${open === i ? '收起' : '展开'}歌词" aria-expanded="${open === i}"` })}</div>
          ${open === i ? `<div class="rmt-mve-lines">${own.map(l => {
            const li = Number(l.key.split(':')[1]), done = markedTime(lineTaps[l.key]);
            const time = done ? Number(lineTaps[l.key]) : times[i].start + (times[i].end - times[i].start) * li / Math.max(1, s.lines.length);
            const active = target.kind === 'line' && target.key === l.key;
            return `<button type="button" class="rmt-mve-line${active ? ' on' : ''}" data-rmt-mv="editor-line" data-rmt-mv-id="${l.key}" aria-pressed="${active}"><span>${esc(l.text)}</span><small><time>${mv.formatTime(time, true)}</time><em>${done ? '已定' : '估计'}</em></small></button>`;
        }).join('') || '<p class="rmt-x-note">当前截取范围内没有这一段的歌词。</p>'}</div>` : ''}</div>`;
    }).join('');
    const sectionMode = target.kind === 'section';
    const legacy = view.sub === 'sync' && sectionMode;
    return `<div class="rmt-mve-panel-scroll" data-rmt-mv-scroll="timing"><div class="rmt-x-row-head"><b>定段与定句</b><span>${Object.values(taps).filter(markedTime).length} 段 · ${lines.filter(l => markedTime(lineTaps[l.key])).length} / ${lines.length} 句</span></div>
      <p class="rmt-x-note">点段名定段，点歌词定句，共用上方播放器。</p><div class="rmt-mve-sync-list">${groups}</div>
      <details><summary>重置与细调</summary><div>${btn('tap-line-reset', '清空逐句打点')}${btn('tap-reset', '清空全部打点')}</div></details></div>
      <footer class="rmt-mve-dock rmt-mve-timing-dock">
      <small class="rmt-x-note">${target.index < 0 ? esc(target.label) : `${sectionMode ? '正在定段' : '正在定句'} · ${esc(sectionMode ? target.label : target.section)}`}</small>
      <div class="rmt-mve-timing-actions">${legacy ? `<button type="button" class="rmt-mv-tap${target.index < 0 ? ' done' : ''}" data-rmt-mv="tap" ${!audioBySong.has(audioKey()) || target.index < 0 ? 'disabled' : ''}><b>${target.index < 0 ? '✓ 时间对好了' : esc(target.label) + '开始了'}</b></button>` : btn('editor-mark', sectionMode ? '这一段开始了' : '这一句开始了', { cls: 'rmt-x-primary', disabled: target.index < 0 || player.exporting })}${btn('editor-undo', '撤销', { disabled: !view.editorUndo.length || player.exporting })}</div>
      ${target.index < 0 ? '' : `<div class="rmt-mve-nudge">${btn('editor-nudge', '−0.1 秒', { id: '-0.1' })}<input type="number" step="0.1" min="0" inputmode="decimal" value="${Math.round(target.time * 10) / 10}" data-rmt-mv-editor-time aria-label="选中标记的开始秒数">${btn('editor-nudge', '+0.1 秒', { id: '0.1' })}</div>`}
      <label class="rmt-mv-check"><input type="checkbox" data-rmt-mv-editor-next ${view.editorAutoNext !== false ? 'checked' : ''}>定好后自动选下一句</label></footer>`;
}

function editorSheet(song, record) {
    if (view.editorDrawer === 'audio') return audioCard(song);
    if (view.editorDrawer === 'more') return `${recoveryPanel()}${btn('go-board', '素材库 · 图片编辑 · 抠图')}${btn('go-board', '补充分镜与图片')}${btn('download-table', '下载镜头时间表')}${btn('download-srt', '下载歌词字幕')}${btn('export-recovery', '导出 MV 数据与暂存结果')}`;
    if (view.editorDrawer !== 'export') return '';
    const support = exportSupport(), exporting = player.exporting;
    return exporting ? `<div class="rmt-x-row-head"><b>正在导出</b><span data-rmt-mv-export-time>0:00</span></div><div class="rmt-x-bar"><i data-rmt-mv-export-bar style="width:0%"></i></div><p class="rmt-x-note">请留在本页，不要锁屏。</p>${btn('export-stop', '停止导出')}`
      : `${exportControls(record, song)}${support.ok ? btn('export', audioBySong.has(audioKey()) ? `导出视频（.${support.ext}）` : `导出无声视频（.${support.ext}）`, { cls: 'rmt-x-primary' }) : '<p class="rmt-mv-warn">此环境不支持直接导出视频，可使用下面的录屏模式。</p>'}
        ${btn('record-mode', '录屏模式（全屏播放）', { disabled: !audioBySong.has(audioKey()) })}<p class="rmt-x-note">导出会播放一遍所选片段，请不要切页或锁屏。</p>`;
}

function editorShotPanel(song, record, sel, selIndex) {
    const seg = (action, map, value) => Object.entries(map).map(([id, label]) => btn(action, label, { id, cls: 'rmt-x-seg' + (value === id ? ' active' : ''), extra: ` aria-pressed="${value === id}"` })).join('');
    const assetKey = sel?.shot.group && sel?.shot.diff ? `${sel.shot.group}:${sel.shot.diff}` : '';
    const asset = assetKey ? mv.assetOf(record, assetKey) : null;
    const shared = asset && !mv.hasAssetImage(sel?.shot.image);
    return sel ? `<div class="rmt-mve-panel-scroll" data-rmt-mv-scroll="shots"><div class="rmt-x-row-head"><b>第 ${selIndex + 1} 镜</b><span>${mv.formatTime(sel.start, true)}–${mv.formatTime(sel.end, true)}</span></div><p class="rmt-x-note">${esc(sel.shot.lyric || sel.shot.plain || '')}</p>
      <div class="rmt-mve-image-actions">${btn(shared ? 'edit-asset' : 'edit-frame', '编辑图片', { id: shared ? assetKey : sel.shot.id, cls: 'rmt-x-primary', extra: ' aria-label="图片编辑 · 选单格 · 修边"' })}${uploadLabel(sel.shot.id, '换图')}</div><small class="rmt-mve-image-note">${shared ? '共享构图素材' : '当前镜图片'} · ${mv.shotImage(record, sel.shot)?.editMode === 'cutout' ? '透明图' : '保留原背景'}</small>
      <b>镜头运动</b><div class="rmt-mv-grid2">${seg('set-motion', mv.MV_MOTIONS, sel.shot.motion)}</div><b>切到下一镜</b><div class="rmt-x-segs">${seg('set-cut', mv.MV_CUTS, sel.shot.cut || 'fade')}</div>
      ${stageShotControls(record, sel.shot)}<details><summary>图片与生成</summary><div>${shared ? btn('cutout-asset', '一键抠图', { id: assetKey }) : ''}${asset ? btn('edit-prompt-asset', '构图素材与提示词', { id: assetKey }) : ''}${btn('draw', mv.isFrameDrawing(mv.mvScope(ctx()), view.songId, sel.shot.id) ? '正在画…' : hasImg(sel.shot) ? '重画这一镜' : '画这一镜', { id: sel.shot.id, disabled: mv.isFrameDrawing(mv.mvScope(ctx()), view.songId, sel.shot.id) })}${btn('go-board', '素材库与背景编辑')}${btn('go-board', '补充分镜与图片')}</div></details></div>
      <footer class="rmt-mve-dock">${btn('editor-step', '上一镜', { id: '-1', disabled: selIndex <= 0 || !!player.exporting })}<small>${selIndex + 1} / ${mv.shotTimeline(record, song).rows.length}</small>${btn('editor-step', '下一镜', { id: '1', disabled: selIndex + 1 >= mv.shotTimeline(record, song).rows.length || !!player.exporting })}</footer>` : '';
}

function editorStrip(rows, record) {
    // A window in the thumbnail list, not a limit on saved/generated frames.
    const start = Math.max(0, Math.min(view.stripStart || 0, Math.max(0, rows.length - 1)));
    const strip = rows.slice(start, start + 12).map((row, i) => `<button type="button" class="${row.shot.id === view.selected ? 'on' : ''}" aria-label="第 ${start + i + 1} 镜" data-rmt-mv="select-shot" data-rmt-mv-id="${esc(row.shot.id)}">${assetPreviewHtml(mv.shotImage(record, row.shot))}<span>${start + i + 1} · ${(row.end - row.start).toFixed(1)}秒</span></button>`).join('');
    const stripNav = rows.length <= 12 ? '' : `<div class="rmt-mve-strip-nav">${btn('editor-strip', '上一组', { id: String(Math.max(0, start - 12)), disabled: start === 0 })}<span>${start + 1}–${Math.min(rows.length, start + 12)} / ${rows.length} 镜</span>${btn('editor-strip', '下一组', { id: String(start + 12), disabled: start + 12 >= rows.length })}</div>`;
    return { strip, stripNav };
}

function renderTegaki(song, record) {
    const [w, h] = canvasSize(record), { rows, total } = mv.shotTimeline(record, song);
    if (!view.selected || !record.shots.some(s => s.id === view.selected)) view.selected = record.shots[0]?.id || '';
    const selIndex = Math.max(0, rows.findIndex(r => r.shot.id === view.selected)), sel = rows[selIndex];
    const tab = view.sub === 'sync' ? 'timing' : view.editorTab || 'shots';
    const { strip, stripNav } = editorStrip(rows, record);
    const seg = (action, map, value) => Object.entries(map).map(([id, label]) => btn(action, label, { id, cls: 'rmt-x-seg' + (value === id ? ' active' : ''), extra: ` aria-pressed="${value === id}"` })).join('');
    const panels = {};
    // Only the active tab is constructed: folded/hidden tools do no image work.
    if (tab === 'shots') panels.shots = editorShotPanel(song, record, sel, selIndex);
    if (tab === 'timing') panels.timing = editorTimingPanel(song, record);
    if (tab === 'look') panels.look = `<div class="rmt-mve-panel-scroll" data-rmt-mv-scroll="look"><div class="rmt-x-row-head"><b>整支手书的样子</b><span>全片设置</span></div><div class="rmt-x-segs">${seg('editor-ratio', { '16:9': '横屏 16:9', '9:16': '竖屏 9:16' }, mv.normalizeSettings(record.settings).ratio)}</div>${tegakiControls(record, song)}</div>`;
    const html = editor_ui.editorMarkup({ esc, btn, song, tab, panels, width: w, height: h, strip, stripNav,
        storyLabel: mv_direction.directionOf(mv.normalizeSettings(record.settings).storyType).name, previewOnly: view.previewOnly, pendingCount: mv.pendingMv(view.scope).length,
        selectedLabel: `第 ${selIndex + 1} 镜 · ${rows.length} 镜`, time: mv.formatTime(currentTime(), true), seconds: currentTime(), total, totalLabel: mv.formatTime(total),
        playing: player.playing, audio: audioBySong.has(audioKey()), audioName: audioBySong.get(audioKey())?.name, exporting: player.exporting, drawer: view.editorDrawer, drawerHtml: editorSheet(song, record) });
    page('手书剪辑台', '素材库', html);
    editorDialog = editor_dialog.mountEditorDialog(body(), closeEditorDrawer);
    bindEditorControls();
}

function seekEditor(time) {
    const total = mv.shotTimeline(view.cache.record, view.cache.song).total;
    time = Math.max(0, Math.min(total, Number(time) || 0));
    const audio = audioElement();
    if (audio) audio.currentTime = time; else { player.clockOffset = time; player.clockStart = performance.now(); }
    view.editorPlayhead = ''; drawNow();
}

function bindEditorControls() {
    const roots = [body()?.querySelector?.('.rmt-mv-editor'), editorDialog?.element].filter(Boolean);
    for (const root of roots) {
        if (!root.addEventListener) continue;
        root.addEventListener('input', event => {
            if (event.target.matches?.('[data-rmt-mv-seek]') && !player.exporting) seekEditor(event.target.value);
            if (event.target.matches?.('[data-rmt-mv-music-link]')) view.musicLinkInput = event.target.value;
        });
        root.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target.matches?.('[data-rmt-mv-music-link]')) {
                event.preventDefault();
                if (!musicLinkImport && !player.exporting) void importMusicLink(event.target.value).catch(toastError);
                return;
            }
            const sheet = root.querySelector('.rmt-mve-sheet');
            if (event.key === 'Escape' && view.editorDrawer) {
                event.preventDefault(); event.stopPropagation(); closeEditorDrawer(); return;
            }
            if (sheet && event.key === 'Tab') {
                const nodes = [...sheet.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')];
                const first = nodes[0], last = nodes.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
            const tab = event.target.closest?.('[data-rmt-mv="editor-tab"]');
            if (tab && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault(); const ids = ['shots', 'timing', 'look'], next = ids[(ids.indexOf(tab.dataset.rmtMvId) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
                view.editorTab = next; if (view.sub === 'sync') view.sub = 'tegaki'; renderMv();
                body()?.querySelector?.(`[data-rmt-mv="editor-tab"][data-rmt-mv-id="${next}"]`)?.focus();
            }
        });
    }
}

// ---------- 对时间 ----------

function syncTapIndex(sections, taps) {
    if (Number.isInteger(view.tapIndex) && view.tapIndex >= 0 && view.tapIndex < sections.length) return view.tapIndex;
    return sections.findIndex((_, i) => taps[i] === undefined || taps[i] === null);
}

function renderSync(song, record) {
    renderTegaki(song, record);
}

// ---------- 画布与播放 ----------

function imageFor(url) {
    if (!url) return null;
    let img = images.get(url);
    if (!img) {
        const opened = viewTarget();
        img = new Image(); img.decoding = 'async';
        img.onload = () => { if (isView(opened)) queueImageRefresh(); };
        img.src = url; images.set(url, img);
    }
    if (img.complete && img.naturalWidth && !player.exporting) {
        cacheValue(images, url, img, 16);
    }
    return img.complete && img.naturalWidth ? img : null;
}

// Resolve local blobs before decoding images; timeouts stop export rather than silently omit frames.
async function preloadImages(record, song) {
    let timer;
    const shots = mv.shotsInRange(record, song);
    const load = async () => {
        const assets = shots.flatMap(shot => {
            const image = mv.shotImage(record, shot);
            if (!mv.isV2(record)) return [image];
            const group = record.groups.find(g => g.id === shot.group);
            const diff = group?.diffs.find(d => d.id === shot.diff);
            const detail = stage_canvas.isDetailInsert(group, diff, shot);
            if (!detail && (image?.editMode === 'full' || (group?.layer === 'full' && image?.editMode !== 'cutout') || (mv.hasAssetImage(shot.image) && !mv_stage.background(record, shot)))) return [image];
            const stageBg = mv_stage.background(record, shot);
            if (stageBg && stageBg.kind !== 'image') return [image];
            const bg = stageBg || group?.bgs?.find(b => b.id === (shot.bg || 'B1')) || group?.bgs?.[0];
            return [image, bg?.image || group?.bg];
        }).filter(Boolean);
        if (mv.isV2(record) && mv.tegakiOptions(record).showMotif) assets.push(record.motif?.image);
        await Promise.all(assets.map(resolveAssetImage));
        const urls = [...new Set(assets.map(image => {
            const url = assetImageUrl(image);
            if (mv.hasAssetImage(image) && !url) throw new Error('Local image unavailable');
            return url;
        }).concat(mv.isV2(record) ? [coverUrl(song) || ''] : []).filter(Boolean))];
        await Promise.all(urls.map(url => new Promise((resolve, reject) => {
            let img = images.get(url);
            if (!img) { img = new Image(); img.src = url; images.set(url, img); }
            if (img.complete) return img.naturalWidth ? resolve() : reject(new Error('Image unavailable'));
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', () => reject(new Error('Image unavailable')), { once: true });
        })));
    };
    try { await Promise.race([load(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Image load timeout')), 8000); })]); }
    finally { clearTimeout(timer); }
}

function currentTime() {
    if (player.audio) return player.audio.currentTime || 0;
    return player.playing ? (performance.now() - player.clockStart) / 1000 + player.clockOffset : player.clockOffset;
}

function drawCover(g, img, w, h, scale, dx, dy) {
    const r = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scale;
    const iw = img.naturalWidth * r, ih = img.naturalHeight * r;
    g.drawImage(img, (w - iw) / 2 + dx, (h - ih) / 2 + dy, iw, ih);
}

let frameCtx = { rhythm: 'line', beat: 1.3 };

// 跟拍子切：同一张图在每两拍换一个构图，镜头多了却不用多画图。
function beatVariant(row, t) {
    if (frameCtx.rhythm !== 'beat') return null;
    const k = Math.floor(Math.max(0, t - row.start) / frameCtx.beat);
    return { k, since: Math.max(0, t - row.start) - k * frameCtx.beat, variant: k % 4 };
}

// 手书的镜头运动：同一构图组共用一条缓慢推近（最多 5%），换张不会让画面跳；不再左右上下移动。
function groupSpan(rows, index) {
    const id = rows[index]?.shot?.group;
    if (!id) return { start: rows[index].start, end: rows[index].end };
    let a = index, b = index;
    while (a > 0 && rows[a - 1].shot.group === id) a -= 1;
    while (b < rows.length - 1 && rows[b + 1].shot.group === id) b += 1;
    return { start: rows[a].start, end: rows[b].end };
}

function drawShot(g, row, rows, index, t, w, h) {
    let img = null, sourceShot = row.shot;
    for (let i = index; i >= 0 && !img; i -= 1) {
        sourceShot = rows[i].shot; img = imageFor(imgUrl(sourceShot));
    }
    g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, w, h);
    if (img) {
        const span = groupSpan(rows, index);
        const p = Math.min(1, Math.max(0, (t - span.start) / Math.max(0.1, span.end - span.start)));
        const lead = rows.findIndex(r => r.shot.group && r.shot.group === row.shot.group);
        const motion = mv.motionOf((lead >= 0 ? rows[lead] : row).shot.motion);
        if (stage_canvas.isDetailInsert(null, null, sourceShot)) {
            drawFittedInsert(g, img, cropFor(img.src, img, mv.shotImage(view.cache?.record, sourceShot)?.split).rect,
                w, h, motion === 'push' ? (1 + 0.05 * p) / 1.05 : 1);
        } else drawCover(g, img, w, h, motion === 'push' ? 1 + 0.05 * p : 1, 0, 0);
    } else {
        g.fillStyle = '#8b95a3'; g.font = `${Math.round(w * 0.04)}px sans-serif`; g.textAlign = 'center';
        wrap(g, row.shot.plain, w / 2, h / 2, w * 0.8, w * 0.055);
    }
}

function wrap(g, text, x, y, max, lineHeight) {
    const chars = Array.from(String(text || ''));
    const lines = []; let line = '';
    for (const ch of chars) { if (g.measureText(line + ch).width > max && line) { lines.push(line); line = ch; } else line += ch; }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((l, i) => g.fillText(l, x, y + (i - (Math.min(lines.length, 4) - 1) / 2) * lineHeight));
}

function drawBigLyric(g, text, w, h, since, fontId = 'sans') {
    const font = mv.TEGAKI_FONTS[fontId] || mv.TEGAKI_FONTS.sans;
    const size = Math.round(Math.min(w, h) * 0.07);
    const chars = Array.from(String(text));
    const perLine = Math.max(4, Math.floor(w * 0.78 / size));
    const lines = [];
    for (let i = 0; i < chars.length && lines.length < 3; i += perLine) lines.push(chars.slice(i, i + perLine).join(''));
    g.save();
    g.translate(w / 2, h * 0.72);
    g.globalAlpha = Math.min(1, since / 0.35);
    g.font = `${font.weight} ${size}px ${font.stack}`;
    g.textAlign = 'center'; g.lineJoin = 'round';
    lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * size * 1.35;
        g.lineWidth = Math.max(2, size * 0.12); g.strokeStyle = 'rgba(30,26,40,.55)'; g.strokeText(line, 0, y);
        g.fillStyle = '#fffdf8'; g.fillText(line, 0, y);
    });
    g.restore();
}

// Short shots need time without the previous image or white flash covering them.
function transitionDuration(row, seconds) {
    return Math.min(seconds, Math.max(0, row.end - row.start) / 4);
}

function renderFrame(canvas, record, song, t) {
    if (mv.isV2(record)) return renderFrameV2(canvas, record, song, t);
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const topt = mv.tegakiOptions(record);
    frameCtx = { rhythm: topt.rhythm, beat: 120 / (mv.songBpm(song) || 90) };
    const { rows, total } = mv.playbackTimeline(record, song);
    if (!rows.length) return total;
    let index = rows.findIndex(r => t >= r.start && t < r.end);
    if (index < 0) index = t < rows[0].start ? 0 : rows.length - 1;
    const row = rows[index];
    drawShot(g, row, rows, index, t, w, h);
    const prev = rows[index - 1];
    const since = t - row.start;
    const fadeDuration = transitionDuration(row, 0.45), flashDuration = transitionDuration(row, 0.3);
    if (prev && since >= 0 && (prev.shot.cut || 'fade') === 'fade' && since < fadeDuration) {
        g.save(); g.globalAlpha = 1 - since / fadeDuration; drawShot(g, prev, rows, index - 1, t, w, h); g.restore();
    } else if (prev && since >= 0 && prev.shot.cut === 'flash' && since < flashDuration) {
        g.save(); g.globalAlpha = 1 - since / flashDuration; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.restore();
    }
    const beat = beatVariant(row, t);
    if (beat) {
        const pulse = Math.max(0, 1 - beat.since / (frameCtx.beat * 0.6));
        const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
        glow.addColorStop(0, `rgba(255,248,236,${0.14 * pulse})`); glow.addColorStop(1, 'rgba(255,248,236,0)');
        g.save(); g.fillStyle = glow; g.fillRect(0, 0, w, h); g.restore();
    }
    if (since >= 0 && topt.lyric === 'big' && row.shot.lyric) drawBigLyric(g, row.shot.lyric, w, h, since, topt.font);
    if (since >= 0 && topt.lyric === 'subtitle' && row.shot.lyric) {
        let size = Math.round(Math.min(w, h) * 0.055), lines = [];
        const split = () => {
            const result = []; let line = '';
            for (const char of Array.from(row.shot.lyric)) {
                if (char === '\n') { result.push(line); line = ''; continue; }
                if (line && g.measureText(line + char).width > w * 0.88) { result.push(line); line = char; }
                else line += char;
            }
            if (line) result.push(line);
            return result;
        };
        do {
            g.font = `${(mv.TEGAKI_FONTS[topt.font] || mv.TEGAKI_FONTS.sans).weight} ${size}px ${(mv.TEGAKI_FONTS[topt.font] || mv.TEGAKI_FONTS.sans).stack}`;
            lines = split();
            if (lines.length * size * 1.35 <= h * 0.32 || size <= 1) break;
            size -= 1;
        } while (true);
        g.textAlign = 'center'; g.lineJoin = 'round';
        g.lineWidth = Math.max(1, size * 0.18); g.strokeStyle = 'rgba(40,36,52,.75)'; g.fillStyle = '#fff';
        const bottom = h - Math.min(w, h) * 0.08;
        lines.forEach((text, index) => {
            const y = bottom - (lines.length - index - 1) * size * 1.35;
            g.strokeText(text, w / 2, y); g.fillText(text, w / 2, y);
        });
    }
    return total;
}

function syncEditorPlayback(record, song, t) {
    if (view.sub !== 'tegaki' && view.sub !== 'sync') return;
    const { rows } = mv.shotTimeline(record, song), playback = mv.playbackTimeline(record, song).rows;
    if (!playback.length) return;
    let index = playback.findIndex(r => t >= r.start && t < r.end);
    if (index < 0) index = t < playback[0].start ? 0 : playback.length - 1;
    const row = playback[index], number = rows.findIndex(r => r.shot.id === row.shot.id) + 1;
    const label = document.querySelector('[data-rmt-mv-current]');
    const text = `播放 · 第 ${number} 镜 / ${rows.length} 镜`;
    if (label && label.textContent !== text) label.textContent = text;
    const changed = view.editorPlayhead !== row.shot.id;
    view.editorPlayhead = row.shot.id;
    // Do not replace a focused field, an image draft, or the timing workspace.
    const editing = document.activeElement?.closest?.('.rmt-mve-tools')
        && document.activeElement?.matches?.('input,select,textarea,[contenteditable="true"]');
    const follow = view.sub === 'tegaki' && (view.editorTab || 'shots') === 'shots' && !view.editorDrawer && !editing;
    if (follow && view.selected !== row.shot.id) {
        view.selected = row.shot.id;
        const panel = body()?.querySelector?.('[data-rmt-mv-shot-panel]');
        if (panel) panel.innerHTML = editorShotPanel(song, record, row, number - 1);
    }
    if (follow && changed) {
        const start = view.stripStart || 0;
        if (number - 1 < start || number - 1 >= start + 12) {
            view.stripStart = Math.floor((number - 1) / 12) * 12;
            const film = body()?.querySelector?.('[data-rmt-mv-filmstrip]');
            if (film) { const { strip, stripNav } = editorStrip(rows, record); film.innerHTML = `<div class="rmt-mv-strip">${strip}</div>${stripNav}`; }
        }
    }
    for (const button of document.querySelectorAll('.rmt-mve-filmstrip [data-rmt-mv="select-shot"]')) {
        const current = button.dataset.rmtMvId === row.shot.id;
        if (button.getAttribute?.('aria-current') !== String(current)) button.setAttribute('aria-current', String(current));
        button.classList?.toggle('on', button.dataset.rmtMvId === view.selected);
        if (follow && changed && current) {
            const strip = button.parentElement;
            if (strip) strip.scrollLeft = Math.max(0, button.offsetLeft - strip.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2);
        }
    }
}

function drawNow() {
    if (!isView()) return;
    const canvas = document.querySelector('[data-rmt-mv-canvas]');
    const record = view.cache?.record || null;
    const song = view.cache?.song || null;
    const t = currentTime();
    const timeText = mv.formatTime(t);
    document.querySelectorAll('[data-rmt-mv-time]').forEach(el => { el.textContent = timeText; });
    if (!record || !song) return;
    const total = canvas ? renderFrame(canvas, record, song, t) : mv.shotTimeline(record, song).total;
    const bar = document.querySelector('[data-rmt-mv-progress]');
    if (bar) bar.style.width = `${Math.min(100, t / Math.max(1, total) * 100)}%`;
    const slider = document.querySelector('[data-rmt-mv-seek]');
    if (slider) {
        if (document.activeElement !== slider) slider.value = String(t);
        slider.style?.setProperty?.('--rmt-mv-seek', `${Math.min(100, Math.max(0, Number(slider.value) || 0) / Math.max(1, total) * 100)}%`);
    }
    syncEditorPlayback(record, song, t);
    const rec = document.querySelector('.rmt-mv-rec canvas');
    if (rec) renderFrame(rec, player.recording?.record || record, player.recording?.song || song, t);
}

function currentRange() {
    if (view.sub === 'sync' || (view.sub === 'tegaki' && view.editorTab === 'timing')) return { start: 0, end: Infinity };
    const record = view.cache?.record, song = view.cache?.song;
    try { return record && song ? mv.playRange(record, song) : { start: 0, end: Infinity }; } catch { return { start: 0, end: Infinity }; }
}

function ensureLoop() {
    if (player.raf) return;
    const tick = () => {
        player.raf = 0;
        if (!isView()) { disposeMv(); return; }
        if (!player.playing && !player.exporting) return;
        drawNow();
        const audio = player.audio;
        if (audio && !player.exporting && (audio.ended || (!player.recording && audio.currentTime >= currentRange().end))) { audio.pause(); player.playing = false; renderMv(); return; }
        player.raf = requestAnimationFrame(tick);
    };
    player.raf = requestAnimationFrame(tick);
}

function audioElement() {
    const entry = audioBySong.get(audioKey());
    if (!entry) return null;
    if (!player.audio || player.audio.dataset.song !== audioKey()) {
        try { player.audio?.pause(); } catch {}
        const audio = new Audio(entry.url);
        audio.dataset.song = audioKey(); audio.preload = 'auto';
        player.audio = audio;
    }
    return player.audio;
}

async function togglePlay() {
    const opened = viewTarget();
    const audio = audioElement();
    if (player.playing) {
        const pausedAt = currentTime();
        player.playing = false;
        if (audio) audio.pause(); else player.clockOffset = pausedAt;
    } else {
        player.playing = true;
        const range = currentRange();
        if (audio) { if (audio.ended || audio.currentTime < range.start - 0.05 || audio.currentTime >= range.end - 0.05) audio.currentTime = range.start; try { await audio.play(); } catch (error) { player.playing = false; toastError(error); } }
        else player.clockStart = performance.now();
        if (!isView(opened)) { audio?.pause(); return; }
        ensureLoop();
    }
    if (isView(opened)) renderMv();
}

export function stopPlayback() {
    player.playing = false;
    if (player.recording) { clearInterval(player.recording.timer); player.recording.shell.remove(); player.recording = null; }
    if (player.audio) player.audio.onended = null;
    try { player.audio?.pause(); } catch {}
    if (player.raf) cancelAnimationFrame(player.raf);
    player.raf = 0;
}

export function disposeMv() {
    editorBody(false);
    cancelMusicLink();
    for (const [key, token] of audioLoads) if (token.videoSource) { token.cancel?.(); audioTried.delete(key); }
    assetEditor?.dispose(); assetEditor = null; editSequence++;
    stageShadows.clear(); characterSprites.clear(); thumbnailPreviews.clear();
    motifSprites.clear(); palettes.clear();
    if (imageRefreshTimer) clearTimeout(imageRefreshTimer);
    imageRefreshTimer = 0; imageLayoutPending = false;
    for (const image of images.values()) { image.onload = null; image.onerror = null; }
    images.clear(); loadingLocal.clear();
    for (const url of localUrls.values()) { try { URL.revokeObjectURL(url); } catch {} }
    localUrls.clear();
    navigation.length = 0; renderedPage = '';
    view.epoch += 1;
    view.stopAll = true; view.drawingAll = false; view.drawQueue = null;
    stopPlayback(); stopExport();
    player.audio = null; player.clockOffset = 0;
}

// ---------- 导出与录屏 ----------

function silentClock() {
    let base = 0, started = 0, playing = false;
    return {
        readyState: 4, onended: null, silent: true,
        get currentTime() { return playing ? base + (performance.now() - started) / 1000 : base; },
        set currentTime(value) { base = Number(value) || 0; started = performance.now(); },
        get paused() { return !playing; }, get ended() { return false; },
        async play() { started = performance.now(); playing = true; },
        pause() { if (playing) { base = this.currentTime; playing = false; } },
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    };
}

async function exportVideo() {
    if (player.exporting) return;
    cancelMusicLink();
    const opened = viewTarget(), sub = view.sub;
    const entry = audioBySong.get(audioKey());
    const support = exportSupport();
    const song = structuredClone(currentSong());
    if (!support.ok || !currentRecord() || !song) return;
    const record = mv.exportRecord(currentRecord(), song);
    stopPlayback();
    const state = { cancelled: false, tracks: [], raf: 0, recorder: null, audio: null, ac: null, canvas: null, musicController: null, musicTimer: 0, musicUrl: '' };
    player.exporting = state;
    const current = () => !state.cancelled && player.exporting === state && isView(opened) && view.sub === sub;
    const chunks = [];
    const finish = () => {
        if (state.finished) return;
        state.finished = true;
        state.musicController?.abort(); clearTimeout(state.musicTimer);
        const mayRender = current();
        if (player.exporting === state) player.exporting = null;
        try { state.audio?.pause(); } catch {}
        if (state.raf) cancelAnimationFrame(state.raf);
        for (const track of state.tracks) { try { track.stop(); } catch {} }
        try { Promise.resolve(state.ac?.close()).catch(() => {}); } catch {}
        state.canvas?.remove();
        if (state.musicUrl) URL.revokeObjectURL(state.musicUrl);
        if (!state.cancelled && chunks.length) {
            download(new Blob(chunks, { type: support.mime.split(';')[0] }), `${safeName(song.title)}-MV.${support.ext}`);
            toastOk('视频已导出。');
        }
        if (mayRender) renderMv();
    };
    state.finish = finish;
    try {
        let exportAudioUrl = entry?.url;
        if (entry?.streaming) {
            // A no-CORS media element can play but Web Audio would record
            // silence. Obtain readable bytes before starting the recorder.
            renderMv();
            state.musicController = new AbortController();
            state.musicTimer = setTimeout(() => state.musicController.abort(), 60000);
            let media;
            try { media = await music_link.readMusicLink(entry.url, { signal: state.musicController.signal, allowStreaming: false }); }
            catch (error) {
                if (!current()) { finish(); return; }
                throw core_text.safeUserError('在线音轨可继续预览，本次未能读取用于导出的音频。请稍后重试，已有编辑已保留。', 'RMT_MV_EXPORT_AUDIO');
            } finally { clearTimeout(state.musicTimer); }
            if (!current()) { finish(); return; }
            exportAudioUrl = state.musicUrl = URL.createObjectURL(media.blob);
        }
        await preloadImages(record, song);
        if (!current()) { state.cancelled = true; finish(); return; }
        const [w, h] = canvasSize(record);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        state.canvas = canvas;
        canvas.style.cssText = 'position:fixed;left:-20000px;top:0;width:10px;height:10px;pointer-events:none';
        document.body.appendChild(canvas);
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        // 没有放入歌曲时导出无声视频：用本地时钟代替音频的播放进度。
        const audio = state.audio = entry ? new Audio(exportAudioUrl) : silentClock();
        const video = canvas.captureStream(30);
        state.tracks.push(...video.getTracks());
        let stream = new MediaStream(video.getVideoTracks());
        if (entry) {
            const ac = state.ac = new AC();
            const source = ac.createMediaElementSource(audio);
            const dest = ac.createMediaStreamDestination();
            state.tracks.push(...dest.stream.getTracks());
            source.connect(dest); source.connect(ac.destination);
            stream = new MediaStream([...video.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
        const recorder = state.recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: 5_000_000 });
        recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
        recorder.onstop = finish;
        recorder.onerror = () => { state.cancelled = true; stopExport(); toastError(core_text.safeUserError('视频录制失败，可以改用录屏模式。', 'RMT_MV_EXPORT')); };
        const range = mv.playRange(record, song);
        const total = Math.max(0, range.end - range.start);
        const loop = () => {
            if (!current()) { stopExport(); return; }
            const t = audio.currentTime || 0;
            if (t >= range.end - 0.02) { try { audio.pause(); } catch {} if (recorder.state !== 'inactive') recorder.stop(); return; }
            try { renderFrame(canvas, record, song, t); } catch (error) { stopExport(); toastError(error); return; }
            const bar = document.querySelector('[data-rmt-mv-export-bar]');
            if (bar) bar.style.width = `${Math.min(100, Math.max(0, t - range.start) / Math.max(1, total) * 100)}%`;
            const label = document.querySelector('[data-rmt-mv-export-time]');
            if (label) label.textContent = `${mv.formatTime(Math.max(0, t - range.start))} / ${mv.formatTime(total)}`;
            state.raf = requestAnimationFrame(loop);
        };
        audio.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
        if (audio.readyState < 1) await new Promise(resolve => { audio.addEventListener('loadedmetadata', resolve, { once: true }); audio.addEventListener('error', resolve, { once: true }); });
        if (!current()) { stopExport(); return; }
        audio.currentTime = range.start;
        renderMv(); renderFrame(canvas, record, song, range.start); recorder.start(1000);
        await state.ac?.resume?.();
        if (!current()) { stopExport(); return; }
        await audio.play();
        if (!current()) { audio.pause(); stopExport(); return; }
        state.raf = requestAnimationFrame(loop);
    } catch (error) { stopExport(); toastError(error?.code === 'RMT_MV_EXPORT_AUDIO' ? error : core_text.safeUserError('这台设备这次没能录制，可以改用录屏模式。', 'RMT_MV_EXPORT')); }
}

function stopExport() {
    const state = player.exporting;
    if (!state) return;
    state.cancelled = true;
    try { state.audio?.pause(); } catch {}
    try { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); } catch {}
    state.finish?.();
}

function recordMode() {
    const opened = viewTarget();
    const entry = audioBySong.get(audioKey());
    const song = structuredClone(currentSong());
    if (!entry || !currentRecord() || !song) return;
    const record = mv.exportRecord(currentRecord(), song);
    const range = mv.playRange(record, song);
    stopPlayback();
    const [w, h] = canvasSize(record);
    const shell = document.createElement('div');
    shell.className = 'rmt-mv-rec';
    shell.innerHTML = `<canvas width="${w}" height="${h}"></canvas><b>3</b>`;
    document.body.appendChild(shell);
    const count = shell.querySelector('b');
    const exit = () => { stopPlayback(); shell.remove(); if (isView(opened)) renderMv(); };
    shell.addEventListener('click', event => {
        if (event.target.closest('button')) return exit();
        if (!shell.querySelector('button')) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '退出'; shell.appendChild(b); setTimeout(() => b.remove(), 2500); }
    });
    player.clockOffset = range.start;
    drawNow();
    let n = 3;
    const timer = setInterval(async () => {
        if (!isView(opened) || player.recording?.shell !== shell) { exit(); return; }
        n -= 1;
        if (n > 0) { count.textContent = String(n); return; }
        clearInterval(timer); count.remove();
        const audio = audioElement();
        if (!audio) { exit(); return; }
        audio.currentTime = range.start;
        const stopAt = () => { if (audio.currentTime >= range.end - 0.02) { audio.pause(); audio.dispatchEvent(new Event('ended')); } else if (!audio.paused) requestAnimationFrame(stopAt); };
        player.playing = true;
        try { await audio.play(); } catch (error) { toastError(error); }
        if (!isView(opened) || player.recording?.shell !== shell) { audio.pause(); return; }
        requestAnimationFrame(stopAt);
        audio.onended = () => { player.playing = false; const done = document.createElement('button'); done.type = 'button'; done.textContent = '录好了 · 退出'; shell.appendChild(done); };
        ensureLoop();
    }, 1000);
    player.recording = { timer, shell, record, song };
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.hidden = true;
    try { document.body.appendChild(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
}

function safeName(value) { return core_text.normalizeText(value, 60).replace(/[\\/:*?"<>|]+/g, '_') || 'Hearttrace'; }

async function copyText(textValue) {
    try {
        if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error();
        await globalThis.navigator.clipboard.writeText(textValue);
        return true;
    } catch {
        const slot = body()?.querySelector('[data-rmt-mv-copy-fallback]');
        if (slot) { const box = document.createElement('textarea'); box.readOnly = true; box.value = textValue; box.setAttribute('aria-label', '长按选择并复制'); slot.replaceChildren(box); box.focus(); box.select(); }
        globalThis.toastr?.info?.('请在文字框内长按复制。', '心迹回廊 · MV');
        return false;
    }
}

// ---------- 事件 ----------

async function runDraw(shotId) {
    const opened = viewTarget();
    try { const p = mv.drawFrame(opened.songId, shotId); renderMv(); reportResult(await p); }
    catch (error) { toastError(error); }
    if (isView(opened)) renderMv();
}

async function drawAllAssets() {
    const record0 = currentRecord();
    const keys = mv.assetKeys(record0, view.cache?.song).filter(key => !mv.hasAssetImage(mv.assetOf(record0, key)?.image));
    return drawAssetQueue(keys);
}

async function drawAssetQueue(keys, resetGroup = '') {
    if (view.drawingAll || !keys.length) return;
    const opened = viewTarget();
    if (!isView(opened)) return;
    const record0 = currentRecord(), storyRevision = record0?.storyRevision;
    const expectedImages = new Map(keys.map(key => [key, JSON.stringify(mv.assetOf(record0, key)?.image || null)]));
    if (resetGroup) mv.resetGroupSeed(opened.songId, resetGroup);
    const queue = {}; view.drawQueue = queue;
    view.drawingAll = true; view.stopAll = false;
    renderMv();
    try {
        for (const key of keys) {
            if (view.stopAll || view.drawQueue !== queue || !isView(opened)) break;
            const latest = currentRecord();
            if (latest?.storyRevision !== storyRevision) break;
            if (JSON.stringify(mv.assetOf(latest, key)?.image || null) !== expectedImages.get(key)) continue;
            const result = await mv.drawAsset(opened.songId, key, { fresh: false });
            reportResult(result);
            if (result?.pending) break;
            if (isView(opened)) renderMv();
        }
    } catch (error) { toastError(error); }
    if (view.drawQueue === queue) { view.drawingAll = false; view.drawQueue = null; }
    if (isView(opened)) renderMv();
}

async function runAsset(key, options = {}) {
    const opened = viewTarget();
    // 已经画过的图再点一次：换一个随机种子，不然同一种子同一提示词会画出一模一样的图。
    const record = currentRecord();
    const fresh = options.fresh ?? mv.hasAssetImage(mv.assetOf(record, key)?.image);
    try { const p = mv.drawAsset(opened.songId, key, { fresh }); renderMv(); reportResult(await p); }
    catch (error) { toastError(error); }
    if (isView(opened)) renderMv();
}

async function drawAll() {
    if (mv.isV2(currentRecord())) return drawAllAssets();
    if (view.drawingAll) return;
    const opened = viewTarget();
    const record0 = currentRecord();
    const storyRevision = record0?.storyRevision;
    let shots = structuredClone(record0?.shots || []);
    if (view.mode === 'tegaki' && view.cache?.song) { try { const ids = new Set(mv.shotsInRange(record0, view.cache.song).map(s => s.id)); shots = shots.filter(s => ids.has(s.id)); } catch {} }
    const queue = {}; view.drawQueue = queue;
    view.drawingAll = true; view.stopAll = false;
    renderMv();
    try {
        for (const shot of shots) {
            if (view.stopAll || view.drawQueue !== queue || !isView(opened)) break;
            const latest = currentRecord();
            if (latest?.storyRevision !== storyRevision) break;
            const liveShot = latest?.shots?.find(s => s.id === shot.id);
            if (!liveShot || hasImg(liveShot)) continue;
            const result = await mv.drawFrame(opened.songId, shot.id);
            reportResult(result);
            if (result?.pending) break;
            if (isView(opened)) renderMv();
        }
    } catch (error) { toastError(error); }
    if (view.drawQueue === queue) view.drawingAll = false;
    if (isView(opened)) renderMv();
}

function setTap(index, value) {
    const previousTiming = structuredClone(currentRecord()?.timing || {});
    const taps = currentRecord()?.timing?.taps || {};
    const before = Object.keys(taps).map(Number).filter(i => i < index && Number.isFinite(taps[i])).sort((a, b) => b - a)[0];
    const after = Object.keys(taps).map(Number).filter(i => i > index && Number.isFinite(taps[i])).sort((a, b) => a - b)[0];
    const low = before === undefined ? 0 : taps[before] + (index - before) * 0.5;
    const high = after === undefined ? Infinity : taps[after] - (after - index) * 0.5;
    value = Math.max(low, Math.min(value, high));
    mv.patchRecord(view.songId, { timing: { ...(currentRecord()?.timing || {}), taps: { ...taps, [index]: value } } });
    view.tapUndo.push({ taps: { ...taps }, index });
    view.editorUndo.push({ timing: previousTiming, selected: { ...view.editorTiming }, tapIndex: index });
}

export function handleMvClick(event) {
    const el = event.target?.closest?.('[data-rmt-mv]');
    if (!el || el.disabled) return false;
    event.preventDefault?.();
    const action = el.dataset.rmtMv;
    const id = el.dataset.rmtMvId || '';
    if (action === 'open') { openMv({ songId: id }); return true; }
    if (runtimeState.activeMode !== MV_MODE) return true;
    // Closing must remain available even if this song/archive became unreadable.
    if (action === 'editor-drawer' && !['export', 'more', 'audio'].includes(id)) { closeEditorDrawer(); return true; }
    const d = view.draft ||= mv.normalizeSettings(currentRecord()?.settings);
    const record = currentRecord();
    const opened = viewTarget();
    try {
        if (action === 'back') navigateMvBack();
        else if (action === 'audio-link') {
            const input = (editorDialog?.element || body())?.querySelector?.('[data-rmt-mv-music-link]');
            void importMusicLink(input?.value ?? view.musicLinkInput ?? '').catch(toastError);
        }
        else if (action === 'audio-link-cancel') { cancelMusicLink(); renderMv(); }
        else if (action === 'audio-remove') { void removeMusic(); }
        else if (action === 'editor-tab') {
            if (['shots', 'timing', 'look'].includes(id)) { view.editorTab = id; if (view.sub === 'sync') view.sub = 'tegaki'; view.editorDrawer = ''; renderMv(); }
        }
        else if (action === 'editor-preview') { view.previewOnly = !view.previewOnly; renderMv(); }
        else if (action === 'editor-step') {
            if (!player.exporting && ['-1', '1'].includes(id)) {
                const rows = mv.shotTimeline(record, currentSong()).rows;
                const index = rows.findIndex(row => row.shot.id === view.selected) + Number(id), next = rows[index];
                if (next) { view.selected = next.shot.id; view.stripStart = Math.floor(index / 12) * 12; seekEditor(next.start); renderMv(); }
            }
        }
        else if (action === 'editor-drawer') {
            view.editorDrawer = id; view.clearPendingIds = null; renderMv();
            (editorDialog?.element || body())?.querySelector?.('.rmt-mve-sheet button')?.focus?.({ preventScroll: true });
        }
        else if (action === 'editor-strip') { const start = Number(id); if (Number.isInteger(start) && start >= 0 && start < record.shots.length) { view.stripStart = start; renderMv(); } }
        else if (action === 'editor-section') { const index = Number(id); if (Number.isInteger(index) && index >= 0 && index < mv.parseSections(currentSong().lyrics).length) { view.editorSection = view.editorSection === index ? -1 : index; renderMv(); } }
        else if (action === 'editor-line') { if (mv.syncLines(record, currentSong()).some(l => l.key === id)) { view.editorTiming = { kind: 'line', key: id }; view.editorSection = Number(id.split(':')[0]); renderMv(); } }
        else if (action === 'editor-mark') saveEditorTime(currentTime(), true);
        else if (action === 'editor-nudge') { const delta = Number(id); if (Number.isFinite(delta)) saveEditorTime(Math.max(0, editorTimingTarget(record, currentSong()).time + delta)); }
        else if (action === 'editor-undo') {
            const previous = view.editorUndo.at(-1);
            if (previous) { mv.patchRecord(view.songId, { timing: previous.timing }); view.editorUndo.pop(); view.editorTiming = previous.selected; view.tapIndex = previous.tapIndex; view.editorSection = editorTimingTarget(currentRecord(), currentSong()).index; renderMv(); }
        }
        else if (action === 'editor-ratio') { if (['16:9', '9:16'].includes(id)) { mv.patchRecord(view.songId, { settings: { ...record.settings, ratio: id } }); renderMv(); } }
        else if (action === 'go-board') { view.editorDrawer = ''; go('board'); }
        else if (action === 'group-open') { if (record.groups?.some(g => g.id === id)) { view.groupOpen = view.groupOpen === id ? '' : id; view.inspect = ''; renderMv(); } }
        else if (action === 'retry-save') { void mv.retryMvSave(opened.scope, id).then(result => { reportResult(result, '结果已保存。'); if (isView(opened)) renderMv(); }).catch(toastError); }
        else if (action === 'clear-pending') { view.clearPendingIds = mv.pendingMv(opened.scope).filter(row => id === 'all' || row.id === id).map(row => row.id); renderMv(); }
        else if (action === 'cancel-clear-pending') { view.clearPendingIds = null; renderMv(); }
        else if (action === 'confirm-clear-pending') {
            const result = mv.clearPendingMv(opened.scope, view.clearPendingIds || []);
            if (result.cleared) view.clearPendingIds = null;
            else globalThis.toastr?.error?.('清除未能保存，暂存结果仍保留，请重试。', '心迹回廊');
            renderMv();
        }
        else if (action === 'export-recovery') download(new Blob([mv.exportMvRecovery(opened.scope)], { type: 'application/json' }), 'Hearttrace-MV-backup.json');
        else if (action === 'set-output') { d.output = id === 'video' ? 'video' : 'tegaki'; view.draft = mv.normalizeSettings(d); renderMv(); }
        else if (action === 'set-style') { d.style = id; renderMv(); }
        else if (action === 'set-appear') { d.appear = id; renderMv(); }
        else if (action === 'set-ratio') { d.ratio = id; renderMv(); }
        else if (action === 'set-lang') { d.lang = id; renderMv(); }
        else if (action === 'use-recommended-type') {
            const storyType = mv_direction.recommendDirections(currentSong())[0].id;
            if (el.dataset.rmtMvScope === 'record') mv.patchRecord(view.songId, { settings: { ...record.settings, storyType } });
            else d.storyType = storyType;
            renderMv();
        }
        else if (action === 'edit-cast') {
            const target = mv.captureMvTarget(ctx(), view.songId);
            const expected = JSON.stringify(record?.cast || null);
            const before = view.sub === 'setup' ? view.castDraft : record?.cast || view.castDraft;
            const sub = view.sub;
            void participant_picker.showParticipantPicker({ context: ctx(), roster: before, title: '本曲人物 · 世界书导入', selectionLabel: '用于本曲',
                confirmLabel: '保存本曲名单', intro: '只保存本曲人物，不改变档案名单；选人不调用生成 API。',
                onConfirm: selected => {
                    if (!isView(opened) || view.sub !== sub) return false;
                    const next = mv_cast.mergeMvCast(before, selected);
                    const saved = mv.saveMvCast(opened.songId, next, target, expected);
                    if (!saved) return false;
                    view.castDraft = structuredClone(saved.cast); renderMv(); return true;
                },
            }).catch(toastError);
        }
        else if (action === 'use-archive-cast' || action === 'add-cast-user') {
            const before = view.sub === 'setup' ? view.castDraft : record?.cast || view.castDraft;
            const next = action === 'add-cast-user' ? mv_cast.addMvUser(ctx(), before) : mv_cast.initialMvCast(ctx());
            const saved = mv.saveMvCast(view.songId, next);
            if (saved) view.castDraft = structuredClone(saved.cast);
            renderMv();
        }
        else if (action === 'setup-prev') { view.step = Math.max(1, view.step - 1); renderMv(); }
        else if (action === 'setup-next') { view.step = Math.min(3, view.step + 1); renderMv(); }
        else if (action === 'setup-generate') {
            const settings = mv.normalizeSettings(d);
            const p = mv.generateStoryboard(view.songId, settings, view.castDraft);
            renderMv();
            p.then(result => { reportResult(result, '分镜写好了。'); if (isView(opened)) { if (result?.pending) renderMv(); else { view.mode = settings.output; go('board'); } } })
                .catch(error => { toastError(error); if (isView(opened)) renderMv(); });
        }
        else if (action === 'rewrite-board') { view.step = 1; view.castDraft = mv_cast.initialMvCast(ctx(), record); view.draft = mv.normalizeSettings({ ...(record?.settings || {}), ...(record?.tegaki?.range ? { range: record.tegaki.range, rangeFrom: record.tegaki.rangeFrom, rangeTo: record.tegaki.rangeTo } : {}) }); go('setup'); }
        else if (action === 'continue-board') {
            const p = mv.continueStoryboard(view.songId);
            renderMv();
            p.then(result => { reportResult(result, result?.alreadyComplete ? '所选段落已有分镜。' : '分镜已补上，已有图片已保留。'); if (isView(opened)) renderMv(); })
                .catch(error => { toastError(error); if (isView(opened)) renderMv(); });
        }
        else if (action === 'export-range') {
            const [rangeFrom, rangeTo] = id.split(':').map(Number);
            mv.patchRecord(view.songId, { exportRange: id === 'full' ? { range: 'full' } : { range: 'custom', rangeFrom, rangeTo } });
            renderMv();
        }
        else if (action === 'mode') { view.mode = id === 'video' ? 'video' : 'tegaki'; renderMv(); }
        else if (action === 'draw') void runDraw(id);
        else if (action === 'draw-all') void drawAll();
        else if (action === 'draw-asset') void runAsset(id);
        else if (action === 'edit-asset') void openAssetEditor(id).catch(toastError);
        else if (action === 'edit-frame') void openAssetEditor(`shot:${id}`, false, id).catch(toastError);
        else if (action === 'edit-prompt-asset') void openAssetEditor(id).catch(toastError);
        else if (action === 'cutout-asset') void openAssetEditor(id, true).catch(toastError);
        else if (action === 'group-layer') { const [gid, layer] = id.split(':'); mv.setGroupLayer(view.songId, gid, layer); renderMv(); }
        else if (action === 'inspect') { view.groupOpen = id; view.inspect = view.inspect === id ? '' : id; setTimeout(() => { if (isView(opened)) renderMv(); }, 0); }
        else if (action === 'draw-group' || action === 'redraw-group') {
            const redraw = action === 'redraw-group';
            const keys = mv.assetKeys(record, currentSong()).filter(k => k.startsWith(id + ':') && (redraw || !mv.hasAssetImage(mv.assetOf(record, k)?.image)));
            void drawAssetQueue(keys, redraw ? id : '');
        }
        else if (action === 'tegaki-preset') { mv.applyTegakiPreset(view.songId, id, currentSong()); toastOk('已按“' + (mv.TEGAKI_PRESETS[id]?.name || '') + '”配好镜头。'); renderMv(); }
        else if (action === 'tegaki-range') { mv.patchTegaki(view.songId, { range: id }); renderMv(); }
        else if (action === 'tegaki-rhythm') { mv.patchTegaki(view.songId, { rhythm: id, preset: '' }); renderMv(); }
        else if (action === 'tegaki-font') { mv.patchTegaki(view.songId, { font: id }); renderMv(); }
        else if (action === 'range-pick') {
            const sections = mv.parseSections(currentSong().lyrics);
            const source = el.dataset.rmtMvScope === 'draft' ? view.draft : mv.tegakiOptions(currentRecord());
            const extra = {};
            if (id === 'custom') { const idx = mv.selectedSectionIndexes(sections, source.range, source.rangeFrom, source.rangeTo); extra.rangeFrom = idx[0] || 0; extra.rangeTo = idx.at(-1) ?? Math.max(0, sections.length - 1); }
            if (el.dataset.rmtMvScope === 'draft') { view.draft = mv.normalizeSettings({ ...view.draft, range: id, ...extra }); }
            else mv.patchTegaki(view.songId, { range: id, ...extra });
            renderMv();
        }
        else if (action === 'tegaki-lyric') { mv.patchTegaki(view.songId, { lyric: id, preset: '' }); renderMv(); }
        else if (action === 'draw-stop') { view.stopAll = true; globalThis.toastr?.info?.('画完正在画的这一张后停止。', '心迹回廊 · MV'); }
        else if (action === 'go-tegaki') go('tegaki');
        else if (action === 'music-preview') { view.editorDrawer = 'audio'; go('tegaki'); }
        else if (action === 'go-finish') go('finish');
        else if (action === 'go-sync') { view.editorTiming = { kind: 'section' }; go('sync'); }
        else if (action === 'open-shot') { view.copied = ''; go('shot', { shotId: id }); }
        else if (action === 'copy') {
            const shot = record.shots.find(s => s.id === view.shotId);
            const lang = mv.normalizeSettings(record.settings).lang;
            const value = lang === 'both' ? (id === '1' ? shot.videoEn : shot.videoZh) : lang === 'en' ? (shot.videoEn || shot.videoZh) : (shot.videoZh || shot.videoEn);
            void copyText(value).then(ok => { if (!isView(opened)) return; view.copied = shot.id; if (ok) { toastOk('已复制。'); renderMv(); } });
        }
        else if (action === 'video-done') { const shot = record.shots.find(s => s.id === id); mv.patchShot(view.songId, id, { videoDone: !shot?.videoDone }); renderMv(); }
        else if (action === 'rewrite-calm' || action === 'rewrite-alt') {
            const p = mv.rewriteShot(view.songId, id, action === 'rewrite-calm' ? 'calm' : 'alt');
            globalThis.toastr?.info?.('正在改写这一镜…', '心迹回廊 · MV');
            p.then(result => { reportResult(result, '这一镜改好了，记得重新复制。'); if (isView(opened)) { view.copied = ''; renderMv(); } }).catch(toastError);
        }
        else if (action === 'download-table') download(new Blob([mv.timetableText(record, currentSong())], { type: 'text/plain;charset=utf-8' }), `${safeName(currentSong().title)}-镜头时间表.txt`);
        else if (action === 'download-srt') download(new Blob([mv.srtText(record, currentSong())], { type: 'application/x-subrip;charset=utf-8' }), `${safeName(currentSong().title)}.srt`);
        else if (action === 'select-shot') { const row = mv.shotTimeline(record, currentSong()).rows.find(r => r.shot.id === id); if (row) { view.selected = id; seekEditor(row.start); renderMv(); } }
        else if (action === 'use-group-image') {
            if (mv.isV2(record) && record.shots.some(s => s.id === id)) {
                imageImports.delete(mv_media.mediaKey('img', opened.scope, opened.songId, id));
                mv.patchShot(view.songId, id, { image: null }); renderMv();
            }
        }
        else if (action === 'seek') {
            // 跳转：画面、差分和字幕都读同一个播放时间，跳到哪里就从哪里对齐。
            const rect = el.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, ((event.clientX ?? rect.left) - rect.left) / Math.max(1, rect.width)));
            const time = ratio * mv.shotTimeline(record, currentSong()).total;
            const audio = audioElement();
            if (audio) audio.currentTime = time; else { player.clockOffset = time; player.clockStart = performance.now(); }
            drawNow();
        }
        else if (action === 'save-looks') {
            const context = ctx();
            const memory = archive_repository.requireArchive(context);
            const field = side => body().querySelector(`[data-rmt-mv-look="${side}"]`)?.value || '';
            core_castLooks.saveConfirmedCastLooks({ char: field('char'), user: field('user') }, {
                origin: core_context.captureTaskOrigin(context, memory.archiveRevision || ''),
                expectedSignature: core_castLooks.castLooksSignature(core_castLooks.readCastLooks(context)),
            });
            toastOk('外貌已保存，之后画的图都会用它。');
            renderMv();
        }
        else if (action === 'set-motion') { mv.patchShot(view.songId, view.selected, { motion: id }); renderMv(); }
        else if (action === 'set-cut') { mv.patchShot(view.songId, view.selected, { cut: id }); renderMv(); }
        else if (action === 'play') void togglePlay();
        else if (action === 'export') void exportVideo();
        else if (action === 'export-stop') stopExport();
        else if (action === 'record-mode') recordMode();
        else if (action === 'select-section') {
            const index = Number(id);
            const sections = mv.parseSections(currentSong().lyrics);
            if (Number.isInteger(index) && index >= 0 && index < sections.length) { view.tapIndex = index; view.editorTiming = { kind: 'section' }; view.editorSection = index; renderMv(); }
        }
        else if (action === 'tap') {
            const sections = mv.parseSections(currentSong().lyrics);
            const taps = record.timing?.taps || {};
            const next = syncTapIndex(sections, taps);
            if (next >= 0) { setTap(next, Math.round(currentTime() * 10) / 10); view.tapIndex = -1; renderMv(); }
        }
        else if (action === 'tap-line' || action === 'tap-line-undo' || action === 'tap-line-reset') {
            const lineTaps = { ...(record.timing?.lineTaps || {}) };
            if (action === 'tap-line') {
                if (!player.playing) { toastOk('先点播放，唱到这一句时再点。'); return true; }
                lineTaps[id] = Math.round(currentTime() * 10) / 10;
            } else if (action === 'tap-line-undo') {
                const order = mv.syncLines(record, currentSong()).map(l => l.key).filter(k => lineTaps[k] !== undefined);
                if (order.length) delete lineTaps[order.at(-1)];
            } else { for (const k of Object.keys(lineTaps)) delete lineTaps[k]; }
            mv.patchRecord(view.songId, { timing: { ...(record.timing || {}), lineTaps } });
            view.editorUndo.push({ timing: structuredClone(record.timing || {}), selected: { ...view.editorTiming }, tapIndex: view.tapIndex });
            if (action === 'tap-line-reset') view.editorTiming = { kind: 'line', key: '' };
            renderMv();
        }
        else if (action === 'tap-vocal') {
            if (!player.playing) { toastOk('先点播放，听到第一句歌词时再点。'); }
            else { setTap(Number(id) || 0, Math.round(currentTime() * 10) / 10); toastOk('已对齐：之后的段落会跟着一起移动，需要时可以在“对时间”里细调。'); renderMv(); }
        }
        else if (action === 'tap-undo') {
            const previous = view.tapUndo.at(-1);
            const taps = previous ? { ...previous.taps } : { ...(record.timing?.taps || {}) };
            const keys = Object.keys(taps).filter(k => taps[k] !== null && taps[k] !== undefined).map(Number).sort((a, b) => b - a);
            if (previous || keys.length) {
                if (!previous) delete taps[keys[0]];
                mv.patchRecord(view.songId, { timing: { ...(record.timing || {}), taps } });
                if (previous) view.tapUndo.pop();
                view.tapIndex = previous ? previous.index : keys[0]; renderMv();
            }
        }
        else if (action === 'tap-reset') {
            mv.patchRecord(view.songId, { timing: { taps: {}, shift: 0 } });
            view.editorUndo.push({ timing: structuredClone(record.timing || {}), selected: { ...view.editorTiming }, tapIndex: view.tapIndex });
            view.tapIndex = -1; view.tapUndo = []; view.editorTiming = { kind: view.sub === 'sync' ? 'section' : 'line', key: '' }; renderMv();
        }
        else if (action === 'nudge') {
            const [index, delta] = id.split(':').map(Number);
            const value = Number(record.timing?.taps?.[index]);
            if (Number.isFinite(value)) { setTap(index, Math.max(0, Math.round((value + delta) * 10) / 10)); renderMv(); }
        }
    } catch (error) { toastError(error); }
    return true;
}

export function handleMvChange(event) {
    const input = event.target;
    if (input?.matches?.('[data-rmt-mv-music-link]')) { view.musicLinkInput = input.value; return true; }
    if (input?.matches?.('[data-rmt-mv-seek]')) { if (!player.exporting && view.cache?.record) seekEditor(input.value); return true; }
    if (input?.matches?.('[data-rmt-mv-editor-time]')) { try { if (String(input.value).trim() && !player.exporting) saveEditorTime(Number(input.value)); } catch (error) { toastError(error); } return true; }
    if (input?.matches?.('[data-rmt-mv-editor-next]')) { view.editorAutoNext = !!input.checked; return true; }
    if (input?.matches?.('[data-rmt-mv-stage-cue]')) {
        const field = input.dataset.rmtMvStageCue;
        try { const updated = mv.patchStageCue(view.songId, input.dataset.shot, { [field]: field === 'shadow' ? Boolean(input.checked) : input.value });
            if (view.cache) view.cache.record = updated; drawNow(); }
        catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-stage-bg]')) {
        const field = input.dataset.rmtMvStageBg, id = input.dataset.background;
        try {
            let patch = { [field]: input.value };
            if (/^color[0-2]$/.test(field)) {
                const bg = currentRecord()?.stage?.backgrounds.find(b => b.id === id);
                if (!bg) return true;
                const colors = [...bg.colors]; colors[Number(field.at(-1))] = input.value; patch = { colors };
            }
            mv.patchStageBackground(view.songId, id, patch);
            view.stageBackgroundOpen = id;
            const scroll = body()?.scrollTop || 0; renderMv(); if (body()) body().scrollTop = scroll;
        } catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-overlay]')) {
        const key = input.dataset.rmtMvOverlay === 'keyword' ? 'showKeyword' : input.dataset.rmtMvOverlay === 'motif' ? 'showMotif' : '';
        if (key) {
            try { mv.patchTegaki(view.songId, { [key]: Boolean(input.checked) }); } catch (error) { toastError(error); }
            renderMv();
        }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-intro-seconds]') || input?.matches?.('[data-rmt-mv-outro-seconds]')) {
        const key = input.matches('[data-rmt-mv-outro-seconds]') ? 'outroSeconds' : 'introSeconds';
        const seconds = String(input.value ?? '').trim() ? Number(input.value) : NaN;
        if (Number.isFinite(seconds) && seconds >= 0) {
            try { mv.patchTegaki(view.songId, { [key]: seconds }); } catch (error) { toastError(error); }
        }
        input.value = String(mv.tegakiOptions(currentRecord())[key]);
        renderMv();
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-story-type]')) {
        const storyType = mv_direction.directionOf(input.value).id;
        try {
            if (input.dataset.rmtMvScope === 'record') { const record = currentRecord(); mv.patchRecord(view.songId, { settings: { ...record.settings, storyType } }); }
            else view.draft = mv.normalizeSettings({ ...view.draft, storyType });
        } catch (error) { toastError(error); }
        renderMv(); return true;
    }
    if (input?.matches?.('[data-rmt-mv-person-look]')) {
        try {
            const record = currentRecord();
            const cast = structuredClone(input.dataset.rmtMvScope === 'draft' ? view.castDraft : record?.cast || view.castDraft);
            const id = input.dataset.rmtMvPersonLook;
            if (cast?.people.some(person => person.id === id)) {
                cast.appearances = [...(cast.appearances || []).filter(row => row.participantId !== id), { participantId: id, tag: input.value, nl: '', manual: true }];
                const saved = mv.saveMvCast(view.songId, cast);
                if (saved) view.castDraft = structuredClone(saved.cast);
            }
        } catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-person-outfit]')) {
        try {
            const record = currentRecord(), id = input.dataset.rmtMvPersonOutfit;
            if (record?.cast?.people.some(person => person.id === id)) mv.patchWardrobe(view.songId, { characters: [
                ...(record.wardrobe?.characters || []).filter(row => row.participantId !== id), { participantId: id, clothing: input.value },
            ] });
        } catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-binding]')) {
        try {
            const panel = input.closest('[data-rmt-mv-binding-group]');
            if (panel) {
                const cast = [...panel.querySelectorAll('[data-rmt-mv-binding-person]')].flatMap(row => {
                    if (!row.querySelector('[data-rmt-mv-binding="selected"]')?.checked) return [];
                    const field = key => row.querySelector(`[data-rmt-mv-binding="${key}"]`)?.value || '';
                    return [{ participantId: row.dataset.rmtMvBindingPerson, position: field('position'), action: field('action'), visible: field('visible') || 'full' }];
                });
                mv.patchMvShotCast(view.songId, panel.dataset.rmtMvBindingGroup, cast);
                if (input.type === 'checkbox') {
                    const groupId = panel.dataset.rmtMvBindingGroup;
                    renderMv();
                    for (const next of document.querySelectorAll('[data-rmt-mv-binding-group]')) {
                        if (next.dataset.rmtMvBindingGroup === groupId) next.open = true;
                    }
                }
            }
        } catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-export-range]')) {
        const record = currentRecord(), song = currentSong();
        if (!record || !song) return true;
        const o = mv.exportOptions(record, song);
        const idx = mv.selectedSectionIndexes(mv.parseSections(song.lyrics), o.range, o.rangeFrom, o.rangeTo);
        const key = input.dataset.rmtMvExportRange === 'to' ? 'rangeTo' : 'rangeFrom';
        try { mv.patchRecord(view.songId, { exportRange: { range: 'custom', rangeFrom: idx[0] ?? 0, rangeTo: idx.at(-1) ?? 0, [key]: Math.max(0, Number(input.value) || 0) } }); } catch (error) { toastError(error); }
        renderMv();
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-audio]')) {
        const file = input.files?.[0];
        if (file) { input.value = ''; cancelMusicLink(); view.musicLinkInput = ''; void acceptAudio(file, file.name, true); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-image]')) {
        const file = input.files?.[0];
        const shotId = input.dataset.rmtMvId || '';
        const context = ctx();
        if (!file || !context || !shotId) return true;
        if (!/^image\//.test(file.type || '')) { toastError(core_text.safeUserError('请选择图片文件。', 'RMT_MV_IMAGE')); return true; }
        try {
            const target = mv.captureMvTarget(context, view.songId), opened = viewTarget();
            if (!target.base.songs[target.songId]?.shots?.some(s => s.id === shotId)) return true;
            const slot = mv_media.mediaKey('img', target.scope, target.songId, shotId);
            const key = mv_media.mediaKey('img', target.scope, target.songId, `${shotId}:${Date.now()}:${++mediaSequence}`);
            imageImports.set(slot, key);
            // Save new bytes without replacing the old blob. Bind the commit to the
            // captured shot, and ignore a file superseded by another manual import.
            void mv_media.putMedia(key, file, file.name).then(async ok => {
                if (imageImports.get(slot) !== key) return;
                if (!ok) throw core_text.safeUserError('图片未能保存，原图已保留，请重试。', 'RMT_MV_SAVE_FAILED');
                localUrls.set(key, URL.createObjectURL(file));
                reportResult(await mv.saveFrameImage(target, shotId, { local: key, at: Date.now() }), '图片已保存。');
                if (isView(opened)) renderMv();
            }).catch(toastError).finally(() => { if (imageImports.get(slot) === key) imageImports.delete(slot); });
        } catch (error) { toastError(error); }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-split]')) {
        try { mv.setAssetSplit(view.songId, input.dataset.rmtMvSplit, input.value); } catch (error) { toastError(error); }
        renderMv(); drawNow();
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-wardrobe]')) {
        const key = input.dataset.rmtMvWardrobe;
        if (['era', 'char', 'user'].includes(key)) { try { mv.patchWardrobe(view.songId, { [key]: core_text.normalizeText(input.value, 300) }); } catch (error) { toastError(error); } }
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-range]')) {
        const key = input.dataset.rmtMvRange === 'to' ? 'rangeTo' : 'rangeFrom';
        const value = Math.max(0, Number(input.value) || 0);
        try {
            if (input.dataset.rmtMvScope === 'draft') view.draft = mv.normalizeSettings({ ...view.draft, [key]: value });
            else mv.patchTegaki(view.songId, { [key]: value });
        } catch (error) { toastError(error); }
        renderMv();
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-subtitles]')) {
        try { mv.patchRecord(view.songId, { subtitles: !!input.checked }); drawNow(); } catch (error) { toastError(error); }
        return true;
    }
    return false;
}

// ---------- 手书 v2：构图卡片 ----------

function assetTile(record, key, label) {
    const found = mv.assetOf(record, key);
    // Opening a material list must not cut out every full-resolution picture.
    // The small padding-only preview is made only for the expanded group.
    const url = thumbnailPreview(assetImageUrl(found?.image));
    const exists = mv.hasAssetImage(found?.image);
    const drawing = mv.isAssetDrawing(mv.mvScope(ctx()), view.songId, key);
    const wide = mv.normalizeSettings(record.settings).ratio === '16:9';
    const splitSelect = `<div class="rmt-mv-asset-actions">${btn('edit-asset', '编辑素材', { id: key, cls: 'rmt-mv-edit-open' })}${exists && found?.kind !== 'bg' ? btn('cutout-asset', '一键抠图', { id: key, disabled: drawing || view.drawingAll }) : ''}</div>`;
    return `<button type="button" class="rmt-mv-asset${wide ? ' wide' : ''}${exists ? ' done' : ''}" data-rmt-mv-anchor="${esc(key)}" data-rmt-mv="draw-asset" data-rmt-mv-id="${esc(key)}" ${drawing || view.drawingAll ? 'disabled' : ''} aria-label="${esc(label)}：${exists ? '重画' : '画'}这一张">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : ''}<i>${drawing ? '画…' : exists ? '已画' : '未画'}</i></button><small>${esc(label)}</small>${splitSelect}`;
}

// 素材检查：原图 → 拼图拆分 → 抠图结果 → 播放时的用法，逐张对照。
function inspectHtml(record, g, diffs) {
    const rows = (view.inspect === g.id ? diffs : []).filter(d => mv.hasAssetImage(d.image)).map(d => {
        const sprite = characterSprite(d.image, g);
        const url = inspectionPreview(sprite, assetImageUrl(d.image)), original = assetImageUrl(d.image.original || d.image);
        const layered = !!sprite?.image;
        return `<div class="rmt-mv-inspect-row${mv.normalizeSettings(record.settings).ratio === '16:9' ? ' wide' : ''}"><figure>${original ? `<img src="${esc(original)}" alt="原图">` : ''}<figcaption>原图</figcaption></figure>
          <figure class="cut">${url ? `<img src="${esc(url)}" alt="当前素材">` : ''}<figcaption>当前素材</figcaption></figure>
          <div><b>${esc(d.label)}</b><small>${d.image.crop ? '已手动选定画面' : '可在编辑素材中选单格'}</small><small>播放时：${layered ? '透明人物叠背景' : '完整画面'}</small>
          ${btn('edit-asset', '选单格／抠图／提示词', { id: `${g.id}:${d.id}` })}</div></div>`;
    }).join('');
    const layerTools = `<div class="rmt-mv-actions">${btn('group-layer', g.layer === 'full' ? '绘图方式：完整画面 · 改为分层素材' : '绘图方式：分层素材 · 改为完整画面', { id: `${g.id}:${g.layer === 'full' ? 'cutout' : 'full'}` })}</div>
      <p class="rmt-x-note">透明素材直接使用，纯色底自动处理；拼图或复杂背景可在编辑素材中调整。</p>`;
    return `<details class="rmt-mv-inspect"${view.inspect === g.id ? ' open' : ''}><summary data-rmt-mv="inspect" data-rmt-mv-id="${esc(g.id)}">素材检查（画面有问题时再打开）</summary>${rows}${layerTools}</details>`;
}

function sharedBackgroundsHtml(record, shots) {
    const backgrounds = mv_stage.usedBackgrounds(record, shots);
    if (!backgrounds.length) return '';
    const wide = mv.normalizeSettings(record.settings).ratio === '16:9';
    const tiles = backgrounds.map(bg => {
        const key = `stage:${bg.id}`, drawn = bg.kind === 'image' && mv.hasAssetImage(bg.image);
        const drawing = mv.isAssetDrawing(mv.mvScope(ctx()), view.songId, key);
        let preview = bg.kind === 'image' ? thumbnailPreview(assetImageUrl(bg.image)) : '';
        if (bg.kind !== 'image') {
            try { const c = document.createElement('canvas'); c.width = wide ? 320 : 180; c.height = wide ? 180 : 320;
                stage_canvas.drawBackground(c.getContext('2d'), bg, c.width, c.height, 0); preview = c.toDataURL('image/png'); } catch { /* Host without Canvas preview. */ }
        }
        const select = (field, label, values, value) => `<label class="rmt-mv-look"><span>${label}</span><select data-rmt-mv-stage-bg="${field}" data-background="${esc(bg.id)}">${Object.entries(values).map(([id, name]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
        return `<div class="rmt-mv-background-tile"><div class="rmt-mv-assets"><div><button type="button" class="rmt-mv-asset${wide ? ' wide' : ''}${drawn ? ' done' : ''}" data-rmt-mv-anchor="${esc(key)}" data-rmt-mv="draw-asset" data-rmt-mv-id="${esc(key)}" aria-label="${esc(bg.label)}：${drawn ? '重画背景' : '生成背景'}" ${drawing || view.drawingAll ? 'disabled' : ''}>${preview ? `<img src="${esc(preview)}" alt="">` : ''}<i>${drawing ? '画…' : bg.kind !== 'image' ? '本地图案' : drawn ? '已画' : '未画'}</i></button></div></div>
          <div><b>${esc(bg.label)}</b><div class="rmt-mv-actions">${btn('draw-asset', drawn ? '重画背景' : '生成背景', { id: key, disabled: drawing || view.drawingAll })}${btn('edit-asset', '编辑素材', { id: key })}</div></div>
          <details${view.stageBackgroundOpen === bg.id ? ' open' : ''}><summary>背景样式</summary>${select('kind', '背景类型', mv_stage.BACKGROUNDS, bg.kind)}${select('motion', '背景运动', { still: '不动', rotate: '缓慢旋转', drift: '轻微移动' }, bg.motion)}
          <div class="rmt-mv-actions">${bg.colors.map((c, i) => `<label>配色 ${i + 1}<input type="color" value="${esc(c)}" data-rmt-mv-stage-bg="color${i}" data-background="${esc(bg.id)}"></label>`).join('')}</div></details></div>`;
    }).join('');
    return `<section class="rmt-x-card rmt-mv-backgrounds"><b>共享背景</b><div class="rmt-mv-background-grid">${tiles}</div></section>`;
}

function renderGroupsBoard(song, record) {
    const sections = mv.parseSections(song.lyrics);
    const keys = mv.assetKeys(record, song);
    const drawn = keys.filter(k => mv.hasAssetImage(mv.assetOf(record, k)?.image)).length;
    const remaining = keys.length - drawn;
    const palette = coverPalette(song);
    const o = mv.tegakiOptions(record);
    let inRangeList;
    try { inRangeList = mv.shotsInRange(record, song).map(s => s.id); } catch { inRangeList = record.shots.map(s => s.id); }
    const inRange = new Set(inRangeList);
    let shown = 0;
    const cards = record.groups.map(g => {
        const frames = record.shots.filter(s => s.group === g.id && inRange.has(s.id));
        if (!frames.length) return '';
        shown += 1;
        const secNames = [...new Set(frames.map(s => sections[s.sectionIndex]?.name).filter(Boolean))].join('、');
        const usedDiffs = g.diffs.filter(d => frames.some(s => s.diff === d.id));
        const open = view.groupOpen === g.id || view.inspect === g.id;
        const summary = `<summary data-rmt-mv="group-open" data-rmt-mv-id="${esc(g.id)}" aria-expanded="${open}"><b>构图 ${shown} · ${esc(g.composition || '')}</b><small>${esc(secNames)} · ${frames.length} 句 ${open ? '⌄' : '›'}</small></summary>`;
        if (!open) return `<details class="rmt-mve-group-fold">${summary}</details>`;
        const lyrics = frames.filter(s => s.lyric).slice(0, 8).map(s => `${g.diffs.find(d => d.id === s.diff)?.label || ''}｜${s.lyric}`).join('\n');
        const bgIds = g.layer === 'full' || g.stageBackground ? [] : (g.bgs || []).length ? g.bgs.filter(b => frames.some(s => (s.bg || 'B1') === b.id)).map(b => b.id) : ['bg'];
        const bgKeys = g.layer === 'full' || g.stageBackground ? [] : bgIds.length ? bgIds : ['bg'];
        const bgTiles = bgKeys.map(id => `<div>${assetTile(record, `${g.id}:${id}`, (g.bgs || []).find(b => b.id === id)?.label ? '背景·' + g.bgs.find(b => b.id === id).label : '背景')}</div>`).join('');
        const missing = [...bgKeys.map(id => `${g.id}:${id}`), ...usedDiffs.map(d => `${g.id}:${d.id}`)].filter(k => !mv.hasAssetImage(mv.assetOf(record, k)?.image)).length;
        return `<details class="rmt-mve-group-fold" open>${summary}<article class="rmt-mv-gcard">
          ${cast_controls.shotCastControls(record, g)}
          ${g.stageBackground ? `<small>背景：${mv_stage.usedBackgrounds(record, frames).map(b => esc(b.label)).join('、')} · 共用</small>` : ''}
          <div class="rmt-mv-assets">${bgTiles}${bgTiles ? '<span class="rmt-mv-plus">+</span>' : ''}${usedDiffs.map(d => `<div>${assetTile(record, `${g.id}:${d.id}`, d.label)}</div>`).join('')}</div>
          ${inspectHtml(record, g, usedDiffs)}
          ${lyrics ? `<div class="rmt-mv-lyric"><p>${esc(lyrics)}</p></div>` : ''}
          <div class="rmt-mv-actions">${missing ? btn('draw-group', `画这一组剩下的 ${missing} 张`, { id: g.id, disabled: view.drawingAll, cls: 'rmt-x-primary' }) : btn('redraw-group', '整组换一版', { id: g.id, disabled: view.drawingAll })}</div>
          <p class="rmt-x-note">点任意一张缩略图可以单独重画。</p>
          ${g.link ? `<div class="rmt-mv-link">↓ 承接：${esc(g.link)}</div>` : ''}</article></details>`;
    }).join('');
    const motif = record.motif ? `<section class="rmt-x-card"><div class="rmt-x-row-head"><b>意象：${esc(record.motif.name || '装饰')}</b><span>副歌时漂浮</span></div><div class="rmt-mv-assets"><div>${assetTile(record, 'motif', '意象')}</div></div>${motifNotice(record)}</section>` : '';
    const wd = record.wardrobe || {};
    const wardrobe = `<details class="rmt-x-card"${wd.char || wd.era ? '' : ' open'}><summary><b>时代与衣着</b>（每一张都用同一套）</summary>
      <label class="rmt-mv-look"><span>时代 / 场景</span><input type="text" maxlength="200" data-rmt-mv-wardrobe="era" value="${esc(wd.era || '')}"></label>
      ${record.cast ? '' : `<label class="rmt-mv-look"><span>他的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="char" value="${esc(wd.char || '')}"></label>
      ${mv.normalizeSettings(record.settings).appear === 'none' ? '' : `<label class="rmt-mv-look"><span>你的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="user" value="${esc(wd.user || '')}"></label>`}`}
      <p class="rmt-x-note">改完之后重画的图才会生效。</p></details>`;
    const warn = mv.frameNeedsUserLooks(record, ctx()) && record.groups.some(g => g.who === 'both' || g.who === 'user') ? `<div class="rmt-mv-warn">还没有填写你的外貌，画出来的你可能每张不一样。</div>${looksEditor()}` : '';
    page('构图卡片', '印象曲', `${head(song.title + ' · 手书', '构图卡片', '按歌曲安排关键画面，需要时复用素材或追加差分。')}
      <section class="rmt-mv-palette"><span class="rmt-mv-cover">${coverUrl(song) ? `<img src="${esc(coverUrl(song))}" alt="">` : ''}</span><div><b>从封面取色</b><span>${palette.map(c => `<i style="background:${c}"></i>`).join('')}</span></div><small>片头片尾<br>用封面</small></section>
      <section class="rmt-x-card"><b>做哪一段</b>${rangePicker('record', o, sections)}${continueControl(record, song)}</section>
      ${cast_controls.directionControls(song, record.settings, 'record')}
      ${record.cast ? cast_controls.castControls(record.cast, record.settings, wd, 'record') : btn('edit-cast', '设置本曲人物／世界书')}
      <section class="rmt-x-card"><div class="rmt-x-row-head"><b>已画 ${drawn} / ${keys.length} 张</b><span>${esc(mv.playRange(record, song).label)}</span></div>
        <div class="rmt-x-bar"><i style="width:${keys.length ? Math.round(drawn / keys.length * 100) : 0}%"></i></div>
        ${remaining ? btn(view.drawingAll ? 'draw-stop' : 'draw-all', view.drawingAll ? '停止连续绘制' : `一次画完剩下的 ${remaining} 张（会用 ${remaining} 次生图）`) : ''}
        ${btn('go-tegaki', '去剪辑台预览', { cls: 'rmt-x-primary' })}</section>
      ${wardrobe}${warn}${sharedBackgroundsHtml(record, record.shots.filter(s => inRange.has(s.id)))}${cards || '<p class="rmt-x-note">选中的段落里还没有构图，点上面的“继续分镜”即可补上。</p>'}${motif}
      <div class="rmt-mv-actions">${btn('rewrite-board', '重新写分镜')}</div>`);
}

// ---------- 手书 v2：抠图、取色、渲染 ----------

const characterSprites = new Map();
const palettes = new Map();
const motifSprites = new Map();
const thumbnailPreviews = new Map();

function thumbnailPreview(url) {
    if (!url) return '';
    if (thumbnailPreviews.has(url)) return thumbnailPreviews.get(url);
    const src = imageFor(url);
    thumbnailPreviews.set(url, url);
    if (!src) {
        const pending = images.get(url);
        if (pending) {
            const before = pending.onload;
            pending.onload = event => {
                thumbnailPreviews.delete(url); before?.(event);
                if (isView() && view.sub === 'board') queueImageRefresh(true);
            };
        }
        return url;
    }
    try {
        const scale = Math.min(1, 512 / Math.max(src.naturalWidth, src.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.naturalWidth * scale)); c.height = Math.max(1, Math.round(src.naturalHeight * scale));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
        const rect = image_tools.previewContentRect(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (rect) {
            const cropped = document.createElement('canvas'); cropped.width = rect.w; cropped.height = rect.h;
            cropped.getContext('2d').drawImage(c, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
            cacheValue(thumbnailPreviews, url, cropped.toDataURL('image/png'), 32);
        }
    } catch { /* Pixel access unavailable: retain the original preview and editor. */ }
    return thumbnailPreviews.get(url);
}

function motifSprite(image) {
    const url = assetImageUrl(image);
    if (!url) return null;
    const cached = motifSprites.get(url);
    if (cached && cached.status !== 'loading') return cached;
    const src = imageFor(url);
    if (!src) {
        if (!cached && images.has(url)) {
            motifSprites.set(url, { status: 'loading' });
            const pending = images.get(url), before = pending.onload;
            const refresh = () => { if (runtimeState.activeMode === MV_MODE && assetImageUrl(view.cache?.record?.motif?.image) === url) queueImageRefresh(); };
            pending.onload = event => { motifSprites.delete(url); before?.(event); refresh(); };
            pending.onerror = () => { motifSprites.set(url, { status: 'unreadable' }); refresh(); };
        }
        return null;
    }
    let result;
    try {
        // These tiny overlays use a bounded working raster, never overwrite the source.
        const scale = Math.min(1, 768 / Math.max(src.naturalWidth, src.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.naturalWidth * scale)); c.height = Math.max(1, Math.round(src.naturalHeight * scale));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
        const pixels = g.getImageData(0, 0, c.width, c.height);
        const prepared = image_tools.prepareMotifPixels(pixels.data, c.width, c.height);
        result = { status: prepared.status };
        if (prepared.status === 'transparent') result = { status: 'transparent', image: src, preview: url };
        else if (prepared.data) {
            pixels.data.set(prepared.data); g.putImageData(pixels, 0, 0);
            result = { status: 'prepared', image: c };
        }
    } catch { result = { status: 'unreadable' }; }
    motifSprites.set(url, result);
    return result;
}

function motifNotice(record) {
    const sprite = motifSprites.get(assetImageUrl(record?.motif?.image));
    if (!sprite || ['loading', 'transparent', 'prepared'].includes(sprite.status)) return '';
    return `<div class="rmt-x-note">意象背景尚未分离，暂不叠加。${btn('edit-asset', '处理意象背景', { id: 'motif' })}</div>`;
}

// The album cover belongs to the song. Character cells are chosen in the editor.
function coverUrl(song) { return song?.visual?.cgImage?.url || song?.cgImage?.url || ''; }

function cropFor(url, img, override) {
    const split = ['left', 'right', 'top', 'bottom'].includes(override) ? override : 'none';
    const w = img.naturalWidth, h = img.naturalHeight;
    const rect = { left: [0, 0, w / 2, h], right: [w / 2, 0, w / 2, h], top: [0, 0, w, h / 2], bottom: [0, h / 2, w, h / 2] }[split] || [0, 0, w, h];
    return { split, rect };
}

function drawCropCover(g, img, rect, w, h, scale = 1) {
    const [sx, sy, sw, sh] = rect;
    const r = Math.max(w / sw, h / sh) * scale;
    const dw = sw * r, dh = sh * r;
    g.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// All foreground paths use this for an already composed local insert, including
// complete pictures and unreadable/opaque cutout fallbacks. Preserve the whole
// selected cell. Backgrounds and standing stage actors keep their own placement.
function drawFittedInsert(g, img, rect, w, h, zoom = 1) {
    const [sx, sy, sw, sh] = rect;
    const scale = Math.min(w / sw, h / sh) * Math.min(1, Math.max(0.01, zoom));
    const width = sw * scale, height = sh * scale, x = (w - width) / 2, y = (h - height) / 2;
    g.drawImage(img, sx, sy, sw, sh, x, y, width, height);
    return { x, y, width, height };
}

// A bounded, display-only derived copy serves playback and export; originals
// and manually saved masks are never overwritten by automatic processing.
function characterSprite(image, group) {
    if (!image || image.editMode === 'full' || (group?.layer === 'full' && image.editMode !== 'cutout')) return null;
    const url = assetImageUrl(image);
    if (!url) return null;
    const multiple = group?.who === 'both' || (group?.cast?.length || 0) > 1;
    const key = JSON.stringify([url, image.editMode || '', image.split || 'none', multiple]);
    const cached = characterSprites.get(key);
    if (cached) return cacheValue(characterSprites, key, cached, 8);
    const src = imageFor(url);
    if (!src) return null;
    let result;
    try {
        const crop = cropFor(url, src, image.split);
        // Playback/export output is 960px. Process only a display-sized derived
        // raster; the editor and saved originals remain at full resolution.
        const scale = Math.min(1, 960 / Math.max(crop.rect[2], crop.rect[3]));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(crop.rect[2] * scale)); c.height = Math.max(1, Math.round(crop.rect[3] * scale));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, ...crop.rect, 0, 0, c.width, c.height);
        const pixels = g.getImageData(0, 0, c.width, c.height);
        const prepared = image_tools.prepareCharacterPixels(pixels.data, c.width, c.height, { multiple, manual: image.editMode === 'cutout' });
        result = { status: prepared.status, key };
        if (prepared.data) {
            const unchanged = prepared.status === 'transparent' && crop.split === 'none';
            if (!unchanged) { pixels.data.set(prepared.data); g.putImageData(pixels, 0, 0); }
            result = { ...result, image: unchanged ? src : c, source: url,
                bounds: { ...image_tools.alphaBounds(prepared.data, c.width, c.height), edges: image_tools.alphaEdgeContacts(prepared.data, c.width, c.height) } };
        }
    } catch { result = { status: 'unreadable', key }; }
    return cacheValue(characterSprites, key, result, 8);
}

function inspectionPreview(sprite, fallback) {
    if (!sprite?.image || sprite.image.naturalWidth) return fallback;
    if (sprite.preview) return sprite.preview;
    try {
        const src = sprite.image, scale = Math.min(1, 320 / Math.max(src.width, src.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * scale)); c.height = Math.max(1, Math.round(src.height * scale));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        sprite.preview = c.toDataURL('image/png');
        return sprite.preview;
    } catch { return fallback; }
}

function coverPalette(song) {
    const fallback = ['#2f3a45', '#7d8fa3', '#f1e6d6'];
    const url = coverUrl(song);
    if (!url) return fallback;
    if (palettes.has(url)) return palettes.get(url);
    const img = imageFor(url);
    if (!img) return fallback;
    try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        const lum = p => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
        px.sort((a, b) => lum(a) - lum(b));
        const avg = arr => { const s = arr.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]); return `rgb(${s.map(v => Math.round(v / Math.max(1, arr.length))).join(',')})`; };
        const n = px.length;
        const result = [avg(px.slice(0, Math.floor(n * 0.2))), avg(px.slice(Math.floor(n * 0.4), Math.floor(n * 0.6))), avg(px.slice(Math.floor(n * 0.85)))];
        palettes.set(url, result);
        return result;
    } catch { palettes.set(url, fallback); return fallback; }
}

function isChorusSection(song, index) { return /^(final )?chorus|^hook/i.test(mv.parseSections(song.lyrics)[index]?.tag || ''); }

const stageShadows = new Map();
function silhouette(url, source) {
    if (!stageShadows.has(url)) {
        const c = document.createElement('canvas'); c.width = source.naturalWidth || source.width; c.height = source.naturalHeight || source.height;
        const g = c.getContext('2d'); g.drawImage(source, 0, 0); g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#10131c'; g.fillRect(0, 0, c.width, c.height); stageShadows.set(url, c);
    }
    return stageShadows.get(url);
}

function drawSceneText(g, info, record, w, h, pass) {
    if (!info?.stage || mv.tegakiOptions(record).lyric !== 'stage') return;
    const { stage, group, subject, opaque } = info;
    const font = mv.TEGAKI_FONTS[mv.tegakiOptions(record).font] || mv.TEGAKI_FONTS.sans;
    const main = opaque ? { ...stage, text: stage.lyric || stage.text } : stage;
    const normal = value => String(value || '').replace(/[\s\p{P}\p{S}]/gu, '');
    const separateLyric = !opaque && stage.lyric && normal(stage.text) !== normal(stage.lyric);
    // A crowded keyword layout must not fall back onto the full lyric's lane.
    stage_canvas.drawText(g, main, group, w, h, font, opaque, { subject, pass, suppressBanner: !!separateLyric });
    // Keywords may remain behind the actor, but the only copy of a complete
    // lyric must never be hidden there. Full lyric text is drawn once in front.
    if (separateLyric && pass === 'front')
        stage_canvas.drawText(g, { ...stage, text: stage.lyric }, group, w, h, font, true);
}

function drawSceneV2(g, record, song, rows, index, t, w, h, showText = true) {
    const row = rows[index];
    const group = record.groups.find(x => x.id === row.shot.group);
    const stageRows = record.stage && Array.isArray(record.clipSectionIndexes) ? mv.shotTimeline(record, song).rows : rows;
    const stageIndex = stageRows === rows ? index : stageRows.findIndex(r => r.shot.id === row.shot.id);
    const stage = mv_stage.state(record, stageRows, stageIndex, t);
    const info = { stage, group, subject: null, opaque: false };
    g.fillStyle = coverPalette(song)[0]; g.fillRect(0, 0, w, h);
    const span = stage ? groupSpan(stageRows, stageIndex) : groupSpan(rows, index);
    const p = Math.min(1, Math.max(0, (t - span.start) / Math.max(0.1, span.end - span.start)));
    const push = group?.motion === 'push' ? 1 + 0.03 * p : 1;
    const diff = group?.diffs.find(d => d.id === row.shot.diff);
    const detail = stage_canvas.isDetailInsert(group, diff, row.shot);
    const ownImage = mv.hasAssetImage(row.shot.image) ? row.shot.image : null;
    const ownFull = ownImage && (!stage || ownImage.editMode === 'full' || (group?.layer === 'full' && ownImage.editMode !== 'cutout'));
    if (!detail && ownFull) {
        const own = imageFor(assetImageUrl(ownImage));
        if (own) drawCover(g, own, w, h, push, 0, 0);
        info.opaque = true; return info;
    }
    const bgRow = (group?.bgs || []).find(b => b.id === (row.shot.bg || 'B1')) || (group?.bgs || [])[0];
    if (stage) stage_canvas.drawBackground(g, stage.background, w, h, stage.backgroundTime, stage.cue.tone,
        stage.background.kind === 'image' ? imageFor(assetImageUrl(stage.background.image)) : null);
    else {
        const bg = imageFor(assetImageUrl(bgRow?.image || group?.bg));
        if (bg) drawCover(g, bg, w, h, push, 0, 0);
    }
    const art = ownImage || diff?.image;
    const override = art?.split || 'auto';
    const url = assetImageUrl(art), raw = imageFor(url);
    const sprite = ownFull ? null : characterSprite(art, group), person = sprite?.image;
    if (detail && (person || raw)) {
        // Run before every cover fallback: full images, single-shot overrides,
        // failed cutouts and old non-stage records need the same composition.
        const source = person || raw;
        const pw = source.naturalWidth || source.width, ph = source.naturalHeight || source.height;
        const rect = person ? [0, 0, pw, ph] : cropFor(url, source, override).rect;
        const zoom = group?.motion === 'push' ? push / 1.03 : 1;
        // Local inserts use foreground captions, so no text is lost beneath
        // an opaque saved picture or an unprocessed matte.
        info.opaque = true;
        info.subject = drawFittedInsert(g, source, rect, w, h, zoom);
        return info;
    }
    if (raw && !person) {
        drawCropCover(g, raw, cropFor(url, raw, override).rect, w, h, push);
        if (!stage) { g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.1; g.fillStyle = coverPalette(song)[1]; g.fillRect(0, 0, w, h); g.restore(); }
        info.opaque = true; return info;
    }
    if (person) {
        const pw = person.naturalWidth || person.width, ph = person.naturalHeight || person.height;
        const placement = stage_canvas.foregroundPlacement(sprite.bounds, pw, ph, group, w, h);
        const breathe = stage || placement.attached ? 1 : 1 + 0.004 * Math.sin(t * Math.PI * 2 / 3.4);
        const { x: dx, y: dy, width: dw, height: dh } = placement;
        // Reserve the maximum push/pop extent so letters do not disappear
        // behind a moving arm between two frames of the same shot.
        const reserve = w * .045, slide = stage?.entrance === 'slide' ? w * .08 : 0;
        info.subject = { ...placement.subject, x: placement.subject.x - reserve - slide, width: placement.subject.width + reserve * 2 + slide };
        if (showText) drawSceneText(g, info, record, w, h, 'back');
        g.save();
        if (stage?.active) {
            const motion = stage_canvas.poseTransform(stage, w, h);
            g.translate(placement.attachedX ? 0 : motion.x, motion.y); g.translate(placement.anchorX, placement.foot); g.scale(motion.scale, motion.scale); g.translate(-placement.anchorX, -placement.foot);
        }
        g.translate(placement.anchorX, placement.foot); g.scale(push * breathe, push * breathe); g.translate(-placement.anchorX, -placement.foot);
        if (stage && placement.grounded) {
            // A small ground contact anchors full-body/wide shots; no duplicate
            // upright silhouette floating alongside the actor.
            const sx = placement.subject.x + placement.subject.width / 2;
            const sw = Math.min(placement.subject.width * .3, h * .18);
            g.save(); g.globalAlpha *= stage.cue.shadow ? .24 : .14; g.fillStyle = '#161c23';
            g.beginPath(); g.ellipse(sx, placement.foot, sw, Math.max(2, h * .009), 0, 0, Math.PI * 2); g.fill(); g.restore();
        } else if (stage?.cue.shadow) {
            g.save(); g.globalAlpha *= .16; g.drawImage(silhouette(sprite.key, person), dx - w * .006, dy, dw, dh); g.restore();
        }
        g.drawImage(person, dx, dy, dw, dh); g.restore();
    } else if (showText) drawSceneText(g, info, record, w, h, 'back');
    if (!stage) { g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.14; g.fillStyle = coverPalette(song)[1]; g.fillRect(0, 0, w, h); g.restore(); }
    return info;
}

function drawMotif(g, record, song, row, t, w, h) {
    if (!mv.hasAssetImage(record.motif?.image) || !isChorusSection(song, row.sectionIndex)) return;
    const img = motifSprite(record.motif.image)?.image;
    if (!img) return;
    const size = Math.min(w, h) * 0.09;
    for (let i = 0; i < 7; i += 1) {
        const x = ((i + 0.5) / 7) * w + Math.sin(t * 0.6 + i * 1.7) * w * 0.04;
        const y = ((t * (0.05 + (i % 3) * 0.02) + i * 0.17) % 1.15) * h - size;
        g.save(); g.globalAlpha = 0.85; g.translate(x, y); g.rotate(Math.sin(t * 0.8 + i) * 0.6);
        g.drawImage(img, -size / 2, -size / 2, size, size * (img.naturalHeight || img.height) / Math.max(1, img.naturalWidth || img.width));
        g.restore();
    }
}

function drawVerticalLyric(g, text, w, h, since, color, fontStack) {
    const chars = Array.from(String(text || '')).filter(c => c.trim());
    if (!chars.length) return;
    const size = Math.round(Math.min(w, h) * 0.058);
    const perCol = Math.max(4, Math.floor(h * 0.62 / (size * 1.12)));
    const shown = Math.min(chars.length, Math.ceil(Math.max(0, since) / 0.07));
    g.save();
    g.font = `600 ${size}px ${fontStack}`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = size * 0.3; g.fillStyle = color;
    for (let i = 0; i < shown; i += 1) {
        const col = Math.floor(i / perCol), r = i % perCol;
        g.fillText(chars[i], w * 0.88 - col * size * 1.35, h * 0.08 + r * size * 1.12);
    }
    g.restore();
}

function drawTitleCard(g, song, w, h, alpha) {
    const palette = coverPalette(song);
    g.save(); g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.fillStyle = palette[0]; g.fillRect(0, 0, w, h);
    const cover = imageFor(coverUrl(song));
    const titleSize = Math.round(Math.min(w, h) * 0.075);
    if (cover && cover.naturalWidth > cover.naturalHeight && w >= h) {
        // 横版海报配横屏：整张铺满，底部压暗放歌名。
        drawCover(g, cover, w, h, 1, 0, 0);
        const shade = g.createLinearGradient(0, h * 0.55, 0, h);
        shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.65)');
        g.fillStyle = shade; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.textAlign = 'left';
        g.font = `700 ${titleSize}px ${mv.TEGAKI_FONTS.song.stack}`;
        g.fillText(song.title || '', w * 0.06, h * 0.86);
        g.font = `500 ${Math.round(titleSize * 0.42)}px ${mv.TEGAKI_FONTS.sans.stack}`;
        g.fillText('角色印象曲', w * 0.06, h * 0.86 + titleSize * 0.8);
        g.restore();
        return;
    }
    // 其他情况：按海报原比例完整显示，不裁成方形。
    let bottom = h * 0.5;
    if (cover) {
        const s = Math.min((w * 0.72) / cover.naturalWidth, (h * 0.62) / cover.naturalHeight);
        const cw = cover.naturalWidth * s, ch = cover.naturalHeight * s;
        const top = Math.max(h * 0.06, (h - ch - titleSize * 2.4) / 2);
        g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 30; g.drawImage(cover, (w - cw) / 2, top, cw, ch); g.restore();
        bottom = top + ch;
    }
    g.fillStyle = palette[2]; g.textAlign = 'center';
    g.font = `700 ${titleSize}px ${mv.TEGAKI_FONTS.song.stack}`;
    g.fillText(song.title || '', w / 2, bottom + titleSize * 1.3);
    g.font = `500 ${Math.round(titleSize * 0.42)}px ${mv.TEGAKI_FONTS.sans.stack}`;
    g.fillText('角色印象曲', w / 2, bottom + titleSize * 2.1);
    g.restore();
}

function renderFrameV2(canvas, record, song, t) {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const topt = mv.tegakiOptions(record);
    const beatLen = 60 / (mv.songBpm(song) || 90);
    const { rows, total } = mv.playbackTimeline(record, song);
    if (!rows.length) return total;
    let index = rows.findIndex(r => t >= r.start && t < r.end);
    if (index < 0) index = t < rows[0].start ? 0 : rows.length - 1;
    const row = rows[index];
    const stageInfo = drawSceneV2(g, record, song, rows, index, t, w, h);
    const prev = rows[index - 1];
    const since = t - row.start;
    const fadeDuration = transitionDuration(row, 0.35), flashDuration = transitionDuration(row, 0.16);
    if (prev && since >= 0 && prev.shot.group !== row.shot.group) {
        if (prev.shot.cut === 'fade' && since < fadeDuration) { g.save(); g.globalAlpha = 1 - since / fadeDuration; drawSceneV2(g, record, song, rows, index - 1, t, w, h, false); g.restore(); }
        else if (prev.shot.cut === 'flash' && since < flashDuration) { g.save(); g.globalAlpha = 0.85 * (1 - since / flashDuration); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.restore(); }
    }
    drawSceneText(g, stageInfo, record, w, h, 'front');
    if (since >= 0 && topt.showMotif) drawMotif(g, record, song, row, t, w, h);
    const palette = coverPalette(song);
    const font = mv.TEGAKI_FONTS[topt.font] || mv.TEGAKI_FONTS.sans;
    if (since >= 0 && topt.lyric === 'vertical') drawVerticalLyric(g, row.shot.lyric, w, h, since, palette[2], mv.TEGAKI_FONTS.song.stack);
    else if (since >= 0 && topt.lyric === 'big' && row.shot.lyric) drawBigLyric(g, row.shot.lyric, w, h, since, topt.font);
    else if (since >= 0 && (topt.lyric === 'subtitle' || (topt.lyric === 'stage' && !mv_stage.background(record, row.shot))) && row.shot.lyric) {
        g.save(); g.font = `${font.weight} ${Math.round(Math.min(w, h) * 0.05)}px ${font.stack}`; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = 'rgba(30,26,40,.6)'; g.fillStyle = '#fff';
        g.strokeText(row.shot.lyric, w / 2, h * 0.92); g.fillText(row.shot.lyric, w / 2, h * 0.92); g.restore();
    }
    // 白闪卡点模板：副歌里每小节第一拍轻闪一下。
    if (topt.template === 'flash' && isChorusSection(song, row.sectionIndex)) {
        const inBar = (t - row.start) % (beatLen * 4);
        if (inBar < 0.12 && t - row.start > 0.2) { g.save(); g.globalAlpha = 0.35 * (1 - inBar / 0.12); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.restore(); }
    }
    // 卡点：副歌里每小节第一拍，关键词轻轻弹出一次。
    if (since >= 0 && topt.showKeyword && topt.lyric !== 'none' && topt.lyric !== 'stage' && record.keyword && isChorusSection(song, row.sectionIndex)) {
        const bar = beatLen * 4;
        const inBar = (t - row.start) % bar;
        const pop = inBar < 0.25 ? 1.12 - 0.12 * (inBar / 0.25) : 1;
        g.save(); g.translate(w * 0.08, h * 0.86); g.scale(pop, pop);
        g.font = `700 ${Math.round(Math.min(w, h) * 0.13)}px ${mv.TEGAKI_FONTS.song.stack}`; g.textAlign = 'left';
        g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 16; g.fillStyle = palette[2]; g.globalAlpha = 0.92;
        g.fillText(record.keyword, 0, 0); g.restore();
    }
    // 片头时长独立于前奏；给首镜头至少留一半时间，不改镜头、歌词或音频时间轴。
    const range = mv.playRange(record, song);
    const timeline = mv.shotTimeline(record, song);
    const lineTaps = record.timing?.lineTaps || {};
    const firstSection = timeline.sections.findIndex((s, i) => s.lines.length && timeline.times[i].end > range.start);
    const tapped = firstSection >= 0 ? Number(lineTaps[`${firstSection}:0`]) : NaN;
    const firstLyric = Number.isFinite(tapped) ? tapped : firstSection >= 0 ? timeline.times[firstSection].start : range.start;
    const firstRow = rows.find(r => r.end > range.start && r.start < range.end);
    const firstSpan = firstRow ? Math.max(0, Math.min(firstRow.end, range.end) - Math.max(firstRow.start, range.start)) : 0;
    const titleDuration = Math.min(topt.introSeconds, firstSpan / 2, Math.max(0, firstLyric - range.start));
    const titleEnd = range.start + titleDuration;
    const fade = Math.min(0.5, titleDuration / 2);
    const lastRow = rows.filter(r => r.end > range.start && r.start < range.end).at(-1);
    const lastSpan = lastRow ? Math.max(0, Math.min(lastRow.end, range.end) - Math.max(lastRow.start, range.start)) : 0;
    const outroDuration = Math.min(topt.outroSeconds, lastSpan / 2);
    const toEnd = range.end - t;
    if (titleDuration > 0 && t >= range.start && t < titleEnd) drawTitleCard(g, song, w, h, Math.min(1, (titleEnd - t) / fade));
    // Scrubbing past a selected clip must not leave its ending card over later shots.
    else if (outroDuration > 0 && t >= range.start && toEnd >= 0 && toEnd < outroDuration) drawTitleCard(g, song, w, h, (outroDuration - toEnd) / Math.min(1.2, outroDuration / 2));
    return total;
}
