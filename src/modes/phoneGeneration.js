import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_client from '../generation/client.js';
import { isPhonePlaceholderTitle, isUnavailablePhoneEntry, phoneRecoveryContract, phoneStory, unavailablePhoneEntry } from './phoneBasics.js';
import { noPhoneConversation } from './phoneEvidence.js';
import { phoneAppPrompt, phoneIncrementPlanPrompt, phoneMissingThreadPlan, phonePlanPrompt } from './phonePrompts.js';
import { mergePhoneMissingEntries, normalizePhone, normalizePhoneDraftApp, normalizePhonePlan, phoneCompletionSummary } from './phoneData.js';
import { mergePhoneIncremental, normalizePhoneIncrementPlan } from './phoneIncrement.js';
// 私人终端生成入口：整体生成、补缺生成、增量生成（含修复）
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export async function generatePhoneWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const roomSession = core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: core_context.getChatId(context), memoryBank, clone: false });
    const resumeDraft = options.continueDraft === true ? core_cache.loadPhoneGenerationDraft(context, memoryBank) : null;
    if (resumeDraft?.unreadableCompletedApps?.length) throw core_text.safeUserError('已完成草稿的结构无法安全读取，原草稿保留，本次没有重新生成成功项。', 'RMT_PHONE_SOURCE_CHANGED');
    const presentationContext = options.presentationContext || {};
    const worldPresentation = resumeDraft?.plan?.worldPresentation || presentationContext.profile
        || core_worldPresentation.resolveWorldPresentation(presentationContext.contextEnvelope || '', memoryBank);
    const plan = resumeDraft?.plan || await generation_client.requestValidatedSegment(
        phonePlanPrompt(context, memoryBank, roomSession, worldPresentation),
        '私人终端 1/2 · 正在生成设备与 App 目录…',
        { maxTokens: 8000, temperatureCeiling: 0.35, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:plan`, mode: core_constants.MODE.PHONE, background: true },
        raw => normalizePhonePlan(raw, memoryBank, { worldPresentation, controlledEvidence: presentationContext.settingEvidence || '' }),
    );
    const completedById = new Map((resumeDraft?.completedApps || []).map(app => [app.id, app]));
    // Capture trusted old values from canonical storage, never from a provider's app IDs.
    const preservedApps = new Map((resumeDraft?.completedApps || [])
        .filter(app => app.entries.some(entry => entry.legacyEvidenceUnverified === true))
        .map(app => [app.id, structuredClone(app)]));
    const draftOptions = { archiveTarget: options.archiveTarget, stillCurrent: options.stillCurrent };
    const evidenceOptions = { controlledEvidence: presentationContext.settingEvidence || '', requireLifestyleContent: true, allowPartial: true };
    if (!resumeDraft && !await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [], '', '', origin, draftOptions)) {
        throw new Error('私人终端目录已经生成，但无法确认续写断点已安全保存；本次已停止，避免虚假提示可续写。');
    }
    const fillAppsNow = options.secondStep === true || !!resumeDraft || core_settings.getPluginSettings().autoSecondPass === true;
    if (!fillAppsNow) {
        const placeholders = plan.apps.map(app => ({
            ...app,
            entries: (Array.isArray(app.entries) ? app.entries : []).map(entry => unavailablePhoneEntry(entry.id)),
        }));
        const directory = normalizePhone({ ...plan, apps: placeholders }, memoryBank, { worldPresentation, trustedStored: true, directoryOnly: true });
        core_requestCoordinator.noteSecondStepOffer(origin, {
            label: '各应用正文', kind: 'phone-apps', mode: core_constants.MODE.PHONE, pageId: core_constants.MODE.PHONE,
        });
        return directory;
    }
    core_requestCoordinator.noteSecondStepOffer(origin, null);

    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        const completed = completedById.get(app.id);
        const missing = completed ? app.entries.filter(entry => !completed.omittedEntryIds?.includes(entry.id)
            && !completed.entries.some(item => item.id === entry.id && !isUnavailablePhoneEntry(item))) : app.entries;
        if (!missing.length) continue;
        const requestApp = app.kind === 'chat'
            ? phoneMissingThreadPlan({ ...app, entries: missing.map(entry => ({ ...entry, sourceStatus: 'unavailable' })) }, plan, memoryBank,
                { controlledEvidence: presentationContext.settingEvidence || '' })
            : { ...app, incremental: !!completed?.entries?.some(entry => !isUnavailablePhoneEntry(entry)), entries: missing };
        let lastError = null;
        try {
            if (!requestApp.entries.length) throw noPhoneConversation();
            // Keep the base request stable across reload/continuation. Transient failure
            // feedback belongs to the bounded retry, not to the saved segment identity.
            const normalizedApp = await generation_client.requestValidatedSegment(
                phoneAppPrompt(context, memoryBank, plan, requestApp)
                    + '\n需要真实历史/私密字段却没有来源的项目才用 unavailable；普通日常继续按人设演绎，不重做已完成的其他 App。',
                `私人终端 2/2 · ${index + 1}/${plan.apps.length} ${app.label}…`,
                { maxTokens: app.kind === 'chat' ? 8000 : app.entries.length >= 8 ? 7000 : 5000, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:app:${app.id}:${core_text.hashString(missing.map(entry => entry.id).join('\n'))}`, mode: core_constants.MODE.PHONE, background: true, segmentMaxAttempts: 2,
                    recoveryPhoneContract: phoneRecoveryContract(app.kind) },
                raw => {
                    try { return normalizePhoneDraftApp(raw, requestApp, memoryBank, plan.deviceKind, null, evidenceOptions); }
                    catch (error) {
                        error.repairHint = `本次只修正以下安全分类：${core_text.safeErrorSummary(error)}。需要真实历史/私密字段却没有来源的项目才用 unavailable；普通日常继续按人设演绎。`;
                        throw error;
                    }
                },
            );
            if (app.kind === 'chat') normalizedApp.omittedEntryIds = [...new Set([...(normalizedApp.omittedEntryIds || []), ...(requestApp.omittedEntryIds || [])])];
            completedById.set(app.id, completed ? mergePhoneMissingEntries(completed, normalizedApp) : normalizedApp);
            if (preservedApps.has(app.id)) preservedApps.set(app.id, structuredClone(completedById.get(app.id)));
            if (!await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()], '', '', origin, draftOptions)) {
                throw new Error('这个 App 已生成，但无法确认续写断点已安全保存；本次已停止。');
            }
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
            lastError = error;
        }
        if (lastError) {
            const detail = core_text.safeErrorSummary(lastError, 600);
            const failure = core_text.safeErrorDiagnostic(lastError);
            const draftSaved = await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [...completedById.values()], app.id, detail, origin, { ...draftOptions, failure });
            if (draftSaved && ['RMT_PHONE_EVIDENCE', 'RMT_PHONE_NO_CONVERSATION'].includes(lastError?.code)) {
                // A complete but unusable App response is a local content failure, not
                // a broken provider connection. Keep its exact slots pending and let
                // other independent Apps produce useful content. Transport, truncated
                // JSON, cancellation, stale origins and storage failures still stop.
                if (!completed) completedById.set(app.id, { ...app,
                    entries: app.entries.map(entry => unavailablePhoneEntry(entry.id)) });
                if (!await core_cache.savePhoneGenerationDraft(context, memoryBank, plan,
                    [...completedById.values()], app.id, detail, origin, { ...draftOptions, failure })) {
                    throw core_text.safeUserError('无法确认已完成内容已保存，本次已停止。', 'RMT_PHONE_DRAFT_UNAVAILABLE');
                }
                continue;
            }
            const error = new Error(draftSaved
                ? `私人终端在 App“${app.label}”中断，已保留 ${phoneCompletionSummary({ plan, completedApps: [...completedById.values()] }).readableItems} 项可读内容。回到档案室的私人终端卡片，点击“继续生成”即可补齐缺项，不会重做成功内容。${detail ? `\n${detail}` : ''}`
                : `私人终端在 App“${app.label}”中断，且无法确认续写断点已安全保存；请不要依赖本次进度。${detail ? `\n${detail}` : ''}`);
            error.code = draftSaved ? 'RMT_PHONE_DRAFT_AVAILABLE' : 'RMT_PHONE_DRAFT_UNAVAILABLE';
            error.retryable = false;
            error.failure = failure;
            const progress = phoneCompletionSummary({ plan, completedApps: [...completedById.values()] });
            error.partialProgress = { completed: progress.completeApps, total: progress.totalApps,
                readableItems: progress.readableItems, totalItems: progress.totalItems };
            throw error;
        }
    }
    const details = plan.apps.map(app => completedById.get(app.id)).filter(Boolean);
    if (details.length !== plan.apps.length) {
        throw new Error(`私人终端续写结果不完整：${details.length}/${plan.apps.length} 个 App。`);
    }
    try {
        let normalized;
        try { normalized = normalizePhone({ ...plan, apps: details }, memoryBank, { worldPresentation, ...evidenceOptions, preservedApps }); }
        catch (error) {
            if (error?.code === 'RMT_PHONE_SOURCE_EMPTY') throw error;
            throw core_text.safeUserError('草稿来源发生变化。', 'RMT_PHONE_SOURCE_CHANGED');
        }
        if (details.some(app => {
            const retained = normalized.apps.find(candidate => candidate.id === app.id);
            return !retained || app.entries.some(entry => !retained.entries.some(candidate => candidate.id === entry.id));
        })) throw core_text.safeUserError('草稿来源发生变化。', 'RMT_PHONE_SOURCE_CHANGED');
        return normalized;
    } catch (error) {
        if (error?.code === 'RMT_PHONE_SOURCE_EMPTY') {
            // Empty directory placeholders are not completed content. An explicit
            // retry must reach the provider, not loop forever over an N/N draft.
            await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, [], '', '', origin,
                { ...draftOptions, failure: core_text.safeErrorDiagnostic(error) });
        } else if (error?.code === 'RMT_PHONE_SOURCE_CHANGED') {
            await core_cache.savePhoneGenerationDraft(context, memoryBank, plan, details, '', '', origin,
                { ...draftOptions, failure: core_text.safeErrorDiagnostic(error) });
        }
        throw error;
    }
}

export async function generatePhoneMissingWithRepair(context, memoryBank, origin, taskKey, previous, options = {}) {
    let session = structuredClone(previous);
    const presentation = options.presentationContext || {};
    let acceptedAny = false, contentFailure = null;
    for (const app of previous.apps || []) {
        const entries = (app.entries || []).filter(isUnavailablePhoneEntry);
        if (!entries.length) continue;
        const planApp = app.kind === 'chat'
            ? phoneMissingThreadPlan(app, previous, memoryBank, { controlledEvidence: presentation.settingEvidence || '', context })
            : { ...app, incremental: true, entries: entries.map(item => ({
                id: item.id,
                title: isPhonePlaceholderTitle(item.title)
                    ? `${phoneStory(memoryBank, context).ownerNames[0] || '主人'}的${app.label}`
                    : item.title,
                meta: item.meta || '日常',
            })) };
        if (!planApp.entries.length) { contentFailure = noPhoneConversation(); continue; }
        let fresh;
        try { fresh = await generation_client.requestValidatedSegment(
            phoneAppPrompt(context, memoryBank, session, planApp),
            `正在补齐「${app.label}」的 ${planApp.entries.length} 项内容…`,
            { context, contextEnvelope: presentation.contextEnvelope, origin, taskKey: `${taskKey}:missing:${app.id}:${core_text.hashString(planApp.entries.map(entry => `${entry.id}\t${entry.title}\t${entry.contactName || ''}`).join('\n'))}`,
                mode: core_constants.MODE.PHONE, maxTokens: 8000, background: true,
                recoveryPhoneContract: phoneRecoveryContract(app.kind) },
            raw => normalizePhoneDraftApp(raw, planApp, memoryBank, session.deviceKind, null,
                { controlledEvidence: presentation.settingEvidence || '', requireLifestyleContent: true, allowPartial: true }),
        ); } catch (error) {
            if (!['RMT_PHONE_EVIDENCE', 'RMT_PHONE_NO_CONVERSATION'].includes(error?.code)) throw error;
            contentFailure = error;
            continue;
        }
        if (app.kind === 'chat') fresh.omittedEntryIds = [...new Set([...(fresh.omittedEntryIds || []), ...(planApp.omittedEntryIds || [])])];
        session.apps = session.apps.map(item => item.id === app.id ? mergePhoneMissingEntries(item, fresh) : item);
        if (options.savePartial && await options.savePartial(session) === false) {
            throw core_text.safeUserError('无法确认补齐内容已保存，本次已停止。', 'RMT_PHONE_DRAFT_UNAVAILABLE');
        }
        acceptedAny = true;
    }
    if (!acceptedAny && contentFailure) throw contentFailure;
    return session;
}

export async function generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previous, options = {}) {
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const presentationContext = options.presentationContext || {};
    const plan = await generation_client.requestValidatedSegment(
        phoneIncrementPlanPrompt(context, memoryBank, previous, sourceMemoryIds),
        '私人终端 · 正在规划新增条目…',
        { maxTokens: 4500, temperatureCeiling: 0.35, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:increment-plan`, mode: core_constants.MODE.PHONE, background: true },
        raw => normalizePhoneIncrementPlan(raw, previous),
    );
    if (!plan.apps.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const patches = [];
    for (let index = 0; index < plan.apps.length; index += 1) {
        const app = plan.apps[index];
        const patch = await generation_client.requestValidatedSegment(
            phoneAppPrompt(context, memoryBank, plan, app, sourceMemoryIds),
            `私人终端 · 新增详情 ${index + 1}/${plan.apps.length} ${app.label}…`,
            { maxTokens: app.kind === 'chat' ? 8000 : 5000, context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:increment-app:${app.id}`, mode: core_constants.MODE.PHONE, background: true, segmentMaxAttempts: 1,
                recoveryPhoneContract: phoneRecoveryContract(app.kind) },
            raw => normalizePhoneDraftApp(raw, app, memoryBank, plan.deviceKind, sourceMemoryIds, {
                controlledEvidence: presentationContext.settingEvidence || '',
                allowPartial: true,
            }),
        );
        patches.push(patch);
    }
    const { session, added } = mergePhoneIncremental(previous, patches, memoryBank, {
        controlledEvidence: presentationContext.settingEvidence || '',
    });
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}
