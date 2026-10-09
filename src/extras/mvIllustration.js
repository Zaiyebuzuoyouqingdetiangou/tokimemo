// Optional, local-only illustration cues. No extra generation requests or asset requirements.
export const REVEALS = Object.freeze({ bloom: '黑白块面 · 局部显现', ink: '黑白显影', silhouette: '剪影显影', none: '不显影' });
export const LIGHTS = Object.freeze({ focus: '焦点流光', halo: '柔和光晕', rays: '缓慢光束', none: '无光效' });
export const PARTICLES = Object.freeze({ glints: '局部光屑', dust: '微尘', spark: '星光', none: '无粒子' });
export const MOVEMENTS = Object.freeze({ local: '区域轻动', parallax: '轻微视差', still: '保持不动' });

function number(value, fallback, low = 0, high = 1) {
    if (value === null || value === '' || !Number.isFinite(Number(value))) return fallback;
    return Math.min(high, Math.max(low, Number(value)));
}

function regions(value, moving = false) {
    if (!Array.isArray(value)) return [];
    return value.filter(r => r && ['x', 'y', 'w', 'h'].every(k => r[k] !== null && r[k] !== '' && Number.isFinite(Number(r[k]))))
        .map(r => {
            const x = number(r.x, 0), y = number(r.y, 0);
            return { x, y, w: number(r.w, 0, 0, 1 - x), h: number(r.h, 0, 0, 1 - y),
                ...(moving ? { amount: number(r.amount, .006, 0, .015), phase: number(r.phase, 0, 0, 6.28) } : {}) };
        }).filter(r => r.w > .001 && r.h > .001);
}

export function normalize(value) {
    const pick = (key, choices, fallback) => Object.hasOwn(choices, value?.[key]) ? value[key] : fallback;
    const seconds = Number(value?.seconds);
    return { reveal: pick('reveal', REVEALS, 'ink'), light: pick('light', LIGHTS, 'halo'),
        particles: pick('particles', PARTICLES, 'dust'), movement: pick('movement', MOVEMENTS, 'parallax'),
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 2.4,
        color: /^#[0-9a-f]{6}$/iu.test(value?.color || '') ? value.color : '',
        ...(value?.version === 2 || value?.reveal === 'bloom' || value?.movement === 'local' || value?.light === 'focus' || value?.particles === 'glints'
            ? { version: 2, focusX: number(value?.focusX, .5), focusY: number(value?.focusY, .38),
                lightX: number(value?.lightX, .72), lightY: number(value?.lightY, .25),
                motionRegions: regions(value?.motionRegions, true),
                protect: Array.isArray(value?.protect) ? regions(value.protect) : [{ x: .25, y: .08, w: .5, h: .5 }] } : {}) };
}

// Region edges and protected faces stay fixed. Coordinates refer to the source
// picture, so framing, seeking and export use the same deformation field.
export function localOffset(cue, x, y, time) {
    if (cue?.movement !== 'local') return { x: 0, y: 0 };
    const still = cue.protect || [];
    if (still.some(r => x >= r.x - .001 && x <= r.x + r.w + .001 && y >= r.y - .001 && y <= r.y + r.h + .001)) return { x: 0, y: 0 };
    const protection = still.reduce((gain, r) => Math.min(gain, Math.min(1, Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h)) / .035)), 1);
    let dx = 0, dy = 0;
    for (const r of cue.motionRegions || []) {
        const u = (x - r.x) / r.w, v = (y - r.y) / r.h;
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue;
        const envelope = Math.sin(Math.PI * u) ** 2 * Math.sin(Math.PI * v) ** 2;
        const wave = Math.sin(time * .95 - v * 3.2 + r.phase);
        dx += r.amount * envelope * wave;
        dy += r.amount * envelope * Math.cos(time * .71 - u * 2 + r.phase) * .22;
    }
    return { x: Math.max(-.015, Math.min(.015, dx * protection)), y: Math.max(-.004, Math.min(.004, dy * protection)) };
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
    return `【动态插画编排与显影】
- 以精细主图和同一构图内部的变化组织整段音乐。先建立少量有记忆点的主视觉，再安排局部显现、完整停留、光色变化和下一幅主图的呼应；同一张主图可以跨多句歌词甚至跨段。根据乐句自然停留，参考约 6～10 秒的从容展开，不强制秒数、组数或每段换图。
- 主图要经得起长时间观看：有表现力的视线和手势、清楚的视觉焦点、疏密有别的发束与衣褶、近远层次和统一受光。细节集中在脸、手、发丝及关键物件，保留画面呼吸；精细不等于杂乱堆饰，也不覆盖用户指定的线稿、水彩等画风。构图允许饱满的半身主视觉，发丝、衣带形成方向与张力，不连续排成普通站姿肖像。
- 双人可先用手或共同意象建立联系，再让双方各自的主视觉在视线、轮廓、构图方向或光源上呼应；按本曲另行构思，人物数量、顺序、颜色和意象不套固定范例。歌词不必逐句演成环境空镜、动作事件或切手切脸的镜头。
- 每个 diff 只生成一张完整彩色静态关键图。默认 groups.layer 为 full，人物、道具与环境的光影构图一次画完整；确需独立前后层时可用 stage.backgrounds 与 groups.stageBackground。黑白块面与彩色显现由同一素材派生，不另生黑白图，不在图片里画前后对比、拼格、歌词或水印。
- group.characterPrompt 只写同组机位、画面布局、光线。每个 diff.imagePrompt 用英文独立完整地写本张构图、当下唯一姿势、表情、互动和受光；逐人绑定姓名，稳定外貌由程序补齐。背景写在 bgs 或 backgroundPrompt。人物身份、服装及用户选择的画风保持一致。
- 只有神态或姿势的变化确实有表达作用时增加静态差分，尽量保持同一机位和光线，让 frames 复用与切换；眨眼、嘴形和肢体表演需要真实差分，不能靠扭动整张脸冒充。主图已经完整显现后仍留出观看时间，避免显现刚结束就换图。
- frames.illustration 可选：reveal 用 bloom（黑白块面从焦点分区显现）、ink（旧黑白扫色）、silhouette 或 none；seconds 是显现时长，通常为主图停留时间的一部分；light 用 focus（围绕指定位置的流光）、halo、rays 或 none；particles 用 glints（重点附近少量光屑）、dust、spark 或 none；movement 用 local（指定区域轻动）、parallax 或 still。color 可用符合本曲的 #RRGGBB；光效应烘托主体，颜色随本曲，不固定紫色星光。
- focusX/focusY 指定首先显现的画面焦点，lightX/lightY 指定光源或意象的位置，均为原图从左到右／从上到下的 0～1 比例。指尖、物件的光放在对应位置，人物主图的流光可放在轮廓旁，避免把强光压在眼睛上。
- local 只做有明确范围的轻微风动：motionRegions 每项 {x,y,w,h,amount,phase} 指定发梢、衣带、飘带等区域；amount 通常 0.003～0.008，phase 可省略。protect 每项 {x,y,w,h} 固定脸、眼、手及坚硬道具。区域按本图实际构图规划，不固定左右两个发区；拿不准位置就用 still，不让所有画面整体变形。区域可以在剪辑台调整，没有这些可选字段也能生成和播放。
- 连续 frames 引用同一 group/diff 时使用一致的显现、焦点和区域设置，显现与运动延续，不因换歌词重新开始。只为本曲需要安排装饰；保留清晰主图，不靠铺满粒子维持变化。\n`;
}

export function grammar(sections, keep) {
    const rows = keep.map(i => `${i}:${sections[i]?.tag || ''}`).join('，');
    return `为这首歌制作动态插画 PV，只为这些段落写：${rows}。\n${prompt()}
- groups 是主视觉构图，换机位、出场人物或核心视觉才另建组；group.position 用 left / center / right，scale 用 close / medium / full / wide。局部特写和无人意象按实际裁切，不为了外貌标签补出整个人。
- frames 按播放顺序引用 group、diff、bg；sectionIndex 是歌曲原段落编号，lyric 使用对应原句，器乐留空。多句共享主图时仍分别写 frame 并重复引用同一 diff，以保留字幕与打点。hold 为段内相对权重，不是秒数；已有人工打点优先。
- motion 通常 still，确需整体推近时才用 push。transition 可用 cut / fade / flash，按音乐转折选择，不每句闪白。link 写清下一主图的构图或意象如何承接，并落实在前后图像描述中。
- 多人镜头分别绑定人物位置、姿势与互动对象。背景可写 bgs:[{id,label,prompt}]，只描述环境；独立背景可选 stage.backgrounds:[{id,label,kind:"image",prompt,colors,motion:"still"}]，由 groups.stageBackground 引用。可选字段不足使用原有回退，不增加生成门槛。\n`;
}
