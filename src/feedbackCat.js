import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles, eventSource, event_types } from '../../../../../script.js';

const FEEDBACK_STORAGE_KEY = 'rabbit_mirror_theater:feedback_cat:v1';
const FEEDBACK_PENDING_KEY = 'rabbit_mirror_theater:feedback_cat_pending:v2';
const FEEDBACK_METADATA_KEY = 'rabbit_mirror_theater_feedback_cat_v2';
const FEEDBACK_PROMPT_KEY = 'rabbit_mirror_theater:feedback_cat_prompt';
const RUNTIME_VERSION = '1.4.30.12';
const VALID_ROUNDS = new Set([1, 3, 10]);
const VALID_TYPES = new Set(['color', 'structure', 'overall', 'interaction', 'language', 'custom']);

export const FEEDBACK_CAT_TYPES = Object.freeze({
    color: '配色不喜欢',
    structure: '结构太模板',
    overall: '整体不好看',
    interaction: '交互太简单',
    language: '一直说外语',
    custom: '我要亲自骂',
});

function normalizeFeedbackTypes(value) {
    const source = Array.isArray(value?.types)
        ? value.types
        : Array.isArray(value)
            ? value
            : value?.type
                ? [value.type]
                : typeof value === 'string'
                    ? [value]
                    : [];
    return [...new Set(source.map(item => String(item || '')).filter(item => VALID_TYPES.has(item)))];
}

function feedbackTypeLabels(value) {
    return normalizeFeedbackTypes(value).map(type => FEEDBACK_CAT_TYPES[type] || type);
}

function clone(value) {
    if (!value || typeof value !== 'object') return value;
    try {
        return typeof structuredClone === 'function'
            ? structuredClone(value)
            : JSON.parse(JSON.stringify(value));
    } catch {
        return { ...value };
    }
}

function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function getContextSafe() {
    try {
        return globalThis.SillyTavern?.getContext?.() || {};
    } catch {
        return {};
    }
}

function firstNonEmpty(values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function getCurrentFeedbackChatIdentity(chatOverride = null) {
    const context = getContextSafe();
    const chat = Array.isArray(chatOverride)
        ? chatOverride
        : Array.isArray(context?.chat)
            ? context.chat
            : Array.isArray(globalThis.chat)
                ? globalThis.chat
                : [];
    const metadata = context?.chatMetadata || globalThis.chat_metadata || {};
    const chatId = firstNonEmpty([
        context?.chatId,
        context?.chat_id,
        metadata?.chat_id,
        metadata?.file_name,
        metadata?.name,
    ]);
    const groupId = firstNonEmpty([context?.groupId, context?.group_id, globalThis.selected_group]);
    const characterId = firstNonEmpty([
        context?.characterId,
        context?.character_id,
        context?.character?.avatar,
        context?.characterName,
        globalThis.this_chid,
    ]);
    const firstMessage = chat[0] || {};
    const seed = firstNonEmpty([
        firstMessage?.send_date,
        firstMessage?.name,
        String(firstMessage?.mes || '').slice(0, 160),
        globalThis.location?.pathname,
    ]);
    const key = chatId
        ? `chat:${chatId}`
        : groupId
            ? `group:${groupId}:${hashText(seed)}`
            : characterId
                ? `character:${characterId}:${hashText(seed)}`
                : `fallback:${hashText(seed || 'unknown-chat')}`;
    return { key, chat, chatId, groupId, characterId, context, metadata };
}

function emptyState() {
    return { version: 2, active: null, lastReceipt: null };
}

function readLegacyStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '{}');
        if (parsed && typeof parsed === 'object' && parsed.chats && typeof parsed.chats === 'object') return parsed;
    } catch {
        // Fall through to a fresh legacy store.
    }
    return { version: 1, chats: {} };
}

function writeLegacyStore(store) {
    try {
        localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(store));
        return true;
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store feedback cat fallback state:', error);
        return false;
    }
}

function saveMetadataSoon(context) {
    try {
        const result = context?.saveMetadata?.();
        if (result && typeof result.catch === 'function') {
            result.catch(error => console.warn('[RabbitMirror] Failed to save feedback cat chat metadata:', error));
        }
    } catch (error) {
        console.warn('[RabbitMirror] Failed to save feedback cat chat metadata:', error);
    }
}

function normalizeState(value) {
    if (!value || typeof value !== 'object') return emptyState();
    return {
        version: 2,
        active: value.active && typeof value.active === 'object' ? clone(value.active) : null,
        lastReceipt: value.lastReceipt && typeof value.lastReceipt === 'object' ? clone(value.lastReceipt) : null,
    };
}

function readCurrentState(chatOverride = null) {
    const identity = getCurrentFeedbackChatIdentity(chatOverride);
    const metadataState = identity.metadata?.[FEEDBACK_METADATA_KEY];
    if (metadataState && typeof metadataState === 'object') {
        return { state: normalizeState(metadataState), identity, source: 'chatMetadata' };
    }

    const legacy = readLegacyStore();
    const oldRecord = legacy.chats[identity.key];
    const state = emptyState();
    if (oldRecord && typeof oldRecord === 'object') {
        state.active = clone(oldRecord);
        if (identity.metadata && typeof identity.metadata === 'object') {
            identity.metadata[FEEDBACK_METADATA_KEY] = clone(state);
            saveMetadataSoon(identity.context);
        }
    }
    return { state, identity, source: oldRecord ? 'localStorage-migrated' : 'empty' };
}

function writeCurrentState(state, chatOverride = null) {
    const identity = getCurrentFeedbackChatIdentity(chatOverride);
    const normalized = normalizeState(state);
    let metadataWritten = false;
    if (identity.metadata && typeof identity.metadata === 'object') {
        identity.metadata[FEEDBACK_METADATA_KEY] = clone(normalized);
        saveMetadataSoon(identity.context);
        metadataWritten = true;
    }

    const legacy = readLegacyStore();
    if (normalized.active) legacy.chats[identity.key] = clone(normalized.active);
    else delete legacy.chats[identity.key];
    const fallbackWritten = writeLegacyStore(legacy);
    return { identity, metadataWritten, fallbackWritten };
}

function sanitizeCustomFeedback(value, maxLength = 400) {
    let text = String(value ?? '');
    if (typeof text.normalize === 'function') text = text.normalize('NFC');
    return text
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\r\n?/g, '\n')
        .trim()
        .slice(0, Math.max(1, Number(maxLength) || 400));
}

function sanitizeFingerprint(value) {
    if (!value || typeof value !== 'object') return null;
    const palette = value.paletteFingerprint && typeof value.paletteFingerprint === 'object'
        ? {
            brightness: String(value.paletteFingerprint.brightness || '').slice(0, 16),
            hueFamily: String(value.paletteFingerprint.hueFamily || '').slice(0, 16),
            saturation: String(value.paletteFingerprint.saturation || '').slice(0, 16),
            temperature: String(value.paletteFingerprint.temperature || '').slice(0, 16),
            confidence: Number(value.paletteFingerprint.confidence || 0),
        }
        : null;
    const riskFlags = Array.isArray(value.riskFlags)
        ? value.riskFlags.map(item => String(item || '').slice(0, 48)).filter(Boolean).slice(0, 12)
        : [];
    const signature = String(value.signature || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    const skeleton = String(value.skeleton || '').replace(/\s+/g, ' ').trim().slice(0, 340);
    if (!palette && !riskFlags.length && !signature && !skeleton) return null;
    return { paletteFingerprint: palette, riskFlags, signature, skeleton };
}

function paletteSummary(fingerprint) {
    const palette = fingerprint?.paletteFingerprint;
    if (!palette) return '';
    const brightnessMap = { dark: '低明度', mid: '中明度', light: '高明度' };
    const saturationMap = { low: '低彩度', medium: '中彩度', high: '高彩度' };
    const temperatureMap = { warm: '偏暖', cool: '偏冷', neutral: '冷暖中性' };
    const hueMap = {
        neutral: '中性色', red: '红色家族', orange: '橙色家族', yellow: '黄色家族',
        green: '绿色家族', cyan: '青色家族', blue: '蓝色家族', purple: '紫色家族', pink: '粉色家族',
    };
    const parts = [
        brightnessMap[palette.brightness] || '',
        saturationMap[palette.saturation] || '',
        hueMap[palette.hueFamily] || '',
        temperatureMap[palette.temperature] || '',
    ].filter(Boolean);
    return parts.join('、');
}

function feedbackSourceSummary(feedback, types) {
    const fingerprint = feedback?.sourceFingerprint;
    if (!fingerprint) return '';
    const lines = [];
    if (types.some(type => type === 'color' || type === 'overall')) {
        const palette = paletteSummary(fingerprint);
        if (palette) lines.push(`配色摘要：${palette}。`);
    }
    if (types.some(type => type === 'structure' || type === 'overall') && fingerprint.skeleton) {
        lines.push(`结构摘要：${fingerprint.skeleton}`);
    }
    if (types.includes('interaction') && Array.isArray(fingerprint.riskFlags) && fingerprint.riskFlags.length) {
        lines.push(`交互／结构风险：${fingerprint.riskFlags.join('、')}。`);
    }
    return lines.length
        ? `
插件从被反馈作品的最终渲染结果中提取到以下摘要；仅用于帮助避开原作品，不得当作固定替代模板：
${lines.map(line => `- ${line}`).join('\n')}`
        : '';
}

export function getActiveFeedbackForCurrentChat(chatOverride = null) {
    const { state, identity, source } = readCurrentState(chatOverride);
    const record = state.active;
    if (!record || !normalizeFeedbackTypes(record).length || Number(record.remainingRounds || 0) <= 0) return null;
    return clone({ ...record, chatKey: identity.key, storageSource: source });
}

export function getFeedbackCatLastReceiptForCurrentChat(chatOverride = null) {
    const { state, identity } = readCurrentState(chatOverride);
    return state.lastReceipt ? clone({ ...state.lastReceipt, chatKey: identity.key }) : null;
}

export function setActiveFeedbackForCurrentChat({
    type,
    types = null,
    customText = '',
    rounds = 1,
    sourceMessageId = -1,
    sourceSwipeId = -1,
    sourceFingerprint = null,
} = {}) {
    const normalizedTypes = normalizeFeedbackTypes(Array.isArray(types) ? types : [type]);
    const normalizedRounds = Number(rounds);
    if (!normalizedTypes.length) throw new Error('至少选择一项挨打猫反馈');
    if (!VALID_ROUNDS.has(normalizedRounds)) throw new Error('未知的挨打猫影响范围');
    const cleanedCustomText = normalizedTypes.includes('custom') ? sanitizeCustomFeedback(customText) : '';
    if (normalizedTypes.includes('custom') && !cleanedCustomText) throw new Error('请先输入其他反馈内容');

    const { state, identity } = readCurrentState();
    const now = Date.now();
    const record = {
        id: `rmfc-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        type: normalizedTypes[0],
        types: normalizedTypes,
        label: feedbackTypeLabels(normalizedTypes).join('＋'),
        customText: cleanedCustomText,
        totalRounds: normalizedRounds,
        remainingRounds: normalizedRounds,
        sourceMessageId: Number.isInteger(Number(sourceMessageId)) ? Number(sourceMessageId) : -1,
        sourceSwipeId: Number.isInteger(Number(sourceSwipeId)) ? Number(sourceSwipeId) : -1,
        sourceFingerprint: sanitizeFingerprint(sourceFingerprint),
        delivery: {
            status: 'waiting',
            savedAt: now,
            runtimeVersion: RUNTIME_VERSION,
            storage: identity.metadata && typeof identity.metadata === 'object' ? 'chatMetadata+fallback' : 'localStorage-fallback',
        },
        createdAt: now,
        updatedAt: now,
    };
    state.active = record;
    writeCurrentState(state);
    syncFeedbackCatExtensionPrompt(record);
    try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
    return clone({ ...record, chatKey: identity.key });
}

export function clearActiveFeedbackForCurrentChat() {
    const { state } = readCurrentState();
    state.active = null;
    writeCurrentState(state);
    clearFeedbackCatExtensionPrompt();
    try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
}

function presetFeedbackInstruction(type) {
    if (type === 'color') {
        return '用户不满意被反馈兔子镜的配色。本轮须重新推导主承载面、文字、强调、边界与光影之间的完整色彩关系；不得回落到相近的明度、彩度、色相倾向和强调逻辑，不得只替换背景颜色，也不得机械固定成另一套替代色系。';
    }
    if (type === 'structure') {
        return '用户认为被反馈兔子镜的视觉结构过于模板化。本轮须从当前展现形式本体重新组织空间、层级、边界与信息关系；不得沿用相近的居中容器、卡片分区、规则网格或装饰骨架，也不得机械改用另一套固定模板。';
    }
    if (type === 'overall') {
        return '用户不满意被反馈兔子镜的整体审美。本轮须依据自身展现形式重新推导材质、空间、光源、布局、配色、细节与视觉主次；不得沿用相近的整体视觉语法，也不得仅通过换色、换装饰或局部微调敷衍处理。';
    }
    if (type === 'interaction') {
        return '用户认为被反馈兔子镜的交互过于简单。本轮仅在展现形式本身适合交互时增强交互：建立真实目标、明确操作、可识别且可保持的状态变化、与操作对应的反馈，以及继续推进、组合、切换或返回的可能；不得只增加无意义按钮、装饰性点击或一次性显隐，也不得为了交互破坏展现形式本体。';
    }
    if (type === 'language') {
        return '用户不满意兔子镜反复出现不必要的外语。本轮所有面向用户可见的标题、按钮、标签、状态、提示、说明、角标、装饰文字、占位文本与拟态系统词均须使用当前对话的主要语言。禁止使用英文标题、英文大写标签、英文状态词、英文装饰词或用英文制造界面感；正文中原本存在且确有必要保留的外语、专有名词，以及 HTML/CSS 的标签、属性、class、id 和代码标识不受此限制。输出前必须逐项检查最终可见文字，将不必要外语替换为当前对话主要语言。';
    }
    return '';
}

export function buildFeedbackCatPrompt(feedback) {
    const types = normalizeFeedbackTypes(feedback);
    if (!feedback || !types.length || Number(feedback.remainingRounds || 0) <= 0) return '';
    const instructions = [];
    for (const type of types) {
        if (type === 'custom') continue;
        const instruction = presetFeedbackInstruction(type);
        if (instruction) instructions.push(instruction);
    }
    if (types.includes('custom')) {
        const original = sanitizeCustomFeedback(feedback.customText);
        if (!original) return '';
        instructions.push(`用户补充原话：${JSON.stringify(original)}
仅落实其中与兔子镜的视觉、排版、材质、配色、动效、可见文字或交互直接相关的要求；不得擅自扩写或替换为固定风格。`);
    }
    if (!instructions.length) return '';
    const labels = feedbackTypeLabels(types).join('＋');
    const sourceSummary = feedbackSourceSummary(feedback, types);
    return String.raw`【挨打猫·用户已选硬约束】
已选：${labels}。下列每一项都必须在最终兔子镜中有可辨认的落实结果；漏掉任一项即不合格。${sourceSummary}
${instructions.map((item, index) => `${index + 1}. ${item}`).join('\n')}
多项必须协调落实，不得只处理最容易的一项、用同一处表面改动冒充多项，或为满足一项明显恶化另一项。
反馈只调整其明确涉及的视觉、文字或交互关系，不得改变正文含义、必要功能、展现形式本体与固定输出格式；不得把反馈说明、“挨打猫”或执行过程显示在正文或成品中。无需解释，直接落实。`;
}

export function buildFeedbackCatFinalCheck(feedback) {
    const types = normalizeFeedbackTypes(feedback);
    if (!feedback || !types.length || Number(feedback.remainingRounds || 0) <= 0) return '';
    const labels = feedbackTypeLabels(types).join('＋');
    return String.raw`【挨打猫交付验收】
已选：${labels}。输出前逐项对照上方编号；任一项尚无可辨认结果，先修正再输出。不得在成品中显示反馈说明或本检查。`;
}

export function syncFeedbackCatExtensionPrompt(feedback = getActiveFeedbackForCurrentChat()) {
    const prompt = buildFeedbackCatPrompt(feedback);
    try {
        setExtensionPrompt(
            FEEDBACK_PROMPT_KEY,
            prompt,
            extension_prompt_types.IN_CHAT,
            0,
            false,
            extension_prompt_roles.SYSTEM,
        );
        return { ok: true, prompt, promptHash: hashText(prompt), chars: prompt.length };
    } catch (error) {
        console.warn('[RabbitMirror] Failed to sync feedback cat extension prompt:', error);
        return { ok: false, prompt: '', promptHash: '', chars: 0, error };
    }
}

export function clearFeedbackCatExtensionPrompt() {
    try {
        setExtensionPrompt(
            FEEDBACK_PROMPT_KEY,
            '',
            extension_prompt_types.IN_CHAT,
            0,
            false,
            extension_prompt_roles.SYSTEM,
        );
        return true;
    } catch (error) {
        console.warn('[RabbitMirror] Failed to clear feedback cat extension prompt:', error);
        return false;
    }
}

function latestAssistantSnapshot(chat) {
    if (!Array.isArray(chat)) return { hash: '', index: -1, swipeId: -1, swipeCount: 0 };
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message?.is_user && typeof message?.mes === 'string') {
            return {
                hash: hashText(message.mes),
                index,
                swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : -1,
                swipeCount: Array.isArray(message?.swipes) ? message.swipes.length : 0,
            };
        }
    }
    return { hash: '', index: -1, swipeId: -1, swipeCount: 0 };
}

export function markFeedbackCatInjected(feedback, generationType = 'normal', feedbackPrompt = '') {
    if (!feedback?.id) return false;
    const { state, identity } = readCurrentState();
    const record = state.active;
    if (!record || record.id !== feedback.id) return false;
    if (feedback.chatKey && feedback.chatKey !== identity.key) return false;

    const previous = latestAssistantSnapshot(identity.chat);
    const now = Date.now();
    const prompt = feedbackPrompt || buildFeedbackCatPrompt(feedback);
    const pending = {
        feedbackId: feedback.id,
        chatKey: identity.key,
        injectedAt: now,
        generationType: String(generationType || 'normal'),
        previousChatLength: identity.chat.length,
        previousAssistantHash: previous.hash,
        previousAssistantIndex: previous.index,
        previousSwipeId: previous.swipeId,
        previousSwipeCount: previous.swipeCount,
        remainingAtInjection: Number(feedback.remainingRounds || 0),
        feedbackPromptHash: hashText(prompt),
        feedbackTextHash: hashText(`${normalizeFeedbackTypes(feedback).join(',')}|${feedback.customText || ''}`),
        feedbackTextLength: String(feedback.customText || '').length,
        runtimeVersion: RUNTIME_VERSION,
    };

    record.delivery = {
        ...(record.delivery || {}),
        status: 'injected',
        injectedAt: now,
        generationType: pending.generationType,
        feedbackPromptHash: pending.feedbackPromptHash,
        feedbackTextHash: pending.feedbackTextHash,
        feedbackTextLength: pending.feedbackTextLength,
        runtimeVersion: RUNTIME_VERSION,
        interceptorRead: true,
        mainPromptAppended: true,
        complianceReason: '',
        foreignWords: [],
        checkedAt: 0,
    };
    record.updatedAt = now;
    state.active = record;
    state.lastReceipt = clone({ ...record.delivery, feedbackId: record.id, type: record.type, types: normalizeFeedbackTypes(record), label: record.label, remainingRounds: record.remainingRounds });
    writeCurrentState(state);

    try {
        localStorage.setItem(FEEDBACK_PENDING_KEY, JSON.stringify(pending));
        return true;
    } catch (error) {
        console.warn('[RabbitMirror] Failed to mark feedback cat injection:', error);
        return false;
    }
}


const LANGUAGE_VISIBLE_WORD_ALLOWLIST = new Set([
    'AI', 'API', 'HTML', 'CSS', 'SVG', 'URL', 'QR', 'ID', 'CHAR', 'USER',
]);

function extractRabbitMirrorVisibleText(source) {
    const html = String(source || '');
    const match = html.match(/<toto\b[^>]*>[\s\S]*?<\/toto>/i);
    if (!match) return '';
    const fragment = match[0]
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/https?:\/\/[^\s<>'\"]+/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return fragment;
}

export function auditLanguageFeedbackCompliance(source) {
    const visible = extractRabbitMirrorVisibleText(source);
    if (!visible) return { compliant: false, foreignWords: [], reason: '未能读取兔子镜可见文字' };
    const words = visible.match(/\b[A-Za-z][A-Za-z0-9_-]{1,}\b/g) || [];
    const foreignWords = [...new Set(words.filter(word => !LANGUAGE_VISIBLE_WORD_ALLOWLIST.has(word.toUpperCase())))].slice(0, 12);
    return {
        compliant: foreignWords.length === 0,
        foreignWords,
        reason: foreignWords.length ? `仍检测到可见外语：${foreignWords.join('、')}` : '',
    };
}

export function auditVisibleLanguageBalanceText(text) {
    const visible = String(text || '')
        .replace(/https?:\/\/[^\s<>'"]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!visible) {
        return { foreignDominant: false, hanChars: 0, latinLetters: 0, foreignWordCount: 0, foreignWords: [], reason: '' };
    }
    const hanChars = (visible.match(/[\u3400-\u9fff]/g) || []).length;
    const latinLetters = (visible.match(/[A-Za-z]/g) || []).length;
    const words = visible.match(/\b[A-Za-z][A-Za-z0-9_-]{1,}\b/g) || [];
    const meaningfulWords = words.filter(word => !LANGUAGE_VISIBLE_WORD_ALLOWLIST.has(word.toUpperCase()));
    const foreignWords = [...new Set(meaningfulWords)].slice(0, 12);

    // High-confidence only: at least several real English words, enough Latin text to form an
    // interface/paragraph, and a strong dominance over Han characters. This intentionally does
    // not flag mixed Chinese UI containing terms such as MVP/BPM/AI/API.
    const nearlyNoChinese = hanChars <= 4 && meaningfulWords.length >= 5 && latinLetters >= 32;
    const overwhelminglyEnglish = meaningfulWords.length >= 10
        && latinLetters >= 80
        && latinLetters >= Math.max(80, hanChars * 6);
    const foreignDominant = nearlyNoChinese || overwhelminglyEnglish;
    return {
        foreignDominant,
        hanChars,
        latinLetters,
        foreignWordCount: meaningfulWords.length,
        foreignWords,
        reason: foreignDominant
            ? `可见文案明显以英文为主（中文字符=${hanChars}，英文字母=${latinLetters}，英文词≈${meaningfulWords.length}）`
            : '',
    };
}

export function auditRabbitMirrorLanguageBalance(source) {
    return auditVisibleLanguageBalanceText(extractRabbitMirrorVisibleText(source));
}

export function consumeInjectedFeedbackForSuccessfulRabbitMirror(message) {
    if (!message || message?.is_user || typeof message?.mes !== 'string') return null;
    let pending = null;
    try {
        pending = JSON.parse(localStorage.getItem(FEEDBACK_PENDING_KEY) || 'null');
    } catch {
        pending = null;
    }
    if (!pending?.feedbackId || Date.now() - Number(pending.injectedAt || 0) > 30 * 60 * 1000) return null;

    const { state, identity } = readCurrentState();
    if (pending.chatKey !== identity.key) return null;
    const outputHash = hashText(message.mes);
    const messageIndex = Array.isArray(identity.chat) ? identity.chat.lastIndexOf(message) : -1;
    const currentSwipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    const currentSwipeCount = Array.isArray(message?.swipes) ? message.swipes.length : 0;
    const outputChanged = !!outputHash && (
        outputHash !== pending.previousAssistantHash
        || identity.chat.length > Number(pending.previousChatLength || 0)
        || (messageIndex >= 0 && messageIndex !== Number(pending.previousAssistantIndex ?? -1))
        || currentSwipeId !== Number(pending.previousSwipeId ?? -1)
        || currentSwipeCount !== Number(pending.previousSwipeCount || 0)
    );
    if (!outputChanged) return null;

    const record = state.active;
    if (!record || record.id !== pending.feedbackId) {
        try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
        return null;
    }

    const now = Date.now();
    if (normalizeFeedbackTypes(record).includes('language')) {
        const audit = auditLanguageFeedbackCompliance(message.mes);
        if (!audit.compliant) {
            record.updatedAt = now;
            record.delivery = {
                ...(record.delivery || {}),
                status: 'not_applied',
                checkedAt: now,
                complianceReason: audit.reason,
                foreignWords: audit.foreignWords,
                runtimeVersion: RUNTIME_VERSION,
                successfulRabbitMirrorDetected: true,
            };
            state.active = record;
            state.lastReceipt = clone({
                ...record.delivery,
                feedbackId: record.id,
                type: record.type,
                types: normalizeFeedbackTypes(record),
                label: record.label,
                remainingRounds: record.remainingRounds,
            });
            writeCurrentState(state);
            syncFeedbackCatExtensionPrompt(record);
            try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
            return {
                consumed: false,
                cleared: false,
                remainingRounds: Number(record.remainingRounds || 0),
                record: clone(record),
                receipt: clone(state.lastReceipt),
                complianceFailed: true,
            };
        }
    }

    const remaining = Math.max(0, Number(record.remainingRounds || 0) - 1);
    const receipt = {
        ...(record.delivery || {}),
        status: 'consumed',
        consumedAt: now,
        feedbackId: record.id,
        type: record.type,
        types: normalizeFeedbackTypes(record),
        label: record.label,
        remainingRounds: remaining,
        runtimeVersion: RUNTIME_VERSION,
        successfulRabbitMirrorDetected: true,
    };
    state.lastReceipt = receipt;

    let result;
    if (remaining > 0) {
        record.remainingRounds = remaining;
        record.updatedAt = now;
        record.delivery = {
            ...receipt,
            status: 'waiting',
            waitingSince: now,
            previousConsumedAt: now,
        };
        state.active = record;
        result = { consumed: true, cleared: false, remainingRounds: remaining, record: clone(record), receipt: clone(receipt) };
        writeCurrentState(state);
        syncFeedbackCatExtensionPrompt(record);
    } else {
        state.active = null;
        result = { consumed: true, cleared: true, remainingRounds: 0, record: clone(record), receipt: clone(receipt) };
        writeCurrentState(state);
        clearFeedbackCatExtensionPrompt();
    }
    try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
    return result;
}


export function consumeInjectedFeedbackForSuccessfulIndependentRabbitMirror(html, feedbackId = '') {
    const source = String(html || '').trim();
    if (!source) return null;
    let pending = null;
    try {
        pending = JSON.parse(localStorage.getItem(FEEDBACK_PENDING_KEY) || 'null');
    } catch {
        pending = null;
    }
    if (!pending?.feedbackId || Date.now() - Number(pending.injectedAt || 0) > 30 * 60 * 1000) return null;
    if (feedbackId && pending.feedbackId !== feedbackId) return null;
    if (String(pending.generationType || '') !== 'independent') return null;

    const { state, identity } = readCurrentState();
    if (pending.chatKey !== identity.key) return null;
    const record = state.active;
    if (!record || record.id !== pending.feedbackId) {
        try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
        return null;
    }

    const now = Date.now();
    if (normalizeFeedbackTypes(record).includes('language')) {
        const audit = auditLanguageFeedbackCompliance(source);
        if (!audit.compliant) {
            record.updatedAt = now;
            record.delivery = {
                ...(record.delivery || {}),
                status: 'not_applied',
                checkedAt: now,
                complianceReason: audit.reason,
                foreignWords: audit.foreignWords,
                runtimeVersion: RUNTIME_VERSION,
                successfulRabbitMirrorDetected: true,
                independentApi: true,
            };
            state.active = record;
            state.lastReceipt = clone({
                ...record.delivery,
                feedbackId: record.id,
                type: record.type,
                types: normalizeFeedbackTypes(record),
                label: record.label,
                remainingRounds: record.remainingRounds,
            });
            writeCurrentState(state);
            syncFeedbackCatExtensionPrompt(record);
            try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
            return {
                consumed: false,
                cleared: false,
                remainingRounds: Number(record.remainingRounds || 0),
                record: clone(record),
                receipt: clone(state.lastReceipt),
                complianceFailed: true,
            };
        }
    }

    const remaining = Math.max(0, Number(record.remainingRounds || 0) - 1);
    const receipt = {
        ...(record.delivery || {}),
        status: 'consumed',
        consumedAt: now,
        feedbackId: record.id,
        type: record.type,
        types: normalizeFeedbackTypes(record),
        label: record.label,
        remainingRounds: remaining,
        runtimeVersion: RUNTIME_VERSION,
        successfulRabbitMirrorDetected: true,
        independentApi: true,
    };
    state.lastReceipt = receipt;

    let result;
    if (remaining > 0) {
        record.remainingRounds = remaining;
        record.updatedAt = now;
        record.delivery = {
            ...receipt,
            status: 'waiting',
            waitingSince: now,
            previousConsumedAt: now,
        };
        state.active = record;
        result = { consumed: true, cleared: false, remainingRounds: remaining, record: clone(record), receipt: clone(receipt) };
        writeCurrentState(state);
        syncFeedbackCatExtensionPrompt(record);
    } else {
        state.active = null;
        result = { consumed: true, cleared: true, remainingRounds: 0, record: clone(record), receipt: clone(receipt) };
        writeCurrentState(state);
        clearFeedbackCatExtensionPrompt();
    }
    try { localStorage.removeItem(FEEDBACK_PENDING_KEY); } catch {}
    return result;
}

function deliveryStatusLabel(delivery) {
    if (delivery?.status === 'injected') return '本轮已读取并追加到兔子镜隐藏 Prompt';
    if (delivery?.status === 'consumed') return '已随成功生成消耗';
    if (delivery?.status === 'not_applied') return `上一轮未落实，反馈继续保留${delivery?.complianceReason ? `：${delivery.complianceReason}` : ''}`;
    return '等待下一次正式生成';
}

export function feedbackCatStatusText(feedback) {
    if (!feedback) return '当前没有生效中的反馈';
    const types = normalizeFeedbackTypes(feedback);
    const labels = feedbackTypeLabels(types);
    const customIndex = types.indexOf('custom');
    if (customIndex >= 0 && feedback.customText) labels[customIndex] = `其他：${String(feedback.customText || '').replace(/\s+/g, ' ').slice(0, 42)}`;
    const label = labels.join('＋') || feedback.label || '自定义反馈';
    return `${label}｜剩余 ${Number(feedback.remainingRounds || 0)} 轮｜${deliveryStatusLabel(feedback.delivery)}`;
}

export function feedbackCatReceiptText(receipt) {
    if (!receipt) return '';
    const label = feedbackTypeLabels(receipt).join('＋') || receipt.label || '反馈';
    const time = Number(receipt.consumedAt || receipt.injectedAt || 0);
    const timeText = time ? new Date(time).toLocaleTimeString() : '';
    return `${label}｜${deliveryStatusLabel(receipt)}${timeText ? `｜${timeText}` : ''}`;
}


let feedbackCatChatChangedHandler = null;
let feedbackCatEnabledReader = () => true;

export function initFeedbackCatPromptSync(enabledReader = () => true) {
    feedbackCatEnabledReader = typeof enabledReader === 'function' ? enabledReader : () => true;
    if (feedbackCatChatChangedHandler) return;
    feedbackCatChatChangedHandler = () => {
        setTimeout(() => {
            if (feedbackCatEnabledReader()) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat());
            else clearFeedbackCatExtensionPrompt();
        }, 0);
    };
    if (eventSource?.on && event_types?.CHAT_CHANGED) {
        eventSource.on(event_types.CHAT_CHANGED, feedbackCatChatChangedHandler);
    }
    if (feedbackCatEnabledReader()) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat());
    else clearFeedbackCatExtensionPrompt();
}

export function destroyFeedbackCatPromptSync() {
    if (feedbackCatChatChangedHandler && eventSource?.off && event_types?.CHAT_CHANGED) {
        try { eventSource.off(event_types.CHAT_CHANGED, feedbackCatChatChangedHandler); } catch {}
    }
    feedbackCatChatChangedHandler = null;
    clearFeedbackCatExtensionPrompt();
}

export function clearAllFeedbackCatState() {
    clearFeedbackCatExtensionPrompt();
    const { identity } = readCurrentState();
    if (identity.metadata && typeof identity.metadata === 'object') {
        delete identity.metadata[FEEDBACK_METADATA_KEY];
        saveMetadataSoon(identity.context);
    }
    try {
        localStorage.removeItem(FEEDBACK_STORAGE_KEY);
        localStorage.removeItem(FEEDBACK_PENDING_KEY);
    } catch {}
}
