// 插件顶端的倒计时。只读当前聊天的计划，不发请求。
import * as auto_memory_floor from '../autoMemory/floorPace.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';

export function refreshAutoMemoryCountdown() {
    const nodes = typeof document !== 'undefined' ? document.querySelectorAll('[data-rmt-memory-due]') : [];
    let label = '';
    try {
        const context = core_context.getContext();
        const snapshot = auto_memory_plan.readAutoMemoryMetadata(context?.chatMetadata);
        const plan = snapshot?.plan;
        if (plan?.enabled === true && Number.isSafeInteger(plan.nextDueFloor)) {
            const latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
            const floor = latest
                ? auto_memory_floor.assistantFloorCount(context.chat)
                : (Array.isArray(context.chat) ? context.chat.length : 0);
            label = auto_memory_floor.countdownLabel(auto_memory_floor.floorsRemaining(floor, plan.nextDueFloor));
        }
    } catch { label = ''; }
    for (const node of nodes) {
        node.textContent = label;
        node.hidden = !label;
    }
}
