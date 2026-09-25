// 自动留忆主档与恢复副本的校验。
// 聊天 metadata 是主档。损坏的记录只拒绝，不改成默认值，也不让旧备份覆盖较新主档。
import * as auto_memory_registry from './moduleRegistry.js';

export const AUTO_MEMORY_PLAN_KEY = 'autoMemoryPlanV1';
export const AUTO_MEMORY_REVEAL_KEY = 'revealRecordsV1';
export const AUTO_MEMORY_DRAW_TICKETS_KEY = 'autoMemoryDrawTicketsV1';
export const AUTO_MEMORY_MODULE_PLAN_KEY = 'autoMemoryModulePlanV1';
export const AUTO_MEMORY_INTERVAL_MIN = 1;
export const AUTO_MEMORY_INTERVAL_MAX = 1000;

const PLAN_KEYS = Object.freeze(['schemaVersion', 'revision', 'updatedAt', 'enabled', 'intervalFloors', 'preferredModuleIds', 'excludedModuleIds', 'lastCompletedFloor', 'nextDueFloor', 'activeDrawTicketId', 'legacyPreferencesMigrated']);
const METADATA_KEYS = Object.freeze([AUTO_MEMORY_PLAN_KEY, AUTO_MEMORY_REVEAL_KEY, AUTO_MEMORY_DRAW_TICKETS_KEY, AUTO_MEMORY_MODULE_PLAN_KEY]);
const RECOVERY_KEYS = Object.freeze(['key', 'schemaVersion', 'chatId', 'revision', 'payload']);
const SNAPSHOT_KEYS = Object.freeze(['plan', 'revealRecords', 'drawTickets', 'modulePlan']);
const STEP_KEYS = Object.freeze(['id', 'kind', 'order', 'status', 'recoverySlot']);
const MODULE_PLAN_KEYS = Object.freeze(['version', 'drawId', 'moduleId', 'chatId', 'archiveRevision', 'sourceMemoryIds', 'expectedRequestRange', 'steps', 'frozenAt']);
const TICKET_KEYS = Object.freeze(['id', 'dueFloor', 'archiveRevision', 'candidates', 'selectedModuleId', 'sourceMemoryIds', 'status']);
const REVEAL_KEYS = Object.freeze(['id', 'moduleId', 'achievementId', 'sourceMemoryIds', 'status', 'createdAt']);
const STEP_STATUS = new Set(['pending', 'running', 'completed', 'failed']);
const TICKET_STATUS = new Set(['drawn', 'running', 'completed', 'failed']);
const REVEAL_STATUS = new Set(['generating', 'ready', 'achievement_pending', 'opened']);
const DATABASE = 'heartbeat_memories_auto_memory_v1';
const STORE = 'snapshots';
let testBackend = null;

function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    error.safeToDisplay = true;
    error.safeUserMessage = message;
    error.retryable = false;
    return error;
}

function corrupt(message = '这份自动留忆记录已损坏，原记录保留，没有改写。') {
    return fail('RMT_AUTO_MEMORY_CORRUPT', message);
}

function stale(message = '自动留忆记录版本已变化，没有覆盖较新的记录。') {
    return fail('RMT_AUTO_MEMORY_STALE', message);
}

function plainData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
    if (!plainData(value)) throw corrupt();
    const actual = Object.keys(value);
    if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw corrupt();
}

function boundedToken(value, min, max) {
    if (typeof value !== 'string' || value.length < min || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) throw corrupt();
    return value;
}

function boundedText(value, max) {
    if (typeof value !== 'string' || value.length < 1 || value.length > max || /[\u0000-\u001f]/.test(value)) throw corrupt();
    return value;
}

function safeCount(value, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw corrupt();
    return value;
}

function nullableCount(value, max) {
    if (value === null) return null;
    return safeCount(value, 0, max);
}

function uniqueStrings(value, accept) {
    if (!Array.isArray(value)) throw corrupt();
    const seen = new Set();
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string' || seen.has(item) || !accept(item)) throw corrupt();
        seen.add(item);
        out.push(item);
    }
    return out;
}

function memoryIds(value) {
    return uniqueStrings(value, item => /^M\d{3,6}$/.test(item));
}

function moduleIdList(value) {
    return uniqueStrings(value, auto_memory_registry.isAutoMemoryDrawModule);
}

export function setAutoMemoryRecoveryBackendForTests(value) {
    testBackend = value;
}

export function parseAutoMemoryPlan(value) {
    exactKeys(value, PLAN_KEYS);
    if (value.schemaVersion !== 1) throw corrupt();
    const revision = safeCount(value.revision, 1, Number.MAX_SAFE_INTEGER);
    const updatedAt = safeCount(value.updatedAt, 0, Number.MAX_SAFE_INTEGER);
    if (typeof value.enabled !== 'boolean' || typeof value.legacyPreferencesMigrated !== 'boolean') throw corrupt();
    if (!Number.isSafeInteger(value.intervalFloors) || value.intervalFloors < AUTO_MEMORY_INTERVAL_MIN || value.intervalFloors > AUTO_MEMORY_INTERVAL_MAX) {
        throw fail('RMT_AUTO_MEMORY_INTERVAL', '自动留忆间隔只能保存 1 到 1000 楼，原设置没有改。');
    }
    const preferredModuleIds = moduleIdList(value.preferredModuleIds);
    const excludedModuleIds = moduleIdList(value.excludedModuleIds);
    if (preferredModuleIds.some(id => excludedModuleIds.includes(id))) throw corrupt();
    const activeDrawTicketId = value.activeDrawTicketId === null ? null : boundedToken(value.activeDrawTicketId, 8, 80);
    return {
        schemaVersion: 1,
        revision,
        updatedAt,
        enabled: value.enabled,
        intervalFloors: value.intervalFloors,
        preferredModuleIds,
        excludedModuleIds,
        lastCompletedFloor: nullableCount(value.lastCompletedFloor, Number.MAX_SAFE_INTEGER),
        nextDueFloor: nullableCount(value.nextDueFloor, Number.MAX_SAFE_INTEGER),
        activeDrawTicketId,
        legacyPreferencesMigrated: value.legacyPreferencesMigrated,
    };
}

export function createAutoMemoryPlan(input = {}) {
    const source = plainData(input) ? input : {};
    return parseAutoMemoryPlan({
        schemaVersion: 1,
        revision: Object.hasOwn(source, 'revision') ? source.revision : 1,
        updatedAt: Object.hasOwn(source, 'updatedAt') ? source.updatedAt : 0,
        enabled: Object.hasOwn(source, 'enabled') ? source.enabled : false,
        intervalFloors: Object.hasOwn(source, 'intervalFloors') ? source.intervalFloors : 5,
        preferredModuleIds: Object.hasOwn(source, 'preferredModuleIds') ? source.preferredModuleIds : [],
        excludedModuleIds: Object.hasOwn(source, 'excludedModuleIds') ? source.excludedModuleIds : [],
        lastCompletedFloor: Object.hasOwn(source, 'lastCompletedFloor') ? source.lastCompletedFloor : null,
        nextDueFloor: Object.hasOwn(source, 'nextDueFloor') ? source.nextDueFloor : null,
        activeDrawTicketId: Object.hasOwn(source, 'activeDrawTicketId') ? source.activeDrawTicketId : null,
        legacyPreferencesMigrated: Object.hasOwn(source, 'legacyPreferencesMigrated') ? source.legacyPreferencesMigrated : false,
    });
}

export function parseModuleStep(value) {
    exactKeys(value, STEP_KEYS);
    const status = STEP_STATUS.has(value.status) ? value.status : null;
    if (!status) throw corrupt();
    const recoverySlot = typeof value.recoverySlot === 'string' && value.recoverySlot.length <= 160 && !/[\u0000-\u001f]/.test(value.recoverySlot)
        ? value.recoverySlot : null;
    if (recoverySlot === null) throw corrupt();
    if (status === 'completed' && !recoverySlot) throw corrupt();
    return {
        id: boundedToken(value.id, 1, 80),
        kind: boundedToken(value.kind, 1, 40),
        order: safeCount(value.order, 0, 100000),
        status,
        recoverySlot,
    };
}

export function parseModulePlan(value) {
    exactKeys(value, MODULE_PLAN_KEYS);
    if (value.version !== 1) throw corrupt();
    const moduleId = boundedToken(value.moduleId, 1, 40);
    if (!auto_memory_registry.isAutoMemoryDrawModule(moduleId)) throw corrupt();
    exactKeys(value.expectedRequestRange, ['min', 'max']);
    const min = safeCount(value.expectedRequestRange.min, 0, 100000);
    const max = value.expectedRequestRange.max === null ? null : safeCount(value.expectedRequestRange.max, min, 100000);
    if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 200) throw corrupt();
    const steps = value.steps.map(parseModuleStep);
    const orders = new Set(steps.map(step => step.order));
    const ids = new Set(steps.map(step => step.id));
    if (orders.size !== steps.length || ids.size !== steps.length) throw corrupt();
    return {
        version: 1,
        drawId: boundedToken(value.drawId, 8, 80),
        moduleId,
        chatId: boundedText(value.chatId, 240),
        archiveRevision: boundedText(value.archiveRevision, 240),
        sourceMemoryIds: memoryIds(value.sourceMemoryIds),
        expectedRequestRange: { min, max },
        steps,
        frozenAt: safeCount(value.frozenAt, 0, Number.MAX_SAFE_INTEGER),
    };
}

export function parseDrawTicket(value) {
    exactKeys(value, TICKET_KEYS);
    if (!TICKET_STATUS.has(value.status)) throw corrupt();
    if (!Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 40) throw corrupt();
    const seen = new Set();
    const candidates = value.candidates.map(item => {
        exactKeys(item, ['id', 'weight']);
        const id = boundedToken(item.id, 1, 40);
        if (!auto_memory_registry.isAutoMemoryDrawModule(id) || seen.has(id)) throw corrupt();
        seen.add(id);
        return { id, weight: safeCount(item.weight, 1, 1000000) };
    });
    const selectedModuleId = boundedToken(value.selectedModuleId, 1, 40);
    if (!candidates.some(item => item.id === selectedModuleId)) throw corrupt();
    return {
        id: boundedToken(value.id, 8, 80),
        dueFloor: safeCount(value.dueFloor, 0, Number.MAX_SAFE_INTEGER),
        archiveRevision: boundedText(value.archiveRevision, 240),
        candidates,
        selectedModuleId,
        sourceMemoryIds: memoryIds(value.sourceMemoryIds),
        status: value.status,
    };
}

export function parseRevealRecord(value) {
    exactKeys(value, REVEAL_KEYS);
    if (!REVEAL_STATUS.has(value.status)) throw corrupt();
    const moduleId = boundedToken(value.moduleId, 1, 40);
    if (!auto_memory_registry.isAutoMemoryDrawModule(moduleId)) throw corrupt();
    return {
        id: boundedToken(value.id, 8, 80),
        moduleId,
        achievementId: value.achievementId === null ? null : boundedToken(value.achievementId, 8, 80),
        sourceMemoryIds: memoryIds(value.sourceMemoryIds),
        status: value.status,
        createdAt: safeCount(value.createdAt, 0, Number.MAX_SAFE_INTEGER),
    };
}

function parseList(value, parseItem, max) {
    if (!Array.isArray(value) || value.length > max) throw corrupt();
    const rows = value.map(parseItem);
    const ids = new Set(rows.map(item => item.id));
    if (ids.size !== rows.length) throw corrupt();
    return rows;
}

export function parseAutoMemorySnapshot(value) {
    exactKeys(value, SNAPSHOT_KEYS);
    const plan = parseAutoMemoryPlan(value.plan);
    const drawTickets = parseList(value.drawTickets, parseDrawTicket, 40);
    if (plan.activeDrawTicketId && !drawTickets.some(item => item.id === plan.activeDrawTicketId)) throw corrupt();
    const modulePlan = value.modulePlan === null ? null : parseModulePlan(value.modulePlan);
    if (modulePlan && plan.activeDrawTicketId && modulePlan.drawId !== plan.activeDrawTicketId) throw corrupt();
    return {
        plan,
        revealRecords: parseList(value.revealRecords, parseRevealRecord, 200),
        drawTickets,
        modulePlan,
    };
}

export function readAutoMemoryMetadata(chatMetadata) {
    if (chatMetadata == null) return null;
    if (!plainData(chatMetadata)) throw corrupt();
    const present = METADATA_KEYS.filter(key => Object.hasOwn(chatMetadata, key));
    if (!present.length) return null;
    if (present.length !== METADATA_KEYS.length) throw corrupt('自动留忆记录不完整，原记录保留，没有用默认值补齐。');
    try {
        return parseAutoMemorySnapshot({
            plan: chatMetadata[AUTO_MEMORY_PLAN_KEY],
            revealRecords: chatMetadata[AUTO_MEMORY_REVEAL_KEY],
            drawTickets: chatMetadata[AUTO_MEMORY_DRAW_TICKETS_KEY],
            modulePlan: chatMetadata[AUTO_MEMORY_MODULE_PLAN_KEY],
        });
    } catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_INTERVAL' || error?.code === 'RMT_AUTO_MEMORY_CORRUPT') {
            throw corrupt();
        }
        throw error;
    }
}

function inspectMetadata(metadata) {
    try {
        const snapshot = readAutoMemoryMetadata(metadata);
        return { present: !!snapshot, corrupt: false, snapshot };
    } catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT') return { present: true, corrupt: true, snapshot: null };
        throw error;
    }
}

export function parseAutoMemoryRecoveryRecord(value) {
    exactKeys(value, RECOVERY_KEYS);
    if (value.schemaVersion !== 1) throw corrupt();
    const chatId = boundedText(value.chatId, 240);
    const key = recoveryKey(chatId);
    if (value.key !== key) throw corrupt();
    const payload = parseAutoMemorySnapshot(value.payload);
    const revision = safeCount(value.revision, 1, Number.MAX_SAFE_INTEGER);
    if (revision !== payload.plan.revision) throw corrupt();
    return { key, schemaVersion: 1, chatId, revision, payload };
}

function inspectRecovery(recovery) {
    if (recovery == null) return { present: false, corrupt: false, record: null };
    try {
        return { present: true, corrupt: false, record: parseAutoMemoryRecoveryRecord(recovery) };
    } catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT' || error?.code === 'RMT_AUTO_MEMORY_INTERVAL') {
            return { present: true, corrupt: true, record: null };
        }
        throw error;
    }
}

// 主档修订不低于备份时保留主档。备份只在主档缺失，或备份修订确实更新且属于同一聊天时，才作为恢复来源。
export function selectAutoMemoryCanonical(metadata, recovery, expectedChatId = '') {
    const primary = inspectMetadata(metadata);
    const backup = inspectRecovery(recovery);
    if (primary.corrupt) throw corrupt('这份自动留忆记录已损坏，原记录保留，没有用备份覆盖。');
    if (backup.corrupt) {
        if (!primary.present) throw corrupt('自动留忆备份已损坏，没有改成默认设置。');
        return { snapshot: primary.snapshot, source: 'metadata', recoveryIgnored: true };
    }
    if (backup.present && backup.record.chatId !== boundedText(expectedChatId, 240)) {
        if (!primary.present) throw corrupt('自动留忆备份属于另一段聊天，没有写入当前聊天。');
        return { snapshot: primary.snapshot, source: 'metadata', recoveryIgnored: true };
    }
    if (!primary.present && !backup.present) return { snapshot: null, source: 'absent', recoveryIgnored: false };
    if (!backup.present) return { snapshot: primary.snapshot, source: 'metadata', recoveryIgnored: false };
    if (!primary.present) return { snapshot: backup.record.payload, source: 'recovery', recoveryIgnored: false };
    if (backup.record.revision > primary.snapshot.plan.revision) {
        return { snapshot: backup.record.payload, source: 'recovery', recoveryIgnored: false };
    }
    return { snapshot: primary.snapshot, source: 'metadata', recoveryIgnored: false };
}

export function assertMayRestoreFromRecovery(metadata, recovery, expectedChatId = '') {
    const chosen = selectAutoMemoryCanonical(metadata, recovery, expectedChatId);
    if (chosen.source !== 'recovery') {
        throw fail('RMT_AUTO_MEMORY_RECOVERY_STALE', '备份不新于聊天里的自动留忆记录，没有覆盖。');
    }
    return chosen.snapshot;
}

export function prepareAutoMemoryWrite(chatMetadata, snapshot, expectedRevision) {
    const current = readAutoMemoryMetadata(chatMetadata);
    const currentRevision = current ? current.plan.revision : 0;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || currentRevision !== expectedRevision) throw stale();
    const parsed = parseAutoMemorySnapshot(snapshot);
    if (parsed.plan.revision !== expectedRevision + 1) throw stale();
    return parsed;
}

export function assignAutoMemoryMetadata(chatMetadata, snapshot) {
    if (!plainData(chatMetadata)) throw corrupt();
    const parsed = parseAutoMemorySnapshot(snapshot);
    chatMetadata[AUTO_MEMORY_PLAN_KEY] = parsed.plan;
    chatMetadata[AUTO_MEMORY_REVEAL_KEY] = parsed.revealRecords;
    chatMetadata[AUTO_MEMORY_DRAW_TICKETS_KEY] = parsed.drawTickets;
    chatMetadata[AUTO_MEMORY_MODULE_PLAN_KEY] = parsed.modulePlan;
    return parsed;
}

export function commitAutoMemoryMetadata(chatMetadata, snapshot, expectedRevision) {
    const next = prepareAutoMemoryWrite(chatMetadata, snapshot, expectedRevision);
    return assignAutoMemoryMetadata(chatMetadata, next);
}

function recoveryKey(chatId) {
    const id = boundedText(chatId, 240);
    return 'chat:' + encodeURIComponent(id);
}

export function autoMemoryRecoveryAvailable() {
    try { return !!testBackend || typeof globalThis.indexedDB?.open === 'function'; }
    catch { return false; }
}

function recoveryUnavailable() {
    return fail('RMT_AUTO_MEMORY_RECOVERY_UNAVAILABLE', '当前环境没有可用的自动留忆备份存储，聊天里的记录没有被覆盖。');
}

async function database() {
    return new Promise((resolve, reject) => {
        let request;
        let settled = false;
        const timer = setTimeout(() => { settled = true; reject(recoveryUnavailable()); }, 5000);
        const stop = () => { clearTimeout(timer); if (!settled) { settled = true; reject(recoveryUnavailable()); } };
        try {
            request = globalThis.indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
            };
            request.onerror = stop;
            request.onblocked = stop;
            request.onsuccess = () => {
                if (settled) { request.result.close(); return; }
                settled = true;
                clearTimeout(timer);
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        } catch { stop(); }
    });
}

export async function readAutoMemoryRecovery(chatId) {
    if (!autoMemoryRecoveryAvailable()) throw recoveryUnavailable();
    const key = recoveryKey(chatId);
    const stored = testBackend ? await testBackend.read(key) : await idbRead(key);
    if (!stored) return null;
    return parseAutoMemoryRecoveryRecord(stored);
}

export async function writeAutoMemoryRecovery(chatId, snapshot, expectedRevision) {
    if (!autoMemoryRecoveryAvailable()) throw recoveryUnavailable();
    const parsed = parseAutoMemorySnapshot(snapshot);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || parsed.plan.revision !== expectedRevision + 1) throw stale();
    const record = parseAutoMemoryRecoveryRecord({
        key: recoveryKey(chatId), schemaVersion: 1, chatId, revision: parsed.plan.revision, payload: parsed,
    });
    if (testBackend) return parseAutoMemoryRecoveryRecord(await testBackend.write(record.key, expectedRevision, record));
    return parseAutoMemoryRecoveryRecord(await idbWrite(record.key, expectedRevision, record));
}

async function idbRead(key) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            let result = null;
            const timer = setTimeout(() => { try { tx.abort(); } catch { /* already closed */ } reject(recoveryUnavailable()); }, 5000);
            const request = tx.objectStore(STORE).get(key);
            request.onsuccess = () => { result = request.result || null; };
            tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
            tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(recoveryUnavailable()); };
        });
    } finally { db.close(); }
}

export async function compareAutoMemoryRecord(key, decide) {
    if (!autoMemoryRecoveryAvailable()) throw recoveryUnavailable();
    if (testBackend) {
        if (typeof testBackend.compare !== 'function') throw recoveryUnavailable();
        return testBackend.compare(key, decide);
    }
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const timer = setTimeout(() => { try { tx.abort(); } catch { /* already closed */ } reject(recoveryUnavailable()); }, 5000);
            const store = tx.objectStore(STORE);
            const request = store.get(key);
            request.onsuccess = () => {
                let next;
                try { next = decide(request.result || null); }
                catch (error) { try { tx.abort(); } catch { /* already closed */ } reject(error); return; }
                if (next === undefined) return;
                if (next === null) store.delete(key);
                else store.put(next);
            };
            tx.oncomplete = () => { clearTimeout(timer); resolve(true); };
            tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(recoveryUnavailable()); };
        });
    } finally { db.close(); }
}

async function idbWrite(key, expectedRevision, record) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            let mismatch = false;
            const timer = setTimeout(() => { try { tx.abort(); } catch { /* already closed */ } reject(recoveryUnavailable()); }, 5000);
            const store = tx.objectStore(STORE);
            const request = store.get(key);
            request.onsuccess = () => {
                if ((request.result?.revision || 0) !== expectedRevision) { mismatch = true; tx.abort(); return; }
                store.put(record);
            };
            tx.oncomplete = () => { clearTimeout(timer); resolve(record); };
            tx.onabort = tx.onerror = () => {
                clearTimeout(timer);
                reject(mismatch ? stale('自动留忆备份版本已变化，没有覆盖较新的记录。') : recoveryUnavailable());
            };
        });
    } finally { db.close(); }
}
