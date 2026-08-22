const TOUCH_THEATER_SELECTOR = '[data-rm-dai-sekkin-mode="true"], [data-rm-touch-theater="true"]';
const TOUCH_ZONE_SELECTOR = 'label[data-rm-touch-zone]';
const TOUCH_CLOSE_SELECTOR = '[data-rm-touch-close="true"]';
const TOUCH_NEUTRAL_SELECTOR = 'input[data-rm-touch-neutral-state="true"]';
const TOUCH_THRESHOLD_REACTION_SELECTOR = '[data-rm-touch-threshold-reaction="true"]';
const TOUCH_METER_SELECTOR = '[data-rm-touch-meter="true"]';
const TOUCH_METER_FILL_SELECTOR = '[data-rm-touch-meter-fill="true"]';
const TOUCH_METER_VALUE_SELECTOR = '[data-rm-touch-meter-value="true"]';
const TOUCH_INPUT_SELECTOR = 'input[type="radio"], input[type="checkbox"]';
const RABBIT_MIRROR_SELECTOR = 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"], [data-rabbit-mirror-external-shell][data-rm-source="independent"]';

const TOUCH_ZONE_IDS = new Set([
    'head',
    'face',
    'shoulder',
    'chest',
    'hand',
    'waist',
    'thigh',
    'knee',
    'calf',
    'mystery-1',
    'mystery-2',
    // Compatibility with 1.4.15-1.4.25 mirrors.
    'arm',
    'left-hand',
    'right-hand',
    'hair',
]);

const LIVE2D_ZONE_IDS = new Set([
    'head', 'face', 'hair', 'shoulder', 'chest', 'waist', 'arm', 'hand',
    'thigh', 'knee', 'calf', 'hip', 'leg', 'body', 'left-hand', 'right-hand',
]);

const MYSTERY_LIVE2D_ZONE_IDS = new Set([
    'chest', 'waist', 'thigh', 'knee', 'calf', 'hip', 'leg', 'body',
]);

const LIVE2D_AREA_ALIASES = Object.freeze({
    head: ['head', 'face', '頭', '头', '頭部', '头部'],
    face: ['face', 'head', '顔', '脸', '臉', '面部'],
    hair: ['hair', 'head', '髪', '发', '髮', '头发', '頭髮'],
    shoulder: ['shoulder', 'body', 'torso', '肩', '肩部', '身体', '身體'],
    chest: ['chest', 'bust', 'body', 'torso', '胸', '胸部', '身体', '身體'],
    waist: ['waist', 'body', 'torso', '腰', '腰部', '身体', '身體'],
    hip: ['hip', 'hips', 'pelvis', 'waist', 'body', 'torso', '胯', '髋', '髖', '腰', '腰部', '身体', '身體'],
    body: ['body', 'torso', 'upperbody', '身体', '身體', '躯干', '軀幹'],
    arm: ['arm', 'body', '腕', '手臂', '身体', '身體'],
    hand: ['hand', 'hands', 'arm', '手', '手部', '手掌', '掌'],
    thigh: ['thigh', 'leg', 'body', '大腿', '腿', '腿部', '身体', '身體'],
    knee: ['knee', 'leg', '膝', '膝盖', '膝蓋', '腿', '腿部'],
    calf: ['calf', 'lowerleg', 'leg', '小腿', '腿', '腿部'],
    leg: ['leg', 'legs', 'lowerbody', '腿', '腿部', '下半身'],
    'left-hand': ['lefthand', 'handleft', 'lhand', 'leftarm', 'armleft', '左手', '左腕'],
    'right-hand': ['righthand', 'handright', 'rhand', 'rightarm', 'armright', '右手', '右腕'],
});

const APPROACH_MODES = new Set(['natural', 'gs']);
const APPROACH_THRESHOLD = 100;

let touchTheaterListenerInstalled = false;
let touchTheaterObserver = null;
const recentTouchByTheater = new WeakMap();
const approachStateByTheater = new WeakMap();
let initializedTouchTheaters = new WeakSet();
let trustedAdultTouchTheaters = new WeakSet();
const trustedAdultTouchCharacters = new Set();
let pendingMysteryInputActivations = new WeakSet();

function normalizeTouchZone(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return TOUCH_ZONE_IDS.has(normalized) ? normalized : '';
}

function normalizeLive2dTouchZone(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return LIVE2D_ZONE_IDS.has(normalized) ? normalized : '';
}

function isMysteryTouchZone(zone) {
    return zone === 'mystery-1' || zone === 'mystery-2';
}

function isModelEligibleTouchZone(theater, zoneNode, zone) {
    if (!zone) return false;
    if (!isMysteryTouchZone(zone)) return true;
    return theater?.getAttribute?.('data-rm-touch-adult') === 'true'
        && zoneNode?.getAttribute?.('data-rm-touch-intimate') === 'true';
}

function currentAdultTouchCharacterKey() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context || context.groupId != null) return '';
    const character = String(context.name2 || '').trim();
    const characterId = String(context.characterId ?? context.chid ?? '').trim();
    if (!character && !characterId) return '';
    return `${characterId}\u241f${character}`;
}

function requestTrustedAdultTouchConsent(theater) {
    if (trustedAdultTouchTheaters.has(theater)) return true;
    const key = currentAdultTouchCharacterKey();
    if (!key) return false;
    if (trustedAdultTouchCharacters.has(key)) {
        trustedAdultTouchTheaters.add(theater);
        return true;
    }
    const confirmAdult = globalThis.confirm;
    if (typeof confirmAdult !== 'function') return false;
    const context = globalThis.SillyTavern?.getContext?.();
    const character = String(context?.name2 || '').trim();
    const label = character ? `「${character}」` : '当前角色';
    const accepted = confirmAdult(
        `RabbitMirror 大接近：私密隐藏触点仅限明确成年角色。\n\n确认${label}为成年人，并在本次页面会话中启用其私密隐藏触点？`,
    ) === true;
    if (!accepted) return false;
    trustedAdultTouchCharacters.add(key);
    trustedAdultTouchTheaters.add(theater);
    return true;
}

function live2dZoneForTouchNode(zoneNode, zone) {
    if (!isMysteryTouchZone(zone)) return normalizeLive2dTouchZone(zone);
    const mapped = normalizeLive2dTouchZone(zoneNode?.getAttribute?.('data-rm-touch-live2d-zone'));
    return MYSTERY_LIVE2D_ZONE_IDS.has(mapped) ? mapped : '';
}

function normalizeLive2dAreaName(value) {
    return String(value || '')
        .normalize?.('NFKC')
        ?.toLowerCase()
        ?.replace(/[\s_.:/\\-]+/g, '') || '';
}

function safeSlashArgument(value, maxLength = 180) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > maxLength) return '';
    // STscript uses a command pipeline. This optional bridge fails closed for values that
    // could alter quoting, macro expansion or pipeline structure rather than trying to
    // reinterpret unusual local Live2D names.
    if (/[\u0000-\u001f\u007f\u2028\u2029|{}"\\]/.test(raw)) return '';
    return raw;
}

function resolveLive2dHitArea(zone, hitAreas) {
    const aliases = LIVE2D_AREA_ALIASES[zone] || [];
    if (!aliases.length || !hitAreas || typeof hitAreas !== 'object') return null;
    const candidates = Object.entries(hitAreas).map(([key, value]) => ({
        key,
        value: value && typeof value === 'object' ? value : {},
        normalized: normalizeLive2dAreaName(value?.name || key),
    }));
    for (const alias of aliases) {
        const normalizedAlias = normalizeLive2dAreaName(alias);
        const exact = candidates.find(candidate => candidate.normalized === normalizedAlias);
        if (exact) return exact;
    }
    return null;
}

export function buildTouchTheaterLive2dCommands(zoneValue, context) {
    const zone = normalizeLive2dTouchZone(zoneValue);
    if (!zone || !context || context.groupId != null) return [];
    const live2d = context.extensionSettings?.live2d;
    if (!live2d?.enabled) return [];

    const character = String(context.name2 || '').trim();
    const modelPath = live2d.characterModelMapping?.[character];
    const modelSettings = modelPath
        ? live2d.characterModelsSettings?.[character]?.[modelPath]
        : null;
    const hitArea = resolveLive2dHitArea(zone, modelSettings?.hit_areas);
    if (!hitArea) return [];

    const characterArg = safeSlashArgument(character);
    if (!characterArg) return [];

    const expression = safeSlashArgument(hitArea.value?.expression);
    const motion = safeSlashArgument(hitArea.value?.motion);
    const commands = [];
    if (expression && String(hitArea.value?.expression || '').trim().toLowerCase() !== 'none') {
        commands.push(`/live2dexpression character="${characterArg}" expression="${expression}"`);
    }
    if (motion && String(hitArea.value?.motion || '').trim().toLowerCase() !== 'none') {
        commands.push(`/live2dmotion character="${characterArg}" motion="${motion}"`);
    }
    return commands;
}

async function triggerTouchTheaterLive2d(zone) {
    const normalizedZone = normalizeLive2dTouchZone(zone);
    if (!normalizedZone) return;
    const context = globalThis.SillyTavern?.getContext?.();
    const execute = context?.executeSlashCommandsWithOptions;
    if (typeof execute !== 'function') return;
    const commands = buildTouchTheaterLive2dCommands(normalizedZone, context);
    for (const command of commands) {
        try {
            await execute(command, {
                handleParserErrors: true,
                handleExecutionErrors: true,
            });
        } catch (error) {
            console.debug('[RabbitMirror] Dai Sekkin Live2D bridge skipped command:', error);
        }
    }
}

function isDuplicateTouch(theater, zone) {
    const now = Number(globalThis.performance?.now?.() || Date.now());
    const previous = recentTouchByTheater.get(theater);
    recentTouchByTheater.set(theater, { zone, at: now });
    return previous?.zone === zone && Number.isFinite(previous?.at) && (now - previous.at) < 120;
}

function touchInputById(theater, id) {
    const targetId = String(id || '').trim();
    if (!targetId || !theater?.querySelectorAll) return null;
    for (const input of theater.querySelectorAll(TOUCH_INPUT_SELECTOR)) {
        if (String(input.id || '') === targetId) return input;
    }
    return null;
}

function resolveTouchZoneRoute(theater, zoneNode) {
    if (!theater?.querySelectorAll || !zoneNode) return null;
    const zone = normalizeTouchZone(zoneNode.getAttribute?.('data-rm-touch-zone'));
    const forId = String(zoneNode.getAttribute?.('for') || '').trim();
    if (!zone || !forId) return null;
    const input = touchInputById(theater, forId);
    if (!input || input.disabled || input.getAttribute?.('data-rm-touch-neutral-state') === 'true') return null;
    const routes = [];
    for (const label of theater.querySelectorAll(TOUCH_ZONE_SELECTOR)) {
        if (String(label.getAttribute?.('for') || '').trim() !== forId) continue;
        const candidateZone = normalizeTouchZone(label.getAttribute?.('data-rm-touch-zone'));
        if (!candidateZone) continue;
        routes.push({ zoneNode: label, zone: candidateZone, input });
    }
    if (routes.length !== 1 || routes[0].zoneNode !== zoneNode || routes[0].zone !== zone) return null;
    return routes[0];
}

function touchZoneRoutesForInput(theater, input) {
    if (!theater?.querySelectorAll || !input) return [];
    const id = String(input.id || '').trim();
    if (!id) return [];
    const routes = [];
    for (const label of theater.querySelectorAll(TOUCH_ZONE_SELECTOR)) {
        if (String(label.getAttribute?.('for') || '').trim() !== id) continue;
        const zone = normalizeTouchZone(label.getAttribute?.('data-rm-touch-zone'));
        if (!zone) continue;
        routes.push({ zoneNode: label, zone, input });
    }
    return routes;
}

function touchTheaterInputsForZones(theater) {
    if (!theater?.querySelectorAll) return [];
    const inputs = [];
    const seen = new Set();
    for (const label of theater.querySelectorAll(TOUCH_ZONE_SELECTOR)) {
        const route = resolveTouchZoneRoute(theater, label);
        if (!route || seen.has(route.input)) continue;
        seen.add(route.input);
        inputs.push(route.input);
    }
    return inputs;
}

function activationInputFromClick(theater, target) {
    if (!theater || !target?.closest) return null;
    const direct = target.closest(TOUCH_INPUT_SELECTOR);
    if (direct && theater.contains?.(direct)) return direct;
    const label = target.closest('label');
    if (!label) return null;
    const forId = String(label.getAttribute?.('for') || '').trim();
    if (forId) return touchInputById(theater, forId);
    if (!theater.contains?.(label)) return null;
    const nested = label.querySelector?.(TOUCH_INPUT_SELECTOR);
    return nested && theater.contains?.(nested) ? nested : null;
}

function touchTheaterForTargetOrAssociatedInput(target) {
    if (!target?.closest) return null;
    const directInput = target.closest(TOUCH_INPUT_SELECTOR);
    const directInputTheater = directInput?.closest?.(TOUCH_THEATER_SELECTOR);
    if (directInputTheater) return directInputTheater;

    const label = target.closest('label');
    const forId = String(label?.getAttribute?.('for') || '').trim();
    if (forId) {
        const ownerDocument = label?.ownerDocument || globalThis.document;
        const input = ownerDocument?.getElementById?.(forId);
        const associatedTheater = input?.matches?.(TOUCH_INPUT_SELECTOR)
            ? input.closest?.(TOUCH_THEATER_SELECTOR)
            : null;
        if (associatedTheater) return associatedTheater;
    }
    return target.closest(TOUCH_THEATER_SELECTOR);
}

function forceTouchNeutralState(theater, input = null) {
    if (!theater) return;
    const apply = () => {
        if (input) input.checked = false;
        const neutral = theater.querySelector?.(TOUCH_NEUTRAL_SELECTOR);
        if (neutral) neutral.checked = true;
    };
    apply();
    try { globalThis.queueMicrotask?.(apply); } catch {}
}

function allowNextMysteryInputActivation(input) {
    if (!input) return;
    pendingMysteryInputActivations.add(input);
    try { globalThis.queueMicrotask?.(() => pendingMysteryInputActivations.delete(input)); } catch {}
}

function blockUntrustedMysteryActivation(event, theater, target) {
    const input = activationInputFromClick(theater, target);
    if (!input) return false;
    const routes = touchZoneRoutesForInput(theater, input);
    const mysteryRoutes = routes.filter(route => isMysteryTouchZone(route.zone));
    if (!mysteryRoutes.length) return false;

    const direct = target.closest?.(TOUCH_INPUT_SELECTOR);
    if (direct === input && pendingMysteryInputActivations.has(input)) {
        pendingMysteryInputActivations.delete(input);
        return false;
    }

    const canonical = target.closest?.(TOUCH_ZONE_SELECTOR);
    const canonicalRoute = routes.length === 1 && mysteryRoutes.length === 1 && canonical === mysteryRoutes[0].zoneNode
        ? mysteryRoutes[0]
        : null;
    if (canonicalRoute) return false;

    event.preventDefault?.();
    forceTouchNeutralState(theater, input);
    return true;
}

function hideThresholdReaction(theater) {
    if (!theater?.querySelectorAll) return;
    for (const reaction of theater.querySelectorAll(TOUCH_THRESHOLD_REACTION_SELECTOR)) {
        reaction.removeAttribute?.('data-rm-touch-threshold-runtime-visible');
        reaction.setAttribute?.('hidden', '');
        reaction.setAttribute?.('aria-hidden', 'true');
        reaction.style?.setProperty?.('display', 'none', 'important');
    }
}

function revealThresholdReaction(theater) {
    if (theater?.getAttribute?.('data-rm-touch-threshold-dismissed') === 'true') return;
    if (!theater?.querySelectorAll) return;
    for (const reaction of theater.querySelectorAll(TOUCH_THRESHOLD_REACTION_SELECTOR)) {
        reaction.removeAttribute?.('hidden');
        reaction.setAttribute?.('aria-hidden', 'false');
        reaction.setAttribute?.('data-rm-touch-threshold-runtime-visible', 'true');
        reaction.style?.setProperty?.('display', 'block', 'important');
    }
}

function resetTouchInputsToNeutral(theater) {
    if (!theater?.querySelectorAll) return;
    for (const input of touchTheaterInputsForZones(theater)) input.checked = false;
    const neutral = theater.querySelector?.(TOUCH_NEUTRAL_SELECTOR);
    if (neutral) neutral.checked = true;
}

function normalizeTouchTheaterRuntime(theater) {
    if (!theater || initializedTouchTheaters.has(theater)) return;
    initializedTouchTheaters.add(theater);
    approachStateByTheater.delete(theater);
    recentTouchByTheater.delete(theater);
    theater.removeAttribute?.('data-rm-touch-last-zone');
    theater.removeAttribute?.('data-rm-touch-reaction-closed');
    theater.removeAttribute?.('data-rm-touch-threshold-reached');
    theater.removeAttribute?.('data-rm-touch-threshold-dismissed');
    theater.removeAttribute?.('data-rm-touch-approach-progress');
    theater.style?.removeProperty?.('--rm-touch-approach-progress');
    hideThresholdReaction(theater);

    const mode = approachModeForTheater(theater);
    if (mode) {
        theater.setAttribute?.('data-rm-touch-approach-stage', 'neutral');
        resetTouchInputsToNeutral(theater);
        if (mode === 'gs') {
            theater.setAttribute?.('data-rm-touch-approach-progress', '0');
            theater.style?.setProperty?.('--rm-touch-approach-progress', '0%');
            updateGsMeter(theater, 0);
        }
    } else {
        theater.removeAttribute?.('data-rm-touch-approach-stage');
    }
}

function normalizeExistingTouchTheaters() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    for (const theater of document.querySelectorAll(TOUCH_THEATER_SELECTOR)) {
        if (!theater.closest?.(RABBIT_MIRROR_SELECTOR)) continue;
        normalizeTouchTheaterRuntime(theater);
    }
}

function normalizeTouchTheaterMutationNode(node) {
    if (!(node instanceof Element)) return;
    const theaters = [];
    if (node.matches?.(TOUCH_THEATER_SELECTOR)) theaters.push(node);
    for (const theater of node.querySelectorAll?.(TOUCH_THEATER_SELECTOR) || []) theaters.push(theater);
    for (const theater of theaters) {
        if (!theater.closest?.(RABBIT_MIRROR_SELECTOR)) continue;
        normalizeTouchTheaterRuntime(theater);
    }

    const reactions = [];
    if (node.matches?.(TOUCH_THRESHOLD_REACTION_SELECTOR)) reactions.push(node);
    for (const reaction of node.querySelectorAll?.(TOUCH_THRESHOLD_REACTION_SELECTOR) || []) reactions.push(reaction);
    for (const reaction of reactions) {
        const theater = reaction.closest?.(TOUCH_THEATER_SELECTOR);
        if (!theater || !theater.closest?.(RABBIT_MIRROR_SELECTOR)) continue;
        hideThresholdReaction(theater);
    }
}

function initTouchTheaterObserver() {
    if (touchTheaterObserver || typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
    const root = document.querySelector?.('#chat') || document.body;
    if (!root) return;
    touchTheaterObserver = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes || []) normalizeTouchTheaterMutationNode(node);
        }
    });
    touchTheaterObserver.observe(root, { childList: true, subtree: true });
}

function closeTouchTheaterReaction(theater) {
    if (!theater?.querySelectorAll) return 0;
    let changed = 0;
    for (const input of touchTheaterInputsForZones(theater)) {
        if (!input.checked) continue;
        input.checked = false;
        changed += 1;
    }
    const neutral = theater.querySelector(TOUCH_NEUTRAL_SELECTOR);
    if (neutral && !neutral.checked) {
        neutral.checked = true;
        changed += 1;
    }
    if (theater.getAttribute?.('data-rm-touch-approach-stage') === 'threshold') {
        theater.setAttribute?.('data-rm-touch-threshold-dismissed', 'true');
        hideThresholdReaction(theater);
    }
    theater.removeAttribute?.('data-rm-touch-last-zone');
    theater.setAttribute?.('data-rm-touch-reaction-closed', 'true');
    return changed;
}

function approachModeForTheater(theater) {
    const mode = String(theater?.getAttribute?.('data-rm-touch-approach-mode') || '').trim().toLowerCase();
    return APPROACH_MODES.has(mode) ? mode : '';
}

function approachWeightForZone(zoneNode) {
    const raw = Number.parseInt(String(zoneNode?.getAttribute?.('data-rm-touch-weight') || ''), 10);
    return Number.isFinite(raw) ? Math.max(1, Math.min(3, raw)) : 2;
}

function randomApproachUnit() {
    const value = Number(globalThis.Math?.random?.());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0.5;
}

function approachGain(weight, priorTouches) {
    const base = 12 + Math.floor(randomApproachUnit() * 7) + ((weight - 2) * 3);
    if (priorTouches <= 0) return Math.max(6, base);
    if (priorTouches === 1) return Math.max(4, Math.round(base * 0.45));
    return Math.max(2, Math.round(base * 0.25));
}

function approachStageForProgress(progress) {
    if (progress >= APPROACH_THRESHOLD) return 'threshold';
    if (progress >= 50) return 'close';
    if (progress > 0) return 'warming';
    return 'neutral';
}

function getApproachState(theater, mode) {
    const current = approachStateByTheater.get(theater);
    if (current?.mode === mode) return current;
    const next = {
        mode,
        progress: 0,
        stage: 'neutral',
        zoneTouches: new Map(),
    };
    approachStateByTheater.set(theater, next);
    return next;
}

function updateGsMeter(theater, progress) {
    if (!theater?.querySelector) return;
    const meter = theater.querySelector(TOUCH_METER_SELECTOR);
    if (!meter) return;
    meter.setAttribute?.('aria-valuemin', '0');
    meter.setAttribute?.('aria-valuemax', String(APPROACH_THRESHOLD));
    meter.setAttribute?.('aria-valuenow', String(progress));
    meter.style?.setProperty?.('--rm-touch-approach-progress', `${progress}%`);
    const fill = meter.querySelector?.(TOUCH_METER_FILL_SELECTOR) || theater.querySelector(TOUCH_METER_FILL_SELECTOR);
    fill?.style?.setProperty?.('--rm-touch-approach-progress', `${progress}%`);
    const value = meter.querySelector?.(TOUCH_METER_VALUE_SELECTOR) || theater.querySelector(TOUCH_METER_VALUE_SELECTOR);
    if (value) value.textContent = `${progress}%`;
}

function updateApproachPresentation(theater, state) {
    theater.setAttribute?.('data-rm-touch-approach-stage', state.stage);
    if (state.mode === 'gs') {
        theater.setAttribute?.('data-rm-touch-approach-progress', String(state.progress));
        theater.style?.setProperty?.('--rm-touch-approach-progress', `${state.progress}%`);
        updateGsMeter(theater, state.progress);
    } else {
        theater.removeAttribute?.('data-rm-touch-approach-progress');
        theater.style?.removeProperty?.('--rm-touch-approach-progress');
    }
    if (state.stage === 'threshold') {
        theater.setAttribute?.('data-rm-touch-threshold-reached', 'true');
        revealThresholdReaction(theater);
    } else {
        theater.removeAttribute?.('data-rm-touch-threshold-reached');
        hideThresholdReaction(theater);
    }
}

function advanceTouchApproach(theater, zoneNode, zone) {
    const mode = approachModeForTheater(theater);
    if (!mode) return null;
    const state = getApproachState(theater, mode);
    const priorTouches = state.zoneTouches.get(zone) || 0;
    const weight = approachWeightForZone(zoneNode);
    const gain = approachGain(weight, priorTouches);
    state.zoneTouches.set(zone, priorTouches + 1);
    state.progress = Math.min(APPROACH_THRESHOLD, state.progress + gain);
    state.stage = approachStageForProgress(state.progress);
    updateApproachPresentation(theater, state);
    return { mode, gain, progress: state.progress, stage: state.stage };
}

function onTouchTheaterClick(event) {
    const target = event?.target;
    if (!(target instanceof Element)) return;

    const theater = touchTheaterForTargetOrAssociatedInput(target);
    if (!theater || !theater.closest?.(RABBIT_MIRROR_SELECTOR)) return;
    normalizeTouchTheaterRuntime(theater);

    const closeNode = target.closest?.(TOUCH_CLOSE_SELECTOR);
    if (closeNode && closeNode.closest?.(TOUCH_THEATER_SELECTOR) === theater) {
        // Prevent a <label> close control from toggling its target again after we have
        // already returned the theater to the neutral state. No input/change events are
        // dispatched here, so closing cannot enter a generation or Live2D message path.
        event.preventDefault?.();
        closeTouchTheaterReaction(theater);
        return;
    }

    // The safety boundary is the actual radio/checkbox state source, not only the
    // model-authored hotspot label. Direct input clicks or secondary labels pointing at a
    // mystery input are rejected even after an adult confirmation, so every intimate
    // activation must pass through the single canonical RabbitMirror hotspot route.
    if (blockUntrustedMysteryActivation(event, theater, target)) return;

    const zoneNode = target.closest?.(TOUCH_ZONE_SELECTOR);
    if (!zoneNode || zoneNode.closest?.(TOUCH_THEATER_SELECTOR) !== theater) return;
    const route = resolveTouchZoneRoute(theater, zoneNode);
    if (!route) {
        // Malformed/ambiguous hotspots do not get to advance approach or trigger Live2D.
        event.preventDefault?.();
        return;
    }
    const { zone, input } = route;
    if (!isModelEligibleTouchZone(theater, zoneNode, zone)) {
        event.preventDefault?.();
        forceTouchNeutralState(theater, input);
        return;
    }
    if (isMysteryTouchZone(zone) && !requestTrustedAdultTouchConsent(theater)) {
        // The generated adult=true marker is only a candidate. A one-time local user
        // confirmation, kept outside model-authored DOM, is required before an intimate
        // state source is allowed to activate.
        event.preventDefault?.();
        forceTouchNeutralState(theater, input);
        return;
    }
    if (isDuplicateTouch(theater, zone)) return;
    if (isMysteryTouchZone(zone)) allowNextMysteryInputActivation(input);

    theater.removeAttribute('data-rm-touch-reaction-closed');
    theater.setAttribute('data-rm-touch-last-zone', zone);
    advanceTouchApproach(theater, zoneNode, zone);
    const live2dZone = live2dZoneForTouchNode(zoneNode, zone);
    if (live2dZone) void triggerTouchTheaterLive2d(live2dZone);
}

export function initTouchTheaterBridge() {
    if (touchTheaterListenerInstalled || typeof document === 'undefined') return;
    normalizeExistingTouchTheaters();
    initTouchTheaterObserver();
    document.addEventListener('click', onTouchTheaterClick, false);
    touchTheaterListenerInstalled = true;
}

export function destroyTouchTheaterBridge() {
    if (!touchTheaterListenerInstalled || typeof document === 'undefined') return;
    document.removeEventListener('click', onTouchTheaterClick, false);
    touchTheaterObserver?.disconnect?.();
    touchTheaterObserver = null;
    touchTheaterListenerInstalled = false;
    initializedTouchTheaters = new WeakSet();
    trustedAdultTouchTheaters = new WeakSet();
    pendingMysteryInputActivations = new WeakSet();
    trustedAdultTouchCharacters.clear();
}
