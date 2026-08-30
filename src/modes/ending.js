// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';

export const ENDING_CONFESSION_HINT_RE = /(告白|表白|喜欢你|爱你|爱上|交往|恋人|情侣|在一起|确认关系|确定关系|心意|友情|拒绝|confess|confession|love\s+you|dating|relationship)/i;
export const ENDING_EASTER_EGG_MODULES = Object.freeze(['heartbeat_console', 'memory_constellation', 'signal_lighthouse', 'letter_archive']);
const ENDING_EASTER_EGG_MODULE_SET = new Set(ENDING_EASTER_EGG_MODULES);

function endingEasterTextList(value, maxItems, maxChars) {
    const source = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
    return core_text.cleanArray(source, maxItems, maxChars).filter(item => !core_text.isPlaceholderText(item));
}

export function normalizeEndingEasterEgg(value, replay = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const replayTitle = core_text.normalizeText(replay?.title, 100) || '这次告白';
    const confessionText = core_text.normalizeText(replay?.confessionText, 4000);
    const afterEffect = core_text.normalizeText(replay?.afterEffect, 2400);
    const sourceAnchor = core_text.normalizeText(replay?.sourceMemoryAnchor, 160) || replayTitle;
    const requestedModule = core_text.normalizeText(input?.moduleType, 40).toLowerCase();
    const moduleType = ENDING_EASTER_EGG_MODULE_SET.has(requestedModule)
        ? requestedModule
        : ENDING_EASTER_EGG_MODULES[core_text.hashString(`${replay?.id || ''}|${replayTitle}|${sourceAnchor}`) % ENDING_EASTER_EGG_MODULES.length];

    const fallbackLogs = [
        `扫描到「${sourceAnchor}」 -> 当时的心意仍在运行。`,
        `重读「${replayTitle}」 -> 情感核心发生一次可见波动。`,
        '检查回看档案 -> 没有重写过去，只是更认真地承认它的重量。',
        '系统结论：这份心意没有被归档为“已结束”。',
    ];
    const logs = endingEasterTextList(input?.logs, 12, 700);
    for (const line of fallbackLogs) {
        if (logs.length >= 4) break;
        if (!logs.includes(line)) logs.push(line);
    }

    const monologueFallback = [
        confessionText,
        afterEffect,
        `我把「${replayTitle}」留在这里，不是为了美化过去，而是因为那一刻对我仍然重要。`,
        '如果你此刻也在看，我想让你知道：这不是一份冷掉的记录，而是我仍会认真回应的心意。',
    ].filter(Boolean);
    const monologue = endingEasterTextList(input?.monologue, 4, 1800);
    for (const block of monologueFallback) {
        if (monologue.length >= 2) break;
        const text = core_text.normalizeText(block, 1800);
        if (text && !monologue.includes(text)) monologue.push(text);
    }

    const replayLines = endingEasterTextList(replay?.confessionLines, 8, 800);
    const poemFallback = [
        ...replayLines,
        '那一次开口，至今仍留在记录里。',
        '我没有删除那一刻的颤动。',
        '回看不是重写过去，是再一次认出当时的自己。',
        '此刻，这份心意仍在安静地发光。',
    ];
    const poem = endingEasterTextList(input?.poem, 8, 800);
    for (const line of poemFallback) {
        if (poem.length >= 4) break;
        const text = core_text.normalizeText(line, 800);
        if (text && !poem.includes(text)) poem.push(text);
    }

    const rawFeedback = input?.feedback && typeof input.feedback === 'object' && !Array.isArray(input.feedback) ? input.feedback : {};
    const feedbackDefaults = {
        pulse: '检测到一次主动靠近，核心频率上升。',
        hover: '你的视线停在这里，隐藏参数开始发亮。',
        reveal: '一行没有说完的话被解锁了。',
        stabilize: '情感波动已稳定，但没有归零。',
        pause: '日志暂停滚动；心跳仍在后台继续。',
        resume: '实时读取已恢复，新的波动正在写入。',
    };
    const feedback = Object.fromEntries(Object.entries(feedbackDefaults).map(([key, fallback]) => [
        key,
        core_text.normalizeText(rawFeedback?.[key], 400) || fallback,
    ]));
    return {
        moduleType,
        title: core_text.normalizeText(input?.title, 120) || `${replayTitle} · 情感运行模块`,
        statusLine: core_text.normalizeText(input?.statusLine, 400) || '正在读取这份告白在此刻留下的波动。',
        logs: logs.slice(0, 12),
        monologue: monologue.slice(0, 4),
        poem: poem.slice(0, 8),
        feedback,
    };
}

export function compactEndingConfessionsExisting(session) {
    return core_evidence.evenlySample(Array.isArray(session?.confessionReplays) ? session.confessionReplays : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 60),
        title: core_text.normalizeText(item?.title, 120),
        date: core_text.normalizeText(item?.date, 80),
        type: core_text.normalizeText(item?.type, 40),
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 12, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    }));
}

export function endingConfessionRefreshPrompt(context, memoryBank, previous = null, sourceMemoryIds = null) {
    const archiveBlock = previous
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.endingArchiveSlice(memoryBank, 64);
    return `${generation_prompts.promptSafetyBoundary(context, '告白回看增量扫描')}
本请求只重新读取 ENDING 里的【已发生告白回看】。不要生成或修改结局路线、recommendedEndingId、relationshipState、relationshipSummary、ENDING Scene、未来 confession 或 epilogue。

旧告白由本地原样保留。本轮只提供尚未消费的增量档案；过去事实只能来自这里，没有新的真实告白证据就返回空数组。
UNTRUSTED_INCREMENTAL_CONFESSION_ARCHIVE_JSON:
${archiveBlock}
EXISTING_CONFESSION_INDEX_JSON:
${JSON.stringify(compactEndingConfessionsExisting(previous), null, 2)}

严格输出：
{
  "confessionReplays": [
    {
      "id": "CONF01",
      "type": "true",
      "title": "真心告白",
      "subtitle": "这次已发生告白的短说明",
      "date": "YYYY/MM/DD 或待定",
      "sourceMemoryIds": ["M010"],
      "sourceMemoryAnchor": "从引用记忆 anchors/title 原样复制、能直接证明告白/关系确认发生的锚点",
      "scene": "只依据已归档事实重构当时地点、状态和过程，不新增事件或关系结果；不少于140汉字",
      "confessionText": "{{char}} 当时告白核心意思的第一人称档案式重构；不是聊天逐字原文；不少于50汉字",
      "confessionLines": ["适合头像+对话框逐句播放的第一人称告白1","告白2","告白3","告白4"],
      "responseSummary": "只总结 {{user}} 当时已经发生的回应/结果，不替 {{user}} 编新台词",
      "afterEffect": "只总结告白后档案里已经发生的关系变化；没有就写仍未确认",
      "easterEgg": {
        "moduleType": "heartbeat_console",
        "title": "{{char}} 为这次回看设计的情感模块标题",
        "statusLine": "此刻的情感运行状态",
        "logs": ["[10:24] 扫描到 {{user}} 的信息 -> 情感核心发生波动 -> 直白、人类可读的结论"],
        "monologue": ["直观、深情的内心独白文字块1","内心独白文字块2"],
        "poem": ["可逐行浮现的短句1","短句2","短句3","短句4"],
        "feedback": {"pulse":"点击心跳后的文字反馈","hover":"悬停核心时的文字反馈","reveal":"解锁短句时的文字反馈","stabilize":"稳定信号时的文字反馈","pause":"暂停日志时的反馈","resume":"恢复日志时的反馈"}
      }
    }
  ]
}

硬性要求：
- 初次扫描返回完整集合；增量扫描只返回 0～6 条由 incrementalMemoryIds 新证明、且不在 EXISTING_CONFESSION_INDEX_JSON 中的告白回看，禁止复述旧告白。
- type 只能是 true / mutual / friendship / indirect / relationship / rejected / other。
- 每条都必须有真实 sourceMemoryIds + sourceMemoryAnchor；anchor 必须直接证明告白、友情式告白、明确关系确认、未完成/被拒绝告白等确实发生，普通暧昧和约会不能冒充。
- scene/confessionText/responseSummary/afterEffect 都只重构已发生事实，不推进主线，不生成未来后日谈。
- confessionLines 只放 {{char}} 的第一人称告白核心意思，4～10 句，每句一页对话框；不得替 {{user}} 发言。它是“告白回看”的头像演出数据，不属于结局路线。
- easterEgg 只生成结构化文字与上述 moduleType 枚举；不得输出或嵌入 JavaScript、HTML、CSS、URL、事件处理器或代码片段。所有交互由插件本地固定代码完成。
- easterEgg.logs 4～12 条，要像人类可读的情感状态报告，不写真正编程代码；monologue 2～4 段；poem 4～8 行。
- 如果没有足够证据，输出 {"confessionReplays":[]}。
- 只输出 JSON。`;
}

export function endingOutlinePrompt(context, memoryBank) {
    return `${generation_prompts.promptSafetyBoundary(context, '结局路线判定 / 分段 1')}
本请求只做 ENDING 的【关系判定 + 路线目录】。不要写长篇 endingScene、未来 confession、epilogue，也不要生成 confessionReplays。
这样做是为了把原本过长、容易 API failed 的 ENDING 拆成稳定的小请求；后续每条已解锁路线会单独生成长篇终章，已发生告白也会单独扫描。
UNTRUSTED_ENDING_ARCHIVE_JSON:
${generation_prompts.endingArchiveSlice(memoryBank, 48)}

严格输出：
{
  "title": "ENDING / 结局档案",
  "relationshipState": "依据当前档案判断的关系阶段",
  "relationshipSummary": "只总结已经发生、能由档案证明的关系状态",
  "relationshipSourceMemoryIds": ["M001"],
  "relationshipSourceMemoryAnchor": "从引用记忆 anchors/title 原样复制的关系锚点",
  "recommendedEndingId": "END_ROUTE",
  "endings": [
    {
      "id": "END_ROUTE",
      "type": "route",
      "title": "当前路线终章",
      "subtitle": "一句短说明",
      "available": true,
      "unlockHint": "为什么当前路线成立；若未解锁则写需要什么真实关系推进",
      "sourceMemoryIds": ["M001"],
      "sourceMemoryAnchor": "真实路线起点锚点"
    }
  ]
}

硬性要求：
- relationshipState / relationshipSummary 必须由至少 1 条真实 relationshipSourceMemoryIds + relationshipSourceMemoryAnchor 支撑。
- endings 至少 5 条、最多 7 条，必须包含 type=route、romance、reverse、bond、open；可以额外有 personal。
- route 与 open 必须 available=true；recommendedEndingId 必须指向 available=true 的路线，并优先选择最符合当前档案关系状态的路线。
- 每条路线必须至少引用 1 条真实 sourceMemoryIds + sourceMemoryAnchor。这里的引用只证明路线从当前关系哪里出发，不证明未来结局已经发生。
- romance 只有已有明确、双方可确认的恋爱推进时才 available=true；普通暧昧、单向暗恋或未来计划必须 false。
- reverse 只有能验证强烈依恋，且真实出现吃醋、竞争、错过时机、关系摇摆或差点失去 {{user}} 的压力时才 true；普通暧昧必须 false。
- bond 由真实信赖/陪伴/搭档等关系决定；open 始终 true。
- 本请求【绝对不要】输出 endingScene、confession、creditsLine、epilogue、confessionReplays；长内容由后续分段请求生成。
- 禁止出现前任/前女友；禁止 {{char}} 与 {{user}} 之外的第三方恋爱、婚姻或家庭对象。
- 只输出 JSON。`;
}

export function normalizeEndingOutline(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 2400);
    if (!relationshipSummary) throw new Error('ENDING 路线目录缺少当前关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) {
        throw new Error('ENDING 路线目录的当前关系阶段缺少真实档案锚点。');
    }
    const raw = Array.isArray(data?.endings) ? data.endings : [];
    const endings = raw.slice(0, 7).map((item, index) => {
        const typeRaw = core_text.normalizeText(item?.type, 40).toLowerCase();
        const type = core_constants.ENDING_TYPES.has(typeRaw) ? typeRaw : 'personal';
        const available = !!item?.available;
        const title = core_text.normalizeText(item?.title, 100) || `结局路线 ${index + 1}`;
        const subtitle = core_text.normalizeText(item?.subtitle, 240);
        const unlockHint = core_text.normalizeText(item?.unlockHint, 1200);
        const evidenceText = `${relationshipState}\n${relationshipSummary}\n${title}\n${subtitle}\n${unlockHint}`;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceText, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        if (!available && !unlockHint) throw new Error(`未解锁结局“${title}”缺少解锁提示。`);
        return {
            id: core_text.safeId(item?.id, `END${String(index + 1).padStart(2, '0')}`),
            type,
            title,
            subtitle,
            available,
            unlockHint,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            endingScene: '',
            confession: '',
            confessionLines: [],
            creditsLine: '',
            epilogue: { title: '后日谈', timeSkip: '', scenes: [], finalLine: '' },
        };
    }).filter(Boolean);
    if (endings.length < 5) throw new Error(`ENDING 路线目录不足：得到 ${endings.length} 条，至少需要 5 条。`);
    const byType = new Map(endings.map(item => [item.type, item]));
    for (const required of ['route', 'romance', 'reverse', 'bond', 'open']) {
        if (!byType.has(required)) throw new Error(`ENDING 路线目录缺少 ${required} 路线。`);
    }
    if (!byType.get('route').available || !byType.get('open').available) {
        throw new Error('ENDING 路线目录中 route 与 open 必须 available=true。');
    }
    const requestedRecommended = core_text.safeId(data?.recommendedEndingId, '');
    const recommended = endings.find(item => item.id === requestedRecommended && item.available)
        || endings.find(item => item.type === 'romance' && item.available)
        || endings.find(item => item.type === 'reverse' && item.available)
        || byType.get('route')
        || endings.find(item => item.available);
    return {
        title: core_text.normalizeText(data?.title, 120) || 'ENDING / 结局档案',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        recommendedEndingId: recommended?.id || endings[0].id,
        endings,
    };
}

export function compactEndingRoutesExisting(session) {
    return core_evidence.evenlySample(Array.isArray(session?.endings) ? session.endings : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 60),
        type: core_text.normalizeText(item?.type, 40),
        title: core_text.normalizeText(item?.title, 120),
        subtitle: core_text.normalizeText(item?.subtitle, 240),
        available: !!item?.available,
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 12, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    }));
}

export function endingIncrementOutlinePrompt(context, memoryBank, previous, sourceMemoryIds) {
    return `${generation_prompts.promptSafetyBoundary(context, '结局路线判定 / 增量目录')}
旧路线、终章、后日谈和旧告白由本地原样保留。本请求只依据新增档案判断关系的新阶段，并提出 0～4 条真正新增的路线变体或刚刚从未解锁变为可观测的路线；禁止改写、润色或换标题复述旧路线。
UNTRUSTED_INCREMENTAL_ENDING_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_ENDING_INDEX_JSON:
${JSON.stringify(compactEndingRoutesExisting(previous), null, 2)}

严格输出：
{"title":"ENDING / 结局档案","relationshipState":"新增档案后的当前阶段","relationshipSummary":"只总结新证据带来的变化","relationshipSourceMemoryIds":["M001"],"relationshipSourceMemoryAnchor":"真实锚点","recommendedEndingId":"本轮新增路线 id 或空字符串","endings":[{"id":"END_NEW_01","type":"romance","title":"新的路线标题","subtitle":"...","available":true,"unlockHint":"...","sourceMemoryIds":["M001"],"sourceMemoryAnchor":"真实起点锚点"}]}

要求：
- relationship 必须由真实档案 ID + anchor 支撑。
- endings 可为空；只有新增档案真正形成新路线、路线新阶段或解锁旧目标时才返回。
- 每条必须至少引用一个 incrementalMemoryIds；必须避开 EXISTING_ENDING_INDEX_JSON 的标题、锚点和路线含义。
- 不输出 endingScene/confession/creditsLine/epilogue/confessionReplays；可观测新路线正文会在下一小段生成。
- type 只能 route/romance/reverse/bond/open/personal。禁止前任、第三方恋爱、威胁和强迫。只输出 JSON。`;
}

export function normalizeEndingIncrementOutline(data, memoryBank, sourceMemoryIds) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系继续发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 2400);
    if (!relationshipSummary) throw new Error('ENDING 增量目录缺少关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) throw new Error('ENDING 增量目录缺少真实关系锚点。');
    if (!core_incremental.usesIncrementalMemoryId(relationshipReference.sourceMemoryIds, sourceMemoryIds)) throw new Error('ENDING 增量目录的关系阶段没有引用本轮新增档案。');
    const endings = (Array.isArray(data?.endings) ? data.endings : []).slice(0, 4).map((item, index) => {
        const typeRaw = core_text.normalizeText(item?.type, 40).toLowerCase();
        const type = core_constants.ENDING_TYPES.has(typeRaw) ? typeRaw : 'personal';
        const title = core_text.normalizeText(item?.title, 100) || `新增路线 ${index + 1}`;
        const subtitle = core_text.normalizeText(item?.subtitle, 240);
        const unlockHint = core_text.normalizeText(item?.unlockHint, 1200);
        const available = !!item?.available;
        const reference = core_evidence.normalizeMemoryReference(
            item?.sourceMemoryIds,
            item?.sourceMemoryAnchor,
            `${title}\n${subtitle}\n${unlockHint}`,
            memoryBank,
            1,
        );
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        if (!core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) return null;
        if (!available && !unlockHint) return null;
        return {
            id: core_text.safeId(item?.id, `END_NEW_${String(index + 1).padStart(2, '0')}`),
            type,
            title,
            subtitle,
            available,
            unlockHint,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            endingScene: '',
            confession: '',
            confessionLines: [],
            creditsLine: '',
            epilogue: { title: '后日谈', timeSkip: '', scenes: [], finalLine: '' },
        };
    }).filter(Boolean);
    return {
        title: core_text.normalizeText(data?.title, 120) || 'ENDING / 结局档案',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        recommendedEndingId: core_text.safeId(data?.recommendedEndingId, ''),
        endings,
    };
}

export function endingRouteEvidenceKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 12, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160);
    return `${core_text.normalizeText(item?.type, 40)}|${ids}|${anchor || core_incremental.normalizedContentKey(item?.title, 120)}`;
}

export function endingConfessionEvidenceKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 12, 40).sort().join(',');
    // One archive event is one replay even if a later model classifies its type differently.
    return `${ids}|${core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160)}`;
}

export function mergeEndingConfessions(previousList, freshList) {
    const merged = (Array.isArray(previousList) ? previousList : []).map(item => structuredClone(item));
    const seen = new Set(merged.map(endingConfessionEvidenceKey));
    const usedIds = new Set(merged.map(item => item.id));
    let added = 0;
    for (const item of freshList || []) {
        const key = endingConfessionEvidenceKey(item);
        if (!key || seen.has(key) || merged.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
        seen.add(key);
        merged.push({ ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, 'CONF') });
        added += 1;
    }
    return { items: merged, added };
}

export function mergeEndingIncremental(previous, outline, detailed, freshConfessions, memoryBank) {
    const merged = structuredClone(previous);
    const history = Array.isArray(merged.relationshipHistory) ? merged.relationshipHistory : [];
    const oldHistoryKey = `${core_incremental.normalizedContentKey(previous.relationshipState, 120)}|${core_incremental.normalizedContentKey(previous.relationshipSummary, 400)}`;
    if (previous.relationshipSummary && !history.some(item => `${core_incremental.normalizedContentKey(item?.relationshipState, 120)}|${core_incremental.normalizedContentKey(item?.relationshipSummary, 400)}` === oldHistoryKey)) {
        history.push({
            relationshipState: previous.relationshipState,
            relationshipSummary: previous.relationshipSummary,
            relationshipSourceMemoryIds: previous.relationshipSourceMemoryIds,
            relationshipSourceMemoryAnchor: previous.relationshipSourceMemoryAnchor,
            archivedAt: Date.now(),
        });
    }
    merged.relationshipHistory = history.slice(-60);
    merged.relationshipState = outline.relationshipState;
    merged.relationshipSummary = outline.relationshipSummary;
    merged.relationshipSourceMemoryIds = outline.relationshipSourceMemoryIds;
    merged.relationshipSourceMemoryAnchor = outline.relationshipSourceMemoryAnchor;

    const detailById = new Map((detailed || []).map(item => [item.id, item]));
    const incoming = (outline.endings || []).map(item => detailById.get(item.id) || item);
    const byKey = new Map((merged.endings || []).map((item, index) => [endingRouteEvidenceKey(item), index]));
    const usedIds = new Set((merged.endings || []).map(item => item.id));
    let added = 0;
    let recommended = previous.recommendedEndingId;
    for (const item of incoming) {
        const key = endingRouteEvidenceKey(item);
        let existingIndex = byKey.get(key);
        if (existingIndex === undefined) {
            existingIndex = merged.endings.findIndex(old => old.type === item.type && core_incremental.normalizedContentKey(old.title, 120) === core_incremental.normalizedContentKey(item.title, 120));
        }
        if (existingIndex !== undefined && existingIndex >= 0) {
            const old = merged.endings[existingIndex];
            if (!old.available && item.available) {
                merged.endings[existingIndex] = { ...old, ...structuredClone(item), id: old.id };
                added += 1;
                if (outline.recommendedEndingId === item.id) recommended = old.id;
            }
            continue;
        }
        if (merged.endings.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
        const next = { ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, 'END') };
        merged.endings.push(next);
        byKey.set(key, merged.endings.length - 1);
        added += 1;
        if (outline.recommendedEndingId === item.id && item.available) recommended = next.id;
    }
    const confessionMerge = mergeEndingConfessions(previous.confessionReplays, freshConfessions);
    merged.confessionReplays = confessionMerge.items;
    merged.recommendedEndingId = recommended;
    const normalized = normalizeEnding(merged, memoryBank);
    return { session: normalized, added: added + confessionMerge.added };
}

export function endingRouteDetailPrompt(context, memoryBank, outline, route) {
    const ids = [...new Set([
        ...(outline?.relationshipSourceMemoryIds || []),
        ...(route?.sourceMemoryIds || []),
    ].map(id => core_text.normalizeText(id, 40)).filter(Boolean))].slice(0, 12);
    const evidence = JSON.stringify({
        archiveName: core_text.normalizeText(memoryBank?.archiveName, 120),
        archiveSummary: core_text.normalizeText(memoryBank?.archiveSummary, 1200),
        relationshipState: core_text.normalizeText(outline?.relationshipState, 120),
        relationshipSummary: core_text.normalizeText(outline?.relationshipSummary, 2400),
        route: {
            id: route.id,
            type: route.type,
            title: route.title,
            subtitle: route.subtitle,
            unlockHint: route.unlockHint,
            sourceMemoryIds: route.sourceMemoryIds,
            sourceMemoryAnchor: route.sourceMemoryAnchor,
        },
        memories: core_evidence.memoryPayload(memoryBank, ids, 12),
    }, null, 2);
    return `${generation_prompts.promptSafetyBoundary(context, '结局路线正文 / 分段详情')}
本请求只写【一条已经判定 available=true 的未来结局路线】。路线可用性、关系阶段和证据已经在上一小段请求中确定；不要改 route id/type/available，也不要生成其他路线或过去告白回看。
UNTRUSTED_ENDING_ROUTE_CONTEXT_JSON:
${evidence}

严格输出：
{
  "ending": {
    "id": "${route.id}",
    "endingScene": "完整未来终章场景",
    "creditsLine": "像游戏 ED 收束的一句短句",
    "epilogue": {
      "title": "后日谈",
      "timeSkip": "数周后 / 数月后 / 一年后等",
      "scenes": [
        {"title":"后日谈片段标题","text":"未来生活切片"},
        {"title":"后日谈片段标题","text":"未来生活切片"},
        {"title":"后日谈片段标题","text":"未来生活切片"}
      ],
      "finalLine": "{{char}} 的后日谈收尾一句"
    }
  }
}

硬性要求：
- ending.id 必须严格等于 "${route.id}"；不要返回其他路线。
- endingScene 不少于 320 个汉字；这里不生成头像告白对话。头像 + 对话框形式只属于“告白回看”，用于已经在真实档案中发生过的告白。
- epilogue.scenes 至少 3 段，每段不少于 90 个汉字，展示不同时间点的生活变化；它们都是未来推演，不写回聊天档案。
- 继续符合 CHARACTER_CARD_JSON、USER_PERSONA_JSON、WORLD_INFO_TEXT 与当前档案关系，不突然换职业、时代、人格或世界规则。
- 若当前路线不是恋爱关系，不得强行婚姻/同居；若角色或用户是未成年人/低龄设定，只写年龄适当的纯情关系与成长，成年长期未来必须明确双方已成年。
- reverse 可以急切、吃醋、争取，但不得威胁、强迫、控制 {{user}}，也不得把 {{user}} 与第三方恋爱写成既成事实。
- 禁止前任/前女友；禁止 {{char}} 与 {{user}} 之外任何第三方恋爱、婚姻或家庭对象。
- 只输出 JSON。`;
}

export function splitEndingConfessionText(value) {
    const text = core_text.normalizeText(value, 6000);
    if (!text) return [];
    const rough = [];
    for (const block of text.split(/\n+/).map(item => item.trim()).filter(Boolean)) {
        const sentences = block.match(/[^。！？!?…]+(?:[。！？!?…]+|$)/g) || [block];
        for (const sentence of sentences) {
            const clean = core_text.normalizeText(sentence, 800);
            if (clean) rough.push(clean);
        }
    }
    const lines = [];
    let pending = '';
    for (const item of rough) {
        if (item.length < 18) {
            pending = core_text.normalizeText(`${pending}${item}`, 800);
            continue;
        }
        const combined = core_text.normalizeText(`${pending}${item}`, 800);
        if (combined) lines.push(combined);
        pending = '';
    }
    if (pending) {
        if (lines.length) lines[lines.length - 1] = core_text.normalizeText(`${lines[lines.length - 1]}${pending}`, 800);
        else lines.push(pending);
    }
    return lines.slice(0, 10);
}

export function normalizeEndingConfessionLines(rawLines, fallbackText = '') {
    let lines = Array.isArray(rawLines) ? core_text.cleanArray(rawLines, 10, 800) : [];
    if (lines.length === 1 && lines[0].length > 160) lines = splitEndingConfessionText(lines[0]);
    if (!lines.length) lines = splitEndingConfessionText(fallbackText);
    return lines.slice(0, 10);
}

export function normalizeEndingRouteDetail(data, route) {
    const raw = data?.ending && typeof data.ending === 'object' ? data.ending : data;
    const returnedId = core_text.safeId(raw?.id, '');
    if (returnedId && returnedId !== route.id) throw new Error(`路线“${route.title}”返回了错误 id：${returnedId}。`);
    const endingScene = core_text.normalizeText(raw?.endingScene, 12000);
    const creditsLine = core_text.normalizeText(raw?.creditsLine, 600);
    if (endingScene.length < 320) throw new Error(`已解锁结局“${route.title}”的终章场景不足 320 字。`);
    const rawEpilogue = raw?.epilogue && typeof raw.epilogue === 'object' ? raw.epilogue : {};
    const scenes = (Array.isArray(rawEpilogue?.scenes) ? rawEpilogue.scenes : []).slice(0, 6).map((scene, index) => ({
        title: core_text.normalizeText(scene?.title, 120) || `后日谈 ${index + 1}`,
        text: core_text.normalizeText(scene?.text, 5000),
    })).filter(scene => scene.text.length >= 90);
    if (scenes.length < 3) throw new Error(`已解锁结局“${route.title}”的后日谈不足 3 段。`);
    return {
        ...route,
        endingScene,
        confession: '',
        confessionLines: [],
        creditsLine,
        epilogue: {
            title: core_text.normalizeText(rawEpilogue?.title, 120) || '后日谈',
            timeSkip: core_text.normalizeText(rawEpilogue?.timeSkip, 200),
            scenes,
            finalLine: core_text.normalizeText(rawEpilogue?.finalLine, 1200),
        },
    };
}

export async function generateEndingWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.ENDING, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    if (previous) {
        const outline = await generation_client.requestValidatedSegment(
            endingIncrementOutlinePrompt(context, memoryBank, previous, sourceMemoryIds),
            'ENDING · 正在从新增档案判断新路线…',
            { maxTokens: 5000, temperature: 0.35, context, origin, taskKey: `${taskKey}:increment-outline`, mode: core_constants.MODE.ENDING, background: true },
            raw => normalizeEndingIncrementOutline(raw, memoryBank, sourceMemoryIds),
        );
        const usedIds = new Set(previous.endings.map(item => item.id));
        const originalRecommended = outline.recommendedEndingId;
        for (const route of outline.endings) {
            const originalId = route.id;
            route.id = core_incremental.uniqueGeneratedId(route.id, usedIds, 'END');
            if (originalRecommended === originalId) outline.recommendedEndingId = route.id;
        }
        const available = outline.endings.filter(item => item.available);
        const detailed = await generation_client.mapGenerationConcurrent(available, core_constants.SEGMENT_REQUEST_CONCURRENCY, async (route, index) => generation_client.requestValidatedSegment(
            endingRouteDetailPrompt(context, memoryBank, outline, route),
            `ENDING · 新路线 ${index + 1}/${available.length}：${route.title}…`,
            { maxTokens: 9000, context, origin, taskKey: `${taskKey}:increment-route:${route.id}`, mode: core_constants.MODE.ENDING, background: true },
            raw => normalizeEndingRouteDetail(raw, route),
        ));
        let freshConfessions = [];
        let confessionScanSucceeded = false;
        try {
            const confessionRaw = await generation_client.requestJson(
                endingConfessionRefreshPrompt(context, memoryBank, previous, sourceMemoryIds),
                'ENDING · 正在从新增档案扫描新告白…',
                { maxTokens: 8000, temperature: 0.35, context, origin, taskKey: `${taskKey}:increment-confession`, mode: core_constants.MODE.ENDING, background: true },
            );
            freshConfessions = normalizeEndingConfessionReplays(confessionRaw?.confessionReplays, memoryBank)
                .filter(item => core_incremental.usesIncrementalMemoryId(item.sourceMemoryIds, sourceMemoryIds));
            confessionScanSucceeded = true;
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
            console.warn('[HeartbeatMemories] incremental ENDING confession scan failed; keeping old replays', error);
        }
        const merged = mergeEndingIncremental(previous, outline, detailed, freshConfessions, memoryBank);
        core_incremental.stampIncrementalCoverage(merged.session, previous, memoryBank, 'mode', sourceMemoryIds, merged.added);
        if (confessionScanSucceeded) {
            core_incremental.stampIncrementalCoverage(merged.session, previous, memoryBank, 'confessions', sourceMemoryIds, freshConfessions.length);
        }
        return merged.session;
    }
    const outline = await generation_client.requestValidatedSegment(
        endingOutlinePrompt(context, memoryBank),
        'ENDING · 正在判断关系与路线目录…',
        { maxTokens: 7000, temperature: 0.35, context, origin, taskKey: `${taskKey}:outline`, mode: core_constants.MODE.ENDING, background: true },
        raw => normalizeEndingOutline(raw, memoryBank),
    );
    const available = outline.endings.filter(item => item.available);
    const detailed = await generation_client.mapGenerationConcurrent(available, core_constants.SEGMENT_REQUEST_CONCURRENCY, async (route, index) => {
        let completed = null;
        let lastError = null;
        for (let attempt = 0; attempt < 2 && !completed; attempt += 1) {
            try {
                const raw = await generation_client.requestJson(
                    endingRouteDetailPrompt(context, memoryBank, outline, route),
                    `ENDING · 路线 ${index + 1}/${available.length}：${route.title}${attempt ? '（重试）' : ''}…`,
                    { maxTokens: 9000, context, origin, taskKey: `${taskKey}:route:${route.id}`, mode: core_constants.MODE.ENDING, background: true },
                );
                completed = core_requestCoordinator.validateGeneratedSegment(raw, data => normalizeEndingRouteDetail(data, route));
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
                lastError = error;
                console.warn('[HeartbeatMemories] split ENDING route detail failed', { route: route.id, attempt: attempt + 1, error });
                if (attempt === 0 && core_requestCoordinator.shouldRetrySegmentRequest(error)) {
                    await core_requestCoordinator.waitBeforeSegmentRetry(error);
                    continue;
                }
                throw error;
            }
        }
        if (!completed) {
            const detail = core_text.normalizeText(lastError?.message || String(lastError || ''), 700);
            throw new Error(`ENDING 路线“${route.title}”连续两次失败。其他分段不会覆盖旧 ENDING。${detail ? `
${detail}` : ''}`);
        }
        return completed;
    });
    let confessionReplays = [];
    let confessionScanSucceeded = false;
    try {
        const confessionRaw = await generation_client.requestJson(
            endingConfessionRefreshPrompt(context, memoryBank),
            'ENDING · 正在扫描已发生告白…',
            { maxTokens: 10000, temperature: 0.35, context, origin, taskKey: `${taskKey}:confession`, mode: core_constants.MODE.ENDING, background: true },
        );
        confessionReplays = normalizeEndingConfessionReplays(confessionRaw?.confessionReplays, memoryBank);
        confessionScanSucceeded = true;
    } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
        console.warn('[HeartbeatMemories] split ENDING confession scan failed; preserving the previous replay cache when available', error);
        try {
            const previous = core_cache.loadSession(core_constants.MODE.ENDING, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
            confessionReplays = Array.isArray(previous?.confessionReplays) ? previous.confessionReplays : [];
        } catch {
            confessionReplays = [];
        }
    }
    const detailedById = new Map(detailed.map(item => [item.id, item]));
    const merged = {
        title: outline.title,
        relationshipState: outline.relationshipState,
        relationshipSummary: outline.relationshipSummary,
        relationshipSourceMemoryIds: outline.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: outline.relationshipSourceMemoryAnchor,
        recommendedEndingId: outline.recommendedEndingId,
        confessionReplays,
        endings: outline.endings.map(route => detailedById.get(route.id) || route),
    };
    const normalized = normalizeEnding(merged, memoryBank);
    core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'mode', sourceMemoryIds, normalized.endings.length);
    if (confessionScanSucceeded) {
        core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'confessions', sourceMemoryIds, normalized.confessionReplays.length);
    }
    return normalized;
}

export function normalizeEndingConfessionReplays(rawList, memoryBank) {
    return (Array.isArray(rawList) ? rawList : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const typeRaw = core_text.normalizeText(item?.type, 40).toLowerCase();
        const type = core_constants.CONFESSION_REPLAY_TYPES.has(typeRaw) ? typeRaw : 'other';
        const title = core_text.normalizeText(item?.title, 100) || `告白回看 ${index + 1}`;
        const subtitle = core_text.normalizeText(item?.subtitle, 240);
        const date = core_text.normalizeText(item?.date, 80) || '待定';
        const scene = core_text.normalizeText(item?.scene, 8000);
        const confessionText = core_text.normalizeText(item?.confessionText, 4000);
        const confessionLines = normalizeEndingConfessionLines(item?.confessionLines, confessionText);
        const responseSummary = core_text.normalizeText(item?.responseSummary, 2400);
        const afterEffect = core_text.normalizeText(item?.afterEffect, 2400);
        if (scene.length < 140 || confessionText.length < 50) return null;
        const evidenceText = `${title}\n${subtitle}\n${date}\n${scene}\n${confessionText}\n${responseSummary}\n${afterEffect}`;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceText, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        const replay = {
            id: core_text.safeId(item?.id, `CONF${String(index + 1).padStart(2, '0')}`),
            type,
            title,
            subtitle,
            date,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            scene,
            confessionText,
            confessionLines,
            responseSummary,
            afterEffect,
        };
        replay.easterEgg = normalizeEndingEasterEgg(item?.easterEgg, replay);
        return replay;
    }).filter(Boolean);
}

export function normalizeEnding(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 2400);
    if (!relationshipSummary) throw new Error('结局档案缺少当前关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}
${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) {
        throw new Error('结局档案的当前关系阶段缺少真实档案锚点。');
    }
    const confessionReplays = normalizeEndingConfessionReplays(data?.confessionReplays, memoryBank);
    const raw = Array.isArray(data?.endings) ? data.endings : [];
    const endings = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const typeRaw = core_text.normalizeText(item?.type, 40).toLowerCase();
        const type = core_constants.ENDING_TYPES.has(typeRaw) ? typeRaw : 'personal';
        const available = !!item?.available;
        const title = core_text.normalizeText(item?.title, 100) || `结局路线 ${index + 1}`;
        const subtitle = core_text.normalizeText(item?.subtitle, 240);
        const unlockHint = core_text.normalizeText(item?.unlockHint, 1200);
        const endingScene = available ? core_text.normalizeText(item?.endingScene, 12000) : '';
        const confessionLines = available ? normalizeEndingConfessionLines(item?.confessionLines, item?.confession) : [];
        const confession = available ? core_text.normalizeText(confessionLines.join('\n') || item?.confession, 6000) : '';
        const creditsLine = available ? core_text.normalizeText(item?.creditsLine, 600) : '';
        const rawEpilogue = item?.epilogue && typeof item.epilogue === 'object' ? item.epilogue : {};
        const epilogueScenes = available
            ? (Array.isArray(rawEpilogue?.scenes) ? rawEpilogue.scenes : []).slice(0, 6).map((scene, sceneIndex) => ({
                title: core_text.normalizeText(scene?.title, 120) || `后日谈 ${sceneIndex + 1}`,
                text: core_text.normalizeText(scene?.text, 5000),
            })).filter(scene => scene.text.length >= 90)
            : [];
        const epilogue = {
            title: core_text.normalizeText(rawEpilogue?.title, 120) || '后日谈',
            timeSkip: available ? core_text.normalizeText(rawEpilogue?.timeSkip, 200) : '',
            scenes: epilogueScenes,
            finalLine: available ? core_text.normalizeText(rawEpilogue?.finalLine, 1200) : '',
        };
        const evidenceText = `${relationshipState}\n${relationshipSummary}\n${title}\n${subtitle}\n${unlockHint}\n${endingScene}\n${confession}`;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceText, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        if (available) {
            if (endingScene.length < 320) throw new Error(`已解锁结局“${title}”的终章场景不足 320 字。`);
            if (epilogueScenes.length < 3) throw new Error(`已解锁结局“${title}”的后日谈不足 3 段。`);
        } else if (!unlockHint) {
            throw new Error(`未解锁结局“${title}”缺少解锁提示。`);
        }
        return {
            id: core_text.safeId(item?.id, `END${String(index + 1).padStart(2, '0')}`),
            type,
            title,
            subtitle,
            available,
            unlockHint,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            endingScene,
            confession,
            confessionLines,
            creditsLine,
            epilogue,
        };
    }).filter(Boolean);
    if (endings.length < 5) throw new Error(`结局路线不足：得到 ${endings.length} 条，至少需要 5 条。`);
    const byType = new Map(endings.map(item => [item.type, item]));
    for (const required of ['route', 'romance', 'reverse', 'bond', 'open']) {
        if (!byType.has(required)) throw new Error(`结局档案缺少 ${required} 路线。`);
    }
    const route = byType.get('route');
    const open = byType.get('open');
    if (!route.available || !open.available) throw new Error('当前路线结局与开放结局必须可观测。');
    const requestedRecommended = core_text.safeId(data?.recommendedEndingId, '');
    const recommended = endings.find(item => item.id === requestedRecommended && item.available)
        || endings.find(item => item.type === 'romance' && item.available)
        || endings.find(item => item.type === 'reverse' && item.available)
        || route
        || endings.find(item => item.available);
    return {
        kind: core_constants.MODE.ENDING,
        title: core_text.normalizeText(data?.title, 120) || 'ENDING / 结局档案',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        relationshipHistory: (Array.isArray(data?.relationshipHistory) ? data.relationshipHistory : []).slice(-60).map(item => ({
            relationshipState: core_text.normalizeText(item?.relationshipState, 120),
            relationshipSummary: core_text.normalizeText(item?.relationshipSummary, 2400),
            relationshipSourceMemoryIds: core_text.cleanArray(item?.relationshipSourceMemoryIds, 24, 40),
            relationshipSourceMemoryAnchor: core_text.normalizeText(item?.relationshipSourceMemoryAnchor, 160),
            archivedAt: Math.max(0, Number(item?.archivedAt) || 0),
        })).filter(item => item.relationshipSummary),
        recommendedEndingId: recommended?.id || endings[0].id,
        confessionReplays,
        endings,
        selectedId: endings.some(item => item.id === data?.selectedId) ? data.selectedId : (recommended?.id || endings[0].id),
        selectedConfessionId: confessionReplays.some(item => item.id === data?.selectedConfessionId) ? data.selectedConfessionId : (confessionReplays[0]?.id || ''),
        confessionLineIndex: Math.max(0, Number(data?.confessionLineIndex) || 0),
        view: data?.view === 'confessions' ? 'confessions' : 'routes',
        generationMeta: data?.generationMeta && typeof data.generationMeta === 'object' ? structuredClone(data.generationMeta) : undefined,
    };
}
