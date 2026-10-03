// Optional stage data: saved images remain owned by one background, independent of poses.
// No provider calls, generated code, storage migrations, or time-axis edits here.
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
export const BACKGROUNDS = Object.freeze({ solid: '纯色', rays: '放射线', stripes: '斜纹', window: '窗格', paper: '纸纹', image: '绘制背景' });
export const LAYOUTS = Object.freeze({ sides: '两侧', stack: '叠字', banner: '横排', none: '隐藏' });

export function prepare(raw, existing = null) {
    const backgrounds = [], ids = new Map();
    const existingIds = new Set(list(existing?.backgrounds).map(b => b.id));
    const used = new Set(existingIds);
    let number = 1;
    for (const source of list(raw?.backgrounds)) {
        if (!source || typeof source !== 'object') continue;
        const sourceId = text(source.id);
        // A continuation may restate a shared background. Its saved art wins.
        if (existingIds.has(sourceId)) { ids.set(sourceId, sourceId); continue; }
        if (sourceId && ids.has(sourceId)) continue;
        while (used.has(`S${number}`)) number++;
        const id = `S${number++}`; used.add(id);
        ids.set(sourceId || id, id);
        const colors = list(source.colors).filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/iu.test(c));
        backgrounds.push({ id, label: text(source.label) || '共享背景',
            kind: choice(source.kind, Object.keys(BACKGROUNDS), source.prompt ? 'image' : 'solid'),
            colors: [colors[0] || '#203047', colors[1] || '#e4d6bb', colors[2] || '#bd6683'],
            motion: choice(source.motion, ['still', 'rotate', 'drift'], 'still'),
            prompt: text(source.prompt), image: null });
    }
    const resolve = value => ids.get(text(value)) || (list(existing?.backgrounds).some(b => b.id === value) ? value : '');
    return { backgrounds, resolve };
}

export function cue(value, fallback, resolve) {
    const background = resolve(value?.background) || fallback;
    if (!background) return null;
    return { background, text: text(value?.text),
        layout: choice(value?.layout, Object.keys(LAYOUTS), 'sides'),
        depth: value?.depth === 'front' ? 'front' : 'back',
        entrance: choice(value?.entrance, ['cut', 'pop', 'slide'], 'cut'),
        tone: choice(value?.tone, ['base', 'accent', 'dark'], 'base'), shadow: value?.shadow === true };
}

export function background(record, shot) {
    const group = list(record?.groups).find(g => g.id === shot?.group);
    const id = shot?.stage?.background || group?.stageBackground;
    return list(record?.stage?.backgrounds).find(b => b.id === id) || null;
}

export function usedBackgrounds(record, shots = record?.shots) {
    const ids = new Set(list(shots).map(s => background(record, s)?.id).filter(Boolean));
    return list(record?.stage?.backgrounds).filter(b => ids.has(b.id));
}

function characterKey(row) {
    const s = row?.shot;
    return s?.image?.url || s?.image?.local ? `shot:${s.id}` : `${s?.group}:${s?.diff}`;
}

function textKey(row) {
    const cue = row?.shot?.stage || {};
    return JSON.stringify([cue.text || row?.shot?.lyric || '', cue.layout || 'sides', cue.depth || 'back']);
}

// Derive every layer from the song clock, including seeking and excerpt export.
// A lyric boundary does not restart the background or an unchanged character pose.
export function state(record, rows, index, time) {
    const row = rows[index], bg = background(record, row?.shot);
    if (!bg) return null;
    let poseStart = index, textStart = index;
    while (poseStart > 0 && characterKey(rows[poseStart - 1]) === characterKey(row)) poseStart--;
    while (textStart > 0 && textKey(rows[textStart - 1]) === textKey(row)) textStart--;
    const origin = rows.find(r => background(record, r.shot)?.id === bg.id)?.start || 0;
    const value = row.shot.stage || {};
    return { background: bg, cue: value, active: time >= row.start,
        backgroundTime: Math.max(0, time - origin),
        poseTime: Math.max(0, time - rows[poseStart].start),
        entrance: rows[poseStart].shot.stage?.entrance || 'cut',
        textTime: Math.max(0, time - rows[textStart].start),
        text: value.text || row.shot.lyric || '' };
}

export function prompt() {
    return `【共享舞台编排】
本类型先设计可反复使用的舞台和角色标志姿势，再安排哪些层变化、哪些层保持。背景、人物、文字分别编排；换歌词、换姿势不等于换背景，一个姿势可以跨多句保持。
- stage.backgrounds 是跨构图、跨段落共用的背景，每个只定义一次。kind 可选 solid、rays、stripes、window、paper（本地绘制）或 image（另画一张背景）；colors 为三个 #RRGGBB 颜色，motion 为 still、rotate 或 drift。配色图案服务歌曲与角色世界观。背景运动持续，不随每次人物切换重启。
- groups.stageBackground 引用共享背景 id；这些组的人物会单独绘制并经用户确认抠图后叠上背景。diff.imagePrompt 只写该人物层的机位、唯一静态姿势与表情，场景放在共享背景里。全景剧情插入可用 layer:"full" 与自己的 bgs；局部插镜按表达需要安排，不套固定顺序。
- frames.stage 可写 background（沿用时可省）、text（摘取对应歌词的关键词或原句）、layout（sides 两侧、stack 叠字、banner 横排、none）、depth（back 人物后方、front 前方）、entrance（cut、pop、slide）、tone（base、accent、dark）、shadow（是否有偏移剪影）。文字给脸和关键手势留白，不在生图里绘制文字。
- 同一 group/diff 在连续多个 frame 出现时，人物保持，只换文字；再次使用背景或人物直接引用原 id，不重复生成。同一段落内也可以保持一套背景，重复副歌沿用主姿势并按歌词情绪变奏。先让一个有性格的姿势成立，再在需要时换表情，不每拍都生新图。\n`;
}
