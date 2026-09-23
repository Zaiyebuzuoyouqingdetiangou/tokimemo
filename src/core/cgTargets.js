import * as constants from './constants.js';
import * as text from './text.js';
import * as photoshoots from './photoshootContract.js';
import * as cg_image_patch from './cgImagePatch.js';

const PREFIX = 'rmtcg2';
const KINDS = new Set(['heart-voice', 'heart-scenario', 'heart-photoshoot', 'ending-ending', 'ending-epilogue', 'ending-epilogue-scene', 'ending-confession', 'heart-language', 'heart-portrait']);
const SLOT_BY_KIND = Object.freeze({
    'heart-voice': 'voice', 'heart-scenario': 'scenario', 'heart-photoshoot': 'grid', 'ending-ending': 'ending', 'ending-epilogue': 'epilogue', 'heart-language': 'language',
    'ending-confession': 'confession', 'heart-portrait': 'portrait',
});

function encode(value) { return encodeURIComponent(String(value)); }
function decode(value) { try { return decodeURIComponent(String(value)); } catch { return ''; } }
function hash(value) { return `cgsrc-v1-${(text.hashString(String(value)) >>> 0).toString(36)}`; }
function safeId(value) { return text.safeId(value, ''); }
function normalized(value, limit = 12000) { return text.normalizeText(value, limit); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }

export function heartLanguageLineHash(category, line) {
    return hash(JSON.stringify([normalized(category, 60), normalized(line, 600)]));
}

export function normalizeCgTargetDescriptor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    const kind = normalized(value.kind, 40);
    const containerId = safeId(value.containerId);
    const slot = normalized(value.slot, 160);
    const expectedSlot = SLOT_BY_KIND[kind];
    if (!KINDS.has(kind) || !containerId || !slot || (!['heart-language','ending-epilogue-scene'].includes(kind) && slot !== expectedSlot)) return null;
    if (kind === 'ending-epilogue-scene' && !/^scene:\d+$/.test(slot)) return null;
    if (kind === 'heart-language' && !constants.HEART_GREETING_KEYS.includes(containerId)) return null;
    if (kind === 'heart-portrait' && containerId !== 'language') return null;
    const sourceHash = normalized(value.sourceHash, 120);
    return { version: 1, kind, containerId, slot, ...(sourceHash ? { sourceHash } : {}) };
}

export function cgTargetItemId(value) {
    const target = normalizeCgTargetDescriptor(value);
    return target ? [PREFIX, target.kind, encode(target.containerId), encode(target.slot)].join(':') : '';
}

export function cgTargetDescriptorFromItemId(value) {
    const parts = String(value || '').split(':');
    if (parts.length !== 4 || parts[0] !== PREFIX) return null;
    return normalizeCgTargetDescriptor({ version: 1, kind: parts[1], containerId: decode(parts[2]), slot: decode(parts[3]) });
}

function scriptText(item) {
    return (Array.isArray(item?.script) ? item.script : [])
        .map(row => `${normalized(row?.speaker, 24000)}:${normalized(row?.text, 24000)}`).filter(Boolean).join('\n');
}
function sourceForDrama(item, kind) {
    return JSON.stringify([kind, safeId(item?.id), item?.title, item?.subtitle, item?.setting, item?.visualTone,
        (Array.isArray(item?.script) ? item.script : []).map(row => [row?.speaker, row?.text])]);
}
function sourceForEnding(route, slot) {
    if (slot === 'confession') return JSON.stringify(['confession', safeId(route?.id), route?.title || '', route?.subtitle || '', route?.scene || '', route?.confessionText || '', route?.responseSummary || '', route?.afterEffect || '']);
    if (slot.startsWith('scene:')) return JSON.stringify([slot, safeId(route?.id), route?.title, route?.epilogue?.scenes?.[Number(slot.slice(6))]]);
    const epilogue = route?.epilogue || {};
    const body = slot === 'ending'
        ? [route?.endingScene, route?.creditsLine]
        : [epilogue?.title, epilogue?.timeSkip, ...(Array.isArray(epilogue?.scenes) ? epilogue.scenes.map(scene => [scene?.title, scene?.text]) : []), epilogue?.finalLine];
    return JSON.stringify([slot, safeId(route?.id), route?.title, route?.subtitle, ...body]);
}
function languageSidecar(session, category, lineHash) {
    return (Array.isArray(session?.languageVisuals) ? session.languageVisuals : []).find(row =>
        normalized(row?.category, 60) === category && normalized(row?.lineHash, 120) === lineHash) || null;
}
function sourceForLanguage(category, line, sidecar) {
    return JSON.stringify(['language', category, normalized(line, 600), normalized(sidecar?.scenePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS)]);
}
function sourceForPhotoshoot(item) { return hash(photoshoots.photoshootSource(item)); }
function attachVisual(owner, property, initial = {}) {
    let visual = object(owner?.[property]);
    return {
        read: () => visual || {},
        write: () => {
            if (!visual) { visual = { ...initial }; owner[property] = visual; }
            return visual;
        },
    };
}
function attachEndingVisual(owner, slot) {
    let visual = object(owner?.visuals?.[slot]);
    return {
        read: () => visual || {},
        write: () => {
            if (!object(owner.visuals)) owner.visuals = {};
            if (!visual) { visual = {}; owner.visuals[slot] = visual; }
            return visual;
        },
    };
}
function facade({ descriptor, visualRef, sourceHash, title, subtitle = '', scene = '', sourceText = scene, visualSeed = [] }) {
    const saved = visualRef.read();
    const item = { id: cgTargetItemId(descriptor), title: normalized(title, 160), subtitle: normalized(subtitle, 600), desc: sourceText, cgDesc: scene,
        cgSourceText: sourceText,
        imagePrompt: normalized(saved?.imagePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS), visualSeed, sourceHash,
        __rmtCgDescriptor: { ...descriptor, sourceHash } };
    Object.defineProperties(item, {
        cgImage: { enumerable: true, configurable: true, get: () => { const visual = visualRef.read(); return visual.sourceHash === sourceHash ? visual.cgImage : null; }, set: value => { const visual = visualRef.write(); visual.sourceHash = sourceHash; visual.cgImage = value; } },
        cgImageHistory: { enumerable: true, configurable: true, get: () => { const visual = visualRef.read(); return visual.sourceHash === sourceHash ? visual.cgImageHistory : null; }, set: value => { const visual = visualRef.write(); visual.sourceHash = sourceHash; if (value) visual.cgImageHistory = value; else delete visual.cgImageHistory; } },
    });
    return item;
}

// UI calls this with saved data only. It creates a canonical, hash-bound descriptor;
// language targets deliberately require a stored scenePrompt sidecar before they resolve.
export function describeExpandedCgTarget(session, input) {
    const raw = input && typeof input === 'object' ? input : {};
    const kind = normalized(raw.kind, 40);
    if (!KINDS.has(kind)) return null;
    if (kind === 'heart-language') {
        const category = normalized(raw.category || raw.containerId, 60);
        const line = normalized(raw.line, 600);
        if (!constants.HEART_GREETING_KEYS.includes(category) || !line) return null;
        const descriptor = { version: 1, kind, containerId: category, slot: heartLanguageLineHash(category, line) };
        const resolved = resolveCgTargetDescriptor(session, descriptor);
        return resolved?.descriptor || null;
    }
    const descriptor = normalizeCgTargetDescriptor({ version: 1, kind, containerId: raw.containerId, slot: raw.slot || SLOT_BY_KIND[kind] });
    const resolved = descriptor && resolveCgTargetDescriptor(session, descriptor);
    return resolved?.descriptor || null;
}

export function cgTargetInSession(mode, session, itemId) {
    const descriptor = cgTargetDescriptorFromItemId(itemId);
    if (!descriptor) {
        const rows = mode === constants.MODE.ALBUM ? session?.entries : mode === constants.MODE.ADV ? session?.events : mode === constants.MODE.HEART ? session?.dailyStrips : null;
        return Array.isArray(rows) ? rows.find(item => item?.id === itemId) || null : null;
    }
    if (descriptor.kind.startsWith('heart-') && mode !== constants.MODE.HEART) return null;
    if (descriptor.kind.startsWith('ending-') && mode !== constants.MODE.ENDING) return null;
    if (descriptor.kind === 'heart-voice' || descriptor.kind === 'heart-scenario') {
        const isVoice = descriptor.kind === 'heart-voice';
        const rows = isVoice ? session?.voiceDramas : session?.scenarioDramas;
        const owner = (Array.isArray(rows) ? rows : []).find(item => safeId(item?.id) === descriptor.containerId);
        if (!owner) return null;
        const sourceHash = hash(sourceForDrama(owner, descriptor.kind));
        return facade({ descriptor, visualRef: attachVisual(owner, 'visual'), sourceHash, title: owner.title, subtitle: owner.subtitle,
            scene: [normalized(owner.setting, 1800), normalized(owner.visualTone, 600)].filter(Boolean).join('，'),
            sourceText: `${normalized(owner.setting, 1800)}\n${scriptText(owner)}`, visualSeed: [isVoice ? owner.kind : owner.season, owner.visualTone] });
    }
    if (descriptor.kind === 'heart-photoshoot') {
        const owner = (session?.photoshoots || []).find(item => safeId(item?.id) === descriptor.containerId);
        const plan = photoshoots.normalizePhotoshootPlan(owner);
        if (!owner || !plan) return null;
        const sourceHash = sourceForPhotoshoot(plan);
        const routeLabel = photoshoots.photoshootLabel(plan);
        const scene = [plan.scenePrompt, ...plan.moments.map((moment, index) => `格 ${index + 1}: ${moment}`)].join('\n');
        const item = facade({ descriptor, visualRef: attachVisual(owner, 'visual'), sourceHash, title: plan.title,
            subtitle: `${routeLabel} · ${plan.capture}`, scene, visualSeed: [routeLabel, plan.capture, '3×3 九宫格', '9:16 竖版'] });
        item.cgLayout = 'photoshoot-9-grid';
        item.cgOrientation = 'portrait';
        item.__rmtCgPromptMetadata = plan.promptMetadata || null;
        return item;
    }
    if (descriptor.kind.startsWith('ending-')) {
        const owner = (descriptor.kind === 'ending-confession' ? session?.confessionReplays || [] : session?.endings || []).find(item => safeId(item?.id) === descriptor.containerId);
        if (!owner) return null;
        const slot = descriptor.slot;
        const individual = descriptor.kind === 'ending-epilogue-scene' ? owner.epilogue?.scenes?.[Number(slot.slice(6))] : null;
        if (descriptor.kind === 'ending-epilogue-scene' && !individual?.text) return null;
        const sourceHash = hash(sourceForEnding(owner, slot));
        const sourceText = individual ? individual.text : slot === 'ending' ? `${normalized(owner.endingScene, 12000)}\n${normalized(owner.creditsLine, 600)}`
            : slot === 'confession' ? `${owner.scene || ''}\n${owner.confessionText || ''}`
                : (owner.epilogue?.scenes || []).map(row => `${row.title || ''}\n${row.text || ''}`).join('\n');
        // The complete prose stays available to the explicit reconceive action.
        // An initial image draft contains only authored visual/context labels.
        const scene = [owner.title, individual ? individual.title : slot === 'epilogue' ? owner.epilogue?.title : owner.subtitle].filter(Boolean).join('，');
        return facade({ descriptor, visualRef: attachEndingVisual(owner, slot), sourceHash, title: owner.title,
            subtitle: individual ? individual.title : slot === 'epilogue' ? owner.epilogue?.title || '后日谈' : owner.subtitle, scene, sourceText, visualSeed: [owner.type, slot] });
    }
    if (descriptor.kind === 'heart-portrait') {
        const owner = object(session?.languagePortrait);
        if (!owner?.scenePrompt) return null;
        const sourceHash = hash(JSON.stringify(['language-portrait', owner.scenePrompt]));
        const item = facade({ descriptor, visualRef: attachVisual(owner, 'visual'), sourceHash, title: '隔着屏幕的 TA',
            subtitle: '基础语言 · 共用肖像', scene: owner.scenePrompt });
        item.cgPortrait = true;
        return item;
    }
    const line = (session?.greetings?.[descriptor.containerId] || []).find(value => heartLanguageLineHash(descriptor.containerId, value) === descriptor.slot);
    const owner = languageSidecar(session, descriptor.containerId, descriptor.slot);
    if (!line || !owner || !normalized(owner.scenePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS)) return null;
    const sourceHash = hash(sourceForLanguage(descriptor.containerId, line, owner));
    return facade({ descriptor, visualRef: attachVisual(owner, 'visual'), sourceHash, title: owner.title || `${descriptor.containerId} 的一句话`, subtitle: '基础语言画面', scene: owner.scenePrompt, visualSeed: [descriptor.containerId] });
}

export function resolveCgTargetDescriptor(session, descriptor) {
    const normalizedDescriptor = normalizeCgTargetDescriptor(descriptor);
    if (!normalizedDescriptor) return null;
    const mode = normalizedDescriptor.kind.startsWith('ending-') ? constants.MODE.ENDING : constants.MODE.HEART;
    const item = cgTargetInSession(mode, session, cgTargetItemId(normalizedDescriptor));
    if (!item || (normalizedDescriptor.sourceHash && item.sourceHash !== normalizedDescriptor.sourceHash)) return null;
    return { mode, session, item, descriptor: item.__rmtCgDescriptor };
}

export function expandedCgItem(session, descriptor) {
    const resolved = resolveCgTargetDescriptor(session, descriptor);
    return resolved ? { mode: resolved.mode, descriptor: resolved.descriptor, item: resolved.item } : null;
}

// Call from a session normalizer before replacing a regenerated item. It keeps only
// local image sidecars whose source hash still matches the regenerated prose.
function safeLocalImage(value) {
    if (!object(value)) return null;
    const url = cg_image_patch.savedLocalImagePath(value.url);
    if (!url) return null;
    let promptMetadata = null;
    try { const json = JSON.stringify(value.promptMetadata); if (json && json.length <= 12000) promptMetadata = JSON.parse(json); } catch {}
    return { url, prompt: normalized(value.prompt, constants.MAX_CG_IMAGE_PROMPT_CHARS),
        provider: value.provider === 'baibai-image' ? 'baibai-image' : constants.CG_IMAGE_PROVIDER,
        generatedAt: Math.max(0, Number(value.generatedAt) || 0), ...(promptMetadata ? { promptMetadata } : {}) };
}
function safeVisual(value) {
    const raw = object(value), image = safeLocalImage(raw?.cgImage);
    if (!raw || !image) return null;
    const history = (Array.isArray(raw.cgImageHistory) ? raw.cgImageHistory : []).map(safeLocalImage).filter(Boolean).slice(-constants.CG_IMAGE_HISTORY_LIMIT);
    return { sourceHash: normalized(raw.sourceHash, 120), imagePrompt: normalized(raw.imagePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS), cgImage: image,
        ...(history.length ? { cgImageHistory: history } : {}) };
}
function visualKey(visual) { return `${visual?.sourceHash || ''}\u0000${visual?.cgImage?.url || ''}`; }
function safeVisualList(value) {
    const kept = [];
    for (const row of Array.isArray(value) ? value : []) {
        const visual = safeVisual(row);
        if (visual && !kept.some(existing => visualKey(existing) === visualKey(visual))) kept.push(visual);
    }
    return kept;
}
function safePreviousScenes(value) {
    const kept = [];
    for (const row of Array.isArray(value) ? value : []) {
        const scenePrompt = normalized(row?.scenePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS);
        const visual = safeVisual(row?.visual);
        if (scenePrompt && visual && !kept.some(existing => existing.scenePrompt === scenePrompt && visualKey(existing.visual) === visualKey(visual))) {
            kept.push({ scenePrompt, visual });
        }
    }
    return kept;
}
function appendPreviousVisuals(current, additions) {
    return safeVisualList([...(Array.isArray(current) ? current : []), ...(Array.isArray(additions) ? additions : [])]);
}
function expectedVisualHash(item, kind, slot) {
    return kind.startsWith('ending-') ? hash(sourceForEnding(item, slot || SLOT_BY_KIND[kind]))
        : kind === 'heart-voice' || kind === 'heart-scenario' ? hash(sourceForDrama(item, kind)) : '';
}

export function preserveCgSlots(oldItem, newItem, { kind = '', slot = '' } = {}) {
    if (!object(oldItem) || !object(newItem)) return newItem;
    const expected = expectedVisualHash(newItem, kind, slot);
    const oldVisual = safeVisual(oldItem.visual);
    if (oldVisual && oldVisual.sourceHash === expected) newItem.visual = oldVisual;
    else if (oldVisual) {
        delete newItem.visual;
        newItem.previousCgVisuals = appendPreviousVisuals(newItem.previousCgVisuals, [oldVisual]);
    }
    const inheritedPrevious = safeVisualList(oldItem.previousCgVisuals);
    if (inheritedPrevious.length) newItem.previousCgVisuals = appendPreviousVisuals(newItem.previousCgVisuals, inheritedPrevious);
    if (object(newItem.visuals)) newItem.visuals = { ...newItem.visuals };
    const oldVisuals = object(oldItem.visuals);
    if (oldVisuals) for (const targetSlot of Object.keys(oldVisuals).filter(key => ['ending','epilogue','confession'].includes(key) || /^scene:\d+$/.test(key))) {
        const oldSlot = safeVisual(oldVisuals[targetSlot]);
        const wanted = expectedVisualHash(newItem, `ending-${targetSlot}`, targetSlot);
        if (oldSlot?.sourceHash === wanted) {
            if (!object(newItem.visuals)) newItem.visuals = {};
            newItem.visuals[targetSlot] = oldSlot;
        } else if (oldSlot) {
            newItem.visuals = { ...(object(newItem.visuals) || {}) };
            delete newItem.visuals[targetSlot];
            newItem.previousCgVisuals = appendPreviousVisuals(newItem.previousCgVisuals, [oldSlot]);
        }
    }
    return newItem;
}

export function normalizeLocalCgSlots(value) {
    if (!object(value)) return {};
    const visual = safeVisual(value.visual);
    const visuals = object(value.visuals);
    const keptSlots = Object.fromEntries(Object.entries(visuals || {}).filter(([key]) => ['ending','epilogue','confession'].includes(key) || /^scene:\d+$/.test(key))
        .map(([key,value]) => [key,safeVisual(value)]).filter(([,value]) => value));
    const previousCgVisuals = safeVisualList(value.previousCgVisuals);
    return { ...(visual ? { visual } : {}), ...(Object.keys(keptSlots).length ? { visuals: keptSlots } : {}),
        ...(previousCgVisuals.length ? { previousCgVisuals } : {}) };
}

export function normalizeLanguagePortrait(value) {
    if (!object(value)) return null;
    const scenePrompt = normalized(value.scenePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS);
    if (!scenePrompt) return null;
    const previousSceneVisuals = safePreviousScenes(value.previousSceneVisuals);
    return { scenePrompt, ...normalizeLocalCgSlots(value), ...(previousSceneVisuals.length ? { previousSceneVisuals } : {}) };
}

// HEART's language sidecar is separate from the generated greetings. This keeps
// explicit user scene choices and every valid local image reference, never raw
// provider data or arbitrary fields from an old archive.
export function normalizeLanguageCgVisuals(value, greetings = null) {
    const rows = [];
    for (const raw of Array.isArray(value) ? value : []) {
        const category = normalized(raw?.category, 60);
        const lineHash = normalized(raw?.lineHash, 120);
        const scenePrompt = normalized(raw?.scenePrompt, constants.MAX_CG_IMAGE_PROMPT_CHARS);
        if (!constants.HEART_GREETING_KEYS.includes(category) || !/^cgsrc-v1-[a-z0-9]+$/i.test(lineHash) || !scenePrompt) continue;
        if (greetings && !(Array.isArray(greetings[category]) && greetings[category].some(line => heartLanguageLineHash(category, line) === lineHash))) continue;
        const local = normalizeLocalCgSlots(raw);
        const previousSceneVisuals = safePreviousScenes(raw.previousSceneVisuals);
        const row = { category, lineHash, scenePrompt, title: normalized(raw?.title, 160), ...local,
            ...(previousSceneVisuals.length ? { previousSceneVisuals } : {}) };
        const duplicate = rows.findIndex(existing => existing.category === category && existing.lineHash === lineHash);
        if (duplicate >= 0) rows.splice(duplicate, 1);
        rows.push(row);
    }
    return rows;
}
