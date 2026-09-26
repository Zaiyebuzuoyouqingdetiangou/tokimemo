import * as inbox_art from '../core/letterIllustrationV2.js';
import * as output_budget from '../core/outputBudget.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_participants from '../core/participants.js';
import * as core_generationParticipants from '../core/generationParticipants.js';
import * as core_controlledSources from '../core/controlledSources.js';
import * as core_inputLedger from '../core/inputLedger.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as generation_recovery from './recovery.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_contextTags from '../core/contextTags.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as time_stories from '../core/timeStoriesContract.js';
// C-4（r84.112）：别名沿用 modes_relations，函数体一字不改；实际指向生成层的桥，不再 import 关系模块。
import * as modes_relations from './modesBridge.js';
import * as ui_overlay from '../ui/overlay.js';
// 生成上下文：内容设置与快照裁剪、世界书扫描词、各玩法参与者快照、世界呈现上下文
// 从 generation/client.js 原样搬出（重构阶段 2），声明文本一字未改；generation/client.js 仍转发原有导出。

// Only in-flight bindings; never persisted or exported. Clear at the owning mode's finally.
export const modeTaskTraces = new Map();

export const contentContextSources = new WeakMap();

const CONTENT_SETTING_KEYS = ['creativeSupplementEnabled', 'creativeSupplement', 'excludedContextTags',
    'contextTagMode', 'retainedContextTags', 'bannedGeneratedPhrases', 'useActivatedWorldInfo', 'useCurrentChatExternalMemory', 'cgPromptFormat'];

export function generationContentSettings(settings = {}) {
    return Object.fromEntries(CONTENT_SETTING_KEYS.filter(key => settings[key] !== undefined).map(key => [key, structuredClone(settings[key])]));
}

export function snapshotGenerationContent(value) {
    const snapshot = structuredClone(value), seen = new WeakSet();
    // Internal sessions may contain optional undefined fields. Preserve the
    // same absent-object/null-array representation as their existing JSON
    // storage, without changing the source or relaxing the journal validator.
    const visit = item => {
        if (!item || typeof item !== 'object' || seen.has(item)) return;
        seen.add(item);
        if (Array.isArray(item)) {
            for (let index = 0; index < item.length; index++) {
                if (item[index] === undefined) item[index] = null;
                else visit(item[index]);
            }
        } else if (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
            for (const key of Object.keys(item)) {
                if (item[key] === undefined) delete item[key];
                else visit(item[key]);
            }
        }
    };
    visit(snapshot);
    return snapshot;
}

// Host cards can carry executable or proxied fields that structuredClone rejects.
// Degrade only the offending field to its JSON-safe representation instead of
// failing the whole capture; a field that cannot be copied either way makes the
// source snapshot unverifiable, so generation stops with a coded error and never
// substitutes unchecked current data.
function cloneContentField(value) {
    try { return structuredClone(value); }
    catch {
        try { return JSON.parse(JSON.stringify(value)); }
        catch {
            throw core_text.safeUserError('角色卡资料无法完整快照，本次没有发起模型请求；旧内容与草稿保留。', 'RMT_RECOVERY_SOURCE_SNAPSHOT_MISSING');
        }
    }
}

export function captureGenerationContent(context, bank) {
    const fields = {};
    for (const key of ['characterId', 'name1', 'name2', 'userAvatar', 'personaAvatar', 'user_avatar', 'maxContext']) {
        if (context[key] !== undefined) fields[key] = cloneContentField(context[key]);
    }
    if (Array.isArray(context.characters)) {
        fields.characters = Array.from(context.characters, (character, index) => {
            if (!character) return null;
            const data = character.data && typeof character.data === 'object' ? character.data : character;
            const identityInput = (value, length) => {
                const text = core_text.normalizeText(value, Number.MAX_SAFE_INTEGER);
                return text.length > length ? text.slice(0, length) + text.slice(length).trimStart().slice(0, 1) : text;
            };
            return { name: identityInput(character.name || data.name, 120), avatar: identityInput(character.avatar || data.avatar, 300), data: Object.fromEntries(
                ['description', 'personality', 'scenario', 'first_mes', 'mes_example']
                    .map(key => [key, identityInput(data[key] || character[key], 5000)])) };
        });
    } else if (context.characters !== undefined) fields.characters = cloneContentField(context.characters);
    // Frozen historical targets intentionally keep only their original character
    // index. JSON already represents skipped array positions as null; materialize
    // that representation in the internal snapshot without changing host data.
    if (Array.isArray(fields.characters)) for (let index = 0; index < fields.characters.length; index++) {
        if (!Object.hasOwn(fields.characters, index)) fields.characters[index] = null;
    }
    fields.powerUserSettings = { persona_description: context.powerUserSettings?.persona_description || '' };
    let cardFields = {};
    try {
        const rawFields = context.getCharacterCardFields?.() || {};
        cardFields = Object.fromEntries(['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system', 'system_prompt', 'post_history_instructions']
            .filter(key => rawFields[key] !== undefined)
            .map(key => [key, core_text.normalizeText(rawFields[key], 5000)]));
    } catch {}
    const sourceBank = bank && typeof bank === 'object' ? bank : {};
    const memoryBank = {
        version: sourceBank.version,
        chatId: sourceBank.chatId,
        characterName: sourceBank.characterName,
        userName: sourceBank.userName,
        archiveName: sourceBank.archiveName,
        archiveRevision: sourceBank.archiveRevision,
        archiveSummary: core_text.normalizeText(sourceBank.archiveSummary, 2000),
        archiveKeywords: Array.isArray(sourceBank.archiveKeywords) ? sourceBank.archiveKeywords.slice(0, 16) : [],
        usedMessageCount: sourceBank.usedMessageCount,
        usedCharacterCount: sourceBank.usedCharacterCount,
        sourceMessageCount: sourceBank.sourceMessageCount,
        sourceFingerprint: sourceBank.sourceFingerprint,
        memories: (Array.isArray(sourceBank.memories) ? sourceBank.memories : []).map(item => ({
            id: item?.id,
            title: core_text.normalizeText(item?.title, 100),
            date: core_text.normalizeText(item?.date, 100),
            locked: item?.locked === true,
            anchors: core_text.cleanArray(item?.anchors, 8, 120),
            participants: core_text.cleanArray(item?.participants, 8, 80),
            messageStart: item?.messageStart,
            messageEnd: item?.messageEnd,
            sourceKind: core_text.normalizeText(item?.sourceKind, 80),
            externalSourceIds: core_text.cleanArray(item?.externalSourceIds, 8, 100),
            summary: core_text.normalizeText(item?.summary, 700),
        })),
        coldArchive: (Array.isArray(sourceBank.coldArchive) ? sourceBank.coldArchive : []).map(item => ({
            id: item?.id, title: core_text.normalizeText(item?.title, 100), date: core_text.normalizeText(item?.date, 100),
            locked: item?.locked === true, summary: core_text.normalizeText(item?.summary, 200),
        })),
    };
    return { version: 1, fields, cardFields, memoryBank,
        contentSettings: generationContentSettings(core_settings.getPluginSettings(context)) };
}

// A full archive at the legitimate item cap can serialize beyond the recovery
// snapshot budget, which would otherwise block every derived task before any
// request. Slim only what no snapshot consumer can observe beyond the existing
// prompt contract: prompts are built from the live bank through memoryPayload
// (summary 700 chars), while recovery validators key on id/title/anchors and
// bank-level fields — all kept whole. The cap itself is unchanged: if even the
// distilled form exceeds it, the existing too-large failure still fires.
// Snapshots already within budget stay byte-identical.
export function fitGenerationContentSnapshot(snapshot) {
    const fits = value => {
        try { return JSON.stringify(value).length <= generation_recovery.GENERATION_RECOVERY_LIMITS.requestChars; }
        catch { return false; }
    };
    if (fits(snapshot)) return snapshot;
    const fullBank = snapshot?.memoryBank;
    if (!fullBank || typeof fullBank !== 'object' || !Array.isArray(fullBank.memories)) return snapshot;
    // Prefer the gentlest trim that fits: 1200 keeps the largest reader window
    // any snapshot consumer uses; 700 matches the existing memoryPayload prompt
    // contract exactly. Both keep id/title/anchors/participants and every
    // bank-level field byte-identical, so evidence validation is unchanged.
    for (const summaryLimit of [1200, 700]) {
        const distilled = { ...snapshot, memoryBank: structuredClone(fullBank), memoryBankDistilled: true,
            memoryBankDigest: core_context.stableArchiveHash(JSON.stringify(fullBank)), memoryBankSummaryChars: summaryLimit };
        for (const memory of distilled.memoryBank.memories) {
            if (memory && typeof memory === 'object' && typeof memory.summary === 'string' && memory.summary.length > summaryLimit) {
                memory.summary = core_text.normalizeText(memory.summary, summaryLimit);
            }
        }
        if (summaryLimit === 700 || fits(distilled)) return distilled;
    }
    return snapshot;
}

export function generationContentContext(origin, context) {
    const snapshot = generation_recovery.generationContentSnapshotForOrigin(origin);
    if (!snapshot?.fields) return context;
    const source = contentContextSources.get(context) || context;
    // Historical contexts inherit transport capabilities from the host. Keep
    // that chain while shadowing only the frozen content fields on this view.
    const view = Object.create(source, Object.getOwnPropertyDescriptors({ ...source, ...structuredClone(snapshot.fields),
        powerUserSettings: { ...source.powerUserSettings, ...structuredClone(snapshot.fields.powerUserSettings || {}) },
        getCharacterCardFields: () => structuredClone(snapshot.cardFields || {}) }));
    view.__rmtGenerationContentSnapshot = { mode: generation_recovery.generationRecoveryForOrigin(origin)?.mode,
        memoryBank: snapshot.memoryBank, contentInputs: snapshot.contentInputs };
    view.extensionSettings = { ...source.extensionSettings };
    Object.defineProperty(view.extensionSettings, core_constants.EXTENSION_SETTINGS_KEY, {
        configurable: true, enumerable: true,
        get: () => ({ ...(source.extensionSettings?.[core_constants.EXTENSION_SETTINGS_KEY] || {}), ...snapshot.contentSettings }),
        set: () => {},
    });
    contentContextSources.set(view, source);
    return view;
}

export function generationTrace(options = {}) {
    const parentKey = options.parentTaskKey || core_requestCoordinator.activeModeBuildScopeForTask(options.taskKey || '');
    return options.taskTrace || modeTaskTraces.get(parentKey || options.taskKey) || null;
}

export function generationWorldInfoScanTerms(mode, context = {}) {
    const characterName = core_text.normalizeText(context?.name2, 120);
    const common = characterName ? [characterName] : [];
    if (time_stories.isTimeStoryMode(mode)) return [...common, '通讯', '时代', '世界观', '科技', '时间', '身份', '性格', '传音', '命运', 'communication', 'era', 'time', 'personality'];
    if (mode === core_constants.MODE.ROOM) return [...common, '外貌', '发色', '发型', '穿着', '制服', '服饰', '种族', '住处', '房间', '居所', '时代', '职业', '阶层', '生活习惯', '宠物', '猫', '狗', '鸟', '鹦鹉', '兔', '鱼', '爬宠', '仓鼠', '豚鼠', '灵兽', '使魔', '动物伙伴', 'appearance', 'hair', 'outfit', 'species', 'residence', 'room', 'home', 'pet', 'cat', 'dog', 'bird', 'parrot', 'rabbit', 'fish', 'reptile', 'hamster', 'familiar', 'animal companion'];
    if (mode === core_constants.MODE.PHONE) return [...common, '通讯', '终端', '手机', '设备', '职业', '爱好', '生活习惯', '科技', '时代', '世界观', 'phone', 'device', 'terminal', 'communication', 'hobby', 'occupation'];
    if (mode === core_constants.MODE.TRAVEL) return [...common, '住处', '工作', '学校', '地点', '交通', '出行', '旅行', '路线', '世界观', 'residence', 'work', 'school', 'location', 'travel', 'route', 'transport'];
    if (mode === core_constants.MODE.BUTTERFLY) return [...common, '身份', '职业', '时代', '地点', '关系', '选择', '命运', '相遇', '世界线', '平行世界', 'identity', 'occupation', 'era', 'location', 'fate', 'encounter'];
    if (mode === core_constants.MODE.CALENDAR) return [...common, '节日', '日历', '生日', '纪念日', '祭典', '庆典', 'festival', 'holiday', 'calendar', 'birthday', 'anniversary'];
    return common;
}

function worldPresentationProfileBinding(context) {
    if (Object.prototype.hasOwnProperty.call(context || {}, '__rmtWorldPresentationProfileBinding')) {
        return context.__rmtWorldPresentationProfileBinding || null;
    }
    try {
        const identity = modes_relations.relationsViewIdentity(null, null, context);
        const character = context?.characters?.[Number(context?.characterId)];
        const data = character?.data && typeof character.data === 'object' ? character.data : (character || {});
        return {
            profile: identity.profile,
            expectedProfileKey: identity.profileKey,
            characterName: core_text.normalizeText(context?.name2 || data?.name, 120),
            avatar: core_text.normalizeText(character?.avatar || data?.avatar, 300),
        };
    } catch {
        return null;
    }
}

// Collect the hand-picked setting entries that actually fit this request.
//
// Two rules, both deliberate:
//   1. Whole entries only. Half a setting entry is worse than none, because the model
//      would quote a sentence that is no longer present in the evidence and the quote
//      would then fail verbatim validation anyway.
//   2. Never throw. A world book that is missing, unselected, partially readable or
//      simply too large must degrade to "less evidence", not to "no generation". The
//      modes already work with zero setting evidence — they fall back to the character
//      card — so blocking the whole request was never the right failure mode.
async function collectFittingSelectedSetting(context, budget = core_constants.MAX_SELECTED_SETTING_CHARS) {
    const empty = { text: '', used: 0, total: 0, dropped: 0, complete: true, note: '' };
    let selected;
    try {
        selected = await archive_repository.collectSelectedMemoryWorldInfo(context, core_context.getChatId(context), null, { settingsOnly: true });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('[HeartbeatMemories] selected setting unavailable', core_text.safeErrorDiagnostic(error));
        return { ...empty, complete: false, note: '本次没能读取所选设定世界书，已改用角色卡证据继续生成。' };
    }
    const excluded = core_contextTags.tagPolicyForContext(context);
    const kept = [];
    let chars = 0;
    let total = 0;
    for (const entry of selected.entries) {
        const text = core_contextTags.filterContextTags(entry.content, excluded);
        if (!text) continue;
        total += 1;
        if (chars + text.length + 1 > budget) continue;
        kept.push(text);
        chars += text.length + 1;
    }
    const dropped = total - kept.length;
    const collectorIncomplete = selected.coverage?.status !== 'complete';
    const notes = [];
    if (dropped > 0) notes.push(`本次设定容量只装下 ${kept.length}/${total} 条所选条目，其余条目未送入（旧内容保留）`);
    if (collectorIncomplete) notes.push(core_text.normalizeText(selected.coverage?.reason, 200));
    return {
        text: kept.join('\n'),
        used: kept.length,
        total,
        dropped,
        complete: dropped === 0 && !collectorIncomplete,
        note: notes.filter(Boolean).join('；'),
    };
}

export async function buildWorldPresentationContext(context, memoryBank, mode, origin = null, participantSnapshot = null) {
    context = generationContentContext(origin, context);
    return generation_recovery.frozenGenerationInput(origin, `presentation:${mode}`, () => buildWorldPresentationContextFresh(context, memoryBank, mode, participantSnapshot));
}

export async function captureRoomParticipantSnapshot(context, origin, { existing = null, participantSnapshot } = {}) {
    // Keep legacy recipes and single-card journals byte-for-byte free of the
    // multiplayer input key. Only explicit multiplayer work freezes a roster.
    if (existing && !Object.hasOwn(existing.frozenInputs || {}, 'participants:room')) return null;
    const snapshot = existing
        ? core_participants.normalizeParticipantSnapshot(JSON.parse(existing.frozenInputs['participants:room']))
        : participantSnapshot !== undefined ? core_participants.normalizeParticipantSnapshot(participantSnapshot)
            : core_participants.selectedParticipantSnapshot(core_cache.readParticipantRoster(context));
    if (!snapshot) return null;
    return generation_recovery.frozenGenerationInput(origin, 'participants:room', () => snapshot);
}

export async function captureAlbumParticipantSnapshot(context, origin, { existing = null, participantSnapshot } = {}) {
    // Keep legacy recipes and single-card journals byte-for-byte free of the
    // multiplayer input key. Only explicit multiplayer work freezes a roster.
    if (existing && !Object.hasOwn(existing.frozenInputs || {}, 'participants:album')) return null;
    const snapshot = existing
        ? core_participants.normalizeParticipantSnapshot(JSON.parse(existing.frozenInputs['participants:album']))
        : participantSnapshot !== undefined ? core_participants.normalizeParticipantSnapshot(participantSnapshot)
            : core_participants.selectedParticipantSnapshot(core_cache.readParticipantRoster(context));
    if (!snapshot) return null;
    return generation_recovery.frozenGenerationInput(origin, 'participants:album', () => snapshot);
}

export async function captureModeParticipantSnapshot(mode, context, origin, { existing = null, participantSnapshot, memoryBank = null } = {}) {
    if ([core_constants.MODE.ROOM, core_constants.MODE.ALBUM].includes(mode)) return null;
    const key = 'participants:mode';
    // An old recovery recipe must remain byte-identical. Absence means the
    // original request did not have a generic participant selection.
    if (existing && !Object.hasOwn(existing.frozenInputs || {}, key)) return null;
    const frozenSnapshot = existing ? JSON.parse(existing.frozenInputs[key])
        : participantSnapshot !== undefined ? participantSnapshot : undefined;
    const roster = memoryBank?.[core_participants.PARTICIPANTS_KEY] || core_cache.readParticipantRoster(context);
    const snapshot = core_generationParticipants.resolveGenerationParticipantSnapshot({ roster, frozenSnapshot });
    // New work freezes null too. That prevents a later roster edit from turning
    // a single-person retry into a different prompt, without adding a prompt block.
    return generation_recovery.frozenGenerationInput(origin, key, () => snapshot);
}

async function activatedWorldInfoText(context, mode) {
    if (core_settings.getPluginSettings(context).useActivatedWorldInfo === false || typeof context.getWorldInfoPrompt !== 'function') return '';
    try {
        const result = await context.getWorldInfoPrompt(generationWorldInfoScanTerms(mode, context), Math.max(2048, Math.min(32768, Number(context.maxContext) || 8192)), true, {});
        const worldText = result?.worldInfoString || [result?.worldInfoBefore, result?.worldInfoAfter].filter(Boolean).join('\n');
        return core_contextTags.filterContextTags(core_text.normalizeText(worldText, 12000), core_contextTags.tagPolicyForContext(context));
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('[HeartbeatMemories] activated world info unavailable', core_text.safeErrorDiagnostic(error));
        return '';
    }
}

async function collectSelectedSettingEntries(context) {
    try {
        const selected = await archive_repository.collectSelectedMemoryWorldInfo(context, core_context.getChatId(context), null, { settingsOnly: true });
        const excluded = core_contextTags.tagPolicyForContext(context);
        const entries = [];
        for (const entry of selected.entries || []) {
            const content = core_contextTags.filterContextTags(entry.content, excluded);
            if (!content) continue;
            entries.push({ ...entry, content });
        }
        return { entries, incomplete: selected.coverage?.status !== 'complete', reason: core_text.normalizeText(selected.coverage?.reason, 200) };
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('[HeartbeatMemories] selected setting entries unavailable', core_text.safeErrorDiagnostic(error));
        return { entries: [], incomplete: true, reason: '本次没能读取所选设定世界书。' };
    }
}

async function buildWorldPresentationContextFresh(context, memoryBank, mode, participantSnapshot = null) {
    const wantsSelectedSetting = time_stories.isTimeStoryMode(mode) || [core_constants.MODE.ROOM, core_constants.MODE.TRAVEL, core_constants.MODE.PHONE, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG, core_constants.MODE.BEDTIME].includes(mode);
    if (participantSnapshot?.people?.length) {
        const selected = wantsSelectedSetting ? await collectSelectedSettingEntries(context) : { entries: [], incomplete: false, reason: '' };
        const activatedText = selected.entries.length ? '' : await activatedWorldInfoText(context, mode);
        const assembled = core_controlledSources.assembleControlledSources({
            participantSnapshot,
            selectedEntries: selected.entries,
            activatedText,
            budgetChars: core_constants.MAX_CONTROLLED_WORLD_TOTAL_CHARS,
        });
        const contextEnvelope = await core_cache.buildControlledContextEnvelope(context, {
            worldInfoScanTerms: generationWorldInfoScanTerms(mode, context),
            participantSnapshot,
            controlledWorldText: assembled.worldText,
        });
        const notes = [assembled.note, selected.incomplete ? selected.reason : ''].filter(Boolean);
        return {
            contextEnvelope,
            profile: core_worldPresentation.resolveWorldPresentation(contextEnvelope, memoryBank, worldPresentationProfileBinding(context)),
            settingEvidence: core_worldPresentation.controlledWorldEvidence(contextEnvelope, null),
            characterEvidence: mode === core_constants.MODE.INBOX ? inbox_art.captureEvidence(contextEnvelope, participantSnapshot) : core_worldPresentation.controlledCharacterEvidence(contextEnvelope),
            selectedSetting: {
                text: assembled.worldText,
                used: assembled.used,
                total: assembled.total,
                dropped: assembled.dropped,
                complete: assembled.complete && !selected.incomplete,
                note: notes.join('；'),
                deduplicatedChars: assembled.deduplicatedChars,
                included: assembled.included,
                excluded: assembled.excluded,
            },
        };
    }
    let selectedSetting = wantsSelectedSetting
        ? await collectFittingSelectedSetting(context)
        : { text: '', used: 0, total: 0, dropped: 0, complete: true, note: '' };

    const build = async settingText => {
        const contextEnvelope = await core_cache.buildControlledContextEnvelope(context, {
            worldInfoScanTerms: generationWorldInfoScanTerms(mode, context),
            selectedSettingText: settingText,
        });
        return { contextEnvelope, settingEvidence: core_worldPresentation.controlledWorldEvidence(contextEnvelope, null) };
    };

    let { contextEnvelope, settingEvidence } = await build(selectedSetting.text);
    // The evidence reader has its own combined card/world budget, so a large character
    // card can still push the tail of the setting text out. Halve once and retry rather
    // than failing: a smaller quotable set still beats no setting evidence at all.
    if (selectedSetting.text && !settingEvidence.includes(selectedSetting.text)) {
        selectedSetting = await collectFittingSelectedSetting(context, Math.floor(core_constants.MAX_SELECTED_SETTING_CHARS / 2));
        ({ contextEnvelope, settingEvidence } = await build(selectedSetting.text));
        if (selectedSetting.text && !settingEvidence.includes(selectedSetting.text)) {
            selectedSetting = { text: '', used: 0, total: selectedSetting.total, dropped: selectedSetting.total, complete: false,
                note: '角色卡与世界书合计超出本次证据容量，本轮改用角色卡证据生成；所选设定未送入，旧内容保留。' };
            ({ contextEnvelope, settingEvidence } = await build(''));
        }
    }

    return {
        contextEnvelope,
        profile: core_worldPresentation.resolveWorldPresentation(contextEnvelope, memoryBank, worldPresentationProfileBinding(context)),
        settingEvidence,
        characterEvidence: mode === core_constants.MODE.INBOX ? inbox_art.captureEvidence(contextEnvelope, participantSnapshot) : core_worldPresentation.controlledCharacterEvidence(contextEnvelope),
        selectedSetting,
    };
}

export function chunkForGeneration(items, size) {
    const safeSize = Math.max(1, Math.floor(Number(size) || 1));
    const out = [];
    for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += safeSize) {
        out.push(items.slice(index, index + safeSize));
    }
    return out;
}

export async function mapGenerationConcurrent(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    let firstError = null;
    const workerCount = Math.max(1, Math.min(Math.floor(Number(limit) || 1), list.length));
    async function run() {
        while (!firstError) {
            const index = cursor;
            cursor += 1;
            if (index >= list.length) return;
            try {
                results[index] = await worker(list[index], index);
            } catch (error) {
                firstError = firstError || error;
                return;
            }
        }
    }
    await Promise.all(Array.from({ length: workerCount }, () => run()));
    if (firstError) throw firstError;
    return results;
}

// The host tokenizer may use an unavailable service. Bound the wait, then use
// r74's character-budget fallback. This is not an exact token estimate or a
// provider retry; the user's original generation request has not been sent yet.
// A reachable tokenizer answers in milliseconds; an unreachable one burned 5s on every
// single request here. The character budget still enforces the real limit.
export const TOKEN_COUNT_TIMEOUT_MS = 1500;

function countPromptTokens(context, prompt, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = 0;
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
            handler(value);
        };
        const onAbort = () => finish(reject, core_requestCoordinator.createGenerationAbortError());
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        timer = setTimeout(() => finish(reject,
            core_text.safeUserError('本地 token 计数超时，本段未发送生成请求。', 'RMT_TOKEN_COUNT_TIMEOUT')), timeoutMs);
        Promise.resolve().then(() => {
            if (signal?.aborted) throw core_requestCoordinator.createGenerationAbortError();
            return context.getTokenCountAsync(prompt);
        }).then(value => finish(resolve, value), error => finish(reject, error));
    });
}

export function enrichInputBudgetError(error, logicalTask, prompt) {
    if (error?.code !== 'RMT_INPUT_BUDGET') return error;
    const packing = logicalTask?.inputPacking || null;
    const ledger = core_inputLedger.accountFinalPrompt(prompt, packing);
    const detail = core_inputLedger.preflightDetailText({ ledger, packing, budget: error.inputBudget });
    const dropped = packing?.dropped > 0 ? `设定已发送 ${packing.used}/${packing.total}，未送入条目见同一次说明。` : '';
    const largest = ledger.largest?.chars ? `最大占用段：${ledger.largest.label} ${ledger.largest.chars.toLocaleString()} 字符。` : '';
    const message = [error.safeUserMessage || error.message, dropped, largest, '可以减少人物、减少设定，或在设置中提高输入预算。'].filter(Boolean).join('');
    error.message = message;
    error.safeUserMessage = message;
    error.preflightDetail = detail;
    if (logicalTask) logicalTask.preflightNotified = true;
    return error;
}

function preflightSurfaceVisible(mode) {
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    return !!overlay && !overlay.hidden && !!mode && runtimeState.activeMode === mode;
}

export function notifyInputPackingOnce(logicalTask, budget, prompt, options) {
    if (!logicalTask || logicalTask.preflightNotified) return;
    const packing = logicalTask.inputPacking;
    if (!packing || !(packing.dropped > 0) || !packing.note) return;
    logicalTask.preflightNotified = true;
    const ledger = core_inputLedger.accountFinalPrompt(prompt, packing);
    const summary = packing.note;
    const detail = core_inputLedger.preflightDetailText({ ledger, packing, budget });
    if (options?.automatic === true) return;
    if (preflightSurfaceVisible(options?.mode) && options?.background !== true) ui_overlay.showInlinePreflight(summary, detail, { error: false });
    else globalThis.toastr?.info?.(summary, `心迹回廊 · ${core_constants.MODE_LABEL[options?.mode] || '生成'}`);
}

export async function assertPromptBudget(context, prompt, { skipTokenCount = false, signal = null,
    tokenCountTimeoutMs = TOKEN_COUNT_TIMEOUT_MS, taskTrace = null } = {}) {
    if (signal?.aborted) throw core_requestCoordinator.createGenerationAbortError();
    let budgetTokens = core_constants.MAX_GENERATION_INPUT_TOKENS;
    try { budgetTokens = core_settings.getPluginSettings(context).inputBudgetTokens; }
    catch { /* fixtures without a settings host keep the default */ }
    budgetTokens = output_budget.normalizeInputBudgetTokens(budgetTokens);
    const charCap = output_budget.generationInputCharCap(budgetTokens);
    core_taskTrace.recordInput(taskTrace, prompt.length);
    const budgetError = (message, tokens = null, tokensKnown = false) => {
        const error = core_text.safeUserError(message, 'RMT_INPUT_BUDGET');
        error.inputBudget = { chars: prompt.length, tokens, tokensKnown, budgetTokens, charCap };
        return error;
    };
    if (prompt.length > charCap) {
        throw budgetError(`本次输入 ${prompt.length.toLocaleString()} 字符，预算 ${budgetTokens.toLocaleString()} tokens，字符顶 ${charCap.toLocaleString()}。tokens 未知，已按字符安全顶判断。已在发送前拦截。`);
    }
    let tokens = null;
    let tokensKnown = false;
    if (!skipTokenCount && typeof context.getTokenCountAsync === 'function') {
        core_taskTrace.beginStage(taskTrace, 'token-count');
        try {
            const timeout = Math.max(1, Math.min(TOKEN_COUNT_TIMEOUT_MS, Number(tokenCountTimeoutMs) || TOKEN_COUNT_TIMEOUT_MS));
            const count = await countPromptTokens(context, prompt, signal, timeout);
            const counted = (typeof count === 'number' || (typeof count === 'string' && count.trim())) ? Number(count) : NaN;
            if (!Number.isFinite(counted) || counted < 0) {
                throw core_text.safeUserError('本地计数暂不可用。', 'RMT_TOKEN_COUNT_UNAVAILABLE');
            }
            tokens = Math.round(counted);
            tokensKnown = true;
            core_taskTrace.recordInput(taskTrace, prompt.length, tokens);
            if (tokens > budgetTokens) {
                throw budgetError(`本次输入 ${prompt.length.toLocaleString()} 字符 / ${tokens.toLocaleString()} tokens，预算 ${budgetTokens.toLocaleString()}。已在发送前拦截。`, tokens, true);
            }
            core_taskTrace.markStage(taskTrace, 'token-count');
        } catch (error) {
            core_taskTrace.markStage(taskTrace, 'token-count', false);
            if (signal?.aborted || error?.name === 'AbortError') throw core_requestCoordinator.createGenerationAbortError();
            if (error?.code === 'RMT_INPUT_BUDGET') throw error;
            tokens = null;
            tokensKnown = false;
            core_taskTrace.markStage(taskTrace, 'token-count-fallback');
            console.warn('[HeartbeatMemories] input token count unavailable; using character budget only', core_text.safeErrorDiagnostic(error));
        }
    }
    if (signal?.aborted) throw core_requestCoordinator.createGenerationAbortError();
    return { chars: prompt.length, tokens, tokensKnown, budgetTokens, charCap };
}

export const GENERATED_PHRASE_EVIDENCE_KEYS = new Set([
    'sourceMemoryAnchor', 'relationshipSourceMemoryAnchor', 'sourceExternalAnchor',
]);

export function generatedPhrasePolicyText(settings) {
    const banned = core_settings.normalizeBannedGeneratedPhrases(settings?.bannedGeneratedPhrases);
    if (!banned.length) return '';
    return `\n\n【新生成文本禁用词】除 sourceMemoryAnchor / relationshipSourceMemoryAnchor / sourceExternalAnchor 等证据锚点必须忠实引用原档案外，任何新生成的标题、叙述、角色台词、模拟用户台词、摘要、场景文本中都禁止出现以下词语：${banned.map(item => `「${item}」`).join('、')}。房间 pets[].sourceEvidence、visualProfile.explicitEvidence 以及出行 locations[].sourceSettingEvidence 也只能逐字引用本次受控设定原文，不能改写或补造证据；这些证据中的原词不等于允许在台词中使用。不要解释这条规则，只需改用符合人设且不含禁用词的表达。`;
}

export function findBannedGeneratedPhrase(value, banned, key = '', evidence = null, path = '') {
    if (GENERATED_PHRASE_EVIDENCE_KEYS.has(key)) return '';
    const settingPath = evidence?.mode === core_constants.MODE.ROOM
        ? /^(?:pets\.\d+\.sourceEvidence|visualProfile\.explicitEvidence\.[a-zA-Z.]+)$/.test(path)
        : evidence?.mode === core_constants.MODE.TRAVEL && /^locations\.\d+\.sourceSettingEvidence$/.test(path);
    if (settingPath && typeof value === 'string' && value.length <= 800
        && core_worldPresentation.controlledEvidenceContains(evidence.settingText || '', value)) return '';
    if (typeof value === 'string') return banned.find(phrase => phrase && value.includes(phrase)) || '';
    if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
            const found = findBannedGeneratedPhrase(item, banned, key, evidence, path ? `${path}.${index}` : String(index));
            if (found) return found;
        }
        return '';
    }
    if (value && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value)) {
            const found = findBannedGeneratedPhrase(childValue, banned, childKey, evidence, path ? `${path}.${childKey}` : childKey);
            if (found) return found;
        }
    }
    return '';
}

export function assertNoBannedGeneratedPhrase(value, settings, evidence = null) {
    const banned = core_settings.normalizeBannedGeneratedPhrases(settings?.bannedGeneratedPhrases);
    if (!banned.length) return;
    const found = findBannedGeneratedPhrase(value, banned, '', evidence);
    if (!found) return;
    const error = new Error(`模型新生成内容命中禁用词「${found}」。本次结果没有保存，也不会自动重试；请手动重试，或在插件设置里调整“生成禁用词”。历史聊天原文和证据锚点不会被改写。`);
    error.code = 'RMT_BANNED_GENERATED_PHRASE';
    throw error;
}
