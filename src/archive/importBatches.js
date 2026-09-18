// Archive-only batch manifests. They contain source references, not copied chats.
// The optional checkpoint travels in the SAME canonical bank write as its memories.
// It is not Mxxx evidence and is ignored by all existing derived-content readers.
import * as constants from '../core/constants.js';
import * as digest from '../core/digest.js';
import * as text from '../core/text.js';

export const IMPORT_PROGRESS_KEY = 'archiveImportProgress';
export const IMPORT_BATCH_VERSION = 1;
const encoder = new TextEncoder();
const hash = value => digest.sha256Bytes(encoder.encode(String(value)));

export function sourceHash(value) { return hash(value); }
export function utf8Bytes(value) { return encoder.encode(String(value)).byteLength; }
export function changedInput(category = 'unknown') {
    const labels = { chat: '聊天正文或聊天身份', character: '角色身份或角色卡', persona: '用户 Persona',
        archive: '正式档案版本', range: '聊天读取范围', selection: '来源选择', configuration: '生成配置',
        sources: '已捕获来源快照', unknown: '旧草稿身份（旧格式无法细分）' };
    const safeCategory = Object.hasOwn(labels, category) ? category : 'unknown';
    const error = text.safeUserError(`${labels[safeCategory]}与原任务不一致。已保存成果与未提交草稿保留；可恢复原条件继续，或明确选择按当前配置另起任务。`, 'RMT_RECOVERY_INPUT_CHANGED');
    error.archiveInputCategory = safeCategory;
    return error;
}

export function assertIdentity(expected, actual) {
    for (const key of ['chat', 'character', 'persona', 'range', 'selection', 'configuration']) {
        if (expected?.[key] !== actual?.[key]) throw changedInput(key);
    }
}

function cutEnd(value, start, size) {
    let end = Math.min(value.length, start + size);
    // Keep a UTF-16 surrogate pair together. Counts below remain explicitly UTF-16
    // code units, not UTF-8 bytes or tokens.
    if (end < value.length && end > start && /[\uD800-\uDBFF]/.test(value[end - 1])) end -= 1;
    return end;
}

export function makeSourceUnits(chatMessages, externalRecords) {
    const units = [];
    for (const [kind, records] of [['chat', chatMessages], ['external', externalRecords]]) {
        for (const record of records || []) {
            const value = String(kind === 'chat' ? record.text : record.content);
            for (let offset = 0; offset < value.length;) {
                const end = cutEnd(value, offset, constants.MAX_MEMORY_SOURCE_FRAGMENT_CHARS);
                const part = value.slice(offset, end);
                const ref = kind === 'chat'
                    ? { kind, index: record.index, offset, length: part.length, hash: hash(part) }
                    : { kind, externalId: record.externalId, provider: record.provider, offset, length: part.length, hash: hash(part) };
                const data = kind === 'chat' ? { ...record, text: part } : { ...record, content: part };
                delete data.line;
                units.push({ ref, data });
                offset = end;
            }
        }
    }
    return units;
}

// Explicit restart may use a different request split. Subtract verified saved
// source intervals, not serialized unit identities; never resend a saved half
// merely because the new local budget grouped it into a larger unit.
export function excludeSavedUnits(units, prior) {
    if (!prior) return units;
    const identity = ref => ref.kind === 'chat' ? `chat:${ref.index}` : JSON.stringify(['external', ref.provider, ref.externalId]);
    const bySource = new Map();
    for (const parts of prior.batches.slice(0, prior.nextBatch)) for (const part of parts) for (const ref of part.refs) {
        const key = identity(ref); if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key).push(ref);
    }
    const remaining = [];
    for (const unit of units) {
        const field = unit.ref.kind === 'chat' ? 'text' : 'content', value = unit.data[field];
        const intervals = (bySource.get(identity(unit.ref)) || []).flatMap(ref => {
            const start = ref.offset - unit.ref.offset, end = start + ref.length;
            return start >= 0 && end <= value.length && hash(value.slice(start, end)) === ref.hash ? [[start, end]] : [];
        }).sort((a, b) => a[0] - b[0]);
        let start = 0;
        const add = end => {
            if (end <= start) return;
            const part = value.slice(start, end);
            remaining.push({ ref: { ...unit.ref, offset: unit.ref.offset + start, length: part.length, hash: hash(part) },
                data: { ...unit.data, [field]: part } });
        };
        for (const [from, to] of intervals) { add(from); start = Math.max(start, to); }
        add(value.length);
    }
    return remaining;
}

function splitUnit(unit) {
    const field = unit.ref.kind === 'chat' ? 'text' : 'content';
    const value = unit.data[field];
    if (value.length < 2) return null;
    let middle = cutEnd(value, 0, Math.ceil(value.length / 2));
    if (!middle || middle === value.length) return null;
    return [0, middle].map((offset, i) => {
        const part = value.slice(offset, i ? value.length : middle);
        return { ref: { ...unit.ref, offset: unit.ref.offset + offset, length: part.length, hash: hash(part) },
            data: { ...unit.data, [field]: part } };
    });
}

// inspect receives the ACTUAL composed request, including instructions and context.
// Splitting is local, before any provider call. No output setting is adjusted.
export async function planSourceBatches(units, inspect, { signal = null } = {}) {
    const assertActive = () => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
    const fit = async list => {
        assertActive();
        const budget = await inspect(list[0].ref.kind, list.map(unit => unit.data), 99999, 99999);
        if (!budget.exceeded) return [{ kind: list[0].ref.kind, units: list, budget }];
        if (budget.exceeded === 'output') throw text.safeUserError('当前最大输出高于已确认的模型能力；没有降低输出或发送请求。', 'RMT_ARCHIVE_OUTPUT_BUDGET');
        if (list.length > 1) {
            const middle = Math.ceil(list.length / 2);
            return [...await fit(list.slice(0, middle)), ...await fit(list.slice(middle))];
        }
        const divided = splitUnit(list[0]);
        if (divided && list[0].ref.length > 256) return [...await fit([divided[0]]), ...await fit([divided[1]])];
        const error = text.safeUserError('来源已拆小，但指令、人设或世界书背景仍超预算；未删来源、未降输出、未发送。', 'RMT_ARCHIVE_CONTEXT_BUDGET');
        error.archiveBudget = budget;
        throw error;
    };
    const fitted = [];
    let group = [], groupChars = 0;
    const flushGroup = async () => {
        if (!group.length) return;
        fitted.push(...await fit(group)); group = []; groupChars = 0;
    };
    for (const unit of units) {
        assertActive();
        const limit = unit.ref.kind === 'chat' ? constants.IMPORT_CHUNK_CHARS : constants.EXTERNAL_MEMORY_CHUNK_CHARS;
        if (group.length && (group[0].ref.kind !== unit.ref.kind || groupChars + unit.ref.length + 320 > limit)) await flushGroup();
        group.push(unit); groupChars += unit.ref.length + 320;
    }
    await flushGroup();
    // Pack AFTER request-budget splitting, so newly split fragments count toward
    // the same 256/240k batch boundary. Nothing is sampled and no tail is discarded.
    const batches = [];
    let parts = [], pending = [], counts = { chat: 0, external: 0 }, chars = { chat: 0, external: 0 };
    const flushPart = () => { if (pending.length) parts.push({ kind: pending[0].ref.kind, units: pending }); pending = []; };
    const flushBatch = () => {
        flushPart(); if (parts.length) batches.push(parts);
        parts = []; counts = { chat: 0, external: 0 }; chars = { chat: 0, external: 0 };
    };
    for (const part of fitted) {
        for (const unit of part.units) {
            const kind = unit.ref.kind;
            const countLimit = kind === 'chat' ? constants.MAX_IMPORT_MESSAGES : constants.MAX_EXTERNAL_MEMORY_ITEMS;
            const charLimit = kind === 'chat' ? constants.MAX_IMPORT_TOTAL_CHARS : constants.MAX_EXTERNAL_MEMORY_CHARS;
            if (counts[kind] >= countLimit || chars[kind] + unit.ref.length > charLimit || (!pending.length && parts.length >= 127)) flushBatch();
            pending.push(unit); counts[kind]++; chars[kind] += unit.ref.length;
        }
        flushPart();
    }
    flushBatch();
    for (const parts of batches) {
        const totals = { chat: parts.filter(part => part.kind === 'chat').length, external: parts.filter(part => part.kind === 'external').length };
        const indexes = { chat: 0, external: 0 };
        for (const part of parts) {
            part.index = indexes[part.kind]++; part.total = totals[part.kind];
            part.budget = await inspect(part.kind, part.units.map(unit => unit.data), part.index, part.total);
            if (part.budget.exceeded) {
                const error = text.safeUserError('完整请求预算在准备期间变化，本次未发送。', 'RMT_ARCHIVE_CONTEXT_BUDGET');
                error.archiveBudget = part.budget; throw error;
            }
        }
    }
    return batches;
}

export function manifestFromBatches(batches) {
    return batches.map(parts => parts.map(part => ({ kind: part.kind, index: part.index, total: part.total,
        refs: part.units.map(unit => unit.ref) })));
}

export function progressTotals(progress) {
    const batches = Array.isArray(progress?.batches) ? progress.batches : [];
    const count = parts => (parts || []).reduce((sum, part) => sum + part.refs.length, 0);
    const chars = parts => (parts || []).reduce((sum, part) => sum + part.refs.reduce((n, ref) => n + ref.length, 0), 0);
    const saved = Math.min(batches.length, Math.max(0, Number(progress?.nextBatch) || 0));
    const processed = Math.min(batches.length, saved + (progress?.capacityPending?.length ? 1 : 0));
    return { batches: batches.length, savedBatches: saved, currentBatch: Math.min(saved + 1, batches.length),
        total: batches.reduce((sum, parts) => sum + count(parts), 0),
        chars: batches.reduce((sum, parts) => sum + chars(parts), 0),
        saved: batches.slice(0, saved).reduce((sum, parts) => sum + count(parts), 0),
        processed: batches.slice(0, processed).reduce((sum, parts) => sum + count(parts), 0),
        remaining: batches.slice(saved).reduce((sum, parts) => sum + count(parts), 0),
        pendingMemories: progress?.capacityPending?.length || 0 };
}

export function hasPendingBatches(progress) {
    return progress?.version === IMPORT_BATCH_VERSION && (progress.nextBatch < progress.batches?.length || !!progress.capacityPending?.length);
}

export function checkedProgress(raw) {
    if (!raw) return null;
    const data = structuredClone(raw);
    if (data.version !== IMPORT_BATCH_VERSION || !Array.isArray(data.batches)
        || !Number.isInteger(data.nextBatch) || data.nextBatch < 0 || data.nextBatch > data.batches.length
        || typeof data.taskId !== 'string' || typeof data.identity !== 'object'
        || utf8Bytes(JSON.stringify(data)) > constants.MAX_CACHE_SOURCE_BYTES) {
        throw text.safeUserError('建档检查点格式或容量异常；旧成果保留，未自动重建。', 'RMT_ARCHIVE_CHECKPOINT');
    }
    for (const parts of data.batches) {
        if (!Array.isArray(parts) || parts.length > 127) throw changedInput('sources');
        for (const part of parts) {
            if (!['chat', 'external'].includes(part.kind) || !Array.isArray(part.refs)) throw changedInput('sources');
            for (const ref of part.refs) if (ref.kind !== part.kind || !Number.isInteger(ref.offset) || ref.offset < 0
                || !Number.isInteger(ref.length) || ref.length < 1 || ref.length > constants.MAX_MEMORY_SOURCE_FRAGMENT_CHARS
                || !/^[a-f0-9]{64}$/.test(ref.hash)) throw changedInput('sources');
        }
    }
    return data;
}

// External rows may come from retained ledger revisions; newest background writes
// do not change the captured task. Chat refs still verify the live original floors.
export function resolveBatchParts(progress, chatMessages, externalRecords) {
    const chat = new Map((chatMessages || []).map(row => [row.index, row]));
    const external = new Map();
    for (const row of externalRecords || []) {
        const key = `${row.provider}\u001f${row.externalId}`;
        if (!external.has(key)) external.set(key, []);
        external.get(key).push(row);
    }
    return (progress.batches[progress.nextBatch] || []).map(part => ({ ...part, data: part.refs.map(ref => {
        const rows = ref.kind === 'chat' ? [chat.get(ref.index)] : external.get(`${ref.provider}\u001f${ref.externalId}`) || [];
        const field = ref.kind === 'chat' ? 'text' : 'content';
        for (const row of rows) {
            if (!row) continue;
            const value = String(row[field] || '').slice(ref.offset, ref.offset + ref.length);
            if (value.length === ref.length && hash(value) === ref.hash) return { ...row, [field]: value };
        }
        throw changedInput(ref.kind === 'chat' ? 'chat' : 'sources');
    }) }));
}

export function advanceProgress(progress, { pending = [], archiveRevision } = {}) {
    const next = structuredClone(progress);
    // This is only a staged candidate. The caller must commit it with the bank by
    // CAS; it must NEVER publish it in state on a failed canonical save.
    next.capacityPending = pending.map(item => { const copy = structuredClone(item); delete copy.id; return copy; });
    if (!pending.length) next.nextBatch += 1;
    next.archiveRevision = archiveRevision;
    next.updatedAt = Date.now();
    if (!hasPendingBatches(next)) {
        // Finished sources are still identified by manifest hashes, but large captured
        // background text is not needed by any subsequent request.
        delete next.contextEnvelope; delete next.worldInfo;
    }
    return checkedProgress(next);
}
