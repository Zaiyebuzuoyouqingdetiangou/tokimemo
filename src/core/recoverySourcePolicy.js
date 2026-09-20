import * as contextApi from './context.js';
import * as settingsApi from './settings.js';
import * as repository from '../archive/repository.js';
import * as recovery from '../generation/recovery.js';
import * as text from './text.js';
import * as contextTags from './contextTags.js';

export function recoverySettingsIdentity(context) {
    const settings = settingsApi.getPluginSettings(context);
    return JSON.stringify({ creativeSupplementEnabled: settings.creativeSupplementEnabled,
        creativeSupplement: settings.creativeSupplement, excludedContextTags: settings.excludedContextTags,
        ...contextTags.savedTagSelection(settings), bannedGeneratedPhrases: settings.bannedGeneratedPhrases });
}

export async function assertRecoverySettings(journal, context) {
    if (recovery.readGenerationContentSnapshot(journal)) return;
    if (journal && recovery.generationRecoverySummary(journal)
        && journal.settingsHash !== await recovery.generationRecoveryDigest(recoverySettingsIdentity(context))) {
        throw recovery.generationRecoveryMismatch('configuration', 'initialization');
    }
}

export function recoverySourceValues(context) {
    const settings = settingsApi.getPluginSettings(context);
    return {
        character: JSON.stringify(context.characters?.[context.characterId]?.data || context.characters?.[context.characterId] || null),
        persona: JSON.stringify([context.name1, context.userAvatar || context.personaAvatar || context.user_avatar || globalThis.user_avatar || '', context.powerUserSettings?.persona_description || '']),
        selection: JSON.stringify([repository.getMemoryWorldInfoSelection(context).books, settings.useActivatedWorldInfo,
            settings.useCurrentChatExternalMemory, settings.excludedContextTags, settings.contextTagMode || '', settings.retainedContextTags || []]),
    };
}
export async function recoverySourcePolicy(context) {
    const values = recoverySourceValues(context);
    return Object.fromEntries(await Promise.all(Object.entries(values).map(async ([key,value]) => [key, await recovery.generationRecoveryDigest(value)])));
}
export async function assertRecoverySourcePolicy(journal, context, origin = null) {
    if (!journal || !recovery.generationRecoverySummary(journal)) return;
    const current = origin || contextApi.captureTaskOrigin(context, journal.identity.archiveRevision);
    const pairs = [['characterKey','角色身份'], ['characterId','角色身份'], ['characterAvatar','角色身份'], ['chatId','聊天身份'], ['archiveRevision','档案版本']];
    for (const [key,label] of pairs) if ((journal.identity[key] || '') !== (current[key] || '')) {
        if (key === 'archiveRevision' && recovery.readGenerationContentSnapshot(journal)) continue;
        const error = text.safeUserError(`${label}与原任务不同；成功内容及草稿保留，未发起新请求。请回到原任务或明确另建任务。`, 'RMT_RECOVERY_SOURCE_CHANGED');
        error.archiveInputCategory = key === 'chatId' ? 'chat' : key === 'archiveRevision' ? 'archive' : 'character';
        error.recoveryPhase = 'source';
        throw error;
    }
    await assertRecoverySettings(journal, context);
    if (recovery.readGenerationContentSnapshot(journal)) return;
    if (!journal.sourcePolicy) return;
    const actual = await recoverySourcePolicy(context);
    for (const [key,label] of [['character','角色卡'], ['persona','Persona'], ['selection','来源选择或标签设置']]) {
        if (journal.sourcePolicy[key] !== actual[key]) {
            const error = text.safeUserError(`${label}与原任务不同；成功内容及草稿保留，未发起新请求。请恢复原设置，或明确另建任务。`, 'RMT_RECOVERY_SOURCE_CHANGED');
            error.archiveInputCategory = key;
            error.recoveryPhase = 'source';
            throw error;
        }
    }
}
