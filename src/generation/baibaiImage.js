import * as character_scene from './cgCharacterScene.js';
// Original adapter for the author's documented STBaiBaiImage API v1.
// No third-party implementation, settings, credentials or DOM are accessed.
import * as image_patch from '../core/cgImagePatch.js';
import * as core_text from '../core/text.js';
import * as core_context from '../core/context.js';
import * as appearance from './cgAppearance.js';

export const BAIBAI_IMAGE_PROVIDER = 'baibai-image';
export const BAIBAI_IMAGE_WAIT_NOTICE_MS = 300000;
// Keep a cancelled provider call reserved until its promise really settles.
// Otherwise an uncooperative backend could be charged twice for the same item.
const pendingGenerations = new Map();
const ownErrors = new WeakSet();

const MESSAGES = Object.freeze({
    BBI_NOT_READY: '未检测到柏宝绘公开 API v1。若已安装柏宝绘，请更新到支持公开接口的版本，启用后刷新页面；刚完成加载可点击“重新检测”。',
    BBI_VERSION: '柏宝绘接口版本或能力不兼容，需要公开 API v1 和图库保存能力。',
    BBI_NOT_CONFIGURED: '柏宝绘出图渠道尚未配置完成，请在柏宝绘中检查 NAI / ComfyUI 设置。',
    BBI_INVALID_ARGS: '柏宝绘未接受这次画面提示，请检查画面描述后重试。',
    BBI_RATE_LIMITED: '柏宝绘生图限流，内置等待已结束；本次不会再自动重试或切换渠道。',
    BBI_BACKEND_ERROR: '柏宝绘出图失败，请检查其渠道配置与请求历史。旧图已保留。',
    BBI_SAVE_FAILED: '图片已生成，但没有取得可保存的本地路径。旧图已保留；请检查柏宝绘的图库保存状态，避免重复出图。',
    BBI_ABORTED: '已取消接收本次图片，旧图已保留。',
    BBI_TARGET_BUSY: '这张图片的绘制请求还未结束，请先等待，避免重复出图。',
});

export function baiBaiImageError(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'BBI_BACKEND_ERROR';
    const error = new Error(MESSAGES[safeCode]);
    error.code = safeCode;
    error.safeUserMessage = error.message;
    error.safeToDisplay = true;
    ownErrors.add(error);
    if (safeCode === 'BBI_ABORTED') error.name = 'AbortError';
    return error;
}

export function baiBaiImageState() {
    try {
        const api = globalThis.STBaiBaiImage;
        if (!api) return { available: false, detected: false, reason: MESSAGES.BBI_NOT_READY, code: 'BBI_NOT_READY' };
        if (api.apiVersion !== 1 || api.capabilities?.generate !== true || api.capabilities?.saveToGallery !== true
            || typeof api.generate !== 'function' || typeof api.getBackendStatus !== 'function') {
            return { available: false, detected: true, reason: MESSAGES.BBI_VERSION, code: 'BBI_VERSION' };
        }
        const status = api.getBackendStatus();
        if (status?.configured !== true) return { available: false, detected: true, reason: MESSAGES.BBI_NOT_CONFIGURED, code: 'BBI_NOT_CONFIGURED' };
        return { api, backend: status.backend, supportsCharacters: status.supportsCharacters === true,
            available: true, detected: true, reason: '柏宝绘已连接 · API v1', code: '' };
    } catch {
        return { available: false, detected: false, reason: MESSAGES.BBI_BACKEND_ERROR, code: 'BBI_BACKEND_ERROR' };
    }
}

function savedImagePath(value) { return image_patch.savedLocalImagePath(value); }

function publicFailure(error) {
    const mapped = {
        aborted: 'BBI_ABORTED', not_configured: 'BBI_NOT_CONFIGURED', invalid_args: 'BBI_INVALID_ARGS',
        rate_limited: 'BBI_RATE_LIMITED', backend_error: 'BBI_BACKEND_ERROR',
    };
    // Never forward third-party message, cause, response, prompt or credentials.
    let code;
    try { code = typeof error?.code === 'string' ? mapped[error.code] : ''; } catch {}
    return baiBaiImageError(code);
}

export function baiBaiImagePendingCount() { return pendingGenerations.size; }
export function isBaiBaiImageTargetPending(targetKey) { return !!targetKey && pendingGenerations.has(targetKey); }

// The editor and sender use identical resolved scene/character channels.
// Reading the selected provider's public character library never generates an image.
export function baiBaiSendPreview(prompt, { promptMetadata = null, context = core_context.getContext(), state = baiBaiImageState(), singlePrompt = false, preservePrompt = false, avatarPromptParts = null } = {}) {
    const visual = core_text.normalizeText(prompt, preservePrompt ? Infinity : 1800);
    if (!visual) throw baiBaiImageError('BBI_INVALID_ARGS');
    // Freeze grouping before the provider awaits; its default otherwise reads the new chat at save time.
    const metadata = appearance.resolveCgAppearanceMetadata(context,
        appearance.scopeCgPromptMetadata(visual, promptMetadata), { provider: BAIBAI_IMAGE_PROVIDER, api: state.api });
    if (metadata?.flatPromptOverride) return { prompt: metadata.flatPrompt || visual, nl: '' };
    const fullVisual = preservePrompt && !metadata ? visual : appearance.cgPreparedVisualPrompt(visual, metadata);
    let primaryPrompt = !state.supportsCharacters && metadata
        ? metadata.flatPrompt || fullVisual : metadata?.sceneTags || visual;
    if (!state.supportsCharacters) primaryPrompt = appearance.cgFlatPromptWithNaturalLooks(primaryPrompt, metadata);
    // Daily-comic constraints come from the local mode wrapper. Providers that only
    // consume prompt must receive the same panel actions as those that consume nl.
    const sceneMarker = '\n[SCENE] ';
    const comicEnd = visual.startsWith('DAILY_COMIC_Q_V1') ? visual.indexOf(sceneMarker) : -1;
    if (comicEnd > 0 && primaryPrompt !== visual && !primaryPrompt.startsWith('DAILY_COMIC_Q_V1')) {
        primaryPrompt = `${visual.slice(0, comicEnd)}\n[SCENE] ${primaryPrompt}`.slice(0, appearance.CG_PREPARED_NL_LIMIT);
    }
    const request = {
        // Workflows and older NAI models may consume only prompt. Give those
        // backends one composed scene with named appearances, not scene-only
        // tags or two disconnected single-person tag lists.
        prompt: primaryPrompt,
        nl: fullVisual,
    };
    if (state.supportsCharacters && metadata?.characters?.length) {
        request.characters = metadata.characters.filter(character => character.tag || (metadata.castSnapshot && character.nl) || character_scene.cgCharacterSceneValue(character, metadata.promptFormat))
            .map(row => {
                const { name, tag, nl } = row;
                const activity = character_scene.cgCharacterSceneValue(row, metadata.promptFormat);
                const description = [nl || '', activity].filter(Boolean).join('\n');
                return { name, tag, ...(description ? { nl: description } : {}) };
            });
    }
    const formatted = appearance.formattedCgProviderPrompts(visual, metadata, state.supportsCharacters, state.backend);
    if (formatted) {
        request.prompt = formatted.prompt; request.nl = formatted.nl;
        if (formatted.characters) request.characters = formatted.characters;
        else delete request.characters;
    }
    // NAI concatenates prompt and nl; legacy single-prompt paths (including
    // MV) already contain their whole scene. Avatar's split brief below has
    // its own distinct nl and must not be cleared after assignment.
    if (singlePrompt && state.backend === 'nai' && state.supportsCharacters) request.nl = '';
    // Avatar-only, local authoring path. Reuse the documented name/tag channels
    // when NAI supports them; flat-only and ComfyUI retain the complete prompt.
    // Optional malformed parts fall back to that prompt, never block generation.
    if (preservePrompt && singlePrompt && !metadata && state.backend === 'nai' && state.supportsCharacters
        && typeof avatarPromptParts?.scene === 'string' && avatarPromptParts.scene.trim()
        && Array.isArray(avatarPromptParts.characters) && avatarPromptParts.characters.length === 2
        && avatarPromptParts.characters.every(row => typeof row?.name === 'string' && row.name.trim()
            && typeof row.tag === 'string' && row.tag.trim())) {
        request.prompt = core_text.normalizeText(avatarPromptParts.scene, Infinity);
        request.characters = avatarPromptParts.characters.map(({ name, tag }) => ({
            name: core_text.normalizeText(name, Infinity), tag: core_text.normalizeText(tag, Infinity),
        }));
        const brief = avatarPromptParts.nai;
        if (typeof brief?.prompt === 'string' && brief.prompt.trim() && typeof brief.nl === 'string'
            && Array.isArray(brief.characters) && brief.characters.length === 2
            && brief.characters.every(row => typeof row?.name === 'string' && row.name.trim()
                && typeof row.tag === 'string' && row.tag.trim() && typeof row.nl === 'string')) {
            request.prompt = core_text.normalizeText(brief.prompt, Infinity);
            request.nl = core_text.normalizeText(brief.nl, Infinity);
            request.characters = brief.characters.map(({ name, tag, nl }) => ({
                name: core_text.normalizeText(name, Infinity), tag: core_text.normalizeText(tag, Infinity),
                nl: core_text.normalizeText(nl, Infinity),
            }));
        }
    }
    // Public API v1 exposes a dynamic negative only for ComfyUI. NAI still
    // uses the user's own negative; size remains the documented orientation.
    if (preservePrompt && singlePrompt && !metadata && state.backend === 'comfyui'
        && typeof avatarPromptParts?.negative === 'string' && avatarPromptParts.negative.trim()) {
        request.negative = avatarPromptParts.negative.trim();
    }
    return request;
}

export async function generateBaiBaiImage(prompt, { signal = null, orientation = 'landscape', characterName = '', promptMetadata = null, onProgress = null, onSettled = null, targetKey = '', seed = 0, singlePrompt = false, preservePrompt = false, avatarPromptParts = null, context = core_context.getContext() } = {}) {
    if (signal?.aborted) throw baiBaiImageError('BBI_ABORTED');
    const state = baiBaiImageState();
    if (!state.available) throw baiBaiImageError(state.code);
    const reservation = typeof targetKey === 'string' && targetKey ? targetKey : Symbol('image');
    if (pendingGenerations.has(reservation)) throw baiBaiImageError('BBI_TARGET_BUSY');
    // 柏宝绘负责后端并发与排队；这里只保留同一目标的去重。
    const request = {
        ...baiBaiSendPreview(prompt, { promptMetadata, context, state, singlePrompt, preservePrompt, avatarPromptParts }),
        size: orientation === 'portrait' ? 'portrait' : 'landscape',
        save: true, character: core_text.normalizeText(characterName, 120) || '心迹回廊 CG',
    };
    // Positive seeds override only this request; otherwise keep the provider's settings.
    if (Number.isInteger(seed) && seed > 0) request.seed = seed;
    const controller = new AbortController();
    let timer;
    let stopped = false;
    let rejectStop;
    const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
    const stop = code => {
        if (stopped) return;
        stopped = true;
        controller.abort();
        rejectStop(baiBaiImageError(code));
    };
    const onAbort = () => stop('BBI_ABORTED');
    const report = progress => {
        if (stopped || controller.signal.aborted || typeof onProgress !== 'function') return;
        const phase = progress?.phase;
        if (!['queued', 'generating', 'queued-remote', 'retrying', 'saving', 'waiting'].includes(phase)) return;
        try { onProgress({ phase }); } catch {}
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // 排队中的请求仍可能成功，等待提示不取消后端任务，也不触发重发。
    timer = setTimeout(() => report({ phase: 'waiting' }), BAIBAI_IMAGE_WAIT_NOTICE_MS);
    pendingGenerations.set(reservation, controller);
    let providerPromise;
    try {
        // No await before generate: caller's captured chat and chosen provider are still current.
        providerPromise = Promise.resolve(state.api.generate(request, { signal: controller.signal, onProgress: report }))
            .catch(error => { throw publicFailure(error); })
            .finally(() => {
                pendingGenerations.delete(reservation);
                try { onSettled?.(); } catch {}
            });
        const result = await Promise.race([providerPromise, stopPromise]);
        if (signal?.aborted || stopped) throw baiBaiImageError('BBI_ABORTED');
        const path = savedImagePath(result?.path);
        if (!path) throw baiBaiImageError('BBI_SAVE_FAILED');
        // Drop the potentially multi-MB dataUrl; only durable image references enter archive metadata.
        const usedSeed = Number(result?.seed);
        return { url: path, provider: BAIBAI_IMAGE_PROVIDER, ...(Number.isInteger(usedSeed) && usedSeed > 0 ? { seed: usedSeed } : {}) };
    } catch (error) {
        if (!providerPromise) pendingGenerations.delete(reservation); // synchronous API failure
        if (ownErrors.has(error)) throw error;
        throw publicFailure(error);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
