import * as advanced_generation from '../core/advancedGeneration.js';
import * as context_tags from '../core/contextTags.js';
import * as draft_inputs from './draftInputs.js';
import * as archive_batches from './importBatches.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as archive_sourceLedger from './sourceLedger.js';
import * as archive_capacity from './capacity.js';
import { emptyMemoryWorldInfo, getMemoryWorldInfoSelection, memorySourceScopeForContext, normalizeExternalMemoryRecords } from './worldInfoSources.js';
// 建档任务身份：来源归属、设置身份、任务输入冻结与批次身份校验
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

export function archiveSourceOwnerIdentity(context) {
    return JSON.stringify({ character: context.characters?.[context.characterId]?.data || context.characters?.[context.characterId] || null,
        persona: [context.name1, context.userAvatar || context.personaAvatar || context.user_avatar || globalThis.user_avatar || '', context.powerUserSettings?.persona_description || ''] });
}

export function archiveRecoverySettingsIdentity(context) {
    const settings = core_settings.getPluginSettings(context);
    const generationSettings = Object.fromEntries(['apiConnectionMode', 'connectionProfileId', 'modelOverride', 'manualApiBaseUrl',
        'manualApiModel', 'manualApiKey', 'manualApiStreaming', 'chatReadRange', 'useActivatedWorldInfo', 'maxTokens', 'temperature', 'useCurrentChatExternalMemory', 'excludedContextTags',
        'bannedGeneratedPhrases', 'creativeSupplementEnabled', 'creativeSupplement'].map(key => [key, settings[key]]));
    Object.assign(generationSettings, context_tags.savedTagSelection(settings));
    if (settings.advancedGenerationEnabled === true) generationSettings.advancedGeneration = advanced_generation.advancedFingerprint(settings);
    return JSON.stringify({ settings: generationSettings, worldInfoSelection: getMemoryWorldInfoSelection(context).books,
        profile: settings.apiConnectionMode === 'profile'
        ? core_settings.rawConnectionProfile(settings.connectionProfileId, context) : null });
}

// Content belongs to the captured task. Connection profiles, endpoints, models
// and credentials deliberately remain on the live request context.
const ARCHIVE_CONTENT_SETTING_KEYS = ['temperature', 'maxTokens', 'chatReadRange', 'useActivatedWorldInfo',
    'useCurrentChatExternalMemory', 'excludedContextTags', 'contextTagMode', 'retainedContextTags',
    'bannedGeneratedPhrases', 'creativeSupplementEnabled', 'creativeSupplement'];

function archiveContentSettings(context) {
    const settings = core_settings.getPluginSettings(context);
    return structuredClone(Object.fromEntries(ARCHIVE_CONTENT_SETTING_KEYS.filter(key => settings[key] !== undefined)
        .map(key => [key, settings[key]])));
}

function archiveTaskBinding(context) {
    const origin = core_context.captureTaskOrigin(context);
    return Object.fromEntries(['characterKey', 'characterId', 'characterAvatar', 'chatId'].map(key => [key, origin[key]]));
}

export function captureArchiveTaskInput(context, payload) {
    const data = { ...payload, binding: archiveTaskBinding(context),
        names: { name1: context.name1, name2: context.name2 }, contentSettings: archiveContentSettings(context) };
    const taskInputV1 = { version: 1, digest: archive_batches.sourceHash(JSON.stringify(data)), data };
    return payload.operation === 'import' ? draft_inputs.compactArchiveInputs({ batchVersion: 1, progress: {}, taskInputV1 }).taskInputV1 : taskInputV1;
}

export function checkedArchiveTaskInput(value, context, { completedSaveOnly = false } = {}) {
    if (!value) return null;
    if (value.version !== 1 || !value.data || value.digest !== archive_batches.sourceHash(JSON.stringify(value.data))) {
        throw core_text.safeUserError('原任务资料未通过完整性校验，原草稿保留。', 'RMT_RECOVERY_DATA');
    }
    const actual = archiveTaskBinding(context);
    for (const key of Object.keys(actual)) if (value.data.binding?.[key] !== actual[key]) {
        // The existing completed-save path permits a display-name change only.
        // Keep the captured payload intact and prove unchanged card facts plus
        // slot/avatar before accepting that one runtime-key difference.
        if (completedSaveOnly && key === 'characterKey' && value.data.identity?.characterFacts && value.data.identity?.characterLocator) {
            const current = batchIdentity(context, { fullFingerprint: value.data.snapshotForIdentity?.fullFingerprint || '' });
            if (current.characterFacts === value.data.identity.characterFacts && current.characterLocator === value.data.identity.characterLocator) continue;
        }
        throw archive_batches.changedInput(key === 'chatId' ? 'chat' : 'character');
    }
    return structuredClone(value.data);
}

export function archiveContentContext(context, taskInput) {
    if (!taskInput) return context;
    return { ...context, ...taskInput.names, extensionSettings: { ...context.extensionSettings,
        [core_constants.EXTENSION_SETTINGS_KEY]: { ...core_settings.getPluginSettings(context), ...taskInput.contentSettings } } };
}

export function batchIdentity(context, snapshot) {
    const raw = JSON.parse(archiveRecoverySettingsIdentity(context));
    const range = raw.settings.chatReadRange;
    const selection = [raw.worldInfoSelection, raw.settings.useCurrentChatExternalMemory, raw.settings.excludedContextTags];
    if (raw.settings.contextTagMode === 'keep') selection.push(context_tags.savedTagSelection(raw.settings));
    delete raw.settings.contextTagMode; delete raw.settings.retainedContextTags;
    delete raw.settings.chatReadRange; delete raw.settings.useCurrentChatExternalMemory; delete raw.settings.excludedContextTags;
    delete raw.worldInfoSelection;
    const owner = JSON.parse(archiveSourceOwnerIdentity(context));
    const characterFacts = structuredClone(owner.character);
    if (characterFacts && typeof characterFacts === 'object') {
        delete characterFacts.name;
        if (characterFacts.data && typeof characterFacts.data === 'object') delete characterFacts.data.name;
    }
    const hash = value => archive_batches.sourceHash(JSON.stringify(value));
    return { chat: hash([core_context.getChatId(context), snapshot.fullFingerprint]),
        character: hash([core_context.currentCharacterRuntimeKey(context), owner.character]), persona: hash(owner.persona),
        characterFacts: hash(characterFacts), characterLocator: hash([String(context.characterId ?? ''), core_context.currentCharacterAvatar(context)]),
        range: hash(range), selection: hash(selection), configuration: hash(raw) };
}

export function assertBatchCommitIdentity(context, bank, { completedSaveOnly = false } = {}) {
    const progress = bank?.[archive_batches.IMPORT_PROGRESS_KEY];
    if (!progress) return;
    const captured = checkedArchiveTaskInput(progress.taskInputV1, context, { completedSaveOnly });
    if (captured) {
        archive_batches.assertIdentity(progress.identity, captured.identity);
        return;
    }
    const actual = batchIdentity(context, { fullFingerprint: core_context.completeArchiveChatFingerprint(context) });
    const expected = progress.identity;
    // An already completed, explicitly retried save keeps the established same-slot
    // display-name compatibility. ALL facts, avatar/slot, Persona, chat, settings,
    // source choices, CAS and deletion fences must still agree. This exception
    // cannot admit a new provider request or a changed character description.
    if (completedSaveOnly && expected.characterFacts && expected.characterLocator
        && actual.characterFacts === expected.characterFacts && actual.characterLocator === expected.characterLocator) {
        archive_batches.assertIdentity({ ...expected, character: expected.characterFacts }, { ...actual, character: actual.characterFacts });
    } else archive_batches.assertIdentity(expected, actual);
}

export async function retainedBatchExternal(context, progress) {
    const meta = structuredClone(progress.external);
    const ledger = await archive_sourceLedger.readMemorySourceLedger(memorySourceScopeForContext(context));
    // Retained revisions, not just the newest projection. Exact per-fragment hashes
    // below select the captured revision. Current selection is checked before this read.
    const rows = (ledger?.records || []).map(row => ({ ...row, content: (row.fragments || []).join('') }));
    const retained = normalizeExternalMemoryRecords(rows, { complete: true, tagPolicy: context_tags.tagPolicyForContext(context) });
    const records = [...retained, ...(progress.fallbackRecords || [])];
    return { ...meta, records, worldInfo: progress.worldInfo || emptyMemoryWorldInfo('none') };
}

export function progressExternalMetadata(external) {
    const { records, worldInfo, ...metadata } = external;
    return structuredClone(metadata);
}

export function progressWorldInfo(worldInfo) {
    if (!worldInfo) return emptyMemoryWorldInfo('none');
    return { ...structuredClone(worldInfo), entries: (worldInfo.entries || []).filter(row => !row.historySource).map(row => structuredClone(row)) };
}

export function admitArchiveBatch(existingMemories, fresh, existingCold = []) {
    return archive_capacity.admitArchiveMemories(existingMemories, fresh, existingCold);
}
