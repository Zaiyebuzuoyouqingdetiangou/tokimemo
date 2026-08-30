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
const PHONE_RESERVED_APP_IDS = new Set(['__PHONE_HOME__']);
const PHONE_VIEW_VALUES = new Set(['home', 'list', 'detail']);
const PHONE_UI_TOKENS = Object.freeze({
    palette: new Set(['noir-gold', 'ink-blue', 'frost', 'moss', 'ember', 'lilac', 'sky', 'sand']),
    wallpaper: new Set(['smoke', 'rain', 'grid', 'starfield', 'library', 'aurora', 'minimal', 'paper']),
    typography: new Set(['modern', 'serif', 'mono']),
    iconStyle: new Set(['rounded', 'square', 'glyph', 'glass']),
    density: new Set(['compact', 'cozy', 'roomy']),
    shellTone: new Set(['graphite', 'silver', 'ivory', 'bronze', 'navy']),
});
const PHONE_UI_EXPLICIT_FIELDS = new Set(['palette', 'wallpaper', 'typography', 'iconStyle', 'density', 'shellTone']);
const PHONE_PROFILE_ORDERS = Object.freeze({
    palette: ['noir-gold', 'ink-blue', 'frost', 'moss', 'ember', 'lilac', 'sky', 'sand'],
    wallpaper: ['smoke', 'rain', 'grid', 'starfield', 'library', 'aurora', 'minimal', 'paper'],
    typography: ['modern', 'serif', 'mono'],
    iconStyle: ['rounded', 'square', 'glyph', 'glass'],
    density: ['compact', 'cozy', 'roomy'],
    shellTone: ['graphite', 'silver', 'ivory', 'bronze', 'navy'],
});
const PHONE_APP_KIND_ALIASES = new Map([
    ['moments', 'moments'], ['social', 'moments'], ['feed', 'moments'],
    ['chat', 'chat'], ['message', 'chat'], ['messages', 'chat'], ['communication', 'chat'],
    ['gallery', 'gallery'], ['photo', 'gallery'], ['photos', 'gallery'], ['album', 'gallery'],
    ['camera', 'camera'],
    ['notes', 'notes'], ['note', 'notes'], ['memo', 'notes'], ['tasks', 'notes'],
    ['store', 'store'], ['shop', 'store'], ['shopping', 'store'],
    ['browser', 'browser'], ['web', 'browser'], ['search', 'browser'],
    ['contacts', 'contacts'], ['contact', 'contacts'], ['people', 'contacts'],
    ['location', 'location'], ['map', 'location'], ['maps', 'location'], ['navigation', 'location'],
    ['music', 'music'], ['audio', 'music'],
    ['work', 'work'], ['office', 'work'], ['casework', 'work'],
    ['study', 'study'], ['school', 'study'], ['learning', 'study'],
    ['health', 'health'], ['medical', 'health'], ['fitness', 'fitness'], ['training', 'training'],
    ['reading', 'reading'], ['library', 'reading'], ['books', 'books'], ['book', 'books'],
    ['files', 'files'], ['file', 'files'], ['documents', 'files'],
    ['research', 'research'], ['lab', 'research'],
    ['games', 'games'], ['game', 'games'],
    ['finance', 'finance'], ['wallet', 'finance'],
    ['travel', 'travel'], ['transit', 'travel'],
    ['security', 'security'], ['mission', 'security'],
    ['creative', 'creative'], ['art', 'creative'], ['craft', 'creative'],
    ['weather', 'weather'], ['tools', 'tools'], ['utility', 'tools'], ['misc', 'misc'], ['persona', 'misc'],
]);
const PHONE_APP_ICON_TOKENS = new Set([
    'message', 'people', 'photo', 'camera', 'note', 'bag', 'globe', 'contact', 'pin', 'music',
    'briefcase', 'book', 'heart', 'activity', 'game', 'wallet', 'plane', 'shield', 'palette',
    'cloud', 'tool', 'spark', 'grid',
]);
const PHONE_KIND_ICON = Object.freeze({
    moments: 'people', chat: 'message', gallery: 'photo', camera: 'camera', notes: 'note', store: 'bag',
    browser: 'globe', contacts: 'contact', location: 'pin', music: 'music', work: 'briefcase', study: 'book',
    health: 'heart', fitness: 'activity', training: 'activity', reading: 'book', books: 'book', files: 'briefcase', research: 'tool', games: 'game', finance: 'wallet', travel: 'plane',
    security: 'shield', creative: 'palette', weather: 'cloud', tools: 'tool', misc: 'spark',
});

function phoneProfileSeed(data, memoryBank, deviceKind) {
    return [
        memoryBank?.characterName,
        memoryBank?.archiveName,
        ...(Array.isArray(memoryBank?.archiveKeywords) ? memoryBank.archiveKeywords.slice(0, 8) : []),
        core_text.normalizeText(memoryBank?.archiveSummary, 600),
        data?.deviceName,
        data?.title,
        ...(Array.isArray(data?.apps) ? data.apps.slice(0, 10).flatMap(app => [app?.label, app?.kind]) : []),
        deviceKind,
    ].map(value => core_text.normalizeText(value, 600)).filter(Boolean).join('|');
}

function inferredPhoneProfile(seed, deviceKind) {
    const text = core_text.normalizeText(seed, 5000).toLowerCase();
    let semantic = null;
    if (/(?:赛博|科幻|星际|宇宙|实验|研究|代码|程序|工程|机械|ai|cyber|space|sci-fi)/i.test(text)) {
        semantic = { palette: 'ink-blue', wallpaper: 'grid', typography: 'mono', iconStyle: 'glyph', density: 'compact', shellTone: 'graphite' };
    } else if (/(?:侦探|律师|法庭|特工|军官|杀手|黑帮|吸血|哥特|夜色|冷峻|detective|lawyer|goth)/i.test(text)) {
        semantic = { palette: 'noir-gold', wallpaper: 'smoke', typography: 'serif', iconStyle: 'square', density: 'compact', shellTone: 'graphite' };
    } else if (/(?:森林|植物|自然|园艺|田园|精灵|草药|forest|nature|garden)/i.test(text)) {
        semantic = { palette: 'moss', wallpaper: 'paper', typography: 'serif', iconStyle: 'rounded', density: 'cozy', shellTone: 'bronze' };
    } else if (/(?:音乐|画家|艺术|舞蹈|作家|诗人|摄影|乐队|music|artist|writer)/i.test(text)) {
        semantic = { palette: 'lilac', wallpaper: 'aurora', typography: 'serif', iconStyle: 'glass', density: 'cozy', shellTone: 'silver' };
    } else if (/(?:海|雨|医生|治愈|安静|清冷|温柔|ocean|rain|doctor|healer)/i.test(text)) {
        semantic = { palette: 'sky', wallpaper: 'rain', typography: 'modern', iconStyle: 'rounded', density: 'roomy', shellTone: 'silver' };
    }
    if (semantic) return semantic;
    const hash = core_text.hashString(seed || deviceKind || 'private-device');
    const pick = (field, shift) => {
        const values = PHONE_PROFILE_ORDERS[field];
        return values[(hash >>> shift) % values.length];
    };
    return {
        palette: pick('palette', 0),
        wallpaper: pick('wallpaper', 4),
        typography: pick('typography', 8),
        iconStyle: pick('iconStyle', 11),
        density: pick('density', 14),
        shellTone: pick('shellTone', 17),
    };
}

function normalizedPhoneUiToken(field, value, fallback) {
    const token = core_text.normalizeText(value, 40).toLowerCase().replace(/_/g, '-');
    return PHONE_UI_TOKENS[field].has(token) ? token : fallback;
}

export function normalizePhoneUiProfile(value, options = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(options?.deviceKind) ? options.deviceKind : 'phone';
    const seed = phoneProfileSeed(options?.data, options?.memoryBank, deviceKind);
    const fallback = inferredPhoneProfile(seed, deviceKind);
    const explicitFields = core_text.cleanArray(source?.explicitFields, PHONE_UI_EXPLICIT_FIELDS.size, 40)
        .filter(field => PHONE_UI_EXPLICIT_FIELDS.has(field));
    const explicit = new Set(explicitFields);
    const choose = field => options?.bindPersona === true && !explicit.has(field)
        ? fallback[field]
        : normalizedPhoneUiToken(field, source[field], fallback[field]);
    return {
        identityKey: `phone-ui:${core_text.hashString(seed || deviceKind || 'private-device').toString(36)}`,
        explicitFields,
        palette: choose('palette'),
        wallpaper: choose('wallpaper'),
        typography: choose('typography'),
        iconStyle: choose('iconStyle'),
        density: choose('density'),
        shellTone: choose('shellTone'),
    };
}

export function normalizePhoneAppKind(value, label = '') {
    const token = core_text.normalizeText(value, 60).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (PHONE_APP_KIND_ALIASES.has(token)) return PHONE_APP_KIND_ALIASES.get(token);
    const text = core_text.normalizeText(label, 100);
    if (/(?:聊天|消息|通讯|私信|信箱)/u.test(text)) return 'chat';
    if (/(?:相册|照片|图库|影像)/u.test(text)) return 'gallery';
    if (/(?:相机|拍摄)/u.test(text)) return 'camera';
    if (/(?:备忘|笔记|清单|待办)/u.test(text)) return 'notes';
    if (/(?:联系人|通讯录)/u.test(text)) return 'contacts';
    if (/(?:浏览|搜索|网络)/u.test(text)) return 'browser';
    if (/(?:商店|购物|订单)/u.test(text)) return 'store';
    if (/(?:位置|地图|导航|定位)/u.test(text)) return 'location';
    if (/(?:音乐|音频|乐谱)/u.test(text)) return 'music';
    if (/(?:工作|案件|任务|办公|值班)/u.test(text)) return 'work';
    if (/(?:学习|课程|学校|训练)/u.test(text)) return 'study';
    if (/(?:健康|医疗)/u.test(text)) return 'health';
    if (/(?:运动|健身)/u.test(text)) return 'fitness';
    if (/(?:阅读|书架|图书)/u.test(text)) return 'reading';
    if (/(?:游戏)/u.test(text)) return 'games';
    if (/(?:钱包|账单|财务)/u.test(text)) return 'finance';
    if (/(?:旅行|行程|交通)/u.test(text)) return 'travel';
    if (/(?:安全|警报|门禁)/u.test(text)) return 'security';
    if (/(?:创作|绘画|设计|手作)/u.test(text)) return 'creative';
    if (/(?:天气|气象)/u.test(text)) return 'weather';
    if (/(?:动态|社交|朋友圈)/u.test(text)) return 'moments';
    return 'misc';
}

export function normalizePhoneAppIcon(value, kind = 'misc', label = '') {
    const token = core_text.normalizeText(value, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (PHONE_APP_ICON_TOKENS.has(token)) return token;
    const normalizedKind = normalizePhoneAppKind(kind, label);
    return PHONE_KIND_ICON[normalizedKind] || 'spark';
}

function isExcludedPhoneApp(app) {
    const rawKind = core_text.normalizeText(app?.kind, 60).toLowerCase();
    const label = core_text.normalizeText(app?.label, 60);
    const canonicalKind = normalizePhoneAppKind(rawKind, label);
    const excludedLabel = /(?:日历|地图|导航|定位|路线|行程|出行|旅行|交通)|\b(?:calendar|schedule|maps?|navigation|location|route|travel|transit)\b/i;
    return core_constants.PHONE_EXCLUDED_APP_KINDS.has(rawKind)
        || core_constants.PHONE_EXCLUDED_APP_KINDS.has(canonicalKind)
        || excludedLabel.test(label);
}

function phoneAppLimits(deviceKind) {
    if (['watch', 'communicator'].includes(deviceKind)) return { minApps: 4, maxApps: 8, minEntries: 8 };
    return { minApps: 5, maxApps: 10, minEntries: 12 };
}

export function migrateLegacyPhoneSession(session, memoryBank = null) {
    if (!session || session.kind !== core_constants.MODE.PHONE) return session;
    const migrated = structuredClone(session);
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(migrated.deviceKind) ? migrated.deviceKind : 'phone';
    const wasLegacy = Number(migrated.uiVersion) !== core_constants.PHONE_SESSION_VERSION;
    migrated.deviceKind = deviceKind;
    migrated.uiVersion = core_constants.PHONE_SESSION_VERSION;
    migrated.uiProfile = normalizePhoneUiProfile(migrated.uiProfile, { data: migrated, memoryBank, deviceKind });
    migrated.apps = (Array.isArray(migrated.apps) ? migrated.apps : []).filter(app => !isExcludedPhoneApp(app) && !PHONE_RESERVED_APP_IDS.has(core_text.safeId(app?.id, ''))).map(app => {
        const label = core_text.normalizeText(app?.label, 60) || '分区';
        const kind = normalizePhoneAppKind(app?.kind, label);
        return { ...app, label, kind, icon: normalizePhoneAppIcon(app?.icon, kind, label) };
    });
    if (!migrated.apps.some(app => app.id === migrated.selectedAppId)) migrated.selectedAppId = migrated.apps[0]?.id || '';
    if (wasLegacy) {
        migrated.view = 'home';
        migrated.selectedEntryId = '';
    } else {
        migrated.view = PHONE_VIEW_VALUES.has(migrated.view) ? migrated.view : 'home';
        const selected = migrated.apps.find(app => app.id === migrated.selectedAppId);
        if (migrated.view === 'detail' && !selected?.entries?.some(entry => entry.id === migrated.selectedEntryId)) {
            migrated.view = 'list';
            migrated.selectedEntryId = '';
        }
    }
    return migrated;
}

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
先读取受控上下文中的世界书与角色卡：世界书若明确写了设备形态或角色审美，必须优先遵守；没有明确设定时，再按 {{char}} 的时代、身份、职业、性格、兴趣、经济条件与生活习惯推导。USER_PERSONA_JSON 描述的是用户，只能帮助识别与 {{user}} 有关的称呼或既有关系，不能拿来替代 {{char}} 的设备人设。不同角色不应得到同一套固定 App 或固定配色。
UNTRUSTED_PHONE_ARCHIVE_JSON:\n${generation_prompts.promptArchiveSlice(memoryBank, 24)}
CURRENT_ROOM_CONTEXT_JSON:\n${JSON.stringify(compactPhoneRoomContext(roomSession), null, 2)}

严格输出：
{"title":"他的私人终端","deviceName":"设备名称","deviceKind":"phone","lockText":"...","uiProfile":{"explicitFields":[],"palette":"PALETTE_TOKEN","wallpaper":"WALLPAPER_TOKEN","typography":"TYPOGRAPHY_TOKEN","iconStyle":"ICON_STYLE_TOKEN","density":"DENSITY_TOKEN","shellTone":"SHELL_TONE_TOKEN"},"liveStates":{"morning":{"lockText":"...","statusLine":"...","badgeCounts":{}},"daytime":{},"evening":{},"night":{}},"apps":[{"id":"CHAT","label":"通讯","kind":"chat","icon":"message","summary":"...","entries":[{"id":"C01","title":"条目标题","meta":"时间/对象/分类"}]}]}

数量要求：
- phone / terminal 生成 5～10 个 App；watch / communicator 生成 4～8 个适合小屏或有限能力的功能入口。至少保留一个 chat / 通讯入口，其余 App 的名称、类型、数量和顺序都必须服从角色人设，不得照抄固定模板。
- 至少 2 个 App 应明显来自角色职业、兴趣或世界观，例如案件库、训练记录、乐谱、实验日志、任务终端、宠物、阅读、健康或学习；不适合现代 App 的世界观应使用功能等价但符合时代的命名。
- kind 只能选 moments/chat/gallery/camera/notes/store/browser/contacts/music/work/study/health/fitness/training/reading/books/files/research/games/finance/security/creative/weather/tools/misc；icon 只能选 message/people/photo/camera/note/bag/globe/contact/music/briefcase/book/heart/activity/game/wallet/shield/palette/cloud/tool/spark/grid。
- uiProfile 只能使用：palette=noir-gold/ink-blue/frost/moss/ember/lilac/sky/sand；wallpaper=smoke/rain/grid/starfield/library/aurora/minimal/paper；typography=modern/serif/mono；iconStyle=rounded/square/glyph/glass；density=compact/cozy/roomy；shellTone=graphite/silver/ivory/bronze/navy。上面的 *_TOKEN 只是占位符，必须换成某个允许值，不得原样照抄。这些是本地安全样式 token，不得输出颜色值、CSS、URL 或 class 名。
- uiProfile.explicitFields 只允许 palette/wallpaper/typography/iconStyle/density/shellTone；只有世界书或角色卡对该项有明文时才列入。其余字段保持不在列表中，本地会依据 {{char}} 的人设、设备名和 App 组合稳定补全，防止不同角色照抄同一套合法模板。
- 禁止生成 kind=schedule/calendar/location/travel/map/navigation/transit/route，或名为“日历/地图/导航/路线/行程/出行/旅行”的 App；日期手账和地图分别由独立「两个人的日历」与「他的出行路线」承担。私人终端 notes 可以有普通个人待办，但不要复制这两个入口。
- 每个 entries 现在只写 id/title/meta，标题必须彼此有生活区分，不要填 preview/detail/messages/fields/imageCaption。
- deviceKind 只能 phone/watch/terminal/communicator；四个 liveStates 都要有。
- 不复刻真实商业 App 商标；禁止前任/第三方恋爱。只输出 JSON。`;
}

export function normalizePhonePlan(data, memoryBank = null) {
    const deviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(deviceName) ? 'watch' : /(?:传讯|通讯器|communicator)/i.test(deviceName) ? 'communicator' : /(?:终端|terminal)/i.test(deviceName) ? 'terminal' : 'phone';
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind;
    const limits = phoneAppLimits(deviceKind);
    const apps = [];
    const usedAppIds = new Set();
    for (const [appIndex, app] of (Array.isArray(data?.apps) ? data.apps : []).slice(0, limits.maxApps).entries()) {
        if (isExcludedPhoneApp(app)) continue;
        const label = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const id = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(id) || usedAppIds.has(id)) continue;
        usedAppIds.add(id);
        const kind = normalizePhoneAppKind(app?.kind, label);
        const entries = [];
        const usedEntryIds = new Set();
        for (const [index, entry] of (Array.isArray(app?.entries) ? app.entries : []).slice(0, 24).entries()) {
            const entryId = core_text.safeId(entry?.id, `${id}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) continue;
            usedEntryIds.add(entryId);
            entries.push({
                id: entryId,
                title: core_text.normalizeText(entry?.title, 100) || `条目 ${index + 1}`,
                meta: core_text.normalizeText(entry?.meta, 200),
            });
        }
        if (!entries.length) continue;
        apps.push({
            id,
            label,
            kind,
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            summary: core_text.normalizeText(app?.summary, 1200),
            entries,
        });
    }
    const { minApps, minEntries } = limits;
    if (apps.length < minApps) throw new Error(`私人终端目录 App 不足：${apps.length}/${minApps}。`);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (total < minEntries) throw new Error(`私人终端目录条目不足：${total}/${minEntries}。`);
    if (!apps.some(app => app.kind === 'chat')) throw new Error('私人终端目录缺少 chat / 通讯分区。');
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
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText,
        liveStates,
        apps,
    };
}

export function phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds = null) {
    const compact = ['watch', 'communicator'].includes(plan.deviceKind);
    const deepCount = 1;
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
        const minimum = 1;
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
        icon: normalizePhoneAppIcon(planApp.icon, planApp.kind, planApp.label),
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
        raw => normalizePhonePlan(raw, memoryBank),
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
    return (Array.isArray(session?.apps) ? session.apps : []).filter(app => !isExcludedPhoneApp(app)).slice(0, 10).map(app => ({
        id: core_text.normalizeText(app?.id, 80),
        label: core_text.normalizeText(app?.label, 80),
        kind: normalizePhoneAppKind(app?.kind, app?.label),
        icon: normalizePhoneAppIcon(app?.icon, app?.kind, app?.label),
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
- app id/kind 必须对应现有 App；不得向 schedule/calendar/location/travel/map/navigation/transit/route 或日历/地图/导航/路线/行程/出行/旅行追加内容；不改变 deviceKind、设备名、锁屏或既有 liveStates。
- 新条目的标题、对象、时间与主题必须避开 EXISTING_PHONE_INDEX_JSON；禁止把旧聊天、旧相册、旧笔记换措辞再说一次。
- 与 {{user}} 的已发生共同历史必须在详情阶段使用 basis=记忆并引用 incrementalMemoryIds；普通工作/兴趣当前状态可为设定。
- 禁止前任/第三方恋爱；只输出 JSON。`;
}

export function normalizePhoneIncrementPlan(data, previous) {
    if (!Array.isArray(data?.apps)) throw new Error('私人终端增量目录缺少 apps 数组。');
    const safePrevious = migrateLegacyPhoneSession(previous);
    const eligibleApps = (safePrevious.apps || []).filter(app => !isExcludedPhoneApp(app));
    const existingById = new Map(eligibleApps.map(app => [app.id, app]));
    const existingByKind = new Map(eligibleApps.map(app => [app.kind, app]));
    const rawApps = data.apps.slice(0, 10);
    const apps = rawApps.map(raw => {
        const id = core_text.safeId(raw?.id, '');
        const kind = normalizePhoneAppKind(raw?.kind, raw?.label);
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
            icon: normalizePhoneAppIcon(existing.icon, existing.kind, existing.label),
            incremental: true,
            summary: core_text.normalizeText(raw?.summary, 1200) || existing.summary,
            entries: planned,
        };
    }).filter(Boolean);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (rawApps.length && !total) throw new Error('私人终端增量目录返回了 App，但没有可验证的新条目。');
    return {
        title: safePrevious.title,
        deviceName: safePrevious.deviceName,
        deviceKind: safePrevious.deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        uiProfile: safePrevious.uiProfile,
        lockText: safePrevious.lockText,
        liveStates: safePrevious.liveStates,
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
    const safePrevious = migrateLegacyPhoneSession(previous, memoryBank);
    const merged = structuredClone(safePrevious);
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
    normalized.selectedAppId = safePrevious.selectedAppId || normalized.selectedAppId;
    normalized.selectedEntryId = safePrevious.selectedEntryId || '';
    normalized.view = PHONE_VIEW_VALUES.has(safePrevious.view) ? safePrevious.view : 'home';
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
    const limits = phoneAppLimits(deviceKind);
    const rawApps = Array.isArray(data?.apps) ? data.apps : [];
    const usedAppIds = new Set();
    const apps = rawApps.slice(0, limits.maxApps).map((app, appIndex) => {
        if (isExcludedPhoneApp(app)) return null;
        const appId = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(appId) || usedAppIds.has(appId)) return null;
        usedAppIds.add(appId);
        const label = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const kind = normalizePhoneAppKind(app?.kind, label);
        const usedEntryIds = new Set();
        const entries = (Array.isArray(app?.entries) ? app.entries : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((entry, index) => {
            const entryId = core_text.safeId(entry?.id, `${appId}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) return null;
            usedEntryIds.add(entryId);
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
                id: entryId,
                title,
                meta: core_text.normalizeText(entry?.meta, 200),
                preview,
                detail,
                contactName: kind === 'chat' ? conversation.contactName : '',
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
            label,
            kind,
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            summary: core_text.normalizeText(app?.summary, 1200),
            entries,
        };
    }).filter(app => app && app.entries.length >= 1);

    const compactDevice = ['watch', 'communicator'].includes(deviceKind);
    if (apps.length < limits.minApps) throw new Error(`“他的私人终端”分区不足：得到 ${apps.length} 个，当前设备至少需要 ${limits.minApps} 个。`);
    const totalEntries = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (totalEntries < limits.minEntries) throw new Error(`“他的私人终端”内容过少：只有 ${totalEntries} 个可读条目，至少需要 ${limits.minEntries} 个。`);
    if (!apps.some(app => app.kind === 'chat')) throw new Error('“他的私人终端”缺少 chat / 通讯分区。');
    if (deviceKind === 'phone' && apps.some(app => app.kind === 'contacts')) {
        const contactDetails = apps.filter(app => app.kind === 'contacts').flatMap(app => app.entries).some(entry => entry.fields.length >= 3);
        if (!contactDetails) throw new Error('“他的私人终端”联系人详情不足：至少 1 个联系人需要 3 项以上备注 / 最近通话 / 位置或提醒字段。');
    }
    const deepChatMessageMinimum = compactDevice ? 8 : (deviceKind === 'terminal' ? 10 : 12);
    const deepChats = apps.filter(app => app.kind === 'chat').flatMap(app => app.entries).filter(entry => entry.messages.length >= deepChatMessageMinimum).length;
    const minDeepChats = 1;
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
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText: core_text.normalizeText(data?.lockText, 400),
        liveStates,
        apps,
        selectedAppId: apps[0].id,
        selectedEntryId: '',
        view: 'home',
    };
}
