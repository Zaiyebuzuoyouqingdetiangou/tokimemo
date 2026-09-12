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
        return `<section class="rmt-recovery-status" role="status"><b>${text.esc(constants.MODE_LABEL[mode] || mode)} · 已保留 ${summary.completed} 个成功分段</b><p>${text.esc(reason)}。继续会使用文本生成额度，旧内容保持不变。</p><button type="button" class="rmt-btn" data-rmt-recovery-mode="${text.esc(mode)}">${label}</button> <button type="button" class="rmt-btn" data-rmt-recovery-discard="${text.esc(mode)}">放弃未提交草稿</button></section>`;
    }).join('');
}

export function archiveRecoveryHtml(summary, { profile = false } = {}) {
    if (!summary) return '';
    const label = profile || summary.profileOnly ? '仅重试档案简介' : summary.awaitingCommit ? '检查待写回进度' : summary.canContinue ? '继续整理档案' : '重试未完成分块';
    return `<section class="rmt-recovery-status" role="status"><b>${label} · 已保留 ${Number(summary.completed) || 0} 个成功分段</b><p>${text.esc(summary.notice)}</p><button type="button" class="rmt-btn" data-rmt-archive-recovery="${profile || summary.profileOnly ? 'profile' : 'import'}">${label}</button> <button type="button" class="rmt-btn" data-rmt-archive-discard>放弃本页整理草稿</button></section>`;
}
