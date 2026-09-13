import * as cg_editor from '../ui/cgPromptEditor.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as baibai_image from './baibaiImage.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as creative_supplement from '../core/creativeSupplement.js';
import * as image_rules from './imagePromptRules.js';
import * as baiBai_characters from './baiBaiCharacters.js';
import * as core_cache from '../core/cache.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from './client.js';
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
    {
        const status = baibai_image.baiBaiImageState();
        return { detected: status.detected, available: status.available, reason: status.reason,
            provider: baibai_image.BAIBAI_IMAGE_PROVIDER, providerLabel: '柏宝绘', manual: false, command: null,
            backend: ['nai', 'comfyui'].includes(status.status?.backend) ? status.status.backend : '' };
    }

}

// Display-only copy; use the already-read public backend status, never keys or model settings.
export function imageDrawingConfirmationText(imageState, { replacing = false } = {}) {
    const channel = imageState?.backend === 'nai' ? 'NAI API'
        : imageState?.backend === 'comfyui' ? 'ComfyUI' : '生图渠道';
    const question = channel === '生图渠道'
        ? '是否调用柏宝绘，使用柏宝绘当前配置的生图渠道生图？'
        : `是否调用柏宝绘，使用柏宝绘配置的 ${channel} 生图？`;
    return question + (replacing ? '\n\n新图保存成功后替换当前图片引用，旧图片文件保留。' : '');
}

// The drawing adapter never receives raw generation rules. Legacy direct callers
// may pass an already-authored description; the UI uses a validated prepared plan.
export function buildBaiBaiSceneNl(prompt) { return sanitizeCgVisualText(prompt, 1800); }

export function sanitizeImageGenerationSlashPrompt(value) {
    return core_text.normalizeText(value, core_constants.MAX_CG_IMAGE_PROMPT_CHARS)
        .replace(/[{}]/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function invokeImageGeneration(prompt, context = core_context.getContext(), { signal = null, provider = null, orientation = 'landscape', characterName = '', onProgress = null, onSettled = null, targetKey = '', appearanceBinding = null, preparedPromptPlan = null } = {}) {
    // Explicit legacy requests must not silently switch providers or invoke /sd.
    const selectedProvider = provider || baibai_image.BAIBAI_IMAGE_PROVIDER;
    if (selectedProvider === baibai_image.BAIBAI_IMAGE_PROVIDER) {
        if (preparedPromptPlan) assertPreparedImagePrompt(preparedPromptPlan, preparedPromptPlan.target, appearanceBinding);
        const visual = preparedPromptPlan ? preparedPromptPlan.prompt : sanitizeCgVisualText(prompt);
        return baibai_image.generateBaiBaiImage(visual, {
            signal, orientation, characterName: characterName || context?.name2, onProgress, onSettled, targetKey, appearanceBinding,
            requestNl: preparedPromptPlan ? preparedPromptPlan.nl : buildBaiBaiSceneNl(visual),
            characterDirections: preparedPromptPlan?.directions || null,
            assertBeforeGenerate: preparedPromptPlan ? () => assertPreparedImagePrompt(preparedPromptPlan, preparedPromptPlan.target, appearanceBinding) : null,
        });
    }
    throw core_text.safeUserError('本版本仅支持柏宝绘，请启用其公开 API 并刷新；旧渠道图片仍可查看。', 'RMT_IMAGE_PROVIDER_RETIRED');
}

export function normalizeCgImageUrl(value) {
    return image_patch.normalizeCgImageUrl(value);
}

export function normalizeCgImageRecord(value) {
    return image_patch.normalizeCgImageRecord(value);
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
    return image_rules.imageSceneDescription(item, core_constants.MODE.ALBUM);
}

export function cgImageTaskKey(mode, itemId, context = core_context.currentCharacterGuard()) {
    return `cg-image:${core_context.chatScopeKey(context)}:${mode}:${core_text.safeId(itemId, 'cg')}`;
}

export function cgImageReservationKey(mode, itemId, context = core_context.currentCharacterGuard()) {
    // Billing dedupe is not a write capability: editing the same card's prose
    // must not unlock a still-running request. Save permissions continue to use
    // the separately captured, fingerprinted origin and item signature.
    return `cg-billing:${JSON.stringify([core_context.comparableChatId(core_context.getChatId(context)),
        String(context?.characterId ?? ''), core_context.currentCharacterAvatar(context), mode, String(itemId ?? '')])}`;
}

export function isCgImageDrawing(mode, itemId) {
    try { return runtimeState.activeCgImageTasks.has(cgImageTaskKey(mode, itemId))
        || baibai_image.isBaiBaiImageTargetPending(cgImageReservationKey(mode, itemId)); }
    catch { return false; }
}

export function cgImageStartBlockedReason(mode, itemId, context = core_context.currentCharacterGuard()) {
    const key = cgImageTaskKey(mode, itemId, context);
    if (runtimeState.activeCgImageTasks.has(key) || baibai_image.isBaiBaiImageTargetPending(cgImageReservationKey(mode, itemId, context))) {
        return '这张图片的绘制请求还未结束，请先等待，避免重复出图。';
    }
    if (runtimeState.activeCgImageTasks.size >= baibai_image.BAIBAI_IMAGE_CONCURRENCY
        || baibai_image.baiBaiImagePendingCount() >= baibai_image.BAIBAI_IMAGE_CONCURRENCY) {
        return '已有两张图片正在绘制，请等其中一张完成后再开始。';
    }
    return '';
}

// Style and panel actions belong to the daily-comic mode, even when a saved
// prompt or an edited scene is used. The wrapper is idempotent and bounded.
export function dailyComicImagePrompt(item, promptOverride) {
    const marker = 'DAILY_COMIC_Q_V1';
    const sceneMarker = '[SCENE] ';
    let scene = sanitizeCgVisualText(promptOverride === undefined
        ? normalizeCgImageRecord(item?.cgImage)?.prompt || item?.imagePrompt || item?.subtitle
        : promptOverride);
    if (scene.startsWith(marker) && scene.includes(sceneMarker)) scene = scene.slice(scene.indexOf(sceneMarker) + sceneMarker.length);
    const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, 4);
    const count = panels.length || Math.max(1, Math.min(4, Number(item?.panelCount) || 1));
    if (!scene && !panels.some(panel => sanitizeCgVisualText(panel?.action))) return '';
    const cameras = ['wide establishing shot', 'medium action shot', 'close-up reaction', 'different final angle'];
    const instructions = [
        marker,
        'chibi, super deformed, cute miniature anime characters, oversized heads and tiny bodies, Q版二头身，非正常成人身材比例',
        count === 1 ? 'single-panel comic' : `${count} distinct vertically arranged comic panels, sequential visual storytelling`,
        'consistent identity and clothing; different action, pose, expression and framing in each panel; do not duplicate or mirror a panel',
        ...Array.from({ length: count }, (_, index) => `Panel ${index + 1}: ${cameras[index]}; ${sanitizeCgVisualText(panels[index]?.action || panels[index]?.caption, 200)}`),
        'no text, no speech bubbles, no subtitles, no logo, no watermark',
    ].join(', ');
    const room = Math.max(0, core_constants.MAX_CG_IMAGE_PROMPT_CHARS - instructions.length - sceneMarker.length - 2);
    return `${instructions}\n${sceneMarker}${scene.slice(0, room)}`;
}

export function cgImageLayerHtml(item, { lazy = true } = {}) {
    const image = normalizeCgImageRecord(item?.cgImage);
    const abstract = `<div class="rmt-abstract" style="${ui_styles.abstractStyle(item?.visualSeed, item?.id)}"></div>`;
    if (!image) return abstract;
    const alt = `${core_text.normalizeText(item?.title, 120) || 'CG'} · 实图`;
    return `${abstract}<img class="rmt-cg-real" data-rmt-cg-image src="${core_text.esc(image.url)}" alt="${core_text.esc(alt)}" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`;
}

// Bind an editor/drawing operation to one local item. Neither model output nor a
// coincidentally identical item id in another chat can mint a target capability.
const capturedCgTargets = new WeakSet();

export function cgItemSignature(item) {
    return image_patch.cgItemSignature(item);
}

export function cgItemInSession(mode, session, itemId) {
    return image_patch.cgItemInSession(mode, session, itemId);
}

export function captureCgImageTarget(target = selectedCgTarget()) {
    if (!target || !archive_library.requireWritableArchiveAction()) return null;
    const { mode, session, item } = target;
    if (runtimeState.activeMode !== mode || runtimeState.activeSession !== session
        || cgItemInSession(mode, session, item?.id) !== item) return null;
    const context = core_context.currentCharacterGuard();
    const memory = archive_repository.requireArchive(context);
    if (core_context.comparableChatId(session.chatId) !== core_context.comparableChatId(core_context.getChatId(context))
        || session.archiveRevision !== memory.archiveRevision) return null;
    const origin = core_context.captureTaskOrigin(context, memory.archiveRevision);
    const captured = Object.freeze({ mode, session, itemId: item.id, origin,
        revision: memory.archiveRevision, signature: cgItemSignature(item),
        imageLifecycleEpoch: runtimeState.cgImageLifecycleEpoch });
    capturedCgTargets.add(captured);
    return captured;
}

export function isCgImageTargetCurrent(target, { requireSelection = true } = {}) {
    try {
        if (!capturedCgTargets.has(target) || !core_context.isCurrentTaskOrigin(target.origin)
            || target.imageLifecycleEpoch !== runtimeState.cgImageLifecycleEpoch
            || runtimeState.activeArchiveSnapshot) return false;
        const context = core_context.currentCharacterGuard();
        const memory = archive_repository.requireArchive(context);
        if (memory.archiveRevision !== target.revision) return false;
        const cache = core_cache.getCache(context);
        const expectedFence = core_cache.modeWriteFenceSignature(target.origin.modeWriteFences?.[target.mode]);
        if (core_cache.modeWriteFenceForCache(cache, target.mode) !== expectedFence) return false;
        const current = core_cache.loadSession(target.mode, { context, chatId: core_context.getChatId(context), memoryBank: memory, clone: false });
        if (current && cgItemSignature(cgItemInSession(target.mode, current, target.itemId)) !== target.signature) return false;
        if (cgItemSignature(cgItemInSession(target.mode, target.session, target.itemId)) !== target.signature) return false;
        if (!requireSelection) return true;
        return runtimeState.activeMode === target.mode && runtimeState.activeSession === target.session
            && (target.mode === core_constants.MODE.HEART
                ? (target.session.selectedStripId || target.session.dailyStrips?.[0]?.id) === target.itemId
                : target.session.selectedId === target.itemId);
    } catch { return false; }
}

export function assertCgImageTargetCurrent(target, options) {
    if (!isCgImageTargetCurrent(target, options)) throw core_text.safeUserError(
        '这张回忆、档案版本或聊天窗口已经变化，请重新打开画面提示词。旧内容没有改变。', 'RMT_CG_TARGET_CHANGED');
}

const preparedImagePrompts = new WeakSet();
function imageBackendFingerprint(status) {
    return JSON.stringify([String(status?.backend || ''), String(status?.model || ''), status?.supportsCharacters === true]);
}
function currentImagePromptState(target, binding) {
    assertCgImageTargetCurrent(target, { requireSelection: false });
    const state = baibai_image.baiBaiImageState();
    if (!state.available) throw baibai_image.baiBaiImageError(state.code);
    // Validate explicit binding and unsupported multi-character before a text/image charge.
    baiBai_characters.buildBaiBaiCharacterRequest(binding, state.api, state.status, 'scene');
    assertCgImageTargetCurrent(target, { requireSelection: false });
    return { rules: creative_supplement.promptRulesText(core_settings.getPluginSettings()),
        backend: imageBackendFingerprint(state.status) };
}
export function assertPreparedImagePrompt(plan, target, binding) {
    if (!preparedImagePrompts.has(plan) || plan.target !== target || plan.appearanceBinding !== binding) throw image_rules.imagePromptError('RMT_IMAGE_PROMPT_CHANGED');
    const now = currentImagePromptState(target, binding);
    if (now.rules !== plan.rules || now.backend !== plan.backend) throw image_rules.imagePromptError('RMT_IMAGE_PROMPT_CHANGED');
    return plan;
}
export async function prepareCgImagePrompt(target, { sceneDescription, appearanceBinding, taskKey, signal = null, isCurrent = null } = {}) {
    assertCgImageTargetCurrent(target);
    const context = core_context.currentCharacterGuard();
    const frozen = currentImagePromptState(target, appearanceBinding);
    const item = cgItemInSession(target.mode, target.session, target.itemId);
    const scene = sceneDescription === undefined ? image_rules.imageSceneDescription(item, target.mode) : sceneDescription;
    const input = image_rules.imageSceneInput(item, context, target.mode, scene, baiBai_characters.imagePromptActors(appearanceBinding));
    const assertCurrent = () => {
        if (signal?.aborted || isCurrent?.() === false) throw core_requestCoordinator.createGenerationAbortError();
        const now = currentImagePromptState(target, appearanceBinding);
        if (now.rules !== frozen.rules || now.backend !== frozen.backend) throw image_rules.imagePromptError('RMT_IMAGE_PROMPT_CHANGED');
    };
    assertCurrent();
    const raw = await generation_client.requestJson(image_rules.buildImagePromptRulesRequest(input), '正在整理画面提示词…', {
        context, contextEnvelope: '', origin: target.origin, mode: target.mode, purpose: 'image-prompt',
        taskKey: taskKey || `cg-prompt:${core_context.chatScopeKey(context)}:${target.mode}:${core_text.safeId(target.itemId, 'cg')}`,
        signal, assertRequestCurrent: assertCurrent, temperature: 0.25,
        // Exactly one explicit text request. Never retry by silently billing again.
    });
    assertCurrent();
    const result = image_rules.normalizeImagePromptResult(raw, input);
    const plan = Object.freeze({ ...result, target, appearanceBinding, ...frozen });
    preparedImagePrompts.add(plan);
    return plan;
}
export async function reconceiveCgImagePrompt(target, options = {}) {
    return prepareCgImagePrompt(target, options);
}

export function cgImageProviderBar({ readOnly = false } = {}) {
    const state = imageGenerationUiState();
    const status = state.provider === baibai_image.BAIBAI_IMAGE_PROVIDER ? state.reason : state.detected
        ? 'Image Generation 已连接'
        : state.manual
            ? '已手动勾选 Image Generation · 绘制时尝试 /sd 兜底'
            : '当前未检测到 Image Generation';
    const detail = readOnly ? `只读档案 · ${status}` : `${status}${state.available ? ' · 点击 🎨 绘制CG' : ''}`;
    return `<div class="rmt-cg-provider-bar ${state.available ? 'ready' : ''}"><span class="rmt-cg-provider-dot"></span><b>CG 实图</b><span>${core_text.esc(detail)}</span>${cgImageProgressHtml()}<button type="button" class="rmt-btn" data-rmt-action="refresh-image-provider">重新检测</button></div>`;
}

function visibleCgImageTask() {
    const selectedId = runtimeState.activeMode === core_constants.MODE.HEART
        ? runtimeState.activeSession?.selectedStripId || runtimeState.activeSession?.dailyStrips?.[0]?.id
        : runtimeState.activeSession?.selectedId;
    return [...runtimeState.activeCgImageTasks.values()].find(task =>
        task.mode === runtimeState.activeMode && task.itemId === selectedId && core_context.isCurrentTaskOrigin(task.origin));
}

export function cgImageProgressHtml() {
    const task = visibleCgImageTask();
    return task ? `<span data-rmt-cg-progress role="status" aria-live="polite">${core_text.esc(task.imageProgress || '正在准备图片…')}</span><button type="button" class="rmt-btn" data-rmt-action="cancel-cg-image">取消本次绘制</button>` : '';
}

export function updateCgImageProgress(taskKey, progress) {
    const task = runtimeState.activeCgImageTasks.get(taskKey);
    if (!task || task.controller.signal.aborted) return;
    const labels = { queued: '等待柏宝绘出图…', generating: '柏宝绘正在绘制…',
        'queued-remote': '在 ComfyUI 队列中等待…', retrying: '柏宝绘正在限流等待…', saving: '图片已生成，正在保存…' };
    const label = labels[progress?.phase];
    if (!label) return;
    task.imageProgress = label;
    if (task !== visibleCgImageTask()) return;
    const overlay = globalThis.document?.getElementById?.(core_constants.OVERLAY_ID);
    for (const node of overlay?.querySelectorAll?.('[data-rmt-cg-progress]') || []) node.textContent = label;
}

export function cancelCurrentCgImage() {
    visibleCgImageTask()?.controller?.abort();
}

export function refreshSettledCgImage(taskKey, origin) {
    // After a local cancellation/timeout the UI task is already removed, but the
    // provider may only now have released its key. Re-enable controls read-only.
    if (!runtimeState.activeCgImageTasks.has(taskKey) && core_context.isCurrentTaskOrigin(origin)
        && [core_constants.MODE.ALBUM, core_constants.MODE.ADV, core_constants.MODE.HEART].includes(runtimeState.activeMode)) ui_overlay.renderActive();
}

export function refreshCgImageProviderBars() {
    const overlay = globalThis.document?.getElementById?.(core_constants.OVERLAY_ID);
    for (const bar of overlay?.querySelectorAll?.('.rmt-cg-provider-bar') || []) {
        bar.outerHTML = cgImageProviderBar({ readOnly: !!runtimeState.activeArchiveSnapshot });
    }
}

export function imageGenerationUnavailableMessage(state = imageGenerationUiState()) {
    if (state.provider === baibai_image.BAIBAI_IMAGE_PROVIDER) return state.reason;
    return '请安装或更新柏宝绘，启用公开 API 并刷新页面后重新检测。';
}

export function refreshImageGenerationUi() {
    const state = imageGenerationUiState(core_context.getContext());
    if (runtimeState.activeMode && runtimeState.activeSession) ui_overlay.renderActive();
    const message = state.provider === baibai_image.BAIBAI_IMAGE_PROVIDER ? state.reason : state.detected
        ? '已检测到 SillyTavern Image Generation（/imagine、/sd 或 /img），绘制按钮可以直接使用。'
        : state.manual
            ? '自动检测仍未发现命令，但你已手动勾选 Image Generation；绘制时会使用受控的 /sd quiet=true 兜底。'
            : imageGenerationUnavailableMessage(state);
    globalThis.toastr?.[state.available ? 'success' : 'info']?.(message, '心迹回廊');
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

export function deferCgImageIfOriginChanged(target, image) {
    if (!capturedCgTargets.has(target) || target.imageLifecycleEpoch !== runtimeState.cgImageLifecycleEpoch
        || Number(target.origin.lifecycleEpoch) !== runtimeState.runtimeLifecycleEpoch) {
        throw core_text.safeUserError('这次图片任务已失效，旧图已保留。', 'RMT_CG_TARGET_CHANGED');
    }
    if (core_context.isCurrentTaskOrigin(target.origin)) return null;
    const patch = image_patch.normalizeCgImagePatch({ version: 1, mode: target.mode, itemId: target.itemId,
        expectedSignature: target.signature, image });
    if (!patch) throw core_text.safeUserError('图片结果无法安全写回，旧图已保留。', 'RMT_CG_PATCH_INVALID');
    const durable = core_requestCoordinator.queueDeferredCommit(target.origin, { kind: 'cgImagePatch', patch });
    return { deferred: true, durable };
}

export function abortActiveCgImageTasks() {
    for (const task of runtimeState.activeCgImageTasks.values()) {
        try { task?.controller?.abort?.(); } catch {}
    }
}

export async function drawSelectedCgImage({ promptOverride, expectedTarget = null, onAccepted = null, appearanceBinding = null, preparedPromptPlan = null } = {}) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = selectedCgTarget();
    if (!target) return;
    if (!appearanceBinding || !preparedPromptPlan) return cg_editor.openCgPromptEditor();
    const { mode, session, item } = target;
    let captured;
    try { captured = expectedTarget || captureCgImageTarget(target); assertCgImageTargetCurrent(captured); assertPreparedImagePrompt(preparedPromptPlan, captured, appearanceBinding); }
    catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); return; }
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        return;
    }
    const imageState = imageGenerationUiState(context);
    if (!imageState.available) {
        globalThis.toastr?.info?.(imageGenerationUnavailableMessage(imageState), '心迹回廊');
        return;
    }
    const blockedReason = cgImageStartBlockedReason(mode, item.id, context);
    if (blockedReason) {
        globalThis.toastr?.info?.(blockedReason, '心迹回廊');
        return;
    }
    const previous = normalizeCgImageRecord(item.cgImage);
    const confirmDraw = previous ? ui_overlay.confirmExplicitActionTwice : ui_overlay.confirmExplicitAction;
    const confirmed = confirmDraw(
        previous ? `重新绘制「${item.title}」CG？` : `绘制「${item.title}」CG？`,
        imageDrawingConfirmationText(imageState, { replacing: !!previous }),
        { destructive: !!previous },
    );
    if (!confirmed) return;

    try { assertCgImageTargetCurrent(captured); }
    catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); return; }
    const prompt = preparedPromptPlan.prompt;
    if (!prompt) {
        globalThis.toastr?.error?.('这张 CG 没有可用的可视化描述，无法绘制。', '心迹回廊');
        return;
    }
    const expectedChatId = core_context.getChatId(context);
    const origin = captured.origin;
    const lifecycleEpoch = runtimeState.cgImageLifecycleEpoch;
    const itemId = item.id;
    const taskKey = cgImageTaskKey(mode, itemId, context);
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再绘制 CG。`, '心迹回廊');
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
    if (typeof onAccepted === 'function') onAccepted();
    renderCurrentCgMode(mode, session);
    try {
        const generated = await invokeImageGeneration(prompt, context, {
            appearanceBinding, preparedPromptPlan, provider: imageState.provider, signal: controller.signal, orientation: 'landscape', characterName: context.name2,
            targetKey: cgImageReservationKey(mode, itemId, context),
            onSettled: () => refreshSettledCgImage(taskKey, origin),
            onProgress: progress => updateCgImageProgress(taskKey, progress),
        });
        const url = normalizeCgImageUrl(generated?.url);
        if (!url) throw new Error('生图插件没有返回可保存的 SillyTavern 本地图片路径。');
        if (runtimeState.cgImageLifecycleEpoch !== lifecycleEpoch) {
            globalThis.toastr?.warning?.('CG 已由生图扩展完成，但插件已重载/停用，因此没有接收旧运行实例的图片结果。', '心迹回廊');
            return;
        }
        const nextImage = {
            url,
            prompt,
            provider: generated.provider,
            generatedAt: Date.now(),
        };
        if (!core_context.isCurrentTaskOrigin(origin)) {
            if (session.archiveRevision !== captured.revision || cgItemSignature(item) !== captured.signature) {
                throw core_text.safeUserError('原回忆已变化，新图片没有替换旧图；可以在生图插件图库中查看。', 'RMT_CG_TARGET_CHANGED');
            }
            const { durable } = deferCgImageIfOriginChanged(captured, nextImage);
            globalThis.toastr?.[durable ? 'success' : 'warning']?.(
                durable
                    ? `CG 已绘制并安全等待写回：${item.title}；回到原聊天后会自动保存引用。`
                    : `CG 已绘制：${item.title}；结果暂存在当前页面，回到原聊天前不要刷新。`,
                '心迹回廊',
            );
            return;
        }
        assertCgImageTargetCurrent(captured, { requireSelection: false });
        const committed = await core_cache.commitSessionMutation(mode, expectedChatId, origin, (latest, memoryBank) => {
            const liveItem = cgItemInSession(mode, latest, itemId);
            if (memoryBank.archiveRevision !== captured.revision || !liveItem
                || cgItemSignature(liveItem) !== captured.signature) return null;
            liveItem.cgImage = nextImage;
            return latest;
        }, session);
        if (!committed) {
            throw new Error('图片已生成，但当前档案版本已变化，未保存 CG 图片引用。');
        }
        const mayUpdateUi = core_context.isCurrentTaskOrigin(origin)
            && archive_repository.getImportedMemory(core_context.getContext())?.archiveRevision === captured.revision
            && runtimeState.cgImageLifecycleEpoch === lifecycleEpoch;
        if (mayUpdateUi) item.cgImage = nextImage;
        if (mayUpdateUi && runtimeState.activeMode === mode && runtimeState.activeSession?.kind === mode) {
            const activeItem = mode === core_constants.MODE.ALBUM
                ? runtimeState.activeSession.entries?.find(entry => entry.id === itemId)
                : runtimeState.activeSession.events?.find(entry => entry.id === itemId);
            if (activeItem) activeItem.cgImage = nextImage;
        }
        globalThis.toastr?.success?.(`CG 已绘制：${item.title}`, '心迹回廊');
    } catch (error) {
        console.error('[HeartbeatMemories] CG image generation failed', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    } finally {
        runtimeState.activeCgImageTasks.delete(taskKey);
        renderCurrentCgMode(mode, session);
    }
}

export async function clearSelectedCgImage() {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = selectedCgTarget();
    if (!target) return;
    const { mode, session, item } = target;
    if (isCgImageDrawing(mode, item.id)) return globalThis.toastr?.info?.('请先取消正在绘制的图片，再移除旧图引用。', '心迹回廊');
    const image = normalizeCgImageRecord(item.cgImage);
    if (!image) return;
    if (!ui_overlay.confirmExplicitActionTwice(
        `恢复「${item.title}」的抽象 CG？`,
        '只会从心迹回廊缓存中移除这张图片的引用，不会删除 SillyTavern 已保存的图片文件。',
        { destructive: false },
    )) return;
    const previousImage = item.cgImage;
    item.cgImage = null;
    const expectedChatId = core_text.normalizeText(session.chatId, 240);
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    if (!await core_cache.commitSession(mode, session, expectedChatId, origin)) {
        item.cgImage = previousImage;
        globalThis.toastr?.error?.('当前档案版本已经变化，未移除 CG 图片引用。', '心迹回廊');
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
