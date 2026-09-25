import * as core_constants from '../core/constants.js';
import * as core_participants from '../core/participants.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
// 私人终端基础：常量与修复合同、界面档案、App 类型与图标、主人/联系人名字判断
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export const PHONE_MESSAGE_ROLES = new Set(['owner', 'contact']);

const PHONE_GENERIC_OWNER_LABELS = new Set(['我', '本人', '自己', '设备主人', '主人', '{{char}}', 'char', 'owner']);

const PHONE_GENERIC_CONTACT_LABELS = new Set(['对方', '联系人', '对面', '对方用户', 'contact', 'other']);

export const PHONE_RESERVED_APP_IDS = new Set(['__PHONE_HOME__']);

export const PHONE_VIEW_VALUES = new Set(['home', 'list', 'detail']);

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

export const PHONE_KIND_LABEL = Object.freeze({
    moments: '动态', chat: '通讯', gallery: '影像', camera: '记录', notes: '备忘', store: '物品',
    browser: '索引', contacts: '联系人', music: '声音', work: '工作', study: '学习', health: '健康',
    fitness: '活动', training: '训练', reading: '阅读', books: '书册', files: '文件', research: '研究',
    games: '游戏', finance: '账目', security: '安全', creative: '创作', weather: '天气', tools: '工具', misc: '其他',
});

export const PHONE_DEVICE_LABEL = Object.freeze({
    neutral: '私人记录载体', phone: '私人手机', watch: '私人腕表', terminal: '私人终端',
    communicator: '私人通讯器', folio: '私人册页', relic: '私人信物',
});

export const PHONE_COMMUNICATION_REPAIR_CONTRACT = '【通讯修订合同】本段只补当前通讯App的原ID。与当前用户的线程只写主人一侧至少一条未发送草稿：basis=推演、conversationMode=draft，禁止生成用户消息，不要求双向。已知普通NPC可写双向当下日常，标为daily，不能冒充历史；已发生的双向原话仅basis=记忆，每句及说话人归属必须在所引Mxxx逐字核对，摘要不够则降为主人未发送草稿。组卡设备名仍为卡名，owner的speaker必须用受控成员真名；旧目录没有ownerMembers时，本次app内返回ownerMembers:[{name:"成员真名",sourceEvidence:"本次受控角色卡/世界书里的逐字成员身份原文"}]，只接受本次已有受控资料可核验的成员，不得自编名单或引用用户Persona。没有合法对象的槽位省略，不重做其他已完成App。不得返回笼统的“按此App用途补齐”，每项明确contactName及草稿/daily。';

export const PHONE_LIFESTYLE_REPAIR_CONTRACT = '【日常应用修订合同】本段只补当前App的原ID。备忘、工作、学习、阅读、账目、创作等是档案人物自己在用的记录，作者用受控成员真名，不是角色卡名称。当前用户若被提及，用档案显示名；Persona名只是同一人的别名。写正在使用的日常内容，不要替用户写已发送留言，不要编造共同历史。标题必须具体，不得返回“按此App用途与角色生活补齐”。';

export function phoneRecoveryContract(kind) {
    return kind === 'chat' ? 'phone-chat-p0' : 'phone-notes-p0';
}

export function verifiedPhoneOwnerMembers(rows, memoryBank, controlledEvidence) {
    return (Array.isArray(rows) ? rows : []).filter(row => core_text.normalizeText(row?.name, 100) && !isPhoneUserName(row.name, memoryBank)
        && core_text.normalizeText(row?.sourceEvidence, 800).length >= 4
        && core_text.normalizeText(row?.sourceEvidence, 800).includes(core_text.normalizeText(row.name, 100))
        && core_worldPresentation.controlledEvidenceContains(controlledEvidence, row.sourceEvidence))
        .map(row => ({ name: core_text.normalizeText(row.name, 100), sourceEvidence: core_text.normalizeText(row.sourceEvidence, 800) }));
}

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

export function isExcludedPhoneApp(app) {
    const rawKind = core_text.normalizeText(app?.kind, 60).toLowerCase();
    const label = core_text.normalizeText(app?.label, 60);
    const canonicalKind = normalizePhoneAppKind(rawKind, label);
    const excludedLabel = /(?:日历|地图|导航|定位|路线|行程|出行|旅行|交通)|\b(?:calendar|schedule|maps?|navigation|location|route|travel|transit)\b/i;
    return core_constants.PHONE_EXCLUDED_APP_KINDS.has(rawKind)
        || core_constants.PHONE_EXCLUDED_APP_KINDS.has(canonicalKind)
        || excludedLabel.test(label);
}

export function phoneAppLimits(deviceKind) {
    if (['neutral', 'watch', 'communicator', 'folio', 'relic'].includes(deviceKind)) return { minApps: 1, maxApps: 8, minEntries: 1 };
    return { minApps: 1, maxApps: 10, minEntries: 1 };
}

export function unavailablePhoneEntry(id) {
    return { id, title: '暂无可核实记录', preview: '这项目录没有足够原文，暂未收录。', detail: '可在补充来源并更新档案后，再单独生成这一项。',
        sourceStatus: 'unavailable', meta: '', contactName: '', messages: [], fields: [], imageCaption: '',
        basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '', sourceMemoryEvidence: '', sourceSettingEvidence: '' };
}

export function isUnavailablePhoneEntry(entry) { return entry?.unavailable === true || entry?.sourceStatus === 'unavailable'; }

export function assertPhoneConversation(messages, { userThread = false } = {}) {
    if (userThread) {
        if (!messages.some(message => message.speakerRole === 'owner')) {
            throw core_text.safeUserError('给当前用户的线程至少需要一条主人未发送草稿。', 'RMT_PHONE_SPEAKERS');
        }
        return;
    }
    const roles = new Set(messages.map(message => message.speakerRole));
    if (messages.length < 2 || !roles.has('owner') || !roles.has('contact')) {
        throw core_text.safeUserError('聊天没有同时出现设备主人和聊天对象；请保留有据的双方原话。', 'RMT_PHONE_SPEAKERS');
    }
}

export function phoneStory(memoryBank, context = null) {
    return core_participants.resolveStoryIdentities(memoryBank, context);
}

export function isPhoneUserName(value, memoryBank, context = null) {
    return core_participants.nameMatches(value, phoneStory(memoryBank, context).userAliases);
}

export function isPhoneOwnerName(value, memoryBank, context = null) {
    return core_participants.nameMatches(value, phoneStory(memoryBank, context).ownerNames);
}

export function isPhonePlaceholderTitle(title) {
    const text = core_text.normalizeText(title, 100);
    return !text || text === '暂无可核实记录' || text === '按此 App 用途与角色生活补齐';
}

export function phoneConversationOwnerName(memoryBank, context = null) {
    return phoneStory(memoryBank, context).ownerNames[0]
        || core_text.normalizeText(memoryBank?.characterName, 100)
        || '角色';
}

function normalizedSpeakerKey(value) {
    return core_text.normalizeText(value, 100).trim().toLocaleLowerCase();
}

export function isGenericOwnerLabel(value) {
    return PHONE_GENERIC_OWNER_LABELS.has(normalizedSpeakerKey(value));
}

export function isGenericContactLabel(value) {
    return PHONE_GENERIC_CONTACT_LABELS.has(normalizedSpeakerKey(value));
}
