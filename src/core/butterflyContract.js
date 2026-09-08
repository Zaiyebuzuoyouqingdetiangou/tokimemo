// Code-owned limits and feedback only. Never echo model/source text or exception messages.
export const BUTTERFLY_PRIMARY_AXES = Object.freeze([
    'era', 'identity', 'occupation', 'location', 'decision', 'encounter', 'bond', 'fate',
]);

// Initial generation only. Never resize a saved session after the archive grows.
export function buildButterflyPlan(memoryBank) {
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

export function butterflyPlanPrompt(memoryBank) {
    const plan = buildButterflyPlan(memoryBank);
    return plan.total
        ? '本次初始观测共 ' + plan.total + ' 个节点：MAIN、' + plan.axes.length + ' 个普通分歧、唯一末项 OMEGA。普通分歧 primaryAxis 依次为 ' + plan.axes.join(' / ') + '；不可少项或额外凑数。'
        : '当前没有可用档案锚点，不生成观测节点。';
}

export const BUTTERFLY_LIMITS = Object.freeze({ monologueHan: 100, monologueFirstPerson: 3, interventionHan: 40, omegaHan: 160, omegaFirstPerson: 4, systemHan: 30 });
export const BUTTERFLY_GENERATION_CONTRACT = `【节点完整性契约】
MAIN 与普通分歧的 monologue 至少 ${BUTTERFLY_LIMITS.monologueHan} 个汉字，至少 ${BUTTERFLY_LIMITS.monologueFirstPerson} 次明确“我”的第一人称视角，不用旁白代替发言。
普通分歧 intervention 至少 ${BUTTERFLY_LIMITS.interventionHan} 个汉字，至少一次“我”；现世角色明确对照“那个我 / 那个世界 / 现世 / 平行世界”，并表达“明白 / 承认 / 意识到 / 庆幸 / 选择 / 珍惜”等自省。MAIN 的 intervention 也不可为空。
每项 systemNote 至少 ${BUTTERFLY_LIMITS.systemHan} 个汉字，包含至少三类算法线索：分析、结论、变量、概率/置信、算法/模型、主体/样本、路径/时间线、收敛/偏差/阈值、判定/分类、结局/结果/终局。必须明确写出“最终判定 / 最终结局 / 最终结果 / 终局判定 / 终局结果 / 判定结果 / 判定结局”之一并给出结论，而非仅罗列标签。
Ω 的 label 必须含“观测点 Ω”或“TRUE ENDING”；monologue 严格为空。intervention 至少 ${BUTTERFLY_LIMITS.omegaHan} 个汉字、至少 ${BUTTERFLY_LIMITS.omegaFirstPerson} 次“我”，明确指向你/用户姓名，综合时代、身份、职业、地点、选择、相遇、羁绊、命运中至少三类差异；包含命运/奇迹/不可能与唯一解/唯一答案/最终选择/选择了你/找到了你之一。Ω 的 systemNote 还须明确命运/奇迹/唯一解/真结局。
worldSpec 的 era、identity、occupation、location、keyDecision、encounterWithUser、bondWithUser、finalFate 八字段均为具体文本，不用“同上/不变/未知”；thirdPartyRomance 严格为 false。不得虚构第三方恋爱、婚姻或前任；节点标题、世界条件与独白均不可重复。`;

const ISSUES = Object.freeze({
    relationship: '人物关系归属不明确或包含第三方恋爱。每个独立字段明确用我与你指向双方，不把我们指代新的第三人。',
    unique: '当前节点与已通过节点重复，或 primaryAxis 不等于本槽位指定维度。请只重写当前节点。',
    systemNote: 'systemNote 未满足汉字数、三类算法线索或明确终局判定。',
    monologue: 'monologue 未满足汉字数或第一人称次数。',
    intervention: 'intervention 缺少足量现世第一人称对照和自省。',
    omega: '观测点 Ω 的标题、空 monologue、综合告白或终局说明不完整。',
    worldSpec: 'worldSpec 维度、具体字段或 thirdPartyRomance=false 不完整。',
});
export function butterflyValidationError(field) {
    const key = Object.hasOwn(ISSUES, field) ? field : 'worldSpec';
    const error = new Error(ISSUES[key]);
    error.code = 'RMT_BUTTERFLY_' + key;
    error.retryable = true;
    return error;
}
export function butterflyValidationFeedback(error) {
    const key = String(error?.code || '').replace(/^RMT_BUTTERFLY_/, '');
    return String(error?.code || '').startsWith('RMT_BUTTERFLY_') && Object.hasOwn(ISSUES, key) ? ISSUES[key] : '';
}
