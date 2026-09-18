import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as text from '../core/text.js';
import * as generation_recovery from '../generation/recovery.js';

// Display only. A clicked action still reloads the canonical source and validates identity.
export function recoveryBannerHtml(stored, bank, { readOnly = false } = {}) {
    if (readOnly || !bank) return '';
    return Object.values(constants.MODE).map(mode => {
        const journal = stored?.__generationRecoveryV1?.[mode];
        if (journal?.identity?.chatId !== bank.chatId || journal?.identity?.archiveRevision !== bank.archiveRevision
            || journal?.[constants.SESSION_MODE_WRITE_FENCE_KEY] !== cache.modeWriteFenceForCache(stored, mode)) return '';
        const summary = generation_recovery.generationRecoverySummary(journal);
        if (!summary || (!summary.completed && !summary.truncated && !summary.failed)) return '';
        const label = summary.canContinue ? '继续生成' : '重试未完成部分';
        const reason = summary.canContinue ? '正文未写完' : summary.failureCode ? text.safeErrorSummary({ code: summary.failureCode }) : '任务尚未完成';
        return `<section class="rmt-recovery-status" role="status"><b>${text.esc(constants.MODE_LABEL[mode] || mode)} · 已保留 ${summary.completed} 个成功分段</b><p>${text.esc(reason.replace(/[。\s]+$/, ''))}。继续会使用生成额度。</p><button type="button" class="rmt-btn" data-rmt-recovery-mode="${text.esc(mode)}">${label}</button> <button type="button" class="rmt-btn" data-rmt-recovery-discard="${text.esc(mode)}">放弃未提交草稿</button></section>`;
    }).join('');
}

export function archiveRecoveryHtml(summary, { profile = false } = {}) {
    if (!summary) return '';
    const label = profile || summary.profileOnly ? '仅重试档案简介' : summary.awaitingCommit ? '仅重试保存'
        : summary.batchProgress ? '继续下一批' : summary.canContinue ? '继续整理档案' : '重试未完成分块';
    const capacity = summary.capacityBlocked === true;
    const batch = summary.batchProgress;
    const heading = batch ? `批次 ${batch.currentBatch}/${batch.batches} · 已正式保存 ${batch.saved} 个来源片段`
        : `${label} · 已保留 ${Number(summary.completed) || 0} 个成功分段`;
    return `<section class="rmt-recovery-status" role="status"><b>${text.esc(heading)}</b><p>${text.esc(summary.notice)}</p>${summary.failureCode ? `<p>${text.esc(text.safeErrorSummary({ code: summary.failureCode }))}</p>` : ''}
${!capacity ? `<button type="button" class="rmt-btn" data-rmt-archive-recovery="${profile || summary.profileOnly ? 'profile' : 'import'}">${label}</button>` : ''}
${!profile && !summary.profileOnly ? '<button type="button" class="rmt-btn" data-rmt-archive-export-pending>导出待入档成果</button>' : ''}
${!profile && !summary.profileOnly && !summary.awaitingCommit && !capacity ? '<button type="button" class="rmt-btn" data-rmt-archive-restart>按当前条件另起任务</button>' : ''}
${!batch ? '<button type="button" class="rmt-btn" data-rmt-archive-discard>放弃本页整理草稿</button>' : ''}</section>`;
}
