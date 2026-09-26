import * as archive_batches from './importBatches.js';
import * as chat_read_range from '../core/chatReadRange.js';
import * as core_text from '../core/text.js';
// 自动每楼窗口建档（r84.157）：建档时把这一窗的起止楼和内容指纹记进检查点（archiveImportProgress.floorWindow）。
// 延后保存时只核对这一窗：窗口后面新增的楼不算变化；窗口里的楼被改、被删，仍按「聊天正文不一致」处理。
// 没有这条记录的档案（手动建档、非窗口建档、r84.157 之前的旧条目）一律按原来的整段聊天规则核对。

// 从 archive/importOperation.js 原样搬来（原名 windowChatMessages），建档读窗口和保存前核对窗口用同一个读法。
export function floorWindowMessages(context, floorWindow) {
    const start = Math.floor(Number(floorWindow?.start));
    const end = Math.floor(Number(floorWindow?.end));
    if (start < 1 || end < start) return [];
    return chat_read_range.selectChatReadRange(context, { mode: 'range', start, end, includeHidden: false }).map(row => ({
        index: row.index,
        role: row.message?.is_user === true ? 'user' : 'char',
        name: core_text.normalizeText(row.message?.name, 120),
        date: core_text.normalizeText(row.message?.send_date || row.message?.date || '', 80),
        text: String(row.message?.mes ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim(),
    })).filter(item => item.text);
}

export function floorWindowFingerprint(rows) {
    return archive_batches.sourceHash(JSON.stringify((rows || []).map(row => [row.index, row.role, row.name, row.date, row.text])));
}

export function floorWindowStamp(floorWindow, rows) {
    const start = Math.floor(Number(floorWindow?.start));
    const end = Math.floor(Number(floorWindow?.end));
    if (!(start >= 1) || !(end >= start)) return null;
    return { start, end, fingerprint: floorWindowFingerprint(rows) };
}

export function checkedFloorWindowStamp(value) {
    if (!value || typeof value !== 'object') return null;
    const { start, end, fingerprint } = value;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) return null;
    return { start, end, fingerprint };
}

// 只有自动每楼窗口建档写出的检查点带这条记录；格式不对就当没有，走原严格规则。
export function bankFloorWindow(bank) {
    return checkedFloorWindowStamp(bank?.[archive_batches.IMPORT_PROGRESS_KEY]?.floorWindow);
}

export function sameFloorWindow(context, stamp) {
    const checked = checkedFloorWindowStamp(stamp);
    return !!checked && floorWindowFingerprint(floorWindowMessages(context, checked)) === checked.fingerprint;
}

export function assertFloorWindowUnchanged(context, stamp) {
    if (!sameFloorWindow(context, stamp)) throw archive_batches.changedInput('chat');
}
