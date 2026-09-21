import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as text from '../core/text.js';
import * as generation_recovery from '../generation/recovery.js';

export function ensureRecoveryHost(root) {
    const overlayBody = root?.closest?.('.rmt-body') || root;
    const existing = overlayBody?.querySelector?.('[data-rmt-generation-recoveries]');
    if (existing) return existing;
    if (!root) return null;
    const host = document.createElement('div');
    host.setAttribute('data-rmt-generation-recoveries', '');
    root.appendChild(host);
    return host;
}

export function readableProgressHtml(session) {
    return session?.readableProgress?.version === 1 && session.readableProgress.complete === false
        ? '<p class="rmt-recovery-status" role="status" data-rmt-readable-progress>生成尚未完成，已写好的内容可以先阅读；原草稿和未完成部分仍保留。</p>' : '';
}

// Display only. A clicked action still reloads the canonical source and validates identity.
export function recoveryBannerHtml(stored, bank, { readOnly = false, mode = '' } = {}) {
    if (!bank) return '';
    const seen = new Set();
    const keep = row => {
        if (mode && row?.mode !== mode) return false;
        const key = `${row?.draftId || ''}|${row?.pageId || ''}|${row?.mode || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    };
    if (stored?.[cache.GENERATION_DRAFTS_CACHE_KEY]) {
        const pages = { language: '基础语言', strips: '日常一格', fireflies: '萤火虫', spring: '春', summer: '夏', autumn: '秋', winter: '冬', postending: '后日谈', roomLife: '今日生活' };
        const draftHtml = readOnly ? '' : cache.generationDraftRows(stored, bank).filter(keep).map(row => {
            const summary = generation_recovery.generationRecoverySummary(row.journal);
            if (!summary || (!summary.completed && !summary.truncated && !summary.failed && !summary.failureCode && !summary.oversized)) return '';
            // An oversized draft can never continue; it still gets export and
            // discard so the user is never left without an exit.
            const oversized = summary.oversized === true;
            const snapshotNote = summary.snapshotBudget
                ? `快照投影 ${Number(summary.snapshotBudget.snapshotChars || 0).toLocaleString()} / ${Number(summary.snapshotBudget.budgetChars || 0).toLocaleString()} 字符`
                : '';
            const label = summary.canContinue ? '继续生成' : '重试未完成部分';
            const reason = oversized
                ? (summary.blocked ? `${snapshotNote || '续写资料包超限'}，不能继续生成；已保留的内容不受影响，请导出留存后明确放弃`
                    : '草稿超出本地保存上限，不能继续生成；已保留的内容不受影响，请导出留存后明确放弃')
                : summary.canContinue ? '正文未写完' : summary.failureCode
                ? text.safeErrorSummary({ code: summary.failureCode, archiveInputCategory: summary.failureCategory, recoveryPhase: summary.failurePhase }) : '任务尚未完成';
            const pageLabel = pages[row.pageId] || constants.MODE_LABEL[row.mode] || row.pageId || row.mode;
            const attrs = `data-rmt-recovery-draft-id="${text.esc(row.draftId)}" data-rmt-recovery-page-id="${text.esc(row.pageId)}"`;
            const childReader = !oversized && row.journal.operation?.kind === 'content-item' && row.journal.operation.sourceDraftId
                ? ` <button type="button" class="rmt-btn" data-rmt-content-draft-open="${text.esc(row.draftId)}">查看单项草稿正文</button>` : '';
            const continueButton = oversized ? '' : `<button type="button" class="rmt-btn" data-rmt-recovery-mode="${text.esc(row.mode)}" ${attrs}>${label}</button>`;
            const tail = oversized ? '。' : '。继续只补这份草稿未完成的内容，会使用生成额度。';
            return `<section class="rmt-recovery-status" role="status"><b>${text.esc(pageLabel)} · 已保留 ${summary.completed} 个成功分段</b><p>${text.esc(new Date(row.createdAt).toLocaleString())} · ${text.esc(reason.replace(/[。\s]+$/, ''))}${tail}</p><div class="rmt-recovery-actions">${continueButton}${childReader} <button type="button" class="rmt-btn" data-rmt-recovery-export="${text.esc(row.mode)}" ${attrs}>导出未提交草稿</button> <button type="button" class="rmt-btn" data-rmt-recovery-discard="${text.esc(row.mode)}" ${attrs}>放弃这份草稿</button></div></section>`;
        }).join('');
        const resultHtml = cache.listGenerationTaskResults(null, stored).filter(keep).map(row => {
            const label = pages[row.pageId] || constants.MODE_LABEL[row.mode] || row.pageId || row.mode;
            const pending = row.status === 'awaiting-choice';
            return `<section class="rmt-recovery-status" role="status"><b>${text.esc(label)} · ${pending ? '成果已保存，等待选择去向' : row.status === 'open' ? '已保存部分成果，原草稿可继续' : '独立生成成果'}</b><p>按原资料生成，原资料出处随成果保留。</p><div class="rmt-recovery-actions"><button type="button" class="rmt-btn" data-rmt-task-result-open="${text.esc(row.draftId)}">${row.status === 'open' ? '打开已生成内容' : '查看已保存成果'}</button>${!readOnly && (pending || row.status === 'independent') ? ` <button type="button" class="rmt-btn" data-rmt-task-result-choose="${text.esc(row.draftId)}">选择保存去向</button>` : ''}</div></section>`;
        }).join('');
        return draftHtml + resultHtml;
    }
    if (readOnly) return '';
    return Object.values(constants.MODE).filter(item => !mode || item === mode).map(item => {
        const journal = stored?.__generationRecoveryV1?.[item];
        if (journal?.identity?.chatId !== bank.chatId || journal?.identity?.archiveRevision !== bank.archiveRevision
            || journal?.[constants.SESSION_MODE_WRITE_FENCE_KEY] !== cache.modeWriteFenceForCache(stored, item)) return '';
        const summary = generation_recovery.generationRecoverySummary(journal);
        if (!summary || (!summary.completed && !summary.truncated && !summary.failed && !summary.oversized)) return '';
        const rowKey = `${journal.draftId || item}|${journal.pageId || item}|${item}`;
        if (seen.has(rowKey)) return '';
        seen.add(rowKey);
        const oversized = summary.oversized === true;
        const snapshotNote = summary.snapshotBudget
            ? `快照投影 ${Number(summary.snapshotBudget.snapshotChars || 0).toLocaleString()} / ${Number(summary.snapshotBudget.budgetChars || 0).toLocaleString()} 字符`
            : '';
        const label = summary.canContinue ? '继续生成' : '重试未完成部分';
        const reason = oversized
            ? (summary.blocked ? `${snapshotNote || '续写资料包超限'}，不能继续生成；已保留的内容不受影响，请导出留存后明确放弃`
                : '草稿超出本地保存上限，不能继续生成；已保留的内容不受影响，请导出留存后明确放弃')
            : summary.canContinue ? '正文未写完' : summary.failureCode ? text.safeErrorSummary({ code: summary.failureCode, archiveInputCategory: summary.failureCategory, recoveryPhase: summary.failurePhase }) : '任务尚未完成';
        const continueButton = oversized ? '' : `<button type="button" class="rmt-btn" data-rmt-recovery-mode="${text.esc(item)}">${label}</button> `;
        const tail = oversized ? '。' : '。继续会使用生成额度。';
        return `<section class="rmt-recovery-status" role="status"><b>${text.esc(constants.MODE_LABEL[item] || item)} · 已保留 ${summary.completed} 个成功分段</b><p>上次记录：${text.esc(reason.replace(/[。\s]+$/, ''))}${tail}</p><div class="rmt-recovery-actions">${continueButton}<button type="button" class="rmt-btn" data-rmt-recovery-export="${text.esc(item)}">导出未提交草稿</button> <button type="button" class="rmt-btn" data-rmt-recovery-discard="${text.esc(item)}">放弃未提交草稿</button></div></section>`;
    }).join('');
}

export function archiveRecoveryHtml(summary, { profile = false } = {}) {
    if (!summary) return '';
    const draftLinks = (summary.drafts || []).map(draft => `<button type="button" class="rmt-btn" data-rmt-archive-draft-open="${text.esc(draft.draftId)}">查看${draft.stage === 'profile-only' || draft.stage === 'profile-result' || draft.operation === 'profile' ? '简介' : '建档'}${draft.paused ? '旧' : ''}草稿正文</button>`).join(' ');
    if (summary.onlyArchivedDrafts) return `<section class="rmt-recovery-status"><p>${text.esc(summary.notice)}</p><div class="rmt-recovery-actions">${draftLinks}</div></section>`;
    const label = profile || summary.profileOnly ? '仅重试档案简介' : summary.awaitingCommit ? '仅重试保存'
        : summary.batchProgress ? '继续下一批' : summary.canContinue ? '继续整理档案' : '重试未完成分块';
    const capacity = summary.capacityBlocked === true;
    const batch = summary.batchProgress;
    const heading = batch ? `批次 ${batch.currentBatch}/${batch.batches} · 已正式保存 ${batch.saved} 个来源片段`
        : `${label} · 已保留 ${Number(summary.completed) || 0} 个成功分段`;
    return `<section class="rmt-recovery-status" role="status"><b>${text.esc(heading)}</b><p>${text.esc(summary.notice)}</p>${summary.failureCode ? `<p>${text.esc(text.safeErrorSummary({ code: summary.failureCode }))}</p>` : ''}<div class="rmt-recovery-actions">${draftLinks}
${summary.pageOnly && !summary.awaitingCommit ? `<button type="button" class="rmt-btn" data-rmt-archive-save-draft="${profile ? 'profile' : 'import'}">保存本页草稿（不生成）</button>` : ''}
${!capacity ? `<button type="button" class="rmt-btn" data-rmt-archive-recovery="${profile || summary.profileOnly ? 'profile' : 'import'}">${label}</button>` : ''}
${!profile && !summary.profileOnly ? '<button type="button" class="rmt-btn" data-rmt-archive-export-pending>导出待入档成果</button>' : ''}
${!profile && !summary.profileOnly && !summary.awaitingCommit && !capacity ? '<button type="button" class="rmt-btn" data-rmt-archive-restart>按当前条件另起任务</button>' : ''}
${!batch ? '<button type="button" class="rmt-btn" data-rmt-archive-discard>放弃整理草稿</button>' : ''}</div></section>`;
}
