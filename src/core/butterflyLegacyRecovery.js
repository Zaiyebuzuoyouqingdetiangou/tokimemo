// Exact r61 prompt recipes, used only to authenticate legacy recovery hashes.
// Never used as the default generation policy. Do not "improve" their wording.
import * as generation_prompts from '../generation/prompts.js';
import * as core_constants from './constants.js';
import * as core_incremental from './incremental.js';
import * as core_text from './text.js';
import * as core_butterflyContract from './butterflyContract.js';

const { promptSafetyBoundary, promptArchiveSlice } = generation_prompts;
const BUTTERFLY_PRIMARY_AXES = core_butterflyContract.BUTTERFLY_PRIMARY_AXES;

const PRIMARY_AXIS_SET = new Set(BUTTERFLY_PRIMARY_AXES);
const PRIMARY_AXIS_ALIASES = Object.freeze({
    era: 'era', period: 'era', time: 'era', '时代': 'era', '年代': 'era',
    identity: 'identity', role: 'identity', status: 'identity', '身份': 'identity', '出身': 'identity',
    occupation: 'occupation', job: 'occupation', career: 'occupation', '职业': 'occupation', '工作': 'occupation',
    location: 'location', place: 'location', residence: 'location', '地点': 'location', '地域': 'location',
    decision: 'decision', choice: 'decision', '决定': 'decision', '选择': 'decision', '抉择': 'decision',
    encounter: 'encounter', meeting: 'encounter', '相遇': 'encounter', '遇见': 'encounter',
    bond: 'bond', relationship: 'bond', '羁绊': 'bond', '关系': 'bond',
    fate: 'fate', outcome: 'fate', ending: 'fate', '命运': 'fate', '结局': 'fate',
});
const WORLD_FIELDS = Object.freeze([
    'era', 'identity', 'occupation', 'location', 'keyDecision', 'encounterWithUser', 'bondWithUser', 'finalFate',
]);
const WORLD_FIELD_ALIASES = Object.freeze({
    era: ['era', 'period', 'timePeriod'],
    identity: ['identity', 'role', 'status'],
    occupation: ['occupation', 'job', 'career'],
    location: ['location', 'place', 'residence'],
    keyDecision: ['keyDecision', 'decision', 'choice'],
    encounterWithUser: ['encounterWithUser', 'meetingWithUser', 'encounter', 'meeting'],
    bondWithUser: ['bondWithUser', 'relationshipWithUser', 'bond', 'relationship'],
    finalFate: ['finalFate', 'fate', 'outcome', 'ending'],
});

function normalizedPrimaryAxis(value) {
    const raw = core_text.normalizeText(value, 40).toLowerCase().replace(/[\s_-]+/g, '');
    return PRIMARY_AXIS_ALIASES[raw] || '';
}

function worldSource(node) {
    if (node?.worldSpec && typeof node.worldSpec === 'object') return node.worldSpec;
    if (node?.worldProfile && typeof node.worldProfile === 'object') return node.worldProfile;
    if (node?.divergence && typeof node.divergence === 'object') return node.divergence;
    return {};
}

function worldField(source, names) {
    for (const name of names) {
        const text = core_text.normalizeText(source?.[name], 240);
        if (text) return text;
    }
    return '';
}


function looseWorldSpec(node) {
    const source = worldSource(node);
    const result = { primaryAxis: normalizedPrimaryAxis(node?.primaryAxis || source?.primaryAxis || source?.axis) };
    for (const field of WORLD_FIELDS) result[field] = worldField(source, WORLD_FIELD_ALIASES[field]);
    return result;
}


const LEGACY_LIMITS = Object.freeze({ monologueHan: 100, monologueFirstPerson: 3, interventionHan: 40, omegaHan: 160, omegaFirstPerson: 4, systemHan: 30 });
const LEGACY_CONTRACT = `【节点完整性契约】
MAIN 与普通分歧的 monologue 至少 ${LEGACY_LIMITS.monologueHan} 个汉字，至少 ${LEGACY_LIMITS.monologueFirstPerson} 次明确“我”的第一人称视角，不用旁白代替发言。
普通分歧 intervention 至少 ${LEGACY_LIMITS.interventionHan} 个汉字，至少一次“我”；现世角色明确对照“那个我 / 那个世界 / 现世 / 平行世界”，并表达“明白 / 承认 / 意识到 / 庆幸 / 选择 / 珍惜”等自省。MAIN 的 intervention 也不可为空。
每项 systemNote 至少 ${LEGACY_LIMITS.systemHan} 个汉字，包含至少三类算法线索：分析、结论、变量、概率/置信、算法/模型、主体/样本、路径/时间线、收敛/偏差/阈值、判定/分类、结局/结果/终局。必须明确写出“最终判定 / 最终结局 / 最终结果 / 终局判定 / 终局结果 / 判定结果 / 判定结局”之一并给出结论，而非仅罗列标签。
Ω 的 label 必须含“观测点 Ω”或“TRUE ENDING”；monologue 严格为空。intervention 至少 ${LEGACY_LIMITS.omegaHan} 个汉字、至少 ${LEGACY_LIMITS.omegaFirstPerson} 次“我”，明确指向你/用户姓名，综合时代、身份、职业、地点、选择、相遇、羁绊、命运中至少三类差异；包含命运/奇迹/不可能与唯一解/唯一答案/最终选择/选择了你/找到了你之一。Ω 的 systemNote 还须明确命运/奇迹/唯一解/真结局。
worldSpec 的 era、identity、occupation、location、keyDecision、encounterWithUser、bondWithUser、finalFate 八字段均为具体文本，不用“同上/不变/未知”；thirdPartyRomance 严格为 false。不得虚构第三方恋爱、婚姻或前任；节点标题、世界条件与独白均不可重复。`;

export function legacyButterflyPlan(memoryBank) {
    const ids = new Set();
    for (const item of Array.isArray(memoryBank?.memories) ? memoryBank.memories : []) {
        const id = typeof item?.id === 'string' ? item.id.trim() : '';
        // Match MAIN's evidence vocabulary: summary alone is not a source anchor.
        // Keep this planning module host-independent (evidence.js imports the runtime).
        const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
        const anchors = (Array.isArray(item?.anchors) ? item.anchors : []).map(clean).filter(Boolean).slice(0, 8);
        if (/^M\d{3,}$/.test(id) && [clean(item?.title), ...anchors].some(value => value.length >= 2)) ids.add(id);
    }
    const count = Math.min(BUTTERFLY_PRIMARY_AXES.length, Math.ceil(ids.size / 3));
    return { memoryCount: ids.size, axes: BUTTERFLY_PRIMARY_AXES.slice(0, count), total: count ? count + 2 : 0 };
}

export function legacyButterflyPlanPrompt(memoryBank) {
    const plan = legacyButterflyPlan(memoryBank);
    return plan.total
        ? '本次初始观测共 ' + plan.total + ' 个节点：MAIN、' + plan.axes.length + ' 个普通分歧、唯一末项 OMEGA。普通分歧 primaryAxis 依次为 ' + plan.axes.join(' / ') + '；不可少项或额外凑数。'
        : '当前没有可用档案锚点，不生成观测节点。';
}


export function legacyButterflyPrompt(context, memoryBank) {
    return `${promptSafetyBoundary(context, '蝴蝶效应')}
${LEGACY_CONTRACT}
${legacyButterflyPlanPrompt(memoryBank)}
主时间线只从下面较小的档案锚点集中取证；平行分歧主要依据受控角色卡/人设/世界书推演。
UNTRUSTED_TIMELINE_ANCHORS_JSON:
${promptArchiveSlice(memoryBank, 16)}

任务：生成“平行时空观测终端 / 蝴蝶效应”。外延节点是【明确标注为模拟的平行时空切片】，不是当前世界已经发生过的事实。

生成依据：必须综合当前受控上下文中的 CHARACTER_CARD_JSON、USER_PERSONA_JSON、WORLD_INFO_TEXT 与 {{char}} 的背景；手动聊天档案用于确定【主时间线】和当前关系状态，但外延分歧不要求逐条从真实记忆改写。要真正利用人设与世界书想象“如果人生关键条件不同会怎样”。

核心叙事结构：
1. MAIN 是现世主时间线锚点。
2. 本地计划中的普通分歧才是平行世界；每个平行世界都有【那个世界里的 {{char}}】自己的第一人称发言。
3. 最后一项【观测点 Ω】不是另一个平行世界，而是【现世 {{char}} 已经依次看完前面所有平行世界发言之后】回到主时间线的最终观测点。因此 Ω 不存在“平行体”，不得生成平行体独白。

JSON 结构必须严格为：
{
  "title": "平行时空观测终端",
  "subject": "角色名",
  "status": "UNSTABLE",
  "nodes": [
    {
      "id": "MAIN",
      "label": "主时间线（锁定）：简短名称",
      "code": "> SIMULATION RECORD #MAIN",
      "locked": true,
      "trueEnding": false,
      "sourceMemoryIds": ["M001"],
      "sourceMemoryAnchor": "主时间线必须从真实档案 anchors/title 原样复制一个具体锚点",
      "monologue": "主时间线 {{char}} 第一人称观测独白，不少于100个汉字",
      "intervention": "当前世界线 {{char}} 的主时间线自省",
      "systemNote": "冷酷、客观的系统算法结局判定"
    },
    {
      "id": "EG01",
      "label": "分歧点 A：未曾相遇",
      "code": "> SIMULATION RECORD #EG-01",
      "locked": false,
      "trueEnding": false,
      "sourceMemoryIds": [],
      "sourceMemoryAnchor": "",
      "worldSpec": {
        "primaryAxis": "era",
        "era": "这个世界的时代条件",
        "identity": "这个世界的身份",
        "occupation": "这个世界的职业/生存方式",
        "location": "主要生活地点",
        "keyDecision": "改变人生的关键选择",
        "encounterWithUser": "在这个世界如何与 {{user}} 相遇",
        "bondWithUser": "与 {{user}} 的独一关系",
        "finalFate": "这个世界最终命运",
        "thirdPartyRomance": false
      },
      "monologue": "这个平行世界中的 {{char}} 第一人称发言，不少于100个汉字；这是平行体本人说的话",
      "intervention": "现世 {{char}} 看见这个平行体后的即时共鸣、自省或告白",
      "systemNote": "冷酷算法对该平行时空主体的最终判定与结局预测"
    },
    {
      "id": "OMEGA",
      "label": "观测点 Ω：回归现世",
      "code": "> OBSERVATION POINT #OMEGA",
      "locked": false,
      "trueEnding": true,
      "sourceMemoryIds": [],
      "sourceMemoryAnchor": "",
      "monologue": "",
      "intervention": "现世 {{char}} 已经看完前面所有平行世界、听完所有平行体发言之后的最终第一人称发言，不少于160个汉字",
      "systemNote": "系统对完整观测结束、现世主体回归主时间线后的最终判定"
    }
  ]
}

硬性要求：
- nodes 数量严格遵守本次本地初始观测计划：第 1 条必须是“主时间线（锁定）”；中间是计划指定的互不重复的平行分歧；数组最后 1 条必须是【观测点 Ω】。记忆较少时不要凑满十个。
- 主时间线必须 locked=true、trueEnding=false，并至少引用 1 条当前手动档案 sourceMemoryIds + sourceMemoryAnchor，用来锚定“当前世界”。
- 普通平行节点是模拟，不得伪装成已经发生的回忆；它们可以不带 sourceMemoryIds。若从某段档案作为分歧起点，可以附带真实引用，但平行世界里新增的事情仍只能写成模拟。
- 普通平行节点要从角色卡、人设、世界书中的身份、职业、时代、地点、关系条件、选择或命运约束向外推演；不能只把同一场景换措辞。
- 普通平行节点的 worldSpec.primaryAxis 必须按本地计划依次填写且不重复。worldSpec 其余字段都要填写具体内容，各份组合必须实质不同；thirdPartyRomance 必须始终为 false。
- 每个普通平行节点的 monologue 都必须是【那个平行世界里的 {{char}} 本人】第一人称发言，不少于 100 个汉字，有具体生活、处境、记忆感与情绪；不能由现世 {{char}} 代替平行体说话。
- 每个普通平行节点的 intervention 才是【现世 {{char}}】刚看完该平行体后的即时反应；不要把两种说话者混在一个字段里。
- 最后一项必须 id="OMEGA"、trueEnding=true，label 包含“观测点 Ω”或“TRUE ENDING”。【Ω 不是平行世界，不存在平行体】；它的 monologue 必须严格为空字符串 ""，绝对禁止再写平行体发言。
- Ω 的 intervention 是【现世 {{char}} 在看完前面全部平行世界、听完全部平行体发言之后】的最终第一人称发言，不少于 160 个汉字。应自然综合至少 3 种以上前面出现过的命运差异/情绪冲击，而不是只回应最后一个节点，也不要逐条机械复述。
- Ω 的 systemNote 只评价“完整观测结束后的现世主体/主时间线”，不要再判定不存在的 Ω 平行体。
- 普通节点 code 使用“> SIMULATION RECORD #...”形式；Ω 使用“> OBSERVATION POINT #OMEGA”。
- 每条 systemNote 使用中文、冷酷客观的 AI 算法口吻，并明确出现分析结论、变量/概率和最终结局判定，不能写成温柔旁白。
- 禁止出现任何前任、前女友相关情节。
- 禁止出现 {{char}} 与除了 {{user}} 以外任何人恋爱、结婚或组建家庭；第三方只能保持非恋爱关系。
- Ω 必须把至少 3 种前述命运差异汇入最终判断，并清楚表达：跨越不可能仍然相遇是命运/奇迹，而 {{user}} 是所有世界线收敛后的唯一解。
- 当普通分歧只有一两个时，三类差异指这些已生成 worldSpec 中真实改变的时代、身份、职业等条件，不是要求三个世界。Ω 只能回应实际已通过的节点，不能杜撰未观测的世界。
- 只输出结构化 JSON；视觉快照、像素边框、噪点、1 秒干扰动画由插件本地渲染，不由模型输出 HTML/CSS。蝴蝶效应页面现有 UI 完全冻结，本次只生成内容，不提出或描述任何 UI 改版。`;
}
export function legacyButterflySlotPrompt(context, memoryBank, index, nodes) {
    const plan = legacyButterflyPlan(memoryBank);
    const slot = ['MAIN', ...plan.axes, 'OMEGA'][index];
    const basePrompt = legacyButterflyPrompt(context, memoryBank);
    const existing = nodes.map(node => ({ label: node.label, primaryAxis: node.primaryAxis, worldSpec: node.worldSpec }));
    return basePrompt + '\n【本请求的分段输出规则替代上面的整批输出 schema】'
            + '\n本地将组装 ' + plan.total + ' 个节点；你这次只输出 {"node":{当前一个完整节点}}，不要返回 nodes 数组或其他节点。'
            + '\nCURRENT_SLOT_JSON:' + JSON.stringify({ index, kind: slot, primaryAxis: PRIMARY_AXIS_SET.has(slot) ? slot : undefined })
            + '\nMAIN 只写主时间线；普通槽位严格使用指定 primaryAxis；OMEGA 只写唯一终点。每节点继续遵守原字数、来源和关系契约。'
            + '\nEXISTING_VALID_WORLD_INDEX_JSON:' + JSON.stringify(existing)
            + (slot === 'OMEGA' ? '\nVALIDATED_VOICES_JSON:' + JSON.stringify(nodes.map(node => ({ label: node.label, monologue: node.monologue.slice(0, 700), intervention: node.intervention.slice(0, 500) }))) : '');
}
export function legacyButterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds) {
    const existing = (Array.isArray(previous?.nodes) ? previous.nodes.slice(1, -1) : []).slice(-core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 50),
        label: core_text.normalizeText(item?.label, 120),
        code: core_text.normalizeText(item?.code, 120),
        primaryAxis: core_text.normalizeText(item?.primaryAxis || item?.worldSpec?.primaryAxis, 40),
        worldSpec: looseWorldSpec(item),
    }));
    return `${generation_prompts.promptSafetyBoundary(context, '蝴蝶效应 / 增量分歧')}
${LEGACY_CONTRACT}
旧终端节点由本地原样保留。本请求只根据新增档案生成 1～3 个尚未出现的平行分歧，并给出看完全部旧分歧和新分歧后的新观测点 Ω；禁止改写或换措辞复述旧节点。
UNTRUSTED_INCREMENTAL_TIMELINE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_DIVERGENCE_INDEX_JSON:
${JSON.stringify(existing, null, 2)}

严格输出：
{"nodes":[{"id":"EG_NEW_01","label":"新的分歧点","primaryAxis":"era","worldSpec":{"primaryAxis":"era","era":"具体时代","identity":"具体身份","occupation":"具体职业","location":"具体地点","keyDecision":"关键选择","encounterWithUser":"与 {{user}} 如何相遇或错过","bondWithUser":"与 {{user}} 的关系结果","finalFate":"最终命运","thirdPartyRomance":false},"sourceMemoryIds":[],"sourceMemoryAnchor":"","monologue":"该平行世界 {{char}} 第一人称发言，不少于100个中文汉字","intervention":"现世 {{char}} 对照那个我的第一人称自省","systemNote":"分析结论；关键变量；概率判定；最终结局"}],"omega":{"id":"OMEGA","label":"观测点 Ω：再次回归现世","monologue":"","intervention":"现世 {{char}} 综合至少三类命运差异，穿越不可能仍找到并选择 {{user}} 的唯一解，不少于160个中文汉字","systemNote":"完整观测后的冷酷中文最终判定，明确命运、奇迹与唯一解"}}

要求：
- nodes 只给 1～3 个真正新的普通分歧；primaryAxis 只能是 era/identity/occupation/location/decision/encounter/bond/fate。
- worldSpec 八个文本字段都要具体，不得写“同上/不变/未知”，thirdPartyRomance 必须为 false，且整体命运组合不得与旧 worldSpec 重复。
- 每个 monologue 不少于100个中文汉字且是平行体第一人称；intervention 不少于40个中文汉字，必须由现世 {{char}} 对照那个我自省。
- systemNote 不少于30个中文汉字，用分析结论/关键变量/概率判定/最终结局的冷酷客观算法口吻。
- 新分歧应由 incrementalMemoryIds 带来的关系变化、选择或理解触发，但仍明确是模拟，不伪装成真实历史。
- 必须避开 EXISTING_DIVERGENCE_INDEX_JSON 的标签和命运条件。
- omega.monologue 必须为空；omega.intervention 不少于160个中文汉字，综合至少三类命运差异，并表达穿越不可能仍找到/选择 {{user}} 的唯一解。
- 禁止前任/前女友；禁止 {{char}} 与 {{user}} 以外任何人恋爱、结婚或组建家庭。只输出 JSON。`;
}

