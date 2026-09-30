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
    const durable = confirmedWrite(LOCAL_PREFIX + scope, store);
    if (live && scopeOf(live) === scope) {
        live.chatMetadata[MV_KEY] = store;
        try { Promise.resolve(live.saveMetadataDebounced?.()).catch(() => {}); } catch { /* Local/journal copy survives. */ }
    }
    return durable;
}

export function pendingMv(scope) {
    if (!pendingByScope.has(scope)) {
        let rows = [];
        try { rows = JSON.parse(globalThis.localStorage?.getItem(LOCAL_PREFIX + scope + ':pending') || '[]'); } catch {}
        pendingByScope.set(scope, Array.isArray(rows) ? rows.filter(row => row?.scope === scope && row?.id) : []);
    }
    return structuredClone(pendingByScope.get(scope));
}

function savePending(scope, rows) {
    pendingByScope.set(scope, structuredClone(rows));
    return confirmedWrite(LOCAL_PREFIX + scope + ':pending', rows);
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
    try {
        const live = core_context.currentCharacterGuard();
        if (scopeOf(live) !== target.scope || !core_context.deferredCommitOriginMatchesContext(target.origin, live)) return null;
        const { song, memory } = loadSong(live, target.songId);
        return memory.archiveRevision === target.origin.archiveRevision && songSignature(song) === songSignature(target.song) ? live : null;
    } catch { return null; }
}

function resultBasis(record, kind, shotId) {
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
    if (!row.patch) return held(row.reason || '返回内容尚不能保存');
    const store = mergeStores(row.base, readMvStore(live));
    const current = store.songs[row.songId] || null;
    let next = current ? structuredClone(current) : null;
    if (!list(current?.appliedResults).includes(row.id)) {
        if (resultBasis(current, row.kind, row.shotId) !== row.expected) return held('分镜或图片已有新修改');
        if (row.kind === 'story') next = { timing: { taps: {}, shift: 0 }, duration: 0, ...next, ...row.patch };
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
        const weights = own.map(shot => Math.min(3, Math.max(1, Number(shot.hold) || 1)));
        const sum = weights.reduce((a, b) => a + b, 0) || 1;
        let acc = 0;
        own.forEach((shot, k) => { const a = acc; acc += weights[k]; rows.push({ shot, start: time.start + span * a / sum, end: time.start + span * acc / sum, sectionIndex: index }); });
    });
    // 没有镜头的段落不留空白：前一镜一直停到下一镜开始；第一镜从 0 秒开始。
    if (rows.length) rows[0].start = 0;
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

function storyboardPrompt(context, memory, song, settings) {
    const charName = core_text.normalizeText(memory?.characterName || context?.name2, 120) || '{{char}}';
    const userName = core_text.normalizeText(memory?.userName || context?.name1, 120) || '{{user}}';
    const parsed = parseSections(song.lyrics);
    const keep = settings.output === 'video' ? parsed.map((_, i) => i) : selectedSectionIndexes(parsed, settings.range, settings.rangeFrom, settings.rangeTo);
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

` : ''}7. wardrobe：先按角色设定与世界观定下统一的时代场景与衣着（英文，具体到款式、颜色、材质），古代背景就写古装，不写现代服装；era 写时代与场所，char 写 ${charName} 的衣着${settings.appear === 'none' ? '' : `，user 写 ${userName} 的衣着`}。

【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
${settings.output === 'video'
        ? '{"wardrobe":{"era":"……","char":"……","user":"……"},"shots":[{"sectionIndex":0,"lyric":"","plain":"……","who":"char","shot":"中景：看到上半身","move":"镜头慢慢推近","motion":"push","imagePrompt":"……","videoZh":"……","videoEn":"……"}]}'
        : '{"wardrobe":{"era":"……","char":"……","user":"……"},"keyword":"副歌里最有分量的词","motif":{"name":"竹叶","prompt":"english: one decorative element"},"groups":[{"id":"G1","composition":"半身 · 人物居中","backgroundPrompt":"english: empty scenery only","characterPrompt":"english: framing, pose base, who","who":"char","motion":"still","link":"下一组如何承接","diffs":[{"id":"D1","label":"垂眼","change":"english: only expression / gaze / hand change"}]}],"frames":[{"sectionIndex":1,"lyric":"原句","group":"G1","diff":"D1","hold":1}]}'}`;
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
                tegaki: { ...(previous?.tegaki || {}), range: settings.range, rangeFrom: settings.rangeFrom, rangeTo: settings.rangeTo, ...(settings.output === 'tegaki' ? { lyric: 'vertical' } : {}) },
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
    const noUser = !hasChar && !hasUser ? 'empty scene, no people in frame' : hasChar && hasUser ? 'exactly two people in frame' : 'only one person in frame';
    return [
        styleOf(settings).prompt,
        settings.ratio === '9:16' ? 'vertical 9:16 composition' : 'horizontal 16:9 composition',
        shot.imagePrompt || shot.plain,
        lookLine ? `fixed appearance, keep consistent: ${lookLine}` : '',
        wardrobeLine(record, hasChar, hasUser),
        userRule, noUser,
        'no text, no subtitles, no logo, no watermark',
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
    classic: { name: '手书经典', desc: '同一构图内直接换张，构图之间淡入，歌词大字', rhythm: 'line', lyric: 'big', motion: () => 'still' },
    gentle: { name: '抒情慢拍', desc: '每个构图缓慢推近，淡入淡出，字幕歌词', rhythm: 'line', lyric: 'subtitle', motion: () => 'push' },
    bright: { name: '明快跟拍', desc: '画面不动，背景光随拍子轻轻呼吸，歌词大字', rhythm: 'beat', lyric: 'big', motion: () => 'still' },
});

export function tegakiOptions(record) {
    const value = record?.tegaki || {};
    return {
        range: Object.hasOwn(TEGAKI_RANGES, value.range) || value.range === 'custom' ? value.range : (record?.settings?.range || 'verseChorus'),
        rhythm: Object.hasOwn(TEGAKI_RHYTHMS, value.rhythm) ? value.rhythm : 'line',
        lyric: Object.hasOwn(TEGAKI_LYRICS, value.lyric) ? value.lyric : (record?.subtitles === false ? 'none' : 'subtitle'),
        preset: Object.hasOwn(TEGAKI_PRESETS, value.preset) ? value.preset : '',
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
    const range = playRange(record, song);
    return shotTimeline(record, song).rows.filter(row => row.end > range.start + 0.01 && row.start < range.end - 0.01).map(row => row.shot);
}

export function applyTegakiPreset(songId, presetId, song) {
    const preset = TEGAKI_PRESETS[presetId];
    if (!preset) return null;
    const sections = parseSections(song.lyrics);
    const context = core_context.currentCharacterGuard();
    return writeMv(scopeOf(context), songId, current => {
        if (!current) return current;
        current.tegaki = { ...(current.tegaki || {}), rhythm: preset.rhythm, lyric: preset.lyric, preset: presetId };
        for (const shot of list(current.shots)) {
            const chorus = isChorusTag(sections[shot.sectionIndex]?.tag);
            shot.motion = preset.motion(chorus);
            shot.cut = shot.groupNext ? 'fade' : (shot.group ? 'cut' : 'fade');
        }
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
    return `这是这首印象曲的手书 PV。只为这些段落写：${rows}。
手书不换场景讲故事，而是少数构图的连续变化：
- 一共 3～5 个构图组（groups）。每组画一张 backgroundPrompt（只有场景、没有人物）和 2～4 张人物差分（diffs）。同组差分的 characterPrompt 完全相同（同一构图、机位、人物位置、姿势基础），diff.change 只写表情、视线、手势、头发这一处变化。
- 段落语法：主歌以 ${charName} 半身为主、一句一张差分；导歌推到近景（眼睛、手、随身物件）；副歌是主视觉（选择了双人出镜时两人同框），重复的副歌必须复用同一个构图组和它的差分；桥段用反差构图（逆光、剪影或单色）；尾奏回到主歌的构图组。
- 每组写 link：最后一张如何承接下一组（眼睛接眼睛、手接手、飘动的头发带到下一构图），不要跳到完全不同的空间。
- frames 是时间顺序：选中段落里的每一句歌词各一条（lyric 抄原句），器乐段一条（lyric 留空）；每条指向 group 与 diff；关键画面 hold 写 2 或 3。
- keyword：从副歌里挑一个 2～4 字、最有分量的词。motif：从歌词里挑一个可以漂浮的意象（花瓣、雨滴、竹叶、雪、萤火之类），prompt 用英文只描述这一个小元素。
`;
}

export function isV2(record) { return record?.version === 2 && Array.isArray(record?.groups); }

export function buildShots(raw, memory, sectionCount, settings) {
    if (settings.output === 'video' || !list(raw?.groups).some(g => list(g?.diffs).length)) return { shots: normalizeShots(raw, memory, sectionCount) };
    const idMap = new Map();
    const groups = [];
    list(raw.groups).slice(0, 8).forEach(g => {
        const diffs = list(g?.diffs).slice(0, 5).map((d, k) => ({
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
        shots.push({
            id: `F${shots.length + 1}_${Date.now().toString(36)}`,
            sectionIndex: Math.min(Math.max(0, Math.round(Number(f?.sectionIndex) || 0)), Math.max(0, sectionCount - 1)),
            lyric: core_text.normalizeText(f?.lyric, 200),
            plain: `${group.composition || group.id} · ${diff.label}`,
            group: ref.id, diff: diff.id, who: group.who,
            hold: Math.min(3, Math.max(1, Math.round(Number(f?.hold) || 1))),
            motion: group.motion, cut: 'cut', image: null, videoDone: false,
        });
    }
    if (!groups.length || !shots.length) throw core_text.safeUserError('这次没有收到可用的构图，可以再试一次。', 'RMT_MV_EMPTY');
    for (let i = 0; i < shots.length; i += 1) shots[i].cut = shots[i + 1] && shots[i + 1].group === shots[i].group ? 'cut' : 'fade';
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
    if (part === 'bg') return { kind: 'bg', group, get image() { return group.bg; }, set image(v) { group.bg = v; } };
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
        keys.push(`${g.id}:bg`, ...diffs.map(d => `${g.id}:${d.id}`));
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
    if (found.kind === 'motif') return [style, found.target.prompt, 'a single small decorative element, isolated on a pure white background, no scenery, no people, no text'].filter(Boolean).join(', ');
    if (found.kind === 'bg') return [style, ratio, era, found.group.backgroundPrompt, 'scenery only, empty scene, no people, no characters, no text, no logo'].filter(Boolean).join(', ');
    const who = found.group.who;
    const hasChar = who === 'char' || who === 'both';
    const hasUser = settings.appear !== 'none' && (who === 'both' || who === 'user');
    const looks = core_castLooks.readCastLooks(context);
    const people = { ...(looks || {}), char: hasChar ? looks?.char || '' : '', user: hasUser ? looks?.user || '' : '' };
    const lookLine = hasChar || hasUser ? core_castLooks.castLooksPromptLine(people, context) : '';
    const back = settings.appear === 'back' && hasUser ? `${hasChar ? 'the second person' : 'the person'} is shown only from behind, hands or silhouette, face not visible` : '';
    return [style, ratio, found.group.characterPrompt, found.diff.change, lookLine ? `fixed appearance, keep consistent: ${lookLine}` : '', wardrobeLine(record, hasChar, hasUser), back,
        hasChar && hasUser ? 'exactly two people' : 'only one person',
        'isolated on a pure white background, plain white backdrop, no scenery, clean silhouette edges, no text'].filter(Boolean).join(', ');
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
        const result = await cg_core.invokeImageGeneration(assetPrompt(record, key, context), context, {
            orientation: found.kind === 'motif' || normalizeSettings(record.settings).ratio === '9:16' ? 'portrait' : 'landscape',
            characterName: context?.name2 || '', targetKey: runKey, seed,
        });
        return holdResult(target, 'asset', key, result, raw => {
            const url = cg_core.normalizeCgImageUrl(typeof raw === 'string' ? raw : raw?.url);
            if (!url) throw core_text.safeUserError('这次没有拿到可用图片。', 'RMT_MV_FRAME');
            const used = Number(raw?.seed);
            return { image: { url, at: Date.now() }, ...(Number.isInteger(used) && used > 0 ? { seed: used } : {}) };
        });
    } finally { running.delete(runKey); }
}
