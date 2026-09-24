// Code-owned receipts for locally committing complete extraction segments.
// Receipts confer no authority on model values; the production validator still
// runs before the first save. Exact raw/request hashes prevent double admission.
import * as inputs from './draftInputs.js';
import * as text from '../core/text.js';

export function extractionSegments(entry) {
    return (entry?.journal?.segments || []).filter(row => /^(chat|external):\d+$/.test(row.slot));
}

export function partialBaseForDraft(entry, bank) {
    const receipt = bank?.archivePartialDraft;
    if (!receipt || receipt.draftId !== entry?.draftId || receipt.sourceHash !== entry?.sourceHash) return null;
    const segments = extractionSegments(entry);
    if (receipt.revision !== bank.archiveRevision || !Array.isArray(receipt.slots) || !receipt.slots.length
        || new Set(receipt.slots.map(row => row.slot)).size !== receipt.slots.length
        || receipt.slots.some(row => !segments.some(segment => segment.slot === row.slot && segment.state === 'complete'
            && segment.requestHash === row.requestHash && inputs.inputHash(segment.rawJson) === row.rawHash))) {
        throw text.safeUserError('已入档分段与原草稿不一致，未覆盖档案或重新生成。', 'RMT_RECOVERY_DATA');
    }
    return bank;
}

export function completeSlots(entry) {
    return new Set(extractionSegments(entry).filter(row => row.state === 'complete').map(row => row.slot));
}

export function partialReceipt(entry, revision) {
    return { draftId: entry.draftId, sourceHash: entry.sourceHash, revision,
        slots: extractionSegments(entry).filter(row => row.state === 'complete').map(row => ({
            slot: row.slot, requestHash: row.requestHash, rawHash: inputs.inputHash(row.rawJson),
        })) };
}

export function partialProgress(progress, slots, revision) {
    const next = structuredClone(progress), counts = { chat: 0, external: 0 };
    next.partialParts = [];
    for (const [index, part] of (next.batches[next.nextBatch] || []).entries()) {
        if (slots.has(`${part.kind}:${counts[part.kind]++}`)) next.partialParts.push(index);
    }
    if (next.partialParts.length !== slots.size) throw text.safeUserError('成功分段与原批次不一致，未修改档案。', 'RMT_RECOVERY_DATA');
    if (!next.partialParts.length) throw text.safeUserError('没有可先入档的完整分段。', 'RMT_ARCHIVE_CHUNK');
    next.archiveRevision = revision;
    return next;
}
