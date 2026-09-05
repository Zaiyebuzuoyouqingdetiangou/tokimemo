// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_room from '../modes/room.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';

let deferredDurabilityWarningShown = false;

function sameDeferredOrigin(left, right) {
    if (!left || !right) return false;
    return ['startedAt', 'characterKey', 'characterAvatar', 'characterId', 'chatId', 'archiveRevision', 'archivePresent', 'sourceMessageCount']
        .every(key => String(left?.[key] ?? '') === String(right?.[key] ?? ''))
        && JSON.stringify(left?.modeWriteFences || {}) === JSON.stringify(right?.modeWriteFences || {});
}

function reportDeferredDurability() {
    const status = runtimeState.deferredChatCommits.persistenceStatus?.() || { healthy: false, error: '本地待写回存储不可用。' };
    if (status.healthy) {
        deferredDurabilityWarningShown = false;
        return true;
    }
    if (!deferredDurabilityWarningShown) {
        deferredDurabilityWarningShown = true;
        const detail = core_text.normalizeText(status.error, 400) || '浏览器没有保存待写回结果。';
        console.error('[HeartbeatMemories] deferred commit is memory-only', detail);
        globalThis.toastr?.error?.(`生成结果暂时只能保留在当前页面内：${detail} 请先回到原聊天完成写回，不要刷新页面。`, '心跳回忆');
    }
    return false;
}

export function queueDeferredCommitRecord(origin, commit) {
    if (!origin?.characterKey || !origin?.chatId || !commit?.kind) return { durable: false, key: '', item: null };
    if (commit.kind === 'archive'
        && core_context.comparableChatId(commit?.memoryBank?.chatId) !== core_context.comparableChatId(origin.chatId)) {
        return { durable: false, key: '', item: null };
    }
    if (Number(origin.lifecycleEpoch) !== runtimeState.runtimeLifecycleEpoch) return { durable: false, key: '', item: null };
    const key = `${origin.characterKey}|${origin.chatId}`;
    const list = runtimeState.deferredChatCommits.get(key) || [];
    if (commit.kind === 'heartPatches') {
        const previous = list.find(item => item.kind === 'heartPatches' && sameDeferredOrigin(item.origin, origin));
        const mergedPatches = modes_heart.mergeDeferredHeartPatches(previous?.patches, commit.patches);
        const filtered = list.filter(item => item !== previous);
        const item = { kind: 'heartPatches', patches: mergedPatches, origin, queuedAt: Date.now() };
        filtered.push(item);
        runtimeState.deferredChatCommits.set(key, filtered);
        return { durable: reportDeferredDurability(), key, item };
    }
    if (commit.kind === 'sessions') {
        const previous = list.find(item => item.kind === 'sessions' && sameDeferredOrigin(item.origin, origin));
        const mergedSessions = { ...(previous?.sessions || {}), ...(commit.sessions || {}) };
        const filtered = list.filter(item => item !== previous);
        const item = { kind: 'sessions', sessions: mergedSessions, origin, queuedAt: Date.now() };
        filtered.push(item);
        runtimeState.deferredChatCommits.set(key, filtered);
        return { durable: reportDeferredDurability(), key, item };
    }
    const previous = list.find(item => item.kind === commit.kind && sameDeferredOrigin(item.origin, origin));
    const filtered = list.filter(item => item !== previous);
    const item = { ...commit, origin, queuedAt: Date.now() };
    filtered.push(item);
    runtimeState.deferredChatCommits.set(key, filtered);
    return { durable: reportDeferredDurability(), key, item };
}

export function queueDeferredCommit(origin, commit) {
    return queueDeferredCommitRecord(origin, commit).durable;
}

export function acknowledgeDeferredCommit(key, completedItem) {
    const list = runtimeState.deferredChatCommits.get(key);
    if (!Array.isArray(list) || !completedItem) return false;
    // The flush loop receives the exact object stored in this Map. A same-kind result can
    // arrive while that flush is awaiting hydration/storage and replaces it with a new
    // object; timestamps are only millisecond-resolution and must never authorize deleting
    // that newer merged result.
    const remaining = list.filter(item => item !== completedItem);
    if (remaining.length === list.length) return false;
    if (remaining.length) {
        if (typeof runtimeState.deferredChatCommits.replaceDurably === 'function') {
            if (!runtimeState.deferredChatCommits.replaceDurably(key, remaining)) return false;
        } else runtimeState.deferredChatCommits.set(key, remaining);
    } else if (!runtimeState.deferredChatCommits.delete(key)) return false;
    reportDeferredDurability();
    return true;
}

export function deferredCommitPersistenceStatus() {
    return runtimeState.deferredChatCommits.persistenceStatus?.() || {
        available: false,
        healthy: false,
        pendingItems: [...runtimeState.deferredChatCommits.values()].reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
        error: '本地待写回存储不可用。',
    };
}

export function generationTaskKeyForMode(mode, context = null) {
    let scope = '';
    try {
        const ctx = context || core_context.currentCharacterGuard();
        const memory = ctx?.chatMetadata?.[core_constants.MEMORY_KEY];
        const chatId = core_context.comparableChatId(memory?.chatId || core_context.getChatId(ctx));
        const revision = core_text.normalizeText(memory?.archiveRevision, 240);
        let entryId = core_text.normalizeText(ctx?.__rmtArchiveTargetEntryId, 120);
        if (!entryId && chatId) {
            const memoryName = core_text.normalizeText(memory?.characterName, 120);
            const rows = Array.isArray(ctx?.extensionSettings?.[core_constants.ARCHIVE_INDEX_SETTINGS_KEY])
                ? ctx.extensionSettings[core_constants.ARCHIVE_INDEX_SETTINGS_KEY]
                : [];
            const matches = rows.filter(item => core_context.comparableChatId(item?.chatId) === chatId
                && (!memoryName || core_text.normalizeText(item?.characterName, 120) === memoryName));
            if (matches.length === 1) entryId = core_context.archiveIndexEntryId(matches[0]);
        }
        // The canonical archive identity deliberately excludes the mutable card fingerprint.
        // Editing a card while a generation is in flight must not create a second "latest" lane.
        scope = `${entryId || `archive:${core_context.stableArchiveHash(`${chatId}\u001f${core_text.normalizeText(memory?.characterName, 120)}`)}`}|${chatId}|${revision}`;
    } catch {}
    return `mode:${scope}:${core_text.normalizeText(mode, 80)}`;
}

export function generationTaskKeyForArchiveTarget(mode, target) {
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const chatId = core_context.comparableChatId(target?.chatId || target?.memory?.chatId);
    const revision = core_text.normalizeText(target?.archiveRevision || target?.memory?.archiveRevision, 240);
    if (!entryId || !chatId || !revision) return '';
    return `mode:${entryId}|${chatId}|${revision}:${core_text.normalizeText(mode, 80)}`;
}

export function registerArchiveTargetReservation(taskKey, targetRuntime, mode, label = '') {
    const key = core_text.normalizeText(taskKey, 240);
    const target = targetRuntime?.archiveTarget;
    const entryId = core_text.normalizeText(target?.entryId, 120);
    if (!key || !entryId) return;
    const modeKey = core_text.normalizeText(mode, 80);
    const characterName = core_text.normalizeText(target?.characterName, 120);
    const archiveName = core_text.normalizeText(target?.archiveName, 160);
    runtimeState.activeArchiveTargetReservations.set(key, {
        key,
        entryId,
        mode: modeKey,
        characterName,
        archiveName,
        label: core_text.normalizeText(label, 220) || `${characterName} · ${archiveName} · ${core_constants.MODE_LABEL?.[modeKey] || modeKey}生成中`,
        startedAt: Date.now(),
    });
}

export function unregisterArchiveTargetReservation(taskKey) {
    runtimeState.activeArchiveTargetReservations.delete(core_text.normalizeText(taskKey, 240));
}

export function isArchiveTargetModeGenerating(mode, target) {
    const key = generationTaskKeyForArchiveTarget(mode, target);
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const activeSubtask = !!entryId && [...runtimeState.activeGenerationTasks.values()].some(task =>
        core_text.normalizeText(task?.origin?.archiveTargetEntryId, 120) === entryId
        && core_text.normalizeText(task?.mode, 80) === core_text.normalizeText(mode, 80));
    const reservedSubtask = !!entryId && [...runtimeState.activeArchiveTargetReservations.values()].some(task =>
        task.entryId === entryId && task.mode === core_text.normalizeText(mode, 80));
    return (!!key && (runtimeState.activeGenerationTasks.has(key) || runtimeState.activeModeBuildScopes.has(key))) || activeSubtask || reservedSubtask;
}

export function hasGenerationTasks() {
    return runtimeState.activeGenerationTasks.size > 0 || runtimeState.activeModeBuildScopes.size > 0 || runtimeState.activeAdvBulkScopes.size > 0 || runtimeState.activeArchiveTargetReservations.size > 0 || runtimeState.activeCgImageTasks.size > 0;
}

export function hasAnyTask() {
    return runtimeState.busy || hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise;
}

export function hasUnloadRisk() {
    return hasAnyTask()
        || runtimeState.deferredChatCommits.size > 0
        || runtimeState.pendingCompressedCacheWrites.size > 0
        || runtimeState.cachePersistTimers.size > 0
        || runtimeState.cachePersistChains.size > 0
        || runtimeState.archiveCommitChains.size > 0;
}

// ---------------------------------------------------------------------------
// Navigation lock support.
//
// A task is "chat-bound" when its captured origin still matches the chat the
// user is looking at. Leaving that chat mid-flight is what the deferred-commit
// machinery was built to survive, but users asked to be stopped at the door
// instead of relying on the safety net, so these helpers let the UI ask
// "is anything still tied to THIS chat right now?".
// ---------------------------------------------------------------------------

export function currentChatBlockingTasks(context = null) {
    const labels = [];
    const seen = new Set();
    const push = label => {
        const text = core_text.normalizeText(label, 120);
        if (!text || seen.has(text)) return;
        seen.add(text);
        labels.push(text);
    };
    let liveContext = context;
    if (!liveContext) {
        try { liveContext = core_context.getContext(); } catch { liveContext = null; }
    }
    if (!liveContext) return labels;
    // The archive import path owns the exclusive `busy` flag and always targets
    // the chat it was started from.
    if (runtimeState.busy && (!runtimeState.activeTaskOrigin || core_context.isCurrentTaskOrigin(runtimeState.activeTaskOrigin, liveContext))) {
        push(runtimeState.activeTaskLabel || '正在整理聊天档案');
    }
    for (const task of runtimeState.activeGenerationTasks.values()) {
        // ArchiveTarget requests are detached from the host's currently open chat. They must
        // remain an unload risk, but must never trigger the "do not leave this chat" navigation
        // warning or imply that returning to A is required for the IndexedDB commit.
        if (core_text.normalizeText(task?.origin?.archiveTargetEntryId, 120)) continue;
        if (task?.origin && !core_context.isCurrentTaskOrigin(task.origin, liveContext)) continue;
        push(task?.label || task?.mode || '内容生成');
    }
    for (const task of runtimeState.activeCgImageTasks.values()) {
        if (task?.origin && !core_context.isCurrentTaskOrigin(task.origin, liveContext)) continue;
        push(task?.label || 'CG 绘制');
    }
    if (runtimeState.roomLifeRefreshPromise
        && (!runtimeState.roomLifeRefreshOrigin || core_context.isCurrentTaskOrigin(runtimeState.roomLifeRefreshOrigin, liveContext))) {
        push('今日生活生成');
    }
    return labels;
}

export function hasCurrentChatBlockingTask(context = null) {
    return currentChatBlockingTasks(context).length > 0;
}

export function isGenerationTaskRunning(key) {
    return runtimeState.activeGenerationTasks.has(String(key || ''));
}

export function isModeGenerating(mode, context = null) {
    const ctx = context || (() => { try { return core_context.currentCharacterGuard(); } catch { return null; } })();
    const key = generationTaskKeyForMode(mode, ctx);
    let cgDrawing = false;
    try {
        const scope = ctx ? core_context.chatScopeKey(ctx) : '';
        const prefix = `cg-image:${scope}:${mode}:`;
        cgDrawing = !!scope && [...runtimeState.activeCgImageTasks.keys()].some(taskKey => taskKey.startsWith(prefix));
    } catch {}
    let isolatedEndingScan = false;
    try {
        const scope = ctx ? core_context.chatScopeKey(ctx) : '';
        isolatedEndingScan = mode === core_constants.MODE.ENDING && !!scope
            && (runtimeState.activeGenerationTasks.has(`ending-confessions:${scope}`) || runtimeState.activeModeBuildScopes.has(`ending-confessions:${scope}`));
    } catch {}
    return isGenerationTaskRunning(key) || runtimeState.activeModeBuildScopes.has(key) || cgDrawing || isolatedEndingScan;
}

export function hasGenerationTaskPrefix(prefix) {
    for (const key of runtimeState.activeGenerationTasks.keys()) if (key.startsWith(prefix)) return true;
    return false;
}

export function generationTaskLabels() {
    const labels = [...runtimeState.activeGenerationTasks.values()].map(task => task.label).filter(Boolean);
    for (const [taskKey, task] of runtimeState.activeCgImageTasks.entries()) {
        if (runtimeState.activeGenerationTasks.has(taskKey)) continue;
        labels.push(task?.mode === core_constants.MODE.HEART ? '日常一格绘制中' : 'CG 实图绘制中');
    }
    for (const scope of runtimeState.activeAdvBulkScopes) {
        const represented = [...runtimeState.activeGenerationTasks.keys()].some(key => key === `adv-bulk:${scope}` || key.startsWith(`adv-user-repair:${scope}:`));
        if (!represented) labels.push('ADV 批量任务准备中');
    }
    return [...new Set(labels)];
}

export function activeModeBuildScopeForTask(taskKey) {
    const key = String(taskKey || '');
    let match = '';
    for (const scope of runtimeState.activeModeBuildScopes) {
        if (key === scope || key.startsWith(`${scope}:`)) {
            if (scope.length > match.length) match = scope;
        }
    }
    return match;
}

export function activeLogicalGenerationKeys() {
    const keys = new Set(runtimeState.activeModeBuildScopes);
    for (const [taskKey, task] of runtimeState.activeGenerationTasks.entries()) {
        keys.add(core_text.normalizeText(task?.parentTaskKey, 240) || activeModeBuildScopeForTask(taskKey) || taskKey);
    }
    for (const taskKey of runtimeState.activeCgImageTasks.keys()) keys.add(taskKey);
    for (const scope of runtimeState.activeAdvBulkScopes) {
        const batchKey = `adv-bulk:${scope}`;
        const hasConcreteBatchRequest = [...keys].some(key => key === batchKey || key.startsWith(`adv-user-repair:${scope}:`));
        if (!hasConcreteBatchRequest) keys.add(batchKey);
    }
    return keys;
}

export function advBulkReservationKeyForTask(taskKey) {
    const key = String(taskKey || '');
    for (const scope of runtimeState.activeAdvBulkScopes) {
        if (key === `adv-bulk:${scope}` || key.startsWith(`adv-user-repair:${scope}:`)) return `adv-bulk:${scope}`;
    }
    return '';
}

export function activeLogicalGenerationCount() {
    return activeLogicalGenerationKeys().size;
}

export function canStartGenerationTask(key) {
    if (runtimeState.busy) return false;
    const taskKey = String(key || '');
    if (isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) return false;
    const keys = activeLogicalGenerationKeys();
    keys.delete(taskKey);
    const bulkReservation = advBulkReservationKeyForTask(taskKey);
    if (bulkReservation) keys.delete(bulkReservation);
    return keys.size < core_constants.MAX_CONCURRENT_GENERATION_TASKS;
}

export function createGenerationAbortError(message = '生成任务已取消。') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}

export function shouldDeferCachePersistForProviderTraffic() {
    return runtimeState.activeProviderRequestCount > 0 || runtimeState.providerRequestQueue.length > 0;
}

export function createProviderPermitRelease() {
    let released = false;
    return () => {
        if (released) return;
        released = true;
        runtimeState.activeProviderRequestCount = Math.max(0, runtimeState.activeProviderRequestCount - 1);
        drainProviderRequestQueue();
    };
}

export function drainProviderRequestQueue() {
    while (runtimeState.activeProviderRequestCount < core_constants.MAX_CONCURRENT_PROVIDER_REQUESTS && runtimeState.providerRequestQueue.length) {
        const waiter = runtimeState.providerRequestQueue.shift();
        if (!waiter || waiter.signal?.aborted) {
            try { waiter?.signal?.removeEventListener?.('abort', waiter.onAbort); } catch {}
            waiter?.reject?.(createGenerationAbortError());
            continue;
        }
        try { waiter.signal?.removeEventListener?.('abort', waiter.onAbort); } catch {}
        runtimeState.activeProviderRequestCount += 1;
        waiter.resolve(createProviderPermitRelease());
    }
}

export function acquireProviderRequestPermit(signal) {
    if (signal?.aborted) return Promise.reject(createGenerationAbortError());
    if (runtimeState.activeProviderRequestCount < core_constants.MAX_CONCURRENT_PROVIDER_REQUESTS) {
        runtimeState.activeProviderRequestCount += 1;
        return Promise.resolve(createProviderPermitRelease());
    }
    return new Promise((resolve, reject) => {
        const waiter = { signal, resolve, reject, onAbort: null };
        waiter.onAbort = () => {
            const index = runtimeState.providerRequestQueue.indexOf(waiter);
            if (index >= 0) runtimeState.providerRequestQueue.splice(index, 1);
            try { signal?.removeEventListener?.('abort', waiter.onAbort); } catch {}
            reject(createGenerationAbortError());
        };
        signal?.addEventListener?.('abort', waiter.onAbort, { once: true });
        runtimeState.providerRequestQueue.push(waiter);
    });
}

export function generationRequestTimeoutMs(value) {
    const requested = Number(value);
    if (!Number.isFinite(requested) || requested <= 0) return core_constants.DEFAULT_GENERATION_REQUEST_TIMEOUT_MS;
    return Math.max(core_constants.MIN_GENERATION_REQUEST_TIMEOUT_MS, Math.min(core_constants.MAX_GENERATION_REQUEST_TIMEOUT_MS, Math.floor(requested)));
}

export function runGenerationRequestWithTimeout(factory, controller, timeoutMs, statusText = '') {
    const duration = generationRequestTimeoutMs(timeoutMs);
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = 0;
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            try { controller.signal.removeEventListener('abort', onAbort); } catch {}
            handler(value);
        };
        const onAbort = () => {
            const reason = controller.signal.reason;
            finish(reject, reason instanceof Error ? reason : createGenerationAbortError());
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) {
            onAbort();
            return;
        }
        timer = setTimeout(() => {
            const seconds = Math.round(duration / 1000);
            const label = core_text.normalizeText(statusText, 120);
            const error = new Error(`${label ? `${label}：` : ''}模型请求超过 ${seconds} 秒仍未完成，已停止等待并释放任务位。请稍后重试；若反复发生，请检查代理/模型速度或降低单次输出上限。`);
            error.code = 'RMT_REQUEST_TIMEOUT';
            error.retryable = false;
            finish(reject, error);
            try { controller.abort(error); } catch {}
        }, duration);
        Promise.resolve()
            .then(factory)
            .then(value => finish(resolve, value), error => finish(reject, error));
    });
}

export function shouldRetrySegmentRequest(error) {
    if (!error || error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') return false;
    if (['RMT_REQUEST_TIMEOUT', 'RMT_CONNECTION_AUTH', 'RMT_CONNECTION_CONTEXT_LIMIT', 'RMT_CONNECTION_CONFIG', 'RMT_CONNECTION_INVALID_REQUEST'].includes(error?.code)) return false;
    return error?.retryableJson === true || error?.retryable === true;
}

export function validateGeneratedSegment(raw, validator) {
    try {
        return validator(raw);
    } catch (error) {
        if (error && !error.code) error.code = 'RMT_SEGMENT_VALIDATION';
        if (error && error.retryable === undefined) error.retryable = true;
        throw error;
    }
}

export async function waitBeforeSegmentRetry(error) {
    const delay = error?.code === 'RMT_CONNECTION_RATE_LIMIT' ? 1800
        : error?.code === 'RMT_CONNECTION_SERVER' ? 1000
            : 0;
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    await core_context.yieldToUi();
}

export function refreshConcurrentTaskUi(taskMode = '', origin = null) {
    // Detached ArchiveTarget work must never touch the currently open chat merely to refresh
    // task chrome. The lightweight status path reads active task records only; it does not call
    // currentCharacterGuard/getImportedMemory for unrelated chat B.
    if (core_text.normalizeText(origin?.archiveTargetEntryId, 120)) {
        ui_settingsPanel.refreshSettingsTaskStatus();
        return;
    }
    ui_settingsPanel.refreshSettingsMemoryStatus();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay || overlay.hidden) return;
    if (runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM && core_constants.ROOM_DEEP_MODES.includes(taskMode) && (!origin || core_context.isCurrentTaskOrigin(origin))) {
        modes_room.renderRoom();
        return;
    }
    if (!runtimeState.activeMode) archive_snapshots.scheduleChooserRefresh(30);
}
