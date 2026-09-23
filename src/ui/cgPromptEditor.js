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
import * as participant_picker from './participantPicker.js';
import * as participants from '../core/participants.js';
import * as cache from '../core/cache.js';
import * as images from '../generation/imageGeneration.js';
import * as appearance from '../generation/cgAppearance.js';
import * as image_viewer from './cgImageViewer.js';
import * as heart from './heartView.js';
import * as overlay from './overlay.js';

let editor = null;

export function portraitCgMetadata(item, raw) {
    if (!item?.cgPortrait || item.cgImage || !raw) return raw;
    const value = structuredClone(raw);
    const userIds = new Set((value.castSnapshot?.people || []).filter(person=>person.identity==='user').map(person=>person.id));
    if (value.castSnapshot) value.castSnapshot.people = value.castSnapshot.people.filter(person=>person.identity!=='user');
    value.characters = (value.characters || []).filter(person=>person.role!=='user' && !userIds.has(person.participantId));
    return appearance.normalizeCgPromptMetadata(value);
}

function snapshotEditorDraft(current) {
    const metadata = editorMetadata(current);
    return { promptFormat: current.promptFormat, scene: current.element.querySelector('[data-rmt-cg-prompt-input]').value, metadata,
        ...(current.multi ? { people: structuredClone(current.people) } : {}) };
}
function rememberEditorDraft(current, value) {
    current.previousDraft = value;
    const button = current.element.querySelector('[data-rmt-cg-prompt-action="restore-draft"]');
    if (button) button.hidden = !value;
}
export function hasCgPromptEditor() { return !!editor?.element?.isConnected; }

export function closeCgPromptEditor({ restoreFocus = true } = {}) {
    image_viewer.closeCgImageViewer({ restoreFocus: false });
    const previous = editor;
    if (!previous) return;
    editor = null;
    if (previous.sourcePickerOpen) participant_picker.closeParticipantPicker();
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
    for (const field of editor.element.querySelectorAll('[data-rmt-cg-prompt-input], [data-rmt-cg-scene-tags], [data-rmt-cg-tag-input], [data-rmt-cg-flat-prompt], [data-rmt-cg-editor-format], [data-rmt-cg-person-selected], [data-rmt-cg-person-name], [data-rmt-cg-person-tag], [data-rmt-cg-person-nl]')) field.disabled = active;
    for (const button of editor.element.querySelectorAll('[data-rmt-cg-prompt-action="reconceive"], [data-rmt-cg-prompt-action="draw"], [data-rmt-cg-prompt-action="clear"], [data-rmt-cg-prompt-action="retry"], [data-rmt-cg-prompt-action="save-looks"], [data-rmt-cg-prompt-action="restore-draft"], [data-rmt-cg-prompt-action="add-person"], [data-rmt-cg-prompt-action="add-user"], [data-rmt-cg-prompt-action="use-current-cast"], [data-rmt-cg-prompt-action="select-sources"], [data-rmt-cg-history-view], [data-rmt-cg-history-restore]')) button.disabled = active;
}

function readParticipantFields(current) {
    for (const [index, person] of current.people.entries()) {
        const checked = current.element.querySelector(`[data-rmt-cg-person-selected="${index}"]`);
        if (!checked) continue;
        person.selected = checked.checked;
        person.name = current.element.querySelector(`[data-rmt-cg-person-name="${index}"]`).value;
        person.tag = current.element.querySelector(`[data-rmt-cg-person-tag="${index}"]`).value;
        person.nl = current.element.querySelector(`[data-rmt-cg-person-nl="${index}"]`).value;
    }
}

function ensureUserCandidate(current) {
    let user = current.people.find(person => person.identity === 'user');
    if (user) return user;
    const context = core_context.currentCharacterGuard();
    user = appearance.createCgUserParticipant(context, current.people);
    const saved = cast_looks.readParticipantLooks(context)?.characters.find(row => row.participantId === user.id);
    user = { ...user, selected: false, tag: saved?.tag || cast_looks.readCastLooks(context)?.user || '', nl: saved?.nl || '' };
    current.people.push(user);
    return user;
}

function renderParticipantFields(current) {
    const list = current.element.querySelector('[data-rmt-cg-cast-list]');
    if (!list) return;
    list.innerHTML = current.people.map((person, index) => `<div class="rmt-cg-person" data-rmt-cg-person="${index}">
      <label><input type="checkbox" data-rmt-cg-person-selected="${index}">本图出镜 · 人物 ${index + 1}</label>
      <label>姓名<input type="text" data-rmt-cg-person-name="${index}" aria-label="人物 ${index + 1} 姓名"></label>
      <small>${core_text.esc(person.identity === 'user' && !person.sourceRefs.length ? '当前用户人设' : person.sourceRefs.length ? person.sourceRefs.map(ref => `${ref.world} · ${ref.title || ref.uid}`).join('；') : '手动补充的人物')}</small>
      <label>外貌 tag<textarea data-rmt-cg-person-tag="${index}" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" aria-label="人物 ${index + 1} 外貌 tag" placeholder="未知可留空，不会移除已勾选人物"></textarea></label>
      <label>外貌描述<textarea data-rmt-cg-person-nl="${index}" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" aria-label="人物 ${index + 1} 外貌描述" placeholder="保留已提取的外貌描述，也可以编辑"></textarea></label>
    </div>`).join('');
    for (const [index, person] of current.people.entries()) {
        const selected = list.querySelector(`[data-rmt-cg-person-selected="${index}"]`);
        const name = list.querySelector(`[data-rmt-cg-person-name="${index}"]`);
        const tag = list.querySelector(`[data-rmt-cg-person-tag="${index}"]`);
        const nl = list.querySelector(`[data-rmt-cg-person-nl="${index}"]`);
        selected.checked = person.selected; name.value = person.name; tag.value = person.tag || ''; nl.value = person.nl || '';
        const changed = () => {
            if (current.busy) return;
            readParticipantFields(current);
            // Scene tags are independently authored camera/actions, not derived cast data.
            invalidateFlatPrompt(current);
            updatePreparedPreview(current);
            const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
            status.setAttribute('role', 'status');
            status.textContent = '本图人物已调整，画面描述保留原文。请核对画面中的人物，或重新构思后确认绘图。';
        };
        selected.addEventListener('change', changed);
        name.addEventListener('input', changed);
        // Editing either representation invalidates the other generated form;
        // otherwise an older hair/eye colour could silently contradict the edit.
        tag.addEventListener('input', () => { nl.value = ''; changed(); });
        nl.addEventListener('input', () => { tag.value = ''; changed(); });
    }
}

function appearanceFieldsHtml(multi) {
    return multi ? '<fieldset data-rmt-cg-cast><legend>本图出镜人物</legend><p>勾选只影响这张图。姓名可改，也可补充档案名单外的人物；同名人物独立保存。</p><div data-rmt-cg-cast-list></div><div class="rmt-cg-cast-actions"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="add-person">补充人物</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="add-user">定位用户候选</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="select-sources">重新选择外貌来源</button></div></fieldset>' : `<p><label for="rmt-cg-char-tags" data-rmt-cg-tag-name="char">角色 · 外貌 tag</label><textarea id="rmt-cg-char-tags" data-rmt-cg-tag-input="char" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" placeholder="重新构思时提取，或手动填写"></textarea></p>
            <p><label for="rmt-cg-user-tags" data-rmt-cg-tag-name="user">用户 · 外貌 tag</label><textarea id="rmt-cg-user-tags" data-rmt-cg-tag-input="user" rows="2" maxlength="${appearance.CG_APPEARANCE_TAG_LIMIT}" placeholder="重新构思时提取，或手动填写"></textarea></p>`;
}

function changeEditorCastMode(current, multi) {
    if (current.multi === multi) return;
    current.multi = multi;
    current.element.querySelector('[data-rmt-cg-appearance-fields]').innerHTML = appearanceFieldsHtml(multi);
    if (!multi) for (const field of current.element.querySelectorAll('[data-rmt-cg-tag-input]')) {
        field.addEventListener('input', () => { invalidateFlatPrompt(current); updatePreparedPreview(current); });
    }
    const context = core_context.currentCharacterGuard();
    current.looksSignature = multi ? cast_looks.participantLooksSignature(cast_looks.readParticipantLooks(context))
        : cast_looks.castLooksSignature(cast_looks.readCastLooks(context));
}

function editorMetadata(current) {
    if (current.multi) {
        readParticipantFields(current);
        const selected = current.people.filter(person => person.selected);
        return appearance.normalizeCgPromptMetadata({ promptFormat: current.promptFormat,
            sceneTags: current.element.querySelector('[data-rmt-cg-scene-tags]').value,
            flatPrompt: current.element.querySelector('[data-rmt-cg-flat-prompt]').value,
            castSnapshot: { version: 1, people: selected.map(({ id, name, sourceRefs, identity }) => ({ id, name, sourceRefs, ...(identity === 'user' ? { identity } : {}) })) },
            characters: selected.map(person => ({ participantId: person.id, tag: person.tag || '', nl: person.nl || '' })) });
    }
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
        if (!sent) { output.value = scene; return; }
        const channels = sent.nl && sent.nl === sent.prompt
            ? [`prompt / nl（相同，仅显示一次）:\n${sent.prompt}`]
            : [`prompt:\n${sent.prompt}`, ...(sent.nl ? [`nl:\n${sent.nl}`] : [])];
        if (sent.characters?.length) channels.push(`人物标签：\n${sent.characters.map(row =>
            `${row.name}${row.nl === row.tag ? '（tag / nl 相同，仅显示一次）' : ''}: ${row.tag}`
            + (row.nl && row.nl !== row.tag ? `\nnl: ${row.nl}` : '')).join('\n')}`);
        output.value = channels.join('\n\n');
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
    if (current.multi) {
        const snapshot = metadata?.castSnapshot || { version: 1, people: [] };
        const known = new Map(current.people.map(person => [person.id, person]));
        const selected = new Set(snapshot.people.map(person => person.id));
        current.people = [...snapshot.people.map(person => ({ ...person, selected: true,
            tag: metadata?.characters.find(row => row.participantId === person.id)?.tag || '',
            nl: metadata?.characters.find(row => row.participantId === person.id)?.nl || '' })),
        ...[...known.values()].filter(person => !selected.has(person.id)).map(person => ({ ...person, selected: false }))];
        ensureUserCandidate(current);
        renderParticipantFields(current);
        updatePreparedPreview(current);
        return;
    }
    for (const role of ['char', 'user']) {
        const character = metadata?.characters.find(row => row.role === role);
        if (character?.name) current.characterNames[role] = character.name;
        current.element.querySelector(`[data-rmt-cg-tag-name="${role}"]`).textContent =
            `${current.characterNames[role] || (role === 'char' ? '角色' : '用户')} · 外貌 tag`;
        current.element.querySelector(`[data-rmt-cg-tag-input="${role}"]`).value = character?.tag || '';
    }
    updatePreparedPreview(current);
}

export function openCgPromptEditor({ heartStrip = false, targetDescriptor = null } = {}) {
    try {
        if (!archive_library.requireWritableArchiveAction()) return;
        const item = heartStrip ? heart.selectedHeartStrip() : null;
        const rawTarget = targetDescriptor ? images.resolveCgImageTargetDescriptor(targetDescriptor)
            : heartStrip && item
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
        // Expanded plans carry the participant snapshot captured when the user
        // saved the plan. Reopening must not substitute today's roster.
        const initialMetadata = portraitCgMetadata(selected,savedImage?.promptMetadata || selected.__rmtCgPromptMetadata || appearance.initialCgAppearanceMetadata(selected, context));
        const multi = !!initialMetadata?.castSnapshot;
        const currentRoster = cache.readParticipantRoster(context);
        const roster = multi && !selected.cgImage && !selected.__rmtCgPromptMetadata ? currentRoster : null;
        const participantLooks = multi ? cast_looks.readParticipantLooks(context) : null;
        const canRetry = images.hasPendingCgImage(target);
        const element = document.createElement('div');
        element.className = 'rmt-cg-prompt-backdrop';
        element.innerHTML = `<section class="rmt-cg-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-cg-prompt-title" aria-describedby="rmt-cg-prompt-help" tabindex="-1">
          <div class="rmt-cg-prompt-head"><h2 id="rmt-cg-prompt-title">图片设置</h2><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="close" aria-label="关闭图片设置">关闭</button></div>
          <p class="rmt-cg-prompt-event">${core_text.esc(selected.title)}</p>
          <label class="rmt-cg-format"><span>生图提示词格式</span><select data-rmt-cg-editor-format aria-label="当前图片提示词格式">${cg_format_ui.cgFormatOptions(promptFormat)}</select><small>只指导重新构思的写法，不限制手动提示；切换不发请求，实际模型在生图插件中选择。</small></label>
          <details class="rmt-cg-prompt-scene"><summary>查看这条回忆</summary><p>${core_text.esc(selected.cgSourceText || selected.cgDesc || selected.desc || selected.subtitle || '')}</p></details>
          <label for="rmt-cg-prompt-input">将发送给生图插件的画面描述</label>
          <textarea id="rmt-cg-prompt-input" data-rmt-cg-prompt-input rows="8" maxlength="${core_constants.MAX_CG_IMAGE_PROMPT_CHARS}" aria-describedby="rmt-cg-prompt-help rmt-cg-prompt-count"></textarea>
          <div id="rmt-cg-prompt-count" data-rmt-cg-prompt-count></div>
          <details class="rmt-cg-prompt-scene" data-rmt-cg-appearance>
            <summary>人物外貌与场景标签</summary>
            <div data-rmt-cg-appearance-fields>${appearanceFieldsHtml(multi)}</div>
            <div class="rmt-cg-cast-actions">${selected.cgImage && participants.selectedParticipantSnapshot(currentRoster) ? '<button type="button" class="rmt-btn" data-rmt-cg-prompt-action="use-current-cast">从当前档案选择本图人物</button>' : ''}
            <button type="button" class="rmt-btn" data-rmt-cg-prompt-action="save-looks">保存外貌</button></div>
            <p><label for="rmt-cg-scene-tags">场景 tag</label><textarea id="rmt-cg-scene-tags" data-rmt-cg-scene-tags rows="2" maxlength="${appearance.CG_SCENE_TAG_LIMIT}" placeholder="人物动作、场景与构图"></textarea></p>
            <p><label for="rmt-cg-flat-prompt">通用后端完整提示</label><textarea id="rmt-cg-flat-prompt" data-rmt-cg-flat-prompt rows="4" maxlength="${appearance.CG_FLAT_PROMPT_LIMIT}" placeholder="包含双方外貌、动作与场景的完整提示"></textarea></p>
          </details>
          <details class="rmt-cg-prompt-scene"><summary>发送预览</summary><p><textarea data-rmt-cg-send-preview aria-label="将发送的场景与人物外貌" rows="5" readonly></textarea></p></details>
          <p id="rmt-cg-prompt-help">保存外貌不生图，供本聊天后续新图使用。关闭仅放弃未保存的草稿；确认绘图后才消耗生图额度。</p>
          <p data-rmt-cg-prompt-status role="status" aria-live="polite"></p>
          <div class="rmt-cg-prompt-actions"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="reconceive">重新构思／提取外貌</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="draw">${savedImage ? '确认提示词并重绘' : '确认提示词并绘图'}</button></div>
          <button type="button" class="rmt-btn" data-rmt-cg-prompt-action="restore-draft" hidden>还原上次草稿</button>
          ${canRetry ? '<div class="rmt-cg-prompt-secondary"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="retry">回填已生成图片（不再生图）</button></div>' : ''}
          ${savedImage ? `<div class="rmt-cg-prompt-secondary"><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="view">查看完整原图</button><button type="button" class="rmt-btn" data-rmt-cg-prompt-action="clear">${target.mode === core_constants.MODE.HEART ? '恢复文字版' : '恢复抽象图'}</button><small>仅移除本档案的图片引用，不删除柏宝绘图库文件。</small></div>` : ''}
        </section>`;
        const cancel = event => {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!image_viewer.closeCgImageViewer()) closeCgPromptEditor();
        };
        editor = { target, element, host, promptFormat, opener: document.activeElement, busy: false, cancel, multi,
            people: (roster?.people || initialMetadata?.castSnapshot?.people || []).map(person => ({ ...person, selected: false,
                tag: participantLooks?.characters.find(row => row.participantId === person.id)?.tag || '' })),
            looksSignature: multi ? cast_looks.participantLooksSignature(participantLooks) : cast_looks.castLooksSignature(cast_looks.readCastLooks(context)),
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
            rememberEditorDraft(current, snapshotEditorDraft(current));
            current.promptFormat = cg_format.normalizeCgPromptFormat(event.target.value, current.promptFormat);
            // A style switch is not a conversion or a draw. Keep visible authored
            // scene/looks and invalidate dependent fields only in this draft.
            fillEditorMetadata(current, appearance.metadataAfterSceneEdit(editorMetadata(current)));
            const status = element.querySelector('[data-rmt-cg-prompt-status]');
            status.textContent = '格式偏好已切换，未发请求；可核对当前提示后直接绘图。';
        });
        textarea.addEventListener('input', () => { invalidateSceneMetadata(current); updateCount(); });
        for (const field of element.querySelectorAll('[data-rmt-cg-tag-input], [data-rmt-cg-scene-tags]')) {
            field.addEventListener('input', () => { invalidateFlatPrompt(current); updatePreparedPreview(current); });
        }
        element.querySelector('[data-rmt-cg-flat-prompt]').addEventListener('input', () => updatePreparedPreview(current));
        fillEditorMetadata(current, initialMetadata);
        if (multi) element.querySelector('[data-rmt-cg-appearance]').open = true;
        element.addEventListener('click', event => {
            event.stopPropagation();
            const historyViewUrl = event.target.closest?.('[data-rmt-cg-history-view]')?.dataset.rmtCgHistoryView;
            const historyRestoreUrl = event.target.closest?.('[data-rmt-cg-history-restore]')?.dataset.rmtCgHistoryRestore;
            if (historyViewUrl || historyRestoreUrl) { void handleCgHistoryAction(historyViewUrl || '', historyRestoreUrl || '', event.target); return; }
            const action = event.target.closest?.('[data-rmt-cg-prompt-action]')?.dataset.rmtCgPromptAction;
            if (action) void handleCgPromptEditorAction(action);
        });
        element.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCgPromptEditor(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...element.querySelectorAll('button:not(:disabled):not([hidden]), textarea:not(:disabled), select:not(:disabled), input:not(:disabled), summary, a[href]')];
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

export async function handleCgHistoryAction(viewUrl, restoreUrl, sourceEl = null) {
    const current = editor;
    if (!current || current.busy) return;
    const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
    const history = images.normalizeCgImageHistory(item?.cgImageHistory);
    if (viewUrl) {
        const record = history.find(row => row.url === viewUrl);
        if (record) image_viewer.openCgImageViewer(record, item?.title, { opener: sourceEl });
        return;
    }
    if (!restoreUrl || !history.some(row => row.url === restoreUrl)) return;
    busyEditor(true);
    const committed = await images.restoreSelectedCgImageVersion(restoreUrl, current.target);
    if (committed === true) closeCgPromptEditor();
    else busyEditor(false);
}

export async function handleCgPromptEditorAction(action) {
    if (action === 'close') { closeCgPromptEditor(); return; }
    const current = editor;
    if (!current || current.busy) return;
    try {
        images.assertCgImageTargetCurrent(current.target);
        if (current.multi && (action === 'add-person' || action === 'add-user')) {
            readParticipantFields(current);
            const context = core_context.currentCharacterGuard();
            const person = action === 'add-user' ? ensureUserCandidate(current)
                : { id: participants.createParticipantId(), name: '', sourceRefs: [], selected: false, tag: '', nl: '' };
            if (action !== 'add-user') current.people.push(person);
            renderParticipantFields(current);
            current.element.querySelector(`[data-rmt-cg-person-name="${current.people.indexOf(person)}"]`).focus();
            return;
        }
        if (current.multi && action === 'select-sources') {
            readParticipantFields(current);
            const previous = snapshotEditorDraft(current);
            const beforePeople = structuredClone(current.people);
            const context = core_context.currentCharacterGuard();
            current.sourcePickerOpen = true;
            await participant_picker.showParticipantPicker({ context,
                title: '重新选择本图人物外貌来源', confirmLabel: '应用到本图草稿',
                roster: { version: 1, cardType: 'multi', revision: '',
                    people: current.people, selectedIds: current.people.filter(person => person.selected).map(person => person.id) },
                onConfirm: snapshot => {
                    if (editor !== current || !current.element.isConnected) return false;
                    images.assertCgImageTargetCurrent(current.target);
                    const old = new Map(beforePeople.map(person => [person.id, person]));
                    const selected = new Set(snapshot.selectedIds);
                    rememberEditorDraft(current, previous);
                    current.people = snapshot.people.map(person => ({ ...person, selected: selected.has(person.id),
                        tag: old.get(person.id)?.tag || '', nl: old.get(person.id)?.nl || '' }));
                    ensureUserCandidate(current);
                    renderParticipantFields(current);
                    invalidateFlatPrompt(current);
                    updatePreparedPreview(current);
                    current.sourcePickerOpen = false;
                    current.element.querySelector('[data-rmt-cg-prompt-status]').textContent = '本图来源已更新；原图、档案名单和已保存外貌未改动。点击重新构思后才提取外貌。';
                    return true;
                } });
            return;
        }
        if (action === 'use-current-cast') {
            const context = core_context.currentCharacterGuard();
            const roster = cache.readParticipantRoster(context);
            const snapshot = participants.selectedParticipantSnapshot(roster);
            if (!snapshot) return;
            const previous = snapshotEditorDraft(current);
            const saved = cast_looks.readParticipantLooks(context);
            rememberEditorDraft(current, previous);
            changeEditorCastMode(current, true);
            current.people = roster.people.map(person => ({ ...person, selected: false,
                tag: saved?.characters.find(row => row.participantId === person.id)?.tag || '' }));
            fillEditorMetadata(current, { promptFormat: current.promptFormat, sceneTags: previous.metadata?.sceneTags || '',
                castSnapshot: snapshot, characters: saved?.characters || [] });
            current.element.querySelector('[data-rmt-cg-appearance]').open = true;
            current.element.querySelector('[data-rmt-cg-prompt-status]').textContent = '已载入当前档案人物，请勾选本图出镜者。原图和原提示未改动；重新构思后再确认绘图。';
            return;
        }
        if (action === 'restore-draft') {
            const draft = current.previousDraft;
            if (!draft) return;
            current.promptFormat = draft.promptFormat;
            current.element.querySelector('[data-rmt-cg-editor-format]').value = draft.promptFormat;
            current.element.querySelector('[data-rmt-cg-prompt-input]').value = draft.scene;
            changeEditorCastMode(current, !!draft.metadata?.castSnapshot);
            if (draft.people) current.people = structuredClone(draft.people);
            fillEditorMetadata(current, draft.metadata);
            current.element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${draft.scene.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
            rememberEditorDraft(current, null);
            current.element.querySelector('[data-rmt-cg-prompt-status]').textContent = '已还原上次草稿，未发送请求。';
            return;
        }
        if (action === 'retry') {
            busyEditor(true);
            const saved = await images.retryPendingCgImage(current.target);
            if (saved && editor === current) closeCgPromptEditor();
            return;
        }
        if (action === 'save-looks') {
            busyEditor(true);
            if (current.multi) {
                readParticipantFields(current);
                const record = cast_looks.saveConfirmedParticipantLooks(current.people.filter(person => person.selected)
                    .map(person => ({ participantId: person.id, tag: person.tag || '', nl: person.nl || '' })),
                { origin: current.target.origin, expectedSignature: current.looksSignature });
                current.looksSignature = cast_looks.participantLooksSignature(record);
                for (const person of current.people.filter(row => row.selected)) {
                    const saved = record.characters.find(row => row.participantId === person.id);
                    if (person.tag !== saved.tag || (person.nl || '') !== (saved.nl || '')) invalidateFlatPrompt(current);
                    person.tag = saved.tag; person.nl = saved.nl || '';
                }
                renderParticipantFields(current);
                updatePreparedPreview(current);
                const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
                status.setAttribute('role', 'status'); status.textContent = '勾选人物的外貌已保存，未发起生图；本图名单将在确认绘图后随图片保存。';
                return;
            }
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
            if (current.target.mode === core_constants.MODE.HEART && !current.target.targetDescriptor) await heart.clearHeartStripImage(current.target.itemId);
            else await images.clearSelectedCgImage(current.target);
            const item = images.cgItemInSession(current.target.mode, current.target.session, current.target.itemId);
            if (!images.normalizeCgImageRecord(item?.cgImage)) closeCgPromptEditor();
            return;
        }
        if (action === 'reconceive') {
            if (!overlay.confirmExplicitAction('重新构思这张回忆的画面？',
                current.multi ? '会使用心迹回廊的独立 API 消耗一次文本生成额度，根据本图勾选人物及其来源整理画面和外貌。未知外貌留空，不会移除名单中的人物。结果先放入编辑框，不会立即生图或改写回忆。' : '会使用心迹回廊的独立 API 消耗一次文本生成额度，结合这条回忆、当前角色卡与用户人设整理画面并提取双方外貌；若柏宝绘公开角色库有同名资料，也会作为外貌依据。结果先放入编辑框，不会立即生图或改写回忆。', { destructive: false })) return;
            images.assertCgImageTargetCurrent(current.target);
            busyEditor(true);
            const status = current.element.querySelector('[data-rmt-cg-prompt-status]');
            status.setAttribute('role', 'status'); status.textContent = '正在重新构思，请稍等…';
            const previousDraft = snapshotEditorDraft(current);
            const appearanceDraft = current.multi ? Object.fromEntries(current.people.filter(person => person.selected).map(person => [person.id, { tag: person.tag || '', nl: person.nl || '' }]))
                : Object.fromEntries(['char', 'user'].map(role => [role, current.element.querySelector(`[data-rmt-cg-tag-input="${role}"]`).value]));
            const result = await images.reconceiveCgImagePrompt(current.target, {promptFormat: current.promptFormat, appearanceDraft,
                ...(current.multi ? { castSnapshot: editorMetadata(current).castSnapshot } : {})});
            if (editor !== current || !current.element.isConnected) return;
            const textarea = current.element.querySelector('[data-rmt-cg-prompt-input]');
            rememberEditorDraft(current, previousDraft);
            textarea.value = typeof result === 'string' ? result : result.imagePrompt;
            fillEditorMetadata(current, typeof result === 'string' ? null : result);
            current.element.querySelector('[data-rmt-cg-appearance]').open = true;
            current.element.querySelector('[data-rmt-cg-prompt-count]').textContent = `${textarea.value.length} / ${core_constants.MAX_CG_IMAGE_PROMPT_CHARS} 字符`;
            const missing = current.multi ? (result?.missingParticipantIds || []).map(id => current.people.find(person => person.id === id)?.name || '未命名人物')
                : (result?.missingRoles || []).filter(role => role === 'char' || role === 'user')
                .map(role => current.characterNames[role] || (role === 'char' ? '角色' : '用户'));
            const statuses = current.multi ? result?.appearanceStatus || [] : [];
            const names = rows => rows.map(row => current.people.find(person => person.id === row.participantId)?.name || '未命名人物').join('、');
            const omitted = statuses.filter(row => row.sourceAvailable && !row.hasAppearance);
            const unavailable = statuses.filter(row => !row.sourceAvailable && !row.hasAppearance);
            status.textContent = current.multi && statuses.length && missing.length
                ? `画面已更新。${omitted.length ? `${names(omitted)}：已提供人物资料，但本次模型未返回可用外貌。` : ''}${unavailable.length ? `${names(unavailable)}：本次未读到外貌来源或已保存外貌。` : ''}已返回的内容保留，可继续编辑；没有自动重试。`
                : missing.length ? `画面已更新。未提取到${missing.join('、')}的可用外貌；如本画面需要，请补全人设或手填标签。`
                : current.multi ? '画面与勾选人物外貌已更新，请核对后确认绘图。' : '画面与双方外貌已更新，请核对后确认绘图。';
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
            if (current.target.mode === core_constants.MODE.HEART && !current.target.targetDescriptor) {
                await heart.drawHeartStripImage(current.target.itemId, { promptOverride: prompt, promptMetadata, promptFormat: current.promptFormat, expectedTarget: current.target, onAccepted });
            } else await images.drawSelectedCgImage({ promptOverride: prompt, promptMetadata, promptFormat: current.promptFormat, expectedTarget: current.target, onAccepted });
        }
    } catch (error) {
        if (editor === current) promptError(core_text.safeErrorSummary(error));
    } finally {
        if (editor === current) busyEditor(false);
    }
}
