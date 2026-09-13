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
    // A larger archive supplies context, not a compulsory number of paid calls.
    // MAIN may return its own bounded branchAxes; this is only a small fallback.
    return { memoryCount: ids.size, axes: ids.size ? ['decision'] : [], total: ids.size ? 3 : 0 };
}

export function normalizeButterflyBranchAxes(value) {
    if (value === undefined) return ['decision'];
    if (!Array.isArray(value) || value.length > BUTTERFLY_PRIMARY_AXES.length
        || value.some(axis => typeof axis !== 'string' || !BUTTERFLY_PRIMARY_AXES.includes(axis)))
        throw butterflyValidationError('worldSpec');
    return [...new Set(value)];
}

export function butterflyPlanPrompt(memoryBank) {
    const plan = buildButterflyPlan(memoryBank);
    return plan.total
        ? '先写 MAIN，并在 MAIN.branchAxes 中选择本次值得展开的分歧维度；数量由内容决定，可为空。无需遍历所有维度，也不随记忆条数增加节点。每次只写当前一段，最后 OMEGA 收尾。'
        : '当前没有可用档案锚点，不生成观测节点。';
}

// Retained export for compatibility. These are not generation minima.
export const BUTTERFLY_LIMITS = Object.freeze({ monologueHan: 0, monologueFirstPerson: 0, interventionHan: 0, omegaHan: 0, omegaFirstPerson: 0, systemHan: 0 });
export const BUTTERFLY_GENERATION_CONTRACT = `【节点完整性契约】
MAIN 与普通分歧的 monologue 是角色在该世界的完整心声，intervention 是现世角色读后的回应；短句也可以。不要求固定汉字数、第一人称次数或指定文学用词。
systemNote 给出易读、完整的简短观测结论，不用凑算法术语或固定判定句。
Ω 的 label 含“观测点 Ω”或“TRUE ENDING”；monologue 为空，intervention 回应已经看过的内容，systemNote 负责收尾。没有普通分歧时也可以回到现世，不虚构额外世界，不强迫告白或永世相守。
worldSpec 的 era、identity、occupation、location、keyDecision、encounterWithUser、bondWithUser、finalFate 八字段均为具体文本，不用“同上/不变/未知”；thirdPartyRomance 严格为 false。不得虚构第三方恋爱、婚姻或前任；节点标题、世界条件与独白均不可重复。`;

const ISSUES = Object.freeze({
    relationship: '本段出现明确的前任或第三方恋爱、婚姻情节，请只调整这一处；两人的旁白和省略主语不需要反复补“我与你”。',
    unique: '当前节点与已通过节点重复，或 primaryAxis 不等于本槽位指定维度。请只重写当前节点。',
    systemNote: 'systemNote 缺少可读结论，请补完当前字段；没有字数或术语配额。',
    monologue: 'monologue 缺少可读正文，请补完当前字段；没有字数或人称次数配额。',
    intervention: 'intervention 缺少可读回应，请补完当前字段；没有字数配额。',
    omega: '观测点 Ω 的标题、空 monologue 或结尾正文不完整；没有告白字数要求。',
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
