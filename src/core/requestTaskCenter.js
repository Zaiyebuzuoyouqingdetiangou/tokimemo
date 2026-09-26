// C-3c（r84.100）：别名沿用 archive_snapshots，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_snapshots from './archiveBridge.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
// C-3b（r84.99）：别名沿用 generation_recovery，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as generation_recovery from './generationBridge.js';
// C-3（r84.98）：别名沿用 modes_room，函数体一字不改；实际指向 core 层的桥，不再 import modes 层。
import * as modes_room from './modesBridge.js';
// C-2（r84.97）：别名沿用 ui_settingsPanel，函数体一字不改；实际指向 core 层的桥，不再 import ui 层。
import * as ui_settingsPanel from './uiBridge.js';
import { TASK_PHASE_LABEL, abortTaskController, cancelledLogicalOrigins, collectChatTaskRows, createGenerationAbortError, logicalGenerationTaskForOrigin, logicalGenerationTasks, originMatchesChatScope, recentChatTasks } from './requestTasks.js';
// 任务中心：阶段记录、清空与取消、并发界面刷新、任务收尾
// 从 core/requestCoordinator.js 原样搬出（重构阶段 2），声明文本一字未改；core/requestCoordinator.js 仍转发原有导出。

let settledTaskSequence = 0;

let refreshTaskCenter = () => {};

export function finishLogicalGenerationTask(handle, result = null) {
    if (!handle || logicalGenerationTasks.get(handle.id) !== handle) return;
    handle.status = result?.status || (handle.signal.aborted ? 'cancelled' : 'settled');
    if (result?.error) {
        handle.failureCode = core_text.normalizeText(result.error.code, 80);
        handle.failureSummary = core_text.safeErrorSummary(result.error);
    }
    handle.releaseParent();
    if (handle.signal.aborted) cancelledLogicalOrigins.push(handle);
    logicalGenerationTasks.delete(handle.id);
    // The refresh inside rememberSettledTask must not see this finished task
    // as still running; otherwise the archive chip remains stuck at “准备”.
    rememberSettledTask(handle, handle.status);
    handle.resolveSettled({ id: handle.id, kind: handle.kind, mode: handle.mode, pageId: handle.pageId, status: handle.status });
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

export function setTaskCenterRefresh(refresh) {
    refreshTaskCenter = typeof refresh === 'function' ? refresh : () => {};
}

export function noteChatTaskPhase(phase, { taskKey = '', origin = null } = {}) {
    const next = TASK_PHASE_LABEL[phase] ? phase : 'prepare';
    const key = core_text.normalizeText(taskKey, 240);
    if (key) {
        const task = runtimeState.activeGenerationTasks.get(key);
        if (task) task.phase = next;
        const image = runtimeState.activeCgImageTasks.get(key);
        if (image) image.phase = next;
    }
    const logical = origin ? logicalGenerationTaskForOrigin(origin) : null;
    if (logical && logicalGenerationTasks.get(logical.id) === logical) logical.phase = next;
    else if (key) {
        for (const task of logicalGenerationTasks.values()) {
            if (task.taskKey === key) task.phase = next;
        }
    }
    try { refreshTaskCenter(); } catch {}
}

function rememberSettledTask(source, outcome) {
    const origin = source?.origin || null;
    const aborted = outcome === 'cancelled' || source?.signal?.aborted;
    const status = aborted ? 'cancelled' : outcome === 'failed' || outcome === 'blocked' ? 'failed' : 'done';
    const progress = generation_recovery.generationRecoveryProgress(origin);
    const recovery = generation_recovery.generationRecoveryForOrigin(origin);
    const offer = status === 'done' ? (source?.secondStepOffer || origin?.rmtSecondStepOffer || null) : null;
    const failureCode = core_text.normalizeText(recovery?.failureCode || source?.failureCode, 80);
    const failureSummary = status === 'failed'
        ? (failureCode
            ? core_text.safeErrorSummary({ code: failureCode, archiveInputCategory: recovery?.failureCategory, recoveryPhase: recovery?.failurePhase })
            : core_text.normalizeText(source?.failureSummary, 240))
        : '';
    const row = {
        id: `settled-${++settledTaskSequence}`,
        label: core_text.normalizeText(source?.label || core_constants.MODE_LABEL[source?.mode] || '任务', 120),
        kind: source?.kind || 'logical',
        phase: status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'failed' : 'done',
        outcome: status,
        characterName: core_text.normalizeText(origin?.characterName, 120),
        characterId: String(origin?.characterId ?? ''),
        chatId: core_context.comparableChatId(origin?.chatId),
        mode: core_text.normalizeText(source?.mode || offer?.mode || progress?.mode, 80),
        draftId: core_text.normalizeText(origin?.generationRecoveryDraftId || progress?.draftId, 240),
        pageId: core_text.normalizeText(offer?.pageId || progress?.pageId, 80),
        received: Number(progress?.received) || 0,
        saved: Number(progress?.saved) || 0,
        failureCode,
        failureSummary,
        secondStepLabel: offer?.label || '',
        secondStepKind: offer?.kind || '',
        secondStepPageId: offer?.pageId || '',
        archiveTarget: !!core_text.normalizeText(origin?.archiveTargetEntryId, 120),
        endedAt: Date.now(),
    };
    if (!row.label) return;
    recentChatTasks.unshift(row);
    while (recentChatTasks.length > 8) recentChatTasks.pop();
    try { refreshTaskCenter(); } catch {}
}

export function rememberStandaloneChatTask(record) {
    const logical = logicalGenerationTaskForOrigin(record?.origin);
    if (logical && logicalGenerationTasks.get(logical.id) === logical) return;
    rememberSettledTask(record, record?.outcome);
}

export function clearCompletedChatTasks() {
    const before = recentChatTasks.length;
    for (let index = recentChatTasks.length - 1; index >= 0; index -= 1) {
        const outcome = recentChatTasks[index].outcome;
        if (outcome === 'done' || outcome === 'cancelled') recentChatTasks.splice(index, 1);
    }
    const removed = before - recentChatTasks.length;
    try { refreshTaskCenter(); } catch {}
    return removed;
}

export function cancelChatTask(id, reason = 'task-center') {
    const row = collectChatTaskRows().find(item => item.id === String(id || '') && item.running);
    if (!row) return { cancelled: 0, reason };
    if (row.logicalId) {
        const task = logicalGenerationTasks.get(row.logicalId);
        if (task) task.status = 'cancelling';
    }
    const seen = new Set();
    let cancelled = 0;
    for (const controller of row.controllers) {
        if (abortTaskController(controller, seen)) cancelled += 1;
    }
    try { refreshTaskCenter(); } catch {}
    return { cancelled, reason };
}

// Abort every in-flight task bound to one chat. Callers do not wait for the
// network promise; owners still record cancelled and clear their busy flags.
export function cancelBlockingTasksForScope(scope, reason = 'chat-navigation') {
    const target = String(scope || '');
    if (!target) return { cancelled: 0, reason };
    runtimeState.cancelledChatScopeAt.set(target, Date.now());
    const seen = new Set();
    let cancelled = 0;
    const busyOrigin = runtimeState.activeTaskOrigin;
    const busyMatches = runtimeState.busy && (!busyOrigin || originMatchesChatScope(busyOrigin, target));
    if (busyMatches && abortTaskController(runtimeState.activeTaskAbortController, seen)) cancelled += 1;
    for (const task of logicalGenerationTasks.values()) {
        const matches = task.scope === target || originMatchesChatScope(task.origin, target);
        if (!matches || core_text.normalizeText(task.origin?.archiveTargetEntryId, 120)) continue;
        task.status = 'cancelling';
        if (abortTaskController(task.controller, seen)) cancelled += 1;
    }
    for (const task of runtimeState.activeGenerationTasks.values()) {
        if (!originMatchesChatScope(task.origin, target)) continue;
        if (abortTaskController(task.controller, seen)) cancelled += 1;
    }
    for (const task of runtimeState.activeCgImageTasks.values()) {
        if (!originMatchesChatScope(task.origin, target)) continue;
        if (abortTaskController(task.controller, seen)) cancelled += 1;
    }
    for (const [scope, controller] of runtimeState.activeAdvBulkControllers.entries()) {
        if (scope === target && abortTaskController(controller, seen)) cancelled += 1;
    }
    if (!runtimeState.roomLifeRefreshOrigin || originMatchesChatScope(runtimeState.roomLifeRefreshOrigin, target)) {
        if (abortTaskController(runtimeState.roomLifeAbortController, seen)) cancelled += 1;
    }
    return { cancelled, reason };
}

export function cancelCurrentChatBlockingTasks(context = null, reason = 'chat-navigation') {
    let live = context;
    if (!live) {
        try { live = core_context.getContext(); } catch { live = null; }
    }
    if (!live) return { cancelled: 0, reason };
    return cancelBlockingTasksForScope(core_context.chatScopeKey(live), reason);
}

export function shouldDeferCachePersistForProviderTraffic() {
    return runtimeState.activeProviderRequestCount > 0 || runtimeState.providerRequestQueue.length > 0;
}

// ---------------------------------------------------------------------------
// Adaptive rate-limit throttle.
//
// A composite mode fires many requests back to back (the terminal alone is a plan
// plus one request per app). On a low-RPM endpoint the 3rd or 4th one gets a 429,
// the single 1.8s retry is nowhere near the provider's window, and the whole
// composite aborts — which is why these modes "never come out".
//
// Once a 429 is seen we stop guessing: serialise provider requests and space them
// out for the rest of the session. The throttle decays on its own after a quiet
// period so a one-off spike does not slow everything down forever.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MEMORY_MS = 10 * 60 * 1000;

const RATE_LIMIT_PACING_MS = [0, 2500, 6000, 12000];

export function resetProviderRateLimitThrottle() {
    runtimeState.rateLimitHits = 0;
    runtimeState.rateLimitSeenAt = 0;
    runtimeState.rateLimitRetryAfterMs = 0;
    drainProviderRequestQueue();
}

export function noteProviderRateLimit(error = null) {
    runtimeState.rateLimitHits = Math.min(8, Number(runtimeState.rateLimitHits || 0) + 1);
    runtimeState.rateLimitSeenAt = Date.now();
    const hinted = Number(error?.retryAfterMs);
    if (Number.isFinite(hinted) && hinted > 0) runtimeState.rateLimitRetryAfterMs = Math.min(120000, hinted);
}

export function activeRateLimitPressure() {
    const seenAt = Number(runtimeState.rateLimitSeenAt || 0);
    if (!seenAt || Date.now() - seenAt > RATE_LIMIT_MEMORY_MS) {
        runtimeState.rateLimitHits = 0;
        runtimeState.rateLimitRetryAfterMs = 0;
        return 0;
    }
    return Number(runtimeState.rateLimitHits || 0);
}

// Effective parallelism: drop to a single in-flight request as soon as the endpoint
// has complained once. Two concurrent requests double the rate you hit the limit.
export function effectiveProviderConcurrency() {
    return activeRateLimitPressure() > 0 ? 1 : core_constants.MAX_CONCURRENT_PROVIDER_REQUESTS;
}

export function providerPacingDelayMs() {
    const pressure = activeRateLimitPressure();
    if (pressure <= 0) return 0;
    return RATE_LIMIT_PACING_MS[Math.min(pressure, RATE_LIMIT_PACING_MS.length - 1)];
}

export async function waitForProviderPacing(signal = null) {
    const delay = providerPacingDelayMs();
    if (delay <= 0) return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            try { signal?.removeEventListener?.('abort', onAbort); } catch {}
            resolve();
        }, delay);
        function onAbort() {
            clearTimeout(timer);
            reject(createGenerationAbortError());
        }
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
}

export function createProviderPermitRelease() {
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (runtimeState.runtimeLifecycleEpoch !== lifecycleEpoch) return;
        runtimeState.activeProviderRequestCount = Math.max(0, runtimeState.activeProviderRequestCount - 1);
        drainProviderRequestQueue();
    };
}

export function drainProviderRequestQueue() {
    while (runtimeState.activeProviderRequestCount < effectiveProviderConcurrency() && runtimeState.providerRequestQueue.length) {
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
    if (runtimeState.activeProviderRequestCount < effectiveProviderConcurrency()) {
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
        // Clock-stamp timeout, not a bare setTimeout callback. A backgrounded or
        // locked page parks timers and then fires the overdue callback all at once
        // on resume, which used to abort requests that were still transferring
        // normally. Judge by real visible elapsed time: while the page is hidden
        // no timeout is declared, and time spent hidden does not count against the
        // limit. The RMT_REQUEST_TIMEOUT code and retryable=false semantics are
        // unchanged for requests that genuinely overstay while visible.
        const startedAt = Date.now();
        let hiddenAt = 0;
        let hiddenMs = 0;
        const pageHidden = () => {
            try { return globalThis.document?.visibilityState === 'hidden'; } catch { return false; }
        };
        const visibleElapsedMs = () => Date.now() - startedAt - hiddenMs - (hiddenAt ? Date.now() - hiddenAt : 0);
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            try { controller.signal.removeEventListener('abort', onAbort); } catch {}
            try { globalThis.document?.removeEventListener?.('visibilitychange', onVisibility); } catch {}
            handler(value);
        };
        const onAbort = () => {
            const reason = controller.signal.reason;
            finish(reject, reason instanceof Error ? reason : createGenerationAbortError());
        };
        const armTimer = () => {
            if (settled) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(onTimer, Math.max(1, duration - visibleElapsedMs()));
        };
        const onTimer = () => {
            timer = 0;
            // Never declare a timeout while the page is backgrounded/frozen, and
            // re-evaluate by the real clock after a resume instead of trusting the
            // parked callback. A request that was already overtime while visible
            // still times out as soon as the page is visible again.
            if (pageHidden() || visibleElapsedMs() < duration) { armTimer(); return; }
            const seconds = Math.round(duration / 1000);
            const label = core_text.normalizeText(statusText, 120);
            const error = new Error(`${label ? `${label}：` : ''}模型请求超过 ${seconds} 秒仍未完成，已停止等待并释放任务位。请稍后重试；若反复发生，请检查代理/模型速度或降低单次输出上限。`);
            error.code = 'RMT_REQUEST_TIMEOUT';
            error.retryable = false;
            finish(reject, error);
            try { controller.abort(error); } catch {}
        };
        const onVisibility = () => {
            if (settled) return;
            if (pageHidden()) {
                if (!hiddenAt) hiddenAt = Date.now();
                return;
            }
            if (hiddenAt) { hiddenMs += Date.now() - hiddenAt; hiddenAt = 0; }
            // One explicit re-evaluation on return to foreground for requests that
            // crossed a freeze: hidden time is excluded, then the timer is re-armed.
            armTimer();
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) {
            onAbort();
            return;
        }
        try { globalThis.document?.addEventListener?.('visibilitychange', onVisibility); } catch {}
        if (pageHidden()) hiddenAt = startedAt;
        armTimer();
        Promise.resolve()
            .then(factory)
            .then(value => finish(resolve, value), error => finish(reject, error));
    });
}

// Every segment gets at most one automatic retry, including rate limits.
// A composite may have multiple distinct segments; accepted segments are reused.
export const MAX_SEGMENT_ATTEMPTS = 2;

export const MAX_RATE_LIMIT_ATTEMPTS = MAX_SEGMENT_ATTEMPTS;

export function isRateLimitError(error) {
    return error?.code === 'RMT_CONNECTION_RATE_LIMIT';
}

export function segmentAttemptBudget(error) {
    return isRateLimitError(error) ? MAX_RATE_LIMIT_ATTEMPTS : MAX_SEGMENT_ATTEMPTS;
}

// Errors whose paid outcome is unknowable locally: the request may already have
// reached the provider (or been cut mid-transfer) without a definitive answer.
// They NEVER auto-retry, regardless of any auto-retry opt-in — an explicit
// user-clicked retry goes through a fresh task and is unaffected.
const UNKNOWN_OUTCOME_REQUEST_CODES = new Set(['RMT_CONNECTION_FAILED', 'RMT_CONNECTION_NETWORK', 'RMT_CONNECTION_SERVER']);

export function shouldRetrySegmentRequest(error, attempt = 0) {
    if (!error || error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') return false;
    if (['RMT_REQUEST_TIMEOUT', 'RMT_CONNECTION_AUTH', 'RMT_CONNECTION_QUOTA', 'RMT_CONNECTION_CONTEXT_LIMIT', 'RMT_CONNECTION_CONFIG', 'RMT_CONNECTION_INVALID_REQUEST'].includes(error?.code)) return false;
    if (UNKNOWN_OUTCOME_REQUEST_CODES.has(error?.code)) return false;
    if (attempt + 1 >= segmentAttemptBudget(error)) return false;
    // Give up only when the endpoint itself says the wait is longer than we should
    // hold a generation slot. (Unchanged 60s contract.)
    if (isRateLimitError(error)) return !(Number(error.retryAfterMs) > 60000);
    return error?.retryableJson === true || error?.retryable === true;
}

export function stopsCompositeGeneration(error) {
    return error?.name === 'AbortError' || /^(?:RMT_CONNECTION_|RMT_MANUAL_|RMT_PROFILE_|RMT_API_|RMT_RESPONSE_HTML|RMT_REQUEST_TIMEOUT)/.test(String(error?.code || ''));
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

export function segmentRetryDelayMs(error, attempt = 0) {
    if (isRateLimitError(error)) {
        const hinted = Number(error?.retryAfterMs);
        // Retry-After is authoritative when the endpoint sends one; otherwise back off
        // 5s / 15s / 40s, because 1.8s is shorter than every real provider window.
        if (Number.isFinite(hinted) && hinted > 0) return Math.min(120000, Math.max(1000, hinted));
        const ladder = Array.isArray(runtimeState.rateLimitRetryDelaysMs) && runtimeState.rateLimitRetryDelaysMs.length
            ? runtimeState.rateLimitRetryDelaysMs : [5000, 15000, 40000];
        return Number(ladder[Math.min(attempt, ladder.length - 1)]) || 0;
    }
    return error?.code === 'RMT_CONNECTION_SERVER' ? 1000 : 0;
}

export async function waitBeforeSegmentRetry(error, attempt = 0) {
    const delay = segmentRetryDelayMs(error, attempt);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    await core_context.yieldToUi();
}

let autoRetryHandler = null;

const pendingAutoRetries = [];

export function setAutoRetryHandler(handler) {
    autoRetryHandler = typeof handler === 'function' ? handler : null;
    if (!autoRetryHandler) return;
    const pending = pendingAutoRetries.splice(0);
    for (const item of pending) autoRetryHandler(item);
}

export function noteRetryableGeneration(item) {
    if (!item?.mode || !item?.draftId) return;
    if (typeof autoRetryHandler === 'function') autoRetryHandler(item);
    else if (pendingAutoRetries.length < 8) pendingAutoRetries.push({
        mode: item.mode, draftId: item.draftId, pageId: item.pageId || item.mode, label: item.label || item.mode,
    });
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
    try { refreshTaskCenter(); } catch {}
}
