// Archive-only projection: retain the one authoritative source snapshot, all
// fingerprints and every request recipe. No compression or enlarged byte limit.
import * as digest from '../core/digest.js';
import * as text from '../core/text.js';

export function inputHash(value) {
    return digest.sha256Bytes(new TextEncoder().encode(JSON.stringify(value)));
}

export function compactArchiveInputs(inputs) {
    if (!inputs?.batchVersion || !inputs.progress || !inputs.taskInputV1) return inputs;
    const task = inputs.taskInputV1;
    if (task.version !== 1 || !task.data || task.digest !== inputHash(task.data)) {
        throw text.safeUserError('原任务资料未通过完整性校验，原草稿保留。', 'RMT_RECOVERY_DATA');
    }
    if (task.data.operation !== 'import') return inputs;
    const result = structuredClone(inputs), data = result.taskInputV1.data;
    // Only identity scalars are consumed from this second snapshot. Requests
    // and evidence continue to use data.snapshot.messages without any editing.
    if (data.snapshotForIdentity) {
        data.snapshotForIdentity = { ...data.snapshotForIdentity };
        delete data.snapshotForIdentity.messages;
        delete data.snapshotForIdentity.incrementalMessages;
    }
    // A manifest-driven import resolves its exact ranges from messages.
    if (data.snapshot) {
        data.snapshot = { ...data.snapshot };
        delete data.snapshot.incrementalMessages;
    }
    for (const key of ['external', 'contextEnvelope', 'inputOwner', 'identity']) {
        if (Object.hasOwn(data, key) && Object.hasOwn(result, key)
            && JSON.stringify(result[key]) === JSON.stringify(data[key])) delete result[key];
    }
    // Do not hide a different embedded source by comparing its digest alone.
    if (JSON.stringify(inputs.progress.taskInputV1) === JSON.stringify(task)) delete result.progress.taskInputV1;
    result.taskInputV1.digest = inputHash(data);
    return result;
}

export function compactArchiveEntry(entry) {
    if (!entry?.inputs) return entry;
    const expected = entry.journal?.contentSnapshot?.archiveInputsHash;
    if (expected && expected !== inputHash(entry.inputs)) {
        throw text.safeUserError('原草稿资料与记录不一致，未改动原记录。', 'RMT_RECOVERY_DATA');
    }
    const inputs = compactArchiveInputs(entry.inputs);
    if (inputs === entry.inputs || JSON.stringify(inputs) === JSON.stringify(entry.inputs)) return entry;
    const next = { ...entry, inputs, journal: structuredClone(entry.journal) };
    // A code-owned, checked projection only. Request hashes/raw replies stay exact.
    if (expected) next.journal.contentSnapshot.archiveInputsHash = inputHash(inputs);
    return next;
}
