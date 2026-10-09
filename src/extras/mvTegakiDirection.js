// Still-image editing grammar. Expression/stage and illustration have their own contracts.
const rules = Object.freeze({
    auto: '先按本曲各段的作用选择主要手法，再用辅助手法补足：哪里在讲事、哪里留白、哪里重复、哪里揭示，应能从画面顺序读出。手法变化沿用人物方位、核心物件与色光关系，不为“混合”逐段换世界或轮流展示所有类型。副歌的记忆点可以在主歌埋下、间奏停留、尾声回应；已有主图值得停留时跨句复用，不按歌词行数换图。',
    narrative: '先明确观众在这一段看懂的事件或关系变化，再选择必要的建立、动作关键点和结果画面；省略无信息的中间动作。用可见的物件状态、人物视线或位置承接因果，反应镜头要接得上它所回应的事。连续空间保持左右方位、视线高度、持物手与光源一致；时间或地点改变时给出可读线索。静态画面抓动作前后的关键姿势，结果值得多停留，不把全曲写成逐句插画或连续动作清单。',
    lyrical: '先选本曲真正有分量的意象及其情绪联系，再安排人物、局部与空镜的疏密；不把每个歌词名词都做成新道具。让同一意象在不同段落重现时产生可见的变化，例如距离、明暗、朝向或人物回应，原样重现也可表达等待与回忆。同一主图可承载数句，间奏与尾声保留呼吸；景别、留白和光色形成起伏，不用满屏漂浮装饰代替意象表达。',
    interaction: '以双方对彼此的影响组织镜头：先让观众知道谁在看谁、谁发起动作，再用对方的眼神、手势、距离或沉默接住。正反打维持对应视线和左右空间，手与物件的近景明确所属人物；同框时让站位和动作构成关系，避免两张独立肖像并排。重复姿势可以因对方回应而有细微改变，关键回应适当停留。歌手轮唱不等于画面必须逐句换人，合唱也不强制同框；关系以现有人设为准。',
    impact: '先找蓄势、重拍落点与释放后的停顿，把短切集中在有作用的局部；快段也要看得清人物、动作方向与焦点。用景别、明暗和轮廓的反差产生冲击，强镜头前可以留空、静止或延迟，冲击后给关键画面停顿，避免全曲同速快闪。用 hold 写出真实长短差别，短插镜可用小数；以可读的静态关键姿势衔接，不让攻击中途或奔跑姿势长时间悬空，不靠每镜闪白或加入无关战斗制造“燃”。',
    loop: '先建立观众能辨认的循环单元：稳定机位下的关键姿势按节拍重复，结尾能接回起始姿势。frames 按播放顺序再次引用原 group/diff，主歌、间奏、副歌都可循环，不为回到原姿势重新画一份。需要推进时在熟悉节奏里改变一处视线、手势、道具状态或插入一次停顿，再回到核心单元；不要每轮同时换构图和所有元素。hold 表达单元内部的轻重与空拍，静态差分只承担关键拍，不声称能生成连续舞蹈。',
    reveal: '先想清观众最初看到了什么、尚不知道什么，以及揭示后哪张旧画面会获得新含义；再把可见线索放进局部、画外关系或遮挡中。揭示由更完整的构图、反向视点或物件状态说明真相，随后给观众看懂的停留，并可回到原构图验证伏笔。线索的形状、位置与持物者前后一致，不用突然换脸、闪白、字幕解释或凭空增加秘密冒充反转。不强制恐怖、死亡、背叛或人设之外的重大事件。',
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
    const empty = useCast ? { cast: [] } : { who: 'none' };
    const bg = { id: 'B1', label: '统一场景', prompt: 'quiet interior, soft directional light from frame left, uncluttered background' };
    const group = (id, composition, camera, diffs, cast = binding(), scale = 'medium') => ({ id, composition, layer: 'full', position: 'center', scale,
        characterPrompt: camera, ...cast, motion: 'still', transition: 'cut', bgs: [{ ...bg }], diffs });
    const diff = (id, label, imagePrompt) => ({ id, label, imagePrompt });
    const frame = (groupId, diffId, hold, section = 0, line = 0, phase = 'still') => {
        const s = sections[section] || sections[0];
        return { sectionIndex: s?.index ?? 0, lyric: s?.lines?.[line] || s?.lines?.[0] || '', group: groupId, diff: diffId, bg: 'B1', hold, phase };
    };
    let groups, frames;
    if (direction === 'narrative') {
        groups = [
            group('G1', '门前停步与门框落手', 'wide eye-level view, doorway on frame right, soft light from frame left', [
                diff('D1', '停在门前', `wide eye-level view, ${name} standing still on frame left facing a closed door on frame right, hands relaxed`),
                diff('D2', '手扶门框', `wide eye-level view, ${name} standing on frame left beside the open doorway on frame right, one hand resting on the near door frame`),
            ], binding(first, 'full', 'left'), 'wide'),
            group('G2', '回望回应前镜', 'close side view, face on frame right looking left, same light direction', [
                diff('D1', '回望', `close side view of ${name} on frame right, calm gaze toward frame left, one still expression`),
            ], binding(first, 'full', 'right'), 'close'),
        ];
        frames = [frame('G1', 'D1', 1, 0, 0, 'prep'), frame('G1', 'D2', .6, 0, 1, 'action'), frame('G2', 'D1', 2, 1, 0, 'settle')];
    } else if (direction === 'lyrical') {
        groups = [
            group('G1', '人物与窗边留白', 'wide back view, figure on frame left, quiet negative space on the right', [
                diff('D1', '静望', `wide back view of ${name} at the left edge of a window, still posture, soft light across the empty right half`),
            ], binding(first, 'back', 'left'), 'wide'),
            group('G2', '光落在静物上', 'close-up still life, oblique light, restrained background', [
                diff('D1', '折纸与影', 'close-up of a folded paper shape on a table, one clear diagonal shadow, quiet still life'),
            ], empty, 'close'),
        ];
        frames = [frame('G1', 'D1', 3), frame('G1', 'D1', 2, 0, 1), frame('G2', 'D1', 1, 1), frame('G1', 'D1', 4, 1)];
    } else if (direction === 'interaction') {
        groups = [
            group('G1', '发起与接到回应', 'eye-level three-quarter medium view, subject on frame left, gaze toward frame right', [
                diff('D1', '等待回应', `medium view of ${name} on frame left, eyes directed toward frame right, a restrained expectant expression, hands at rest`),
                diff('D2', '接到回应', `same medium view of ${name} on frame left, gaze toward frame right, a small relieved smile, hands at rest`),
            ], binding(first, 'full', 'left')),
            second ? group('G2', '对方的回应', 'eye-level reverse medium view, subject on frame right looking left, matching eyeline height', [
                diff('D1', '回视', `medium view of ${second.name} on frame right looking toward frame left, gentle attentive gaze, one open palm resting at waist level`),
            ], binding(second, 'full', 'right')) : group('G2', '画外回应后的细节', 'close view of hands at waist level, same directional light', [
                diff('D1', '松开的手', `close cropped view of ${name}'s relaxed hands at waist level, fingers held loosely open in one static pose`),
            ], binding(first, 'hands'), 'close'),
        ];
        frames = [frame('G1', 'D1', 1), frame('G2', 'D1', 1.5, 0, 1), frame('G1', 'D2', 2, 1)];
    } else if (direction === 'impact') {
        groups = [
            group('G1', '蓄势与定格主画面', 'low-angle full view, strong readable silhouette, light from frame left', [
                diff('D1', '静止蓄势', `low-angle full view of ${name}, feet firmly planted, head lowered, arms resting at sides, restrained contrast`),
                diff('D2', '抬眼定格', `same low-angle full view of ${name}, head raised with a decisive gaze, one fist held still at chest level, strong side light`),
            ], binding(), 'full'),
            group('G2', '短促视线插镜', 'extreme close-up of eyes, sharp side light', [
                diff('D1', '视线落点', `extreme close-up of ${name}'s steady eyes, sharply resolved lids and one clear light edge`),
            ], binding(first, 'face'), 'close'),
        ];
        frames = [frame('G1', 'D1', 2, 0, 0, 'prep'), frame('G2', 'D1', .25, 1, 0, 'action'), frame('G1', 'D1', .25, 1, 0, 'prep'), frame('G1', 'D2', 2, 1, 0, 'settle')];
    } else if (direction === 'loop') {
        groups = [group('G1', '可返回的固定主构图', 'front medium view, centered subject, fixed framing and lighting', [
            diff('D1', '手停左侧', `front medium view of ${name}, relaxed face, hands held together at waist level toward frame left`),
            diff('D2', '手停右侧', `same front medium view of ${name}, relaxed face, hands held together at waist level toward frame right`),
            diff('D3', '抬眼停顿', `same front medium view of ${name}, hands held still at waist level toward frame right, eyes meeting the viewer`),
        ])];
        frames = [frame('G1', 'D1', 1), frame('G1', 'D2', 1), frame('G1', 'D1', 1, 0, 1), frame('G1', 'D2', 1, 0, 1), frame('G1', 'D3', 2, 1), frame('G1', 'D1', 1, 1)];
    } else if (direction === 'reveal') {
        groups = [
            group('G1', '保留与回看线索', 'close cropped view of cupped hands, matching positions and side light', [
                diff('D1', '只露一角', `close cropped view of ${name}'s cupped hands, a small pointed corner of folded paper visible between the fingers, the rest concealed`),
                diff('D2', '看懂原线索', `same close cropped view of ${name}'s hands now resting open, a small paper flower clearly visible in the palms, pointed fold aligned with the earlier corner`),
            ], binding(first, 'hands'), 'close'),
            group('G2', '完整信息与回应', 'medium view, hands and their object clearly visible at chest level', [
                diff('D1', '完整纸花', `medium view of ${name}, open hands held at chest level with a small folded paper flower, quiet warm gaze toward the object`),
            ]),
        ];
        frames = [frame('G1', 'D1', 1), frame('G1', 'D1', 1, 0, 1), frame('G2', 'D1', 3, 1), frame('G1', 'D2', 2, 1)];
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
