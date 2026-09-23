import * as settings from '../core/settings.js';
import * as format from '../core/cgPromptFormat.js';
export function cgFormatOptions(value) {
    return format.CG_PROMPT_FORMATS.map(key => `<option value="${key}" ${key === value ? 'selected' : ''}>${format.cgPromptFormatLabel(key)}</option>`).join('');
}
export function cgFormatControlHtml({ readOnly = false } = {}) {
    const value = settings.getPluginSettings().cgPromptFormat;
    return `<label class="rmt-cg-format"><span>生图提示词格式</span><select data-rmt-cg-prompt-format aria-label="生图提示词格式" ${readOnly ? 'disabled' : ''}>${cgFormatOptions(value)}</select><small>只选提示词写法；实际生图模型仍在生图插件中选择。</small></label>`;
}
export function cgFormatVisible(mode, route) { return ['album', 'adv', 'ending'].includes(mode) || mode === 'heart' && ['heart','strips','postending','language'].includes(route); }
export function mountCgFormatControl(body, mode, route, readOnly) {
    if (!body?.prepend || !cgFormatVisible(mode, route) || body.querySelector('[data-rmt-cg-prompt-format]')) return;
    const el = document.createElement('div'); el.innerHTML = cgFormatControlHtml({readOnly});
    body.prepend(el);
}
export function handleCgFormatChange(event) {
    const el = event.target;
    if (!el?.matches?.('[data-rmt-cg-prompt-format]')) return false;
    if (el.disabled || !format.normalizeCgPromptFormat(el.value)) return true;
    settings.updatePluginSettings({cgPromptFormat: el.value});
    for (const field of document.querySelectorAll?.('[data-rmt-cg-prompt-format]') || []) field.value = el.value;
    return true;
}
