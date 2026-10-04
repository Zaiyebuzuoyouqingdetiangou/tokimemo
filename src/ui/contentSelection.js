import * as selection from '../core/contentSelection.js';
import * as constants from '../core/constants.js';
import * as contextTools from '../core/context.js';
import * as text from '../core/text.js';
import * as runtime from '../core/state.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';

export function contentSelectionHtml(mode, { readOnly = false } = {}) {
    if (readOnly || runtime.state.activeArchiveSnapshot?.backupOnly || !selection.supportsContentSelection(mode)) return '';
    return `<section class="rmt-content-selection" data-rmt-content-selection="${text.esc(mode)}" aria-label="生成选材"></section>`;
}

export function mountContentSelection(container, mode, session = null) {
    const root = container?.querySelector?.('[data-rmt-content-selection]');
    if (!root) return;
    let context, bank;
    try {
        const target = runtime.state.activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtime.state.activeArchiveSnapshot) : null;
        context = target?.context || contextTools.currentCharacterGuard();
        bank = target?.archiveTarget?.memory || repository.getImportedMemory(context);
    } catch { root.textContent = '暂时无法读取选材范围，请检查当前档案。'; return; }
    const status = selection.contentSelectionStatus(session, bank);
    const rows = status.rows;
    if (!rows.length) { root.textContent = '档案中还没有可选材的记忆条目。'; return; }
    let request = selection.readContentSelectionRequest(context, bank, mode, session);
    let selected = new Set(request?.memoryIds || selection.createContentSelectionPlan(bank, session).memoryIds);
    let page = 0, dirty = false, rangeDirty = false;
    const pageSize = 6;
    const esc = text.esc;
    const capturedScope = contextTools.chatScopeKey(context);
    const capturedTarget = context?.__rmtArchiveTargetEntryId || '';
    const capturedRevision = bank?.archiveRevision;
    const currentScope = () => {
        try {
            const target = runtime.state.activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtime.state.activeArchiveSnapshot) : null;
            const now = target?.context || contextTools.currentCharacterGuard();
            const currentBank = target?.archiveTarget?.memory || repository.getImportedMemory(now);
            return contextTools.chatScopeKey(now) === capturedScope
                && (now?.__rmtArchiveTargetEntryId || '') === capturedTarget
                && currentBank?.archiveRevision === capturedRevision;
        } catch { return false; }
    };
    const notice = message => { root.querySelector('[data-cs-notice]').textContent = message; };
    const selectionLabel = () => request ? `本次使用已选的 ${request.memoryIds.length} 条`
        : status.pendingMemoryIds.length ? `自动从未确认选材的条目中继续 · 还剩 ${status.pendingMemoryIds.length} 条`
            : '已选材一遍，可继续寻找同一记忆的新镜头';
    const paintRows = () => {
        const host = root.querySelector('[data-cs-rows]');
        host.innerHTML = rows.slice(page * pageSize, (page + 1) * pageSize).map((row, offset) => {
            const index = page * pageSize + offset;
            return `<label class="rmt-cs-row"><input type="checkbox" data-cs-row="${index}" ${selected.has(row.id) ? 'checked' : ''}><span><b>第 ${index + 1} 条 · ${esc(row.title || '未命名记忆')}</b><small>${esc(row.date || '日期未记录')}${status.scannedMemoryIds.includes(row.id) ? ' · 已确认选材' : ''}</small></span></label>`;
        }).join('');
        root.querySelector('[data-cs-page]').textContent = `${page + 1} / ${Math.ceil(rows.length / pageSize)}`;
        root.querySelector('[data-cs-action="prev"]').disabled = page === 0;
        root.querySelector('[data-cs-action="next"]').disabled = (page + 1) * pageSize >= rows.length;
        root.querySelector('[data-cs-count]').textContent = `已勾选 ${selected.size} 条`;
    };
    const selectedIndexes = rows.map((row, index) => selected.has(row.id) ? index + 1 : 0).filter(Boolean);
    const savedLast = session?.generationMeta?.contentSelection?.last;
    const last = Array.isArray(savedLast?.memoryIds) ? { memoryIds: savedLast.memoryIds,
        added: Number.isSafeInteger(savedLast.added) && savedLast.added >= 0 ? savedLast.added : 0 } : null;
    const works = (session?.entries || session?.events || []).length;
    root.innerHTML = `<style>
        .rmt-content-selection{margin:0 0 16px;padding:14px;border:1px solid var(--rmt-theme-border,#ddd);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#333);text-align:left;min-width:0}
        .rmt-cs-head,.rmt-cs-actions,.rmt-cs-range{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .rmt-cs-head{justify-content:space-between}.rmt-cs-head small,.rmt-cs-row small{display:block;color:var(--rmt-theme-muted,#666);margin-top:4px}
        .rmt-content-selection p{font-size:13px;line-height:1.6;margin:8px 0}.rmt-content-selection summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:14px}
        .rmt-content-selection input[type=number]{width:80px;min-height:44px;font-size:16px;box-sizing:border-box;color:inherit;background:var(--rmt-theme-bg,#fff);border:1px solid var(--rmt-theme-border,#ddd);border-radius:8px;padding:6px}
        .rmt-content-selection .rmt-btn{min-height:44px;white-space:normal}.rmt-cs-row{display:flex;gap:10px;align-items:center;min-height:54px;padding:6px 0;border-bottom:1px solid var(--rmt-theme-border,#ddd);cursor:pointer}
        .rmt-cs-row input{width:20px;height:20px;flex:none}.rmt-cs-row span{min-width:0}.rmt-cs-row b{font-size:13px;overflow-wrap:anywhere}.rmt-cs-row small{font-size:12px}
        .rmt-cs-actions{margin-top:10px}.rmt-content-selection [data-cs-notice]{color:var(--rmt-theme-accent-ink,#845160)}
        @media(max-width:480px){.rmt-cs-head>button{width:100%}.rmt-content-selection{padding:12px}.rmt-cs-actions .rmt-btn{flex:1}}
    </style>
    <div class="rmt-cs-head"><div><b>已收录 ${works} ${mode === constants.MODE.ALBUM ? '张' : '篇'}</b><small>已确认选材 ${status.scannedMemoryIds.length} / ${rows.length} 条</small></div><button type="button" class="rmt-btn" data-rmt-generate-mode="${esc(mode)}"${session ? '' : ' data-rmt-reader-generation="true"'}>${session ? '继续补充' : '开始生成'}</button></div>
    <p data-cs-summary>${esc(selectionLabel())}</p>
    ${status.legacyUnknown ? '<p>旧作品已保留；旧版未准确记录选材进度，其余条目仍可选择。</p>' : ''}
    ${last ? `<p>上次选材 ${last.memoryIds.length} 条，新增 ${last.added} ${mode === constants.MODE.ALBUM ? '张' : '篇'}${last.added === 0 ? '；没有新增作品，可继续下一批' : ''}。</p>` : ''}
    <details data-cs-panel><summary>选择范围</summary><p>按当前档案条目顺序选择，也可以逐条勾选。选材数量不等于作品数量。</p>
      <div class="rmt-cs-range"><label>从 <input type="number" data-cs-start min="1" max="${rows.length}" value="${selectedIndexes[0] || 1}" aria-label="起始条目"></label><label>到 <input type="number" data-cs-end min="1" max="${rows.length}" value="${selectedIndexes.at(-1) || Math.min(rows.length, 48)}" aria-label="结束条目"></label><button type="button" class="rmt-btn" data-cs-action="range">勾选此范围</button></div>
      <details><summary>查看并勾选条目</summary><div data-cs-rows></div><div class="rmt-cs-actions"><button type="button" class="rmt-btn" data-cs-action="prev">上一页</button><span data-cs-page></span><button type="button" class="rmt-btn" data-cs-action="next">下一页</button></div><div class="rmt-cs-actions"><button type="button" class="rmt-btn" data-cs-action="all">全选</button><button type="button" class="rmt-btn" data-cs-action="none">清空选择</button></div></details>
      <p data-cs-count></p><div class="rmt-cs-actions"><button type="button" class="rmt-btn" data-cs-action="apply">应用选择</button><button type="button" class="rmt-btn" data-cs-action="auto">恢复自动选材</button></div>
    </details><p data-cs-notice role="status" aria-live="polite"></p>`;
    paintRows();
    root.addEventListener('input', event => {
        if (event.target.matches?.('[data-cs-start],[data-cs-end]')) { dirty = true; rangeDirty = true; notice('修改后请先勾选此范围，再应用选择。'); }
    });
    root.addEventListener('change', event => {
        if (!event.target.matches?.('[data-cs-row]')) return;
        const row = rows[Number(event.target.dataset.csRow)];
        if (!row) return;
        event.target.checked ? selected.add(row.id) : selected.delete(row.id);
        dirty = true; rangeDirty = false; paintRows(); notice('选择已修改，点击“应用选择”后生效。');
    });
    root.addEventListener('click', event => {
        const button = event.target.closest?.('button');
        if (!button || button.disabled) return;
        if (button.hasAttribute('data-rmt-generate-mode')) {
            if (!currentScope() || dirty) {
                event.preventDefault(); event.stopPropagation();
                notice(dirty ? '请先应用选择，或恢复自动选材。' : '档案已切换或更新，请重新打开此内容页。');
                root.querySelector('[data-cs-panel]').open = true;
            }
            return;
        }
        const action = button.dataset.csAction;
        if (!action) return;
        event.preventDefault(); event.stopPropagation();
        if (!currentScope()) { notice('档案已切换或更新，请重新打开此内容页。'); return; }
        if (action === 'prev' || action === 'next') { page += action === 'prev' ? -1 : 1; paintRows(); return; }
        if (action === 'range') {
            const start = Number(root.querySelector('[data-cs-start]').value), end = Number(root.querySelector('[data-cs-end]').value);
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > rows.length) { notice(`请输入 1～${rows.length} 之间的有效范围。`); return; }
            selected = new Set(rows.slice(start - 1, end).map(row => row.id)); page = Math.floor((start - 1) / pageSize); dirty = true; rangeDirty = false;
        } else if (action === 'all' || action === 'none') { selected = new Set(action === 'all' ? rows.map(row => row.id) : []); dirty = true; rangeDirty = false;
        } else if (action === 'auto') {
            request = selection.setContentSelectionRequest(context, bank, mode, null);
            selected = new Set(selection.createContentSelectionPlan(bank, session).memoryIds); dirty = false; rangeDirty = false;
            root.querySelector('[data-cs-summary]').textContent = selectionLabel(); notice('已恢复自动选材。');
        } else if (action === 'apply') {
            if (rangeDirty) { notice('请先点击“勾选此范围”，再应用选择。'); return; }
            try { request = selection.setContentSelectionRequest(context, bank, mode, [...selected]); }
            catch (error) { notice(error.message); return; }
            dirty = false; root.querySelector('[data-cs-summary]').textContent = selectionLabel();
            root.querySelector('[data-cs-panel]').open = false; notice('范围已应用；点击生成后使用，完成后恢复自动选材。');
        }
        paintRows();
        if (dirty) notice('选择已修改，点击“应用选择”后生效。');
    });
}
