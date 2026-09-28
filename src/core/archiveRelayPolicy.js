// A relay is browser-local. These keys never claim a server-side lock.
import * as context from './context.js';
import * as text from './text.js';

const observed = new Map();

export function relayMemberKey(entry) {
    return `relay-member:${JSON.stringify([context.archiveStoredAvatar(entry), Number(entry?.characterIndexHint), context.comparableChatId(entry?.chatId)])}`;
}

export function relayContextEntry(ctx = context.getContext()) {
    return { avatar: context.currentCharacterAvatar(ctx), characterIndexHint: Number(ctx?.characterId),
        chatId: context.comparableChatId(context.getChatId(ctx)) };
}

export function relayError(message, code = 'RMT_RELAY_CONFLICT') {
    return text.safeUserError(message, code);
}

export function relayFence(value) {
    if (!value || value.kind !== 'archive-relay-member') return null;
    if (value.version !== 1 || !value.lineageId || !Number.isSafeInteger(value.epoch) || value.epoch < 1
        || !Array.isArray(value.members) || !value.members.some(item => relayMemberKey(item) === value.holderKey)
        || !value.members.some(item => relayMemberKey(item) === value.entryId)) {
        throw relayError('接力登记暂时无法核对，原档案保留；请先导出备份，不要清除站点数据。');
    }
    return value;
}

export function rememberRelayFence(entry, value) {
    const fence = relayFence(value);
    observed.set(relayMemberKey(entry), fence);
    return fence;
}

export function relayUiState(entry) { return observed.get(relayMemberKey(entry)) || null; }

export function relayHolder(fence) {
    return fence?.members?.find(item => relayMemberKey(item) === fence.holderKey) || null;
}

export function relayReadOnly(entry, fence = relayUiState(entry)) {
    return !!fence && fence.holderKey !== relayMemberKey(entry);
}

export function assertRelayWrite(entry, value, memory = null) {
    const fence = relayFence(value);
    if (relayReadOnly(entry, fence)) {
        throw relayError(`这份连续档案已交给「${relayHolder(fence)?.chatId || '另一个聊天'}」继续；当前只读，请先接回。`, 'RMT_RELAY_READ_ONLY');
    }
    const marker = memory?.archiveRelayV1;
    if (marker && (!fence || marker.lineageId !== fence.lineageId)) {
        throw relayError('本浏览器没有这份档案的接力登记；请回到原浏览器继续。原内容仍可阅读。', 'RMT_RELAY_LOCAL_ONLY');
    }
    if (marker && marker.epoch !== fence.epoch) {
        throw relayError('交接后档案身份已经更新，旧任务没有写入；请重新打开当前档案。');
    }
    return fence;
}
