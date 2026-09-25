// 自动留忆模块注册表。只描述合同，不发请求，也不读聊天。
// autoEligible 表示代码已经完成适配，不能由用户勾选改写。
// R0 全部为 false：勾选只会被存成偏好，不会进入运行候选。

const HISTORICAL = 'historical';
const COLLECTION = 'collection';

function inertPlan() {
    // 未适配模块没有可冻结的计划。null 表示本轮不生成，也不能解锁成就。
    return Promise.resolve(null);
}

function inertPendingSteps(_result, plan) {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    return steps.filter(step => step && step.status !== 'completed');
}

function inertComplete() {
    // 信封与成就的硬闸门。未适配时永远未完成，避免“请求发过”被当成成果。
    return false;
}

function stepsComplete(_result, plan) {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    return steps.length > 0 && steps.every(step => step?.status === 'completed');
}

function defineModule(spec) {
    return Object.freeze({
        ...spec,
        prerequisites: Object.freeze([...spec.prerequisites]),
        plan: inertPlan,
        pendingSteps: inertPendingSteps,
        isComplete: spec.isComplete || inertComplete,
    });
}

const MODULES = Object.freeze([
    defineModule({
        id: 'album', title: '回忆相簿', contentKind: HISTORICAL, batch: 2, inDrawPool: true,
        description: '先生成条目索引和关系快照，再写完本轮全部已解锁条目的评论。只有索引不算完成。',
        normalRequestEstimate: '2 + ceil(U / 3)', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'adv', title: 'ADV EVENT', contentKind: COLLECTION, batch: 4, inDrawPool: true,
        description: '先冻结本轮事件索引，再写完索引里的全部事件正文。不能停在标题，也不能只挑一篇。',
        normalRequestEstimate: '1 + ceil(E / 6)', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'room', title: '他的房间', contentKind: COLLECTION, batch: 2, inDrawPool: true,
        description: '生成房间结构并补完必需文字槽位。修复次数有上限，未完成时不揭晓。',
        normalRequestEstimate: '1 + ceil(S / 6) + 0～2', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'items', title: '他的物品', contentKind: COLLECTION, batch: 2, inDrawPool: true,
        description: '在已有且版本匹配的房间上，生成物品结构和全部必需台词。',
        normalRequestEstimate: '通常 2', prerequisites: ['room'], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'phone', title: '他的私人终端', contentKind: COLLECTION, batch: 3, inDrawPool: true,
        description: '先冻结 App 目录，再生成目录中的全部 App。目录本身不产生成就。',
        normalRequestEstimate: '首次 1 + A；增量 1 + M', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'inbox', title: '你的邮箱', contentKind: COLLECTION, batch: 1, inDrawPool: true,
        description: '有信件计划时一次写完本轮信件。没有计划则跳过，不生成信封或成就。',
        normalRequestEstimate: '0～1', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成', isComplete: stepsComplete,
    }),
    defineModule({
        id: 'cabinet', title: '两个人的陈列柜', contentKind: HISTORICAL, batch: 1, inDrawPool: true,
        description: '生成或刷新本轮陈列柜成果。通过校验并保存后才算完成。',
        normalRequestEstimate: '1', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成', isComplete: stepsComplete,
    }),
    defineModule({
        id: 'travel', title: '他的出行路线', contentKind: HISTORICAL, batch: 2, inDrawPool: true,
        description: '生成地图或旅行结构；若计划还要求正文，正文完成前不揭晓。',
        normalRequestEstimate: '1～2', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'ending', title: '结局与后日谈', contentKind: COLLECTION, batch: 4, inDrawPool: true,
        description: '冻结全部可用路线并写完路线正文，需要时再做一次告白扫描。不能缩成单路线。',
        normalRequestEstimate: '首次 1 + A + C', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'calendar', title: '两个人的日历', contentKind: HISTORICAL, batch: 1, inDrawPool: true,
        description: '生成或刷新本轮日历成果。通过校验并保存后才算完成。',
        normalRequestEstimate: '1', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成', isComplete: stepsComplete,
    }),
    defineModule({
        id: 'relations', title: '人际庭园', contentKind: HISTORICAL, batch: 1, inDrawPool: true,
        description: '生成或刷新本轮关系成果。通过校验并保存后才算完成。',
        normalRequestEstimate: '1', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成', isComplete: stepsComplete,
    }),
    defineModule({
        id: 'heart', title: '角色互动', contentKind: COLLECTION, batch: 5, inDrawPool: true,
        description: '必须先冻结基础对话、日常一格、萤火虫、后日谈和四季内容，并全部跑完后才算一份成果。',
        normalRequestEstimate: '约 8～13 以上', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'butterfly', title: '蝴蝶效应', contentKind: COLLECTION, batch: 4, inDrawPool: true,
        description: '首次写完 MAIN、全部分支和 Ω。已有进度的增量只补本轮新增分歧，不把首次生成直接放进自动池。',
        normalRequestEstimate: '2 + B + P，约 3～11', prerequisites: [], supportsIncremental: true,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'pastLives', title: '前世今生', contentKind: COLLECTION, batch: 4, inDrawPool: true,
        description: '每次只完成一篇：引子、全部卷宗、今生回响和落款。这是新篇，不是档案差量。',
        normalRequestEstimate: '2 + D + P，约 3～9', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'themeSong', title: '角色印象曲', contentKind: COLLECTION, batch: 2, inDrawPool: true,
        description: '生成一首完整歌曲。当前自动入口还没有默认计划，完成前不能抽中。',
        normalRequestEstimate: '每首 1', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'bedtime', title: '睡前故事', contentKind: COLLECTION, batch: 2, inDrawPool: true,
        description: '按冻结计划生成一章完整故事。必须事先写明是新故事还是指定故事的续章。',
        normalRequestEstimate: '每章 1', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'timeEcho', title: '时空回响', contentKind: COLLECTION, batch: 2, inDrawPool: true,
        description: '生成一篇完整回声。当前还没有自动入口，补上之前不能抽中。',
        normalRequestEstimate: '每篇 1', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '暂不可自动生成',
    }),
    defineModule({
        id: 'achievements', title: '成就', contentKind: COLLECTION, batch: 0, inDrawPool: false,
        description: '成就不再单独抽签，也不再单独请求。它只作为其他模块最后一次生成的末包。',
        normalRequestEstimate: '0（不单独请求）', prerequisites: [], supportsIncremental: false,
        autoEligible: false, achievementMerged: false, unavailableReason: '已移出抽签池',
    }),
]);

export function listAutoMemoryModules() {
    return MODULES;
}

export function autoMemoryModuleById(id) {
    return MODULES.find(item => item.id === id) || null;
}

export function isAutoMemoryDrawModule(id) {
    const item = autoMemoryModuleById(id);
    return !!item && item.inDrawPool === true;
}

// 运行候选 = 用户选中 ∩ 未排除 ∩ 已适配 ∩ 成就末包已接入 ∩ 仍在抽签池。
// 偏好数组本身不能把未适配模块放进候选。
export function autoMemoryRuntimeCandidates(preferredIds, excludedIds = []) {
    const preferred = Array.isArray(preferredIds) ? preferredIds : [];
    const excluded = new Set(Array.isArray(excludedIds) ? excludedIds : []);
    const seen = new Set();
    const selected = [];
    for (const id of preferred) {
        const item = autoMemoryModuleById(id);
        if (!item || seen.has(id) || excluded.has(id)) continue;
        if (!item.inDrawPool || item.autoEligible !== true || item.achievementMerged !== true) continue;
        seen.add(id);
        selected.push(id);
    }
    return selected;
}
