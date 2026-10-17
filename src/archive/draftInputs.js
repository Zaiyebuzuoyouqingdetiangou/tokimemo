// Archive-only projection: retain the one authoritative source snapshot, all
// fingerprints and every request recipe. No compression or enlarged byte limit.
import * as digest from '../core/digest.js';
import * as text from '../core/text.js';

export function inputHash(value) {
    return digest.sha256Bytes(new TextEncoder().encode(JSON.stringify(value)));
}

// Verified task inputs are remembered per object, so the same in-page object is
// not re-hashed before every chunk. Data read back from storage or chat metadata
// is always a fresh object and is always verified in full.
const verifiedTasks = new WeakMap();
const compactedInputs = new WeakSet();
export function markVerifiedTaskInput(task) {
    if (task && typeof task === 'object') verifiedTasks.set(task, { data: task.data, digest: task.digest });
}
export function taskInputDigestValid(task) {
    const seen = verifiedTasks.get(task);
    if (seen && seen.data === task.data && seen.digest === task.digest) return true;
    if (task.digest !== inputHash(task.data)) return false;
    markVerifiedTaskInput(task);
    return true;
}
export function withoutFields(value, fields) {
    const copy = { ...value };
    for (const field of fields) delete copy[field];
    return copy;
}

export function compactArchiveInputs(inputs) {
    if (!inputs?.batchVersion || !inputs.progress || !inputs.taskInputV1) return inputs;
    if (compactedInputs.has(inputs)) return inputs;
    const task = inputs.taskInputV1;
    if (task.version !== 1 || !task.data || !taskInputDigestValid(task)) {
        throw text.safeUserError('原任务资料未通过完整性校验，原草稿保留。', 'RMT_RECOVERY_DATA');
    }
    if (task.data.operation !== 'import') return inputs;
    // Shallow projection: only the stripped paths are new objects. Callers that
    // keep the result (draft rows) clone it themselves before storing.
    const data = { ...task.data };
    let stripped = false;
    // Only identity scalars are consumed from this second snapshot. Requests
    // and evidence continue to use data.snapshot.messages without any editing.
    if (data.snapshotForIdentity) {
        stripped ||= ['messages', 'incrementalMessages'].some(field => Object.hasOwn(data.snapshotForIdentity, field));
        data.snapshotForIdentity = withoutFields(data.snapshotForIdentity, ['messages', 'incrementalMessages']);
    }
    // A manifest-driven import resolves its exact ranges from messages.
    if (data.snapshot) {
        stripped ||= Object.hasOwn(data.snapshot, 'incrementalMessages');
        data.snapshot = withoutFields(data.snapshot, ['incrementalMessages']);
    }
    const result = { ...inputs, taskInputV1: { ...task, data } };
    let changed = stripped;
    for (const key of ['external', 'contextEnvelope', 'inputOwner', 'identity']) {
        if (Object.hasOwn(data, key) && Object.hasOwn(result, key)
            && (result[key] === data[key] || JSON.stringify(result[key]) === JSON.stringify(data[key]))) { delete result[key]; changed = true; }
    }
    // Do not hide a different embedded source by comparing its digest alone.
    const embedded = inputs.progress.taskInputV1;
    if (embedded !== undefined && (embedded === task || JSON.stringify(embedded) === JSON.stringify(task))) {
        result.progress = withoutFields(inputs.progress, ['taskInputV1']);
        changed = true;
    }
    if (!changed) { compactedInputs.add(inputs); return inputs; }
    // Unchanged data keeps its verified digest; stripped data gets the same
    // digest the old clone-then-rehash produced.
    if (stripped) result.taskInputV1.digest = inputHash(data);
    markVerifiedTaskInput(result.taskInputV1);
    compactedInputs.add(result);
    return result;
}

// Old progress parked by an explicit restart is a record only; nothing resumes it.
// Keep its batch list, identity and pending results, never another chat copy.
export const MAX_PAUSED_PROGRESS = 5;
export function compactPausedProgress(progress) {
    if (!progress || typeof progress !== 'object') return progress;
    const copy = { ...progress };
    for (const key of ['taskInputV1', 'taskInputBinding', 'contextEnvelope', 'worldInfo', 'fallbackRecords']) delete copy[key];
    return copy;
}
// The cap only drops plain records. An entry still holding validated results
// waiting for capacity (capacityPending) is paid content and is always kept.
export function compactPausedProgressList(list) {
    const rows = Array.isArray(list) ? list : [];
    const holdsPending = row => Array.isArray(row?.capacityPending) && row.capacityPending.length > 0;
    let plain = rows.filter(row => !holdsPending(row)).length;
    return rows.filter(row => holdsPending(row) || plain-- <= MAX_PAUSED_PROGRESS).map(compactPausedProgress);
}

export function compactArchiveEntry(entry, { inputsVerified = false } = {}) {
    if (!entry?.inputs) return entry;
    const expected = entry.journal?.contentSnapshot?.archiveInputsHash;
    // inputsVerified: the caller has just checked this exact hash itself.
    if (expected && !inputsVerified && expected !== inputHash(entry.inputs)) {
        throw text.safeUserError('原草稿资料与记录不一致，未改动原记录。', 'RMT_RECOVERY_DATA');
    }
    const inputs = compactArchiveInputs(entry.inputs);
    if (inputs === entry.inputs) return entry;
    const next = { ...entry, inputs, journal: structuredClone(entry.journal) };
    // A code-owned, checked projection only. Request hashes/raw replies stay exact.
    if (expected) next.journal.contentSnapshot.archiveInputsHash = inputHash(inputs);
    return next;
}
