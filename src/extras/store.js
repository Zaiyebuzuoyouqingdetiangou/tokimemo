// 朋友情报 / 他在等你：每个聊天窗口一份小数据。
// 写入顺序与外貌设定相同：先写本机副本，再交给酒馆的 debounced metadata；从不直接 saveChat。
// 生成完成时如果用户已经切到别的聊天，只写本机副本，回到原聊天时合并，不会写进别的窗口。
import * as core_context from '../core/context.js';
import * as archive_repository from '../archive/repository.js';
import * as core_text from '../core/text.js';

export const EXTRAS_KEY = 'heartbeatMemoriesExtrasV1';
const LOCAL_PREFIX = 'heartbeatMemoriesExtrasV1:';
const pendingByScope = new Map();
const volatileByScope = new Map();
let recordSequence = 0;
export const MAX_INTEL_RECORDS = Infinity;
export const MAX_WAITING_RECORDS = Infinity;
export const WAITING_DAY_OPTIONS = Object.freeze([3, 7, 14]);

export function extraRecordId(prefix = 'EXTRA') {
    const unique = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}_${(++recordSequence).toString(36)}_${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${unique}`;
}

export function defaultWaitingSettings() {
    return { enabled: false, days: 7, showInbox: true, showRoom: true };
}

function emptyExtras() {
    return { version: 1, updatedAt: 0, intel: [], waiting: { settings: defaultWaitingSettings(), records: [] } };
}

function normalizeWaitingSettings(value) {
    const base = defaultWaitingSettings();
    const source = value && typeof value === 'object' ? value : {};
    const days = Number(source.days);
    return {
        enabled: source.enabled === true,
        days: WAITING_DAY_OPTIONS.includes(days) ? days : base.days,
        showInbox: source.showInbox !== false,
        showRoom: source.showRoom !== false,
    };
}

export function normalizeExtras(value) {
    const out = emptyExtras();
    if (!value || typeof value !== 'object') return out;
    out.updatedAt = Math.max(0, Number(value.updatedAt) || 0);
    out.intel = (Array.isArray(value.intel) ? value.intel : []).filter(item => item && typeof item === 'object' && item.id)
        .slice(0, MAX_INTEL_RECORDS);
    const waiting = value.waiting && typeof value.waiting === 'object' ? value.waiting : {};
    out.waiting = {
        settings: normalizeWaitingSettings(waiting.settings),
        settingsUpdatedAt: Math.max(0, Number(waiting.settingsUpdatedAt) || 0),
        records: (Array.isArray(waiting.records) ? waiting.records : []).filter(item => item && typeof item === 'object' && item.id)
            .slice(0, MAX_WAITING_RECORDS),
    };
    return out;
}

function localKey(scope) {
    return LOCAL_PREFIX + core_text.normalizeText(scope, 400);
}

function readLocal(scope) {
    try {
        const raw = globalThis.localStorage?.getItem(localKey(scope));
        if (typeof raw !== 'string') return null;
        return normalizeExtras(JSON.parse(raw));
    } catch { return null; }
}

function writeLocal(scope, value) {
    try {
        const serialized = JSON.stringify(value);
        globalThis.localStorage?.setItem(localKey(scope), serialized);
        return globalThis.localStorage?.getItem(localKey(scope)) === serialized;
    } catch { return false; }
}

function mergeById(left = [], right = [], limit) {
    const map = new Map();
    for (const item of [...left, ...right]) {
        const previous = map.get(item.id);
        if (!previous || (Number(item.updatedAt || item.createdAt) || 0) >= (Number(previous.updatedAt || previous.createdAt) || 0)) map.set(item.id, item);
    }
    return [...map.values()].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, limit);
}

function mergeExtras(a, b) {
    const left = normalizeExtras(a);
    const right = normalizeExtras(b);
    const settingsSource = (right.waiting.settingsUpdatedAt || 0) >= (left.waiting.settingsUpdatedAt || 0) ? right.waiting : left.waiting;
    return {
        version: 1,
        updatedAt: Math.max(left.updatedAt, right.updatedAt),
        intel: mergeById(left.intel, right.intel, MAX_INTEL_RECORDS),
        waiting: {
            settings: { ...settingsSource.settings },
            settingsUpdatedAt: settingsSource.settingsUpdatedAt || 0,
            records: mergeById(left.waiting.records, right.waiting.records, MAX_WAITING_RECORDS),
        },
    };
}

export function extrasScope(context = core_context.currentCharacterGuard()) {
    return core_context.chatScopeKey(context);
}

export function readExtras(context = core_context.currentCharacterGuard()) {
    const scope = extrasScope(context);
    const stored = context?.chatMetadata?.[EXTRAS_KEY];
    return mergeExtras(mergeExtras(stored, readLocal(scope)), volatileByScope.get(scope));
}

// mutate 收到一份拷贝，改完返回；scope 不是当前聊天时只落本机副本。
export function updateExtras(scope, mutate) {
    let live = null;
    try { live = core_context.currentCharacterGuard(); } catch { live = null; }
    const isLive = !!live && extrasScope(live) === scope;
    const base = isLive ? readExtras(live) : mergeExtras(volatileByScope.get(scope), readLocal(scope));
    const next = normalizeExtras(mutate(structuredClone(base)) || base);
    next.updatedAt = Date.now();
    volatileByScope.set(scope, structuredClone(next));
    const localSaved = writeLocal(scope, next);
    if (isLive) {
        live.chatMetadata[EXTRAS_KEY] = next;
        try { Promise.resolve(live.saveMetadataDebounced?.()).catch(() => {}); } catch { /* Keep the local/volatile copy. */ }
    }
    if (!localSaved) throw core_text.safeUserError('本机保存未确认，改动暂留在当前页面；请先导出备份，不要刷新。', 'RMT_EXTRAS_SAVE_FAILED');
    return next;
}

// Keep paid responses independently of the active chat. Only confirmed local
// writes count as durable: a debounced metadata call is not a disk receipt.
function pendingKey(scope) { return localKey(scope) + ':pending'; }

export function pendingExtras(scope) {
    const rows = new Map();
    try {
        const saved = JSON.parse(globalThis.localStorage?.getItem(pendingKey(scope)) || '[]');
        for (const item of Array.isArray(saved) ? saved : []) {
            if (item?.id && item.scope === scope && ['intel', 'waiting'].includes(item.kind)) rows.set(item.id, item);
        }
    } catch { /* In-memory results remain available when storage is unavailable. */ }
    for (const item of pendingByScope.get(scope) || []) rows.set(item.id, item);
    const result = [...rows.values()];
    pendingByScope.set(scope, result);
    return structuredClone(result);
}

function writePending(scope, rows) {
    pendingByScope.set(scope, structuredClone(rows));
    try {
        const raw = JSON.stringify(rows);
        globalThis.localStorage?.setItem(pendingKey(scope), raw);
        return globalThis.localStorage?.getItem(pendingKey(scope)) === raw;
    } catch { return false; }
}

export function stageExtraResult({ scope, kind, origin, base, record, raw }) {
    const item = { id: record?.id || extraRecordId(), scope, kind,
        origin: structuredClone(origin), base: normalizeExtras(base), record: record || null, raw,
        createdAt: Date.now() };
    const durable = writePending(scope, [...pendingExtras(scope), item]);
    return { item, durable };
}

export async function retryExtraSave(scope, id) {
    const item = pendingExtras(scope).find(row => row.id === id);
    if (!item) return { pending: false, scope };
    const held = reason => ({ pending: true, scope, record: item.record, reason,
        durable: writePending(scope, pendingExtras(scope)) });
    if (!item.record) return held('结果格式需要检查，请导出原始结果；不会自动重新生成。');
    let live;
    try { live = core_context.currentCharacterGuard(); } catch { return held('回到原聊天后可仅重试保存。'); }
    if (extrasScope(live) !== scope || !core_context.deferredCommitOriginMatchesContext(item.origin, live)) {
        return held('回到原角色、原聊天后可仅重试保存。');
    }
    let memory;
    try { memory = archive_repository.requireArchive(live); } catch { return held('原档案已不可用，结果保留供导出。'); }
    if (!item.origin.archiveRevision || memory.archiveRevision !== item.origin.archiveRevision) {
        return held('档案版本已改变，结果保留供导出，不写入新版档案。');
    }
    const next = mergeExtras(item.base, readExtras(live));
    if (item.kind === 'intel') next.intel = mergeById(next.intel, [item.record], Infinity);
    else next.waiting.records = mergeById(next.waiting.records, [item.record], Infinity);
    next.updatedAt = Date.now();
    volatileByScope.set(scope, structuredClone(next));
    const saved = writeLocal(scope, next);
    live.chatMetadata[EXTRAS_KEY] = next;
    try { await live.saveMetadataDebounced?.(); } catch { /* Confirmed local copy can restore the result. */ }
    if (!saved) return held('保存未确认；结果暂留当前页面，可仅重试保存或导出。请勿刷新。');
    writePending(scope, pendingExtras(scope).filter(row => row.id !== id));
    return { pending: false, scope, record: item.record, durable: true };
}

export function exportExtras(context = core_context.currentCharacterGuard()) {
    const scope = extrasScope(context);
    return JSON.stringify({ version: 1, scope, extras: readExtras(context), pending: pendingExtras(scope) }, null, 2);
}
