// 印象曲 MV 页面：三步开始、镜头清单、对时间、手书剪辑台、视频单镜、拼成 MV。
// 播放和导出都在本机进行；歌曲文件只在这次打开期间留在内存里，不上传、不写入聊天。
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
import * as overlay from './overlay.js';
import * as ui_workspaceState from './workspaceState.js';
import * as extras_styles from './extrasStyles.js';
import * as mv from '../extras/mv.js';
import * as mv_media from '../extras/mvMedia.js';
import * as core_castLooks from '../core/castLooks.js';
import * as archive_repository from '../archive/repository.js';

const esc = core_text.esc;
export const MV_MODE = 'songMv';
const view = { songId: '', scope: '', epoch: 0, sub: 'board', step: 1, draft: null, mode: 'tegaki', shotId: '', copied: '', selected: '', drawingAll: false, stopAll: false, tapIndex: 0 };
const audioBySong = new Map();
const images = new Map();
const localUrls = new Map();
const loadingLocal = new Map();
const audioTried = new Set();
const audioLoads = new Map();

// 用户自己的图存在本机；url 来自生图渠道。两者都没有时返回空字符串。
function v2Diff(shot) {
    const record = view.cache?.record;
    if (!shot?.group || !mv.isV2(record)) return null;
    return record.groups.find(g => g.id === shot.group)?.diffs.find(d => d.id === shot.diff) || null;
}
function hasImg(shot) { const d = v2Diff(shot); if (d) return !!d.image?.url; return !!(shot?.image?.url || shot?.image?.local); }

function imgUrl(shot) {
    const d = v2Diff(shot);
    if (d) return d.image?.url || '';
    if (shot?.image?.url) return shot.image.url;
    const key = shot?.image?.local;
    if (!key) return '';
    if (localUrls.has(key)) return localUrls.get(key);
    if (!loadingLocal.has(key)) {
        const pending = mv_media.getMedia(key).then(row => {
            if (row?.blob) { localUrls.set(key, URL.createObjectURL(row.blob)); if (runtimeState.activeMode === MV_MODE) renderMv(); }
        }).catch(() => {}).finally(() => loadingLocal.delete(key));
        loadingLocal.set(key, pending);
    }
    return '';
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
    const token = {};
    audioLoads.set(key, token);
    void mv_media.getMedia(key).then(row => {
        if (row?.blob && audioLoads.get(key) === token) acceptAudio(row.blob, row.name || '已保存的歌曲', false, target, token);
    }).catch(() => audioTried.delete(key));
}

function acceptAudio(blob, name, persist, target = mv.captureMvTarget(ctx(), view.songId), token = {}) {
    const key = audioKey(target);
    const opened = viewTarget();
    audioLoads.set(key, token);
    const url = URL.createObjectURL(blob);
    const probe = new Audio(); probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
        if (audioLoads.get(key) !== token) { URL.revokeObjectURL(url); return; }
        const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
        const old = audioBySong.get(key);
        if (old) { try { URL.revokeObjectURL(old.url); } catch {} }
        if (isView(opened) && audioKey() === key) { stopPlayback(); player.audio = null; }
        audioBySong.set(key, { url, name: core_text.normalizeText(name, 80), duration, target });
        try { mv.patchRecord(target.songId, { duration }, target); } catch (error) { toastError(error); }
        if (persist) void mv_media.putMedia(key, blob, name).then(ok => { if (!ok) globalThis.toastr?.info?.('这台设备没能记住这首歌，下次打开需要重新选择。', '心迹回廊 · MV'); });
        if (isView(opened) && audioKey() === key) renderMv();
    };
    probe.onerror = () => { URL.revokeObjectURL(url); audioTried.delete(key); if (isView(opened)) toastError(core_text.safeUserError('这个文件没法播放，换一个音频文件试试。', 'RMT_MV_AUDIO')); };
    probe.src = url;
}

function uploadLabel(shotId, label = '换用自己的图') {
    return `<label class="rmt-x-secondary rmt-mv-upload">${label}<input type="file" accept="image/*" data-rmt-mv-image data-rmt-mv-id="${esc(shotId)}"></label>`;
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
${r} .rmt-mv-steps span.on{background:var(--rmt-theme-text,#34495d);color:#fff;border-color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-steps span.done{background:#e2f0ee}
${r} .rmt-mv-choice{display:flex;gap:12px;align-items:center;padding:12px 14px;min-height:56px;border-radius:14px;cursor:pointer;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5);color:var(--rmt-theme-text,#34495d);text-align:left;width:100%}
${r} .rmt-mv-choice.on{border:2px solid var(--rmt-theme-accent-ink,#a8527a);background:#fbf0f5}
${r} .rmt-mv-choice span{display:flex;flex-direction:column;gap:3px;flex:1}
${r} .rmt-mv-choice b{font-size:15px}
${r} .rmt-mv-choice small{font-size:12px;line-height:1.5;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-choice em{font-style:normal;font-size:12px;font-weight:600;color:#2f6b66}
${r} .rmt-mv-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
${r} .rmt-mv-group{display:flex;flex-direction:column;gap:2px;padding:10px 4px 0}
${r} .rmt-mv-group b{font-size:14px;color:#8a3f63}
${r} .rmt-mv-group span{font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-link{font-size:12px;color:#8a5a3b;padding:0 8px}
${r} .rmt-mv-look input{width:100%;box-sizing:border-box;min-height:40px;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:10px;padding:0 10px;font:inherit;font-size:14px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-gcard{display:flex;flex-direction:column;gap:10px;border-radius:18px;padding:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-gname{color:#8a3f63}
${r} .rmt-mv-assets{display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:2px}
${r} .rmt-mv-assets>div{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
${r} .rmt-mv-assets small{font-size:11px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-plus{font-size:18px;color:#b7c3cf;padding-bottom:28px}
${r} .rmt-mv-asset{position:relative;width:62px;height:96px;border-radius:10px;overflow:hidden;padding:0;cursor:pointer;border:1px solid var(--rmt-theme-border,#cfdae5);background:repeating-linear-gradient(135deg,#e6e9f0 0 6px,#f2f4f8 6px 12px)}
${r} .rmt-mv-asset.cut.done{background:repeating-conic-gradient(#eef0f4 0 25%,#ffffff 0 50%) 0 0/12px 12px}
${r} .rmt-mv-asset img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
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
${r} .rmt-mv-inspect-row img{width:72px;height:108px;object-fit:contain;border-radius:8px;background:#e9edf2}
${r} .rmt-mv-inspect-row figure.cut img{background:repeating-conic-gradient(#e6e9f0 0 25%,#fff 0 50%) 0 0/10px 10px}
${r} .rmt-mv-inspect-row figcaption{font-size:10px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-inspect-row>div{display:flex;flex-direction:column;gap:3px;font-size:12px;min-width:0}
${r} .rmt-mv-inspect-row small{font-size:11px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-range-selects{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
${r} .rmt-mv-range-selects label{display:flex;flex-direction:column;gap:4px;font-size:12px}
${r} .rmt-mv-range-selects select{min-height:40px;border-radius:10px;border:1px solid var(--rmt-theme-border,#cfdae5);padding:0 8px;font:inherit;font-size:13px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
${r} .rmt-mv-toggle{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;background:#e9e7f2;border-radius:14px}
${r} .rmt-mv-toggle button{height:40px;border-radius:10px;border:0;font-size:14px;font-weight:600;cursor:pointer;background:transparent;color:#586b7c}
${r} .rmt-mv-toggle button.on{background:#fff;color:#34495d}
${r} .rmt-mv-lyric{padding:12px 14px;background:#fffaf2;border:1px solid #ecdcc3;border-radius:14px;display:flex;flex-direction:column;gap:4px;color:#6b5a44}
${r} .rmt-mv-lyric small{font-size:11px;letter-spacing:2px;color:#8a5a3b}
${r} .rmt-mv-lyric p{margin:0;font-size:14px;line-height:1.8;white-space:pre-line}
${r} .rmt-mv-shot{display:flex;flex-direction:column;gap:12px;border-radius:16px;padding:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-shot.done{border-color:#b9dcd6}
${r} .rmt-mv-shot-row{display:flex;gap:12px}
${r} .rmt-mv-thumb{width:64px;height:114px;flex-shrink:0;border-radius:10px;overflow:hidden;background:repeating-linear-gradient(135deg,#e6e9f0 0 6px,#f2f4f8 6px 12px);display:flex;align-items:flex-end;justify-content:flex-start;position:relative}
${r} .rmt-mv-thumb.wide{width:114px;height:64px}
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
${r} .rmt-mv-strip span{position:absolute;left:4px;top:4px;font-size:10px;background:rgba(255,255,255,.85);color:#34495d;border-radius:4px;padding:1px 4px}
${r} .rmt-mv-tap{width:100%;height:110px;border:0;border-radius:20px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#fff;background:#a8527a}
${r} .rmt-mv-tap.done{background:#2f6b66}
${r} .rmt-mv-tap small{font-size:13px;opacity:.85}
${r} .rmt-mv-tap b{font-size:22px}
${r} .rmt-mv-clock{font-size:34px;font-weight:700}
${r} .rmt-mv-sec{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-sec.cur{border:2px solid #a8527a}
${r} .rmt-mv-sec>i{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-style:normal;background:#fbf0f5;color:#a8527a}
${r} .rmt-mv-sec.tapped>i{background:#ce729c;color:#fff}
${r} .rmt-mv-sec>div{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${r} .rmt-mv-sec>div small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-sec>em{font-style:normal;font-size:15px;font-weight:700;color:#8b95a3;text-align:right}
${r} .rmt-mv-sec.tapped>em{color:#a8527a}
${r} .rmt-mv-sec>span{display:flex;flex-direction:column;gap:4px}
${r} .rmt-mv-sec>span button{width:40px;height:30px;border:1px solid var(--rmt-theme-border,#cfdae5);background:#fff;border-radius:8px;font-size:12px;cursor:pointer;color:#34495d}
${r} .rmt-mv-prompt{padding:12px;background:#f5f4fb;border-radius:12px;font-size:14px;line-height:1.75;white-space:pre-wrap;word-break:break-word;color:var(--rmt-theme-text,#34495d)}
${r} .rmt-mv-step{display:flex;flex-direction:column;gap:12px;border-radius:16px;padding:16px;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-step.on{border:2px solid #a8527a}
${r} .rmt-mv-step.done{border-color:#b9dcd6}
${r} .rmt-mv-step header{display:flex;align-items:center;gap:10px}
${r} .rmt-mv-step header i{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;font-style:normal;background:#fbf0f5;color:#a8527a}
${r} .rmt-mv-step.done header i{background:#2f6b66;color:#fff}
${r} .rmt-mv-step ol{margin:0;padding-left:20px;font-size:14px;line-height:1.9}
${r} .rmt-mv-dots{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
${r} .rmt-mv-dots span{height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:#f5f4fb;color:#8b95a3;border:1px dashed var(--rmt-theme-border,#cfdae5)}
${r} .rmt-mv-dots span.ok{background:#e2f0ee;color:#2f6b66;border-style:solid;border-color:#e2f0ee}
${r} .rmt-mv-warn{display:flex;flex-direction:column;gap:6px;padding:12px 14px;background:#fff6ec;border:1px solid #f0d9bd;border-radius:12px;font-size:13px;line-height:1.7;color:#7a5530}
${r} .rmt-mv-info{padding:12px 14px;background:#eef5f4;border-radius:12px;font-size:12px;line-height:1.7;color:#2f5f5b}
${r} .rmt-mv-file{display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f5f4fb;border-radius:12px}
${r} .rmt-mv-file div{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${r} .rmt-mv-file small{font-size:12px;color:var(--rmt-theme-muted,#586b7c)}
${r} .rmt-mv-file label{min-height:36px;padding:0 12px;border:1px solid var(--rmt-theme-border,#cfdae5);background:#fff;border-radius:10px;font-size:13px;display:flex;align-items:center;cursor:pointer;color:#34495d}
${r} .rmt-mv-file input,${r} .rmt-mv-upload input{position:absolute;width:1px;height:1px;opacity:0}
${r} .rmt-mv-upload{position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer}
${r} .rmt-mv-look{display:flex;flex-direction:column;gap:6px;font-size:13px;margin-top:10px}
${r} .rmt-mv-look textarea{width:100%;box-sizing:border-box;border:1px solid var(--rmt-theme-border,#cfdae5);border-radius:10px;padding:8px 10px;font:inherit;font-size:14px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#34495d)}
.rmt-mv-rec{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;align-items:center;justify-content:center}
.rmt-mv-rec canvas{max-width:100vw;max-height:100vh;width:auto;height:auto}
.rmt-mv-rec b{position:absolute;color:#fff;font-size:72px;font-family:sans-serif}
.rmt-mv-rec button{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;min-height:44px;padding:0 16px;border-radius:12px;border:0;background:rgba(255,255,255,.9);color:#000;font-size:15px}
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
    const record = mv.readMv(context, view.songId);
    view.sub = record?.shots?.length ? 'board' : 'setup';
    view.step = 1; view.draft = mv.normalizeSettings(record?.settings); view.mode = view.draft.output; view.shotId = ''; view.copied = '';
    overlay.openOverlay();
    renderMv();
    const el = body(); if (el) el.scrollTop = 0;
    return true;
}

export function navigateMvBack() {
    if (runtimeState.activeMode !== MV_MODE) return false;
    stopExport();
    stopPlayback();
    const record = currentRecord();
    if (view.sub === 'setup' && view.step > 1) { view.step -= 1; renderMv(); return true; }
    if (['shot', 'sync', 'tegaki', 'finish'].includes(view.sub) || (view.sub === 'setup' && record?.shots?.length)) {
        view.sub = view.sub === 'sync' ? 'tegaki' : 'board'; renderMv(); return true;
    }
    void overlay.openCachedOrGenerate(core_constants.MODE.THEME_SONG, { workspaceRoute: 'themeSong' });
    return true;
}

function go(sub, extra = {}) {
    if (sub !== 'tegaki' && sub !== 'sync') stopPlayback();
    Object.assign(view, { sub }, extra);
    renderMv();
    const el = body(); if (el) el.scrollTop = 0;
}

function currentRecord() { const c = ctx(); return c ? mv.readMv(c, view.songId) : null; }
function currentSong() { const c = ctx(); return c ? mv.loadSong(c, view.songId).song : null; }

// ---------- 渲染 ----------

export function renderMv() {
    try { renderMvUnsafe(); }
    catch (error) {
        console.error('[HeartbeatMemories] MV page failed', error);
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
    ensureStyles();
    overlay.setManageVisible(false); overlay.setRegenerateVisible(false);
    let song;
    try { song = currentSong(); }
    catch (error) {
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
    overlay.topTitle(title); overlay.setBackVisible(true, back);
    body().innerHTML = `<main class="rmt-x-page">${recoveryPanel()}${html}<details class="rmt-x-card"><summary>MV 备份</summary>${btn('export-recovery', '导出 MV 数据与暂存结果')}</details></main>`;
}

function recoveryPanel() {
    const rows = mv.pendingMv(view.scope);
    if (!rows.length) return '';
    return `<section class="rmt-x-card"><b>有 ${rows.length} 份 MV 结果待保存</b>${rows.map(row => `<div><p class="rmt-x-note">${esc(row.song?.title || 'MV')} · ${esc(row.reason || '等待保存')}</p>${btn('retry-save', '仅重试保存', { id: row.id })}</div>`).join('')}${btn('export-recovery', '导出暂存结果')}</section>`;
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

function renderSetup(song, record) {
    const d = view.draft || mv.normalizeSettings(null);
    const steps = ['做成什么', '画风与出镜', '确认'].map((label, i) => `<span class="${view.step === i + 1 ? 'on' : view.step > i + 1 ? 'done' : ''}"><b>${view.step > i + 1 ? '✓' : i + 1}</b>${label}</span>`).join('');
    let content = '';
    if (view.step === 1) {
        content = `<h3 class="rmt-x-section-title">做成什么？</h3>
          ${choice('set-output', 'tegaki', d.output === 'tegaki', '手书 · 推荐', '一张张手绘风的画，跟着歌词切换、轻轻移动，像同人手书。', '全程在插件里完成，可以直接导出视频')}
          ${choice('set-output', 'video', d.output === 'video', '视频 · 进阶', '画面真正动起来，像电影片段。', '需要把提示词拿到视频工具里生成')}`;
    } else if (view.step === 2) {
        const styles = mv.MV_STYLES[d.output];
        const sectionsForRange = mv.parseSections(song.lyrics);
        content = `${d.output === 'tegaki' ? `<h3 class="rmt-x-section-title">做哪一段</h3>${rangePicker('draft', d, sectionsForRange)}` : ''}<h3 class="rmt-x-section-title">画风</h3><div class="rmt-mv-grid2">${styles.map(s => choice('set-style', s.id, d.style === s.id, s.name, s.desc)).join('')}</div>
          <h3 class="rmt-x-section-title">你要出镜吗？</h3>
          ${choice('set-appear', 'face', d.appear === 'face', '露脸出镜', '按你填写的外貌来画。')}
          ${choice('set-appear', 'back', d.appear === 'back', '只拍背影或手', '有你的存在感，但不画脸。')}
          ${choice('set-appear', 'none', d.appear === 'none', '不出镜', '画面里只有他。')}
          ${d.appear !== 'none' && mv.frameNeedsUserLooks({ settings: d }, ctx()) ? '<div class="rmt-mv-warn">还没有填写你的外貌。在下面补上，每一张里的你才会长得一样；不填也能继续。</div>' : ''}
          ${looksEditor()}
          <h3 class="rmt-x-section-title">比例</h3><div class="rmt-mv-grid2">${choice('set-ratio', '9:16', d.ratio === '9:16', '竖屏 9:16', '手机看')}${choice('set-ratio', '16:9', d.ratio === '16:9', '横屏 16:9', '电脑看')}</div>
          ${d.output === 'video' ? `<h3 class="rmt-x-section-title">你打算用什么做视频？</h3>
            ${choice('set-lang', 'zh', d.lang === 'zh', '国内的视频 App', '比如可灵、即梦。提示词用中文写。')}
            ${choice('set-lang', 'en', d.lang === 'en', '国外的视频工具', '比如 Runway。提示词用英文写。')}
            ${choice('set-lang', 'both', d.lang === 'both', '还没想好', '中英文都给你，到时候挑一个复制。')}` : ''}`;
    } else {
        const style = mv.MV_STYLES[d.output].find(s => s.id === d.style);
        const lines = [['做成', d.output === 'video' ? '视频' : '手书'], ['画风', style?.name || ''], ['你', mv.MV_APPEAR[d.appear]], ['比例', d.ratio === '9:16' ? '竖屏 9:16' : '横屏 16:9'],
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
    return `<span class="rmt-mv-thumb${wide ? ' wide' : ''}">${imgUrl(shot) ? `<img src="${esc(imgUrl(shot))}" alt="" loading="lazy">` : ''}<i>${esc(label)}</i></span>`;
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
              <div class="rmt-x-chips"><span class="rmt-x-chip muted">${esc(who[shot.who] || '他')}</span><span class="rmt-x-chip${ok ? '' : ' muted'}">${status}</span></div></div></div>
              <div class="rmt-mv-actions">${btn('draw', drawing ? '正在画…' : imgUrl(shot) ? '重画这张' : '画这一张', { id: shot.id, disabled: drawing || view.drawingAll, cls: imgUrl(shot) ? 'rmt-x-secondary' : 'rmt-x-primary' })}
              ${!tegaki ? btn('open-shot', shot.videoDone ? '再看看' : '去生成视频', { id: shot.id, cls: 'rmt-x-primary rmt-x-dark' }) : uploadLabel(shot.id, '用自己的图')}</div></article>${groupLink}`.replace(/^/, () => groupHead);
        }).join('');
    }).join('');
    const wd = record.wardrobe || {};
    const wardrobeCard = `<details class="rmt-x-card"${wd.char || wd.user || wd.era ? '' : ' open'}><summary><b>时代与衣着</b>（每一张都用同一套）</summary>
      <label class="rmt-mv-look"><span>时代 / 场景</span><input type="text" maxlength="200" data-rmt-mv-wardrobe="era" value="${esc(wd.era || '')}" placeholder="例如 ancient Chinese wuxia, bamboo forest sect"></label>
      <label class="rmt-mv-look"><span>他的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="char" value="${esc(wd.char || '')}" placeholder="例如 white layered hanfu robe, silver hairpin"></label>
      ${mv.normalizeSettings(record.settings).appear === 'none' ? '' : `<label class="rmt-mv-look"><span>你的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="user" value="${esc(wd.user || '')}" placeholder="例如 pale pink ruqun dress, jade hairpin"></label>`}
      <p class="rmt-x-note">外貌设定只管长相；衣着在这里统一，写分镜时会按角色设定和世界观自动填好，可以改。用英文写效果最稳。改完之后重画的图才会生效。</p></details>`;
    const warn = mv.frameNeedsUserLooks(record, context) && shots.some(s => s.who === 'both' || s.who === 'user')
        ? `<div class="rmt-mv-warn">还没有填写你的外貌，画出来的你可能每张不一样。</div>${looksEditor()}` : '';
    const rangeCard = tegaki ? (() => {
        const o = mv.tegakiOptions(record);
        const want = mv.selectedSectionIndexes(sections, o.range, o.rangeFrom, o.rangeTo);
        const missing = want.filter(i => !shots.some(s => s.sectionIndex === i)).length;
        return `<section class="rmt-x-card"><b>做哪一段</b>${rangePicker('record', o, sections)}${missing ? `<div class="rmt-mv-warn">选中的段落里有 ${missing} 段还没有镜头。${btn('rewrite-board', '按这一段重新写分镜', { cls: 'rmt-x-secondary' })}</div>` : ''}</section>`;
    })() : '';
    const tools = tegaki ? `${remaining ? btn(view.drawingAll ? 'draw-stop' : 'draw-all', view.drawingAll ? '停止连续绘制' : `一次画完剩下的 ${remaining} 张（会用 ${remaining} 次生图）`) : ''}
        ${btn('go-tegaki', '去手书剪辑台', { cls: 'rmt-x-primary' })}<p class="rmt-x-note">没画的镜头在剪辑台里会先用上一张代替，随时能预览。</p>`
        : `${btn('go-finish', '全部做完后：拼成 MV', { cls: 'rmt-x-primary rmt-x-dark' })}`;
    page('镜头清单', '印象曲', `${head(song.title, '镜头清单', `${shots.length} 镜 · ${mv.normalizeSettings(record.settings).ratio === '9:16' ? '竖屏' : '横屏'}。同一张分镜表，可以做成手书，也可以做成视频。`)}
      <div class="rmt-mv-toggle">${['tegaki', 'video'].map(m => `<button type="button" class="${view.mode === m ? 'on' : ''}" aria-pressed="${view.mode === m}" data-rmt-mv="mode" data-rmt-mv-id="${m}">${m === 'tegaki' ? '手书' : '视频'}</button>`).join('')}</div>
      ${rangeCard}
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
    return `<div class="rmt-mv-file"><span aria-hidden="true">♫</span><div><b>${esc(audio ? audio.name : '还没有放入歌曲')}</b><small>${audio ? `${mv.formatTime(audio.duration)} · 只在本机使用，不上传` : `把 Suno 下载的「${esc(song.title)}」放进来`}</small></div>
      <label>${audio ? '换一首' : '选择文件'}<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" data-rmt-mv-audio></label></div>`;
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
    return `<b style="font-size:14px">节奏模板</b><div class="rmt-mv-presets">${presets}</div>
      <p class="rmt-x-note">参考常见手书套路，一次排好全部镜头的切换方式、停留和歌词样式；之后仍可逐镜修改。</p>
      <b style="font-size:14px">截取哪一段</b>${rangePicker('record', o, mv.parseSections(song.lyrics))}
      <p class="rmt-x-note">现在：${mv.formatTime(range.start)}–${mv.formatTime(range.end)}（约 ${Math.max(0, Math.round(range.end - range.start))} 秒）。</p>
      <b style="font-size:14px">切换节奏</b><div class="rmt-mv-grid2">${seg2('tegaki-rhythm', mv.TEGAKI_RHYTHMS, o.rhythm)}</div>
      <b style="font-size:14px">歌词</b><div class="rmt-x-segs">${seg2('tegaki-lyric', mv.TEGAKI_LYRICS, o.lyric)}</div>
      ${o.lyric === 'none' ? '' : `<b style="font-size:14px">字体</b><div class="rmt-x-segs">${seg2('tegaki-font', Object.fromEntries(Object.entries(mv.TEGAKI_FONTS).map(([k, v]) => [k, v.name])), o.font)}</div><p class="rmt-x-note">字体用设备自带的，不同手机效果会略有差异。</p>`}`;
}

function renderTegaki(song, record) {
    const [w, h] = canvasSize(record);
    const { rows, sections } = mv.shotTimeline(record, song);
    if (!view.selected || !record.shots.some(s => s.id === view.selected)) view.selected = record.shots[0]?.id || '';
    const selIndex = rows.findIndex(r => r.shot.id === view.selected);
    const sel = rows[selIndex] || rows[0];
    const tapped = Object.values(record.timing?.taps || {}).filter(v => v !== null && v !== undefined).length;
    const support = exportSupport();
    const exporting = player.exporting;
    const strip = rows.map((row, i) => {
        const width = Math.max(48, Math.min(160, Math.round((row.end - row.start) * 9)));
        return `<button type="button" class="${row.shot.id === view.selected ? 'on' : ''}" style="width:${width}px" aria-label="第 ${i + 1} 镜" data-rmt-mv="select-shot" data-rmt-mv-id="${esc(row.shot.id)}">${imgUrl(row.shot) ? `<img src="${esc(imgUrl(row.shot))}" alt="">` : ''}<span>${i + 1} · ${(row.end - row.start).toFixed(1)}s</span></button>`;
    }).join('');
    const seg = (action, map, value) => Object.entries(map).map(([id, label]) => btn(action, label, { id, cls: 'rmt-x-seg' + (value === id ? ' active' : ''), extra: ` aria-pressed="${value === id}"` })).join('');
    page('手书剪辑台', '镜头清单', `${head(`手书 · ${song.title}`, '手书剪辑台', '放入歌曲就能预览。每一张怎么动，点下面的缩略图来改。')}
      <div class="rmt-mv-canvas-wrap" style="width:${w > h ? '100%' : 'min(100%, 300px)'}"><canvas data-rmt-mv-canvas width="${w}" height="${h}"></canvas></div>
      <div class="rmt-mv-bar"><button type="button" class="rmt-mv-play" data-rmt-mv="play" aria-label="${player.playing ? '暂停' : '播放'}" ${exporting ? 'disabled' : ''}>${player.playing ? '❚❚' : '▶'}</button>
        <div class="rmt-mv-track" data-rmt-mv="seek" role="slider" aria-label="拖到这里播放" style="cursor:pointer"><div><i data-rmt-mv-progress></i></div><div style="display:flex;justify-content:space-between;background:none;height:auto"><span data-rmt-mv-time>0:00</span><span>${mv.formatTime(mv.shotTimeline(record, song).total)}</span></div></div></div>
      <div class="rmt-mv-strip">${strip}</div>
      ${sel ? `<section class="rmt-x-card"><div class="rmt-x-row-head"><b>第 ${selIndex + 1} 镜怎么动</b><span>${mv.formatTime(sel.start, true)}–${mv.formatTime(sel.end, true)}${imgUrl(sel.shot) ? '' : ' · 还没画，先用上一张'}</span></div>
        <div class="rmt-mv-grid2">${seg('set-motion', mv.MV_MOTIONS, sel.shot.motion)}</div>
        <b style="font-size:14px">切到下一镜时</b><div class="rmt-x-segs">${seg('set-cut', mv.MV_CUTS, sel.shot.cut || 'fade')}</div>
        <div class="rmt-mv-actions">${btn('draw', mv.isFrameDrawing(mv.mvScope(ctx()), view.songId, sel.shot.id) ? '正在画…' : imgUrl(sel.shot) ? '重画这张' : '画这一张', { id: sel.shot.id, disabled: mv.isFrameDrawing(mv.mvScope(ctx()), view.songId, sel.shot.id) })}${uploadLabel(sel.shot.id)}</div></section>` : ''}
      ${audioBySong.has(audioKey()) ? (() => {
        const lines = mv.syncLines(record, song);
        if (!lines.length) return '';
        const taps = record.timing?.lineTaps || {};
        const done = lines.filter(l => Number.isFinite(Number(taps[l.key]))).length;
        const next = lines.find(l => !Number.isFinite(Number(taps[l.key])));
        return `<section class="rmt-x-card rmt-mv-linesync"><div class="rmt-x-row-head"><b>逐句对时间（最准）</b><span>${done} / ${lines.length} 句</span></div>
          <p class="rmt-x-note">点播放，每唱到新的一句就点一下大按钮。字幕和画面会按你点的时间切换；没点到的句子仍用估计时间。</p>
          ${next ? `<div class="rmt-mv-lyric"><small>下一句 · ${esc(next.section)}</small><p>${esc(next.text)}</p></div>${btn('tap-line', '这一句开始了', { cls: 'rmt-x-primary', id: next.key })}` : '<p class="rmt-x-note">全部对好了。</p>'}
          <div class="rmt-mv-actions">${btn('tap-line-undo', '撤销上一句')}${btn('tap-line-reset', '全部重来')}</div></section>`;
      })() : ''}
      <section class="rmt-x-card"><b>歌曲与字幕</b>${audioCard(song)}
        ${tegakiControls(record, song)}
        ${btn('go-sync', `对时间 · 已点 ${tapped} / ${sections.length} 段${tapped < sections.length ? '，其余用估计时间' : ''}`, { cls: 'rmt-x-primary rmt-x-dark' })}</section>
      <section class="rmt-x-card"><b>导出</b>
        ${exporting ? `<div class="rmt-x-row-head"><span>正在录制…</span><span data-rmt-mv-export-time>0:00</span></div><div class="rmt-x-bar"><i data-rmt-mv-export-bar style="width:0%"></i></div><p class="rmt-x-note">请不要切到其他页面或锁屏。</p>${btn('export-stop', '停止导出')}`
          : `${support.ok ? btn('export', audioBySong.has(audioKey()) ? `导出成视频（.${support.ext}）` : `导出无声视频（.${support.ext}）`, { cls: 'rmt-x-primary' }) : '<div class="rmt-mv-warn">这台设备不能直接导出视频。可以用下面的录屏模式，配合手机自带的录屏功能录下来。</div>'}
             ${btn('record-mode', '录屏模式（全屏播放）', { disabled: !audioBySong.has(audioKey()) })}
             <p class="rmt-x-note">${audioBySong.has(audioKey()) ? '导出会从头播放一遍，歌多长就要等多久。期间请停留在这个页面。' : '没放入歌曲也能导出无声视频，之后在剪辑 App 里配上歌；录屏模式需要先放入歌曲。'}${support.ok && support.ext === 'webm' ? ' 这台设备导出的是 .webm，剪映等 App 一般可以直接导入。' : ''}</p>`}</section>`);
}

// ---------- 对时间 ----------

function renderSync(song, record) {
    const sections = mv.parseSections(song.lyrics);
    const { sections: times } = mv.sectionTimes(record, sections, mv.songBpm(song));
    const taps = record.timing?.taps || {};
    const next = sections.findIndex((_, i) => taps[i] === undefined || taps[i] === null);
    const bpm = mv.songBpm(song);
    const hasAudio = audioBySong.has(audioKey());
    page('对时间', '剪辑台', `${head(`${song.title}${bpm ? ` · ${bpm} BPM` : ''}`, '对时间', `放歌，每到新的一段开头，就点一下大按钮。一共 ${sections.length} 下，段落里的镜头会自动排好。`)}
      ${audioCard(song)}
      <section class="rmt-x-card" style="align-items:center">
        <div><span class="rmt-mv-clock" data-rmt-mv-time>0:00</span> <small class="rmt-x-note">/ ${mv.formatTime(audioBySong.get(audioKey())?.duration || 0)}</small></div>
        <button type="button" class="rmt-mv-tap${next < 0 ? ' done' : ''}" data-rmt-mv="tap" ${!hasAudio || next < 0 ? 'disabled' : ''}><small>${!hasAudio ? '先放入歌曲' : next < 0 ? '全部点完了' : '听到这一段开始时点'}</small><b>${next < 0 ? '✓ 时间对好了' : esc(sections[next].name) + '开始了'}</b></button>
        <div class="rmt-mv-actions" style="width:100%">${btn('play', player.playing ? '暂停' : '播放', { disabled: !hasAudio })}${btn('tap-undo', '撤销上一下')}</div>
      </section>
      ${sections.map((section, i) => `<div class="rmt-mv-sec${times[i].tapped ? ' tapped' : ''}${i === next ? ' cur' : ''}"><i>${times[i].tapped ? '✓' : i + 1}</i><div><b>${esc(section.name)}</b><small>${esc(section.lines[0] || '（器乐）')}</small></div>
        <em>${mv.formatTime(times[i].start, true)}<br><small class="rmt-x-note">${times[i].tapped ? '你点的' : '估计'}</small></em>
        ${times[i].tapped && i > 0 ? `<span>${btn('nudge', '-0.5', { id: `${i}:-0.5`, cls: '' })}${btn('nudge', '+0.5', { id: `${i}:0.5`, cls: '' })}</span>` : ''}</div>`).join('')}
      <p class="rmt-x-note">不想点也没关系：估计时间可以直接用。只点副歌开头，通常就已经很准了。</p>
      <div class="rmt-mv-actions">${btn('tap-reset', '从头再点')}${btn('go-tegaki', '完成，去预览', { cls: 'rmt-x-primary' })}</div>`);
}

// ---------- 画布与播放 ----------

function imageFor(url) {
    if (!url) return null;
    let img = images.get(url);
    if (!img) { img = new Image(); img.decoding = 'async'; img.onload = () => drawNow(); img.src = url; images.set(url, img); }
    return img.complete && img.naturalWidth ? img : null;
}

// Resolve local blobs before decoding images; timeouts stop export rather than silently omit frames.
async function preloadImages(record) {
    let timer;
    const load = async () => {
        for (const shot of record?.shots || []) imgUrl(shot);
        await Promise.all((record?.shots || []).map(shot => loadingLocal.get(shot.image?.local)).filter(Boolean));
        const urls = [...new Set((record?.shots || []).map(shot => {
            const url = imgUrl(shot);
            if (hasImg(shot) && !url) throw new Error('Local image unavailable');
            return url;
        }).concat(mv.isV2(record) ? mv.assetKeys(record).map(k => mv.assetOf(record, k)?.image?.url).concat(coverUrl(view.cache?.song) || '') : []).filter(Boolean))];
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
    let img = null;
    for (let i = index; i >= 0 && !img; i -= 1) img = imageFor(imgUrl(rows[i].shot));
    g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, w, h);
    if (img) {
        const span = groupSpan(rows, index);
        const p = Math.min(1, Math.max(0, (t - span.start) / Math.max(0.1, span.end - span.start)));
        const lead = rows.findIndex(r => r.shot.group && r.shot.group === row.shot.group);
        const motion = mv.motionOf((lead >= 0 ? rows[lead] : row).shot.motion);
        drawCover(g, img, w, h, motion === 'push' ? 1 + 0.05 * p : 1, 0, 0);
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

function renderFrame(canvas, record, song, t) {
    if (mv.isV2(record)) return renderFrameV2(canvas, record, song, t);
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const topt = mv.tegakiOptions(record);
    frameCtx = { rhythm: topt.rhythm, beat: 120 / (mv.songBpm(song) || 90) };
    const { rows, total } = mv.shotTimeline(record, song);
    if (!rows.length) return total;
    let index = rows.findIndex(r => t >= r.start && t < r.end);
    if (index < 0) index = t < rows[0].start ? 0 : rows.length - 1;
    const row = rows[index];
    drawShot(g, row, rows, index, t, w, h);
    const prev = rows[index - 1];
    const since = t - row.start;
    if (prev && (prev.shot.cut || 'fade') === 'fade' && since < 0.45) {
        g.save(); g.globalAlpha = 1 - since / 0.45; drawShot(g, prev, rows, index - 1, t, w, h); g.restore();
    } else if (prev && prev.shot.cut === 'flash' && since < 0.3) {
        g.save(); g.globalAlpha = 1 - since / 0.3; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.restore();
    }
    const beat = beatVariant(row, t);
    if (beat) {
        const pulse = Math.max(0, 1 - beat.since / (frameCtx.beat * 0.6));
        const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
        glow.addColorStop(0, `rgba(255,248,236,${0.14 * pulse})`); glow.addColorStop(1, 'rgba(255,248,236,0)');
        g.save(); g.fillStyle = glow; g.fillRect(0, 0, w, h); g.restore();
    }
    if (topt.lyric === 'big' && row.shot.lyric) drawBigLyric(g, row.shot.lyric, w, h, since, topt.font);
    if (topt.lyric === 'subtitle' && row.shot.lyric) {
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
    const rec = document.querySelector('.rmt-mv-rec canvas');
    if (rec) renderFrame(rec, record, song, t);
}

function currentRange() {
    if (view.sub === 'sync') return { start: 0, end: Infinity };
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
    const opened = viewTarget(), sub = view.sub;
    const entry = audioBySong.get(audioKey());
    const support = exportSupport();
    const record = structuredClone(currentRecord()); const song = structuredClone(currentSong());
    if (!support.ok || !record) return;
    stopPlayback();
    const state = { cancelled: false, tracks: [], raf: 0, recorder: null, audio: null, ac: null, canvas: null };
    player.exporting = state;
    const current = () => !state.cancelled && player.exporting === state && isView(opened) && view.sub === sub;
    const chunks = [];
    const finish = () => {
        if (state.finished) return;
        state.finished = true;
        const mayRender = current();
        if (player.exporting === state) player.exporting = null;
        try { state.audio?.pause(); } catch {}
        if (state.raf) cancelAnimationFrame(state.raf);
        for (const track of state.tracks) { try { track.stop(); } catch {} }
        try { Promise.resolve(state.ac?.close()).catch(() => {}); } catch {}
        state.canvas?.remove();
        if (!state.cancelled && chunks.length) {
            download(new Blob(chunks, { type: support.mime.split(';')[0] }), `${safeName(song.title)}-MV.${support.ext}`);
            toastOk('视频已导出。');
        }
        if (mayRender) renderMv();
    };
    state.finish = finish;
    try {
        await preloadImages(record);
        if (!current()) { state.cancelled = true; finish(); return; }
        const [w, h] = canvasSize(record);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        state.canvas = canvas;
        canvas.style.cssText = 'position:fixed;left:-20000px;top:0;width:10px;height:10px;pointer-events:none';
        document.body.appendChild(canvas);
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        // 没有放入歌曲时导出无声视频：用本地时钟代替音频的播放进度。
        const audio = state.audio = entry ? new Audio(entry.url) : silentClock();
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
        const total = mv.shotTimeline(record, song).total;
        const range = mv.playRange(record, song);
        const loop = () => {
            if (!current()) { stopExport(); return; }
            const t = audio.currentTime || 0;
            if (t >= range.end - 0.02) { try { audio.pause(); } catch {} if (recorder.state !== 'inactive') recorder.stop(); return; }
            try { renderFrame(canvas, record, song, t); } catch (error) { stopExport(); toastError(error); return; }
            const bar = document.querySelector('[data-rmt-mv-export-bar]');
            if (bar) bar.style.width = `${Math.min(100, t / Math.max(1, total) * 100)}%`;
            const label = document.querySelector('[data-rmt-mv-export-time]');
            if (label) label.textContent = `${mv.formatTime(t)} / ${mv.formatTime(entry?.duration || total)}`;
            state.raf = requestAnimationFrame(loop);
        };
        audio.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
        if (audio.readyState < 1) await new Promise(resolve => { audio.addEventListener('loadedmetadata', resolve, { once: true }); audio.addEventListener('error', resolve, { once: true }); });
        audio.currentTime = range.start;
        renderMv(); renderFrame(canvas, record, song, range.start); recorder.start(1000);
        await state.ac?.resume?.();
        if (!current()) { stopExport(); return; }
        await audio.play();
        if (!current()) { audio.pause(); stopExport(); return; }
        state.raf = requestAnimationFrame(loop);
    } catch (error) { stopExport(); toastError(core_text.safeUserError('这台设备这次没能录制，可以改用录屏模式。', 'RMT_MV_EXPORT')); }
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
    const record = currentRecord();
    if (!entry || !record) return;
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
    player.clockOffset = 0;
    drawNow();
    let n = 3;
    const timer = setInterval(async () => {
        if (!isView(opened) || player.recording?.shell !== shell) { exit(); return; }
        n -= 1;
        if (n > 0) { count.textContent = String(n); return; }
        clearInterval(timer); count.remove();
        const audio = audioElement();
        if (!audio) { exit(); return; }
        const range = currentRange();
        audio.currentTime = range.start;
        const stopAt = () => { if (audio.currentTime >= range.end - 0.02) { audio.pause(); audio.dispatchEvent(new Event('ended')); } else if (!audio.paused) requestAnimationFrame(stopAt); };
        requestAnimationFrame(stopAt);
        player.playing = true;
        try { await audio.play(); } catch (error) { toastError(error); }
        if (!isView(opened) || player.recording?.shell !== shell) { audio.pause(); return; }
        audio.onended = () => { player.playing = false; const done = document.createElement('button'); done.type = 'button'; done.textContent = '录好了 · 退出'; shell.appendChild(done); };
        ensureLoop();
    }, 1000);
    player.recording = { timer, shell };
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
    const keys = mv.assetKeys(record0, view.cache?.song).filter(key => !mv.assetOf(record0, key)?.image?.url);
    const queue = {}; view.drawQueue = queue;
    view.drawingAll = true; view.stopAll = false;
    renderMv();
    try {
        for (const key of keys) {
            if (view.stopAll || view.drawQueue !== queue) break;
            const result = await mv.drawAsset(view.songId, key);
            reportResult(result);
            if (runtimeState.activeMode === MV_MODE) renderMv();
        }
    } catch (error) { toastError(error); }
    if (view.drawQueue === queue) view.drawingAll = false;
    if (runtimeState.activeMode === MV_MODE) renderMv();
}

async function runAsset(key) {
    try { const p = mv.drawAsset(view.songId, key); renderMv(); reportResult(await p); }
    catch (error) { toastError(error); }
    if (runtimeState.activeMode === MV_MODE) renderMv();
}

async function drawAll() {
    if (mv.isV2(currentRecord())) return drawAllAssets();
    const opened = viewTarget();
    const record0 = currentRecord();
    let shots = structuredClone(record0?.shots || []);
    if (view.mode === 'tegaki' && view.cache?.song) { try { const ids = new Set(mv.shotsInRange(record0, view.cache.song).map(s => s.id)); shots = shots.filter(s => ids.has(s.id)); } catch {} }
    const queue = {}; view.drawQueue = queue;
    view.drawingAll = true; view.stopAll = false;
    renderMv();
    try {
        for (const shot of shots) {
            if (view.stopAll || view.drawQueue !== queue) break;
            if (hasImg(shot)) continue;
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
    const taps = currentRecord()?.timing?.taps || {};
    const before = Object.keys(taps).map(Number).filter(i => i < index && Number.isFinite(taps[i])).sort((a, b) => b - a)[0];
    const after = Object.keys(taps).map(Number).filter(i => i > index && Number.isFinite(taps[i])).sort((a, b) => a - b)[0];
    const low = before === undefined ? 0 : taps[before] + (index - before) * 0.5;
    const high = after === undefined ? Infinity : taps[after] - (after - index) * 0.5;
    value = Math.max(low, Math.min(value, high));
    mv.patchRecord(view.songId, { timing: { ...(currentRecord()?.timing || {}), taps: { ...(currentRecord()?.timing?.taps || {}), [index]: value } } });
}

export function handleMvClick(event) {
    const el = event.target?.closest?.('[data-rmt-mv]');
    if (!el || el.disabled) return false;
    event.preventDefault?.();
    const action = el.dataset.rmtMv;
    const id = el.dataset.rmtMvId || '';
    if (action === 'open') { openMv({ songId: id }); return true; }
    if (runtimeState.activeMode !== MV_MODE) return true;
    const d = view.draft ||= mv.normalizeSettings(currentRecord()?.settings);
    const record = currentRecord();
    const opened = viewTarget();
    try {
        if (action === 'retry-save') { void mv.retryMvSave(opened.scope, id).then(result => { reportResult(result, '结果已保存。'); if (isView(opened)) renderMv(); }).catch(toastError); }
        else if (action === 'export-recovery') download(new Blob([mv.exportMvRecovery(opened.scope)], { type: 'application/json' }), 'Hearttrace-MV-backup.json');
        else if (action === 'set-output') { d.output = id === 'video' ? 'video' : 'tegaki'; view.draft = mv.normalizeSettings(d); renderMv(); }
        else if (action === 'set-style') { d.style = id; renderMv(); }
        else if (action === 'set-appear') { d.appear = id; renderMv(); }
        else if (action === 'set-ratio') { d.ratio = id; renderMv(); }
        else if (action === 'set-lang') { d.lang = id; renderMv(); }
        else if (action === 'setup-prev') { view.step = Math.max(1, view.step - 1); renderMv(); }
        else if (action === 'setup-next') { view.step = Math.min(3, view.step + 1); renderMv(); }
        else if (action === 'setup-generate') {
            const settings = mv.normalizeSettings(d);
            const p = mv.generateStoryboard(view.songId, settings);
            renderMv();
            p.then(result => { reportResult(result, '分镜写好了。'); if (isView(opened)) { if (result?.pending) renderMv(); else { view.mode = settings.output; go('board'); } } })
                .catch(error => { toastError(error); if (isView(opened)) renderMv(); });
        }
        else if (action === 'rewrite-board') { view.step = 1; view.draft = mv.normalizeSettings({ ...(record?.settings || {}), ...(record?.tegaki?.range ? { range: record.tegaki.range, rangeFrom: record.tegaki.rangeFrom, rangeTo: record.tegaki.rangeTo } : {}) }); go('setup'); }
        else if (action === 'mode') { view.mode = id === 'video' ? 'video' : 'tegaki'; renderMv(); }
        else if (action === 'draw') void runDraw(id);
        else if (action === 'draw-all') void drawAll();
        else if (action === 'draw-asset') void runAsset(id);
        else if (action === 'group-layer') { const [gid, layer] = id.split(':'); mv.setGroupLayer(view.songId, gid, layer); renderMv(); }
        else if (action === 'inspect') { view.inspect = view.inspect === id ? '' : id; setTimeout(() => renderMv(), 0); }
        else if (action === 'draw-group') { const keys = mv.assetKeys(record, currentSong()).filter(k => k.startsWith(id + ':') && !mv.assetOf(record, k)?.image?.url); void (async () => { for (const key of keys) { if (view.stopAll) break; await runAsset(key); } })(); }
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
        else if (action === 'go-finish') go('finish');
        else if (action === 'go-sync') go('sync');
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
        else if (action === 'select-shot') { view.selected = id; renderMv(); }
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
        else if (action === 'tap') {
            const sections = mv.parseSections(currentSong().lyrics);
            const taps = record.timing?.taps || {};
            const next = sections.findIndex((_, i) => taps[i] === undefined || taps[i] === null);
            if (next >= 0) { setTap(next, Math.round(currentTime() * 10) / 10); renderMv(); }
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
            renderMv();
        }
        else if (action === 'tap-vocal') {
            if (!player.playing) { toastOk('先点播放，听到第一句歌词时再点。'); }
            else { setTap(Number(id) || 0, Math.round(currentTime() * 10) / 10); toastOk('已对齐：之后的段落会跟着一起移动，需要时可以在“对时间”里细调。'); renderMv(); }
        }
        else if (action === 'tap-undo') {
            const taps = { ...(record.timing?.taps || {}) };
            const keys = Object.keys(taps).filter(k => taps[k] !== null && taps[k] !== undefined).map(Number).sort((a, b) => b - a);
            if (keys.length) { delete taps[keys[0]]; mv.patchRecord(view.songId, { timing: { ...(record.timing || {}), taps } }); renderMv(); }
        }
        else if (action === 'tap-reset') { mv.patchRecord(view.songId, { timing: { taps: {}, shift: 0 } }); renderMv(); }
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
    if (input?.matches?.('[data-rmt-mv-audio]')) {
        const file = input.files?.[0];
        if (file) acceptAudio(file, file.name, true);
        return true;
    }
    if (input?.matches?.('[data-rmt-mv-image]')) {
        const file = input.files?.[0];
        const shotId = input.dataset.rmtMvId || '';
        const context = ctx();
        if (!file || !context || !shotId) return true;
        if (!/^image\//.test(file.type || '')) { toastError(core_text.safeUserError('请选择图片文件。', 'RMT_MV_IMAGE')); return true; }
        const key = mv_media.mediaKey('img', mv.mvScope(context), view.songId, shotId);
        const old = localUrls.get(key); if (old) { try { URL.revokeObjectURL(old); } catch {} }
        localUrls.set(key, URL.createObjectURL(file));
        void mv_media.putMedia(key, file, file.name).then(ok => { if (!ok) globalThis.toastr?.info?.('这台设备没能记住这张图，刷新后需要重新选择。', '心迹回廊 · MV'); });
        try { mv.patchShot(view.songId, shotId, { image: { local: key, at: Date.now() } }); } catch (error) { toastError(error); }
        renderMv();
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
    const url = found?.image?.url || '';
    const drawing = mv.isAssetDrawing(mv.mvScope(ctx()), view.songId, key);
    const cut = found?.kind !== 'bg';
    const splitSelect = '';
    return `<button type="button" class="rmt-mv-asset${url ? ' done' : ''}${cut && found?.group?.layer !== 'full' ? ' cut' : ''}" data-rmt-mv="draw-asset" data-rmt-mv-id="${esc(key)}" ${drawing || view.drawingAll ? 'disabled' : ''} aria-label="${esc(label)}：${url ? '重画' : '画'}这一张">${url ? `<img src="${esc(url)}" alt="">` : ''}<i>${drawing ? '画…' : url ? '已画' : '未画'}</i></button><small>${esc(label)}</small>${splitSelect}`;
}

// 素材检查：原图 → 拼图拆分 → 抠图结果 → 播放时的用法，逐张对照。
function inspectHtml(record, g, diffs) {
    const rows = diffs.filter(d => d.image?.url).map(d => {
        const raw = imageFor(d.image.url);
        const override = d.image.split || 'auto';
        const crop = raw ? cropFor(d.image.url, raw, override) : null;
        if (g.layer !== 'full' && raw) cutoutFor(d.image.url, override);
        const meta = cutMeta.get(d.image.url);
        const cut = cutouts.get(d.image.url + '|' + override);
        const splitText = { none: '不拆', left: '左半', right: '右半', top: '上半', bottom: '下半' };
        const use = g.layer === 'full' ? '完整画面' : meta?.failed ? '抠图失败 → 按完整画面显示' : meta ? '分层（叠在背景上）' : '处理中…';
        return `<div class="rmt-mv-inspect-row"><figure><img src="${esc(d.image.url)}" alt=""><figcaption>原图</figcaption></figure>
          ${g.layer !== 'full' && cut?.src ? `<figure class="cut"><img src="${esc(cut.src)}" alt=""><figcaption>抠图后</figcaption></figure>` : ''}
          <div><b>${esc(d.label)}</b><small>拆分：${crop ? `${esc(splitText[crop.split] || '不拆')}${override === 'auto' ? '（自动）' : '（手动）'}` : '图片载入中'}</small>
          ${g.layer !== 'full' && meta && !meta.tainted ? `<small>抠掉的白底：${Math.round((meta.clearRatio || 0) * 100)}%</small>` : ''}${meta?.tainted ? '<small>外站图片读不了像素，按原图显示</small>' : ''}<small>播放时：${use}</small></div></div>`;
    }).join('');
    const layerTools = `<div class="rmt-mv-actions">${btn('group-layer', g.layer === 'full' ? '现在：完整画面 · 改为分层抠图' : '现在：分层抠图 · 改为完整画面', { id: `${g.id}:${g.layer === 'full' ? 'cutout' : 'full'}` })}</div>
      <p class="rmt-x-note">${g.layer === 'full' ? '完整画面：人物、道具和场景在同一张图里（推荐）。改成分层后需要重画成白底人物。' : '分层抠图：白底人物抠图后叠到背景上；抠不干净的图会自动按完整画面显示。'}</p>`;
    const splitTools = diffs.filter(d => d.image?.url).map(d => `<label class="rmt-mv-look"><span>${esc(d.label)} · 拼图拆分</span><select class="rmt-mv-split" data-rmt-mv-split="${esc(g.id + ':' + d.id)}">${[['auto', '自动'], ['none', '不拆'], ['left', '取左半'], ['right', '取右半'], ['top', '取上半'], ['bottom', '取下半']].map(([v, l]) => `<option value="${v}"${(d.image.split || 'auto') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`).join('');
    return `<details class="rmt-mv-inspect"${view.inspect === g.id ? ' open' : ''}><summary data-rmt-mv="inspect" data-rmt-mv-id="${esc(g.id)}">素材检查（画面有问题时再打开）</summary>${rows}${splitTools}${layerTools}</details>`;
}

function renderGroupsBoard(song, record) {
    const sections = mv.parseSections(song.lyrics);
    const keys = mv.assetKeys(record, song);
    const drawn = keys.filter(k => mv.assetOf(record, k)?.image?.url).length;
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
        const lyrics = frames.filter(s => s.lyric).slice(0, 8).map(s => `${g.diffs.find(d => d.id === s.diff)?.label || ''}｜${s.lyric}`).join('\n');
        const bgIds = g.layer === 'full' ? [] : (g.bgs || []).length ? g.bgs.filter(b => frames.some(s => (s.bg || 'B1') === b.id)).map(b => b.id) : ['bg'];
        const bgTiles = (g.layer === 'full' ? [] : bgIds.length ? bgIds : ['bg']).map(id => `<div>${assetTile(record, `${g.id}:${id}`, (g.bgs || []).find(b => b.id === id)?.label ? '背景·' + g.bgs.find(b => b.id === id).label : '背景')}</div>`).join('');
        const missing = [...(g.layer === 'full' ? [] : bgIds.length ? bgIds : ['bg']).map(id => `${g.id}:${id}`), ...usedDiffs.map(d => `${g.id}:${d.id}`)].filter(k => !mv.assetOf(record, k)?.image?.url).length;
        return `<article class="rmt-mv-gcard"><div class="rmt-x-row-head"><b class="rmt-mv-gname">构图 ${shown} · ${esc(g.composition || '')}</b><span>${esc(secNames)} · ${frames.length} 句</span></div>
          <div class="rmt-mv-assets">${bgTiles}${bgTiles ? '<span class="rmt-mv-plus">+</span>' : ''}${usedDiffs.map(d => `<div>${assetTile(record, `${g.id}:${d.id}`, d.label)}</div>`).join('')}</div>
          ${inspectHtml(record, g, usedDiffs)}
          ${lyrics ? `<div class="rmt-mv-lyric"><p>${esc(lyrics)}</p></div>` : ''}
          <div class="rmt-mv-actions">${btn('draw-group', missing ? `画这一组剩下的 ${missing} 张` : '这一组已画好', { id: g.id, disabled: !missing || view.drawingAll, cls: missing ? 'rmt-x-primary' : 'rmt-x-secondary' })}</div>
          <p class="rmt-x-note">点任意一张缩略图可以单独重画。</p>
          ${g.link ? `<div class="rmt-mv-link">↓ 承接：${esc(g.link)}</div>` : ''}</article>`;
    }).join('');
    const motif = record.motif ? `<section class="rmt-x-card"><div class="rmt-x-row-head"><b>意象：${esc(record.motif.name || '装饰')}</b><span>副歌时漂浮</span></div><div class="rmt-mv-assets"><div>${assetTile(record, 'motif', '意象')}</div></div></section>` : '';
    const wd = record.wardrobe || {};
    const wardrobe = `<details class="rmt-x-card"${wd.char || wd.era ? '' : ' open'}><summary><b>时代与衣着</b>（每一张都用同一套）</summary>
      <label class="rmt-mv-look"><span>时代 / 场景</span><input type="text" maxlength="200" data-rmt-mv-wardrobe="era" value="${esc(wd.era || '')}"></label>
      <label class="rmt-mv-look"><span>他的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="char" value="${esc(wd.char || '')}"></label>
      ${mv.normalizeSettings(record.settings).appear === 'none' ? '' : `<label class="rmt-mv-look"><span>你的衣着</span><input type="text" maxlength="300" data-rmt-mv-wardrobe="user" value="${esc(wd.user || '')}"></label>`}
      <p class="rmt-x-note">改完之后重画的图才会生效。</p></details>`;
    const warn = mv.frameNeedsUserLooks(record, ctx()) && record.groups.some(g => g.who === 'both' || g.who === 'user') ? `<div class="rmt-mv-warn">还没有填写你的外貌，画出来的你可能每张不一样。</div>${looksEditor()}` : '';
    page('构图卡片', '印象曲', `${head(song.title + ' · 手书', '构图卡片', '每张卡片是一个构图：同一个机位里画几张连续变化的完整画面，播放时按歌词切换。')}
      <section class="rmt-mv-palette"><span class="rmt-mv-cover">${coverUrl(song) ? `<img src="${esc(coverUrl(song))}" alt="">` : ''}</span><div><b>从封面取色</b><span>${palette.map(c => `<i style="background:${c}"></i>`).join('')}</span></div><small>片头片尾<br>用封面</small></section>
      <section class="rmt-x-card"><b>做哪一段</b>${rangePicker('record', o, sections)}</section>
      <section class="rmt-x-card"><div class="rmt-x-row-head"><b>已画 ${drawn} / ${keys.length} 张</b><span>${esc(mv.playRange(record, song).label)}</span></div>
        <div class="rmt-x-bar"><i style="width:${keys.length ? Math.round(drawn / keys.length * 100) : 0}%"></i></div>
        ${remaining ? btn(view.drawingAll ? 'draw-stop' : 'draw-all', view.drawingAll ? '停止连续绘制' : `一次画完剩下的 ${remaining} 张（会用 ${remaining} 次生图）`) : ''}
        ${btn('go-tegaki', '去剪辑台预览', { cls: 'rmt-x-primary' })}</section>
      ${wardrobe}${warn}${cards || '<p class="rmt-x-note">选中的段落里还没有构图，可以重新写分镜。</p>'}${motif}
      <div class="rmt-mv-actions">${btn('rewrite-board', '重新写分镜')}</div>`);
}

// ---------- 手书 v2：抠图、取色、渲染 ----------

const cutouts = new Map();
const cutMeta = new Map();
const palettes = new Map();

// 拼图识别：模型偶尔把同一人物画成左右或上下两格。缩小成灰度图比较两半，几乎一样就只取一格。
// 封面就是给这首印象曲画的专辑封面（存在 song.visual.cgImage）。
function coverUrl(song) { return song?.visual?.cgImage?.url || song?.cgImage?.url || ''; }

const panelCache = new Map();
function detectPanels(img) {
    try {
        const n = 48, c = document.createElement('canvas'); c.width = n; c.height = n;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
        const d = g.getImageData(0, 0, n, n).data;
        const v = (x, y) => { const i = (y * n + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
        let lr = 0, tb = 0, spread = 0, mean = 0;
        for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) mean += v(x, y);
        mean /= n * n;
        for (let y = 0; y < n; y += 1) for (let x = 0; x < n / 2; x += 1) { lr += Math.abs(v(x, y) - v(x + n / 2, y)); spread += Math.abs(v(x, y) - mean); }
        for (let y = 0; y < n / 2; y += 1) for (let x = 0; x < n; x += 1) tb += Math.abs(v(x, y) - v(x, y + n / 2));
        const half = n * n / 2;
        lr /= half; tb /= half; spread = Math.max(1, spread / half);
        // 两半差异远小于画面本身的起伏，才判为重复拼图；普通双人同框两边人物不同，不会被误拆。
        if (lr < 16 && lr < spread * 0.35 && lr <= tb) return { split: 'left', score: lr };
        if (tb < 16 && tb < spread * 0.35) return { split: 'top', score: tb };
        return { split: 'none', score: Math.min(lr, tb) };
    } catch { return { split: 'none', score: -1 }; }
}

function cropFor(url, img, override) {
    let auto = panelCache.get(url);
    if (!auto) { auto = detectPanels(img); panelCache.set(url, auto); }
    const split = override && override !== 'auto' ? override : auto.split;
    const w = img.naturalWidth, h = img.naturalHeight;
    const rect = { left: [0, 0, w / 2, h], right: [w / 2, 0, w / 2, h], top: [0, 0, w, h / 2], bottom: [0, h / 2, w, h / 2] }[split] || [0, 0, w, h];
    return { split, auto: auto.split, rect };
}

function drawCropCover(g, img, rect, w, h, scale = 1) {
    const [sx, sy, sw, sh] = rect;
    const r = Math.max(w / sw, h / sh) * scale;
    const dw = sw * r, dh = sh * r;
    g.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// 白底人物：从四边向内漫水填充近白色像素并设为透明；外站图片读不了像素时直接用原图。
function cutoutFor(url, override = 'auto') {
    if (!url) return null;
    const cacheKey = url + '|' + override;
    const ready = cutouts.get(cacheKey);
    if (ready) return ready.complete && ready.naturalWidth ? ready : null;
    const src = imageFor(url);
    if (!src) return null;
    try {
        const crop = cropFor(url, src, override);
        const [sx, sy, sw, sh] = crop.rect;
        const scale = Math.min(1, 1400 / Math.max(sw, sh));
        const cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
        const img = g.getImageData(0, 0, cw, ch);
        const d = img.data;
        const white = p => { const i = p * 4; const mn = Math.min(d[i], d[i + 1], d[i + 2]); return mn > 228 && Math.max(d[i], d[i + 1], d[i + 2]) - mn < 26; };
        const seen = new Uint8Array(cw * ch);
        const stack = [];
        for (let x = 0; x < cw; x += 1) stack.push(x, (ch - 1) * cw + x);
        for (let y = 0; y < ch; y += 1) stack.push(y * cw, y * cw + cw - 1);
        while (stack.length) {
            const p = stack.pop();
            if (seen[p]) continue;
            seen[p] = 1;
            if (!white(p)) continue;
            d[p * 4 + 3] = 0;
            const x = p % cw;
            if (x > 0) stack.push(p - 1);
            if (x < cw - 1) stack.push(p + 1);
            if (p >= cw) stack.push(p - cw);
            if (p < cw * (ch - 1)) stack.push(p + cw);
        }
        // 手臂内侧、衣摆间这类被包住的白底：只去掉面积够大、非常白的区域，保留衣服上的小块白色细节。
        const pure = p => { const i = p * 4; const mn = Math.min(d[i], d[i + 1], d[i + 2]); return d[i + 3] !== 0 && mn > 240 && Math.max(d[i], d[i + 1], d[i + 2]) - mn < 14; };
        const minArea = Math.max(250, Math.round(cw * ch * 0.0015));
        const mark = new Uint8Array(cw * ch);
        for (let start = 0; start < cw * ch; start += 1) {
            if (mark[start] || !pure(start)) continue;
            const region = []; const q = [start]; mark[start] = 1;
            while (q.length) {
                const p = q.pop(); region.push(p);
                const x = p % cw;
                for (const n of [x > 0 ? p - 1 : -1, x < cw - 1 ? p + 1 : -1, p >= cw ? p - cw : -1, p < cw * (ch - 1) ? p + cw : -1]) {
                    if (n >= 0 && !mark[n] && pure(n)) { mark[n] = 1; q.push(n); }
                }
            }
            if (region.length >= minArea) for (const p of region) d[p * 4 + 3] = 0;
        }
        for (let p = 0; p < cw * ch; p += 1) {
            if (d[p * 4 + 3] === 0) continue;
            const x = p % cw;
            const edge = (x > 0 && d[(p - 1) * 4 + 3] === 0) || (x < cw - 1 && d[(p + 1) * 4 + 3] === 0) || (p >= cw && d[(p - cw) * 4 + 3] === 0) || (p < cw * (ch - 1) && d[(p + cw) * 4 + 3] === 0);
            if (edge && Math.min(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) > 190) d[p * 4 + 3] = 110;
        }
        g.putImageData(img, 0, 0);
        let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
        for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
            if (d[(y * cw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        let clear = 0;
        for (let p = 0; p < cw * ch; p += 7) if (d[p * 4 + 3] === 0) clear += 1;
        const clearRatio = clear / Math.ceil(cw * ch / 7);
        // 抠掉的面积太少，说明这张不是白底人物（背景没被识别成白色）：按完整画面显示，不拿去叠背景。
        cutMeta.set(url, { cx: (x1 + x0) / 2 / cw, bottom: y1 / ch, height: Math.max(0.01, (y1 - y0) / ch), clearRatio, split: crop.split, autoSplit: crop.auto, failed: clearRatio < 0.15 || !(x1 > x0 && y1 > y0) });
        const out = new Image();
        out.onload = () => { drawNow(); if (view.inspect && runtimeState.activeMode === MV_MODE) renderMv(); };
        out.src = canvas.toDataURL('image/png');
        cutouts.set(cacheKey, out);
        return null;
    } catch {
        cutMeta.set(url, { failed: true, clearRatio: 0, split: 'none', autoSplit: 'none', tainted: true });
        cutouts.set(cacheKey, src);
        return src;
    }
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

function drawSceneV2(g, record, song, rows, index, t, w, h) {
    const row = rows[index];
    const group = record.groups.find(x => x.id === row.shot.group);
    g.fillStyle = coverPalette(song)[0]; g.fillRect(0, 0, w, h);
    const span = groupSpan(rows, index);
    const p = Math.min(1, Math.max(0, (t - span.start) / Math.max(0.1, span.end - span.start)));
    const push = group?.motion === 'push' ? 1 + 0.03 * p : 1;
    const bgRow = (group?.bgs || []).find(b => b.id === (row.shot.bg || 'B1')) || (group?.bgs || [])[0];
    const bg = imageFor(bgRow?.image?.url || group?.bg?.url);
    if (bg) drawCover(g, bg, w, h, push, 0, 0);
    const diff = group?.diffs.find(d => d.id === row.shot.diff);
    const override = diff?.image?.split || 'auto';
    const raw = imageFor(diff?.image?.url);
    const meta = cutMeta.get(diff?.image?.url);
    // 完整场景图（或抠图失败的图）：整张作为镜头，不叠背景、不抠白。
    if (raw && (group?.layer === 'full' || meta?.failed)) {
        drawCropCover(g, raw, cropFor(diff.image.url, raw, override).rect, w, h, push);
        g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.1; g.fillStyle = coverPalette(song)[1]; g.fillRect(0, 0, w, h); g.restore();
        return;
    }
    const person = group?.layer === 'full' ? null : cutoutFor(diff?.image?.url, override);
    if (person) {
        const breathe = 1 + 0.004 * Math.sin(t * Math.PI * 2 / 3.4);
        // 人物按竖图放进画面：高度撑满（按景别放大或缩小），左右位置按分镜；横屏也不会被拉成两份。
        const pw = person.naturalWidth, ph = person.naturalHeight;
        const factor = { close: 1.35, medium: 1.05, full: 0.95, wide: 0.6 }[group.scale] || 1.05;
        const dh = h * factor, dw = pw * (dh / ph);
        const side = w > h ? 0.18 : 0.1;
        const cxp = { left: 0.5 - side, right: 0.5 + side, center: 0.5 }[group.position] || 0.5;
        const dx = w * cxp - dw / 2, dy = group.scale === 'close' ? h - dh * 0.9 : h - dh;
        // 同一构图里的差分对齐到这一组第一张：人物大小和脚底位置保持一致，换表情时不跳位。
        const ref = (group.diffs || []).map(dd => cutMeta.get(dd.image?.url)).find(Boolean);
        const cur = cutMeta.get(diff.image.url);
        const map = m => [dx + m.cx * dw, dy + m.bottom * dh];
        g.save();
        g.translate(w / 2, h); g.scale(push * breathe, push * breathe); g.translate(-w / 2, -h);
        if (ref && cur && ref !== cur) {
            const s = Math.min(1.18, Math.max(0.85, ref.height / Math.max(0.01, cur.height)));
            const [tx, ty] = map(ref); const [cx, cy] = map(cur);
            g.translate(tx, ty); g.scale(s, s); g.translate(-cx, -cy);
        }
        g.drawImage(person, dx, dy, dw, dh);
        g.restore();
    }
    // 统一光色：用封面中间色轻轻叠一层柔光，让人物和背景更像同一张画。
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.14; g.fillStyle = coverPalette(song)[1]; g.fillRect(0, 0, w, h); g.restore();
}

function drawMotif(g, record, song, row, t, w, h) {
    if (!record.motif?.image?.url || !isChorusSection(song, row.sectionIndex)) return;
    const img = cutoutFor(record.motif.image.url);
    if (!img) return;
    const size = Math.min(w, h) * 0.09;
    for (let i = 0; i < 7; i += 1) {
        const x = ((i + 0.5) / 7) * w + Math.sin(t * 0.6 + i * 1.7) * w * 0.04;
        const y = ((t * (0.05 + (i % 3) * 0.02) + i * 0.17) % 1.15) * h - size;
        g.save(); g.globalAlpha = 0.85; g.translate(x, y); g.rotate(Math.sin(t * 0.8 + i) * 0.6);
        g.drawImage(img, -size / 2, -size / 2, size, size * img.naturalHeight / Math.max(1, img.naturalWidth));
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
    const { rows, total } = mv.shotTimeline(record, song);
    if (!rows.length) return total;
    let index = rows.findIndex(r => t >= r.start && t < r.end);
    if (index < 0) index = t < rows[0].start ? 0 : rows.length - 1;
    const row = rows[index];
    drawSceneV2(g, record, song, rows, index, t, w, h);
    const prev = rows[index - 1];
    const since = t - row.start;
    if (prev && prev.shot.group !== row.shot.group) {
        if (prev.shot.cut === 'fade' && since < 0.35) { g.save(); g.globalAlpha = 1 - since / 0.35; drawSceneV2(g, record, song, rows, index - 1, t, w, h); g.restore(); }
        else if (prev.shot.cut === 'flash' && since < 0.16) { g.save(); g.globalAlpha = 0.85 * (1 - since / 0.16); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.restore(); }
    }
    drawMotif(g, record, song, row, t, w, h);
    const palette = coverPalette(song);
    const font = mv.TEGAKI_FONTS[topt.font] || mv.TEGAKI_FONTS.sans;
    if (topt.lyric === 'vertical') drawVerticalLyric(g, row.shot.lyric, w, h, since, palette[2], mv.TEGAKI_FONTS.song.stack);
    else if (topt.lyric === 'big' && row.shot.lyric) drawBigLyric(g, row.shot.lyric, w, h, since, topt.font);
    else if (topt.lyric === 'subtitle' && row.shot.lyric) {
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
    if (record.keyword && isChorusSection(song, row.sectionIndex)) {
        const bar = beatLen * 4;
        const inBar = (t - row.start) % bar;
        const pop = inBar < 0.25 ? 1.12 - 0.12 * (inBar / 0.25) : 1;
        g.save(); g.translate(w * 0.08, h * 0.86); g.scale(pop, pop);
        g.font = `700 ${Math.round(Math.min(w, h) * 0.13)}px ${mv.TEGAKI_FONTS.song.stack}`; g.textAlign = 'left';
        g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 16; g.fillStyle = palette[2]; g.globalAlpha = 0.92;
        g.fillText(record.keyword, 0, 0); g.restore();
    }
    // 片头：第一句歌词开唱之前一直是海报加歌名；片尾最后 2.5 秒淡回海报。
    const range = mv.playRange(record, song);
    const timeline = mv.shotTimeline(record, song);
    const lineTaps = record.timing?.lineTaps || {};
    const firstSection = timeline.sections.findIndex((s, i) => s.lines.length && timeline.times[i].end > range.start);
    const tapped = firstSection >= 0 ? Number(lineTaps[`${firstSection}:0`]) : NaN;
    const firstLyric = Number.isFinite(tapped) ? tapped : firstSection >= 0 ? timeline.times[firstSection].start : range.start;
    const titleEnd = Math.min(range.end, Math.max(range.start, firstLyric));
    const toEnd = range.end - t;
    if (titleEnd - range.start >= 1 && t < titleEnd) drawTitleCard(g, song, w, h, t > titleEnd - 0.5 ? (titleEnd - t) / 0.5 : 1);
    else if (toEnd < 2.5) drawTitleCard(g, song, w, h, (2.5 - toEnd) / 1.2);
    return total;
}
