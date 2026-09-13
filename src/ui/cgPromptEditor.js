import * as baiBai_characters from '../generation/baiBaiCharacters.js';
import * as image_rules from '../generation/imagePromptRules.js';
import * as image_viewer from './imageViewer.js';
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
    previous.prepareController?.abort();
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
    for (const input of editor.element.querySelectorAll('textarea, select, input')) input.disabled = active;
    for (const button of editor.element.querySelectorAll('[data-rmt-cg-prompt-action="reconceive"], [data-rmt-cg-prompt-action="draw"], [data-rmt-cg-prompt-action="clear"]')) button.disabled = active;
    editor.element.querySelector('[data-rmt-cg-prompt-action="draw"]').disabled = active || !editor.prepared;

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
        const savedImage = images.normalizeCgImageRecord(selected.cgImage);
        if (images.isCgImageDrawing(target.mode, target.itemId)) {
            globalThis.toastr?.info?.('请先等当前图片绘制完成，再编辑画面提示词。', '心迹回廊');
            return;
        }
        const host = document.getElementById(core_constants.OVERLAY_ID);
        const shell = host?.querySelector('.rmt-shell');
        if (!shell) return;
        closeCgPromptEditor({ restoreFocus: false });
        const draft = image_rules.imageSceneDescription(selected, target.mode);
        let appearance = null;
        const roles = core_context.currentCharacterGuard();
        try { appearance = baiBai_characters.readBaiBaiCharacters(); } catch {}
        // A public synchronous callback can still change the host selection.
        images.assertCgImageTargetCurrent(target);
        const choices = appearance?.characters.map((row, i) => `<option value="${i}">${core_text.esc(row.name)} · ${row.scope === 'chat' ? '当前聊天' : '全局'}</option>`).join('') || '';
        const element = document.createElement('div');
        element.className = 'rmt-cg-prompt-backdrop';
        element.innerHTML = `<section class="rmt-cg-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-cg-prompt-title" tabindex="-1">
          <div class="rmt-cg-prompt-head"><h2 id="rmt-cg-prompt-title">图片设置</h2><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="close" aria-label="关闭图片设置">关闭</button></div>
          <p class="rmt-cg-prompt-event">${core_text.esc(selected.title)}</p>
          <details class="rmt-cg-prompt-scene"><summary>查看这条回忆</summary><p>${core_text.esc(selected.cgDesc || selected.desc || selected.subtitle || '')}</p></details>
          <fieldset class="rmt-bbi-binding"><legend>使用柏宝绘角色库外貌</legend>
            <label>${core_text.esc(roles.name2 || '角色')}（{{char}}）<select data-rmt-bbi-char><option value="-1">不在画面中 / 不绑定</option>${choices}</select></label>
            <label>${core_text.esc(roles.name1 || '用户')}（{{user}}）<select data-rmt-bbi-user><option value="-1">不在画面中 / 不绑定</option>${choices}</select></label>
            <small>${appearance ? '直接使用柏宝绘已保存的外貌。双人画面请分别选择两人；历史场景请检查当时外貌是否不同。' : '公开角色库尚未准备好。请先在柏宝绘维护外貌，再重新打开本页。'}</small>
            <label class="rmt-bbi-unbound"><input type="checkbox" data-rmt-bbi-unbound>这张图不绑定角色库，仅依据下方画面描述</label>
          </fieldset>
          <label for="rmt-cg-prompt-input">画面描述（场景、动作与构图）</label>
          <textarea id="rmt-cg-prompt-input" data-rmt-cg-prompt-input rows="8" maxlength="${core_constants.MAX_CG_IMAGE_PROMPT_CHARS}" aria-describedby="rmt-cg-prompt-count"></textarea>
          <div id="rmt-cg-prompt-count" data-rmt-cg-prompt-count></div>
          <details class="rmt-image-prompt-preview" data-rmt-prompt-preview hidden><summary>查看整理后的画面提示词</summary><pre data-rmt-prompt-preview-text></pre></details>
          <p data-rmt-cg-prompt-status role="status" aria-live="polite"></p>
          <div class="rmt-cg-prompt-actions"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="reconceive">生成画面提示词</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="draw" disabled>${savedImage ? '确认并重绘' : '确认并绘图'}</button></div>
          ${savedImage ? `<div class="rmt-cg-prompt-secondary"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="view">查看完整原图</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="clear">${target.mode === core_constants.MODE.HEART ? '恢复文字版' : '恢复抽象图'}</button><small>仅移除本档案的图片引用，不删除柏宝绘图库文件。</small></div>` : ''}
        </section>`;
        const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); if (image_viewer.hasImageViewer()) image_viewer.closeImageViewer(); else closeCgPromptEditor(); };
        editor = { target, element, host, appearance, savedImage, userName: roles.name1, opener: document.activeElement, busy: false, cancel, prepared: null, binding: null, prepareController: null,
            taskKey: `cg-prompt:${core_context.chatScopeKey()}:${target.mode}:${core_text.safeId(target.itemId, 'cg')}` };
        const textarea = element.querySelector('[data-rmt-cg-prompt-input]');
        textarea.value = draft;
        if (appearance) {
            element.querySelector('[data-rmt-bbi-char]').value = String(baiBai_characters.uniqueBaiBaiCharacterIndex(appearance, roles.name2));
            // No implicit user appearance in a solo picture. Both roles stay independent.
            element.querySelector('[data-rmt-bbi-user]').value = '-1';
        }
        const updateCount = () => {
            element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${textarea.value.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
        };
        const invalidate = () => {
            editor.prepared = null;
            editor.binding = null;
            element.querySelector('[data-rmt-prompt-preview]').hidden = true;
            element.querySelector('[data-rmt-cg-prompt-action="draw"]').disabled = true;
            element.querySelector('[data-rmt-cg-prompt-status]').textContent = '修改后请重新生成画面提示词。';
        };
        textarea.addEventListener('input', () => { updateCount(); invalidate(); });
        element.addEventListener('change', event => {
            if (event.target.matches('select,input')) invalidate();
        });
        element.addEventListener('click', event => {
            event.stopPropagation();
            const action = event.target.closest?.('[data-rmt-cg-prompt-action]')?.dataset.rmtCgPromptAction;
            if (action) void handleCgPromptEditorAction(action);
        });
        element.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCgPromptEditor(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...element.querySelectorAll('button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled), summary, a[href]')];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
        host.addEventListener('cancel', cancel, true);
        shell.appendChild(element);
        updateCount();
        textarea.focus();
    } catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); }
}

export async function handleCgPromptEditorAction(action) {
    if (action === 'close') { closeCgPromptEditor(); return; }
    const current = editor;
    if (!current || current.busy) return;
    if (action === 'view') { if (current.savedImage) image_viewer.openImageViewer(current.savedImage.url); return; }
    try {
        images.assertCgImageTargetCurrent(current.target);
        if (action === 'clear') {
            busyEditor(true);
            if (current.target.mode === core_constants.MODE.HEART) await heart.clearHeartStripImage(current.target.itemId);
            else await images.clearSelectedCgImage();
            const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
            if (!images.normalizeCgImageRecord(item?.cgImage)) closeCgPromptEditor();
            return;
        }
        if (action === 'reconceive') {
            const value = current.element.querySelector('[data-rmt-cg-prompt-input]').value;
            if (value.length > image_rules.IMAGE_SCENE_MAX_CHARS) throw image_rules.imagePromptError('RMT_IMAGE_SCENE_INVALID');
            const unbound = current.element.querySelector('[data-rmt-bbi-unbound]').checked;
            const binding = unbound ? baiBai_characters.createUnboundBaiBaiAppearanceBinding(current.target.origin, current.userName)
                : baiBai_characters.createBaiBaiAppearanceBinding(current.appearance, [
                    Number(current.element.querySelector('[data-rmt-bbi-char]').value),
                    Number(current.element.querySelector('[data-rmt-bbi-user]').value),
                ], { origin: current.target.origin, userName: current.userName });
            if (!overlay.confirmExplicitAction('生成画面提示词？', '会使用心迹回廊设置的文字模型和已保存的提示词生成规则，只整理当前画面与所选外貌，不读取整份聊天或世界书。这一步不会生图；查看结果后再确认柏宝绘出图。', { destructive: false })) return;
            current.prepared = null;
            current.binding = null;
            current.element.querySelector('[data-rmt-prompt-preview]').hidden = true;
            current.prepareController = new AbortController();
            busyEditor(true);
            const plan = await images.prepareCgImagePrompt(current.target, {
                sceneDescription: value, appearanceBinding: binding, taskKey: current.taskKey,
                signal: current.prepareController.signal, isCurrent: () => editor === current,
            });
            if (editor !== current) return;
            current.prepared = plan;
            current.binding = binding;
            const details = current.element.querySelector('[data-rmt-prompt-preview]');
            details.querySelector('[data-rmt-prompt-preview-text]').textContent = [
                '场景标签\n' + plan.prompt, '画面说明\n' + plan.nl,
                ...plan.directions.map((row, i) => (binding.characters[i]?.name || '角色') + '\n' + row.actionTags + '\n' + row.actionNl),
            ].join('\n\n');
            details.hidden = false;
            details.open = true;
            current.element.querySelector('[data-rmt-cg-prompt-status]').textContent = '提示词已生成；确认画面后再绘图。';
            current.element.querySelector('[data-rmt-cg-prompt-action="reconceive"]').textContent = '重新整理提示词';
            return;
        }
        if (action === 'draw') {
            const preparedPromptPlan = images.assertPreparedImagePrompt(current.prepared, current.target, current.binding);
            busyEditor(true);
            const onAccepted = () => closeCgPromptEditor({ restoreFocus: false });
            const options = { expectedTarget: current.target, onAccepted, appearanceBinding: current.binding, preparedPromptPlan };
            if (current.target.mode === core_constants.MODE.HEART) await heart.drawHeartStripImage(current.target.itemId, options);
            else await images.drawSelectedCgImage(options);
        }
    } catch (error) {
        if (editor === current) {
            if (['RMT_IMAGE_PROMPT_CHANGED','RMT_CG_TARGET_CHANGED','BBI_BINDING'].includes(error?.code)) {
                current.prepared = null;
                current.element.querySelector('[data-rmt-prompt-preview]').hidden = true;
            }
            promptError(core_text.safeErrorSummary(error));
        }
    } finally {
        if (editor === current) busyEditor(false);
    }
}
