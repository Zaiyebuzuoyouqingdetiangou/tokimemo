// One local editor shared by Album, shared memories, ADV and daily comic CGs.
// Drafts are intentionally ephemeral: reconceiving never writes a session or draws.
import * as archive_library from '../archive/library.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as images from '../generation/imageGeneration.js';
import * as heart from './heartView.js';
import * as overlay from './overlay.js';

let editor = null;

export function hasCgPromptEditor() { return !!editor?.element?.isConnected; }

export function closeCgPromptEditor({ restoreFocus = true } = {}) {
    const previous = editor;
    if (!previous) return;
    editor = null;
    const task = runtimeState.activeGenerationTasks.get(previous.taskKey);
    if (task?.origin === previous.target.origin) task.controller?.abort();
    previous.host.removeEventListener('cancel', previous.cancel, true);
    previous.element.remove();
    if (restoreFocus && previous.opener?.isConnected) previous.opener.focus();
}

function promptError(message) {
    if (!editor) return;
    const status = editor.element.querySelector('[data-rmt-cg-prompt-status]');
    status.textContent = message;
    status.setAttribute('role', 'alert');
}

function busyEditor(active) {
    if (!editor) return;
    editor.busy = active;
    editor.element.setAttribute('aria-busy', String(active));
    editor.element.querySelector('[data-rmt-cg-prompt-input]').disabled = active;
    for (const button of editor.element.querySelectorAll('[data-rmt-cg-prompt-action="reconceive"], [data-rmt-cg-prompt-action="draw"]')) button.disabled = active;
}

export function openCgPromptEditor({ heartStrip = false } = {}) {
    try {
        if (!archive_library.requireWritableArchiveAction()) return;
        const item = heartStrip ? heart.selectedHeartStrip() : null;
        const rawTarget = heartStrip && item
            ? { mode: core_constants.MODE.HEART, session: runtimeState.activeSession, item }
            : images.selectedCgTarget();
        const target = images.captureCgImageTarget(rawTarget);
        images.assertCgImageTargetCurrent(target);
        const selected = images.cgItemInSession(target.mode, target.session, target.itemId);
        if (images.isCgImageDrawing(target.mode, target.itemId)) {
            globalThis.toastr?.info?.('请先等当前图片绘制完成，再编辑画面提示词。', '心跳回忆');
            return;
        }
        const host = document.getElementById(core_constants.OVERLAY_ID);
        const shell = host?.querySelector('.rmt-shell');
        if (!shell) return;
        closeCgPromptEditor({ restoreFocus: false });
        const draft = target.mode === core_constants.MODE.HEART ? heart.heartStripImagePrompt(selected) : images.cgImagePromptForItem(selected);
        const element = document.createElement('div');
        element.className = 'rmt-cg-prompt-backdrop';
        element.innerHTML = `<section class="rmt-cg-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-cg-prompt-title" aria-describedby="rmt-cg-prompt-help" tabindex="-1">
          <div class="rmt-cg-prompt-head"><h2 id="rmt-cg-prompt-title">画面提示词</h2><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="close" aria-label="关闭画面提示词">关闭</button></div>
          <p class="rmt-cg-prompt-event">${core_text.esc(selected.title)}</p>
          <details class="rmt-cg-prompt-scene"><summary>查看这条回忆</summary><p>${core_text.esc(selected.cgDesc || selected.desc || selected.subtitle || '')}</p></details>
          <label for="rmt-cg-prompt-input">将发送给生图插件的画面描述</label>
          <textarea id="rmt-cg-prompt-input" data-rmt-cg-prompt-input rows="8" maxlength="${core_constants.MAX_CG_IMAGE_PROMPT_CHARS}" aria-describedby="rmt-cg-prompt-help rmt-cg-prompt-count"></textarea>
          <div id="rmt-cg-prompt-count" data-rmt-cg-prompt-count></div>
          <p id="rmt-cg-prompt-help">编辑和重新构思都不会自动生图。确认绘图后才消耗生图额度；只有新图成功保存，才会替换原图与提示词。关闭会放弃本次草稿。</p>
          <p data-rmt-cg-prompt-status role="status" aria-live="polite"></p>
          <div class="rmt-cg-prompt-actions"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="reconceive">重新构思画面</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="draw">确认提示词并绘图</button></div>
        </section>`;
        const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); closeCgPromptEditor(); };
        editor = { target, element, host, opener: document.activeElement, busy: false, cancel,
            taskKey: `cg-prompt:${core_context.chatScopeKey()}:${target.mode}:${core_text.safeId(target.itemId, 'cg')}` };
        const textarea = element.querySelector('[data-rmt-cg-prompt-input]');
        textarea.value = draft;
        const updateCount = () => {
            element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${textarea.value.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
        };
        textarea.addEventListener('input', updateCount);
        element.addEventListener('click', event => {
            event.stopPropagation();
            const action = event.target.closest?.('[data-rmt-cg-prompt-action]')?.dataset.rmtCgPromptAction;
            if (action) void handleCgPromptEditorAction(action);
        });
        element.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCgPromptEditor(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...element.querySelectorAll('button:not(:disabled), textarea:not(:disabled), summary')];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
        host.addEventListener('cancel', cancel, true);
        shell.appendChild(element);
        updateCount();
        textarea.focus();
    } catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心跳回忆'); }
}

export async function handleCgPromptEditorAction(action) {
    if (action === 'close') { closeCgPromptEditor(); return; }
    const current = editor;
    if (!current || current.busy) return;
    try {
        images.assertCgImageTargetCurrent(current.target);
        if (action === 'reconceive') {
            if (!overlay.confirmExplicitAction('重新构思这张回忆的画面？',
                '会使用缘侧的独立 API 消耗一次文本生成额度，只依据这条回忆的场景资料整理画面。结果先放入编辑框，不会立即生图，也不会改写回忆或原图。', { destructive: false })) return;
            images.assertCgImageTargetCurrent(current.target);
            busyEditor(true);
            const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
            status.setAttribute('role', 'status'); status.textContent = '正在重新构思，请稍等…';
            const result = await images.reconceiveCgImagePrompt(current.target);
            if (editor !== current || !current.element.isConnected) return;
            const textarea = current.element.querySelector('[data-rmt-cg-prompt-input]');
            textarea.value = result;
            current.element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${result.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
            status.textContent = '新提示词已放入编辑框。检查人物、地点和动作后，再确认绘图。';
            return;
        }
        if (action === 'draw') {
            const value = current.element.querySelector('[data-rmt-cg-prompt-input]').value;
            if (value.length > core_constants.MAX_CG_IMAGE_PROMPT_CHARS) throw core_text.safeUserError('画面提示词超过字数上限，请缩短后再绘图。');
            const prompt = images.sanitizeCgVisualText(value);
            if (!prompt) throw core_text.safeUserError('请先写入可用的画面提示词。');
            images.assertCgImageTargetCurrent(current.target);
            busyEditor(true);
            // Existing drawing flow owns the explicit cost/replacement confirmation,
            // provider lock and durable commit; this editor never invokes a provider.
            const onAccepted = () => closeCgPromptEditor({ restoreFocus: false });
            if (current.target.mode === core_constants.MODE.HEART) {
                await heart.drawHeartStripImage(current.target.itemId, { promptOverride: prompt, expectedTarget: current.target, onAccepted });
            } else await images.drawSelectedCgImage({ promptOverride: prompt, expectedTarget: current.target, onAccepted });
        }
    } catch (error) {
        if (editor === current) promptError(core_text.safeErrorSummary(error));
    } finally {
        if (editor === current) busyEditor(false);
    }
}
