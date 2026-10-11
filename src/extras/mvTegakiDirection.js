// Still-image editing grammar. Expression/stage and illustration have their own contracts.
const rules = Object.freeze({
    auto: '先按本曲各段的作用选择主要手法，再用辅助手法补足：哪里在讲事、哪里留白、哪里重复、哪里揭示，应能从画面顺序读出。手法变化沿用人物方位、核心物件与色光关系，不为“混合”逐段换世界或轮流展示所有类型。副歌的记忆点可以在主歌埋下、间奏停留、尾声回应；已有主图值得停留时跨句复用，不按歌词行数换图。',
    narrative: '每个场景按“建立 → 动作 → 结果”排：第一组用 scale wide 或 full 交代地点与人物方位，接着用近景或手部、物件特写抓动作的关键一瞬（phase prep / action），再用反应或结果画面收住（phase settle，停留更长）。地点或时间改变时新建组，并在 bgs 与 link 里写出可读的线索（天色、季节、物件状态）。连续空间保持左右方位、视线高度、持物手与光源一致，反应镜头要接得上它回应的事。\n自查：组的景别是否有远有近；是否至少一处能看出因果或状态推进；有没有把全段写成同一机位的表情差分。',
    lyrical: '先选 1～2 个核心意象，让它们以空镜或特写单独成组（cast 为空或只拍手、背影），并在后段换距离、明暗或状态重现。frames 的 hold 多用 2～3，一张主图可以跨两三句歌词；group.transition 用 fade，motion 用 push。人物多用背影、侧影、远景小人物或局部，正面半身只在情绪最高处出现一次左右。间奏与尾声留给空镜呼吸。\n自查：空镜、物件或局部是否约占三分之一以上；是否有意象前后重现且有变化；副歌有没有被写成快切。',
    interaction: '以双方的往来组织镜头：发起者一组、回应者一组，左右站位固定（发起者 position left 看向右，回应者 position right 看向左），frames 按“发起 → 回应 → 发起者的再反应”交替；关键处建一组两人同框（cast 同时含两人），用距离、朝向或手的位置表现关系变化。手与物件的近景在 cast 里只放所属的人。只有一人时，用画外视线、被递出或留下的物件做“回应”。\n自查：反应镜头是否紧跟在对应动作之后；左右与视线方向是否全程一致；是否有一张能看出两人关系的同框。',
    impact: '用 hold 写出强烈长短差：蓄势画面 hold 2～3，爆发处连续 3～5 个 hold 0.25～0.5 的短镜，随后一张 hold 2 以上的定格。短镜在不同组之间切换（全身剪影、极近特写的眼睛或手、低机位仰视、背光轮廓），制造景别与明暗反差；爆发前最后一组与定格组的 transition 用 flash，其余用 cut。phase 用 prep → action → settle 标出蓄势、爆发与收势。姿势选关键定格（落地、抬眼、握紧），不悬停在挥动或奔跑中途。\n自查：副歌或重拍处是否有一串 hold≤0.5 的短镜；之后是否有明显更长的定格；是否只在重拍处用 flash。',
    loop: '先建立循环单元：1～2 个固定机位组，每组 2～4 张差分只改手、头或视线；frames 按 A→B→A→B（或 A→B→C→B）反复引用同一组的 diff，单元内 hold 相同（多用 1 或 0.5），对齐拍子，单元最后一张能接回第一张。副歌可以加快（hold 0.5）或在单元里插入一张新差分作为“变奏”，然后回到原单元。不要每轮同时换构图、背景和动作；回到原姿势时直接引用原 diff，不重新画。\n自查：frames 里同一 group:diff 是否被重复引用多次；单元内停留是否一致；每段是否只有一处变化。',
    montage: '每个回忆片段单独成组、只画一张关键瞬间，片段之间换地点、季节或时期（同一段关系的不同时刻），不要多张相似肖像。每张回忆的 imagePrompt 都写统一的回忆质感（faded warm tones, soft glow, slightly overexposed edges）。frames 的 hold 由慢到快：开头 1～1.5，越往后越短，副歌可到 0.3～0.5；回忆组的 transition 用 fade，节奏最快处可用 flash。最后一组是“现在”：清晰、正常色温的画面，hold 2～3，与回忆形成对照。回忆片段只取人设与歌词有依据的经历，不编造重大事件。\n自查：是否有至少四个彼此不同的回忆片段；hold 是否由慢到快；结尾是否回到现在且停留最长。',
    opening: '按片头的段落安排：开场一组氛围冷开场（背影、远景或天空，hold 2）；每位出场人物各建一组“亮相镜”（回眸、抬头或侧身定格，背景用这个人的代表色，hold 1～1.5）；主歌用并肩行走或迎风定格、街道与天空的空镜；副歌连续短镜（hold 0.5）后接一组全员同框的低机位定格（hold 2）；最后一组是开阔风景或天空收尾。keyword 填一个片名式的短词，在副歌出现。\n自查：每位出场人物是否都有亮相镜；副歌是否有全员同框；结尾是否是风景或天空。',
    pov: '每组都从“你”的视线高度拍：characterPrompt 写 first-person view at eye level，角色看向镜头（looking at the viewer），动作朝向镜头（伸手、递东西、靠近、低头看你）。景别按情绪推进：前段中景，后段近景，最动情处可到特写。“你”的手若出现，单独写在画面下缘（hands of the viewer at the bottom edge），只在用户出镜设置允许时出现，且绝不画“你”的脸或全身。空镜写成“你”看到的东西。\n自查：多数画面里角色是否看向镜头；距离是否逐渐拉近；是否没有画出“你”的脸。',
    contrast: '每组是一对对照：同一机位、同一方位和景别，写两个 diff——D1 “从前”，D2 “现在”，imagePrompt 里分别写清各自的时间状态（季节、光线、物件新旧、两人距离或表情），背景差异也写在各自的 imagePrompt 里。至少两组对照。frames 先让观众记住“从前”，再在对应位置放出“现在”（如主歌从前、副歌现在，或一句从前一句现在交替），切换用 cut 或 fade。人物外貌与身份不变。\n自查：每组是否都有从前与现在两张；两张的机位是否一致；变化是否一眼看得出。',
    reveal: '先写“藏”的组：手、背影、剪影或被遮挡的局部（cast.visible 用 hands / back / silhouette），只露一个线索；中段可以给一张画外视线或反应。揭示组放在后段，用更完整的构图或反向视点，hold 2～3、transition fade；最后回到最初的“藏”组，换一张差分（同机位，线索此时已能看懂）作对照。线索在每张图里的形状、位置与持物者保持一致。\n自查：前段是否真的看不全；揭示是否在后段且停留够长；是否回到了最初的构图对照。',
});

export function supports(direction) { return Object.hasOwn(rules, direction); }

export function grammar(direction) {
    if (!supports(direction)) return '';
    return `【本类型的编排重点】\n${rules[direction]}\n这些是编排方法，不是每首必走的步骤。只把本曲确实需要的画面写入 groups / frames，不新增解释段、镜头数量要求或制作门槛。\n【静态画面的完成度】\n每张图先有清楚的视觉焦点、可读轮廓与疏密，再把焦点处的结构、边缘和受光交代完整；具体画风依用户选择，线稿与剪影也应是完成稿，不能以含混草稿代替简洁。人物神态与手势需服务当下情绪，局部特写保持局部，不为强调精细而补出整张脸。\n完整场景的背景已画进差分，单独更换 frame.bg 不会改变已生成的图片；需要不同背景时画对应的新静态差分或新组。完全相同的画面直接复用原素材。结构示例仅示范本类型如何编排，不照搬示例人物姿势、道具、剧情或固定镜头顺序。`;
}

export function finish(style) {
    const byStyle = {
        line: 'finished clean line art, intentional line weight, readable forms and precise focal details',
        water: 'controlled watercolor edges, clear focal forms, deliberate washes and reserved paper',
        pastel: 'resolved painterly forms, controlled edge contrast, coherent light and volume',
        mono: 'precise silhouette contours, readable negative space, deliberate shape hierarchy',
    };
    return byStyle[style] || 'finished illustration in the chosen art style, clear focal forms, deliberate edge control, coherent lighting';
}

export function example(direction, { wardrobe, actor, people = [], useCast = false, sections = [] }) {
    if (!supports(direction)) return '';
    const first = people[0], second = people[1];
    const name = first?.name || actor;
    const binding = (person = first, visible = 'full', position = 'center') => useCast
        ? { cast: person ? [{ participantId: person.id, position, action: '', visible }] : [] }
        : { who: 'char' };
    const pair = () => useCast
        ? { cast: [first, second].filter(Boolean).map((person, index) => ({ participantId: person.id, position: index ? 'right' : 'left', action: '', visible: 'full' })) }
        : { who: 'char' };
    const empty = useCast ? { cast: [] } : { who: 'none' };
    const bg = { id: 'B1', label: '统一场景', prompt: 'quiet interior, soft directional light from frame left, uncluttered background' };
    const group = (id, composition, camera, diffs, cast = binding(), scale = 'medium', { transition = 'cut', motion = 'still', scene = bg } = {}) => ({ id, composition, layer: 'full', position: 'center', scale,
        characterPrompt: camera, ...cast, motion, transition, bgs: [{ ...scene }], diffs });
    const diff = (id, label, imagePrompt) => ({ id, label, imagePrompt });
    const frame = (groupId, diffId, hold, section = 0, line = 0, phase = 'still') => {
        const s = sections[section] || sections[0];
        return { sectionIndex: s?.index ?? 0, lyric: s?.lines?.[line] || s?.lines?.[0] || '', group: groupId, diff: diffId, bg: 'B1', hold, phase };
    };
    let groups, frames;
    if (direction === 'narrative') {
        const street = { id: 'B1', label: '傍晚街角', prompt: 'street corner at dusk, shop lights turning on, long shadows toward frame right' };
        groups = [
            group('G1', '建立：街角远景', 'wide eye-level establishing view, small figure on frame left, street receding to the right', [
                diff('D1', '到达', `wide establishing view, ${name} small on frame left arriving at the street corner, holding a wrapped parcel, dusk light`),
                diff('D2', '包裹留在原处', `same wide establishing view, the street corner now empty, the wrapped parcel left on the bench on frame left, dusk light`),
            ], binding(first, 'full', 'left'), 'wide', { scene: street }),
            group('G2', '动作：放下包裹', 'close view of hands and a bench, same dusk light from frame right', [
                diff('D1', '放下', `close view of ${name}'s hands setting the wrapped parcel down on the bench, fingers just letting go`),
            ], binding(first, 'hands', 'left'), 'close', { scene: street }),
            group('G3', '结果：回头', 'medium side view, figure on frame right looking back toward frame left', [
                diff('D1', '回头看', `medium side view of ${name} on frame right, looking back over the shoulder toward the bench on frame left, quiet resolve`),
            ], binding(first, 'full', 'right'), 'medium', { scene: street }),
        ];
        frames = [frame('G1', 'D1', 1.5, 0, 0, 'prep'), frame('G2', 'D1', .5, 0, 1, 'action'), frame('G3', 'D1', 1.5, 0, 1, 'settle'), frame('G1', 'D2', 3, 1, 0, 'settle')];
    } else if (direction === 'lyrical') {
        const rain = { id: 'B1', label: '雨天窗边', prompt: 'rain-streaked window, muted blue daylight, soft reflections, wide quiet space' };
        groups = [
            group('G1', '空镜：雨打窗', 'close view of a rain-streaked window, no people, soft blue light', [
                diff('D1', '雨痕', 'close view of raindrops sliding down a window pane, blurred city lights behind, no people'),
                diff('D2', '雨停', 'same close view of the window pane, the last drops drying, a thin band of warm light breaking through, no people'),
            ], empty, 'close', { transition: 'fade', motion: 'push', scene: rain }),
            group('G2', '远景小人物', 'wide view, small figure seen from behind on frame left, large empty right side', [
                diff('D1', '背影', `wide view, ${name} small and seen from behind at the left edge of a large window, still posture, empty space on the right`),
            ], binding(first, 'back', 'left'), 'wide', { transition: 'fade', motion: 'push', scene: rain }),
            group('G3', '局部：握着杯子的手', 'close view of hands around a cup, side light', [
                diff('D1', '捧杯', `close view of ${name}'s hands wrapped around a warm cup on the windowsill, steam rising`),
            ], binding(first, 'hands'), 'close', { transition: 'fade', motion: 'push', scene: rain }),
        ];
        frames = [frame('G1', 'D1', 3), frame('G2', 'D1', 2, 0, 1), frame('G3', 'D1', 2, 1), frame('G1', 'D2', 3, 1, 1)];
    } else if (direction === 'interaction') {
        groups = [
            group('G1', '发起：左侧递出', 'eye-level three-quarter medium view, subject on frame left, gaze toward frame right', [
                diff('D1', '递出', `medium view of ${name} on frame left, holding out a small key toward frame right, hopeful expression`),
                diff('D2', '被接住后', `same medium view of ${name} on frame left, empty hand lowered, a small relieved smile toward frame right`),
            ], binding(first, 'full', 'left')),
            second ? group('G2', '回应：右侧接过', 'eye-level reverse medium view, subject on frame right looking left, matching eyeline height', [
                diff('D1', '迟疑后接过', `medium view of ${second.name} on frame right looking toward frame left, reaching out to take the small key, hesitant then gentle gaze`),
            ], binding(second, 'full', 'right')) : group('G2', '回应：画外的手', 'close view of an open palm entering from frame right, same light', [
                diff('D1', '画外接过', `close view of the small key resting on ${name}'s palm as another hand from off-screen frame right reaches for it`),
            ], binding(first, 'hands'), 'close'),
            group('G3', '同框：距离拉近', 'two-shot medium view, one subject on each side, closer than before', [
                diff('D1', '并肩', second ? `two-shot medium view, ${name} on frame left and ${second.name} on frame right standing closer, both looking at the key between them` : `medium view of ${name} on frame left beside the now-empty space on frame right, looking at the key`),
            ], second ? pair() : binding(first, 'full', 'left')),
        ];
        frames = [frame('G1', 'D1', 1), frame('G2', 'D1', 1.5, 0, 1), frame('G1', 'D2', 1, 1), frame('G3', 'D1', 2.5, 1, 1)];
    } else if (direction === 'impact') {
        const dark = { id: 'B1', label: '逆光夜景', prompt: 'dark rooftop at night, strong backlight from behind, high contrast, wind' };
        groups = [
            group('G1', '蓄势与定格', 'low-angle full view, strong backlit silhouette', [
                diff('D1', '低头蓄势', `low-angle full view of ${name}, head lowered, fists clenched at the sides, backlit silhouette, dim light`),
                diff('D2', '抬头定格', `same low-angle full view of ${name}, head raised with a decisive gaze, coat edges thrown back by wind, blazing rim light`),
            ], binding(), 'full', { transition: 'flash', scene: dark }),
            group('G2', '极近：眼睛', 'extreme close-up of eyes, hard side light', [
                diff('D1', '睁眼', `extreme close-up of ${name}'s eyes snapping open, sharp highlight, hard side light`),
            ], binding(first, 'face'), 'close', { scene: dark }),
            group('G3', '极近：握紧的手', 'extreme close-up of a fist, rim light', [
                diff('D1', '握紧', `extreme close-up of ${name}'s fist tightening, knuckles caught in hard rim light`),
            ], binding(first, 'hands'), 'close', { transition: 'flash', scene: dark }),
        ];
        frames = [frame('G1', 'D1', 2.5, 0, 0, 'prep'), frame('G2', 'D1', .3, 1, 0, 'action'), frame('G3', 'D1', .3, 1, 0, 'action'), frame('G2', 'D1', .3, 1, 0, 'action'), frame('G1', 'D2', 2.5, 1, 0, 'settle')];
    } else if (direction === 'loop') {
        groups = [group('G1', '固定机位的循环单元', 'front medium view, centered subject, locked framing and lighting', [
            diff('D1', '手在左', `front medium view of ${name}, relaxed face, both hands raised beside the left cheek`),
            diff('D2', '手在右', `same front medium view of ${name}, relaxed face, both hands raised beside the right cheek`),
            diff('D3', '眨眼变奏', `same front medium view of ${name}, both hands beside the right cheek, a playful wink at the viewer`),
        ])];
        frames = [frame('G1', 'D1', 1), frame('G1', 'D2', 1), frame('G1', 'D1', 1, 0, 1), frame('G1', 'D2', 1, 0, 1),
            frame('G1', 'D1', .5, 1), frame('G1', 'D2', .5, 1), frame('G1', 'D3', 1, 1), frame('G1', 'D2', .5, 1, 1), frame('G1', 'D1', .5, 1, 1)];
    } else if (direction === 'montage') {
        const memory = 'faded warm tones, soft glow, slightly overexposed edges';
        const past = (id, composition, camera, label, prompt, cast = binding(), scale = 'medium') => group(id, composition, camera, [diff('D1', label, `${prompt}, ${memory}`)], cast, scale, { transition: 'fade' });
        groups = [
            past('G1', '回忆：夏日河边', 'wide view, riverside in summer, figure on frame left', '河边', `wide view of ${name} on frame left skipping stones at a summer riverside`, binding(first, 'full', 'left'), 'wide'),
            past('G2', '回忆：雨中屋檐', 'medium view under an eave, rain', '躲雨', `medium view of ${name} sheltering under a shop eave in the rain, laughing`),
            past('G3', '回忆：雪夜手套', 'close view of gloved hands, snow', '雪夜', `close view of ${name}'s gloved hands holding a small warm drink on a snowy night`, binding(first, 'hands'), 'close'),
            past('G4', '回忆：樱花道', 'wide view of a cherry blossom path, figure walking away', '樱花道', `wide back view of ${name} walking along a cherry blossom path`, binding(first, 'back'), 'wide'),
            group('G5', '现在：清晰的此刻', 'medium three-quarter view, clear natural light, present day', [
                diff('D1', '现在', `medium three-quarter view of ${name} in the present, clear natural daylight, a calm small smile, sharp and fully saturated`),
            ], binding(first, 'full', 'center'), 'medium', { transition: 'fade' }),
        ];
        frames = [frame('G1', 'D1', 1.5), frame('G2', 'D1', 1, 0, 1), frame('G3', 'D1', .5, 1), frame('G4', 'D1', .4, 1), frame('G5', 'D1', 3, 1, 1, 'settle')];
    } else if (direction === 'opening') {
        const sky = { id: 'B1', label: '天空', prompt: 'vast morning sky over the city, sunlight breaking through clouds, wind' };
        groups = [
            group('G1', '冷开场：远景背影', 'wide view from behind, small figure against a vast sky', [
                diff('D1', '背影', `wide back view of ${name} standing on a hill, small against a vast morning sky, wind in the hair`),
            ], binding(first, 'back'), 'wide', { scene: sky }),
            group('G2', `亮相：${name}`, 'medium three-quarter view, character color backdrop, dramatic side light', [
                diff('D1', '回眸', `medium three-quarter view of ${name} glancing back over the shoulder at the viewer, confident expression, backdrop washed in this character's signature color`),
            ], binding(first, 'full', 'center')),
            ...(second ? [group('G3', `亮相：${second.name}`, 'medium three-quarter view, character color backdrop, dramatic side light', [
                diff('D1', '抬头', `medium three-quarter view of ${second.name} lifting the head toward the light, determined look, backdrop washed in this character's signature color`),
            ], binding(second, 'full', 'center'))] : []),
            group('G4', '副歌：全员同框', 'low-angle full view, everyone side by side facing the wind', [
                diff('D1', '并肩', second ? `low-angle full view of ${name} and ${second.name} side by side facing into the wind, clothes and hair swept back, bright sky behind` : `low-angle full view of ${name} facing into the wind, clothes and hair swept back, bright sky behind`),
            ], second ? pair() : binding(), 'full', { transition: 'flash', scene: sky }),
            group('G5', '收尾：开阔天空', 'wide view of the sky and city, no people', [
                diff('D1', '天空', 'wide view of a bright sky over the rooftops, birds in the distance, no people'),
            ], empty, 'wide', { transition: 'fade', scene: sky }),
        ];
        frames = [frame('G1', 'D1', 2), frame('G2', 'D1', 1.2, 0, 1), ...(second ? [frame('G3', 'D1', 1.2, 0, 1)] : []),
            frame('G2', 'D1', .5, 1), ...(second ? [frame('G3', 'D1', .5, 1)] : []), frame('G4', 'D1', 2, 1, 0, 'settle'), frame('G5', 'D1', 2, 1, 1)];
    } else if (direction === 'pov') {
        const viewer = people.find(person => person.identity === 'user');
        groups = [
            group('G1', '中景：看向你', 'first-person view at eye level, medium distance', [
                diff('D1', '看向你', `first-person view at eye level, medium shot of ${name} looking at the viewer with a gentle smile, one hand raised in greeting`),
            ], binding(first, 'full', 'center'), 'medium', { motion: 'push' }),
            group('G2', '近景：伸手', 'first-person view at eye level, close distance', [
                diff('D1', '伸手', `first-person view at eye level, close shot of ${name} reaching one hand toward the viewer, warm eye contact`),
                diff('D2', '低头靠近', `first-person view at eye level, close shot of ${name} leaning closer to the viewer, soft eyes, quiet smile`),
            ], binding(first, 'full', 'center'), 'close', { motion: 'push' }),
            ...(viewer && useCast ? [group('G3', '你的手', 'first-person view looking down, the viewer\'s hands at the bottom edge', [
                diff('D1', '握住', `first-person view looking down, hands of the viewer at the bottom edge holding ${name}'s offered hand, no face of the viewer`),
            ], { cast: [{ participantId: first?.id, position: 'center', action: '', visible: 'hands' }, { participantId: viewer.id, position: 'center', action: '', visible: 'hands' }] }, 'close')] : []),
        ];
        frames = [frame('G1', 'D1', 2), frame('G2', 'D1', 1.5, 0, 1), frame('G2', 'D2', 2, 1), ...(viewer && useCast ? [frame('G3', 'D1', 2, 1, 1)] : [frame('G2', 'D1', 1.5, 1, 1)])];
    } else if (direction === 'contrast') {
        groups = [
            group('G1', '对照：同一张长椅', 'fixed wide eye-level view of a park bench, figure seated on frame left', [
                diff('D1', '从前', `wide eye-level view of ${name} seated on frame left of a new wooden park bench in bright spring light, young sapling beside it`),
                diff('D2', '现在', `same wide eye-level view of ${name} seated on frame left of the same bench now weathered, the sapling grown into a tall tree, golden autumn light`),
            ], binding(first, 'full', 'left'), 'wide'),
            group('G2', '对照：桌上的杯子', 'fixed close view of a table by a window', [
                diff('D1', '从前', 'close view of two cups side by side on a table by the window, morning light, no people'),
                diff('D2', '现在', 'same close view of the same table by the window with one cup left, evening light, no people'),
            ], empty, 'close'),
        ];
        frames = [frame('G1', 'D1', 2), frame('G2', 'D1', 1.5, 0, 1), frame('G1', 'D2', 2, 1), frame('G2', 'D2', 2.5, 1, 1)];
    } else if (direction === 'reveal') {
        groups = [
            group('G1', '藏：只露一角', 'close cropped view of cupped hands, matching positions and side light', [
                diff('D1', '只露一角', `close cropped view of ${name}'s cupped hands, a small red ribbon end visible between the fingers, the rest concealed`),
                diff('D2', '看懂原线索', `same close cropped view of ${name}'s hands now open, a small music box with a red ribbon in the palms, ribbon end where it was before`),
            ], binding(first, 'hands'), 'close'),
            group('G2', '背影', 'medium back view, face not visible, warm light ahead', [
                diff('D1', '背影', `medium back view of ${name}, face not visible, hands held together in front, walking toward warm light`),
            ], binding(first, 'back')),
            group('G3', '揭示：完整画面', 'medium front view, hands and object clearly visible at chest level', [
                diff('D1', '打开音乐盒', `medium front view of ${name}, holding an opened small music box with a red ribbon at chest level, soft warm gaze toward it`),
            ], binding(), 'medium', { transition: 'fade' }),
        ];
        frames = [frame('G1', 'D1', 1.5), frame('G2', 'D1', 1.5, 0, 1), frame('G3', 'D1', 3, 1), frame('G1', 'D2', 2, 1, 1)];
    } else {
        groups = [
            group('G1', '跨段落呼应的主画面', 'wide three-quarter view, figure at left, light and negative space to the right', [
                diff('D1', '望向画外', `wide three-quarter view of ${name} on frame left, gaze toward the empty right side, relaxed quiet posture`),
                diff('D2', '回应后的主画面', `same wide three-quarter view of ${name} on frame left, small gentle smile, gaze toward frame right, coherent directional light`),
            ], binding(first, 'full', 'left'), 'wide'),
            group('G2', '间奏中的意象细节', 'close-up of a folded paper object and its shadow', [
                diff('D1', '留白', 'one folded paper shape resting on a table, clear side-lit contour and long quiet shadow'),
            ], empty, 'close'),
        ];
        frames = [frame('G1', 'D1', 2), frame('G2', 'D1', 1, 0, 1), frame('G1', 'D2', 3, 1)];
    }
    return JSON.stringify({ wardrobe, groups, frames });
}
