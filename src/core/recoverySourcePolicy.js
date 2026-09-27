import * as contextApi from './context.js';
import * as settingsApi from './settings.js';
// C-3c（r84.100）：别名沿用 repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as repository from './archiveBridge.js';
// C-3b（r84.99）：别名沿用 recovery，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as recovery from './generationBridge.js';
import * as text from './text.js';
import * as contextTags from './contextTags.js';
// C-2（r84.97）：别名沿用 ui_overlay，函数体一字不改；实际指向 core 层的桥，不再 import ui 层。
import * as ui_overlay from './uiBridge.js';

let confirmLegacyConfigurationRestart = async () => {
    // Resolve UI only when the user starts recovery, after module initialization.
    return ui_overlay.confirmExplicitAction('保留旧失败记录，按现在的设置重新尝试？',
        '这份旧版记录没有收到成功正文或截断正文，也没有原始背景快照。当前设置已改变；确认后会完整保留旧失败记录，再按当前背景和设置请求。取消不发送。',
        { destructive: false });
};
const restartApprovals = new WeakMap();
export function setLegacyConfigurationRestartConfirmation(confirm) {
    confirmLegacyConfigurationRestart = typeof confirm === 'function' ? confirm : null;
}
async function restartApprovalKey(journal, context) {
    return recovery.generationRecoveryDigest({ identity: journal.identity, settingsHash: journal.settingsHash,
        segments: journal.segments, frozenInputs: journal.frozenInputs || {}, sourcePolicy: journal.sourcePolicy || {},
        currentSettings: recoverySettingsIdentity(context) });
}
export async function consumeLegacyConfigurationRestart(journal, context) {
    if (!recovery.canRestartLegacyConfiguration(journal)) return false;
    const approvals = restartApprovals.get(context);
    const key = await restartApprovalKey(journal, context);
    if (!approvals?.has(key)) return false;
    approvals.delete(key);
    return true;
}
export async function hasLegacyConfigurationRestartApproval(journal, context) {
    return recovery.canRestartLegacyConfiguration(journal)
        && restartApprovals.get(context)?.has(await restartApprovalKey(journal, context)) === true;
}

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
        if (recovery.canRestartLegacyConfiguration(journal) && confirmLegacyConfigurationRestart) {
            const key = await restartApprovalKey(journal, context);
            const approvals = restartApprovals.get(context) || new Set();
            if (approvals.has(key)) return;
            if (await confirmLegacyConfigurationRestart()) {
                // A setting change while the dialog was open cannot borrow its approval.
                if (key !== await restartApprovalKey(journal, context)) throw recovery.generationRecoveryMismatch('configuration');
                approvals.add(key); restartApprovals.set(context, approvals);
                return;
            }
        }
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
    if (recovery.readGenerationContentSnapshot(journal)) return;
    const actual = journal.sourcePolicy ? await recoverySourcePolicy(context) : null;
    for (const [key,label] of [['character','角色卡'], ['persona','Persona'], ['selection','来源选择或标签设置']]) {
        if (actual && journal.sourcePolicy[key] !== actual[key]) {
            const error = text.safeUserError(`${label}与原任务不同；成功内容及草稿保留，未发起新请求。请恢复原设置，或明确另建任务。`, 'RMT_RECOVERY_SOURCE_CHANGED');
            error.archiveInputCategory = key;
            error.recoveryPhase = 'source';
            throw error;
        }
    }
    await assertRecoverySettings(journal, context);
}
