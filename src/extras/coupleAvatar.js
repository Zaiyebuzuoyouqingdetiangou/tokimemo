// 独立的情侣头像：一次生图得到一对，原图与裁切参数按聊天保存在本机。
// 这里不读取或修改正式档案，也不为生图增加数量、外貌或比例门槛。
import * as core_context from '../core/context.js';
import * as core_castLooks from '../core/castLooks.js';
import * as core_text from '../core/text.js';
import * as core_settings from '../core/settings.js';
import * as cg_format from '../core/cgPromptFormat.js';
import * as appearance_presets from '../generation/imageAppearancePresets.js';
import * as cg_core from '../generation/cgImageCore.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as task_trace from '../core/taskTrace.js';
import * as runtime from '../core/state.js';
import * as styles from './coupleAvatarStyles.js';
import * as prompt_format from './coupleAvatarPromptFormat.js';
import * as subject_details from './coupleAvatarSubjectDetails.js';
import * as interaction_direction from './coupleAvatarInteractionDirection.js';

export const COUPLE_MODE = 'coupleAvatar';
const DATABASE = 'heartbeatMemoriesCoupleAvatars';
const RECORDS = 'pairs';
const SETTINGS = 'settings';
const states = new Map();
let databasePromise = null;
let sequence = 0;
const text = value => typeof value === 'string' ? value.trim() : '';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bound = (value, min, max, fallback) => Math.min(max, Math.max(min, finite(value, fallback)));
const own = (value, key) => !!value && Object.prototype.hasOwnProperty.call(value, key);

export function coupleScope(context = core_context.currentCharacterGuard()) {
    return core_context.chatScopeKey(context);
}

function optionalContext() {
    try { return core_context.currentCharacterGuard(); } catch { return null; }
}

function couplePromptFormat(context, saved = '') {
    const frozen = cg_format.normalizeCgPromptFormat(saved);
    if (!context) return frozen;
    try { return cg_format.normalizeCgPromptFormat(core_settings.getPluginSettings(context).cgPromptFormat, frozen); }
    catch { return frozen; }
}

function couplePresetPeople(people, context) {
    // Storage/history normalization passes null: never rewrite the identities
    // that produced an existing pair just because a provider preset changed.
    if (!context) return people;
    const presets = appearance_presets.resolveImageAppearancePresets(context, people);
    return people.map(person => {
        const previousPreset = text(person.presetAppearance);
        const edited = person.appearanceOverride === true || (previousPreset && person.appearance !== previousPreset);
        const fallback = previousPreset && !edited && own(person, 'fallbackAppearance')
            ? text(person.fallbackAppearance) : person.appearance;
        const local = { id: person.id, name: person.name, appearance: fallback,
            ...(edited ? { appearanceOverride: true } : {}) };
        const preset = !edited ? presets.get(person.id) : null;
        const appearance = text(preset?.tag) || text(preset?.nl);
        return appearance ? { ...local, appearance, fallbackAppearance: fallback, presetAppearance: appearance,
            ...(text(preset?.negative) ? { presetNegative: text(preset.negative) } : {}) } : local;
    });
}

function baseCoupleSettings(context) {
    let looks = null, card = {};
    try { if (context) looks = core_castLooks.readCastLooks(context); } catch { /* Optional saved looks. */ }
    try { card = context?.getCharacterCardFields?.() || {}; } catch { /* Manual appearance remains available. */ }
    const visible = (role, description) => {
        if (text(looks?.[role])) return looks?.manual === true ? text(looks[role]) : core_castLooks.lookFromDescription(looks[role]);
        return core_castLooks.lookFromDescription(description);
    };
    return {
        people: [
            { id: 'char', name: text(context?.name2) || '角色', appearance: visible('char', text(card.description)) },
            { id: 'user', name: text(context?.name1) || '我', appearance: visible('user', text(card.persona) || text(context?.powerUserSettings?.persona_description)) },
        ],
        styleId: 'chibi-dumpling', pairType: 'joined', interaction: '半颗爱心',
        clothing: '', background: '', direction: '', customStyle: '', interactionDetail: '',
    };
}

export function defaultCoupleSettings(context = optionalContext()) {
    const settings = baseCoupleSettings(context);
    const promptFormat = couplePromptFormat(context);
    return { ...settings, people: couplePresetPeople(settings.people, context), ...(promptFormat ? { promptFormat } : {}) };
}

export function normalizeCoupleSettings(value, context = optionalContext()) {
    const input = value && typeof value === 'object' ? value : {};
    const defaults = baseCoupleSettings(context);
    const styleId = text(input.styleId);
    const promptFormat = couplePromptFormat(context, input.promptFormat);
    return {
        people: couplePresetPeople(defaults.people.map((person, index) => {
            const source = Array.isArray(input.people) && input.people[index] && typeof input.people[index] === 'object' ? input.people[index] : {};
            return {
                id: text(source.id) || person.id,
                name: own(source, 'name') ? text(source.name) : person.name,
                appearance: own(source, 'appearance') ? text(source.appearance) : person.appearance,
                ...(own(source, 'fallbackAppearance') ? { fallbackAppearance: text(source.fallbackAppearance) } : {}),
                ...(text(source.presetAppearance) ? { presetAppearance: text(source.presetAppearance) } : {}),
                ...(text(source.presetAppearance) && text(source.presetNegative) ? { presetNegative: text(source.presetNegative) } : {}),
                ...(source.appearanceOverride === true ? { appearanceOverride: true } : {}),
            };
        }), context),
        styleId: styleId === 'custom' || styles.COUPLE_STYLES.some(style => style.id === styleId) ? styleId : defaults.styleId,
        pairType: input.pairType === 'echo' ? 'echo' : 'joined',
        interaction: own(input, 'interaction') ? text(input.interaction) : defaults.interaction,
        clothing: text(input.clothing), background: text(input.background),
        direction: text(input.direction), customStyle: text(input.customStyle), interactionDetail: text(input.interactionDetail),
        ...(promptFormat ? { promptFormat } : {}),
    };
}

const DEFAULT_INTERACTION_PROMPT = 'choose a fresh affectionate interaction with complementary expressions and gestures for these two subjects';

function appearanceReference(value, animal, object) {
    if (!animal && !object) return value;
    let reference = value.replace(/\b\d+\s*(boys?|men|girls?|women|persons?|people)\b/gi, (_, kind) =>
        `${/^(?:boy|men)/i.test(kind) ? 'male ' : /^(?:girl|women)/i.test(kind) ? 'female ' : ''}${animal ? 'animal' : 'crafted figure'}`);
    if (!animal) return reference;
    // Human skin is not fur color. In particular, "black hair, pale skin"
    // must not become the conflicting "black fur markings, pale coat".
    return reference
        .replace(/\b(?:(?:very\s+)?(?:pale|fair|white|light|dark|tan(?:ned)?|brown|olive|porcelain|ivory|smooth|flawless)\s+)*(?:skin(?:\s+tone)?|complexion)\b/gi, '')
        .replace(/(?:皮肤|肤色)\s*[:：]?\s*(?:很|十分|非常)?(?:白皙|苍白|雪白|白色|黝黑|古铜色|浅色|深色|健康|细腻|光滑|白|黑)/g, '')
        .replace(/(?:白皙|苍白|雪白|黝黑|古铜色|细腻|光滑)(?:的)?(?:皮肤|肤色)/g, '')
        .replace(/\b(?:high |low |long |short |twin )?(?:ponytails?|pigtails?|braids?)\b/gi, 'small distinctive fur tuft')
        .replace(/(?:高|低|双|单)?马尾(?:辫)?|辫子/g, '标志性小毛簇')
        .replace(/\b(?:human|boy|girl|man|woman)\b/gi, 'animal')
        .replace(/\bhair\b/gi, 'fur markings')
        .replace(/(?:长|短)?(黑|白|银|金|棕|褐|红|蓝|粉|紫|灰)(?:色)?(?:头)?发/g, '$1色毛发')
        .replace(/头发|发色/g, '毛发配色')
        .replace(/,\s*,/g, ',').replace(/^[,;，；\s]+|[,;，；\s]+$/g, '');
}

// Both outputs are composed locally from the same frozen settings. A flat-only
// provider gets the complete prompt; capable NAI gets scene + two identities.
// Describe the drawing itself. Crop masks, cards and prohibited shapes belong
// to the UI or the provider's negative channel, never the shared positive scene.
export function couplePromptParts(value, context = optionalContext()) {
    const settings = normalizeCoupleSettings(value, null);
    settings.people = couplePresetPeople(settings.people, context);
    const promptFormat = couplePromptFormat(context, settings.promptFormat);
    const chosen = styles.COUPLE_STYLES.find(style => style.id === settings.styleId);
    const animal = chosen?.group === 'animal';
    const object = chosen?.group === 'craft' || ['fantasy-enamel', 'fantasy-shadow'].includes(chosen?.id);
    const subject = animal ? 'animal' : object ? 'crafted character' : 'character';
    const resolvedInteraction = styles.coupleInteraction(settings.interaction, settings.interactionDetail);
    const detailed = ['nai5-natural', 'nai45-tags'].includes(promptFormat);
    const covered = settings.people.map(person => detailed && subject_details.coupleEyesCovered(person.appearance));
    const anyCovered = covered.some(Boolean);
    const ownedInteraction = styles.INTERACTION_PRESETS.some(row => row.label === settings.interaction);
    const interaction = subject_details.coupleVisibleRecipe(resolvedInteraction.prompt, anyCovered && ownedInteraction);
    const originalRendering = chosen?.prompt || settings.customStyle;
    const rendering = subject_details.coupleVisibleRecipe(originalRendering, anyCovered && !!chosen);
    const construction = subject_details.coupleVisibleRecipe(styles.coupleStyleConstruction(chosen), anyCovered);
    const relation = detailed ? interaction_direction.coupleInteractionDirection(settings) : { scene: '', roles: ['', ''] };
    const clothing = subject_details.coupleClothingParts(settings.clothing, settings.people);
    // Explicit NAI 5 drafts get source-bound identity guidance in the actual
    // native actor channels too. Formatless historical prompts stay unchanged.
    const identityRendering = promptFormat === 'nai5-natural' ? styles.coupleStyleIdentityRendering(chosen) : '';
    // Framing and finish are art direction only. Keep full-figure styles and
    // simplified media intact; explicit user directions still take precedence.
    const fullFigure = animal || (chosen?.group === 'chibi' && chosen.id !== 'chibi-headshot')
        || (chosen?.group === 'craft' && !['craft-paper', 'craft-bead'].includes(chosen.id))
        || ['fantasy-enamel', 'fantasy-shadow'].includes(chosen?.id);
    const framing = !chosen ? '' : fullFigure
        ? 'Each complete stylized figure fills most of its own half, with a readable face and connected limbs; retain the selected body proportions.'
        : 'Close head-and-shoulder or upper-body portraits fill most of each half, with visible shoulders and clothing supporting the gestures.';
    const finish = !chosen ? '' : 'Finished artwork in the selected medium: recognizable individual features, intentional contours and gestures connected naturally to the body in the selected form. Keep background detail quieter than the subjects, with clear subject-to-background separation. Preserve deliberate simplicity and the selected medium\'s own texture.';
    const form = animal
        ? 'Two complete animals, species-appropriate animal anatomy, heads, muzzles or beaks, bodies, limbs and tails. Paws, wings or flippers perform the gestures. Each animal has its own eye color, fur markings and small signature accessories derived from its identity.'
        : object ? 'Two crafted figures whose entire faces and bodies are made from the selected material, with its physical texture and construction.'
            : 'The selected medium, proportions, linework and shading define the faces, bodies, clothing and background.';
    const actions = resolvedInteraction.roles.map((action, index) => subject_details.coupleVisibleRecipe(action, covered[index] && ownedInteraction));
    const personClothing = index => detailed && clothing.people[index]
        ? `${animal ? 'Wearable accents adapted to this animal' : 'Clothing for this subject'}: ${clothing.people[index]}. Keep its specified colors, garment shape and accessories visible in the selected medium and proportions.` : '';
    const personDetails = index => [relation.roles[index], subject_details.coupleCoveredEyeGuidance(covered[index]), personClothing(index)].filter(Boolean).join(' ');
    const people = settings.people.map((person, index) => {
        const side = index === 0 ? 'LEFT' : 'RIGHT';
        const reference = appearanceReference(person.appearance, animal, object);
        return `${side} HALF ${subject}: ${person.name || (index === 0 ? 'first character' : 'second character')}${reference ? `; ${animal || object ? 'individual identity in the selected form' : 'appearance'}: ${reference}` : ''}. Action: ${actions[index]}.${personDetails(index) ? ` ${personDetails(index)}` : ''}`;
    });
    const styleLead = rendering ? `Rendering style: ${rendering}.` : '';
    const composition = [
        construction ? `Style construction: ${construction}` : '',
        identityRendering,
        form, framing, finish,
        `One continuous horizontal paired portrait, two distinct ${subject}s side by side, one centered at the left quarter and one at the right quarter, balanced subject scale.`,
        'A continuous background in the selected medium fills the entire image from edge to edge, including the center and all four corners. Faces and gestures sit comfortably within their own half, surrounded by the same continuous background.',
        `Interaction: ${interaction && interaction !== '交给灵感' ? interaction : DEFAULT_INTERACTION_PROMPT}.`,
        `Action roles: LEFT — ${actions[0]}; RIGHT — ${actions[1]}. Adapt gestures to the chosen body form; explicit user directions take precedence.`,
        relation.scene,
        anyCovered ? 'Render eye details only for the subject whose eyes are visible. Preserve the other subject\'s supplied eye covering; show their emotion through mouth, head angle and gesture.' : '',
        settings.direction ? `Direction: ${settings.direction}.` : '',
        settings.clothing ? `${animal ? 'Small wearable accents adapted for animal bodies' : 'Clothing in the selected rendering style'}: ${settings.clothing}.` : '',
        detailed && settings.clothing ? 'The supplied clothing takes precedence over default costume suggestions. Bind left/right or named garments only to their owner; carry shared clothing to both subjects.' : '',
        settings.background ? `Background: ${settings.background}.` : '',
        settings.pairType === 'echo'
            ? 'Complementary individual gestures, coordinated colors and light, continuous background.'
            : 'A shared motif connects the two subjects across the center of the continuous scene.',
        'Preserve each individual\'s own face or muzzle shape, eyes, hair silhouette or markings, clothing and accessories. Shared traits remain shared; expressions and reactions belong to each subject. Express identity colors as tones and shapes when the selected medium is monochrome.',
    ].filter(Boolean);
    const negative = [
        `outer white frame, panel border, central white gutter, split screen, rounded portrait cards, circular picture frames, letterboxing, vignette, fading to blank edges, duplicate character, cloned face, ${detailed ? 'identical duplicate pose' : 'mirrored pose'}, text, watermark`,
        animal ? 'human face, human body, human hands, person wearing animal ears, person holding an animal' : '',
    ].filter(Boolean).join(', ');
    if (promptFormat === 'nai45-tags') return prompt_format.coupleAvatarTagParts({
        settings, chosen, animal, object, subject, fullFigure, negative,
        appearances: settings.people.map(person => appearanceReference(person.appearance, animal, object)),
        covered, clothing, interactionDirection: relation,
    });
    // BaiBai NAI has documented tag + natural-language fields. Keep each
    // literal appearance at the start of its own tag list (including count
    // tokens the provider normalizes), and put the action in that subject's
    // nl. Detailed medium construction is shared once, not repeated per face.
    const nai = {
        prompt: [rendering || 'illustration', `two distinct ${subject}s`, 'side by side'].join(', '),
        nl: [
            construction, framing, finish,
            'One continuous horizontal paired portrait, first subject centered at the left quarter, second at the right quarter, matching scale. Background fills the image edge to edge, through the center and all four corners. Faces and gestures stay comfortably inside their own half.',
            animal || object ? form : '',
            `Interaction: ${interaction && interaction !== '交给灵感' ? interaction : DEFAULT_INTERACTION_PROMPT}.`,
            relation.scene,
            anyCovered ? 'Eye rendering applies only to visible eyes. Keep each supplied eye covering in place; use the covered subject\'s mouth and head angle for expression.' : '',
            settings.pairType === 'echo' ? 'Coordinated colors and light, complementary individual gestures.' : 'A shared motif connects the two subjects.',
            'Render both subjects entirely in the selected medium. For a monochrome medium, identity colors become tones. Adapt gestures to the chosen body form.',
            settings.clothing ? `Clothing or small wearable accents: ${settings.clothing}.` : '',
            detailed && settings.clothing ? 'Use the supplied clothing in preference to default costumes, preserving each garment\'s assigned wearer, colors and shape.' : '',
            settings.background ? `Background: ${settings.background}.` : '',
            settings.direction ? `User direction takes precedence: ${settings.direction}.` : '',
        ].filter(Boolean).join('\n'),
        characters: settings.people.map((person, index) => ({
            name: `${index ? '右边' : '左边'} · ${person.name || (index ? '人物二' : '人物一')}`,
            tag: [appearanceReference(person.appearance, animal, object), subject_details.coupleVisibleRecipe(originalRendering, covered[index] && !!chosen) || subject].filter(Boolean).join(', '),
            nl: [`On the ${index ? 'right' : 'left'}, ${actions[index]}.`, personDetails(index), identityRendering].filter(Boolean).join(' '),
            ...(text(person.presetNegative) ? { negative: text(person.presetNegative) } : {}),
        })),
    };
    return { scene: [styleLead, ...composition].filter(Boolean).join('\n'),
        // Put the actual two appearances before general art direction on flat
        // backends, where a long scene used to bury the individual identities.
        prompt: [styleLead, ...people, ...composition].filter(Boolean).join('\n'), negative, nai,
        ...(promptFormat ? { promptFormat } : {}),
        characters: settings.people.map((person, index) => ({
            name: `${index ? '右边' : '左边'} · ${person.name || (index ? '人物二' : '人物一')}`,
            tag: [people[index], chosen && anyCovered ? `Rendering style: ${subject_details.coupleVisibleRecipe(originalRendering, covered[index])}.` : styleLead,
                subject_details.coupleVisibleRecipe(styles.coupleStyleConstruction(chosen), covered[index])].filter(Boolean).join('\n'),
            ...(text(person.presetNegative) ? { negative: text(person.presetNegative) } : {}),
        })) };
}

export function couplePrompt(value, context = optionalContext()) { return couplePromptParts(value, context).prompt; }

function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        try {
            const request = globalThis.indexedDB?.open(DATABASE, 1);
            if (!request) { reject(new Error('Storage unavailable')); return; }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(RECORDS)) {
                    const records = db.createObjectStore(RECORDS, { keyPath: 'key' });
                    records.createIndex('scope', 'scope', { unique: false });
                }
                if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: 'scope' });
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); databasePromise = null; };
                resolve(db);
            };
            request.onerror = () => reject(request.error || new Error('Storage unavailable'));
            request.onblocked = () => reject(new Error('Storage blocked'));
        } catch (error) { reject(error); }
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
}

async function transact(storeName, mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        let transaction, result;
        try {
            transaction = db.transaction(storeName, mode);
            result = callback(transaction.objectStore(storeName));
        } catch (error) { reject(error); return; }
        transaction.oncomplete = () => resolve(typeof result === 'function' ? result() : result?.result);
        transaction.onerror = () => reject(transaction.error || new Error('Storage write failed'));
        transaction.onabort = () => reject(transaction.error || new Error('Storage transaction interrupted'));
    });
}

function stateFor(scope) {
    const key = String(scope || '');
    if (!states.has(key)) states.set(key, {
        scope: key, records: new Map(), settings: null, settingsAt: 0,
        pending: new Set(), settingsPending: false, loaded: false, loading: null, tail: Promise.resolve(),
    });
    return states.get(key);
}

function originalOf(value) {
    const source = typeof value === 'string' ? { url: value } : value;
    const url = text(source?.url);
    if (!url || /[\u0000-\u001f\u007f]/.test(url)) return null;
    try {
        const base = image_patch.imageResourceBase(), parsed = new URL(url, base);
        // TT's returned /user/images/... paths resolve to tauri://localhost.
        // Use the existing image-host contract for that host, as the provider
        // already does, instead of rejecting a successfully generated image.
        const ttImage = parsed.protocol === 'tauri:' && image_patch.isSameImageHost(parsed, base);
        if (!ttImage && !['http:', 'https:', 'blob:'].includes(parsed.protocol) && !/^data:image\/[a-z0-9.+-]+[;,]/i.test(url)) return null;
    } catch { return null; }
    return { url,
        ...(finite(source?.width, 0) > 0 ? { width: Math.floor(Number(source.width)) } : {}),
        ...(finite(source?.height, 0) > 0 ? { height: Math.floor(Number(source.height)) } : {}),
        ...(text(source?.name) ? { name: text(source.name) } : {}),
    };
}

function cropsOf(value) {
    return [0, 1].map(index => ({
        // These bounds describe local crop geometry, never a generation prerequisite.
        zoom: Math.max(1, finite(value?.[index]?.zoom, 1)),
        x: bound(value?.[index]?.x, -100, 100, 0), y: bound(value?.[index]?.y, -100, 100, 0),
    }));
}

function recordOf(value, scope) {
    const original = originalOf(value?.original);
    if (!value || !text(value.id) || !original) return null;
    return {
        id: text(value.id), scope: String(scope),
        createdAt: Math.max(0, finite(value.createdAt, Date.now())),
        updatedAt: Math.max(0, finite(value.updatedAt, finite(value.createdAt, Date.now()))),
        settings: normalizeCoupleSettings(value.settings, null), original,
        crops: cropsOf(value.crops), order: value.order?.[0] === 1 && value.order?.[1] === 0 ? [1, 0] : [0, 1],
        favorite: value.favorite === true,
    };
}

async function loadState(state) {
    if (state.loaded) return state;
    if (state.loading) return state.loading;
    state.loading = (async () => {
        try {
            const records = await transact(RECORDS, 'readonly', store => {
                const rows = [], request = store.index('scope').openCursor(state.scope);
                request.onsuccess = () => { const cursor = request.result; if (cursor) { rows.push(cursor.value); cursor.continue(); } };
                return () => rows;
            });
            const settings = await transact(SETTINGS, 'readonly', store => store.get(state.scope));
            for (const row of records) {
                const record = recordOf(row, state.scope), current = record && state.records.get(record.id);
                if (record && !state.pending.has(record.id) && (!current || current.updatedAt <= record.updatedAt)) state.records.set(record.id, record);
            }
            if (settings && !state.settingsPending && finite(settings.updatedAt, 0) >= state.settingsAt) {
                state.settings = normalizeCoupleSettings(settings.value, null);
                state.settingsAt = finite(settings.updatedAt, 0);
            }
            state.loaded = true;
        } catch { /* In-memory originals and unsaved edits remain accessible and retryable. */ }
        return state;
    })().finally(() => { state.loading = null; });
    return state.loading;
}

function enqueue(state, action) {
    const next = state.tail.catch(() => {}).then(action);
    state.tail = next.catch(() => {});
    return next;
}

async function durableOriginal(original) {
    if (!original.url.startsWith('blob:')) return original;
    try {
        const response = await fetch(original.url), blob = await response.blob();
        const url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        return originalOf({ ...original, url });
    } catch { return null; }
}

function persistRecord(state, id) {
    return enqueue(state, async () => {
        const record = state.records.get(id);
        if (!record) return false;
        try {
            const original = await durableOriginal(record.original);
            if (!original) return false;
            const saved = { ...record, original };
            await transact(RECORDS, 'readwrite', store => store.put({ ...clone(saved), key: JSON.stringify([state.scope, id]) }));
            if (state.records.get(id)?.updatedAt === record.updatedAt) {
                state.records.set(id, saved);
                state.pending.delete(id);
            }
            return !state.pending.has(id);
        } catch { return false; }
    });
}

export async function readCouples(scope) {
    const state = await loadState(stateFor(scope));
    return {
        records: [...state.records.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).map(clone),
        settings: clone(state.settings), pendingIds: [...state.pending],
        durable: state.loaded && state.pending.size === 0 && !state.settingsPending,
    };
}

export async function saveCoupleSettings(scope, settings) {
    const state = await loadState(stateFor(scope));
    state.settings = normalizeCoupleSettings(settings, null);
    state.settingsAt = Math.max(Date.now(), state.settingsAt + 1);
    state.settingsPending = true;
    const durable = await enqueue(state, async () => {
        const updatedAt = state.settingsAt, value = clone(state.settings);
        try {
            await transact(SETTINGS, 'readwrite', store => store.put({ scope: state.scope, value, updatedAt }));
            if (updatedAt === state.settingsAt) state.settingsPending = false;
            return !state.settingsPending;
        } catch { return false; }
    });
    return { settings: clone(state.settings), durable };
}

function newId() {
    sequence += 1;
    try { return `pair-${globalThis.crypto.randomUUID()}`; }
    catch { return `pair-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2)}`; }
}

export async function addCouple(scope, { settings, original } = {}) {
    const state = await loadState(stateFor(scope));
    const normalized = originalOf(original);
    if (!normalized) throw core_text.safeUserError('没有读取到可用图片，已有头像仍然保留。', 'RMT_COUPLE_IMAGE');
    const now = Date.now();
    const record = { id: newId(), scope: state.scope, createdAt: now, updatedAt: now,
        settings: normalizeCoupleSettings(settings, null), original: normalized,
        crops: cropsOf(null), order: [0, 1], favorite: false };
    state.records.set(record.id, record); state.pending.add(record.id);
    const durable = await persistRecord(state, record.id);
    return { record: clone(state.records.get(record.id)), durable };
}

export async function updateCouple(scope, id, patch = {}) {
    const state = await loadState(stateFor(scope)), previous = state.records.get(String(id));
    if (!previous) throw core_text.safeUserError('这对头像暂时找不到，请重新打开历史记录。', 'RMT_COUPLE_MISSING');
    const record = { ...previous, updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
        ...(own(patch, 'crops') ? { crops: cropsOf(patch.crops) } : {}),
        ...(own(patch, 'order') ? { order: patch.order?.[0] === 1 && patch.order?.[1] === 0 ? [1, 0] : [0, 1] } : {}),
        ...(own(patch, 'favorite') ? { favorite: patch.favorite === true } : {}),
    };
    state.records.set(record.id, record); state.pending.add(record.id);
    const durable = await persistRecord(state, record.id);
    return { record: clone(state.records.get(record.id)), durable };
}

export async function retryCoupleSave(scope, id) {
    const state = await loadState(stateFor(scope)), record = state.records.get(String(id));
    if (!record) throw core_text.safeUserError('这对头像暂时找不到，请重新打开历史记录。', 'RMT_COUPLE_MISSING');
    const durable = await persistRecord(state, record.id);
    return { record: clone(state.records.get(record.id)), durable };
}

export async function exportCouples(scope) {
    const { records, settings } = await readCouples(scope);
    return JSON.stringify({ format: 'hearttrace-couple-avatars', version: 1, exportedAt: Date.now(), records, settings }, null, 2);
}

export async function importCouples(scope, json) {
    let incoming;
    try { incoming = typeof json === 'string' ? JSON.parse(json) : json; } catch { /* Report a safe error below. */ }
    if (incoming?.format !== 'hearttrace-couple-avatars' || incoming?.version !== 1 || !Array.isArray(incoming.records)) {
        throw core_text.safeUserError('这份文件不是情侣头像备份，现有内容没有改变。', 'RMT_COUPLE_IMPORT');
    }
    const state = await loadState(stateFor(scope)), added = [];
    let durable = true;
    for (const value of incoming.records) {
        let record = recordOf(value, state.scope);
        if (!record) continue;
        const sameId = state.records.get(record.id);
        if (sameId?.original.url === record.original.url) continue;
        if (sameId) record = { ...record, id: newId() };
        state.records.set(record.id, record); state.pending.add(record.id); added.push(record.id);
        if (!await persistRecord(state, record.id)) durable = false;
    }
    // Import is additive. A backup never replaces the current form or successful pair.
    if (!state.settings && incoming.settings) {
        const saved = await saveCoupleSettings(state.scope, incoming.settings);
        if (!saved.durable) durable = false;
    }
    return { records: added.map(id => clone(state.records.get(id))), durable };
}

export async function generateCouple(value, { context = core_context.currentCharacterGuard(), signal = null, onProgress = null } = {}) {
    if (signal?.aborted) throw core_text.safeUserError('这次绘制尚未开始。', 'RMT_COUPLE_NOT_STARTED');
    const scope = coupleScope(context), settings = normalizeCoupleSettings(value, context);
    const targetKey = `couple-avatar:${scope}:${newId()}`;
    const trace = task_trace.startTaskTrace(targetKey, COUPLE_MODE);
    runtime.state.activeCoupleAvatarTasks.set(targetKey, true);
    task_trace.markStage(trace, 'start');
    const report = progress => { if (!signal?.aborted) { try { onProgress?.(progress); } catch { /* UI progress cannot lose an image. */ } } };
    // Moving to the background stops foreground updates, not an already paid request.
    // Existing provider wrappers drop late results on abort, so do not pass the view's
    // background signal after submission. A returned result always enters its origin scope.
    try {
        task_trace.beginStage(trace, 'prompt');
        const parts = couplePromptParts(settings, null), prompt = parts.prompt;
        task_trace.markStage(trace, 'prompt');
        task_trace.beginStage(trace, 'request');
        const result = await cg_core.invokeImageGeneration(prompt, context, {
            orientation: 'landscape', respectOrientation: true, aspectRatio: '2:1',
            characterName: settings.people[0].name || context?.name2 || '',
            targetKey, singlePrompt: true, preservePrompt: true, onProgress: report,
            avatarPromptParts: { scene: parts.scene, characters: parts.characters, negative: parts.negative, nai: parts.nai,
                ...(parts.promptFormat ? { promptFormat: parts.promptFormat } : {}) },
        });
        task_trace.markStage(trace, 'request');
        task_trace.markStage(trace, 'response');
        task_trace.beginStage(trace, 'validate');
        const raw = typeof result === 'string' ? result : result?.url;
        const url = cg_core.normalizeCgImageUrl(raw);
        if (!url) throw core_text.safeUserError('这次没有收到可用图片，已有头像仍然保留。', 'RMT_COUPLE_IMAGE');
        task_trace.markStage(trace, 'validate');
        task_trace.beginStage(trace, 'save');
        report({ phase: 'saving' });
        const saved = await addCouple(scope, { settings, original: { url,
            ...(Number(result?.width) > 0 ? { width: Number(result.width) } : {}),
            ...(Number(result?.height) > 0 ? { height: Number(result.height) } : {}),
        } });
        task_trace.markStage(trace, 'save', saved.durable);
        if (!saved.durable) task_trace.markStage(trace, 'deferred');
        task_trace.endTaskTrace(trace, saved.durable ? 'ok' : 'deferred', saved.durable ? null : { code: 'RMT_COUPLE_STORAGE' });
        return { ...saved, scope, cancelled: signal?.aborted === true };
    } catch (error) {
        const safe = error?.safeToDisplay || /^(BBI_|CH8_|RMT_)/.test(text(error?.code)) ? error
            : core_text.safeUserError('这次绘制没有完成，已有头像仍然保留，可以稍后再试。', 'RMT_COUPLE_GENERATION');
        task_trace.endTaskTrace(trace, 'failed', safe);
        throw safe;
    } finally {
        runtime.state.activeCoupleAvatarTasks.delete(targetKey);
    }
}
