// 独立的情侣头像：一次生图得到一对，原图与裁切参数按聊天保存在本机。
// 这里不读取或修改正式档案，也不为生图增加数量、外貌或比例门槛。
import * as core_context from '../core/context.js';
import * as core_castLooks from '../core/castLooks.js';
import * as core_text from '../core/text.js';
import * as cg_core from '../generation/cgImageCore.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as task_trace from '../core/taskTrace.js';
import * as runtime from '../core/state.js';
import * as styles from './coupleAvatarStyles.js';

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

export function defaultCoupleSettings(context = optionalContext()) {
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

export function normalizeCoupleSettings(value, context = optionalContext()) {
    const input = value && typeof value === 'object' ? value : {};
    const defaults = defaultCoupleSettings(context);
    const styleId = text(input.styleId);
    return {
        people: defaults.people.map((person, index) => {
            const source = Array.isArray(input.people) && input.people[index] && typeof input.people[index] === 'object' ? input.people[index] : {};
            return {
                id: text(source.id) || person.id,
                name: own(source, 'name') ? text(source.name) : person.name,
                appearance: own(source, 'appearance') ? text(source.appearance) : person.appearance,
            };
        }),
        styleId: styleId === 'custom' || styles.COUPLE_STYLES.some(style => style.id === styleId) ? styleId : defaults.styleId,
        pairType: input.pairType === 'echo' ? 'echo' : 'joined',
        interaction: own(input, 'interaction') ? text(input.interaction) : defaults.interaction,
        clothing: text(input.clothing), background: text(input.background),
        direction: text(input.direction), customStyle: text(input.customStyle), interactionDetail: text(input.interactionDetail),
    };
}

const DEFAULT_INTERACTION_PROMPT = 'choose a fresh affectionate interaction with complementary expressions and gestures for these two subjects';

export function couplePrompt(value) {
    const settings = normalizeCoupleSettings(value, null);
    const chosen = styles.COUPLE_STYLES.find(style => style.id === settings.styleId);
    const animal = chosen?.group === 'animal';
    const object = chosen?.group === 'craft' || ['fantasy-enamel', 'fantasy-shadow'].includes(chosen?.id);
    const subject = animal ? 'animal' : object ? 'crafted character' : 'character';
    const interaction = settings.interaction === '自定义互动' ? settings.interactionDetail
        : styles.INTERACTION_PRESETS.find(item => item.label === settings.interaction)?.prompt || settings.interaction;
    const form = animal
        ? 'The TWO main subjects ARE complete animals, with species-appropriate heads, bodies, limbs and tails. No human faces or human bodies, no people wearing animal ears, no people holding animal versions. Adapt actions to paws, wings or flippers. Translate original hair/eye colors and signature accessories into animal identity cues.'
        : object ? 'The TWO main subjects ARE the crafted objects described by the selected style. Their faces and bodies use that material and construction. Not humans holding toys or wearing material-themed costumes.'
            : 'Apply the selected rendering medium, proportions, linework and shading to the entire characters and image, not only to background decorations.';
    const people = settings.people.map((person, index) => {
        const side = index === 0 ? 'LEFT' : 'RIGHT';
        // Only transform the outgoing animal reference. Saved/manual appearances
        // remain intact and human styles continue to receive their original text.
        const reference = animal ? person.appearance.replace(/\b\d+\s*(?:boys?|girls?|men|women|persons?|people)\b/gi, '')
            .replace(/\b(?:human|boy|girl|man|woman)\b/gi, 'character').replace(/\bhair\b/gi, 'fur markings')
            .replace(/\bskin\b/gi, 'coat').replace(/(?:皮肤|肤色|头发|发色)/g, '毛色') : person.appearance;
        return `${side} HALF ${subject}: ${person.name || (index === 0 ? 'first character' : 'second character')}${reference ? `; ${animal || object ? 'identity reference to reinterpret in the selected form' : 'appearance'}: ${reference}` : ''}.`;
    });
    return [
        chosen ? `Rendering style: ${chosen.prompt}.` : '',
        settings.styleId === 'custom' && settings.customStyle ? `Rendering style: ${settings.customStyle}.` : '',
        form,
        `One matching avatar pair in one horizontal image, preferably 2:1. One ${subject} centered in EACH of two equal square halves.`,
        `Interaction: ${interaction && interaction !== '交给灵感' ? interaction : DEFAULT_INTERACTION_PROMPT}.`,
        settings.direction ? `Direction: ${settings.direction}.` : '',
        ...people,
        settings.clothing ? `${animal ? 'Small wearable accents adapted for animal bodies' : 'Clothing in the selected rendering style'}: ${settings.clothing}.` : '',
        settings.background ? `Background: ${settings.background}.` : '',
        settings.pairType === 'echo'
            ? 'Independent portraits, coordinated colors and light, complementary poses.'
            : 'Connected background and shared motif across the center, matching scale.',
        'Leave margin around both heads for square/circle crops. Readable expressions, distinct poses, no mirrored duplicates. Preserve each identity and gender within the chosen form; improvise unspecified details. No text, watermark, frame or divider.',
    ].filter(Boolean).join('\n');
}

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
        const prompt = couplePrompt(settings);
        task_trace.markStage(trace, 'prompt');
        task_trace.beginStage(trace, 'request');
        const result = await cg_core.invokeImageGeneration(prompt, context, {
            orientation: 'landscape', respectOrientation: true, aspectRatio: '2:1',
            characterName: settings.people[0].name || context?.name2 || '',
            targetKey, singlePrompt: true, preservePrompt: true, onProgress: report,
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
