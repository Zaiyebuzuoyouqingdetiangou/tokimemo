// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as ui_overlay from '../ui/overlay.js';

export function compactAchievementsExisting(session) {
    return core_evidence.evenlySample(Array.isArray(session?.entries) ? session.entries : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 50),
        title: core_text.normalizeText(item?.title, 100),
        category: core_text.normalizeText(item?.category, 60),
        tier: core_text.normalizeText(item?.tier, 20),
        unlocked: !!item?.unlocked,
        unlockedAt: core_text.normalizeText(item?.unlockedAt, 40),
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    }));
}

export function achievementsPrompt(context, memoryBank, previousSession = null, sourceMemoryIds = null) {
    const archiveBlock = previousSession
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 48);
    return `${generation_prompts.promptSafetyBoundary(context, '档案室 / 成就库')}
本请求只负责从本次增量档案中补充新的关系与共同经历里程碑。旧成就由本地原样保留；不要重写描述、改名或换措辞复述。
UNTRUSTED_INCREMENTAL_ACHIEVEMENT_ARCHIVE_JSON:
${archiveBlock}
EXISTING_ACHIEVEMENTS_JSON:
${JSON.stringify(compactAchievementsExisting(previousSession), null, 2)}

严格输出：
{
  "title":"成就库",
  "entries":[{
    "id":"ACH01",
    "title":"成就名",
    "description":"一两句说明",
    "category":"关系 / 日常 / 事件 / 特别",
    "tier":"bronze",
    "unlocked":true,
    "unlockedAt":"YYYY/MM/DD、MM/DD 或 已解锁",
    "sourceMemoryIds":["M001"],
    "sourceMemoryAnchor":"真实档案锚点",
    "hint":"未解锁时才给简短提示"
  }]
}

要求：
- 不设固定数量。优先整理真正值得纪念的已发生里程碑，并可加入少量自然的未解锁目标；不要为了填满页面制造普通事件。
- 已解锁成就必须能由当前档案直接证明，必须提供有效 sourceMemoryIds + sourceMemoryAnchor；不得把未来推演、模拟剧场或设定推导当成已解锁。
- 未解锁成就只能表示“可能在未来达到的目标/关系节点”，不能写成已经发生；sourceMemoryIds/sourceMemoryAnchor 可以为空，hint 只给方向，不剧透具体未来事实。
- EXISTING_ACHIEVEMENTS_JSON 是不可信旧缓存索引，只用于避免重复和保留已解锁历史；不得把它本身当成证据。
- tier 只能是 bronze / silver / gold / hidden。hidden 适合需要隐藏名称感的特殊目标，但 title 仍需提供给本地 UI。
- 初次生成通常 4～8 项；增量更新只返回 0～8 个由 incrementalMemoryIds 支撑的新成就或刚刚解锁的旧目标，没有新里程碑就返回空 entries。只输出 JSON。`;
}

export function normalizeAchievements(data, memoryBank, { allowPartial = false, sourceMemoryIds = null } = {}) {
    const allowedTiers = new Set(['bronze', 'silver', 'gold', 'hidden']);
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    const entries = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const title = core_text.normalizeText(item?.title, 100);
        const description = core_text.normalizeText(item?.description, 900);
        const unlocked = item?.unlocked === true;
        if (!title || !description) return null;
        let sourceMemoryIds = [];
        let sourceMemoryAnchor = '';
        if (unlocked) {
            const reference = core_evidence.normalizeMemoryReference(
                item?.sourceMemoryIds,
                item?.sourceMemoryAnchor,
                `${title}\n${description}`,
                memoryBank,
                1,
            );
            sourceMemoryIds = reference.sourceMemoryIds;
            sourceMemoryAnchor = reference.sourceMemoryAnchor;
            if (!sourceMemoryIds.length || !sourceMemoryAnchor) return null;
        }
        const tierRaw = core_text.normalizeText(item?.tier, 20).toLowerCase();
        return {
            id: core_text.safeId(item?.id, `ACH${String(index + 1).padStart(2, '0')}`),
            title,
            description,
            category: core_text.normalizeText(item?.category, 60) || '特别',
            tier: allowedTiers.has(tierRaw) ? tierRaw : 'bronze',
            unlocked,
            unlockedAt: unlocked ? (core_text.normalizeText(item?.unlockedAt, 40) || '已解锁') : '',
            sourceMemoryIds,
            sourceMemoryAnchor,
            hint: unlocked ? '' : (core_text.normalizeText(item?.hint, 500) || '继续积累新的重要回忆。'),
        };
    }).filter(item => item && (!sourceMemoryIds || (item.unlocked && core_incremental.usesIncrementalMemoryId(item.sourceMemoryIds, sourceMemoryIds))));
    if (!allowPartial && !entries.length) throw new Error('成就库没有生成可用条目。');
    return {
        kind: core_constants.MODE.ACHIEVEMENTS,
        title: core_text.normalizeText(data?.title, 100) || '成就库',
        entries,
    };
}

export function achievementMergeKey(item) {
    const title = core_text.normalizeText(item?.title, 100).trim().toLowerCase();
    return title || `${core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',')}|${core_text.normalizeText(item?.sourceMemoryAnchor, 160).toLowerCase()}`;
}

export function achievementMergeKeys(item) {
    const keys = [`title|${achievementMergeKey(item)}`];
    if (item?.unlocked) {
        const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
        const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160);
        if (ids && anchor) keys.push(`evidence|${ids}|${anchor}`);
    }
    return keys;
}

export function mergeAchievementsIncremental(previous, fresh, memoryBank) {
    if (!previous?.entries?.length) return fresh;
    const merged = previous.entries.map(item => structuredClone(item));
    const indexByKey = new Map();
    merged.forEach((item, index) => achievementMergeKeys(item).forEach(key => indexByKey.set(key, index)));
    for (const item of fresh.entries || []) {
        const keys = achievementMergeKeys(item);
        const existingIndex = keys.map(key => indexByKey.get(key)).find(index => index !== undefined);
        if (existingIndex === undefined) {
            keys.forEach(key => indexByKey.set(key, merged.length));
            merged.push(structuredClone(item));
            continue;
        }
        const old = merged[existingIndex];
        if (!old.unlocked && item.unlocked) {
            merged[existingIndex] = { ...old, ...item, id: old.id || item.id };
            achievementMergeKeys(merged[existingIndex]).forEach(key => indexByKey.set(key, existingIndex));
        }
    }
    const seenIds = new Set();
    let serial = 1;
    const dedupedIds = merged.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map(item => {
        let id = core_text.safeId(item?.id, '');
        while (!id || seenIds.has(id)) id = `ACH${String(serial++).padStart(2, '0')}`;
        seenIds.add(id);
        return { ...item, id };
    });
    return normalizeAchievements({ title: fresh.title || previous.title || '成就库', entries: dedupedIds }, memoryBank);
}

export async function generateAchievementsWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.ACHIEVEMENTS, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const fresh = await generation_client.requestValidatedSegment(
        achievementsPrompt(context, memoryBank, previous, sourceMemoryIds),
        previous ? '成就库 · 正在从新增档案补充里程碑…' : '成就库 · 正在整理已解锁与未解锁里程碑…',
        { maxTokens: 6000, temperature: 0.4, context, origin, taskKey: `${taskKey}:achievements`, mode: core_constants.MODE.ACHIEVEMENTS, background: true },
        raw => normalizeAchievements(raw, memoryBank, { allowPartial: !!previous, sourceMemoryIds: previous ? sourceMemoryIds : null }),
    );
    const merged = mergeAchievementsIncremental(previous, fresh, memoryBank);
    const added = Math.max(0, merged.entries.length - (previous?.entries?.length || 0));
    return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function renderAchievements() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.ACHIEVEMENTS) return;
    const readOnly = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (readOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle('成就库');
    const unlocked = session.entries.filter(item => item.unlocked);
    const locked = session.entries.filter(item => !item.unlocked);
    const tierIcon = tier => ({
        bronze: 'fa-medal',
        silver: 'fa-star',
        gold: 'fa-trophy',
        hidden: 'fa-question',
    })[tier] || 'fa-medal';
    const cards = (items, lockedState) => items.map(item => `<article class="rmt-achievement-card ${lockedState ? 'locked' : 'unlocked'}">
      <div class="rmt-achievement-icon"><i class="fa-solid ${tierIcon(item.tier)}"></i></div>
      <div class="rmt-achievement-copy">
        <div class="rmt-achievement-title"><b>${core_text.esc(item.title)}</b><span>${core_text.esc(item.category)}</span></div>
        <p>${core_text.esc(item.description)}</p>
        <small>${lockedState ? core_text.esc(item.hint) : core_text.esc(item.unlockedAt || '已解锁')}</small>
      </div>
    </article>`).join('');
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-achievements">
      <div class="rmt-achievements-head"><div><h2>${core_text.esc(session.title || '成就库')}</h2><span>${unlocked.length} / ${session.entries.length}</span></div>${readOnly ? '' : '<button type="button" class="rmt-btn" data-rmt-action="regenerate">增量追加成就</button>'}</div>
      <section class="rmt-achievement-section"><h3>已解锁 <span>${unlocked.length}</span></h3><div class="rmt-achievement-grid">${unlocked.length ? cards(unlocked, false) : '<div class="rmt-heart-empty">还没有已解锁成就。</div>'}</div></section>
      <section class="rmt-achievement-section"><h3>未解锁 <span>${locked.length}</span></h3><div class="rmt-achievement-grid">${locked.length ? cards(locked, true) : '<div class="rmt-heart-empty">目前没有未解锁目标。</div>'}</div></section>
    </div>`;
}
