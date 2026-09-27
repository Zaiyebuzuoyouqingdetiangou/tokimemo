// 重构清单 C-2（r84.97）：core 层不再直接 import ui 层。
// ui 的这几个函数由入口 src/heartbeatMemories.js 在启动时登记进来，调用时再按名字转过去；
// 所以测试替换 ui 模块里的函数时，这里也会跟着用替换后的版本。
// 还没登记时：确认框按“没有确认”处理（不做破坏性动作），刷新按“什么也不做”处理。
const hooks = { confirmExplicitAction: null, refreshSettingsTaskStatus: null, refreshSettingsMemoryStatus: null };

export function registerUiBridge(entries = {}) {
    for (const [name, fn] of Object.entries(entries)) if (Object.hasOwn(hooks, name) && typeof fn === 'function') hooks[name] = fn;
}

export function confirmExplicitAction(...args) {
    return hooks.confirmExplicitAction ? hooks.confirmExplicitAction(...args) : false;
}

export function refreshSettingsTaskStatus(...args) {
    return hooks.refreshSettingsTaskStatus ? hooks.refreshSettingsTaskStatus(...args) : undefined;
}

export function refreshSettingsMemoryStatus(...args) {
    return hooks.refreshSettingsMemoryStatus ? hooks.refreshSettingsMemoryStatus(...args) : undefined;
}
