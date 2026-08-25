// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as generation_prompts from '../generation/prompts.js';
import * as ui_heartView from '../ui/heartView.js';

export function normalizeHeartCore(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw new Error('角色互动时期对话缺少关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(data?.relationshipSourceMemoryIds, data?.relationshipSourceMemoryAnchor, `${relationshipState}\n${relationshipSummary}`, memoryBank, 1);
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) throw new Error('角色互动时期对话缺少真实关系锚点。');

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) greetings[key] = core_text.cleanArray(data?.greetings?.[key], 6, 600);
    for (const key of ['morning', 'noon', 'evening', 'night', 'weekend']) {
        if (greetings[key].length < 2) throw new Error(`角色互动“${key}”台词不足 2 条。`);
    }
    for (const key of ['birthday', 'userBirthday', 'holiday', 'absenceWorry', 'absenceSulky']) {
        if (greetings[key].length < 1) throw new Error(`角色互动“${key}”台词不足 1 条。`);
    }

    return {
        title: core_text.normalizeText(data?.title, 120) || 'HEART VOICE / 角色互动',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        birthdayMmDd: core_text.normalizeText(data?.birthdayMmDd, 20),
        userBirthdayMmDd: core_text.normalizeText(data?.userBirthdayMmDd, 20),
        specialDays: Array.isArray(data?.specialDays) ? data.specialDays : [],
        greetings,
    };
}

export function heartCorePrompt(context, memoryBank) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 时期对话')}
本请求只生成【关系锚点 + 各种时期/时段的角色对话 + 特别日】。春夏秋冬 Drama 和日常一格都在各自入口单独生成。
UNTRUSTED_HEART_ARCHIVE_JSON:
${generation_prompts.endingArchiveSlice(memoryBank, 40)}

严格输出字段：title, relationshipState, relationshipSummary, relationshipSourceMemoryIds, relationshipSourceMemoryAnchor, birthdayMmDd, userBirthdayMmDd, specialDays, greetings。
- morning/noon/evening/night/weekend 各 2～3 条。
- birthday/userBirthday/holiday/absenceWorry/absenceSulky 各 1～2 条；absenceJealous 只有关系适合时写 0～2 条。
- relationship 必须由真实档案 sourceMemoryIds + sourceMemoryAnchor 支撑；生日不知道就写空字符串。
- 这些只是角色化台词，不写回历史事实，不替 {{user}} 创造真实决定。
- 不要输出 voiceDramas / scenarioDramas / dailyStrips。只输出 JSON。`;
}

export function compactHeartDialoguesExisting(session) {
    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) greetings[key] = core_text.cleanArray(session?.greetings?.[key], 24, 600);
    return {
        relationshipState: core_text.normalizeText(session?.relationshipState, 120),
        relationshipSummary: core_text.normalizeText(session?.relationshipSummary, 900),
        greetings,
        specialDays: (Array.isArray(session?.specialDays) ? session.specialDays : []).slice(0, 30),
    };
}

export function heartCoreIncrementPrompt(context, memoryBank, existing, sourceMemoryIds) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 时期对话增量')}
旧关系时期记录和旧台词由本地原样保留。本请求只根据新增档案补充新的关系阶段说明与新台词，禁止改写、润色或换措辞复述旧台词。
UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_HEART_DIALOGUES_JSON:
${JSON.stringify(compactHeartDialoguesExisting(existing), null, 2)}

严格输出字段：relationshipState, relationshipSummary, relationshipSourceMemoryIds, relationshipSourceMemoryAnchor, birthdayMmDd, userBirthdayMmDd, specialDays, greetings。
- relationship 说明当前新增档案带来的最新阶段，必须由真实档案 ID + anchor 支撑；旧阶段会被本地保存到历史，不会丢失。
- greetings 每一类只写 0～2 条真正新的台词；至少一个分类有新增内容。必须避开 EXISTING_HEART_DIALOGUES_JSON 中的原句与近义复述。
- specialDays 只补新增档案能确定的新日期；不知道就空数组。生日不知道就空字符串。
- 不输出旧台词，不输出 Drama / Scenario / dailyStrips。只输出 JSON。`;
}

export function normalizeHeartCoreIncrement(data, memoryBank, sourceMemoryIds) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系继续发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw new Error('角色互动增量缺少关系摘要。');
    const reference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) throw new Error('角色互动增量缺少真实关系锚点。');
    if (!core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) throw new Error('角色互动增量的关系阶段没有引用本轮新增档案。');
    const greetings = {};
    let total = 0;
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 2, 600);
        total += greetings[key].length;
    }
    if (!total) throw new Error('角色互动增量没有生成任何新台词。');
    return {
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: reference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: reference.sourceMemoryAnchor,
        birthdayMmDd: core_text.normalizeText(data?.birthdayMmDd, 20),
        userBirthdayMmDd: core_text.normalizeText(data?.userBirthdayMmDd, 20),
        specialDays: Array.isArray(data?.specialDays) ? data.specialDays : [],
        greetings,
    };
}

export function mergeHeartCoreIncremental(existing, core) {
    const merged = structuredClone(existing);
    const previousState = {
        relationshipState: core_text.normalizeText(existing?.relationshipState, 120),
        relationshipSummary: core_text.normalizeText(existing?.relationshipSummary, 1800),
        relationshipSourceMemoryIds: core_text.cleanArray(existing?.relationshipSourceMemoryIds, 24, 40),
        relationshipSourceMemoryAnchor: core_text.normalizeText(existing?.relationshipSourceMemoryAnchor, 160),
        archivedAt: Date.now(),
    };
    const history = Array.isArray(existing?.relationshipHistory) ? structuredClone(existing.relationshipHistory) : [];
    const historyKey = `${core_incremental.normalizedContentKey(previousState.relationshipState, 120)}|${core_incremental.normalizedContentKey(previousState.relationshipSummary, 300)}`;
    if (previousState.relationshipSummary && !history.some(item => `${core_incremental.normalizedContentKey(item?.relationshipState, 120)}|${core_incremental.normalizedContentKey(item?.relationshipSummary, 300)}` === historyKey)) {
        history.push(previousState);
    }
    merged.relationshipHistory = history.slice(-60);
    merged.relationshipState = core.relationshipState;
    merged.relationshipSummary = core.relationshipSummary;
    merged.relationshipSourceMemoryIds = core.relationshipSourceMemoryIds;
    merged.relationshipSourceMemoryAnchor = core.relationshipSourceMemoryAnchor;
    merged.birthdayMmDd = core.birthdayMmDd || existing.birthdayMmDd || '';
    merged.userBirthdayMmDd = core.userBirthdayMmDd || existing.userBirthdayMmDd || '';
    let added = 0;
    merged.greetings = { ...(existing.greetings || {}) };
    for (const key of core_constants.HEART_GREETING_KEYS) {
        const lines = [...(existing.greetings?.[key] || [])];
        const seen = new Set(lines.map(line => core_incremental.normalizedContentKey(line, 600)));
        for (const line of core.greetings?.[key] || []) {
            const lineKey = core_incremental.normalizedContentKey(line, 600);
            if (!lineKey || seen.has(lineKey) || lines.length >= 40) continue;
            seen.add(lineKey);
            lines.push(line);
            added += 1;
        }
        merged.greetings[key] = lines;
    }
    const specialDays = [...(existing.specialDays || [])];
    const seenDays = new Set(specialDays.map(item => `${item.mmdd}|${core_incremental.normalizedContentKey(item.label, 80)}`));
    for (const item of core.specialDays || []) {
        const mmdd = core_text.normalizeText(item?.mmdd, 20);
        const label = core_text.normalizeText(item?.label, 80);
        const line = core_text.normalizeText(item?.line, 600);
        const key = `${mmdd}|${core_incremental.normalizedContentKey(label, 80)}`;
        if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(mmdd) || !label || !line || seenDays.has(key)) continue;
        seenDays.add(key);
        specialDays.push({ mmdd, label, line });
        added += 1;
    }
    merged.specialDays = specialDays.slice(0, 60);
    return { session: merged, added };
}

export function heartDramaContext(core, memoryBank) {
    const ids = [...new Set(core.relationshipSourceMemoryIds || [])].slice(0, 8);
    return JSON.stringify({
        relationshipState: core.relationshipState,
        relationshipSummary: core.relationshipSummary,
        relationshipSourceMemoryIds: core.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: core.relationshipSourceMemoryAnchor,
        memories: core_evidence.memoryPayload(memoryBank, ids, 8),
    }, null, 2);
}

export function heartDramaRelationshipOnlyContext(core) {
    return JSON.stringify({
        relationshipState: core_text.normalizeText(core?.relationshipState, 120) || '关系仍在发展',
    }, null, 2);
}

export function compactHeartSeasonExisting(session, season) {
    return {
        voiceDramas: (Array.isArray(session?.voiceDramas) ? session.voiceDramas : [])
            .filter(item => item.kind === season)
            .slice(-40)
            .map(item => ({ id: item.id, title: item.title, subtitle: item.subtitle, setting: item.setting, incrementBatchId: item.incrementBatchId || '' })),
        scenarioDramas: (Array.isArray(session?.scenarioDramas) ? session.scenarioDramas : [])
            .filter(item => item.season === season)
            .slice(-40)
            .map(item => ({ id: item.id, title: item.title, subtitle: item.subtitle, setting: item.setting, incrementBatchId: item.incrementBatchId || '' })),
    };
}

export function heartPostVoicePrompt(context, memoryBank, core, previous = null, sourceMemoryIds = null) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / Drama：未来')}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${previous ? `EXISTING_POSTENDING_DRAMA_INDEX_JSON:
${JSON.stringify(compactHeartSeasonExisting(previous, 'postending'), null, 2)}` : ''}
只生成一个${previous ? '尚未出现的新增' : ''} postending Voice Drama：
{"voiceDramas":[{"id":"VOICE_POST","kind":"postending","title":"后日谈 Voice Drama","subtitle":"未来生活长篇剧场","setting":"明确这是未来模拟","visualTone":"soft|clear|muted|deep","script":[{"speaker":"narrator","text":"..."},{"speaker":"char","text":"..."}]}]}
要求：
- 恰好 1 个 kind=postending；script 8～14 节点、总文本不少于420汉字。
- 这是【当前关系阶段之后的未来温馨日常模拟】，不是档案回放。RELATIONSHIP_TONE_ONLY_JSON 只用于控制亲密度边界，不得把任何聊天档案、记忆摘要、证据锚点或其中出现的具体物品/敏感细节当成剧情素材。
- 优先写一起吃饭、散步、买东西、做家务、下班/放学后、旅行准备、照顾宠物、赖床、做饭失败之类新的生活片段；允许轻微摩擦与和好，但整体以自然、温馨、生活感为主。
- 若 CHARACTER_CARD_JSON / WORLD_INFO_TEXT 明确存在朋友、家人、同事或熟人，可让他们作为非恋爱配角自然出现；没有明确设定时不要凭空发明固定姓名、亲属关系或重大背景。
- 可以是两个人单独约会，也可以是和已知朋友/家人一起吃饭、出门、串门或短途活动。禁止给 {{char}} 安排第三方恋爱。
- 不要提“记忆”“档案”“插件”“过去某条记录”；不要复述既往重大事件来制造感动。${previous ? '避开既有标题、场景和剧情走向；旧篇由本地原样保留。' : ''}
- user 台词若出现仅是非正史剧本演出。只输出 JSON。`;
}

export function heartSeasonVoicePrompt(context, memoryBank, core, season, previous = null, sourceMemoryIds = null) {
    const labels = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
    const label = labels[season] || season;
    return `${generation_prompts.promptSafetyBoundary(context, `角色互动 / Drama：${label} Voice`)}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${previous ? `EXISTING_${season.toUpperCase()}_DRAMA_INDEX_JSON:
${JSON.stringify(compactHeartSeasonExisting(previous, season), null, 2)}` : ''}
本请求只生成【${label} Voice Drama ${previous ? '新增一篇' : '首篇'}】，不要生成 Scenario：
{"voiceDramas":[{"id":"VOICE_${season.toUpperCase()}","kind":"${season}","title":"${label} Voice Drama","subtitle":"...","setting":"...","visualTone":"soft|clear|muted|deep","script":[{"speaker":"char","text":"..."}]}]}
要求：
- 只返回 1 个 kind=${season} 的 Voice Drama；script 5～10 节点、总文本不少于280汉字，以 {{char}} 主观感受为中心，允许少量 narrator/user。
- 这是【未来的${label}日常模拟】，不是对档案记忆的回放。只用 relationshipState 控制说话距离，不得引用或改写档案里的具体事件、物品、伤痛、亲密细节、证据锚点或摘要。
- visualTone 只能是 soft / clear / muted / deep；请结合 {{char}} 的人设气质与本季场景选择，不要四季固定同一个色调。
- 让季节本身推动新的一天：天气、衣着、食物、活动、城市/校园/居住环境、出行方式等要自然进入场景，但不要四季都套同一个模板。
- 内容在以下方向中轮换：二人约会 / 居家相处 / 买菜购物与跑腿 / 散步或短途出行 / 工作学习后的碰面 / 和已知朋友家人同事一起活动 / 小型群体聚会。若角色卡或世界书没有明确的朋友家人设定，不要凭空创造固定重要 NPC。
- 不给角色安排第三方恋爱，不新增已发生历史事实，不提“记忆”“档案”“插件”。${previous ? '必须避开已有标题、场景、冲突与台词走向；旧篇绝不重写。' : ''}只输出 JSON。`;
}

export function heartSeasonScenarioPrompt(context, memoryBank, core, season, previous = null, sourceMemoryIds = null) {
    const labels = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
    const label = labels[season] || season;
    return `${generation_prompts.promptSafetyBoundary(context, `角色互动 / Drama：${label} Scenario`)}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${previous ? `EXISTING_${season.toUpperCase()}_DRAMA_INDEX_JSON:
${JSON.stringify(compactHeartSeasonExisting(previous, season), null, 2)}` : ''}
本请求只生成【${label} Scenario Drama ${previous ? '新增一篇' : '首篇'}】，不要生成 Voice：
{"scenarioDramas":[{"id":"SCENE_${season.toUpperCase()}","season":"${season}","title":"${label} Scenario Drama","subtitle":"普通一天里的小事件","setting":"...","visualTone":"soft|clear|muted|deep","script":[{"speaker":"narrator","text":"..."}]}]}
要求：
- 只返回 1 个 season=${season} 的 Scenario Drama；script 6～12 节点、总文本不少于360汉字，写未来普通一天里的一个完整小事件。
- 不从档案记忆里挑“关键词”写剧情。RELATIONSHIP_TONE_ONLY_JSON 只决定两个人现在适合多亲近；不得把历史中的具体物品、伤痛、性生活/敏感细节、争吵、告白等反复搬进四季日常。
- visualTone 只能是 soft / clear / muted / deep；请结合 {{char}} 的人设气质与本季场景选择，不要四季固定同一个色调。
- 场景类型轮换：二人约会、居家小事、朋友聚会、家人串门、同事/同学相处、一起办事、临时出门、季节限定活动等。朋友/家人/同事只有在角色卡或世界书明确存在时才可使用其姓名和关系；否则优先二人场景或不具名的普通群体环境。
- 整体是温馨、自然、有生活气的未来番外，可以搞笑、尴尬、拌嘴、互相照顾，但不要每篇都靠重大回忆或关系危机推进。
- 这是模拟，不新增历史事实，不给角色安排第三方恋爱，不提“记忆”“档案”“插件”。${previous ? '避开已有标题、场景、冲突与台词走向；旧篇绝不重写。' : ''}只输出 JSON。`;
}

export function heartFireflyPrompt(context, memoryBank, core, previous = null, sourceMemoryIds = null) {
    const existing = (Array.isArray(previous?.fireflyVoices) ? previous.fireflyVoices : []).slice(-80).map(item => ({
        color: item.color,
        title: item.title || '',
        excerpt: core_text.normalizeText((Array.isArray(item.thoughts) ? item.thoughts : [item.line].filter(Boolean)).join(' '), 220),
    }));
    const incremental = existing.length > 0;
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 萤火虫栖息地')}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${incremental ? `UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_FIREFLY_TOPICS_JSON:
${JSON.stringify(existing, null, 2)}` : ''}
这是类似“萤火虫栖息地”的【心声解锁库】，不是新发生的剧情。一个光点不是一句格言，而是一个完整的“心声主题”：像恋爱游戏里偶然听见 {{char}} 没说出口的一小段内心展开，有起念、迟疑/联想和收束。
${incremental ? '旧光点由本地永久保留。本请求只根据本轮新增档案带来的关系变化，解锁尚未出现的新主题；绝对不要改写、覆盖或复述旧光点。' : '这是首次点亮，请建立一片内容丰富但不过度拥挤的初始栖息地。'}
严格输出：
{"fireflyVoices":[{"id":"F01","color":"pink|blue|yellow|white|desire","title":"4～18字心声主题","thoughts":["第一段内心","第二段内心","可选第三段内心"]}]}

五种光点：
- pink 💗：对 {{user}} 的喜欢、在意、依恋、恋爱感。
- blue 💙：关系里的犹豫、不安、吃醋、害怕失去、说不出口的顾虑。
- yellow 💛：关于 {{char}} 自己的生活、习惯、工作学习、家人朋友、价值观；只能基于受控角色卡/世界设定或不涉及新事实的自省。
- white 🤍：脆弱、秘密、羞于承认的小心思、孤独或软弱的一面；不要凭空新增重大创伤或背景事实。
- desire ♥️：对 {{user}} 直白的渴望。允许明确写“想抱住你 / 想亲你 / 想把你留在身边 / 想让你只看我”这一类身体亲近与占有欲，但不要写露骨性行为、身体部位细节或色情过程。

内容结构：
- 每颗光点必须有 2～4 段 thoughts；每段 20～100 个汉字，整颗约 90～280 个汉字。不能只输出一句短句。
- 2～4 段要属于同一个主题并自然递进，不要拆成互不相关的句子，也不要写成摘要/标签/金句合集。
- 只写 {{char}} 的内心。可以在心里称呼或想到 {{user}}，但不要替 {{user}} 说话、决定、回应。
- 不把心声当成历史事实，不写“已经发生了某件新事”。新增档案只用于判断关系/情绪是否变化，不得把具体敏感经历原样搬进心声。

数量和分布：
- ${incremental ? '本轮新增 5～6 个真正新的心声主题；不要求五色平均，按当前关系与人设自然分布。若关系阶段适合，允许新增 ♥️，但不要为了凑数强塞。' : '首次总数 5～6 个；至少覆盖 3 种颜色，按人物与关系自然分配。♥️ 只在关系阶段与人设适合时出现，不为凑五色强塞。'}
- 主题彼此必须明显不同，不能只是换同义词或把同一占有欲拆成多个光点。
- ${incremental ? '必须避开 EXISTING_FIREFLY_TOPICS_JSON 里已有主题、原句和近义重复。' : ''}
只输出 JSON。`;
}

export function normalizeFireflyVoice(item, index = 0) {
    const color = core_text.normalizeText(item?.color, 20).toLowerCase();
    if (!core_constants.HEART_FIREFLY_COLORS.has(color)) return null;
    const legacyLine = core_text.normalizeText(item?.line, 360);
    const thoughts = core_text.cleanArray(item?.thoughts ?? item?.lines, 4, 360).filter(text => text.length >= 8);
    if (!thoughts.length && legacyLine.length >= 8) thoughts.push(legacyLine);
    if (!thoughts.length) return null;
    const title = core_text.normalizeText(item?.title, 80) || core_text.normalizeText(thoughts[0], 18) || `心声 ${index + 1}`;
    const line = thoughts.join(' ');
    return {
        id: core_text.safeId(item?.id, `FIREFLY${String(index + 1).padStart(2, '0')}`),
        color,
        title,
        thoughts,
        line,
        sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
        incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
        generatedAt: Math.max(0, Number(item?.generatedAt) || Date.now()),
    };
}

export function fireflyVoiceKey(item) {
    const text = Array.isArray(item?.thoughts) && item.thoughts.length ? item.thoughts.join(' ') : item?.line;
    return core_incremental.normalizedContentKey(`${item?.title || ''} ${text || ''}`, 1200);
}

export function normalizeFireflyVoicesPart(data, { minTotal = 5, requireDistribution = true, requireRich = true } = {}) {
    const out = (Array.isArray(data?.fireflyVoices) ? data.fireflyVoices : []).slice(0, 6).map(normalizeFireflyVoice).filter(Boolean);
    if (out.length < minTotal) throw new Error(`萤火虫心声不足：${out.length}/${minTotal}。`);
    if (requireRich) {
        const short = out.find(item => !Array.isArray(item.thoughts) || item.thoughts.length < 2 || item.thoughts.join('').length < 70);
        if (short) throw new Error(`萤火虫「${short.title || short.id}」仍然过短；每颗必须是至少 2 段的完整心声主题。`);
    }
    if (requireDistribution) {
        const represented = new Set(out.map(item => item.color));
        if (represented.size < 3) throw new Error(`萤火虫颜色分布过窄：${represented.size}/3。首次至少覆盖 3 种颜色。`);
    }
    return out;
}

export function legacyFireflyVoices(session) {
    return (Array.isArray(session?.fireflyVoices) ? session.fireflyVoices : []).filter(item => !Array.isArray(item?.thoughts) || item.thoughts.length < 2);
}

export function heartFireflyUpgradePrompt(context, core, items) {
    const batch = (Array.isArray(items) ? items : []).slice(0, 6).map(item => ({
        id: core_text.normalizeText(item?.id, 80),
        color: core_text.normalizeText(item?.color, 20),
        legacyLine: core_text.normalizeText(item?.line, 360),
    }));
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 旧版萤火虫心声升级')}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
LEGACY_FIREFLY_BATCH_JSON:
${JSON.stringify(batch, null, 2)}

任务：把这些旧版“一句心声”升级成完整的萤火虫心声主题。必须逐项保持原 id 和 color，不得新增、删除、合并或交换颜色。
严格输出：
{"fireflyVoices":[{"id":"原ID","color":"原颜色","title":"4～18字主题","thoughts":["第一段内心","第二段内心","可选第三/第四段"]}]}
要求：
- 每项 2～4 段 thoughts，每段 20～100 个汉字，总体约 90～280 个汉字。
- 以 legacyLine 的核心情绪为起点自然展开，但不要机械重复原句；要像一次真正被听见的内心活动，有前后递进和收束。
- 不新增历史事实，不把档案里的敏感具体经历重新复述，不替 {{user}} 说话或做决定。
- id / color 必须与输入逐项一致。只输出 JSON。`;
}

export function normalizeFireflyUpgradePart(data, expectedItems) {
    const expected = (Array.isArray(expectedItems) ? expectedItems : []).slice(0, 6);
    if (!expected.length) return [];
    const out = normalizeFireflyVoicesPart(data, { minTotal: expected.length, requireDistribution: false, requireRich: true });
    const byId = new Map(out.map(item => [item.id, item]));
    return expected.map(item => {
        const id = core_text.normalizeText(item?.id, 80);
        const color = core_text.normalizeText(item?.color, 20).toLowerCase();
        const candidate = byId.get(id);
        if (!candidate) throw new Error(`旧版萤火虫升级缺少 ${id}。`);
        if (candidate.color !== color) throw new Error(`旧版萤火虫 ${id} 升级时改变了颜色。`);
        return candidate;
    });
}

export function heartStripsPrompt(context, memoryBank, core, previous = null, sourceMemoryIds = null) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 日常一格')}
UNTRUSTED_HEART_RELATIONSHIP_JSON:
${heartDramaContext(core, memoryBank)}
${previous ? `UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:\n${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}\nEXISTING_STRIP_INDEX_JSON:\n${JSON.stringify((previous.dailyStrips || []).slice(-60).map(item => ({ id: item.id, title: item.title, subtitle: item.subtitle, visualSeed: item.visualSeed })), null, 2)}` : ''}
只生成 2～3 条${previous ? '由新增档案触发、尚未出现的' : ''}轻松日常一格，不生成时期对话、Voice Drama 或 Scenario Drama。
{"dailyStrips":[{"id":"STRIP01","title":"标题","subtitle":"短句","panelCount":2,"panels":[{"caption":"...","action":"...","charLine":"...","userLine":"..."}],"visualSeed":["元素1","元素2","元素3"],"imagePrompt":"Q版/chibi，可见画面，no text, no speech bubble, no watermark"}]}
要求：
- 2～3 条即可，不要凑更多；panelCount 只能 1/2/4，panels 数量必须匹配。
- visualSeed 至少3项；imagePrompt 只写可见画面并明确 no text / no speech bubble / no watermark。
- userLine 只是非正史小剧场台词，不代表用户真实选择。${previous ? '必须避开 EXISTING_STRIP_INDEX_JSON 的标题、动作和梗；旧一格与已绘图片由本地保留。' : ''}只输出 JSON。`;
}

export function normalizeVoiceDramaPart(data, expectedKinds) {
    const raw = Array.isArray(data?.voiceDramas) ? data.voiceDramas : [];
    const out = [];
    for (const expected of expectedKinds) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.kind, 40).toLowerCase() === expected);
        if (!item) throw new Error(`Voice Drama 缺少 ${expected}。`);
        const post = expected === 'postending';
        const script = normalizeHeartScript(item?.script, {
            minLines: post ? 8 : 5,
            maxLines: post ? 24 : 16,
            minChars: post ? 420 : 280,
        });
        if (!script.length) throw new Error(`Voice Drama ${expected} 长度不足。`);
        out.push({
            id: core_text.safeId(item?.id, `VOICE_${expected.toUpperCase()}`),
            kind: expected,
            title: core_text.normalizeText(item?.title, 120) || 'Voice Drama',
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
        });
    }
    return out;
}

export function normalizeScenarioDramaPart(data, expectedSeason = '') {
    const raw = Array.isArray(data?.scenarioDramas) ? data.scenarioDramas : [];
    const seasons = expectedSeason ? [expectedSeason] : ['spring', 'summer', 'autumn', 'winter'];
    const out = [];
    for (const expected of seasons) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.season, 40).toLowerCase() === expected);
        if (!item) throw new Error(`Scenario Drama 缺少 ${expected}。`);
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360 });
        if (!script.length) throw new Error(`Scenario Drama ${expected} 长度不足。`);
        out.push({
            id: core_text.safeId(item?.id, `SCENE_${expected.toUpperCase()}`),
            season: expected,
            title: core_text.normalizeText(item?.title, 120) || `${expected} Scenario Drama`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
        });
    }
    return out;
}

export function normalizeHeartStripsPart(data) {
    const dailyStrips = (Array.isArray(data?.dailyStrips) ? data.dailyStrips : []).slice(0, 3).map((item, index) => {
        const panelCountRaw = Number(item?.panelCount) || (Array.isArray(item?.panels) ? item.panels.length : 2);
        const panelCount = core_constants.HEART_STRIP_PANEL_COUNTS.has(panelCountRaw) ? panelCountRaw : 2;
        const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, panelCount).map(panel => ({
            caption: core_text.normalizeText(panel?.caption, 300),
            action: core_text.normalizeText(panel?.action, 700),
            charLine: core_text.normalizeText(panel?.charLine, 500),
            userLine: core_text.normalizeText(panel?.userLine, 500),
        })).filter(panel => panel.action || panel.caption || panel.charLine || panel.userLine);
        const visualSeed = core_text.cleanArray(item?.visualSeed, 10, 100);
        const imagePrompt = generation_imageGeneration.sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
        if (panels.length !== panelCount || visualSeed.length < 3 || !imagePrompt) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
        };
    }).filter(Boolean);
    if (dailyStrips.length < 2) throw new Error(`日常一格不足：${dailyStrips.length}/2。`);
    return dailyStrips;
}

export async function requestHeartPart(prompt, status, options, validator) {
    return generation_client.requestValidatedSegment(prompt, status, options, validator);
}

export function makeHeartSession(core, existing = null) {
    return {
        kind: core_constants.MODE.HEART,
        title: core.title || existing?.title || 'HEART VOICE / 角色互动',
        relationshipState: core.relationshipState,
        relationshipSummary: core.relationshipSummary,
        relationshipSourceMemoryIds: core.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: core.relationshipSourceMemoryAnchor,
        birthdayMmDd: core.birthdayMmDd || '',
        userBirthdayMmDd: core.userBirthdayMmDd || '',
        specialDays: Array.isArray(core.specialDays) ? core.specialDays : [],
        relationshipHistory: Array.isArray(existing?.relationshipHistory) ? existing.relationshipHistory : [],
        greetings: core.greetings || {},
        voiceDramas: Array.isArray(existing?.voiceDramas) ? existing.voiceDramas : [],
        scenarioDramas: Array.isArray(existing?.scenarioDramas) ? existing.scenarioDramas : [],
        dailyStrips: Array.isArray(existing?.dailyStrips) ? existing.dailyStrips : [],
        fireflyVoices: Array.isArray(existing?.fireflyVoices) ? existing.fireflyVoices : [],
        selectedFireflyId: existing?.selectedFireflyId || '',
        selectedVoiceId: existing?.selectedVoiceId || '',
        selectedScenarioId: existing?.selectedScenarioId || '',
        selectedDramaKey: core_text.normalizeText(existing?.selectedDramaKey, 180),
        selectedStripId: existing?.selectedStripId || '',
        selectedSeason: existing?.selectedSeason || 'postending',
        view: ['seasons', 'strips', 'fireflies'].includes(existing?.view) ? existing.view : 'seasons',
        generationParts: {
            dialogues: true,
            seasons: !!(existing?.voiceDramas?.length || existing?.scenarioDramas?.length),
            strips: !!existing?.dailyStrips?.length,
            fireflies: !!existing?.fireflyVoices?.length,
        },
        generationMeta: existing?.generationMeta && typeof existing.generationMeta === 'object' ? structuredClone(existing.generationMeta) : undefined,
    };
}

export async function generateHeartWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const existing = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(existing, memoryBank, 'dialogues');
    if (existing) {
        const core = await generation_client.requestValidatedSegment(
            heartCoreIncrementPrompt(context, memoryBank, existing, sourceMemoryIds),
            '角色互动 · 正在从新增档案追加时期对话…',
            { maxTokens: 4500, temperature: 0.4, context, origin, taskKey: `${taskKey}:dialogues-increment`, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeHeartCoreIncrement(raw, memoryBank, sourceMemoryIds),
        );
        const { session, added } = mergeHeartCoreIncremental(existing, core);
        const normalized = normalizeHeart(session, memoryBank);
        return core_incremental.stampIncrementalCoverage(normalized, existing, memoryBank, 'dialogues', sourceMemoryIds, added);
    }
    const core = await generation_client.requestValidatedSegment(
        heartCorePrompt(context, memoryBank),
        '角色互动 · 正在生成时期对话…',
        { maxTokens: 6000, temperature: 0.35, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true },
        raw => normalizeHeartCore(raw, memoryBank),
    );
    const normalized = normalizeHeart(makeHeartSession(core, existing), memoryBank);
    return core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'dialogues', sourceMemoryIds, Object.values(core.greetings || {}).flat().length);
}

export function heartDramaItemKey(item, kindKey) {
    const batch = core_text.normalizeText(item?.incrementBatchId, 80);
    return batch
        ? `${kindKey}|batch|${batch}`
        : `${kindKey}|${core_incremental.normalizedContentKey(item?.title, 120)}|${core_incremental.normalizedContentKey(item?.setting, 300)}`;
}

export function appendHeartDramaItem(list, item, kindKey, idPrefix) {
    if (!item) return { list: Array.isArray(list) ? list : [], item: null, added: 0 };
    const out = Array.isArray(list) ? list : [];
    const key = heartDramaItemKey(item, kindKey);
    const existing = out.find(candidate => heartDramaItemKey(candidate, kindKey) === key);
    if (existing) return { list: out, item: existing, added: 0 };
    if (out.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) return { list: out, item: null, added: 0 };
    const usedIds = new Set(out.map(candidate => candidate.id));
    const next = { ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, idPrefix) };
    out.push(next);
    return { list: out, item: next, added: 1 };
}

export function heartStripKey(item) {
    const batch = core_text.normalizeText(item?.incrementBatchId, 80);
    return `${batch ? `batch|${batch}|` : ''}${core_incremental.normalizedContentKey(item?.title, 120)}|${core_incremental.normalizedContentKey(item?.subtitle, 240)}`;
}

export function applyHeartPatchCoverage(updated, base, patch, added) {
    if (!patch?.coveragePart) return updated;
    const ids = core_text.cleanArray(patch.archiveMemoryIds, core_constants.MAX_MEMORY_ITEMS, 40);
    const pseudoBank = {
        archiveRevision: core_text.normalizeText(patch.archiveRevision, 240),
        memories: ids.map(id => ({ id })),
    };
    return core_incremental.stampIncrementalCoverage(
        updated,
        base,
        pseudoBank,
        core_text.normalizeText(patch.coveragePart, 80),
        core_text.cleanArray(patch.coverageConsumedMemoryIds || patch.sourceMemoryIds, core_constants.MAX_MEMORY_ITEMS, 40),
        added,
    );
}

export function applyHeartPartialPatch(base, patch) {
    let updated = structuredClone(base || {});
    if (!patch || typeof patch !== 'object') return updated;
    let added = 0;
    if (patch.type === 'dialogues' && patch.core) {
        updated = makeHeartSession(patch.core, updated);
    } else if (patch.type === 'dialogues-increment' && patch.core) {
        const merged = mergeHeartCoreIncremental(updated, patch.core);
        updated = merged.session;
        added += merged.added;
    } else if (patch.type === 'strips' && Array.isArray(patch.dailyStrips)) {
        const out = Array.isArray(updated.dailyStrips) ? updated.dailyStrips : [];
        const seen = new Set(out.map(heartStripKey));
        const usedIds = new Set(out.map(item => item.id));
        let latest = null;
        for (const strip of patch.dailyStrips) {
            const key = heartStripKey(strip);
            if (!key || seen.has(key) || out.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
            seen.add(key);
            latest = { ...structuredClone(strip), id: core_incremental.uniqueGeneratedId(strip.id, usedIds, 'STRIP') };
            out.push(latest);
            added += 1;
        }
        updated.dailyStrips = out;
        updated.selectedStripId = latest?.id || updated.selectedStripId || '';
        updated.generationParts = { ...(updated.generationParts || {}), strips: true };
        updated.view = 'strips';
    } else if (patch.type === 'fireflies' && Array.isArray(patch.fireflyVoices)) {
        const out = Array.isArray(updated.fireflyVoices) ? updated.fireflyVoices : [];
        const seen = new Set(out.map(fireflyVoiceKey).filter(Boolean));
        const usedIds = new Set(out.map(item => item.id));
        let latest = null;
        for (const voice of patch.fireflyVoices) {
            const key = fireflyVoiceKey(voice);
            if (!key || seen.has(key) || out.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) continue;
            seen.add(key);
            latest = { ...structuredClone(voice), id: core_incremental.uniqueGeneratedId(voice.id, usedIds, 'FIREFLY') };
            out.push(latest);
            added += 1;
        }
        updated.fireflyVoices = out;
        updated.selectedFireflyId = latest?.id || updated.selectedFireflyId || out[0]?.id || '';
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
        updated.view = 'fireflies';
    } else if (patch.type === 'firefly-upgrade' && Array.isArray(patch.fireflyVoices)) {
        const replacements = new Map(patch.fireflyVoices.map(item => [core_text.normalizeText(item?.id, 80), item]));
        const out = (Array.isArray(updated.fireflyVoices) ? updated.fireflyVoices : []).map(item => {
            const next = replacements.get(core_text.normalizeText(item?.id, 80));
            if (!next || next.color !== item.color) return item;
            added += 1;
            return {
                ...structuredClone(item),
                title: next.title,
                thoughts: structuredClone(next.thoughts),
                line: next.line,
                upgradedAt: Date.now(),
            };
        });
        updated.fireflyVoices = out;
        const lastUpgraded = [...patch.fireflyVoices].reverse().find(item => out.some(existing => existing.id === item.id));
        if (lastUpgraded) updated.selectedFireflyId = lastUpgraded.id;
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
        updated.view = 'fireflies';
    } else if (patch.type === 'season') {
        const season = core_text.normalizeText(patch.season, 40).toLowerCase();
        if (patch.voice?.kind === season) {
            const result = appendHeartDramaItem(updated.voiceDramas, patch.voice, `voice:${season}`, 'VOICE');
            updated.voiceDramas = result.list;
            if (result.item) {
                updated.selectedVoiceId = result.item.id;
                updated.selectedDramaKey = `voice:${result.item.id}`;
            }
            added += result.added;
        }
        if (season !== 'postending' && patch.scenario?.season === season) {
            const result = appendHeartDramaItem(updated.scenarioDramas, patch.scenario, `scenario:${season}`, 'SCENE');
            updated.scenarioDramas = result.list;
            if (result.item) {
                updated.selectedScenarioId = result.item.id;
                updated.selectedDramaKey = `scenario:${result.item.id}`;
            }
            added += result.added;
        }
        updated.selectedSeason = season || updated.selectedSeason || 'postending';
        updated.generationParts = { ...(updated.generationParts || {}), seasons: true };
        updated.view = 'seasons';
    }
    return applyHeartPatchCoverage(updated, base, patch, added);
}

export function mergeDeferredHeartPatches(existing, incoming) {
    return { ...(existing || {}), ...(incoming || {}) };
}

export async function persistHeartPartialPatch(patchKey, patch, fallbackBase, memoryBank, origin, expectedChatId, expectedArchiveRevision) {
    let committed = false;
    let updated = null;
    if (core_context.isCurrentTaskOrigin(origin)) {
        try {
            const context = core_context.currentCharacterGuard();
            const latestMemory = archive_repository.requireArchive(context);
            if (latestMemory.archiveRevision === expectedArchiveRevision) {
                const latest = core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: expectedChatId, memoryBank: latestMemory, clone: true }) || structuredClone(fallbackBase);
                updated = normalizeHeart(applyHeartPartialPatch(latest, patch), latestMemory);
                updated.chatId = expectedChatId;
                updated.archiveRevision = expectedArchiveRevision;
                committed = core_cache.saveSession(core_constants.MODE.HEART, updated, expectedChatId);
            }
        } catch {}
    }
    if (!committed) {
        core_requestCoordinator.queueDeferredCommit(origin, { kind: 'heartPatches', patches: { [patchKey]: patch } });
        updated = normalizeHeart(applyHeartPartialPatch(fallbackBase, patch), memoryBank);
        updated.chatId = expectedChatId;
        updated.archiveRevision = expectedArchiveRevision;
    }
    if (committed && runtimeState.activeSession?.kind === core_constants.MODE.HEART) {
        runtimeState.activeSession = updated;
        ui_heartView.renderHeart();
    }
    return { updated, committed };
}

export async function generateHeartSection(part) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    if (part === 'seasons') return void generateHeartSeasonSection(runtimeState.activeSession.selectedSeason || 'postending');
    if (part === 'fireflies') return void generateHeartFirefliesSection();
    const normalizedPart = ['dialogues', 'strips'].includes(part) ? part : '';
    if (!normalizedPart) return;
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const scope = core_context.chatScopeKey(context);
    const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const taskKey = `heart-part:${scope}:${normalizedPart}`;
    if (core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.('这一项已经在生成中。', '心跳回忆');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`, '心跳回忆');
        return;
    }
    const base = structuredClone(runtimeState.activeSession);
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(base, memoryBank, normalizedPart);
    if (!sourceMemoryIds.length) {
        globalThis.toastr?.info?.(`当前档案没有尚未用于${normalizedPart === 'dialogues' ? '时期对话' : '日常一格'}的新记忆。先增量更新档案，再来追加。`, '心跳回忆');
        return;
    }
    const coverage = {
        coveragePart: normalizedPart,
        sourceMemoryIds,
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        if (normalizedPart === 'dialogues') {
            const core = await generation_client.requestValidatedSegment(
                heartCoreIncrementPrompt(context, memoryBank, base, sourceMemoryIds),
                '角色互动 · 追加时期对话',
                { maxTokens: 4500, temperature: 0.4, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeHeartCoreIncrement(raw, memoryBank, sourceMemoryIds),
            );
            await persistHeartPartialPatch('dialogues', { type: 'dialogues-increment', core, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision);
        } else {
            const strips = await requestHeartPart(
                heartStripsPrompt(context, memoryBank, base, base, sourceMemoryIds),
                '角色互动 · 追加日常一格',
                { maxTokens: 5000, context, origin, taskKey: `${taskKey}:strips`, mode: core_constants.MODE.HEART, background: true },
                normalizeHeartStripsPart,
            );
            const batchId = core_incremental.incrementalBatchId('strips', sourceMemoryIds);
            const enriched = strips.map(item => ({ ...item, sourceArchiveMemoryIds: sourceMemoryIds, incrementBatchId: batchId, generatedAt: Date.now() }));
            await persistHeartPartialPatch('strips', { type: 'strips', dailyStrips: enriched, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision);
        }
        globalThis.toastr?.success?.(`角色互动已追加：${normalizedPart === 'dialogues' ? '时期对话' : '日常一格'}；旧内容保持不变。`, '心跳回忆');
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), '心跳回忆');
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    }
}

export async function generateHeartFirefliesSection() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const scope = core_context.chatScopeKey(context);
    const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const taskKey = `heart-fireflies:${scope}`;
    if (core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.('萤火虫栖息地正在点亮。', '心跳回忆');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`, '心跳回忆');
        return;
    }
    const base = structuredClone(runtimeState.activeSession);
    const hasExisting = Array.isArray(base.fireflyVoices) && base.fireflyVoices.length > 0;
    const legacyBatch = legacyFireflyVoices(base).slice(0, 6);
    if (legacyBatch.length) {
        runtimeState.activeModeBuildScopes.add(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        try {
            const upgraded = await requestHeartPart(
                heartFireflyUpgradePrompt(context, base, legacyBatch),
                '角色互动 · 正在把旧版萤火虫升级为完整心声…',
                { maxTokens: 5200, temperature: 0.72, context, origin, taskKey: `${taskKey}:upgrade`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeFireflyUpgradePart(raw, legacyBatch),
            );
            const result = await persistHeartPartialPatch('firefly-upgrade', { type: 'firefly-upgrade', fireflyVoices: upgraded }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision);
            const remain = legacyFireflyVoices(result.updated || base).length;
            globalThis.toastr?.success?.(`已升级 ${upgraded.length} 个旧光点为完整心声${remain ? `，还剩 ${remain} 个可继续升级` : '，旧版短句已全部升级'}.`, '心跳回忆');
        } catch (error) {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), '心跳回忆');
        } finally {
            runtimeState.activeModeBuildScopes.delete(taskKey);
            core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        }
        return;
    }
    if (hasExisting && base.fireflyVoices.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) {
        globalThis.toastr?.info?.(`萤火虫栖息地已经收集到 ${core_constants.HEART_FIREFLY_MAX_ITEMS} 个心声光点；旧光点不会自动删除。`, '心跳回忆');
        return;
    }
    const existingFireflyCursor = core_incremental.incrementalPartRecord(base, 'fireflies');
    if (hasExisting && !existingFireflyCursor) {
        const migrated = core_incremental.stampIncrementalCoverage(structuredClone(base), base, memoryBank, 'fireflies', core_incremental.archiveMemoryIds(memoryBank), 0);
        migrated.chatId = expectedChatId;
        migrated.archiveRevision = expectedArchiveRevision;
        if (core_cache.saveSession(core_constants.MODE.HEART, migrated, expectedChatId)) {
            runtimeState.activeSession = migrated;
            ui_heartView.renderHeart();
        }
        globalThis.toastr?.info?.('已把旧版萤火虫保存为永久解锁基线。之后档案出现新的 Mxxx 时，只会继续追加新光点。', '心跳回忆');
        return;
    }
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(base, memoryBank, 'fireflies');
    if (hasExisting && !sourceMemoryIds.length) {
        globalThis.toastr?.info?.('当前档案没有新的关系进展可用于解锁萤火虫。先增量更新当前窗口档案，再来点亮新的光点。', '心跳回忆');
        return;
    }
    const coverage = {
        coveragePart: 'fireflies',
        sourceMemoryIds,
        coverageConsumedMemoryIds: hasExisting ? sourceMemoryIds : core_incremental.archiveMemoryIds(memoryBank),
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        const voices = await requestHeartPart(
            heartFireflyPrompt(context, memoryBank, base, hasExisting ? base : null, sourceMemoryIds),
            hasExisting ? '角色互动 · 正在解锁新的萤火虫心声…' : '角色互动 · 正在点亮萤火虫栖息地…',
            { maxTokens: 5200, temperature: 0.8, context, origin, taskKey, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeFireflyVoicesPart(raw, { minTotal: 5, requireDistribution: !hasExisting, requireRich: true }),
        );
        const batchId = core_incremental.incrementalBatchId('fireflies', sourceMemoryIds);
        const enriched = voices.map(item => ({
            ...item,
            sourceArchiveMemoryIds: sourceMemoryIds,
            incrementBatchId: batchId,
            generatedAt: Date.now(),
        }));
        const result = await persistHeartPartialPatch('fireflies', { type: 'fireflies', fireflyVoices: enriched, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision);
        const total = result.updated?.fireflyVoices?.length || base.fireflyVoices?.length || 0;
        const addedNow = Math.max(0, total - (base.fireflyVoices?.length || 0));
        globalThis.toastr?.success?.(hasExisting ? `新增 ${addedNow} 个萤火虫心声；旧光点继续保留，共 ${total} 个。` : `萤火虫栖息地已点亮 ${total} 个心声光点。`, '心跳回忆');
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), '心跳回忆');
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    }
}

export function pendingHeartDramaBatchId(session, season) {
    if (!session || season === 'postending') return '';
    const voices = (Array.isArray(session.voiceDramas) ? session.voiceDramas : []).filter(item => item.kind === season && core_text.normalizeText(item.incrementBatchId, 80));
    const scenarios = (Array.isArray(session.scenarioDramas) ? session.scenarioDramas : []).filter(item => item.season === season && core_text.normalizeText(item.incrementBatchId, 80));
    const voiceIds = new Set(voices.map(item => core_text.normalizeText(item.incrementBatchId, 80)));
    const scenarioIds = new Set(scenarios.map(item => core_text.normalizeText(item.incrementBatchId, 80)));
    const candidates = [...voices, ...scenarios]
        .sort((a, b) => (Number(b?.generatedAt) || 0) - (Number(a?.generatedAt) || 0))
        .map(item => core_text.normalizeText(item?.incrementBatchId, 80))
        .filter(Boolean);
    return candidates.find(id => voiceIds.has(id) !== scenarioIds.has(id)) || '';
}

export function nextHeartDramaBatchId(session, season) {
    const pending = pendingHeartDramaBatchId(session, season);
    if (pending) return pending;
    const voiceCount = (Array.isArray(session?.voiceDramas) ? session.voiceDramas : []).filter(item => item.kind === season).length;
    const scenarioCount = (Array.isArray(session?.scenarioDramas) ? session.scenarioDramas : []).filter(item => item.season === season).length;
    return core_context.stableArchiveHash(`heart-drama|${season}|${voiceCount}|${scenarioCount}|${Date.now()}|${Math.random()}`);
}

export async function generateHeartSeasonSection(season) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const allowed = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);
    const normalizedSeason = allowed.has(season) ? season : '';
    if (!normalizedSeason) return;
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const scope = core_context.chatScopeKey(context);
    const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const taskKey = `heart-season:${scope}:${normalizedSeason}`;
    if (core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(`${ui_heartView.heartSeasonLabel(normalizedSeason)}正在生成中。`, '心跳回忆');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`, '心跳回忆');
        return;
    }
    const base = structuredClone(runtimeState.activeSession);
    const latestSession = () => core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: expectedChatId, memoryBank, clone: true }) || structuredClone(base);
    const batchId = nextHeartDramaBatchId(base, normalizedSeason);
    const enrichVoice = item => ({
        ...item,
        sourceArchiveMemoryIds: [],
        incrementBatchId: batchId,
        generatedAt: Date.now(),
    });
    const enrichScenario = item => ({
        ...item,
        sourceArchiveMemoryIds: [],
        incrementBatchId: batchId,
        generatedAt: Date.now(),
    });

    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    const errors = [];
    let savedParts = 0;
    try {
        if (normalizedSeason === 'postending') {
            const latest = latestSession();
            try {
                const voice = enrichVoice((await requestHeartPart(
                    heartPostVoicePrompt(context, memoryBank, latest, latest, null),
                    '角色互动 · 追加未来 / 后日谈',
                    { maxTokens: 3800, temperature: 0.65, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true },
                    raw => normalizeVoiceDramaPart(raw, ['postending']),
                ))[0]);
                await persistHeartPartialPatch(`season:postending:${batchId}:voice`, { type: 'season', season: 'postending', voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision);
                savedParts += 1;
            } catch (error) {
                errors.push(error);
            }
        } else {
            let latest = latestSession();
            let voice = latest.voiceDramas?.find(item => item.kind === normalizedSeason && item.incrementBatchId === batchId) || null;
            let scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || null;

            if (!voice) {
                try {
                    voice = enrichVoice((await requestHeartPart(
                        heartSeasonVoicePrompt(context, memoryBank, latest, normalizedSeason, latest, null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Voice`,
                        { maxTokens: 3000, temperature: 0.65, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true },
                        raw => normalizeVoiceDramaPart(raw, [normalizedSeason]),
                    ))[0]);
                    await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:voice`, { type: 'season', season: normalizedSeason, voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision);
                    savedParts += 1;
                    latest = latestSession();
                } catch (error) {
                    errors.push(error);
                }
            }

            scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || scenario;
            if (!scenario) {
                try {
                    scenario = enrichScenario((await requestHeartPart(
                        heartSeasonScenarioPrompt(context, memoryBank, latest, normalizedSeason, latest, null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Scenario`,
                        { maxTokens: 3200, temperature: 0.65, context, origin, taskKey: `${taskKey}:scenario`, mode: core_constants.MODE.HEART, background: true },
                        raw => normalizeScenarioDramaPart(raw, normalizedSeason),
                    ))[0]);
                    await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:scenario`, { type: 'season', season: normalizedSeason, scenario }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision);
                    savedParts += 1;
                } catch (error) {
                    errors.push(error);
                }
            }
        }

        if (errors.length && !savedParts) throw errors[0];
        if (errors.length) {
            globalThis.toastr?.warning?.(`${ui_heartView.heartSeasonLabel(normalizedSeason)}已保存成功部分；再次点击会补完本次缺失部分。`, '心跳回忆');
        } else {
            globalThis.toastr?.success?.(`已追加：${ui_heartView.heartSeasonLabel(normalizedSeason)}未来日常 Drama。`, '心跳回忆');
        }
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), `心跳回忆 · ${ui_heartView.heartSeasonLabel(normalizedSeason)} Drama`);
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    }
}

export function normalizeHeartScript(rawLines, { minLines = 8, maxLines = 28, minChars = 500 } = {}) {
    const allowedSpeakers = new Set(['char', 'user', 'narrator']);
    const lines = (Array.isArray(rawLines) ? rawLines : []).slice(0, maxLines).map((line, index) => {
        const speakerRaw = core_text.normalizeText(line?.speaker, 40).toLowerCase();
        const speaker = allowedSpeakers.has(speakerRaw) ? speakerRaw : (index % 4 === 0 ? 'narrator' : 'char');
        const text = core_text.normalizeText(line?.text, 1800);
        if (!text) return null;
        return { speaker, text };
    }).filter(Boolean);
    if (lines.length < minLines || lines.reduce((sum, line) => sum + line.text.length, 0) < minChars) return [];
    return lines;
}

export function normalizeHeart(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw new Error('角色互动台词库缺少关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) {
        throw new Error('角色互动台词库缺少真实关系锚点。');
    }

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 40, 600);
    }
    for (const key of ['morning', 'noon', 'evening', 'night', 'weekend']) {
        if (greetings[key].length < 2) throw new Error(`角色互动“${key}”台词不足 2 条。`);
    }
    for (const key of ['birthday', 'userBirthday', 'holiday', 'absenceWorry', 'absenceSulky']) {
        if (greetings[key].length < 1) throw new Error(`角色互动“${key}”台词不足 1 条。`);
    }

    const birthdayRaw = core_text.normalizeText(data?.birthdayMmDd, 20);
    const birthdayMmDd = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(birthdayRaw) ? birthdayRaw : '';
    const userBirthdayRaw = core_text.normalizeText(data?.userBirthdayMmDd, 20);
    const userBirthdayMmDd = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(userBirthdayRaw) ? userBirthdayRaw : '';
    const specialDays = (Array.isArray(data?.specialDays) ? data.specialDays : []).slice(0, 60).map((item, index) => {
        const mmdd = core_text.normalizeText(item?.mmdd, 20);
        const label = core_text.normalizeText(item?.label, 80) || `特别日 ${index + 1}`;
        const line = core_text.normalizeText(item?.line, 600);
        if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(mmdd) || !line) return null;
        return { mmdd, label, line };
    }).filter(Boolean);

    const voiceDramas = (Array.isArray(data?.voiceDramas) ? data.voiceDramas : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const kindRaw = core_text.normalizeText(item?.kind, 40).toLowerCase();
        const kind = core_constants.HEART_VOICE_KINDS.has(kindRaw) ? kindRaw : '';
        if (!kind) return null;
        const script = normalizeHeartScript(item?.script, {
            minLines: kind === 'postending' ? 8 : 5,
            maxLines: kind === 'postending' ? 24 : 16,
            minChars: kind === 'postending' ? 420 : 280,
        });
        if (!script.length) return null;
        return {
            id: core_text.safeId(item?.id, `VOICE${String(index + 1).padStart(2, '0')}`),
            kind,
            title: core_text.normalizeText(item?.title, 120) || 'Voice Drama',
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const scenarioDramas = (Array.isArray(data?.scenarioDramas) ? data.scenarioDramas : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const seasonRaw = core_text.normalizeText(item?.season, 40).toLowerCase();
        const season = core_constants.HEART_SCENARIO_SEASONS.has(seasonRaw) ? seasonRaw : '';
        if (!season) return null;
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360 });
        if (!script.length) return null;
        return {
            id: core_text.safeId(item?.id, `SCENE${String(index + 1).padStart(2, '0')}`),
            season,
            title: core_text.normalizeText(item?.title, 120) || `${season} Scenario Drama`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const dailyStrips = (Array.isArray(data?.dailyStrips) ? data.dailyStrips : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const panelCountRaw = Number(item?.panelCount) || (Array.isArray(item?.panels) ? item.panels.length : 2);
        const panelCount = core_constants.HEART_STRIP_PANEL_COUNTS.has(panelCountRaw) ? panelCountRaw : 2;
        const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, panelCount).map((panel, panelIndex) => ({
            caption: core_text.normalizeText(panel?.caption, 300),
            action: core_text.normalizeText(panel?.action, 700),
            charLine: core_text.normalizeText(panel?.charLine, 500),
            userLine: core_text.normalizeText(panel?.userLine, 500),
        })).filter(panel => panel.action || panel.caption || panel.charLine || panel.userLine);
        if (panels.length !== panelCount) return null;
        const visualSeed = core_text.cleanArray(item?.visualSeed, 10, 100);
        const imagePrompt = generation_imageGeneration.sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
        if (!imagePrompt || visualSeed.length < 3) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const fireflyVoices = (Array.isArray(data?.fireflyVoices) ? data.fireflyVoices : []).slice(0, core_constants.HEART_FIREFLY_MAX_ITEMS).map(normalizeFireflyVoice).filter(Boolean);

    return {
        kind: core_constants.MODE.HEART,
        title: core_text.normalizeText(data?.title, 120) || 'HEART VOICE / 角色互动',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        birthdayMmDd,
        userBirthdayMmDd,
        specialDays,
        relationshipHistory: (Array.isArray(data?.relationshipHistory) ? data.relationshipHistory : []).slice(-60).map(item => ({
            relationshipState: core_text.normalizeText(item?.relationshipState, 120),
            relationshipSummary: core_text.normalizeText(item?.relationshipSummary, 1800),
            relationshipSourceMemoryIds: core_text.cleanArray(item?.relationshipSourceMemoryIds, 24, 40),
            relationshipSourceMemoryAnchor: core_text.normalizeText(item?.relationshipSourceMemoryAnchor, 160),
            archivedAt: Math.max(0, Number(item?.archivedAt) || 0),
        })).filter(item => item.relationshipSummary),
        greetings,
        voiceDramas,
        scenarioDramas,
        dailyStrips,
        fireflyVoices,
        selectedFireflyId: core_text.normalizeText(data?.selectedFireflyId, 80) || fireflyVoices[0]?.id || '',
        selectedVoiceId: core_text.normalizeText(data?.selectedVoiceId, 80) || voiceDramas[0]?.id || '',
        selectedScenarioId: core_text.normalizeText(data?.selectedScenarioId, 80) || scenarioDramas[0]?.id || '',
        selectedDramaKey: core_text.normalizeText(data?.selectedDramaKey, 180),
        selectedStripId: core_text.normalizeText(data?.selectedStripId, 80) || dailyStrips[0]?.id || '',
        generationParts: {
            dialogues: data?.generationParts?.dialogues !== false && !!Object.values(greetings).some(lines => lines.length),
            seasons: data?.generationParts?.seasons === true || voiceDramas.length > 0 || scenarioDramas.length > 0,
            strips: data?.generationParts?.strips === true || dailyStrips.length > 0,
            fireflies: data?.generationParts?.fireflies === true || fireflyVoices.length > 0,
        },
        selectedSeason: ['postending', 'spring', 'summer', 'autumn', 'winter'].includes(data?.selectedSeason) ? data.selectedSeason : 'postending',
        view: ['seasons', 'strips', 'fireflies'].includes(data?.view) ? data.view : 'seasons',
        generationMeta: data?.generationMeta && typeof data.generationMeta === 'object' ? structuredClone(data.generationMeta) : undefined,
    };
}
