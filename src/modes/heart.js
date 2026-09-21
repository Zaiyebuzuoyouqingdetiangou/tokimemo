import * as cg_visual from '../core/cgVisualRules.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_heartLanguage from '../core/heartLanguage.js';
import * as core_dialogue from '../core/dialogue.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_participants from '../core/participants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as generation_prompts from '../generation/prompts.js';
import * as generation_recovery from '../generation/recovery.js';
import * as ui_heartView from '../ui/heartView.js';
import * as ui_heartReader from '../ui/heartReaderState.js';
import * as ui_overlay from '../ui/overlay.js';

function showSavedHeartTaskResult(draftId, context) {
    try { Promise.resolve(ui_overlay.presentGenerationTaskResult?.(draftId, context)).catch(() => {}); }
    catch { /* Saved paid content remains available if the current view cannot open. */ }
}

export function normalizeHeartCore(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw core_text.safeUserError('角色互动时期对话缺少关系摘要。', 'RMT_HEART_INCOMPLETE');
    const relationshipReference = core_evidence.normalizeMemoryReference(data?.relationshipSourceMemoryIds, data?.relationshipSourceMemoryAnchor, `${relationshipState}\n${relationshipSummary}`, memoryBank, 1);
    // HEART dialogue is present/future character interaction, not a historical claim.
    // If the archive cannot prove a relationship stage, keep evidence empty and use the
    // controlled character/persona/world context only for characterization.

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) greetings[key] = core_text.cleanArray(data?.greetings?.[key], 6, 600);
    if (!Object.values(greetings).some(lines => lines.length)) {
        throw core_text.safeUserError('这次没有可保存的基础语言；旧台词保留。', 'RMT_HEART_INCOMPLETE');
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
greetings 和 specialDays.line 是 {{char}} 直接对 {{user}} 说的话；只写台词，不混入动作、旁白或其他人的发言。
UNTRUSTED_HEART_ARCHIVE_JSON:
${generation_prompts.endingArchiveSlice(memoryBank, 40)}

严格输出字段：title, relationshipState, relationshipSummary, relationshipSourceMemoryIds, relationshipSourceMemoryAnchor, birthdayMmDd, userBirthdayMmDd, specialDays, greetings。
- morning/noon/evening/night/weekend 建议各 2～3 条，可按实际内容少写或留空；数量不是配额。
- holiday/absenceWorry/absenceSulky 可写 0～2 条；没有合适台词的类别留空。absenceJealous 只有关系适合时写 0～2 条。不为补数生成重复句；每条台词必须完整。
- birthday/userBirthday 不属于本次必生成内容，不主动补生日祝福，可以省略或留空；只有用户单独选择相应生日类别时才生成该类。生日日期没有明确设定就留空，不猜日期。
- relationship 优先使用真实档案 sourceMemoryIds + sourceMemoryAnchor；如果当前档案没有足够关系证据，不要伪造 ID/anchor，两个字段留空，并依据角色卡、Persona、世界观中明确的人设保持保守的互动基线。
- 无真实关系证据时不得擅自升级为已恋爱、已告白、已同居等既成事实；这些只是角色化台词，不写回历史事实，不替 {{user}} 创造真实决定。
- 不要输出 voiceDramas / scenarioDramas / dailyStrips。只输出 JSON。`;
}

// Exact prior wording is only a legacy-request authenticator; it is never sent
// for a fresh generation. Existing successful drafts keep their original slot.
export function heartCoreLegacyPrompt(context, memoryBank) {
    return heartCorePrompt(context, memoryBank).replace("- holiday/absenceWorry/absenceSulky 可写 0～2 条；没有合适台词的类别留空。absenceJealous 只有关系适合时写 0～2 条。不为补数生成重复句；每条台词必须完整。\n- birthday/userBirthday 不属于本次必生成内容，不主动补生日祝福，可以省略或留空；只有用户单独选择相应生日类别时才生成该类。生日日期没有明确设定就留空，不猜日期。", "- birthday/userBirthday/holiday/absenceWorry/absenceSulky 建议各 1～2 条；没有合适台词的类别留空。absenceJealous 只有关系适合时写 0～2 条。不为补数生成重复句；每条台词必须完整。");
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
greetings 和 specialDays.line 是 {{char}} 直接对 {{user}} 说的话；只写台词，不混入动作、旁白或其他人的发言。
UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_HEART_DIALOGUES_JSON:
${JSON.stringify(compactHeartDialoguesExisting(existing), null, 2)}

严格输出字段：relationshipState, relationshipSummary, relationshipSourceMemoryIds, relationshipSourceMemoryAnchor, birthdayMmDd, userBirthdayMmDd, specialDays, greetings。
- relationship 优先说明新增档案能证明的最新阶段并给出真实 ID + anchor；如果新增档案不足以证明关系变化，不要伪造证据，关系证据字段留空，本地会保留旧关系阶段，新增台词可继续按角色人设与既有关系边界生成。
- greetings 每一类只写 0～2 条真正新的台词；至少一个分类有新增内容。必须避开 EXISTING_HEART_DIALOGUES_JSON 中的原句与近义复述。
- specialDays 只补新增档案能确定的新日期；不知道就空数组。生日不知道就空字符串。
- 不输出旧台词，不输出 Drama / Scenario / dailyStrips。只输出 JSON。`;
}

export function normalizeHeartCoreIncrement(data, memoryBank, sourceMemoryIds) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系继续发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw core_text.safeUserError('角色互动增量缺少关系摘要。', 'RMT_HEART_INCOMPLETE');
    const reference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    const hasIncrementalRelationshipEvidence = !!reference.sourceMemoryIds.length
        && !!reference.sourceMemoryAnchor
        && core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds);
    // No proven relationship change is a valid HEART increment: keep evidence empty so the
    // merge preserves the previous relationship stage while still accepting new persona-led lines.
    const relationshipSourceMemoryIds = hasIncrementalRelationshipEvidence ? reference.sourceMemoryIds : [];
    const relationshipSourceMemoryAnchor = hasIncrementalRelationshipEvidence ? reference.sourceMemoryAnchor : '';
    const greetings = {};
    let total = 0;
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 2, 600);
        total += greetings[key].length;
    }
    if (!total) throw core_text.safeUserError('角色互动增量没有生成任何新台词。', 'RMT_HEART_INCOMPLETE');
    return {
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor,
        birthdayMmDd: core_text.normalizeText(data?.birthdayMmDd, 20),
        userBirthdayMmDd: core_text.normalizeText(data?.userBirthdayMmDd, 20),
        specialDays: Array.isArray(data?.specialDays) ? data.specialDays : [],
        greetings,
    };
}

export function mergeHeartCoreIncremental(existing, core, preserveRelationship = false) {
    if (preserveRelationship) core = { ...core,
        relationshipState: existing.relationshipState, relationshipSummary: existing.relationshipSummary,
        relationshipSourceMemoryIds: existing.relationshipSourceMemoryIds, relationshipSourceMemoryAnchor: existing.relationshipSourceMemoryAnchor };
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
${core_dialogue.DIALOGUE_CONTRACT}
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
${core_dialogue.DIALOGUE_CONTRACT}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${previous ? `EXISTING_${season.toUpperCase()}_DRAMA_INDEX_JSON:
${JSON.stringify(compactHeartSeasonExisting(previous, season), null, 2)}` : ''}
本请求只生成【${label} Voice Drama ${previous ? '新增一篇' : '首篇'}】，不要生成 Scenario：
{"voiceDramas":[{"id":"VOICE_${season.toUpperCase()}","kind":"${season}","title":"${label} Voice Drama","subtitle":"...","setting":"...","visualTone":"soft|clear|muted|deep","script":[{"speaker":"char","text":"..."},{"speaker":"user","text":"..."}]}]}
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
${core_dialogue.DIALOGUE_CONTRACT}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${previous ? `EXISTING_${season.toUpperCase()}_DRAMA_INDEX_JSON:
${JSON.stringify(compactHeartSeasonExisting(previous, season), null, 2)}` : ''}
本请求只生成【${label} Scenario Drama ${previous ? '新增一篇' : '首篇'}】，不要生成 Voice：
{"scenarioDramas":[{"id":"SCENE_${season.toUpperCase()}","season":"${season}","title":"${label} Scenario Drama","subtitle":"普通一天里的小事件","setting":"...","visualTone":"soft|clear|muted|deep","script":[{"speaker":"narrator","text":"..."},{"speaker":"char","text":"..."},{"speaker":"user","text":"..."}]}]}
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
        excerpt: core_text.normalizeText(
            (Array.isArray(item?.script) && item.script.length
                ? item.script.map(node => node?.text).join(' ')
                : (Array.isArray(item?.thoughts) ? item.thoughts : [item?.line].filter(Boolean)).join(' ')),
            260,
        ),
    }));
    const incremental = existing.length > 0;
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 萤火虫栖息地')}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
${incremental ? `UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_FIREFLY_TOPICS_JSON:
${JSON.stringify(existing, null, 2)}` : ''}
这里要模拟的是 GS4「ホタルの住処」那种【追加约会会话】，不是把“心の声”误解成一整页 {{char}} 的内心独白。
一个光点 = 一个当场展开的话题。{{char}} 会因为这里“能听见心声”的气氛，不小心把本音、烦恼、朋友话题或很有个人特色的想法说出口；{{user}} 会有极短的即时回应，话题继续推进，最后可以用一条 user_thought 表示“刚才那句难道是他的心声？”之类的即时感受。
${incremental ? '旧光点由本地永久保留。本请求只根据本轮新增档案带来的关系变化，解锁尚未出现的新话题；绝对不要改写、覆盖或近义复述旧话题。' : '这是首次点亮，请生成少量但彼此明显不同的追加约会话题。'}

严格输出：
{"fireflyVoices":[{"id":"F01","color":"pink|blue|yellow|white|desire","title":"4～18字话题标题","script":[{"speaker":"char","text":"..."},{"speaker":"user","text":"..."},{"speaker":"char","text":"..."},{"speaker":"user_thought","text":"..."}]}]}

颜色含义要按 GS4 的分类来写：
- pink 💗【恋爱】：{{char}} 对 {{user}} 的恋爱情绪、喜欢、特别感、想更靠近等。
- blue 💙【恋爱的烦恼】：吃醋、没有把握、担心关系、竞争意识、怕失去、想确认 {{user}} 的心情等。
- yellow 💛【朋友】：{{char}} 的朋友、同学、同事、朋友圈/小团体、他怎么看身边的人；只有角色卡、世界书或当前档案明确存在的人物才能点名，不能凭空编固定朋友。
- white 🤍【个性话题】：最能体现这个角色自己的有趣话题，例如梦想、兴趣、喜欢的食物、工作/学习习惯、日常怪癖、童年小事、宠物、价值观等；涉及具体事实时必须来自受控角色卡/世界书，不要把它写成“脆弱与秘密”专栏。
- desire ♥️【本插件扩展，不是 GS4 原四色】：对 {{user}} 更直接的渴望或身体亲近愿望。仍然写成现场对话，不写色情过程或露骨身体细节。

会话结构：
- 每颗必须是 5～10 个 script 节点，总文本约 140～420 个汉字；至少 3 条 char 台词，至少 1 条 user 台词。
- speaker 只允许 char / user / user_thought。user_thought 最多 1 条，只能放在最后，表示即时感受或“刚才是不是心声”的疑问。
- user 台词只是【非正史的中性即时反应】（例如疑问、确认、轻笑、短回应），不得替 {{user}} 新增偏好、承诺、重大决定、行动或历史事实。
- 重点是两个人【当场说话】。不要连续写“她怎么怎样 / 她又怎样 / 她让我怎样”这种第三人称总结；{{char}} 应直接面对 {{user}} 说话或自然谈论当前话题。
- 不要把全部话题都写成爱情。yellow 和 white 必须真正承担“朋友 / 个性话题”的内容，使 {{char}} 像一个有自己生活和人际的人，而不是所有句子都围着 {{user}} 转。
- 话题可以让“心声”以不小心说漏嘴、突然坦白、自己也困惑为什么说出来等方式泄露；不要求每句都是内心旁白。
- 不把会话当成当前聊天已经发生的历史事实。新增档案只用于决定可解锁的话题和关系阶段，不得逐字搬运敏感经历。

数量和分布：
- ${incremental ? '本轮建议新增 5～6 个真正新的话题；可以少于建议数量，不要求五色平均。优先让不同颜色承担不同主题，♥️ 只在关系与人设适合时出现。' : '首次建议 5～6 个；内容不足时少写也可以，最多 6 个。尽量覆盖不同颜色；优先 pink / blue / yellow / white 中适合当前角色的类别，♥️ 不是必出项。'}
- 主题彼此必须明显不同，不能把同一占有欲、同一不安或同一回忆换措辞拆成多个光点。
- ${incremental ? '必须避开 EXISTING_FIREFLY_TOPICS_JSON 中已有标题、情节核心和近义重复。' : ''}
只输出 JSON。`;
}

export function normalizeFireflyScript(rawScript) {
    const allowed = new Set(['char', 'user', 'user_thought']);
    const script = (Array.isArray(rawScript) ? rawScript : []).slice(0, 10).map(node => {
        const speaker = core_text.normalizeText(node?.speaker, 40).toLowerCase();
        const text = core_text.normalizeText(node?.text, 700);
        if (!allowed.has(speaker) || !text) return null;
        return { speaker, text };
    }).filter(Boolean);
    if (!script.length) return [];
    const thoughts = script.filter(node => node.speaker === 'user_thought');
    if (thoughts.length > 1) return [];
    if (thoughts.length === 1 && script[script.length - 1]?.speaker !== 'user_thought') return [];
    return script;
}

export function normalizeFireflyVoice(item, index = 0) {
    const color = core_text.normalizeText(item?.color, 20).toLowerCase();
    if (!core_constants.HEART_FIREFLY_COLORS.has(color)) return null;
    const script = normalizeFireflyScript(item?.script);
    const legacyLine = core_text.normalizeText(item?.line, 520);
    const thoughts = core_text.cleanArray(item?.thoughts ?? item?.lines, 4, 360).filter(text => text.length >= 8);
    if (!script.length && !thoughts.length && legacyLine.length >= 8) thoughts.push(legacyLine);
    if (!script.length && !thoughts.length) return null;
    const seedText = script[0]?.text || thoughts[0] || legacyLine;
    const title = core_text.normalizeText(item?.title, 80) || core_text.normalizeText(seedText, 18) || `话题 ${index + 1}`;
    const line = script.length ? script.map(node => node.text).join(' ') : thoughts.join(' ');
    return {
        id: core_text.safeId(item?.id, `FIREFLY${String(index + 1).padStart(2, '0')}`),
        color,
        title,
        script,
        thoughts,
        line,
        sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
        incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
        generatedAt: Math.max(0, Number(item?.generatedAt) || Date.now()),
    };
}

export function fireflyVoiceKey(item) {
    const text = Array.isArray(item?.script) && item.script.length
        ? item.script.map(node => node?.text).join(' ')
        : (Array.isArray(item?.thoughts) && item.thoughts.length ? item.thoughts.join(' ') : item?.line);
    return core_incremental.normalizedContentKey(`${item?.title || ''} ${text || ''}`, 1600);
}

export function normalizeFireflyVoicesPart(data, { minTotal = 1, requireDistribution = false, requireRich = true } = {}) {
    const out = (Array.isArray(data?.fireflyVoices) ? data.fireflyVoices : []).slice(0, 6).map(normalizeFireflyVoice).filter(Boolean);
    if (out.length < minTotal) throw core_text.safeUserError(`萤火虫会话不足：${out.length}/${minTotal}。`, 'RMT_HEART_INCOMPLETE');
    if (requireRich) {
        const invalid = out.find(item => {
            const script = Array.isArray(item?.script) ? item.script : [];
            const chars = script.filter(node => node.speaker === 'char').length;
            const users = script.filter(node => node.speaker === 'user').length;
            const totalChars = script.reduce((sum, node) => sum + String(node?.text || '').length, 0);
            return script.length < 5 || chars < 3 || users < 1 || totalChars < 120;
        });
        if (invalid) throw core_text.safeUserError(`萤火虫「${invalid.title || invalid.id}」不是完整的追加约会会话；至少需要 5 个节点、3 条角色台词和 1 条用户即时回应。`, 'RMT_HEART_INCOMPLETE');
    }
    if (requireDistribution) {
        const represented = new Set(out.map(item => item.color));
        if (represented.size < 3) throw core_text.safeUserError(`萤火虫颜色分布过窄：${represented.size}/3。首次至少覆盖 3 种颜色。`, 'RMT_HEART_INCOMPLETE');
        if (![...represented].some(color => color === 'yellow' || color === 'white')) {
            throw core_text.safeUserError('首次萤火虫不能全部围绕恋爱/渴望；至少需要 1 个 yellow「朋友」或 white「个性话题」。', 'RMT_HEART_INCOMPLETE');
        }
    }
    return out;
}

export function legacyFireflyVoices(session) {
    return (Array.isArray(session?.fireflyVoices) ? session.fireflyVoices : []).filter(item => {
        const script = Array.isArray(item?.script) ? item.script : [];
        return script.length < 5;
    });
}

export function heartFireflyUpgradePrompt(context, core, items) {
    const batch = (Array.isArray(items) ? items : []).slice(0, 6).map(item => ({
        id: core_text.normalizeText(item?.id, 80),
        color: core_text.normalizeText(item?.color, 20),
        legacyText: core_text.normalizeText(
            (Array.isArray(item?.script) && item.script.length
                ? item.script.map(node => node?.text).join(' ')
                : (Array.isArray(item?.thoughts) && item.thoughts.length ? item.thoughts.join(' ') : item?.line)),
            700,
        ),
    }));
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 旧版萤火虫升级为 GS4 式会话')}
RELATIONSHIP_TONE_ONLY_JSON:
${heartDramaRelationshipOnlyContext(core)}
LEGACY_FIREFLY_BATCH_JSON:
${JSON.stringify(batch, null, 2)}

任务：把旧版“独白/短心声”升级成 GS4「ホタルの住処」风格的【追加约会会话】。必须逐项保持原 id 和 color，不得新增、删除、合并或交换颜色。
严格输出：
{"fireflyVoices":[{"id":"原ID","color":"原颜色","title":"4～18字话题标题","script":[{"speaker":"char","text":"..."},{"speaker":"user","text":"..."},{"speaker":"char","text":"..."},{"speaker":"user_thought","text":"..."}]}]}
要求：
- 每项 5～10 个节点，至少 3 条 char、1 条 user；总文本约 140～420 个汉字。
- user 只能是非正史、中性、极短的即时回应；不得替用户新增决定、承诺、偏好或历史事实。
- user_thought 最多 1 条且只能放结尾，用来表现“刚才是不是他的心声？”一类即时感受。
- 以 legacyText 的核心主题为起点改成【两个人当场对话】，不要继续扩写成长篇内心独白。
- 颜色语义必须遵守：pink=恋爱，blue=恋爱的烦恼，yellow=朋友，white=角色个性话题，desire=本插件扩展的直白渴望。
- 不新增历史事实，不机械复述档案敏感细节；id / color 必须逐项一致。只输出 JSON。`;
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
        if (!candidate) throw core_text.safeUserError(`旧版萤火虫升级缺少 ${id}。`, 'RMT_HEART_INCOMPLETE');
        if (candidate.color !== color) throw core_text.safeUserError(`旧版萤火虫 ${id} 升级时改变了颜色。`, 'RMT_HEART_INCOMPLETE');
        return candidate;
    });
}

export function heartStripsPrompt(context, memoryBank, core, previous = null, sourceMemoryIds = null) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 日常一格')}
UNTRUSTED_HEART_RELATIONSHIP_JSON:
${heartDramaContext(core, memoryBank)}
${previous ? `UNTRUSTED_INCREMENTAL_HEART_ARCHIVE_JSON:\n${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}\nEXISTING_STRIP_INDEX_JSON:\n${JSON.stringify((previous.dailyStrips || []).slice(-60).map(item => ({ id: item.id, title: item.title, subtitle: item.subtitle, visualSeed: item.visualSeed })), null, 2)}` : ''}
生成${previous ? '由新增档案触发、尚未出现的' : ''}轻松日常一格，一条完整小故事就够，每次最多3条，不为数量凑梗。不生成时期对话、Voice Drama 或 Scenario Drama。
{"dailyStrips":[{"id":"STRIP01","title":"标题","subtitle":"短句","panelCount":2,"panels":[{"caption":"...","action":"...","charLine":"...","userLine":"..."}],"visualSeed":["元素1","元素2","元素3"],"imagePrompt":"Q版/chibi，可见画面，no text, no speech bubble, no watermark"}]}
要求：
- panelCount 只能 1/2/4，按故事选择，panels 数量与所选格数一致；一格也可以完整收尾。
- 每格 action 描述这一格独有的动作、表情或镜头变化，按先后推进，不能把同一动作同一构图复制数遍。没有第二个变化就选单格。
- visualSeed 按需提供，不要求凑数；imagePrompt 明确 Q版/chibi、大头小身体的成年角色漫画造型（不是儿童），不用正常身材写实比例，并明确 no text / no speech bubble / no watermark。
- userLine 只是非正史小剧场台词，不代表用户真实选择。${previous ? '必须避开 EXISTING_STRIP_INDEX_JSON 的标题、动作和梗；旧一格与已绘图片由本地保留。' : ''}只输出 JSON。`;
}

export function normalizeVoiceDramaPart(data, expectedKinds, memoryBank = {}) {
    const raw = Array.isArray(data?.voiceDramas) ? data.voiceDramas : [];
    const out = [];
    for (const expected of expectedKinds) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.kind, 40).toLowerCase() === expected);
        if (!item) throw core_text.safeUserError(`Voice Drama 缺少 ${expected}。`, 'RMT_HEART_INCOMPLETE');
        const post = expected === 'postending';
        const script = normalizeHeartScript(item?.script, {
            characterName: memoryBank.characterName, userName: memoryBank.userName,
            minLines: post ? 8 : 5,
            maxLines: post ? 24 : 16,
            minChars: post ? 420 : 280,
        });
        if (!script.length) throw core_text.safeUserError(`Voice Drama ${expected} 长度不足。`, 'RMT_HEART_INCOMPLETE');
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

export function normalizeScenarioDramaPart(data, expectedSeason = '', memoryBank = {}) {
    const raw = Array.isArray(data?.scenarioDramas) ? data.scenarioDramas : [];
    const seasons = expectedSeason ? [expectedSeason] : ['spring', 'summer', 'autumn', 'winter'];
    const out = [];
    for (const expected of seasons) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.season, 40).toLowerCase() === expected);
        if (!item) throw core_text.safeUserError(`Scenario Drama 缺少 ${expected}。`, 'RMT_HEART_INCOMPLETE');
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360, characterName: memoryBank.characterName, userName: memoryBank.userName });
        if (!script.length) throw core_text.safeUserError(`Scenario Drama ${expected} 长度不足。`, 'RMT_HEART_INCOMPLETE');
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
        if (panels.length !== panelCount || !imagePrompt) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            ...cg_visual.generatedCgDraftFields(item),
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
        };
    }).filter(Boolean);
    if (!dailyStrips.length) throw core_text.safeUserError('这次没有返回完整的日常一格；旧图与旧内容保留，可重试未完成部分。', 'RMT_SEGMENT_VALIDATION');
    return dailyStrips;
}

export function normalizeHeartCollectionBatch(data, part) {
    const field = part === 'fireflies' ? 'fireflyVoices' : part === 'strips' ? 'dailyStrips' : '';
    const max = part === 'fireflies' ? 6 : 3;
    if (!field || !Array.isArray(data?.[field]) || data[field].length > max) {
        throw core_text.safeUserError('本次条目列表结构不完整；旧内容保留。', 'RMT_HEART_INCOMPLETE');
    }
    const items = [], seen = new Set();
    let rejectedCount = 0;
    for (const raw of data[field]) {
        try {
            const item = part === 'fireflies'
                ? normalizeFireflyVoicesPart({ fireflyVoices: [raw] }, { minTotal: 1, requireDistribution: false, requireRich: true })[0]
                : normalizeHeartStripsPart({ dailyStrips: [raw] })[0];
            const key = part === 'fireflies' ? fireflyVoiceKey(item) : heartStripKey(item);
            if (!seen.has(key)) { seen.add(key); items.push(item); }
        } catch (error) {
            if (!['RMT_HEART_INCOMPLETE', 'RMT_SEGMENT_VALIDATION'].includes(error?.code)) throw error;
            rejectedCount++;
        }
    }
    if (!items.length) throw core_text.safeUserError('本次没有完整可保存的条目；旧内容保留。', 'RMT_HEART_INCOMPLETE');
    return { items, rejectedCount };
}

function languageCategory(raw) {
    return core_constants.HEART_GREETING_KEYS.includes(raw) ? raw : '';
}

function categoryLanguageInput(raw, category) {
    if (!category) return raw;
    return { ...raw, greetings: { [category]: raw?.greetings?.[category] }, specialDays: [] };
}

function categoryLanguagePrompt(category) {
    return category ? `\n本次只写 greetings.${category} 的新完整台词，其他类别留空，不为数量凑句；不要输出特别日。` : '';
}

export async function requestHeartPart(prompt, status, options, validator) {
    return generation_client.requestValidatedSegment(prompt, status, options, validator);
}

export function partsDialoguesReady(session) {
    return core_heartLanguage.heartLanguageStatus(session).complete;
}

export function makeHeartShell(memoryBank) {
    return core_heartLanguage.makeHeartShell(memoryBank);
}

// Only closed values enter this reading projection. Acceptance of each drama,
// strip and firefly still uses the normal production item validator.
export function projectHeartProgress({ segments = [], memoryBank, previousSession = null, contentInputs = {}, pageId = 'heart', operation = {}, createdAt = 0 }) {
    let session = structuredClone(contentInputs.baseSession || previousSession || makeHeartShell(memoryBank));
    let added = false;
    const stamp = item => ({ ...item, ...(operation.batchId ? { incrementBatchId: operation.batchId } : {}), generatedAt: createdAt });
    for (const segment of segments) {
        const raw = segment.value || {};
        if (pageId === 'heart' || pageId === 'language') {
            const greetings = {};
            for (const key of core_constants.HEART_GREETING_KEYS) {
                const rows = segment.items(`/greetings/${key}`);
                const lines = core_text.cleanArray(rows, 6, 600);
                if (lines.length) greetings[key] = lines;
            }
            if (Object.keys(greetings).length) {
                try {
                    const core = normalizeHeartCore({ ...raw, greetings }, memoryBank);
                    session = applyHeartPartialPatch(session, { type: operation.dialogueMode === 'increment' ? 'dialogues-increment' : 'dialogues', core });
                } catch {
                    // A missing relationship summary does not hide already closed
                    // lines, and is never invented to make the whole part pass.
                    session.greetings = { ...(session.greetings || {}) };
                    for (const [key, lines] of Object.entries(greetings)) session.greetings[key] = [...new Set([...(session.greetings[key] || []), ...lines])];
                }
                added = true;
            }
        }
        for (const item of segment.items('/voiceDramas')) {
            if (!['spring', 'summer', 'autumn', 'winter', 'postending'].includes(item?.kind)) continue;
            if (!['heart', 'seasons', item.kind].includes(pageId)) continue;
            try {
                const voice = stamp(normalizeVoiceDramaPart({ voiceDramas: [item] }, [item.kind], memoryBank)[0]);
                session = applyHeartPartialPatch(session, { type: 'season', season: item.kind, voice }); added = true;
            } catch { /* The closed sibling still must satisfy its existing item contract. */ }
        }
        for (const item of segment.items('/scenarioDramas')) {
            if (!['spring', 'summer', 'autumn', 'winter'].includes(item?.season) || !['heart', 'seasons', item.season].includes(pageId)) continue;
            try {
                const scenario = stamp(normalizeScenarioDramaPart({ scenarioDramas: [item] }, item.season, memoryBank)[0]);
                session = applyHeartPartialPatch(session, { type: 'season', season: item.season, scenario }); added = true;
            } catch { /* Keep the unaccepted value only in the recoverable raw journal. */ }
        }
        for (const [field, part] of [['dailyStrips', 'strips'], ['fireflyVoices', 'fireflies']]) {
            if (!['heart', part].includes(pageId)) continue;
            const rows = segment.items(`/${field}`);
            if (!rows.length) continue;
            try {
                const batch = normalizeHeartCollectionBatch({ [field]: rows }, part);
                session = applyHeartPartialPatch(session, { type: part, [field]: batch.items.map(stamp), rejectedCount: batch.rejectedCount }); added = true;
            } catch { /* No completed valid item yet. */ }
        }
    }
    if (!added) return null;
    session.kind = core_constants.MODE.HEART; session.chatId = memoryBank.chatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
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
        collectionIssues: core_heartLanguage.heartCollectionIssues(existing),
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
    const existing = core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(existing, memoryBank, 'dialogues');
    if (existing && partsDialoguesReady(existing) && options.replaceExisting !== true) {
        const core = await generation_client.requestValidatedSegment(
            heartCoreIncrementPrompt(context, memoryBank, existing, sourceMemoryIds) + core_incremental.derivedExpansionDirective(existing, memoryBank, 'dialogues'),
            '角色互动 · 正在从新增档案追加时期对话…',
            { maxTokens: 4500, temperature: 0.4, context, origin, taskKey: `${taskKey}:dialogues-increment`, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeHeartCoreIncrement(raw, memoryBank, sourceMemoryIds),
        );
        const preserveRelationship = !core.relationshipSourceMemoryIds?.length
            || !core.relationshipSourceMemoryAnchor
            || !core_incremental.incrementalArchiveMemoryIds(existing, memoryBank, 'dialogues').length;
        const { session, added } = mergeHeartCoreIncremental(existing, core, preserveRelationship);
        const normalized = normalizeHeart(session, memoryBank);
        return core_incremental.stampIncrementalCoverage(normalized, existing, memoryBank, 'dialogues', sourceMemoryIds, added);
    }
    const core = await generation_client.requestValidatedSegment(
        heartCorePrompt(context, memoryBank),
        '角色互动 · 正在生成时期对话…',
        { maxTokens: 6000, temperature: 0.35, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true,
            recoveryCompatibility: { contract: 'heart-language-birthday-r8412', legacyPrompts: [heartCoreLegacyPrompt(context, memoryBank)] } },
        raw => normalizeHeartCore(raw, memoryBank),
    );
    // Generic/automatic admission only fills an incomplete library. Explicit
    // replacement lives in generateHeartSection and always asks twice first.
    const combined = existing && options.replaceExisting !== true
        ? mergeHeartCoreIncremental(existing, core, !!existing.relationshipSummary && !core.relationshipSourceMemoryIds?.length).session
        : makeHeartSession(core, existing);
    const normalized = normalizeHeart(combined, memoryBank);
    return core_incremental.stampIncrementalCoverage(normalized, existing, memoryBank, 'dialogues', sourceMemoryIds, Object.values(core.greetings || {}).flat().length);
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

export function preserveHeartSelection(target, source) {
    for (const key of ['view', 'selectedSeason', 'selectedVoiceId', 'selectedScenarioId',
        'selectedDramaKey', 'selectedStripId', 'selectedFireflyId']) {
        if (Object.hasOwn(source || {}, key)) target[key] = ui_heartReader.heartSelectionScalars(source)[key] || '';
        else delete target[key];
    }
    return target;
}

export function normalizeHeartContentPatch(base, patches, memoryBank) {
    let content = base;
    for (const patch of patches) content = applyHeartPartialPatch(content, patch);
    return preserveHeartSelection(normalizeHeart(content, memoryBank), base);
}

export function applyHeartPartialPatch(base, patch) {
    let updated = structuredClone(base || {});
    if (!patch || typeof patch !== 'object') return updated;
    let added = 0;
    if (['fireflies', 'strips'].includes(patch.type)) {
        updated.collectionIssues = { ...core_heartLanguage.heartCollectionIssues(updated),
            [patch.type]: Math.max(0, Math.min(6, Math.floor(Number(patch.rejectedCount) || 0))) };
    }
    if (patch.type === 'dialogues' && patch.core) {
        updated = makeHeartSession(patch.core, updated);
    } else if (patch.type === 'dialogues-increment' && patch.core) {
        const merged = mergeHeartCoreIncremental(updated, patch.core, patch.revisit === true);
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
        updated.generationParts = { ...(updated.generationParts || {}), strips: true };
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
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
    } else if (patch.type === 'firefly-upgrade' && Array.isArray(patch.fireflyVoices)) {
        const replacements = new Map(patch.fireflyVoices.map(item => [core_text.normalizeText(item?.id, 80), item]));
        const out = (Array.isArray(updated.fireflyVoices) ? updated.fireflyVoices : []).map(item => {
            const next = replacements.get(core_text.normalizeText(item?.id, 80));
            if (!next || next.color !== item.color) return item;
            added += 1;
            return {
                ...structuredClone(item),
                title: next.title,
                script: structuredClone(next.script),
                thoughts: [],
                line: next.line,
                upgradedAt: Date.now(),
            };
        });
        updated.fireflyVoices = out;
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
    } else if (patch.type === 'season') {
        const season = core_text.normalizeText(patch.season, 40).toLowerCase();
        if (patch.voice?.kind === season) {
            const result = appendHeartDramaItem(updated.voiceDramas, patch.voice, `voice:${season}`, 'VOICE');
            updated.voiceDramas = result.list;
            added += result.added;
        }
        if (season !== 'postending' && patch.scenario?.season === season) {
            const result = appendHeartDramaItem(updated.scenarioDramas, patch.scenario, `scenario:${season}`, 'SCENE');
            updated.scenarioDramas = result.list;
            added += result.added;
        }
        updated.generationParts = { ...(updated.generationParts || {}), seasons: true };
    }
    // Generating content must not navigate any reader, including deferred replay.
    preserveHeartSelection(updated, base);
    return applyHeartPatchCoverage(updated, base, patch, added);
}

export function mergeDeferredHeartPatches(existing, incoming) {
    return { ...(existing || {}), ...(incoming || {}) };
}

const HEART_REGENERATION_PAGES = new Set(['language', 'spring', 'summer', 'autumn', 'winter', 'strips', 'fireflies', 'postending']);

function heartParticipantRegeneration(options) {
    return options?.participantRegeneration || options?.existing?.operation?.participantRegeneration;
}

// Only a validated replacement for the explicitly selected page enters this
// merge. Do not normalize the whole session: untouched pages may contain old
// text, image records or fields unknown to the current generator.
export function applyHeartPageReplacement(base, pageId, replacement, participantRegeneration) {
    if (!HEART_REGENERATION_PAGES.has(pageId)) throw new TypeError('Unknown HEART replacement page.');
    const updated = structuredClone(base || {});
    const generationParts = { ...(updated.generationParts || {}) };
    if (pageId === 'language') {
        for (const key of ['relationshipState', 'relationshipSummary', 'relationshipSourceMemoryIds',
            'relationshipSourceMemoryAnchor', 'birthdayMmDd', 'userBirthdayMmDd', 'specialDays', 'greetings']) {
            updated[key] = structuredClone(replacement[key]);
        }
        generationParts.dialogues = core_heartLanguage.heartLanguageStatus(replacement).complete;
    } else if (pageId === 'strips' || pageId === 'fireflies') {
        const field = pageId === 'strips' ? 'dailyStrips' : 'fireflyVoices';
        updated[field] = structuredClone(replacement[field]);
        updated.collectionIssues = { ...(updated.collectionIssues || {}), [pageId]: replacement.rejectedCount || 0 };
        generationParts[pageId] = updated[field].length > 0;
    } else {
        // Replace this season in place while retaining every other season's
        // objects and order, including old images and unrecognized fields.
        const replaceSeason = (items, key, next) => {
            const out = [], incoming = structuredClone(next);
            let inserted = false;
            for (const item of items || []) {
                if (item?.[key] !== pageId) out.push(item);
                else if (!inserted) { out.push(...incoming); inserted = true; }
            }
            if (!inserted) out.push(...incoming);
            return out;
        };
        updated.voiceDramas = replaceSeason(updated.voiceDramas, 'kind', replacement.voiceDramas);
        if (pageId !== 'postending') updated.scenarioDramas = replaceSeason(updated.scenarioDramas, 'season', replacement.scenarioDramas);
        generationParts.seasons = true;
    }
    updated.generationParts = generationParts;
    updated.participantRegenerationPages = { ...(updated.participantRegenerationPages || {}),
        [pageId]: structuredClone(participantRegeneration) };
    return updated;
}

async function commitHeartPageReplacement(targetRuntime, base, pageId, replacement, participantRegeneration, logicalTask) {
    const { origin, expectedChatId, expectedArchiveRevision } = targetRuntime;
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    const sourceMemory = targetRuntime.recoveryHandle?.contentBank;
    if (sourceMemory?.archiveRevision && sourceMemory.archiveRevision !== expectedArchiveRevision) {
        return core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART,
            applyHeartPageReplacement(base, pageId, replacement, participantRegeneration), origin, {
                pageId, archiveTarget: targetRuntime.archiveTarget, memoryBank: targetRuntime.memoryBank,
                sourceMemory, stillCurrent: targetRuntime.stillCurrent,
            });
    }
    const mutate = latest => {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        return applyHeartPageReplacement(latest || base, pageId, replacement, participantRegeneration);
    };
    const commitOptions = { participantRegeneration, completeGeneration: true };
    let session;
    if (targetRuntime.archiveTarget) {
        if (!targetRuntime.stillCurrent()) throw core_requestCoordinator.createGenerationAbortError();
        const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
        const result = await core_cache.commitDetachedArchiveSessionMutation(target, core_constants.MODE.HEART, origin,
            mutate, base, () => targetRuntime.stillCurrent() && !logicalTask.signal.aborted, commitOptions);
        if (!result.unchanged) session = result.session;
        if (session) archive_library.syncArchiveTargetSubtask(targetRuntime, { ...target, cache: result.cache, loadedAt: Date.now() });
    } else {
        session = await core_cache.commitSessionMutation(core_constants.MODE.HEART, expectedChatId, origin, mutate, base, commitOptions);
    }
    if (!session) throw core_text.safeUserError('这一页尚未确认保存；旧内容与重做草稿保留。', 'RMT_HEART_REPLACEMENT_UNCOMMITTED');
    const visible = runtimeState.activeSession;
    const sameReader = visible?.kind === core_constants.MODE.HEART && visible.chatId === expectedChatId
        && visible.archiveRevision === expectedArchiveRevision && (targetRuntime.archiveTarget
            ? runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId
            : !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin));
    if (sameReader) {
        runtimeState.activeSession = preserveHeartSelection({ ...session }, visible);
        if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    }
    return session;
}

// Explicit, version-backed regeneration only. Existing generation entry points
// continue their append behavior when no participantRegeneration is supplied.
export async function regenerateHeartPage(page, options = {}) {
    const pageId = page === 'dialogues' ? 'language' : page;
    const requested = heartParticipantRegeneration(options);
    if (!HEART_REGENERATION_PAGES.has(pageId) || !requested
        || (requested.pageId && requested.pageId !== pageId)) {
        throw core_text.safeUserError('重新生成需要明确勾选的角色互动页面和已保存旧版本。', 'RMT_ARCHIVE_VERSION_REQUIRED');
    }
    const participantRegeneration = { versionId: requested.versionId, pageId,
        participantSnapshot: core_participants.normalizeParticipantSnapshot(requested.participantSnapshot) };
    const initialContext = runtimeState.activeArchiveSnapshot
        ? archive_library.archiveTargetGenerationOptions().context : core_context.currentCharacterGuard();
    const initialMemory = archive_repository.requireArchive(initialContext);
    const initialOrigin = { ...core_context.captureTaskOrigin(initialContext, initialMemory.archiveRevision),
        ...(runtimeState.activeArchiveSnapshot ? { archiveTargetEntryId: runtimeState.activeArchiveSnapshot.entryId } : {}) };
    const scope = runtimeState.activeArchiveSnapshot ? `archive-target:${runtimeState.activeArchiveSnapshot.entryId}` : core_context.chatScopeKey(initialContext);
    const taskKey = `heart-participant:${scope}:${pageId}`;
    const logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'heart-page', mode: core_constants.MODE.HEART,
        pageId, context: initialContext, origin: initialOrigin, taskKey, parentTaskId: options.logicalParentTaskId });
    let targetRuntime, outcome = { status: 'failed', pageId, versionId: participantRegeneration.versionId };
    try {
        targetRuntime = await prepareHeartSubtaskRuntime(`participant:${pageId}`);
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin, { taskKey });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const resumedSource = generation_recovery.readGenerationContentSnapshot(options.existing)?.memoryBank;
        if (resumedSource?.archiveRevision && resumedSource.archiveRevision !== targetRuntime.expectedArchiveRevision) {
            // This operation will save an independent task result and ask where
            // it belongs. It has no permission to replace the new archive here.
            const version = await core_cache.readArchiveVersion(targetRuntime.context, participantRegeneration.versionId);
            if (!version.selectedPages.includes(pageId)) throw core_text.safeUserError('原任务旧版本没有记录这一页，草稿保留。', 'RMT_ARCHIVE_VERSION_REQUIRED');
        } else await core_cache.assertArchiveVersionReplacement(targetRuntime.context, participantRegeneration, core_constants.MODE.HEART);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin,
            { taskKey, participantSnapshot: participantRegeneration.participantSnapshot });
        if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, targetRuntime.context)
            || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
            throw core_text.safeUserError('角色互动仍有生成任务，请等待原任务结束后重做所选页面。', 'RMT_HEART_GENERATING');
        }
        if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
            throw core_text.safeUserError('当前生成任务已满，本页旧内容保留。', 'RMT_HEART_GENERATING');
        }
        runtimeState.activeModeBuildScopes.add(taskKey);
        core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
            heartTargetMessage(targetRuntime, `角色互动 · 重做 ${pageId}`));
        targetRuntime.recoverySelection = { pageId, draftId: options.draftId || options.existing?.draftId || '' };
        if (!await beginHeartSubtask(targetRuntime)) throw core_text.safeUserError('未能开始本页重做，旧内容保留。', 'RMT_HEART_REPLACEMENT_UNCOMMITTED');
        core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin,
            { taskKey, participantSnapshot: participantRegeneration.participantSnapshot });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const { origin } = targetRuntime;
        let { context, memoryBank } = targetRuntime;
        let base = latestHeartSessionForRuntime(targetRuntime);
        const batchId = core_context.stableArchiveHash(`heart-participant|${participantRegeneration.versionId}|${pageId}`);
        const operation = pageId === 'language' || pageId === 'strips'
            ? { kind: 'heart-section', part: pageId === 'language' ? 'dialogues' : pageId, ...(pageId === 'language' ? { dialogueMode: 'full' } : {}) }
            : pageId === 'fireflies' ? { kind: 'heart-fireflies', upgrade: false }
                : { kind: 'heart-season', season: pageId, batchId };
        const recovery = await startHeartRecovery(targetRuntime, { ...operation, participantRegeneration }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        const request = (prompt, suffix, settings, validator) => {
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
            return requestHeartPart(prompt, `角色互动 · 正在重做 ${pageId}`, { ...settings, context, origin,
                taskKey: `${taskKey}:${suffix}`, mode: core_constants.MODE.HEART, background: true }, validator);
        };
        const enrich = item => ({ ...item, sourceArchiveMemoryIds: [], incrementBatchId: batchId, generatedAt: Date.now() });
        let replacement;
        if (pageId === 'language') {
            replacement = await request(heartCorePrompt(context, memoryBank), 'dialogues-full',
                { maxTokens: 6000, temperature: 0.35 }, raw => normalizeHeart(makeHeartSession(normalizeHeartCore(raw, memoryBank)), memoryBank));
        } else if (pageId === 'strips' || pageId === 'fireflies') {
            const strips = pageId === 'strips';
            const batch = await request(strips ? heartStripsPrompt(context, memoryBank, base) : heartFireflyPrompt(context, memoryBank, base),
                pageId, strips ? { maxTokens: 5000 } : { maxTokens: 5200, temperature: 0.8 },
                raw => normalizeHeartCollectionBatch(raw, pageId));
            replacement = { [strips ? 'dailyStrips' : 'fireflyVoices']: batch.items.map(enrich), rejectedCount: batch.rejectedCount };
        } else {
            const postending = pageId === 'postending';
            const voices = await request(postending ? heartPostVoicePrompt(context, memoryBank, base)
                : heartSeasonVoicePrompt(context, memoryBank, base, pageId), 'voice',
                { maxTokens: postending ? 3800 : 3000, temperature: 0.65 }, raw => normalizeVoiceDramaPart(raw, [pageId], memoryBank));
            const runScenario = !postending && (options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true);
            const scenarios = runScenario ? await request(heartSeasonScenarioPrompt(context, memoryBank, base, pageId), 'scenario',
                { maxTokens: 3200, temperature: 0.65 }, raw => normalizeScenarioDramaPart(raw, pageId, memoryBank)) : [];
            if (!postending && !runScenario) {
                core_requestCoordinator.noteSecondStepOffer(origin, {
                    label: '小事件', kind: 'heart-scenario', mode: core_constants.MODE.HEART, pageId,
                });
            }
            replacement = { voiceDramas: voices.map(enrich), scenarioDramas: scenarios.map(enrich) };
        }
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        const session = await commitHeartPageReplacement(targetRuntime, base, pageId, replacement, participantRegeneration, logicalTask);
        if (session?.status === 'awaiting-choice') {
            outcome = session;
            showSavedHeartTaskResult(outcome.draftId, targetRuntime.context);
            return outcome;
        }
        outcome = { status: 'committed', pageId, versionId: participantRegeneration.versionId, session };
        return outcome;
    } catch (error) {
        if (targetRuntime?.origin) {
            try { await generation_recovery.noteGenerationRecoveryFailure(targetRuntime.origin, error); } catch { /* Preserve the original generation/commit error. */ }
        }
        outcome = { ...outcome, status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        throw error;
    } finally {
        try {
            if (targetRuntime?.origin) generation_recovery.detachGenerationRecovery(targetRuntime.origin);
            runtimeState.activeModeBuildScopes.delete(taskKey);
            core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
            core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, targetRuntime?.origin || initialOrigin);
            if (targetRuntime) refreshHeartArchiveTarget(targetRuntime);
        } finally {
            core_requestCoordinator.finishLogicalGenerationTask(logicalTask, outcome);
        }
    }
}

const ordinaryHeartLogicalTasks = new WeakMap();

async function runOrdinaryHeartLogicalTask(pageId, options, run) {
    let logicalTask;
    try {
        const context = runtimeState.activeArchiveSnapshot
            ? archive_library.archiveTargetGenerationOptions().context : core_context.currentCharacterGuard();
        const memory = archive_repository.requireArchive(context);
        const origin = { ...core_context.captureTaskOrigin(context, memory.archiveRevision),
            ...(runtimeState.activeArchiveSnapshot ? { archiveTargetEntryId: runtimeState.activeArchiveSnapshot.entryId } : {}) };
        // Register before preparation yields. The existing per-part admission checks
        // still decide whether this ordinary append can actually start a request.
        logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'heart-page', mode: core_constants.MODE.HEART,
            pageId, context, origin, parentTaskId: options.logicalParentTaskId });
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(heartPreparationTargetHint(), core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    try {
        return await run(logicalTask);
    } catch (error) {
        logicalTask.failureCode = core_text.normalizeText(error?.code, 80);
        logicalTask.failureSummary = core_text.safeErrorSummary(error);
        throw error;
    } finally {
        // Includes preparation, all child requests, recovery and persistence cleanup.
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask);
    }
}

function bindOrdinaryHeartRuntime(targetRuntime, logicalTask) {
    if (!logicalTask) return targetRuntime;
    core_requestCoordinator.bindLogicalGenerationTask(logicalTask, targetRuntime.origin);
    ordinaryHeartLogicalTasks.set(targetRuntime, logicalTask);
    const stillCurrent = targetRuntime.stillCurrent;
    targetRuntime.stillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(logicalTask) && stillCurrent();
    return targetRuntime;
}

async function prepareHeartSubtaskRuntime(taskPart, logicalTask = null) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    const targetRuntime = await archive_library.prepareArchiveTargetSubtask(core_constants.MODE.HEART, taskPart);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    if (targetRuntime) return bindOrdinaryHeartRuntime(targetRuntime, logicalTask);
    if (!archive_library.requireWritableArchiveAction()) throw new Error('当前档案尚未处于可写的真实聊天上下文。');
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const origin = {
        ...core_context.captureTaskOrigin(context, expectedArchiveRevision),
        chatId: core_context.comparableChatId(expectedChatId),
    };
    return bindOrdinaryHeartRuntime({
        archiveTarget: null,
        context,
        memoryBank,
        expectedChatId,
        expectedArchiveRevision,
        scope: core_context.chatScopeKey(context),
        origin,
        stillCurrent: () => core_context.isCurrentTaskOrigin(origin),
        options: null,
    }, logicalTask);
}

function latestHeartSessionForRuntime(targetRuntime, fallback = null) {
    const cache = targetRuntime.archiveTarget?.cache || core_cache.getCache(targetRuntime.context);
    const session = core_cache.loadSession(core_constants.MODE.HEART, {
        context: targetRuntime.context, cache,
        chatId: targetRuntime.expectedChatId,
        memoryBank: targetRuntime.archiveTarget?.memory || targetRuntime.memoryBank,
        clone: true,
    });
    if (!session && cache?.[core_constants.MODE.HEART]) throw core_text.safeUserError('原角色互动暂不可安全读取，旧内容保留。', 'RMT_HEART_SOURCE_CHANGED');
    return session || structuredClone(fallback) || makeHeartShell(targetRuntime.memoryBank);
}

async function beginHeartSubtask(targetRuntime) {
    const logicalTask = ordinaryHeartLogicalTasks.get(targetRuntime);
    try {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        if (targetRuntime.archiveTarget) await archive_library.beginArchiveTargetSubtask(targetRuntime);
        else {
            await core_cache.claimLiveModeGeneration(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.memoryBank, targetRuntime.recoverySelection || {});
            targetRuntime.origin = core_context.captureTaskOrigin(targetRuntime.context, targetRuntime.expectedArchiveRevision);
        }
        // Claims replace the origin/write fence; child requests must belong to the
        // same logical task after that replacement, including after cancellation.
        bindOrdinaryHeartRuntime(targetRuntime, logicalTask);
        return true;
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return false;
    }
}

async function startHeartRecovery(targetRuntime, operation, options = {}) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(targetRuntime.origin);
    targetRuntime.recoveryArchiveEntry = targetRuntime.archiveTarget || core_cache.archiveBackupEntryForContext(targetRuntime.context, targetRuntime.memoryBank);
    const pageId = operation.participantRegeneration?.pageId || (operation.kind === 'heart-season' ? operation.season
        : operation.kind === 'heart-fireflies' ? 'fireflies' : operation.part === 'dialogues' ? 'language' : operation.part);
    // An ordinary page click resumes that page's latest unfinished operation;
    // an explicit rebuild starts a separate attempt. Other pages remain saved.
    const existing = options.existing !== undefined ? options.existing : options.participantRegeneration && !options.draftId ? null
        : core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.archiveTarget?.cache,
            { ...(options.draftId ? { draftId: options.draftId } : {}), pageId });
    const handle = await generation_client.beginModeRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.memoryBank, targetRuntime.origin, {
        ...options, existing, pageId, operation,
        contentInputs: { baseSession: latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession) },
        archiveTarget: targetRuntime.archiveTarget, archiveEntry: targetRuntime.recoveryArchiveEntry,
        stillCurrent: targetRuntime.archiveTarget ? targetRuntime.stillCurrent : undefined,
    });
    targetRuntime.recoveryHandle = handle;
    return handle;
}

function ordinaryHeartRecoveryOptions(targetRuntime, pageId, options) {
    const selected = options.existing !== undefined ? options : { ...options,
        existing: core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context,
            targetRuntime.archiveTarget?.cache, { ...(options.draftId ? { draftId: options.draftId } : {}), pageId }) };
    targetRuntime.recoverySelection = { pageId, draftId: options.draftId || selected.existing?.draftId || '' };
    return selected;
}

async function finishHeartRecovery(targetRuntime, committed) {
    if (!committed) return;
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(targetRuntime.origin);
    if (targetRuntime.taskResultSession) {
        targetRuntime.taskResult = await core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART,
            targetRuntime.taskResultSession, targetRuntime.origin, { pageId: targetRuntime.recoveryHandle.journal.pageId,
                archiveTarget: targetRuntime.archiveTarget, memoryBank: targetRuntime.memoryBank,
                sourceMemory: targetRuntime.recoveryHandle.contentBank, stillCurrent: targetRuntime.stillCurrent });
        showSavedHeartTaskResult(targetRuntime.taskResult.draftId, targetRuntime.context);
        return;
    }
    await core_cache.saveGenerationRecovery(targetRuntime.context, targetRuntime.memoryBank, core_constants.MODE.HEART, null, targetRuntime.origin, {
        archiveTarget: targetRuntime.archiveTarget, archiveEntry: targetRuntime.recoveryArchiveEntry,
        stillCurrent: targetRuntime.archiveTarget ? targetRuntime.stillCurrent : undefined,
    });
}

async function clearCommittedHeartRecovery(targetRuntime, session, operation) {
    const journal = core_cache.loadGenerationRecovery(core_constants.MODE.HEART, targetRuntime.context, targetRuntime.archiveTarget?.cache);
    if (journal?.draftId && journal.draftId !== targetRuntime.origin.generationRecoveryDraftId) return false;
    const summary = generation_recovery.generationRecoverySummary(journal);
    if (!summary?.completed || summary.truncated || summary.failed || summary.failureCode
        || journal.operation?.kind !== operation.kind || (operation.part && journal.operation.part !== operation.part)
        || (operation.season && journal.operation.season !== operation.season)) return false;
    if (operation.kind === 'heart-season') {
        const { batchId, season } = journal.operation;
        if (!batchId || !session?.voiceDramas?.some(item => item.kind === season && item.incrementBatchId === batchId)
            || (season !== 'postending' && !session?.scenarioDramas?.some(item => item.season === season && item.incrementBatchId === batchId))) return false;
    }
    targetRuntime.recoveryArchiveEntry = targetRuntime.archiveTarget || core_cache.archiveBackupEntryForContext(targetRuntime.context, targetRuntime.memoryBank);
    await finishHeartRecovery(targetRuntime, true);
    return true;
}

function recoveryStopsHeart(error) {
    return error?.code === 'RMT_JSON_TRUNCATED' || /^RMT_RECOVERY_/.test(error?.code || '')
        || core_requestCoordinator.stopsCompositeGeneration(error);
}

function heartTargetMessage(targetRuntime, message) {
    const text = core_text.normalizeText(message, 1200);
    return targetRuntime?.archiveTarget
        ? `${targetRuntime.archiveTarget.characterName} · ${targetRuntime.archiveTarget.archiveName}：${text}`
        : text;
}

function heartPreparationTargetHint() {
    const snapshot = runtimeState.activeArchiveSnapshot;
    return snapshot?.entryId ? { archiveTarget: {
        entryId: snapshot.entryId,
        characterName: snapshot.characterName,
        archiveName: snapshot.archiveName,
    } } : null;
}

function refreshHeartArchiveTarget(targetRuntime) {
    const entryId = core_text.normalizeText(targetRuntime?.archiveTarget?.entryId, 120);
    if (entryId) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(entryId));
}

async function persistHeartWholeSession(session, targetRuntime, origin) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    // This path only migrates the legacy firefly coverage cursor. Merge that cursor into the
    // latest canonical HEART session instead of replacing sibling dialogue/season/strip writes.
    const mutateCoverage = latestSession => {
        const next = structuredClone(latestSession || session);
        const desiredMeta = session?.generationMeta && typeof session.generationMeta === 'object' ? session.generationMeta : {};
        const nextMeta = next?.generationMeta && typeof next.generationMeta === 'object' ? next.generationMeta : {};
        const desiredRecord = desiredMeta?.parts?.fireflies;
        if (!desiredRecord || typeof desiredRecord !== 'object') return next;
        next.generationMeta = {
            ...structuredClone(nextMeta),
            schemaVersion: desiredMeta.schemaVersion || nextMeta.schemaVersion,
            parts: {
                ...(nextMeta.parts && typeof nextMeta.parts === 'object' ? structuredClone(nextMeta.parts) : {}),
                fireflies: structuredClone(desiredRecord),
            },
            lastUpdate: structuredClone(desiredMeta.lastUpdate || nextMeta.lastUpdate || {}),
        };
        next.generationParts = { ...(next.generationParts || {}), fireflies: Array.isArray(next.fireflyVoices) && next.fireflyVoices.length > 0 };
        return next;
    };
    if (!targetRuntime?.archiveTarget) {
        return core_cache.commitSessionMutation(core_constants.MODE.HEART, targetRuntime.expectedChatId, origin, mutateCoverage, session);
    }
    if (!targetRuntime.stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
    const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
    const result = await targetRuntime.options.commitArchiveTargetMutation(
        target,
        core_constants.MODE.HEART,
        origin,
        mutateCoverage,
        session,
        targetRuntime.stillCurrent,
    );
    archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
    return result.session || null;
}

export async function persistHeartPartialPatch(patchKey, patch, fallbackBase, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime = null) {
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
    if (targetRuntime?.recoveryHandle?.contentBank?.archiveRevision
        && targetRuntime.recoveryHandle.contentBank.archiveRevision !== expectedArchiveRevision) {
        const updated = normalizeHeartContentPatch(targetRuntime.taskResultSession || fallbackBase, [patch], memoryBank);
        await core_cache.saveGenerationTaskResult(targetRuntime.context, core_constants.MODE.HEART, updated, origin, {
            pageId: targetRuntime.recoveryHandle.journal.pageId, archiveTarget: targetRuntime.archiveTarget,
            memoryBank: targetRuntime.memoryBank, sourceMemory: memoryBank, complete: false, stillCurrent: targetRuntime.stillCurrent });
        targetRuntime.taskResultSession = updated;
        return { updated, committed: true, taskResult: true };
    }
    let committed = false;
    let updated = null;
    if (targetRuntime?.archiveTarget) {
        if (!targetRuntime.stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
        const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget);
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
        const target = { ...targetRuntime.archiveTarget, ...latest, memory: latest.memory, cache: latest.cache || {} };
        const result = await targetRuntime.options.commitArchiveTargetMutation(
            target,
            core_constants.MODE.HEART,
            origin,
            (latestSession, liveMemory) => normalizeHeartContentPatch(latestSession || fallbackBase, [patch], liveMemory),
            fallbackBase,
            targetRuntime.stillCurrent,
        );
        updated = result.session;
        committed = !!updated;
        archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
    } else if (core_context.isCurrentTaskOrigin(origin)) {
        try {
            const context = core_context.currentCharacterGuard();
            const latestMemory = archive_repository.requireArchive(context);
            if (latestMemory.archiveRevision === expectedArchiveRevision) {
                updated = await core_cache.commitSessionMutation(
                    core_constants.MODE.HEART,
                    expectedChatId,
                    origin,
                    (latest, liveMemory) => normalizeHeartContentPatch(latest || fallbackBase, [patch], liveMemory),
                    fallbackBase,
                );
                committed = !!updated;
            }
        } catch {}
    }
    if (!committed && !targetRuntime?.archiveTarget) {
        // The live commit may throw after an await. Cancellation must not be
        // swallowed by its legacy fallback and queued as a late append.
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(origin);
        core_requestCoordinator.queueDeferredCommit(origin, { kind: 'heartPatches', patches: { [patchKey]: patch } });
        updated = normalizeHeartContentPatch(fallbackBase, [patch], memoryBank);
        updated.chatId = expectedChatId;
        updated.archiveRevision = expectedArchiveRevision;
    }
    const sameTargetVisible = targetRuntime?.archiveTarget
        ? runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId
        : true;
    const visible = runtimeState.activeSession;
    const sameReaderOwner = visible?.kind === core_constants.MODE.HEART
        && visible.chatId === expectedChatId && visible.archiveRevision === expectedArchiveRevision
        && (targetRuntime?.archiveTarget ? sameTargetVisible
            : !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin));
    if (committed && sameReaderOwner) {
        // Merge the latest committed content, never the saved reader cursor. The user may
        // have turned pages or changed standalone routes while this request was running.
        runtimeState.activeSession = preserveHeartSelection({ ...updated }, visible);
        if (runtimeState.activeMode === core_constants.MODE.HEART) ui_heartView.renderHeart();
    }
    return { updated, committed };
}

export async function generateHeartSection(part, options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage(part === 'seasons' ? runtimeState.activeSession?.selectedSeason || 'postending' : part, options);
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (part === 'seasons') return generateHeartSeasonSection(runtimeState.activeSession.selectedSeason || 'postending', options);
    if (part === 'fireflies') return generateHeartFirefliesSection(options);
    if (!['dialogues', 'strips'].includes(part)) return;
    return runOrdinaryHeartLogicalTask(part === 'dialogues' ? 'language' : part, options,
        logicalTask => generateHeartSectionOperation(part, options, logicalTask));
}

async function generateHeartSectionOperation(part, options, logicalTask) {
    const normalizedPart = ['dialogues', 'strips'].includes(part) ? part : '';
    let resumeFull = options.existing?.operation?.dialogueMode === 'full';
    let category = languageCategory(options.existing?.operation?.languageCategory || options.languageCategory);
    if (!normalizedPart) return;
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime(`part:${normalizedPart}`, logicalTask); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, normalizedPart === 'dialogues' ? 'language' : normalizedPart, options);
    resumeFull = options.existing?.operation?.dialogueMode === 'full';
    category = languageCategory(options.existing?.operation?.languageCategory || options.languageCategory);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let { context, memoryBank } = targetRuntime;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    memoryBank = sourceSnapshot?.memoryBank || memoryBank;
    const taskKey = `heart-part:${scope}:${normalizedPart}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '这一项已经在生成中。'), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    let base;
    try { base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    let sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, normalizedPart);
    let fullDialogues = normalizedPart === 'dialogues'
        && (options.replaceDialogues === true || resumeFull || !partsDialoguesReady(base));
    if (!sourceMemoryIds.length && !fullDialogues) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-section', part: normalizedPart });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前档案没有尚未用于${normalizedPart === 'dialogues' ? '基础语言' : '日常一格'}的新记忆。`), '心迹回廊');
        return;
    }
    const confirmationIdentity = JSON.stringify(compactHeartDialoguesExisting(base));
    if (fullDialogues && core_heartLanguage.heartLanguageStatus(base).hasContent
        && !ui_heartView.confirmHeartLanguageReplacement()) return;
    let origin = targetRuntime.origin;
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, `角色互动生成中：${normalizedPart === 'dialogues' ? '时期对话' : '日常一格'}`));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, base);
    sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, normalizedPart);
    fullDialogues = normalizedPart === 'dialogues'
        && (options.replaceDialogues === true || resumeFull || !partsDialoguesReady(base));
    if (!sourceMemoryIds.length && !fullDialogues) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-section', part: normalizedPart });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '另一项较新的任务已经覆盖这些新增记忆，本次没有重复生成。'), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    if (fullDialogues && JSON.stringify(compactHeartDialoguesExisting(base)) !== confirmationIdentity) {
        globalThis.toastr?.info?.('基础语言已被另一任务更新，请重新确认；旧内容保留。', '心迹回廊');
        return;
    }
    const coverage = {
        revisit: !!base && !core_incremental.incrementalArchiveMemoryIds(base, memoryBank, normalizedPart).length,
        coveragePart: normalizedPart,
        sourceMemoryIds,
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    origin = targetRuntime.origin;
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-section', part: normalizedPart, ...(normalizedPart === 'dialogues' ? { dialogueMode: fullDialogues ? 'full' : 'increment', ...(category ? { languageCategory: category } : {}) } : {}) }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        let persisted;
        if (normalizedPart === 'dialogues') {
            if (fullDialogues) {
                const core = await generation_client.requestValidatedSegment(
                    heartCorePrompt(context, memoryBank) + categoryLanguagePrompt(category),
                    partsDialoguesReady(base) ? '角色互动 · 正在重新生成基础语言…' : '角色互动 · 正在生成基础语言…',
                    { maxTokens: 6000, temperature: 0.35, context, origin, taskKey: `${taskKey}:dialogues-full`, mode: core_constants.MODE.HEART, background: true,
                        recoveryCompatibility: { contract: 'heart-language-birthday-r8412', legacyPrompts: [heartCoreLegacyPrompt(context, memoryBank) + categoryLanguagePrompt(category)] } },
                    raw => normalizeHeartCore(categoryLanguageInput(raw, category), memoryBank),
                );
                const fullCoverage = {
                    ...coverage,
                    sourceMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
                    coverageConsumedMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
                };
                persisted = await persistHeartPartialPatch('dialogues', { type: category && core_heartLanguage.heartLanguageStatus(base).hasContent && options.replaceDialogues !== true ? 'dialogues-increment' : 'dialogues', core, ...fullCoverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            } else {
                const core = await generation_client.requestValidatedSegment(
                    heartCoreIncrementPrompt(context, memoryBank, base, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'dialogues') + categoryLanguagePrompt(category),
                    '角色互动 · 追加时期对话',
                    { maxTokens: 4500, temperature: 0.4, context, origin, taskKey: `${taskKey}:dialogues`, mode: core_constants.MODE.HEART, background: true },
                    raw => normalizeHeartCoreIncrement(categoryLanguageInput(raw, category), memoryBank, sourceMemoryIds),
                );
                persisted = await persistHeartPartialPatch('dialogues', { type: 'dialogues-increment', core, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            }
        } else {
            const batch = await requestHeartPart(
                heartStripsPrompt(context, memoryBank, base, base, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'strips'),
                '角色互动 · 追加日常一格',
                { maxTokens: 5000, context, origin, taskKey: `${taskKey}:strips`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeHeartCollectionBatch(raw, 'strips'),
            );
            const batchId = core_incremental.incrementalBatchId('strips', sourceMemoryIds);
            const enriched = batch.items.map(item => ({ ...item, sourceArchiveMemoryIds: sourceMemoryIds, incrementBatchId: batchId, generatedAt: Date.now() }));
            persisted = await persistHeartPartialPatch('strips', { type: 'strips', dailyStrips: enriched, rejectedCount: batch.rejectedCount, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
        }
        await finishHeartRecovery(targetRuntime, persisted?.committed);
        if (!persisted?.committed) {
            globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '内容已生成，但尚未确认保存；保留草稿，未计入已保存数量。'), '心迹回廊');
        } else {
            const rejected = core_heartLanguage.heartCollectionIssues(persisted.updated)[normalizedPart] || 0;
            const message = normalizedPart === 'dialogues'
                ? `基础语言已有 ${core_heartLanguage.heartLanguageStatus(persisted.updated).total} 句；其他内容保留。`
                : `已有 ${persisted.updated?.dailyStrips?.length || 0} 篇日常一格。`;
            globalThis.toastr?.[rejected ? 'warning' : 'success']?.(heartTargetMessage(targetRuntime,
                message + (rejected ? `本次另有 ${rejected} 条未通过校验，可选择重试；已有内容照常阅读。` : '')), '心迹回廊');
        }
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
}

export async function generateHeartFirefliesSection(options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage('fireflies', options);
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    return runOrdinaryHeartLogicalTask('fireflies', options,
        logicalTask => generateHeartFirefliesSectionOperation(options, logicalTask));
}

async function generateHeartFirefliesSectionOperation(options, logicalTask) {
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime('fireflies', logicalTask); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, 'fireflies', options);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let context = targetRuntime.context;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    let memoryBank = sourceSnapshot?.memoryBank || targetRuntime.memoryBank;
    let origin = targetRuntime.origin;
    const taskKey = `heart-fireflies:${scope}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '萤火虫栖息地正在点亮。'), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    // A pure no-op must not advance the persistent HEART write fence. Inspect the freshly
    // revalidated preflight cache first, then repeat the decision after the real claim.
    let base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession);
    let hasExisting = Array.isArray(base?.fireflyVoices) && base.fireflyVoices.length > 0;
    let legacyBatch = legacyFireflyVoices(base).slice(0, 6);
    let existingFireflyCursor = core_incremental.incrementalPartRecord(base, 'fireflies');
    let sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, 'fireflies');
    if (!legacyBatch.length && hasExisting && base.fireflyVoices.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `萤火虫栖息地已经收集到 ${core_constants.HEART_FIREFLY_MAX_ITEMS} 个心声光点；旧光点不会自动删除。`), '心迹回廊');
        return;
    }
    if (!legacyBatch.length && hasExisting && existingFireflyCursor && !sourceMemoryIds.length) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '当前档案没有新的关系进展可用于解锁萤火虫。先增量更新档案，再来点亮新的光点。'), '心迹回廊');
        return;
    }
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, '角色互动生成中：萤火虫栖息地'));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    origin = targetRuntime.origin;
    memoryBank = sourceSnapshot?.memoryBank || targetRuntime.memoryBank;
    base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, base);
    hasExisting = Array.isArray(base?.fireflyVoices) && base.fireflyVoices.length > 0;
    legacyBatch = legacyFireflyVoices(base).slice(0, 6);
    if (legacyBatch.length) {
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        try {
            const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-fireflies', upgrade: true }, options);
            context = recovery.contentContext; memoryBank = recovery.contentBank;
            base = recovery.contentInputs?.baseSession || base;
            legacyBatch = legacyFireflyVoices(base).slice(0, 6);
            const upgraded = await requestHeartPart(
                heartFireflyUpgradePrompt(context, base, legacyBatch),
                '角色互动 · 正在把旧版萤火虫升级为 GS4 式追加约会会话…',
                { maxTokens: 5200, temperature: 0.72, context, origin, taskKey: `${taskKey}:upgrade`, mode: core_constants.MODE.HEART, background: true },
                raw => normalizeFireflyUpgradePart(raw, legacyBatch),
            );
            const result = await persistHeartPartialPatch('firefly-upgrade', { type: 'firefly-upgrade', fireflyVoices: upgraded }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
            await finishHeartRecovery(targetRuntime, result.committed);
            const remain = legacyFireflyVoices(result.updated || base).length;
            globalThis.toastr?.success?.(heartTargetMessage(targetRuntime, `已升级 ${upgraded.length} 个旧光点为追加约会会话${remain ? `，还剩 ${remain} 个可继续升级` : '，旧版独白光点已全部升级'}.`), '心迹回廊');
        } catch (error) {
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
        } finally {
            generation_recovery.detachGenerationRecovery(origin);
            runtimeState.activeModeBuildScopes.delete(taskKey);
            core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
            refreshHeartArchiveTarget(targetRuntime);
        }
        return;
    }
    if (hasExisting && base.fireflyVoices.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `萤火虫栖息地已经收集到 ${core_constants.HEART_FIREFLY_MAX_ITEMS} 个心声光点；旧光点不会自动删除。`), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    existingFireflyCursor = core_incremental.incrementalPartRecord(base, 'fireflies');
    if (hasExisting && !existingFireflyCursor) {
        const migrated = core_incremental.stampIncrementalCoverage(structuredClone(base), base, memoryBank, 'fireflies', core_incremental.archiveMemoryIds(memoryBank), 0);
        migrated.chatId = expectedChatId;
        migrated.archiveRevision = expectedArchiveRevision;
        try {
            const persisted = await persistHeartWholeSession(migrated, targetRuntime, origin);
            const sameTargetVisible = !targetRuntime.archiveTarget
                || runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId;
            if (persisted && sameTargetVisible && runtimeState.activeSession?.kind === core_constants.MODE.HEART
                && runtimeState.activeSession.chatId === expectedChatId && runtimeState.activeSession.archiveRevision === expectedArchiveRevision
                && (targetRuntime.archiveTarget || !runtimeState.activeArchiveSnapshot && core_context.isCurrentTaskOrigin(origin))) {
                runtimeState.activeSession = preserveHeartSelection({ ...persisted }, runtimeState.activeSession);
                ui_heartView.renderHeart();
            }
            globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '已把旧版萤火虫保存为永久解锁基线。之后档案出现新的 Mxxx 时，只会继续追加新光点。'), '心迹回廊');
        } finally {
            runtimeState.activeModeBuildScopes.delete(taskKey);
            refreshHeartArchiveTarget(targetRuntime);
        }
        return;
    }
    sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(base, memoryBank, 'fireflies');
    if (hasExisting && !sourceMemoryIds.length) {
        await clearCommittedHeartRecovery(targetRuntime, base, { kind: 'heart-fireflies' });
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '较新的任务已经覆盖当前关系进展，本次没有重复请求。'), '心迹回廊');
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    const coverage = {
        coveragePart: 'fireflies',
        sourceMemoryIds,
        coverageConsumedMemoryIds: hasExisting ? sourceMemoryIds : core_incremental.archiveMemoryIds(memoryBank),
        archiveMemoryIds: core_incremental.archiveMemoryIds(memoryBank),
        archiveRevision: memoryBank.archiveRevision,
    };
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-fireflies', upgrade: false }, options);
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        base = recovery.contentInputs?.baseSession || base;
        const batch = await requestHeartPart(
            heartFireflyPrompt(context, memoryBank, base, hasExisting ? base : null, sourceMemoryIds) + core_incremental.derivedExpansionDirective(base, memoryBank, 'fireflies'),
            hasExisting ? '角色互动 · 正在解锁新的萤火虫心声…' : '角色互动 · 正在点亮萤火虫栖息地…',
            { maxTokens: 5200, temperature: 0.8, context, origin, taskKey, mode: core_constants.MODE.HEART, background: true },
            raw => normalizeHeartCollectionBatch(raw, 'fireflies'),
        );
        const batchId = core_incremental.incrementalBatchId('fireflies', sourceMemoryIds);
        const enriched = batch.items.map(item => ({
            ...item,
            sourceArchiveMemoryIds: sourceMemoryIds,
            incrementBatchId: batchId,
            generatedAt: Date.now(),
        }));
        const result = await persistHeartPartialPatch('fireflies', { type: 'fireflies', fireflyVoices: enriched, rejectedCount: batch.rejectedCount, ...coverage }, base, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
        await finishHeartRecovery(targetRuntime, result.committed);
        const total = result.updated?.fireflyVoices?.length || base.fireflyVoices?.length || 0;
        const addedNow = Math.max(0, total - (base.fireflyVoices?.length || 0));
        if (!result.committed) globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, '光点已生成，但尚未确认保存；草稿保留。'), '心迹回廊');
        else globalThis.toastr?.[batch.rejectedCount ? 'warning' : 'success']?.(heartTargetMessage(targetRuntime,
            `已有 ${total} 个萤火虫光点，本次新增 ${addedNow} 个。` + (batch.rejectedCount ? `另有 ${batch.rejectedCount} 个话题未通过校验，可选择重试。` : '')), '心迹回廊');
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), '心迹回廊');
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
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

// A sibling completed by this operation is an output, not a new input. Keeping it
// out of the duplicate-avoidance index makes retry identity independent of which
// sibling finished first. Older drafts are matched against their exact old index,
// with all context/identity/hash and normal validation checks still in place.
export function heartSeasonRequestBase(session, season, batchId) {
    const keep = (item, kind) => !(batchId && item?.incrementBatchId === batchId && kind === season);
    return { ...session,
        voiceDramas: (session?.voiceDramas || []).filter(item => keep(item, item?.kind)),
        scenarioDramas: (session?.scenarioDramas || []).filter(item => keep(item, item?.season)),
    };
}

export async function generateHeartSeasonSection(season, options = {}) {
    if (heartParticipantRegeneration(options)) return regenerateHeartPage(season, options);
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const allowed = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);
    const normalizedSeason = allowed.has(season) ? season : '';
    if (!normalizedSeason) return;
    return runOrdinaryHeartLogicalTask(normalizedSeason, options,
        logicalTask => generateHeartSeasonSectionOperation(normalizedSeason, options, logicalTask));
}

async function generateHeartSeasonSectionOperation(normalizedSeason, options, logicalTask) {
    const targetHint = heartPreparationTargetHint();
    let targetRuntime;
    try { targetRuntime = await prepareHeartSubtaskRuntime(`season:${normalizedSeason}`, logicalTask); }
    catch (error) {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetHint, core_text.safeErrorSummary(error))), '心迹回廊');
        return;
    }
    options = ordinaryHeartRecoveryOptions(targetRuntime, normalizedSeason, options);
    const { expectedChatId, expectedArchiveRevision, scope } = targetRuntime;
    let { context, memoryBank } = targetRuntime;
    const sourceSnapshot = generation_recovery.readGenerationContentSnapshot(options.existing);
    memoryBank = sourceSnapshot?.memoryBank || memoryBank;
    const taskKey = `heart-season:${scope}:${normalizedSeason}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.HEART, context) || core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `${ui_heartView.heartSeasonLabel(normalizedSeason)}正在生成中。`), '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(heartTargetMessage(targetRuntime, `当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成。`), '心迹回廊');
        return;
    }
    if (await clearCommittedHeartRecovery(targetRuntime, latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession), { kind: 'heart-season', season: normalizedSeason })) {
        globalThis.toastr?.info?.('原季节篇章已完整保存，已清理完成草稿；没有重复生成。', '心迹回廊');
        return;
    }
    let origin = targetRuntime.origin;
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, core_constants.MODE.HEART,
        heartTargetMessage(targetRuntime, `角色互动生成中：${ui_heartView.heartSeasonLabel(normalizedSeason)} Drama`));
    try {
    if (!await beginHeartSubtask(targetRuntime)) {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        refreshHeartArchiveTarget(targetRuntime);
        return;
    }
    const base = sourceSnapshot?.contentInputs?.baseSession || latestHeartSessionForRuntime(targetRuntime, runtimeState.activeSession);
    const latestSession = () => targetRuntime.recoveryHandle?.contentInputs?.baseSession
        ? structuredClone(targetRuntime.recoveryHandle.contentInputs.baseSession) : latestHeartSessionForRuntime(targetRuntime, base);
    const existingRecovery = options.existing === undefined
        ? options.draftId ? core_cache.loadGenerationRecovery(core_constants.MODE.HEART, context, targetRuntime.archiveTarget?.cache,
            { draftId: options.draftId, pageId: normalizedSeason }) : null : options.existing;
    const previousOperation = existingRecovery?.operation;
    const batchId = previousOperation?.kind === 'heart-season' && previousOperation.season === normalizedSeason
        ? previousOperation.batchId : nextHeartDramaBatchId(base, normalizedSeason);
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

    origin = targetRuntime.origin;
    core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
    const errors = [];
    let savedParts = 0;
    let allCommitted = true;
    let offeredSecond = false;
    try {
        const recovery = await startHeartRecovery(targetRuntime, { kind: 'heart-season', season: normalizedSeason, batchId }, { ...options, existing: existingRecovery });
        context = recovery.contentContext; memoryBank = recovery.contentBank;
        if (normalizedSeason === 'postending') {
            const latest = latestSession();
            try {
                const voice = enrichVoice((await requestHeartPart(
                    heartPostVoicePrompt(context, memoryBank, latest, latest, null),
                    '角色互动 · 追加未来 / 后日谈',
                    { maxTokens: 3800, temperature: 0.65, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true },
                    raw => normalizeVoiceDramaPart(raw, ['postending'], memoryBank),
                ))[0]);
                const persisted = await persistHeartPartialPatch(`season:postending:${batchId}:voice`, { type: 'season', season: 'postending', voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                allCommitted &&= persisted.committed;
                if (persisted.committed) savedParts += 1;
            } catch (error) {
                await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                errors.push(error);
            }
        } else {
            let latest = latestSession();
            let voice = latest.voiceDramas?.find(item => item.kind === normalizedSeason && item.incrementBatchId === batchId) || null;
            let scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || null;

            if (!voice) {
                try {
                    voice = enrichVoice((await requestHeartPart(
                        heartSeasonVoicePrompt(context, memoryBank, latest, normalizedSeason, heartSeasonRequestBase(latest, normalizedSeason, batchId), null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Voice`,
                        { maxTokens: 3000, temperature: 0.65, context, origin, taskKey: `${taskKey}:voice`, mode: core_constants.MODE.HEART, background: true,
                            recoveryCompatibility: { contract: 'heart-season-siblings-r8412',
                                legacyPrompts: [heartSeasonVoicePrompt(context, memoryBank, latest, normalizedSeason, latest, null)] } },
                        raw => normalizeVoiceDramaPart(raw, [normalizedSeason], memoryBank),
                    ))[0]);
                    const persisted = await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:voice`, { type: 'season', season: normalizedSeason, voice }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                    allCommitted &&= persisted.committed;
                    if (persisted.committed) savedParts += 1;
                    latest = latestSession();
                } catch (error) {
                    await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                    errors.push(error);
                }
            }

            scenario = latest.scenarioDramas?.find(item => item.season === normalizedSeason && item.incrementBatchId === batchId) || scenario;
            const runScenario = options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true;
            if (!scenario && voice && !runScenario && !errors.length) {
                offeredSecond = true;
                core_requestCoordinator.noteSecondStepOffer(origin, {
                    label: '小事件', kind: 'heart-scenario', mode: core_constants.MODE.HEART, pageId: normalizedSeason,
                });
            }
            if (!scenario && runScenario && !errors.some(recoveryStopsHeart)) {
                try {
                    scenario = enrichScenario((await requestHeartPart(
                        heartSeasonScenarioPrompt(context, memoryBank, latest, normalizedSeason, heartSeasonRequestBase(latest, normalizedSeason, batchId), null),
                        `角色互动 · 追加${ui_heartView.heartSeasonLabel(normalizedSeason)} Scenario`,
                        { maxTokens: 3200, temperature: 0.65, context, origin, taskKey: `${taskKey}:scenario`, mode: core_constants.MODE.HEART, background: true,
                            recoveryCompatibility: { contract: 'heart-season-siblings-r8412',
                                legacyPrompts: [heartSeasonScenarioPrompt(context, memoryBank, latest, normalizedSeason, latest, null)] } },
                        raw => normalizeScenarioDramaPart(raw, normalizedSeason, memoryBank),
                    ))[0]);
                    const persisted = await persistHeartPartialPatch(`season:${normalizedSeason}:${batchId}:scenario`, { type: 'season', season: normalizedSeason, scenario }, latest, memoryBank, origin, expectedChatId, expectedArchiveRevision, targetRuntime);
                    allCommitted &&= persisted.committed;
                    if (persisted.committed) savedParts += 1;
                } catch (error) {
                    await generation_recovery.noteGenerationRecoveryFailure(origin, error);
                    errors.push(error);
                }
            }
        }

        if (errors.length && !savedParts) throw errors[0];
        if (errors.length) {
            globalThis.toastr?.warning?.(heartTargetMessage(targetRuntime, `${ui_heartView.heartSeasonLabel(normalizedSeason)}已保存成功部分；${core_text.safeErrorSummary(errors[0])} 已有篇章照常阅读；需要时可选择重试未完成篇。`), '心迹回廊');
        } else {
            await finishHeartRecovery(targetRuntime, allCommitted);
            globalThis.toastr?.[allCommitted ? 'success' : 'info']?.(heartTargetMessage(targetRuntime, allCommitted
                ? (offeredSecond ? `已保存 ${ui_heartView.heartSeasonLabel(normalizedSeason)} 的 Voice。可以第二次生成小事件。` : `已保存 ${ui_heartView.heartSeasonLabel(normalizedSeason)} 的新增篇章。`)
                : '篇章已生成，但尚未确认保存；草稿保留。'), '心迹回廊');
        }
    } catch (error) {
        await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(heartTargetMessage(targetRuntime, core_text.safeErrorSummary(error))), `心迹回廊 · ${ui_heartView.heartSeasonLabel(normalizedSeason)} Drama`);
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.HEART, origin);
        refreshHeartArchiveTarget(targetRuntime);
    }
}

export function normalizeHeartScript(rawLines, { minLines = 8, minChars = 500, characterName = '', userName = '' } = {}) {
    // The shared post-split budget also applies on re-normalization; never slice an expanded script.
    const lines = core_dialogue.normalizeDialogueRows(rawLines, { strict: true, characterName, userName });
    if (lines.length < minLines || lines.reduce((sum, line) => sum + line.text.length, 0) < minChars) return [];
    return lines;
}

export function normalizeHeart(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    // HEART may legitimately have no archive-backed relationship evidence. In that case
    // the source fields stay empty; this mode must not invent an Mxxx/anchor merely to pass validation.

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 40, 600);
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
            characterName: memoryBank?.characterName, userName: memoryBank?.userName,
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
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360, characterName: memoryBank?.characterName, userName: memoryBank?.userName });
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
        if (!imagePrompt) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            ...cg_visual.generatedCgDraftFields(item),
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
        collectionIssues: core_heartLanguage.heartCollectionIssues(data),
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
            dialogues: core_heartLanguage.heartLanguageStatus({ ...data, greetings }).complete,
            seasons: data?.generationParts?.seasons === true || voiceDramas.length > 0 || scenarioDramas.length > 0,
            strips: data?.generationParts?.strips === true || dailyStrips.length > 0,
            fireflies: data?.generationParts?.fireflies === true || fireflyVoices.length > 0,
        },
        selectedSeason: ['postending', 'spring', 'summer', 'autumn', 'winter'].includes(data?.selectedSeason) ? data.selectedSeason : 'postending',
        view: ['seasons', 'strips', 'fireflies'].includes(data?.view) ? data.view : 'seasons',
        generationMeta: data?.generationMeta && typeof data.generationMeta === 'object' ? structuredClone(data.generationMeta) : undefined,
    };
}
