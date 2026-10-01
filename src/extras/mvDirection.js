// Local, explainable suggestions. No provider calls, audio analysis, or quality gates.
export const MV_DIRECTIONS = Object.freeze([
    { id: 'auto', name: '自动混合', desc: '跟随歌曲各段的情绪组合镜头', rule: '按段落的叙事、情绪和节奏自由组合，不强制整首只用一种手法。' },
    { id: 'narrative', name: '剧情叙事', desc: '动作、反应与前后因果', rule: '以可读的事件推进：建立空间、发生动作、给出反应或结果；换机位服务因果，不把每句歌词机械翻译成一张插画。前后镜头保持人物方位与动作衔接。' },
    { id: 'lyrical', name: '抒情意象', desc: '留白、环境和意象呼应', rule: '用环境空镜、物件、局部与人物疏密交替承载情绪；歌词的比喻可转译成视觉意象，不必字面演出。让重要画面停留，重复意象在后段有意义地变化，不连续堆相似肖像。' },
    { id: 'interaction', name: '关系互动', desc: '视线、距离与双方反应', rule: '用视线对应、正反打、动作与接收动作、距离变化表现人物关系；清楚写谁对谁做什么。可以各自单人或同框，不把合唱等同于全员同框，不擅定恋爱关系；只有一人时也可用画外对象与反应。' },
    { id: 'impact', name: '高燃快切', desc: '强弱对比、卡点与关键姿势', rule: '主歌蓄势、副歌集中爆发；用全景与局部反差、关键动作姿势和干脆切换建立节奏。需要时同一句歌词可以有多个短镜头，冲击后留一处停顿；不把挥剑、奔跑等姿势长时间悬停，不强制闪白或战斗。' },
    { id: 'loop', name: '节奏循环', desc: '复用构图、姿势循环与节拍变化', rule: '设计能重复使用的构图和关键姿势，frames 可以回到先前的 group/diff 形成节奏循环；重复时用背景、视线或意象变化推进，不为循环重复生出相同素材。静态关键姿势剪辑不冒充连续舞蹈动画。' },
    { id: 'reveal', name: '悬念反转', desc: '遮蔽信息、伏笔与回收', rule: '先用局部、背影、画外或遮挡保留信息，再以全景、反向视点或意象重现揭示。转折前后重用视觉线索而改变含义；不强加恐怖、死亡、悲剧或设定外事件。' },
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
        ['reveal', /反转|悬疑|悬念|诡异|不可靠叙述|suspense|mystery|unreliable|twist/iu, '歌曲含悬念或反转倾向', 9],
    ];
    for (const [id, pattern, reason, score] of rules) if (pattern.test(style)) add(id, score, reason);
    if (song.voice === 'duet') add('interaction', 3, '演唱方式为双人合唱');
    const direct = Number(song.bpm), match = style.match(/(\d{2,3})\s*bpm/iu);
    const bpm = Number.isFinite(direct) && direct > 0 ? direct : Number(match?.[1]) || 0;
    if (bpm > 0 && bpm <= 90) add('lyrical', 2, `标注速度 ${bpm} BPM，适合留白`);
    else if (bpm >= 145) add('impact', 3, `标注速度 ${bpm} BPM，适合短镜头`);
    if (/月光|风|雨|旧信|花|影|moon|rain|shadow|letter/iu.test(lyrics)) add('lyrical', 1, '歌词有可呼应的视觉意象');
    if (/后来|从前|终于|离开|归来|then|returned|long ago/iu.test(lyrics)) add('narrative', 2, '歌词有时间或事件推进');
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
    return id === 'lyrical' ? { motion: 'push', transition: 'fade' } : { motion: 'still', transition: 'cut' };
}
