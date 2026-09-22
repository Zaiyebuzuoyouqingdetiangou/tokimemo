import * as advanced_generation from '../core/advancedGeneration.js';
import * as recovery_source from '../core/recoverySourcePolicy.js';
import * as output_budget from '../core/outputBudget.js';
import * as archive_requestBudget from '../archive/requestBudget.js';
import * as cg_policy from './cgPromptPolicy.js';
import * as core_butterflyContract from '../core/butterflyContract.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_participants from '../core/participants.js';
import * as core_controlledSources from '../core/controlledSources.js';
import * as core_inputLedger from '../core/inputLedger.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as creative_supplement from '../core/creativeSupplement.js';
import * as generation_recovery from './recovery.js';
import * as generation_progress from './partialProgress.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_contextTags from '../core/contextTags.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_jsonParser from './jsonParser.js';
import * as generation_normalizers from './normalizers.js';
import * as generation_prompts from './prompts.js';
import * as generation_jsonShapeExamples from './jsonShapeExamples.js';
import * as generation_jsonPageTemperature from './jsonPageTemperature.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_phone from '../modes/phone.js';
import * as modes_song from '../modes/themeSong.js';
import * as song_contract from '../core/themeSongContract.js';
import * as heart_reader from '../ui/heartReaderState.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_pastLives from '../modes/pastLives.js';
import * as modes_timeStories from '../modes/timeStories.js';
import * as time_stories from '../core/timeStoriesContract.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as modes_travel from '../modes/travel.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';
import * as ui_contentManager from '../ui/contentManager.js';
import * as navigation_bookmark from '../ui/navigationBookmark.js';

// Only in-flight bindings; never persisted or exported. Clear at the owning mode's finally.
const modeTaskTraces = new Map();
const contentContextSources = new WeakMap();
const CONTENT_SETTING_KEYS = ['creativeSupplementEnabled', 'creativeSupplement', 'excludedContextTags',
    'contextTagMode', 'retainedContextTags', 'bannedGeneratedPhrases', 'useActivatedWorldInfo', 'useCurrentChatExternalMemory', 'cgPromptFormat'];
export function generationContentSettings(settings = {}) {
    return Object.fromEntries(CONTENT_SETTING_KEYS.filter(key => settings[key] !== undefined).map(key => [key, structuredClone(settings[key])]));
}
function snapshotGenerationContent(value) {
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
function captureGenerationContent(context, bank) {
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
function generationTrace(options = {}) {
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
    const wantsSelectedSetting = time_stories.isTimeStoryMode(mode) || [core_constants.MODE.ROOM, core_constants.MODE.TRAVEL, core_constants.MODE.PHONE, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG].includes(mode);
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
            characterEvidence: core_worldPresentation.controlledCharacterEvidence(contextEnvelope),
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
        characterEvidence: core_worldPresentation.controlledCharacterEvidence(contextEnvelope),
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

export async function requestValidatedSegment(prompt, status, options, validator) {
    const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options?.origin);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    if (logicalTask?.participantSnapshot && !options?.participantPromptApplied) {
        const block = logicalTask.participantPromptIndexed
            ? core_participants.participantIndexPromptBlock(logicalTask.participantSnapshot)
            : core_participants.participantPromptBlock(logicalTask.participantSnapshot);
        if (block && !prompt.includes(block)) prompt += block;
        options = { ...options, participantPromptApplied: true };
    }
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(options?.origin)) {
        throw core_requestCoordinator.createGenerationAbortError();
    }
    prompt = cg_policy.cgPromptForSegment(prompt, options);
    validator = cg_policy.cgSegmentValidator(validator, options);
    const parentTrace = generationTrace(options);
    const taskTrace = core_taskTrace.startTaskTrace('', options?.mode, parentTrace);
    core_taskTrace.markStage(taskTrace, 'start');
    core_taskTrace.beginStage(taskTrace, 'prompt');
    try {
    const context = generationContentContext(options?.origin, options?.context || core_context.currentCharacterGuard());
    options = { ...options, taskTrace, context, contextEnvelope: typeof options?.contextEnvelope === 'string'
        ? options.contextEnvelope : await generation_recovery.frozenGenerationInput(options?.origin, `context:${options?.mode || 'segment'}`,
            () => core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(options?.mode, context) })) };
    const result = await generation_recovery.withRecoverySegment(prompt, options, validator, async (prompt, options, accepted) => {
    let lastError = null;
    // Automatic retry is off by default. A failed segment used to silently re-run prompt
    // building, token counting and a second paid request; on a slow host that turned one
    // failure into minutes of extra billing the user could not stop. Successful segments
    // are already kept by the recovery draft, so the run stops and waits for「续写」.
    const allowAutoRetry = options?.allowAutoRetry === true;
    const configuredAttempts = allowAutoRetry
        ? Math.max(1, Math.min(core_requestCoordinator.MAX_RATE_LIMIT_ATTEMPTS, Number(options?.segmentMaxAttempts) || core_requestCoordinator.MAX_RATE_LIMIT_ATTEMPTS))
        : 1;
    const maxAttempts = Math.max(configuredAttempts, 2);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const retryNote = attempt && lastError
            ? '\n\n【本地校验反馈】' + (core_butterflyContract.butterflyValidationFeedback(lastError) || generation_recovery.generationRetryFeedbackText(lastError?.code, lastError) || core_text.normalizeText(lastError?.repairHint, 600) || (String(lastError.code || '').startsWith('RMT_ROOM_') ? core_text.safeErrorSummary(lastError) : '上一轮结构或完整度没有通过。')) + ' 请严格按原硬性要求重新输出完整 JSON，不要解释，也不要引用这条反馈作为内容。'
            : '';
        try {
            const raw = await requestJson(`${prompt}${retryNote}`, `${status}${attempt ? `（重试 ${attempt}/${maxAttempts - 1}）` : ''}`, options);
            core_taskTrace.beginStage(options.taskTrace, 'validate');
            const value = core_requestCoordinator.validateGeneratedSegment(raw, validator);
            core_taskTrace.markStage(options.taskTrace, 'validate');
            await accepted(raw);
            return value;
        } catch (error) {
            if (options.taskTrace?.activeStage === 'validate') core_taskTrace.markStage(options.taskTrace, 'validate', false);
            if (error?.name === 'AbortError' || error?.nonRetryable === true || error?.code === 'RMT_PHONE_NO_CONVERSATION' || error?.code === 'RMT_BANNED_GENERATED_PHRASE' || error?.code === 'RMT_JSON_TRUNCATED') throw error;
            lastError = error;
            const emptyReroll = attempt === 0 && ['RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING', 'RMT_JSON_NOT_FOUND'].includes(error?.code);
            const configuredRetry = attempt + 1 < configuredAttempts && core_requestCoordinator.shouldRetrySegmentRequest(error, attempt);
            if (attempt + 1 < maxAttempts && (emptyReroll || configuredRetry)) {
                core_taskTrace.recordRetry(options.taskTrace, error);
                core_taskTrace.beginStage(options.taskTrace, 'retry');
                try { await core_requestCoordinator.waitBeforeSegmentRetry(error, attempt); }
                finally { core_taskTrace.markStage(options.taskTrace, 'retry'); }
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error(`${status}失败。`);
    });
    core_taskTrace.finishSegmentTrace(parentTrace, taskTrace, 'ok');
    return result;
    } catch (error) {
        core_taskTrace.finishSegmentTrace(parentTrace, taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error);
        throw error;
    }
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

function enrichInputBudgetError(error, logicalTask, prompt) {
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

function notifyInputPackingOnce(logicalTask, budget, prompt, options) {
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

export function normalizeConnectionManagerError(error) {
    if (error?.name === 'AbortError' || error?.retryableJson === true) return error;
    const knownInternalCodes = new Set([
        'RMT_API_CONFIG_CHANGED', 'RMT_API_CONFIGURATION_SUPERSEDED', 'RMT_API_MODEL_REQUEST_SUPERSEDED',
        'RMT_BANNED_GENERATED_PHRASE', 'RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING',
        'RMT_JSON_INVALID', 'RMT_JSON_NOT_FOUND', 'RMT_JSON_TRUNCATED', 'RMT_MANUAL_API_TRANSPORT',
        'RMT_MANUAL_API_URL', 'RMT_MANUAL_EMPTY', 'RMT_MANUAL_FETCH_UNAVAILABLE', 'RMT_MANUAL_INVALID_JSON',
        'RMT_MANUAL_MESSAGES', 'RMT_MANUAL_MODEL', 'RMT_MANUAL_MODEL_TIMEOUT', 'RMT_MANUAL_MODELS_EMPTY',
        'RMT_MANUAL_PROVIDER_ERROR', 'RMT_MANUAL_RESPONSE_TOO_LARGE', 'RMT_PHONE_DRAFT_AVAILABLE',
        'RMT_PROFILE_CAPABILITY', 'RMT_PROFILE_MODEL_TIMEOUT', 'RMT_PROFILE_PROXY_UNAVAILABLE',
        'RMT_REQUEST_TIMEOUT', 'RMT_RESPONSE_FORMAT', 'RMT_RESPONSE_HTML', 'RMT_SEGMENT_VALIDATION', 'RMT_CONNECTION_QUOTA',
    ]);
    if (knownInternalCodes.has(String(error?.code || ''))) return error;
    const evidence = [];
    const seen = new Set();
    let cursor = error;
    let rawStatus = null;
    let rawCode = '';
    for (let depth = 0; cursor && depth < 4 && !seen.has(cursor); depth += 1) {
        seen.add(cursor);
        if (rawStatus == null) rawStatus = cursor?.status ?? cursor?.statusCode ?? cursor?.response?.status ?? null;
        if (!rawCode) rawCode = core_text.normalizeText(cursor?.code || cursor?.type, 80);
        for (const value of [cursor?.name, cursor?.message, cursor?.code, cursor?.status, cursor?.statusCode]) {
            const part = core_text.normalizeText(value, 700);
            if (part) evidence.push(part);
        }
        cursor = cursor?.cause;
    }
    const safeCode = /^(?:E[A-Z0-9_]{2,40}|ERR_[A-Z0-9_]{2,60})$/.test(rawCode) ? rawCode : '';
    const original = evidence.join(' · ').toLowerCase();
    const messageStatus = original.match(/(?:http|status(?:\s+code)?|response)\s*[:=]?\s*(\d{3})/i)
        || original.match(/(?:api|request|response).{0,40}\b(400|401|403|404|408|413|422|429|500|502|503|504)\b/i);
    const hasRawStatus = rawStatus !== null && rawStatus !== '' && Number.isFinite(Number(rawStatus));
    const candidateStatus = hasRawStatus ? Number(rawStatus) : Number(messageStatus?.[1]) || 0;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 0;
    // Numeric transport status is authoritative; generic words from wrappers may describe
    // an authentication service being rate-limited, not an invalid user credential.
    const hints = status ? '' : original;
    const technical = status ? `（HTTP ${status}）` : safeCode ? `（${safeCode}）` : '';
    const sourceName = error?.code === 'RMT_MANUAL_HTTP' ? '手动 API' : '专用连接';
    let code = 'RMT_CONNECTION_FAILED';
    let message = `${sourceName}请求失败${technical}。没有收到可判断是否可重试的模型结果；请检查当前独立 API 设置与 SillyTavern 控制台中的上游错误，本段不会自动重试。`;
    let retryable = false;
    if (/(?:<!doctype\s+html|<html\b|<head\b|<body\b|cf-error|cdn-cgi)/i.test(original)) {
        code = 'RMT_RESPONSE_HTML';
        message = `${sourceName}返回了网页错误页而不是模型数据${technical}。请检查代理地址、鉴权和上游状态；错误页正文不会显示或保存。`;
        retryable = false;
    } else if (status === 401 || status === 403 || /(unauthori[sz]ed|forbidden|authentication|(?:invalid|incorrect|expired) api key|api key.*(?:invalid|incorrect|expired)|key.*(?:invalid|incorrect|expired))/i.test(hints)) {
        code = 'RMT_CONNECTION_AUTH';
        message = `${sourceName}认证失败${technical}。请检查当前配置、API Key 与账号权限；本段不会自动重试。`;
        retryable = false;
    } else if (status === 429 || /(too many requests|rate.?limit|quota exceeded|resource exhausted)/i.test(hints)) {
        code = 'RMT_CONNECTION_RATE_LIMIT';
        // Single observation point: from here on the throttle serialises and paces
        // provider traffic until it decays.
        core_requestCoordinator.noteProviderRateLimit(error);
        message = `模型服务正在限流${technical}。请稍后再试，旧内容仍会保留。`;
        retryable = true;
    } else if (status === 413 || ((status === 400 || !status) && /(context length|context window|too many tokens|maximum context|payload too large|request too large)/i.test(original))) {
        code = 'RMT_CONNECTION_CONTEXT_LIMIT';
        message = `本段输入超过模型或代理的上下文上限${technical}。请换用更大上下文模型，或减少导入的世界书/记忆资料；本段不会自动重试。`;
        retryable = false;
    } else if (status === 404 || /(model.*not found|profile.*not found|endpoint.*not found)/i.test(hints)) {
        code = 'RMT_CONNECTION_CONFIG';
        message = `${sourceName}、模型或上游端点不可用${technical}。请重新配置并确认模型名称；本段不会自动重试。`;
        retryable = false;
    } else if (status === 400 || status === 422 || /(invalid request|bad request|unprocessable)/i.test(hints)) {
        code = 'RMT_CONNECTION_INVALID_REQUEST';
        message = `上游拒绝了本段请求${technical}。请检查所选模型是否支持当前 Connection Manager 请求格式与最大输出；本段不会自动重试。`;
        retryable = false;
    } else if (status === 408 || status === 504 || /(gateway timeout|request timeout|timed out|etimedout)/i.test(hints)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理响应超时${technical}。可以稍后重试，旧内容仍会保留。`;
        retryable = true;
    } else if (/(failed to fetch|networkerror|network request failed|load failed|enotfound|fetch failed)/i.test(hints)) {
        code = 'RMT_CONNECTION_NETWORK';
        message = '无法连接模型服务。请检查地址、网络、代理与服务状态，旧内容仍会保留。';
        retryable = true;
    } else if (status >= 500 || /(bad gateway|service unavailable|upstream.*(?:failed|error)|econnreset|econnrefused)/i.test(original)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理暂时不可用${technical}。可以稍后重试，旧内容仍会保留。`;
        retryable = true;
    }
    const normalized = new Error(message);
    normalized.code = code;
    normalized.safeToDisplay = true;
    normalized.safeUserMessage = message;
    normalized.status = status || undefined;
    normalized.retryable = retryable;
    if (code === 'RMT_CONNECTION_RATE_LIMIT' && Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
        normalized.retryAfterMs = Math.min(86400000, Math.ceil(error.retryAfterMs));
    }
    return normalized;
}

export async function generateConfiguredJson(prompt, options = {}) {
    const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options.origin);
    if (!logicalTask) return generateConfiguredJsonOperation(prompt, options);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    const controller = new AbortController();
    const signals = [...new Set([options.signal, logicalTask.signal].filter(Boolean))];
    const abort = () => controller.abort(core_requestCoordinator.createGenerationAbortError());
    for (const signal of signals) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    }
    if (logicalTask.participantSnapshot && !options.participantPromptApplied) {
        const block = logicalTask.participantPromptIndexed
            ? core_participants.participantIndexPromptBlock(logicalTask.participantSnapshot)
            : core_participants.participantPromptBlock(logicalTask.participantSnapshot);
        if (block && !prompt.includes(block)) prompt += block;
        if (typeof options.recoveryBasePrompt === 'string' && block && !options.recoveryBasePrompt.includes(block)) {
            options = { ...options, recoveryBasePrompt: options.recoveryBasePrompt + block };
        }
    }
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(options.origin)) {
        throw core_requestCoordinator.createGenerationAbortError();
    }
    try {
        const result = await generateConfiguredJsonOperation(prompt, { ...options, signal: controller.signal });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        return result;
    } finally {
        for (const signal of signals) signal.removeEventListener('abort', abort);
    }
}

async function generateConfiguredJsonOperation(prompt, options = {}) {
    const taskTrace = options.taskTrace || null;
    core_taskTrace.beginRequestAttempt(taskTrace);
    core_taskTrace.beginStage(taskTrace, 'prompt');
    const lifecycleEpoch = options.origin?.lifecycleEpoch ?? runtimeState.runtimeLifecycleEpoch;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const context = generationContentContext(options.origin, options.context || core_context.currentCharacterGuard());
    const transportContext = contentContextSources.get(context) || context;
    await core_settings.prepareManualCredential(transportContext);
    const settings = core_settings.getPluginSettings(transportContext);
    const savedContent = options.recoveryContentSettings || generation_recovery.generationContentSnapshotForOrigin(options.origin)?.contentSettings;
    let contentSettings = { ...settings, ...(savedContent || {}) };
    const advanced = advanced_generation.parseAdvancedGeneration(settings);
    const configurationFingerprint = core_independentApi.apiConfigurationFingerprint(settings);
    const originalExpanded = core_text.expandSafeRoleMacros(options.recoveryBasePrompt ?? prompt, context);
    const expandedBody = core_contextTags.filterJsonPromptStrings(originalExpanded, core_contextTags.tagPolicyForSettings(contentSettings));
    const sealed = options.recoveryContinuationPartial || /【输出】\n只输出一个 JSON 对象/.test(expandedBody)
        ? expandedBody
        : `${expandedBody}\n\n${generation_prompts.jsonOutputSeal()}`;
    const shapeExample = options.recoveryContinuationPartial || expandedBody.includes('【最短合法例子】')
        ? ''
        : generation_jsonShapeExamples.jsonShapeExampleBlock(expandedBody);
    const expanded = shapeExample ? `${sealed}\n\n${shapeExample}` : sealed;
    const contextEnvelope = typeof options.contextEnvelope === 'string'
        ? options.contextEnvelope
        : await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(options.mode, context) });
    const phrasePolicy = options.enforceGeneratedPhrasePolicy === true ? generatedPhrasePolicyText(contentSettings) : '';
    const creativeSupplement = creative_supplement.creativeSupplementBlock(contentSettings);
    const prepared = await generation_recovery.freezeRecoveryRequestPayload(options, {
        actualPrompt: typeof options.recoveryPreparedPrompt === 'string' ? options.recoveryPreparedPrompt : `${contextEnvelope}
${expanded}${creativeSupplement}${phrasePolicy}`,
        contentSettings: generationContentSettings(contentSettings),
    });
    contentSettings = { ...settings, ...prepared.contentSettings };
    // Feedback is per attempt: preserve the frozen identity, then include the
    // actual retry note in both the budget measurement and provider request.
    const controlledPrompt = generation_recovery.generationRetryPrompt(
        generation_recovery.generationPhoneRetryPrompt(
            generation_recovery.generationContinuationPrompt(prepared.actualPrompt, options.recoveryContinuationPartial), options.recoveryPhoneRetryContract),
        options.recoveryRetryFeedback);
    if (options.archiveRequestBudget === true) {
        const budget = await archive_requestBudget.measureArchiveRequest(context, controlledPrompt,
            { signal: options.signal, stamp: options.archiveBudgetStamp,
                tokenCountState: options.skipTokenCount === true ? { unavailable: true } : null });
        core_taskTrace.recordInput(taskTrace, budget.utf16Chars, budget.inputTokens);
        if (taskTrace) taskTrace.archiveBudget = archive_requestBudget.publicBudget(budget);
        archive_requestBudget.assertArchiveRequestBudget(budget);
    } else {
        const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options.origin);
        let budget;
        try {
            budget = await assertPromptBudget(context, controlledPrompt,
                { skipTokenCount: options.skipTokenCount === true, signal: options.signal,
                    tokenCountTimeoutMs: options.tokenCountTimeoutMs, taskTrace });
        } catch (error) {
            throw enrichInputBudgetError(error, logicalTask, controlledPrompt);
        }
        notifyInputPackingOnce(logicalTask, budget, controlledPrompt, options);
    }
    core_taskTrace.markStage(taskTrace, 'prompt');
    // The value configured in the dedicated secondary-API UI is the actual provider max output.
    // Per-feature options.maxTokens values are legacy sizing hints only and must not silently lower it.
    const responseLength = output_budget.normalizeOutputTokens(settings.maxTokens);
    const connectionMode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    const service = context.ConnectionManagerRequestService;
    let selectedProfileFingerprint = '';
    let overridePayload = {
        temperature: generation_jsonPageTemperature.jsonPageTemperature(options.temperature, settings.temperature),
    };
    const modelOverride = core_text.normalizeText(options.model || (connectionMode === 'manual' ? settings.manualApiModel : settings.modelOverride), 240);
    if (modelOverride) overridePayload.model = modelOverride;
    const messages = [{ role: 'user', content: controlledPrompt }];
    if (connectionMode === 'manual') {
        core_independentApi.normalizeManualApiBaseUrl(settings.manualApiBaseUrl, { required: true });
        if (!modelOverride) throw core_text.safeUserError('手动 API 还没有模型 ID。请先在插件设置中完成手动配置。', 'RMT_MANUAL_MODEL');
    } else {
        if (!settings.connectionProfileId) {
            throw core_text.safeUserError(`心迹回廊还没有一键连接。请使用“${core_independentApi.PROFILE_ONE_CLICK_UI_VERSION} 一键配置”，或切换到手动配置。`);
        }
        core_independentApi.assertConnectionManagerProfileSupport(service);
        const rawProfile = core_settings.rawConnectionProfile(settings.connectionProfileId, context);
        if (!rawProfile) throw core_text.safeUserError('已保存的一键连接不存在，请重新配置。');
        selectedProfileFingerprint = await core_settings.resolvedProfileTransportFingerprint(rawProfile);
        const apiMap = service.validateProfile(rawProfile);
        if (apiMap?.selected !== 'openai' || !apiMap?.source) throw core_text.safeUserError('当前一键连接不是可复用的 Chat Completion 配置。');
        Object.assign(overridePayload, advanced_generation.advancedCarrier(advanced, apiMap.source));
        overridePayload = advanced_generation.applyAdvancedExclusions(overridePayload, advanced);
    }
    const assertConfigurationCurrent = async () => {
        const latestSettings = core_settings.getPluginSettings(context);
        let latestProfileFingerprint = '';
        if (connectionMode === 'profile') {
            try { latestProfileFingerprint = await core_settings.resolvedProfileTransportFingerprint(core_settings.rawConnectionProfile(latestSettings.connectionProfileId, context)); }
            catch { latestProfileFingerprint = 'missing'; }
        }
        if (core_independentApi.apiConfigurationFingerprint(latestSettings) !== configurationFingerprint
            || (connectionMode === 'profile' && latestProfileFingerprint !== selectedProfileFingerprint)) {
            const error = new Error('API 配置或创作补充词在生成期间发生变化，本次旧请求已停止。');
            error.code = 'RMT_API_CONFIG_CHANGED';
            error.retryable = false;
            throw error;
        }
    };
    let result, responsePayload, releaseProviderPermit = null;
    const lifecycleController = new AbortController();
    const externalSignal = options.signal || null;
    const forwardAbort = () => {
        const reason = externalSignal?.reason;
        try { lifecycleController.abort(reason instanceof Error ? reason : core_requestCoordinator.createGenerationAbortError()); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const assertRequestCurrent = () => {
        if (lifecycleController.signal.aborted) throw lifecycleController.signal.reason instanceof Error
            ? lifecycleController.signal.reason : core_requestCoordinator.createGenerationAbortError();
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    };
    try {
        assertRequestCurrent();
        core_taskTrace.beginStage(taskTrace, 'queue');
        core_requestCoordinator.noteChatTaskPhase('queue', { taskKey: options.taskKey, origin: options.origin });
        releaseProviderPermit = await core_requestCoordinator.acquireProviderRequestPermit(lifecycleController.signal);
        core_taskTrace.markStage(taskTrace, 'queue');
        core_taskTrace.beginStage(taskTrace, 'pacing');
        await core_requestCoordinator.waitForProviderPacing(lifecycleController.signal);
        core_taskTrace.markStage(taskTrace, 'pacing');
        assertRequestCurrent();
        await assertConfigurationCurrent();
        assertRequestCurrent();
        core_taskTrace.beginStage(taskTrace, 'request');
        core_requestCoordinator.noteChatTaskPhase('request', { taskKey: options.taskKey, origin: options.origin });
        result = await core_requestCoordinator.runGenerationRequestWithTimeout(
            async () => {
                assertRequestCurrent();
                core_taskTrace.recordProviderRequest(taskTrace);
                const returned = connectionMode === 'manual'
                ? core_independentApi.requestManualApiCompletion(settings, context, messages, responseLength, {
                    signal: lifecycleController.signal,
                    model: modelOverride,
                    temperature: overridePayload.temperature,
                })
                : service.sendRequest(
                    settings.connectionProfileId,
                    messages,
                    responseLength,
                    { stream: advanced.streamMode === 'on', extractData: false, includePreset: false, includeInstruct: false, signal: lifecycleController.signal },
                    overridePayload,
                );
                return core_independentApi.readProfileCompletion(await returned, { signal: lifecycleController.signal });
            },
            lifecycleController,
            options.timeoutMs,
            options.statusText || '',
        );
        core_taskTrace.markStage(taskTrace, 'request');
        core_taskTrace.markStage(taskTrace, 'response');
        core_taskTrace.recordResponse(taskTrace, core_independentApi.responseShapeSummary(result));
        // Observe error envelopes (including HTTP-200 429s) before draining the queue.
        responsePayload = core_independentApi.assertIndependentResponsePayload(result);
    } catch (error) {
        const shape = core_independentApi.transportFailureSummary(error);
        if (shape) core_taskTrace.recordResponse(taskTrace, shape);
        throw normalizeConnectionManagerError(error);
    } finally {
        try { releaseProviderPermit?.(); } catch {}
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
    }
    // A settings edit cannot invalidate a reply that the selected provider has
    // already returned. Keep that paid result; the next request reads the new API.
    if (externalSignal?.aborted) forwardAbort();
    assertRequestCurrent();
    let parsed;
    core_taskTrace.beginStage(taskTrace, 'parse');
    try { core_independentApi.assertManualStreamComplete(result);
        parsed = generation_jsonParser.extractJson(responsePayload, {
        reasoning: result?.reasoning || '',
        requestMaxTokens: responseLength,
        configuredMaxTokens: settings.maxTokens,
    }); } catch (error) {
        await generation_recovery.recordRecoveryTruncation(options, responsePayload, error);
        throw error;
    }
    if (options.enforceGeneratedPhrasePolicy === true) assertNoBannedGeneratedPhrase(parsed, contentSettings, {
        mode: options.mode, settingText: core_worldPresentation.controlledWorldEvidence(contextEnvelope, null),
    });
    core_taskTrace.markStage(taskTrace, 'parse');
    core_requestCoordinator.noteChatTaskPhase('validate', { taskKey: options.taskKey, origin: options.origin });
    return parsed;
}

export async function requestJson(prompt, statusText = '正在根据当前聊天档案生成…', options = {}) {
    if (runtimeState.busy) throw new Error('当前正在创建/更新聊天档案，请等档案整理结束后再生成内容。');
    const taskKey = core_text.normalizeText(options.taskKey, 240) || `request:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    if (core_requestCoordinator.isGenerationTaskRunning(taskKey)) throw new Error('这一项已经在生成中。');
    const parentTaskKey = core_text.normalizeText(options.parentTaskKey, 240) || core_requestCoordinator.activeModeBuildScopeForTask(taskKey);
    const logicalTaskKey = parentTaskKey || taskKey;
    const logicalKeys = core_requestCoordinator.activeLogicalGenerationKeys();
    logicalKeys.delete(logicalTaskKey);
    const bulkReservation = core_requestCoordinator.advBulkReservationKeyForTask(taskKey);
    if (bulkReservation) logicalKeys.delete(bulkReservation);
    if (logicalKeys.size >= core_constants.MAX_CONCURRENT_GENERATION_TASKS) {
        throw new Error(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再启动新的任务。`);
    }
    const controller = new AbortController();
    const requestContext = options.context || core_context.currentCharacterGuard();
    const origin = options.origin || core_context.captureTaskOrigin(requestContext, archive_repository.getImportedMemory(requestContext)?.archiveRevision || '');
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(origin)) throw core_requestCoordinator.createGenerationAbortError();
    core_context.assertRuntimeLifecycleCurrent(origin.lifecycleEpoch);
    const externalSignal = options.signal || null;
    const forwardAbort = () => {
        try { controller.abort(externalSignal?.reason instanceof Error ? externalSignal.reason : core_requestCoordinator.createGenerationAbortError()); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const targetLabel = core_text.normalizeText(requestContext?.__rmtArchiveTargetLabel, 260);
    const displayStatus = targetLabel ? `正在为：${targetLabel} · ${core_text.normalizeText(statusText, 180)}` : statusText;
    runtimeState.activeGenerationTasks.set(taskKey, {
        key: taskKey, controller, origin, label: core_text.normalizeText(displayStatus, 360),
        mode: core_text.normalizeText(options.mode, 80), parentTaskKey, startedAt: Date.now(), phase: 'prepare',
    });
    core_requestCoordinator.noteChatTaskPhase('prepare', { taskKey, origin });
    core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    const inheritedTrace = generationTrace(options);
    const taskTrace = inheritedTrace || core_taskTrace.startTaskTrace(taskKey, options.mode);
    if (!inheritedTrace) core_taskTrace.markStage(taskTrace, 'start');
    let requestOutcome = 'done';
    try {
        core_context.assertRuntimeLifecycleCurrent(origin.lifecycleEpoch);
        const result = await generateConfiguredJson(prompt, {
            ...options, taskKey, taskTrace, origin, context: requestContext,
            signal: controller.signal,
            statusText,
            enforceGeneratedPhrasePolicy: options.enforceGeneratedPhrasePolicy !== false,
        });
        if (!inheritedTrace) core_taskTrace.endTaskTrace(taskTrace, 'ok');
        return result;
    } catch (error) {
        requestOutcome = error?.name === 'AbortError' ? 'cancelled' : 'failed';
        if (!inheritedTrace) core_taskTrace.endTaskTrace(taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error);
        else if (taskTrace.activeStage) core_taskTrace.markStage(taskTrace, taskTrace.activeStage, false);
        throw error;
    } finally {
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
        const current = runtimeState.activeGenerationTasks.get(taskKey);
        if (current?.controller === controller) runtimeState.activeGenerationTasks.delete(taskKey);
        core_requestCoordinator.rememberStandaloneChatTask({
            label: core_text.normalizeText(displayStatus, 120),
            mode: core_text.normalizeText(options.mode, 80),
            origin, outcome: requestOutcome, kind: 'generation',
        });
        core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    }
}

export async function generateArchiveChunkJson(prompt, options, label) {
    try {
        return await generateConfiguredJson(prompt, options);
    } catch (error) {
        if (error?.name === 'AbortError' || !error?.retryableJson) throw error;
        if (options.automatic === true) throw error;
        const retry = ui_overlay.confirmExplicitAction(
            `模型没有返回完整 JSON · ${label}`,
            `${core_text.safeErrorSummary(error, 900)}\n\n是否只重试这一块？重试会额外消耗 1 次模型请求；取消则停止本次档案整理，旧档案、旧 ADV EVENT / ENDING 等内容都不会被覆盖。`,
            { destructive: false },
        );
        if (!retry) throw error;
        return await generateConfiguredJson(prompt, options);
    }
}

function recoverySettingsIdentity(context) {
    // Shared with admission so a failed comparison never advances a write fence.
    // Serialization remains byte-identical to the earlier settings fingerprint.
    return recovery_source.recoverySettingsIdentity(context);
}

function recoveryModeTaskScopes(mode, context, bank, origin, entryId, existing, contentSnapshot) {
    // Scheduler lanes belong to the current write target; recovery segments
    // belong to the original task. Enumerate only this validated owner's known
    // source/current revisions, including the pre-index fallback serialization.
    const chatId = core_context.comparableChatId(origin.chatId);
    const modeName = core_text.normalizeText(mode, 80);
    const entries = new Set([core_text.normalizeText(entryId, 120)]);
    for (const memory of [bank, contentSnapshot?.memoryBank]) {
        if (memory && core_context.comparableChatId(memory.chatId) === chatId) {
            entries.add(`archive:${core_context.stableArchiveHash(`${chatId}\u001f${core_text.normalizeText(memory.characterName, 120)}`)}`);
        }
    }
    const revisions = new Set([origin.archiveRevision, existing?.identity?.archiveRevision,
        existing?.sourceIdentity?.archiveRevision, contentSnapshot?.memoryBank?.archiveRevision]
        .map(value => core_text.normalizeText(value, 240)).filter(Boolean));
    const scopes = new Set([core_requestCoordinator.generationTaskKeyForMode(mode, context)]);
    for (const entry of entries) if (entry) for (const revision of revisions) scopes.add(`mode:${entry}|${chatId}|${revision}:${modeName}`);
    return [...scopes];
}

export async function beginModeRecovery(mode, context, bank, origin, options = {}) {
    const identity = recoverySettingsIdentity(context);
    const existing = options.existing === undefined ? core_cache.loadGenerationRecovery(mode, context, options.archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) }) : options.existing;
    let partialSeed = null;
    if (!existing && options.partialSource?.draftId) {
        const parent = core_cache.loadGenerationRecovery(mode, context, options.archiveTarget?.cache, { draftId: options.partialSource.draftId });
        const snapshot = generation_recovery.readGenerationContentSnapshot(parent);
        if (!snapshot?.memoryBank || !snapshot.fields
            || snapshot.memoryBank.chatId !== bank.chatId || snapshot.memoryBank.archiveRevision !== bank.archiveRevision) {
            throw core_text.safeUserError('原部分成果的完整资料无法核对，旧内容与草稿保留，没有换用当前资料生成。', 'RMT_RECOVERY_SOURCE_SNAPSHOT_MISSING');
        }
        partialSeed = { snapshot, frozenInputs: structuredClone(parent.frozenInputs || {}) };
    }
    const contentSnapshot = generation_recovery.readGenerationContentSnapshot(existing)
        || (!existing ? fitGenerationContentSnapshot(snapshotGenerationContent({ ...(partialSeed?.snapshot || captureGenerationContent(context, bank)),
            ...(options.contentInputs ? { contentInputs: { ...(partialSeed?.snapshot?.contentInputs || {}), ...options.contentInputs } } : {}) })) : null);
    const sourceValues = JSON.stringify(recovery_source.recoverySourceValues(context));
    await recovery_source.assertRecoverySourcePolicy(existing, context, origin);
    const sourcePolicy = await recovery_source.recoverySourcePolicy(context);
    if (!contentSnapshot && JSON.stringify(recovery_source.recoverySourceValues(context)) !== sourceValues) throw new DOMException('Source changed', 'AbortError');
    const operation = cg_policy.cgRecoveryOperation(mode, options.operation || { kind: 'mode', mode }, existing,
        options.cgPromptFormat || core_settings.getPluginSettings(context).cgPromptFormat);
    cg_policy.bindCgPromptFormat(origin, operation.cgPromptFormat, operation.cgPromptDialect || 'legacy');
    if (existing?.operation && await generation_recovery.generationRecoveryDigest(existing.operation) !== await generation_recovery.generationRecoveryDigest(operation)) {
        throw generation_recovery.generationRecoveryMismatch('operation', 'operation', 'RMT_RECOVERY_OPERATION_CHANGED');
    }
    const archiveEntry = options.archiveEntry || (!options.archiveTarget
        ? structuredClone(core_cache.archiveBackupEntryForContext(context, bank, { expectedTaskOrigin: origin, previousMemory: bank })) : null);
    const handle = await generation_recovery.createGenerationRecovery({
        origin: { ...origin, archiveTargetEntryId: options.archiveTarget?.entryId || archiveEntry?.entryId || origin.archiveTargetEntryId || '' },
        mode, settingsIdentity: identity, existing, continueRequested: !!existing, sourcePolicy,
        contentSnapshot,
        draftId: existing?.draftId || options.draftId || `generation-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
        pageId: existing?.pageId || options.pageId || options.participantRegeneration?.pageId || mode,
        confirmLegacyRestart: () => ui_overlay.confirmExplicitAction('保留旧失败记录，按当前背景重新尝试？',
            '旧版失败记录没有可验证的原背景配对，且没有任何成功分段或截断正文。确定会保留原失败记录，按本次已读取的背景重新请求；取消不发送。', { destructive: false }),
        taskScopes: [`${origin.characterKey}|${origin.chatId}`, `archive-target:${options.archiveTarget?.entryId || archiveEntry?.entryId || origin.archiveTargetEntryId || ''}`],
        modeTaskScopes: recoveryModeTaskScopes(mode, context, bank, origin,
            options.archiveTarget?.entryId || archiveEntry?.entryId || origin.archiveTargetEntryId || '', existing, contentSnapshot),
        assertCurrent: () => {
            if (!core_requestCoordinator.isLogicalGenerationTaskCurrent(origin)
                || !core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch) || options.stillCurrent?.() === false
                || (!contentSnapshot && (recoverySettingsIdentity(context) !== identity
                || JSON.stringify(recovery_source.recoverySourceValues(context)) !== sourceValues))) return false;
            const live = core_context.getContext();
            if (!options.archiveTarget && core_context.deferredCommitOriginMatchesContext(origin, live)) {
                return archive_repository.getImportedMemory(live)?.archiveRevision === bank.archiveRevision
                    && core_cache.modeWriteFenceForCache(core_cache.getCache(live), mode) === core_cache.modeWriteFenceSignature(origin.modeWriteFences?.[mode]);
            }
            return true;
        },
        save: journal => core_cache.saveGenerationRecovery(context, bank, mode, journal
            ? { ...journal, operation, replaceExisting: options.replaceExisting === true } : null, origin, { ...options, archiveEntry }),
        onProgress: async journal => {
            // A managed child has its own one-item response contract. Its paid
            // segments remain in the journal for the independent draft reader;
            // they must not masquerade as a complete-mode projection of parent.
            if (journal.operation?.kind === 'content-item' && journal.operation.sourceDraftId) {
                try { await ui_overlay.refreshContentRegenerationDraftView?.(journal, contentContextSources.get(context) || context,
                    { archiveTarget: options.archiveTarget }); } catch { /* Received child data is already durable. */ }
                return;
            }
            const snapshot = generation_recovery.readGenerationContentSnapshot(journal);
            // A legacy journal without its original source cannot acquire new
            // evidence merely because a current archive is available to read.
            if (!snapshot?.memoryBank || !snapshot.fields) return;
            const session = await generation_progress.projectGenerationProgress(journal, {
                context: generationContentContext(origin, context), memoryBank: snapshot.memoryBank,
                contentInputs: snapshot.contentInputs || {}, pageId: journal.pageId,
            });
            if (!session) return;
            const targetContext = contentContextSources.get(context) || context;
            await core_cache.saveGenerationTaskResult(targetContext, mode, session, origin, {
                draftId: journal.draftId, pageId: journal.pageId,
                archiveTarget: options.archiveTarget, memoryBank: bank,
                sourceMemory: snapshot.memoryBank, complete: false, stillCurrent: options.stillCurrent,
            });
            // Storage acknowledgment is independent of whether this page is
            // currently open. Reopening reads the saved result from the cache.
            try { await ui_overlay.refreshPartialGenerationView?.(mode, targetContext, {
                draftId: journal.draftId, pageId: journal.pageId, archiveTarget: options.archiveTarget,
                readerStillCurrent: options.partialReaderStillCurrent,
            }); } catch { /* A view failure never invalidates received content. */ }
        },
    });
    handle.journal.operation = structuredClone(operation);
    handle.journal.replaceExisting = options.replaceExisting === true;
    if (partialSeed) handle.journal.frozenInputs = partialSeed.frozenInputs;
    generation_recovery.attachGenerationRecovery(origin, handle);
    origin.generationRecoveryDraftId = handle.journal.draftId;
    handle.contentContext = generationContentContext(origin, context);
    handle.contentBank = contentSnapshot?.memoryBank ? structuredClone(contentSnapshot.memoryBank) : bank;
    handle.contentSettings = contentSnapshot?.contentSettings ? structuredClone(contentSnapshot.contentSettings) : null;
    handle.contentInputs = contentSnapshot?.contentInputs ? structuredClone(contentSnapshot.contentInputs) : null;
    if (!existing || contentSnapshot?.memoryBank) await generation_recovery.persistGenerationRecovery(handle);
    await generation_recovery.publishGenerationRecoveryProgress(handle);
    return handle;
}

export async function continueSavedGeneration(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.backupOnly) throw new Error('独立备份是只读快照，不能继续生成。');
    const targetOptions = snapshot ? archive_library.archiveTargetGenerationOptions(snapshot) : {};
    const context = targetOptions.context || options.context || core_context.currentCharacterGuard();
    const bank = archive_repository.requireArchive(context);
    const existing = core_cache.loadGenerationRecovery(mode, context, targetOptions.archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    if (!existing) { globalThis.toastr?.info?.('当前档案没有可继续的草稿，不会发起新请求。', '心迹回廊'); return; }
    if (options.skipConfirm !== true && !ui_overlay.confirmExplicitAction('继续未完成内容？', '只补原任务未完成的内容，会使用文本生成额度。认证或额度问题需要先在设置里解决；取消不改动草稿。', { destructive: false })) return;
    const operation = existing.operation || { kind: 'mode', mode };
    const resumeOptions = { ...options, ...targetOptions, existing, continueRecovery: true,
        ...(operation.participantRegeneration ? { participantRegeneration: operation.participantRegeneration } : {}) };
    if (operation.kind === 'mode') return generateMode(mode, { ...resumeOptions,
        background: options.skipConfirm === true || !(runtimeState.activeMode === mode && (time_stories.isTimeStoryMode(mode)
            || mode === core_constants.MODE.THEME_SONG
            || (mode === core_constants.MODE.PHONE && runtimeState.activeSession?._rmtEmptyTerminal === true))) });
    if (operation.kind === 'content-item' && operation.sourceDraftId) return ui_contentManager.resumeContentRegeneration(resumeOptions);
    let session = core_cache.loadSession(mode, { context, memoryBank: bank, cache: targetOptions.archiveTarget?.cache, clone: true });
    const stored = targetOptions.archiveTarget?.cache || core_cache.getCache(context);
    if (!session && mode === core_constants.MODE.HEART && !stored?.[mode]
        && ['heart-section', 'heart-season', 'heart-fireflies'].includes(operation.kind)) session = modes_heart.makeHeartShell(bank);
    if (!session) throw new Error('原任务所依赖的内容已不在当前档案；草稿保留，没有重新生成。');
    if (operation.kind === 'content-item') {
        runtimeState.activeMode = mode;
        runtimeState.activeSession = session;
        return ui_contentManager.resumeContentRegeneration(resumeOptions);
    }
    const routes = {
        'adv-single': () => modes_advEvent.generateAdvForSelected({ ...resumeOptions, eventId: operation.eventId }),
        'adv-bulk': () => modes_advEvent.generateAllAdvForSession(resumeOptions),
        'adv-repair': () => modes_advEvent.repairFailedAdvForSession(resumeOptions),
        'heart-section': () => modes_heart.generateHeartSection(operation.part, resumeOptions),
        'heart-fireflies': () => modes_heart.generateHeartFirefliesSection(resumeOptions),
        'heart-season': () => modes_heart.generateHeartSeasonSection(operation.season, resumeOptions),
        'room-daily-life': () => modes_room.ensureRoomLifePlan({ ...resumeOptions, force: true }),
    };
    if (!routes[operation.kind] || !operation.kind.startsWith(mode === core_constants.MODE.ADV ? 'adv-' : mode === core_constants.MODE.HEART ? 'heart-' : mode === core_constants.MODE.ROOM ? 'room-' : '!')) throw new Error('无法识别原续写入口，草稿保留。');
    runtimeState.activeMode = mode;
    runtimeState.activeSession = session;
    return routes[operation.kind]();
}

export async function exportSavedGeneration(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) throw generation_recovery.generationRecoveryMismatch('operation', 'operation');
    const snapshot = runtimeState.activeArchiveSnapshot;
    const context = snapshot ? archive_library.archiveTargetGenerationOptions(snapshot).context : core_context.currentCharacterGuard();
    const bank = archive_repository.requireArchive(context);
    const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
    if (!snapshot) await core_cache.ensureCacheHydrated(context);
    if (!core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)
        || (snapshot ? runtimeState.activeArchiveSnapshot !== snapshot : !core_context.isCurrentTaskOrigin(origin))) {
        throw new DOMException('Recovery export scope changed', 'AbortError');
    }
    const journal = core_cache.loadGenerationRecovery(mode, context, snapshot?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    if (!journal) throw generation_recovery.generationRecoveryMismatch('record');
    const exported = generation_recovery.exportGenerationRecovery(journal);
    // Replies held in-page because the journal's existing total capacity rejected
    // them leave only through this explicit user export, as inert data. The
    // loaded record's own validated identity is the hold key; the live origin
    // above may legitimately omit the canonical archive-target entry ID.
    const held = generation_recovery.generationRecoveryHeldReplies(journal.identity, journal.identity?.mode || mode);
    return held.length ? { ...exported,
        unsavedReplies: held.map(entry => ({ slot: entry.slot, state: 'received-unsaved', rawJson: entry.rawJson })) } : exported;
}

export async function discardSavedGeneration(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || runtimeState.activeModeBuildScopes.size) {
        globalThis.toastr?.info?.('请等当前生成任务结束后，再放弃未提交草稿。', '心迹回廊'); return;
    }
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.backupOnly) return;
    const opts = snapshot ? archive_library.archiveTargetGenerationOptions(snapshot) : {};
    const context = opts.context || core_context.currentCharacterGuard();
    const bank = archive_repository.requireArchive(context);
    const retained = core_cache.loadGenerationRecovery(mode, context, opts.archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    if (!retained) return;
    if (!ui_overlay.confirmExplicitAction('放弃这轮未提交草稿？', '仅清除此轮分段恢复记录，不删除已保存的模块、正式记忆或图片。未提交的成功分段也会放弃，不能恢复；不会自动重新生成。终端原有的逐 App 草稿另行保留。', { destructive: true })) return;
    const origin = { ...core_context.captureTaskOrigin(context, bank.archiveRevision), archiveTargetEntryId: opts.archiveTarget?.entryId || '' };
    origin.generationRecoveryDraftId = retained.draftId;
    await core_cache.saveGenerationRecovery(context, bank, mode, null, origin, { ...opts, draftId: retained.draftId, discardDraft: true });
    generation_recovery.discardGenerationRecoveryHeldReplies(retained.identity, retained.identity?.mode || mode);
    if (snapshot) await ui_overlay.refreshArchiveTargetSnapshotView(snapshot.entryId);
    else ui_overlay.showChooser();
}

export async function generateMode(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    const context = options.context || core_context.currentCharacterGuard();
    const origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || '');
    let logicalTask;
    try {
        logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'mode', mode,
            pageId: options.participantRegeneration?.pageId || mode, context, origin,
            taskKey: core_requestCoordinator.generationTaskKeyForMode(mode, context), parentTaskId: options.logicalParentTaskId });
    } catch (error) {
        if (error?.code !== 'RMT_LOGICAL_TASK_BUSY') throw error;
        globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在生成/补齐中。`, '心迹回廊');
        return options.participantRegeneration ? { status: 'blocked' } : undefined;
    }
    let result;
    try {
        result = await generateModeOperation(mode, { ...options, logicalTask });
        if (options.participantRegeneration && !result) result = { status: 'noop' };
        return result;
    } catch (error) {
        result = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        if (options.participantRegeneration) return { ...result, error };
        throw error;
    } finally {
        const autoAdvScripts = logicalTask?.autoAdvScripts === true && result?.status !== 'failed' && result?.status !== 'cancelled';
        core_requestCoordinator.finishLogicalGenerationTask(logicalTask, result);
        if (autoAdvScripts) setTimeout(() => { startAdvScriptSecondStep().catch(() => {}); }, 600);
    }
}

export async function startAdvScriptSecondStep() {
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const session = core_cache.loadSession(core_constants.MODE.ADV, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    if (!session?.events?.some(event => !event.adv?.paragraphs?.length)) return;
    runtimeState.activeMode = core_constants.MODE.ADV;
    runtimeState.activeSession = session;
    return modes_advEvent.generateAllAdvForSession({ background: true });
}

async function generateModeOperation(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return;
    // Capture once, before any archive/network/storage await. A destroyed invocation must never
    // adopt the next runtime lifetime and re-register itself as a fresh paid task.
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    if (mode === core_constants.MODE.THEME_SONG && options.automatic) return { status: 'noop' };
    options = { ...options, cgPromptFormat: options.cgPromptFormat || core_settings.getPluginSettings(options.context || core_context.getContext()).cgPromptFormat };
    // Readers may belong to a historical archive while the host stays in another
    // chat. Only that exact, unchanged reader may receive a foreground result.
    const scopedReaderMode = time_stories.isTimeStoryMode(mode)
        || mode === core_constants.MODE.THEME_SONG || mode === core_constants.MODE.HEART
        || (mode === core_constants.MODE.PHONE && runtimeState.activeSession?._rmtEmptyTerminal === true);
    const timeReader = scopedReaderMode && runtimeState.activeMode === mode && runtimeState.activeSession
        ? { session: runtimeState.activeSession, entryId: runtimeState.activeArchiveSnapshot?.entryId || '',
            scope: core_context.chatScopeKey(core_context.getContext()),
            position: JSON.stringify(navigation_bookmark.readingPosition(runtimeState.activeSession)) } : null;
    const timeReaderVisible = () => {
        try {
            return !!timeReader && core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)
                && runtimeState.activeMode === mode && runtimeState.activeSession === timeReader.session
                && (runtimeState.activeArchiveSnapshot?.entryId || '') === timeReader.entryId
                && core_context.chatScopeKey(core_context.getContext()) === timeReader.scope
                && JSON.stringify(navigation_bookmark.readingPosition(runtimeState.activeSession)) === timeReader.position
                && !document.getElementById(core_constants.OVERLAY_ID)?.hidden;
        } catch { return false; }
    };
    let themeSongPlan = null;
    let inboxDate = mode === core_constants.MODE.INBOX ? new Date() : null;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const background = options.background === true;
    let replaceExisting = options.replaceExisting === true;
    let recoveryHandle = null;
    let recoveryExisting = null;
    if (mode === core_constants.MODE.THEME_SONG && replaceExisting && !options.participantRegeneration) throw song_contract.songError('REPLACE', '印象曲每次追加新作品，不会整册覆盖。');
    if (mode === core_constants.MODE.INBOX && replaceExisting && !options.participantRegeneration) throw new Error('邮箱只追加新信，不支持整箱重新生成。');
    const archiveTarget = options.archiveTarget && typeof options.archiveTarget === 'object' ? options.archiveTarget : null;
    if (archiveTarget?.backupOnly) throw new Error('独立备份是永久只读快照，不能生成或写入派生内容。');
    let context = archiveTarget ? options.context : (options.context || core_context.currentCharacterGuard());
    if (!context) throw new Error('无法构建档案专用生成上下文。');
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    let replacementTicket = null;
    if (options.participantRegeneration) {
        replacementTicket = await core_cache.assertArchiveVersionReplacement(context, options.participantRegeneration, mode);
        const snapshot = core_participants.normalizeParticipantSnapshot(options.participantRegeneration.participantSnapshot);
        if (!snapshot) throw new Error('明确重做缺少本次已确认的人物快照。');
        options.participantRegeneration = { ...replacementTicket, participantSnapshot: snapshot };
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, options.logicalTask.origin, { participantSnapshot: snapshot });
        replaceExisting = true;
    }
    if (archiveTarget) {
        if (typeof options.revalidateArchiveTarget !== 'function') throw new Error('档案专用读取边界不可用，本次没有发起模型请求。');
        const latestTarget = await options.revalidateArchiveTarget(archiveTarget, lifecycleEpoch);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        archiveTarget.memory = structuredClone(latestTarget.memory);
        archiveTarget.cache = structuredClone(latestTarget.cache || {});
        archiveTarget.archiveRevision = core_text.normalizeText(latestTarget.memory?.archiveRevision, 240);
        context.chatMetadata[core_constants.MEMORY_KEY] = structuredClone(archiveTarget.memory);
        context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(archiveTarget.cache);
    }
    const expectedChatId = core_context.getChatId(context);
    let memoryBank = archive_repository.requireArchive(context);
    let targetMemoryBank = memoryBank;
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const promptFactory = generation_prompts.PROMPTS[mode];
    if (!promptFactory && !time_stories.isTimeStoryMode(mode) && ![core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.RELATIONS, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG].includes(mode)) return;
    const segmentedMode = time_stories.isTimeStoryMode(mode) || [core_constants.MODE.ENDING, core_constants.MODE.ALBUM, core_constants.MODE.HEART, core_constants.MODE.PHONE, core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG].includes(mode);
    let calendarCurrentDate = mode === core_constants.MODE.CALENDAR ? modes_calendar.storyCalendarDate(memoryBank) : '';
    let calendarLegacyDate = false;
    let generationPrompt = segmentedMode || mode === core_constants.MODE.RELATIONS
        ? ''
        : mode === core_constants.MODE.CALENDAR
            ? generation_prompts.calendarStoryPrompt(context, memoryBank, { currentDate: calendarCurrentDate })
            : promptFactory(context, memoryBank);
    let roomSession = null;
    let focusObject = null;
    let previousSession = null;
    const incrementalPart = mode === core_constants.MODE.HEART ? 'dialogues' : 'mode';
    const refreshableCalendar = mode === core_constants.MODE.CALENDAR;
    const refreshableRelations = mode === core_constants.MODE.RELATIONS || mode === core_constants.MODE.CABINET;
    let roomSchemaUpgrade = false;
    let allowPersonaExpansion = options.automatic !== true && [core_constants.MODE.ROOM, core_constants.MODE.ITEMS, core_constants.MODE.TRAVEL].includes(mode);
    const modeHasNoIncrementalWork = () => {
        if (replacementTicket) return false;
        if (options.continueRecovery) return false;
        if (allowPersonaExpansion && previousSession) return false;
        if (mode === core_constants.MODE.INBOX) return !modes_inbox.inboxPlan(memoryBank, previousSession, inboxDate).length;
        if (mode === core_constants.MODE.ROOM && options.visualOnly && previousSession) return false;
        if (mode === core_constants.MODE.PHONE && options.fillMissing) {
            if (options.continueDraft) throw new Error('私人终端还有已保存的续写草稿，请先从档案入口继续生成；补旧终端不会清除这份草稿。');
            return !modes_phone.phoneHasMissingEntries(previousSession);
        }
        if (!previousSession || refreshableCalendar || refreshableRelations || core_constants.CREATIVE_EXPANSION_MODES.includes(mode) || (mode === core_constants.MODE.PHONE && options.continueDraft === true)) return false;
        const pendingMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
        return !pendingMemoryIds.length && !roomSchemaUpgrade;
    };
    const reportNoIncrementalWork = () => {
        if (mode === core_constants.MODE.INBOX) { globalThis.toastr?.info?.('今天的来信与最新关系事件已经收录，不会重复请求。', '心迹回廊 · 邮箱'); return; }
        const targetPrefix = archiveTarget ? `「${archiveTarget.characterName} · ${archiveTarget.archiveName}」的` : '';
        globalThis.toastr?.info?.(`${targetPrefix}「${core_constants.MODE_LABEL[mode]}」已经覆盖当前档案。请先增量更新档案；下次只会追加新内容，旧内容不会重写。`, '心迹回廊');
    };
    const taskKey = core_requestCoordinator.generationTaskKeyForMode(mode, context);
    const alreadyGenerating = core_requestCoordinator.isModeGenerating(mode, context);
    if (alreadyGenerating) {
        globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在生成/补齐中。`, '心迹回廊');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已经有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成。`, '心迹回廊');
        return;
    }
    if (mode === core_constants.MODE.ROOM && runtimeState.roomLifeRefreshPromise) {
        globalThis.toastr?.info?.('“今日生活”正在更新，请等它完成后再从新增档案追加房间内容。', '心迹回廊');
        return;
    }
    if (mode === core_constants.MODE.ADV && (core_requestCoordinator.hasGenerationTaskPrefix(`adv:${core_context.chatScopeKey(context)}:`) || runtimeState.activeAdvBulkScopes.has(core_context.chatScopeKey(context)))) {
        globalThis.toastr?.info?.('当前有 ADV 正文正在生成，请等它完成后再追加 ADV EVENT 事件索引。', '心迹回廊');
        return;
    }
    // A no-op must not advance the durable mode fence. In another tab, doing so would cancel a
    // real in-flight build for the same frozen archive even though this invocation never calls a
    // provider. Preflight against the freshly revalidated snapshot, then repeat after the CAS.
    recoveryExisting = options.existing || core_cache.loadGenerationRecovery(mode, context, archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    // The whole-page entry must not resume the newest one-item child instead
    // of its page. Explicit draft buttons and legacy formal-item recovery keep
    // their existing routing; the child's paid journal remains independently saved.
    if (!options.automatic && !options.existing && !options.draftId
        && recoveryExisting?.operation?.kind === 'content-item' && recoveryExisting.operation.sourceDraftId) {
        recoveryExisting = core_cache.loadGenerationRecovery(mode, context, archiveTarget?.cache,
            { draftId: recoveryExisting.operation.sourceDraftId, pageId: recoveryExisting.pageId });
    }
    if (recoveryExisting) {
        if (replacementTicket && !options.continueRecovery) throw new Error('原分段草稿尚未保留到旧版本，本次没有重新请求。');
        if (options.automatic) return { status: 'noop' };
        if (recoveryExisting.operation?.kind && recoveryExisting.operation.kind !== 'mode') return continueSavedGeneration(mode,
            { ...options, draftId: recoveryExisting.draftId, pageId: recoveryExisting.pageId });
        if (!options.continueRecovery && !ui_overlay.confirmExplicitAction('继续未完成内容？', '这项还保留着上次的分段草稿。继续只补未完成部分，会使用文本生成额度；取消不会改动草稿或旧内容。', { destructive: false })) return;
        options.continueRecovery = true;
        replaceExisting = recoveryExisting.replaceExisting === true;
        const savedOperation = recoveryExisting.operation;
        if (savedOperation?.kind === 'mode') {
            if (savedOperation.participantRegeneration && !replacementTicket) {
                replacementTicket = await core_cache.assertArchiveVersionReplacement(context, savedOperation.participantRegeneration, mode);
                const participantSnapshot = core_participants.normalizeParticipantSnapshot(savedOperation.participantRegeneration.participantSnapshot);
                if (!participantSnapshot) throw new Error('重做草稿缺少原人物快照。');
                options.participantRegeneration = { ...replacementTicket, participantSnapshot };
                core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, options.logicalTask.origin, { participantSnapshot });
            }
            if (mode === core_constants.MODE.INBOX && typeof savedOperation.inboxDate === 'string' && Number.isFinite(Date.parse(savedOperation.inboxDate))) inboxDate = new Date(savedOperation.inboxDate);
            if (mode === core_constants.MODE.CALENDAR) {
                // Existing recovery keeps its exact recipe/date; never silently restarts paid work.
                calendarLegacyDate = savedOperation.calendarTimeBasis !== 'story';
                calendarCurrentDate = modes_calendar.normalizeCalendarDate(savedOperation.calendarDate)?.date || '';
                generationPrompt = (calendarLegacyDate ? generation_prompts.calendarPrompt : generation_prompts.calendarStoryPrompt)(context, memoryBank, { currentDate: calendarCurrentDate });
            }
            allowPersonaExpansion = options.automatic !== true && savedOperation.allowPersonaExpansion === true;
            options.visualOnly = savedOperation.visualOnly === true;
            options.fillMissing = savedOperation.fillMissing === true;
            if (typeof savedOperation.focusObjectId === 'string') options.focusObjectId = savedOperation.focusObjectId;
        }
    }
    previousSession = replaceExisting ? null : core_cache.loadSession(mode, {
        context,
        chatId: expectedChatId,
        memoryBank,
        clone: true,
    });
    roomSchemaUpgrade = mode === core_constants.MODE.ROOM && modes_room.roomNeedsSchemaUpgrade(previousSession);
    if (mode === core_constants.MODE.PHONE && !replaceExisting && core_cache.loadPhoneGenerationDraft(context, memoryBank)) options.continueDraft = true;
    if (modeHasNoIncrementalWork()) {
        if (!options.automatic) reportNoIncrementalWork();
        return options.automatic ? { status: 'noop' } : undefined;
    }
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    let origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId), archiveTargetEntryId: core_text.normalizeText(archiveTarget?.entryId, 120) };
    core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
    const targetEpochKey = archiveTarget ? `${origin.archiveTargetEntryId}:${mode}` : '';
    const targetEpoch = archiveTarget ? (Number(runtimeState.archiveTargetTaskEpochs.get(targetEpochKey)) || 0) + 1 : 0;
    if (archiveTarget) runtimeState.archiveTargetTaskEpochs.set(targetEpochKey, targetEpoch);
    const taskTrace = core_taskTrace.startTaskTrace(taskKey, mode);
    core_taskTrace.markStage(taskTrace, 'start');
    modeTaskTraces.set(taskKey, taskTrace);
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.registerArchiveTargetReservation(taskKey, { archiveTarget }, mode,
        archiveTarget ? `${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${core_constants.MODE_LABEL[mode]}生成中` : '');
    if (archiveTarget) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(archiveTarget.entryId));
    const archiveTargetStillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(options.logicalTask) && (!archiveTarget || (
        core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)
        && runtimeState.archiveTargetTaskEpochs.get(targetEpochKey) === targetEpoch
        && runtimeState.activeModeBuildScopes.has(taskKey)
    ));
    core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
    if (!background && (!scopedReaderMode || timeReaderVisible())) {
        ui_overlay.openOverlay();
        const actionText = replaceExisting ? `正在重新生成「${core_constants.MODE_LABEL[mode]}」…` : roomSchemaUpgrade ? '正在为旧版房间刷新视觉设定…' : refreshableCalendar && previousSession ? '正在刷新「两个人的日历」…' : refreshableRelations && previousSession ? '正在刷新「本世界线人际关系」…' : previousSession ? `正在从新增档案追加「${core_constants.MODE_LABEL[mode]}」…` : `正在生成「${core_constants.MODE_LABEL[mode]}」…`;
        ui_overlay.setInnerLoading(true, archiveTarget ? `正在为：${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${actionText}` : actionText);
    }
    try {
        if (archiveTarget) {
            if (typeof options.claimArchiveTarget !== 'function') throw new Error('档案专用生成版本边界不可用，本次没有发起模型请求。');
            const claimed = await options.claimArchiveTarget(archiveTarget, mode, archiveTargetStillCurrent);
            if (!archiveTargetStillCurrent()) throw new DOMException('Runtime destroyed', 'AbortError');
            archiveTarget.cache = claimed.cache;
            context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(claimed.cache);
        } else {
            await core_cache.claimLiveModeGeneration(mode, context, memoryBank, {
                draftId: options.draftId || recoveryExisting?.draftId,
                pageId: options.pageId || recoveryExisting?.pageId || mode,
            });
        }
        // A claim is a real IndexedDB CAS boundary. Another page may have committed the same
        // archive revision after the UI snapshot was opened, so every incremental/base input must
        // be reloaded from the claimed canonical cache before the first provider request.
        memoryBank = archive_repository.requireArchive(context);
        targetMemoryBank = memoryBank;
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        previousSession = replaceExisting ? null : core_cache.loadSession(mode, {
            context,
            chatId: expectedChatId,
            memoryBank,
            clone: true,
        });
        roomSchemaUpgrade = mode === core_constants.MODE.ROOM && modes_room.roomNeedsSchemaUpgrade(previousSession);
        if (mode === core_constants.MODE.PHONE && !replaceExisting && core_cache.loadPhoneGenerationDraft(context, memoryBank)) options.continueDraft = true;
        if (core_constants.ROOM_DEEP_MODES.includes(mode)) {
            roomSession = options.roomSessionOverride
                || core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: expectedChatId, memoryBank, clone: false });
            if (!roomSession) {
                globalThis.toastr?.info?.('请先生成“他的房间”，再从房间内部生成这项深层内容。', '心迹回廊');
                return;
            }
            const selectedSpace = roomSession.spaces.find(space => space.id === roomSession.selectedSpaceId) || roomSession.spaces[0];
            focusObject = selectedSpace?.objects.find(item => item.id === options.focusObjectId)
                || selectedSpace?.objects.find(item => item.id === roomSession.selectedObjectId)
                || selectedSpace?.objects[0]
                || null;
            if (mode === core_constants.MODE.ITEMS && !core_evidence.isSearchableRoomObject(focusObject)) {
                globalThis.toastr?.info?.('只有房间里的盒子、抽屉、柜子、包等收纳物可以生成翻找内容。', '心迹回廊');
                return;
            }
            if (mode !== core_constants.MODE.PHONE) generationPrompt = generation_prompts.roomDeepGenerationPrompt(mode, context, memoryBank, roomSession, focusObject);
        }
        if (modeHasNoIncrementalWork()) {
            if (!options.automatic) reportNoIncrementalWork();
            return options.automatic ? { status: 'noop' } : undefined;
        }
        if (mode === core_constants.MODE.THEME_SONG) {
            const stored = core_cache.getCache(context);
            if (!previousSession && stored?.[mode] && !replacementTicket) throw song_contract.songError('SOURCE', '已有印象曲暂不可读取，原作品保留。');
            themeSongPlan = recoveryExisting?.operation?.themeSongPlan
                ? modes_song.validateThemeSongPlan(recoveryExisting.operation.themeSongPlan, memoryBank)
                : modes_song.validateThemeSongPlan(modes_song.createThemeSongPlan(options.songOptions, memoryBank, previousSession), memoryBank);
        }
        origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId), archiveTargetEntryId: core_text.normalizeText(archiveTarget?.entryId, 120) };
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
        // A room replacement intentionally has no incremental previousSession.
        // Keep its unselected life/pets and linked physical IDs independently of
        // that prompt input. The already-validated version also repairs older
        // replacement drafts that never captured this separate preservation data.
        let linkedRoomSession = null;
        if (replacementTicket && mode === core_constants.MODE.ROOM) {
            const savedInputs = generation_recovery.readGenerationContentSnapshot(recoveryExisting)?.contentInputs;
            linkedRoomSession = savedInputs && Object.hasOwn(savedInputs, 'linkedRoomSession')
                ? structuredClone(savedInputs.linkedRoomSession)
                : (await core_cache.readArchiveVersion(context, replacementTicket.versionId)).cache[mode] || null;
        }
        recoveryHandle = await beginModeRecovery(mode, context, memoryBank, origin, { ...options, archiveTarget, stillCurrent: archiveTargetStillCurrent, existing: recoveryExisting, replaceExisting,
            partialReaderStillCurrent: scopedReaderMode ? () => !background && timeReaderVisible() : null,
            contentInputs: { previousSession, roomSession, focusObject, ...(linkedRoomSession ? { linkedRoomSession } : {}) },
            operation: recoveryExisting?.operation || { kind: 'mode', mode, ...(themeSongPlan ? { themeSongPlan } : {}), inboxDate: inboxDate?.toISOString() || '', calendarDate: calendarCurrentDate,
                ...(mode === core_constants.MODE.CALENDAR ? { calendarTimeBasis: 'story' } : {}),
                allowPersonaExpansion, visualOnly: options.visualOnly === true, fillMissing: options.fillMissing === true, focusObjectId: core_text.normalizeText(options.focusObjectId, 120),
                ...(replacementTicket ? { participantRegeneration: options.participantRegeneration } : {}) } });
        context = recoveryHandle.contentContext;
        memoryBank = recoveryHandle.contentBank;
        if (recoveryHandle.contentInputs) {
            previousSession = recoveryHandle.contentInputs.previousSession;
            roomSession = recoveryHandle.contentInputs.roomSession;
            focusObject = recoveryHandle.contentInputs.focusObject;
        }
        if (!segmentedMode && mode !== core_constants.MODE.RELATIONS) {
            generationPrompt = core_constants.ROOM_DEEP_MODES.includes(mode) && mode !== core_constants.MODE.PHONE
                ? generation_prompts.roomDeepGenerationPrompt(mode, context, memoryBank, roomSession, focusObject)
                : mode === core_constants.MODE.CALENDAR
                    ? (calendarLegacyDate ? generation_prompts.calendarPrompt : generation_prompts.calendarStoryPrompt)(context, memoryBank, { currentDate: calendarCurrentDate })
                    : promptFactory(context, memoryBank);
        }
        let session;
        const participantSnapshot = mode === core_constants.MODE.ROOM
            ? await captureRoomParticipantSnapshot(context, origin, { existing: recoveryExisting,
                participantSnapshot: options.participantRegeneration?.participantSnapshot })
            : mode === core_constants.MODE.ALBUM ? await captureAlbumParticipantSnapshot(context, origin, { existing: recoveryExisting,
                participantSnapshot: options.participantRegeneration?.participantSnapshot }) : null;
        if (participantSnapshot && options.logicalTask) {
            if (mode === core_constants.MODE.ROOM) options.logicalTask.participantPromptIndexed = true;
            core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin, { participantSnapshot });
        }
        let presentationContext = null;
        if (time_stories.isTimeStoryMode(mode) || (mode === core_constants.MODE.ITEMS && previousSession && allowPersonaExpansion) || [core_constants.MODE.ROOM, core_constants.MODE.PHONE, core_constants.MODE.TRAVEL, core_constants.MODE.INBOX, core_constants.MODE.PAST_LIVES, core_constants.MODE.THEME_SONG].includes(mode)) {
            presentationContext = await buildWorldPresentationContext(context, memoryBank, mode, origin, mode === core_constants.MODE.ROOM ? participantSnapshot : null);
            if (options.logicalTask && presentationContext.selectedSetting) options.logicalTask.inputPacking = presentationContext.selectedSetting;
        }
        if (mode === core_constants.MODE.THEME_SONG) {
            session = await modes_song.generateThemeSong(context, memoryBank, origin, taskKey, previousSession, { plan: themeSongPlan, presentationContext });
        } else if (mode === core_constants.MODE.INBOX) {
            session = await modes_inbox.generateInbox(context, memoryBank, origin, taskKey, previousSession, { presentationContext, date: inboxDate });
        } else if (time_stories.isTimeStoryMode(mode)) {
            session = await modes_timeStories.generateTimeStoryWithRepair(mode, context, memoryBank, origin, taskKey, { previousSession, replaceExisting, presentationContext });
        } else if (mode === core_constants.MODE.PAST_LIVES) {
            session = await modes_pastLives.generatePastLivesWithRepair(context, memoryBank, origin, taskKey, { previousSession, replaceExisting, presentationContext });
        } else if (mode === core_constants.MODE.ADV) {
            session = await modes_advEvent.generateAdvIndexWithRepair(context, memoryBank, origin, expectedChatId, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.BUTTERFLY) {
            session = previousSession
                ? await modes_butterfly.generateButterflyIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession)
                : await modes_butterfly.generateButterflyWithRepair(context, memoryBank, origin, taskKey);
        } else if (mode === core_constants.MODE.ROOM && options.fillRoomText && previousSession) {
            session = await modes_room.generateRoomWithRepair(context, memoryBank, origin, taskKey, { presentationContext, participantSnapshot, fillExisting: true, existingSession: previousSession, secondStep: true });
        } else if (mode === core_constants.MODE.ROOM && options.visualOnly && previousSession) {
            session = await modes_room.refreshRoomFigure(context, memoryBank, origin, taskKey, previousSession, { presentationContext, participantSnapshot });
        } else if (mode === core_constants.MODE.ROOM && previousSession) {
            session = await modes_room.generateRoomIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext, allowPersonaExpansion, participantSnapshot });
        } else if (mode === core_constants.MODE.ROOM) {
            session = await modes_room.generateRoomWithRepair(context, memoryBank, origin, taskKey, { presentationContext, participantSnapshot, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ITEMS && previousSession) {
            session = await modes_items.generateItemsIncrementalWithRepair(context, memoryBank, roomSession, focusObject, origin, taskKey, previousSession, { presentationContext, allowPersonaExpansion });
        } else if (mode === core_constants.MODE.ENDING) {
            session = await modes_ending.generateEndingWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.ALBUM) {
            session = await modes_album.generateAlbumWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, participantSnapshot, secondStep: options.secondStep === true });
        } else if (mode === core_constants.MODE.HEART) {
            session = await modes_heart.generateHeartWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.PHONE) {
            session = previousSession && options.fillMissing
                ? await modes_phone.generatePhoneMissingWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext,
                    savePartial: async partial => {
                        partial.chatId = expectedChatId; partial.archiveRevision = expectedArchiveRevision;
                        if (archiveTarget) await archive_library.commitArchiveTargetSessionMutation(archiveTarget, mode, origin, () => partial, partial, archiveTargetStillCurrent);
                        else if (!await core_cache.commitSessionMutation(mode, expectedChatId, origin, () => partial, partial)) throw new DOMException('Archive changed', 'AbortError');
                    } })
                : previousSession && options.continueDraft !== true
                ? await modes_phone.generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession, { presentationContext })
                : await modes_phone.generatePhoneWithRepair(context, memoryBank, origin, taskKey, {
                    continueDraft: options.continueDraft === true,
                    secondStep: options.secondStep === true,
                    archiveTarget,
                    stillCurrent: archiveTargetStillCurrent,
                    presentationContext,
                });
        } else if (mode === core_constants.MODE.TRAVEL) {
            session = await modes_travel.generateTravelWithRepair(context, memoryBank, origin, taskKey, { replaceExisting, presentationContext, allowPersonaExpansion });
        } else if (mode === core_constants.MODE.RELATIONS) {
            const selectedBooks = await generation_recovery.frozenGenerationInput(origin, 'relations:setting-books',
                () => archive_repository.collectSelectedMemoryWorldInfo(context, expectedChatId, null, { settingsOnly: true }));
            const settingSelection = modes_relations.fitRelationSettingEntries(selectedBooks.entries, { coverage: selectedBooks.coverage });
            // Same rule as the setting envelope: an unreadable or oversized book means
            // "fewer people to draw from", not "refuse to refresh the garden".
            if (settingSelection.coverage.status !== 'complete' && options.logicalTask) {
                const kept = settingSelection.entries?.length || 0;
                const total = (selectedBooks.entries || []).length;
                options.logicalTask.inputPacking = {
                    used: kept,
                    total,
                    dropped: Math.max(0, total - kept),
                    note: `已发送 ${kept}/${total} 条人际设定，未送出的旧人物仅在来源仍有效时保留。${core_text.normalizeText(settingSelection.coverage?.reason, 160)}`,
                    deduplicatedChars: 0,
                    included: [],
                    excluded: [],
                };
            }
            const settingEntries = settingSelection.entries;
            const raw = await requestValidatedSegment(
                modes_relations.relationsPrompt(context, memoryBank, settingEntries),
                '正在整理当前世界线的人际关系…',
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 7000, temperature: 0.3, context, origin, taskKey: `${taskKey}:relations`, mode, background: true },
                value => {
                    if (settingEntries.length && !Array.isArray(value?.settingRelationships)) throw new Error('设定人物列表缺失');
                    modes_relations.normalizeRelations(value, memoryBank, context);
                    return value;
                },
            );
            session = modes_relations.normalizeRelations(raw, memoryBank, context);
            session.settingRelationships = modes_relations.mergeBudgetRetainedSettingRelations(raw.settingRelationships, previousSession?.settingRelationships, settingSelection, context);
            session.settingCoverage = settingSelection.coverage;
            const relationGroupId = archive_groups.currentArchiveGroupKey(context, memoryBank);
            if (relationGroupId) {
                const relationEntries = archive_groups.archiveGroupEntries(relationGroupId, context);
                const relationMeta = archive_groups.archiveGroupMeta(relationGroupId, relationEntries, context);
                session.profileKey = modes_relations.archiveCharacterProfileKey(relationGroupId, relationMeta, relationEntries);
            }
            session.characterName = core_text.normalizeText(context.name2, 120);
            session.characterAvatar = core_context.contextCharacterAvatar(context, context.name2);
        } else if (mode === core_constants.MODE.ACHIEVEMENTS) {
            session = await modes_achievements.generateAchievementsWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else {
            const contextEnvelope = mode === core_constants.MODE.CALENDAR
                ? await generation_recovery.frozenGenerationInput(origin, 'context:calendar',
                    () => core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(mode, context) }))
                : presentationContext?.contextEnvelope;
            const effectivePrompt = mode === core_constants.MODE.ROOM
                ? `${generationPrompt}\nCONTROLLED_WORLD_PRESENTATION_JSON:\n${JSON.stringify(presentationContext?.profile || {}, null, 2)}\n明确的外貌设定优先采用角色卡/世界书原文；本轮不生成宠物；不要依据生成的房间名、物件或用户 persona 猜测。`
                : generationPrompt;
            const normalize = raw => mode === core_constants.MODE.CALENDAR
                ? modes_calendar.normalizeCalendar(raw, memoryBank, {
                    currentDate: calendarCurrentDate,
                    dateBasis: calendarLegacyDate ? 'legacy-local' : 'story',
                    futureEvidenceText: core_worldPresentation.controlledCalendarEvidence(contextEnvelope),
                    holidayEvidenceText: core_worldPresentation.controlledSettingEvidence(contextEnvelope),
                })
                : mode === core_constants.MODE.ROOM
                    ? modes_room.normalizeRoom(raw, memoryBank, {
                        identityKey: core_context.currentCharacterRuntimeKey(context),
                        worldPresentation: presentationContext?.profile,
                        controlledEvidence: presentationContext?.settingEvidence,
                        characterEvidence: presentationContext?.characterEvidence,
                    })
                : generation_normalizers.normalizeByMode(mode, raw, memoryBank, context);
            session = await requestValidatedSegment(
                effectivePrompt,
                `正在根据当前聊天档案生成「${core_constants.MODE_LABEL[mode]}」…`,
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 6144, context, contextEnvelope, origin, taskKey, mode, background: true },
                normalize,
            );
            if (mode === core_constants.MODE.CALENDAR && previousSession && !replaceExisting) {
                session = modes_calendar.mergeCalendarRefresh(previousSession, session, memoryBank);
            }
            if (mode === core_constants.MODE.CABINET && previousSession) session = modes_cabinet.mergeCabinet(previousSession, session);
        }
        core_taskTrace.markStage(taskTrace, 'validate');
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        if (replacementTicket) {
            if (mode === core_constants.MODE.ROOM) {
                session = modes_room.preserveRoomLinkedContent(linkedRoomSession, session);
            }
            session[core_cache.PARTICIPANT_REPLACEMENT_KEY] = replacementTicket;
        }
        if (!core_incremental.incrementalPartRecord(session, incrementalPart)) {
            const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
            const added = previousSession ? 0 : 1;
            core_incremental.stampIncrementalCoverage(session, previousSession, memoryBank, incrementalPart, sourceMemoryIds, added);
        }
        const generatedSongId = mode === core_constants.MODE.THEME_SONG ? session.songs[0]?.id || '' : '';
        session.chatId = expectedChatId;
        if (memoryBank.archiveRevision !== expectedArchiveRevision) {
            session.archiveRevision = memoryBank.archiveRevision;
            const pending = await core_cache.saveGenerationTaskResult(context, mode, session, origin, {
                draftId: origin.generationRecoveryDraftId, pageId: recoveryHandle?.journal.pageId || mode,
                archiveTarget, memoryBank: targetMemoryBank, sourceMemory: memoryBank, complete: true,
            });
            core_taskTrace.endTaskTrace(taskTrace, 'ok');
            await ui_overlay.presentGenerationTaskResult(pending.draftId, contentContextSources.get(context) || context);
            return pending;
        }
        session.archiveRevision = expectedArchiveRevision;
        await core_context.yieldToUi();
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
        core_taskTrace.beginStage(taskTrace, 'save');
        core_requestCoordinator.noteChatTaskPhase('save', { taskKey, origin });
        let committed = false;
        if (archiveTarget) {
            const stillCurrent = archiveTargetStillCurrent;
            if (!stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
            if (typeof options.revalidateArchiveTarget !== 'function' || typeof options.commitArchiveTarget !== 'function') throw new Error('档案专用写回边界不可用，本次结果没有写入。');
            const latestTarget = await options.revalidateArchiveTarget(archiveTarget, lifecycleEpoch);
            if (!stillCurrent()) throw new Error('这份档案已启动更新的同类任务，本次旧结果没有写入。');
            await options.commitArchiveTarget(latestTarget, mode, session, stillCurrent, origin);
            committed = true;
        } else if (core_context.isCurrentTaskOrigin(origin)) {
            try {
                const latestMemory = archive_repository.requireArchive(core_context.currentCharacterGuard());
                if (latestMemory.archiveRevision === expectedArchiveRevision) {
                    committed = await core_cache.commitSession(mode, session, expectedChatId, origin);
                }
            } catch (error) {
                core_taskTrace.recordTaskFailure(taskTrace, error);
            }
        }
        if (!committed && !archiveTarget) {
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
            const deferredDurable = core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [mode]: session } });
            core_requestCoordinator.notifyDeferredCommitNotDurable(deferredDurable);
        }

        if (committed && recoveryHandle) await core_cache.saveGenerationRecovery(context, memoryBank, mode, null, origin, { archiveTarget, stillCurrent: archiveTargetStillCurrent });
        if (committed && [core_constants.MODE.INBOX, core_constants.MODE.THEME_SONG].includes(mode)) {
            session = archiveTarget
                ? core_cache.loadSession(mode, { chatId: expectedChatId, memoryBank, cache: runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId ? runtimeState.activeArchiveSnapshot.cache : archiveTarget.cache }) || session
                : core_cache.loadSession(mode) || session;
        }
        if (replacementTicket) {
            core_taskTrace.endTaskTrace(taskTrace, committed ? 'ok' : 'deferred');
            return { status: committed ? 'committed' : 'deferred', session };
        }
        core_taskTrace.markStage(taskTrace, 'save', committed);
        if (!committed) core_taskTrace.markStage(taskTrace, 'deferred');
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        const phoneProgress = mode === core_constants.MODE.PHONE ? modes_phone.phoneCompletionSummary(session) : null;
        const partialNotice = phoneProgress?.partial ? `已保留 ${phoneProgress.readableItems} 条，另有 ${phoneProgress.missingItems} 项未完成，可在终端选择重试` : '';
        const stayBackground = background || !committed || (scopedReaderMode
            ? !timeReaderVisible()
            : !core_context.isCurrentTaskOrigin(origin) || overlay?.hidden || runtimeState.activeMode !== mode);
        if (stayBackground) {
            if (archiveTarget) ui_settingsPanel.refreshSettingsTaskStatus();
            else ui_settingsPanel.refreshSettingsMemoryStatus();
            if (!options.automatic && overlay && !overlay.hidden && !runtimeState.activeMode) archive_snapshots.scheduleChooserRefresh(20);
            if (!options.automatic && !archiveTarget && mode === core_constants.MODE.ROOM && runtimeState.activeMode === core_constants.MODE.ROOM && committed) {
                runtimeState.activeSession = core_cache.loadSession(core_constants.MODE.ROOM) || runtimeState.activeSession;
                modes_room.renderRoom();
            }
            const targetDone = archiveTarget ? `已安全写回：${archiveTarget.characterName} · ${archiveTarget.archiveName} · ` : '';
            core_taskTrace.endTaskTrace(taskTrace, committed ? 'ok' : 'deferred');
            if (options.automatic) return { status: committed ? 'committed' : 'deferred' };
            globalThis.toastr?.success?.(`${targetDone}${partialNotice || (replaceExisting ? '后台重新生成完成' : refreshableCalendar && previousSession ? '后台刷新完成' : refreshableRelations && previousSession ? '后台刷新完成' : previousSession ? '后台增量追加完成' : '后台生成完成')}：${core_constants.MODE_LABEL[mode]}${committed || archiveTarget ? '' : '（回到原窗口自动写入）'}`, '心迹回廊');
            return session;
        }
        if (mode === core_constants.MODE.THEME_SONG && session.songs.some(song => song.id === generatedSongId)) {
            session = { ...session, selectedId: generatedSongId };
        }
        runtimeState.activeMode = mode;
        runtimeState.activeSession = mode === core_constants.MODE.HEART
            ? { ...session, ...heart_reader.heartSelectionScalars(runtimeState.activeSession) } : session;
        core_taskTrace.beginStage(taskTrace, 'render');
        ui_overlay.renderActive();
        core_taskTrace.markStage(taskTrace, 'render');
        core_taskTrace.endTaskTrace(taskTrace, 'ok');
        // Today's life is a separate explicit action; saving a room does not incur
        // an additional unconfirmed provider request.
        globalThis.toastr?.success?.(`${partialNotice || (replaceExisting ? '已重新生成' : refreshableCalendar && previousSession ? '已刷新' : refreshableRelations && previousSession ? '已刷新' : previousSession ? '已增量追加' : '已生成')}：${core_constants.MODE_LABEL[mode]}${previousSession && !refreshableCalendar && !refreshableRelations && !replaceExisting ? '；旧内容保持不变' : ''}`, '心迹回廊');
        return session;
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error?.failure || error);
        if (replacementTicket) {
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        }
        if (recoveryHandle) { try { await generation_recovery.noteGenerationRecoveryFailure(origin, error?.failure || error); } catch {} }
        if (recoveryHandle && error?.name !== 'AbortError') {
            try {
                const summary = generation_recovery.generationRecoverySummary(recoveryHandle.journal);
                if (summary?.canRetry && !summary.canContinue && !summary.oversized && !summary.blocked) {
                    core_requestCoordinator.noteRetryableGeneration({
                        mode,
                        draftId: recoveryHandle.journal.draftId || '',
                        pageId: recoveryHandle.journal.pageId || mode,
                        label: core_constants.MODE_LABEL[mode] || mode,
                    });
                }
            } catch { /* A missed auto-retry leaves the manual button in the task center. */ }
        }
        if (error?.name === 'AbortError') {
            console.warn('[HeartbeatMemories] generation aborted by extension/task cancellation', { mode });
            return null;
        }
        const safeError = core_text.safeErrorSummary(error, 800);
        console.error('[HeartbeatMemories] generation failed', {
            mode,
            ...core_text.safeErrorDiagnostic(error),
        });
        const targetVisible = !archiveTarget || (
            runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
        );
        if (!archiveTarget && mode === core_constants.MODE.PHONE && error?.code === 'RMT_PHONE_DRAFT_AVAILABLE' && runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM) {
            modes_room.renderRoom();
        }
        if (archiveTarget && !targetVisible) {
            globalThis.toastr?.error?.(
                core_text.toastText(`${archiveTarget.characterName} · ${archiveTarget.archiveName} · ${core_constants.MODE_LABEL[mode]}：${safeError}`),
                '心迹回廊 · 档案生成失败',
            );
            error.notified = true;
            return null;
        }
        if (background || document.getElementById(core_constants.OVERLAY_ID)?.hidden || runtimeState.activeMode !== mode
            || (scopedReaderMode && !timeReaderVisible())) {
            const targetPrefix = archiveTarget ? `${archiveTarget.characterName} · ${archiveTarget.archiveName} · ` : '';
            globalThis.toastr?.error?.(core_text.toastText(`${targetPrefix}${safeError}`), `心迹回廊 · ${core_constants.MODE_LABEL[mode]}生成失败`);
            error.notified = true;
            return null;
        }
        if (error.preflightDetail) ui_overlay.showInlinePreflight(safeError, error.preflightDetail, { error: true });
        else ui_overlay.showInlineError(safeError);
        error.notified = true;
        return null;
    } finally {
        core_taskTrace.endTaskTrace(taskTrace, 'noop');
        modeTaskTraces.delete(taskKey);
        generation_recovery.detachGenerationRecovery(origin);
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
        if (archiveTarget) queueMicrotask(() => ui_overlay.refreshArchiveTargetSnapshotView(archiveTarget.entryId));
        const targetVisible = !archiveTarget || (
            runtimeState.activeArchiveSnapshot?.entryId === archiveTarget.entryId
            && !document.getElementById(core_constants.OVERLAY_ID)?.hidden
        );
        if (!background && targetVisible && (!scopedReaderMode || timeReaderVisible())) ui_overlay.setInnerLoading(false);
    }
}

const autoContinuedDrafts = new Set();
// Recovery is a dependency of this module, but the bundle initializes this file first
// when the import cycle is cut. Register after the current init turn so the export exists.
queueMicrotask(() => {
    if (typeof generation_recovery.setTruncationContinueHandler !== 'function') return;
    generation_recovery.setTruncationContinueHandler(item => {
        const key = `${item?.mode || ''}:${item?.draftId || ''}`;
        if (!item?.mode || !item?.draftId || autoContinuedDrafts.has(key)) return;
        autoContinuedDrafts.add(key);
        setTimeout(() => {
            continueSavedGeneration(item.mode, {
                draftId: item.draftId,
                pageId: item.pageId || '',
                skipConfirm: true,
                background: true,
            }).catch(error => {
                console.warn('[HeartbeatMemories] automatic continuation did not start', error?.code || error?.name || 'failed');
            });
        }, 400);
    });
});
