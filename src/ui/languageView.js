// Independent reader for the existing HEART greetings. No second language store or generator.
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as context from '../core/context.js';
import * as language from '../core/heartLanguage.js';
import { state as state } from '../core/state.js';
import * as overlay from './overlay.js';
import * as heartView from './heartView.js';
import * as ui_workspaceState from './workspaceState.js';
const labels = { morning:'早晨', noon:'白天', evening:'傍晚', night:'夜晚', weekend:'周末', birthday:'角色生日', userBirthday:'你的生日', holiday:'节日', absenceWorry:'久别关心', absenceSulky:'久别闹别扭', absenceJealous:'久别吃醋' };
let reader = { owner: '', category: 'morning', index: 0 };
function ownerKey(session) { return JSON.stringify([state.activeArchiveSnapshot?.entryId || '', session?.chatId || '', session?.archiveRevision || '']); }
export function languageReaderState(session = state.activeSession) {
    const owner = ownerKey(session); if (reader.owner !== owner) reader = { owner, category:'morning', index:0 };
    const values = text.cleanArray(session?.greetings?.[reader.category], 40, 600);
    reader.index = values.length ? Math.max(0, Math.min(reader.index, values.length-1)) : 0;
    return { ...reader, values };
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
    const dialogue = values.length ? heartView.renderHeartScriptLines([{speaker:'char', text:values[index]}]) : '<div class="rmt-heart-empty">这个类别还没有台词。</div>';
    overlay.setBackVisible(true, '内容'); overlay.topTitle('基础语言'); overlay.setRegenerateVisible(false);
    overlay.bodyEl().innerHTML = `<section class="rmt-language-reader"><header class="rmt-workspace-section-head"><h2>基础语言</h2><span>已有 ${status.total} 句</span></header><label class="rmt-settings-field"><span>语言类别</span><select class="text_pole" data-rmt-language-category aria-label="选择语言类别">${options}</select></label>${dialogue}<div class="rmt-language-pager"><button type="button" class="rmt-btn" data-rmt-language-step="-1" ${values.length<2?'disabled':''}>上一句</button><span>${values.length ? `${index+1} / ${values.length}` : '尚未生成'}</span><button type="button" class="rmt-btn" data-rmt-language-step="1" ${values.length<2?'disabled':''}>下一句</button></div>${canGenerate ? `<div class="rmt-heart-top-actions"><button type="button" class="rmt-btn" data-rmt-action="heart-add-language">${values.length?'追加当前类别':'生成当前类别'}</button>${status.hasContent?'<button type="button" class="rmt-btn" data-rmt-action="heart-generate-language" data-rmt-heart-language-replace="1">重新生成全部基础语言</button>':''}</div>`:''}</section>`;
    overlay.decorateReadOnlyModeUi(); return true;
}
export function handleLanguageClick(event) {
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
