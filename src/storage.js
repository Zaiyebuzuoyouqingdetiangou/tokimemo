const STORAGE_KEY = 'rabbit_mirror_theater:last_combo:v11';
const PENDING_KEY = 'rabbit_mirror_theater:pending_combo:v11';
const MAX_STORED = 20;
const ATTEMPT_STORAGE_KEY = 'rabbit_mirror_theater:generation_attempts:v1';
const DIRECTIVE_PICK_STORAGE_KEY = 'rabbit_mirror_theater:directive_pick_cache:v1';
const MAX_ATTEMPTS_PER_CHAT = 20;
const MAX_DIRECTIVE_PICKS_PER_CHAT = 24;
const ATTEMPT_TTL_MS = 12 * 60 * 60 * 1000;
const DIRECTIVE_PICK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FORMAT_ELIGIBLE_MISS_STORAGE_KEY = 'rabbit_mirror_theater:format_eligible_misses:v1';
const FORMAT_ELIGIBLE_MISS_CAP = 320;

function normalizeFormatEligibleMisses(raw, validFormatIds = []) {
    const valid = new Set((validFormatIds || []).map(id => String(id || '').trim()).filter(Boolean));
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const normalized = {};
    for (const [rawId, rawValue] of Object.entries(source)) {
        const sourceId = String(rawId || '').trim();
        const id = sourceId === '6.2.1.2' ? '6.2.1.1.e' : sourceId;
        if (!id || (valid.size && !valid.has(id))) continue;
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value < 0) continue;
        const misses = Math.min(FORMAT_ELIGIBLE_MISS_CAP, Math.floor(value));
        if (misses > 0) normalized[id] = Math.max(Number(normalized[id] || 0), misses);
    }
    return normalized;
}

function readFormatEligibleMissStore(validFormatIds = []) {
    try {
        return normalizeFormatEligibleMisses(
            JSON.parse(localStorage.getItem(FORMAT_ELIGIBLE_MISS_STORAGE_KEY) || '{}'),
            validFormatIds,
        );
    } catch {
        return {};
    }
}

function writeFormatEligibleMissStore(value) {
    try {
        localStorage.setItem(FORMAT_ELIGIBLE_MISS_STORAGE_KEY, JSON.stringify(value || {}));
        return true;
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store format fairness state:', error);
        return false;
    }
}

export function getFormatEligibleMisses(validFormatIds = []) {
    return readFormatEligibleMissStore(validFormatIds);
}

export function recordFormatEligibleMissRound({ eligibleIds = [], selectedIds = [], validFormatIds = [] } = {}) {
    const valid = new Set((validFormatIds || []).map(id => String(id || '').trim()).filter(Boolean));
    const eligible = [...new Set((eligibleIds || []).map(id => String(id || '').trim()).filter(id => id && (!valid.size || valid.has(id))))];
    if (!eligible.length) return false;

    const selected = new Set((selectedIds || []).map(id => String(id || '').trim()).filter(Boolean));
    const state = readFormatEligibleMissStore(validFormatIds);

    for (const id of eligible) {
        if (selected.has(id)) {
            delete state[id];
            continue;
        }
        const next = Math.min(FORMAT_ELIGIBLE_MISS_CAP, Number(state[id] || 0) + 1);
        state[id] = next;
    }

    // 每次真实随机抽签本来就需要持久化 aging；即使所有计数都已到 cap，也写回一次
    // 规范化后的稀疏 map，以便顺手清掉已经从当前 format 索引消失的旧 ID / 非法值。
    return writeFormatEligibleMissStore(state);
}

export function resetFormatEligibleMisses(formatIds = []) {
    const targets = [...new Set((formatIds || []).map(id => String(id || '').trim()).filter(Boolean))];
    if (!targets.length) return false;
    const state = readFormatEligibleMissStore();
    let changed = false;
    for (const id of targets) {
        if (state[id] === undefined) continue;
        delete state[id];
        changed = true;
    }
    return changed ? writeFormatEligibleMissStore(state) : true;
}

// 抽签写入 pending 后，只有真正渲染出兔子镜才会提交。若生成被取消、请求失败或页面刷新，
// pending 会一直留在 localStorage；之后任意一面兔子镜渲染完成都会把这个从未生成过的组合
// 当作本轮结果写进正式历史，污染冷却与避让，并把新镜子的视觉指纹贴到旧组合上。
//
// 页面会话标记是主判据：它在模块加载时生成且不持久化，因此上一次页面会话写入的 pending
// 一定不等于当前值，可以确定那次生成已经不可能仍在进行。
const PENDING_SESSION_TOKEN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// 同一次页面会话内的兜底上限。必须显著大于任何仍可能正常完成的生成：
// 副 API 单次请求上限 5 分钟，profile 回退最多 12 次串行，理论最坏约 60 分钟；
// 跟随模式没有自己的超时，完全跟随宿主生成生命周期。因此取与本文件既有「生成相关本地
// 状态」同一量级的 12 小时，留出十余倍余量，宁可漏判也不误杀慢请求。真正兜住孤儿
// pending 的是会话标记：任何漏判都会在下一次页面加载时被清掉。
const PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// 容量类错误与权限／禁用类错误必须区分：前者可以靠丢弃过期数据自救，后者丢多少都没用，
// 删数据只会白白损失状态。
function isStorageQuotaError(error) {
    if (!error) return false;
    const name = String(error.name || '');
    const code = Number(error.code);
    return name === 'QuotaExceededError'
        || name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || code === 22
        || code === 1014;
}

function scopedBucketFullyExpired(bucket, ttlMs, now) {
    if (!Array.isArray(bucket)) return true;
    if (!bucket.length) return true;
    return bucket.every(item => !item || now - Number(item.ts || 0) > ttlMs);
}

// 读路径只做内存过滤，因此过期的外来 chat 桶需要一个回收出口。挂在本来就要写盘的时刻，
// 每次只回收第一个遇到的全过期外来桶：无需定时器或轮询，回收速度与使用频率自然成正比，
// 单次写入的额外开销也保持恒定。
function reclaimOneExpiredForeignBucket(store, currentKey, ttlMs) {
    if (!store || typeof store !== 'object') return '';
    const now = Date.now();
    for (const key of Object.keys(store)) {
        if (key === currentKey) continue;
        if (!scopedBucketFullyExpired(store[key], ttlMs, now)) continue;
        delete store[key];
        return key;
    }
    return '';
}

// 配额自救：丢弃最旧的外来 chat 桶（按桶内最新条目时间比较），永不动当前 chat 的数据。
function dropOldestForeignBucket(store, currentKey) {
    if (!store || typeof store !== 'object') return false;
    let oldestKey = '';
    let oldestTs = Infinity;
    for (const key of Object.keys(store)) {
        if (key === currentKey) continue;
        const bucket = Array.isArray(store[key]) ? store[key] : [];
        let newest = 0;
        for (const item of bucket) newest = Math.max(newest, Number(item?.ts || 0));
        if (newest < oldestTs) { oldestTs = newest; oldestKey = key; }
    }
    if (!oldestKey) return false;
    delete store[oldestKey];
    return true;
}

function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function firstNonEmpty(values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function getContextSafe() {
    try {
        return globalThis.SillyTavern?.getContext?.() || {};
    } catch {
        return {};
    }
}

function resolveChat(chatOverride = null) {
    const context = getContextSafe();
    if (Array.isArray(context?.chat) && context.chat.length) return context.chat;
    if (Array.isArray(chatOverride) && chatOverride.some(item => typeof item?.is_user === 'boolean')) return chatOverride;
    if (Array.isArray(globalThis.chat)) return globalThis.chat;
    return [];
}

export function getCurrentChatKey(chatOverride = null) {
    const context = getContextSafe();
    const chat = resolveChat(chatOverride);
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
    return chatId
        ? `chat:${chatId}`
        : groupId
            ? `group:${groupId}:${hashText(seed)}`
            : characterId
                ? `character:${characterId}:${hashText(seed)}`
                : `fallback:${hashText(seed || 'unknown-chat')}`;
}

function readScopedStore(storageKey) {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeScopedStore(storageKey, value, currentKey = '') {
    const store = value && typeof value === 'object' ? value : {};
    try {
        localStorage.setItem(storageKey, JSON.stringify(store));
        return true;
    } catch (error) {
        // 只有容量类错误才值得靠丢数据自救。SecurityError、存储被禁用、权限异常等
        // 丢多少桶都不会成功，此时删除数据是纯损失。
        if (!isStorageQuotaError(error)) {
            console.warn('[RabbitMirror] Failed to store scoped generation state:', error);
            return false;
        }
        if (!dropOldestForeignBucket(store, currentKey)) {
            console.warn('[RabbitMirror] Scoped generation state over quota and nothing safe to drop:', error);
            return false;
        }
        // 最多重试一次：仍然失败说明不是靠丢一个桶能解决的问题。
        try {
            localStorage.setItem(storageKey, JSON.stringify(store));
            return true;
        } catch (retryError) {
            console.warn('[RabbitMirror] Scoped generation state still over quota after reclaim:', retryError);
            return false;
        }
    }
}

function compactIdList(values, limit = 16) {
    return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

export function getRecentGenerationAttemptIds(chatKey, limit = 10) {
    const key = String(chatKey || '').trim();
    if (!key) return { themeIds: [], formatIds: [], themeGroups: [], formatGroups: [] };
    const store = readScopedStore(ATTEMPT_STORAGE_KEY);
    const now = Date.now();
    // 读路径只做内存过滤，不写盘：读操作不应产生副作用，单条过期就整表序列化在长聊天里
    // 也是明确的写放大。实际回收发生在 recordGenerationAttempt 本来就要写盘的时刻。
    const items = Array.isArray(store[key])
        ? store[key].filter(item => item && now - Number(item.ts || 0) <= ATTEMPT_TTL_MS)
        : [];
    const recent = items.slice(-Math.max(1, Number(limit) || 10));
    const themeIds = new Set();
    const formatIds = new Set();
    const themeGroups = new Set();
    const formatGroups = new Set();
    for (const item of recent) {
        for (const id of item.themeIds || []) themeIds.add(id);
        for (const id of item.formatIds || []) formatIds.add(id);
        for (const id of item.themeGroups || []) themeGroups.add(id);
        for (const id of item.formatGroups || []) formatGroups.add(id);
    }
    return {
        themeIds: [...themeIds],
        formatIds: [...formatIds],
        themeGroups: [...themeGroups],
        formatGroups: [...formatGroups],
    };
}

export function recordGenerationAttempt(combo, { chatKey = '', attemptId = '', directiveScoped = false } = {}) {
    const key = String(chatKey || '').trim();
    const id = String(attemptId || '').trim();
    if (!key || !id || !combo) return false;
    const store = readScopedStore(ATTEMPT_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[key])
        ? store[key].filter(item => item && now - Number(item.ts || 0) <= ATTEMPT_TTL_MS)
        : [];
    if (items.some(item => item.attemptId === id)) return false;
    items.push({
        attemptId: id,
        themeIds: compactIdList(combo.themeIds),
        formatIds: compactIdList(combo.formatIds),
        themeGroups: compactIdList(combo.themeGroups),
        formatGroups: compactIdList(combo.formatGroups),
        directiveScoped: !!directiveScoped,
        ts: now,
    });
    store[key] = items.slice(-MAX_ATTEMPTS_PER_CHAT);
    reclaimOneExpiredForeignBucket(store, key, ATTEMPT_TTL_MS);
    return writeScopedStore(ATTEMPT_STORAGE_KEY, store, key);
}

export function getDirectiveScopedPick(chatKey, directiveScopeKey) {
    const chat = String(chatKey || '').trim();
    const scope = String(directiveScopeKey || '').trim();
    if (!chat || !scope) return null;
    const store = readScopedStore(DIRECTIVE_PICK_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[chat])
        ? store[chat].filter(item => item && now - Number(item.ts || 0) <= DIRECTIVE_PICK_TTL_MS)
        : [];
    // 同上：读路径无副作用，回收挂在 setDirectiveScopedPick 的写盘时刻。
    const found = items.find(item => item.scopeKey === scope) || null;
    return found ? { ...found } : null;
}

export function setDirectiveScopedPick(chatKey, directiveScopeKey, combo) {
    const chat = String(chatKey || '').trim();
    const scope = String(directiveScopeKey || '').trim();
    if (!chat || !scope || !combo) return false;
    const store = readScopedStore(DIRECTIVE_PICK_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[chat])
        ? store[chat].filter(item => item && now - Number(item.ts || 0) <= DIRECTIVE_PICK_TTL_MS && item.scopeKey !== scope)
        : [];
    items.push({
        scopeKey: scope,
        themeIds: compactIdList(combo.themeIds),
        formatIds: compactIdList(combo.formatIds),
        uiReviewFocus: Array.isArray(combo.uiReviewFocus) ? combo.uiReviewFocus.slice(0, 8) : [],
        ts: now,
    });
    store[chat] = items.slice(-MAX_DIRECTIVE_PICKS_PER_CHAT);
    reclaimOneExpiredForeignBucket(store, chat, DIRECTIVE_PICK_TTL_MS);
    return writeScopedStore(DIRECTIVE_PICK_STORAGE_KEY, store, chat);
}


function readHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') return [raw];
        return [];
    } catch {
        return [];
    }
}

function signatureOf(combo) {
    return JSON.stringify({
        themeIds: combo?.themeIds || [],
        formatIds: combo?.formatIds || [],
        samplingMode: combo?.samplingMode || 'classic',
        forcedVisualScenery: !!combo?.forcedVisualScenery,
    });
}

export function getComboHistory(limit = 10) {
    const history = readHistory();
    return history.slice(-Math.max(0, Number(limit) || 10));
}

export function getLastCombo() {
    const history = readHistory();
    return history[history.length - 1] || {};
}

export function getRecentIds(limit = 10) {
    const history = getComboHistory(limit);
    const themeIds = new Set();
    const formatIds = new Set();
    const themeGroups = new Set();
    const formatGroups = new Set();
    const uiReviewFocus = [];

    for (const combo of history) {
        for (const id of combo?.themeIds || []) themeIds.add(id);
        for (const id of combo?.formatIds || []) formatIds.add(id);
        for (const id of combo?.themeGroups || []) themeGroups.add(id);
        for (const id of combo?.formatGroups || []) formatGroups.add(id);
        if (Array.isArray(combo?.uiReviewFocus) && combo.uiReviewFocus.length) {
            uiReviewFocus.push(combo.uiReviewFocus.join('；'));
        }
    }

    return {
        themeIds: [...themeIds],
        formatIds: [...formatIds],
        themeGroups: [...themeGroups],
        formatGroups: [...formatGroups],
        uiReviewFocus: uiReviewFocus.slice(-limit),
    };
}


export function getRecentRiskFlags(limit = 3) {
    const history = getComboHistory(limit);
    const flags = [];
    for (const item of history) {
        if (Array.isArray(item?.riskFlags)) flags.push(...item.riskFlags);
    }
    return [...new Set(flags)];
}

export function getRecentRiskFlagCounts(limit = 3) {
    const history = getComboHistory(limit);
    const counts = {};
    for (const item of history) {
        for (const flag of item?.riskFlags || []) {
            counts[flag] = (counts[flag] || 0) + 1;
        }
    }
    return counts;
}


export function getRecentPaletteFingerprints(limit = 3) {
    return getComboHistory(limit)
        .map(item => item?.paletteFingerprint)
        .filter(item => item && typeof item === 'object' && Number(item.confidence || 0) >= 0.35)
        .slice(-Math.max(0, Number(limit) || 3));
}

function isDarkPaletteTrigger(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return false;
    const confidence = Number(fingerprint.confidence || 0);
    const darkAreaRatio = Number(fingerprint.darkAreaRatio || 0);
    const averageLuminance = Number(fingerprint.averageLuminance || 255);
    return confidence >= 0.5
        && fingerprint.brightness === 'dark'
        && (darkAreaRatio >= 0.55 || averageLuminance <= 105);
}

// 1.3.52: 原本整条配色反馈链只认“暗”。米黄／奶油是 brightness:'light' + temperature:'warm'
// + saturation:'low'，永远不会触发任何冷却；同时反黑规则还在持续把模型推向“高明度暖中性色”，
// 于是米黄成为唯一的收敛点，一旦落进去就再也出不来。
// classifyPaletteSamples 早就算出了 hueFamily / temperature / saturation，这里开始真正使用它们。
const PALETTE_BRIGHTNESS_LABELS = { dark: '低明度', mid: '中明度', light: '高明度' };
const PALETTE_TEMPERATURE_LABELS = { warm: '暖', cool: '冷', neutral: '中性' };
const PALETTE_SATURATION_LABELS = { low: '低饱和', medium: '中饱和', high: '高饱和' };
const PALETTE_HUE_LABELS = {
    red: '红', orange: '橙', yellow: '黄', green: '绿',
    cyan: '青', blue: '蓝', purple: '紫', pink: '粉', neutral: '中性色',
};

// 1.4.30.5: 配色冷却不再给任何具体颜色家族特殊待遇。
// 统一使用同一组结构维度描述近期成品，避免“禁蓝→全紫→再禁紫”式颜色打地鼠。
export function paletteFamilyKey(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return '';
    if (Number(fingerprint.confidence || 0) < 0.35) return '';
    const brightness = String(fingerprint.brightness || '').trim();
    if (!brightness) return '';
    const hueFamily = String(fingerprint.hueFamily || 'neutral').trim() || 'neutral';
    const temperature = String(fingerprint.temperature || 'neutral').trim() || 'neutral';
    const saturation = String(fingerprint.saturation || 'low').trim() || 'low';
    return `${brightness}|${hueFamily}|${temperature}|${saturation}`;
}

export function describePaletteFamily(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return '';
    const brightness = PALETTE_BRIGHTNESS_LABELS[String(fingerprint.brightness || '')] || '';
    const temperature = PALETTE_TEMPERATURE_LABELS[String(fingerprint.temperature || '')] || '';
    const saturation = PALETTE_SATURATION_LABELS[String(fingerprint.saturation || '')] || '';
    const hue = PALETTE_HUE_LABELS[String(fingerprint.hueFamily || 'neutral')] || '';
    return [brightness, temperature, hue, saturation].filter(Boolean).join('');
}

// 1.4.30.5: 不再等重复已经形成才纠偏。每一面真实成品完成后立即进入短期冷却；
// 这里只按时间距离返回近期真实配色，不决定下一轮该用什么颜色。
export function getRecentPaletteCooldown(window = 3) {
    const span = Math.max(1, Number(window) || 3);
    const recent = getRecentPaletteFingerprints(span).slice().reverse();
    return recent.map((fingerprint, roundsAgo) => ({
        fingerprint,
        key: paletteFamilyKey(fingerprint),
        label: describePaletteFamily(fingerprint),
        roundsAgo,
        strength: Math.max(1, span - roundsAgo),
    })).filter(item => item.label);
}


const VISUAL_FAMILY_DIMENSION_LABELS = Object.freeze({
    surface_family: '主底盘／材质',
    contrast_family: '明暗关系',
    contour_family: '整体轮廓',
    reading_family: '阅读路径',
    unit_family: '信息单位',
    space_family: '空间结构',
});

export function parseVisualFamilySkeleton(value = '') {
    const text = String(value || '').trim();
    if (!text) return {};
    const parsed = {};
    for (const part of text.split('；')) {
        const match = part.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
        if (!match) continue;
        const key = String(match[1] || '').trim();
        if (!Object.prototype.hasOwnProperty.call(VISUAL_FAMILY_DIMENSION_LABELS, key)) continue;
        const valueText = String(match[2] || '').trim();
        if (valueText) parsed[key] = valueText.slice(0, 120);
    }
    return parsed;
}

export function describeVisualFamilyDimensions(family = {}) {
    if (!family || typeof family !== 'object') return '';
    return Object.entries(VISUAL_FAMILY_DIMENSION_LABELS)
        .map(([key, label]) => family[key] ? `${label}=${family[key]}` : '')
        .filter(Boolean)
        .join('；');
}

export function getRecentVisualFamilyCooldown(window = 3) {
    const span = Math.max(1, Number(window) || 3);
    return getComboHistory(span)
        .slice()
        .reverse()
        .map((item, roundsAgo) => ({
            family: parseVisualFamilySkeleton(item?.visualSkeleton || ''),
            roundsAgo,
            strength: Math.max(1, span - roundsAgo),
        }))
        .filter(item => Object.keys(item.family).length);
}

export function getRepeatedVisualFamilyDimensions(window = 3, threshold = 2) {
    const span = Math.max(2, Number(window) || 3);
    const hits = Math.max(2, Number(threshold) || 2);
    const chronological = getComboHistory(span)
        .map(item => parseVisualFamilySkeleton(item?.visualSkeleton || ''))
        .filter(family => Object.keys(family).length);
    if (chronological.length < hits) return [];

    const latest = chronological[chronological.length - 1];
    const result = [];
    for (const [key, label] of Object.entries(VISUAL_FAMILY_DIMENSION_LABELS)) {
        const latestValue = latest[key];
        if (!latestValue) continue;
        let streak = 0;
        for (let index = chronological.length - 1; index >= 0; index -= 1) {
            if (chronological[index]?.[key] !== latestValue) break;
            streak += 1;
        }
        if (streak < hits) continue;
        result.push({ key, label, value: latestValue, streak, strength: Math.min(span, streak) });
    }
    return result;
}

// 近 window 轮中，最新一轮所属的配色家族出现了 threshold 次及以上即视为重复。
// 与 getActivePaletteCooldown 的“只防暗”互补：这条对任何家族一视同仁，包括米黄。
export function getRepeatedPaletteFamily(window = 3, threshold = 2) {
    const span = Math.max(2, Number(window) || 3);
    const hits = Math.max(2, Number(threshold) || 2);
    const recent = getComboHistory(span)
        .map(item => item?.paletteFingerprint)
        .filter(item => item && typeof item === 'object');
    const keyed = recent.map(item => ({ item, key: paletteFamilyKey(item) })).filter(entry => entry.key);
    if (keyed.length < hits) return null;
    const latest = keyed[keyed.length - 1];
    const count = keyed.filter(entry => entry.key === latest.key).length;
    if (count < hits) return null;
    return {
        key: latest.key,
        count,
        window: keyed.length,
        label: describePaletteFamily(latest.item) || latest.key,
        fingerprint: latest.item,
    };
}

// 一次低明度主承载输出触发后续五轮冷却；冷却期内若再次命中则重新从五轮开始。
export function getActivePaletteCooldown(rounds = 5) {
    const cooldownRounds = Math.max(1, Number(rounds) || 5);
    const history = readHistory();
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const fingerprint = history[index]?.paletteFingerprint;
        if (!isDarkPaletteTrigger(fingerprint)) continue;
        const completedSinceTrigger = history.length - 1 - index;
        if (completedSinceTrigger >= cooldownRounds) return { active: false, remaining: 0 };
        return {
            active: true,
            remaining: cooldownRounds - completedSinceTrigger,
            completedSinceTrigger,
            fingerprint,
        };
    }
    return { active: false, remaining: 0 };
}

function normalizeInteractionFamily(value) {
    if (!value || typeof value !== 'object') return undefined;
    const id = String(value.id || '').trim();
    if (!id || id === 'none') return undefined;
    return {
        id: id.slice(0, 80),
        label: String(value.label || id).slice(0, 120),
        confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
        controlCount: Math.max(0, Math.min(99, Number(value.controlCount) || 0)),
        panelCount: Math.max(0, Math.min(99, Number(value.panelCount) || 0)),
    };
}

export function getRecentInteractionFamilies(limit = 5) {
    return getComboHistory(limit)
        .map(item => normalizeInteractionFamily(item?.interactionFamily))
        .filter(Boolean)
        .slice(-Math.max(0, Number(limit) || 5));
}

export function getRecentInteractionFamilyCounts(limit = 5) {
    const counts = {};
    for (const family of getRecentInteractionFamilies(limit)) {
        counts[family.id] = (counts[family.id] || 0) + 1;
    }
    return counts;
}

export function setPendingCombo(combo) {
    try {
        if (!combo) return;
        const pending = {
            ...combo,
            signature: signatureOf(combo),
            pendingTs: Date.now(),
            pendingSession: PENDING_SESSION_TOKEN,
        };
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store pending combo:', error);
    }
}

export function commitPendingCombo(visualSignature = '', visualSkeleton = '', riskFlags = [], paletteFingerprint = null, interactionFamily = null) {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (!pending || typeof pending !== 'object') return;

        // pending 只对创建它的那一次生成有意义。这里判定它是否已经不可能属于当前这次提交：
        //  1. 会话标记不同 —— 写入它的页面会话已经结束，那次生成绝无可能仍在进行；
        //  2. 同会话内超过保守上限 —— 兜底，阈值远大于任何仍可能完成的生成；
        //  3. 缺少时间戳 —— 无从判断新旧，按不可信处理。
        // 命中任一条就丢弃，不写入历史：让一个从未生成过的组合进入冷却，比丢一条记录糟得多。
        // 提交只由「某面兔子镜已渲染完成」触发，真正在途的请求不会走到这里。
        const pendingSession = String(pending.pendingSession || '');
        const pendingAt = Number(pending.pendingTs);
        const staleSession = !!pendingSession && pendingSession !== PENDING_SESSION_TOKEN;
        const staleAge = !Number.isFinite(pendingAt) || Date.now() - pendingAt > PENDING_MAX_AGE_MS;
        if (staleSession || staleAge) {
            localStorage.removeItem(PENDING_KEY);
            return;
        }

        const history = readHistory();
        const now = Date.now();
        const sig = pending.signature || signatureOf(pending);
        const last = history[history.length - 1];
        if (last?.signature === sig && now - Number(last?.ts || 0) < 120000) {
            if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
            if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 420);
            if (Array.isArray(riskFlags) && riskFlags.length) last.riskFlags = [...new Set(riskFlags)].slice(0, 8);
            if (paletteFingerprint && typeof paletteFingerprint === 'object') last.paletteFingerprint = paletteFingerprint;
            const normalizedFamily = normalizeInteractionFamily(interactionFamily);
            if (normalizedFamily) last.interactionFamily = normalizedFamily;
            last.visualSignatureTs = now;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
            localStorage.removeItem(PENDING_KEY);
            return;
        }

        history.push({
            ...pending,
            signature: sig,
            ts: now,
            visualSignature: visualSignature ? String(visualSignature).slice(0, 280) : pending.visualSignature,
            visualSkeleton: visualSkeleton ? String(visualSkeleton).slice(0, 420) : pending.visualSkeleton,
            riskFlags: Array.isArray(riskFlags) ? [...new Set(riskFlags)].slice(0, 8) : [],
            paletteFingerprint: paletteFingerprint && typeof paletteFingerprint === 'object' ? paletteFingerprint : undefined,
            interactionFamily: normalizeInteractionFamily(interactionFamily),
            visualSignatureTs: visualSignature || visualSkeleton || (Array.isArray(riskFlags) && riskFlags.length) || paletteFingerprint || normalizeInteractionFamily(interactionFamily) ? now : undefined,
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
        localStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.warn('[RabbitMirror] Failed to commit pending combo:', error);
    }
}

// 兼容旧调用：0.31.21 起不再在 prompt 构建时直接写入“最近历史”，只暂存为 pending。
export function setLastCombo(combo) {
    setPendingCombo(combo);
}

export function clearLastCombo() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(ATTEMPT_STORAGE_KEY);
        localStorage.removeItem(DIRECTIVE_PICK_STORAGE_KEY);
        localStorage.removeItem(FORMAT_ELIGIBLE_MISS_STORAGE_KEY);
        try {
            sessionStorage.removeItem('rabbit_mirror_theater:generation_snapshots:v1');
            sessionStorage.removeItem('rabbit_mirror_theater:active_generation_attempt:v1');
        } catch {
            // Session storage is optional in some host contexts.
        }
        // 清理旧版 key，防止旧记录混淆。
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v3');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v4');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v5');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v6');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v7');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v8');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v8');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v9');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v9');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v10');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v10');
    } catch {}
}

export function updateLatestVisualSignature(visualSignature, visualSkeleton = '', riskFlags = [], paletteFingerprint = null, interactionFamily = null) {
    if (!visualSignature && !visualSkeleton && !(Array.isArray(riskFlags) && riskFlags.length) && !paletteFingerprint && !normalizeInteractionFamily(interactionFamily)) return;
    try {
        commitPendingCombo(visualSignature, visualSkeleton, riskFlags, paletteFingerprint, interactionFamily);
        const history = readHistory();
        if (!history.length) return;
        const last = history[history.length - 1];
        if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
        if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 420);
        if (Array.isArray(riskFlags) && riskFlags.length) last.riskFlags = [...new Set(riskFlags)].slice(0, 8);
        if (paletteFingerprint && typeof paletteFingerprint === 'object') last.paletteFingerprint = paletteFingerprint;
        const normalizedFamily = normalizeInteractionFamily(interactionFamily);
        if (normalizedFamily) last.interactionFamily = normalizedFamily;
        last.visualSignatureTs = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store visual signature:', error);
    }
}
