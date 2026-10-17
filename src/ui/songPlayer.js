// 印象曲页面上的音源：给这首歌放一个播放器，可以粘 Suno 链接或选本机文件。
// 音源和手书共用同一份本机存储（mvMedia，按聊天和歌曲区分），在这里导入过，手书直接用。
import * as mv from '../extras/mv.js';
import * as mv_media from '../extras/mvMedia.js';
import * as music_link from '../extras/mvMusicLink.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

export const AUDIO_CHANGED_EVENT = 'hearttrace:mv-audio-changed';
const loaded = new Map();     // key → { url, name, streaming, sourceUrl, unsaved? }
const pending = new Map();    // key → AbortController
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
    const old = loaded.get(key);
    if (old && !old.streaming && old.url !== entry?.url) { try { URL.revokeObjectURL(old.url); } catch {} }
    if (entry) loaded.set(key, entry); else loaded.delete(key);
}

// Read what this device already keeps for the song (file or online address).
export async function loadSongAudio(context, songId) {
    const key = songAudioKey(context, songId);
    if (loaded.has(key)) return loaded.get(key);
    const row = await mv_media.getMedia(key);
    if (!row?.blob && !row?.mediaUrl) return null;
    const entry = { url: row.blob ? URL.createObjectURL(row.blob) : music_link.musicUrl(row.mediaUrl), name: row.name || '已保存的歌曲', streaming: !row.blob, sourceUrl: row.sourceUrl || '', artist: row.artist || '', coverUrl: row.coverUrl || '' };
    remember(key, entry);
    return entry;
}

// Make sure the bytes really decode before keeping them, so a wrong link never
// becomes a silent track for the MV later.
function probeAudio(url, { signal } = {}) {
    return new Promise((resolve, reject) => {
        const probe = new Audio(); probe.preload = 'metadata';
        let done = false;
        const finish = (ok, error) => {
            if (done) return; done = true; clearTimeout(timer);
            probe.onloadedmetadata = null; probe.onerror = null;
            try { probe.removeAttribute?.('src'); probe.load?.(); } catch {}
            ok ? resolve(ok) : reject(error);
        };
        const timer = setTimeout(() => finish(null, core_text.safeUserError('音频读取超时，原有歌曲未替换。', 'RMT_MV_AUDIO_TIMEOUT')), 30000);
        signal?.addEventListener?.('abort', () => finish(null, new DOMException('已取消', 'AbortError')), { once: true });
        probe.onloadedmetadata = () => {
            const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
            duration > 0 ? finish({ duration }) : finish(null, core_text.safeUserError('这段音频无法取得完整时长，原有歌曲未替换。', 'RMT_MV_AUDIO'));
        };
        probe.onerror = () => finish(null, core_text.safeUserError('这个地址无法作为音频播放，原有歌曲未替换。', 'RMT_MV_AUDIO'));
        probe.src = url;
    });
}

async function commit(context, songId, media) {
    const key = songAudioKey(context, songId);
    const streaming = !media.blob;
    // Online play may offer more than one address; keep the first that plays.
    const candidates = streaming ? [media.url, ...(Array.isArray(media.alternates) ? media.alternates : [])].filter(Boolean) : [null];
    let url, probed, failure;
    for (const candidate of candidates) {
        url = streaming ? music_link.musicUrl(candidate) : URL.createObjectURL(media.blob);
        try { probed = await probeAudio(url); break; }
        catch (error) {
            if (!streaming) { try { URL.revokeObjectURL(url); } catch {} }
            if (error?.name === 'AbortError') throw error;
            failure = error;
        }
    }
    if (!probed) {
        if (media.failText) throw core_text.safeUserError(media.failText, 'RMT_MV_AUDIO');
        throw failure;
    }
    try { mv.patchRecord(songId, { duration: probed.duration }, mv.captureMvTarget(context, songId)); } catch { /* No storyboard yet is fine. */ }
    const name = core_text.normalizeText(media.name, 80) || '链接歌曲';
    const artist = core_text.normalizeText(media.artist || '', 80), coverUrl = /^https:\/\//.test(media.coverUrl || '') ? media.coverUrl : '';
    const saved = await mv_media.putMedia(key, streaming ? null : media.blob, name, { sourceUrl: media.sourceUrl || '', artist, coverUrl, ...(streaming ? { mediaUrl: url } : {}) });
    // Not saved on this device: this entry is the only copy, so teardown must not release it.
    remember(key, { url, name, streaming, sourceUrl: media.sourceUrl || '', artist, coverUrl, ...(saved ? {} : { unsaved: true }) });
    announce(key);
    return { saved, streaming, name };
}

export async function importSongLink(context, songId, value) {
    const key = songAudioKey(context, songId);
    let sourceUrl;
    try { sourceUrl = music_link.musicUrl(value); }
    catch (error) { status.set(key, error.message); repaint?.(); return false; }
    pending.get(key)?.abort();
    const controller = new AbortController();
    pending.set(key, controller);
    status.set(key, '正在读取音乐…'); repaint?.();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const media = await music_link.readMusicLink(sourceUrl, { signal: controller.signal });
        if (pending.get(key) !== controller) return false;
        status.set(key, '正在检查音频…'); repaint?.();
        const result = await commit(context, songId, media);
        if (pending.get(key) !== controller) return false;
        const done = result.streaming ? '已接入在线播放。导出手书视频时需要能下载这首歌，若导不出可改用「选择文件」。'
            : result.saved ? '已导入，这台设备会记住；制作手书时直接使用。' : '已导入，但这台设备没能记住，下次打开可能要重新导入。';
        if (media.resolvedFrom && media.sourceUrl) fill.set(key, media.sourceUrl);
        status.set(key, media.resolvedFrom ? `短链接已换成完整歌曲链接。${done}` : done);
        return true;
    } catch (error) {
        if (pending.get(key) === controller) {
            status.set(key, controller.signal.aborted ? '音乐读取超时或已取消，原有歌曲未替换。'
                : /^RMT_MV_/.test(error?.code || '') ? String(error.message) : (core_text.safeErrorSummary(error) || '读取没有完成，原有歌曲未替换。'));
        }
        return false;
    } finally {
        clearTimeout(timer);
        if (pending.get(key) === controller) pending.delete(key);
        repaint?.();
    }
}

export async function importSongFile(context, songId, file) {
    const key = songAudioKey(context, songId);
    if (!file) return false;
    pending.get(key)?.abort();
    status.set(key, '正在检查音频…'); repaint?.();
    try {
        const result = await commit(context, songId, { blob: file, name: file.name });
        status.set(key, result.saved ? '已导入，这台设备会记住；制作手书时直接使用。' : '已导入，但这台设备没能记住，下次打开可能要重新导入。');
        return true;
    } catch (error) {
        status.set(key, core_text.safeErrorSummary(error) || '音频未能导入，原有歌曲未替换。');
        return false;
    } finally { repaint?.(); }
}

export async function removeSongAudio(context, songId) {
    const key = songAudioKey(context, songId);
    pending.get(key)?.abort(); pending.delete(key);
    const ok = await mv_media.deleteMedia(key);
    if (ok) { remember(key, null); announce(key); status.set(key, '已移除这首歌的音源。'); }
    else status.set(key, '音源未能移除，原有音源保留。');
    repaint?.();
    return ok;
}

export function cancelSongImport(context, songId) {
    const key = songAudioKey(context, songId);
    pending.get(key)?.abort(); pending.delete(key);
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
