// Optional request parameters only. Never a prompt, credential, URL or tool carrier.
import * as text from './text.js';
export const EXCLUDABLE_PARAMETERS = Object.freeze(['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'top_k', 'seed', 'min_p', 'top_a', 'typical_p', 'repetition_penalty']);
export const REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
export const ADVANCED_MAX_BYTES = 8192;
const branded = new WeakSet();
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positiveInt = value => Number.isSafeInteger(value) && value >= 0;
const ownObject = value => !!value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function fields(value, validators) { return ownObject(value) && Object.keys(value).every(key => Object.hasOwn(validators, key) && validators[key](value[key])); }
const validators = Object.freeze({
    ...Object.fromEntries(EXCLUDABLE_PARAMETERS.map(key => [key, ['top_k','seed'].includes(key) ? Number.isSafeInteger : finite])),
    reasoning_effort: value => REASONING_EFFORTS.includes(value),
    verbosity: value => ['low', 'medium', 'high'].includes(value),
    enable_thinking: value => typeof value === 'boolean',
    thinking_budget: positiveInt,
    thinking: value => fields(value, { type: v => ['enabled','disabled','adaptive'].includes(v), budget_tokens: positiveInt }),
    reasoning: value => fields(value, { effort: v => REASONING_EFFORTS.includes(v), max_tokens: positiveInt, enabled: v => typeof v === 'boolean', exclude: v => typeof v === 'boolean' }),
    // Verified Google REST shape (not the Python SDK's additional outer wrapper).
    extra_body: value => fields(value, { google: v => fields(v, { thinking_config: c => fields(c, {
        thinking_budget: n => Number.isSafeInteger(n) && n >= -1,
        thinking_level: n => ['minimal','low','medium','high'].includes(n), include_thoughts: n => typeof n === 'boolean',
    }) }) }),
});
function bad() { return text.safeUserError('高级参数无效或包含受保护字段；只允许采样与推理配置，不能覆盖模型、消息、最大输出、连接、Key 或工具。未发送请求。', 'RMT_ADVANCED_PARAMETERS'); }
export function advancedSettings(raw = {}) {
    return { advancedGenerationEnabled: raw.advancedGenerationEnabled === true,
        advancedStreamMode: ['on','off'].includes(raw.advancedStreamMode) ? raw.advancedStreamMode : 'original',
        advancedReasoningEffort: typeof raw.advancedReasoningEffort === 'string' ? raw.advancedReasoningEffort : '',
        advancedExcludedParams: Array.isArray(raw.advancedExcludedParams) ? [...raw.advancedExcludedParams] : [],
        advancedExtraParams: typeof raw.advancedExtraParams === 'string' ? raw.advancedExtraParams : '' };
}
export function parseAdvancedGeneration(settings = {}) {
    const finish = (enabled, body, excluded) => {
        const result = Object.freeze({ enabled, streamMode: enabled ? advancedSettings(settings).advancedStreamMode : 'original', body: Object.freeze(body), excluded: Object.freeze(excluded),
            includeJson: Object.keys(body).length ? JSON.stringify(body) : '', excludeJson: excluded.length ? JSON.stringify(excluded) : '' });
        branded.add(result); return result;
    };
    if (settings.advancedGenerationEnabled !== true) return finish(false, {}, []);
    const raw = settings.advancedExtraParams ?? '', effort = settings.advancedReasoningEffort ?? '', excluded = settings.advancedExcludedParams ?? [];
    if (typeof raw !== 'string' || raw.length > ADVANCED_MAX_BYTES || new TextEncoder().encode(raw).byteLength > ADVANCED_MAX_BYTES
        || (effort && !REASONING_EFFORTS.includes(effort)) || !Array.isArray(excluded)
        || excluded.some(key => !EXCLUDABLE_PARAMETERS.includes(key))) throw bad();
    let body = {};
    try { if (raw.trim()) body = JSON.parse(raw); } catch { throw bad(); }
    if (!fields(body, validators)) throw bad();
    if (effort && body.reasoning_effort && body.reasoning_effort !== effort) throw bad();
    if (effort) body.reasoning_effort = effort;
    const google = body.extra_body?.google?.thinking_config;
    if (body.reasoning_effort && google && (Object.hasOwn(google, 'thinking_level') || Object.hasOwn(google, 'thinking_budget'))) throw bad();
    for (const key of excluded) delete body[key];
    return finish(true, body, [...new Set(excluded)]);
}
export function advancedCarrier(parsed, source = 'custom') {
    if (!branded.has(parsed)) throw bad();
    if (!parsed.includeJson && !parsed.excludeJson) return {};
    if (source !== 'custom') throw text.safeUserError('这组非空高级参数需要自定义 Chat Completions Profile 或手动 OpenAI 兼容连接；当前没有改动连接，也不会静默忽略参数。', 'RMT_ADVANCED_BACKEND');
    return { ...(parsed.includeJson ? { custom_include_body: parsed.includeJson } : {}), ...(parsed.excludeJson ? { custom_exclude_body: parsed.excludeJson } : {}) };
}
export function applyAdvancedExclusions(body, parsed) {
    if (!branded.has(parsed)) throw bad();
    const result = { ...body }; for (const key of parsed.excluded) delete result[key]; return result;
}
export function advancedFingerprint(settings) {
    if (settings?.advancedGenerationEnabled !== true) return '';
    const raw = advancedSettings(settings);
    return text.hashString(JSON.stringify(raw));
}
