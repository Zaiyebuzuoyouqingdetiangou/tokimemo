import * as advanced from '../core/advancedGeneration.js';
import * as settingsApi from '../core/settings.js';
import * as text from '../core/text.js';
const labels = { temperature:'温度', frequency_penalty:'频率惩罚', presence_penalty:'存在惩罚', top_p:'Top P', top_k:'Top K', seed:'种子', min_p:'Min P', top_a:'Top A', typical_p:'Typical P', repetition_penalty:'重复惩罚' };
export function advancedGenerationHtml() {
    return `<details class="rmt-settings-card" data-rmt-settings-section="advanced-generation"><summary class="rmt-settings-card-head"><span>API</span><div><b>高级生成参数</b><small>排除参数 · 推理 · 流式</small></div></summary>
<div class="rmt-settings-section-body">
<label class="rmt-settings-check"><input type="checkbox" data-rmt-advanced-enabled><span>启用高级生成参数</span></label>
<p>默认关闭，仅作用于心迹回廊。参数排除与附加 JSON 用于手动 API / 自定义 Profile，不改主聊天。</p>
<label class="rmt-settings-field"><span>推理强度（reasoning_effort）</span><select class="text_pole" data-rmt-advanced-effort><option value="">默认：不覆盖</option>${advanced.REASONING_EFFORTS.map(value => `<option value="${value}">${value}</option>`).join('')}</select></label>
<label class="rmt-settings-field"><span>本插件流式方式</span><select class="text_pole" data-rmt-advanced-stream><option value="original">保持原设置</option><option value="on">使用流式</option><option value="off">使用完整响应</option></select></label>
<p>不同模型接受的推理配置不同；不会根据模型名自动替你修改。</p>
<b>排除参数（勾选＝不发送）</b>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0">${advanced.EXCLUDABLE_PARAMETERS.map(key => `<label class="rmt-settings-check" style="min-width:0;overflow-wrap:anywhere"><input type="checkbox" data-rmt-advanced-exclude="${key}"><span>${labels[key]}<small style="display:block;overflow-wrap:anywhere">${key}</small></span></label>`).join('')}</div>
<div class="rmt-theme-presets"><button type="button" data-rmt-advanced-common>选中常用四项</button><button type="button" data-rmt-advanced-none>取消所有排除</button></div>
<label class="rmt-settings-field"><span>附加参数（JSON 对象，可留空）</span><textarea class="text_pole" data-rmt-advanced-json rows="6" maxlength="8192" spellcheck="false" placeholder='{"enable_thinking": false}'></textarea></label>
<p>只填写接口支持的采样／推理参数；排除优先于 JSON。不接受模型、消息、最大输出、连接、Key 或工具覆盖。</p>
<div class="rmt-theme-presets"><button type="button" data-rmt-advanced-save>保存高级参数</button><button type="button" data-rmt-advanced-revert>撤销编辑</button><button type="button" data-rmt-advanced-reset>关闭并重置</button></div>
<div data-rmt-advanced-status role="status" aria-live="polite"></div></div></details>`;
}
export function bindAdvancedGenerationUi(panel) {
    const section = panel.querySelector('[data-rmt-settings-section="advanced-generation"]'); if (!section) return;
    const query = selector => section.querySelector(selector), status = query('[data-rmt-advanced-status]');
    const refresh = () => {
        const settings = settingsApi.getPluginSettings();
        query('[data-rmt-advanced-enabled]').checked = settings.advancedGenerationEnabled;
        query('[data-rmt-advanced-effort]').value = settings.advancedReasoningEffort;
        query('[data-rmt-advanced-stream]').value = settings.advancedStreamMode;
        query('[data-rmt-advanced-json]').value = settings.advancedExtraParams;
        for (const input of section.querySelectorAll('[data-rmt-advanced-exclude]')) input.checked = settings.advancedExcludedParams.includes(input.dataset.rmtAdvancedExclude);
    };
    section.addEventListener('click', event => {
        const button = event.target.closest?.('button'); if (!button) return;
        if (button.hasAttribute('data-rmt-advanced-common') || button.hasAttribute('data-rmt-advanced-none')) {
            const common = button.hasAttribute('data-rmt-advanced-common');
            for (const input of section.querySelectorAll('[data-rmt-advanced-exclude]')) input.checked = common && advanced.EXCLUDABLE_PARAMETERS.slice(0,4).includes(input.dataset.rmtAdvancedExclude);
            status.textContent = '选择已更新，尚未保存。'; return;
        }
        if (button.hasAttribute('data-rmt-advanced-revert')) { refresh(); status.textContent = '已撤销未保存编辑。'; return; }
        if (button.hasAttribute('data-rmt-advanced-reset')) {
            settingsApi.updatePluginSettings(advanced.advancedSettings()); refresh(); status.textContent = '已关闭并重置高级参数，原连接与输出额度不变。'; return;
        }
        if (!button.hasAttribute('data-rmt-advanced-save')) return;
        try {
            const candidate = { advancedGenerationEnabled: query('[data-rmt-advanced-enabled]').checked,
                advancedReasoningEffort: query('[data-rmt-advanced-effort]').value, advancedStreamMode: query('[data-rmt-advanced-stream]').value,
                advancedExtraParams: query('[data-rmt-advanced-json]').value,
                advancedExcludedParams: [...section.querySelectorAll('[data-rmt-advanced-exclude]')].filter(input => input.checked).map(input => input.dataset.rmtAdvancedExclude) };
            // Even a disabled draft cannot smuggle credentials into ordinary settings.
            advanced.parseAdvancedGeneration({ ...candidate, advancedGenerationEnabled: true });
            settingsApi.updatePluginSettings(candidate);
            status.textContent = candidate.advancedGenerationEnabled ? '已保存；下次请求生效，不会自动请求。' : '已保存草稿；高级参数关闭，不发送这些参数。';
        } catch (error) { status.textContent = text.safeErrorSummary(error); }
    });
    refresh();
}
