const VERSION = '0.8.108';
const BUILD = '0.8.108-tt-cg-r84.32-oversize-egress';

const SETTINGS_ID = 'heartbeat_memories_settings';
const MENU_ID = 'heartbeat_memories_menu_item';
const BOOTSTRAP_STYLE_ID = 'heartbeat_memories_bootstrap_styles';
const CACHE_KEY = 'heartbeatMemoriesTheaterV3';
const MEMORY_KEY = 'heartbeatMemoriesArchiveV3';
const CACHE_STORAGE_FORMAT = 'gzip-base64-v1';
const DIAGNOSTIC_ID = 'heartbeat_memories_external_diagnostic';
const DIAGNOSTIC_STYLE_ID = DIAGNOSTIC_ID + '_style';
const DIAGNOSTIC_MODES = Object.freeze(['butterfly', 'album', 'adv', 'room', 'items', 'cabinet', 'phone', 'inbox', 'pastLives', 'timeEcho', 'travel', 'ending', 'calendar', 'relations', 'heart', 'achievements']);
const boundedCount = value => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1_000_000_000, Math.floor(value))) : 0;

let runtimeModule = null;
let bootPromise = null;
let bootstrapTimer = 0;
let bootstrapEarlyCleanup = null;
let lastArchiveOpenAt = 0;
let disabled = false;
let externalDiagnosticCleanup = null;
let runtimeLoadFailed = false;
let bootstrapAutoPending = null;
let bootstrapAutoCleanup = null;
let bootstrapAutoEpoch = 0;
const diagnosticDownloadTimers = new Map();

function safeBootstrapErrorDiagnostic(error) {
    const diagnostic = {};
    const name = String(error?.name || '');
    const code = String(error?.code || '');
    const status = Number(error?.status ?? error?.statusCode);
    if (/^(?:Error|TypeError|RangeError|SyntaxError|AbortError|TimeoutError|DOMException)$/.test(name)) diagnostic.name = name;
    if (/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) diagnostic.code = code;
    if (Number.isFinite(status) && status >= 100 && status <= 599) diagnostic.status = Math.floor(status);
    return diagnostic;
}

function humanSize(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 1024 * 100 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function humanChars(chars) {
    const value = Math.max(0, Number(chars) || 0);
    if (value < 1000) return `${Math.round(value)} 字符`;
    if (value < 1_000_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k 字符`;
    return `${(value / 1_000_000).toFixed(2)}M 字符`;
}

function approximateBase64Bytes(value) {
    const text = typeof value === 'string' ? value : '';
    if (!text) return 0;
    const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

function diagnosticRisk(base64Chars, sourceBytes, legacyRaw) {
    if (legacyRaw) return { level: '注意', detail: '检测到旧版未压缩派生缓存；为避免诊断本身制造卡顿，本次不序列化测量它。' };
    const compressed = Math.max(0, Number(base64Chars) || 0);
    const source = Math.max(0, Number(sourceBytes) || 0);
    if (compressed >= 1_500_000 || source >= 10_000_000) return { level: '高', detail: '当前聊天的 Heartbeat 派生缓存已接近读取上限，宿主读取聊天 metadata 时可能出现明显等待。' };
    if (compressed >= 500_000 || source >= 6_000_000) return { level: '中', detail: '当前聊天已有较大的 Heartbeat 派生缓存；若真机进入该聊天变慢，建议继续观察。' };
    return { level: '低', detail: '从 Heartbeat metadata 尺寸看，没有发现明显的大缓存压力。' };
}

function getHeartbeatPerformanceDiagnostic() {
    let context = null;
    try { context = globalThis.SillyTavern?.getContext?.() || null; } catch {}
    if (!context) {
        return {
            snapshot: { available: false },
            text: '心迹回廊性能诊断（不解压缓存）\n\n当前还没有可读取的 SillyTavern 上下文。\n\n本诊断不会加载 Heartbeat 完整 runtime。',
        };
    }

    const metadata = context.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : {};
    const memory = metadata[MEMORY_KEY];
    const stored = metadata[CACHE_KEY];
    const memoryCount = Array.isArray(memory?.memories) ? boundedCount(memory.memories.length) : 0;
    const messageCount = Array.isArray(context.chat) ? boundedCount(context.chat.length) : 0;

    const compressed = !!stored && typeof stored === 'object'
        && stored.format === CACHE_STORAGE_FORMAT
        && typeof stored.data === 'string';
    const legacyRaw = !!stored && typeof stored === 'object' && !compressed;
    const base64Chars = compressed ? stored.data.length : 0;
    const compressedBytesApprox = compressed ? approximateBase64Bytes(stored.data) : 0;
    const sourceChars = compressed ? boundedCount(stored.sourceChars) : 0;
    const storedSourceBytes = compressed ? boundedCount(stored.sourceBytes) : 0;
    const sourceBytesExact = storedSourceBytes > 0;
    // r42.2 manifests only recorded UTF-16 characters. Three UTF-8 bytes per code unit is a
    // conservative upper bound that keeps this diagnostic zero-decompression and O(1).
    const sourceBytes = sourceBytesExact ? storedSourceBytes : boundedCount(sourceChars * 3);
    const modes = [];
    if (compressed && Array.isArray(stored.modes)) {
        for (let i = 0; i < Math.min(32, stored.modes.length); i += 1) {
            const mode = stored.modes[i];
            if (DIAGNOSTIC_MODES.includes(mode) && !modes.includes(mode)) modes.push(mode);
        }
    }
    const risk = diagnosticRisk(base64Chars, sourceBytes, legacyRaw);
    const storage = compressed ? CACHE_STORAGE_FORMAT : legacyRaw ? 'legacy-uncompressed' : 'none';

    const rows = [
        '心迹回廊性能诊断（不解压缓存）',
        '',
        `聊天消息数组：${messageCount} 条（只读取 length，没有遍历正文）`,
        `Mxxx 档案：${memoryCount} 条`,
        `派生缓存格式：${storage}`,
        `派生模式：${modes.length ? modes.join(' / ') : '无'}`,
    ];
    if (compressed) {
        rows.push(
            `派生缓存原始字符：${sourceChars.toLocaleString()}（${humanChars(sourceChars)}）`,
            `派生缓存 UTF-8：${sourceBytesExact ? humanSize(sourceBytes) : `不超过 ${humanSize(sourceBytes)}（旧清单保守估算）`}`,
            `metadata Base64：${base64Chars.toLocaleString()} 字符`,
            `估算 gzip 数据：${humanSize(compressedBytesApprox)}`,
        );
    } else if (legacyRaw) {
        rows.push('旧版未压缩缓存：存在；为避免序列化大对象，本诊断不测量其大小。');
    } else {
        rows.push('派生缓存：当前聊天没有保存 Heartbeat 剧场缓存。');
    }
    rows.push(
        `尺寸风险：${risk.level} · ${risk.detail}`,
        '',
        '保证：本诊断只看 Heartbeat metadata 字段；未执行 Base64 解码、gzip 解压、缓存序列化，也未遍历聊天正文。',
        `完整 runtime：${runtimeModule ? '已加载' : '尚未加载（诊断没有触发加载）'}`,
    );

    return {
        snapshot: {
            available: true,
            messageCount,
            memoryCount,
            storage,
            modes,
            sourceChars,
            sourceBytes,
            sourceBytesExact,
            base64Chars,
            compressedBytesApprox,
            risk: risk.level,
            runtimeLoaded: !!runtimeModule,
        },
        text: rows.join('\n'),
    };
}

globalThis.__heartbeatMemoriesVersion = BUILD;
globalThis.__heartbeatMemoriesGetPerformanceDiagnostic = getHeartbeatPerformanceDiagnostic;

function renderDiagnostic(output = null) {
    const report = getHeartbeatPerformanceDiagnostic();
    if (output) {
        output.textContent = report.text;
        output.hidden = false;
    }
    return report;
}

globalThis.__heartbeatMemoriesRenderPerformanceDiagnostic = renderDiagnostic;

function diagnosticPanelFor(output) {
    return output?.closest?.('[data-rmt-diagnostic-panel]') || output || null;
}

function syncDiagnosticTrigger(trigger, expanded) {
    if (!trigger) return;
    trigger.setAttribute?.('aria-expanded', expanded ? 'true' : 'false');
    const label = trigger.querySelector?.('[data-rmt-diagnostic-label]');
    if (label) label.textContent = expanded ? '关闭性能诊断' : '性能诊断（不解压缓存）';
}

function hideDiagnostic(output = null, trigger = null) {
    const diagnosticPanel = diagnosticPanelFor(output);
    if (diagnosticPanel) diagnosticPanel.hidden = true;
    syncDiagnosticTrigger(trigger, false);
    return false;
}

function toggleDiagnostic(output = null, trigger = null) {
    const diagnosticPanel = diagnosticPanelFor(output);
    const expanded = diagnosticPanel ? !diagnosticPanel.hidden : !!output && !output.hidden;
    if (expanded) return hideDiagnostic(output, trigger);
    renderDiagnostic(output);
    if (diagnosticPanel) diagnosticPanel.hidden = false;
    syncDiagnosticTrigger(trigger, true);
    return true;
}

globalThis.__heartbeatMemoriesHidePerformanceDiagnostic = hideDiagnostic;
globalThis.__heartbeatMemoriesTogglePerformanceDiagnostic = toggleDiagnostic;

function getDiagnosticReportText() {
    try {
        const runtimeReport = globalThis.__heartbeatMemoriesRuntimeDiagnosticText;
        if (typeof runtimeReport === 'function') return runtimeReport();
        return JSON.stringify({
            generatedAt: new Date().toISOString(),
            plugin: { declaredVersion: BUILD, runtimeLoaded: false },
            performance: getHeartbeatPerformanceDiagnostic().snapshot,
            recentTasks: [],
        }, null, 2);
    } catch {
        return JSON.stringify({ code: 'RMT_DIAGNOSTIC_UNAVAILABLE' }, null, 2);
    }
}

function displayDiagnosticReport(output, text) {
    if (!output) return;
    if ('value' in output) output.value = text;
    else output.textContent = text;
    output.hidden = false;
    const panel = output.closest?.('[data-rmt-diagnostic-panel]');
    if (panel) panel.hidden = false;
}

// Showing raw diagnostics is an explicit troubleshooting action. Successful copy
// and export stay compact; a rejected browser facility offers manual copy instead.
async function deliverDiagnosticReport(action, { output = null, status = null, isCurrent = () => true } = {}) {
    const active = () => !disabled && isCurrent() && (!output || output.isConnected !== false);
    if (!active()) return false;
    const text = getDiagnosticReportText();
    const show = () => { if (active()) displayDiagnosticReport(output, text); };
    const say = message => { if (active() && status && status.isConnected !== false) status.textContent = message; };
    if (action === 'copy') {
        try {
            if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error();
            await globalThis.navigator.clipboard.writeText(text);
            say('已复制诊断报告。');
            return true;
        } catch {
            show();
            say('无法自动复制，请长按下方报告手动复制。');
            return false;
        }
    }
    if (action === 'export') {
        let url = '';
        let link = null;
        try {
            url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
            link = document.createElement('a');
            link.href = url;
            link.download = 'Hearttrace-diagnostic.json';
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            say('已请求导出；若未出现下载，请使用“复制报告”或“查看报告”。');
            return true;
        } catch {
            show();
            say('无法下载，请复制下方报告。');
            return false;
        } finally {
            link?.remove();
            if (url) {
                const timer = setTimeout(() => {
                    try { URL.revokeObjectURL(url); } catch {}
                    diagnosticDownloadTimers.delete(url);
                }, 1000);
                diagnosticDownloadTimers.set(url, timer);
            }
        }
    }
    show();
    say('报告不含聊天、外貌、提示词或密钥。');
    return true;
}

function removeExternalDiagnostic() {
    try { externalDiagnosticCleanup?.(); } catch {}
    externalDiagnosticCleanup = null;
    document.getElementById(DIAGNOSTIC_ID)?.remove();
    document.getElementById(DIAGNOSTIC_STYLE_ID)?.remove();
    for (const [url, timer] of diagnosticDownloadTimers) {
        clearTimeout(timer);
        try { URL.revokeObjectURL(url); } catch {}
    }
    diagnosticDownloadTimers.clear();
}

function mountExternalDiagnostic() {
    // The normal diagnostics entry belongs to Hearttrace home. Only a failed
    // runtime load needs a fallback outside the plugin UI.
    if (disabled || !runtimeLoadFailed) return false;
    if (document.getElementById(DIAGNOSTIC_ID)) return true;
    const mount = document.querySelector('#extensions_settings2');
    if (!mount) return false;
    const style = document.createElement('style');
    style.id = DIAGNOSTIC_STYLE_ID;
    style.textContent = `
#${DIAGNOSTIC_ID}{box-sizing:border-box;width:100%;max-width:100%;min-width:0;display:block;flex:0 0 auto;margin-top:8px;padding:0;border:0;color:inherit;background:inherit;font-family:inherit;writing-mode:horizontal-tb}
#${DIAGNOSTIC_ID} [hidden]{display:none!important}
#${DIAGNOSTIC_ID}>summary{box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:12px 8px;cursor:pointer;white-space:normal;word-break:normal;overflow-wrap:break-word;writing-mode:horizontal-tb;touch-action:manipulation}
#${DIAGNOSTIC_ID}:not([open])>.rmt-external-diagnostic-content{display:none!important}
#${DIAGNOSTIC_ID} .rmt-external-diagnostic-content{box-sizing:border-box;min-width:0;max-width:100%;padding:8px}
#${DIAGNOSTIC_ID} button.menu_button{box-sizing:border-box;display:flex!important;align-items:center;justify-content:center;width:100%!important;max-width:100%!important;min-width:0!important;min-height:46px!important;height:auto!important;margin:0!important;padding:9px 10px!important;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important;text-orientation:mixed!important;color:inherit;touch-action:manipulation}
#${DIAGNOSTIC_ID} .rmt-external-diagnostic-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:8px;min-width:0;max-width:100%}
#${DIAGNOSTIC_ID} textarea{box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;height:240px;margin-top:8px;padding:8px;resize:vertical;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;touch-action:auto;color:inherit;background:inherit}
#${DIAGNOSTIC_ID} [role="status"]{display:block;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
`;
    document.getElementById(DIAGNOSTIC_STYLE_ID)?.remove();
    document.head.appendChild(style);
    const panel = document.createElement('details');
    panel.id = DIAGNOSTIC_ID;
    panel.open = false;
    const trigger = document.createElement('summary');
    trigger.textContent = '心迹回廊 · 故障排查';
    const body = document.createElement('div');
    body.className = 'rmt-external-diagnostic-content';
    const actions = document.createElement('div');
    actions.className = 'rmt-external-diagnostic-actions';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    const report = document.createElement('div'); report.hidden = true;
    report.setAttribute('data-rmt-diagnostic-panel', '');
    const output = document.createElement('textarea'); output.readOnly = true;
    output.hidden = true;
    output.setAttribute('aria-label', '脱敏诊断报告'); output.spellcheck = false;
    const listeners = [];
    const on = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };
    let reportEpoch = 0;
    const clear = () => {
        reportEpoch += 1; report.hidden = true; output.hidden = true;
        output.value = ''; status.textContent = '';
    };
    const close = () => { panel.open = false; clear(); };
    on(panel, 'toggle', () => { if (!panel.open) clear(); });
    for (const [action, label] of [['copy', '复制报告'], ['export', '导出 JSON'], ['show', '查看报告'], ['close', '关闭']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'menu_button';
        button.textContent = label;
        button.setAttribute('data-rmt-diagnostic-action', action);
        on(button, 'click', () => {
            if (action === 'close') return close();
            clear();
            const epoch = reportEpoch;
            void deliverDiagnosticReport(action, { output, status, isCurrent: () => panel.open && epoch === reportEpoch });
        });
        actions.appendChild(button);
    }
    report.appendChild(output);
    body.appendChild(actions); body.appendChild(status); body.appendChild(report);
    panel.appendChild(trigger); panel.appendChild(body); mount.appendChild(panel);
    externalDiagnosticCleanup = () => { for (const cleanup of listeners) cleanup(); };
    return true;
}

globalThis.__heartbeatMemoriesMountDiagnostics = mountExternalDiagnostic;
globalThis.__heartbeatMemoriesRemoveDiagnostics = removeExternalDiagnostic;
globalThis.__heartbeatMemoriesDeliverDiagnostic = deliverDiagnosticReport;

function ensureBootstrapStyle() {
    if (document.getElementById(BOOTSTRAP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BOOTSTRAP_STYLE_ID;
    style.textContent = `#${MENU_ID}[data-rmt-bootstrap="1"]{cursor:pointer}`;
    document.head.appendChild(style);
}

function mountBootstrapMenu() {
    if (document.getElementById(MENU_ID)) return true;
    const menu = document.querySelector('#extensionsMenu');
    if (!menu) return false;
    const item = document.createElement('div');
    item.id = MENU_ID;
    item.dataset.rmtBootstrap = '1';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>心迹回廊 · 档案室</span>';
    item.addEventListener('click', () => requestArchiveOpen('bootstrap-menu-click'));
    item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        requestArchiveOpen('bootstrap-menu-keyboard');
    });
    menu.appendChild(item);
    return true;
}

function removeBootstrapShells() {
    const settings = document.getElementById(SETTINGS_ID);
    if (settings?.dataset?.rmtBootstrap === '1') settings.remove();
    const menu = document.getElementById(MENU_ID);
    if (menu?.dataset?.rmtBootstrap === '1') menu.remove();
    document.getElementById(BOOTSTRAP_STYLE_ID)?.remove();
}

function stopBootstrapMountTimer() {
    if (bootstrapTimer) clearInterval(bootstrapTimer);
    bootstrapTimer = 0;
}

function mountBootstrapEntrypoints() {
    if (disabled) return;
    if (runtimeLoadFailed) mountExternalDiagnostic();
    if (runtimeModule) return;
    ensureBootstrapStyle();
    const menuMounted = mountBootstrapMenu();
    if (menuMounted) stopBootstrapMountTimer();
}

function bindBootstrapEarlyOpen() {
    if (bootstrapEarlyCleanup) return;
    const early = event => {
        const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
        const button = path.find(node => node?.id === MENU_ID && node?.dataset?.rmtBootstrap === '1');
        if (!button) return;
        if (event.type === 'pointerdown' && Number(event.button ?? 0) !== 0) return;
        requestArchiveOpen(`bootstrap-${event.type}`);
    };
    const touchOptions = { capture: true, passive: true };
    document.addEventListener('touchstart', early, touchOptions);
    document.addEventListener('pointerdown', early, true);
    bootstrapEarlyCleanup = () => {
        document.removeEventListener('touchstart', early, touchOptions);
        document.removeEventListener('pointerdown', early, true);
    };
}

function unbindBootstrapEarlyOpen() {
    try { bootstrapEarlyCleanup?.(); } catch {}
    bootstrapEarlyCleanup = null;
}

function showBootError(error) {
    console.error('[HeartbeatMemories] lazy runtime load failed', safeBootstrapErrorDiagnostic(error));
    const message = '心迹回廊加载失败。错误详情已隐藏，请刷新页面后重试；若仍失败，请检查插件文件是否完整。';
    try { globalThis.toastr?.error?.(message, '心迹回廊'); } catch {}
}

// Match core/context.chatScopeKey without importing the archive/runtime graph.
// These bounded card fields are already present in the host; no card/worldbook API is called.
function bootstrapAutoUpdateScope(context) {
    const text = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, max);
    const character = context.characters?.[Number(context.characterId)];
    let identity;
    if (character) {
        const data = character.data && typeof character.data === 'object' ? character.data : character;
        const source = [text(character.avatar || data.avatar, 300), text(character.name || data.name, 120) || `角色 ${Number(context.characterId) + 1}`,
            ...['description', 'personality', 'scenario', 'first_mes', 'mes_example'].map(key => text(data[key] || character[key], 5000))].join('\u001f');
        let hash = 2166136261;
        for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
        identity = 'card:' + (hash >>> 0).toString(36);
    } else {
        const fallback = context.characters?.[context.characterId];
        identity = (text(fallback?.avatar || fallback?.data?.avatar, 300) || `character:${String(context.characterId ?? '')}`) + '\u001f' + text(context.name2, 120);
    }
    let chatId;
    try { chatId = context.getCurrentChatId?.() ?? context.chatId; } catch { chatId = context.chatId; }
    return `${identity}\u001fcharacter:${String(context.characterId ?? '')}|${text(chatId, 240).replace(/\.jsonl$/i, '').trim()}`;
}

function stopBootstrapAutoUpdates() {
    bootstrapAutoEpoch += 1;
    bootstrapAutoCleanup?.();
    bootstrapAutoCleanup = null;
}

function startBootstrapAutoUpdates({ wakeRuntime = () => ensureRuntime('auto-update-due') } = {}) {
    if (disabled || runtimeModule || bootstrapAutoCleanup) return Promise.resolve();
    if (bootstrapAutoPending) return bootstrapAutoPending;
    let context;
    try {
        context = globalThis.SillyTavern?.getContext?.();
        const raw = context?.extensionSettings?.heartbeatMemories?.autoUpdates;
        if (!raw || !Object.values(raw).some(rule => rule?.enabled === true)
            || !context.eventSource?.on || !globalThis.navigator?.locks?.request || !globalThis.localStorage) return Promise.resolve();
    } catch { return Promise.resolve(); }
    const lifetime = bootstrapAutoEpoch;
    // The pure floor policy has no runtime imports. A saved toggle alone never loads the bundle.
    bootstrapAutoPending = import(`./src/core/autoUpdatePolicy.js?heartbeat=${BUILD}`).then(async policy => {
        if (disabled || runtimeModule || lifetime !== bootstrapAutoEpoch
            || !policy.hasEnabledAutoUpdates(context.extensionSettings?.heartbeatMemories?.autoUpdates)) return;
        const snapshot = () => {
            try {
                const current = globalThis.SillyTavern?.getContext?.();
                if (!current || current.groupId || current.characterId == null || !Array.isArray(current.chat)) return null;
                const rules = policy.normalizeAutoUpdates(current.extensionSettings?.heartbeatMemories?.autoUpdates);
                if (!policy.hasEnabledAutoUpdates(rules)) return null;
                const memory = current.chatMetadata?.[MEMORY_KEY];
                if (Number(memory?.version) !== 3 || !Array.isArray(memory?.memories)) return null;
                let chatId;
                try { chatId = current.getCurrentChatId?.() ?? current.chatId; } catch { chatId = current.chatId; }
                const comparable = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, max).replace(/\.jsonl$/i, '').trim();
                if (!comparable(chatId, 240) || comparable(memory.chatId, 260) !== comparable(chatId, 240)) return null;
                return { scope: bootstrapAutoUpdateScope(current), floor: current.chat.length, ready: true,
                    revision: String(memory.archiveRevision || '').slice(0, 240), lifetime: bootstrapAutoEpoch, rules };
            } catch { return null; }
        };
        const scheduler = policy.createFloorScheduler({ snapshot, busy: () => disabled || !!runtimeModule,
            lock: (scope, job) => navigator.locks.request('heartbeat-auto:' + scope, { ifAvailable: true }, lock => lock ? job() : undefined),
            read: scope => policy.normalizeAutoUpdateCheckpoint(JSON.parse(localStorage.getItem(policy.autoUpdateStorageKey(scope)) || '{}')),
            write: (scope, value) => localStorage.setItem(policy.autoUpdateStorageKey(scope), JSON.stringify(value)),
            wake: () => {
                stopBootstrapAutoUpdates();
                // Do not await the runtime under the scheduler lock or consume its due checkpoint.
                void Promise.resolve().then(wakeRuntime).catch(showBootError);
            },
        });
        let timer = 0, stopped = false;
        const listener = () => {
            if (stopped) return Promise.resolve();
            let enabled = false;
            try { enabled = policy.hasEnabledAutoUpdates(globalThis.SillyTavern?.getContext?.()?.extensionSettings?.heartbeatMemories?.autoUpdates); } catch {}
            if (!enabled) { if (timer) clearInterval(timer); timer = 0; return Promise.resolve(); }
            if (!timer) timer = setInterval(listener, 5000);
            return scheduler.tick().catch(() => {
                stopBootstrapAutoUpdates();
                globalThis.toastr?.warning?.('自动更新检查点无法读取或保存，本轮已停止；请使用手动更新。', '心迹回廊');
            });
        };
        const source = context.eventSource, types = context.eventTypes || context.event_types || {};
        const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
        for (const type of events) source.on(type, listener);
        bootstrapAutoCleanup = () => { stopped = true; scheduler.stop(); if (timer) clearInterval(timer);
            for (const type of events) source.off?.(type, listener); };
        await listener();
    }).catch(() => {
        stopBootstrapAutoUpdates();
        globalThis.toastr?.warning?.('自动更新暂时无法启用，请使用手动更新。', '心迹回廊');
    }).finally(() => { bootstrapAutoPending = null; });
    return bootstrapAutoPending;
}

async function ensureRuntime(reason = 'unknown') {
    if (runtimeModule) return runtimeModule;
    if (bootPromise) return bootPromise;
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    bootPromise = (async () => {
        const module = await import(`./dist/heartbeatMemories.bundle.js?heartbeat=${BUILD}`);
        if (disabled) return module;
        stopBootstrapMountTimer();
        stopBootstrapAutoUpdates();
        unbindBootstrapEarlyOpen();
        removeBootstrapShells();
        runtimeModule = module;
        globalThis.__heartbeatMemoriesRuntimeLoaded = true;
        runtimeModule.initMemoryTheater();
        runtimeLoadFailed = false;
        removeExternalDiagnostic();
        globalThis.__heartbeatMemoriesBuild = BUILD;
        const finishedAt = globalThis.performance?.now?.() ?? Date.now();
        console.log(`[HeartbeatMemories] ${VERSION} runtime loaded on ${reason} in ${Math.max(0, Math.round(finishedAt - startedAt))}ms`);
        return runtimeModule;
    })().catch(error => {
        bootPromise = null;
        runtimeLoadFailed = true;
        if (!disabled) {
            mountBootstrapEntrypoints();
            bindBootstrapEarlyOpen();
        }
        throw error;
    });
    return bootPromise;
}

function requestArchiveOpen(source = 'bootstrap') {
    const now = Date.now();
    if (now - lastArchiveOpenAt < 700) return;
    lastArchiveOpenAt = now;
    void ensureRuntime('archive').then(module => {
        if (disabled) return;
        module.openArchiveLibrary?.(source);
    }).catch(showBootError);
}

function startBootstrap() {
    if (disabled || runtimeModule) return;
    void startBootstrapAutoUpdates();
    mountBootstrapEntrypoints();
    bindBootstrapEarlyOpen();
    if (!document.getElementById(MENU_ID)) {
        stopBootstrapMountTimer();
        let tries = 0;
        bootstrapTimer = setInterval(() => {
            tries += 1;
            mountBootstrapEntrypoints();
            if (runtimeModule || disabled || document.getElementById(MENU_ID) || tries >= 30) {
                stopBootstrapMountTimer();
            }
        }, 500);
    }
    globalThis.__heartbeatMemoriesBuild = `${BUILD}:bootstrap`;
    console.log(`[HeartbeatMemories] ${VERSION} lightweight bootstrap ready; full runtime deferred`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBootstrap, { once: true });
else queueMicrotask(startBootstrap);

export function onDisable() {
    disabled = true;
    stopBootstrapMountTimer();
    stopBootstrapAutoUpdates();
    unbindBootstrapEarlyOpen();
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] disable cleanup failed', safeBootstrapErrorDiagnostic(error)); }
    removeBootstrapShells();
    cleanupDiagnostics();
}

export function onClean() {
    disabled = true;
    stopBootstrapMountTimer();
    stopBootstrapAutoUpdates();
    unbindBootstrapEarlyOpen();
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] clean cleanup failed', safeBootstrapErrorDiagnostic(error)); }
    removeBootstrapShells();
    cleanupDiagnostics();
}

function cleanupDiagnostics() {
    document.removeEventListener('DOMContentLoaded', startBootstrap);
    removeExternalDiagnostic();
    globalThis.__heartbeatMemoriesRuntimeLoaded = false;
    for (const [key, owned] of [
        ['__heartbeatMemoriesGetPerformanceDiagnostic', getHeartbeatPerformanceDiagnostic],
        ['__heartbeatMemoriesRenderPerformanceDiagnostic', renderDiagnostic],
        ['__heartbeatMemoriesHidePerformanceDiagnostic', hideDiagnostic],
        ['__heartbeatMemoriesTogglePerformanceDiagnostic', toggleDiagnostic],
        ['__heartbeatMemoriesMountDiagnostics', mountExternalDiagnostic],
        ['__heartbeatMemoriesRemoveDiagnostics', removeExternalDiagnostic],
        ['__heartbeatMemoriesDeliverDiagnostic', deliverDiagnosticReport],
    ]) if (globalThis[key] === owned) delete globalThis[key];
}

export { VERSION, BUILD, bootPromise, ensureRuntime, getHeartbeatPerformanceDiagnostic,
    getDiagnosticReportText, mountExternalDiagnostic, deliverDiagnosticReport, startBootstrapAutoUpdates, bootstrapAutoUpdateScope };
