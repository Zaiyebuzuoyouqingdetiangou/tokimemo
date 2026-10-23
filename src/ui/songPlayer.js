// 印象曲页面上的音源：给这首歌放一个播放器，可以粘 Suno 链接或选本机文件。
// 音源和手书共用同一份本机存储（mvMedia，按聊天和歌曲区分），在这里导入过，手书直接用。
import * as mv from '../extras/mv.js';
import * as mv_media from '../extras/mvMedia.js';
import * as music_link from '../extras/mvMusicLink.js';
import * as audio_source from '../extras/mvAudioSource.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

export const AUDIO_CHANGED_EVENT = 'hearttrace:mv-audio-changed';
const loaded = new Map();     // key → { url, name, streaming, sourceUrl, unsaved? }
const pending = new Map();    // key → AbortController
const operations = new Map(); // key → latest import/remove operation
const committedOperations = new Map(); // key → newest confirmed storage operation
const unsettledStorage = new Map(); // key → operations still waiting for a storage receipt
let operationSequence = 0;
const revisions = new Map();  // invalidates late storage reads
const status = new Map();     // key → last status text
const fill = new Map();       // key → full link to show in the input after a short link resolved
let repaint = null;

const esc = value => core_text.esc(value);

export function songAudioKey(context, songId) {
    return mv_media.mediaKey('audio', core_context.chatScopeKey(context), songId);
}

export function currentSongAudio(context, songId) {
    return loaded.get(songAudioKey(context, songId)) || null;
}

function announce(key) {
    try { globalThis.dispatchEvent?.(new CustomEvent(AUDIO_CHANGED_EVENT, { detail: { key } })); } catch { /* No DOM events in tests. */ }
}

function remember(key, entry) {
    revisions.set(key, (revisions.get(key) || 0) + 1);
    const old = loaded.get(key);
    if (old && !old.streaming && old.url !== entry?.url) { try { URL.revokeObjectURL(old.url); } catch {} }
    if (entry) loaded.set(key, entry); else loaded.delete(key);
}

// Read what this device already keeps for the song (file or online address).
export async function loadSongAudio(context, songId) {
    const key = songAudioKey(context, songId);
    if (loaded.has(key)) return loaded.get(key);
    const revision = revisions.get(key) || 0;
    const row = await mv_media.getMedia(key);
    if (revision !== (revisions.get(key) || 0) || loaded.has(key)) return loaded.get(key) || null;
    if (!row?.blob && !row?.mediaUrl) return null;
    const entry = { blob: row.blob || null, url: row.blob ? URL.createObjectURL(row.blob) : music_link.musicUrl(row.mediaUrl), name: row.name || '已保存的歌曲', streaming: !row.blob, sourceUrl: row.sourceUrl || '', artist: row.artist || '', coverUrl: row.coverUrl || '' };
    remember(key, entry);
    return entry;
}

// Make sure the bytes really decode before keeping them, so a wrong link never
// becomes a silent track for the MV later.
function probeAudio(url, { signal, requireData = false } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
        const probe = new Audio(); probe.preload = requireData ? 'auto' : 'metadata';
        let done = false;
        const abort = () => finish(null, new DOMException('已取消', 'AbortError'));
        const finish = (ok, error) => {
            if (done) return; done = true; clearTimeout(timer);
            signal?.removeEventListener?.('abort', abort);
            probe.onloadedmetadata = null; probe.onloadeddata = null; probe.oncanplay = null; probe.onerror = null;
            try { probe.removeAttribute?.('src'); probe.load?.(); } catch {}
            ok ? resolve(ok) : reject(error);
        };
        const timer = setTimeout(() => finish(null, core_text.safeUserError('音频读取超时，原有歌曲未替换。', 'RMT_MV_AUDIO_TIMEOUT')), 30000);
        signal?.addEventListener?.('abort', abort, { once: true });
        const ready = () => {
            if (requireData && probe.readyState < 2) return;
            const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
            duration > 0 ? finish({ duration }) : finish(null, core_text.safeUserError('这段音频无法取得完整时长，原有歌曲未替换。', 'RMT_MV_AUDIO'));
        };
        probe.onloadedmetadata = ready;
        if (requireData) { probe.onloadeddata = ready; probe.oncanplay = ready; }
        probe.onerror = () => finish(null, core_text.safeUserError('这个地址无法作为音频播放，原有歌曲未替换。', 'RMT_MV_AUDIO'));
        probe.src = url;
    });
}

function startOperation(key, importing = true) {
    const previous = operations.get(key);
    const operation = { key, sequence: ++operationSequence, controller: new AbortController(), committed: false };
    operations.set(key, operation);
    revisions.set(key, (revisions.get(key) || 0) + 1);
    previous?.controller.abort();
    pending.delete(key);
    if (importing) pending.set(key, operation.controller);
    return operation;
}
function isLatest(operation) { return operations.get(operation.key) === operation; }
function canContinue(operation) { return isLatest(operation) && !operation.controller.signal.aborted && (!operation.isCurrent || operation.isCurrent()); }
function requireCurrent(operation) {
    if (!canContinue(operation)) throw new DOMException('已取消', 'AbortError');
}
function acceptCommitted(operation) {
    operation.committed = true;
    if ((committedOperations.get(operation.key) || 0) >= operation.sequence) return false;
    committedOperations.set(operation.key, operation.sequence);
    return true;
}

async function storeForOperation(operation, action) {
    const entries = unsettledStorage.get(operation.key) || new Set();
    entries.add(operation); unsettledStorage.set(operation.key, entries);
    try { return await action(); }
    finally {
        entries.delete(operation);
        if (!entries.size) unsettledStorage.delete(operation.key);
    }
}
function hasEarlierStorage(operation) {
    return [...(unsettledStorage.get(operation.key) || [])].some(earlier => earlier.sequence < operation.sequence);
}

async function commit(context, songId, media, operation) {
    const { key, controller } = operation, streaming = !media.blob;
    const target = operation.target;
    const candidates = streaming ? [media.url, ...(Array.isArray(media.alternates) ? media.alternates : [])].filter(Boolean) : [null];
    let url, probed, failure, retained = false;
    try {
        const fromVideo = !streaming && audio_source.isVideoAudioSource(media.blob, media.name);
        if (fromVideo) await audio_source.inspectVideoAudioSource(media.blob, { signal: controller.signal });
        for (const candidate of candidates) {
            requireCurrent(operation);
            url = streaming ? music_link.musicUrl(candidate) : URL.createObjectURL(media.blob);
            try { probed = await probeAudio(url, { signal: controller.signal, requireData: fromVideo }); break; }
            catch (error) {
                if (!streaming) { try { URL.revokeObjectURL(url); } catch {} url = ''; }
                if (error?.name === 'AbortError') throw error;
                failure = error;
            }
        }
        requireCurrent(operation);
        if (!probed) {
            if (media.failText) throw core_text.safeUserError(media.failText, 'RMT_MV_AUDIO');
            throw failure || core_text.safeUserError('没有可播放的音频，原有歌曲未替换。', 'RMT_MV_AUDIO');
        }
        const name = core_text.normalizeText(media.name, 80) || '链接歌曲';
        const artist = core_text.normalizeText(media.artist || '', 80), coverUrl = /^https:\/\//.test(media.coverUrl || '') ? media.coverUrl : '';
        const details = { sourceUrl: media.sourceUrl || '', artist, coverUrl, ...(streaming ? { mediaUrl: url } : {}) };
        const publish = (unsaved = false) => {
            retained = true;
            remember(key, { url, blob: media.blob || null, duration: probed.duration, name, streaming, sourceUrl: details.sourceUrl, artist, coverUrl, ...(unsaved ? { unsaved: true } : {}) });
            if (target) { try { mv.patchRecord(songId, { duration: probed.duration }, target); } catch { /* Audio is still available. */ } }
            announce(key);
        };
        const saved = await storeForOperation(operation, () => mv_media.putMedia(key, streaming ? null : media.blob, name, details, {
            signal: controller.signal, isCurrent: () => canContinue(operation),
            onCommitted: () => {
                // Starting a replacement cannot hide a write that already committed:
                // the replacement may still fail. Only a newer confirmed write wins.
                if (!acceptCommitted(operation)) return;
                publish();
            },
        }));
        if (!saved) {
            requireCurrent(operation);
            // A failed write must preserve durable audio. A previously unsaved
            // track can still be replaced in memory; recheck storage so a prior
            // committed write with a delayed receipt cannot become temporary. If its
            // receipt is still pending and reads fail too, keep the old track;
            // a manual retry can use the receipt once it arrives, without waiting.
            const previous = loaded.get(key);
            const stored = previous && !previous.unsaved ? previous : await mv_media.getMedia(key);
            requireCurrent(operation);
            const latest = loaded.get(key);
            if (stored || (latest && !latest.unsaved) || hasEarlierStorage(operation)) throw core_text.safeUserError('音源未能保存，原有歌曲保留，请重试。', 'RMT_MV_AUDIO_SAVE');
            operation.temporary = true;
            publish(true);
        }
        return { saved, streaming, name };
    } finally {
        if (!streaming && url && !retained) { try { URL.revokeObjectURL(url); } catch {} }
    }
}

async function importAudio(context, songId, source, isFile, options = {}) {
    const key = songAudioKey(context, songId);
    let value = source;
    if (!isFile) {
        try { value = music_link.musicUrl(source); }
        catch (error) { status.set(key, error.message); repaint?.(); return false; }
    } else if (!source) return false;
    const operation = startOperation(key), { controller } = operation;
    operation.isCurrent = options.isCurrent;
    const cancel = () => controller.abort();
    options.signal?.addEventListener?.('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    // Freeze the origin before link fetching, audio decoding or storage waits.
    try { operation.target = mv.captureMvTarget(context, songId); } catch { /* A song may have no storyboard yet. */ }
    status.set(key, isFile ? '正在检查音频…' : '正在读取音乐…'); repaint?.();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        requireCurrent(operation);
        const media = isFile ? { blob: value, name: value.name }
            : await music_link.readMusicLink(value, { signal: controller.signal });
        requireCurrent(operation);
        status.set(key, '正在检查音频…'); repaint?.();
        const result = await commit(context, songId, media, operation);
        if (!isLatest(operation) || (!operation.committed && !operation.temporary)) return false;
        const done = result.streaming ? '已接入在线播放。导出手书视频时需要能下载这首歌，若导不出可改用「选择文件」。'
            : result.saved ? '已导入，这台设备会记住；制作手书时直接使用。' : '已导入，但这台设备没能记住，下次打开可能要重新导入。';
        if (media.resolvedFrom && media.sourceUrl) fill.set(key, media.sourceUrl);
        status.set(key, media.resolvedFrom ? `短链接已换成完整歌曲链接。${done}` : done);
        return true;
    } catch (error) {
        if (isLatest(operation) && pending.get(key) === controller) {
            status.set(key, controller.signal.aborted ? '音乐读取超时或已取消，原有歌曲未替换。'
                : /^RMT_MV_/.test(error?.code || '') ? String(error.message) : (core_text.safeErrorSummary(error) || '读取没有完成，原有歌曲未替换。'));
        }
        return false;
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener?.('abort', cancel);
        if (pending.get(key) === controller) pending.delete(key);
        repaint?.();
    }
}

export function importSongLink(context, songId, value, options = {}) { return importAudio(context, songId, value, false, options); }
export function importSongFile(context, songId, file, options = {}) { return importAudio(context, songId, file, true, options); }
export function songAudioNote(context, songId) { return status.get(songAudioKey(context, songId)) || ''; }

export async function removeSongAudio(context, songId) {
    const key = songAudioKey(context, songId), operation = startOperation(key, false);
    const ok = await storeForOperation(operation, () => mv_media.deleteMedia(key, {
        signal: operation.controller.signal, isCurrent: () => canContinue(operation),
        onCommitted: () => {
            if (!acceptCommitted(operation)) return;
            remember(key, null); fill.delete(key); announce(key);
            if (isLatest(operation)) status.set(key, '已移除这首歌的音源。');
        },
    }));
    let removedTemporary = false;
    if (!ok && canContinue(operation)) {
        const previous = loaded.get(key);
        // Only an explicitly unsaved in-memory entry may be removed without a
        // storage receipt. Never report a durable deletion when it failed.
        if (previous?.unsaved) {
            const stored = await mv_media.getMedia(key);
            if (!stored && canContinue(operation) && loaded.get(key) === previous && !hasEarlierStorage(operation)) {
                remember(key, null); fill.delete(key); announce(key);
                status.set(key, '已移除临时音源。');
                removedTemporary = true;
            }
        }
        if (!removedTemporary && canContinue(operation)) status.set(key, '音源未能移除，原有音源保留。');
    }
    repaint?.();
    return ok || removedTemporary;
}

export function cancelSongImport(context, songId) {
    const key = songAudioKey(context, songId), controller = pending.get(key);
    if (!controller) return;
    controller.abort(); pending.delete(key);
    revisions.set(key, (revisions.get(key) || 0) + 1);
    status.set(key, ''); repaint?.();
}

// A short message from the player face itself (e.g. playback refused).
export function setSongNote(songId, text, context = core_context.getContext?.()) {
    try { status.set(songAudioKey(context, songId), String(text || '')); repaint?.(); } catch {}
}

export function setSongPlayerRepaint(fn) { repaint = typeof fn === 'function' ? fn : null; }

// Blob URLs of local song files stay alive until revoked. Teardown (overlay close, chat change,
// runtime destroy) releases every track that no on-screen player is still using; the song page
// reloads a released track from this device's media store the next time it renders. A track
// the store could not keep stays until it is replaced, removed or the page unloads.
function playerInUse(url) {
    try {
        for (const audio of globalThis.document?.querySelectorAll?.('[data-rmt-song-player]') || []) {
            if (audio.isConnected !== false && audio.getAttribute?.('src') === url) return true;
        }
    } catch { /* No DOM: nothing can be playing. */ }
    return false;
}

export function releaseSongAudio() {
    for (const [key, entry] of [...loaded]) {
        if (entry.unsaved || playerInUse(entry.url)) continue;
        remember(key, null);
        fill.delete(key);
    }
}

let releaseQueued = false;
// Callers (overlay close) tear the page down synchronously right after this returns, so check
// on-screen players once that has finished.
export function scheduleSongAudioRelease() {
    if (releaseQueued) return;
    releaseQueued = true;
    queueMicrotask(() => { releaseQueued = false; releaseSongAudio(); });
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>';
export const SONG_PLAYER_ICONS = { play: ICON_PLAY, pause: ICON_PAUSE };

export function formatSongTime(seconds) {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// A generic link name means Suno's page could not be read; the song's own
// title in 心迹回廊 is the better label then.
function displayName(entry, songTitle) {
    const generic = !entry.name || ['Suno 歌曲', '链接歌曲', '已保存的歌曲'].includes(entry.name);
    return generic && songTitle ? songTitle : entry.name;
}

export function songPlayerHtml(context, songId, { readOnly = false, songTitle = '' } = {}) {
    const key = songAudioKey(context, songId);
    const entry = loaded.get(key), busy = pending.has(key), note = status.get(key) || '';
    const value = fill.get(key) || ''; fill.delete(key);
    const id = esc(songId);
    const title = entry ? displayName(entry, core_text.normalizeText(songTitle, 120)) : '';
    const sleeve = entry?.coverUrl
        ? `<img src="${esc(entry.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    const source = entry ? [entry.artist, entry.streaming ? '在线播放' : '存在这台设备'].filter(Boolean).map(esc).join('<span aria-hidden="true">／</span>') : '';
    const deck = entry ? `<div class="rmt-song-deck">
        <div class="rmt-song-record" aria-hidden="true"><div class="rmt-song-sleeve">${sleeve}<span>♫</span></div><div class="rmt-song-disc"><i>${sleeve}</i></div></div>
        <div class="rmt-song-now">
          <b class="rmt-song-name" title="${esc(title)}">${esc(title)}</b>
          <small class="rmt-song-by">${source}${entry.sourceUrl ? `<span aria-hidden="true">／</span><a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">在 Suno 打开</a>` : ''}</small>
          <div class="rmt-song-transport">
            <button type="button" class="rmt-song-play" data-rmt-song-play aria-label="播放">${ICON_PLAY}</button>
            <div class="rmt-song-progress">
              <input type="range" min="0" max="1000" step="1" value="0" data-rmt-song-seek aria-label="播放进度">
              <div class="rmt-song-times"><span data-rmt-song-time>0:00</span><span data-rmt-song-duration>--:--</span></div>
            </div>
          </div>
        </div>
        <audio preload="metadata" src="${esc(entry.url)}" data-rmt-song-player></audio>
      </div>` : `<div class="rmt-song-deck is-empty"><div class="rmt-song-record" aria-hidden="true"><div class="rmt-song-sleeve"><span>♫</span></div></div>
        <div class="rmt-song-now"><b class="rmt-song-name">还没有音源</b><small class="rmt-song-by">在 Suno 做好这首歌后，把链接粘到下面，或选本机的音频文件。</small></div></div>`;
    const inputs = `<div class="rmt-song-link-row">
      <input type="url" inputmode="url" autocomplete="off" spellcheck="false" data-rmt-song-link="${id}"${value ? ` value="${esc(value)}"` : ''} placeholder="粘贴 Suno 歌曲链接或分享短链接，或音频地址" ${busy ? 'disabled' : ''}>
      ${busy ? `<button type="button" class="rmt-btn" data-rmt-song="audio-cancel" data-rmt-song-id="${id}">取消</button>` : `<button type="button" class="rmt-btn" data-rmt-song="audio-link" data-rmt-song-id="${id}">导入链接</button>`}
    </div>
    <div class="rmt-song-toolbar"><label class="rmt-btn rmt-song-file"><input type="file" accept="audio/*,video/mp4,.mp3,.m4a,.wav,.ogg,.flac,.mp4" data-rmt-song-file="${id}" hidden ${busy ? 'disabled' : ''}>选择文件</label>${entry ? `<button type="button" class="rmt-btn" data-rmt-song="audio-remove" data-rmt-song-id="${id}">移除音源</button>` : ''}</div>`;
    // With a song in place the import tools fold away; they stay open while busy
    // or right after a message, so the result is never hidden.
    const controls = readOnly ? '' : entry
        ? `<details class="rmt-song-source"${busy || note ? ' open' : ''}><summary>更换音源</summary>${inputs}</details>`
        : inputs;
    return `<section class="rmt-song-audio" data-rmt-song-audio="${id}" aria-label="听这首歌">${deck}${controls}<p class="rmt-song-note" role="status" aria-live="polite">${esc(note)}</p></section>`;
}
