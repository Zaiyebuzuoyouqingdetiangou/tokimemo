import * as relay from '../archive/relay.js';
import * as store from '../archive/relayStore.js';
import * as preparation from '../archive/relayPreparation.js';
import * as library from '../archive/library.js';
import * as inheritance from '../archive/inheritance.js';
import * as cache from '../core/cache.js';
import * as context from '../core/context.js';
import * as policy from '../core/archiveRelayPolicy.js';
import * as text from '../core/text.js';
import * as repository from '../archive/repository.js';
import * as overlay from './overlay.js';
import { workspace } from './workspaceState.js';
import { state } from '../core/state.js';

let activePreview = null;
const esc = value => text.esc(String(value ?? ''));

function currentEntry(ctx) { return cache.archiveBackupEntryForContext(ctx, repository.getImportedMemory(ctx) || { chatId: context.getChatId(ctx) }); }

export function archiveRelayEntryHtml(ctx = context.getContext()) {
    if (!context.getChatId(ctx) || ctx.groupId || ctx.characterId == null) return '';
    const entry = currentEntry(ctx), fence = policy.relayUiState(entry);
    if (fence) {
        const frozen = policy.relayReadOnly(entry, fence), holder = policy.relayHolder(fence);
        return `<section class="rmt-archive-card rmt-relay-status"><b>${frozen ? `已交给 ${esc(holder?.chatId)} 继续 · 只读` : '正在这里继续连续档案'}</b><div class="rmt-current-archive-actions">${frozen ? `<button type="button" class="rmt-btn" data-rmt-action="archive-relay-preview" data-rmt-relay-entry="${esc(holder?.entryId)}">接回当前聊天</button>` : ''}<button type="button" class="rmt-btn" data-rmt-action="archive-relay-backup">导出最近交接备份</button><button type="button" class="rmt-btn" data-rmt-action="archive-relay-drafts">查看原聊天保留草稿</button></div></section>`;
    }
    if (!inheritance.inheritanceCandidates(ctx).length) return '';
    return '<section class="rmt-archive-card"><button type="button" class="rmt-btn" data-rmt-action="archive-relay-open">在这里继续旧聊天的档案…</button></section>';
}

export function archiveRelayPreviewHtml(preview) {
    const counts = inheritance.archiveInheritanceCounts(preview.source.memory, preview.source.cache);
    return `<section class="rmt-archive-card"><h2>在这里继续这份档案</h2><p>${esc(preview.source.memory.archiveName || '连续档案')} · ${counts.memories + counts.coldMemories} 条记忆</p><p>${esc(preview.sourceEntry.chatId)} → ${esc(preview.targetEntry.chatId)}</p><p>交接后原聊天只读；已有作品和记忆编号保留。本期接力仅限同一浏览器。</p>${preview.occupied ? '<p>当前聊天已有独立档案。不会合并；请先导出备份并确认，再接入所选档案。</p><button type="button" class="rmt-btn" data-rmt-action="archive-relay-export-target">导出当前档案备份</button><label style="display:block;margin:12px 0"><input type="checkbox" data-rmt-relay-replace-confirm> 我已保存备份，确认将当前聊天接入这份连续档案</label>' : ''}<div class="rmt-current-archive-actions"><button type="button" class="rmt-btn" data-rmt-action="archive-relay-confirm">${preview.returning ? '确认接回这里' : '确认交接'}</button><button type="button" class="rmt-btn" data-rmt-action="library-home">取消，保留现状</button></div></section>`;
}

function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function handleArchiveRelayAction(button, action) {
    const body = overlay.bodyEl(), epoch = workspace.epoch, scope = context.chatScopeKey(context.getContext());
    const lifecycle = state.runtimeLifecycleEpoch;
    const here = () => body?.isConnected && overlay.bodyEl() === body && epoch === workspace.epoch
        && lifecycle === state.runtimeLifecycleEpoch && scope === context.chatScopeKey(context.getContext()) && button.isConnected;
    button.disabled = true;
    try {
        if (action === 'archive-relay-open') {
            activePreview = null;
            const rows = await relay.relayCandidates();
            if (!here()) return;
            body.innerHTML = `<section class="rmt-archive-card"><h2>选择要继续的档案</h2><p>只列出同一角色当前持有的档案；不复制成另一条世界线。</p><div class="rmt-archive-overview-list">${rows.map(row => `<button type="button" class="rmt-archive-overview-item" data-rmt-action="archive-relay-preview" data-rmt-relay-entry="${esc(row.entryId)}"><span><b>${esc(row.archiveName)}</b><small>${esc(row.chatId)}</small></span><span>继续这份档案 ›</span></button>`).join('') || '<p>没有可交接的同角色档案。</p>'}</div><button type="button" class="rmt-btn" data-rmt-action="library-home">返回</button></section>`;
        } else if (action === 'archive-relay-preview') {
            activePreview = null;
            const preview = await relay.previewArchiveRelay(button.dataset.rmtRelayEntry, { loadSnapshot: library.fetchIndexedArchiveSnapshot });
            if (!here()) return;
            activePreview = { preview, exported: false };
            body.innerHTML = archiveRelayPreviewHtml(preview);
        } else if (action === 'archive-relay-export-target') {
            if (!activePreview) throw new Error('预览已失效，请重新选择。');
            download({ version: 1, kind: 'hearttrace-relay-target-backup', record: activePreview.preview.target, mirror: activePreview.preview.targetMirror }, 'hearttrace-before-relay.json');
            activePreview.exported = true;
        } else if (action === 'archive-relay-confirm') {
            const chosen = activePreview;
            if (!chosen) throw new Error('预览已失效，请重新选择。');
            const approved = !chosen.preview.occupied || (chosen.exported && body.querySelector('[data-rmt-relay-replace-confirm]')?.checked === true);
            if (!approved) throw new Error('请先导出当前档案备份，再勾选确认；现有内容尚未改动。');
            const result = await relay.commitArchiveRelay(chosen.preview, { replaceTarget: chosen.preview.occupied });
            activePreview = null;
            globalThis.toastr?.success?.(result.mirrorQueued ? '交接已保存在本机，可以在这里继续。' : '交接已保存在本机；酒馆附带副本暂未排入保存，重新打开本聊天可读取本机成果。', '心迹回廊');
            if (here()) await library.showArchiveLibrary();
        } else if (action === 'archive-relay-backup') {
            const fence = await store.readArchiveRelayState(currentEntry(context.currentCharacterGuard()));
            if (!fence) throw new Error('当前聊天没有接力记录。');
            const checkpoint = await store.readRelayCheckpoint(fence.transferId);
            if (!here()) return;
            if (!checkpoint) throw new Error('最近交接备份暂不可读取，请保留页面。');
            download(checkpoint, 'hearttrace-relay-checkpoint.json');
        } else if (action === 'archive-relay-drafts') {
            const ctx = context.currentCharacterGuard();
            await cache.ensureCacheHydrated(ctx);
            if (!here()) return;
            const rows = preparation.relayPreservedDraftRows(cache.getCache(ctx));
            body.innerHTML = `<section class="rmt-archive-card"><h2>原聊天保留草稿</h2><p>保留原请求与成功片段，不作为当前聊天自动重试。</p>${rows.map(row => `<details><summary>来自 ${esc(row.originChatId)}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(row.value, null, 2))}</pre></details>`).join('') || '<p>没有另外保留的旧请求草稿。</p>'}<button type="button" class="rmt-btn" data-rmt-action="archive-relay-backup">导出完整交接备份</button><button type="button" class="rmt-btn" data-rmt-action="library-home">返回档案室</button></section>`;
        }
    } catch (error) { globalThis.toastr?.error?.(text.toastText(text.safeErrorSummary(error)), '心迹回廊'); }
    finally { if (button.isConnected) button.disabled = false; }
}
