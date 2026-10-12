// Local, explainable suggestions. No provider calls, audio analysis, or quality gates.
export const MV_DIRECTIONS = Object.freeze([
    { id: 'auto', name: '自动混合', desc: '跟随歌曲各段的情绪组合镜头', rule: '按段落的叙事、情绪和节奏自由组合，不强制整首只用一种手法。' },
    { id: 'narrative', name: '剧情叙事', desc: '交代场景、动作与结果，看得出前因后果', rule: '观众看完要能复述“发生了什么”：每个场景先用远景或全景交代地点、时间和人物方位，再接动作的关键姿势，随后给出对方或环境的反应与结果；镜头之间用 link 写清因果（谁的动作引出谁的反应、哪件物件被带进下一镜）。选中的段落里至少推进一次地点、时间或关系状态，后段让前段出现过的物件或位置有结果。景别在远、中、近之间交替，人物正面看观众的肖像只在需要时出现。不逐句翻译歌词，也不把全段写成同一场景里的表情变化。' },
    { id: 'lyrical', name: '抒情意象', desc: '空镜、意象与留白，画面慢慢呼吸', rule: '情绪由意象承载：选 1～2 个贯穿的核心意象（物件、天气、光或地点），让它在不同段落以不同的距离、明暗或状态重现。大约三分之一以上的画面是空镜、物件特写、局部（手、背影、剪影）或远景里的小人物，人物正脸不是主体。镜头停留长，转场淡入淡出，画面缓慢推近；副歌也不改成快切，而是用更开阔的景或更亮的光抬升情绪。不把每个歌词名词都画成道具，不用满屏漂浮装饰代替意象。' },
    { id: 'interaction', name: '关系互动', desc: '视线、距离与双方回应', rule: '画面始终回答“谁对谁做了什么，对方怎么回应”。两人都出场时用正反打：一人在左看向右，另一人在右看向左，左右站位与视线方向全段不对调；每个发起动作后紧跟对方的反应镜头，关键处给一张两人同框的关系画面，并让距离或朝向（远→近、背对→相望）随歌曲推进变化。手与物件的近景写清属于谁。只有一人出场时，用画外视线、被递出的物件和空出来的位置表现对方。合唱不等于同框，关系以人设为准，不擅定恋爱。' },
    { id: 'impact', name: '高燃快切', desc: '蓄势、重拍爆发、短镜连切', rule: '要有看得出的“蓄—爆—停”：进入副歌或重拍前用较长的静止蓄势画面（低头、握拳、背影、压暗的光）；爆发时连续几张短镜，在全身剪影、眼睛或手的极近特写、低机位仰视之间制造强烈反差，用直切或闪白切换；一串短镜之后给一张停留明显更长的定格主画面。光影高对比、轮廓清楚，姿势是动作的关键定格，不悬停在动作中途。闪白只放在重拍或段落开头，不每镜都闪；不加入人设之外的战斗或伤害。' },
    { id: 'loop', name: '节奏循环', desc: '固定机位、姿势按拍子循环', rule: '要有看得出的“循环单元”：用 1～2 个机位和光线固定的构图，每个构图 2～4 张只改手、头或视线的差分，按 A→B→A→B 或 A→B→C→B 反复引用同一批差分，每张停留相同、对齐拍子，最后一张能自然接回第一张。进入新段落时只改变一处（换一张差分、换背景色或插入一次停顿）再回到单元，不每轮同时换构图和所有元素。重复时引用原差分，不为回到原姿势重新画；静态姿势循环，不冒充连续舞蹈动画。' },
    { id: 'illustration', name: '动态插画', desc: '精细主图、局部显现与轻微风动', rule: '以值得停留的完整主图组织段落：黑白块面从焦点局部显现，彩色主图充分停留，再以光色或下一主图呼应。同图跨多句歌词保持，不写成连续空镜与动作事件，不把长停留当作缺点。脸、手、发束与关键物件细致清晰，疏密和统一光影建立层次，遵循所选画风。默认完整彩色插画，必要时再分层；可按构图标出发梢、衣带的轻动区域和脸手保护区，流光位置对应指尖、物件或人物轮廓。真实表情变化使用静态差分，不靠变形冒充眨眼或连续表演。主图数量、颜色和光效按本曲需要，不套固定紫色星光。' },
    { id: 'expression', name: '表情卡拍', desc: '共享舞台、角色表演与文字卡拍', rule: '围绕可反复返回的主舞台安排角色面向观众的表演。人物以轮廓明确、有性格的半身或全身姿势建立记忆点，手势、视线与表情一起表达；一个姿势可保持数秒，让文字、背景图形继续变化。背景持续跨越多个姿势与歌词，同一素材反复引用，不逐句重新画场景。\n重复乐句沿用主构图与标志姿势，根据歌曲情绪改变表情、光色、文字或道具，形成呼应与变奏。剧情镜头与局部特写用于需要的转折，不套“换脸→特写→返回”的固定流程。主歌与副歌的疏密、明暗和表演强度服务当前歌曲。\n每种姿势或表情各自生成为单张单格静态图；人物、共享背景、文字分开制作并在时间轴上编排，生图不写歌词。保留角色身份、衣着和画风，表情反差来自角色与歌词，不强加假笑、伤口、恐怖或脱衣；为这首歌原创构图与顺序。' },
    { id: 'typography', name: '文字PV', desc: '歌词大字卡是主角，画面陪衬', rule: '文字是主角：歌词或关键词以大字卡出现在共享背景上，用横排、叠字、两侧排布和弹出、滑入、强调色、压暗随节奏变化；同一张背景和人物姿势跨很多句保持，变化主要来自文字。人物与物件只作小而清楚的陪衬（剪影、背影、远处的小人、一件代表物），不逐句换图。主歌字少、疏朗、留白多；副歌关键词更大、更密、用强调色，重复的句子用同一种排布形成记忆点。生图里不画文字。' },
    { id: 'montage', name: '回忆走马灯', desc: '一闪而过的回忆片段，最后回到现在', rule: '像人生走马灯：一连串彼此不同的回忆瞬间（不同地点、季节或时期，同一段关系），每个片段只停一下，越往后切得越快，用淡入淡出或白闪衔接，画面统一成褪色暖调、柔光和微微过曝的回忆质感；最后回到“现在”的一张清晰画面并长时间停留，与回忆形成对照。回忆内容取自人设和歌词里有依据的经历，不编造人设之外的重大事件；外貌不变，回忆时期的衣着或场景可以不同。' },
    { id: 'opening', name: '动画OP风', desc: '像动画片头：亮相、并肩、全员同框', rule: '像一部动画的片头：开头是氛围冷开场（背影、远景或天空的光）；每位出场人物各有一张“亮相镜”（回眸、抬头或侧身定格，背景带这个人的代表色）；主歌是并肩行走、奔跑、迎风的定格和天空、街道的空镜；副歌集中爆发：全员同框、低机位仰视、动作定格快速切换；结尾回到开阔的风景或天空。关键词可作片名式的短词出现在副歌。' },
    { id: 'pov', name: '第一视角', desc: '你就是镜头，角色对着你', rule: '镜头就是“你”的眼睛：角色直视镜头，对你说话、伸手、递东西、靠近，机位在视线高度，距离从中景逐渐推到近景。“你”的手可以出现在画面下缘（只拍手，遵守用户出镜设置；设为不出镜时不画），但从不画“你”的脸。景别多为近景、半身，角色的表情和动作都朝向镜头；空镜也是“你”看到的东西。' },
    { id: 'contrast', name: '今昔对照', desc: '同一构图，从前与现在对照', rule: '同一个构图画两次：“从前”和“现在”，机位、方位、景别完全一致，只改变时间状态（季节和光线、物件的新旧、两人的距离或表情）；按歌曲结构对照出现，例如主歌放从前、副歌放现在，或一句从前一句现在交替。至少两组对照构图，变化要一眼看得出，但人物外貌与身份不变。' },
    { id: 'reveal', name: '悬念反转', desc: '先藏后揭，前后呼应', rule: '前段刻意不让观众看全：用局部特写、背影、剪影、遮挡或画外视线，只露出一个线索（形状、颜色或物件一角）。揭示放在后段的关键位置，用更完整的构图或反向视点让这个线索的意思改变，并给它较长停留；之后回到前段的构图，换一张差分让观众对照伏笔。线索的形状、位置与持物者前后一致；不靠突然换脸、闪白或字幕解释冒充反转，不强加恐怖、死亡或背叛。' },
]);

export function directionOf(value) {
    return MV_DIRECTIONS.find(item => item.id === value) || MV_DIRECTIONS[0];
}

export function recommendDirections(song = {}) {
    const style = [song.styleDescription, song.stylePrompt, song.vocalDescription].filter(value => typeof value === 'string').join(' ');
    const lyrics = typeof song.lyrics === 'string' ? song.lyrics : '';
    const rows = MV_DIRECTIONS.slice(1).map(item => ({ id: item.id, name: item.name, score: 0, reasons: [] }));
    const add = (id, score, reason) => { const row = rows.find(item => item.id === id); row.score += score; row.reasons.push(reason); };
    const rules = [
        ['lyrical', /抒情|舒缓|空灵|民谣|氛围|ambient|ballad|folk|gentle|dreamy|melanchol/iu, '曲风偏抒情或氛围', 6],
        ['narrative', /叙事|故事|剧情|音乐剧|narrative|storytelling|musical theatre/iu, '歌曲强调故事推进', 7],
        ['interaction', /对唱|应答|互动|对话|duet|call.and.response|dialogue/iu, '人声有对唱或应答', 7],
        ['impact', /高燃|激昂|摇滚|金属|战歌|爆发|rock|metal|anthem|energetic|drum.and.bass/iu, '曲风有强烈爆发感', 7],
        ['loop', /循环|舞曲|律动|洗脑|loop|dance|groov|funk|disco/iu, '曲风强调循环律动', 7],
        ['expression', /表情|面具|假笑|笑脸|戏谑|黑色幽默|反差|暗黑流行|怪诞|animation meme|dark pop|theatrical pop|happy face/iu, '歌曲适合表情反差与重复卡拍', 9],
        ['reveal', /反转|悬疑|悬念|诡异|不可靠叙述|suspense|mystery|unreliable|twist/iu, '歌曲含悬念或反转倾向', 9],
        ['typography', /文字|字幕|歌词视频|kinetic|typography|lyric video|ボカロ|vocaloid/iu, '曲风适合歌词字卡', 6],
        ['montage', /回忆|怀念|走马灯|旧时光|nostalg|memories|flashback|reminisc/iu, '曲风带回忆或怀旧', 6],
        ['opening', /热血|少年|冒险|出发|动画片头|anison|anime opening|j-?rock|opening theme/iu, '曲风像动画片头', 7],
    ];
    for (const [id, pattern, reason, score] of rules) if (pattern.test(style)) add(id, score, reason);
    if (song.voice === 'duet') add('interaction', 3, '演唱方式为双人合唱');
    const direct = Number(song.bpm), match = style.match(/(\d{2,3})\s*bpm/iu);
    const bpm = Number.isFinite(direct) && direct > 0 ? direct : Number(match?.[1]) || 0;
    if (bpm > 0 && bpm <= 90) add('lyrical', 2, `标注速度 ${bpm} BPM，适合留白`);
    else if (bpm >= 145) add('impact', 3, `标注速度 ${bpm} BPM，适合短镜头`);
    if (/月光|风|雨|旧信|花|影|moon|rain|shadow|letter/iu.test(lyrics)) add('lyrical', 1, '歌词有可呼应的视觉意象');
    if (/后来|从前|终于|离开|归来|then|returned|long ago/iu.test(lyrics)) add('narrative', 2, '歌词有时间或事件推进');
    if (/面具|假笑|强颜欢笑|笑脸|笑着.*(?:哭|泪)|put on a happy face|hide.*(?:tears|smile)/iu.test(lyrics)) add('expression', 5, '歌词有外在表情与内心的反差');
    if (/(?:从前|曾经|那时|那年).*(?:现在|如今|此刻|今天)|(?:used to|back then).*(?:now|today)/isu.test(lyrics)) add('contrast', 5, '歌词有从前与现在的对照');
    if (/记得|回忆|那年夏天|想起|remember|memories/iu.test(lyrics)) add('montage', 2, '歌词在回想过去');
    if ((lyrics.match(/你|you\b/giu) || []).length >= 8 && /看着我|对你|给你|look at me|to you/iu.test(lyrics)) add('pov', 3, '歌词一直在对“你”说话');
    const lines = lyrics.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !/^\[.*\]$/u.test(line));
    if (lines.length > 2 && new Set(lines).size < lines.length * 0.75) add('loop', 2, '歌词有明显重复段句');
    const matched = rows.filter(row => row.score > 0).sort((a, b) => b.score - a.score);
    return matched.length ? matched : [{ id: 'auto', name: '自动混合', score: 0, reasons: ['现有歌曲信息不足，先按段落灵活编排'] }];
}

export function directionPrompt(value, song) {
    const selected = directionOf(value);
    const recommended = recommendDirections(song).filter(item => item.id !== 'auto').slice(0, 2);
    const rules = selected.id === 'auto' ? [selected.rule, ...recommended.map(item => directionOf(item.id).rule)].join('\n') : selected.rule;
    return `【分镜类型：${selected.name}】\n${rules}\n分镜类型影响景别、内容组织、素材复用和切换节奏，不改变用户画风、角色设定或歌词。只把本次需要的镜头写出来，不凑数量、差分比例或固定套路。`;
}

export function directionDefaults(value) {
    const id = directionOf(value).id;
    if (id === 'illustration') return { motion: 'still', transition: 'fade' };
    if (id === 'montage') return { motion: 'still', transition: 'fade' };
    if (id === 'pov') return { motion: 'push', transition: 'cut' };
    return id === 'lyrical' ? { motion: 'push', transition: 'fade' } : { motion: 'still', transition: 'cut' };
}
