function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export const CALENDAR_PRINT_BLOCKS = Object.freeze(['calendar', 'holiday', 'memos', 'todos', 'special', 'mood']);

const CALENDAR_PRINT_BLOCK_LABELS = Object.freeze({
    calendar: '月份与当前日期概览', holiday: '贺卡', memos: '备忘', todos: '待办与已完成事项', special: '特别备注', mood: '页角随笔',
});

export function normalizeCalendarPrintSelection(selection = {}) {
    const supplied = Array.isArray(selection?.blocks) ? selection.blocks : CALENDAR_PRINT_BLOCKS;
    return {
        blocks: [...new Set(supplied.map(String).filter(value => CALENDAR_PRINT_BLOCKS.includes(value)))],
        includeImages: selection?.includeImages !== false,
        note: String(selection?.note ?? ''),
    };
}

export function calendarPrintSelectionPanelHtml({ counts = {}, imageCount = 0 } = {}) {
    const choices = CALENDAR_PRINT_BLOCKS.map(key => {
        const count = Math.max(0, Number(counts?.[key]) || 0);
        const available = key === 'calendar' || count > 0;
        return `<label><input type="checkbox" value="${key}" data-rmt-calendar-export-choice ${available ? 'checked' : 'disabled'}> <span>${esc(CALENDAR_PRINT_BLOCK_LABELS[key])}${key === 'calendar' ? '' : `（${count}）`}</span></label>`;
    }).join('');
    return `<section class="rmt-archive-card rmt-calendar-export-panel" data-rmt-calendar-export-panel hidden aria-label="选择本次打印内容">
      <header><div><small>PRINT / PDF</small><h3>选择本次导出内容</h3></div></header>
      <p>默认保留当前可见日期的全部已存内容。这里的选择和附言只用于本次打印，不会写回日历。</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px">${choices}</div>
      <label style="display:block;margin-top:10px"><input type="checkbox" data-rmt-calendar-export-images ${imageCount > 0 ? 'checked' : 'disabled'}> 包含图片 / 贺卡画面（${Math.max(0, Number(imageCount) || 0)}）</label>
      <label style="display:grid;gap:5px;margin-top:10px"><span>本次附言（仅加入导出稿）</span><textarea class="text_pole" rows="4" data-rmt-calendar-export-note placeholder="可留空；中文与换行会原样保留"></textarea></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="rmt-btn" data-rmt-calendar-export-confirm>打开打印 / 导出 PDF</button><button type="button" class="rmt-btn" data-rmt-calendar-export-cancel>取消</button></div>
    </section>`;
}

export function calendarPrintSelectionFromPanel(panel) {
    const blocks = [...(panel?.querySelectorAll?.('[data-rmt-calendar-export-choice]') || [])]
        .filter(input => input.checked === true && input.disabled !== true)
        .map(input => input.value);
    return normalizeCalendarPrintSelection({
        blocks,
        includeImages: panel?.querySelector?.('[data-rmt-calendar-export-images]')?.checked === true,
        note: panel?.querySelector?.('[data-rmt-calendar-export-note]')?.value ?? '',
    });
}

export function calendarPrintNoteHtml(note) {
    const value = String(note ?? '');
    return value ? `<section class="rmt-calendar-print-note"><small>本次导出附言</small><p>${esc(value)}</p></section>` : '';
}

export function calendarPrintDocument({ title = '两个人的日历', label = '当前日期', contentHtml = '' } = {}) {
    const safeTitle = esc(String(title).slice(0, 160));
    const safeLabel = esc(String(label).slice(0, 160));
    // contentHtml is a cloned, already-rendered local calendar subtree. It is not
    // provider output and is never written back to the saved session.
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} · ${safeLabel}</title><style>
@page{size:auto;margin:12mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#27313b;font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif;font-size:10.5pt;line-height:1.55}.rmt-calendar-print-head{display:flex;justify-content:space-between;gap:16px;align-items:end;padding-bottom:8mm;margin-bottom:7mm;border-bottom:1px solid #9ba8b5}.rmt-calendar-print-head h1{margin:0;font-size:20pt}.rmt-calendar-print-head p,.rmt-calendar-print-status{margin:0;color:#596774}.rmt-calendar-print-manual{margin-top:4mm;padding:2mm 4mm;border:1px solid #7c8b98;border-radius:2mm;background:#fff;color:#27313b;font:inherit;cursor:pointer}.rmt-calendar-shell{max-width:100%;margin:0}.rmt-calendar-hero,.rmt-calendar-paper,.rmt-calendar-notebook-board,.rmt-calendar-special-notes,.rmt-calendar-mood-section,.rmt-calendar-holiday-section,.rmt-calendar-print-note{break-inside:avoid;page-break-inside:avoid;margin:0 0 7mm}.rmt-calendar-hero{display:flex;justify-content:space-between;gap:12mm}.rmt-calendar-counts{display:flex;gap:5mm;white-space:nowrap}.rmt-calendar-paper,.rmt-calendar-sticky-panel,.rmt-calendar-master-todo,.rmt-calendar-special-notes,.rmt-calendar-mood-section,.rmt-calendar-holiday-section,.rmt-calendar-print-note{border:1px solid #c7d0d7;border-radius:4mm;padding:5mm;background:#fff}.rmt-calendar-print-note p{margin:2mm 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.rmt-calendar-month-head{display:flex;justify-content:space-between;align-items:center}.rmt-calendar-weekdays,.rmt-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1.5mm}.rmt-calendar-weekdays{margin-top:4mm;font-weight:700;text-align:center}.rmt-calendar-day{display:block;min-height:18mm;padding:2mm;border:1px solid #d7dfe4;border-radius:2mm;overflow:hidden}.rmt-calendar-day-number{display:block;font-weight:700}.rmt-calendar-day-title{display:block;font-size:8pt;overflow-wrap:anywhere}.rmt-calendar-day-dots i{display:inline-block;width:2.5mm;height:2.5mm;margin-right:1mm;border-radius:50%;background:#9da8af}.rmt-calendar-day-dots i.past{background:#7ea899}.rmt-calendar-day-dots i.promised{background:#c88991}.rmt-calendar-day-dots i.future{background:#8ea8c7}.rmt-calendar-notebook-board{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.rmt-calendar-sticky-grid,.rmt-calendar-mood-grid,.rmt-calendar-holiday-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(48mm,1fr));gap:4mm}.rmt-calendar-sticky,.rmt-calendar-mood-note,.rmt-calendar-holiday-card{border:1px solid #d1d9df;padding:4mm;border-radius:2mm;break-inside:avoid;page-break-inside:avoid}.rmt-calendar-sticky p,.rmt-calendar-mood-note p,.rmt-calendar-holiday-message,.rmt-calendar-holiday-calligraphy,.rmt-calendar-master-todo-row b,.rmt-calendar-master-todo-row small{white-space:pre-wrap}.rmt-calendar-master-todo-row{display:flex;gap:3mm;padding:2.5mm 0;border-bottom:1px solid #e2e7eb}.rmt-calendar-master-check{font-size:13pt}.rmt-calendar-selected-strip,.rmt-calendar-legend,.rmt-calendar-pending{margin-top:4mm}.rmt-calendar-jumps,.rmt-calendar-filter,.rmt-calendar-pending>div{display:flex;gap:2mm;flex-wrap:wrap}.rmt-calendar-jump,.rmt-calendar-selected-chip{display:inline-block;padding:1mm 2mm;border:1px solid #ccd6dc;border-radius:99px;font-size:8pt}.rmt-calendar-board-empty{color:#73818d;font-style:italic}.rmt-calendar-holiday-card svg,svg.rmt-calendar-holiday-art{display:block;width:100%;max-width:100%;height:auto;aspect-ratio:auto}.rmt-calendar-holiday-card img,img{display:block;width:auto;max-width:100%;height:auto;object-fit:contain}@media print{.rmt-calendar-filter,[data-rmt-calendar-print],.rmt-calendar-jumps,.rmt-calendar-pending,.rmt-calendar-print-manual,.rmt-calendar-print-status{display:none!important}.rmt-calendar-shell{width:100%}.rmt-calendar-paper{break-before:auto}.rmt-calendar-grid{gap:1mm}.rmt-calendar-day{min-height:16mm;padding:1.5mm}}
</style></head><body><header class="rmt-calendar-print-head"><div><p>RELATIONSHIP CALENDAR · 已保存内容</p><h1>${safeTitle}</h1></div><p>${safeLabel}</p></header><p class="rmt-calendar-print-status" data-rmt-calendar-print-status>正在准备字体和图片…</p><button type="button" class="rmt-calendar-print-manual" data-rmt-calendar-print-manual hidden>手动打开打印</button>${contentHtml}</body></html>`;
}

export function calendarPrintContentFromRoot(root, selection = {}) {
    if (!root?.cloneNode || !root?.querySelectorAll || !root?.ownerDocument) return '';
    const normalized = normalizeCalendarPrintSelection(selection);
    const selected = new Set(normalized.blocks);
    const clone = root.cloneNode(true);
    clone.querySelectorAll('[data-rmt-calendar-print], [data-rmt-calendar-shift], [data-rmt-calendar-month], [data-rmt-calendar-tag], [data-rmt-calendar-tag-clear]').forEach(node => node.remove());
    clone.querySelectorAll('[data-rmt-calendar-export-block]').forEach(node => {
        if (!selected.has(String(node.getAttribute?.('data-rmt-calendar-export-block') || ''))) node.remove();
    });
    clone.querySelectorAll('[data-rmt-calendar-export-group]').forEach(node => {
        if (!node.querySelector?.('[data-rmt-calendar-export-block]')) node.remove();
    });
    if (!normalized.includeImages) clone.querySelectorAll('img, svg, picture').forEach(node => node.remove());
    clone.querySelectorAll('button').forEach(button => {
        const label = root.ownerDocument.createElement('span');
        label.className = button.className;
        label.innerHTML = button.innerHTML;
        button.replaceWith(label);
    });
    clone.querySelectorAll('input[type="checkbox"]').forEach(input => {
        const marker = root.ownerDocument.createElement('span');
        marker.className = 'rmt-calendar-master-check';
        marker.textContent = input.checked ? '✓' : '□';
        input.replaceWith(marker);
    });
    const noteHtml = calendarPrintNoteHtml(normalized.note);
    if (noteHtml) clone.insertAdjacentHTML?.('beforeend', noteHtml);
    return clone.outerHTML;
}

export function waitForCalendarPrintAssets(documentRef, timeoutMs = 10000) {
    const fonts = documentRef?.fonts?.ready && typeof documentRef.fonts.ready.then === 'function'
        ? documentRef.fonts.ready : Promise.resolve();
    const images = [...(documentRef?.images || [])].map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        });
    });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('字体或图片尚未加载完成，可稍候手动打印。')), timeoutMs);
        Promise.all([fonts, ...images]).then(result => { clearTimeout(timer); resolve(result); }, error => { clearTimeout(timer); reject(error); });
    });
}

function showManualPrint(popup, message) {
    const documentRef = popup?.document;
    const status = documentRef?.querySelector?.('[data-rmt-calendar-print-status]');
    const button = documentRef?.querySelector?.('[data-rmt-calendar-print-manual]');
    if (status) status.textContent = message;
    if (button) {
        button.hidden = false;
        button.addEventListener?.('click', () => {
            try { popup.focus?.(); popup.print?.(); }
            catch (error) { if (status) status.textContent = `无法打开系统打印：${error?.message || '请使用浏览器菜单打印。'}`; }
        }, { once: false });
    }
}

export function printCalendarSelection({ session, label = '当前日期', root = null, selection = {}, opener = globalThis.window } = {}) {
    const contentHtml = calendarPrintContentFromRoot(root, selection);
    if (!contentHtml || !opener?.open) return { opened: false, reason: 'print-source-unavailable' };
    const popup = opener.open('', '_blank');
    if (!popup?.document) return { opened: false, reason: 'print-window-blocked' };
    const html = calendarPrintDocument({ title: session?.title || '两个人的日历', label, contentHtml });
    let started = false;
    const runWhenReady = () => {
        if (started) return;
        started = true;
        waitForCalendarPrintAssets(popup.document).then(() => {
            const status = popup.document?.querySelector?.('[data-rmt-calendar-print-status]');
            showManualPrint(popup, '内容已就绪。若系统打印没有打开，请点“手动打开打印”。');
            try {
                popup.focus?.();
                if (typeof popup.print !== 'function') throw new Error('当前浏览器未提供打印接口。');
                popup.print();
            } catch (error) {
                showManualPrint(popup, `自动打开打印失败：${error?.message || '请手动打印。'}`);
            }
        }).catch(error => showManualPrint(popup, `准备打印失败：${error?.message || '请手动打印。'}`));
    };
    if (typeof popup.addEventListener === 'function') popup.addEventListener('load', runWhenReady, { once: true });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    if (popup.document.readyState === 'complete') runWhenReady();
    else if (typeof popup.addEventListener !== 'function') globalThis.setTimeout?.(runWhenReady, 0);
    return { opened: true };
}
