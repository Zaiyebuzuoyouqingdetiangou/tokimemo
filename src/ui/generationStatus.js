import * as cache from '../core/cache.js';
import * as context from '../core/context.js';
import * as status from '../core/generationStatus.js';
import * as merged from '../generation/mergedGeneration.js';

export function currentPendingRows() {
    return merged.createPendingStore().readForOrigin(merged.currentPendingScope(context.getContext()));
}

export function currentUnattributedPendingRows() {
    return merged.createPendingStore().readUnattributed(context.comparableChatId(context.getChatId()));
}

export function routeGenerationStatus(route, mode, session, { running = false, queued = false, snapshot = null, hasContent = !!session } = {}) {
    let pending = [], drafts = [];
    if (!snapshot) {
        try { pending = currentPendingRows().filter(row => row.route === route); }
        catch { return { state: 'failed', label: '暂存区待检查 · 可导出原文' }; }
        try { drafts = cache.listGenerationDrafts().filter(row => row.mode === mode && (!row.pageId || row.pageId === route || route === 'heart' && ['spring','summer','autumn','winter'].includes(row.pageId))); } catch {}
    }
    return status.resolveGenerationStatus({ running, queued, pending, drafts, hasContent, partial: status.sessionHasPendingParts(session) });
}
