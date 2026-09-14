// Stage trace for the last few generation tasks.
//
// Exists because "模型返回完成" and "档案保存成功" are different things, and until now a
// failure between them surfaced as one generic sentence. This records which stage a task
// reached, never what it contained.
//
// Hard rule: only code-owned labels, booleans, counts, durations and RMT_* codes are
// stored. No prompt, no model response, no chat, no persona, no card, no URL, no header,
// no key, no exception text. The exporter therefore has nothing to redact.
const MAX_TASKS = 8;
const MAX_STAGES = 24;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const STAGES = Object.freeze(['start', 'prompt', 'request', 'response', 'parse', 'validate',
    'token-count', 'merge', 'profile', 'save', 'deferred', 'render', 'done', 'failed']);
const trace = [];
const MODES = new Set(['archive', 'archive-profile', 'room', 'album', 'image', 'advEvent', 'heart', 'phone']);
const OUTCOMES = new Set(['running', 'ok', 'failed', 'cancelled', 'deferred', 'blocked', 'noop']);
const CODES = new Set([
    'RMT_API_CONFIG_CHANGED', 'RMT_ARCHIVE_CHUNK', 'RMT_ARCHIVE_DELETED_FENCE', 'RMT_ARCHIVE_PREFIX_CHANGED',
    'RMT_ARCHIVE_VERDICT', 'RMT_BANNED_GENERATED_PHRASE', 'RMT_CACHE_CAS_CONFLICT', 'RMT_CONNECTION_AUTH',
    'RMT_CONNECTION_CONFIG', 'RMT_CONNECTION_CONTEXT_LIMIT', 'RMT_CONNECTION_FAILED', 'RMT_CONNECTION_INVALID_REQUEST',
    'RMT_CONNECTION_NETWORK', 'RMT_CONNECTION_QUOTA', 'RMT_CONNECTION_RATE_LIMIT', 'RMT_CONNECTION_SERVER',
    'RMT_INPUT_BUDGET', 'RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING', 'RMT_JSON_INVALID',
    'RMT_JSON_NOT_FOUND', 'RMT_JSON_TRUNCATED', 'RMT_LEDGER_UNAVAILABLE', 'RMT_LOCAL_OPERATION',
    'RMT_MANUAL_API_TRANSPORT', 'RMT_MANUAL_API_URL', 'RMT_MANUAL_EMPTY', 'RMT_MANUAL_FETCH_UNAVAILABLE',
    'RMT_MANUAL_HTTP', 'RMT_MANUAL_INVALID_JSON', 'RMT_MANUAL_MESSAGES', 'RMT_MANUAL_MODEL',
    'RMT_MANUAL_PROVIDER_ERROR', 'RMT_MANUAL_RESPONSE_TOO_LARGE', 'RMT_METADATA_DURABILITY_UNAVAILABLE',
    'RMT_MODE_WRITE_FENCE', 'RMT_PROFILE_CAPABILITY', 'RMT_PROFILE_PROXY_UNAVAILABLE',
    'RMT_RECOVERY_BUSY', 'RMT_RECOVERY_CLEARED', 'RMT_RECOVERY_DATA', 'RMT_RECOVERY_IDENTITY',
    'RMT_RECOVERY_INPUT_CHANGED', 'RMT_RECOVERY_LIMIT', 'RMT_RECOVERY_OPERATION_CHANGED', 'RMT_RECOVERY_ORIGIN_CHANGED',
    'RMT_RECOVERY_STORAGE', 'RMT_RECOVERY_UNAVAILABLE', 'RMT_RECOVERY_VALIDATION_CHANGED',
    'RMT_REQUEST_TIMEOUT', 'RMT_RESPONSE_HTML', 'RMT_SEGMENT_VALIDATION', 'RMT_TOKEN_COUNT_TIMEOUT',
]);

export function startTaskTrace(taskKey, mode) {
    const entry = {
        // The caller's task key can contain a chat name: do not retain it at all.
        mode: MODES.has(mode) ? mode : 'unknown',
        startedAt: Date.now(),
        endedAt: 0,
        outcome: 'running',
        code: '',
        field: '',
        activeStage: '',
        chunks: { total: 0, ok: 0, failed: 0, pending: 0 },
        stages: [],
    };
    trace.push(entry);
    while (trace.length > MAX_TASKS) trace.shift();
    return entry;
}

export function markStage(entry, stage, ok = true) {
    if (!entry || !STAGES.includes(stage)) return entry;
    entry.stages.push({ stage, ok: ok === true, at: Date.now() - entry.startedAt });
    while (entry.stages.length > MAX_STAGES) entry.stages.shift();
    if (entry.activeStage === stage) entry.activeStage = '';
    return entry;
}

export function beginStage(entry, stage) {
    if (entry && entry.outcome === 'running' && STAGES.includes(stage)) entry.activeStage = stage;
    return entry;
}

export function markChunks(entry, { total = 0, ok = 0, failed = 0, pending = 0 } = {}) {
    if (!entry) return entry;
    const n = value => Math.floor(Math.max(0, Math.min(9999, Number(value) || 0)));
    entry.chunks = { total: n(total), ok: n(ok), failed: n(failed), pending: n(pending) };
    return entry;
}

export function recordTaskFailure(entry, error) {
    if (!entry || !error) return entry;
    entry.code = CODES.has(error.code) ? error.code : 'RMT_UNCODED';
    entry.field = STAGES.includes(error.failedField) ? error.failedField : '';
    return entry;
}

export function endTaskTrace(entry, outcome, error = null) {
    if (!entry || entry.outcome !== 'running') return entry;
    entry.endedAt = Date.now();
    entry.outcome = ['ok', 'failed', 'cancelled', 'deferred', 'blocked', 'noop'].includes(outcome) ? outcome : 'failed';
    recordTaskFailure(entry, error);
    if (entry.activeStage && ['failed', 'cancelled'].includes(entry.outcome)) markStage(entry, entry.activeStage, false);
    entry.activeStage = '';
    if (entry.outcome === 'ok') markStage(entry, 'done');
    else if (entry.outcome === 'failed') markStage(entry, 'failed', false);
    return entry;
}

export function taskTraceSnapshot() {
    const bounded = (value, max) => Math.floor(Math.max(0, Math.min(max, Number(value) || 0)));
    return trace.slice(-MAX_TASKS).map(entry => ({
        mode: MODES.has(entry.mode) ? entry.mode : 'unknown',
        outcome: OUTCOMES.has(entry.outcome) ? entry.outcome : 'failed',
        ms: bounded((entry.endedAt || Date.now()) - entry.startedAt, MAX_DURATION_MS),
        code: CODES.has(entry.code) || entry.code === 'RMT_UNCODED' ? entry.code : '',
        field: STAGES.includes(entry.field) ? entry.field : '',
        activeStage: STAGES.includes(entry.activeStage) ? entry.activeStage : '',
        chunks: Object.fromEntries(['total', 'ok', 'failed', 'pending'].map(key => [key, bounded(entry.chunks[key], 9999)])),
        stages: entry.stages.filter(row => STAGES.includes(row.stage)).slice(-MAX_STAGES)
            .map(row => `${row.stage}${row.ok === true ? '' : '!'}@${bounded(row.at, MAX_DURATION_MS)}ms`),
    }));
}

export function clearTaskTrace() { trace.length = 0; }
