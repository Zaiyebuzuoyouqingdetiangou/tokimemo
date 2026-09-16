import * as cg_format_ui from './cgFormatControl.js';
import * as cg_format from '../core/cgPromptFormat.js';
import * as settings from '../core/settings.js';
// One local editor shared by Album, shared memories, ADV and daily comic CGs.
// Drafts are intentionally ephemeral: reconceiving never writes a session or draws.
import * as archive_library from '../archive/library.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as cast_looks from '../core/castLooks.js';
import * as images from '../generation/imageGeneration.js';
import * as appearance from '../generation/cgAppearance.js';
import * as image_viewer from './cgImageViewer.js';
import * as heart from './heartView.js';
import * as overlay from './overlay.js';

let editor = null;

export function hasCgPromptEditor() { return !!editor?.element?.isConnected; }

export function closeCgPromptEditor({ restoreFocus = true } = {}) {
    image_viewer.closeCgImageViewer({ restoreFocus: false });
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
    for (const field of editor.element.querySelectorAll('[data-rmt-cg-prompt-input], [data-rmt-cg-scene-tags], [data-rmt-cg-tag-input], [data-rmt-cg-flat-prompt], [data-rmt-cg-editor-format]')) field.disabled = active;
    for (const button of editor.element.querySelectorAll('[data-rmt-cg-prompt-action="reconceive"], [data-rmt-cg-prompt-action="draw"], [data-rmt-cg-prompt-action="clear"], [data-rmt-cg-prompt-action="retry"], [data-rmt-cg-prompt-action="save-looks"]')) button.disabled = active;
}

function editorMetadata(current) {
    return appearance.normalizeCgPromptMetadata({
        promptFormat: current.promptFormat,
        sceneTags: current.element.querySelector('[data-rmt-cg-scene-tags]').value,
        flatPrompt: current.element.querySelector('[data-rmt-cg-flat-prompt]').value,
        characters: ['char', 'user'].map(role => ({ role, name: current.characterNames[role],
            tag: current.element.querySelector(`[data-rmt-cg-tag-input="${role}"]`).value,
            // All sendable appearance is visible/editable in tag. A stale model nl
            // must not silently override the user's subsequent tag edits.
            nl: '' })),
    });
}

function updatePreparedPreview(current) {
    const scene = current.element.querySelector('[data-rmt-cg-prompt-input]').value;
    const metadata = editorMetadata(current);
    const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
    const output = current.element.querySelector('[data-rmt-cg-send-preview]');
    try {
        const sent = images.cgEditorSendPreview(current.target.mode, item, scene, metadata, current.promptFormat);
        output.value = sent ? `prompt:\n${sent.prompt}\n\nnl:\n${sent.nl}` + (sent.characters?.length ? `\n\n人物标签：\n${sent.characters.map(row => `${row.name}: ${row.tag}`).join('\n')}` : '') : scene;
    } catch (error) { output.value = core_text.safeErrorSummary(error); }
}

function invalidateFlatPrompt(current) {
    const flat = current.element.querySelector('[data-rmt-cg-flat-prompt]');
    if (!flat.value) return;
    flat.value = '';
    const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
    status.setAttribute('role', 'status');
    status.textContent = '画面或标签已修改，旧通用提示已清空。可手动补全，或重新构思后核对。';
}

function invalidateSceneMetadata(current) {
    fillEditorMetadata(current, appearance.metadataAfterSceneEdit(editorMetadata(current)));
    const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
    status.setAttribute('role', 'status');
    status.textContent = '画面已修改，旧场景标签与通用提示已清空。';
}

function fillEditorMetadata(current, raw) {
    const metadata = appearance.normalizeCgPromptMetadata(raw);
    current.element.querySelector('[data-rmt-cg-scene-tags]').value = metadata?.sceneTags || '';
    current.element.querySelector('[data-rmt-cg-flat-prompt]').value = metadata?.flatPrompt || '';
    for (const role of ['char', 'user']) {
        const character = metadata?.characters.find(row => row.role === role);
        if (character?.name) current.characterNames[role] = character.name;
        current.element.querySelector(`[data-rmt-cg-tag-name="${role}"]`).textContent =
            `${current.characterNames[role] || (role === 'char' ? '角色' : '用户')} · 外貌 tag`;
        current.element.querySelector(`[data-rmt-cg-tag-input="${role}"]`).value = character?.tag || '';
    }
    updatePreparedPreview(current);
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
        const promptFormat = cg_format.normalizeCgPromptFormat(savedImage?.promptMetadata?.promptFormat, settings.getPluginSettings().cgPromptFormat);
        const draft = images.cgImagePromptForItem(selected, '', promptFormat);
        const context = core_context.currentCharacterGuard();
        const canRetry = images.hasPendingCgImage(target);
        const element = document.createElement('div');
        element.className = 'rmt-cg-prompt-backdrop';
        element.innerHTML = `<section class="rmt-cg-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-cg-prompt-title" aria-describedby="rmt-cg-prompt-help" tabindex="-1">
          <div class="rmt-cg-prompt-head"><h2 id="rmt-cg-prompt-title">图片设置</h2><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="close" aria-label="关闭图片设置">关闭</button></div>
          <p class="rmt-cg-prompt-event">${core_text.esc(selected.title)}</p>
          <label class="rmt-cg-format"><span>生图提示词格式</span><select data-rmt-cg-editor-format aria-label="当前图片提示词格式">${cg_format_ui.cgFormatOptions(promptFormat)}</select><small>切换不发请求；旧提示请重新构思或手动转换。实际模型在生图插件中选择。</small></label>
          <details class="rmt-cg-prompt-scene"><summary>查看这条回忆</summary><p>${core_text.esc(selected.cgDesc || selected.desc || selected.subtitle || '')}</p></details>
          <label for="rmt-cg-prompt-input">将发送给生图插件的画面描述</label>
          <textarea id="rmt-cg-prompt-input" data-rmt-cg-prompt-input rows="8" maxlength="${core_constants.MAX_CG_IMAGE_PROMPT_CHARS}" aria-describedby="rmt-cg-prompt-help rmt-cg-prompt-count"></textarea>
          <div id="rmt-cg-prompt-count" data-rmt-cg-prompt-count></div>
          <details class="rmt-cg-prompt-scene" data-rmt-cg-appearance>
            <summary>人物外貌与场景标签</summary>
            <p><label for="rmt-cg-char-tags" data-rmt-cg-tag-name="char">角色 · 外貌 tag</label><textarea id="rmt-cg-char-tags" data-rmt-cg-tag-input="char" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" placeholder="重新构思时提取，或手动填写"></textarea></p>
            <p><label for="rmt-cg-user-tags" data-rmt-cg-tag-name="user">用户 · 外貌 tag</label><textarea id="rmt-cg-user-tags" data-rmt-cg-tag-input="user" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" placeholder="重新构思时提取，或手动填写"></textarea></p>
            <button type="button" class="rmt-btn" data-rmt-cg-prompt-action="save-looks">保存外貌</button>
            <p><label for="rmt-cg-scene-tags">场景 tag</label><textarea id="rmt-cg-scene-tags" data-rmt-cg-scene-tags rows="2" maxlength="${appearance.CG_SCENE_TAG_LIMIT}" placeholder="人物动作、场景与构图"></textarea></p>
            <p><label for="rmt-cg-flat-prompt">通用后端完整提示</label><textarea id="rmt-cg-flat-prompt" data-rmt-cg-flat-prompt rows="4" maxlength="${appearance.CG_FLAT_PROMPT_LIMIT}" placeholder="包含双方外貌、动作与场景的完整英文提示"></textarea></p>
          </details>
          <details class="rmt-cg-prompt-scene"><summary>发送预览</summary><p><textarea data-rmt-cg-send-preview aria-label="将发送的场景与人物外貌" rows="5" readonly></textarea></p></details>
          <p id="rmt-cg-prompt-help">保存外貌不生图，供本聊天后续新图使用。关闭仅放弃未保存的草稿；确认绘图后才消耗生图额度。</p>
          <p data-rmt-cg-prompt-status role="status" aria-live="polite"></p>
          <div class="rmt-cg-prompt-actions"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="reconceive">重新构思／提取外貌</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="draw">${savedImage ? '确认提示词并重绘' : '确认提示词并绘图'}</button></div>
          ${canRetry ? '<div class="rmt-cg-prompt-secondary"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="retry">回填已生成图片（不再生图）</button></div>' : ''}
          ${savedImage ? `<div class="rmt-cg-prompt-secondary"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="view">查看完整原图</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="clear">${target.mode === core_constants.MODE.HEART ? '恢复文字版' : '恢复抽象图'}</button><small>仅移除本档案的图片引用，不删除柏宝绘图库文件。</small></div>` : ''}
        </section>`;
        const cancel = event => {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!image_viewer.closeCgImageViewer()) closeCgPromptEditor();
        };
        editor = { target, element, host, promptFormat, opener: document.activeElement, busy: false, cancel,
            looksSignature: cast_looks.castLooksSignature(cast_looks.readCastLooks(context)),
            characterNames: { char: core_text.normalizeText(context.name2, 120), user: core_text.normalizeText(context.name1, 120) },
            taskKey: `cg-prompt:${core_context.chatScopeKey()}:${target.mode}:${core_text.safeId(target.itemId, 'cg')}` };
        const current = editor;
        const textarea = element.querySelector('[data-rmt-cg-prompt-input]');
        textarea.value = draft;
        const updateCount = () => {
            element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${textarea.value.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
            updatePreparedPreview(current);
        };
        element.querySelector('[data-rmt-cg-editor-format]').addEventListener('change', event => {
            event.stopPropagation();
            if (current.busy) return;
            current.promptFormat = cg_format.normalizeCgPromptFormat(event.target.value, current.promptFormat);
            // A style switch is not a conversion or a draw. Keep visible authored
            // scene/looks and invalidate dependent fields only in this draft.
            fillEditorMetadata(current, appearance.metadataAfterSceneEdit(editorMetadata(current)));
            const status = element.querySelector('[data-rmt-cg-prompt-status]');
            status.textContent = '格式已切换，未发请求。请重新构思或手动转换并核对发送预览。';
        });
        textarea.addEventListener('input', () => { invalidateSceneMetadata(current); updateCount(); });
        for (const field of element.querySelectorAll('[data-rmt-cg-tag-input], [data-rmt-cg-scene-tags]')) {
            field.addEventListener('input', () => { invalidateFlatPrompt(current); updatePreparedPreview(current); });
        }
        element.querySelector('[data-rmt-cg-flat-prompt]').addEventListener('input', () => updatePreparedPreview(current));
        fillEditorMetadata(current, appearance.initialCgAppearanceMetadata(selected, context));
        element.addEventListener('click', event => {
            event.stopPropagation();
            const action = event.target.closest?.('[data-rmt-cg-prompt-action]')?.dataset.rmtCgPromptAction;
            if (action) void handleCgPromptEditorAction(action);
        });
        element.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCgPromptEditor(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...element.querySelectorAll('button:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]')];
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
    try {
        images.assertCgImageTargetCurrent(current.target);
        if (action === 'retry') {
            busyEditor(true);
            const saved = await images.retryPendingCgImage(current.target);
            if (saved && editor === current) closeCgPromptEditor();
            return;
        }
        if (action === 'save-looks') {
            busyEditor(true);
            const record = cast_looks.saveConfirmedCastLooks({
                char: current.element.querySelector('[data-rmt-cg-tag-input="char"]').value,
                user: current.element.querySelector('[data-rmt-cg-tag-input="user"]').value,
            }, { origin: current.target.origin, expectedSignature: current.looksSignature });
            current.looksSignature = cast_looks.castLooksSignature(record);
            const metadata = editorMetadata(current) || { characters: [] };
            // Show the exact sanitized value that was durably saved.
            for (const role of ['char', 'user']) current.element.querySelector(`[data-rmt-cg-tag-input="${role}"]`).value = record[role];
            if (metadata.characters.some(person => person.tag !== record[person.role])) invalidateFlatPrompt(current);
            updatePreparedPreview(current);
            const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
            status.setAttribute('role', 'status'); status.textContent = '外貌已保存，未发起生图。';
            return;
        }
        if (action === 'view') {
            const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
            image_viewer.openCgImageViewer(item?.cgImage, item?.title, {
                opener: current.element.querySelector('[data-rmt-cg-prompt-action="view"]'),
            });
            return;
        }
        if (action === 'clear') {
            busyEditor(true);
            if (current.target.mode === core_constants.MODE.HEART) await heart.clearHeartStripImage(current.target.itemId);
            else await images.clearSelectedCgImage();
            const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
            if (!images.normalizeCgImageRecord(item?.cgImage)) closeCgPromptEditor();
            return;
        }
        if (action === 'reconceive') {
            if (!overlay.confirmExplicitAction('重新构思这张回忆的画面？',
                '会使用心迹回廊的独立 API 消耗一次文本生成额度，结合这条回忆、当前角色卡与用户人设整理画面并提取双方外貌；若柏宝绘公开角色库有同名资料，也会作为外貌依据。结果先放入编辑框，不会立即生图或改写回忆。', { destructive: false })) return;
            images.assertCgImageTargetCurrent(current.target);
            busyEditor(true);
            const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
            status.setAttribute('role', 'status'); status.textContent = '正在重新构思，请稍等…';
            const result = await images.reconceiveCgImagePrompt(current.target, {promptFormat: current.promptFormat});
            if (editor !== current || !current.element.isConnected) return;
            const textarea = current.element.querySelector('[data-rmt-cg-prompt-input]');
            textarea.value = typeof result === 'string' ? result : result.imagePrompt;
            fillEditorMetadata(current, typeof result === 'string' ? null : result);
            current.element.querySelector('[data-rmt-cg-appearance]').open = true;
            current.element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${textarea.value.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
            const missing = (result?.missingRoles || []).filter(role => role === 'char' || role === 'user')
                .map(role => current.characterNames[role] || (role === 'char' ? '角色' : '用户'));
            status.textContent = missing.length ? `画面已更新。未提取到${missing.join('、')}的可用外貌；如本画面需要，请补全人设或手填标签。`
                : '画面与双方外貌已更新，请核对后确认绘图。';
            return;
        }
        if (action === 'draw') {
            const value = current.element.querySelector('[data-rmt-cg-prompt-input]').value;
            if (value.length > core_constants.MAX_CG_IMAGE_PROMPT_CHARS) throw core_text.safeUserError('画面提示词超过字数上限，请缩短后再绘图。');
            const prompt = images.sanitizeCgVisualText(value);
            if (!prompt) throw core_text.safeUserError('请先写入可用的画面提示词。');
            const promptMetadata = editorMetadata(current);
            images.assertCgImageTargetCurrent(current.target);
            busyEditor(true);
            // Existing drawing flow owns the explicit cost/replacement confirmation,
            // provider lock and durable commit; this editor never invokes a provider.
            const onAccepted = () => closeCgPromptEditor({ restoreFocus: false });
            if (current.target.mode === core_constants.MODE.HEART) {
                await heart.drawHeartStripImage(current.target.itemId, { promptOverride: prompt, promptMetadata, promptFormat: current.promptFormat, expectedTarget: current.target, onAccepted });
            } else await images.drawSelectedCgImage({ promptOverride: prompt, promptMetadata, promptFormat: current.promptFormat, expectedTarget: current.target, onAccepted });
        }
    } catch (error) {
        if (editor === current) promptError(core_text.safeErrorSummary(error));
    } finally {
        if (editor === current) busyEditor(false);
    }
}
