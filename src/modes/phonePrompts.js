import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_participants from '../core/participants.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_prompts from '../generation/prompts.js';
import { PHONE_COMMUNICATION_REPAIR_CONTRACT, PHONE_LIFESTYLE_REPAIR_CONTRACT, isExcludedPhoneApp, isPhoneOwnerName, isPhoneUserName, isUnavailablePhoneEntry, normalizePhoneAppIcon, normalizePhoneAppKind, phoneStory } from './phoneBasics.js';
import { inferPhoneContactName, phoneControlledOwnerNames, phoneReferencedMemoryText } from './phoneEvidence.js';
// 私人终端提示词：设备规划、App 正文、补缺线程、增量规划
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export function compactPhoneRoomContext(roomSession) {
    if (!roomSession) return null;
    return {
        homeName: core_text.normalizeText(roomSession.homeName, 100),
        homeSummary: core_text.normalizeText(roomSession.homeSummary, 500),
        spaces: (Array.isArray(roomSession.spaces) ? roomSession.spaces : []).slice(0, 10).map(space => ({
            label: core_text.normalizeText(space?.label, 80), spaceType: core_text.normalizeText(space?.spaceType, 100),
        })),
    };
}

export function phonePlanPrompt(context, memoryBank, roomSession, worldPresentation = null) {
    const people = core_participants.archivePeopleNames(memoryBank);
    const story = phoneStory(memoryBank, context);
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / 分段 1：设备与 App 目录', people, memoryBank)}
本请求只规划设备类型、四时段状态、App 与条目【目录】。不要写长正文、聊天 messages、联系人 fields 或照片长说明；这些会按 App 分开依次生成。
先读取受控上下文中的世界书与角色卡：世界书若明确写了设备形态或角色审美，必须优先遵守；没有明确设定时，再按档案人物的时代、身份、职业、性格、兴趣、经济条件与生活习惯推导。角色卡名称只是设备/场景标题，不是人物。USER_PERSONA_JSON 描述的是用户，只能帮助识别与 {{user}} 有关的称呼或既有关系，不能拿来替代档案人物的设备人设。不同人物不应得到同一套固定 App 或固定配色。
UNTRUSTED_PHONE_ARCHIVE_JSON:\n${generation_prompts.promptArchiveSlice(memoryBank, 24)}
  CURRENT_ROOM_CONTEXT_JSON:\n${JSON.stringify(compactPhoneRoomContext(roomSession), null, 2)}
  CONTROLLED_WORLD_PRESENTATION_JSON:\n${JSON.stringify(worldPresentation || core_worldPresentation.resolveWorldPresentation('', memoryBank), null, 2)}

严格输出：
{"title":"他的私人终端","deviceName":"设备名称","deviceKind":"phone","lockText":"...","uiProfile":{"explicitFields":[],"palette":"PALETTE_TOKEN","wallpaper":"WALLPAPER_TOKEN","typography":"TYPOGRAPHY_TOKEN","iconStyle":"ICON_STYLE_TOKEN","density":"DENSITY_TOKEN","shellTone":"SHELL_TONE_TOKEN"},"liveStates":{"morning":{"lockText":"...","statusLine":"...","badgeCounts":{}},"daytime":{},"evening":{},"night":{}},"apps":[{"id":"CHAT","label":"通讯","kind":"chat","icon":"message","summary":"...","entries":[{"id":"C01","title":"条目标题","meta":"时间/对象/分类"}]}]}

数量要求：
- phone / terminal 规划1～10个入口，其余1～8个；每个1～4条目录即可。职业、兴趣、购物、草稿、工作学习、阅读、创作等可以依据档案人物人设与世界观合理生成，不要求角色卡/世界书逐字写过这条日常。
- chat 可以安排与受控人设/世界书或档案已知普通 NPC 的当下社交；和当前用户的线程只规划主人未发送草稿，不要规划双向已发送记录。实际历史原话才需 Mxxx。没有已知聊天对象时不建 chat，改为适合人物的其他 App。contacts 私密字段仍只用有据记录，不编造 User 已发消息、电话、地址、亲属。不要为了凑数规划明知只能留空的项目。不适合现代 App 的世界观使用符合时代的命名。
- kind 只能选 moments/chat/gallery/camera/notes/store/browser/contacts/music/work/study/health/fitness/training/reading/books/files/research/games/finance/security/creative/weather/tools/misc；icon 只能选 message/people/photo/camera/note/bag/globe/contact/music/briefcase/book/heart/activity/game/wallet/shield/palette/cloud/tool/spark/grid。
- uiProfile 只能使用：palette=noir-gold/ink-blue/frost/moss/ember/lilac/sky/sand；wallpaper=smoke/rain/grid/starfield/library/aurora/minimal/paper；typography=modern/serif/mono；iconStyle=rounded/square/glyph/glass；density=compact/cozy/roomy；shellTone=graphite/silver/ivory/bronze/navy。上面的 *_TOKEN 只是占位符，必须换成某个允许值，不得原样照抄。这些是本地安全样式 token，不得输出颜色值、CSS、URL 或 class 名。
- uiProfile.explicitFields 只允许 palette/wallpaper/typography/iconStyle/density/shellTone；只有世界书或角色卡对该项有明文时才列入。其余字段保持不在列表中，本地会依据 {{char}} 的人设、设备名和 App 组合稳定补全，防止不同角色照抄同一套合法模板。
- 禁止生成 kind=schedule/calendar/location/travel/map/navigation/transit/route，或名为“日历/地图/导航/路线/行程/出行/旅行”的 App；日期手账和地图分别由独立「两个人的日历」与「他的出行路线」承担。私人终端 notes/work/study/reading 是 ${story.ownerNames[0] || '档案人物'} 自己的记录，不要写成角色卡名称的备忘，也不要替 ${story.userDisplay} 填写。${story.compatNote}
- 顶层 ownerMembers 列出受控角色卡/世界书的成员显示名及逐字身份原文：[{"name":"成员真名","sourceEvidence":"受控资料原句"}]；不得列用户或未知人物。设备所属卡名与成员真名分开，组卡 owner 必须用名单中的一位真名。
- chat entries 只写 id/title/meta/contactName/conversationMode；当前用户对象只规划 conversationMode=draft 的主人未发送草稿，已知普通 NPC 可规划 daily 日常。其他 entries 只写 id/title/meta。标题必须有生活区分，不要填 preview/detail/messages/fields/imageCaption。
- deviceKind 只能 neutral/phone/watch/terminal/communicator/folio/relic，并且只能从 CONTROLLED_WORLD_PRESENTATION_JSON.allowedDevices 选择；证据不足时必须为 neutral。不要因为功能名叫“私人终端”就强塞现代手机。四个 liveStates 都要有。
- 不复刻真实商业 App 商标；禁止前任/第三方恋爱。只输出 JSON。`;
}

export function phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds = null) {
    const people = core_participants.archivePeopleNames(memoryBank);
    const archiveBlock = sourceMemoryIds
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 24);
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / App 详情', people, memoryBank)}
本请求只生成一个 App 的详情。设备与 App 目录都在下面的 UNTRUSTED JSON 中；当前关系与历史只能依据当前档案，不要输出其他 App。
UNTRUSTED_PHONE_APP_ARCHIVE_JSON:\n${archiveBlock}
UNTRUSTED_PHONE_DEVICE_JSON:\n${JSON.stringify({ deviceName: plan.deviceName, deviceKind: plan.deviceKind }, null, 2)}
UNTRUSTED_APP_PLAN_JSON:\n${JSON.stringify(app, null, 2)}
受控档案人物显示名（有多人名单时不得用卡名代替）：${JSON.stringify(phoneControlledOwnerNames(memoryBank, { ownerMembers: app.ownerMembers, controlledEvidence: app.ownerMembers?.map(row => row.sourceEvidence).join('\n') }))}

严格输出：
{"app":{"id":"与 UNTRUSTED_APP_PLAN_JSON.id 完全相同","label":"与计划相同","kind":"与计划相同","summary":"...","entries":[{"id":"计划中的原 id","title":"计划中的标题","meta":"...","preview":"列表预览","detail":"详情正文","contactName":"聊天对象实际显示名；非 chat 可空","messages":[{"speakerRole":"owner|contact","speaker":"实际姓名","time":"...","text":"..."}],"fields":[],"imageCaption":"","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":"","sourceMemoryEvidence":"basis=记忆时从该 Mxxx 原样复制的直接证据","sourceSettingEvidence":"basis=设定时从受控角色卡/世界书原样复制的直接证据"}]}}

硬性要求：
- UNTRUSTED_APP_PLAN_JSON 中的 ${app.entries.length} 个 entry id 是本次候选目录，可只返回有合适完整内容的条目；不必凑数。返回条目必须使用计划中的原 id，不能改 id 或添加计划外 id；每项必须有 preview，且 detail/messages/fields/imageCaption 至少一种有实质内容。
- 只有确实索取私人字段或既往原话而无证据时，才保留该 id 并返回 {"id":"原id","unavailable":true}；不得把普通笔记、工作、阅读、兴趣等日常因为缺少逐字记忆而置空。没有记忆原句时请读人设和所选世界书，写正在使用的 App 内容，不能写“设定补摘”“缺少设定”或资料报告。
- basis=推演：依据人设和世界观写日常提醒、感受、未来计划、未发送草稿。正文不需要逐字人设引文。sourceMemoryIds/sourceMemoryAnchor/sourceSettingEvidence 留空。${core_narrativeAuthority.NARRATIVE_AUTHORITY_PROMPT}
- 这是一台正在使用中的设备，绝大多数条目应当是 basis=设定 或 basis=推演 的日常内容：工作、兴趣、购物、提醒、草稿、未发送的话、阅读、创作等。basis=设定 可以按明确人设/世界观展开合理日常，不要求把生成正文压成设定原文摘录；有直接原文时填写 sourceSettingEvidence。若没有逐字来源也不要伪造，本地会安全降级为 basis=推演，不会因此删除内容。只有确实复述与 {{user}} 已发生的共同经历时才用 basis=记忆。
- basis=记忆 时必须提供当前档案中有效 sourceMemoryIds + sourceMemoryAnchor${sourceMemoryIds ? '，并至少引用一个 incrementalMemoryIds' : ''}，并把直接支持条目的 Mxxx 原句逐字放入 sourceMemoryEvidence；chat 的联系人和每条消息、contacts 的每个字段值都必须在该原句或所引 Mxxx 中逐字出现，不能用真实 id/anchor 替无关新事实洗白。sourceSettingEvidence 留空。basis=设定/推演 不得冒充已经发生的共同历史，也不得替 {{user}} 生成其从未说过的消息。
- kind=chat：与当前用户只写 conversationMode=draft、basis=推演、主人一侧至少一条未发送草稿，不要求双向，绝不生成用户发言。已知普通 NPC 的当下日常可写 conversationMode=daily、至少2条双向消息，标为日常演绎。已发生双向原话仅 basis=记忆、conversationMode=history，每句和说话人归属都须在所引 Mxxx 逐字核对；摘要不支持的原话降为主人未发送草稿，不冒充历史。speakerRole 用 owner/contact；组卡 owner 使用 UNTRUSTED_APP_PLAN_JSON.ownerMembers 中的成员真名，不能把卡名作为所有成员姓名。contacts 私密字段仍只接受有据历史。
- 设备所属角色卡名是 ${phoneStory(memoryBank, context).cardName}；当前用户是 ${phoneStory(memoryBank, context).userDisplay}。${phoneStory(memoryBank, context).compatNote}如果聊天对象就是当前用户，contactName 用档案里的显示名，只输出主人草稿，不替用户写消息。
- kind=contacts 可收录受控人设/世界书明确存在的普通联系人，basis=设定，sourceSettingEvidence 逐字引述该联系人的设定。至少1个字段，职业/身份/关系必须由该联系人同一句设定明确支持；备注可以是当下计划。不编电话号码、地址、账号等私密字段；这些仍只接受 basis=记忆 的原文证据。gallery 用 imageCaption 写纯文字照片说明。
- kind=notes/work/study/reading/books/files/research/creative/finance/tools：这是 ${phoneStory(memoryBank, context).ownerNames.join('、') || '档案人物'} 自己在用的记录，不是角色卡名称的备忘。当前用户是 ${phoneStory(memoryBank, context).userDisplay}。${phoneStory(memoryBank, context).compatNote}写主人自己的待办、摘录、工作学习或账目；提及用户时用档案显示名，不要替用户写已发送留言。
- 禁止前任/前女友；禁止 {{char}} 与 {{user}} 之外的恋爱/婚姻对象。不输出 URL、HTML 或脚本。只输出 JSON。
${app.kind === 'chat' ? PHONE_COMMUNICATION_REPAIR_CONTRACT : PHONE_LIFESTYLE_REPAIR_CONTRACT}`;
}

export function phoneMissingThreadPlan(app, previous, memoryBank, options = {}) {
    const story = phoneStory(memoryBank, options.context);
    const missing = (app.entries || []).filter(isUnavailablePhoneEntry);
    const known = [options.controlledEvidence, phoneReferencedMemoryText({ sourceMemoryIds: (memoryBank?.memories || []).map(row => row.id) }, memoryBank)].filter(Boolean).join('\n');
    const allowed = name => name && !isPhoneOwnerName(name, memoryBank, options.context)
        && !core_participants.nameMatches(name, [story.cardName])
        && (isPhoneUserName(name, memoryBank, options.context) || core_worldPresentation.controlledEvidenceContains(known, name));
    const explicitTargets = missing.map(entry => entry.contactName || inferPhoneContactName(entry, memoryBank));
    const reserved = new Set(explicitTargets.filter(allowed));
    const targets = [...new Set([
        // resolveStoryIdentities intentionally falls back to {{user}} for prompts.
        // A repair must only create a concrete thread for an actually known user.
        memoryBank?.userName ? story.userDisplay : '',
        ...(previous.apps || []).flatMap(item => item.entries || []).map(entry => entry.contactName)]
        .filter(name => allowed(name) && !reserved.has(name)))];
    let nextTarget = 0;
    const entries = missing.flatMap((item, index) => {
        // Preserve an already identified thread, including multiple distinct drafts
        // for the same person. Only genuinely empty slots receive a fallback target.
        const contactName = allowed(explicitTargets[index]) ? explicitTargets[index] : targets[nextTarget++];
        if (!contactName) return [];
        const draft = isPhoneUserName(contactName, memoryBank, options.context);
        const display = draft ? story.userDisplay : contactName;
        return [{ id: item.id, contactName: display, conversationMode: draft ? 'draft' : 'daily',
            title: draft ? `给${display}的未发送草稿` : `与${display}的日常通讯`,
            meta: draft ? '只写主人一侧，不生成用户发言' : '已知普通联系人日常演绎，非历史记录' }];
    });
    return { ...app, incremental: true, entries, omittedEntryIds: missing.filter(item => !entries.some(entry => entry.id === item.id)).map(item => item.id) };
}

export function compactPhoneExisting(session) {
    return (Array.isArray(session?.apps) ? session.apps : []).filter(app => !isExcludedPhoneApp(app)).slice(0, 10).map(app => ({
        id: core_text.normalizeText(app?.id, 80),
        label: core_text.normalizeText(app?.label, 80),
        kind: normalizePhoneAppKind(app?.kind, app?.label),
        icon: normalizePhoneAppIcon(app?.icon, app?.kind, app?.label),
        entries: core_evidence.evenlySample((Array.isArray(app?.entries) ? app.entries : []).filter(entry => entry.sourceStatus !== 'unavailable'), 60).map((entry, index) => ({
            id: core_text.normalizeText(entry?.id, 80),
            title: entry?.legacyEvidenceUnverified === true ? `旧版记录 ${index + 1}` : core_text.normalizeText(entry?.title, 120),
            meta: entry?.legacyEvidenceUnverified === true ? '' : core_text.normalizeText(entry?.meta, 200),
            sourceMemoryIds: entry?.legacyEvidenceUnverified === true ? [] : core_text.cleanArray(entry?.sourceMemoryIds, 8, 40),
            sourceMemoryAnchor: entry?.legacyEvidenceUnverified === true ? '' : core_text.normalizeText(entry?.sourceMemoryAnchor, 120),
        })),
    }));
}

export function phoneIncrementPlanPrompt(context, memoryBank, previous, sourceMemoryIds) {
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / 增量目录', core_participants.archivePeopleNames(memoryBank), memoryBank)}
旧设备、App、条目、聊天消息和照片说明由本地原样保留。本请求只根据新增档案规划少量新条目，不得重写、总结或换标题复述旧条目。
UNTRUSTED_INCREMENTAL_PHONE_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_PHONE_INDEX_JSON:
${JSON.stringify(compactPhoneExisting(previous), null, 2)}

严格输出：
{"apps":[{"id":"必须是 EXISTING_PHONE_INDEX_JSON 中的 App id","label":"原 label","kind":"原 kind","summary":"本轮新增内容侧面","entries":[{"id":"新的唯一 id","title":"新条目标题","meta":"时间/对象/分类"}]}]}

要求：
- 总共规划 0～8 个真正由 incrementalMemoryIds 带来的新条目；每个相关 App 1～3 条即可。没有任何合适的新条目时必须返回 {"apps":[]}，该空增量会被本地正常记录，不要为了凑数复述旧内容。
- app id/kind 必须对应现有 App；不得向 schedule/calendar/location/travel/map/navigation/transit/route 或日历/地图/导航/路线/行程/出行/旅行追加内容；不改变 deviceKind、设备名、锁屏或既有 liveStates。
- 新条目的标题、对象、时间与主题必须避开 EXISTING_PHONE_INDEX_JSON；禁止把旧聊天、旧相册、旧笔记换措辞再说一次。
- 与 ${phoneStory(memoryBank, context).userDisplay} 的已发生共同历史必须在详情阶段使用 basis=记忆并引用 incrementalMemoryIds；工作、备忘、学习、阅读等当前状态条目用 basis=设定，作者是档案人物真名，不是卡名。${phoneStory(memoryBank, context).compatNote}
- 禁止前任/第三方恋爱；只输出 JSON。`;
}
