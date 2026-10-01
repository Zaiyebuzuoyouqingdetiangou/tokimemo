// 印象曲 MV：同一张分镜表可以做成手书（插件内播放与导出）或视频（提示词交给视频工具）。
// 写分镜是一次文字请求；首帧由用户逐张手动绘制。数据按聊天、按歌保存，不写入正式档案。
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';
import * as core_castLooks from '../core/castLooks.js';
import * as archive_repository from '../archive/repository.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as cg_core from '../generation/cgImageCore.js';
import * as cg_appearance from '../generation/cgAppearance.js';

export const MV_KEY = 'heartbeatMemoriesMvV1';
const LOCAL_PREFIX = 'heartbeatMemoriesMvV1:';
export const MV_STYLES = Object.freeze({
    tegaki: [
        { id: 'keep', name: '沿用原有画风', desc: '用生图渠道里已设好的画风和画师串，不额外加颜色。', prompt: '' },
        { id: 'line', name: '线稿手书', desc: '黑白线条加一两种颜色，最有手书味。', prompt: 'hand-drawn tegaki MV frame, clean line art, minimal flat coloring, muted palette, paper texture background' },
        { id: 'water', name: '水彩', desc: '晕染的淡彩，温柔。', prompt: 'hand-drawn watercolor illustration, soft bleeding pastel washes, light paper texture' },
        { id: 'pastel', name: '粉彩厚涂', desc: '颜色饱满，像插画。', prompt: 'painterly anime illustration, soft thick pastel paint, rich but gentle colors' },
        { id: 'mono', name: '单色剪影', desc: '只用一个颜色，氛围感强。', prompt: 'monochrome single-color illustration, strong silhouettes, minimal shapes, atmospheric' },
    ],
    video: [
        { id: 'keep', name: '沿用原有画风', desc: '用生图渠道里已设好的画风和画师串。', prompt: '' },
        { id: 'film', name: '电影感', desc: '光影讲究，最稳。', prompt: 'cinematic film still, natural lighting, shallow depth of field, subtle film grain' },
        { id: 'soft', name: '日系清新', desc: '明亮柔和。', prompt: 'bright soft Japanese film look, airy pastel light, gentle haze' },
        { id: 'anime', name: '动画风', desc: '像番剧片头。', prompt: 'high quality anime key visual, clean cel shading, vivid light' },
        { id: 'night', name: '夜色氛围', desc: '霓虹、雨夜。', prompt: 'night city atmosphere, neon reflections, moody contrast, cinematic' },
    ],
});
export const MV_APPEAR = Object.freeze({ face: '露脸出镜', back: '只拍背影或手', none: '不出镜' });
export const MV_MOTIONS = Object.freeze({ still: '不动', push: '缓慢推近' });
// 旧数据里的平移、晃动一律按“缓慢推近 / 不动”播放，画面不再左右上下跑。
export function motionOf(value) { return value === 'still' || value === 'sway' ? 'still' : 'push'; }
export const MV_CUTS = Object.freeze({ cut: '直接切', fade: '淡入淡出', flash: '闪白' });

const running = new Set();
const volatileByScope = new Map();
const pendingByScope = new Map();
let resultSequence = 0;
const list = value => Array.isArray(value) ? value : [];

// ---------- 存储 ----------

function scopeOf(context) { return core_context.chatScopeKey(context); }

function readLocal(scope) {
    try {
        const raw = globalThis.localStorage?.getItem(LOCAL_PREFIX + scope);
        const value = raw ? JSON.parse(raw) : null;
        return value && typeof value === 'object' && value.songs ? value : null;
    } catch { return null; }
}

function mergeStores(a, b) {
    const out = { version: 1, songs: {} };
    for (const source of [a, b]) {
        for (const [id, record] of Object.entries(source?.songs || {})) {
            const prev = out.songs[id];
            if (!prev || (Number(record?.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) out.songs[id] = record;
        }
    }
    return out;
}

export function readMvStore(context) {
    return mergeStores(mergeStores(context?.chatMetadata?.[MV_KEY], readLocal(scopeOf(context))), volatileByScope.get(scopeOf(context)));
}

export function readMv(context, songId) {
    return readMvStore(context).songs[songId] || null;
}

function confirmedWrite(key, value) {
    try {
        const storage = globalThis.localStorage;
        if (typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') return false;
        const text = JSON.stringify(value);
        storage.setItem(key, text);
        return storage.getItem(key) === text;
    } catch { return false; }
}

function persistStore(scope, store, live = null) {
    volatileByScope.set(scope, structuredClone(store));
    let durable = confirmedWrite(LOCAL_PREFIX + scope, store);
    if (live && scopeOf(live) === scope) {
        live.chatMetadata[MV_KEY] = store;
        // 聊天 metadata 才是正式保存位置；本机副本写不进去（手机本机空间满）时不再判为保存失败。
        try { Promise.resolve(live.saveMetadataDebounced?.()).catch(() => {}); durable = durable || typeof live.saveMetadataDebounced === 'function'; } catch { /* Local/journal copy survives. */ }
    }
    return durable;
}

export function pendingMv(scope) {
    if (!pendingByScope.has(scope)) {
        let rows = [];
        let raw = '';
        try { raw = globalThis.localStorage?.getItem(LOCAL_PREFIX + scope + ':pending') || '[]'; rows = JSON.parse(raw); } catch {}
        const valid = Array.isArray(rows) ? rows.filter(row => row?.scope === scope && row?.id) : [];
        pendingByScope.set(scope, valid);
        // 旧版本写下的待保存记录可能每条都带整份存档，读到后立刻瘦身写回，腾出本机空间。
        if (valid.some(row => row?.base)) { try { globalThis.localStorage?.setItem(LOCAL_PREFIX + scope + ':pending', JSON.stringify(slimPending(valid))); } catch {} }
    }
    return structuredClone(pendingByScope.get(scope));
}

// 待保存结果写入本机时不带整份 MV 存档快照（base）：每条都带一份会很快撑满本机空间，
// 导致后面所有结果都“本机保存未能确认”、重画也存不进去。base 只留在本页内存里。
function slimPending(rows) {
    return rows.map(row => { const { base, ...rest } = row || {}; return rest; });
}

function savePending(scope, rows) {
    pendingByScope.set(scope, structuredClone(rows));
    return confirmedWrite(LOCAL_PREFIX + scope + ':pending', slimPending(rows));
}

function songSignature(song) {
    const { visual, ...text } = song || {};
    return JSON.stringify(text);
}

export function captureMvTarget(context, songId) {
    const { song, memory } = loadSong(context, songId);
    return { scope: scopeOf(context), songId, song: structuredClone(song), memory: structuredClone(memory),
        origin: core_context.captureTaskOrigin(context, memory.archiveRevision || ''),
        base: structuredClone(readMvStore(context)) };
}

function targetContext(target) {
    // MV 分镜与图片只依赖这首歌本身；档案更新（记忆变多）不会让已画好的图失效。
    try {
        const live = core_context.currentCharacterGuard();
        if (scopeOf(live) !== target.scope) return null;
        const { song } = loadSong(live, target.songId);
        return songSignature(song) === songSignature(target.song) ? live : null;
    } catch { return null; }
}

function resultBasis(record, kind, shotId) {
    if (kind === 'append') return JSON.stringify(record ? {
        createdAt: record.createdAt, version: record.version, settings: record.settings,
        shots: list(record.shots).map(s => [s.id, s.sectionIndex, s.group, s.diff]),
    } : null);
    if (kind === 'story') {
        return JSON.stringify(record ? { settings: record.settings, shots: record.shots } : null);
    }
    if (kind === 'asset') return JSON.stringify(assetOf(record, shotId)?.image || null);
    return JSON.stringify(list(record?.shots).find(shot => shot.id === shotId) || null);
}

async function holdResult(target, kind, shotId, raw, prepare) {
    const { memory, ...savedTarget } = target;
    const row = { ...savedTarget, kind, shotId, raw: structuredClone(raw),
        id: `MV_${Date.now().toString(36)}_${++resultSequence}_${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(), expected: resultBasis(target.base.songs[target.songId], kind, shotId), patch: null };
    // Journal first: even a malformed paid response must remain exportable.
    savePending(row.scope, [...pendingMv(row.scope), row]);
    try { row.patch = prepare(raw); }
    catch (error) { row.reason = core_text.safeErrorSummary(error); }
    savePending(row.scope, pendingMv(row.scope).map(value => value.id === row.id ? row : value));
    return retryMvSave(row.scope, row.id);
}

export async function retryMvSave(scope, id) {
    const row = pendingMv(scope).find(value => value.id === id);
    if (!row) return { pending: false, alreadySaved: true, scope };
    const held = message => {
        row.reason = message;
        const durable = savePending(scope, pendingMv(scope).map(value => value.id === id ? row : value));
        return { pending: true, durable, scope, id, message: message + (durable ? '，结果已暂存，可仅重试保存或导出。' : '，结果仅保留在本页内存，请先导出再刷新。') };
    };
    const live = targetContext(row);
    if (!live) return held('原聊天、档案或歌曲已变化');
    const store = mergeStores(row.base, readMvStore(live));
    const current = store.songs[row.songId] || null;
    // A saved paid response may predate the section-index compatibility fix.
    // Re-prepare it locally; retrying save must never send another model request.
    if (!row.patch && row.kind === 'append' && current && resultBasis(current, row.kind, row.shotId) === row.expected) {
        try {
            const { memory } = loadSong(live, row.songId);
            const missing = list(row.appendSections).length ? row.appendSections : missingStoryboardSections(current, row.song);
            row.patch = continuationPatch(row.raw, current, memory, row.song, normalizeSettings(current.settings), missing);
            savePending(scope, pendingMv(scope).map(value => value.id === id ? row : value));
        } catch (error) { row.reason = core_text.safeErrorSummary(error); }
    }
    if (!row.patch) return held(row.reason || '返回内容尚不能保存');
    let next = current ? structuredClone(current) : null;
    if (!list(current?.appliedResults).includes(row.id)) {
        if (resultBasis(current, row.kind, row.shotId) !== row.expected) return held('分镜或图片已有新修改');
        if (row.kind === 'story') next = { timing: { taps: {}, shift: 0 }, duration: 0, ...next, ...row.patch };
        else if (row.kind === 'append') {
            next.shots = [...list(next.shots), ...row.patch.shots].sort((a, b) => a.sectionIndex - b.sectionIndex);
            if (isV2(next)) next.groups = [...next.groups, ...row.patch.groups];
        }
        else if (row.kind === 'asset') {
            const found = assetOf(next, row.shotId);
            if (!found) return held('原构图已不存在');
            found.image = row.patch.image;
            if (found.group && row.patch.seed && !found.group.seed) found.group.seed = row.patch.seed;
        } else {
            const shot = list(next?.shots).find(value => value.id === row.shotId);
            if (!shot) return held('原镜头已不存在');
            Object.assign(shot, row.patch);
        }
        next.archiveRevision = row.origin.archiveRevision;
        next.appliedResults = [...list(next.appliedResults), row.id];
        next.updatedAt = Math.max(Date.now(), (current?.updatedAt || 0) + 1);
        store.songs[row.songId] = next;
    }
    if (!persistStore(scope, store, live)) return held('本机保存未能确认');
    savePending(scope, pendingMv(scope).filter(value => value.id !== id));
    return { pending: false, durable: true, scope, record: next };
}

export function exportMvRecovery(scope) {
    let store = mergeStores(readLocal(scope), volatileByScope.get(scope));
    try {
        const live = core_context.currentCharacterGuard();
        if (scopeOf(live) === scope) store = readMvStore(live);
    } catch {}
    return JSON.stringify({ version: 1, scope, store, pending: pendingMv(scope) }, null, 2);
}

// Manual edits use their captured scope as well; no asynchronous callback may select a new chat.
export function writeMv(scope, songId, mutate, base = null) {
    let live = null;
    try { live = core_context.currentCharacterGuard(); } catch {}
    if (live && scopeOf(live) !== scope) live = null;
    const store = mergeStores(base, live ? readMvStore(live) : mergeStores(readLocal(scope), volatileByScope.get(scope)));
    const current = store.songs[songId] ? structuredClone(store.songs[songId]) : null;
    const next = mutate(current);
    if (!next) return current;
    next.updatedAt = Math.max(Date.now(), (current?.updatedAt || 0) + 1);
    store.songs[songId] = next;
    if (!persistStore(scope, store, live)) throw core_text.safeUserError('本机保存未能确认，修改仍在本页内存，可导出备份后再刷新。', 'RMT_MV_SAVE_FAILED');
    return next;
}

// ---------- 歌曲与段落 ----------

export function loadSong(context, songId) {
    const memory = archive_repository.requireArchive(context);
    const session = core_cache.loadSession(core_constants.MODE.THEME_SONG, { context, memoryBank: memory, clone: true });
    const song = list(session?.songs).find(item => item?.id === songId && !item.generationIncomplete);
    if (!song) throw core_text.safeUserError('找不到这首印象曲，可能已被删除。', 'RMT_MV_SONG');
    return { song, memory };
}

export function songBpm(song) {
    const direct = Number(song?.bpm);
    if (Number.isInteger(direct) && direct >= 40 && direct <= 240) return direct;
    const match = String(song?.stylePrompt || '').match(/(\d{2,3})\s*bpm/i);
    const parsed = match ? Number(match[1]) : 0;
    return parsed >= 40 && parsed <= 240 ? parsed : 0;
}

const SECTION_NAMES = [
    [/^intro/i, '前奏'], [/^pre-?chorus/i, '导歌'], [/^final chorus/i, '最后的副歌'], [/^chorus/i, '副歌'], [/^post-?chorus/i, '副歌后'],
    [/^verse/i, '主歌'], [/^bridge/i, '桥段'], [/^outro/i, '尾奏'], [/^(instrumental|interlude|break|solo)/i, '间奏'], [/^hook/i, '副歌'],
];

export function sectionLabel(tag) {
    const found = SECTION_NAMES.find(([re]) => re.test(tag));
    const number = String(tag).match(/(\d+)\s*$/)?.[1];
    return found ? found[1] + (number && !/^(intro|outro)/i.test(tag) ? ` ${number}` : '') : tag;
}

export function parseSections(lyrics) {
    const sections = [];
    let current = null;
    for (const raw of String(lyrics || '').split('\n')) {
        const line = raw.trim();
        const tag = line.match(/^\[([^\]]+)\]$/)?.[1];
        if (tag) {
            if (/^end$/i.test(tag)) break;
            current = { tag, name: sectionLabel(tag), lines: [] };
            sections.push(current);
            continue;
        }
        if (!line) continue;
        if (!current) { current = { tag: 'Intro', name: '前奏', lines: [] }; sections.push(current); }
        if (!/^\(.*\)$/.test(line) && !/^（.*）$/.test(line)) current.lines.push(line);
    }
    return sections;
}

// 估计时间：每句约 2 小节（4/4），纯器乐段约 4 小节；有音频时长就整体缩放到实际长度。
export function estimatedStarts(sections, bpm, duration = 0) {
    const beat = 60 / (bpm || 90);
    const lengths = sections.map(s => (s.lines.length ? s.lines.length * 8 : 16) * beat);
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    const scale = duration > 0 ? duration / total : 1;
    const starts = [];
    let t = 0;
    for (const len of lengths) { starts.push(t); t += len * scale; }
    return { starts, total: duration > 0 ? duration : total };
}

// 用户打过点的段用打点时间；没打点的段跟着前一个打点一起平移。
export function sectionTimes(record, sections, bpm) {
    const duration = Number(record?.duration) || 0;
    const { starts, total } = estimatedStarts(sections, bpm, duration);
    const taps = record?.timing?.taps || {};
    const shift = Number.isFinite(Number(record?.timing?.shift)) ? Number(record.timing.shift) : 0;
    const out = [];
    let delta = 0;
    for (let i = 0; i < sections.length; i += 1) {
        const tapped = Number.isFinite(Number(taps[i])) && taps[i] !== null && taps[i] !== undefined;
        if (tapped) delta = Number(taps[i]) - starts[i];
        out.push({ start: Math.max(i ? out[i - 1].start + 0.5 : 0, (tapped ? Number(taps[i]) : starts[i] + delta) + shift), tapped, estimate: starts[i] });
    }
    for (let i = 0; i < out.length; i += 1) out[i].end = i + 1 < out.length ? Math.max(out[i].start + 0.5, out[i + 1].start) : Math.max(out[i].start + 1, total + shift);
    return { sections: out, total: Math.max(total + shift, out.at(-1)?.end || 0) };
}

export function shotTimeline(record, song) {
    const sections = parseSections(song.lyrics);
    const { sections: times, total } = sectionTimes(record, sections, songBpm(song));
    const shots = list(record?.shots);
    const rows = [];
    times.forEach((time, index) => {
        const own = shots.filter(shot => shot.sectionIndex === index);
        const span = time.end - time.start;
        const phaseFactor = { prep: 0.7, action: 0.6, settle: 1.3, still: 1 };
        const quick = record?.tegaki?.template === 'quick';
        const weights = own.map(shot => quick ? 1 : Math.min(3, Math.max(1, Number(shot.hold) || 1)) * (phaseFactor[shot.phase] || 1));
        const sum = weights.reduce((a, b) => a + b, 0) || 1;
        let acc = 0;
        own.forEach((shot, k) => { const a = acc; acc += weights[k]; rows.push({ shot, start: time.start + span * a / sum, end: time.start + span * acc / sum, sectionIndex: index }); });
    });
    // 逐句对时间：用户边听边点每一句的开头，对应歌词的镜头直接从点下的时间开始。
    const lineTaps = record?.timing?.lineTaps || {};
    if (Object.keys(lineTaps).length) {
        const used = new Map();
        for (const row of rows) {
            const lines = sections[row.sectionIndex]?.lines || [];
            const text = String(row.shot?.lyric || '').trim();
            if (!text) continue;
            const from = used.get(row.sectionIndex) || 0;
            let idx = lines.findIndex((line, i) => i >= from && line.trim() === text);
            if (idx < 0) idx = lines.findIndex(line => line.trim() === text);
            if (idx < 0) continue;
            used.set(row.sectionIndex, idx + 1);
            const tap = Number(lineTaps[`${row.sectionIndex}:${idx}`]);
            if (Number.isFinite(tap) && tap >= 0) row.lineTap = tap;
        }
    }
    // 没有镜头的段落不留空白：前一镜一直停到下一镜开始；第一镜从 0 秒开始。
    if (rows.length) rows[0].start = 0;
    // 构图卡片版：镜头切点吸附到最近的拍点，画面跟着音乐切，而不是等时长轮播。
    if (record?.version === 2 && rows.length > 1) {
        const beat = 60 / (songBpm(song) || 90);
        for (let i = 1; i < rows.length; i += 1) {
            const snapped = Math.round(rows[i].start / beat) * beat;
            if (snapped > rows[i - 1].start + beat * 0.5 && (i + 1 >= rows.length || snapped < rows[i + 1].start - beat * 0.5)) rows[i].start = snapped;
        }
    }
    // 点过的句子以点下的时间为准（只要不早于上一镜），优先级高于估计和拍点吸附。
    for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].lineTap === undefined) continue;
        const prev = i > 0 ? rows[i - 1].start : -1;
        if (rows[i].lineTap > prev) rows[i].start = rows[i].lineTap;
    }
    for (let i = 0; i < rows.length; i += 1) rows[i].end = i + 1 < rows.length ? rows[i + 1].start : Math.max(rows[i].end, total);
    return { rows, sections, times, total };
}

export function formatTime(seconds, withFraction = false) {
    const s = Math.max(0, Number(seconds) || 0);
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return withFraction ? `${m}:${rest.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(rest)).padStart(2, '0')}`;
}

function srtTime(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function timetableText(record, song) {
    const { rows } = shotTimeline(record, song);
    return [`${song.title} · MV 镜头时间表`, '', ...rows.map((row, i) => `第 ${i + 1} 镜  ${formatTime(row.start, true)} – ${formatTime(row.end, true)}（${(row.end - row.start).toFixed(1)} 秒）\n  画面：${row.shot.plain}${row.shot.lyric ? `\n  歌词：${row.shot.lyric}` : ''}`)].join('\n') + '\n';
}

export function srtText(record, song) {
    const { rows } = shotTimeline(record, song);
    return rows.filter(row => row.shot.lyric).map((row, i) => `${i + 1}\n${srtTime(row.start)} --> ${srtTime(row.end)}\n${row.shot.lyric}\n`).join('\n');
}

// ---------- 分镜生成 ----------

function styleOf(settings) {
    const set = MV_STYLES[settings.output === 'video' ? 'video' : 'tegaki'];
    return set.find(item => item.id === settings.style) || set[0];
}

export function normalizeSettings(value) {
    const output = value?.output === 'video' ? 'video' : 'tegaki';
    const styles = MV_STYLES[output];
    return {
        output,
        style: styles.some(s => s.id === value?.style) ? value.style : styles[0].id,
        appear: Object.hasOwn(MV_APPEAR, value?.appear) ? value.appear : 'face',
        ratio: value?.ratio === '16:9' ? '16:9' : '9:16',
        lang: ['zh', 'en', 'both'].includes(value?.lang) ? value.lang : 'zh',
        range: ['chorus', 'verseChorus', 'full', 'custom'].includes(value?.range) ? value.range : 'verseChorus',
        rangeFrom: Math.max(0, Math.round(Number(value?.rangeFrom) || 0)),
        rangeTo: Math.max(0, Math.round(Number(value?.rangeTo) || 0)),
    };
}

// 按段落下标选范围：手书只做选中的这一段，视频做整首。
export function selectedSectionIndexes(sections, range, from = 0, to = 0) {
    const all = sections.map((_, i) => i);
    if (!sections.length || range === 'full') return all;
    if (range === 'custom') {
        const a = Math.min(from, to), b = Math.max(from, to);
        return all.filter(i => i >= a && i <= Math.min(b, sections.length - 1));
    }
    const chorus = sections.findIndex(s => isChorusTag(s.tag));
    if (chorus < 0) return all;
    if (range === 'chorus') return [chorus];
    let first = chorus;
    for (let i = chorus - 1; i >= 0; i -= 1) { if (/^verse/i.test(sections[i].tag)) { first = i; break; } }
    return all.filter(i => i >= first && i <= chorus);
}

function storyboardPrompt(context, memory, song, settings, sectionIndexes = null) {
    const charName = core_text.normalizeText(memory?.characterName || context?.name2, 120) || '{{char}}';
    const userName = core_text.normalizeText(memory?.userName || context?.name1, 120) || '{{user}}';
    const parsed = parseSections(song.lyrics);
    const keep = sectionIndexes || (settings.output === 'video' ? parsed.map((_, i) => i) : selectedSectionIndexes(parsed, settings.range, settings.rangeFrom, settings.rangeTo));
    const sections = parsed.map((s, i) => ({ index: i, section: s.tag, lines: s.lines })).filter(s => keep.includes(s.index));
    const appear = settings.appear === 'face' ? `${userName} 可以露脸出镜。`
        : settings.appear === 'back' ? `${userName} 只能以背影、手或剪影出现，不画正脸。` : `${userName} 不出现在画面里。`;
    return `${generation_prompts.promptSafetyBoundary(context, 'MV 分镜', null, memory)}
【任务】
为已写好的角色印象曲「${song.title}」写一张 MV 分镜表。画面风格：${styleOf(settings).name}；比例：${settings.ratio === '9:16' ? '竖屏 9:16' : '横屏 16:9'}。
歌词、曲风不改。画面跟着歌词的意象、情绪和故事走，可以是意象、想象或象征画面，不需要对应聊天档案，也不要逐条复述聊天里的事件。人物外貌、身份和世界观以角色设定为准。
出镜：${charName} 是主角。${appear}不替 ${userName} 新增台词、承诺或决定。
${settings.output === 'video' ? '' : tegakiGrammar(parseSections(song.lyrics), keep, charName)}${settings.output === 'video' ? '' : ``}

【歌曲】
曲风：${core_text.normalizeText(song.styleDescription || song.stylePrompt, 600)}
段落（sectionIndex 从 0 开始）：
${JSON.stringify(sections)}

【写作要求】
${settings.output === 'video' ? `1. 按段落写镜头：${settings.output === 'video' ? '每段 1～3 镜' : '手书节奏：每句歌词一镜'}，纯器乐段 1 镜。每镜 sectionIndex 指向所在段落；lyric 抄写这一镜对应的那一句原歌词（器乐段留空）。
2. plain：用一句大白话写这一镜画面，让不懂拍摄的人也看得懂。
3. who：画面里有谁，只能是 "char"、"both"、"user"、"none" 之一。
4. shot：景别的大白话，如“近景：看到脸”“中景：看到上半身”“远景：看到整个场景”。move：镜头怎么动的大白话，如“镜头慢慢推近”“镜头慢慢往右移”“镜头不动”。motion：从 still、push、pan、sway 里选一个最接近的。
5. imagePrompt：这一镜第一张图的英文画面描述（人物动作、表情、场景、光线、构图），不写人物外貌细节，不写文字、字幕、Logo。
6. videoZh / videoEn：给视频工具的描述，中文与英文各一份，写清画面里有什么、镜头怎么动、光线，结尾写时长约 5 秒；不写歌词原文。

` : ''}7. wardrobe：先按角色设定与世界观定下统一的时代场景与衣着（英文，具体到款式、颜色、材质），古代背景就写古装，不写现代服装；两个人的衣着必须明显不同（款式、主色都不同）；era 写时代与场所，char 写 ${charName} 的衣着${settings.appear === 'none' ? '' : `，user 写 ${userName} 的衣着`}。

【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
${settings.output === 'video'
        ? '{"wardrobe":{"era":"……","char":"……","user":"……"},"shots":[{"sectionIndex":0,"lyric":"","plain":"……","who":"char","shot":"中景：看到上半身","move":"镜头慢慢推近","motion":"push","imagePrompt":"……","videoZh":"……","videoEn":"……"}]}'
        : '{"wardrobe":{"era":"……","char":"……","user":"……"},"keyword":"副歌里最有分量的词","motif":{"name":"竹叶","prompt":"english: one decorative element"},"groups":[{"id":"G1","composition":"低机位 · 蹲下喂猫 · 人物在左","position":"left","scale":"full","characterPrompt":"english: camera angle, framing, pose base, who and what is in frame","who":"char","motion":"still","transition":"cut","link":"下一组如何承接","bgs":[{"id":"B1","label":"午后","prompt":"english: empty scenery only"}],"diffs":[{"id":"D1","label":"伸手前","change":"english: this moment of the action"}]}],"frames":[{"sectionIndex":1,"lyric":"原句","group":"G1","diff":"D1","bg":"B1","hold":1,"phase":"prep"}]}'}`;
}

// 手书：少数构图，每个构图里几张连续变化的画（闭眼→睁眼→偏头），摊平成镜头。
export function flattenGroups(data) {
    const out = [];
    list(data?.groups).forEach((group, g) => {
        const frames = list(group?.frames).filter(f => core_text.normalizeText(f?.plain, 300));
        frames.forEach((frame, k) => out.push({
            ...frame,
            group: `G${g + 1}`, groupIndex: k, groupSize: frames.length, groupNext: k === frames.length - 1,
            composition: core_text.normalizeText(group?.composition, 120),
            compositionPrompt: core_text.normalizeText(group?.compositionPrompt, 600),
            link: k === frames.length - 1 ? core_text.normalizeText(group?.link, 160) : '',
            imagePrompt: [core_text.normalizeText(group?.compositionPrompt, 600), core_text.normalizeText(frame?.change, 400)].filter(Boolean).join(', '),
            shot: core_text.normalizeText(group?.composition, 60), move: '',
            motion: group?.motion === 'push' ? 'push' : 'still',
        }));
    });
    return out;
}

export function normalizeShots(data, memory, sectionCount) {
    const shots = [];
    const source = list(data?.groups).length ? flattenGroups(data) : list(data?.shots);
    for (const item of source) {
        const plain = core_text.normalizeText(item?.plain, 300);
        if (!plain) continue;
        const index = Math.min(Math.max(0, Math.round(Number(item?.sectionIndex) || 0)), Math.max(0, sectionCount - 1));
        shots.push({
            id: `S${shots.length + 1}_${Date.now().toString(36)}`,
            sectionIndex: index,
            lyric: core_text.normalizeText(item?.lyric, 200),
            plain,
            who: ['char', 'both', 'user', 'none'].includes(item?.who) ? item.who : 'char',
            shot: core_text.normalizeText(item?.shot, 40),
            move: core_text.normalizeText(item?.move, 40),
            motion: motionOf(item?.motion),
            cut: item?.group ? (item.groupNext ? 'fade' : 'cut') : 'fade',
            ...(item?.group ? { group: item.group, groupIndex: item.groupIndex, groupSize: item.groupSize, groupNext: !!item.groupNext, composition: item.composition, compositionPrompt: item.compositionPrompt, link: item.link } : {}),
            hold: Math.min(3, Math.max(1, Math.round(Number(item?.hold) || 1))),
            imagePrompt: core_text.normalizeText(item?.imagePrompt, 900),
            videoZh: core_text.normalizeText(item?.videoZh, 900),
            videoEn: core_text.normalizeText(item?.videoEn, 1200),
            sourceMemoryIds: core_evidence.normalizeSourceMemoryIds(item?.sourceMemoryIds, memory, 0),
            image: null,
            videoDone: false,
        });
    }
    if (!list(data?.groups).length) shots.sort((a, b) => a.sectionIndex - b.sectionIndex);
    if (!shots.length) throw core_text.safeUserError('这次没有收到可用的镜头，可以再试一次。', 'RMT_MV_EMPTY');
    return shots;
}

export function isMvRunning(key) { return running.has(key); }

export function missingStoryboardSections(record, song) {
    const sections = parseSections(song.lyrics);
    const o = tegakiOptions(record);
    const indexes = record?.settings?.output === 'video' ? sections.map((_, i) => i)
        : selectedSectionIndexes(sections, o.range, o.rangeFrom, o.rangeTo);
    return indexes.filter(i => !list(record?.shots).some(s => s.sectionIndex === i));
}

// Models may number a returned batch from zero/one even when the prompt uses song indexes.
// Prefer the actual lyric; retain the original index when there is no reliable correction.
function alignContinuationSections(raw, song, missing) {
    const copy = structuredClone(raw);
    const frames = list(copy?.frames).length ? copy.frames : list(copy?.groups).length
        ? copy.groups.flatMap(g => list(g?.frames)) : list(copy?.shots);
    const lyricKey = value => core_text.normalizeText(value, 200).normalize('NFKC').replace(/[\s，。！？、,.!?“”"'‘’：:；;]/g, '');
    const sections = parseSections(song.lyrics);
    const matches = frames.map(f => {
        const text = lyricKey(f?.lyric);
        return text ? sections.map((s, i) => s.lines.some(line => lyricKey(line) === text) ? i : -1).filter(i => i >= 0) : [];
    });
    const schemes = [i => i, i => missing[i], i => missing[i - 1], i => i - 1];
    const compatible = schemes.filter(map => frames.every((f, k) => {
        const n = Number(f?.sectionIndex), index = map(n);
        return Number.isInteger(n) && missing.includes(index) && (!matches[k].length || matches[k].includes(index));
    }));
    const scheme = compatible.includes(schemes[0]) ? schemes[0] : compatible.length === 1 ? compatible[0] : null;
    frames.forEach((f, k) => {
        if (!f || typeof f !== 'object') return;
        const own = matches[k].filter(i => missing.includes(i));
        if (own.length === 1) f.sectionIndex = own[0];
        else if (scheme) f.sectionIndex = scheme(Number(f.sectionIndex));
    });
    return copy;
}

// Append new work using fresh identifiers; never replace existing drawings or timing.
function continuationPatch(raw, previous, memory, song, settings, missing) {
    const built = buildShots(alignContinuationSections(raw, song, missing), memory, parseSections(song.lyrics).length, settings);
    let shots = built.shots.filter(s => missing.includes(s.sectionIndex));
    if (!shots.length) throw core_text.safeUserError('返回的分镜没有包含待补段落，原分镜已保留，可导出这次返回内容。', 'RMT_MV_EMPTY');
    let groups = list(built.groups);
    if (isV2(previous) && !isV2(built)) {
        groups = shots.map((s, i) => ({
            id: `G${i + 1}`, composition: s.plain, characterPrompt: s.imagePrompt, who: s.who,
            motion: s.motion, transition: s.cut, layer: 'full', position: 'center', scale: 'medium', seed: 0,
            bgs: [{ id: 'B1', prompt: '', image: null }],
            diffs: [{ id: 'D1', label: s.plain, change: '', bg: 'B1', image: null }],
        }));
        shots = shots.map((s, i) => ({ ...s, group: groups[i].id, diff: 'D1', bg: 'B1' }));
    } else if (!isV2(previous) && isV2(built)) {
        shots = shots.map(s => {
            const g = groups.find(g => g.id === s.group);
            const d = g.diffs.find(d => d.id === s.diff);
            return { ...s, imagePrompt: [g.characterPrompt, d.change, g.bgs.find(b => b.id === s.bg)?.prompt].filter(Boolean).join(', '), composition: g.composition };
        });
    }
    const usedGroups = new Set([...list(previous.groups).map(g => g.id), ...list(previous.shots).map(s => s.group)]);
    const groupMap = new Map();
    let groupNumber = 1;
    for (const id of new Set(shots.map(s => s.group).filter(Boolean))) {
        while (usedGroups.has(`G${groupNumber}`)) groupNumber += 1;
        const next = `G${groupNumber++}`;
        usedGroups.add(next); groupMap.set(id, next);
    }
    const prefix = `C${Date.now().toString(36)}_${++resultSequence}`;
    return {
        shots: shots.map((s, i) => ({ ...s, id: `${prefix}_${i + 1}`, ...(s.group ? { group: groupMap.get(s.group) } : {}) })),
        groups: groups.filter(g => groupMap.has(g.id)).map(g => ({ ...g, id: groupMap.get(g.id) })),
    };
}

export async function continueStoryboard(songId) {
    const context = core_context.currentCharacterGuard();
    const target = captureMvTarget(context, songId);
    const { song, memory, scope, origin } = target;
    const previous = target.base.songs[songId];
    if (!previous) return null;
    const missing = missingStoryboardSections(previous, song);
    if (!missing.length) return { pending: false, scope, record: previous, alreadyComplete: true };
    const key = `story:${scope}:${songId}`;
    if (running.has(key)) throw core_text.safeUserError('分镜正在写，稍等一下。', 'RMT_MV_RUNNING');
    const settings = normalizeSettings(previous.settings);
    running.add(key);
    try {
        const continuity = { wardrobe: previous.wardrobe || {}, keyword: previous.keyword || '', motif: previous.motif ? { name: previous.motif.name, prompt: previous.motif.prompt } : null,
            lastScene: list(previous.shots).filter(s => s.sectionIndex < missing[0]).at(-1)?.plain || '' };
        const prompt = storyboardPrompt(context, memory, song, settings, missing)
            + `\n【接着已有分镜补写】\n只补上面列出的段落，sectionIndex 沿用歌曲原编号。已有分镜和图片会保留；新构图在保存时自动分配编号。沿用已有时代、衣着和意象，并衔接已有画面：\n${JSON.stringify(continuity)}`;
        const data = await generation_client.requestJson(prompt, '正在补写剩余分镜…', { mode: 'songMv', taskKey: `extras:mv:${key}`, context, origin });
        return holdResult({ ...target, appendSections: missing }, 'append', '', data, raw => continuationPatch(raw, previous, memory, song, settings, missing));
    } finally { running.delete(key); }
}

export async function generateStoryboard(songId, settingsInput) {
    const context = core_context.currentCharacterGuard();
    const target = captureMvTarget(context, songId);
    const { song, memory, scope, origin } = target;
    const key = `story:${scope}:${songId}`;
    if (running.has(key)) throw core_text.safeUserError('分镜正在写，稍等一下。', 'RMT_MV_RUNNING');
    const settings = normalizeSettings(settingsInput);
    running.add(key);
    try {
        const data = await generation_client.requestJson(storyboardPrompt(context, memory, song, settings), '正在写 MV 分镜…', {
            mode: 'songMv', taskKey: `extras:mv:${key}`, context, origin,
        });
        return holdResult(target, 'story', '', data, raw => {
            const previous = target.base.songs[songId];
            return { id: songId, createdAt: previous?.createdAt || Date.now(), settings,
                ...buildShots(raw, memory, parseSections(song.lyrics).length, settings),
                tegaki: { ...(previous?.tegaki || {}), range: settings.range, rangeFrom: settings.rangeFrom, rangeTo: settings.rangeTo, ...(settings.output === 'tegaki' ? { lyric: 'subtitle' } : {}) },
                wardrobe: {
                    era: core_text.normalizeText(raw?.wardrobe?.era, 200) || previous?.wardrobe?.era || '',
                    char: core_text.normalizeText(raw?.wardrobe?.char, 300) || previous?.wardrobe?.char || '',
                    user: core_text.normalizeText(raw?.wardrobe?.user, 300) || previous?.wardrobe?.user || '',
                },
                songTitle: song.title };
        });
    } finally { running.delete(key); }
}

export async function rewriteShot(songId, shotId, kind) {
    const context = core_context.currentCharacterGuard();
    const target = captureMvTarget(context, songId);
    const { song, memory, scope, origin } = target;
    const record = structuredClone(target.base.songs[songId] || null);
    const shot = list(record?.shots).find(item => item.id === shotId);
    if (!shot) return null;
    const key = `rewrite:${scope}:${songId}:${shotId}`;
    if (running.has(key)) return null;
    running.add(key);
    try {
        const ask = kind === 'calm' ? '让画面里的动作和镜头运动都更小、更慢、更稳，避免大幅度动作。' : '保留这一镜的内容和歌词，换一种不同的景别和镜头运动。';
        const prompt = `${generation_prompts.promptSafetyBoundary(context, 'MV 分镜', null, memory)}
【任务】改写 MV「${song.title}」中的一个镜头。${ask}
原镜头：${JSON.stringify({ plain: shot.plain, lyric: shot.lyric, who: shot.who, shot: shot.shot, move: shot.move, motion: shot.motion, imagePrompt: shot.imagePrompt, videoZh: shot.videoZh, videoEn: shot.videoEn })}
出镜人物不变，不写新的共同经历，不写文字或 Logo。
【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
{"plain":"……","shot":"……","move":"……","motion":"push","imagePrompt":"……","videoZh":"……","videoEn":"……"}`;
        const data = await generation_client.requestJson(prompt, '正在改写这一镜…', { mode: 'songMv', taskKey: `extras:mv:${key}`, context, origin });
        return holdResult(target, 'rewrite', shotId, data, raw => {
            const patch = {};
            for (const field of ['plain', 'shot', 'move', 'imagePrompt', 'videoZh', 'videoEn']) {
                const value = core_text.normalizeText(raw?.[field], field.startsWith('video') || field === 'imagePrompt' ? 1200 : 300);
                if (value) patch[field] = value;
            }
            if (Object.hasOwn(MV_MOTIONS, raw?.motion)) patch.motion = raw.motion;
            if (!Object.keys(patch).length) throw core_text.safeUserError('返回内容没有可用的镜头修改。', 'RMT_MV_EMPTY');
            return patch;
        });
    } finally { running.delete(key); }
}

// ---------- 首帧 ----------

export function frameNeedsUserLooks(record, context) {
    if (normalizeSettings(record?.settings).appear === 'none') return false;
    const looks = core_castLooks.readCastLooks(context);
    return !core_text.normalizeText(looks?.user, 200);
}

// 衣着与时代：外貌设定只有长相，这里统一补上符合世界观的服装，所有镜头一致。
export function wardrobeLine(record, hasChar, hasUser) {
    const w = record?.wardrobe || {};
    const parts = [];
    if (w.era) parts.push(`setting: ${w.era}`);
    if (hasChar && w.char) parts.push(`${hasUser ? 'the main character' : 'the character'} wears ${w.char}`);
    if (hasUser && w.user) parts.push(`${hasChar ? 'the second person' : 'the person'} wears ${w.user}`);
    if (parts.length) parts.push('same outfits in every frame, period-accurate clothing only');
    return parts.join(', ');
}

export function framePrompt(record, shot, context) {
    const settings = normalizeSettings(record?.settings);
    const looks = core_castLooks.readCastLooks(context);
    const hasChar = shot.who === 'char' || shot.who === 'both';
    const hasUser = settings.appear !== 'none' && (shot.who === 'both' || shot.who === 'user');
    const people = { ...(looks || {}), char: hasChar ? looks?.char || '' : '', user: hasUser ? looks?.user || '' : '' };
    const lookLine = hasChar || hasUser ? core_castLooks.castLooksPromptLine(people, context) : '';
    const userRule = settings.appear === 'back' && hasUser ? `${hasChar ? 'the second person' : 'the person'} is shown only from behind, hands or silhouette, face not visible` : '';
    const noUser = !hasChar && !hasUser ? 'scenery, no humans' : hasChar && hasUser ? 'duo, two people' : 'solo';
    return [
        styleOf(settings).prompt,
        settings.ratio === '9:16' ? 'vertical 9:16 composition' : 'horizontal 16:9 composition',
        shot.imagePrompt || shot.plain,
        lookLine ? `fixed appearance, keep consistent: ${lookLine}` : '',
        wardrobeLine(record, hasChar, hasUser),
        userRule, noUser,

    ].filter(Boolean).join(', ');
}

export function isFrameDrawing(scope, songId, shotId) { return running.has(`frame:${scope}:${songId}:${shotId}`); }

export async function drawFrame(songId, shotId) {
    const context = core_context.currentCharacterGuard();
    const target = captureMvTarget(context, songId);
    const { scope } = target;
    const record = structuredClone(target.base.songs[songId] || null);
    const shot = list(record?.shots).find(item => item.id === shotId);
    if (!shot) return null;
    const key = `frame:${scope}:${songId}:${shotId}`;
    if (running.has(key)) return null;
    running.add(key);
    try {
        const result = await cg_core.invokeImageGeneration(framePrompt(record, shot, context), context, {
            orientation: normalizeSettings(record.settings).ratio === '9:16' ? 'portrait' : 'landscape',
            characterName: context?.name2 || '', targetKey: key,
        });
        return holdResult(target, 'frame', shotId, result, raw => {
            const url = cg_core.normalizeCgImageUrl(typeof raw === 'string' ? raw : raw?.url);
            if (!url) throw core_text.safeUserError('这次没有拿到可用图片。', 'RMT_MV_FRAME');
            return { image: { url, at: Date.now() } };
        });
    } finally { running.delete(key); }
}

export function patchShot(songId, shotId, patch) {
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => {
        const target = list(current?.shots).find(item => item.id === shotId);
        if (target) Object.assign(target, patch);
        return current;
    });
}

export function patchRecord(songId, patch, target = null) {
    if (target && !targetContext(target)) return null;
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => current ? Object.assign(current, patch) : current);
}

export function mvScope(context) { return scopeOf(context); }

// ---------- 手书节奏 ----------

export const TEGAKI_RANGES = Object.freeze({ chorus: '第一段副歌', verseChorus: '一段主歌 + 副歌', full: '整首' });
export const TEGAKI_RHYTHMS = Object.freeze({ line: '每句一换', beat: '跟着拍子切' });
export const TEGAKI_FONTS = Object.freeze({
    sans: { name: '清爽', stack: '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",sans-serif', weight: 600 },
    song: { name: '书卷', stack: '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC","SimSun",serif', weight: 600 },
    round: { name: '圆润', stack: '"Yuanti SC","PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif', weight: 500 },
});
export const TEGAKI_LYRICS = Object.freeze({ vertical: '竖排', subtitle: '字幕', big: '大字', none: '不显示' });
export const TEGAKI_PRESETS = Object.freeze({
    quick: { name: '一人一句快切', desc: '每句歌词一张，干脆直切，节奏紧', rhythm: 'line', lyric: 'subtitle', template: 'quick' },
    flash: { name: '白闪卡点', desc: '换构图时白闪，副歌每小节轻闪一下', rhythm: 'line', lyric: 'big', template: 'flash' },
    slow: { name: '抒情慢镜', desc: '构图之间淡入，画面缓慢推近，停留更久', rhythm: 'line', lyric: 'subtitle', template: 'slow' },
});

export function tegakiOptions(record) {
    const value = record?.tegaki || {};
    return {
        range: Object.hasOwn(TEGAKI_RANGES, value.range) || value.range === 'custom' ? value.range : (record?.settings?.range || 'verseChorus'),
        rhythm: Object.hasOwn(TEGAKI_RHYTHMS, value.rhythm) ? value.rhythm : 'line',
        lyric: Object.hasOwn(TEGAKI_LYRICS, value.lyric) ? value.lyric : (record?.subtitles === false ? 'none' : 'subtitle'),
        preset: Object.hasOwn(TEGAKI_PRESETS, value.preset) ? value.preset : '',
        template: ['quick', 'flash', 'slow'].includes(value.template) ? value.template : '',
        font: Object.hasOwn(TEGAKI_FONTS, value.font) ? value.font : 'sans',
        rangeFrom: Math.max(0, Math.round(Number(value.rangeFrom) || 0)),
        rangeTo: Math.max(0, Math.round(Number(value.rangeTo) || 0)),
    };
}

const isChorusTag = tag => /^(final )?chorus|^hook/i.test(String(tag || ''));

// 手书通常只截一段：按段落时间取范围，找不到副歌时退回整首。
export function playRange(record, song) {
    const { sections, times, total } = shotTimeline(record, song);
    const option = tegakiOptions(record).range;
    const whole = { start: 0, end: total, label: TEGAKI_RANGES.full };
    if (option === 'full') return whole;
    if (option === 'custom') {
        const o = record?.tegaki || {};
        const idx = selectedSectionIndexes(sections, 'custom', o.rangeFrom, o.rangeTo);
        if (!idx.length) return whole;
        return { start: times[idx[0]].start, end: times[idx.at(-1)].end, label: `${sections[idx[0]].name} → ${sections[idx.at(-1)].name}` };
    }
    const chorus = sections.findIndex(s => isChorusTag(s.tag));
    if (chorus < 0) return whole;
    if (option === 'chorus') return { start: times[chorus].start, end: times[chorus].end, label: TEGAKI_RANGES.chorus };
    let first = chorus;
    for (let i = chorus - 1; i >= 0; i -= 1) { if (/^verse/i.test(sections[i].tag)) { first = i; break; } }
    return { start: times[first].start, end: times[chorus].end, label: TEGAKI_RANGES.verseChorus };
}

export function shotsInRange(record, song) {
    const o = tegakiOptions(record);
    const indexes = selectedSectionIndexes(parseSections(song.lyrics), o.range, o.rangeFrom, o.rangeTo);
    return list(record?.shots).filter(shot => indexes.includes(shot.sectionIndex));
}

// Completed clips are contiguous runs of sections with all their scene images ready.
// Motifs and the cover remain optional; manually chosen ranges may include unfinished shots.
export function completedMvRanges(record, song) {
    const sections = parseSections(song.lyrics);
    const done = sections.map((_, i) => {
        const shots = list(record?.shots).filter(s => s.sectionIndex === i);
        return shots.length > 0 && shots.every(s => {
            if (!isV2(record)) return !!(s.image?.url || s.image?.local);
            const g = record.groups.find(g => g.id === s.group);
            return !!assetOf(record, `${s.group}:${s.diff}`)?.image?.url
                && (g?.layer === 'full' || !!assetOf(record, `${s.group}:${s.bg || 'bg'}`)?.image?.url);
        });
    });
    const ranges = [];
    done.forEach((ready, i) => {
        if (!ready) return;
        const last = ranges.at(-1);
        if (last && last.rangeTo === i - 1) last.rangeTo = i;
        else ranges.push({ range: 'custom', rangeFrom: i, rangeTo: i });
    });
    return ranges;
}

export function exportOptions(record, song) {
    return record?.exportRange || completedMvRanges(record, song)[0] || tegakiOptions(record);
}

export function exportRange(record, song) {
    return playRange({ ...record, tegaki: { ...record?.tegaki, ...exportOptions(record, song) } }, song);
}

export function exportRecord(record, song) {
    const copy = structuredClone(record);
    copy.tegaki = { ...copy.tegaki, ...exportOptions(record, song) };
    // Filter only after calculating the original timeline, preserving lyric taps and beat snapping.
    copy.clipSectionIndexes = [...new Set(shotsInRange(copy, song).map(s => s.sectionIndex))];
    const sections = parseSections(song.lyrics);
    if (!copy.clipSectionIndexes.some(i => isChorusTag(sections[i]?.tag))) copy.motif = null;
    return copy;
}

export function playbackTimeline(record, song) {
    const timeline = shotTimeline(record, song);
    if (!Array.isArray(record?.clipSectionIndexes)) return timeline;
    return { ...timeline, rows: timeline.rows.filter(row => record.clipSectionIndexes.includes(row.sectionIndex)) };
}

// 节奏模板：参考描改手书的固定套路，一次排好全部镜头的切换方式与停留；之后仍可逐镜修改。
export function applyTegakiPreset(songId, presetId, song) {
    const preset = TEGAKI_PRESETS[presetId];
    if (!preset) return null;
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => {
        if (!current) return current;
        current.tegaki = { ...(current.tegaki || {}), rhythm: preset.rhythm, lyric: preset.lyric, preset: presetId, template: preset.template };
        const shots = list(current.shots);
        shots.forEach((shot, i) => {
            const next = shots[i + 1];
            const change = !next || !shot.group || next.group !== shot.group;
            shot.cut = preset.template === 'quick' || !change ? 'cut' : preset.template === 'flash' ? 'flash' : 'fade';
            shot.motion = preset.template === 'slow' ? 'push' : 'still';
        });
        for (const g of list(current.groups)) g.motion = preset.template === 'slow' ? 'push' : 'still';
        return current;
    });
}

export function patchWardrobe(songId, patch) {
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => current ? Object.assign(current, { wardrobe: { ...(current.wardrobe || {}), ...patch } }) : current);
}

export function patchTegaki(songId, patch) {
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => current ? Object.assign(current, { tegaki: { ...(current.tegaki || {}), ...patch } }) : current);
}


// ---------- 手书 v2：印象曲 PV（背景 + 白底人物差分 + 意象） ----------

function tegakiGrammar(sections, keep, charName = '{{char}}') {
    const rows = keep.map(i => `${i}:${sections[i]?.tag || ''}`).join('，');
    const lineCount = keep.reduce((n, i) => n + Math.max(1, sections[i]?.lines.length || 0), 0);
    const groupHint = `${Math.max(4, Math.round(lineCount / 3))}～${Math.max(6, Math.round(lineCount / 2))}`;
    return `这是这首印象曲的手书 PV。只为这些段落写：${rows}。
手书要把歌词里发生的事“演出来”：遮住字幕，观众也能看懂他做了什么、是什么性格。不要一直用同一个半身立绘轮换表情。
- 构图组（groups）= 一个事件或一个情绪节点。选中的段落一共约 ${lineCount} 句歌词，大约安排 ${groupHint} 组（按内容可多可少）；段落越长组越多，不要整首歌只用几张图反复轮换。歌词讲到的人物、动物、物件和动作必须出现在画面里（讲到喂猫就要有猫、蹲下、递食物；讲到师父叮嘱，可以是门口告别、师父在画外）。
- 每组的景别和机位要不同：特写（手、眼、物件）、近景、中景、全身、远景、背影、低机位、俯视都可以；人物位置不要总在正中间，position 写 left / center / right，scale 写 close / medium / full / wide。
- 每一张差分都是单独的一张图，只画一个瞬间：characterPrompt 与 diff.change 里每个人只写一个姿势，不要在同一张里写多个姿势、多个表情或“三连”。
- 每组 1～3 张人物差分（diffs），是同一机位下一个动作的连续过程（伸手前→伸手→猫碰到手；握剑柄→出剑→收剑），不是随便换表情。同组 characterPrompt 相同，diff.change 只写这一刻的动作和表情。
- 歌词里出现的身体细节和小物件要给特写组：唱到交握的手，就有一组只拍两只手；唱到发带、剑穗、信、伞，就拍那个物件。特写组同样写进 groups，characterPrompt 写清只拍局部。
- 情绪细节用“最小差分”：同一构图连续两三张，只改一处，其余完全不变。比如前一张面无表情，后一张一切相同、只多了一滴眼泪；或者前一张闭眼、后一张只是睁开眼。这种差分的 diff.change 只写变化的那一处，不重写姿势和场景。
- 景别要有特写：眼睛、手、剑柄、物件这类细节特写，和远景、全景、近景交替使用，不要全是半身和全身。
- 每组 1～2 张背景（bgs）：同一个地点，第二张可以是时间或光线的变化（白天→黄昏、晴→雨），也可以是远近不同。背景只有场景，没有人物。
- 副歌可以有一个主视觉组，重复的副歌复用它；其余段落尽量用新的构图，尾奏可以回到开头的构图。
- 每组写 link：最后一张怎样承接下一组（视线、手、飘动的衣角或发带）。
- frames 按时间顺序：选中段落里的每一句歌词一条（lyric 抄原句），器乐段一条（lyric 留空），指向 group、diff 和 bg；动作连续的几句可以短，关键表情 hold 写 2 或 3。
- 先想清楚每组的事件、情绪、景别和衔接，再写画面；远景、近景、细节特写和两人互动镜头都要有，少用相似的半身立绘。不必每句歌词都换图，一句也可以延续上一张。
- 动作要有过程：frame.phase 写 prep（准备）、action（发生）、settle（收势停顿）或 still（静止）；不要让动态姿势长时间停着，也不要让两张差分来回往返。
- transition 写这一组开始时怎么切入：动作衔接用 cut（干脆），回忆或时间流逝用 fade，强烈情绪转折可用 flash；不要整片都用同一种。
- 两人同框时 characterPrompt 必须分别写清两个人的性别、相对位置、发型和衣着差异，两人外貌和衣服明显不同；单人镜头只写一个人。
- keyword：副歌里一个 2～4 字、最有分量的词。motif：歌词里一个可以漂浮的意象，prompt 用英文只描述这一个小元素。
`;
}

export function isV2(record) { return record?.version === 2 && Array.isArray(record?.groups); }

export function buildShots(raw, memory, sectionCount, settings) {
    if (settings.output === 'video' || !list(raw?.groups).some(g => list(g?.diffs).length)) return { shots: normalizeShots(raw, memory, sectionCount) };
    const idMap = new Map();
    const groups = [];
    list(raw.groups).forEach(g => {
        const diffs = list(g?.diffs).map((d, k) => ({
            id: `D${k + 1}`, rawId: core_text.normalizeText(d?.id, 20) || `D${k + 1}`,
            label: core_text.normalizeText(d?.label, 20) || `差分 ${k + 1}`,
            change: core_text.normalizeText(d?.change, 300), image: null,
        }));
        if (!diffs.length) return;
        const id = `G${groups.length + 1}`;
        idMap.set(core_text.normalizeText(g?.id, 20) || id, { id, diffs });
        groups.push({
            id, composition: core_text.normalizeText(g?.composition, 60),
            backgroundPrompt: core_text.normalizeText(g?.backgroundPrompt, 600),
            characterPrompt: core_text.normalizeText(g?.characterPrompt, 600),
            who: ['char', 'both', 'user', 'none'].includes(g?.who) ? g.who : 'char',
            motion: g?.motion === 'push' ? 'push' : 'still',
            link: core_text.normalizeText(g?.link, 160), seed: 0, bg: null,
            position: ['left', 'center', 'right'].includes(g?.position) ? g.position : 'center',
            transition: ['cut', 'fade', 'flash'].includes(g?.transition) ? g.transition : 'cut',
            // full = 人物、道具与背景在同一张完整场景图里（默认，最稳）；cutout = 白底人物抠图叠到背景上。
            layer: 'full',
            scale: ['close', 'medium', 'full', 'wide'].includes(g?.scale) ? g.scale : 'medium',
            bgs: (list(g?.bgs).length ? list(g.bgs) : [{ label: '场景', prompt: g?.backgroundPrompt }]).map((b, k) => ({
                id: `B${k + 1}`, rawId: core_text.normalizeText(b?.id, 20) || `B${k + 1}`,
                label: core_text.normalizeText(b?.label, 20) || (k ? '变化' : '场景'),
                prompt: core_text.normalizeText(b?.prompt, 600) || core_text.normalizeText(g?.backgroundPrompt, 600), image: null,
            })),
            diffs: diffs.map(({ rawId, ...rest }) => rest),
        });
    });
    const shots = [];
    for (const f of list(raw.frames)) {
        const ref = idMap.get(core_text.normalizeText(f?.group, 20)) || [...idMap.values()][0];
        if (!ref) continue;
        const rawDiff = core_text.normalizeText(f?.diff, 20);
        const diff = ref.diffs.find(d => d.rawId === rawDiff) || ref.diffs[Math.max(0, Number(String(rawDiff).replace(/\D/g, '')) - 1)] || ref.diffs[0];
        const group = groups.find(g => g.id === ref.id);
        const rawBg = core_text.normalizeText(f?.bg, 20);
        const bgRow = group.bgs.find(b => b.rawId === rawBg) || group.bgs[Math.max(0, Number(String(rawBg).replace(/\D/g, '')) - 1)] || group.bgs[0];
        shots.push({
            id: `F${shots.length + 1}_${Date.now().toString(36)}`,
            sectionIndex: Math.min(Math.max(0, Math.round(Number(f?.sectionIndex) || 0)), Math.max(0, sectionCount - 1)),
            lyric: core_text.normalizeText(f?.lyric, 200),
            plain: `${group.composition || group.id} · ${diff.label}`,
            group: ref.id, diff: diff.id, bg: bgRow.id, who: group.who,
            hold: Math.min(3, Math.max(1, Math.round(Number(f?.hold) || 1))),
            phase: ['prep', 'action', 'settle', 'still'].includes(f?.phase) ? f.phase : 'still',
            motion: group.motion, cut: 'cut', image: null, videoDone: false,
        });
    }
    if (!groups.length || !shots.length) throw core_text.safeUserError('这次没有收到可用的构图，可以再试一次。', 'RMT_MV_EMPTY');
    for (let i = 0; i < shots.length; i += 1) {
        const nextGroup = shots[i + 1] && groups.find(g => g.id === shots[i + 1].group);
        shots[i].cut = !shots[i + 1] || shots[i + 1].group === shots[i].group ? 'cut' : (nextGroup?.transition || 'cut');
    }
    for (const g of groups) {
        g.bgs = g.bgs.map(({ rawId, ...rest }) => rest);
        for (const d of g.diffs) d.bg = shots.find(s => s.group === g.id && s.diff === d.id)?.bg || 'B1';
    }
    const motifPrompt = core_text.normalizeText(raw?.motif?.prompt, 300);
    return {
        version: 2, groups, shots,
        keyword: Array.from(core_text.normalizeText(raw?.keyword, 12)).slice(0, 6).join(''),
        motif: motifPrompt ? { name: core_text.normalizeText(raw?.motif?.name, 20), prompt: motifPrompt, image: null } : null,
    };
}

// key: "G1:bg" / "G1:D2" / "motif"
export function assetOf(record, key) {
    if (!record) return null;
    if (key === 'motif') return record.motif ? { kind: 'motif', target: record.motif, get image() { return record.motif.image; }, set image(v) { record.motif.image = v; } } : null;
    const [gid, part] = String(key).split(':');
    const group = list(record.groups).find(g => g.id === gid);
    if (!group) return null;
    const bgs = list(group.bgs);
    if (part === 'bg' && !bgs.length) return { kind: 'bg', group, get image() { return group.bg; }, set image(v) { group.bg = v; } };
    const bgRow = part === 'bg' ? bgs[0] : bgs.find(b => b.id === part);
    if (bgRow) return { kind: 'bg', group, bgRow, get image() { return bgRow.image; }, set image(v) { bgRow.image = v; } };
    const diff = list(group.diffs).find(d => d.id === part);
    return diff ? { kind: 'char', group, diff, get image() { return diff.image; }, set image(v) { diff.image = v; } } : null;
}

export function assetKeys(record, song = null) {
    if (!isV2(record)) return [];
    let used = null;
    if (song) { try { used = new Set(shotsInRange(record, song).map(s => `${s.group}:${s.diff}`)); } catch { used = null; } }
    const keys = [];
    for (const g of record.groups) {
        const diffs = g.diffs.filter(d => !used || used.has(`${g.id}:${d.id}`));
        if (!diffs.length) continue;
        const bgIds = g.layer === 'full' ? [] : list(g.bgs).length ? list(g.bgs).filter(b => record.shots.some(s => s.group === g.id && (s.bg || 'B1') === b.id && (!used || used.has(`${g.id}:${s.diff}`)))).map(b => b.id) : ['bg'];
        const bgKeys = g.layer === 'full' ? [] : (bgIds.length ? bgIds : [list(g.bgs)[0]?.id || 'bg']);
        keys.push(...bgKeys.map(id => `${g.id}:${id}`), ...diffs.map(d => `${g.id}:${d.id}`));
    }
    if (record.motif) keys.push('motif');
    return keys;
}

export function assetPrompt(record, key, context) {
    const settings = normalizeSettings(record?.settings);
    const found = assetOf(record, key);
    if (!found) return '';
    const style = styleOf(settings).prompt;
    const ratio = settings.ratio === '9:16' ? 'vertical 9:16 composition' : 'horizontal 16:9 composition';
    const era = record?.wardrobe?.era ? `setting: ${record.wardrobe.era}` : '';
    // 只写正向词：tag 模型会把“no multiple views”“no people”里的词当成要画的内容。
    if (found.kind === 'motif') return [style, found.target.prompt, 'single object, still life, white background, simple background, no humans'].filter(Boolean).join(', ');
    if (found.kind === 'bg') return [style, ratio, era, found.bgRow?.prompt || found.group.backgroundPrompt, 'scenery, landscape, no humans'].filter(Boolean).join(', ');
    const who = found.group.who;
    const hasChar = who === 'char' || who === 'both';
    const hasUser = settings.appear !== 'none' && (who === 'both' || who === 'user');
    const looks = core_castLooks.readCastLooks(context);
    const people = { ...(looks || {}), char: hasChar ? looks?.char || '' : '', user: hasUser ? looks?.user || '' : '' };
    const lookLine = hasChar || hasUser ? core_castLooks.castLooksPromptLine(people, context) : '';
    const back = settings.appear === 'back' && hasUser ? `${hasChar ? 'the second person' : 'the person'} is shown only from behind, hands or silhouette, face not visible` : '';
    const place = { left: 'character placed on the left third of the frame', right: 'character placed on the right third of the frame', center: '' }[found.group.position] || '';
    const size = { close: 'close-up shot', medium: 'medium shot, waist up', full: 'full body shot', wide: 'wide shot, small figure' }[found.group.scale] || '';
    return [style, ratio, found.group.characterPrompt, found.diff.change, place, size, lookLine ? `fixed appearance, keep consistent: ${lookLine}` : '', wardrobeLine(record, hasChar, hasUser), back,
        hasChar && hasUser ? `duo, two people${record?.wardrobe?.user ? '' : ', different outfits'}, different hairstyles` : 'solo, single figure',
        found.group.layer === 'full'
            ? [era, (list(found.group.bgs).find(b => b.id === found.diff.bg) || list(found.group.bgs)[0])?.prompt || found.group.backgroundPrompt, 'detailed background, full scene'].filter(Boolean).join(', ')
            : 'white background, simple background'].filter(Boolean).join(', ');
}

// 双人画面按角色分别给外貌（与 CG 相同的 characters 结构），避免两个人长成同一张脸。
function assetMetadata(record, found, context) {
    const settings = normalizeSettings(record?.settings);
    const who = found.group.who;
    const roles = [];
    if (who === 'char' || who === 'both') roles.push('char');
    if (settings.appear !== 'none' && (who === 'both' || who === 'user')) roles.push('user');
    const looks = core_castLooks.readCastLooks(context);
    const tag = role => looks?.manual === true ? looks?.[role] || '' : core_castLooks.lookFromDescription(looks?.[role]);
    try {
        return cg_appearance.normalizeCgPromptMetadata({ characters: roles.map(role => ({ role, name: role === 'char' ? context?.name2 : context?.name1, tag: tag(role), nl: '' })) });
    } catch { return null; }
}

export function isAssetDrawing(scope, songId, key) { return running.has(`asset:${scope}:${songId}:${key}`); }

export async function drawAsset(songId, key) {
    const context = core_context.currentCharacterGuard();
    const target = captureMvTarget(context, songId);
    const { scope } = target;
    const record = structuredClone(target.base.songs[songId] || null);
    const found = assetOf(record, key);
    if (!found) return null;
    const runKey = `asset:${scope}:${songId}:${key}`;
    if (running.has(runKey)) return null;
    running.add(runKey);
    try {
        const seed = found.group?.seed || 0;
        const base = {
            // 人物层永远竖画：横构图里画单人时模型会把人复制成左右两份；横屏成片由本地合成。
            orientation: (found.kind === 'motif' || (found.kind === 'char' && found.group.layer !== 'full')) || normalizeSettings(record.settings).ratio === '9:16' ? 'portrait' : 'landscape',
            characterName: context?.name2 || '', targetKey: runKey, seed,
        };
        const metadata = found.kind === 'char' ? assetMetadata(record, found, context) : null;
        let result;
        try { result = await cg_core.invokeImageGeneration(assetPrompt(record, key, context), context, { ...base, ...(metadata ? { promptMetadata: metadata } : {}) }); }
        catch (error) {
            // 分角色外貌不被渠道接受时，退回普通提示词再画一次，不让整张图失败。
            if (!metadata || error?.name === 'AbortError' || /ABORT/.test(String(error?.code || ''))) throw error;
            result = await cg_core.invokeImageGeneration(assetPrompt(record, key, context), context, base);
        }
        return holdResult(target, 'asset', key, result, raw => {
            const url = cg_core.normalizeCgImageUrl(typeof raw === 'string' ? raw : raw?.url);
            if (!url) throw core_text.safeUserError('这次没有拿到可用图片。', 'RMT_MV_FRAME');
            const used = Number(raw?.seed);
            return { image: { url, at: Date.now() }, ...(Number.isInteger(used) && used > 0 ? { seed: used } : {}) };
        });
    } finally { running.delete(runKey); }
}


export function setAssetSplit(songId, key, split) {
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => {
        const found = assetOf(current, key);
        if (found?.image) found.image = { ...found.image, split: ['auto', 'none', 'left', 'right', 'top', 'bottom'].includes(split) ? split : 'auto' };
        return current;
    });
}

export function setGroupLayer(songId, groupId, layer) {
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => {
        const g = list(current?.groups).find(x => x.id === groupId);
        if (g) g.layer = layer === 'cutout' ? 'cutout' : 'full';
        return current;
    });
}


// 逐句对时间用的歌词清单：按段落顺序列出（只列当前截取范围内的段落）。
export function syncLines(record, song) {
    const sections = parseSections(song.lyrics);
    const o = tegakiOptions(record);
    const keep = new Set(selectedSectionIndexes(sections, o.range, o.rangeFrom, o.rangeTo));
    const out = [];
    sections.forEach((s, si) => { if (keep.has(si)) s.lines.forEach((line, li) => out.push({ key: `${si}:${li}`, text: line, section: s.name })); });
    return out;
}
