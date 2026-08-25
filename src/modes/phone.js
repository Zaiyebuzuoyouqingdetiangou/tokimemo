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


const PHONE_MESSAGE_ROLES = new Set(['owner', 'contact']);
const PHONE_GENERIC_OWNER_LABELS = new Set(['我', '本人', '自己', '设备主人', '主人', '{{char}}', 'char', 'owner']);
const PHONE_GENERIC_CONTACT_LABELS = new Set(['对方', '联系人', '对面', '对方用户', 'contact', 'other']);

export function phoneConversationOwnerName(memoryBank) {
    return core_text.normalizeText(memoryBank?.characterName, 100) || '角色';
}

function normalizedSpeakerKey(value) {
    return core_text.normalizeText(value, 100).trim().toLocaleLowerCase();
}

function isGenericOwnerLabel(value) {
    return PHONE_GENERIC_OWNER_LABELS.has(normalizedSpeakerKey(value));
}

function isGenericContactLabel(value) {
    return PHONE_GENERIC_CONTACT_LABELS.has(normalizedSpeakerKey(value));
}

export function inferPhoneContactName(entry, memoryBank) {
    const ownerName = phoneConversationOwnerName(memoryBank);
    const explicit = core_text.normalizeText(entry?.contactName, 100).trim();
    if (explicit && explicit !== ownerName && !isGenericOwnerLabel(explicit) && !isGenericContactLabel(explicit)) return explicit;

    const userName = core_text.normalizeText(memoryBank?.userName, 100).trim();
    const title = core_text.normalizeText(entry?.title, 100).trim();
    const meta = core_text.normalizeText(entry?.meta, 200).trim();
    if (userName && userName !== ownerName && `${title} ${meta}`.includes(userName)) return userName;

    for (const message of Array.isArray(entry?.messages) ? entry.messages : []) {
        const speaker = core_text.normalizeText(message?.speaker, 100).trim();
        if (!speaker || speaker === ownerName || isGenericOwnerLabel(speaker) || isGenericContactLabel(speaker)) continue;
        return speaker;
    }

    const patterns = [
        /^(?:与|和|跟)\s*(.+?)(?:的)?(?:聊天|对话|消息|通讯|私信)?$/u,
        /^(.+?)(?:聊天|对话|消息|通讯|私信)$/u,
    ];
    for (const pattern of patterns) {
        const match = title.match(pattern);
        const candidate = core_text.normalizeText(match?.[1], 100).trim();
        if (candidate && candidate !== ownerName && !isGenericOwnerLabel(candidate) && !isGenericContactLabel(candidate)) return candidate;
    }
    if (title && title !== ownerName && !/^(?:聊天|对话|消息|通讯|私信|群聊)$/u.test(title)) return title;
    return '联系人';
}

export function normalizePhoneConversationMessages(entry, memoryBank, { strict = false } = {}) {
    const ownerName = phoneConversationOwnerName(memoryBank);
    const contactName = inferPhoneContactName(entry, memoryBank);
    const messages = [];
    for (let index = 0; index < (Array.isArray(entry?.messages) ? entry.messages.length : 0) && messages.length < 48; index += 1) {
        const message = entry.messages[index];
        const text = core_text.normalizeText(message?.text, 1200);
        if (!text) continue;
        const rawSpeaker = core_text.normalizeText(message?.speaker, 100).trim();
        let speakerRole = core_text.normalizeText(message?.speakerRole, 20).trim().toLowerCase();
        if (!PHONE_MESSAGE_ROLES.has(speakerRole)) {
            if (rawSpeaker === ownerName || isGenericOwnerLabel(rawSpeaker)) speakerRole = 'owner';
            else if (rawSpeaker && !isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else if (isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else speakerRole = '';
        }
        if (strict && !PHONE_MESSAGE_ROLES.has(speakerRole)) {
            throw new Error('私人终端聊天消息缺少可区分的 speakerRole（owner/contact）。');
        }
        const speaker = speakerRole === 'owner'
            ? ownerName
            : speakerRole === 'contact'
                ? (rawSpeaker && !isGenericOwnerLabel(rawSpeaker) && !isGenericContactLabel(rawSpeaker) ? rawSpeaker : contactName)
                : (rawSpeaker || contactName);
        messages.push({
            speakerRole,
            speaker: core_text.normalizeText(speaker, 100) || (speakerRole === 'owner' ? ownerName : contactName),
            time: core_text.normalizeText(message?.time, 40),
            text,
        });
    }
    return { ownerName, contactName, messages };
}

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

export function phonePlanPrompt(context, memoryBank, roomSession) {
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / 分段 1：设备与 App 目录')}
本请求只规划设备类型、四时段状态、App 与条目【目录】。不要写长正文、聊天 messages、联系人 fields 或照片长说明；这些会按 App 分开依次生成。
UNTRUSTED_PHONE_ARCHIVE_JSON:\n${generation_prompts.promptArchiveSlice(memoryBank, 24)}
CURRENT_ROOM_CONTEXT_JSON:\n${JSON.stringify(compactPhoneRoomContext(roomSession), null, 2)}

严格输出：
{"title":"他的私人终端","deviceName":"设备名称","deviceKind":"phone","lockText":"...","liveStates":{"morning":{"lockText":"...","statusLine":"...","badgeCounts":{}},"daytime":{},"evening":{},"night":{}},"apps":[{"id":"MOMENTS","label":"动态","kind":"moments","summary":"...","entries":[{"id":"M01","title":"条目标题","meta":"时间/对象/分类"}]}]}

数量要求：
- phone：保留 9 类 app，kind 分别 moments/chat/gallery/notes/store/browser/contacts/location/misc；条目数建议分别 3/3/4/5/4/3/3/2/2（总计约29），不再堆大量同质条目。
- terminal：至少8个 app、总条目约24以上，必须包含 chat/contacts/gallery/notes 等等价功能。
- watch / communicator：至少7个功能入口、总条目约18以上，优先保留通讯、相册、备忘、联系人、定位与人设专属功能。
- 禁止生成 kind=schedule / calendar 或名为“日历”的 App；两个人之间的约定、纪念日、日期圈记统一由独立「两个人的日历」承担。私人终端 notes 可以有普通个人待办，但不要复制关系日历。
- 每个 entries 现在只写 id/title/meta，标题必须彼此有生活区分，不要填 preview/detail/messages/fields/imageCaption。
- deviceKind 只能 phone/watch/terminal/communicator；四个 liveStates 都要有。
- 不复刻真实商业 App 商标；禁止前任/第三方恋爱。只输出 JSON。`;
}

export function normalizePhonePlan(data) {
    const deviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(deviceName) ? 'watch' : /(?:传讯|通讯器|communicator)/i.test(deviceName) ? 'communicator' : /(?:终端|terminal)/i.test(deviceName) ? 'terminal' : 'phone';
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind;
    const apps = (Array.isArray(data?.apps) ? data.apps : []).slice(0, 12).map((app, appIndex) => ({
        id: core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`),
        label: core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`,
        kind: core_text.normalizeText(app?.kind, 60).toLowerCase() || 'misc',
        summary: core_text.normalizeText(app?.summary, 1200),
        entries: (Array.isArray(app?.entries) ? app.entries : []).slice(0, 24).map((entry, index) => ({
            id: core_text.safeId(entry?.id, `E${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(entry?.title, 100) || `条目 ${index + 1}`,
            meta: core_text.normalizeText(entry?.meta, 200),
        })),
    })).filter(app => !core_constants.PHONE_EXCLUDED_APP_KINDS.has(app.kind) && app.entries.length >= 2);
    const compact = ['watch', 'communicator'].includes(deviceKind);
    const minApps = compact ? 7 : deviceKind === 'phone' ? 9 : 8;
    const minEntries = compact ? 18 : deviceKind === 'phone' ? 29 : 24;
    if (apps.length < minApps) throw new Error(`私人终端目录 App 不足：${apps.length}/${minApps}。`);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (total < minEntries) throw new Error(`私人终端目录条目不足：${total}/${minEntries}。`);
    if (!apps.some(app => app.kind === 'chat')) throw new Error('私人终端目录缺少 chat / 通讯分区。');
    if (deviceKind === 'phone') {
        const required = { moments: 3, chat: 3, gallery: 4, notes: 5, store: 4, browser: 3, contacts: 3, location: 2, misc: 2 };
        for (const [kind, minimum] of Object.entries(required)) {
            const app = apps.find(item => item.kind === kind);
            if (!app || app.entries.length < minimum) throw new Error(`私人终端目录 ${kind} 不足：${app?.entries?.length || 0}/${minimum}。`);
        }
    }
    const lockText = core_text.normalizeText(data?.lockText, 400);
    const appIds = new Set(apps.map(app => app.id));
    const liveStates = {};
    for (const key of core_constants.ROOM_DAYPART_KEYS) {
        const rawState = data?.liveStates?.[key] || {};
        const badgeCounts = Object.create(null);
        const rawBadges = rawState?.badgeCounts && typeof rawState.badgeCounts === 'object' ? rawState.badgeCounts : {};
        for (const [appId, count] of Object.entries(rawBadges).slice(0, 16)) {
            if (!appIds.has(appId)) continue;
            const number = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
            if (number > 0) badgeCounts[appId] = number;
        }
        liveStates[key] = {
            lockText: core_text.normalizeText(rawState?.lockText, 400) || lockText,
            statusLine: core_text.normalizeText(rawState?.statusLine, 500),
            badgeCounts,
        };
    }
    return {
        title: core_text.normalizeText(data?.title, 100) || '他的私人终端',
        deviceName,
        deviceKind,
        lockText,
        liveStates,
        apps,
    };
}

export function phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds = null) {
    const compact = ['watch', 'communicator'].includes(plan.deviceKind);
    const deepCount = app?.incremental === true ? 1 : compact ? 1 : plan.deviceKind === 'terminal' ? 1 : 2;
    const deepMessages = compact ? 8 : plan.deviceKind === 'terminal' ? 10 : 12;
    const archiveBlock = sourceMemoryIds
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 24);
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / App 详情')}
本请求只补完一个 App 的详情。设备与 App 目录都在下面的 UNTRUSTED JSON 中；当前关系与历史只能依据当前档案，不要输出其他 App。
UNTRUSTED_PHONE_APP_ARCHIVE_JSON:\n${archiveBlock}
UNTRUSTED_PHONE_DEVICE_JSON:\n${JSON.stringify({ deviceName: plan.deviceName, deviceKind: plan.deviceKind }, null, 2)}
UNTRUSTED_APP_PLAN_JSON:\n${JSON.stringify(app, null, 2)}

严格输出：
{"app":{"id":"与 UNTRUSTED_APP_PLAN_JSON.id 完全相同","label":"与计划相同","kind":"与计划相同","summary":"...","entries":[{"id":"计划中的原 id","title":"计划中的标题","meta":"...","preview":"列表预览","detail":"详情正文","contactName":"聊天对象实际显示名；非 chat 可空","messages":[{"speakerRole":"owner|contact","speaker":"实际姓名","time":"...","text":"..."}],"fields":[],"imageCaption":"","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":""}]}}

硬性要求：
- 必须补完 UNTRUSTED_APP_PLAN_JSON 中全部 ${app.entries.length} 个 entry id，不得删减或换 id；每项必须有 preview，且 detail/messages/fields/imageCaption 至少一种有实质内容。
- basis=记忆 时必须提供当前档案中有效 sourceMemoryIds + sourceMemoryAnchor${sourceMemoryIds ? '，并至少引用一个 incrementalMemoryIds' : ''}；basis=设定 只能写角色正常生活/兴趣/工作/普通社交，不能冒充与 {{user}} 已发生的共同历史。
- kind=chat 时至少 ${deepCount} 个联系人达到 ${deepMessages} 条 messages；普通亲友/同事可为非恋爱设定推导。每个有 messages 的聊天条目必须提供 contactName；每条消息必须用 speakerRole=owner 或 contact 明确区分设备主人和聊天对象，且同一段对话中 owner/contact 两边都必须实际出现。speaker 必须写实际显示名，禁止用“对方”“我”“本人”作为偷懒标签。群聊里 contact 消息可保留各自真实姓名，但 owner 仍表示设备主人。
- 设备主人是 ${core_text.normalizeText(context?.name2 || memoryBank?.characterName, 100) || '当前角色'}；当前用户是 ${core_text.normalizeText(context?.name1 || memoryBank?.userName, 100) || '当前用户'}。如果聊天对象就是当前用户，contactName/speaker 使用当前用户实际名字。
- kind=contacts 时至少1项 fields 达3个以上。gallery 用 imageCaption 写纯文字照片说明。
- 禁止前任/前女友；禁止 {{char}} 与 {{user}} 之外的恋爱/婚姻对象。不输出 URL、HTML 或脚本。只输出 JSON。`;
}

export function validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null) {
    const raw = data?.app && typeof data.app === 'object' ? data.app : data;
    const returnedId = core_text.safeId(raw?.id, '');
    if (returnedId && returnedId !== planApp.id) throw new Error(`App ${planApp.label} 返回错误 id：${returnedId}。`);
    const expectedIds = new Set(planApp.entries.map(item => item.id));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const seen = new Set();
    let deepChats = 0;
    let contactDetails = false;
    for (const entry of entries) {
        const id = core_text.safeId(entry?.id, '');
        if (!expectedIds.has(id) || seen.has(id)) continue;
        const preview = core_text.normalizeText(entry?.preview, 1200);
        const detail = core_text.normalizeText(entry?.detail, 5000);
        const conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat' });
        const messages = conversation.messages;
        const fields = Array.isArray(entry?.fields) ? entry.fields.filter(field => core_text.normalizeText(field?.label, 100) && core_text.normalizeText(field?.value, 1000)).slice(0, 16) : [];
        const imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)) continue;
        const basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
        if (basis === '记忆') {
            const reference = core_evidence.normalizeMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, [entry?.title, preview, detail, imageCaption, ...messages.map(m => m.text), ...fields.map(f => `${f.label}:${f.value}`)].join('\n'), memoryBank, 1);
            if (!reference.sourceMemoryIds.length) continue;
            if (sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) continue;
        }
        seen.add(id);
        const deepThreshold = ['watch', 'communicator'].includes(deviceKind) ? 8 : deviceKind === 'terminal' ? 10 : 12;
        if (planApp.kind === 'chat' && messages.length) {
            const roles = new Set(messages.map(message => message.speakerRole).filter(Boolean));
            if (!roles.has('owner') || !roles.has('contact')) {
                throw new Error(`App ${planApp.label} 的聊天「${core_text.normalizeText(entry?.title, 100) || id}」没有同时出现设备主人和聊天对象。`);
            }
            if (messages.length >= deepThreshold) deepChats += 1;
        }
        if (planApp.kind === 'contacts' && fields.length >= 3) contactDetails = true;
    }
    if (seen.size < expectedIds.size) throw new Error(`App ${planApp.label} 详情不完整：${seen.size}/${expectedIds.size} 个条目通过校验。`);
    if (planApp.kind === 'chat') {
        const minimum = planApp?.incremental === true ? 1 : ['watch', 'communicator'].includes(deviceKind) ? 1 : deviceKind === 'terminal' ? 1 : 2;
        if (deepChats < minimum) throw new Error(`App ${planApp.label} 深聊不足：${deepChats}/${minimum}。`);
    }
    if (planApp.kind === 'contacts' && deviceKind === 'phone' && !contactDetails) throw new Error(`App ${planApp.label} 缺少至少 1 个三字段联系人详情。`);
    return { ...raw, id: planApp.id, label: planApp.label, kind: planApp.kind };
}

export function normalizePhoneDraftApp(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null) {
    const raw = validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds);
    const plannedIds = new Set(planApp.entries.map(item => item.id));
    const entries = (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 24).map((entry, index) => {
        const id = core_text.safeId(entry?.id, '');
        if (!plannedIds.has(id)) return null;
        const basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
        const title = core_text.normalizeText(entry?.title, 100) || planApp.entries.find(item => item.id === id)?.title || `条目 ${index + 1}`;
        const preview = core_text.normalizeText(entry?.preview, 1200);
        const detail = core_text.normalizeText(entry?.detail, 5000);
        const conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat' });
        const messages = conversation.messages;
        const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
            label: core_text.normalizeText(field?.label, 100),
            value: core_text.normalizeText(field?.value, 1000),
        })).filter(field => field.label && field.value);
        const imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        const evidenceText = [title, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
        const reference = basis === '记忆'
            ? core_evidence.normalizeMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, evidenceText, memoryBank, 1)
            : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption) || (basis === '记忆' && (!reference.sourceMemoryIds.length || (sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds))))) return null;
        return {
            id,
            title,
            meta: core_text.normalizeText(entry?.meta, 200),
            preview,
            detail,
            contactName: planApp.kind === 'chat' ? conversation.contactName : '',
            messages,
            fields,
            imageCaption,
            basis,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
        };
    }).filter(Boolean);
    if (entries.length !== planApp.entries.length) throw new Error(`App ${planApp.label} 续写缓存不完整：${entries.length}/${planApp.entries.length}。`);
    return {
        id: planApp.id,
        label: planApp.label,
        kind: planApp.kind,
        summary: core_text.normalizeText(raw?.summary, 1200) || planApp.summary,
        entries,
    };
}

export async function generatePhoneWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const roomSession = core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: core_context.getChatId(context), memoryBank, clone: false });
    const resumeDraft = options.continueDraft === true ? core_cache.loadPhoneGenerationDraft(context, memoryBank) : null;
    const plan = resumeDraft?.plan || await generation_client.requestValidatedSegment(
        phonePlanPrompt(context, memoryBank, roomSession),
        '私人终端 1/2 · 正在生成设备与 App 目录…',
        { maxTokens: 8000, temperature: 0.35, context, origin, taskKey: `${taskKey}:plan`, mode: core_constants.MODE.PHONE, background: true },
        normalizePhonePlan,
    );
    const completedById = new Map((resumeDraft?.completedApps || []).map(app => [app.id, app]));
    if (!resumeDraft) await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, []);

    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        if (completedById.has(app.id)) continue;
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const raw = await generation_client.requestJson(
                    phoneAppPrompt(context, memoryBank, plan, app),
                    `私人终端 2/2 · ${index + 1}/${plan.apps.length} ${app.label}${attempt ? '（重试）' : ''}…`,
                    { maxTokens: app.kind === 'chat' ? 8000 : app.entries.length >= 8 ? 7000 : 5000, context, origin, taskKey: `${taskKey}:app:${app.id}`, mode: core_constants.MODE.PHONE, background: true },
                );
                const normalizedApp = core_requestCoordinator.validateGeneratedSegment(raw, data => normalizePhoneDraftApp(data, app, memoryBank, plan.deviceKind));
                completedById.set(app.id, normalizedApp);
                await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()]);
                lastError = null;
                break;
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
                lastError = error;
                if (!attempt && core_requestCoordinator.shouldRetrySegmentRequest(error)) {
                    await core_requestCoordinator.waitBeforeSegmentRetry(error);
                    continue;
                }
                break;
            }
        }
        if (lastError) {
            const detail = core_text.normalizeText(lastError?.message || String(lastError || ''), 600);
            await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()], app.id, detail);
            const error = new Error(`私人终端在 App“${app.label}”中断，已保存 ${completedById.size}/${plan.apps.length} 个 App。回到房间后点击“继续生成${plan.deviceName}”即可从这里续写，不会重做已完成 App。${detail ? `\n${detail}` : ''}`);
            error.code = 'RMT_PHONE_DRAFT_AVAILABLE';
            error.retryable = false;
            throw error;
        }
    }
    const details = plan.apps.map(app => completedById.get(app.id)).filter(Boolean);
    if (details.length !== plan.apps.length) {
        throw new Error(`私人终端续写结果不完整：${details.length}/${plan.apps.length} 个 App。`);
    }
    return normalizePhone({ ...plan, apps: details }, memoryBank);
}

export function compactPhoneExisting(session) {
    return (Array.isArray(session?.apps) ? session.apps : []).filter(app => !core_constants.PHONE_EXCLUDED_APP_KINDS.has(core_text.normalizeText(app?.kind, 60).toLowerCase())).slice(0, 12).map(app => ({
        id: core_text.normalizeText(app?.id, 80),
        label: core_text.normalizeText(app?.label, 80),
        kind: core_text.normalizeText(app?.kind, 60),
        entries: core_evidence.evenlySample(Array.isArray(app?.entries) ? app.entries : [], 60).map(entry => ({
            id: core_text.normalizeText(entry?.id, 80),
            title: core_text.normalizeText(entry?.title, 120),
            meta: core_text.normalizeText(entry?.meta, 200),
            sourceMemoryIds: core_text.cleanArray(entry?.sourceMemoryIds, 8, 40),
            sourceMemoryAnchor: core_text.normalizeText(entry?.sourceMemoryAnchor, 120),
        })),
    }));
}

export function phoneIncrementPlanPrompt(context, memoryBank, previous, sourceMemoryIds) {
    return `${generation_prompts.promptSafetyBoundary(context, '私人终端 / 增量目录')}
旧设备、App、条目、聊天消息和照片说明由本地原样保留。本请求只根据新增档案规划少量新条目，不得重写、总结或换标题复述旧条目。
UNTRUSTED_INCREMENTAL_PHONE_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_PHONE_INDEX_JSON:
${JSON.stringify(compactPhoneExisting(previous), null, 2)}

严格输出：
{"apps":[{"id":"必须是 EXISTING_PHONE_INDEX_JSON 中的 App id","label":"原 label","kind":"原 kind","summary":"本轮新增内容侧面","entries":[{"id":"新的唯一 id","title":"新条目标题","meta":"时间/对象/分类"}]}]}

要求：
- 总共规划 0～8 个真正由 incrementalMemoryIds 带来的新条目；每个相关 App 1～3 条即可。没有任何合适的新条目时必须返回 {"apps":[]}，该空增量会被本地正常记录，不要为了凑数复述旧内容。
- app id/kind 必须对应现有 App；不得向 schedule / calendar / 日历追加内容；不改变 deviceKind、设备名、锁屏或既有 liveStates。
- 新条目的标题、对象、时间与主题必须避开 EXISTING_PHONE_INDEX_JSON；禁止把旧聊天、旧相册、旧笔记换措辞再说一次。
- 与 {{user}} 的已发生共同历史必须在详情阶段使用 basis=记忆并引用 incrementalMemoryIds；普通工作/兴趣当前状态可为设定。
- 禁止前任/第三方恋爱；只输出 JSON。`;
}

export function normalizePhoneIncrementPlan(data, previous) {
    if (!Array.isArray(data?.apps)) throw new Error('私人终端增量目录缺少 apps 数组。');
    const eligibleApps = (previous.apps || []).filter(app => !core_constants.PHONE_EXCLUDED_APP_KINDS.has(core_text.normalizeText(app?.kind, 60).toLowerCase()));
    const existingById = new Map(eligibleApps.map(app => [app.id, app]));
    const existingByKind = new Map(eligibleApps.map(app => [app.kind, app]));
    const rawApps = data.apps.slice(0, 12);
    const apps = rawApps.map(raw => {
        const id = core_text.safeId(raw?.id, '');
        const kind = core_text.normalizeText(raw?.kind, 60).toLowerCase();
        const existing = existingById.get(id) || existingByKind.get(kind);
        if (!existing) return null;
        const reservedIds = new Set((existing.entries || []).map(entry => entry.id));
        const planned = [];
        for (const item of (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 8)) {
            const entryId = core_incremental.uniqueGeneratedId(item?.id, reservedIds, `${existing.id}_N`);
            planned.push({
                id: entryId,
                title: core_text.normalizeText(item?.title, 100) || '新增条目',
                meta: core_text.normalizeText(item?.meta, 200),
            });
        }
        if (!planned.length) return null;
        return {
            id: existing.id,
            label: existing.label,
            kind: existing.kind,
            incremental: true,
            summary: core_text.normalizeText(raw?.summary, 1200) || existing.summary,
            entries: planned,
        };
    }).filter(Boolean);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (rawApps.length && !total) throw new Error('私人终端增量目录返回了 App，但没有可验证的新条目。');
    return {
        title: previous.title,
        deviceName: previous.deviceName,
        deviceKind: previous.deviceKind,
        lockText: previous.lockText,
        liveStates: previous.liveStates,
        apps,
    };
}

export function phoneEntryKey(appKind, entry) {
    const ids = core_text.cleanArray(entry?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(entry?.sourceMemoryAnchor, 140);
    return ids && anchor
        ? `${appKind}|memory|${ids}|${anchor}`
        : `${appKind}|${core_incremental.normalizedContentKey(entry?.title, 120)}|${core_incremental.normalizedContentKey(entry?.meta, 200)}`;
}

export function mergePhoneIncremental(previous, patches, memoryBank) {
    const merged = structuredClone(previous);
    let added = 0;
    for (const patchApp of patches || []) {
        const target = merged.apps.find(app => app.id === patchApp.id) || merged.apps.find(app => app.kind === patchApp.kind);
        if (!target) continue;
        const seen = new Set((target.entries || []).map(entry => phoneEntryKey(target.kind, entry)));
        const usedIds = new Set((target.entries || []).map(entry => entry.id));
        for (const entry of patchApp.entries || []) {
            const key = phoneEntryKey(target.kind, entry);
            if (!key || seen.has(key) || target.entries.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
            seen.add(key);
            target.entries.push({ ...structuredClone(entry), id: core_incremental.uniqueGeneratedId(entry.id, usedIds, `${target.id}_N`) });
            added += 1;
        }
    }
    const normalized = normalizePhone(merged, memoryBank);
    normalized.selectedAppId = previous.selectedAppId || normalized.selectedAppId;
    normalized.selectedEntryId = previous.selectedEntryId || '';
    normalized.view = previous.view || 'list';
    return { session: normalized, added };
}

export async function generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previous) {
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const plan = await generation_client.requestValidatedSegment(
        phoneIncrementPlanPrompt(context, memoryBank, previous, sourceMemoryIds),
        '私人终端 · 正在规划新增条目…',
        { maxTokens: 4500, temperature: 0.35, context, origin, taskKey: `${taskKey}:increment-plan`, mode: core_constants.MODE.PHONE, background: true },
        raw => normalizePhoneIncrementPlan(raw, previous),
    );
    if (!plan.apps.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const patches = [];
    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        const raw = await generation_client.requestJson(
            phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds),
            `私人终端 · 新增详情 ${index + 1}/${plan.apps.length} ${app.label}…`,
            { maxTokens: app.kind === 'chat' ? 8000 : 5000, context, origin, taskKey: `${taskKey}:increment-app:${app.id}`, mode: core_constants.MODE.PHONE, background: true },
        );
        patches.push(core_requestCoordinator.validateGeneratedSegment(raw, data => normalizePhoneDraftApp(data, app, memoryBank, plan.deviceKind, sourceMemoryIds)));
    }
    const { session, added } = mergePhoneIncremental(previous, patches, memoryBank);
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function normalizePhone(data, memoryBank) {
    const requestedDeviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(requestedDeviceName)
        ? 'watch'
        : /(?:传讯|通讯器|communicator)/i.test(requestedDeviceName)
            ? 'communicator'
            : /(?:终端|terminal)/i.test(requestedDeviceName)
                ? 'terminal'
                : 'phone';
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind;
    const rawApps = Array.isArray(data?.apps) ? data.apps : [];
    const apps = rawApps.slice(0, 12).map((app, appIndex) => {
        const appId = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        const entries = (Array.isArray(app?.entries) ? app.entries : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((entry, index) => {
            const basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
            const title = core_text.normalizeText(entry?.title, 100) || `条目 ${index + 1}`;
            const preview = core_text.normalizeText(entry?.preview, 1200);
            const detail = core_text.normalizeText(entry?.detail, 5000);
            const conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: false });
            const messages = conversation.messages;
            const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
                label: core_text.normalizeText(field?.label, 100),
                value: core_text.normalizeText(field?.value, 1000),
            })).filter(field => field.label && field.value);
            const imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
            const evidenceText = [title, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
            const reference = basis === '记忆' ? core_evidence.normalizeMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, evidenceText, memoryBank, 1) : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
            if (!preview || (!detail && !messages.length && !fields.length && !imageCaption) || (basis === '记忆' && !reference.sourceMemoryIds.length)) return null;
            return {
                id: core_text.safeId(entry?.id, `${appId}_E${String(index + 1).padStart(2, '0')}`),
                title,
                meta: core_text.normalizeText(entry?.meta, 200),
                preview,
                detail,
                contactName: app?.kind === 'chat' ? conversation.contactName : '',
                messages,
                fields,
                imageCaption,
                basis,
                sourceMemoryIds: reference.sourceMemoryIds,
                sourceMemoryAnchor: reference.sourceMemoryAnchor,
            };
        }).filter(Boolean);
        return {
            id: appId,
            label: core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`,
            kind: core_text.normalizeText(app?.kind, 60).toLowerCase() || 'misc',
            summary: core_text.normalizeText(app?.summary, 1200),
            entries,
        };
    }).filter(app => !core_constants.PHONE_EXCLUDED_APP_KINDS.has(app.kind) && app.entries.length >= 2);

    const compactDevice = ['watch', 'communicator'].includes(deviceKind);
    const minApps = compactDevice ? 7 : (deviceKind === 'phone' ? 9 : 8);
    if (apps.length < minApps) throw new Error(`“他的私人终端”分区不足：得到 ${apps.length} 个，当前设备至少需要 ${minApps} 个。`);
    const totalEntries = apps.reduce((sum, app) => sum + app.entries.length, 0);
    const minEntries = compactDevice ? 18 : (deviceKind === 'phone' ? 29 : 24);
    if (totalEntries < minEntries) throw new Error(`“他的私人终端”内容过少：只有 ${totalEntries} 个可读条目，至少需要 ${minEntries} 个。`);
    if (deviceKind === 'phone') {
        const required = { moments: 3, chat: 3, gallery: 4, notes: 5, store: 4, browser: 3, contacts: 3, location: 2, misc: 2 };
        const countByKind = Object.create(null);
        for (const app of apps) countByKind[app.kind] = Math.max(Number(countByKind[app.kind]) || 0, app.entries.length);
        const missing = Object.entries(required).filter(([kind, minimum]) => (Number(countByKind[kind]) || 0) < minimum);
        if (missing.length) {
            const detail = missing.map(([kind, minimum]) => `${kind} ${Number(countByKind[kind]) || 0}/${minimum}`).join('、');
            throw new Error(`“他的私人终端”核心 App 内容不足：${detail}。`);
        }
        const contactDetails = apps.filter(app => app.kind === 'contacts').flatMap(app => app.entries).some(entry => entry.fields.length >= 3);
        if (!contactDetails) throw new Error('“他的私人终端”联系人详情不足：至少 1 个联系人需要 3 项以上备注 / 最近通话 / 位置或提醒字段。');
    }
    const deepChatMessageMinimum = compactDevice ? 8 : (deviceKind === 'terminal' ? 10 : 12);
    const deepChats = apps.filter(app => app.kind === 'chat').flatMap(app => app.entries).filter(entry => entry.messages.length >= deepChatMessageMinimum).length;
    const minDeepChats = compactDevice ? 1 : (deviceKind === 'terminal' ? 1 : 2);
    if (deepChats < minDeepChats) {
        throw new Error(`“他的私人终端”深度对话不足：只有 ${deepChats} 个达到 ${deepChatMessageMinimum} 条消息以上的对话窗，当前设备至少需要 ${minDeepChats} 个。`);
    }

    const appIds = new Set(apps.map(app => app.id));
    const liveStates = {};
    for (const key of core_constants.ROOM_DAYPART_KEYS) {
        const rawState = data?.liveStates?.[key] || {};
        const badges = Object.create(null);
        const rawBadges = rawState?.badgeCounts && typeof rawState.badgeCounts === 'object' ? rawState.badgeCounts : {};
        for (const [appId, count] of Object.entries(rawBadges)) {
            if (!appIds.has(appId)) continue;
            const number = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
            if (number > 0) badges[appId] = number;
        }
        liveStates[key] = {
            lockText: core_text.normalizeText(rawState?.lockText, 400) || core_text.normalizeText(data?.lockText, 400) || 'PRIVATE',
            statusLine: core_text.normalizeText(rawState?.statusLine, 500),
            badgeCounts: badges,
        };
    }
    return {
        kind: core_constants.MODE.PHONE,
        title: core_text.normalizeText(data?.title, 100) || '他的私人终端',
        ownerName: phoneConversationOwnerName(memoryBank),
        deviceName: requestedDeviceName,
        deviceKind,
        lockText: core_text.normalizeText(data?.lockText, 400),
        liveStates,
        apps,
        selectedAppId: apps[0].id,
        selectedEntryId: '',
        view: 'list',
    };
}
