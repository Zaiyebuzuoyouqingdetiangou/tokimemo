// Optional, local-only illustration cues. No extra generation requests or asset requirements.
export const REVEALS = Object.freeze({ ink: '黑白显影', silhouette: '剪影显影', none: '不显影' });
export const LIGHTS = Object.freeze({ halo: '柔和光晕', rays: '缓慢光束', none: '无光效' });
export const PARTICLES = Object.freeze({ dust: '微尘', spark: '星光', none: '无粒子' });
export const MOVEMENTS = Object.freeze({ parallax: '轻微视差', still: '保持不动' });

export function normalize(value) {
    const pick = (key, choices, fallback) => Object.hasOwn(choices, value?.[key]) ? value[key] : fallback;
    const seconds = Number(value?.seconds);
    return { reveal: pick('reveal', REVEALS, 'ink'), light: pick('light', LIGHTS, 'halo'),
        particles: pick('particles', PARTICLES, 'dust'), movement: pick('movement', MOVEMENTS, 'parallax'),
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 2.4,
        color: /^#[0-9a-f]{6}$/iu.test(value?.color || '') ? value.color : '' };
}

function poseKey(row) {
    const s = row?.shot || {}, cue = normalize(s.illustration);
    const art = s.image?.url || s.image?.local ? `shot:${s.id}` : s.group && s.diff ? `${s.group}:${s.diff}` : s.id;
    return `${art}:${s.illustration ? cue.reveal : 'inactive'}:${cue.seconds}`;
}

// Song-clock based, so lyric changes, seeking and excerpt export never restart a held illustration.
export function state(record, rows, index, time) {
    if (!rows[index]?.shot?.illustration) return null;
    const row = rows[index], key = poseKey(row), cue = normalize(row.shot.illustration);
    let first = index, last = index;
    while (first > 0 && poseKey(rows[first - 1]) === key) first--;
    while (last + 1 < rows.length && poseKey(rows[last + 1]) === key) last++;
    const start = rows[first].start, end = rows[last].end, elapsed = Math.max(0, time - start);
    const duration = Math.min(cue.seconds, Math.max(0.001, (end - start) * .8));
    const p = Math.min(1, elapsed / duration);
    return { ...cue, start, end, time: elapsed, songTime: Math.max(0, time),
        progress: cue.reveal === 'none' ? 1 : p * p * (3 - 2 * p) };
}

export function prompt() {
    return `【动态插画编排】
- 先为每段建立值得停留的主画面，再安排显现、停留、光色变化与前后呼应；同一构图可以跨多句歌词与段落。按歌曲需要定素材数量，不逐句重画，也不强制固定双人、紫色、星光或固定镜头顺序。
- 每个 diff 只画一张完整彩色的静态关键图。黑白、剪影与彩色显影由播放器从同一张素材派生，不为它们新建差分，不把前后对比、光效变化过程或拼格画进图片。
- 可使用 stage.backgrounds 与 groups.stageBackground 分离场景和主体，形成前后层次；完整画面、局部特写同样可用，没有拆层也不影响生成。主体轮廓、发丝与衣褶在静态构图中形成张力，保留用户所选画风和人物身份。
- frames.illustration 是可选播放设置：reveal 为 ink（黑白显影）/ silhouette（剪影显影）/ none；seconds 是显影秒数；light 为 halo（柔光）/ rays（光束）/ none；particles 为 dust（微尘）/ spark（星光）/ none；movement 为 parallax（轻微视差）/ still；color 可用符合本曲的 #RRGGBB，省略时跟随背景配色。
- 连续 frames 引用同一 group/diff 时，显影和主体运动延续，不因换歌词重新开始。只需要字幕时 stage.layout 用 banner 或 none。光效与粒子可以关闭，不把装饰铺满画面，不遮脸或关键手势。
- 这里只能安排同图显影、图层位移和光效，不宣称会自动产生眨眼、发丝形变、口型或连续肢体动作；确需不同姿势时另给静态差分。可选设置缺失时播放器使用默认效果，不重发请求。\n`;
}
