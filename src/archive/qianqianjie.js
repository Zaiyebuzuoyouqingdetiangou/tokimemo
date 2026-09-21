// https://github.com/atonal519/ST-MyriadKnots/blob/main/docs/public-api.md
// Only the documented current-chat bridge is used. Never read the backend/metadata,
// trigger generation or use CSE/person profiles as proof of historical events.
import * as constants from '../core/constants.js';
import * as contextApi from '../core/context.js';
import * as text from '../core/text.js';
import * as ledger from './sourceLedger.js';
import * as readGuard from './sourceReadGuard.js';

export const QQJ_PROVIDER = 'qianqianjie-public-api';
export const QQJ_BRIDGE = 'qqj_v3_public_bridge_v1';
const own = (value, key) => {
    try { const d = value && Object.getOwnPropertyDescriptor(value, key); return d && 'value' in d ? d.value : undefined; }
    catch { return undefined; }
};
const primitive = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const identityOf = value => {
    const identity = own(value, 'identity');
    return Object.fromEntries(['hostChatId', 'qqjChatId', 'characterLocator', 'personaLocator'].map(key => [key, primitive(own(identity, key))]));
};
const sameIdentity = (a, b) => ['hostChatId', 'qqjChatId', 'characterLocator', 'personaLocator'].every(key => a[key] === b[key]);
export function findQianQianJiePublicApi(root = globalThis) {
    const api = own(root, QQJ_BRIDGE);
    if (!api || own(api, 'schemaVersion') !== 1 || own(api, 'kind') !== 'qqj-public-memory-bridge') return null;
    if (typeof own(api, 'getStatus') !== 'function' || typeof own(api, 'getSnapshot') !== 'function') return null;
    return api;
}
const STATUS_TEXT = Object.freeze({
    'api-unavailable': '千千结公开接口未加载或版本不支持', disabled: '千千结当前已关闭',
    'not-ready': '千千结当前聊天或摘要尚未加载，请在千千结确认后重新扫描',
    syncing: '千千结摘要尚未就绪，请稍后重新扫描', unavailable: '千千结暂无可读摘要',
    error: '千千结摘要读取失败', 'read-failed': '千千结摘要读取失败',
    'timed-out': '等待千千结公开接口超时', stale: '千千结聊天或记忆身份已变化，本次结果未采用',
});
function unavailable(status) {
    return { provider: QQJ_PROVIDER, label: '千千结', sourceKind: 'public-current-chat-api-v1', providerVersion: '1', records: [], readStatus: status,
        coverage: { status: 'failed', returned: 0, total: null, reason: STATUS_TEXT[status] || STATUS_TEXT['not-ready'] } };
}
function hostMatches(identity, context) {
    const persona = String(context?.userAvatar ?? context?.personaAvatar ?? context?.user_avatar ?? globalThis.user_avatar ?? '').trim();
    return identity.hostChatId && identity.qqjChatId && identity.characterLocator
        && contextApi.comparableChatId(identity.hostChatId) === contextApi.comparableChatId(contextApi.getChatId(context))
        && identity.characterLocator === contextApi.currentCharacterAvatar(context)
        && (!persona || identity.personaLocator === persona);
}

export async function readQianQianJieCurrentChat(context, { signal = null, assertCurrent = () => {}, root = globalThis, timeoutMs = 15000 } = {}) {
    assertCurrent();
    const api = findQianQianJiePublicApi(root);
    if (!api) return unavailable('api-unavailable');
    try {
        const status = own(api, 'getStatus').call(api);
        if (own(status, 'status') !== 'ready') return unavailable(primitive(own(status, 'status')) || 'not-ready');
        const identity = identityOf(status);
        if (!hostMatches(identity, context)) return unavailable('stale');
        const snapshot = await readGuard.boundedSourceRead(() => own(api, 'getSnapshot').call(api), signal, timeoutMs);
        assertCurrent();
        if (findQianQianJiePublicApi(root) !== api) return unavailable('stale');
        const after = own(api, 'getStatus').call(api);
        if (own(after, 'status') !== 'ready' || !sameIdentity(identity, identityOf(after))
            || !sameIdentity(identity, identityOf(snapshot)) || !hostMatches(identity, context)) return unavailable('stale');
        if (own(snapshot, 'status') !== 'ready') return unavailable(primitive(own(snapshot, 'status')) || 'not-ready');
        const memory = own(snapshot, 'memory');
        if (own(memory, 'status') !== 'ready') return unavailable(primitive(own(memory, 'status')) || 'not-ready');
        const floors = own(memory, 'floors'), checkpoint = primitive(own(memory, 'headCheckpointId')) || (Array.isArray(floors) && floors.length === 0 ? 'empty' : '');
        if (!Array.isArray(floors) || !checkpoint) return unavailable('not-ready');
        const count = own(floors, 'length');
        if (!Number.isSafeInteger(count) || count > constants.MAX_MEMORY_SOURCE_LEDGER_RECORDS) {
            const result = unavailable('read-failed'); result.coverage.reason = '千千结摘要超过本地来源记录上限，未截断冒充完整'; return result;
        }
        const records = [], ids = new Set(); let chars = 0, rejected = 0;
        const sourceKey = ledger.normalizeMemorySourceRevision(JSON.stringify(identity));
        for (let i = 0; i < count; i += 1) {
            const floor = own(floors, String(i)), content = own(floor, 'summary');
            const floorId = primitive(own(floor, 'floorId')), messageIndex = own(floor, 'messageIndex');
            if (!floorId || typeof content !== 'string' || !content.trim() || !Number.isSafeInteger(messageIndex) || messageIndex < 0) { rejected++; continue; }
            const sourceId = ledger.normalizeMemorySourceId(`${identity.qqjChatId}:${floorId}`);
            if (ids.has(sourceId)) { rejected++; continue; } ids.add(sourceId);
            chars += content.length;
            if (chars > constants.MAX_MEMORY_SOURCE_LEDGER_CHARS) {
                const result = unavailable('read-failed'); result.coverage.reason = '千千结摘要超过本地来源字符上限，未截断冒充完整'; return result;
            }
            records.push({ sourceId, content, type: 'summary', title: `第 ${messageIndex + 1} 楼摘要`, messageIndex });
        }
        // Hash content too: user-edited summaries must not be mistaken for the old scan.
        const revision = ledger.normalizeMemorySourceRevision(`${sourceKey}:${checkpoint}:${text.hashString(JSON.stringify(records))}`);
        return { provider: QQJ_PROVIDER, label: '千千结', providerVersion: '1', sourceKind: 'public-current-chat-api-v1', sourceKey, revision,
            records, allowedSourceIds: records.map(row => row.sourceId), readStatus: records.length ? 'ready' : 'empty',
            coverage: { status: rejected ? 'partial' : 'complete', returned: records.length, total: count,
                reason: rejected ? `${rejected} 条摘要未通过数据校验；不作为已读取内容`
                    : count ? '已读取接口当前全部有效摘要；不代表每个聊天楼层均已建档' : '千千结当前聊天暂无已保存摘要' } };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        assertCurrent();
        return unavailable(error?.code === 'RMT_MEMORY_READ_TIMEOUT' ? 'timed-out' : 'read-failed');
    }
}

export function qianQianJieBatchIsCurrent(batch, context, expectedApi, root = globalThis) {
    try {
        const api = findQianQianJiePublicApi(root);
        if (!api || api !== expectedApi) return false;
        const status = own(api, 'getStatus').call(api), identity = identityOf(status);
        return own(status, 'status') === 'ready' && hostMatches(identity, context)
            && ledger.normalizeMemorySourceRevision(JSON.stringify(identity)) === batch.sourceKey;
    } catch { return false; }
}
