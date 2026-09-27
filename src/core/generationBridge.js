// 重构清单 C-3b（r84.99）：core 层不再直接 import generation 层。
// 下面这些生成层函数由各自的 generation 文件在加载时登记进来（见各文件末尾的 registerGenerationBridge），
// core 调用时按名字转过去。还没登记就被调用，说明加载顺序出了问题，直接报错，不猜默认值。

// 生成恢复记录在缓存里的键。原来定义在 generation/recoveryFeedback.js，core 的缓存代码要读它，
// 所以挪到这里（底层）定义，generation 那边改为引用这里，值不变。
export const GENERATION_RECOVERY_CACHE_KEY = '__generationRecoveryV1';

const hooks = Object.create(null);

export function registerGenerationBridge(entries = {}) {
    for (const [name, fn] of Object.entries(entries)) if (typeof fn === 'function') hooks[name] = fn;
}

export function generationBridgeRegistered(name) { return typeof hooks[name] === 'function'; }

function call(name, args) {
    const fn = hooks[name];
    if (!fn) throw new Error(`心迹回廊内部错误：生成函数 ${name} 尚未登记`);
    return fn(...args);
}

export function generateMode(...args) { return call('generateMode', args); }

export function promptSafetyBoundary(...args) { return call('promptSafetyBoundary', args); }

// r84.122：旧蝴蝶效应提示词在顶层解构这个函数。r84.99 登记安全边界时漏了它。
export function promptArchiveSlice(...args) { return call('promptArchiveSlice', args); }

export function normalizeCgPromptMetadata(...args) { return call('normalizeCgPromptMetadata', args); }

export function readGenerationContentSnapshot(...args) { return call('readGenerationContentSnapshot', args); }

export function generationRecoverySummary(...args) { return call('generationRecoverySummary', args); }

export function generationRecoveryDigest(...args) { return call('generationRecoveryDigest', args); }

export function canRestartLegacyConfiguration(...args) { return call('canRestartLegacyConfiguration', args); }

export function generationRecoveryMismatch(...args) { return call('generationRecoveryMismatch', args); }

export function generationRecoveryProgress(...args) { return call('generationRecoveryProgress', args); }

export function generationRecoveryForOrigin(...args) { return call('generationRecoveryForOrigin', args); }
