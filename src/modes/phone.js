// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_participants from '../core/participants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
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
const PHONE_KIND_LABEL = Object.freeze({
    moments: '动态', chat: '通讯', gallery: '影像', camera: '记录', notes: '备忘', store: '物品',
    browser: '索引', contacts: '联系人', music: '声音', work: '工作', study: '学习', health: '健康',
    fitness: '活动', training: '训练', reading: '阅读', books: '书册', files: '文件', research: '研究',
    games: '游戏', finance: '账目', security: '安全', creative: '创作', weather: '天气', tools: '工具', misc: '其他',
});
const PHONE_DEVICE_LABEL = Object.freeze({
    neutral: '私人记录载体', phone: '私人手机', watch: '私人腕表', terminal: '私人终端',
    communicator: '私人通讯器', folio: '私人册页', relic: '私人信物',
});

export const PHONE_COMMUNICATION_REPAIR_CONTRACT = '【通讯修订合同】本段只补当前通讯App的原ID。与当前用户的线程只写主人一侧至少一条未发送草稿：basis=推演、conversationMode=draft，禁止生成用户消息，不要求双向。已知普通NPC可写双向当下日常，标为daily，不能冒充历史；已发生的双向原话仅basis=记忆，每句及说话人归属必须在所引Mxxx逐字核对，摘要不够则降为主人未发送草稿。组卡设备名仍为卡名，owner的speaker必须用受控成员真名；旧目录没有ownerMembers时，本次app内返回ownerMembers:[{name:"成员真名",sourceEvidence:"本次受控角色卡/世界书里的逐字成员身份原文"}]，只接受本次已有受控资料可核验的成员，不得自编名单或引用用户Persona。没有合法对象的槽位省略，不重做其他已完成App。不得返回笼统的“按此App用途补齐”，每项明确contactName及草稿/daily。';

export const PHONE_LIFESTYLE_REPAIR_CONTRACT = '【日常应用修订合同】本段只补当前App的原ID。备忘、工作、学习、阅读、账目、创作等是档案人物自己在用的记录，作者用受控成员真名，不是角色卡名称。当前用户若被提及，用档案显示名；Persona名只是同一人的别名。写正在使用的日常内容，不要替用户写已发送留言，不要编造共同历史。标题必须具体，不得返回“按此App用途与角色生活补齐”。';

function phoneRecoveryContract(kind) {
    return kind === 'chat' ? 'phone-chat-p0' : 'phone-notes-p0';
}

function verifiedPhoneOwnerMembers(rows, memoryBank, controlledEvidence) {
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
    if (['neutral', 'watch', 'communicator', 'folio', 'relic'].includes(deviceKind)) return { minApps: 1, maxApps: 8, minEntries: 1 };
    return { minApps: 1, maxApps: 10, minEntries: 1 };
}

function unavailablePhoneEntry(id) {
    return { id, title: '暂无可核实记录', preview: '这项目录没有足够原文，暂未收录。', detail: '可在补充来源并更新档案后，再单独生成这一项。',
        sourceStatus: 'unavailable', meta: '', contactName: '', messages: [], fields: [], imageCaption: '',
        basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '', sourceMemoryEvidence: '', sourceSettingEvidence: '' };
}

function isUnavailablePhoneEntry(entry) { return entry?.unavailable === true || entry?.sourceStatus === 'unavailable'; }

function assertPhoneConversation(messages, { userThread = false } = {}) {
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

function phoneStory(memoryBank, context = null) {
    return core_participants.resolveStoryIdentities(memoryBank, context);
}

function isPhoneUserName(value, memoryBank, context = null) {
    return core_participants.nameMatches(value, phoneStory(memoryBank, context).userAliases);
}

function isPhoneOwnerName(value, memoryBank, context = null) {
    return core_participants.nameMatches(value, phoneStory(memoryBank, context).ownerNames);
}

function isPhonePlaceholderTitle(title) {
    const text = core_text.normalizeText(title, 100);
    return !text || text === '暂无可核实记录' || text === '按此 App 用途与角色生活补齐';
}

function applyPhoneChatContract(conversation, memoryBank, { basis = '' } = {}) {
    const story = phoneStory(memoryBank);
    const userThread = isPhoneUserName(conversation?.contactName, memoryBank);
    if (!userThread) return { ...conversation, userThread: false };
    const ownerName = story.ownerNames[0] || conversation.ownerName;
    const messages = basis === '记忆'
        ? conversation.messages
        : (conversation.messages || []).filter(message => message.speakerRole === 'owner' && !isPhoneUserName(message.speaker, memoryBank))
            .map(message => ({
                ...message,
                speakerRole: 'owner',
                speaker: isPhoneOwnerName(message.speaker, memoryBank) ? message.speaker : ownerName,
            }));
    return { ...conversation, contactName: story.userDisplay, ownerName, messages, userThread: true };
}

export function migrateLegacyPhoneSession(session, memoryBank = null) {
    if (!session || session.kind !== core_constants.MODE.PHONE) return session;
    const migrated = structuredClone(session);
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(migrated.deviceKind) ? migrated.deviceKind : 'phone';
    const previousUiVersion = Number(migrated.uiVersion);
    const isLegacySession = !Number.isFinite(previousUiVersion)
        || previousUiVersion < core_constants.PHONE_SESSION_VERSION;
    const needsHomeReset = !Number.isFinite(previousUiVersion) || previousUiVersion < 2;
    migrated.deviceKind = deviceKind;
    migrated.uiVersion = core_constants.PHONE_SESSION_VERSION;
    migrated.uiProfile = normalizePhoneUiProfile(migrated.uiProfile, { data: migrated, memoryBank, deviceKind });
    migrated.apps = (Array.isArray(migrated.apps) ? migrated.apps : []).filter(app => !isExcludedPhoneApp(app) && !PHONE_RESERVED_APP_IDS.has(core_text.safeId(app?.id, ''))).map(app => {
        const label = core_text.normalizeText(app?.label, 60) || '分区';
        const kind = normalizePhoneAppKind(app?.kind, label);
        const entries = (Array.isArray(app?.entries) ? app.entries : []).map(entry => {
            const basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '';
            const memoryEvidence = core_text.normalizeText(entry?.sourceMemoryEvidence, 800);
            let normalizedEntry = { ...entry };
            let evidenceVerified = !isLegacySession && entry?.legacyEvidenceUnverified !== true;
            if (isLegacySession && basis === '记忆' && memoryBank) {
                const reference = core_evidence.normalizeExactMemoryReference(
                    entry?.sourceMemoryIds,
                    entry?.sourceMemoryAnchor,
                    memoryBank,
                    1,
                );
                const canonicalMemory = phoneReferencedMemoryText(reference, memoryBank);
                const excerptVerified = memoryEvidence.length >= 4
                    && !!canonicalMemory
                    && core_worldPresentation.controlledEvidenceContains(canonicalMemory, memoryEvidence);
                if (excerptVerified) {
                    const conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: false, preserveOwnerNames: kind === 'chat' });
                    const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
                        label: core_text.normalizeText(field?.label, 100),
                        value: core_text.normalizeText(field?.value, 1000),
                    })).filter(field => field.label && field.value);
                    const contains = value => {
                        const text = core_text.normalizeText(value, 5000);
                        return !text || core_worldPresentation.controlledEvidenceContains(canonicalMemory, text)
                            || core_worldPresentation.controlledEvidenceContains(memoryEvidence, text);
                    };
                    const title = core_text.normalizeText(entry?.title, 100);
                    const titleSupported = !title || /^剧情摘录\s+\d+$/u.test(title) || contains(title);
                    const proseSupported = [entry?.meta, entry?.preview, entry?.detail, entry?.imageCaption].every(contains);
                    const structuredSupported = phoneMemoryStructuredFactsSupported(
                        kind,
                        conversation,
                        conversation.messages,
                        fields,
                        memoryEvidence,
                        canonicalMemory,
                    );
                    evidenceVerified = titleSupported && proseSupported && structuredSupported;
                    normalizedEntry = {
                        ...normalizedEntry,
                        sourceMemoryIds: reference.sourceMemoryIds,
                        sourceMemoryAnchor: reference.sourceMemoryAnchor,
                        contactName: kind === 'chat' ? conversation.contactName : core_text.normalizeText(entry?.contactName, 100),
                        messages: sanitizePhoneMemoryMessageTimes(conversation.messages, memoryEvidence, canonicalMemory),
                        fields,
                    };
                }
            }
            // A legacy setting excerpt was stored without the controlled role-card/world-book
            // envelope that authorized it. Non-empty text alone is not proof, so it remains
            // readable but explicitly unverified. Current-version sessions were already checked
            // against that envelope at generation time and retain their existing status.
            return {
                ...normalizedEntry,
                legacyEvidenceUnverified: entry?.legacyEvidenceUnverified === true || !evidenceVerified,
            };
        });
        return {
            ...app,
            label,
            kind,
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            entries,
            omittedEntryIds: core_text.cleanArray(app?.omittedEntryIds, 24, 80).filter(id => !entries.some(entry => entry.id === id)),
            legacyEvidenceUnverified: entries.some(entry => entry.legacyEvidenceUnverified === true),
        };
    });
    migrated.legacyEvidenceUnverifiedCount = migrated.apps.reduce(
        (total, app) => total + (Array.isArray(app?.entries) ? app.entries.filter(entry => entry?.legacyEvidenceUnverified === true).length : 0),
        0,
    );
    if (!migrated.apps.some(app => app.id === migrated.selectedAppId)) migrated.selectedAppId = migrated.apps[0]?.id || '';
    if (needsHomeReset) {
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

export function phoneConversationOwnerName(memoryBank, context = null) {
    return phoneStory(memoryBank, context).ownerNames[0]
        || core_text.normalizeText(memoryBank?.characterName, 100)
        || '角色';
}

export function phoneControlledOwnerNames(memoryBank, options = {}) {
    // Explicit archive membership is already user controlled, including old
    // multi-card archives. Never substitute the card title for an empty roster.
    const roster = core_participants.normalizeParticipantRoster(memoryBank?.[core_participants.PARTICIPANTS_KEY]);
    if (roster) return roster.people.filter(person => roster.selectedIds.includes(person.id)
        && person.identity !== 'user' && !isPhoneUserName(person.name, memoryBank)).map(person => person.name);
    const names = [];
    const evidence = String(options.controlledEvidence || '');
    for (const row of options.ownerMembers || []) {
        const name = core_text.normalizeText(row?.name, 100);
        const quote = core_text.normalizeText(row?.sourceEvidence, 800);
        if (name && !isPhoneUserName(name, memoryBank) && quote.length >= 4 && quote.includes(name)
            && core_worldPresentation.controlledEvidenceContains(evidence, quote)) names.push(name);
    }
    return names.length ? [...new Set(names)] : [phoneConversationOwnerName(memoryBank)];
}

function noPhoneConversation() {
    const error = core_text.safeUserError('通讯没有可保存的对话；请补充合法对象或主人一侧草稿后再生成。', 'RMT_PHONE_NO_CONVERSATION');
    error.nonRetryable = true;
    return error;
}

// Generated chat has one normalization boundary before every validator. Stored
// content is never rewritten here. Unverified history can only become a visibly
// unsent owner draft, never a newly invented received message.
export function normalizePhoneChatEntry(entry, memoryBank, options = {}) {
    if (options.trustedStored === true || isUnavailablePhoneEntry(entry)) return entry;
    const owners = phoneControlledOwnerNames(memoryBank, options);
    const contactName = inferPhoneContactName(entry, memoryBank);
    const messages = (Array.isArray(entry?.messages) ? entry.messages : []).filter(message => {
        if (core_text.normalizeText(message?.speakerRole, 20) !== 'owner') return true;
        const name = core_text.normalizeText(message?.speaker, 100);
        return owners.includes(name) || isPhoneOwnerName(name, memoryBank) || (owners.length === 1 && isGenericOwnerLabel(name));
    }).map(message => message.speakerRole === 'owner' && isGenericOwnerLabel(message.speaker)
        ? { ...message, speaker: owners[0] } : message);
    const candidate = { ...entry, contactName, messages };
    const conversation = normalizePhoneConversationMessages(candidate, memoryBank, { preserveOwnerNames: true });
    const reference = core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1);
    const canonical = phoneReferencedMemoryText(reference, memoryBank);
    const evidence = normalizePhoneMemoryEvidence(entry, reference, memoryBank);
    const roles = new Set(conversation.messages.map(message => message.speakerRole));
    const historical = entry?.basis === '记忆' && reference.sourceMemoryIds.length && evidence
        && roles.has('owner') && roles.has('contact')
        && phoneMemoryStructuredFactsSupported('chat', conversation, conversation.messages, [], evidence, canonical);
    if (historical) return { ...candidate, conversationMode: 'history' };
    const draft = isPhoneUserName(contactName, memoryBank) || entry?.basis === '记忆' || entry?.conversationMode === 'draft';
    const display = isPhoneUserName(contactName, memoryBank) ? phoneStory(memoryBank).userDisplay : contactName;
    const safeMessages = messages.filter(message => !phoneSpeaksAsUser([message], memoryBank)
        && (!draft || message.speakerRole === 'owner'));
    if (!safeMessages.some(message => message.speakerRole === 'owner' && core_text.normalizeText(message.text, 1200))) return unavailablePhoneEntry(entry.id);
    if (!draft) return { ...candidate, contactName: display, messages: safeMessages, conversationMode: 'daily' };
    return { ...candidate, contactName: display, basis: '推演', conversationMode: 'draft', title: `给${display}的未发送草稿`,
        meta: '未发送草稿 · 不代表历史记录', preview: '主人尚未发送的话', detail: '', fields: [], imageCaption: '',
        sourceMemoryIds: [], sourceMemoryAnchor: '', sourceMemoryEvidence: '', sourceSettingEvidence: '',
        messages: safeMessages.map(message => ({ ...message, time: '' })) };
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

    const story = phoneStory(memoryBank);
    const title = core_text.normalizeText(entry?.title, 100).trim();
    const meta = core_text.normalizeText(entry?.meta, 200).trim();
    const mentionedUser = story.userAliases.find(name => name && name !== ownerName && `${title} ${meta}`.includes(name));
    if (mentionedUser) return story.userDisplay;

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

export function normalizePhoneConversationMessages(entry, memoryBank, { strict = false, preserveOwnerNames = false } = {}) {
    const ownerName = phoneConversationOwnerName(memoryBank);
    const contactName = inferPhoneContactName(entry, memoryBank);
    const messages = [];
    for (let index = 0; index < (Array.isArray(entry?.messages) ? entry.messages.length : 0) && messages.length < 48; index += 1) {
        const message = entry.messages[index];
        const text = core_text.normalizeText(message?.text, 1200);
        if (!text) continue;
        const rawSpeaker = core_text.normalizeText(message?.speaker, 100).trim();
        let speakerRole = core_text.normalizeText(message?.speakerRole, 20).trim().toLowerCase();
        if (strict && !PHONE_MESSAGE_ROLES.has(speakerRole)) {
            throw new Error('私人终端聊天消息必须显式提供 speakerRole（owner/contact）。');
        }
        if (!PHONE_MESSAGE_ROLES.has(speakerRole)) {
            if (isPhoneOwnerName(rawSpeaker, memoryBank) || isGenericOwnerLabel(rawSpeaker)) speakerRole = 'owner';
            else if (rawSpeaker && !isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else if (isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else speakerRole = '';
        }
        const speaker = speakerRole === 'owner'
            ? ((preserveOwnerNames && rawSpeaker && !isGenericOwnerLabel(rawSpeaker)) || isPhoneOwnerName(rawSpeaker, memoryBank) ? rawSpeaker : ownerName)
            : speakerRole === 'contact'
                ? (rawSpeaker && !isGenericOwnerLabel(rawSpeaker) && !isGenericContactLabel(rawSpeaker) ? rawSpeaker : contactName)
                : (rawSpeaker || contactName);
        messages.push({
            speakerRole,
            speaker: core_text.normalizeText(speaker, 100) || (speakerRole === 'owner' ? ownerName : contactName),
            time: /^(?:[01]?\d|2[0-3]):[0-5]\d$|^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}(?:\s+(?:[01]?\d|2[0-3]):[0-5]\d)?$/.test(core_text.normalizeText(message?.time, 40))
                ? core_text.normalizeText(message?.time, 40) : '',
            text,
        });
    }
    return { ownerName: preserveOwnerNames ? messages.find(message => message.speakerRole === 'owner')?.speaker || ownerName : ownerName, contactName, messages };
}

function normalizePhoneSettingEvidence(entry, planApp, conversation, generatedText, controlledEvidence, { trustedStored = false } = {}) {
    const excerpt = core_text.normalizeText(entry?.sourceSettingEvidence, 800);
    if (trustedStored) return excerpt;
    if (excerpt.length < 4 || !core_worldPresentation.controlledEvidenceContains(controlledEvidence, excerpt)) return '';
    const foldedExcerpt = excerpt.replace(/\s+/g, '').toLowerCase();
    const foldedGenerated = core_text.normalizeText(generatedText, 9000).replace(/\s+/g, '').toLowerCase();
    const contactName = core_text.normalizeText(conversation?.contactName, 100);
    if (['chat', 'contacts'].includes(planApp?.kind) && contactName && !/^(?:联系人|contact)$/iu.test(contactName)
        && !foldedExcerpt.includes(contactName.replace(/\s+/g, '').toLowerCase())) return '';
    // High-impact identity claims need the same lexical fact in the quoted authority. Generic
    // lifestyle colour is still allowed, but a model cannot invent a relative or profession and
    // attach an unrelated character-card sentence as provenance.
    const guardedTerms = [
        '姐姐', '妹妹', '哥哥', '弟弟', '母亲', '父亲', '妈妈', '爸爸', '妻子', '丈夫', '女儿', '儿子', '家人',
        '侦探', '警察', '刑警', '医生', '护士', '律师', '教师', '老师', '教授', '军人', '士兵', '骑士', '法师', '作家', '画家', '歌手', '演员', '研究员', '工程师', '程序员',
        'sister', 'brother', 'mother', 'father', 'wife', 'husband', 'daughter', 'son', 'detective', 'police', 'doctor', 'nurse', 'lawyer', 'teacher', 'professor', 'soldier', 'knight', 'mage', 'writer', 'artist', 'singer', 'actor', 'researcher', 'engineer', 'programmer',
    ];
    for (const term of guardedTerms) {
        if (foldedGenerated.includes(term) && !foldedExcerpt.includes(term)) return '';
    }
    return excerpt;
}

export function assertPhoneReplacementPreservesRecords(previous, replacement) {
    for (const oldEntry of previous?.entries || []) {
        const newEntry = replacement?.entries?.find(entry => entry.id === oldEntry.id);
        if (oldEntry.sourceStatus !== 'unavailable' && (!newEntry || newEntry.sourceStatus === 'unavailable')) {
            throw core_text.safeUserError('本次没有生成出新的有据内容；旧记录保留。', 'RMT_PHONE_EVIDENCE');
        }
    }
    return replacement;
}

function phoneReferencedMemoryText(reference, memoryBank) {
    const ids = new Set(core_text.cleanArray(reference?.sourceMemoryIds, 16, 40));
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .filter(memory => ids.has(core_text.normalizeText(memory?.id, 40)))
        .map(memory => [memory?.id, memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])]
            .map(value => core_text.normalizeText(value, 3000)).filter(Boolean).join('\n'))
        .join('\n');
}

function normalizePhoneMemoryEvidence(entry, reference, memoryBank, { trustedStored = false } = {}) {
    const excerpt = core_text.normalizeText(entry?.sourceMemoryEvidence, 1200);
    if (trustedStored) return excerpt;
    if (excerpt.length < 4 || !reference?.sourceMemoryIds?.length) return '';
    const canonical = phoneReferencedMemoryText(reference, memoryBank);
    return core_worldPresentation.controlledEvidenceContains(canonical, excerpt) ? excerpt : '';
}

function phoneQuoteHasSpeaker(message, conversation, canonical) {
    const speaker = core_text.normalizeText(message?.speaker, 100);
    const words = core_text.normalizeText(message?.text, 1600);
    const names = [...new Set([conversation?.ownerName, conversation?.contactName, speaker].filter(Boolean))];
    if (!speaker || !words) return false;
    const literal = canonical.split(/\r?\n/).some(line =>
        line.trim() === speaker + '：' + words || line.trim() === speaker + ': ' + words || line.trim() === speaker + ':' + words);
    if (literal) return true;
    // Attribute from source text, not model role labels. Ambiguous indirect speech
    // cannot become a private chat transcript.
    const quotes = /[“「『"]([^”」』"\n]+)[”」』"]/gu;
    let match;
    while ((match = quotes.exec(canonical))) {
        if (match[1].trim() !== words) continue;
        const prefix = canonical.slice(Math.max(0, match.index - 160), match.index)
            .split(/[\n。！？!?；;，,”」』"]/).pop().trim();
        const positions = names.map(name => ({ name, index: prefix.indexOf(name) })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index);
        const escape = value => value.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&');
        const targets = names.map(escape).join('|');
        const verb = '(?:说|说道|道|问|回答|答道|回应|回复|写道|留言|said|asked|replied|wrote|says)';
        const syntax = new RegExp('^\\s*(?:[:：]|(?:(?:轻声|低声|笑着|补充)\\s*)?' + verb
            + '\\s*(?:(?:to\\s+)?(?:' + targets + '))?\\s*[:：]?|对(?:' + targets + ')\\s*' + verb + '\\s*[:：]?)\\s*$', 'iu');
        const subject = positions.find(item => syntax.test(prefix.slice(item.index + item.name.length)));
        if (subject?.name === speaker) return true;
    }
    return false;
}

function phoneMemoryStructuredFactsSupported(kind, conversation, messages, fields, evidence, canonical) {
    const contains = value => {
        const needle = core_text.normalizeText(value, 1600);
        return !needle || core_worldPresentation.controlledEvidenceContains(canonical, needle)
            || core_worldPresentation.controlledEvidenceContains(evidence, needle);
    };
    if (kind === 'chat') {
        return contains(conversation?.contactName)
            && messages.length > 0
            && messages.every(message => contains(message?.text) && phoneQuoteHasSpeaker(message, conversation, canonical)
                && (message?.speakerRole === 'owner'
                    ? core_text.normalizeText(message?.speaker, 100) === core_text.normalizeText(conversation?.ownerName, 100)
                    : contains(message?.speaker)));
    }
    if (kind === 'contacts') {
        return fields.length > 0 && fields.every(field => contains(field?.label) && contains(field?.value));
    }
    return true;
}

function sanitizePhoneMemoryMessageTimes(messages, evidence, canonical) {
    return messages.map(message => {
        const time = core_text.normalizeText(message?.time, 40);
        if (!time || core_worldPresentation.controlledEvidenceContains(canonical, time)
            || core_worldPresentation.controlledEvidenceContains(evidence, time)) return message;
        return { ...message, time: '' };
    });
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

function phoneDisplayText(value, limit, fallback, memoryBank) {
    const story = phoneStory(memoryBank);
    const text = core_text.normalizeText(value, limit);
    return text && !core_narrativeAuthority.narrativeClaimsSharedHistory(text, {
        userName: story.userDisplay, userAliases: story.userAliases,
    }) ? text : fallback;
}

export function normalizePhonePlan(data, memoryBank = null, { worldPresentation = null, controlledEvidence = '' } = {}) {
    const ownerMembers = verifiedPhoneOwnerMembers(data?.ownerMembers, memoryBank, controlledEvidence);
    const controlledProfile = worldPresentation || data?.worldPresentation || null;
    let deviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(deviceName) ? 'watch' : /(?:传讯|通讯器|communicator)/i.test(deviceName) ? 'communicator' : /(?:手札|卷册|书信|信笺|账簿|册页|folio|ledger|scroll|letters?)/i.test(deviceName) ? 'folio' : /(?:魔导|水晶|灵石|符文|秘仪|relic|crystal|arcane)/i.test(deviceName) ? 'relic' : /(?:终端|terminal)/i.test(deviceName) ? 'terminal' : 'phone';
    const allowedDevices = new Set(core_text.cleanArray(controlledProfile?.allowedDevices, 12, 40));
    const controlledDefault = core_constants.PHONE_DEVICE_KINDS.has(controlledProfile?.defaultDevice) ? controlledProfile.defaultDevice : 'neutral';
    const deviceKind = controlledProfile
        ? (allowedDevices.has(requestedKind) ? requestedKind : controlledDefault)
        : (core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind);
    deviceName = phoneDisplayText(deviceName, 100, PHONE_DEVICE_LABEL[deviceKind] || '私人记录载体', memoryBank);
    const limits = phoneAppLimits(deviceKind);
    const apps = [];
    const usedAppIds = new Set();
    for (const [appIndex, app] of (Array.isArray(data?.apps) ? data.apps : []).slice(0, limits.maxApps).entries()) {
        if (isExcludedPhoneApp(app)) continue;
        const requestedLabel = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const id = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(id) || usedAppIds.has(id)) continue;
        usedAppIds.add(id);
        const kind = normalizePhoneAppKind(app?.kind, requestedLabel);
        const label = phoneDisplayText(requestedLabel, 60, PHONE_KIND_LABEL[kind] || `分区 ${appIndex + 1}`, memoryBank);
        const entries = [];
        const usedEntryIds = new Set();
        for (const [index, entry] of (Array.isArray(app?.entries) ? app.entries : []).slice(0, 24).entries()) {
            const entryId = core_text.safeId(entry?.id, `${id}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) continue;
            usedEntryIds.add(entryId);
            entries.push({
                id: entryId,
                title: phoneDisplayText(entry?.title, 100, `记录 ${index + 1}`, memoryBank),
                meta: phoneDisplayText(entry?.meta, 200, '', memoryBank),
                ...(kind === 'chat' ? { contactName: core_text.normalizeText(entry?.contactName, 100),
                    conversationMode: isPhoneUserName(entry?.contactName, memoryBank) || entry?.conversationMode === 'draft' ? 'draft' : 'daily' } : {}),
            });
        }
        if (!entries.length) continue;
        apps.push({
            id,
            label,
            kind,
            ...(kind === 'chat' ? { ownerMembers } : {}),
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            summary: phoneDisplayText(app?.summary, 600, '', memoryBank),
            entries,
        });
    }
    const { minApps, minEntries } = limits;
    if (apps.length < minApps) throw new Error(`私人终端目录 App 不足：${apps.length}/${minApps}。`);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (total < minEntries) throw new Error(`私人终端目录条目不足：${total}/${minEntries}。`);
    const lockText = phoneDisplayText(data?.lockText, 400, 'PRIVATE', memoryBank);
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
            lockText: phoneDisplayText(rawState?.lockText, 400, lockText, memoryBank),
            statusLine: phoneDisplayText(rawState?.statusLine, 500, '', memoryBank),
            badgeCounts,
        };
    }
    return {
        title: '他的私人终端',
        deviceName,
        deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        worldPresentation: controlledProfile ? structuredClone(controlledProfile) : null,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText,
        liveStates,
        apps,
    };
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

export function validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null, options = {}) {
    let raw = data?.app && typeof data.app === 'object' ? data.app : data;
    if (planApp.kind === 'chat') raw = { ...raw, entries: (raw?.entries || []).map(entry => normalizePhoneChatEntry(entry, memoryBank, options)) };
    const returnedId = core_text.safeId(raw?.id, '');
    if (returnedId && returnedId !== planApp.id) throw new Error(`App ${planApp.label} 返回错误 id：${returnedId}。`);
    const expectedIds = new Set(planApp.entries.map(item => item.id));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const seen = new Set();
    for (const entry of entries) {
        const id = core_text.safeId(entry?.id, '');
        if (!expectedIds.has(id) || seen.has(id)) continue;
        if (isUnavailablePhoneEntry(entry)) {
            if (options.requireLifestyleContent && !['contacts', 'chat'].includes(planApp.kind)) continue;
            seen.add(id); continue;
        }
        const preview = core_text.normalizeText(entry?.preview, 1200);
        const detail = core_text.normalizeText(entry?.detail, 5000);
        let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat', preserveOwnerNames: planApp.kind === 'chat' });
        let messages = conversation.messages;
        const fields = Array.isArray(entry?.fields) ? entry.fields.filter(field => core_text.normalizeText(field?.label, 100) && core_text.normalizeText(field?.value, 1000)).slice(0, 16) : [];
        const imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)) continue;
        const basis = phoneEntryBasis(entry, planApp.kind, conversation, memoryBank, options);
        conversation = applyPhoneChatContract(conversation, memoryBank, { basis });
        messages = conversation.messages;
        const legacyStored = options.trustedStored === true && entry?.narrativeVersion !== 1;
        if (legacyStored) { seen.add(id); continue; }
        let memoryEvidence = '';
        if (basis === '记忆') {
            const reference = core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1);
            if (!reference.sourceMemoryIds.length) continue;
            if (sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) continue;
            memoryEvidence = normalizePhoneMemoryEvidence(entry, reference, memoryBank, options);
            const canonical = phoneReferencedMemoryText(reference, memoryBank);
            if (options.trustedStored !== true && (!memoryEvidence || !phoneMemoryStructuredFactsSupported(planApp.kind, conversation, messages, fields, memoryEvidence, canonical))) continue;
        } else {
            const generatedText = [entry?.title, entry?.meta, preview, detail, imageCaption, ...messages.map(m => `${m.speaker}:${m.text}`), ...fields.map(f => `${f.label}:${f.value}`)].join('\n');
            // r45 semantics: ordinary character-life content may be generated from persona/world
            // context without a verbatim quote. Only a claim that a shared past already happened
            // requires Mxxx authority. Only known-NPC ordinary chat can use inference;
            // private contacts and user messages stay on the evidence path.
            if (!phoneInferredEntryAllowed(entry, planApp.kind, conversation, generatedText, memoryBank, options)) continue;
        }
        seen.add(id);
        if (planApp.kind === 'chat') assertPhoneConversation(messages, {
            userThread: entry.conversationMode === 'draft' || (conversation.userThread && basis !== '记忆'),
        });
    }
    if (seen.size < expectedIds.size) throw core_text.safeUserError('终端详情不完整：请补齐对应 ID 的 App 内容。普通日常允许依据人设和世界书演绎；共同过去与私人字段才需要原文证据。', 'RMT_PHONE_EVIDENCE');
    return { ...raw, id: planApp.id, label: planApp.label, kind: planApp.kind };
}

// Wording that asserts a joint past with the user. A 推演 entry that trips this is
// dropped whole rather than rewritten: fewer entries is the safe direction.
// An inferred thread may never contain a line attributed to the user.
function phoneSpeaksAsUser(messages, memoryBank) {
    if (!Array.isArray(messages)) return false;
    return messages.some(message => {
        const speaker = core_text.normalizeText(message?.speaker, 120);
        const role = core_text.normalizeText(message?.speakerRole, 20).toLowerCase();
        if (role === 'owner' && (isGenericOwnerLabel(speaker) || isPhoneOwnerName(speaker, memoryBank))) return false;
        const ownerSelf = speaker === '我' && role === 'owner';
        return isPhoneUserName(speaker, memoryBank) || speaker === '{{user}}' || speaker.toLowerCase() === 'user' || (speaker === '我' && !ownerSelf);
    });
}

function settingContactAllowed(entry, conversation, generatedText, memoryBank, options = {}) {
    // A known ordinary contact is not a license to invent telephone/address/account
    // fields. Those remain on the existing historical-source path.
    const privateField = /(?:手机|电话|号码|邮箱|电邮|地址|住址|身份证|证件|银行|账号|帐号|密码|病历|定位|经纬度)|\b(?:phone|mobile|tel|email|e-mail|address|account|password|passport|medical|coordinates)\b/iu;
    if (privateField.test(generatedText) || /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(generatedText) || conversation.messages.length) return false;
    const name = core_text.normalizeText(conversation.contactName, 100);
    if (!name || /^(?:联系人|contact)$/iu.test(name)) return false;
    // This new setting-only path is for ordinary contacts, not an additional
    // romantic partner for the character. Historical records keep their own path.
    if (!isPhoneUserName(name, memoryBank) && /(?:前任|前妻|前夫|恋人|伴侣|妻子|丈夫|老婆|老公|夫君|娘子|配偶|女朋友|男朋友)|\b(?:wife|husband|spouse|lover|girlfriend|boyfriend)\b/iu.test(generatedText)) return false;
    const quote = normalizePhoneSettingEvidence(entry, { kind: 'contacts' }, conversation, generatedText,
        options.controlledEvidence, { trustedStored: false });
    if (!quote || !core_worldPresentation.controlledEvidenceContains(quote, name)) return false;
    const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16);
    if (!fields.length) return false;
    return fields.every(field => {
        const label = core_text.normalizeText(field?.label, 100), value = core_text.normalizeText(field?.value, 1000);
        if (!label || !value || privateField.test(label)) return false;
        // Ordinary notes may be newly written; identity, occupation and relationship
        // fields must actually be stated about this named contact in the same sentence.
        if (/^(?:备注|便签|计划|note|notes)$/iu.test(label)) return true;
        if (/^(?:姓名|名称|name)$/iu.test(label)) return value === name;
        const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subject = escape(name), fact = escape(value);
        return quote.split(/[。！？!?；;\n]+/u).some(line => {
            if (/(?:不(?:是|认识)|并非|未曾|没有|假如|如果|可能|传闻|假装|扮演|梦里|小说|剧本)|\b(?:not|never|if|maybe|fiction)\b/iu.test(line)) return false;
            // A contact's exact identity predicate, not another person's job in the same quote.
            return new RegExp(`^\\s*${subject}\\s*(?:(?:是|为)(?:一名|一位|一个)?(?:[^的。！？!?，,]{1,120}的)?|(?:的)?(?:职业|关系|身份|工作)\\s*[:：是为]\\s*)${fact}(?:[，,].*)?\\s*$`, 'u').test(line);
        });
    });
}

function phoneInferredEntryAllowed(entry, kind, conversation, text, memoryBank, options = {}) {
    const story = phoneStory(memoryBank);
    const userThread = conversation?.userThread === true || isPhoneUserName(conversation?.contactName, memoryBank);
    if (phoneSpeaksAsUser(conversation.messages, memoryBank)) return false;
    if (!userThread && phoneSpeaksAsUser(entry?.messages, memoryBank)) return false;
    if (kind === 'contacts' && !settingContactAllowed(entry, conversation, text, memoryBank, options)) return false;
    let attributed = String(text);
    for (const alias of story.userAliases) attributed = attributed.split(alias).join('{{user}}');
    if (/(?:\{\{user\}\}|你)(?:的)?[^\n。！？]{0,12}(?:手机号码?|电话号码?|邮箱|住址|家庭地址|身份证号?|银行账号|银行卡号|密码|病历)[\s:：是为]+[^\s\n。！？]{3,}/u.test(attributed)) return false;
    if (kind === 'chat') {
        const name = conversation.contactName;
        const known = [options.controlledEvidence, phoneReferencedMemoryText({ sourceMemoryIds: (memoryBank?.memories || []).map(item => item.id) }, memoryBank)].filter(Boolean).join('\n');
        const userDraft = (userThread || isPhoneUserName(name, memoryBank)) && (entry.conversationMode === 'draft' || userThread);
        if (!name || (isPhoneUserName(name, memoryBank) && !userDraft)
            || (!userDraft && options.trustedStored !== true && !core_worldPresentation.controlledEvidenceContains(known, name))) return false;
        if (options.trustedStored !== true) {
            const ownerNames = new Set(phoneControlledOwnerNames(memoryBank, options));
            if ((entry?.messages || []).some(message => core_text.normalizeText(message?.speakerRole, 20).trim().toLowerCase() === 'owner'
                && !ownerNames.has(core_text.normalizeText(message?.speaker, 100))
                && !isPhoneOwnerName(message?.speaker, memoryBank)
                && !isGenericOwnerLabel(message?.speaker))) return false;
            if (!userDraft && conversation.messages.some(message => message.speakerRole === 'contact'
                && !core_worldPresentation.controlledEvidenceContains(known, message.speaker))) return false;
        }
        if (userDraft || entry.conversationMode === 'draft') {
            if (!conversation.messages.some(message => message.speakerRole === 'owner')) return false;
            assertPhoneConversation(conversation.messages, { userThread: true });
        } else assertPhoneConversation(conversation.messages);
    }
    return !core_narrativeAuthority.narrativeClaimsSharedHistory(text, {
        userName: story.userDisplay, userAliases: story.userAliases, secondPersonIsUser: kind !== 'chat',
    });
}

function phoneEntryBasis(entry, kind, conversation, memoryBank, options = {}) {
    const declared = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
    if (declared !== '记忆' || options.trustedStored === true || kind === 'contacts') return declared;
    const text = [entry?.title, entry?.meta, entry?.preview, entry?.detail, entry?.imageCaption,
        ...(Array.isArray(entry?.fields) ? entry.fields : []).map(field => `${field?.label || ''}:${field?.value || ''}`),
        ...(Array.isArray(entry?.messages) ? entry.messages : []).map(message => `${message?.speaker || ''}:${message?.text || ''}`)].join('\n');
    const unquoted = text.replace(/[“「『"][^”」』"\n]*[”」』"]/gu, '');
    // A quoted "tomorrow" inside an already-recorded conversation is not a future
    // frame for that transcript. Ambiguous retrospective records keep memory rules.
    if (!/(?:正在|现在|今天|今日|明早|明晚|明天|后天|下周|下次|待会|等会|稍后|计划|准备|待办|提醒|草稿|未发送|想和|想陪|要不要)/u.test(unquoted)) return declared;
    // "basis" is a model hint, not authority. Current life content does not become
    // a historical transcript merely because that hint says memory. Never downgrade
    // actual joint history or user transcript/contact fields to avoid their checks.
    return phoneInferredEntryAllowed(entry, kind, conversation, text, memoryBank, options) ? '推演' : declared;
}

export function normalizePhoneDraftApp(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null, options = {}) {
    options = { ...options, ownerMembers: options.ownerMembers || planApp.ownerMembers || [] };
    if (planApp.kind === 'chat') {
        const raw = data?.app && typeof data.app === 'object' ? data.app : data;
        if (!options.ownerMembers.length) options.ownerMembers = verifiedPhoneOwnerMembers(raw?.ownerMembers, memoryBank, options.controlledEvidence);
        data = { ...raw, entries: Array.isArray(raw?.entries) ? raw.entries.map(entry => {
            const planned = planApp.entries.find(row => row.id === entry?.id);
            if (planned?.contactName && inferPhoneContactName(entry, memoryBank) !== planned.contactName) return unavailablePhoneEntry(entry.id);
            return normalizePhoneChatEntry(entry, memoryBank, options);
        }) : raw?.entries };
    }
    const original = data?.app && typeof data.app === 'object' ? data.app : data;
    let omittedEntryIds = [];
    if (options.trustedStored === true && Array.isArray(original?.omittedEntryIds)) {
        const planIds = new Set(planApp.entries.map(entry => entry.id));
        const presentIds = new Set((original.entries || []).map(entry => entry?.id));
        omittedEntryIds = core_text.cleanArray(original.omittedEntryIds, 24, 80);
        if (omittedEntryIds.some(id => !planIds.has(id) || presentIds.has(id))) {
            throw core_text.safeUserError('App 草稿目录身份不一致，原记录保留。', 'RMT_PHONE_SOURCE_CHANGED');
        }
        planApp = { ...planApp, entries: planApp.entries.filter(entry => !omittedEntryIds.includes(entry.id)) };
    }

    if (options.allowPartial === true) {
        const raw = data?.app && typeof data.app === 'object' ? data.app : data;
        const returnedId = core_text.safeId(raw?.id, '');
        if (returnedId && returnedId !== planApp.id) throw core_text.safeUserError('App 标识与当前目录不符。', 'RMT_PHONE_EVIDENCE');
        if (!Array.isArray(raw?.entries) || raw.entries.length > 24) {
            throw core_text.safeUserError('App 返回的条目结构不完整；旧内容保留。', 'RMT_PHONE_EVIDENCE');
        }
        const candidates = raw.entries;
        const plannedIds = new Set(planApp.entries.map(entry => entry.id));
        const seenIds = new Set();
        for (const candidate of candidates) {
            const id = core_text.safeId(candidate?.id, '');
            if (!plannedIds.has(id) || seenIds.has(id)) {
                throw core_text.safeUserError('App 条目 ID 重复或不属于本次目录；旧内容保留。', 'RMT_PHONE_EVIDENCE');
            }
            seenIds.add(id);
        }
        const entries = planApp.entries.map(planned => {
            const candidate = candidates.find(entry => core_text.safeId(entry?.id, '') === planned.id);
            if (!candidate) { omittedEntryIds.push(planned.id); return null; }
            if (isUnavailablePhoneEntry(candidate)) return unavailablePhoneEntry(planned.id);
            try {
                // The exact production validator remains the only acceptance path.
                // A bad sibling has no authority to discard another validated item.
                return normalizePhoneDraftApp({ ...raw, entries: [candidate] }, { ...planApp, entries: [planned] },
                    memoryBank, deviceKind, sourceMemoryIds, { ...options, allowPartial: false }).entries[0];
            } catch { return unavailablePhoneEntry(planned.id); }
        }).filter(Boolean);
        if (!entries.some(entry => !isUnavailablePhoneEntry(entry))) {
            if (planApp.kind === 'chat') throw noPhoneConversation();
            throw core_text.safeUserError('本次没有可保存的新条目；旧内容保留，可以重试这些缺项。', 'RMT_PHONE_EVIDENCE');
        }
        return { id: planApp.id, label: planApp.label, kind: planApp.kind,
            ...(planApp.kind === 'chat' ? { ownerMembers: options.ownerMembers || [] } : {}),
            icon: normalizePhoneAppIcon(planApp.icon, planApp.kind, planApp.label),
            summary: phoneDisplayText(raw?.summary || planApp.summary, 1200, '', memoryBank), entries, omittedEntryIds };
    }
    const raw = validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds, options);
    const plannedIds = new Set(planApp.entries.map(item => item.id));
    const entries = (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 24).map((entry, index) => {
        const id = core_text.safeId(entry?.id, '');
        if (!plannedIds.has(id)) return null;
        if (isUnavailablePhoneEntry(entry)) return unavailablePhoneEntry(id);
        let basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
        let title = core_text.normalizeText(entry?.title, 100) || planApp.entries.find(item => item.id === id)?.title || `条目 ${index + 1}`;
        let meta = core_text.normalizeText(entry?.meta, 200);
        let preview = core_text.normalizeText(entry?.preview, 1200);
        let detail = core_text.normalizeText(entry?.detail, 5000);
        let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat', preserveOwnerNames: planApp.kind === 'chat' });
        basis = phoneEntryBasis(entry, planApp.kind, conversation, memoryBank, options);
        conversation = applyPhoneChatContract(conversation, memoryBank, { basis });
        let messages = conversation.messages;
        let fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
            label: core_text.normalizeText(field?.label, 100),
            value: core_text.normalizeText(field?.value, 1000),
        })).filter(field => field.label && field.value);
        let imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        const evidenceText = [title, meta, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
        let reference = basis === '记忆'
            ? core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1)
            : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        let sourceMemoryEvidence = basis === '记忆'
            ? normalizePhoneMemoryEvidence(entry, reference, memoryBank, options)
            : '';
        const sourceSettingEvidence = basis === '设定'
            ? normalizePhoneSettingEvidence(entry, planApp, conversation, evidenceText, options.controlledEvidence, options)
            : '';
        if (options.trustedStored !== true && basis === '设定' && !sourceSettingEvidence) basis = '推演';
        // A 推演 entry is ordinary device content inferred from persona (a reminder, a
        // draft, a mundane exchange). It needs no quote, but must not smuggle in a past
        // with {{user}}. Archive-driven increments may also contain ordinary current life.
        const legacyStored = options.trustedStored === true && entry?.narrativeVersion !== 1;
        if (basis === '记忆' && !legacyStored && options.trustedStored !== true) {
            const canonical = phoneReferencedMemoryText(reference, memoryBank);
            const memoryOk = reference.sourceMemoryIds.length && sourceMemoryEvidence
                && (!sourceMemoryIds || core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds))
                && phoneMemoryStructuredFactsSupported(planApp.kind, conversation, messages, fields, sourceMemoryEvidence, canonical);
            if (!memoryOk) {
                conversation = applyPhoneChatContract(conversation, memoryBank, { basis: '推演' });
                if (planApp.kind === 'chat' && conversation.userThread && conversation.messages.some(message => message.speakerRole === 'owner')) {
                    basis = '推演';
                    messages = conversation.messages;
                    reference = { sourceMemoryIds: [], sourceMemoryAnchor: '' };
                    sourceMemoryEvidence = '';
                } else {
                    return null;
                }
            } else {
                messages = sanitizePhoneMemoryMessageTimes(messages, sourceMemoryEvidence, canonical);
                title = core_worldPresentation.controlledEvidenceContains(sourceMemoryEvidence, title) ? title : `剧情摘录 ${index + 1}`;
                preview = sourceMemoryEvidence;
                detail = sourceMemoryEvidence;
                meta = '';
                imageCaption = '';
                if (!['chat', 'contacts'].includes(planApp.kind)) {
                    messages = [];
                    fields = [];
                }
            }
        }
        if (!legacyStored && basis !== '记忆' && !phoneInferredEntryAllowed(entry, planApp.kind, conversation, evidenceText, memoryBank, options)) return null;
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)) return null;
        return {
            id,
            title,
            meta,
            preview,
            detail,
            contactName: ['chat', 'contacts'].includes(planApp.kind) ? conversation.contactName : '',
            ...(planApp.kind === 'chat' ? { conversationMode: entry.conversationMode || (basis === '记忆' ? 'history' : 'daily') } : {}),
            messages,
            fields,
            imageCaption,
            basis,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            sourceMemoryEvidence,
            sourceSettingEvidence,
            narrativeVersion: legacyStored ? 0 : 1,
            legacyEvidenceUnverified: legacyStored || (options.trustedStored === true && entry?.legacyEvidenceUnverified === true),
        };
    }).filter(Boolean);
    if (entries.length !== planApp.entries.length) throw new Error(`App ${planApp.label} 续写缓存不完整：${entries.length}/${planApp.entries.length}。`);
    return {
        id: planApp.id,
        label: planApp.label,
        kind: planApp.kind,
        ...(planApp.kind === 'chat' ? { ownerMembers: options.ownerMembers || [] } : {}),
        icon: normalizePhoneAppIcon(planApp.icon, planApp.kind, planApp.label),
        summary: phoneDisplayText(raw?.summary || planApp.summary, 1200, '', memoryBank),
        entries,
        omittedEntryIds,
    };
}

export function projectPhoneProgress({ segments = [], memoryBank, previousSession = null, contentInputs = {}, frozenInputs = {}, operation = {} }) {
    const previous = contentInputs.previousSession ?? previousSession;
    const presentation = frozenInputs['presentation:phone'] || {};
    let plan = contentInputs.phoneDraft?.plan || null;
    let incremental = false;
    for (const segment of segments) {
        if (!segment.has('') || !/(?:^|:)(?:increment-)?plan$/.test(segment.slot || '')) continue;
        try {
            incremental = /:increment-plan$/.test(segment.slot);
            plan = incremental && previous ? normalizePhoneIncrementPlan(segment.value, previous)
                : normalizePhonePlan(segment.value, memoryBank, { worldPresentation: presentation.profile || null });
        } catch { /* A directory must pass its unchanged production contract. */ }
    }
    if (!plan && previous && operation.fillMissing === true) plan = { ...previous, apps: previous.apps || [] };
    if (!plan) return null;
    const accepted = new Map();
    const sourceIds = incremental ? core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode') : null;
    for (const segment of segments) {
        if (/(?:^|:)(?:increment-)?plan$/.test(segment.slot || '')) continue;
        const raw = segment.at?.('/app') || segment.value || {};
        const planApp = plan.apps.find(app => app.id === raw?.id);
        if (!planApp) continue;
        const rows = segment.items(segment.at?.('/app') ? '/app/entries' : '/entries');
        for (const row of rows) {
            const planned = planApp.entries.find(entry => entry.id === row?.id);
            if (!planned) continue;
            try {
                const app = normalizePhoneDraftApp({ ...raw, entries: [row] }, { ...planApp, entries: [planned] }, memoryBank, plan.deviceKind,
                    sourceIds, { controlledEvidence: presentation.settingEvidence || '', requireLifestyleContent: !incremental, allowPartial: false });
                const entry = app.entries[0];
                if (!entry || isUnavailablePhoneEntry(entry)) continue;
                const prior = accepted.get(app.id);
                if (prior) { if (!prior.entries.some(item => item.id === entry.id)) prior.entries.push(entry); }
                else accepted.set(app.id, { ...app, entries: [entry], omittedEntryIds: [] });
            } catch { /* One invalid sibling cannot hide a validated, closed entry. */ }
        }
    }
    if (!accepted.size) return null;
    const apps = [...accepted.values()];
    if (previous && incremental) {
        try { return mergePhoneIncremental(previous, apps, memoryBank, { controlledEvidence: presentation.settingEvidence || '' }).session; }
        catch { return null; }
    }
    const session = previous ? structuredClone(previous) : {
        ...structuredClone(plan), kind: core_constants.MODE.PHONE, ownerName: phoneConversationOwnerName(memoryBank),
        selectedAppId: apps[0].id, selectedEntryId: '', view: 'home', apps: [] };
    for (const app of apps) {
        const old = session.apps.find(item => item.id === app.id);
        if (old) {
            for (const entry of app.entries) {
                const index = old.entries.findIndex(item => item.id === entry.id);
                if (index < 0) old.entries.push(entry);
                else if (isUnavailablePhoneEntry(old.entries[index])) old.entries[index] = entry;
            }
        } else session.apps.push(app);
    }
    session.chatId = memoryBank.chatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
}

export async function generatePhoneWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const roomSession = core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: core_context.getChatId(context), memoryBank, clone: false });
    const resumeDraft = options.continueDraft === true ? core_cache.loadPhoneGenerationDraft(context, memoryBank) : null;
    if (resumeDraft?.unreadableCompletedApps?.length) throw core_text.safeUserError('已完成草稿的结构无法安全读取，原草稿保留，本次没有重新生成成功项。', 'RMT_PHONE_SOURCE_CHANGED');
    const presentationContext = options.presentationContext || {};
    const worldPresentation = resumeDraft?.plan?.worldPresentation || presentationContext.profile
        || core_worldPresentation.resolveWorldPresentation(presentationContext.contextEnvelope || '', memoryBank);
    const plan = resumeDraft?.plan || await generation_client.requestValidatedSegment(
        phonePlanPrompt(context, memoryBank, roomSession, worldPresentation),
        '私人终端 1/2 · 正在生成设备与 App 目录…',
        { maxTokens: 8000, temperatureCeiling: 0.35, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:plan`, mode: core_constants.MODE.PHONE, background: true },
        raw => normalizePhonePlan(raw, memoryBank, { worldPresentation, controlledEvidence: presentationContext.settingEvidence || '' }),
    );
    const completedById = new Map((resumeDraft?.completedApps || []).map(app => [app.id, app]));
    // Capture trusted old values from canonical storage, never from a provider's app IDs.
    const preservedApps = new Map((resumeDraft?.completedApps || [])
        .filter(app => app.entries.some(entry => entry.legacyEvidenceUnverified === true))
        .map(app => [app.id, structuredClone(app)]));
    const draftOptions = { archiveTarget: options.archiveTarget, stillCurrent: options.stillCurrent };
    const evidenceOptions = { controlledEvidence: presentationContext.settingEvidence || '', requireLifestyleContent: true, allowPartial: true };
    if (!resumeDraft && !await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [], '', '', origin, draftOptions)) {
        throw new Error('私人终端目录已经生成，但无法确认续写断点已安全保存；本次已停止，避免虚假提示可续写。');
    }
    const fillAppsNow = options.secondStep === true || !!resumeDraft || core_settings.getPluginSettings().autoSecondPass === true;
    if (!fillAppsNow) {
        const placeholders = plan.apps.map(app => ({
            ...app,
            entries: (Array.isArray(app.entries) ? app.entries : []).map(entry => unavailablePhoneEntry(entry.id)),
        }));
        const directory = normalizePhone({ ...plan, apps: placeholders }, memoryBank, { worldPresentation, trustedStored: true, directoryOnly: true });
        core_requestCoordinator.noteSecondStepOffer(origin, {
            label: '各应用正文', kind: 'phone-apps', mode: core_constants.MODE.PHONE, pageId: core_constants.MODE.PHONE,
        });
        return directory;
    }
    core_requestCoordinator.noteSecondStepOffer(origin, null);

    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        const completed = completedById.get(app.id);
        const missing = completed ? app.entries.filter(entry => !completed.omittedEntryIds?.includes(entry.id)
            && !completed.entries.some(item => item.id === entry.id && !isUnavailablePhoneEntry(item))) : app.entries;
        if (!missing.length) continue;
        const requestApp = app.kind === 'chat'
            ? phoneMissingThreadPlan({ ...app, entries: missing.map(entry => ({ ...entry, sourceStatus: 'unavailable' })) }, plan, memoryBank,
                { controlledEvidence: presentationContext.settingEvidence || '' })
            : { ...app, incremental: !!completed?.entries?.some(entry => !isUnavailablePhoneEntry(entry)), entries: missing };
        let lastError = null;
        try {
            if (!requestApp.entries.length) throw noPhoneConversation();
            // Keep the base request stable across reload/continuation. Transient failure
            // feedback belongs to the bounded retry, not to the saved segment identity.
            const normalizedApp = await generation_client.requestValidatedSegment(
                phoneAppPrompt(context, memoryBank, plan, requestApp)
                    + '\n需要真实历史/私密字段却没有来源的项目才用 unavailable；普通日常继续按人设演绎，不重做已完成的其他 App。',
                `私人终端 2/2 · ${index + 1}/${plan.apps.length} ${app.label}…`,
                { maxTokens: app.kind === 'chat' ? 8000 : app.entries.length >= 8 ? 7000 : 5000, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:app:${app.id}:${core_text.hashString(missing.map(entry => entry.id).join('\n'))}`, mode: core_constants.MODE.PHONE, background: true, segmentMaxAttempts: 2,
                    recoveryPhoneContract: phoneRecoveryContract(app.kind) },
                raw => {
                    try { return normalizePhoneDraftApp(raw, requestApp, memoryBank, plan.deviceKind, null, evidenceOptions); }
                    catch (error) {
                        error.repairHint = `本次只修正以下安全分类：${core_text.safeErrorSummary(error)}。需要真实历史/私密字段却没有来源的项目才用 unavailable；普通日常继续按人设演绎。`;
                        throw error;
                    }
                },
            );
            if (app.kind === 'chat') normalizedApp.omittedEntryIds = [...new Set([...(normalizedApp.omittedEntryIds || []), ...(requestApp.omittedEntryIds || [])])];
            completedById.set(app.id, completed ? mergePhoneMissingEntries(completed, normalizedApp) : normalizedApp);
            if (preservedApps.has(app.id)) preservedApps.set(app.id, structuredClone(completedById.get(app.id)));
            if (!await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()], '', '', origin, draftOptions)) {
                throw new Error('这个 App 已生成，但无法确认续写断点已安全保存；本次已停止。');
            }
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
            lastError = error;
        }
        if (lastError) {
            const detail = core_text.safeErrorSummary(lastError, 600);
            const failure = core_text.safeErrorDiagnostic(lastError);
            const draftSaved = await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()], app.id, detail, origin, { ...draftOptions, failure });
            if (draftSaved && ['RMT_PHONE_EVIDENCE', 'RMT_PHONE_NO_CONVERSATION'].includes(lastError?.code)) {
                // A complete but unusable App response is a local content failure, not
                // a broken provider connection. Keep its exact slots pending and let
                // other independent Apps produce useful content. Transport, truncated
                // JSON, cancellation, stale origins and storage failures still stop.
                if (!completed) completedById.set(app.id, { ...app,
                    entries: app.entries.map(entry => unavailablePhoneEntry(entry.id)) });
                if (!await core_cache.savePhoneGenerationDraft(context, memoryBank, plan,
                    [...completedById.values()], app.id, detail, origin, { ...draftOptions, failure })) {
                    throw core_text.safeUserError('无法确认已完成内容已保存，本次已停止。', 'RMT_PHONE_DRAFT_UNAVAILABLE');
                }
                continue;
            }
            const error = new Error(draftSaved
                ? `私人终端在 App“${app.label}”中断，已保留 ${phoneCompletionSummary({ plan, completedApps: [...completedById.values()] }).readableItems} 项可读内容。回到档案室的私人终端卡片，点击“继续生成”即可补齐缺项，不会重做成功内容。${detail ? `\n${detail}` : ''}`
                : `私人终端在 App“${app.label}”中断，且无法确认续写断点已安全保存；请不要依赖本次进度。${detail ? `\n${detail}` : ''}`);
            error.code = draftSaved ? 'RMT_PHONE_DRAFT_AVAILABLE' : 'RMT_PHONE_DRAFT_UNAVAILABLE';
            error.retryable = false;
            error.failure = failure;
            const progress = phoneCompletionSummary({ plan, completedApps: [...completedById.values()] });
            error.partialProgress = { completed: progress.completeApps, total: progress.totalApps,
                readableItems: progress.readableItems, totalItems: progress.totalItems };
            throw error;
        }
    }
    const details = plan.apps.map(app => completedById.get(app.id)).filter(Boolean);
    if (details.length !== plan.apps.length) {
        throw new Error(`私人终端续写结果不完整：${details.length}/${plan.apps.length} 个 App。`);
    }
    try {
        let normalized;
        try { normalized = normalizePhone({ ...plan, apps: details }, memoryBank, { worldPresentation, ...evidenceOptions, preservedApps }); }
        catch (error) {
            if (error?.code === 'RMT_PHONE_SOURCE_EMPTY') throw error;
            throw core_text.safeUserError('草稿来源发生变化。', 'RMT_PHONE_SOURCE_CHANGED');
        }
        if (details.some(app => {
            const retained = normalized.apps.find(candidate => candidate.id === app.id);
            return !retained || app.entries.some(entry => !retained.entries.some(candidate => candidate.id === entry.id));
        })) throw core_text.safeUserError('草稿来源发生变化。', 'RMT_PHONE_SOURCE_CHANGED');
        return normalized;
    } catch (error) {
        if (error?.code === 'RMT_PHONE_SOURCE_EMPTY') {
            // Empty directory placeholders are not completed content. An explicit
            // retry must reach the provider, not loop forever over an N/N draft.
            await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [], '', '', origin,
                { ...draftOptions, failure: core_text.safeErrorDiagnostic(error) });
        } else if (error?.code === 'RMT_PHONE_SOURCE_CHANGED') {
            await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, details, '', '', origin,
                { ...draftOptions, failure: core_text.safeErrorDiagnostic(error) });
        }
        throw error;
    }
}

export function phoneHasMissingEntries(session) {
    return !!session?.apps?.some(app => {
        const omitted = new Set(app.omittedEntryIds || []);
        return app.entries?.some(entry => isUnavailablePhoneEntry(entry) && !omitted.has(entry.id));
    });
}

export function phoneCompletionSummary(value) {
    const planned = Array.isArray(value?.plan?.apps) ? value.plan.apps : (Array.isArray(value?.apps) ? value.apps : []);
    const completed = Array.isArray(value?.completedApps) ? value.completedApps : (Array.isArray(value?.apps) ? value.apps : []);
    let readableItems = 0, totalItems = 0, missingItems = 0, omittedItems = 0, completeApps = 0;
    for (const app of planned) {
        const entries = Array.isArray(app?.entries) ? app.entries : [];
        const saved = completed.find(item => item.id === app.id);
        const readable = entries.filter(entry => saved?.entries?.some(item => item.id === entry.id && !isUnavailablePhoneEntry(item))).length;
        const omitted = value?.plan ? entries.filter(entry => !saved?.entries?.some(item => item.id === entry.id)
            && saved?.omittedEntryIds?.includes(entry.id)).length : 0;
        const pending = entries.length - readable - omitted;
        totalItems += entries.length; readableItems += readable; missingItems += pending;
        omittedItems += value?.plan ? omitted : (saved?.omittedEntryIds?.length || 0);
        if (saved && !pending) completeApps++;
    }
    return { readableItems, totalItems, missingItems, omittedItems,
        completeApps, totalApps: planned.length, partial: readableItems > 0 && missingItems > 0 };
}

export function mergePhoneMissingEntries(previous, fresh) {
    const merged = structuredClone(previous);
    merged.entries = (previous.entries || []).filter(entry => !isUnavailablePhoneEntry(entry) || !fresh.omittedEntryIds?.includes(entry.id)).map(entry => {
        const replacement = fresh.entries?.find(item => item.id === entry.id);
        return isUnavailablePhoneEntry(entry) && replacement && !isUnavailablePhoneEntry(replacement)
            ? structuredClone(replacement) : structuredClone(entry);
    });
    if (previous.kind === 'chat') {
        merged.ownerMembers = structuredClone(fresh.ownerMembers || previous.ownerMembers || []);
        merged.omittedEntryIds = [...new Set([...(previous.omittedEntryIds || []), ...(fresh.omittedEntryIds || [])])];
    }
    return merged;
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
        story.userDisplay,
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

export async function generatePhoneMissingWithRepair(context, memoryBank, origin, taskKey, previous, options = {}) {
    let session = structuredClone(previous);
    const presentation = options.presentationContext || {};
    let acceptedAny = false, contentFailure = null;
    for (const app of previous.apps || []) {
        const entries = (app.entries || []).filter(isUnavailablePhoneEntry);
        if (!entries.length) continue;
        const planApp = app.kind === 'chat'
            ? phoneMissingThreadPlan(app, previous, memoryBank, { controlledEvidence: presentation.settingEvidence || '', context })
            : { ...app, incremental: true, entries: entries.map(item => ({
                id: item.id,
                title: isPhonePlaceholderTitle(item.title)
                    ? `${phoneStory(memoryBank, context).ownerNames[0] || '主人'}的${app.label}`
                    : item.title,
                meta: item.meta || '日常',
            })) };
        if (!planApp.entries.length) { contentFailure = noPhoneConversation(); continue; }
        let fresh;
        try { fresh = await generation_client.requestValidatedSegment(
            phoneAppPrompt(context, memoryBank, session, planApp),
            `正在补齐「${app.label}」的 ${planApp.entries.length} 项内容…`,
            { context, contextEnvelope: presentation.contextEnvelope, origin, taskKey: `${taskKey}:missing:${app.id}:${core_text.hashString(planApp.entries.map(entry => `${entry.id}\t${entry.title}\t${entry.contactName || ''}`).join('\n'))}`,
                mode: core_constants.MODE.PHONE, maxTokens: 8000, background: true,
                recoveryPhoneContract: phoneRecoveryContract(app.kind) },
            raw => normalizePhoneDraftApp(raw, planApp, memoryBank, session.deviceKind, null,
                { controlledEvidence: presentation.settingEvidence || '', requireLifestyleContent: true, allowPartial: true }),
        ); } catch (error) {
            if (!['RMT_PHONE_EVIDENCE', 'RMT_PHONE_NO_CONVERSATION'].includes(error?.code)) throw error;
            contentFailure = error;
            continue;
        }
        if (app.kind === 'chat') fresh.omittedEntryIds = [...new Set([...(fresh.omittedEntryIds || []), ...(planApp.omittedEntryIds || [])])];
        session.apps = session.apps.map(item => item.id === app.id ? mergePhoneMissingEntries(item, fresh) : item);
        if (options.savePartial && await options.savePartial(session) === false) {
            throw core_text.safeUserError('无法确认补齐内容已保存，本次已停止。', 'RMT_PHONE_DRAFT_UNAVAILABLE');
        }
        acceptedAny = true;
    }
    if (!acceptedAny && contentFailure) throw contentFailure;
    return session;
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
        worldPresentation: safePrevious.worldPresentation || null,
        lockText: safePrevious.lockText,
        liveStates: safePrevious.liveStates,
        apps,
    };
}

export function phoneEntryKey(appKind, entry) {
    if (isUnavailablePhoneEntry(entry)) return `${appKind}|pending|${core_text.safeId(entry?.id, '')}`;
    const ids = core_text.cleanArray(entry?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(entry?.sourceMemoryAnchor, 140);
    return ids && anchor
        ? `${appKind}|memory|${ids}|${anchor}`
        : `${appKind}|${core_incremental.normalizedContentKey(entry?.title, 120)}|${core_incremental.normalizedContentKey(entry?.meta, 200)}`;
}

export function mergePhoneIncremental(previous, patches, memoryBank, options = {}) {
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
    const normalized = normalizePhone(merged, memoryBank, {
        worldPresentation: safePrevious.worldPresentation || null,
        controlledEvidence: options.controlledEvidence || '',
        // Existing rows came from the already-persisted session; every incoming patch has already
        // passed normalizePhoneDraftApp. Avoid reclassifying old rows as new untrusted output.
        trustedStored: true,
    });
    normalized.selectedAppId = safePrevious.selectedAppId || normalized.selectedAppId;
    normalized.selectedEntryId = safePrevious.selectedEntryId || '';
    normalized.view = PHONE_VIEW_VALUES.has(safePrevious.view) ? safePrevious.view : 'home';
    return { session: normalized, added };
}

export async function generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previous, options = {}) {
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const presentationContext = options.presentationContext || {};
    const plan = await generation_client.requestValidatedSegment(
        phoneIncrementPlanPrompt(context, memoryBank, previous, sourceMemoryIds),
        '私人终端 · 正在规划新增条目…',
        { maxTokens: 4500, temperatureCeiling: 0.35, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:increment-plan`, mode: core_constants.MODE.PHONE, background: true },
        raw => normalizePhoneIncrementPlan(raw, previous),
    );
    if (!plan.apps.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const patches = [];
    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        const patch = await generation_client.requestValidatedSegment(
            phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds),
            `私人终端 · 新增详情 ${index + 1}/${plan.apps.length} ${app.label}…`,
            { maxTokens: app.kind === 'chat' ? 8000 : 5000, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:increment-app:${app.id}`, mode: core_constants.MODE.PHONE, background: true, segmentMaxAttempts: 1,
                recoveryPhoneContract: phoneRecoveryContract(app.kind) },
            raw => normalizePhoneDraftApp(raw, app, memoryBank, plan.deviceKind, sourceMemoryIds, {
                controlledEvidence: presentationContext.settingEvidence || '',
                allowPartial: true,
            }),
        );
        patches.push(patch);
    }
    const { session, added } = mergePhoneIncremental(previous, patches, memoryBank, {
        controlledEvidence: presentationContext.settingEvidence || '',
    });
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function normalizePhone(data, memoryBank, { worldPresentation = null, controlledEvidence = '', trustedStored = false, preservedApps = null, directoryOnly = false } = {}) {
    const controlledProfile = worldPresentation || data?.worldPresentation || null;
    let requestedDeviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(requestedDeviceName)
        ? 'watch'
        : /(?:传讯|通讯器|communicator)/i.test(requestedDeviceName)
            ? 'communicator'
            : /(?:手札|卷册|书信|信笺|账簿|册页|folio|ledger|scroll|letters?)/i.test(requestedDeviceName)
                ? 'folio'
                : /(?:魔导|水晶|灵石|符文|秘仪|relic|crystal|arcane)/i.test(requestedDeviceName)
                    ? 'relic'
                    : /(?:终端|terminal)/i.test(requestedDeviceName)
                        ? 'terminal'
                        : 'phone';
    const allowedDevices = new Set(core_text.cleanArray(controlledProfile?.allowedDevices, 12, 40));
    const controlledDefault = core_constants.PHONE_DEVICE_KINDS.has(controlledProfile?.defaultDevice) ? controlledProfile.defaultDevice : 'neutral';
    const deviceKind = controlledProfile
        ? (allowedDevices.has(requestedKind) ? requestedKind : controlledDefault)
        : (core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind);
    if (!trustedStored) requestedDeviceName = PHONE_DEVICE_LABEL[deviceKind] || '私人记录载体';
    else if (deviceKind === 'neutral') requestedDeviceName = '私人记录载体';
    const limits = phoneAppLimits(deviceKind);
    const rawApps = Array.isArray(data?.apps) ? data.apps : [];
    const usedAppIds = new Set();
    const apps = rawApps.slice(0, limits.maxApps).map((app, appIndex) => {
        if (isExcludedPhoneApp(app)) return null;
        const appId = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(appId) || usedAppIds.has(appId)) return null;
        usedAppIds.add(appId);
        if (preservedApps instanceof Map && preservedApps.has(appId)) {
            return normalizePhone({ ...data, apps: [structuredClone(preservedApps.get(appId))] }, memoryBank,
                { worldPresentation, controlledEvidence, trustedStored: true }).apps[0];
        }
        const label = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const kind = normalizePhoneAppKind(app?.kind, label);
        const usedEntryIds = new Set();
        const chatOptions = { controlledEvidence, trustedStored, ownerMembers: app.ownerMembers || [] };
        const entries = (Array.isArray(app?.entries) ? app.entries : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((rawEntry, index) => {
            const entry = kind === 'chat' ? normalizePhoneChatEntry(rawEntry, memoryBank, chatOptions) : rawEntry;
            const entryId = core_text.safeId(entry?.id, `${appId}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) return null;
            usedEntryIds.add(entryId);
            if (isUnavailablePhoneEntry(entry)) return unavailablePhoneEntry(entryId);
            let basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
            let title = core_text.normalizeText(entry?.title, 100) || `条目 ${index + 1}`;
            let meta = core_text.normalizeText(entry?.meta, 200);
            let preview = core_text.normalizeText(entry?.preview, 1200);
            let detail = core_text.normalizeText(entry?.detail, 5000);
            let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: false, preserveOwnerNames: kind === 'chat' });
            basis = phoneEntryBasis(entry, kind, conversation, memoryBank, chatOptions);
            conversation = applyPhoneChatContract(conversation, memoryBank, { basis });
            let messages = conversation.messages;
            let fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
                label: core_text.normalizeText(field?.label, 100),
                value: core_text.normalizeText(field?.value, 1000),
            })).filter(field => field.label && field.value);
            let imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
            const evidenceText = [title, meta, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
            const reference = basis === '记忆' ? core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1) : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
            const sourceMemoryEvidence = basis === '记忆'
                ? normalizePhoneMemoryEvidence(entry, reference, memoryBank, { trustedStored })
                : '';
            const sourceSettingEvidence = basis === '设定'
                ? normalizePhoneSettingEvidence(entry, { kind }, conversation, evidenceText, controlledEvidence, { trustedStored })
                : '';
            if (!trustedStored && basis === '设定' && !sourceSettingEvidence) basis = '推演';
            if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)
                || (!trustedStored && basis === '记忆' && (!reference.sourceMemoryIds.length || !sourceMemoryEvidence))) return null;
            if (!trustedStored && basis !== '记忆'
                && !phoneInferredEntryAllowed(entry, kind, conversation, evidenceText, memoryBank, chatOptions)) return null;
            if (basis === '记忆' && !trustedStored) {
                const canonical = phoneReferencedMemoryText(reference, memoryBank);
                if (!phoneMemoryStructuredFactsSupported(kind, conversation, messages, fields, sourceMemoryEvidence, canonical)) return null;
                if (kind === 'chat') assertPhoneConversation(messages, { userThread: conversation.userThread && basis !== '记忆' });
                messages = sanitizePhoneMemoryMessageTimes(messages, sourceMemoryEvidence, canonical);
                title = core_worldPresentation.controlledEvidenceContains(sourceMemoryEvidence, title) ? title : `剧情摘录 ${index + 1}`;
                preview = sourceMemoryEvidence;
                detail = sourceMemoryEvidence;
                meta = '';
                imageCaption = '';
                if (!['chat', 'contacts'].includes(kind)) {
                    messages = [];
                    fields = [];
                }
            }
            return {
                id: entryId,
                title,
                meta,
                preview,
                detail,
                contactName: ['chat', 'contacts'].includes(kind) ? conversation.contactName : '',
                ...(kind === 'chat' ? { conversationMode: entry.conversationMode || (basis === '记忆' ? 'history' : 'daily') } : {}),
                messages,
                fields,
                imageCaption,
                basis,
                sourceMemoryIds: reference.sourceMemoryIds,
                sourceMemoryAnchor: reference.sourceMemoryAnchor,
                sourceMemoryEvidence,
                sourceSettingEvidence,
                narrativeVersion: trustedStored ? (entry?.narrativeVersion === 1 ? 1 : 0) : 1,
                legacyEvidenceUnverified: trustedStored && entry?.legacyEvidenceUnverified === true,
            };
        }).filter(Boolean);
        const safeLabel = trustedStored ? label : phoneDisplayText(label, 60, PHONE_KIND_LABEL[kind] || `分区 ${appIndex + 1}`, memoryBank);
        const rawSummary = core_text.normalizeText(app?.summary, 1200);
        const safeSummary = trustedStored ? rawSummary : phoneDisplayText(rawSummary, 1200, '', memoryBank);
        return {
            id: appId,
            label: safeLabel,
            kind,
            ...(kind === 'chat' ? { ownerMembers: app.ownerMembers || [] } : {}),
            icon: normalizePhoneAppIcon(app?.icon, kind, safeLabel),
            summary: safeSummary,
            entries,
            omittedEntryIds: core_text.cleanArray(app?.omittedEntryIds, 24, 80).filter(id => !entries.some(entry => entry.id === id)),
            legacyEvidenceUnverified: entries.some(entry => entry.legacyEvidenceUnverified === true),
        };
    }).filter(app => app && app.entries.length >= 1);

    if (apps.length < limits.minApps) throw new Error(`“他的私人终端”分区不足：得到 ${apps.length} 个，当前设备至少需要 ${limits.minApps} 个。`);
    const totalEntries = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (totalEntries < limits.minEntries) throw new Error(`“他的私人终端”内容过少：只有 ${totalEntries} 个可读条目，至少需要 ${limits.minEntries} 个。`);
    if (!directoryOnly && !apps.some(app => app.entries.some(entry => entry.sourceStatus !== 'unavailable'))) {
        throw core_text.safeUserError('目录没有可核实原文。', 'RMT_PHONE_SOURCE_EMPTY');
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
            lockText: trustedStored ? (core_text.normalizeText(rawState?.lockText, 400) || core_text.normalizeText(data?.lockText, 400) || 'PRIVATE') : phoneDisplayText(rawState?.lockText || data?.lockText, 400, 'PRIVATE', memoryBank),
            statusLine: trustedStored ? core_text.normalizeText(rawState?.statusLine, 500) : phoneDisplayText(rawState?.statusLine, 500, '', memoryBank),
            badgeCounts: badges,
        };
    }
    return {
        kind: core_constants.MODE.PHONE,
        title: trustedStored ? (core_text.normalizeText(data?.title, 100) || '他的私人终端') : '他的私人终端',
        ownerName: phoneConversationOwnerName(memoryBank),
        deviceName: requestedDeviceName,
        deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        worldPresentation: controlledProfile ? structuredClone(controlledProfile) : null,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText: trustedStored ? core_text.normalizeText(data?.lockText, 400) : phoneDisplayText(data?.lockText, 400, 'PRIVATE', memoryBank),
        liveStates,
        apps,
        legacyEvidenceUnverifiedCount: apps.reduce(
            (total, app) => total + app.entries.filter(entry => entry.legacyEvidenceUnverified === true).length,
            0,
        ),
        selectedAppId: apps[0].id,
        selectedEntryId: '',
        view: 'home',
    };
}
