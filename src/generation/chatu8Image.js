// Calls 智绘姬 through the event it already listens for. Does not read API keys,
// prompts, or endpoints, and does not write its settings. Ordinary CG keeps its
// existing size; an explicit MV orientation overrides only this request's size.
import * as image_patch from '../core/cgImagePatch.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as appearance from './cgAppearance.js';

export const CHATU8_IMAGE_PROVIDER = 'chatu8-image';
export const CHATU8_IMAGE_WAIT_NOTICE_MS = 300000;
const EXTENSION_KEY = 'st-chatu8';
const REQUEST_EVENT = 'generate-image-request';
const RESPONSE_EVENT = 'generate-image-response';
const STILL_MODES = new Set(['sd', 'novelai', 'comfyui', 'banana', 'runninghub']);
const pendingGenerations = new Map();
const ownErrors = new WeakSet();

const MESSAGES = Object.freeze({
    CH8_NOT_READY: '未检测到智绘姬。请先安装并启用，配好出图模式后刷新；刚完成加载可点击“重新检测”。',
    CH8_DISABLED: '智绘姬已安装，但总开关是关的。请在智绘姬里启用后再绘制。',
    CH8_NOT_CONFIGURED: '智绘姬当前模式不能出静图。请在智绘姬里选好 SD、NovelAI、ComfyUI 或其他出图模式。',
    CH8_INVALID_ARGS: '智绘姬未接受这次画面提示，请检查画面描述后重试。',
    CH8_BACKEND_ERROR: '智绘姬出图失败。旧图已保留；请到智绘姬里查看这次任务。',
    CH8_SAVE_FAILED: '图片已生成，但没有取得可保存的本地路径。旧图已保留，避免重复出图。',
    CH8_ABORTED: '已停止等待本次图片。没有取消智绘姬里的其他出图，旧图已保留。',
    CH8_TARGET_BUSY: '这张图片的绘制请求还未结束，请先等待，避免重复出图。',
});

export function chatu8ImageError(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'CH8_BACKEND_ERROR';
    const error = new Error(MESSAGES[safeCode]);
    error.code = safeCode;
    error.safeUserMessage = error.message;
    error.safeToDisplay = true;
    ownErrors.add(error);
    if (safeCode === 'CH8_ABORTED') error.name = 'AbortError';
    return error;
}

function extensionBag(context) {
    const settings = context?.extensionSettings;
    const bag = settings && typeof settings === 'object' ? settings[EXTENSION_KEY] : null;
    return bag && typeof bag === 'object' ? bag : null;
}

export function chatu8ImageState(context = core_context.getContext()) {
    try {
        const bag = extensionBag(context);
        if (!bag) return { available: false, detected: false, reason: MESSAGES.CH8_NOT_READY, code: 'CH8_NOT_READY', backend: '' };
        const enabled = bag.scriptEnabled === true || bag.scriptEnabled === 'true';
        const backend = typeof bag.mode === 'string' && STILL_MODES.has(bag.mode) ? bag.mode : '';
        if (!enabled) return { available: false, detected: true, reason: MESSAGES.CH8_DISABLED, code: 'CH8_DISABLED', backend };
        if (!backend) return { available: false, detected: true, reason: MESSAGES.CH8_NOT_CONFIGURED, code: 'CH8_NOT_CONFIGURED', backend: typeof bag.mode === 'string' ? bag.mode : '' };
        const source = context?.eventSource;
        if (!source || typeof source.emit !== 'function' || typeof source.on !== 'function') {
            return { available: false, detected: true, reason: MESSAGES.CH8_NOT_READY, code: 'CH8_NOT_READY', backend };
        }
        return { available: true, detected: true, reason: '智绘姬已连接 · 使用其中已有的出图配置', code: '', backend, eventSource: source };
    } catch {
        return { available: false, detected: false, reason: MESSAGES.CH8_BACKEND_ERROR, code: 'CH8_BACKEND_ERROR', backend: '' };
    }
}

export function chatu8ImagePendingCount() { return pendingGenerations.size; }
export function isChatu8ImageTargetPending(targetKey) { return !!targetKey && pendingGenerations.has(targetKey); }

function requestId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (typeof uuid === 'string' && uuid) return `rmt-${uuid}`;
    return `rmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function unlisten(source, event, handler) {
    try { source.removeListener?.(event, handler); } catch {}
}

function flatPrompt(prompt, promptMetadata, preservePrompt = false) {
    const visual = core_text.normalizeText(prompt, preservePrompt ? Infinity : 1800);
    if (!visual) throw chatu8ImageError('CH8_INVALID_ARGS');
    const metadata = appearance.normalizeCgPromptMetadata(promptMetadata);
    if (preservePrompt && !metadata) return visual;
    const fullVisual = appearance.cgPreparedVisualPrompt(visual, metadata);
    let primaryPrompt = metadata ? metadata.flatPrompt || fullVisual : visual;
    primaryPrompt = appearance.cgFlatPromptWithNaturalLooks(primaryPrompt, metadata);
    const sceneMarker = '\n[SCENE] ';
    const comicEnd = visual.startsWith('DAILY_COMIC_Q_V1') ? visual.indexOf(sceneMarker) : -1;
    if (comicEnd > 0 && primaryPrompt !== visual && !primaryPrompt.startsWith('DAILY_COMIC_Q_V1')) {
        primaryPrompt = `${visual.slice(0, comicEnd)}\n[SCENE] ${primaryPrompt}`.slice(0, appearance.CG_PREPARED_NL_LIMIT);
    }
    const formatted = appearance.formattedCgProviderPrompts(visual, metadata, false, '');
    if (formatted?.prompt) primaryPrompt = formatted.prompt;
    if (!primaryPrompt) throw chatu8ImageError('CH8_INVALID_ARGS');
    return primaryPrompt;
}

function uploadedPath(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('data:')) return '';
    return image_patch.savedLocalImagePath(/^(?:https?|tauri):\/\//i.test(trimmed) || trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
}

function uploadHeaders(context) {
    let provided = null;
    try { provided = typeof context?.getRequestHeaders === 'function' ? context.getRequestHeaders() : null; } catch { provided = null; }
    if (provided && typeof provided.append === 'function') {
        try { provided.set('Content-Type', 'application/json'); } catch {}
        return provided;
    }
    return { ...(provided && typeof provided === 'object' ? provided : {}), 'Content-Type': 'application/json' };
}

function stillFormat(dataUrl) {
    const head = dataUrl.slice(0, 48).toLowerCase();
    if (head.startsWith('data:image/jpeg') || head.startsWith('data:image/jpg')) return 'jpeg';
    if (head.startsWith('data:image/webp')) return 'webp';
    if (head.startsWith('data:image/gif')) return 'gif';
    if (head.startsWith('data:image/png')) return 'png';
    return '';
}

async function saveStillImage(imageData, context, signal) {
    const existing = uploadedPath(imageData);
    if (existing) return existing;
    if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) throw chatu8ImageError('CH8_BACKEND_ERROR');
    const format = stillFormat(imageData);
    const comma = imageData.indexOf(',');
    const payload = comma > 0 ? imageData.slice(comma + 1).replace(/\s/g, '') : '';
    if (!format || !payload) throw chatu8ImageError('CH8_BACKEND_ERROR');
    let response;
    try {
        response = await fetch('/api/images/upload', {
            method: 'POST',
            headers: uploadHeaders(context),
            body: JSON.stringify({ image: payload, format, ch_name: '心迹回廊' }),
            signal,
        });
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw chatu8ImageError('CH8_ABORTED');
        throw chatu8ImageError('CH8_SAVE_FAILED');
    }
    if (!response?.ok) throw chatu8ImageError('CH8_SAVE_FAILED');
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    const path = uploadedPath(body?.path);
    if (!path) throw chatu8ImageError('CH8_SAVE_FAILED');
    return path;
}

function orientedSize(context, backend, orientation, aspectRatio = '') {
    const bag = extensionBag(context);
    const keys = { novelai: ['novelai_width', 'novelai_height'], sd: ['sd_cwidth', 'sd_cheight'], comfyui: ['comfyui_width', 'comfyui_height'] }[backend];
    const width = Number(keys && bag?.[keys[0]]), height = Number(keys && bag?.[keys[1]]);
    if (aspectRatio === '2:1') {
        // Two square portraits need an actual 2:1 request, not just landscape.
        // Keep the configured pixel budget; align both dimensions to 64.
        const area = Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 ? width * height : 1216 * 832;
        const short = Math.max(64, Math.floor(Math.sqrt(area / 2) / 64) * 64);
        return { width: short * 2, height: short };
    }
    if (aspectRatio === '16:9' || aspectRatio === '9:16') {
        // Both dimensions are multiples of 64. Exact 16:9 begins at 1024×576;
        // larger configured budgets can use its integer multiples. Only this
        // request changes; never rewrite the provider's global presets.
        const area = Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 ? width * height : 1216 * 832;
        const units = Math.max(1, Math.floor(Math.sqrt(area / (1024 * 576))));
        const long = 1024 * units, short = 576 * units;
        return aspectRatio === '9:16' ? { width: short, height: long } : { width: long, height: short };
    }
    let long = 1216, short = 832;
    if (Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0) {
        long = Math.max(width, height); short = Math.min(width, height);
        if (long === short) {
            // Keep approximately the configured pixel area, aligned for image
            // backends. A square preset must not swallow an explicit MV choice.
            const area = width * height;
            long = Math.max(128, Math.floor(Math.sqrt(area * 16 / 9) / 64) * 64);
            short = Math.max(64, Math.floor(area / long / 64) * 64);
        }
    }
    return orientation === 'portrait' ? { width: short, height: long } : { width: long, height: short };
}

function avatarCharacterPrompt(parts, context, backend) {
    // The existing generate-image-request consumer recognizes this grammar
    // for NAI 4/5, then builds separate native character captions. Older models
    // and other backends keep the complete flat prompt. No settings are changed.
    const model = extensionBag(context)?.novelaimode;
    if (backend !== 'novelai' || typeof model !== 'string' || !/nai-diffusion-[45](?:-|$)/.test(model)
        || typeof parts?.scene !== 'string' || !parts.scene.trim()
        || !Array.isArray(parts.characters) || parts.characters.length !== 2
        || !parts.characters.every(row => typeof row?.tag === 'string' && row.tag.trim())) return '';
    // Semicolons end upstream fields. Normalize punctuation in the transport
    // copy so user prose cannot truncate a character or spill into the other.
    const field = value => value.replace(/[;；]/g, ',').replace(/\|\s*centers\s*:/gi, ', centers ')
        .replace(/（/g, '(').replace(/）/g, ')').replace(/[\r\n]+/g, ' ').trim();
    return [
        `Scene Composition: ${field(parts.scene)};`,
        ...parts.characters.map((row, index) => `Character ${index + 1} Prompt: ${field(row.tag)} | centers:{${index ? 0.75 : 0.25},0.5};`),
    ].join('\n');
}

// The preview and event sender share this pure boundary. Resolve stable looks
// locally: never hand an unresolved/ambiguous preset macro to the other plugin.
export function chatu8SendPreview(prompt, { promptMetadata = null, context = core_context.getContext(), preservePrompt = false, singlePrompt = false, avatarPromptParts = null } = {}) {
    const visual = core_text.normalizeText(prompt, preservePrompt ? Infinity : 1800);
    if (!visual) throw chatu8ImageError('CH8_INVALID_ARGS');
    const metadata = appearance.resolveCgAppearanceMetadata(context, appearance.scopeCgPromptMetadata(visual, promptMetadata), { provider: CHATU8_IMAGE_PROVIDER });
    const backend = extensionBag(context)?.mode;
    const avatar = preservePrompt && singlePrompt && !metadata ? avatarPromptParts : null;
    if (metadata?.flatPromptOverride) return { prompt: metadata.flatPrompt || visual, nl: '' };
    if (!metadata || preservePrompt) return { prompt: avatarCharacterPrompt(avatar, context, backend) || flatPrompt(visual, metadata, preservePrompt), nl: '' };
    const characters = metadata.characters;
    const changed = characters.some(row => row.resolvedAppearance === true);
    const model = extensionBag(context)?.novelaimode;
    const automaticCoordinates = extensionBag(context)?.AI_use_coords;
    const expectedCharacters = metadata.castSnapshot?.people.length ?? metadata.selectedRoles?.length ?? characters.length;
    const native = backend === 'novelai' && typeof model === 'string' && /nai-diffusion-[45](?:-|$)/.test(model)
        // Without explicitly enabled automatic placement the upstream builder
        // sends empty manual centers. Keep a complete flat prompt in that mode.
        && (automaticCoordinates === true || automaticCoordinates === 'true')
        && characters.length && characters.length === expectedCharacters && characters.every(row => row.tag || row.nl);
    // Use the scene channel without an old, generated appearance-bearing flat
    // prompt. The manually authored complete channel was returned above.
    const sceneMetadata = { ...metadata, characters: [], flatPrompt: '' };
    const sceneInput = metadata.promptFormat === 'nai45-tags' ? metadata.sceneTags || visual : visual;
    const scene = appearance.formattedCgProviderPrompts(sceneInput, sceneMetadata, false, '')?.prompt || sceneInput;
    if (native) {
        const field = value => String(value).replace(/[;；]/g, ',').replace(/\|\s*centers\s*:/gi, ', centers ')
            .replace(/（/g, '(').replace(/）/g, ')').replace(/[\r\n]+/g, ' ').trim();
        return { prompt: [`Scene Composition: ${field(scene)};`, ...characters.map((row, index) =>
            `Character ${index + 1} Prompt: ${field(`${row.name}: ${row.tag || row.nl}`)};`)].join('\n'), nl: '' };
    }
    if (!changed) return { prompt: flatPrompt(visual, metadata), nl: '' };
    // No second request is needed for backends without native character slots.
    // Do not re-normalize the resolved tags through the old 400-character field.
    const looks = characters.filter(row => row.tag || row.nl).map(row => `${row.name}：${row.tag || row.nl}`).join('\n');
    return { prompt: looks ? `${scene}\n\n人物外貌（逐人对应，不互换）：\n${looks}` : scene, nl: '' };
}

export async function generateChatu8Image(prompt, { signal = null, orientation = 'landscape', respectOrientation = false, aspectRatio = '', promptMetadata = null, onProgress = null, onSettled = null, targetKey = '', context = core_context.getContext(), preservePrompt = false, singlePrompt = false, avatarPromptParts = null } = {}) {
    if (signal?.aborted) throw chatu8ImageError('CH8_ABORTED');
    const state = chatu8ImageState(context);
    if (!state.available) throw chatu8ImageError(state.code);
    const reservation = typeof targetKey === 'string' && targetKey ? targetKey : Symbol('image');
    if (pendingGenerations.has(reservation)) throw chatu8ImageError('CH8_TARGET_BUSY');
    // 智绘姬按自己的后端能力并发或排队；这里只阻止同一目标重复提交。
    let scene;
    try { scene = chatu8SendPreview(prompt, { promptMetadata, context, preservePrompt, singlePrompt, avatarPromptParts }).prompt; }
    catch (error) {
        if (ownErrors.has(error) || error?.safeToDisplay) throw error;
        throw chatu8ImageError('CH8_INVALID_ARGS');
    }
    const avatar = preservePrompt && singlePrompt && !promptMetadata ? avatarPromptParts : null;
    // This is the consumer's documented extra-negative event field. It appends
    // to the user's configured negative prompt in these four supported modes.
    const negative = ['novelai', 'sd', 'comfyui', 'runninghub'].includes(state.backend)
        && typeof avatar?.negative === 'string' ? avatar.negative.trim() : '';
    const source = state.eventSource;
    const id = requestId();
    let settled = false;
    const finish = () => {
        if (settled) return;
        settled = true;
        pendingGenerations.delete(reservation);
        try { onSettled?.(); } catch {}
    };
    pendingGenerations.set(reservation, id);
    const report = phase => {
        if (signal?.aborted || typeof onProgress !== 'function') return;
        try { onProgress({ phase, providerLabel: '智绘姬' }); } catch {}
    };
    try {
        report('generating');
        const result = await new Promise((resolve, reject) => {
            let timer = 0;
            const stop = code => {
                unlisten(source, RESPONSE_EVENT, onResponse);
                signal?.removeEventListener('abort', onAbort);
                clearTimeout(timer);
                reject(chatu8ImageError(code));
            };
            const onResponse = data => {
                if (!data || data.id !== id) return;
                unlisten(source, RESPONSE_EVENT, onResponse);
                signal?.removeEventListener('abort', onAbort);
                clearTimeout(timer);
                resolve(data);
            };
            const onAbort = () => stop('CH8_ABORTED');
            if (signal?.aborted) { stop('CH8_ABORTED'); return; }
            try {
                source.on(RESPONSE_EVENT, onResponse);
                signal?.addEventListener('abort', onAbort, { once: true });
                // 排队也计入等待时间，不能把仍在智绘姬队列里的任务判成失败。
                timer = setTimeout(() => report('waiting'), CHATU8_IMAGE_WAIT_NOTICE_MS);
                source.emit(REQUEST_EVENT, { id, prompt: scene,
                    ...(negative ? { negative_prompt: negative } : {}),
                    ...(respectOrientation ? orientedSize(context, state.backend, orientation, aspectRatio) : {}) });
            } catch { stop('CH8_BACKEND_ERROR'); }
        });
        if (signal?.aborted) throw chatu8ImageError('CH8_ABORTED');
        if (result?.cancelled) throw chatu8ImageError('CH8_ABORTED');
        if (result?.success !== true || result?.isVideo === true) throw chatu8ImageError('CH8_BACKEND_ERROR');
        report('saving');
        const path = await saveStillImage(result.imageData, context, signal);
        return { url: path, provider: CHATU8_IMAGE_PROVIDER };
    } catch (error) {
        if (ownErrors.has(error)) throw error;
        if (error?.safeToDisplay) throw error;
        throw chatu8ImageError('CH8_BACKEND_ERROR');
    } finally {
        finish();
    }
}
