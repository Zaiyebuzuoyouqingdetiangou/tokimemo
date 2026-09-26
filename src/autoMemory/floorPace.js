// 固定楼层的窗口和倒计时。只算数字，不读聊天，也不发请求。

export function dueFloorWindow(lastCompletedFloor, floor) {
    const end = Math.floor(Number(floor));
    const start = Math.floor(Number(lastCompletedFloor)) + 1;
    if (!Number.isSafeInteger(end) || end < 1 || !Number.isSafeInteger(start) || start < 1 || start > end) return null;
    return { start, end };
}

export function floorsRemaining(floor, nextDueFloor) {
    const now = Math.floor(Number(floor));
    const due = Math.floor(Number(nextDueFloor));
    if (!Number.isSafeInteger(due) || due < 1 || !Number.isSafeInteger(now) || now < 0) return null;
    return Math.max(0, due - now);
}

// 还差两楼以上写明数字；只剩一楼，或这一楼已经到点，都写成「下一楼」。
export function formatFloorRemain(left) {
    if (!Number.isSafeInteger(left) || left < 0) return '';
    return left <= 1 ? '下一楼' : `还差 ${left} 楼`;
}

function isAssistantFloor(message) {
    return !!message && message.is_user !== true;
}

export function assistantFloorCount(chat) {
    if (!Array.isArray(chat)) return 0;
    let count = 0;
    for (const message of chat) if (isAssistantFloor(message)) count += 1;
    return count;
}

// 把「第几条角色楼」换回聊天里的楼号。用户楼不计入。
export function chatRangeForAssistantSpan(chat, startCount, endCount) {
    const start = Math.floor(Number(startCount));
    const end = Math.floor(Number(endCount));
    if (!Array.isArray(chat) || start < 1 || end < start) return null;
    let seen = 0;
    let first = 0;
    let last = 0;
    for (let index = 0; index < chat.length; index += 1) {
        if (!isAssistantFloor(chat[index])) continue;
        seen += 1;
        if (seen === start) first = index + 1;
        if (seen === end) { last = index + 1; break; }
    }
    if (!first || !last) return null;
    return { start: first, end: last };
}

// 间隔窗口里的角色楼都保留完整正文。摘要没写到的楼在建档时另附原文，这里不截字。
export function latestAssistantWindow(messages, interval) {
    const assistant = (Array.isArray(messages) ? messages : []).filter(item => item && item.role !== 'user' && String(item.text || '').trim());
    const count = Math.max(1, Math.floor(Number(interval)) || 1);
    return assistant.slice(-count).map(item => ({ ...item }));
}

export function countdownLabel(left) {
    if (!Number.isSafeInteger(left) || left < 0) return '';
    if (left <= 0) return '这一楼留下回忆';
    if (left === 1) return '下一楼留下回忆';
    return `回忆还有 ${left} 楼`;
}

// 最新一条有效消息必须是已经写完的角色楼。用户楼、空正文、或这一楼还在生成，都不算到点。
export function assistantBodyReady(chat, options = {}) {
    if (options.generating === true) return false;
    const list = Array.isArray(chat) ? chat : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
        const message = list[index];
        if (!message || message.is_system === true) continue;
        if (message.is_user === true) return false;
        const text = String(message.mes ?? '').trim();
        if (!text || /^[.。…．]{1,12}$/.test(text)) return false;
        return true;
    }
    return false;
}
