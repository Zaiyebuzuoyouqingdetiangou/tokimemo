// 信末小画（r84.200）：用户接好了生图插件（柏宝绘 / 智绘姬）并开着「信末小画用生图插件画」时，
// 新信保存后在后台逐封交给生图插件画一张彩铅小画；没画好之前、没接插件或画失败时，
// 信里照常显示本地模板小画。不多发文本请求，不改动旧信，也不会在刷新后自动重画。
import * as cg_core from './imageGeneration.js';
import * as image_presets from './imageAppearancePresets.js';
import * as letter_art from '../core/letterIllustration.js';
import * as core_settings from '../core/settings.js';
import * as core_context from '../core/context.js';
import * as core_cache from '../core/cache.js';
import * as core_text from '../core/text.js';
import * as archive_repository from '../archive/repository.js';

// Same style for every provider; matches the soft colored-pencil reference.
export const LETTER_IMAGE_STYLE = 'colored pencil drawing, soft pastel colors, gentle hand-drawn pencil texture, '
    + 'cute simple illustration, chibi proportions, rounded shapes, rosy blush cheeks, '
    + 'clean white paper background, minimal background, plenty of empty space, small heart accents allowed, '
    + 'no text, no watermark';
const PROVIDERS = new Set(['baibai-image', 'chatu8-image']);
const IMAGE_FAILED = '信末小画没画成，信里先用原来的小画。可以在这封信里重画。';

// Page-local only: drawing/failed marks never persist, so a reload just shows the local drawing.
const status = new Map();
let queue = Promise.resolve();

function letterKey(chatId, letterId) { return JSON.stringify([core_context.comparableChatId(chatId), String(letterId || '')]); }
export function letterImageStatus(session, letter) {
    return status.get(letterKey(session?.chatId, letter?.id)) || '';
}

// The configured provider, only when it is one of the two plugins and ready now.
export function letterImageProvider(context = null, { ignoreToggle = false } = {}) {
    try {
        const live = context || core_context.getContext();
        const settings = core_settings.getPluginSettings(live);
        if ((!ignoreToggle && settings.letterImageEnabled === false) || !PROVIDERS.has(settings.imageGenerationProvider)) return null;
        const state = cg_core.imageGenerationUiState(live);
        return state?.available && PROVIDERS.has(state.provider) ? state : null;
    } catch { return null; }
}
export function letterImageEnabled(context = null) {
    try { return core_settings.getPluginSettings(context || core_context.getContext()).letterImageEnabled !== false; } catch { return false; }
}

// Appearance comes only from the selected provider's own character presets
// (the same lookup CG images use). Nothing is read from the card here.
export function letterImageAppearance(context, characterName) {
    try {
        const name = core_text.normalizeText(characterName || context?.name2, 120);
        if (!name) return '';
        const preset = image_presets.resolveImageAppearancePresets(context, [{ id: 'char', name, visible: 'full' }]).get('char');
        return core_text.normalizeText(preset?.tag || preset?.nl || '', 500);
    } catch { return ''; }
}

export function letterImagePrompt(imagePrompt, appearance = '') {
    const content = core_text.normalizeText(imagePrompt, 400);
    if (!content) return '';
    return [LETTER_IMAGE_STYLE, content, core_text.normalizeText(appearance, 500)].filter(Boolean).join(', ');
}

export function letterImageTargetKey(context, letterId) {
    let scope = '';
    try { scope = core_context.chatScopeKey(context); } catch { scope = ''; }
    return `letter-image:${scope}:${core_text.safeId(letterId, 'letter')}`;
}

function drawable(letter) {
    return letter && letter.type !== 'travel' && !letter.travelSnapshot
        && !!letter_art.letterIllustrationImagePrompt(letter.illustration)
        && !letter_art.letterIllustrationPicture(letter.illustration);
}

// The mailbox view hands over its refresher when it renders (generation never imports UI).
let refresher = null;
export function setLetterImageRefresher(fn) { refresher = typeof fn === 'function' ? fn : null; }
function refresh(chatId, letterId, updated = null) {
    try { refresher?.(chatId, letterId, updated); } catch { /* View only. */ }
}

// Schedule the new letters of a just-saved mailbox. Never throws and never blocks.
export function scheduleLetterImages(session, previous = null, { context = null } = {}) {
    try {
        if (session?.kind !== 'inbox' || !Array.isArray(session.letters)) return 0;
        const live = context || core_context.currentCharacterGuard();
        if (!letterImageProvider(live)) return 0;
        const known = new Set((Array.isArray(previous?.letters) ? previous.letters : []).map(letter => letter?.id));
        const letters = session.letters.filter(letter => letter?.id && !known.has(letter.id) && drawable(letter));
        let count = 0;
        for (const letter of letters) if (enqueue(live, session, letter)) count += 1;
        return count;
    } catch { return 0; }
}

// User-requested redraw for one letter in the shown mailbox.
export function redrawLetterImage(session, letterId, { context = null } = {}) {
    const live = context || core_context.currentCharacterGuard();
    if (!letterImageProvider(live)) throw core_text.safeUserError('请先在设置里接好柏宝绘或智绘姬，并打开「信末小画用生图插件画」。', 'RMT_LETTER_IMAGE_UNAVAILABLE');
    const letter = session?.letters?.find(item => item?.id === letterId);
    if (!drawable(letter)) throw core_text.safeUserError('这封信没有可画的小画描述。', 'RMT_LETTER_IMAGE_NONE');
    return enqueue(live, session, letter);
}

function enqueue(context, session, letter) {
    const key = letterKey(session.chatId, letter.id);
    if (status.get(key) === 'drawing') return null;
    let memory;
    try { memory = archive_repository.requireArchive(context); } catch { return null; }
    if (core_context.comparableChatId(memory.chatId) !== core_context.comparableChatId(session.chatId)) return null;
    const job = {
        key, chatId: session.chatId, letterId: letter.id, eventKey: letter.eventKey, createdAt: letter.createdAt,
        imagePrompt: letter_art.letterIllustrationImagePrompt(letter.illustration),
        characterName: letter.illustration?.characterName || '',
        origin: core_context.captureTaskOrigin(context, memory.archiveRevision),
    };
    status.set(key, 'drawing');
    refresh(job.chatId, job.letterId);
    // One letter at a time, in the background; a failure never affects the letter itself.
    const run = queue.then(() => drawJob(job));
    queue = run.catch(() => {});
    return run;
}

async function drawJob(job) {
    let outcome = '';
    try {
        // Switched away before this letter's turn: do not pay for a picture that cannot be saved.
        if (!core_context.isCurrentTaskOrigin(job.origin)) return 'skipped';
        const context = core_context.getContext();
        const provider = letterImageProvider(context);
        if (!provider) return 'skipped';
        const prompt = letterImagePrompt(job.imagePrompt, letterImageAppearance(context, job.characterName));
        if (!prompt) return 'skipped';
        const result = await cg_core.invokeImageGeneration(prompt, context, {
            provider: provider.provider, characterName: context.name2,
            // A letter-end vignette sits under the prose like the local drawing:
            // landscape, turned from the user's configured size; a square preset stays square.
            orientation: 'landscape', respectOrientation: true, configuredSizeOnly: true,
            targetKey: letterImageTargetKey(context, job.letterId),
            singlePrompt: true, preservePrompt: true,
        });
        const url = cg_core.normalizeCgImageUrl(typeof result === 'string' ? result : result?.url);
        if (!url) throw core_text.safeUserError('这次没有收到可用图片。', 'RMT_LETTER_IMAGE_EMPTY');
        const saved = await saveLetterImage(job, { url, prompt, provider: result?.provider || provider.provider });
        outcome = saved ? 'done' : 'unsaved';
        if (!saved) globalThis.toastr?.info?.('信末小画画好了，但聊天已切换，没有写进这封信。图片仍在生图插件的图库里。', '心迹回廊');
        return outcome;
    } catch (error) {
        outcome = 'failed';
        console.warn('[HeartbeatMemories] letter image failed', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.warning?.(IMAGE_FAILED, '心迹回廊');
        return outcome;
    } finally {
        if (outcome === 'failed') status.set(job.key, 'failed'); else status.delete(job.key);
        if (outcome !== 'done') refresh(job.chatId, job.letterId);
    }
}

// Writes only into the same chat's saved mailbox, to the same letter (id, eventKey,
// createdAt), and only when it has no picture yet. Returns the saved session or null.
export async function saveLetterImage(job, image) {
    if (!core_context.isCurrentTaskOrigin(job.origin)) return null;
    let context, memory;
    try { context = core_context.currentCharacterGuard(); memory = archive_repository.requireArchive(context); } catch { return null; }
    if (core_context.comparableChatId(memory.chatId) !== core_context.comparableChatId(job.chatId)) return null;
    const origin = core_context.captureTaskOrigin(context, memory.archiveRevision);
    const updated = await core_cache.commitSessionMutation('inbox', memory.chatId, origin, latest => {
        if (latest?.kind !== 'inbox' || !Array.isArray(latest.letters)) return null;
        if (core_context.comparableChatId(latest.chatId) !== core_context.comparableChatId(job.chatId)) return null;
        const letter = latest.letters.find(item => item?.id === job.letterId && item.eventKey === job.eventKey && item.createdAt === job.createdAt);
        if (!letter || !drawable(letter)) return null;
        letter.illustration = { ...letter.illustration, imageUrl: image.url, imageUsedPrompt: core_text.normalizeText(image.prompt, 4000),
            imageProvider: core_text.normalizeText(image.provider, 40), imageGeneratedAt: Date.now() };
        return latest;
    }, null);
    if (!updated) return null;
    status.delete(job.key);
    refresh(job.chatId, job.letterId, updated);
    return updated;
}

// Resolves when every queued letter picture has finished (tests and diagnostics).
export function whenLetterImagesIdle() { return queue; }
