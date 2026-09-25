import { SETTINGS_LAUNCHER_ID, bindManualAutosave, chatReadingSettingsHtml, manualAutosaves, paintCoverageMap, refreshGenerationSettingsUi, refreshImageGenerationSettingsUi, refreshManualModelOptions, refreshModelOptions, refreshReadingSettingsUi, refreshSettingsMemoryStatus, refreshThemeUi, saveManualPanel, voiceSettingsHtml } from './settingsPanelParts.js';
import * as core_settings from '../core/settings.js';
import * as advanced_ui from './advancedGenerationUi.js';
import * as cg_format_ui from './cgFormatControl.js';
import * as core_autoUpdatePolicy from '../core/autoUpdatePolicy.js';
import * as core_text from '../core/text.js';
import * as core_constants from '../core/constants.js';
import { state as runtimeState } from '../core/state.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { SETTINGS_MOUNT_UNHANDLED } from './settingsPanelHome.js';
// ui/settingsPanelHome.js mountSettings 的分组处理（重构阶段 3）。每个函数是原函数里连续的一段语句，一字未改；
// 返回 SETTINGS_MOUNT_UNHANDLED 表示“这一段没有处理”，原函数接着往下走，和拆分前完全相同。

// 设置页整页 HTML（panel.innerHTML 赋值原样搬出）（原第 13–13 条语句）
export function renderSettingsPanelMarkup(panel) {
    panel.innerHTML = `
      <div class="inline-drawer-toggle inline-drawer-header rmt-settings-header">
        <div><b>心迹回廊</b><small> API SETTINGS</small></div>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content rmt-settings-content">
        ${voiceSettingsHtml()}
        <details class="rmt-settings-card rmt-api-box" data-rmt-settings-section="api">
          <summary class="rmt-settings-card-head"><span>API</span><div><b>独立 API</b><small>一键配置 · 手动配置</small></div></summary>
          <div class="rmt-settings-section-body">
          <div class="rmt-api-source-grid" role="group" aria-label="独立 API 配置方式">
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-api-import-current aria-pressed="false"><span class="rmt-api-source-badge">凭证绑定</span><b>一键配置</b><small>读取酒馆当前连接</small></button>
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-api-select-manual aria-pressed="false"><span class="rmt-api-source-badge">OPENAI</span><b>手动配置</b><small>URL · Key · 模型</small></button>
          </div>
          <div data-rmt-api-host-capability role="status"></div>
          <div class="rmt-api-status" data-rmt-api-status role="status">○ 一键连接未配置</div>
          <div class="rmt-api-source-panel" data-rmt-api-profile-panel>
            <label class="rmt-settings-field"><span>连接配置</span><select class="text_pole" data-rmt-api-profile><option value="">选择 Connection Manager 配置</option></select></label>
            <details class="rmt-api-pool"><summary>多个连接轮流使用</summary><label class="rmt-settings-check"><input type="checkbox" data-rmt-api-pool-enabled><span>启用轮询连接池</span></label><div data-rmt-api-pool-choices></div><small>新任务依次使用勾选的连接及其模型；本次运行中的重试保持原连接；重新打开后续接会重新分配。可同时运行的任务数量沿用已有并发设置。</small></details>
            <div class="rmt-model-row">
              <label class="rmt-settings-field"><span>模型</span><select class="text_pole" data-rmt-api-model><option value="">请先选择专用连接</option></select></label>
              <button type="button" class="menu_button rmt-model-refresh" data-rmt-api-model-refresh>刷新模型</button>
            </div>
          </div>
          <div class="rmt-api-source-panel" data-rmt-api-manual-panel hidden>
            <label class="rmt-settings-field"><span>API 地址</span><input class="text_pole" data-rmt-manual-api-base type="url" inputmode="url" placeholder="https://api.example.com/v1"></label>
            <label class="rmt-settings-field"><span>API Key</span><div class="rmt-manual-key-row"><input class="text_pole" data-rmt-manual-api-key type="password" autocomplete="new-password" placeholder="API Key（可留空）"><button type="button" class="menu_button" data-rmt-manual-api-key-clear>清除 Key</button></div></label>
            <div class="rmt-model-row">
              <label class="rmt-settings-field"><span>模型 ID</span><input class="text_pole" data-rmt-manual-api-model type="text" placeholder="例如 gpt-4.1"><select class="text_pole rmt-manual-model-picker" data-rmt-manual-api-models hidden><option value="">选择已拉取模型</option></select></label>
              <button type="button" class="menu_button rmt-model-refresh" data-rmt-manual-api-model-refresh>拉取模型</button>
            </div>
            <button type="button" class="menu_button rmt-settings-wide rmt-manual-save" data-rmt-manual-api-save>保存并使用</button>
            <div data-rmt-manual-save-status role="status" aria-live="polite">填写后自动保存到本机，不随档案导出。</div>
            <label class="rmt-settings-check"><input type="checkbox" data-rmt-manual-streaming ${core_settings.getPluginSettings().manualApiStreaming ? 'checked' : ''}><span>使用流式输出（仅此手动 API）</span></label>
            <small>需要服务端支持 SSE；关闭时使用普通完整响应，不影响主聊天。</small>
          </div>
          <div class="rmt-api-grid">
            <label class="rmt-settings-field"><span>最大输出</span><input class="text_pole" data-rmt-api-max-tokens type="number" min="1" step="1" placeholder="默认 60000"></label>
            <label class="rmt-settings-field"><span>输入预算</span><input class="text_pole" data-rmt-api-input-budget type="number" min="8000" max="200000" step="1" placeholder="默认 60000"></label>
            <small>最大输出是模型最多写多长，默认 60000，不拦输入。输入预算是发送前本地保险，默认 60000 tokens，范围 8000–200000，越大越贵；与最大输出无关。</small>
            <label class="rmt-settings-field"><span>温度</span><input class="text_pole" data-rmt-api-temperature type="number" min="0" max="2" step="0.1"></label>
            <small data-rmt-temperature-note></small>
          </div>
          <label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-second ${core_settings.getPluginSettings().autoSecondPass ? 'checked' : ''}><span>第一次完成后，自动进行第二次生成</span></label>
          <label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-retry ${core_settings.getPluginSettings().autoRetryEnabled ? 'checked' : ''}><span>失败后自动重试未完成部分</span></label>
          <label class="rmt-settings-field"><span>自动重试次数</span><input class="text_pole" data-rmt-auto-retry-count type="number" min="1" max="5" step="1" value="${core_settings.getPluginSettings().autoRetryCount}" ${core_settings.getPluginSettings().autoRetryEnabled ? '' : 'disabled'}></label>
          <small>默认关闭。打开后，新出现的「重试未完成部分」会自动再试，默认 1 次，可改成 1–5 次。每次都使用生成额度。超限草稿和已经写好、只差继续的草稿不会自动重试。</small>
          <label class="rmt-settings-field"><span>生成禁用词</span><input class="text_pole" data-rmt-banned-generated-phrases type="text" placeholder="用逗号分隔，例如：老子"></label>
          <p>打开房间只读已有内容；“今日生活”由房间里的手动更新按钮触发，不会在进入时自动请求。</p>
          <label class="rmt-settings-check"><input data-rmt-tt-display type="checkbox"><span>TT 顶部安全区</span></label>
          </div>
        </details>
        ${advanced_ui.advancedGenerationHtml()}
        ${chatReadingSettingsHtml()}
        <details class="rmt-settings-card" data-rmt-settings-section="image">
          <summary class="rmt-settings-card-head"><span>CG</span><div><b>CG 生图</b><small>相簿 · ADV · 日常一格</small></div></summary>
          <div class="rmt-settings-section-body">
            ${cg_format_ui.cgFormatControlHtml()}
            <label class="rmt-settings-field"><span>生图渠道</span><select class="text_pole" data-rmt-image-generation-provider aria-describedby="rmt-image-provider-status"><option value="baibai-image">柏宝绘 · 公开 API v1</option></select></label>
            <p id="rmt-image-provider-status" data-rmt-image-generation-status role="status" aria-live="polite"></p>
            <p>柏宝绘需单独安装并配置出图渠道。只在点击绘制并确认后出图，失败不会自动换渠道。</p>
          </div>
        </details>
        <details class="rmt-settings-card" data-rmt-settings-section="creative">
          <summary class="rmt-settings-card-head"><span>文</span><div><b>创作补充词</b><small>仅用于心迹回廊独立 API</small></div></summary>
          <div class="rmt-settings-section-body">
            <label class="rmt-settings-check"><input type="checkbox" data-rmt-creative-enabled><span>启用创作补充词</span></label>
            <label class="rmt-settings-field"><span>文风、氛围与叙事偏好</span><textarea class="text_pole" data-rmt-creative-text maxlength="20000" rows="8" placeholder="例如：少用总结式旁白，让情绪从对白和细节中自然流露。"></textarea></label>
            <p><output data-rmt-creative-count>0 / 20,000</output> 字符。仅随心迹回廊文本生成发送，不写入主聊天、不发送给生图接口；会占用模型输入额度。</p>
            <div class="rmt-theme-presets"><button type="button" data-rmt-creative-save>保存补充词</button><button type="button" data-rmt-creative-cancel>撤销编辑</button></div>
            <div role="status" data-rmt-creative-status></div>
          </div>
        </details>
        <details class="rmt-settings-card" data-rmt-settings-section="filter">
          <summary class="rmt-settings-card-head"><span>TAG</span><div><b>过滤标签</b><small>勾选即不读取</small></div></summary>
          <div class="rmt-settings-section-body">
            <p>勾选的标签及其中全部内容不参与后续读取；未勾选的内容和无标签正文保留。可排除正文内嵌的标签块，不改聊天和旧档案。</p>
            <textarea class="text_pole" data-rmt-tag-draft aria-label="不读取的标签名" placeholder="thinking, 绘图提示词标签"></textarea>
            <div class="rmt-theme-presets"><button type="button" data-rmt-tag-scan>扫描当前聊天</button><button type="button" data-rmt-tag-all>全选</button><button type="button" data-rmt-tag-invert>反选</button><button type="button" data-rmt-tag-clear>清空选择</button><button type="button" data-rmt-tag-cancel>撤销编辑</button><button type="button" data-rmt-tag-save>保存选择</button></div>
            <div data-rmt-tag-status role="status"></div>
            <div data-rmt-tag-results></div>
          </div>
        </details>
        <details class="rmt-settings-card rmt-theme-box" data-rmt-settings-section="theme">
          <summary class="rmt-settings-card-head"><span>UI</span><div><b>界面主题</b><small>配色与透明度</small></div></summary>
          <div class="rmt-settings-section-body">
          <label class="rmt-settings-field"><span>外观</span><select class="text_pole" data-rmt-theme-mode><option value="default">日间 · 珍珠白</option><option value="night">夜间 · 星黛蓝</option><option value="gs1">初叶绿</option><option value="gs2">海盐蓝</option><option value="gs3">花漾粉</option><option value="gs4">杏糖橙</option><option value="host">跟随酒馆美化</option><option value="custom">自定义配色</option></select></label>
          <label class="rmt-settings-field"><span>悬浮头像</span><select class="text_pole" data-rmt-floating-avatar><option value="char">角色 char（默认）</option><option value="user">用户 user</option><option value="off">关闭</option></select></label>
          <label class="rmt-settings-field"><span>卡片不透明度 <output data-rmt-theme-opacity></output></span><input data-rmt-theme-alpha type="range" min="0.72" max="1" step="0.01"></label>
          <div class="rmt-theme-custom-panel" data-rmt-theme-custom-panel>
            <div class="rmt-theme-presets"><button type="button" data-rmt-theme-preset="day">从日间开始</button><button type="button" data-rmt-theme-preset="night">从夜间开始</button></div>
            <label><span>背景</span><input type="color" data-rmt-theme-color="background"></label>
            <label><span>卡片</span><input type="color" data-rmt-theme-color="surface"></label>
            <label><span>主文字</span><input type="color" data-rmt-theme-color="text"></label>
            <label><span>次文字</span><input type="color" data-rmt-theme-color="muted"></label>
            <label><span>选中与装饰色</span><input type="color" data-rmt-theme-color="accent"></label>
            <label><span>第二装饰色</span><input type="color" data-rmt-theme-color="accentAlt"></label>
            <label><span>边框</span><input type="color" data-rmt-theme-color="border"></label>
          </div>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-theme-reset>恢复默认配色</button>
          </div>
        </details>
        <details class="rmt-settings-card" data-rmt-settings-section="auto">
          <summary class="rmt-settings-card-head"><span>↻</span><div><b>自动更新</b><small>跟随当前聊天 · 每项独立设置</small></div></summary>
          <div class="rmt-settings-section-body">
          <p>只在已有档案的当前窗口运行。每条聊天消息算一楼，编辑不加楼；开启后从当前楼数起计。</p>
          <p>“档案同步”收录新聊天；其他模块使用已归档记忆，不改旧内容。会调用独立 API。</p>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-auto-memory-wizard>打开自动留忆向导</button>
          <small>向导保存间隔和模块偏好，也可以现在建档或把首次生成放进任务中心。自动抽签还没开始，上面的按模块自动更新不会被关掉。</small>
          <div class="rmt-auto-rules">${core_autoUpdatePolicy.AUTO_UPDATE_MODES.map(mode => `<div class="rmt-auto-rule"><label><input type="checkbox" data-rmt-auto-enabled="${mode}"> ${core_text.esc(mode === 'archive' ? '档案同步' : core_constants.MODE_LABEL[mode])}</label><label>每 <input type="number" min="1" max="1000" step="1" data-rmt-auto-every="${mode}" aria-label="${core_text.esc(mode === 'archive' ? '档案同步' : core_constants.MODE_LABEL[mode])}间隔楼层"> 楼</label><small data-rmt-auto-status="${mode}" role="status"></small></div>`).join('')}</div>
          <small data-rmt-auto-warning role="status"></small>
          <small>失败后不连续重试，等待下一个间隔；可随时手动生成。不支持跨页任务锁的浏览器仅保留手动操作。</small>
          </div>
        </details>
        <div class="rmt-settings-card">
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-self-update>检查并更新插件</button>
          <small data-rmt-self-update-status role="status">强制检查已发布更新 · 完成后手动刷新页面</small>
        </div>
        <details class="rmt-settings-card rmt-api-box" data-rmt-settings-section="memory">
          <summary class="rmt-settings-card-head"><span>MEM</span><div><b>记忆来源</b><small>当前角色 · 当前聊天</small></div></summary>
          <div class="rmt-settings-section-body">
          <div class="rmt-api-source-grid" role="group" aria-label="记忆来源操作">
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-memory-auto-read><span class="rmt-api-source-badge">AUTO</span><b>自动读取</b><small>已注册的当前聊天来源</small></button>
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-memory-file-choose><span class="rmt-api-source-badge">FILE</span><b>导入记忆</b><small>JSON · JSONL · TXT · Markdown</small></button>
          </div>
          <label class="rmt-settings-check"><input type="checkbox" data-rmt-source-external ${core_settings.getPluginSettings().useCurrentChatExternalMemory !== false ? 'checked' : ''}><span>读取当前聊天的外部记忆摘要</span></label>
          <label class="rmt-settings-check"><input type="checkbox" data-rmt-source-world-info ${core_settings.getPluginSettings().useActivatedWorldInfo !== false ? 'checked' : ''}><span>读取自动激活的世界书</span></label>
          <p>聊天范围只控制聊天摘录。外部摘要、自动激活世界书分别由上方开关控制；手动选择的世界书仍按下方来源设置读取。已有档案不会被删除，派生模块仍使用已经归档的记忆。</p>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-action="memory-worldinfo-picker" ${runtimeState.busy || core_requestCoordinator.hasGenerationTasks() ? 'disabled' : ''}>选择记忆相关世界书</button>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-action="participants-picker">选择加入回廊的人物</button>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-action="participants-versions">查看重做前的旧版本</button>
          <input type="file" accept=".json,.jsonl,.txt,.md,.markdown,application/json,text/plain,text/markdown" data-rmt-memory-file-input hidden>
          <div class="rmt-api-status" data-rmt-memory-ingress-status role="status">展开记忆来源后查看状态；不会自动导入或生成。</div>
          <div class="rmt-api-source-panel" data-rmt-memory-file-preview hidden>
            <b data-rmt-memory-file-preview-title>待确认的记忆文件</b>
            <small data-rmt-memory-file-preview-meta></small>
            <small data-rmt-memory-file-preview-binding></small>
            <div data-rmt-memory-file-preview-sample></div>
            <label class="checkbox_label rmt-settings-check"><input type="checkbox" data-rmt-memory-file-history-confirm> 我确认这是已经发生的历史/摘要，不是角色设定</label>
            <button type="button" class="menu_button rmt-settings-wide" data-rmt-memory-file-commit disabled>确认作为历史导入当前聊天</button>
          </div>
          <details class="rmt-api-source-panel"><summary>来源详情与世界书类型</summary>
            <div data-rmt-memory-source-list>暂无持久化来源。</div>
            <div data-rmt-memory-history-books></div>
          </details>
          <div data-rmt-scene-picker></div>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-memory-source-clear>清除当前聊天已导入来源</button>
          <small>只清除心迹回廊自己的来源账本；不会删除聊天、第三方记忆或正式 Mxxx。</small>
          </div>
        </details>
        <div class="rmt-settings-archive-actions">
          <button type="button" class="menu_button rmt-open-archive-room" data-rmt-settings-current-archive><i class="fa-solid fa-file-circle-plus"></i><span>生成当前窗口档案</span></button>
          <button type="button" class="menu_button rmt-open-archive-room" data-rmt-settings-open-archive><i class="fa-solid fa-box-archive"></i><span>打开档案室</span></button>
        </div>
      </div>`;
    return SETTINGS_MOUNT_UNHANDLED;
}
