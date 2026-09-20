// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_context from './context.js';
import * as core_backupDiagnostics from './backupDiagnostics.js';

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
    RMT_LOCAL_STORAGE: '本机记录未能保存；旧记录与当前页面内容保留，请勿刷新未保存的页面。',
    RMT_LOCAL_CAS: '本机记录已被另一操作更新；没有覆盖旧记录，请重新打开后继续。',
    RMT_MANUAL_KEY_STORAGE: 'Key 未能保存或取回；没有明文落盘或借用其他连接。请保留页面并检查本机存储。',
    RMT_ADVANCED_PARAMETERS: '高级参数无效或包含受保护字段；只允许采样与推理配置，不能覆盖模型、消息、最大输出、连接、Key 或工具。',
    RMT_ADVANCED_BACKEND: '非空排参／附加 JSON 需要手动 API 或自定义 Chat Completions Profile；本次没有改连接或静默忽略参数。',
    RMT_RECOVERY_SOURCE_CHANGED: '角色卡、Persona 或来源选择与原任务不同；原成果与草稿保留，未发起请求。',
    RMT_ARCHIVE_DRAFT_READ: '本机草稿读取未完成，不能认定没有记录；原记录未修改，本次没有请求模型。请重新读取，不要清数据或重做。',
    RMT_ARCHIVE_DRAFT_CONFLICT: '本机草稿版本已变化；页面成果与本机记录均保留，没有覆盖或重新生成。请先导出本页成果，再重新打开原聊天读取。',
    RMT_ARCHIVE_DRAFT_STORAGE: '整理草稿尚未确认保存到本机；成功分段仍保留在当前页面，请先导出，勿刷新。',
    RMT_ARCHIVE_DRAFT_CAPACITY: '本次来源超过本机草稿保存上限（12MB），未请求模型；可缩小读取范围或分批建档，已保留原记录。',

    ...core_backupDiagnostics.BACKUP_FAILURE_MESSAGES,
    RMT_DEFERRED_QUOTA: '浏览器可用存储空间不足，待写回结果仅保留在当前页面。',
    RMT_DEFERRED_SECURITY: '浏览器权限或隐私设置阻止保存待写回结果；结果仅保留在当前页面。',
    RMT_DEFERRED_UNAVAILABLE: '当前环境无法使用待写回存储；结果仅保留在当前页面。',
    RMT_DEFERRED_LIMIT: '待写回结果超过本地安全容量；结果仅保留在当前页面。',
    RMT_DEFERRED_SERIALIZE: '待写回结果无法序列化；结果仅保留在当前页面。',
    RMT_DEFERRED_UNKNOWN: '待写回结果未能保存到浏览器；结果仅保留在当前页面。',
    RMT_PROFILE_CAPABILITY: '1.1.18 一键配置要求新版连接能力；当前页面未提供安全的配置读取能力，本次没有发送请求。',
    RMT_MANUAL_API_URL: '手动 API 地址无效；请检查地址，并把 Key、Token 或密码放在独立凭据输入框中。',
    RMT_MANUAL_API_TRANSPORT: '远程手动 API 必须使用 HTTPS；只有本机地址可以使用 HTTP。',
    RMT_MANUAL_RESPONSE_TOO_LARGE: '模型服务返回内容过大，已停止读取。',
    RMT_RESPONSE_HTML: '上游返回了非 API 的 HTML 页面；响应正文已隐藏。',
    RMT_MANUAL_INVALID_JSON: '接口响应封装无法解析；尚不能判断是模型正文格式、代理错误页或传输损坏，响应正文已隐藏。',
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
    RMT_CONNECTION_FAILED: '生成连接请求失败，尚不能确定原因；请查看连接与服务端状态后再试，旧内容保留。',
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
    RMT_TIME_STORY_STRUCTURE: '这一篇的时间、人物或正文不完整；旧篇章保留，可重试当前故事。',
    RMT_TIME_STORY_WORLD: '这一篇的联络媒介与世界设定不符；旧篇章保留，可重试当前故事。',
    RMT_TIME_STORY_RELATIONSHIP: '这一篇出现与两人设定冲突的关系表述；旧篇章保留。',
    RMT_TIME_STORY_SOURCE: '番外所属聊天、人物或档案版本不一致；请重新打开对应档案。',
    RMT_TIME_STORY_VERSION: '这份番外暂不可安全读取；原记录保持不变，请勿删除档案。',
    RMT_TIME_STORY_LIMIT: '番外已达到本地保存容量；旧篇章保留，请先备份整理。',
    RMT_PAIR_RELATIONSHIP: '这一段出现与两人设定冲突的关系表述；原有内容保留。',
    RMT_RECOVERY_INPUT_CHANGED: '原任务的聊天身份、档案版本、来源或生成条件与当前输入不一致；成功内容和草稿保留，没有自动重做。请核对原任务来源后再继续。',
    RMT_RECOVERY_ORIGIN_CHANGED: '目标聊天或角色已变化；本次没有覆盖档案，请回到原聊天继续。',
    RMT_CACHE_CAS_CONFLICT: '档案已被其他操作更新；本次旧结果没有覆盖新内容，请检查当前档案后再保存。',
    RMT_RECOVERY_IDENTITY: '缺少当前档案身份，本次未发送；请重新打开对应档案。',
    RMT_RECOVERY_BUSY: '这一段正在生成，请等当前请求结束。',
    RMT_RECOVERY_FAILED: '具体原因未记录；旧内容保留，可重试。',
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
    RMT_ROOM_FIELDS: '房间的待补文字或增量物件尚未通过校验；已保留旧内容，请重试。若反复截断，请检查最大输出设置。',
    RMT_BUTTERFLY_relationship: '该节点的人物关系归属不明确；旧内容保留，请重试此节点。',
    RMT_BUTTERFLY_unique: '该节点重复或分歧维度不符；旧内容保留，请重试此节点。',
    RMT_ROOM_PETS: '人设有宠物，但模型漏写了有效宠物节点；请单独重试房间。',
    RMT_TRAVEL_LOCATIONS: '尚无通过证据与对白校验的地点；请确认档案或已选设定世界书包含地点。不会补造远方，旧地图保留。',
    RMT_SETTING_SOURCE_PARTIAL: '所选设定世界书读取不完整或超出本次容量；请检查所选书和条目后重试，旧内容保留。',
    RMT_ARCHIVE_PREFIX_CHANGED: '旧档案与当前历史基线不一致，可能是旧消息被修改或旧版漏收了隐藏楼层。本次未覆盖；请先检查来源，不必删除档案。',
    RMT_ARCHIVE_SOURCE_MISMATCH: '当前聊天中的档案标识或格式不匹配，已停止生成并保留原数据。',
    RMT_ROOM_HISTORY: '房间台词把没有证据的共同经历当成了过去；本次未保存，可重试。',
    RMT_LEDGER_UNAVAILABLE: '浏览器来源存储暂时不可用。请退出隐私模式或关闭旧页后重试；不要清除站点数据。',
    RMT_BANNED_GENERATED_PHRASE: '模型新生成内容命中了本地禁用词；本次结果没有保存。',
    RMT_JSON_EMPTY_FINAL: '模型没有返回最终正文 JSON；旧内容未被覆盖。',
    RMT_JSON_EMPTY_FINAL_WITH_REASONING: '本次响应只有推理字段，没有最终正文 JSON；未采用推理内容，也没有自动重试。可核对渠道支持的推理／流式参数后手动再试，旧内容保留。',
    RMT_RESPONSE_FORMAT: '当前连接返回了未识别的正文包装；旧内容保留，请导出诊断以核对返回格式。',
    RMT_JSON_NOT_FOUND: '模型最终正文中没有完整 JSON；旧内容未被覆盖。',
    RMT_JSON_TRUNCATED: '模型返回的 JSON 疑似被截断；旧内容未被覆盖。',
    RMT_PHONE_DRAFT_AVAILABLE: '私人终端只完成了部分内容；已保留可继续生成的草稿。',
    RMT_PHONE_DRAFT_UNAVAILABLE: '私人终端未完成，且本次草稿未能保存；旧终端保留。请检查存储状态后重试。',
    RMT_PHONE_SPEAKERS: '聊天缺少有原文依据的双方发言；不会补造对话来凑数量。',
    RMT_PHONE_EVIDENCE: '这项终端内容缺少完整的条目或来源证据；旧内容保留，可继续补齐。',
    RMT_PHONE_SOURCE_EMPTY: '当前来源不足以收录终端内容；请补充来源并更新档案后再生成，不会编造记录。',
    RMT_PHONE_SOURCE_CHANGED: '终端草稿的来源已变化，已完成内容未删除。请恢复原来的设定来源后继续，或明确重新生成终端。',
    RMT_ARCHIVE_CONTEXT_BUDGET: '完整建档请求超出已确认的模型上下文预算，未发送；来源与草稿保留，没有降低输出。',
    RMT_ARCHIVE_OUTPUT_BUDGET: '请求的最大输出超过已确认能力，未发送且没有擅自降低输出。',
    RMT_ARCHIVE_CHECKPOINT: '建档检查点格式或容量异常，旧成果保留，未自动重建。',
    RMT_ARCHIVE_SOURCE_CAPACITY: '全部来源超过账本容量，未仅截取前半部分冒充完成。',
    RMT_ARCHIVE_RESULT_CAPACITY: '本段结果超过原校验容量，未截取结果或推进完成进度。',
    RMT_INPUT_BUDGET: '本次输入超过安全预算，已在发送前拦截。',
    RMT_TOKEN_COUNT_TIMEOUT: '输入检查超时，本段未发送；旧内容保留，可重试。',
    RMT_TOKEN_COUNT_UNAVAILABLE: '本地计数暂不可用。',
    RMT_JSON_INVALID: '模型没有返回完整、可解析的 JSON；响应正文已隐藏。',
    RMT_ARCHIVE_DELETED_FENCE: '目标档案已被明确删除；较早启动的任务不会重新创建它。',
    RMT_METADATA_DURABILITY_UNAVAILABLE: '当前页面无法确认档案已经持久保存；结果保留待重试，不会假装成功。',
});

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
    const backup = core_backupDiagnostics.backupFailureDiagnostic(error);
    if (backup) return { code: backup.code, kind: 'storage', retryable: false,
        backupCategory: backup.category, backupStage: backup.stage };
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
    return diagnostic;
}

export function safeErrorSummary(error, max = 520) {
    if (core_backupDiagnostics.backupFailureDiagnostic(error)) {
        return normalizeText(core_backupDiagnostics.backupFailureSummary(error).message, max);
    }
    const categories = { chat: '聊天正文或聊天身份', character: '角色身份或角色卡', persona: '用户 Persona',
        archive: '正式档案版本', range: '聊天读取范围', selection: '来源选择', configuration: '生成配置',
        sources: '已捕获来源快照', record: '旧草稿结构', target: '内部档案目标',
        operation: '原任务入口', request: '原分段请求配方', attachment: '运行中的恢复绑定', unknown: '旧格式草稿身份' };
    if (['RMT_RECOVERY_INPUT_CHANGED', 'RMT_RECOVERY_SOURCE_CHANGED', 'RMT_RECOVERY_OPERATION_CHANGED'].includes(error?.code) && Object.hasOwn(categories, error.archiveInputCategory)) {
        if (error.archiveInputCategory === 'operation') return '原任务属于另一生成入口；请使用“继续未完成内容”返回原任务。成功内容与草稿保留，没有发起新请求。';
        if (['record', 'target', 'request', 'attachment', 'unknown'].includes(error.archiveInputCategory)) {
            return `${categories[error.archiveInputCategory]}未通过兼容核对；不等于你修改了设置。成功内容与原草稿保留，没有自动重做，可先导出未提交草稿。`;
        }
        return `${categories[error.archiveInputCategory]}与原任务不一致；已保存成果和未提交草稿保留。可恢复原条件继续，或先导出草稿再明确处理。`;
    }
    if (['RMT_ARCHIVE_CONTEXT_BUDGET', 'RMT_ARCHIVE_OUTPUT_BUDGET'].includes(error?.code) && error.archiveBudget) {
        const b = error.archiveBudget, n = value => Number.isFinite(value) && value >= 0 ? Math.floor(value).toLocaleString() : '未知';
        return `${SAFE_ERROR_CODE_MESSAGES[error.code]} 完整输入 ${n(b.utf16Chars)} 字符（UTF-16）、${n(b.utf8Bytes)} UTF-8 字节；输入 token ${n(b.inputTokens)}（宿主计数估算）、请求最大输出 ${n(b.outputTokens)} token；模型上下文 ${n(b.contextTokens)}。`;
    }
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
    return SAFE_ERROR_CODE_MESSAGES.RMT_RECOVERY_FAILED;
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
