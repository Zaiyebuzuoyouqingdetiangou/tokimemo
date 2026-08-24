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

export function queueDeferredCommit(origin, commit) {
    if (!origin?.characterKey || !origin?.chatId || !commit?.kind) return;
    const key = `${origin.characterKey}|${origin.chatId}`;
    const list = runtimeState.deferredChatCommits.get(key) || [];
    if (commit.kind === 'heartPatches') {
        const previous = list.find(item => item.kind === 'heartPatches');
        const mergedPatches = modes_heart.mergeDeferredHeartPatches(previous?.patches, commit.patches);
        const filtered = list.filter(item => item.kind !== 'heartPatches');
        filtered.push({ kind: 'heartPatches', patches: mergedPatches, origin, queuedAt: Date.now() });
        runtimeState.deferredChatCommits.set(key, filtered);
        return;
    }
    if (commit.kind === 'sessions') {
        const previous = list.find(item => item.kind === 'sessions');
        const mergedSessions = { ...(previous?.sessions || {}), ...(commit.sessions || {}) };
        const filtered = list.filter(item => item.kind !== 'sessions');
        filtered.push({ kind: 'sessions', sessions: mergedSessions, origin, queuedAt: Date.now() });
        runtimeState.deferredChatCommits.set(key, filtered);
        return;
    }
    const filtered = list.filter(item => item.kind !== commit.kind);
    filtered.push({ ...commit, origin, queuedAt: Date.now() });
    runtimeState.deferredChatCommits.set(key, filtered);
}

export function generationTaskKeyForMode(mode, context = null) {
    let scope = '';
    try { scope = core_context.chatScopeKey(context || core_context.currentCharacterGuard()); } catch {}
    return `mode:${scope}:${core_text.normalizeText(mode, 80)}`;
}

export function hasGenerationTasks() {
    return runtimeState.activeGenerationTasks.size > 0 || runtimeState.activeModeBuildScopes.size > 0 || runtimeState.activeAdvBulkScopes.size > 0 || runtimeState.activeCgImageTasks.size > 0;
}

export function hasAnyTask() {
    return runtimeState.busy || hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise;
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
    ui_settingsPanel.refreshSettingsMemoryStatus();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay || overlay.hidden) return;
    if (runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM && core_constants.ROOM_DEEP_MODES.includes(taskMode) && (!origin || core_context.isCurrentTaskOrigin(origin))) {
        modes_room.renderRoom();
        return;
    }
    if (!runtimeState.activeMode) archive_snapshots.scheduleChooserRefresh(30);
}
