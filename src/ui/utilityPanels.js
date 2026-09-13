// Read-only help and exportable diagnosis; opening never hydrates archives or calls providers.
import * as diagnostics from '../core/generationDiagnostics.js';

const HELP = Object.freeze({
    'import-memory': ['增量更新当前档案', '只整理新增聊天和已变化的记忆来源，保留已有记忆编号与兼容的已生成内容。需要文本 API。检测到旧消息被修改时会停止，不会自动完全重建。'],
    'full-rebuild-memory': ['完全重建档案', '从当前窗口重新整理全部可用来源，会重新编号，并清除依赖旧档案的 CG、ADV、房间等派生内容。不是普通更新。请先备份，执行仍需两次确认；不会删除酒馆聊天正文。'],
    'current-archive-delete': ['删除当前档案', '删除本插件在当前聊天中的正式档案及派生内容，保留删除栅栏；不会删除酒馆正文或第三方记忆。需要两次确认。'],
    'rewrite-archive-verdict': ['重写简介', '只重写封面简介，消耗文本 API；不更新聊天记忆，不重建档案，也不删除已生成内容。'],
    'regenerate': ['增量追加', '基于已归档内容增加新片段，不等于扫描新聊天。要收录新聊天，请先增量更新档案。会消耗对应 API。'],
    'manage': ['内容管理', '可删除或重新生成分类及其子项。重新生成会调用 API；只有新内容通过校验才替换旧项，删除和覆盖仍需两次确认。'],
    'read-memory-plugins': ['扫描记忆 / 摘要', '通过已登记的公开接口读取当前窗口记忆，不替第三方插件生成摘要，也不等于完成归档。千千结需先加载好当前摘要；扫描后再增量更新档案。'],
});
let activePanel = null;
export function closeUtilityPanel() {
    const previous = activePanel;
    if (!previous) return;
    activePanel = null;
    try { previous.node.close?.(); } catch {}
    previous.node.remove();
    if (previous.opener?.isConnected) previous.opener.focus?.();
}
function panel(title) {
    closeUtilityPanel();
    const node = document.createElement(typeof HTMLDialogElement === 'function' ? 'dialog' : 'div');
    node.className = 'rmt-utility-panel';
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', title);
    node.innerHTML = `<style>.rmt-utility-panel{box-sizing:border-box;width:min(92vw,640px);max-height:85dvh;overflow:auto;border:1px solid #9ca9bf;border-radius:16px;background:#fff;color:#25344a;padding:20px;z-index:2147483647;font:16px/1.7 system-ui}.rmt-utility-panel:not(dialog){position:fixed;inset:6vh auto auto 4vw}.rmt-utility-panel::backdrop{background:#0008}.rmt-utility-panel button{font:inherit;min-height:44px;min-width:72px;padding:8px 14px;border:1px solid #bbcbd8;border-radius:20px;background:#f4f8fc;color:#25344a;text-align:center;cursor:pointer}.rmt-utility-panel .rmt-utility-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.rmt-utility-panel h2{font-size:20px;margin:0}.rmt-utility-panel pre,.rmt-utility-panel textarea{box-sizing:border-box;width:100%;white-space:pre-wrap;overflow-wrap:anywhere;max-height:48vh;overflow:auto;background:#f5f7fb;color:#25344a;font:13px/1.7 monospace;padding:10px}.rmt-utility-panel p{margin:14px 0}.rmt-utility-panel .rmt-utility-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}</style><div class="rmt-utility-head"><h2></h2><button type="button" data-close>关闭</button></div><div data-content></div>`;
    node.querySelector('h2').textContent = title;
    const opener = document.activeElement;
    node.querySelector('[data-close]').addEventListener('click', closeUtilityPanel);
    node.addEventListener('cancel', event => { event.preventDefault(); closeUtilityPanel(); });
    node.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeUtilityPanel(); }
        if (event.key !== 'Tab') return;
        const controls = [...node.querySelectorAll('button, textarea')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.appendChild(node); activePanel = { node, opener };
    if (typeof node.showModal === 'function') node.showModal();
    node.querySelector('[data-close]').focus();
    return node.querySelector('[data-content]');
}
export function operationHelpButton(action) {
    if (!Object.hasOwn(HELP, action)) return '';
    return `<button type="button" class="rmt-operation-help" data-rmt-help="${action}" aria-label="${HELP[action][0]}说明" title="${HELP[action][0]}说明">?</button>`;
}
export function showOperationHelp(action) {
    if (!Object.hasOwn(HELP, action)) return;
    const value = HELP[action];
    const body = panel(value[0]);
    const p = document.createElement('p'); p.textContent = value[1]; body.appendChild(p);
}
export function openGenerationDiagnostics() {
    const body = panel('生成诊断');
    body.innerHTML = '<p>只记录本页最近30次安全错误码。不含聊天、提示词、人物资料、密钥、地址或响应正文；部分异常可能已在重试后恢复。</p><pre tabindex="0" data-report></pre><div class="rmt-utility-actions"><button type="button" data-refresh>刷新</button><button type="button" data-copy>复制报告</button><button type="button" data-clear>清空</button></div><p role="status" data-status></p>';
    const pre = body.querySelector('[data-report]');
    const refresh = () => {
        pre.textContent = JSON.stringify(diagnostics.generationDiagnosticReport(), null, 2);
        body.querySelector('[data-status]').textContent = diagnostics.generationDiagnosticReport().records.length ? '可把这份去敏报告发给作者。' : '本页暂无已记录异常；请复现一次后再刷新。';
    };
    body.querySelector('[data-refresh]').addEventListener('click', refresh);
    body.querySelector('[data-clear]').addEventListener('click', () => { diagnostics.clearGenerationDiagnostics(); refresh(); });
    body.querySelector('[data-copy]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(pre.textContent); body.querySelector('[data-status]').textContent = '已复制去敏报告。'; }
        catch { const range = document.createRange(); range.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); body.querySelector('[data-status]').textContent = '无法自动复制，已选中报告，请长按复制。'; }
    });
    refresh();
}
