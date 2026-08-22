import { getSettings, updateSettings } from './settings.js?rmv=1.4.30.12';
import { getCurrentChatKey, resetFormatEligibleMisses } from './storage.js?rmv=1.4.30.12';
import { THEMATIC_CATEGORIES } from '../data/structured/thematicIndex.js?rmv=1.4.30.12';
import { PRESENTATION_FORMATS } from '../data/structured/presentationIndex.js?rmv=1.4.30.12';

export const BLACKLIST_CHANGED_EVENT = 'rabbitmirror:blacklist-changed';
export const RECIPE_RECORDED_EVENT = 'rabbitmirror:recipe-recorded';
const RECIPE_STORAGE_KEY = 'rabbit_mirror_theater:selection_recipes:v1';
const MAX_RECIPE_RECORDS = 600;
const MAX_BLACKLIST_IDS = 512;
export const FAVORITE_MULTIPLIER_DEFAULT = 3;
export const FAVORITE_MULTIPLIER_MIN = 1;
export const FAVORITE_MULTIPLIER_MAX = 50;

// 1.3.69: entering a long chat can ask for the recipe of many mirrors in one install pass.
// Cache the raw localStorage payload so the same <=600 records are not JSON.parse'd once per mirror.
// The raw string is compared on every read, so external/tab changes still invalidate the cache.
let recipeRecordsCacheRaw = null;
let recipeRecordsCache = null;

const THEME_BY_ID = new Map(THEMATIC_CATEGORIES.map(item => [String(item?.id || ''), item]));
const FORMAT_BY_ID = new Map(PRESENTATION_FORMATS.map(item => [String(item?.id || ''), item]));
const LEGACY_AMBIGUOUS_FORMAT_ID = '1.3.3';
const LEGACY_AMBIGUOUS_FORMAT_TARGET_IDS = ['1.3.3.platform', '1.3.3.review'];
const LEGACY_AMBIGUOUS_FORMAT_RECIPE_ITEM = Object.freeze({
    id: LEGACY_AMBIGUOUS_FORMAT_ID,
    group: '1',
    title: '旧版 1.3.3（网站与应用平台 / 评论系统，无法区分）',
    kind: 'format',
    ambiguous: true,
});

function compactIds(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))]
        .slice(0, MAX_BLACKLIST_IDS);
}

function hashRecipeText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function recipeMessageFingerprint(message, swipeId = -1) {
    if (!message || typeof message !== 'object') return '';
    const swipe = Number(swipeId);
    const source = Number.isInteger(swipe) && swipe >= 0 && typeof message?.swipes?.[swipe] === 'string'
        ? message.swipes[swipe]
        : typeof message?.mes === 'string'
            ? message.mes
            : '';
    const stable = String(message?.send_date ?? message?.mesid ?? '');
    if (!source && !stable) return '';
    return hashRecipeText(`${stable}|${source}`);
}

function normalizeKind(kind) {
    return kind === 'format' ? 'format' : 'theme';
}

function canonicalBlacklistIds(kind, values) {
    const normalized = normalizeKind(kind);
    const source = compactIds(values);
    if (normalized !== 'format' || !source.includes(LEGACY_AMBIGUOUS_FORMAT_ID)) return source;
    const expanded = [];
    for (const id of source) {
        if (id === LEGACY_AMBIGUOUS_FORMAT_ID) expanded.push(...LEGACY_AMBIGUOUS_FORMAT_TARGET_IDS);
        else expanded.push(id);
    }
    return compactIds(expanded);
}

function blacklistTargetIds(kind, id) {
    const normalized = normalizeKind(kind);
    const value = String(id || '').trim();
    if (!value) return [];
    if (normalized === 'format' && value === LEGACY_AMBIGUOUS_FORMAT_ID) return [...LEGACY_AMBIGUOUS_FORMAT_TARGET_IDS];
    return [value];
}

function settingKeyForKind(kind) {
    return normalizeKind(kind) === 'format' ? 'blacklistedFormatIds' : 'blacklistedThemeIds';
}

function favoriteSettingKeyForKind(kind) {
    return normalizeKind(kind) === 'format' ? 'favoriteFormatIds' : 'favoriteThemeIds';
}

function favoriteMultiplierSettingKeyForKind(kind) {
    return normalizeKind(kind) === 'format' ? 'favoriteFormatMultipliers' : 'favoriteThemeMultipliers';
}

function normalizeFavoriteMultiplier(value) {
    const empty = value == null || (typeof value === 'string' && !value.trim());
    const parsed = empty ? NaN : Number(value);
    const bounded = Math.max(FAVORITE_MULTIPLIER_MIN, Math.min(FAVORITE_MULTIPLIER_MAX, Number.isFinite(parsed) ? parsed : FAVORITE_MULTIPLIER_DEFAULT));
    return Math.round(bounded * 2) / 2;
}

function favoriteMultiplierMap(kind, settings = getSettings()) {
    const normalized = normalizeKind(kind);
    const key = favoriteMultiplierSettingKeyForKind(normalized);
    const source = settings?.[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key]) ? settings[key] : {};
    return source;
}

function itemMapForKind(kind) {
    return normalizeKind(kind) === 'format' ? FORMAT_BY_ID : THEME_BY_ID;
}

function dispatchBlacklistChanged(detail = {}) {
    try {
        globalThis.dispatchEvent?.(new CustomEvent(BLACKLIST_CHANGED_EVENT, { detail }));
    } catch {
        // CustomEvent may be unavailable in restricted WebViews; settings are still updated.
    }
}

export function getBlacklistState() {
    const settings = getSettings();
    const themeIds = canonicalBlacklistIds('theme', settings.blacklistedThemeIds);
    const formatIds = canonicalBlacklistIds('format', settings.blacklistedFormatIds);
    return {
        enabled: settings.blacklistEnabled !== false,
        themeIds,
        formatIds,
        themeSet: new Set(themeIds),
        formatSet: new Set(formatIds),
    };
}

export function getFavoritesState(settings = getSettings()) {
    // 正常写入路径已经保证收藏 / 黑名单互斥。若旧备份或外部写入制造冲突，
    // 读取时让黑名单优先，避免 UI 与随机权重同时把同一项视作“收藏 + 拉黑”。
    // 这里只计算有效状态，不偷偷重写用户 settings；解除黑名单后原收藏仍可恢复。
    const blockedThemes = new Set(canonicalBlacklistIds('theme', settings.blacklistedThemeIds));
    const blockedFormats = new Set(canonicalBlacklistIds('format', settings.blacklistedFormatIds));
    const themeIds = canonicalBlacklistIds('theme', settings.favoriteThemeIds).filter(id => !blockedThemes.has(id));
    const formatIds = canonicalBlacklistIds('format', settings.favoriteFormatIds).filter(id => !blockedFormats.has(id));
    const themeSource = favoriteMultiplierMap('theme', settings);
    const formatSource = favoriteMultiplierMap('format', settings);
    const themeMultipliers = Object.fromEntries(themeIds.map(id => [id, normalizeFavoriteMultiplier(themeSource[id])]));
    const formatMultipliers = Object.fromEntries(formatIds.map(id => [id, normalizeFavoriteMultiplier(formatSource[id])]));
    return {
        themeIds,
        formatIds,
        themeSet: new Set(themeIds),
        formatSet: new Set(formatIds),
        themeMultipliers,
        formatMultipliers,
    };
}

export function getFavoriteMultiplier(kind, id, settings = getSettings()) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    if (!targets.length) return FAVORITE_MULTIPLIER_DEFAULT;
    const source = favoriteMultiplierMap(normalized, settings);
    const values = targets.map(target => normalizeFavoriteMultiplier(source[target]));
    return values.length ? Math.max(...values) : FAVORITE_MULTIPLIER_DEFAULT;
}

export function setFavoriteMultiplier(kind, id, value) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    if (!targets.length || !targets.every(target => isFavorited(normalized, target))) return null;
    const settings = getSettings();
    const key = favoriteMultiplierSettingKeyForKind(normalized);
    const current = { ...favoriteMultiplierMap(normalized, settings) };
    const multiplier = normalizeFavoriteMultiplier(value);
    for (const target of targets) current[target] = multiplier;
    updateSettings({ [key]: current });
    dispatchBlacklistChanged({ action: 'favorite-multiplier', kind: normalized, id: String(id || '').trim(), ids: targets, multiplier });
    return multiplier;
}

export function favoriteEntries(kind) {
    const normalized = normalizeKind(kind);
    const state = getFavoritesState();
    const ids = normalized === 'format' ? state.formatIds : state.themeIds;
    const map = itemMapForKind(normalized);
    return ids.map(id => {
        const item = map.get(id);
        return {
            id,
            kind: normalized,
            title: String(item?.title || id),
            group: String(item?.group || ''),
            multiplier: getFavoriteMultiplier(normalized, id),
        };
    });
}

export function selectionCatalogEntries(kind) {
    const normalized = normalizeKind(kind);
    const source = normalized === 'format' ? PRESENTATION_FORMATS : THEMATIC_CATEGORIES;
    return source.map(item => ({
        id: String(item?.id || ''),
        kind: normalized,
        title: String(item?.title || item?.id || ''),
        summary: String(item?.summary || ''),
        group: String(item?.group || ''),
    })).filter(item => item.id);
}

export function isFavorited(kind, id) {
    const value = String(id || '').trim();
    if (!value) return false;
    const state = getFavoritesState();
    const normalized = normalizeKind(kind);
    if (normalized === 'format' && value === LEGACY_AMBIGUOUS_FORMAT_ID) {
        return LEGACY_AMBIGUOUS_FORMAT_TARGET_IDS.every(targetId => state.formatSet.has(targetId));
    }
    return normalized === 'format' ? state.formatSet.has(value) : state.themeSet.has(value);
}

export function blacklistEntries(kind) {
    const normalized = normalizeKind(kind);
    const state = getBlacklistState();
    const ids = normalized === 'format' ? state.formatIds : state.themeIds;
    const map = itemMapForKind(normalized);
    return ids.map(id => {
        const item = map.get(id);
        return {
            id,
            kind: normalized,
            title: String(item?.title || id),
            group: String(item?.group || ''),
        };
    });
}

export function isBlacklisted(kind, id) {
    const value = String(id || '').trim();
    if (!value) return false;
    const state = getBlacklistState();
    const normalized = normalizeKind(kind);
    if (normalized === 'format' && value === LEGACY_AMBIGUOUS_FORMAT_ID) {
        return LEGACY_AMBIGUOUS_FORMAT_TARGET_IDS.every(targetId => state.formatSet.has(targetId));
    }
    return normalized === 'format' ? state.formatSet.has(value) : state.themeSet.has(value);
}

export function setBlacklistEnabled(enabled) {
    updateSettings({ blacklistEnabled: !!enabled });
    dispatchBlacklistChanged({ action: 'enabled', enabled: !!enabled });
    return !!enabled;
}

export function addBlacklistItem(kind, id) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    const map = itemMapForKind(normalized);
    if (!targets.length || targets.some(value => !map.has(value))) return false;
    const settings = getSettings();
    const key = settingKeyForKind(normalized);
    const favoriteKey = favoriteSettingKeyForKind(normalized);
    const multiplierKey = favoriteMultiplierSettingKeyForKind(normalized);
    const before = canonicalBlacklistIds(normalized, settings[key]);
    const beforeFavorites = canonicalBlacklistIds(normalized, settings[favoriteKey]);
    const beforeMultipliers = { ...favoriteMultiplierMap(normalized, settings) };
    const next = canonicalBlacklistIds(normalized, [...before, ...targets]);
    if (targets.some(value => !next.includes(value))) return false;
    const targetSet = new Set(targets);
    const nextFavorites = beforeFavorites.filter(value => !targetSet.has(value));
    const nextMultipliers = { ...beforeMultipliers };
    for (const target of targets) delete nextMultipliers[target];
    if (next.length === before.length && nextFavorites.length === beforeFavorites.length) return false;
    updateSettings({ [key]: next, [favoriteKey]: nextFavorites, [multiplierKey]: nextMultipliers });
    dispatchBlacklistChanged({ action: 'add', kind: normalized, id: String(id || '').trim(), ids: targets });
    return next.length !== before.length;
}

export function removeBlacklistItem(kind, id) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    if (!targets.length) return false;
    const settings = getSettings();
    const key = settingKeyForKind(normalized);
    const before = canonicalBlacklistIds(normalized, settings[key]);
    const blockedTargets = new Set(targets);
    const next = before.filter(item => !blockedTargets.has(item));
    if (next.length === before.length) return false;
    updateSettings({ [key]: next });
    if (normalized === 'format') resetFormatEligibleMisses(targets);
    dispatchBlacklistChanged({ action: 'remove', kind: normalized, id: String(id || '').trim(), ids: targets });
    return true;
}

export function toggleBlacklistItem(kind, id) {
    // 1.3.69: 原本无论 add/remove 是否真的成功都固定返回 true/false，调用方据此弹
    // 「已加入黑名单」的成功提示。addBlacklistItem 在 id 不在索引里（例如索引升级后
    // 旧 id 失效、或 kind 传错）时会返回 false，于是出现「提示说加进去了，面板重绘后
    // 按钮又变回未拉黑」。这里如实返回操作后的真实状态。
    if (isBlacklisted(kind, id)) {
        removeBlacklistItem(kind, id);
        return isBlacklisted(kind, id);
    }
    addBlacklistItem(kind, id);
    return isBlacklisted(kind, id);
}

export function addFavoriteItem(kind, id) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    const map = itemMapForKind(normalized);
    if (!targets.length || targets.some(value => !map.has(value))) return false;
    const settings = getSettings();
    const favoriteKey = favoriteSettingKeyForKind(normalized);
    const blacklistKey = settingKeyForKind(normalized);
    const before = canonicalBlacklistIds(normalized, settings[favoriteKey]);
    const beforeBlocked = canonicalBlacklistIds(normalized, settings[blacklistKey]);
    const next = canonicalBlacklistIds(normalized, [...before, ...targets]);
    if (targets.some(value => !next.includes(value))) return false;
    const targetSet = new Set(targets);
    const nextBlocked = beforeBlocked.filter(value => !targetSet.has(value));
    if (next.length === before.length && nextBlocked.length === beforeBlocked.length) return false;
    updateSettings({ [favoriteKey]: next, [blacklistKey]: nextBlocked });
    if (normalized === 'format' && nextBlocked.length !== beforeBlocked.length) resetFormatEligibleMisses(targets);
    if (nextBlocked.length !== beforeBlocked.length) dispatchBlacklistChanged({ action: 'remove-conflict', kind: normalized, id: String(id || '').trim(), ids: targets });
    return next.length !== before.length;
}

export function removeFavoriteItem(kind, id) {
    const normalized = normalizeKind(kind);
    const targets = blacklistTargetIds(normalized, id);
    if (!targets.length) return false;
    const settings = getSettings();
    const key = favoriteSettingKeyForKind(normalized);
    const multiplierKey = favoriteMultiplierSettingKeyForKind(normalized);
    const before = canonicalBlacklistIds(normalized, settings[key]);
    const targetSet = new Set(targets);
    const next = before.filter(value => !targetSet.has(value));
    if (next.length === before.length) return false;
    const nextMultipliers = { ...favoriteMultiplierMap(normalized, settings) };
    for (const target of targets) delete nextMultipliers[target];
    updateSettings({ [key]: next, [multiplierKey]: nextMultipliers });
    return true;
}

export function toggleFavoriteItem(kind, id) {
    if (isFavorited(kind, id)) {
        removeFavoriteItem(kind, id);
        return isFavorited(kind, id);
    }
    addFavoriteItem(kind, id);
    return isFavorited(kind, id);
}

export function clearFavorites(kind = 'all') {
    const normalized = String(kind || 'all');
    const patch = {};
    if (normalized === 'all' || normalized === 'theme') {
        patch.favoriteThemeIds = [];
        patch.favoriteThemeMultipliers = {};
    }
    if (normalized === 'all' || normalized === 'format') {
        patch.favoriteFormatIds = [];
        patch.favoriteFormatMultipliers = {};
    }
    if (!Object.keys(patch).length) return false;
    updateSettings(patch);
    return true;
}

export function clearBlacklist(kind = 'all') {
    const normalized = String(kind || 'all');
    const patch = {};
    const settings = getSettings();
    const clearedFormatIds = normalized === 'all' || normalized === 'format'
        ? canonicalBlacklistIds('format', settings.blacklistedFormatIds)
        : [];
    if (normalized === 'all' || normalized === 'theme') patch.blacklistedThemeIds = [];
    if (normalized === 'all' || normalized === 'format') patch.blacklistedFormatIds = [];
    if (!Object.keys(patch).length) return false;
    updateSettings(patch);
    if (clearedFormatIds.length) resetFormatEligibleMisses(clearedFormatIds);
    dispatchBlacklistChanged({ action: 'clear', kind: normalized });
    return true;
}

export function filterRandomThemePool(pool, settings = getSettings()) {
    const items = Array.isArray(pool) ? pool : [];
    if (settings?.blacklistEnabled === false) return [...items];
    const blocked = new Set(canonicalBlacklistIds('theme', settings?.blacklistedThemeIds));
    return blocked.size ? items.filter(item => !blocked.has(String(item?.id || ''))) : [...items];
}

export function filterRandomFormatPool(pool, settings = getSettings()) {
    const items = Array.isArray(pool) ? pool : [];
    if (settings?.blacklistEnabled === false) return [...items];
    const blocked = new Set(canonicalBlacklistIds('format', settings?.blacklistedFormatIds));
    return blocked.size ? items.filter(item => !blocked.has(String(item?.id || ''))) : [...items];
}

function compactSelectionMetadata(metadata = {}) {
    const themeIds = compactIds(metadata?.themeIds).filter(id => THEME_BY_ID.has(id));
    const formatIds = compactIds(metadata?.formatIds).filter(id => FORMAT_BY_ID.has(id));
    if (!themeIds.length && !formatIds.length) return null;
    return {
        themeIds,
        formatIds,
        samplingMode: String(metadata?.samplingMode || 'classic'),
        userDirectiveApplied: !!metadata?.userDirectiveApplied,
        forcedVisualScenery: !!metadata?.forcedVisualScenery || !!metadata?.visualSceneryMode,
    };
}

function readRecipeRecords() {
    try {
        const raw = localStorage.getItem(RECIPE_STORAGE_KEY) || '[]';
        if (raw === recipeRecordsCacheRaw && Array.isArray(recipeRecordsCache)) return recipeRecordsCache;
        const parsed = JSON.parse(raw);
        const normalized = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
        recipeRecordsCacheRaw = raw;
        recipeRecordsCache = normalized;
        return normalized;
    } catch {
        recipeRecordsCacheRaw = null;
        recipeRecordsCache = null;
        return [];
    }
}

function writeRecipeRecords(records) {
    try {
        const normalized = (records || []).slice(-MAX_RECIPE_RECORDS);
        const raw = JSON.stringify(normalized);
        localStorage.setItem(RECIPE_STORAGE_KEY, raw);
        recipeRecordsCacheRaw = raw;
        recipeRecordsCache = normalized;
        return true;
    } catch {
        return false;
    }
}

function recipeRecordKey(chatKey, messageIndex, swipeId) {
    return `${String(chatKey || '')}|m:${Number(messageIndex)}|s:${Number(swipeId)}`;
}

function normalizeSwipeId(message, fallback = 0) {
    if (Number.isInteger(message?.swipe_id) && message.swipe_id >= 0) return message.swipe_id;
    const value = Number(fallback);
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function recordRabbitMirrorRecipe({ chat = null, chatKey = '', messageIndex = -1, swipeId = 0, message = null, metadata = null, source = '' } = {}) {
    const compact = compactSelectionMetadata(metadata);
    const index = Number(messageIndex);
    if (!compact || !Number.isInteger(index) || index < 0) return false;
    const resolvedChatKey = String(chatKey || getCurrentChatKey(Array.isArray(chat) ? chat : null) || '').trim();
    if (!resolvedChatKey) return false;
    const resolvedSwipe = normalizeSwipeId(message, swipeId);
    const messageFingerprint = recipeMessageFingerprint(message, resolvedSwipe);
    const key = recipeRecordKey(resolvedChatKey, index, resolvedSwipe);
    const existingRecords = readRecipeRecords();
    const existing = [...existingRecords].reverse().find(item => item?.key === key) || null;
    const sourceText = String(source || '');
    const unchanged = existing
        && JSON.stringify(existing.themeIds || []) === JSON.stringify(compact.themeIds)
        && JSON.stringify(existing.formatIds || []) === JSON.stringify(compact.formatIds)
        && String(existing.samplingMode || '') === compact.samplingMode
        && !!existing.userDirectiveApplied === compact.userDirectiveApplied
        && !!existing.forcedVisualScenery === compact.forcedVisualScenery
        && String(existing.source || '') === sourceText
        && String(existing.messageFingerprint || '') === messageFingerprint;
    if (unchanged) return true;
    const records = existingRecords.filter(item => item?.key !== key);
    records.push({
        key,
        chatKey: resolvedChatKey,
        messageIndex: index,
        swipeId: resolvedSwipe,
        source: sourceText,
        messageFingerprint,
        ...compact,
        ts: Date.now(),
    });
    const written = writeRecipeRecords(records);
    if (written) {
        try { globalThis.dispatchEvent?.(new CustomEvent(RECIPE_RECORDED_EVENT, { detail: { chatKey: resolvedChatKey, messageIndex: index, swipeId: resolvedSwipe } })); } catch {}
    }
    return written;
}

export function getRabbitMirrorRecipe({ chatKey = '', messageIndex = -1, swipeId = -1, message = null } = {}) {
    const resolvedChatKey = String(chatKey || '').trim();
    const index = Number(messageIndex);
    if (!resolvedChatKey || !Number.isInteger(index) || index < 0) return null;
    const swipe = Number(swipeId);
    const records = readRecipeRecords();
    if (Number.isInteger(swipe) && swipe >= 0) {
        // Swipe 已知：只认这一条 swipe 自己的记录。
        // 1.3.69: 原本在找不到精确记录时会回落到「同一条消息的任意 swipe」，于是新
        // swipe（旧版本生成、或记录写入失败）会显示上一个 swipe 的抽签结果，用户据此
        // 拉黑的其实是别的兔子镜用过的项目。这与「按聊天 + 消息 + Swipe 绑定」
        // 「不会伪造本轮抽签」的设计承诺直接冲突，因此不再跨 swipe 回落。
        const exactKey = recipeRecordKey(resolvedChatKey, index, swipe);
        const exact = [...records].reverse().find(item => item?.key === exactKey);
        if (!exact) return null;
        const currentFingerprint = recipeMessageFingerprint(message, swipe);
        if (exact.messageFingerprint && currentFingerprint && exact.messageFingerprint !== currentFingerprint) return null;
        return decorateRecipe(exact);
    }
    // 只有在调用方压根无法确定 swipe（传入 -1）时，才退回该消息最近的一条记录。
    const fallback = [...records].reverse().find(item => item?.chatKey === resolvedChatKey && Number(item?.messageIndex) === index);
    if (!fallback) return null;
    const currentFingerprint = recipeMessageFingerprint(message, Number(fallback?.swipeId));
    if (fallback.messageFingerprint && currentFingerprint && fallback.messageFingerprint !== currentFingerprint) return null;
    return decorateRecipe(fallback);
}

function decorateRecipe(record) {
    const themes = compactIds(record?.themeIds).map(id => {
        const item = THEME_BY_ID.get(id);
        return item ? { id, title: String(item.title || id), group: String(item.group || ''), kind: 'theme' } : null;
    }).filter(Boolean);
    const formats = compactIds(record?.formatIds).map(id => {
        const item = FORMAT_BY_ID.get(id);
        if (item) return { id, title: String(item.title || id), group: String(item.group || ''), kind: 'format' };
        if (id === LEGACY_AMBIGUOUS_FORMAT_ID) return { ...LEGACY_AMBIGUOUS_FORMAT_RECIPE_ITEM };
        return null;
    }).filter(Boolean);
    if (!themes.length && !formats.length) return null;
    return {
        ...record,
        themes,
        formats,
    };
}

export function blacklistPoolStats() {
    const state = getBlacklistState();
    const themeBlocked = state.themeIds.filter(id => THEME_BY_ID.has(id)).length;
    const formatBlocked = state.formatIds.filter(id => FORMAT_BY_ID.has(id)).length;
    return {
        themeTotal: THEMATIC_CATEGORIES.length,
        formatTotal: PRESENTATION_FORMATS.length,
        themeBlocked,
        formatBlocked,
        // 1.3.69: 设置页的「候选已全部拉黑」警告改用实际随机池判断。当前 allowByMode
        // 对非 off 模式是直通的，两者相等；但一旦模式重新参与过滤，只比较总数会在
        // 「该模式下的候选已被拉黑光」时漏报，随机主题静默变空却没有任何提示。
        // A paused blacklist keeps the saved IDs but does not filter the random pool.
        // Do not warn that the pool is empty while blacklist filtering is disabled.
        themePoolEmpty: state.enabled && themeBlocked >= THEMATIC_CATEGORIES.length,
        formatPoolEmpty: state.enabled && formatBlocked >= PRESENTATION_FORMATS.length,
    };
}
