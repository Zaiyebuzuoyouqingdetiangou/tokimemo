// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_context from './context.js';
import * as generation_diagnostics from './generationDiagnostics.js';

export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function normalizeText(value, max = 20000) {
    return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u0000/g, '')
        .trim()
        .slice(0, max);
}

export function isPlaceholderText(value) {
    const text = normalizeText(value, 120).replace(/\s+/g, '');
    if (!text) return true;
    return /^(?:暂无(?:数据|内容)?|待定|待补(?:全)?|未整理|整理中|内容整理中|略|省略|空白|无|none|null|n\/?a|[-—_]{2,}|[.。…?？]{2,})$/i.test(text);
}

export function expandSafeRoleMacros(value, context = core_context.getContext()) {
    const charName = normalizeText(context.name2 || '角色', 120);
    const userName = normalizeText(context.name1 || '用户', 120);
    return String(value ?? '')
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName)
        .replace(/\{\{([^{}\n]{1,200})\}\}/g, (_match, inner) => `｛｛${inner}｝｝`);
}

export function toastText(value, max = 800) {
    return normalizeText(value, max)
        .replace(/</g, '‹')
        .replace(/>/g, '›')
        .replace(/&/g, '＆');
}

const SAFE_ERROR_CODE_MESSAGES = Object.freeze({
    RMT_IMAGE_SCENE_INVALID: '当前画面描述或分镜不完整、超出长度限制，请在图片设置中检查；尚未调用柏宝绘。',
    RMT_IMAGE_PROMPT_INVALID: '文字模型返回的画面提示词结构不完整或含不允许的字段内容；尚未调用柏宝绘，旧图保留。',
    RMT_IMAGE_PROMPT_LANGUAGE: '文字模型没有返回可用的英文画面标签与英文描述；尚未调用柏宝绘，请重新整理提示词。',
    RMT_IMAGE_PROMPT_CHANGED: '画面、规则、角色绑定或出图后端已变化，请重新整理提示词；旧图保留。',

    RMT_QQJ_NOT_READY: "千千结当前摘要尚未加载或未启用。请先打开千千结面板，准备好后重新扫描；旧来源保留。",
    RMT_QQJ_IDENTITY: "千千结返回的聊天、角色或 Persona 身份发生变化；本次拒绝混入其他窗口。",
    RMT_QQJ_READ: "千千结公开快照不可读取或格式不兼容；旧来源保留，不调用私有接口。",
    RMT_CG_TARGET_CHANGED: "当前图片对应的角色、聊天或档案已经变化；旧图保留。",
    RMT_IMAGE_VIEW_URL: "原图地址不是可安全显示的本地图片；未跳转网页。",
    RMT_IMAGE_VIEW_LOAD: "原图读取失败。请检查图库中是否仍有该图片，酒馆页面未跳转。",
    RMT_IMAGE_EXPORT_LIMIT: "原图超过25MB安全导出上限，未继续载入；请从柏宝绘图库保存。",
    RMT_IMAGE_EXPORT: "当前环境无法导出图片；请长按原图或从柏宝绘图库保存。酒馆页面未跳转。",
    BBI_LIBRARY: "柏宝绘角色库公开接口不可用或内容格式不兼容，请先在柏宝绘准备角色外貌。",
    BBI_BINDING: "角色外貌选择已失效或两人绑定冲突，请重新打开图片设置。",
    BBI_CHARACTERS_UNSUPPORTED: "当前柏宝绘后端不支持多角色提示；本次没有出图，请使用支持角色提示的后端或手动整理单张提示词。",
    BBI_CHARACTERS_NOT_APPLIED: "图片已生成，但柏宝绘返回角色提示未生效。旧图保留，请先到柏宝绘图库检查，避免重复付费。",
    BBI_PROMPT_PIPELINE_UNAVAILABLE: "当前柏宝绘公开 API 未提供提示词生成入口。此处只使用已有画面描述与公开角色库，不会另调文本 API 或调用私有流程。",
    BBI_NOT_READY: "未检测到柏宝绘公开 API v1。若已安装柏宝绘，请更新到支持公开接口的版本，启用后刷新页面；刚完成加载可点击“重新检测”。",
    BBI_VERSION: "柏宝绘接口版本或能力不兼容，需要公开 API v1 和图库保存能力。",
    BBI_NOT_CONFIGURED: "柏宝绘出图渠道尚未配置完成，请在柏宝绘中检查 NAI / ComfyUI 设置。",
    BBI_INVALID_ARGS: "柏宝绘未接受这次画面提示，请检查画面描述后重试。",
    BBI_RATE_LIMITED: "柏宝绘生图限流，内置等待已结束；本次不会再自动重试或切换渠道。",
    BBI_BACKEND_ERROR: "柏宝绘出图失败，请检查其渠道配置与请求历史。旧图已保留。",
    BBI_SAVE_FAILED: "图片已生成，但没有取得可保存的本地路径。旧图已保留；请检查柏宝绘的图库保存状态，避免重复出图。",
    BBI_TIMEOUT: "等待柏宝绘超过 5 分钟，已请求取消。旧图已保留；请先检查柏宝绘任务状态。",
    BBI_ABORTED: "已取消接收本次图片，旧图已保留。",
    BBI_BUSY: "已有两张图片提交给柏宝绘，请等其中一张结束后再绘制。",
    BBI_TARGET_BUSY: "这张图片的绘制请求还未结束，请先等待，避免重复出图。",
    RMT_PROFILE_CAPABILITY: '1.1.18 一键配置要求新版连接能力；当前页面未提供安全的配置读取能力，本次没有发送请求。',
    RMT_MANUAL_API_URL: '手动 API 地址无效；请检查地址，并把 Key、Token 或密码放在独立凭据输入框中。',
    RMT_MANUAL_API_TRANSPORT: '远程手动 API 必须使用 HTTPS；只有本机地址可以使用 HTTP。',
    RMT_MANUAL_RESPONSE_TOO_LARGE: '模型服务返回内容过大，已停止读取。',
    RMT_RESPONSE_HTML: '上游返回了非 API 的 HTML 页面；响应正文已隐藏。',
    RMT_MANUAL_INVALID_JSON: '模型服务没有返回可解析的 JSON；响应正文已隐藏。',
    RMT_MANUAL_HTTP: '手动 API 请求失败；请检查手动配置与服务状态。',
    RMT_MANUAL_PROVIDER_ERROR: '手动 API 返回了错误状态；响应详情已隐藏，请检查服务配置后重试。',
    RMT_MANUAL_FETCH_UNAVAILABLE: '当前环境没有可用的网络请求能力。',
    RMT_MANUAL_MODELS_EMPTY: '接口没有返回可用模型；仍可直接填写模型 ID。',
    RMT_MANUAL_MODEL_TIMEOUT: '拉取模型超时；仍可直接填写模型 ID。',
    RMT_MANUAL_MODEL: '请先填写手动 API 的模型 ID。',
    RMT_MANUAL_MESSAGES: '手动 API 请求缺少必要消息，本次没有发送。',
    RMT_MANUAL_EMPTY: '手动 API 没有返回可见正文。',
    RMT_API_CONFIG_CHANGED: 'API 配置在生成期间发生变化，本次旧连接结果已丢弃。',
    RMT_API_CONFIGURATION_SUPERSEDED: 'API 设置已经变化，本次旧配置操作已取消。',
    RMT_API_MODEL_REQUEST_SUPERSEDED: '模型列表请求已被更新的请求取代。',
    RMT_PROFILE_PROXY_UNAVAILABLE: '这一键连接指定的代理无法从该 Profile 自身安全解析；已停止远端拉取。',
    RMT_PROFILE_MODEL_STATUS: '这一键连接的模型列表返回了错误状态；响应详情已隐藏。',
    RMT_PROFILE_MODEL_TIMEOUT: '一键连接的模型列表请求超时；仍可使用该连接自己保存的模型。',
    RMT_CONNECTION_FAILED: '专用连接请求失败；响应详情已隐藏，请检查当前独立 API 设置。',
    RMT_CONNECTION_AUTH: '专用连接认证失败；请检查当前配置、API Key 与账号权限。',
    RMT_CONNECTION_RATE_LIMIT: '模型服务正在限流或额度不足；请稍后重试。',
    RMT_CONNECTION_QUOTA: '模型服务报告额度不足；请检查当前独立 API 账号余额或配额。不会自动重试。',
    RMT_ARCHIVE_VERDICT: '档案简介尚未通过校验；原有回忆与封面保留，可只重写简介，无需重建档案。',
    RMT_CONNECTION_CONTEXT_LIMIT: '本段输入超过模型或代理的上下文上限；请减少导入资料或更换模型。',
    RMT_CONNECTION_CONFIG: '专用连接、模型或上游端点不可用；请重新检查配置。',
    RMT_CONNECTION_INVALID_REQUEST: '上游拒绝了本段请求；请检查模型兼容性与输出设置。',
    RMT_CONNECTION_SERVER: '模型服务或代理暂时不可用；请稍后重试。',
    RMT_CONNECTION_NETWORK: '无法连接模型服务；请检查地址、网络、代理与服务状态后重试。',
    RMT_REQUEST_TIMEOUT: '模型请求超时，已停止等待并释放任务位；请稍后重试。',
    RMT_SEGMENT_VALIDATION: '模型结果没有通过本地完整性校验；旧内容未被覆盖。',
    RMT_PAST_LIVES_STRUCTURE: '前世今生这一段的结构不完整；已保留成功部分，只需重试未完成段。',
    RMT_PAST_LIVES_RELATIONSHIP: '前世今生这一段出现与两人设定冲突的关系表述；已保留成功部分，可重试这一段。',
    RMT_PAST_LIVES_HISTORY: '今生回响把尚未发生的内容写成了既往记忆；已保留成功部分，可重试这一段。',
    RMT_PAST_LIVES_SOURCE: '关联记忆与当前档案不一致；旧内容保留，请回到对应档案重试。',
    RMT_PAST_LIVES_VERSION: '这份前世今生暂时无法按当前格式读取；旧记录保留，请勿删除档案。',
    RMT_PAST_LIVES_LIMIT: '前世今生已达到本地保存容量；旧内容与成功部分保留。',
    RMT_PAIR_RELATIONSHIP: '这一段出现与两人设定冲突的关系表述；原有内容保留。',
    RMT_RECOVERY_VALIDATION_CHANGED: '已保存片段暂未通过当前校验；草稿仍保留，没有重新收费生成。',
    RMT_RECOVERY_STORAGE: '这一段已返回，但浏览器没有保存成功；已停止后续生成，请检查存储后重试。',
    RMT_RECOVERY_LIMIT: '这一段超出草稿保存容量；此前成功部分与旧内容保留。',
    RMT_RECOVERY_UNAVAILABLE: '当前环境无法建立可靠的续写记录；请保留页面与已有内容。',
    RMT_RECOVERY_DATA: '这一段的返回结构无法保存；此前成功部分与旧内容保留。',
    RMT_BUTTERFLY_systemNote: '该节点缺少完整的系统结局判定；旧内容保留，可单独重试。',
    RMT_BUTTERFLY_monologue: '该节点的角色独白不完整；旧内容保留，可单独重试。',
    RMT_BUTTERFLY_intervention: '该节点缺少完整的现世回应；旧内容保留，可单独重试。',
    RMT_BUTTERFLY_omega: '最终观测点的告白或结局判定不完整；旧内容保留，可单独重试。',
    RMT_BUTTERFLY_worldSpec: '该节点的世界条件不完整；旧内容保留，可单独重试。',
    RMT_ROOM_STRUCTURE: '房间的空间差异、四时段生活或互动台词不完整；已保留旧内容，可单独重试房间。',
    RMT_ROOM_FIELDS: '房间的待补文字或增量物件尚未通过校验；已保留旧内容。此错误不等于已确认输出截断，请查看生成诊断。',
    RMT_BUTTERFLY_relationship: '该节点的人物关系归属不明确；旧内容保留，请重试此节点。',
    RMT_BUTTERFLY_unique: '该节点重复或分歧维度不符；旧内容保留，请重试此节点。',
    RMT_ROOM_PETS: '人设有宠物，但模型漏写了有效宠物节点；请单独重试房间。',
    RMT_TRAVEL_LOCATIONS: '尚无通过证据与对白校验的地点；请确认档案或已选设定世界书包含地点。不会补造远方，旧地图保留。',
    RMT_SETTING_SOURCE_PARTIAL: '所选设定世界书读取不完整或超出本次容量；请检查所选书和条目后重试，旧内容保留。',
    RMT_ARCHIVE_PREFIX_CHANGED: '旧档案与当前历史基线不一致，可能是旧消息被修改或旧版漏收了隐藏楼层。本次未覆盖；请先检查来源，不必删除档案。',
    RMT_ROOM_HISTORY: '房间台词把没有证据的共同经历当成了过去；本次未保存，可重试。',
    RMT_LEDGER_UNAVAILABLE: '浏览器来源存储暂时不可用。请退出隐私模式或关闭旧页后重试；不要清除站点数据。',
    RMT_BANNED_GENERATED_PHRASE: '模型新生成内容命中了本地禁用词；本次结果没有保存。',
    RMT_JSON_EMPTY_FINAL: '模型没有返回最终正文 JSON；旧内容未被覆盖。',
    RMT_JSON_EMPTY_FINAL_WITH_REASONING: '模型产生了推理内容，但没有返回最终正文 JSON；旧内容未被覆盖。',
    RMT_JSON_NOT_FOUND: '模型最终正文中没有完整 JSON；旧内容未被覆盖。',
    RMT_JSON_TRUNCATED: '模型返回的 JSON 疑似被截断；旧内容未被覆盖。',
    RMT_PHONE_DRAFT_AVAILABLE: '私人终端只完成了部分内容；已保留可继续生成的草稿。',
    RMT_PHONE_DRAFT_UNAVAILABLE: '私人终端未完成，且本次草稿未能保存；旧终端保留。请检查存储状态后重试。',
    RMT_PHONE_SPEAKERS: '聊天缺少有原文依据的双方发言；不会补造对话来凑数量。',
    RMT_PHONE_EVIDENCE: '这项终端内容缺少完整的条目或来源证据；旧内容保留，可继续补齐。',
    RMT_PHONE_SOURCE_EMPTY: '当前来源不足以收录终端内容；请补充来源并更新档案后再生成，不会编造记录。',
    RMT_PHONE_SOURCE_CHANGED: '终端草稿的来源已变化，已完成内容未删除。请恢复原来的设定来源后继续，或明确重新生成终端。',
    RMT_INPUT_BUDGET: '本次输入超过安全预算，已在发送前拦截。',
    RMT_JSON_INVALID: '模型没有返回完整、可解析的 JSON；响应正文已隐藏。',
    RMT_ARCHIVE_DELETED_FENCE: '目标档案已被明确删除；较早启动的任务不会重新创建它。',
    RMT_METADATA_DURABILITY_UNAVAILABLE: '当前页面无法确认档案已经持久保存；结果保留待重试，不会假装成功。',
});

generation_diagnostics.configureDiagnosticReasons(SAFE_ERROR_CODE_MESSAGES);

const SAFE_DIAGNOSTIC_CODES = new Set([
    ...Object.keys(SAFE_ERROR_CODE_MESSAGES),
    'ABORT_ERR', 'RMT_LOCAL_OPERATION',
]);

function safeErrorStatus(error) {
    const value = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    return Number.isFinite(value) && value >= 100 && value <= 599 ? Math.floor(value) : 0;
}

function safeErrorCode(error) {
    const value = normalizeText(error?.code, 80);
    return SAFE_DIAGNOSTIC_CODES.has(value) ? value : '';
}

function sanitizedTrustedErrorMessage(value, max) {
    const raw = normalizeText(value, Math.max(1200, max * 2));
    if (!raw) return '';
    const sensitive = /authorization\s*[:=]|bearer\s+[a-z0-9._~+\/-]{8,}|\bsk-[a-z0-9_-]{8,}\b|[?&](?:api[_-]?key|key|token|secret|password)=|<!doctype\s+html|<html(?:\s|>)|<body(?:\s|>)|failed to generate chat completion\s*:/i;
    if (sensitive.test(raw)) return '';
    return normalizeText(raw.replace(/[\r\n]+/g, ' '), max);
}

export function safeUserError(message, code = 'RMT_LOCAL_OPERATION', options = {}) {
    const error = new Error(normalizeText(message, 1200) || '操作失败。');
    error.code = /^[A-Z][A-Z0-9_]{1,79}$/.test(String(code || '')) ? String(code) : 'RMT_LOCAL_OPERATION';
    error.safeToDisplay = true;
    error.safeUserMessage = error.message;
    if (Number.isFinite(Number(options.status))) error.status = Math.floor(Number(options.status));
    if (typeof options.retryable === 'boolean') error.retryable = options.retryable;
    return error;
}

/**
 * Return only low-cardinality, allowlisted diagnostic fields. This object is safe
 * for console logging and must never contain provider bodies, prompts, history,
 * world-book text, archive text, URLs, keys, tokens, or raw exception messages.
 */
export function safeErrorDiagnostic(error) {
    const diagnostic = {};
    const name = normalizeText(error?.name, 40);
    const code = safeErrorCode(error);
    const status = safeErrorStatus(error);
    const kind = normalizeText(error?.kind, 40);
    if (/^(?:Error|TypeError|RangeError|SyntaxError|AbortError|TimeoutError|DOMException)$/.test(name)) diagnostic.name = name;
    if (code) diagnostic.code = code;
    if (status) diagnostic.status = status;
    if (/^(?:network|timeout|transport|provider|validation|storage|lifecycle)$/.test(kind)) diagnostic.kind = kind;
    if (typeof error?.retryable === 'boolean') diagnostic.retryable = error.retryable;
    if (typeof error?.retryableJson === 'boolean') diagnostic.retryableJson = error.retryableJson;
    generation_diagnostics.recordGenerationDiagnostic(diagnostic);
    return diagnostic;
}

export function safeErrorSummary(error, max = 520) {
    safeErrorDiagnostic(error);
    const raw = normalizeText(error?.message, 12000);
    const status = safeErrorStatus(error);
    const code = safeErrorCode(error);
    if (code === 'RMT_PHONE_DRAFT_AVAILABLE' || code === 'RMT_PHONE_DRAFT_UNAVAILABLE') {
        const completed = Number(error?.partialProgress?.completed);
        const total = Number(error?.partialProgress?.total);
        const progress = Number.isInteger(completed) && Number.isInteger(total) && total >= 1 && total <= 10 && completed >= 0 && completed <= total
            ? `${completed}/${total} 个应用` : '部分内容';
        const failure = safeErrorDiagnostic(error?.failure);
        const cause = failure.code && !/^RMT_PHONE_DRAFT_/.test(failure.code)
            ? SAFE_ERROR_CODE_MESSAGES[failure.code] || ''
            : failure.status === 401 || failure.status === 403 ? '上游认证或权限校验失败。'
                : failure.status === 429 ? '上游正在限流，请稍后再试。' : '本次未完成；旧版草稿可能没有具体原因记录。';
        const statusLabel = failure.status >= 400 ? `（状态 ${failure.status}）` : '';
        return normalizeText(code === 'RMT_PHONE_DRAFT_AVAILABLE'
            ? `已保留 ${progress}。${cause}${statusLabel}处理后点击“继续生成”，已完成的应用不会重做。`
            : `${SAFE_ERROR_CODE_MESSAGES[code]}${cause}${statusLabel}`, max);
    }
    const looksHtml = /<!doctype\s+html|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<title>[^<]*cloudflare|cf-error|cdn-cgi\//i.test(raw);
    const blocked = /cloudflare|sorry,? you have been blocked|attention required|unable to access/i.test(raw);
    const unauthorized = /unauthorized|authentication|invalid api key|\b401\b/i.test(raw) || status === 401;
    const forbidden = /forbidden|\b403\b/i.test(raw) || status === 403;
    if (code && SAFE_ERROR_CODE_MESSAGES[code]) return normalizeText(SAFE_ERROR_CODE_MESSAGES[code], max);
    if (looksHtml) {
        const details = [];
        if (status) details.push(`HTTP ${status}`);
        if (blocked) details.push('Cloudflare 拦截');
        const suffix = details.length ? `（${details.join(' / ')}；响应正文已隐藏）` : '（响应正文已隐藏）';
        if (blocked || forbidden) return `上游服务拒绝了请求${suffix}。`;
        if (unauthorized) return `上游服务认证失败${suffix}。`;
        return `上游返回了非 API 的 HTML 页面${suffix}。`;
    }
    if (/failed to generate chat completion\s*:/i.test(raw)) {
        if (unauthorized) return `上游服务认证失败${status ? `（HTTP ${status}）` : ''}。`;
        if (forbidden) return `上游服务拒绝了请求${status ? `（HTTP ${status}）` : ''}。`;
        return `上游生成请求失败${status ? `（HTTP ${status}）` : ''}；响应正文已隐藏。`;
    }
    if (unauthorized) return `上游服务认证失败${status ? `（HTTP ${status}）` : ''}；响应详情已隐藏。`;
    if (forbidden) return `上游服务拒绝了请求${status ? `（HTTP ${status}）` : ''}；响应详情已隐藏。`;
    if (status === 408 || status === 504 || error?.name === 'TimeoutError') return `请求超时${status ? `（HTTP ${status}）` : ''}，请稍后重试。`;
    if (status === 429) return '请求过于频繁（HTTP 429），请稍后重试。';
    if (status >= 500) return `上游服务暂时不可用（HTTP ${status}）；响应详情已隐藏。`;
    if (status >= 400) return `请求失败（HTTP ${status}）；响应详情已隐藏。`;
    if (error?.name === 'AbortError') return '操作已取消。';
    if (error?.safeToDisplay === true) {
        const trusted = sanitizedTrustedErrorMessage(error?.safeUserMessage || raw, max);
        if (trusted) return trusted;
    }
    if (/failed to fetch|networkerror|network request failed|load failed|econn(?:reset|refused)|enotfound|fetch failed/i.test(raw)) {
        return '网络连接失败；请检查地址、网络与服务状态后重试。';
    }
    return '本次操作未完成，旧内容保留。没有可识别的错误原因，请检查连接与存储后重试。';
}

export function cleanArray(value, maxItems = 64, maxChars = 12000) {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, maxItems)
        .map(item => normalizeText(item, maxChars))
        .filter(Boolean);
}

export function hashString(value) {
    let h = 2166136261;
    for (const ch of String(value ?? '')) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function safeId(value, fallback) {
    const raw = String(value ?? '').trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return cleaned || fallback;
}
