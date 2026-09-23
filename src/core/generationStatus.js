// Read-only common vocabulary for catalogue, page and task surfaces.
export const GENERATION_STATUS_LABELS = Object.freeze({ running: '进行中', queued: '排队', unsaved: '仅待保存', retry: '部分完成 · 待补', failed: '待重试', done: '完成', cancelled: '已取消' });

export function resolveGenerationStatus({ running = false, queued = false, pending = [], drafts = [], partial = false, hasContent = false } = {}) {
    if (running) return { state: 'running', label: hasContent ? '进行中 · 已有内容可读' : GENERATION_STATUS_LABELS.running };
    if (queued) return { state: 'queued', label: GENERATION_STATUS_LABELS.queued };
    if (pending.some(row => row.kind === 'unsaved')) return { state: 'unsaved', label: '仅待保存 · 不再请求模型' };
    if (partial || pending.length || drafts.length) {
        const saved = hasContent || drafts.some(row => Number(row.completed) > 0);
        return { state: saved ? 'retry' : 'failed', label: saved ? GENERATION_STATUS_LABELS.retry : GENERATION_STATUS_LABELS.failed };
    }
    return { state: hasContent ? 'done' : 'empty', label: hasContent ? GENERATION_STATUS_LABELS.done : '尚未生成 · 可先进入' };
}

export function sessionHasPendingParts(session) {
    if (!session || typeof session !== 'object') return false;
    if (session.readableProgress?.version === 1 && session.readableProgress.complete === false) return true;
    const seen = new Set();
    const visit = (value, depth) => {
        if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return false;
        seen.add(value);
        if (Array.isArray(value.progressPending) && value.progressPending.length) return true;
        return Object.entries(value).some(([key, child]) => !['sourceSnapshots', 'sourceMemory', 'previousVersions', 'generationSourceSnapshots'].includes(key) && visit(child, depth + 1));
    };
    return visit(session, 0);
}
