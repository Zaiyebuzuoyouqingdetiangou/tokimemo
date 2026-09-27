// 旧的按模块开关只转成一次用户偏好。
// 不打开新计划，也不把任何模块标成已经可以自动生成。
import * as auto_update_policy from '../core/autoUpdatePolicy.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as auto_memory_plan from './planStore.js';

function legacyPreferredModuleIds(value) {
    const normalized = auto_update_policy.normalizeAutoUpdates(value);
    const preferred = [];
    for (const mode of auto_update_policy.AUTO_UPDATE_MODES) {
        // 建档是周期前提，不是抽签模块。成就已改成其他模块的末包。
        if (mode === 'archive' || mode === 'achievements') continue;
        if (normalized[mode]?.enabled !== true) continue;
        if (!auto_memory_registry.isAutoMemoryDrawModule(mode)) continue;
        preferred.push(mode);
    }
    return preferred;
}

function nextUpdatedAt(previous, now) {
    if (Number.isSafeInteger(now) && now > previous) return now;
    if (previous < Number.MAX_SAFE_INTEGER) return previous + 1;
    return previous;
}

// existingPlanRaw 为空才读取旧开关。已经迁移过的计划保持原偏好，即使旧开关后来又变了。
export function migrateLegacyAutoPreferences(existingPlanRaw, legacyAutoUpdates, now = 0) {
    if (existingPlanRaw != null) {
        const parsed = auto_memory_plan.parseAutoMemoryPlan(existingPlanRaw);
        if (parsed.legacyPreferencesMigrated) return { plan: parsed, changed: false };
        const plan = auto_memory_plan.parseAutoMemoryPlan({
            ...parsed,
            legacyPreferencesMigrated: true,
            revision: parsed.revision + 1,
            updatedAt: nextUpdatedAt(parsed.updatedAt, now),
        });
        return { plan, changed: true };
    }
    return {
        plan: auto_memory_plan.createAutoMemoryPlan({
            enabled: false,
            intervalFloors: 5,
            preferredModuleIds: legacyPreferredModuleIds(legacyAutoUpdates),
            excludedModuleIds: [],
            legacyPreferencesMigrated: true,
            updatedAt: Number.isSafeInteger(now) ? now : 0,
        }),
        changed: true,
    };
}
