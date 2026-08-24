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
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as generation_prompts from '../generation/prompts.js';

export function compactAlbumExisting(session) {
    return core_evidence.evenlySample(Array.isArray(session?.entries) ? session.entries : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 40),
        title: core_text.normalizeText(item?.title, 80),
        unlocked: !!item?.unlocked,
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 120),
    }));
}

export function albumIndexPrompt(context, memoryBank, previousSession = null, sourceMemoryIds = null) {
    const archiveBlock = previousSession
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 48);
    return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 重要 CG 节点')}
本请求只挑本次增量档案里【尚未被相簿覆盖、真正值得成为一张 CG 的新节点】。旧相簿由本地代码原样保留；不要重写、润色或换标题复述旧条目。
UNTRUSTED_INCREMENTAL_CG_ARCHIVE_JSON:
${archiveBlock}
EXISTING_ALBUM_INDEX_JSON:
${JSON.stringify(compactAlbumExisting(previousSession), null, 2)}

严格输出：
{
  "title":"回忆相簿",
  "entries":[{
    "id":"CG01","title":"最多12字短标题","date":"YYYY/MM/DD 或 MM/DD 或 待定","desc":"1到2句CG画面描述","category":"日常","unlocked":true,
    "sourceMemoryIds":["M001"],"sourceMemoryAnchor":"从所引用记忆 anchors/title 原样复制的具体锚点",
    "visualSeed":["元素1","元素2","元素3","元素4"],
    "imagePrompt":"纯视觉提示",
    "hintLines":[]
  }]
}

要求：
- 初次生成时优先返回 3～6 个最重要节点；增量更新时只返回 0～6 个由 incrementalMemoryIds 支撑的新节点，没有新的重要节点就返回空 entries，禁止复述旧节点。
- unlocked=true 必须来自本次提供的真实增量档案；必须避开 EXISTING_ALBUM_INDEX_JSON 已覆盖的标题、锚点与 sourceMemoryIds 组合。
- unlocked=false 不是硬性数量要求；只有存在明确、自然的未来期许时才给 0～2 个，hintLines 写解锁提示。
- 每个 unlocked=true 必须有有效 sourceMemoryIds + sourceMemoryAnchor；category 只能是“日常”“约会”“结局”；visualSeed 至少 4 个元素。
- imagePrompt 只写肉眼可见的角色、服装、动作、场景、构图与光线；禁止 URL、HTML、脚本、记忆原文和不可见心理活动。
- 不要输出 comments；共同回忆会在后续更小的请求里生成。只输出 JSON。`;
}

export function normalizeAlbumIndex(data, memoryBank, sourceMemoryIds = null) {
    const incrementalIds = sourceMemoryIds ? core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40) : null;
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    const entries = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const unlocked = !!item?.unlocked;
        const category = core_constants.CATEGORY_VALUES.has(item?.category) ? item.category : '日常';
        const visualSeed = core_text.cleanArray(item?.visualSeed, 12, 80);
        const title = core_text.normalizeText(item?.title, 80) || `回忆 ${index + 1}`;
        const desc = core_text.normalizeText(item?.desc, 1200);
        const hintLines = unlocked ? [] : core_text.cleanArray(item?.hintLines, 4, 1200);
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, `${title}\n${desc}\n${hintLines.join('；')}`, memoryBank, 1);
        if (incrementalIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, incrementalIds)) return null;
        return {
            id: core_text.safeId(item?.id, `CG${String(index + 1).padStart(2, '0')}`),
            title,
            date: core_text.normalizeText(item?.date, 40) || (unlocked ? '日期未记录' : '待定'),
            desc,
            category,
            unlocked,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            visualSeed: visualSeed.length >= 4 ? visualSeed : [...visualSeed, '光影', '人物', '环境', '物件'].slice(0, 4),
            imagePrompt: core_text.normalizeText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS),
            comments: [],
            hintLines,
        };
    }).filter(item => item && item.desc && item.sourceMemoryIds.length >= 1);
    const unlockedCount = entries.filter(item => item.unlocked).length;
    if (raw.length && (!entries.length || unlockedCount < 1)) {
        throw new Error('相簿没有生成任何可验证的重要已解锁节点。');
    }
    for (const item of entries) {
        if (!item.unlocked && item.hintLines.length < 1) throw new Error(`未解锁条目“${item.title}”缺少解锁提示。`);
    }
    return { title: core_text.normalizeText(data?.title, 120) || '回忆相簿', entries };
}

export function albumCommentsPrompt(context, memoryBank, entries) {
    const ids = [...new Set(entries.flatMap(item => item.sourceMemoryIds || []))].slice(0, 20);
    const payload = {
        entries: entries.map(item => ({
            id: item.id, title: item.title, date: item.date, desc: item.desc,
            sourceMemoryIds: item.sourceMemoryIds, sourceMemoryAnchor: item.sourceMemoryAnchor,
            visualSeed: item.visualSeed,
        })),
        memories: core_evidence.memoryPayload(memoryBank, ids, 20),
    };
    return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 分段 2：当下共同回忆')}
本请求只给下面 ${entries.length} 张【已经解锁的旧 CG】写一起翻相册时的当下对白。不要生成新 CG、不要改证据、不要写 ADV 式过去内心独白。
UNTRUSTED_ALBUM_COMMENT_CONTEXT_JSON:
${JSON.stringify(payload, null, 2)}

严格输出：
{"items":[{"id":"CG01","comments":["当下对白1","当下对白2","当下对白3","当下对白4"]}]}

硬性要求：
- 每个输入 id 必须原样返回一次；每张 CG comments 写 4～6 段，每段约 35～120 个汉字。
- 语境是 {{char}} 与 {{user}} 正在一起看这张过去 CG，由 {{char}} 自然开口评价；至少覆盖可见细节、当时没说出口的想法，以及现在重新理解这段回忆的一点变化。
- 不替 {{user}} 生成现在的回应，不新增过去事实，不复述成 ADV，不修改 sourceMemoryIds/sourceMemoryAnchor。
- 只输出 JSON。`;
}

export function normalizeAlbumCommentsBatch(data, expectedEntries) {
    const expected = new Map(expectedEntries.map(item => [item.id, item]));
    const raw = Array.isArray(data?.items) ? data.items : [];
    const out = new Map();
    for (const item of raw) {
        const id = core_text.safeId(item?.id, '');
        if (!expected.has(id) || out.has(id)) continue;
        const comments = core_text.cleanArray(item?.comments, 8, 1200);
        if (comments.length >= 4) out.set(id, comments);
    }
    for (const item of expectedEntries) {
        if (!out.has(item.id)) throw new Error(`相簿“${item.title}”的共同回忆不足 4 段。`);
    }
    return out;
}

export function albumEvidenceKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_text.normalizeText(item?.sourceMemoryAnchor, 120).toLowerCase();
    return item?.unlocked ? `${ids}|${anchor}` : `locked|${core_text.normalizeText(item?.title, 80).toLowerCase()}`;
}

export function mergeAlbumIncremental(previous, fresh, memoryBank) {
    if (!previous?.entries?.length) return fresh;
    const merged = previous.entries.map(item => structuredClone(item));
    const indexByKey = new Map(merged.map((item, index) => [albumEvidenceKey(item), index]));
    const usedIds = new Set(merged.map(item => item.id));
    let nextNumber = merged.length + 1;
    for (const item of fresh.entries || []) {
        const key = albumEvidenceKey(item);
        let existingIndex = indexByKey.get(key);
        if (existingIndex === undefined && item.unlocked) {
            const incomingId = core_text.safeId(item.id, '');
            const incomingTitle = core_incremental.normalizedContentKey(item.title, 80);
            const lockedIndex = merged.findIndex(old => !old.unlocked && (
                (incomingId && core_text.safeId(old.id, '') === incomingId)
                || (incomingTitle && core_incremental.normalizedContentKey(old.title, 80) === incomingTitle)
            ));
            if (lockedIndex >= 0) existingIndex = lockedIndex;
        }
        if (existingIndex !== undefined) {
            const old = merged[existingIndex];
            if (!old.unlocked && item.unlocked) {
                merged[existingIndex] = {
                    ...old,
                    ...item,
                    id: old.id,
                    cgImage: generation_imageGeneration.normalizeCgImageRecord(old.cgImage) || generation_imageGeneration.normalizeCgImageRecord(item.cgImage),
                };
            }
            continue;
        }
        let id = core_text.safeId(item.id, '');
        while (!id || usedIds.has(id)) {
            id = `CG${String(nextNumber++).padStart(2, '0')}`;
        }
        usedIds.add(id);
        indexByKey.set(key, merged.length);
        merged.push({ ...item, id });
    }
    // `fresh` has already passed normalizeAlbum(). Re-normalizing the combined collection would
    // unnecessarily touch every historical record and could drop a valid legacy entry. Keep the
    // old session byte-for-byte at the field level and only replace the append-only entries array.
    return {
        ...structuredClone(previous),
        kind: core_constants.MODE.ALBUM,
        title: previous.title || fresh.title || '回忆相簿',
        entries: merged.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
    };
}

export async function generateAlbumWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.ALBUM, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const index = await generation_client.requestValidatedSegment(
        albumIndexPrompt(context, memoryBank, previous, sourceMemoryIds),
        previous ? '回忆相簿 1/2 · 正在从新增档案挑选新 CG…' : '回忆相簿 1/2 · 正在挑选重要 CG 节点…',
        { maxTokens: 5500, temperature: 0.35, context, origin, taskKey: `${taskKey}:index`, mode: core_constants.MODE.ALBUM, background: true },
        raw => normalizeAlbumIndex(raw, memoryBank, previous ? sourceMemoryIds : null),
    );
    if (previous && !index.entries.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const unlocked = index.entries.filter(item => item.unlocked);
    const batches = generation_client.chunkForGeneration(unlocked, 3);
    const commentMaps = await generation_client.mapGenerationConcurrent(batches, core_constants.SEGMENT_REQUEST_CONCURRENCY, async (batch, batchIndex) => {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const raw = await generation_client.requestJson(
                    albumCommentsPrompt(context, memoryBank, batch),
                    `回忆相簿 2/2 · 共同回忆 ${batchIndex + 1}/${batches.length}${attempt ? '（重试）' : ''}…`,
                    { maxTokens: 6000, context, origin, taskKey: `${taskKey}:comments:${batchIndex}`, mode: core_constants.MODE.ALBUM, background: true },
                );
                return core_requestCoordinator.validateGeneratedSegment(raw, data => normalizeAlbumCommentsBatch(data, batch));
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
                lastError = error;
                if (!attempt && core_requestCoordinator.shouldRetrySegmentRequest(error)) {
                    await core_requestCoordinator.waitBeforeSegmentRetry(error);
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`相簿共同回忆第 ${batchIndex + 1} 组连续两次失败：${core_text.normalizeText(lastError?.message || String(lastError || ''), 600)}`);
    });
    const allComments = new Map();
    for (const map of commentMaps) for (const [id, comments] of map.entries()) allComments.set(id, comments);
    const fresh = normalizeAlbum({
        title: index.title,
        entries: index.entries.map(item => ({ ...item, comments: item.unlocked ? (allComments.get(item.id) || []) : [] })),
    }, memoryBank);
    const merged = mergeAlbumIncremental(previous, fresh, memoryBank);
    const added = Math.max(0, merged.entries.length - (previous?.entries?.length || 0));
    return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function normalizeAlbum(data, memoryBank) {
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    const entries = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const unlocked = !!item?.unlocked;
        const category = core_constants.CATEGORY_VALUES.has(item?.category) ? item.category : '日常';
        const visualSeed = core_text.cleanArray(item?.visualSeed, 12, 80);
        const title = core_text.normalizeText(item?.title, 80) || `回忆 ${index + 1}`;
        const desc = core_text.normalizeText(item?.desc, 1200);
        const comments = unlocked ? core_text.cleanArray(item?.comments, 8, 1200) : [];
        const hintLines = unlocked ? [] : core_text.cleanArray(item?.hintLines, 4, 1200);
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, `${title}
${desc}
${comments.join('；')}
${hintLines.join('；')}`, memoryBank, 1);
        return {
            id: core_text.safeId(item?.id, `CG${String(index + 1).padStart(2, '0')}`),
            title,
            date: core_text.normalizeText(item?.date, 40) || (unlocked ? '日期未记录' : '待定'),
            desc,
            category,
            unlocked,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            visualSeed: visualSeed.length >= 4 ? visualSeed : [...visualSeed, '光影', '人物', '环境', '物件'].slice(0, 4),
            imagePrompt: core_text.normalizeText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS),
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
            comments,
            hintLines,
        };
    }).filter(item => item.desc && item.sourceMemoryIds.length >= 1);
    const unlockedCount = entries.filter(x => x.unlocked).length;
    if (!entries.length || unlockedCount < 1) {
        throw new Error('相簿至少需要 1 个有真实证据的已解锁重要节点。');
    }
    for (const item of entries) {
        if (item.unlocked && item.comments.length < 4) {
            throw new Error(`已解锁条目“${item.title}”的共同回忆不足 4 段。`);
        }
        if (!item.unlocked && item.hintLines.length < 1) {
            throw new Error(`未解锁条目“${item.title}”缺少解锁提示。`);
        }
    }
    return {
        kind: core_constants.MODE.ALBUM,
        title: core_text.normalizeText(data?.title, 120) || '回忆相簿',
        entries,
        category: '全部',
        page: 1,
        pageSize: 6,
        selectedId: entries[0]?.id || '',
        sharedMemory: false,
        dialogueIndex: 0,
        hintVisible: false,
    };
}
