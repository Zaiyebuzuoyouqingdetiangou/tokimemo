// Backup diagnostics contain only code-owned labels. Never inspect or stringify
// an exception message, stack, URL, archive, prompt or provider response here.
const failureDetails = new WeakMap();
const categories = Object.freeze({
    quota: ['RMT_BACKUP_QUOTA', '浏览器可用存储空间不足，独立备份未更新。', '先导出保留现有档案，再检查浏览器可用存储；不要清除此站点数据。'],
    blocked: ['RMT_BACKUP_BLOCKED', '其他页面阻挡了独立备份数据库的打开或升级。', '关闭其他同站点页面后手动重试，不要删除现有数据库。'],
    security: ['RMT_BACKUP_SECURITY', '浏览器安全或隐私策略拒绝了独立备份访问。', '检查当前站点的存储权限与隐私模式，再手动重试。'],
    clone: ['RMT_BACKUP_CLONE', '备份数据无法复制或序列化，独立备份未更新。', '保留当前档案并报告此代码；不要重建或清空档案。'],
    schema: ['RMT_BACKUP_SCHEMA', '备份数据或数据库结构不兼容，独立备份未更新。', '保留当前档案并报告此代码；不要删除数据库或自动重建。'],
    transaction: ['RMT_BACKUP_TRANSACTION', '独立备份事务未完成，未确认写入成功。', '保留当前档案，确认其他页面的操作后手动重试。'],
    unavailable: ['RMT_BACKUP_UNAVAILABLE', '当前环境没有可用的独立备份存储。', '检查浏览器是否允许此站点使用 IndexedDB，再手动重试。'],
    unknown: ['RMT_BACKUP_UNKNOWN', '独立备份未完成，现有信息不足以判断原因。', '保留当前档案，反馈诊断代码和阶段；不要清空站点数据。'],
});
const stages = new Set(['open', 'upgrade', 'read', 'write', 'serialize', 'normalize', 'prepare', 'mirror', 'reconcile', 'unknown']);
const logicalCodes = new Set(['RMT_CACHE_CAS_CONFLICT', 'RMT_ARCHIVE_DELETED_FENCE']);
const nameCategories = Object.freeze({
    QuotaExceededError: 'quota', NS_ERROR_DOM_QUOTA_REACHED: 'quota',
    SecurityError: 'security', NotAllowedError: 'security',
    DataCloneError: 'clone',
    VersionError: 'schema', NotFoundError: 'schema', ConstraintError: 'schema', DataError: 'schema',
    AbortError: 'transaction', TransactionInactiveError: 'transaction', ReadOnlyError: 'transaction', InvalidStateError: 'transaction',
    NotSupportedError: 'unavailable',
});
const domExceptionName = typeof DOMException === 'function'
    ? Object.getOwnPropertyDescriptor(DOMException.prototype, 'name')?.get : null;

function isObject(value) { return value !== null && (typeof value === 'object' || typeof value === 'function'); }

// Inspect only data descriptors: arbitrary thrown objects may contain getters.
function dataValue(value, key) {
    if (!isObject(value)) return undefined;
    try {
        let cursor = value;
        for (let depth = 0; cursor && depth < 5; depth += 1, cursor = Object.getPrototypeOf(cursor)) {
            const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
            if (descriptor) return Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
        }
    } catch { /* A proxy is not a diagnostic source. */ }
    return undefined;
}

function safeErrorName(error) {
    const name = dataValue(error, 'name');
    if (typeof name === 'string') return name;
    if (domExceptionName && isObject(error)) {
        try { return domExceptionName.call(error); } catch { /* Not a native DOMException. */ }
    }
    return '';
}

function classification(error) {
    const seen = new Set();
    let current = error;
    for (let depth = 0; isObject(current) && !seen.has(current) && depth < 8; depth += 1) {
        seen.add(current);
        const detail = failureDetails.get(current);
        if (detail && detail.category !== 'unknown') return { category: detail.category, code: detail.code };
        const code = dataValue(current, 'code');
        if (logicalCodes.has(code)) return { category: 'transaction', code };
        const known = Object.keys(categories).find(category => categories[category][0] === code);
        if (known && known !== 'unknown') return { category: known, code: categories[known][0] };
        const name = safeErrorName(current);
        const category = Object.prototype.hasOwnProperty.call(nameCategories, name) ? nameCategories[name] : null;
        if (category) return { category, code: categories[category][0] };
        current = detail?.cause || dataValue(current, 'cause');
    }
    return { category: 'unknown', code: categories.unknown[0] };
}

function makeDetails(error, stage, fallbackCategory) {
    const existing = isObject(error) ? failureDetails.get(error) : null;
    const found = classification(error);
    const category = found.category !== 'unknown' ? found.category
        : Object.prototype.hasOwnProperty.call(categories, fallbackCategory) ? fallbackCategory : 'unknown';
    return {
        category,
        code: logicalCodes.has(found.code) ? found.code : categories[category][0],
        stage: existing?.stage && existing.stage !== 'unknown' ? existing.stage : stages.has(stage) ? stage : 'unknown',
        cause: error,
    };
}

// Retains the original thrown value/identity for existing transport/backend
// contracts. Only module-private metadata changes; nothing is logged or saved.
export function annotateBackupFailure(error, stage, category = 'unknown') {
    if (isObject(error) && !failureDetails.has(error)) failureDetails.set(error, { ...makeDetails(error, stage, category), cause: undefined });
    return error;
}

// For errors produced at the actual storage boundary, expose a safe fixed
// message and retain the original cause privately (not enumerable or loggable).
export function backupFailureError(error, stage, category = 'unknown') {
    const detail = makeDetails(error, stage, category);
    const wrapped = new Error(categories[detail.category][1]);
    wrapped.code = detail.code;
    wrapped.kind = 'storage';
    wrapped.backupStage = detail.stage;
    wrapped.retryable = false;
    failureDetails.set(wrapped, detail);
    return wrapped;
}

export function backupFailureSummary(error) {
    const detail = isObject(error) ? failureDetails.get(error) : null;
    const found = classification(error);
    const stageValue = detail?.stage || dataValue(error, 'backupStage');
    const stage = stages.has(stageValue) ? stageValue : 'unknown';
    const category = found.category;
    let message = categories[category][1];
    let action = categories[category][2];
    if (found.code === 'RMT_CACHE_CAS_CONFLICT') {
        message = '独立备份已被其他页面更新，本次旧结果未覆盖它。';
        action = '等待当前合并完成；不要重建档案或删除备份。';
    } else if (found.code === 'RMT_ARCHIVE_DELETED_FENCE') {
        message = '档案删除围栏阻止了旧任务重新创建备份。';
        action = '保留删除状态；不要自动恢复或重建此档案。';
    }
    return { code: found.code, category, stage, message, action };
}
