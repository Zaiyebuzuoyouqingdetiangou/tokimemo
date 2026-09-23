// UI adapter for the explicit archive inheritance flow. The overlay dispatcher
// owns event routing; this module supplies bounded HTML and actions.
import * as archive_inheritance from '../archive/inheritance.js';
import * as archive_library from '../archive/library.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

let activePreview = null;

function countsText(counts) {
    return `${Number(counts?.memories) || 0} 条热位记忆 · ${Number(counts?.coldMemories) || 0} 条冷归档 · ${Number(counts?.derivedModes) || 0} 个已生成页面`;
}

export function archiveInheritanceEntryHtml(context = core_context.getContext()) {
    const candidates = archive_inheritance.inheritanceCandidates(context);
    if (!candidates.length) return '';
    return `<button type="button" class="rmt-btn" data-rmt-action="archive-inheritance-open">从这个角色的旧聊天继承…</button>`;
}

export function archiveInheritancePickerHtml(context = core_context.getContext()) {
    const rows = archive_inheritance.inheritanceCandidates(context).map(entry => `<button type="button" class="rmt-archive-overview-item" data-rmt-action="archive-inheritance-preview" data-rmt-inheritance-entry="${core_text.esc(core_context.archiveIndexEntryId(entry))}"><span class="rmt-overview-dot">●</span><span><b>${core_text.esc(entry.archiveName)}</b><small>${core_text.esc(entry.chatId)} · ${Number(entry.memoryCount) || 0} 条记忆 · 只读取预览</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('');
    return `<section class="rmt-archive-card"><div class="rmt-archive-kicker">EXPLICIT ARCHIVE INHERITANCE</div><strong class="rmt-archive-title">从同一角色卡的旧聊天继承</strong><p>只列出角色卡位置与头像都一致的旧档案；不会按名字猜测，也不会自动混合聊天。</p><div class="rmt-archive-overview-list">${rows || '<div class="rmt-archive-overview-empty">没有可安全确认的同角色旧档案。</div>'}</div></section>`;
}

export async function prepareArchiveInheritancePreview(entryId, context = core_context.currentCharacterGuard()) {
    activePreview = await archive_inheritance.previewArchiveInheritance(entryId, {
        context,
        loadSnapshot: archive_library.fetchIndexedArchiveSnapshot,
    });
    return activePreview;
}

export function archiveInheritancePreviewHtml(preview = activePreview) {
    if (!preview) return '<div class="rmt-error"><div><b>预览已失效，请重新选择来源。</b></div></div>';
    return `<section class="rmt-archive-card"><div class="rmt-archive-kicker">COPY PREVIEW</div><strong class="rmt-archive-title">${core_text.esc(preview.sourceArchiveName || '旧聊天档案')}</strong><p>来源：${core_text.esc(preview.sourceChatId)}<br>来源现有：${core_text.esc(countsText(preview.source))}<br>目标当前：${core_text.esc(countsText(preview.targetBefore))}<br>完成后目标：${core_text.esc(countsText(preview.targetAfter))}</p><p>旧档案保持原样。复制后的记忆会明确记录原聊天来源；未完成任务不会进入新聊天。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="rmt-btn" data-rmt-action="archive-inheritance-confirm">确认继承到当前新聊天</button><button type="button" class="rmt-btn" data-rmt-action="archive-inheritance-open">返回选择</button></div></section>`;
}

export async function commitArchiveInheritance(context = core_context.currentCharacterGuard()) {
    if (!activePreview) throw new Error('继承预览已失效，请重新选择来源。');
    const preview = activePreview;
    const result = await archive_inheritance.inheritArchiveIntoCurrentChat(preview, {
        context,
        loadSnapshot: archive_library.fetchIndexedArchiveSnapshot,
    });
    activePreview = null;
    return result;
}

export function clearArchiveInheritancePreview() { activePreview = null; }
