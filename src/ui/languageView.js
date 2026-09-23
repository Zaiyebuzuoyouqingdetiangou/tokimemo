import * as cg_targets from '../core/cgTargets.js';
import * as cg_images from '../generation/imageGeneration.js';
import * as cg_editor from './cgPromptEditor.js';
import * as expanded_cg_view from './expandedCgView.js';
// Independent reader for the existing HEART greetings. No second language store or generator.
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as context from '../core/context.js';
import * as language from '../core/heartLanguage.js';
import { state as state } from '../core/state.js';
import * as overlay from './overlay.js';
import * as heartView from './heartView.js';
import * as ui_workspaceState from './workspaceState.js';
import * as recovery_view from './recoveryView.js';
const labels = { morning:'早晨', noon:'白天', evening:'傍晚', night:'夜晚', weekend:'周末', birthday:'角色生日', userBirthday:'你的生日', holiday:'节日', absenceWorry:'久别关心', absenceSulky:'久别闹别扭', absenceJealous:'久别吃醋' };
let reader = { owner: '', category: 'morning', index: 0 };
function ownerKey(session) { return JSON.stringify([state.activeArchiveSnapshot?.entryId || '', session?.chatId || '', session?.archiveRevision || '']); }
export function languageReaderState(session = state.activeSession) {
    const owner = ownerKey(session); if (reader.owner !== owner) reader = { owner, category:'morning', index:0 };
    const values = text.cleanArray(session?.greetings?.[reader.category], 40, 600);
    reader.index = values.length ? Math.max(0, Math.min(reader.index, values.length-1)) : 0;
    return { ...reader, values };
}
export function legacyLanguageGalleryHtml(session) {
    const pictures = [];
    for (const row of Array.isArray(session?.languageVisuals) ? session.languageVisuals : []) {
        for (const visual of [row.visual, ...(row.previousSceneVisuals || []).map(scene => scene.visual), ...(row.previousCgVisuals || [])]) {
            for (const raw of [visual?.cgImage, ...(visual?.cgImageHistory || [])]) {
                const image = cg_images.normalizeCgImageRecord(raw);
                if (image && !pictures.some(saved => saved.image.url === image.url)) pictures.push({image,title:row.title || labels[row.category] || '旧画面'});
            }
        }
    }
    if (!pictures.length) return '';
    return `<details class="rmt-language-legacy-gallery"><summary>以前保存的画面 · ${pictures.length}</summary><div class="rmt-language-picture-grid">${pictures.map(({image,title})=>`<figure><img src="${text.esc(image.url)}" alt="${text.esc(title)}" loading="lazy"><figcaption>${text.esc(title)}</figcaption></figure>`).join('')}</div></details>`;
}
export function renderLanguage() {
    const session = state.activeSession;
    if (session?.kind !== constants.MODE.HEART) return false;
    ui_workspaceState.workspace.route = 'language'; ui_workspaceState.workspace.tab = 'content';
    const { category, index, values } = languageReaderState(session);
    const status = language.heartLanguageStatus(session);
    const readOnly = !!state.activeArchiveSnapshot && state.activeArchiveReadOnly;
    const canGenerate = !readOnly && state.activeArchiveSnapshot?.backupOnly !== true;
    const options = constants.HEART_GREETING_KEYS.map(key => `<option value="${key}" ${key===category?'selected':''}>${text.esc(labels[key]||key)} · ${status.counts[key]}句</option>`).join('');
    const savedScene = session.languagePortrait?.scenePrompt || cg_images.DEFAULT_LANGUAGE_PORTRAIT;
    const artwork = expanded_cg_view.expandedCgHtml(session, {kind:'heart-portrait',containerId:'language'}, !!state.activeArchiveSnapshot);
    const sceneComposer = !state.activeArchiveSnapshot ? `<details class="rmt-language-scene" ${session.languagePortrait ? '' : 'open'}><summary>${session.languagePortrait ? '调整共用肖像' : '画一张隔着屏幕的 TA'}</summary><label>画面描述<textarea class="text_pole" data-rmt-language-cg-scene maxlength="1800">${text.esc(savedScene)}</textarea></label><p>所有台词共用这一幅画。保存描述不请求接口，确认绘图才生成。</p><button type="button" class="rmt-btn" data-rmt-language-cg-prepare>打开肖像绘图设置</button></details>` : '';
    const dialogue = values.length ? heartView.renderHeartScriptLines([{speaker:'char', text:values[index]}]) : '<div class="rmt-heart-empty">这个类别还没有台词。</div>';
    overlay.setBackVisible(true, '内容'); overlay.topTitle('基础语言'); overlay.setRegenerateVisible(false);
    overlay.bodyEl().innerHTML = `<section class="rmt-language-reader"><header class="rmt-workspace-section-head"><h2>基础语言</h2><span>已有 ${status.total} 句</span></header>${artwork}${sceneComposer}<label class="rmt-settings-field"><span>语言类别</span><select class="text_pole" data-rmt-language-category aria-label="选择语言类别">${options}</select></label>${dialogue}<div class="rmt-language-pager"><button type="button" class="rmt-btn" data-rmt-language-step="-1" ${values.length<2?'disabled':''}>上一句</button><span>${values.length ? `${index+1} / ${values.length}` : '尚未生成'}</span><button type="button" class="rmt-btn" data-rmt-language-step="1" ${values.length<2?'disabled':''}>下一句</button></div>${canGenerate ? `<div class="rmt-heart-top-actions"><button type="button" class="rmt-btn" data-rmt-action="heart-add-language">${values.length?'追加当前类别':'生成当前类别'}</button>${status.hasContent?'<button type="button" class="rmt-btn" data-rmt-action="heart-generate-language" data-rmt-heart-language-replace="1">重新生成全部基础语言</button>':''}</div>`:''}${legacyLanguageGalleryHtml(session)}</section>`;
    if (session.readableProgress?.complete === false) {
        const body = overlay.bodyEl(), notice = recovery_view.readableProgressHtml(session);
        if (typeof body.insertAdjacentHTML === 'function') body.insertAdjacentHTML('afterbegin', notice);
        else body.innerHTML = notice + body.innerHTML;
    }
    overlay.decorateReadOnlyModeUi(); return true;
}
export function handleLanguageClick(event) {
    const sceneButton = event.target?.closest?.('[data-rmt-language-cg-prepare]');
    if (sceneButton && !sceneButton.disabled && ui_workspaceState.workspace.route === 'language') {
        void prepareLanguageScene(sceneButton); return true;
    }
    const button = event.target?.closest?.('[data-rmt-language-step]');
    if (!button || button.disabled || ui_workspaceState.workspace.route !== 'language') return false;
    const current = languageReaderState();
    if (current.values.length) reader.index = (current.index + (Number(button.dataset.rmtLanguageStep)<0 ? -1 : 1) + current.values.length) % current.values.length;
    renderLanguage(); return true;
}
export function handleLanguageChange(event) {
    if (ui_workspaceState.workspace.route !== 'language' || !event.target?.matches?.('[data-rmt-language-category]')) return false;
    if (constants.HEART_GREETING_KEYS.includes(event.target.value)) { reader.category = event.target.value; reader.index=0; renderLanguage(); }
    return true;
}

async function prepareLanguageScene(button) {
    const scope = ownerKey(state.activeSession), epoch = ui_workspaceState.workspace.epoch;
    const scenePrompt = overlay.bodyEl()?.querySelector('[data-rmt-language-cg-scene]')?.value || '';
    if (!scenePrompt.trim()) { globalThis.toastr?.info?.('请先描述共用肖像的画面。', '心迹回廊'); return; }
    button.disabled = true;
    try {
        const descriptor = await cg_images.prepareLanguagePortraitTarget({scenePrompt});
        if (!descriptor || ownerKey(state.activeSession) !== scope || epoch !== ui_workspaceState.workspace.epoch
            || ui_workspaceState.workspace.route !== 'language') return;
        renderLanguage();
        await cg_editor.openCgPromptEditor({targetDescriptor:descriptor});
    } catch (error) { globalThis.toastr?.error?.(text.safeErrorSummary(error), '心迹回廊'); }
    finally { if (button.isConnected) button.disabled = false; }
}
