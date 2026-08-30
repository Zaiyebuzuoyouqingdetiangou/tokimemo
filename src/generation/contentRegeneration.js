// Targeted regeneration for user-managed derived content.
// Targets are selected only from the currently normalized session; model output never chooses a cache path.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_album from '../modes/album.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_phone from '../modes/phone.js';
import * as generation_client from './client.js';
import * as generation_prompts from './prompts.js';

function taskOptions(mode, context, origin, taskKey, maxTokens = 6000, temperature = 0.45) {
    return { maxTokens, temperature, context, origin, taskKey, mode, background: true };
}

export function sameEvidence(candidate, current) {
    const wanted = [...new Set(core_text.cleanArray(current?.sourceMemoryIds, 16, 40))].sort();
    const got = [...new Set(core_text.cleanArray(candidate?.sourceMemoryIds, 16, 40))].sort();
    const sameIds = wanted.length === got.length && wanted.every((id, index) => id === got[index]);
    const anchor = core_text.normalizeText(current?.sourceMemoryAnchor, 240);
    return sameIds && (!anchor || core_text.normalizeText(candidate?.sourceMemoryAnchor, 240) === anchor);
}

async function regenerateAlbumEntry(session, item, context, memoryBank, origin, taskKey) {
    const evidence = core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 12);
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '回忆相簿 / 单项重新生成')}
只重新生成下面这一张相簿卡的【表现文本和视觉提示】，它仍然必须描述同一个真实档案事件。不得把它改成别的事件，不得改变 sourceMemoryIds/sourceMemoryAnchor，也不要输出实图 URL。
CURRENT_ITEM_JSON:\n${JSON.stringify({ ...item, cgImage: undefined, comments: undefined }, null, 2)}
TRUSTED_EVENT_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}
严格输出：{"entries":[{"id":"${core_text.esc(item.id)}","title":"...","date":"...","desc":"...","category":${JSON.stringify(item.category || '日常')},"unlocked":${item.unlocked ? 'true' : 'false'},"sourceMemoryIds":${JSON.stringify(item.sourceMemoryIds)},"sourceMemoryAnchor":${JSON.stringify(item.sourceMemoryAnchor)},"visualSeed":["..."],"imagePrompt":"...","hintLines":${item.unlocked ? '[]' : '["重新生成解锁提示"]'}}]}
只输出 JSON。`;
    const normalized = await generation_client.requestValidatedSegment(
        prompt, `重新生成相簿「${item.title}」…`, taskOptions(core_constants.MODE.ALBUM, context, origin, `${taskKey}:album`, 6000),
        raw => modes_album.normalizeAlbumIndex(raw, memoryBank),
    );
    const candidate = normalized.entries[0];
    if (!candidate || !sameEvidence(candidate, item)) throw new Error('重新生成的相簿条目没有保持原档案证据。');
    let comments = [];
    let relationshipSnapshot = null;
    if (item.unlocked) {
        relationshipSnapshot = await generation_client.requestValidatedSegment(
            modes_album.albumRelationshipScanPrompt(context, memoryBank),
            `扫描「${item.title}」共同回忆前的双方感情状态…`, taskOptions(core_constants.MODE.ALBUM, context, origin, `${taskKey}:relationship`, 5000, 0.25),
            raw => modes_album.normalizeAlbumRelationshipSnapshot(raw, memoryBank),
        );
        const rawComments = await generation_client.requestValidatedSegment(
            modes_album.albumCommentsPrompt(context, memoryBank, [{ ...candidate, id: item.id }], relationshipSnapshot),
            `重新生成「${item.title}」共同回忆…`, taskOptions(core_constants.MODE.ALBUM, context, origin, `${taskKey}:comments`, 5000),
            raw => modes_album.normalizeAlbumCommentsBatch(raw, [{ ...candidate, id: item.id }]),
        );
        comments = rawComments.get(item.id) || [];
    }
    return { ...candidate, id: item.id, sourceMemoryIds: [...item.sourceMemoryIds], sourceMemoryAnchor: item.sourceMemoryAnchor, comments, relationshipSnapshot, cgImage: null };
}

async function regenerateAdvEvent(session, item, context, memoryBank, origin, taskKey) {
    const evidence = core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 12);
    const prompt = `${generation_prompts.promptSafetyBoundary(context, 'ADV EVENT / 单个事件重新生成')}
只重新生成这个 ADV EVENT 的事件卡、CG 描述和视觉提示。必须仍然是同一个档案事件；sourceMemoryIds/sourceMemoryAnchor 原样返回。ADV 正文会另行生成，不要在这里写正文，不要输出图片 URL。
CURRENT_EVENT_JSON:\n${JSON.stringify({ ...item, adv: undefined, cgImage: undefined }, null, 2)}
TRUSTED_EVENT_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}
严格输出：{"events":[{"id":"${core_text.esc(item.id)}","title":"...","date":"...","cgDesc":"...","sourceMemoryIds":${JSON.stringify(item.sourceMemoryIds)},"sourceMemoryAnchor":${JSON.stringify(item.sourceMemoryAnchor)},"visualSeed":["..."],"imagePrompt":"..."}]}
只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, `重新生成 ADV EVENT「${item.title}」…`, taskOptions(core_constants.MODE.ADV, context, origin, `${taskKey}:event`, 6000),
        data => modes_advEvent.normalizeEventList(data, memoryBank, { allowPartial: false }),
    );
    const candidate = raw.events[0];
    if (!candidate || !sameEvidence(candidate, item)) throw new Error('重新生成的 ADV EVENT 没有保持原档案证据。');
    return { ...candidate, id: item.id, sourceMemoryIds: [...item.sourceMemoryIds], sourceMemoryAnchor: item.sourceMemoryAnchor, adv: null, cgImage: null };
}

async function regenerateAdvText(item, context, memoryBank, origin, taskKey) {
    const raw = await generation_client.requestValidatedSegment(
        modes_advEvent.advPrompt(context, item, memoryBank),
        `重新生成「${item.title}」ADV 正文…`, taskOptions(core_constants.MODE.ADV, context, origin, `${taskKey}:text`, 12000, 0.55),
        modes_advEvent.normalizeAdv,
    );
    return raw;
}

async function regenerateHeartVoice(session, item, context, memoryBank, origin, taskKey) {
    const kind = core_text.normalizeText(item.kind, 40).toLowerCase();
    const prompt = kind === 'postending'
        ? modes_heart.heartPostVoicePrompt(context, memoryBank, session, null, null)
        : modes_heart.heartSeasonVoicePrompt(context, memoryBank, session, kind, null, null);
    const list = await modes_heart.requestHeartPart(
        prompt, `重新生成 ${item.title}…`, taskOptions(core_constants.MODE.HEART, context, origin, `${taskKey}:voice`, 8000, 0.65),
        raw => modes_heart.normalizeVoiceDramaPart(raw, [kind]),
    );
    return { ...list[0], id: item.id, incrementBatchId: item.incrementBatchId || '', sourceArchiveMemoryIds: item.sourceArchiveMemoryIds || [], generatedAt: Date.now() };
}

async function regenerateHeartScenario(session, item, context, memoryBank, origin, taskKey) {
    const season = core_text.normalizeText(item.season, 40).toLowerCase();
    const list = await modes_heart.requestHeartPart(
        modes_heart.heartSeasonScenarioPrompt(context, memoryBank, session, season, null, null),
        `重新生成 ${item.title}…`, taskOptions(core_constants.MODE.HEART, context, origin, `${taskKey}:scenario`, 9000, 0.7),
        raw => modes_heart.normalizeScenarioDramaPart(raw, season),
    );
    return { ...list[0], id: item.id, incrementBatchId: item.incrementBatchId || '', sourceArchiveMemoryIds: item.sourceArchiveMemoryIds || [], generatedAt: Date.now() };
}


async function regenerateHeartFirefly(session, item, context, memoryBank, origin, taskKey) {
    const color = core_text.normalizeText(item?.color, 20).toLowerCase();
    const meta = {
        pink: 'GS4 分类：恋爱。围绕喜欢、特别感、想更靠近等恋爱情绪',
        blue: 'GS4 分类：恋爱的烦恼。围绕吃醋、不安、竞争意识、怕失去或想确认关系',
        yellow: 'GS4 分类：朋友。围绕明确存在的朋友、同学、同事或朋友圈关系；不得凭空编固定人物',
        white: 'GS4 分类：お楽しみ / 个性话题。围绕角色自己的梦想、兴趣、食物、习惯、工作学习、宠物、价值观等；具体事实必须来自受控设定',
        desire: '本插件扩展：对 {{user}} 更直白的渴望或身体亲近愿望；禁止露骨性行为或色情细节',
    }[color] || '追加约会话题';
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '角色互动 / 单个萤火虫追加约会会话重新生成')}
RELATIONSHIP_TONE_ONLY_JSON:
${modes_heart.heartDramaRelationshipOnlyContext(session)}
当前光点颜色固定为 ${color}，含义：${meta}。
只重新生成这一颗光点对应的【现场追加约会会话】，不得改变颜色。GS4 的“心の声”在表现上是角色在特殊气氛里把本音不小心说出口、主人公回应、话题继续推进，而不是连续的第三人称内心独白。
CURRENT_FIREFLY_JSON:
${JSON.stringify(item, null, 2)}
严格输出：{"fireflyVoices":[{"id":"${core_text.esc(item.id)}","color":"${core_text.esc(color)}","title":"4～18字话题标题","script":[{"speaker":"char","text":"..."},{"speaker":"user","text":"..."},{"speaker":"char","text":"..."},{"speaker":"user_thought","text":"..."}]}]}。
要求：5～10 个节点，至少3条 char、1条 user，总文本约140～420字；user 只能是非正史的中性即时回应，user_thought 最多1条且只能放最后。不要连续写“她怎么怎样”式总结。只输出 JSON。`;
    const list = await modes_heart.requestHeartPart(
        prompt,
        '重新生成萤火虫追加约会会话…',
        taskOptions(core_constants.MODE.HEART, context, origin, `${taskKey}:firefly`, 4200, 0.75),
        raw => modes_heart.normalizeFireflyVoicesPart(raw, { minTotal: 1, requireDistribution: false, requireRich: true }),
    );
    const candidate = list[0];
    if (!candidate || candidate.color !== color) throw new Error('重新生成的萤火虫会话没有保持原颜色。');
    return { ...candidate, id: item.id, color, generatedAt: Date.now() };
}

async function regenerateHeartStrip(session, item, context, memoryBank, origin, taskKey) {
    const list = await modes_heart.requestHeartPart(
        modes_heart.heartStripsPrompt(context, memoryBank, session, null, null),
        `重新生成日常一格「${item.title}」…`, taskOptions(core_constants.MODE.HEART, context, origin, `${taskKey}:strip`, 7000, 0.7),
        modes_heart.normalizeHeartStripsPart,
    );
    const candidate = list[0];
    if (!candidate) throw new Error('日常一格重新生成没有返回可用内容。');
    return { ...candidate, id: item.id, incrementBatchId: item.incrementBatchId || '', sourceArchiveMemoryIds: item.sourceArchiveMemoryIds || [], cgImage: null, generatedAt: Date.now() };
}

function phonePlanFromSession(session, app) {
    return {
        title: session.title,
        deviceName: session.deviceName,
        deviceKind: session.deviceKind,
        lockText: session.lockText,
        liveStates: session.liveStates,
        apps: [app],
    };
}

async function regeneratePhoneApp(session, app, context, memoryBank, origin, taskKey) {
    const planApp = {
        id: app.id, label: app.label, kind: app.kind, summary: app.summary,
        incremental: true,
        entries: (app.entries || []).map(entry => ({ id: entry.id, title: entry.title, meta: entry.meta })),
    };
    const plan = phonePlanFromSession(session, planApp);
    const raw = await generation_client.requestValidatedSegment(
        modes_phone.phoneAppPrompt(context, memoryBank, plan, planApp),
        `重新生成 App「${app.label}」…`, taskOptions(core_constants.MODE.PHONE, context, origin, `${taskKey}:app`, app.kind === 'chat' ? 12000 : 9000, 0.55),
        data => modes_phone.normalizePhoneDraftApp(data, planApp, memoryBank, session.deviceKind),
    );
    return raw;
}

async function regeneratePhoneEntry(session, app, entry, context, memoryBank, origin, taskKey) {
    const planApp = { id: app.id, label: app.label, kind: app.kind, summary: app.summary, incremental: true, entries: [{ id: entry.id, title: entry.title, meta: entry.meta }] };
    const plan = phonePlanFromSession(session, planApp);
    const raw = await generation_client.requestValidatedSegment(
        modes_phone.phoneAppPrompt(context, memoryBank, plan, planApp),
        `重新生成「${entry.title}」…`, taskOptions(core_constants.MODE.PHONE, context, origin, `${taskKey}:entry`, 8000, 0.6),
        data => modes_phone.normalizePhoneDraftApp(data, planApp, memoryBank, session.deviceKind),
    );
    return raw.entries[0];
}

async function regenerateEndingRoute(session, item, context, memoryBank, origin, taskKey) {
    if (item.available) {
        return generation_client.requestValidatedSegment(
            modes_ending.endingRouteDetailPrompt(context, memoryBank, session, item),
            `重新生成结局路线「${item.title}」…`, taskOptions(core_constants.MODE.ENDING, context, origin, `${taskKey}:route`, 14000, 0.65),
            raw => modes_ending.normalizeEndingRouteDetail(raw, item),
        );
    }
    const evidence = core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 10);
    const prompt = `${generation_prompts.promptSafetyBoundary(context, 'ENDING / 未解锁路线单项重新生成')}
只重新生成这条【尚未解锁】路线的标题、副标题和解锁提示。type、available=false、sourceMemoryIds/sourceMemoryAnchor 必须原样保持，不得提前写终章或后日谈。
CURRENT_ROUTE_JSON:\n${JSON.stringify(item, null, 2)}
TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}
严格输出：{"ending":{"title":"...","subtitle":"...","unlockHint":"..."}}。只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, `重新生成未解锁路线「${item.title}」…`, taskOptions(core_constants.MODE.ENDING, context, origin, `${taskKey}:locked-route`, 4000, 0.5),
        data => {
            const route = data?.ending || {};
            const title = core_text.normalizeText(route.title, 100);
            const subtitle = core_text.normalizeText(route.subtitle, 240);
            const unlockHint = core_text.normalizeText(route.unlockHint, 1200);
            if (!title || !unlockHint) throw new Error('未解锁路线重新生成结果不完整。');
            return { title, subtitle, unlockHint };
        },
    );
    return { ...item, ...raw, available: false, endingScene: '', confession: '', confessionLines: [], creditsLine: '', epilogue: { title: '后日谈', timeSkip: '', scenes: [], finalLine: '' } };
}

async function regenerateEndingConfession(item, context, memoryBank, origin, taskKey) {
    const evidence = core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 12);
    const prompt = `${generation_prompts.promptSafetyBoundary(context, 'ENDING / 单个告白回看重新生成')}
只重写下面这个【已经发生并有证据的告白回看】的播放器文本。不得改变发生与否、参与者、sourceMemoryIds/sourceMemoryAnchor，也不得发明新的告白。
CURRENT_REPLAY_JSON:\n${JSON.stringify(item, null, 2)}
TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}
严格输出：{"confessionReplays":[{"id":"${core_text.esc(item.id)}","title":"...","subtitle":"...","type":"${core_text.esc(item.type || 'other')}","date":"${core_text.esc(item.date || '')}","sourceMemoryIds":${JSON.stringify(item.sourceMemoryIds || [])},"sourceMemoryAnchor":${JSON.stringify(item.sourceMemoryAnchor || '')},"scene":"至少140字的已发生场景回看","confessionText":"至少50字的告白核心文本","confessionLines":["{{char}} 的第一人称告白句1","告白句2","告白句3","告白句4"],"responseSummary":"...","afterEffect":"...","easterEgg":{"moduleType":"heartbeat_console","title":"情感模块标题","statusLine":"此刻的情感状态","logs":["人类可读的情感运行日志1","日志2","日志3","日志4"],"monologue":["直白深情的内心独白1","内心独白2"],"poem":["逐渐浮现的短句1","短句2","短句3","短句4"],"feedback":{"pulse":"触碰心跳反馈","hover":"悬停反馈","reveal":"解锁短句反馈","stabilize":"稳定信号反馈","pause":"暂停日志反馈","resume":"恢复日志反馈"}}}]}
easterEgg 只允许上述结构化文字和 moduleType 枚举，不得输出 JavaScript、HTML、CSS、URL、事件处理器或任何代码；所有互动均由插件本地固定代码执行。
只输出 JSON。`;
    const list = await generation_client.requestValidatedSegment(
        prompt, `重新生成告白回看「${item.title || item.id}」…`, taskOptions(core_constants.MODE.ENDING, context, origin, `${taskKey}:confession`, 7000, 0.55),
        raw => modes_ending.normalizeEndingConfessionReplays(raw?.confessionReplays, memoryBank),
    );
    const candidate = list[0];
    if (!candidate || !sameEvidence(candidate, item)) throw new Error('重新生成的告白回看没有保持原档案证据。');
    return { ...candidate, id: item.id, sourceMemoryIds: [...(item.sourceMemoryIds || [])], sourceMemoryAnchor: item.sourceMemoryAnchor || '' };
}

async function regenerateAchievement(item, context, memoryBank, origin, taskKey) {
    const evidence = item.unlocked ? core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 10) : [];
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '成就库 / 单项重新生成')}
只重新生成下面这一项成就的标题、说明、等级和提示。已解锁时还必须写清具体解锁条件；解锁状态以及已解锁成就的档案证据不得改变。
CURRENT_ACHIEVEMENT_JSON:\n${JSON.stringify(item, null, 2)}
${item.unlocked ? `TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}` : ''}
严格输出：{"entries":[{"id":"${core_text.esc(item.id)}","title":"...","description":"...","category":"...","tier":"bronze","unlocked":${item.unlocked ? 'true' : 'false'},"unlockedAt":${JSON.stringify(item.unlockedAt || '')},"unlockCondition":${item.unlocked ? '"一句话说明做到或经历了什么才解锁，并受同一组证据支持"' : '""'},"sourceMemoryIds":${JSON.stringify(item.sourceMemoryIds || [])},"sourceMemoryAnchor":${JSON.stringify(item.sourceMemoryAnchor || '')},"hint":"..."}]}
只输出 JSON。`;
    const normalized = await generation_client.requestValidatedSegment(
        prompt, `重新生成成就「${item.title}」…`, taskOptions(core_constants.MODE.ACHIEVEMENTS, context, origin, `${taskKey}:achievement`, 5000, 0.6),
        raw => modes_achievements.normalizeAchievements(raw, memoryBank, { allowPartial: false }),
    );
    const candidate = normalized.entries[0];
    if (!candidate) throw new Error('成就重新生成没有返回可用条目。');
    if (item.unlocked && !sameEvidence(candidate, item)) throw new Error('重新生成的成就没有保持原档案证据。');
    return { ...candidate, id: item.id, unlocked: item.unlocked, unlockedAt: item.unlockedAt, sourceMemoryIds: [...(item.sourceMemoryIds || [])], sourceMemoryAnchor: item.sourceMemoryAnchor || '' };
}

async function regenerateCalendarEntry(item, context, memoryBank, origin, taskKey) {
    const evidence = item.status === 'future' ? [] : core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 10);
    const instruction = item.status === 'past'
        ? '只重新整理这条已完成日历事项的短标题和语义标签。不得改日期、发生与否或档案事实，不要生成感想、独白或剧情摘要。'
        : item.status === 'promised'
            ? '只重新整理这条未来待办的短标题和语义标签。不得写成已经兑现，也不得改日期或证据。'
            : '只重新整理这个世界设定提醒的短标题和语义标签。不得写成两个人已经约好或已经发生。';
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '两个人的日历 / 单项重新整理')}
${instruction}
允许标签仅限：["约会","接送","出行","见面","生日","纪念日","约定","活动","重要日","设定日"]，最多 3 个。
CURRENT_CALENDAR_ENTRY_JSON:\n${JSON.stringify(item, null, 2)}
${evidence.length ? `TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}` : ''}
严格输出：{"entry":{"title":"...","tags":["..."]}}。只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, `重新整理日历「${item.title}」…`, taskOptions(core_constants.MODE.CALENDAR, context, origin, `${taskKey}:calendar`, 2500, 0.35),
        data => {
            const entry = data?.entry || {};
            const title = core_text.normalizeText(entry.title, 48);
            if (!title) throw new Error('日历单项重新整理结果缺少标题。');
            const fallback = item.status === 'promised' ? '约定' : item.status === 'future' ? '设定日' : '';
            const tags = modes_calendar.normalizeCalendarTags(entry.tags, fallback);
            return { title, tags };
        },
    );
    return { ...item, ...raw };
}

async function regenerateCalendarNote(item, context, memoryBank, origin, taskKey) {
    const evidence = item.sourceType === 'archive' ? core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 8) : [];
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '两个人的日历 / 单张便签重新生成')}
只重新写这张私人日历便签的【短标题 + 便签正文】。保持 kind、sourceType、sourceLabel、sourceMemoryIds/sourceMemoryAnchor 全部不变；不得新增剧情事实、不得替 {{user}} 做决定。
${item.sourceType === 'setting' ? '这是一张设定来源便签，只能改写当前便签已经表达的稳定设定，不能扩展新的共同经历。' : '这是一张档案来源便签，只能根据下方真实档案证据改写。'}
CURRENT_NOTE_JSON:\n${JSON.stringify(item, null, 2)}
${evidence.length ? `TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}` : ''}
严格输出：{"note":{"title":"不超过12个汉字","text":"一两句便利贴式短句"}}。只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, `重新生成便签「${item.title || item.id}」…`, taskOptions(core_constants.MODE.CALENDAR, context, origin, `${taskKey}:calendar-note`, 2200, 0.4),
        data => {
            const note = data?.note || {};
            const title = core_text.normalizeText(note.title, 24) || item.title || (item.kind === 'special' ? '特别备注' : '便签');
            const text = core_text.normalizeText(note.text, 180);
            if (!text) throw new Error('便签重新生成结果缺少正文。');
            return { title, text };
        },
    );
    return { ...item, ...raw };
}

async function regenerateCalendarMood(item, context, memoryBank, origin, taskKey) {
    const evidence = core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 8);
    if (!evidence.length) throw new Error('这条页角随笔缺少可复核档案证据。');
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '两个人的日历 / 页角随笔重新生成')}
只重新写下面这条【角色第一人称的很短心情随笔】。保持 sourceMemoryIds/sourceMemoryAnchor 不变，不得新增共同事件，不得替 {{user}} 补行动或心理；一两句即可，不要长篇独白。
CURRENT_MOOD_NOTE_JSON:\n${JSON.stringify(item, null, 2)}
TRUSTED_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}
严格输出：{"mood":{"text":"一两句、简短、第一人称"}}。只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, '重新生成一条页角随笔…', taskOptions(core_constants.MODE.CALENDAR, context, origin, `${taskKey}:calendar-mood`, 2200, 0.45),
        data => {
            const text = core_text.normalizeText(data?.mood?.text, 220);
            if (!text || text.length < 8) throw new Error('页角随笔重新生成内容不足。');
            return { text };
        },
    );
    return { ...item, ...raw };
}

export function normalizeRegeneratedButterflyNode(item, rawNode, memoryBank, context = {}) {
    if (!item || !rawNode || typeof rawNode !== 'object') throw new Error('蝴蝶效应单节点重新生成结果无效。');
    const immutable = structuredClone(item);
    const isOmega = item?.trueEnding === true || core_text.safeId(item?.id, '').toUpperCase() === 'OMEGA';
    if (isOmega) {
        const normalized = modes_butterfly.normalizeButterflyOmega({
            ...structuredClone(rawNode),
            monologue: '',
        }, context);
        return {
            ...immutable,
            label: normalized.label,
            monologue: '',
            intervention: normalized.intervention,
            systemNote: normalized.systemNote,
        };
    }

    const existingWorldSpec = item?.worldSpec && typeof item.worldSpec === 'object' ? structuredClone(item.worldSpec) : null;
    const candidate = {
        ...structuredClone(rawNode),
        primaryAxis: existingWorldSpec ? (item?.primaryAxis || existingWorldSpec.primaryAxis) : rawNode?.primaryAxis,
        worldSpec: existingWorldSpec || rawNode?.worldSpec,
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 16, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    };
    const normalized = modes_butterfly.normalizeButterflyBranch(candidate, 1, memoryBank, context, {
        label: `单节点 ${core_text.normalizeText(item?.id, 60) || '平行分歧'}`,
    });
    return {
        ...immutable,
        label: normalized.label,
        primaryAxis: normalized.primaryAxis,
        worldSpec: normalized.worldSpec,
        monologue: normalized.monologue,
        intervention: normalized.intervention,
        systemNote: normalized.systemNote,
    };
}

async function regenerateButterflyNode(item, context, memoryBank, origin, taskKey) {
    const evidence = item.sourceMemoryIds?.length ? core_evidence.memoryPayload(memoryBank, item.sourceMemoryIds, 10) : [];
    const prompt = `${generation_prompts.promptSafetyBoundary(context, '蝴蝶效应 / 单个观测节点重新生成')}
只重新生成下面这个${item.trueEnding ? '观测点 Ω' : '平行分歧'}的模拟内容，保持节点身份不变。它是派生模拟，不得修改正式档案。
CURRENT_NODE_JSON:\n${JSON.stringify(item, null, 2)}
${evidence.length ? `TRUSTED_MAIN_EVIDENCE_JSON:\n${JSON.stringify(evidence, null, 2)}` : ''}
节点 id/code/locked/trueEnding、证据字段与已有 worldSpec 都由本地锁定，不接受模型改写。普通旧节点如果 CURRENT_NODE_JSON 缺少 worldSpec，则必须补全 primaryAxis 与 worldSpec 八个具体字段，并明确 thirdPartyRomance=false。
严格输出：{"node":{"label":"...","primaryAxis":"era","worldSpec":{"primaryAxis":"era","era":"...","identity":"...","occupation":"...","location":"...","keyDecision":"...","encounterWithUser":"...","bondWithUser":"...","finalFate":"...","thirdPartyRomance":false},"monologue":"...","intervention":"...","systemNote":"..."}}。${item.trueEnding ? 'Ω 的 monologue 必须为空，intervention 不少于160个中文汉字，并明确命运/奇迹/唯一解。' : '普通分歧 monologue 不少于100个中文汉字且是第一人称；intervention 要由现世 {{char}} 对照“那个我”自省；systemNote 必须是冷酷中文算法判定。'}禁止前任，禁止 {{char}} 与 {{user}} 以外的任何人恋爱、结婚或成家。只输出 JSON。`;
    const raw = await generation_client.requestValidatedSegment(
        prompt, `重新生成「${item.label}」…`, taskOptions(core_constants.MODE.BUTTERFLY, context, origin, `${taskKey}:butterfly`, 9000, 0.7),
        data => normalizeRegeneratedButterflyNode(item, data?.node, memoryBank, context),
    );
    return raw;
}

export async function regenerateManagedTarget(session, type, id, parentId, options) {
    const context = options.context;
    const memoryBank = options.memoryBank;
    const origin = options.origin;
    const taskKey = options.taskKey;
    const updated = structuredClone(session);
    if (type === 'album-entry') {
        const index = updated.entries?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这张相簿卡。');
        updated.entries[index] = await regenerateAlbumEntry(updated, updated.entries[index], context, memoryBank, origin, taskKey);
    } else if (type === 'adv-event') {
        const index = updated.events?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这个 ADV EVENT。');
        updated.events[index] = await regenerateAdvEvent(updated, updated.events[index], context, memoryBank, origin, taskKey);
    } else if (type === 'adv-text') {
        const item = updated.events?.find(item => item.id === id);
        if (!item) throw new Error('找不到这个 ADV EVENT。');
        item.adv = await regenerateAdvText(item, context, memoryBank, origin, taskKey);
    } else if (type === 'heart-voice') {
        const index = updated.voiceDramas?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这篇 Voice Drama。');
        updated.voiceDramas[index] = await regenerateHeartVoice(updated, updated.voiceDramas[index], context, memoryBank, origin, taskKey);
    } else if (type === 'heart-scenario') {
        const index = updated.scenarioDramas?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这篇 Scenario Drama。');
        updated.scenarioDramas[index] = await regenerateHeartScenario(updated, updated.scenarioDramas[index], context, memoryBank, origin, taskKey);
    } else if (type === 'heart-strip') {
        const index = updated.dailyStrips?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这个日常一格。');
        updated.dailyStrips[index] = await regenerateHeartStrip(updated, updated.dailyStrips[index], context, memoryBank, origin, taskKey);
    } else if (type === 'heart-firefly') {
        const index = updated.fireflyVoices?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这个萤火虫心声。');
        updated.fireflyVoices[index] = await regenerateHeartFirefly(updated, updated.fireflyVoices[index], context, memoryBank, origin, taskKey);
    } else if (type === 'phone-app') {
        const index = updated.apps?.findIndex(app => app.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这个 App。');
        updated.apps[index] = await regeneratePhoneApp(updated, updated.apps[index], context, memoryBank, origin, taskKey);
    } else if (type === 'phone-entry') {
        const app = updated.apps?.find(candidate => candidate.id === parentId);
        const index = app?.entries?.findIndex(entry => entry.id === id) ?? -1;
        if (!app || index < 0) throw new Error('找不到这条终端内容。');
        app.entries[index] = await regeneratePhoneEntry(updated, app, app.entries[index], context, memoryBank, origin, taskKey);
    } else if (type === 'ending-route') {
        const index = updated.endings?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这条结局路线。');
        updated.endings[index] = await regenerateEndingRoute(updated, updated.endings[index], context, memoryBank, origin, taskKey);
    } else if (type === 'ending-confession') {
        const index = updated.confessionReplays?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这条告白回看。');
        updated.confessionReplays[index] = await regenerateEndingConfession(updated.confessionReplays[index], context, memoryBank, origin, taskKey);
    } else if (type === 'achievement') {
        const index = updated.entries?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这项成就。');
        updated.entries[index] = await regenerateAchievement(updated.entries[index], context, memoryBank, origin, taskKey);
    } else if (type === 'calendar-entry') {
        const pageKey = core_text.normalizeText(parentId, 160);
        const index = updated.entries?.findIndex(item => item.id === id && modes_calendar.calendarEntryPageKey(item) === pageKey) ?? -1;
        if (index < 0) throw new Error('找不到这条日历项。');
        updated.entries[index] = await regenerateCalendarEntry(updated.entries[index], context, memoryBank, origin, taskKey);
    } else if (type === 'calendar-note') {
        const page = modes_calendar.calendarDayPage(updated, core_text.normalizeText(parentId, 160));
        const index = page?.stickyNotes?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这张日历便签。');
        page.stickyNotes[index] = await regenerateCalendarNote(page.stickyNotes[index], context, memoryBank, origin, taskKey);
    } else if (type === 'calendar-mood') {
        const page = modes_calendar.calendarDayPage(updated, core_text.normalizeText(parentId, 160));
        const index = page?.moodNotes?.findIndex(item => item.id === id) ?? -1;
        if (index < 0) throw new Error('找不到这条页角随笔。');
        page.moodNotes[index] = await regenerateCalendarMood(page.moodNotes[index], context, memoryBank, origin, taskKey);
    } else if (type === 'butterfly-node') {
        const index = updated.nodes?.findIndex(item => item.id === id) ?? -1;
        if (index <= 0) throw new Error('主时间线不能作为单项重新生成目标。');
        updated.nodes[index] = await regenerateButterflyNode(updated.nodes[index], context, memoryBank, origin, taskKey);
    } else {
        throw new Error('这一类内容目前不支持单项模型重新生成。');
    }
    updated.userManaged = true;
    return updated;
}
