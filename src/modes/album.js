import * as core_participants from '../core/participants.js';
import * as cg_visual from '../core/cgVisualRules.js';
import * as story_chronology from '../core/storyChronology.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_presentExpression from '../core/presentExpression.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as generation_prompts from '../generation/prompts.js';


// Per-entry identities omit worldbook prose; full generation sources are frozen
// once by the task/session rather than copied again for every CG.
export function albumSpeakerIdentities(snapshot) {
    return snapshot ? { version: 1, people: snapshot.people.map(({ id, name }) => ({ id, name })) } : null;
}

export function normalizeAlbumSpeakerSnapshot(snapshot) {
    return snapshot ? core_participants.normalizeParticipantSnapshot({ ...snapshot,
        people: snapshot.people.map(person => ({ ...person, sourceRefs: [] })) }) : null;
}

// Keep legacy string arrays intact. Multiplayer attribution lives beside the text,
// so old exports/editors and already generated prose retain their existing shape.
export function normalizeAlbumDialogue(raw, participantSnapshot = null, savedSpeakers = []) {
    const snapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
    // Single-card comments are strings. An object must not become "[object Object]".
    if (!snapshot) {
        const comments = [];
        for (const line of (Array.isArray(raw) ? raw : []).slice(0, 8)) {
            if (typeof line !== 'string') continue;
            const text = core_text.normalizeText(line, 1200);
            if (text) comments.push(text);
        }
        return { comments };
    }
    const comments = [], commentSpeakers = [];
    for (const [index, line] of (Array.isArray(raw) ? raw : []).slice(0, 8).entries()) {
        const text = core_text.normalizeText(typeof line === 'string' ? line : line?.text, 1200);
        if (!text) continue;
        const id = typeof line === 'object' ? line?.speakerId : savedSpeakers[index]?.speakerId;
        const person = snapshot.people.find(person => person.id === id);
        comments.push(text);
        commentSpeakers.push({ speakerId: person?.id || '', speakerName: person?.name || '' });
    }
    return { comments, commentSpeakers };
}

function participantRelationshipBank(memoryBank, person) {
    // Generic "both" clauses in another person's memory cannot establish this pair.
    // Keep explicitly named evidence and records whose participants bind this person.
    const named = value => !!person.name && typeof value === 'string' && value.includes(person.name);
    return { ...memoryBank, characterName: person.name,
        archiveSummary: String(memoryBank?.archiveSummary || '').split(/[。！？\n]/u).filter(named).join('。'),
        memories: (memoryBank?.memories || []).filter(memory =>
            memory.participants?.includes(person.name) || named(memory.title) || named(memory.summary)),
    };
}

export function compactAlbumExisting(session) {
    return story_chronology.sortByStoryDate(core_evidence.evenlySample(Array.isArray(session?.entries) ? session.entries : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS)).map(item => ({
        id: core_text.normalizeText(item?.id, 40),
        title: core_text.normalizeText(item?.title, 80),
        unlocked: !!item?.unlocked,
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 120),
    }));
}

// A reading projection is separate from the complete-result validator and from
// the canonical album. Only closed JSON records can supply new content here.
export function projectAlbumProgress({ segments = [], memoryBank, frozenInputs = {} }) {
    const participantSnapshot = core_participants.normalizeParticipantSnapshot(frozenInputs['participants:album'] || null);
    const index = segments.find(segment => /:index$/u.test(segment.slot));
    if (!index) return null;
    const rows = index.items('/entries');
    const entries = [];
    const unlockedSeed = rows.find(row => {
        try { return row.unlocked && normalizeAlbumIndex({ entries: [row] }, memoryBank).entries.length; } catch { return false; }
    });
    for (const [i, row] of rows.entries()) {
        try {
            const raw = { ...row, id: row.id || `CG${String(i + 1).padStart(2, '0')}` };
            const normalized = normalizeAlbumIndex({ entries: raw.unlocked ? [raw] : [unlockedSeed, raw].filter(Boolean) }, memoryBank).entries;
            const item = normalized.find(entry => entry.id === core_text.safeId(raw.id, ''));
            if (item) entries.push(item);
        } catch {}
    }
    if (!entries.length) return null;
    let relationshipSnapshot = null;
    const relationship = segments.find(segment => /:relationship-scan$/u.test(segment.slot));
    if (relationship?.complete) {
        try { relationshipSnapshot = normalizeAlbumRelationshipSnapshot(relationship.value, memoryBank, participantSnapshot); } catch {}
    }
    for (const entry of entries) {
        if (!entry.unlocked) continue;
        entry.progressPending = ['共同回忆'];
        entry.relationshipSnapshot = relationshipSnapshot;
        if (participantSnapshot) entry.speakerSnapshot = albumSpeakerIdentities(participantSnapshot);
        for (const segment of segments.filter(item => /:comments:\d+$/u.test(item.slot))) {
            // at() also exposes closed comments inside the last, still-open row.
            for (let i = 0; ; i++) {
                const row = segment.at?.(`/items/${i}`) ?? segment.items('/items')[i];
                if (!row) break;
                if (core_text.safeId(row.id, '') !== entry.id) continue;
                Object.assign(entry, normalizeAlbumDialogue(segment.items(`/items/${i}/comments`), participantSnapshot));
                try {
                    const complete = normalizeAlbumCommentsBatch({ items: [row] }, [entry], participantSnapshot);
                    if (segment.has(`/items/${i}`)) {
                        if (participantSnapshot) Object.assign(entry, complete.get(entry.id));
                        else entry.comments = complete.get(entry.id);
                        entry.progressPending = [];
                    }
                } catch {}
            }
        }
    }
    return { ...(participantSnapshot ? { participantSnapshot } : {}), kind: core_constants.MODE.ALBUM, title: core_text.normalizeText(index.value?.title, 120) || '回忆相簿', entries,
        category: '全部', page: 1, pageSize: 6, selectedId: entries[0].id, sharedMemory: false, dialogueIndex: 0, hintVisible: false };
}

const ALBUM_RELATIONSHIP_HINT_RE = /(?:喜欢|爱|恋|暧昧|告白|表白|交往|恋人|伴侣|信赖|依赖|陪伴|亲密|疏远|冲突|争吵|和好|拒绝|同居|约定|关系|like|love|dating|relationship|trust|confess)/i;

// Relationship scanning must inspect the complete stored timeline, not only the CG-local or
// incremental slice. Keep every memory id plus one exact, locally verifiable anchor; add a bounded
// synopsis for likely relationship records and the recent tail so the full request remains safe.
export function albumRelationshipArchiveSlice(memoryBank) {
    const memories = (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).slice(0, core_constants.MAX_MEMORY_ITEMS);
    const indexed = memories.map((item, index) => {
        const title = core_text.normalizeText(item?.title, 100);
        const anchors = core_text.cleanArray(item?.anchors, 6, 100);
        const summary = core_text.normalizeText(item?.summary, 900);
        return { item, index, title, summary, evidenceAnchor: anchors[0] || title };
    });
    const relevant = indexed.filter(record => ALBUM_RELATIONSHIP_HINT_RE.test(`${record.title}\n${record.summary}\n${record.evidenceAnchor}`));
    const detailedIndexes = new Set([
        ...core_evidence.evenlySample(relevant, 12).map(record => record.index),
        ...indexed.slice(-12).map(record => record.index),
    ]);
    const ordered = story_chronology.sortByStoryDate(indexed.map(record => ({ ...record, date: record.item?.date })));
    return JSON.stringify({
        archiveName: core_text.normalizeText(memoryBank?.archiveName, 120),
        archiveSummary: core_text.normalizeText(memoryBank?.archiveSummary, 1000),
        archiveKeywords: core_text.cleanArray(memoryBank?.archiveKeywords, 8, 60),
        memoryColumns: ['id', 'evidenceAnchor'],
        memories: ordered.map(record => [core_text.normalizeText(record.item?.id, 40), record.evidenceAnchor]),
        relationshipDetails: ordered.filter(record => detailedIndexes.has(record.index)).map(record => ({
            id: core_text.normalizeText(record.item?.id, 40),
            date: core_text.normalizeText(record.item?.date, 30),
            title: record.title,
            summary: core_text.normalizeText(record.summary, 160),
            participants: core_text.cleanArray(record.item?.participants, 4, 60),
        })),
    });
}

export function albumRelationshipScanPrompt(context, memoryBank, participantSnapshot = null) {
    const snapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
    if (snapshot) return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 分段 2：当下关系扫描', snapshot.people, memoryBank)}
本请求扫描完整档案，分别判定每位选定人物与 {{user}} 的当下关系；不写 CG 或对白，不预演未来。角色卡名称是场景标题，不能充当人物姓名。
${core_participants.participantPromptBlock(snapshot)}
ALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON:
${albumRelationshipArchiveSlice(memoryBank)}
严格输出 {"people":[{"speakerId":"名单中的原始 id","charState":"该人物已证实的态度","userState":"用户对该人物已明确表达的态度，未知写未确认","relationshipState":"该人物与用户的关系阶段","relationshipSummary":"该人物与用户的证据总结","relationshipSourceMemoryIds":["M001"],"relationshipSourceMemoryAnchor":"该记忆的原样锚点"}]}。
每位选定人物各返回一条，用 speakerId 对应。每人的证据和关系分别核对，不能把甲的恋爱关系、行为或内心套给乙；不替用户创造回应。引用必须来自上方档案，只输出 JSON。`;

    return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 分段 2：当下关系扫描', core_participants.archivePeopleNames(memoryBank), memoryBank)}
本请求只做一件事：在写共同回忆对话前，扫描当前完整档案时间线，判定档案人物与 {{user}} 双方已有证据的感情状态和当前关系。角色卡名称不是人物。不写 CG，不写对话，不预演未来。
ALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON:
${albumRelationshipArchiveSlice(memoryBank)}

严格输出：
{
  "charState":"{{char}} 当下对 {{user}} 可由档案证明的情感/态度",
  "userState":"{{user}} 已经明确表达或行动表明的态度；证据不足就写未确认",
  "relationshipState":"当前关系阶段，如相互试探/暧昧/已确认交往/伴侣/友情/疏远",
  "relationshipSummary":"只总结已经发生且能证明的双方关系基础",
  "relationshipSourceMemoryIds":["M001"],
  "relationshipSourceMemoryAnchor":"从引用记忆的 evidenceAnchor/anchors/title 原样复制"
}

硬性要求：
- 必须同时区分 charState、userState 和 relationshipState；不得把 {{char}} 的单方感情写成双方已确认。
- userState 只能依据 {{user}} 已发生的言行；不读心，不替 {{user}} 创造回应，不确定就明写“未确认”。
- relationshipSourceMemoryIds + relationshipSourceMemoryAnchor 必须直接来自上方档案，插件会本地验证。
- 不得因为人设、世界书或期待就把暧昧升级为恋人/伴侣。只输出 JSON。`;
}

export function normalizeAlbumRelationshipSnapshot(data, memoryBank, participantSnapshot = null, relationshipBank = memoryBank) {
    const snapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
    if (snapshot) return { people: snapshot.people.map(person => {
        const row = Array.isArray(data?.people) ? data.people.find(row => row?.speakerId === person.id) : null;
        const scopedBank = participantRelationshipBank(memoryBank, person);
        if (!row) return { speakerId: person.id, speakerName: person.name, relationshipTier: 0,
            charState: '未确认', userState: '未确认', relationshipState: '关系未确认',
            relationshipSummary: '尚无该人物的已保存关系扫描；不预设双方恋爱。',
            relationshipSourceMemoryIds: [], relationshipSourceMemoryAnchor: '' };
        if (!row.relationshipSourceMemoryIds?.length) return { ...row, speakerId: person.id, speakerName: person.name,
            relationshipTier: 0, charState: '未确认', userState: '未确认', relationshipState: '关系未确认' };
        // Verify citations against the original archive, but derive the relationship
        // only from evidence belonging to this person rather than the sandbox title.
        const result = normalizeAlbumRelationshipSnapshot(row, { ...memoryBank, characterName: person.name }, null, scopedBank);
        return { ...result, speakerId: person.id, speakerName: person.name };
    }) };

    const charState = core_text.normalizeText(data?.charState, 1200);
    const userState = core_text.normalizeText(data?.userState, 1200);
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!charState || !userState || !relationshipSummary) throw new Error('回忆相簿的双方感情扫描不完整。');
    const requestedIds = core_evidence.normalizeSourceMemoryIds(data?.relationshipSourceMemoryIds, memoryBank, 1);
    const requestedAnchor = core_text.normalizeText(data?.relationshipSourceMemoryAnchor, 120);
    const foldAnchor = value => core_text.normalizeText(value, 120).replace(/\s+/g, '').toLocaleLowerCase();
    const exactAnchor = core_evidence.memoryEvidenceTerms(memoryBank, requestedIds)
        .find(term => foldAnchor(term) === foldAnchor(requestedAnchor)) || '';
    if (!requestedIds.length || !exactAnchor) {
        throw new Error('回忆相簿的双方感情扫描缺少真实档案锚点。');
    }
    const reference = core_evidence.normalizeExactMemoryReference(requestedIds, exactAnchor, memoryBank, 1);
    if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) {
        throw new Error('回忆相簿的双方感情扫描缺少真实档案锚点。');
    }
    // The model-selected citation is an audit trail, not permission to hide a later breakup or
    // cherry-pick an earlier relationship peak. Current state is derived locally from the full
    // ordered archive; relationshipExpressionTier ignores unrelated third-party clauses.
    const tier = core_presentExpression.relationshipExpressionTier(relationshipBank);
    const story = core_participants.resolveStoryIdentities(memoryBank);
    const owner = story.ownerNames[0] || core_text.normalizeText(memoryBank?.characterName, 80) || '{{char}}';
    const reader = story.userDisplay || '{{user}}';
    const localState = [
        {
            charState: `完整档案尚未确认${owner}对${reader}的特殊感情。`,
            userState: `完整档案尚未确认${reader}对${owner}的特殊感情。`,
            relationshipState: '关系未确认',
        },
        {
            charState: `完整档案确认${owner}与${reader}已有友好关系，不补写未表达的感情。`,
            userState: `完整档案只确认双方友好，不推断${reader}未表达的内心。`,
            relationshipState: '友好或同伴关系',
        },
        {
            charState: `完整档案确认${owner}与${reader}关系亲近，但不自动升级为恋爱。`,
            userState: `完整档案只确认双方亲近，不替${reader}补写恋爱回应。`,
            relationshipState: '亲近但未确认恋爱',
        },
        {
            charState: `完整档案确认${owner}与${reader}已经建立明确的双向亲密关系。`,
            userState: `完整档案确认双方关系已由明确言行建立，不额外补写${reader}的内心。`,
            relationshipState: '已确认双向亲密关系',
        },
    ][tier];
    return {
        ...localState,
        relationshipSummary: `完整档案当前关系：${localState.relationshipState}。审计锚点：${reference.sourceMemoryAnchor}。`,
        relationshipTier: tier,
        evidenceMode: 'full-archive-derived',
        relationshipSourceMemoryIds: reference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: reference.sourceMemoryAnchor,
    };
}

export function albumIndexPrompt(context, memoryBank, previousSession = null, sourceMemoryIds = null) {
    const archiveBlock = previousSession
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 48);
    return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 重要 CG 节点', core_participants.archivePeopleNames(memoryBank), memoryBank)}
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

// Model output is free text: fold casing/whitespace and known aliases onto the
// fixed set. Anything unrecognized becomes 待分类 instead of silently landing in 日常.
const ALBUM_CATEGORY_ALIASES = new Map(Object.entries({
    daily: '日常', everyday: '日常', routine: '日常', sliceoflife: '日常', 'slice of life': '日常',
    '日常': '日常', '日常生活': '日常', '生活': '日常', '平常': '日常', '普通': '日常', '琐事': '日常',
    date: '约会', dating: '约会', outing: '约会', rendezvous: '约会',
    '约会': '约会', '约会日': '约会', '浪漫': '约会', '出游': '约会',
    ending: '结局', finale: '结局', end: '结局', epilogue: '结局',
    '结局': '结局', '终章': '结局', '终局': '结局', '尾声': '结局',
}));

export function normalizeAlbumCategory(value) {
    const text = core_text.normalizeText(value, 40).toLowerCase();
    if (core_constants.CATEGORY_VALUES.has(text)) return text;
    return ALBUM_CATEGORY_ALIASES.get(text) || '待分类';
}

export function normalizeAlbumIndex(data, memoryBank, sourceMemoryIds = null) {
    const incrementalIds = sourceMemoryIds ? core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40) : null;
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    const entries = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const unlocked = !!item?.unlocked;
        const category = normalizeAlbumCategory(item?.category);
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
            ...cg_visual.generatedCgDraftFields(item),
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

export function albumCommentsPrompt(context, memoryBank, entries, relationshipSnapshot = null, participantSnapshot = null) {
    const snapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
    if (snapshot) return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 分段 3：当下共同回忆', snapshot.people, memoryBank)}
本请求给 ${entries.length} 张已解锁的过去 CG 写一起翻相簿的当下对白。不同人物可以轮流说话，每句话由实际说话人的 speakerId 对应姓名。角色卡名不是人物。
${core_participants.participantPromptBlock(snapshot)}
CURRENT_RELATIONSHIP_SCAN_JSON:
${JSON.stringify(normalizeAlbumRelationshipSnapshot(relationshipSnapshot, memoryBank, snapshot), null, 2)}
UNTRUSTED_ALBUM_COMMENT_CONTEXT_JSON:
${JSON.stringify({ entries: entries.map(item => ({ id: item.id, title: item.title, date: item.date, desc: item.desc, sourceMemoryIds: item.sourceMemoryIds, sourceMemoryAnchor: item.sourceMemoryAnchor, visualSeed: item.visualSeed })), memories: core_evidence.memoryPayload(memoryBank, [...new Set(entries.flatMap(item => item.sourceMemoryIds || []))].slice(0, 20), 20) }, null, 2)}
严格输出 {"items":[{"id":"CG01","comments":[{"speakerId":"名单中的原始 id","text":"该人物的当下对白"}]}]}。
每个输入 id 原样返回一次；每张 CG 写 6～8 段，每段约 35～120 个汉字。只让与该记忆有据可查的人物评论各自所知内容，不要求所有人物都出场。speakerId 必须来自上方名单，不以名字猜 ID，不替 {{user}} 生成现在的回应。
每句话的称呼和亲密程度服从该 speakerId 自己的关系扫描，不挪用其他人的关系。至少覆盖画面细节、当时没说出口的想法和现在的理解；不新增过去事实，不写 ADV 过去独白，不修改记忆证据。只输出 JSON。`;

    const ids = [...new Set(entries.flatMap(item => item.sourceMemoryIds || []))].slice(0, 20);
    const storedSnapshot = relationshipSnapshot || entries.find(item => item?.relationshipSnapshot)?.relationshipSnapshot || null;
    const safeSnapshot = storedSnapshot ? normalizeAlbumRelationshipSnapshot(storedSnapshot, memoryBank) : {
        status: 'legacy_snapshot_missing',
        instruction: '旧条目没有关系扫描；只能使用保守、不预设双方恋爱或伴侣关系的口吻。',
    };
    const payload = {
        entries: entries.map(item => ({
            id: item.id, title: item.title, date: item.date, desc: item.desc,
            sourceMemoryIds: item.sourceMemoryIds, sourceMemoryAnchor: item.sourceMemoryAnchor,
            visualSeed: item.visualSeed,
        })),
        memories: core_evidence.memoryPayload(memoryBank, ids, 20),
    };
    return `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 分段 3：当下共同回忆', core_participants.archivePeopleNames(memoryBank), memoryBank)}
本请求只给下面 ${entries.length} 张【已经解锁的旧 CG】写一起翻相册时的当下对白。不要生成新 CG、不要改证据、不要写 ADV 式过去内心独白。
CURRENT_RELATIONSHIP_SCAN_JSON:
${JSON.stringify(safeSnapshot, null, 2)}
UNTRUSTED_ALBUM_COMMENT_CONTEXT_JSON:
${JSON.stringify(payload, null, 2)}

严格输出：
{"items":[{"id":"CG01","comments":["当下对白1","当下对白2","当下对白3","当下对白4","当下对白5","当下对白6"]}]}

硬性要求：
- 每个输入 id 必须原样返回一次；每张 CG comments 写 6～8 段，每段约 35～120 个汉字。
- 称呼、表达强度、肢体亲密度和对关系的确定程度必须服从 CURRENT_RELATIONSHIP_SCAN_JSON，不得越过当前关系阶段。
- 如果 userState 是“未确认”或证据不足，不得把单方感情写成双向恋爱，也不得用恋人/伴侣/同居口吻。
- 语境是 {{char}} 与 {{user}} 正在一起看这张过去 CG，由 {{char}} 自然开口评价；至少覆盖可见细节、当时没说出口的想法，以及现在重新理解这段回忆的一点变化。
- 不替 {{user}} 生成现在的回应，不新增过去事实，不复述成 ADV，不修改 sourceMemoryIds/sourceMemoryAnchor。
- 只输出 JSON。`;
}

export function normalizeAlbumCommentsBatch(data, expectedEntries, participantSnapshot = null) {
    const expected = new Map(expectedEntries.map(item => [item.id, item]));
    const raw = Array.isArray(data?.items) ? data.items : [];
    const out = new Map();
    for (const item of raw) {
        const id = core_text.safeId(item?.id, '');
        if (!expected.has(id) || out.has(id)) continue;
        const dialogue = normalizeAlbumDialogue(item?.comments, participantSnapshot, item?.commentSpeakers);
        if (dialogue.comments.length >= 6) out.set(id, participantSnapshot ? dialogue : dialogue.comments);
    }
    for (const item of expectedEntries) {
        if (!out.has(item.id)) throw new Error(`相簿“${item.title}”的共同回忆不足 6 段。`);
    }
    return out;
}

export function albumEvidenceKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_text.normalizeText(item?.sourceMemoryAnchor, 120).toLowerCase();
    return item?.unlocked ? `${ids}|${anchor}|${item?.expansionRound ? core_incremental.normalizedContentKey(item.title + ' ' + item.desc, 600) : ''}` : `locked|${core_text.normalizeText(item?.title, 80).toLowerCase()}`;
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
                    // A manually chosen category is never overwritten by a model merge.
                    category: old.categoryManual === true ? old.category : item.category,
                    ...(old.categoryManual === true ? { categoryManual: true } : {}),
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
        ...(fresh.participantSnapshot ? { participantSnapshot: structuredClone(fresh.participantSnapshot) } : {}),
        kind: core_constants.MODE.ALBUM,
        title: previous.title || fresh.title || '回忆相簿',
        entries: merged.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS),
    };
}

export async function generateAlbumWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const participantSnapshot = core_participants.normalizeParticipantSnapshot(options.participantSnapshot || null);
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.ALBUM, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const fillCommentsNow = options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true;
    if (options.secondStep === true && previous?.entries?.length) {
        return fillAlbumComments(context, memoryBank, origin, taskKey, previous, participantSnapshot);
    }
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(previous, memoryBank, 'mode');
    const index = await generation_client.requestValidatedSegment(
        albumIndexPrompt(context, memoryBank, previous, sourceMemoryIds) + core_incremental.derivedExpansionDirective(previous, memoryBank),
        previous ? '回忆相簿 1/3 · 正在从新增档案挑选新 CG…' : '回忆相簿 1/3 · 正在挑选重要 CG 节点…',
        { maxTokens: 5500, temperature: 0.35, context, origin, taskKey: `${taskKey}:index`, mode: core_constants.MODE.ALBUM, background: true },
        raw => normalizeAlbumIndex(raw, memoryBank, previous ? sourceMemoryIds : null),
    );
    const revisit = previous && !core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length;
    if (revisit) {
        const titles = new Set(previous.entries.map(item => core_incremental.normalizedContentKey(item.title, 120)));
        index.entries = index.entries.filter(item => item.unlocked && !titles.has(core_incremental.normalizedContentKey(item.title, 120)));
    }
    if (previous && !index.entries.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    if (!fillCommentsNow) {
        const fresh = normalizeAlbum({
            title: index.title,
            ...(participantSnapshot ? { participantSnapshot } : {}),
            entries: index.entries.map(item => ({ ...item, comments: [], relationshipSnapshot: null })),
        }, memoryBank, { catalogOnly: true });
        core_requestCoordinator.noteSecondStepOffer(origin, {
            label: '共同回忆', kind: 'album-comments', mode: core_constants.MODE.ALBUM, pageId: core_constants.MODE.ALBUM,
        });
        const merged = mergeAlbumIncremental(previous, fresh, memoryBank);
        const added = Math.max(0, merged.entries.length - (previous?.entries?.length || 0));
        return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, added);
    }
    core_requestCoordinator.noteSecondStepOffer(origin, null);
    const unlocked = index.entries.filter(item => item.unlocked);
    const relationshipSnapshot = await generation_client.requestValidatedSegment(
        albumRelationshipScanPrompt(context, memoryBank, participantSnapshot),
        '回忆相簿 2/3 · 正在扫描双方当下感情状态…',
        { maxTokens: 3200, temperature: 0.25, context, origin, taskKey: `${taskKey}:relationship-scan`, mode: core_constants.MODE.ALBUM, background: true },
        raw => normalizeAlbumRelationshipSnapshot(raw, memoryBank, participantSnapshot),
    );
    const batches = generation_client.chunkForGeneration(unlocked, 3);
    const commentMaps = await generation_client.mapGenerationConcurrent(batches, core_constants.SEGMENT_REQUEST_CONCURRENCY,
        (batch, batchIndex) => generation_client.requestValidatedSegment(
            albumCommentsPrompt(context, memoryBank, batch, relationshipSnapshot, participantSnapshot),
            `回忆相簿 3/3 · 共同回忆 ${batchIndex + 1}/${batches.length}…`,
            { maxTokens: 6000, context, origin, taskKey: `${taskKey}:comments:${batchIndex}`, mode: core_constants.MODE.ALBUM, background: true },
            data => normalizeAlbumCommentsBatch(data, batch, participantSnapshot),
        ));
    const allComments = new Map();
    for (const map of commentMaps) for (const [id, comments] of map.entries()) allComments.set(id, comments);
    const fresh = normalizeAlbum({
        title: index.title,
        ...(participantSnapshot ? { participantSnapshot } : {}),
        entries: index.entries.map(item => ({
            ...item,
            ...(participantSnapshot ? { speakerSnapshot: albumSpeakerIdentities(participantSnapshot),
                ...(item.unlocked ? (allComments.get(item.id) || { comments: [], commentSpeakers: [] }) : { comments: [] }) }
                : { comments: item.unlocked ? (allComments.get(item.id) || []) : [] }),
            relationshipSnapshot: item.unlocked ? structuredClone(relationshipSnapshot) : null,
        })),
    }, memoryBank);
    if (revisit) fresh.entries = fresh.entries.map(item => ({ ...item, expansionRound: (Number(previous.generationMeta?.expansionRound) || 0) + 1 }));
    const merged = mergeAlbumIncremental(previous, fresh, memoryBank);
    const added = Math.max(0, merged.entries.length - (previous?.entries?.length || 0));
    return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

async function fillAlbumComments(context, memoryBank, origin, taskKey, previous, participantSnapshot) {
    core_requestCoordinator.noteSecondStepOffer(origin, null);
    const unlocked = previous.entries.filter(item => item.unlocked && (item.comments?.length || 0) < 4);
    if (!unlocked.length) return previous;
    const relationshipSnapshot = await generation_client.requestValidatedSegment(
        albumRelationshipScanPrompt(context, memoryBank, participantSnapshot),
        '回忆相簿 · 正在扫描双方当下感情状态…',
        { maxTokens: 3200, temperature: 0.25, context, origin, taskKey: `${taskKey}:relationship-scan`, mode: core_constants.MODE.ALBUM, background: true },
        raw => normalizeAlbumRelationshipSnapshot(raw, memoryBank, participantSnapshot),
    );
    const batches = generation_client.chunkForGeneration(unlocked, 3);
    const commentMaps = await generation_client.mapGenerationConcurrent(batches, core_constants.SEGMENT_REQUEST_CONCURRENCY,
        (batch, batchIndex) => generation_client.requestValidatedSegment(
            albumCommentsPrompt(context, memoryBank, batch, relationshipSnapshot, participantSnapshot),
            `回忆相簿 · 共同回忆 ${batchIndex + 1}/${batches.length}…`,
            { maxTokens: 6000, context, origin, taskKey: `${taskKey}:comments:${batchIndex}`, mode: core_constants.MODE.ALBUM, background: true },
            data => normalizeAlbumCommentsBatch(data, batch, participantSnapshot),
        ));
    const allComments = new Map();
    for (const map of commentMaps) for (const [id, comments] of map.entries()) allComments.set(id, comments);
    const fresh = normalizeAlbum({
        title: previous.title,
        ...(participantSnapshot ? { participantSnapshot } : {}),
        entries: previous.entries.map(item => {
            const packed = allComments.get(item.id);
            const commentFields = participantSnapshot
                ? (packed && !Array.isArray(packed) ? packed : { comments: item.comments || [], commentSpeakers: item.commentSpeakers || [] })
                : { comments: Array.isArray(packed) ? packed : (item.comments || []) };
            return {
                ...item,
                ...commentFields,
                relationshipSnapshot: item.unlocked ? structuredClone(relationshipSnapshot) : item.relationshipSnapshot,
            };
        }),
    }, memoryBank);
    return fresh;
}

export function normalizeAlbum(data, memoryBank, options = {}) {
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    const entries = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const unlocked = !!item?.unlocked;
        const category = normalizeAlbumCategory(item?.category);
        const visualSeed = core_text.cleanArray(item?.visualSeed, 12, 80);
        const title = core_text.normalizeText(item?.title, 80) || `回忆 ${index + 1}`;
        const desc = core_text.normalizeText(item?.desc, 1200);
        const participantSnapshot = item?.speakerSnapshot ? normalizeAlbumSpeakerSnapshot(item.speakerSnapshot)
            : core_participants.normalizeParticipantSnapshot(data?.participantSnapshot || null);
        const dialogue = normalizeAlbumDialogue(unlocked ? item?.comments : [], participantSnapshot, item?.commentSpeakers);
        const comments = dialogue.comments;
        const hintLines = unlocked ? [] : core_text.cleanArray(item?.hintLines, 4, 1200);
        const relationshipSnapshot = unlocked && item?.relationshipSnapshot
            ? normalizeAlbumRelationshipSnapshot(item.relationshipSnapshot, memoryBank, participantSnapshot)
            : null;
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
            ...cg_visual.generatedCgDraftFields(item),
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
            comments,
            ...(participantSnapshot ? { speakerSnapshot: albumSpeakerIdentities(participantSnapshot), commentSpeakers: dialogue.commentSpeakers } : {}),
            hintLines,
            relationshipSnapshot,
            // A manually chosen category survives re-normalization and later merges.
            ...(item?.categoryManual === true ? { categoryManual: true } : {}),
        };
    }).filter(item => item.desc && item.sourceMemoryIds.length >= 1);
    const unlockedCount = entries.filter(x => x.unlocked).length;
    if (!entries.length || unlockedCount < 1) {
        throw new Error('相簿至少需要 1 个有真实证据的已解锁重要节点。');
    }
    for (const item of entries) {
        const minimumComments = item.relationshipSnapshot ? 6 : 4;
        if (!options.catalogOnly && item.unlocked && item.comments.length < minimumComments) {
            throw new Error(`已解锁条目“${item.title}”的共同回忆不足 ${minimumComments} 段。`);
        }
        if (!item.unlocked && item.hintLines.length < 1) {
            throw new Error(`未解锁条目“${item.title}”缺少解锁提示。`);
        }
    }
    return {
        kind: core_constants.MODE.ALBUM,
        ...(data?.participantSnapshot ? { participantSnapshot: core_participants.normalizeParticipantSnapshot(data.participantSnapshot) } : {}),
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
