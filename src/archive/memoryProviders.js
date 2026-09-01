// Versioned, read-only memory provider registry.  Registered adapters are explicit;
// heuristic global readers remain a separate opt-in compatibility path in repository.js.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as archive_sourceLedger from './sourceLedger.js';

export const MEMORY_PROVIDER_REGISTRY = Object.freeze([
    Object.freeze({ id: 'sillytavern-memory', adapterVersion: 1, label: 'SillyTavern Memory', mode: 'passive-current-chat' }),
    Object.freeze({ id: 'baibai-book-public-api', adapterVersion: 1, label: '柏宝书记忆', mode: 'public-current-chat-api-v1' }),
    Object.freeze({ id: 'evermind-current-chat-api', adapterVersion: 1, label: 'EverMind', mode: 'authenticated-current-chat-api' }),
]);

export function registeredMemoryProvider(id) {
    return MEMORY_PROVIDER_REGISTRY.find(item => item.id === id) || null;
}

function safeOwn(object, key) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    } catch { return undefined; }
}

function safeMethod(object, key) {
    const value = safeOwn(object, key);
    return typeof value === 'function' ? value : null;
}

function comparable(value) {
    return core_context.comparableChatId(value);
}

function chatIdFrom(value) {
    const chat = safeOwn(value, 'chat');
    return comparable(safeOwn(value, 'chatId') ?? safeOwn(value, 'currentChatId')
        ?? safeOwn(chat, 'id') ?? safeOwn(chat, 'chatId') ?? safeOwn(chat, 'fileId') ?? safeOwn(chat, 'file_id'));
}

function apiName(api, fallback) {
    for (const key of ['displayName', 'pluginName', 'extensionName', 'name', 'id']) {
        const text = core_text.normalizeText(safeOwn(api, key), 120);
        if (text) return text;
    }
    return core_text.normalizeText(fallback, 120);
}

export function findBaiBaiBookPublicApi(root = globalThis) {
    const api = safeOwn(root, 'STBaiBaiBook');
    if (!api || (typeof api !== 'object' && typeof api !== 'function')) return null;
    if (safeOwn(api, 'apiVersion') !== 1) return null;
    const getHistory = safeMethod(api, 'getHistory');
    const getInjectedHistory = safeMethod(api, 'getInjectedHistory');
    const getSnapshot = safeMethod(api, 'getSnapshot');
    if (!getSnapshot || (!getHistory && !getInjectedHistory)) return null;
    return {
        key: 'STBaiBaiBook',
        api,
        apiVersion: 1,
        pluginVersion: core_text.normalizeText(safeOwn(api, 'pluginVersion'), 80) || 'unknown',
        name: '柏宝书记忆',
        getHistory: getHistory || getInjectedHistory,
        getSnapshot,
        historyMode: getHistory ? 'full-history' : 'injected-subset',
    };
}

// Backward-compatible export for internal callers from pre-r46 development builds.
export const findBaibaoPublicApi = findBaiBaiBookPublicApi;

function recordText(value) {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    for (const key of ['relativeText', 'content', 'text', 'memoryText', 'historyText', 'summary', 'memory']) {
        const candidate = safeOwn(value, key);
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return '';
}

function recordsFromContainer(value, provider, revision, out = []) {
    const containerKeys = ['nodes', 'memories', 'history', 'entries', 'records', 'items', 'data', 'result'];
    const stack = [value];
    const seenObjects = new WeakSet();
    let visited = 0;
    let truncated = false;
    const reasons = new Set();
    while (stack.length) {
        if (out.length >= core_constants.MAX_MEMORY_SOURCE_LEDGER_RECORDS) {
            truncated = true;
            reasons.add(`${core_constants.MAX_MEMORY_SOURCE_LEDGER_RECORDS} 条本地记录上限`);
            break;
        }
        const current = stack.pop();
        if (current == null) continue;
        visited += 1;
        if (visited > 100000) {
            truncated = true;
            reasons.add('100000 个数据节点安全上限');
            break;
        }
        if (Array.isArray(current)) {
            if (seenObjects.has(current)) {
                truncated = true;
                reasons.add('循环数据分支');
                continue;
            }
            seenObjects.add(current);
            for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
            continue;
        }
        if (typeof current === 'string') {
            const content = current.trim();
            if (content) out.push({ provider, providerVersion: 'public-api-v1', revision, content });
            continue;
        }
        if (typeof current !== 'object') continue;
        if (seenObjects.has(current)) {
            truncated = true;
            reasons.add('循环数据分支');
            continue;
        }
        seenObjects.add(current);
        const children = [];
        for (const key of containerKeys) {
            const child = safeOwn(current, key);
            if (child != null) children.push(child);
        }
        const content = recordText(current);
        if (content && !children.length) {
            out.push({
                provider,
                providerVersion: 'public-api-v1',
                sourceId: archive_sourceLedger.normalizeMemorySourceId(safeOwn(current, 'sourceId') ?? safeOwn(current, 'id') ?? safeOwn(current, 'uid') ?? safeOwn(current, 'uuid') ?? safeOwn(current, 'nodeId')),
                revision: archive_sourceLedger.normalizeMemorySourceRevision(safeOwn(current, 'revision') ?? safeOwn(current, 'version')) || revision,
                type: core_text.normalizeText(safeOwn(current, 'type') ?? safeOwn(current, 'category'), 80),
                date: core_text.normalizeText(safeOwn(current, 'date') ?? safeOwn(current, 'timestamp') ?? safeOwn(current, 'createdAt'), 100),
                title: core_text.normalizeText(safeOwn(current, 'title') ?? safeOwn(current, 'name'), 180),
                content,
            });
        }
        for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
    return { records: out, truncated, reason: [...reasons].join('、') };
}

function normalizeCoverage(value, returned) {
    const raw = safeOwn(value, 'coverage');
    const coverage = raw && typeof raw === 'object' ? raw : {};
    const truncated = safeOwn(coverage, 'truncated') === true || safeOwn(value, 'truncated') === true;
    const complete = safeOwn(coverage, 'complete') === true || safeOwn(value, 'complete') === true;
    const explicitlyIncomplete = safeOwn(coverage, 'complete') === false || safeOwn(value, 'complete') === false;
    const totalValue = safeOwn(coverage, 'total') ?? safeOwn(value, 'total');
    const total = Number.isFinite(Number(totalValue)) ? Math.max(0, Math.floor(Number(totalValue))) : null;
    const status = truncated ? 'truncated'
        : complete || (!explicitlyIncomplete && total != null && returned >= total) ? 'complete' : 'partial';
    const missingAiFloors = Array.isArray(safeOwn(coverage, 'missingAiFloors'))
        ? safeOwn(coverage, 'missingAiFloors').filter(item => Number.isInteger(Number(item)))
        : [];
    return {
        status,
        returned,
        total,
        reason: core_text.normalizeText(
            safeOwn(coverage, 'reason') ?? safeOwn(value, 'coverageReason')
                ?? (missingAiFloors.length ? `缺少 ${missingAiFloors.length} 个应有摘要楼层` : ''),
            240,
        ),
        missingAiFloors,
    };
}

export async function readBaiBaiBookCurrentChat(provider, expectedChatId, signal) {
    if (!provider?.api || provider.apiVersion !== 1
        || typeof provider.getHistory !== 'function' || typeof provider.getSnapshot !== 'function') return null;
    const readPair = async () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return Promise.all([
            Promise.resolve(provider.getHistory.call(provider.api)),
            Promise.resolve(provider.getSnapshot.call(provider.api)),
        ]);
    };
    let [history, snapshot] = await readPair();
    const historyRevision = () => archive_sourceLedger.normalizeMemorySourceRevision(safeOwn(history, 'revision'));
    const snapshotRevision = () => archive_sourceLedger.normalizeMemorySourceRevision(safeOwn(snapshot, 'revision'));
    if (!historyRevision() || !snapshotRevision() || historyRevision() !== snapshotRevision()) {
        [history, snapshot] = await readPair();
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!historyRevision() || !snapshotRevision() || historyRevision() !== snapshotRevision()) {
        throw new Error('柏宝书记忆读取期间发生版本变化，已拒绝混合两个时刻的数据。');
    }
    const wanted = comparable(expectedChatId);
    const ids = [chatIdFrom(history), chatIdFrom(snapshot)].filter(Boolean);
    if (!wanted || !ids.length) throw new Error('柏宝书记忆没有返回 current-chat 身份，已拒绝读取。');
    if (ids.some(id => id !== wanted)) throw new Error('柏宝书记忆返回了另一个聊天窗口，已拒绝读取。');
    const revision = snapshotRevision();
    const pluginVersion = core_text.normalizeText(
        safeOwn(snapshot, 'pluginVersion') ?? safeOwn(history, 'pluginVersion') ?? provider.pluginVersion,
        80,
    ) || 'unknown';
    const records = [];
    // getSnapshot authenticates current-chat identity and coverage. Historical text
    // comes only from getHistory/getInjectedHistory; snapshot state must not be
    // misrepresented as events that already happened.
    const localRead = recordsFromContainer(history, 'baibai-book-public-api', revision, records);
    if (!records.length) {
        const content = recordText(history);
        if (content) records.push({
            provider: 'baibai-book-public-api',
            providerVersion: pluginVersion,
            sourceId: `baibai:history:${revision}`,
            revision,
            type: 'history',
            content,
        });
    }
    const deduped = [];
    const seen = new Set();
    for (const item of records) {
        const key = item.sourceId ? `${item.sourceId}\u001f${item.revision}` : item.content.replace(/\s+/g, ' ').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        item.providerVersion = pluginVersion;
        deduped.push(item);
    }
    const coverageSource = safeOwn(history, 'coverage') != null ? history : snapshot;
    const coverage = normalizeCoverage(coverageSource, deduped.length);
    if (localRead.truncated) {
        coverage.status = 'truncated';
        const reason = `心跳回忆读取达到${localRead.reason || '本地安全上限'}，其余内容未静默冒充完整`;
        coverage.reason = coverage.reason ? `${coverage.reason}；${reason}` : reason;
    }
    if (provider.historyMode === 'injected-subset') {
        coverage.status = coverage.status === 'truncated' ? 'truncated' : 'partial';
        coverage.reason = coverage.reason || '仅返回正常注入口径，滑动窗口内的近期正文不在此来源中';
    }
    return {
        provider: 'baibai-book-public-api',
        providerVersion: pluginVersion,
        apiVersion: 1,
        label: provider.name || '柏宝书记忆',
        revision,
        records: deduped,
        coverage,
    };
}

export const readBaibaoCurrentChat = readBaiBaiBookCurrentChat;

export function stMemoryCurrentChatBatch(context, expectedChatId) {
    const content = String(context?.extensionPrompts?.['1_memory']?.value ?? '').replace(/\u0000/g, '').trim();
    if (!content) return null;
    const chatId = comparable(core_context.getChatId(context));
    if (!chatId || chatId !== comparable(expectedChatId)) throw new Error('SillyTavern Memory 当前聊天身份已变化。');
    const revision = `${core_text.hashString(content).toString(36).replace('-', 'n')}`;
    return {
        provider: 'sillytavern-memory',
        providerVersion: '1',
        label: 'SillyTavern Memory',
        revision,
        records: [{ provider: 'sillytavern-memory', providerVersion: '1', sourceId: 'st:1_memory', revision, type: 'summary', content }],
        coverage: { status: 'partial', returned: 1, total: null, reason: '当前提示中已注入的摘要，不代表完整记忆库' },
    };
}
