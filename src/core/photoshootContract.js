import * as text from './text.js';
// C-3b（r84.99）：别名沿用 appearance，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as appearance from './generationBridge.js';

export const PHOTOSHOOT_ROUTE = Object.freeze({ NORMAL: 'photoshoot', FAILED: 'failed-photoshoot' });
export const PHOTOSHOOT_CAPTURE = Object.freeze(['selfie', 'portrait', 'together']);
const ROUTES = new Set(Object.values(PHOTOSHOOT_ROUTE));
const CAPTURES = new Set(PHOTOSHOOT_CAPTURE);

function plain(value, limit) { return text.normalizeText(value, limit); }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function id(value) { return text.safeId(value, ''); }
function baseMoments(capture, route) {
    const subject = capture === 'selfie' ? '自拍时' : capture === 'portrait' ? '镜头前' : '同框时';
    const accidental = route === PHOTOSHOOT_ROUTE.FAILED ? ['刚好眨眼', '手指挡住镜头一角', '风吹乱头发', '忍不住笑出声', '没赶上倒计时', '看向了镜头旁边', '走动留下轻微虚影', '被一声招呼吓了一跳', '发现镜头歪了'] : ['抬眼', '笑了一下', '转身'];
    return Array.from({ length: 9 }, (_, index) => `${subject}${accidental[index % accidental.length]}的瞬间 ${index + 1}`);
}
export function normalizePhotoshootPlan(value, { fallbackId = '' } = {}) {
    const raw = record(value);
    if (!raw || raw.version !== 1) return null;
    const planId = id(raw.id || fallbackId), route = plain(raw.route, 40), capture = plain(raw.capture, 40);
    const scenePrompt = plain(raw.scenePrompt, 1800);
    if (!planId || !ROUTES.has(route) || !CAPTURES.has(capture) || !scenePrompt) return null;
    const supplied = Array.isArray(raw.moments) ? raw.moments : [];
    const defaults = baseMoments(capture, route);
    const moments = Array.from({ length: 9 }, (_, index) => plain(supplied[index], 320) || defaults[index]);
    let promptMetadata = null;
    try { promptMetadata = appearance.normalizeCgPromptMetadata(raw.promptMetadata); } catch { return null; }
    const title = plain(raw.title, 160) || (route === PHOTOSHOOT_ROUTE.FAILED ? '失败写真' : '写真薄');
    return { version: 1, id: planId, route, capture, title, scenePrompt, moments,
        ...(promptMetadata ? { promptMetadata } : {}), createdAt: Math.max(0, Number(raw.createdAt) || 0) };
}
export function createPhotoshootPlan(value, options = {}) {
    return normalizePhotoshootPlan({ ...value, version: 1, id: value?.id || options.id, createdAt: options.createdAt || Date.now(),
        moments: Array.isArray(value?.moments) ? value.moments : baseMoments(value?.capture, value?.route), promptMetadata: options.promptMetadata || value?.promptMetadata });
}
export function photoshootSource(plan) {
    const item = normalizePhotoshootPlan(plan);
    if (!item) return '';
    return JSON.stringify(['heart-photoshoot', item.id, item.route, item.capture, item.title, item.scenePrompt, item.moments, item.promptMetadata?.castSnapshot || null, item.promptMetadata?.characters || []]);
}
export function photoshootDefaultMoments(capture, route) {
    return CAPTURES.has(capture) && ROUTES.has(route) ? baseMoments(capture, route) : [];
}
export function photoshootLabel(plan) { return plan?.route === PHOTOSHOOT_ROUTE.FAILED ? '失败写真' : '写真薄'; }
