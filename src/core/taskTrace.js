// Stage trace for the last few generation tasks.
//
// Exists because "模型返回完成" and "档案保存成功" are different things, and until now a
// failure between them surfaced as one generic sentence. This records which stage a task
// reached, never what it contained.
//
// Hard rule: only code-owned labels, booleans, counts, durations and RMT_* codes are
// stored. No prompt, no model response, no chat, no persona, no card, no URL, no header,
// no key, no exception text. The exporter therefore has nothing to redact.
import * as core_text from './text.js';

const MAX_TASKS = 8;
const MAX_STAGES = 24;
const STAGES = Object.freeze(['start', 'prompt', 'request', 'response', 'parse', 'validate',
    'merge', 'profile', 'save', 'render', 'done', 'failed']);
const trace = [];

function label(value, limit = 60) {
    // Code-owned labels only; anything unexpected collapses to a placeholder.
    const text = core_text.normalizeText(value, limit);
    return /^[\w:.\-\u4e00-\u9fff /]{1,60}$/.test(text) ? text : 'other';
}

export function startTaskTrace(taskKey, mode) {
    const entry = {
        id: label(taskKey, 80) || 'task',
        mode: label(mode, 30) || 'unknown',
        startedAt: Date.now(),
        endedAt: 0,
        outcome: 'running',
        code: '',
        field: '',
        chunks: { total: 0, ok: 0, failed: 0, pending: 0 },
        stages: [],
    };
    trace.push(entry);
    while (trace.length > MAX_TASKS) trace.shift();
    return entry;
}

export function markStage(entry, stage, ok = true) {
    if (!entry || !STAGES.includes(stage) || entry.stages.length >= MAX_STAGES) return entry;
    entry.stages.push({ stage, ok: ok === true, at: Date.now() - entry.startedAt });
    return entry;
}

export function markChunks(entry, { total = 0, ok = 0, failed = 0, pending = 0 } = {}) {
    if (!entry) return entry;
    const n = value => Math.max(0, Math.min(9999, Number(value) || 0));
    entry.chunks = { total: n(total), ok: n(ok), failed: n(failed), pending: n(pending) };
    return entry;
}

export function endTaskTrace(entry, outcome, error = null) {
    if (!entry) return entry;
    entry.endedAt = Date.now();
    entry.outcome = ['ok', 'failed', 'cancelled'].includes(outcome) ? outcome : 'failed';
    // The code is a fixed RMT_* token, never the message.
    const code = core_text.normalizeText(error?.code, 60);
    entry.code = /^RMT_[A-Z0-9_]{1,50}$/.test(code) ? code : (error ? 'RMT_UNCODED' : '');
    entry.field = label(error?.failedField, 40);
    markStage(entry, entry.outcome === 'ok' ? 'done' : 'failed', entry.outcome === 'ok');
    return entry;
}

export function taskTraceSnapshot() {
    return trace.map(entry => ({
        mode: entry.mode,
        outcome: entry.outcome,
        ms: (entry.endedAt || Date.now()) - entry.startedAt,
        code: entry.code,
        field: entry.field,
        chunks: { ...entry.chunks },
        stages: entry.stages.map(row => `${row.stage}${row.ok ? '' : '!'}@${row.at}ms`),
    }));
}

export function clearTaskTrace() { trace.length = 0; }
