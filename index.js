const VERSION = '0.8.31';
const BUILD = '0.8.31-lazy-bootstrap-diagnostics-r42.0';

const SETTINGS_ID = 'heartbeat_memories_settings';
const MENU_ID = 'heartbeat_memories_menu_item';
const BOOTSTRAP_STYLE_ID = 'heartbeat_memories_bootstrap_styles';
const CACHE_KEY = 'heartbeatMemoriesTheaterV3';
const MEMORY_KEY = 'heartbeatMemoriesArchiveV3';
const CACHE_STORAGE_FORMAT = 'gzip-base64-v1';

let runtimeModule = null;
let bootPromise = null;
let bootstrapTimer = 0;
let bootstrapEarlyCleanup = null;
let lastArchiveOpenAt = 0;
let disabled = false;

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

function diagnosticRisk(base64Chars, sourceChars, legacyRaw) {
    if (legacyRaw) return { level: '注意', detail: '检测到旧版未压缩派生缓存；为避免诊断本身制造卡顿，本次不序列化测量它。' };
    const compressed = Math.max(0, Number(base64Chars) || 0);
    const source = Math.max(0, Number(sourceChars) || 0);
    if (compressed >= 1_500_000 || source >= 8_000_000) return { level: '高', detail: '当前聊天的 Heartbeat 派生缓存较大，宿主读取聊天 metadata 时可能出现明显等待。' };
    if (compressed >= 500_000 || source >= 3_000_000) return { level: '中', detail: '当前聊天已有较大的 Heartbeat 派生缓存；若真机进入该聊天变慢，建议继续观察。' };
    return { level: '低', detail: '从 Heartbeat metadata 尺寸看，没有发现明显的大缓存压力。' };
}

function getHeartbeatPerformanceDiagnostic() {
    let context = null;
    try { context = globalThis.SillyTavern?.getContext?.() || null; } catch {}
    if (!context) {
        return {
            snapshot: { available: false },
            text: '心跳回忆性能诊断（不解压缓存）\n\n当前还没有可读取的 SillyTavern 上下文。\n\n本诊断不会加载 Heartbeat 完整 runtime。',
        };
    }

    const metadata = context.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : {};
    const memory = metadata[MEMORY_KEY];
    const stored = metadata[CACHE_KEY];
    const memoryCount = Array.isArray(memory?.memories) ? memory.memories.length : 0;
    const messageCount = Array.isArray(context.chat) ? context.chat.length : 0;
    let chatId = '';
    try { chatId = String(context.getCurrentChatId?.() ?? context.chatId ?? ''); } catch { chatId = String(context.chatId || ''); }

    const compressed = !!stored && typeof stored === 'object'
        && stored.format === CACHE_STORAGE_FORMAT
        && typeof stored.data === 'string';
    const legacyRaw = !!stored && typeof stored === 'object' && !compressed;
    const base64Chars = compressed ? stored.data.length : 0;
    const compressedBytesApprox = compressed ? approximateBase64Bytes(stored.data) : 0;
    const sourceChars = compressed ? Math.max(0, Number(stored.sourceChars) || 0) : 0;
    const modes = compressed && Array.isArray(stored.modes)
        ? stored.modes.map(value => String(value || '')).filter(Boolean).slice(0, 32)
        : legacyRaw ? Object.keys(stored).filter(key => !['chatId', 'archiveRevision', 'updatedAt'].includes(key)).slice(0, 32) : [];
    const risk = diagnosticRisk(base64Chars, sourceChars, legacyRaw);
    const storage = compressed ? CACHE_STORAGE_FORMAT : legacyRaw ? 'legacy-uncompressed' : 'none';

    const rows = [
        '心跳回忆性能诊断（不解压缓存）',
        '',
        `当前聊天：${chatId || '未命名 / 未取得 ID'}`,
        `聊天消息数组：${messageCount} 条（只读取 length，没有遍历正文）`,
        `Mxxx 档案：${memoryCount} 条`,
        `派生缓存格式：${storage}`,
        `派生模式：${modes.length ? modes.join(' / ') : '无'}`,
    ];
    if (compressed) {
        rows.push(
            `派生缓存原始字符：${sourceChars.toLocaleString()}（${humanChars(sourceChars)}）`,
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
            chatId,
            messageCount,
            memoryCount,
            storage,
            modes,
            sourceChars,
            base64Chars,
            compressedBytesApprox,
            risk: risk.level,
            runtimeLoaded: !!runtimeModule,
        },
        text: rows.join('\n'),
    };
}

globalThis.__heartbeatMemoriesGetPerformanceDiagnostic = getHeartbeatPerformanceDiagnostic;

function renderDiagnostic(output = null) {
    const report = getHeartbeatPerformanceDiagnostic();
    if (output) {
        output.textContent = report.text;
        output.hidden = false;
    }
    try { console.info('[HeartbeatMemories] zero-decompression performance diagnostic', report.snapshot); } catch {}
    return report;
}

globalThis.__heartbeatMemoriesRenderPerformanceDiagnostic = renderDiagnostic;

function ensureBootstrapStyle() {
    if (document.getElementById(BOOTSTRAP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BOOTSTRAP_STYLE_ID;
    style.textContent = `
#${SETTINGS_ID}[data-rmt-bootstrap="1"]{margin-top:10px;padding:10px;border:1px solid rgba(142,191,213,.52);border-radius:12px;background:linear-gradient(135deg,rgba(255,248,251,.92),rgba(244,251,255,.92));color:#596b80;display:grid;gap:8px}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] .rmt-bootstrap-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] .rmt-bootstrap-head small{opacity:.68;font-size:9px;letter-spacing:.08em}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] .rmt-bootstrap-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] button{min-height:36px;border-radius:9px}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] .rmt-bootstrap-note{font-size:9px;line-height:1.5;opacity:.7}
#${SETTINGS_ID}[data-rmt-bootstrap="1"] pre{margin:0;padding:8px;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:9px;line-height:1.45;border-radius:8px;background:rgba(38,49,63,.07)}
#${MENU_ID}[data-rmt-bootstrap="1"]{cursor:pointer}
@media(max-width:760px){#${SETTINGS_ID}[data-rmt-bootstrap="1"] .rmt-bootstrap-actions{grid-template-columns:1fr}}
`;
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
    item.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>心跳回忆 · 档案室</span>';
    item.addEventListener('click', () => requestArchiveOpen('bootstrap-menu-click'));
    item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        requestArchiveOpen('bootstrap-menu-keyboard');
    });
    menu.appendChild(item);
    return true;
}

function mountBootstrapSettings() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const mount = document.querySelector('#extensions_settings2');
    if (!mount) return false;
    const panel = document.createElement('div');
    panel.id = SETTINGS_ID;
    panel.dataset.rmtBootstrap = '1';
    panel.innerHTML = `
      <div class="rmt-bootstrap-head"><b>心跳回忆</b><small>LAZY BOOTSTRAP</small></div>
      <div class="rmt-bootstrap-actions">
        <button type="button" class="menu_button" data-rmt-bootstrap-load-settings>加载完整设置</button>
        <button type="button" class="menu_button" data-rmt-bootstrap-diagnostic>性能诊断（不解压缓存）</button>
      </div>
      <div class="rmt-bootstrap-note">普通酒馆启动不会解析 Heartbeat 完整 runtime。只有第一次打开档案室或加载完整设置时才加载。</div>
      <pre data-rmt-bootstrap-diagnostic-output hidden></pre>`;
    panel.addEventListener('click', event => {
        const diag = event.target.closest?.('[data-rmt-bootstrap-diagnostic]');
        if (diag) {
            renderDiagnostic(panel.querySelector('[data-rmt-bootstrap-diagnostic-output]'));
            return;
        }
        if (event.target.closest?.('[data-rmt-bootstrap-load-settings]')) {
            void ensureRuntime('settings').then(() => {
                setTimeout(() => {
                    const full = document.getElementById(SETTINGS_ID);
                    full?.scrollIntoView?.({ block: 'nearest' });
                    full?.querySelector?.('.rmt-settings-header')?.click?.();
                }, 0);
            }).catch(showBootError);
        }
    });
    mount.appendChild(panel);
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
    if (disabled || runtimeModule) return;
    ensureBootstrapStyle();
    const settingsMounted = mountBootstrapSettings();
    const menuMounted = mountBootstrapMenu();
    if (settingsMounted && menuMounted) stopBootstrapMountTimer();
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
    console.error('[HeartbeatMemories] lazy runtime load failed', error);
    const message = `心跳回忆加载失败：${String(error?.message || error || '未知错误')}`;
    try { globalThis.toastr?.error?.(message, '心跳回忆'); } catch {}
}

async function ensureRuntime(reason = 'unknown') {
    if (runtimeModule) return runtimeModule;
    if (bootPromise) return bootPromise;
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    bootPromise = (async () => {
        const module = await import(`./dist/heartbeatMemories.bundle.js?heartbeat=${BUILD}`);
        if (disabled) return module;
        stopBootstrapMountTimer();
        unbindBootstrapEarlyOpen();
        removeBootstrapShells();
        runtimeModule = module;
        runtimeModule.initMemoryTheater();
        globalThis.__heartbeatMemoriesBuild = BUILD;
        const finishedAt = globalThis.performance?.now?.() ?? Date.now();
        console.log(`[HeartbeatMemories] ${VERSION} runtime loaded on ${reason} in ${Math.max(0, Math.round(finishedAt - startedAt))}ms`);
        return runtimeModule;
    })().catch(error => {
        bootPromise = null;
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
    mountBootstrapEntrypoints();
    bindBootstrapEarlyOpen();
    if (!document.getElementById(SETTINGS_ID) || !document.getElementById(MENU_ID)) {
        stopBootstrapMountTimer();
        let tries = 0;
        bootstrapTimer = setInterval(() => {
            tries += 1;
            mountBootstrapEntrypoints();
            if (runtimeModule || disabled || (document.getElementById(SETTINGS_ID) && document.getElementById(MENU_ID)) || tries >= 30) {
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
    unbindBootstrapEarlyOpen();
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] disable cleanup failed', error); }
    removeBootstrapShells();
}

export function onClean() {
    disabled = true;
    stopBootstrapMountTimer();
    unbindBootstrapEarlyOpen();
    try { runtimeModule?.destroyMemoryTheater?.(); } catch (error) { console.warn('[HeartbeatMemories] clean cleanup failed', error); }
    removeBootstrapShells();
}

export { VERSION, BUILD, bootPromise, ensureRuntime, getHeartbeatPerformanceDiagnostic };
