import * as recovery_source from '../core/recoverySourcePolicy.js';
import * as cg_policy from './cgPromptPolicy.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as generation_recovery from './recovery.js';
import * as generation_progress from './partialProgress.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as ui_overlay from '../ui/overlay.js';
import { captureGenerationContent, contentContextSources, fitGenerationContentSnapshot, generationContentContext, snapshotGenerationContent } from './generationContext.js';
import { recoveryModeTaskScopes, recoverySettingsIdentity } from './generationRequest.js';
// 已保存生成的操作：开始恢复、导出与丢弃、ADV 第二步
// 从 generation/client.js 原样搬出（重构阶段 2），声明文本一字未改；generation/client.js 仍转发原有导出。

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
    let contentSnapshot = generation_recovery.readGenerationContentSnapshot(existing)
        || (!existing ? fitGenerationContentSnapshot(snapshotGenerationContent({ ...(partialSeed?.snapshot || captureGenerationContent(context, bank)),
            ...(options.contentInputs ? { contentInputs: { ...(partialSeed?.snapshot?.contentInputs || {}), ...options.contentInputs } } : {}) })) : null);
    const sourceValues = JSON.stringify(recovery_source.recoverySourceValues(context));
    await recovery_source.assertRecoverySourcePolicy(existing, context, origin);
    if (!contentSnapshot && await recovery_source.hasLegacyConfigurationRestartApproval(existing, context)) {
        contentSnapshot = fitGenerationContentSnapshot(snapshotGenerationContent({ ...captureGenerationContent(context, bank),
            ...(options.contentInputs ? { contentInputs: options.contentInputs } : {}) }));
    }
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
        confirmLegacyRestart: async ({ reason } = {}) => reason === 'configuration'
            ? recovery_source.consumeLegacyConfigurationRestart(existing, context)
            : ui_overlay.confirmExplicitAction('保留旧失败记录，按当前背景重新尝试？',
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
    if (options.logicalTask) core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
    handle.contentContext = generationContentContext(origin, context);
    handle.contentBank = contentSnapshot?.memoryBank ? structuredClone(contentSnapshot.memoryBank) : bank;
    handle.contentSettings = contentSnapshot?.contentSettings ? structuredClone(contentSnapshot.contentSettings) : null;
    handle.contentInputs = contentSnapshot?.contentInputs ? structuredClone(contentSnapshot.contentInputs) : null;
    if (!existing || contentSnapshot?.memoryBank) await generation_recovery.persistGenerationRecovery(handle);
    await generation_recovery.publishGenerationRecoveryProgress(handle);
    return handle;
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
        { ...(options.draftId ? { draftId: options.draftId, intent: 'inspect' } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
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
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.backupOnly) return;
    const opts = snapshot ? archive_library.archiveTargetGenerationOptions(snapshot) : {};
    const context = opts.context || core_context.currentCharacterGuard();
    const bank = archive_repository.requireArchive(context);
    const retained = core_cache.loadGenerationRecovery(mode, context, opts.archiveTarget?.cache,
        { ...(options.draftId ? { draftId: options.draftId, intent: 'inspect' } : {}), ...(options.pageId ? { pageId: options.pageId } : {}) });
    if (!retained) throw core_text.safeUserError('这份草稿已不在当前档案，请重新打开任务列表查看。', 'RMT_RECOVERY_NOT_FOUND');
    if (!ui_overlay.confirmExplicitAction('放弃这轮未提交草稿？', '如这项任务还在生成，将先停止它。仅清除此轮分段恢复记录，不删除已保存的模块、正式记忆或图片。未提交的成功分段也会放弃，不能恢复；不会自动重新生成。终端原有的逐 App 草稿另行保留。', { destructive: true })) return;
    const origin = { ...core_context.captureTaskOrigin(context, bank.archiveRevision), archiveTargetEntryId: opts.archiveTarget?.entryId || '' };
    const owners = core_requestCoordinator.queryParticipantGenerationTasks(context, { stableIdentity: true }).filter(task =>
        task.mode === mode && (task.pageId === retained.pageId || task.pageIds.includes(retained.pageId))
        && (task.draftId || task.origin?.generationRecoveryDraftId) === retained.draftId
        && (task.origin?.archiveTargetEntryId || '') === origin.archiveTargetEntryId);
    await core_requestCoordinator.cancelParticipantGenerationTasks(owners.map(task => task.id));
    if (!core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)
        || (snapshot ? runtimeState.activeArchiveSnapshot !== snapshot : !core_context.isCurrentTaskOrigin(origin))) {
        throw new DOMException('Recovery discard scope changed', 'AbortError');
    }
    origin.generationRecoveryDraftId = retained.draftId;
    const saved = await core_cache.saveGenerationRecovery(context, bank, mode, null, origin, { ...opts, draftId: retained.draftId, discardDraft: true });
    if (!saved) throw core_text.safeUserError('草稿删除尚未保存成功，原记录仍保留，请重试。', 'RMT_RECOVERY_DISCARD_STORAGE');
    generation_recovery.discardGenerationRecoveryHeldReplies(retained.identity, retained.identity?.mode || mode);
    if (core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)
        && (snapshot ? runtimeState.activeArchiveSnapshot === snapshot : core_context.isCurrentTaskOrigin(origin))) {
        if (snapshot) await ui_overlay.refreshArchiveTargetSnapshotView(snapshot.entryId);
        else ui_overlay.showChooser();
    }
    globalThis.toastr?.success?.('这份未提交草稿已放弃，已保存内容仍保留。', '心迹回廊');
    return true;
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
