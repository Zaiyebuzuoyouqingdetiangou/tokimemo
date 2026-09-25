import * as core_constants from '../core/constants.js';
import * as core_heartLanguage from '../core/heartLanguage.js';
import * as core_dialogue from '../core/dialogue.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
// HEART 提示词：主线、增量、四季语音/场景、萤火虫、日常一格与基础语言
// 从 modes/heart.js 原样搬出（重构阶段 2），声明文本一字未改；modes/heart.js 仍转发原有导出。

export function heartCorePrompt(context, memoryBank) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 时期对话', null, memoryBank)}
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
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 时期对话增量', null, memoryBank)}
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
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / Drama：未来', null, memoryBank)}
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
    return `${generation_prompts.promptSafetyBoundary(context, `角色互动 / Drama：${label} Voice`, null, memoryBank)}
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
    return `${generation_prompts.promptSafetyBoundary(context, `角色互动 / Drama：${label} Scenario`, null, memoryBank)}
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
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 萤火虫栖息地', null, memoryBank)}
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

export function heartFireflyUpgradePrompt(context, core, items, memoryBank = null) {
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
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 旧版萤火虫升级为 GS4 式会话', null, memoryBank)}
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

export function heartStripsPrompt(context, memoryBank, core, previous = null, sourceMemoryIds = null) {
    return `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 日常一格', null, memoryBank)}
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

export function languageCategory(raw) {
    return core_constants.HEART_GREETING_KEYS.includes(raw) ? raw : '';
}

export function categoryLanguageInput(raw, category) {
    if (!category) return raw;
    return { ...raw, greetings: { [category]: raw?.greetings?.[category] }, specialDays: [] };
}

export function categoryLanguagePrompt(category) {
    return category ? `\n本次只写 greetings.${category} 的新完整台词，其他类别留空，不为数量凑句；不要输出特别日。` : '';
}

export async function requestHeartPart(prompt, status, options, validator) {
    return generation_client.requestValidatedSegment(prompt, status, options, validator);
}

export function partsDialoguesReady(session) {
    return core_heartLanguage.heartLanguageStatus(session).complete;
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
