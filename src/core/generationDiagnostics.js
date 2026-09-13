// Ephemeral, bounded, content-free operation history. Not a provider log collector.
const recent = [];
const MODES = new Set(['archive', 'album', 'adv', 'room', 'items', 'phone', 'travel', 'ending', 'heart', 'calendar', 'butterfly', 'pastLives', 'inbox', 'cabinet', 'relations', 'achievements', 'image', 'storage', 'runtime', 'operation']);
const STAGES = new Set(['source', 'request', 'validation', 'save', 'display', 'operation']);
let knownReasons = Object.freeze({});
export function configureDiagnosticReasons(reasons) {
    knownReasons = Object.freeze({ ...reasons });
}
function diagnosticStage(code, status, kind) {
    if (/^RMT_(?:IMAGE_VIEW|IMAGE_EXPORT)/.test(code)) return 'display';
    if (/^RMT_(?:QQJ|SETTING_SOURCE|PHONE_SOURCE|ARCHIVE_PREFIX)/.test(code) || code === 'BBI_LIBRARY' || code === 'BBI_BINDING') return 'source';
    if (/STORAGE|DURABILITY|LEDGER|FENCE|TARGET_CHANGED|PATCH_INVALID|SAVE_FAILED/.test(code) || kind === 'storage') return 'save';
    if (/^BBI_|CONNECTION|^RMT_(?:MANUAL|PROFILE|REQUEST|INPUT_BUDGET|API_|RESPONSE_HTML)/.test(code) || status || ['network','timeout','transport','provider'].includes(kind)) return 'request';
    if (code && code !== 'RMT_LOCAL_OPERATION') return 'validation';
    return 'operation';
}
export function recordGenerationDiagnostic(input = {}) {
    const code = typeof input.code === 'string' && Object.hasOwn(knownReasons, input.code) ? input.code : '';
    const status = Number.isInteger(input.status) && input.status >= 400 && input.status <= 599 ? input.status : 0;
    const kind = ['network', 'timeout', 'transport', 'provider', 'validation', 'storage', 'lifecycle'].includes(input.kind) ? input.kind : '';
    const name = ['AbortError', 'TimeoutError', 'SyntaxError', 'TypeError', 'RangeError'].includes(input.name) ? input.name : '';
    const mode = MODES.has(input.mode) ? input.mode : 'operation';
    const stage = STAGES.has(input.stage) ? input.stage : diagnosticStage(code, status, kind);
    const row = { at: Date.now(), mode, stage, code: code || (status ? `HTTP_${status}` : name === 'AbortError' ? 'CANCELLED' : 'UNKNOWN'), status, kind };
    const last = recent[recent.length - 1];
    if (last && Date.now() - last.at < 1000 && ['mode', 'stage', 'code', 'status'].every(key => row[key] === last[key])) return;
    recent.push(Object.freeze(row));
    if (recent.length > 30) recent.shift();
}
export function generationDiagnosticReport() {
    return { version: 1, build: '0.8.61-image-prompt-pipeline-r66.0', scope: 'current-page-only',
        records: recent.map(row => ({ ...row, reason: knownReasons[row.code] || (row.status === 401 || row.status === 403
            ? '认证或权限失败。' : row.status === 429 ? '请求限流或配额限制。' : row.status >= 500 ? '上游服务故障。'
            : row.code === 'CANCELLED' ? '操作取消。' : '没有可核实的详细原因；未收集原始异常正文。') })) };
}
export function clearGenerationDiagnostics() { recent.length = 0; }
