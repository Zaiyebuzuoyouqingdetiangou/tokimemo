// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_advEventView from '../ui/advEventView.js';
import * as ui_albumView from '../ui/albumView.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_styles from '../ui/styles.js';

export const IMAGE_GENERATION_COMMAND_NAMES = Object.freeze(['imagine', 'sd', 'img']);

export function imageGenerationCommand(context = core_context.getContext()) {
    const registries = [context?.SlashCommandParser?.commands, globalThis?.SlashCommandParser?.commands].filter(Boolean);
    for (const name of IMAGE_GENERATION_COMMAND_NAMES) {
        for (const registry of registries) {
            const command = registry?.[name];
            if (command && typeof command.callback === 'function') return command;
        }
    }
    return null;
}

export function imageGenerationUiState(context = core_context.getContext()) {
    const command = imageGenerationCommand(context);
    const manual = core_settings.getPluginSettings(context).imageGenerationManualEnabled === true;
    return {
        command,
        detected: !!command,
        manual,
        provider: core_constants.CG_IMAGE_PROVIDER,
        providerLabel: 'SillyTavern Image Generation',
        available: !!command || manual,
    };
}

export function sanitizeImageGenerationSlashPrompt(value) {
    return core_text.normalizeText(value, core_constants.MAX_CG_IMAGE_PROMPT_CHARS)
        .replace(/[{}]/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function invokeImageGeneration(prompt, context = core_context.getContext(), { signal = null } = {}) {
    if (signal?.aborted) throw signal.reason || Object.assign(new Error('生图请求已取消。'), { name: 'AbortError' });
    const direct = imageGenerationCommand(context);
    if (direct) {
        const url = await core_settings.invokeSlashCommandCapture(direct, { quiet: 'true', gallery: 'false' }, prompt, context);
        if (signal?.aborted) throw signal.reason || Object.assign(new Error('生图请求已取消。'), { name: 'AbortError' });
        return { url, provider: core_constants.CG_IMAGE_PROVIDER };
    }
    const settings = core_settings.getPluginSettings(context);
    if (!settings.imageGenerationManualEnabled) {
        throw new Error('没有检测到 SillyTavern Image Generation 的 /imagine、/sd 或 /img 命令。');
    }
    if (typeof context.executeSlashCommandsWithOptions !== 'function') {
        throw new Error('你已手动勾选 Image Generation，但当前 SillyTavern 没有提供公开的 Slash Command 执行接口。');
    }
    const safePrompt = sanitizeImageGenerationSlashPrompt(prompt);
    if (!safePrompt) throw new Error('生图提示为空，无法调用手动 /sd 兜底。');
    const result = await context.executeSlashCommandsWithOptions(`/sd quiet=true ${safePrompt}`);
    if (signal?.aborted) throw signal.reason || Object.assign(new Error('生图请求已取消。'), { name: 'AbortError' });
    if (result?.isError) {
        throw new Error(`手动 /sd 调用失败：${core_text.normalizeText(result?.errorMessage || result?.abortReason, 500) || 'Image Generation 没有接受请求。'}`);
    }
    const pipe = core_text.normalizeText(result?.pipe, 4096);
    if (!pipe) throw new Error('手动 /sd 已执行，但没有返回可保存的图片路径。请确认 Image Generation 已启用并完成配置。');
    return { url: pipe, provider: core_constants.CG_IMAGE_PROVIDER };
}

export function normalizeCgImageUrl(value) {
    const raw = core_text.normalizeText(value, 4096);
    if (!raw) return '';
    try {
        const base = globalThis.location?.href || 'http://localhost/';
        const parsed = new URL(raw, base);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        const currentOrigin = globalThis.location?.origin;
        if (currentOrigin && parsed.origin !== currentOrigin) return '';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 4096);
    } catch {
        return '';
    }
}

export function normalizeCgImageRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const url = normalizeCgImageUrl(value.url);
    if (!url) return null;
    return {
        url,
        prompt: core_text.normalizeText(value.prompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS),
        provider: core_constants.CG_IMAGE_PROVIDER,
        generatedAt: Math.max(0, Number(value.generatedAt) || 0),
    };
}

export function sanitizeCgVisualText(value, limit = core_constants.MAX_CG_IMAGE_PROMPT_CHARS) {
    let text = core_text.normalizeText(value, limit);
    if (!text) return '';
    text = text
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\{\{[^{}]{1,100}\}\}/g, ' ')
        .replace(/\b(?:sourceMemoryIds?|sourceMemoryAnchor|WORLD_INFO_TEXT|MEMORY_POOL_JSON|UNTRUSTED_[A-Z0-9_]+)\b/gi, ' ')
        .replace(/<[^>]{0,500}>/g, ' ');
    return core_text.normalizeText(text.replace(/\s{2,}/g, ' '), limit);
}

export function cgImagePromptForItem(item) {
    const authored = sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
    const visibleDescription = authored || sanitizeCgVisualText(item?.cgDesc || item?.desc, 1100);
    const seeds = core_text.cleanArray(item?.visualSeed, 10, 80).map(seed => sanitizeCgVisualText(seed, 80)).filter(Boolean);
    const prompt = [
        'visual novel event CG, cinematic anime illustration, 16:9 landscape composition, no text, no subtitle, no logo, no watermark',
        visibleDescription,
        seeds.length ? `visible details: ${seeds.join(', ')}` : '',
        'single coherent still image, expressive composition, scene-accurate clothing and environment',
    ].filter(Boolean).join(', ');
    return core_text.normalizeText(prompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
}

export function cgImageTaskKey(mode, itemId, context = core_context.currentCharacterGuard()) {
    return `cg-image:${core_context.chatScopeKey(context)}:${mode}:${core_text.safeId(itemId, 'cg')}`;
}

export function isCgImageDrawing(mode, itemId) {
    try { return runtimeState.activeCgImageTasks.has(cgImageTaskKey(mode, itemId)); }
    catch { return false; }
}

export function cgImageLayerHtml(item, { lazy = true } = {}) {
    const image = normalizeCgImageRecord(item?.cgImage);
    const abstract = `<div class="rmt-abstract" style="${ui_styles.abstractStyle(item?.visualSeed, item?.id)}"></div>`;
    if (!image) return abstract;
    const alt = `${core_text.normalizeText(item?.title, 120) || 'CG'} · 实图`;
    return `${abstract}<img class="rmt-cg-real" data-rmt-cg-image src="${core_text.esc(image.url)}" alt="${core_text.esc(alt)}" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer"><span class="rmt-cg-real-badge">CG IMAGE</span>`;
}

export function cgImageProviderBar({ readOnly = false } = {}) {
    const state = imageGenerationUiState();
    const status = state.detected
        ? 'Image Generation 已连接'
        : state.manual
            ? '已手动勾选 Image Generation · 绘制时尝试 /sd 兜底'
            : '当前未检测到 Image Generation';
    const detail = readOnly ? `只读档案 · ${status}` : `${status}${state.available ? ' · 点击 🎨 绘制CG' : ''}`;
    return `<div class="rmt-cg-provider-bar ${state.available ? 'ready' : ''}"><span class="rmt-cg-provider-dot"></span><b>CG 实图</b><span>${core_text.esc(detail)}</span><button type="button" class="rmt-btn" data-rmt-action="refresh-image-provider">重新检测</button></div>`;
}

export function imageGenerationUnavailableMessage() {
    return '没有检测到 SillyTavern Image Generation。请先启用并配置扩展；自动检测失败时可在心跳回忆设置中手动勾选 /sd 兜底。';
}

export function refreshImageGenerationUi() {
    const state = imageGenerationUiState(core_context.getContext());
    if (runtimeState.activeMode && runtimeState.activeSession) ui_overlay.renderActive();
    const message = state.detected
        ? '已检测到 SillyTavern Image Generation（/imagine、/sd 或 /img），绘制按钮可以直接使用。'
        : state.manual
            ? '自动检测仍未发现命令，但你已手动勾选 Image Generation；绘制时会使用受控的 /sd quiet=true 兜底。'
            : imageGenerationUnavailableMessage(state);
    globalThis.toastr?.[state.available ? 'success' : 'info']?.(message, '心跳回忆');
}

export function indexedArchiveMatchesCurrentChat(entry, context = core_context.getContext()) {
    try {
        if (!entry) return false;
        const wantedChatId = core_context.comparableChatId(entry.chatId);
        if (!wantedChatId || core_context.comparableChatId(core_context.getChatId(context)) !== wantedChatId) return false;
        if (!core_context.archiveEntryMatchesContextCharacter(entry, context)) return false;
        const memory = archive_repository.getImportedMemory(context);
        if (!memory || core_context.comparableChatId(memory.chatId) !== wantedChatId) return false;
        return true;
    } catch {
        return false;
    }
}

export function selectedCgTarget() {
    if (runtimeState.activeMode === core_constants.MODE.ALBUM && runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
        const item = ui_albumView.selectedAlbumEntry();
        return item?.unlocked ? { mode: core_constants.MODE.ALBUM, session: runtimeState.activeSession, item } : null;
    }
    if (runtimeState.activeMode === core_constants.MODE.ADV && runtimeState.activeSession?.kind === core_constants.MODE.ADV) {
        const item = ui_advEventView.selectedAdvEvent();
        return item ? { mode: core_constants.MODE.ADV, session: runtimeState.activeSession, item } : null;
    }
    return null;
}

export function renderCurrentCgMode(mode, session) {
    if (runtimeState.activeMode !== mode || runtimeState.activeSession !== session || document.getElementById(core_constants.OVERLAY_ID)?.hidden) return;
    if (mode === core_constants.MODE.ALBUM) ui_albumView.renderAlbum();
    else if (mode === core_constants.MODE.ADV) ui_advEventView.renderAdvMode();
}

export function deferCgSessionIfOriginChanged(origin, mode, session) {
    if (core_context.isCurrentTaskOrigin(origin)) return null;
    const durable = core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [mode]: session } });
    return { deferred: true, durable };
}

export function abortActiveCgImageTasks() {
    for (const task of runtimeState.activeCgImageTasks.values()) {
        try { task?.controller?.abort?.(); } catch {}
    }
}

export async function drawSelectedCgImage() {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = selectedCgTarget();
    if (!target) return;
    const { mode, session, item } = target;
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
        return;
    }
    const imageState = imageGenerationUiState(context);
    if (!imageState.available) {
        globalThis.toastr?.info?.(imageGenerationUnavailableMessage(imageState), '心跳回忆');
        return;
    }
    if (runtimeState.activeCgImageTasks.size >= 1) {
        globalThis.toastr?.info?.('已有一张 CG 正在绘制，请等它完成后再绘制下一张。', '心跳回忆');
        return;
    }
    const previous = normalizeCgImageRecord(item.cgImage);
    const confirmDraw = previous ? ui_overlay.confirmExplicitActionTwice : ui_overlay.confirmExplicitAction;
    const confirmed = confirmDraw(
        previous ? `重新绘制「${item.title}」CG？` : `绘制「${item.title}」CG？`,
        `${previous ? '新的图片成功后会替换当前 CG 图片引用；旧图片文件不会由心跳回忆主动删除。\n\n' : ''}这会调用${imageState.providerLabel || '已配置的生图插件'}，可能消耗本地算力、额度或付费点数。只会发送这张 CG 的可见画面提示，不发送聊天原文、档案原文、世界书原文、私人终端内容或任何 API 凭据。`,
        { destructive: !!previous },
    );
    if (!confirmed) return;

    const prompt = cgImagePromptForItem(item);
    if (!prompt) {
        globalThis.toastr?.error?.('这张 CG 没有可用的可视化描述，无法绘制。', '心跳回忆');
        return;
    }
    const expectedChatId = core_context.getChatId(context);
    const memoryBank = archive_repository.requireArchive(context);
    const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const lifecycleEpoch = runtimeState.cgImageLifecycleEpoch;
    const itemId = item.id;
    const taskKey = cgImageTaskKey(mode, itemId, context);
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再绘制 CG。`, '心跳回忆');
        return;
    }
    const controller = new AbortController();
    runtimeState.activeCgImageTasks.set(taskKey, {
        mode,
        itemId,
        origin,
        label: mode === core_constants.MODE.ALBUM ? '相簿 CG 绘制' : 'ADV CG 绘制',
        startedAt: Date.now(),
        controller,
    });
    renderCurrentCgMode(mode, session);
    try {
        const generated = await invokeImageGeneration(prompt, context, { provider: imageState.provider, signal: controller.signal });
        const url = normalizeCgImageUrl(generated?.url);
        if (!url) throw new Error('生图插件没有返回可保存的 SillyTavern 本地图片路径。');
        if (runtimeState.cgImageLifecycleEpoch !== lifecycleEpoch) {
            globalThis.toastr?.warning?.('CG 已由生图扩展完成，但插件已重载/停用，因此没有接收旧运行实例的图片结果。', '心跳回忆');
            return;
        }
        const nextImage = {
            url,
            prompt,
            provider: core_constants.CG_IMAGE_PROVIDER,
            generatedAt: Date.now(),
        };
        if (!core_context.isCurrentTaskOrigin(origin)) {
            item.cgImage = nextImage;
            const { durable } = deferCgSessionIfOriginChanged(origin, mode, session);
            globalThis.toastr?.[durable ? 'success' : 'warning']?.(
                durable
                    ? `CG 已绘制并安全等待写回：${item.title}；回到原聊天后会自动保存引用。`
                    : `CG 已绘制：${item.title}；结果暂存在当前页面，回到原聊天前不要刷新。`,
                '心跳回忆',
            );
            return;
        }
        const liveContext = core_context.currentCharacterGuard();
        const liveMemoryBank = archive_repository.requireArchive(liveContext);
        const latestSession = core_cache.loadSession(mode, { context: liveContext, chatId: expectedChatId, memoryBank: liveMemoryBank, clone: false }) || session;
        const liveItem = mode === core_constants.MODE.ALBUM
            ? latestSession.entries?.find(entry => entry.id === itemId)
            : latestSession.events?.find(entry => entry.id === itemId);
        if (!liveItem) throw new Error('CG 事件已经变化，已停止保存图片引用。');
        const previousImage = liveItem.cgImage;
        liveItem.cgImage = nextImage;
        const committed = core_cache.saveSession(mode, latestSession, expectedChatId);
        if (!committed) {
            liveItem.cgImage = previousImage;
            throw new Error('图片已生成，但当前档案版本已变化，未保存 CG 图片引用。');
        }
        if (runtimeState.activeMode === mode && runtimeState.activeSession?.kind === mode) {
            const activeItem = mode === core_constants.MODE.ALBUM
                ? runtimeState.activeSession.entries?.find(entry => entry.id === itemId)
                : runtimeState.activeSession.events?.find(entry => entry.id === itemId);
            if (activeItem) activeItem.cgImage = nextImage;
        }
        globalThis.toastr?.success?.(`CG 已绘制：${item.title}`, '心跳回忆');
    } catch (error) {
        console.error('[HeartbeatMemories] CG image generation failed', error);
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    } finally {
        runtimeState.activeCgImageTasks.delete(taskKey);
        renderCurrentCgMode(mode, session);
    }
}

export function clearSelectedCgImage() {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = selectedCgTarget();
    if (!target) return;
    const { mode, session, item } = target;
    const image = normalizeCgImageRecord(item.cgImage);
    if (!image) return;
    if (!ui_overlay.confirmExplicitActionTwice(
        `恢复「${item.title}」的抽象 CG？`,
        '只会从心跳回忆缓存中移除这张图片的引用，不会删除 SillyTavern 已保存的图片文件。',
        { destructive: false },
    )) return;
    const previousImage = item.cgImage;
    item.cgImage = null;
    const expectedChatId = core_text.normalizeText(session.chatId, 240);
    if (!core_cache.saveSession(mode, session, expectedChatId)) {
        item.cgImage = previousImage;
        globalThis.toastr?.error?.('当前档案版本已经变化，未移除 CG 图片引用。', '心跳回忆');
        return;
    }
    renderCurrentCgMode(mode, session);
}

export function handleOverlayMediaError(event) {
    const image = event.target?.closest?.('[data-rmt-cg-image]');
    if (!image) return;
    image.hidden = true;
    image.nextElementSibling?.classList?.contains('rmt-cg-real-badge') && (image.nextElementSibling.hidden = true);
}
