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
