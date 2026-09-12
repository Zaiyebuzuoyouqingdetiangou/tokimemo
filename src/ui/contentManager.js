// Heartbeat Memories content management UI.
// This module only renders allowlisted management targets from the already-normalized session.
import * as core_constants from '../core/constants.js';
import * as core_cache from '../core/cache.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_calendar from '../modes/calendar.js';
import * as ui_overlay from './overlay.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as content_regeneration from '../generation/contentRegeneration.js';

const MANAGEABLE_TARGET_TYPES = new Set([
    'album-entry', 'album-image',
    'adv-event', 'adv-text', 'adv-image',
    'room-life',
    'phone-app', 'phone-entry',
    'ending-route', 'ending-confession',
    'heart-voice', 'heart-scenario', 'heart-strip', 'heart-strip-image', 'heart-firefly',
    'achievement', 'calendar-entry', 'calendar-note', 'calendar-mood', 'butterfly-node',
]);

export function isManageableTargetType(value) {
    return MANAGEABLE_TARGET_TYPES.has(core_text.normalizeText(value, 60));
}

function target(type, id, label, detail = '', parentId = '', options = {}) {
    return {
        type,
        id: core_text.normalizeText(id, 120),
        parentId: core_text.normalizeText(parentId, 160),
        label: core_text.normalizeText(label, 180),
        detail: core_text.normalizeText(detail, 500),
        canDelete: options.canDelete !== false,
        canRegenerate: options.canRegenerate !== false,
    };
}

function calendarPageLabel(page, key) {
    if (key === modes_calendar.CALENDAR_LEGACY_PAGE_KEY) return '旧版未归日期';
    if (page?.kind === 'pending') return '日期待定';
    if (page?.kind === 'annual') return `${page.date || key.slice(7)} · 每年`;
    return page?.date || key.replace(/^date:/, '') || '未知日期';
}

function calendarManagementTargets(session) {
    const targets = (session.entries || []).map(item => {
        const pageKey = modes_calendar.calendarEntryPageKey(item);
        return target('calendar-entry', item.id, `日期 · ${item.title}`, `${item.date || '待定'} · ${item.status || ''}`, pageKey);
    });
    for (const [pageKey, page] of Object.entries(session.dayPages && typeof session.dayPages === 'object' ? session.dayPages : {})) {
        const safePage = modes_calendar.calendarDayPage(session, pageKey);
        if (!safePage) continue;
        const label = calendarPageLabel(safePage, pageKey);
        for (const item of safePage.stickyNotes || []) {
            targets.push(target('calendar-note', item.id, `${item.kind === 'special' ? '特别备注' : '便签'} · ${item.title || item.id}`, `${label} · ${item.text || ''}`, pageKey));
        }
        for (const item of safePage.moodNotes || []) {
            targets.push(target('calendar-mood', item.id, `页角随笔 · ${label}`, item.text || '', pageKey));
        }
    }
    return targets;
}

export function managementTargetsForSession(session) {
    if (!session || typeof session !== 'object') return [];
    const mode = session.kind;
    if (mode === core_constants.MODE.ALBUM) {
        return (session.entries || []).flatMap(item => [
            target('album-entry', item.id, item.title, `${item.date || ''} · ${item.category || ''}`),
            ...(item.cgImage ? [target('album-image', item.id, `${item.title} · CG 图片`, '只处理这张实图，不删除相簿条目。')] : []),
        ]);
    }
    if (mode === core_constants.MODE.ADV) {
        return (session.events || []).flatMap(item => [
            target('adv-event', item.id, item.title, `${item.date || ''} · 事件卡 / CG 提示`),
            ...(item.adv ? [target('adv-text', item.id, `${item.title} · ADV 正文`, '只处理长篇 ADV 正文，事件卡和 CG 保留。')] : []),
            ...(item.cgImage ? [target('adv-image', item.id, `${item.title} · CG 图片`, '只处理这张实图，事件卡和 ADV 正文保留。')] : []),
        ]);
    }
    if (mode === core_constants.MODE.ROOM) {
        return session.lifePlan ? [target('room-life', 'today', '今日生活', '只处理今天的生活状态；房间主体不变。')] : [];
    }
    if (mode === core_constants.MODE.PHONE) {
        return (session.apps || []).flatMap(app => [
            target('phone-app', app.id, `App · ${app.label}`, `${app.kind || ''} · ${(app.entries || []).length} 条`),
            ...(app.entries || []).map(entry => target('phone-entry', entry.id, `↳ ${entry.title}`, entry.meta || entry.preview || '', app.id)),
        ]);
    }
    if (mode === core_constants.MODE.ENDING) {
        return [
            ...(session.endings || []).map(item => target('ending-route', item.id, `路线 · ${item.title}`, item.available ? '已解锁路线' : '未解锁路线')),
            ...(session.confessionReplays || []).map(item => target('ending-confession', item.id, `告白回看 · ${item.title || item.id}`, item.date || item.type || '')),
        ];
    }
    if (mode === core_constants.MODE.HEART) {
        return [
            ...(session.voiceDramas || []).map(item => target('heart-voice', item.id, `Voice Drama · ${item.title}`, item.kind || '')),
            ...(session.scenarioDramas || []).map(item => target('heart-scenario', item.id, `Scenario Drama · ${item.title}`, item.season || '')),
            ...(session.fireflyVoices || []).map(item => target('heart-firefly', item.id, `萤火虫心声 · ${item.title || item.line}`, item.color || '')),
            ...(session.dailyStrips || []).flatMap(item => [
                target('heart-strip', item.id, `日常一格 · ${item.title}`, item.subtitle || ''),
                ...(item.cgImage ? [target('heart-strip-image', item.id, `${item.title} · 小剧场图片`, '只处理这张实图，文字小剧场保留。')] : []),
            ]),
        ];
    }
    if (mode === core_constants.MODE.ACHIEVEMENTS) {
        return (session.entries || []).map(item => target('achievement', item.id, item.title, item.unlocked ? '已解锁' : '未解锁'));
    }
    if (mode === core_constants.MODE.CALENDAR) {
        return calendarManagementTargets(session);
    }
    if (mode === core_constants.MODE.BUTTERFLY) {
        const nodes = Array.isArray(session.nodes) ? session.nodes : [];
        return nodes.slice(1).map((item, index) => target(
            'butterfly-node', item.id,
            item.trueEnding ? `观测点 Ω · ${item.label}` : `平行分歧 ${index + 1} · ${item.label}`,
            item.trueEnding ? '终局观测点只能重新生成，不能单独删除。' : '单个平行分歧。',
            '',
            { canDelete: !item.trueEnding, canRegenerate: true },
        ));
    }
    return [];
}

export async function runContentRegeneration(type, id, parentId = '', options = {}) {
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const mode = options.mode || runtimeState.activeMode;
    let origin = null;
    let targetRuntime = null;
    let taskKey = '';
    let modeKey = '';
    let reserved = false;
    try {
        if (!Object.values(core_constants.MODE).includes(mode) || !isManageableTargetType(type)
            || ['album-image', 'adv-image', 'heart-strip-image', 'room-life'].includes(type)) throw new Error('这项应使用原有的图片或今日生活入口。');
        if (runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly) throw new Error('当前档案只读，不能重新生成单项内容。');
        targetRuntime = await archive_library.prepareArchiveTargetSubtask(mode, `content:${type}:${parentId}:${id}`);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        const context = targetRuntime?.context || core_context.currentCharacterGuard();
        const memoryBank = targetRuntime?.memoryBank || archive_repository.requireArchive(context);
        const chatId = core_context.getChatId(context);
        if (!targetRuntime) await core_cache.ensureCacheHydrated(context);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        const readBase = () => core_cache.loadSession(mode, { context, memoryBank, chatId,
            cache: targetRuntime?.archiveTarget?.cache, clone: true });
        let base = readBase();
        if (!base) throw new Error('原分类缓存已不存在；没有生成或重建整个分类。');
        const choices = managementTargetsForSession(base).filter(item => item.type === type && item.id === id && item.parentId === parentId && item.canRegenerate);
        if (choices.length !== 1) throw new Error('原单项内容已不存在或身份不唯一。');
        const record = choices[0];
        const selected = content_regeneration.contentRegenerationTarget(base, type, id, parentId);
        const itemHash = await generation_recovery.generationRecoveryDigest(selected.item);
        const safeTarget = { ...selected.target, itemHash };
        const existing = options.existing === undefined
            ? core_cache.loadGenerationRecovery(mode, context, targetRuntime?.archiveTarget?.cache) : options.existing;
        if (existing?.operation && await generation_recovery.generationRecoveryDigest(existing.operation)
            !== await generation_recovery.generationRecoveryDigest({ kind: 'content-item', target: safeTarget })) {
            throw core_text.safeUserError('原单项内容已变化，或当前保存的是另一项任务的草稿；没有覆盖内容，也没有发送新请求。', 'RMT_RECOVERY_TARGET_CHANGED');
        }
        if (!options.confirmed && !ui_overlay.confirmExplicitActionTwice(`重新生成「${record.label}」？`,
            '只有本项通过校验并成功保存后才替换旧内容；截断会保留草稿及成功分段。其他条目和正式档案 Mxxx 不会被改写。', { destructive: true })) return null;
        const archiveEntry = targetRuntime?.archiveTarget || core_cache.archiveBackupEntryForContext(context, memoryBank);
        taskKey = `manage:${archiveEntry.entryId}:${type}:${parentId}:${id}`;
        modeKey = core_requestCoordinator.generationTaskKeyForMode(mode, context);
        if (core_requestCoordinator.isModeGenerating(mode, context) || runtimeState.activeModeBuildScopes.has(taskKey)
            || !core_requestCoordinator.canStartGenerationTask(taskKey)) throw new Error('本分类已有生成任务，请等它结束再操作。');
        runtimeState.activeModeBuildScopes.add(taskKey);
        runtimeState.activeModeBuildScopes.add(modeKey);
        core_requestCoordinator.registerArchiveTargetReservation(taskKey, targetRuntime, mode, `单项重新生成：${record.label}`);
        reserved = true;
        if (targetRuntime) {
            await archive_library.beginArchiveTargetSubtask(targetRuntime);
            origin = targetRuntime.origin;
        } else {
            await core_cache.claimLiveModeGeneration(mode, context, memoryBank);
            origin = core_context.captureTaskOrigin(context, memoryBank.archiveRevision);
        }
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        base = readBase();
        const current = content_regeneration.contentRegenerationTarget(base, type, id, parentId);
        if (await generation_recovery.generationRecoveryDigest(current.item) !== itemHash) throw core_text.safeUserError('原单项内容已被更新，没有覆盖较新内容。', 'RMT_RECOVERY_TARGET_CHANGED');
        const expectedItemJson = JSON.stringify(current.item);
        const recoveryOptions = { ...options, existing, operation: { kind: 'content-item', target: safeTarget },
            archiveTarget: targetRuntime?.archiveTarget, archiveEntry, stillCurrent: targetRuntime?.stillCurrent };
        await generation_client.beginModeRecovery(mode, context, memoryBank, origin, recoveryOptions);
        ui_overlay.setInnerLoading(true, `正在重新生成「${record.label}」…`);
        const updated = await content_regeneration.regenerateManagedTarget(base, type, id, parentId, { context, memoryBank, origin, taskKey });
        const merge = (latest, liveMemory = memoryBank) => {
            const normalizedLatest = core_cache.loadSession(mode, { memoryBank: liveMemory, chatId, clone: true,
                cache: { chatId, archiveRevision: liveMemory.archiveRevision, [mode]: latest } });
            if (!normalizedLatest) throw new Error('原分类已不存在或不能读取，旧结果没有重建它。');
            return content_regeneration.mergeRegeneratedContentTarget(normalizedLatest, updated, safeTarget, expectedItemJson);
        };
        let committed;
        if (targetRuntime) {
            const result = await targetRuntime.options.commitArchiveTargetMutation(targetRuntime.archiveTarget, mode, origin, merge, base, targetRuntime.stillCurrent);
            archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
            committed = result.session;
        } else committed = await core_cache.commitSessionMutation(mode, chatId, origin, merge, base);
        if (!committed) throw core_text.safeUserError('结果已保存在续写草稿中；原窗口当前不可写，回到原档案继续即可，不会重做成功分段。', 'RMT_RECOVERY_COMMIT_PENDING');
        await core_cache.saveGenerationRecovery(context, memoryBank, mode, null, origin, {
            archiveTarget: targetRuntime?.archiveTarget, archiveEntry, stillCurrent: targetRuntime?.stillCurrent,
        });
        const visible = targetRuntime ? runtimeState.activeArchiveSnapshot?.entryId === targetRuntime.archiveTarget.entryId : core_context.isCurrentTaskOrigin(origin);
        if (visible && runtimeState.activeMode === mode) {
            runtimeState.activeSession = committed;
            if (ui_overlay.bodyEl()) renderContentManager();
        }
        globalThis.toastr?.success?.(`已重新生成：${record.label}`, '心跳回忆');
        return committed;
    } catch (error) {
        if (origin) await generation_recovery.noteGenerationRecoveryFailure(origin, error);
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心跳回忆');
        return null;
    } finally {
        if (origin) generation_recovery.detachGenerationRecovery(origin);
        if (reserved) {
            runtimeState.activeModeBuildScopes.delete(taskKey);
            runtimeState.activeModeBuildScopes.delete(modeKey);
            core_requestCoordinator.unregisterArchiveTargetReservation(taskKey);
        }
        if (core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)) ui_overlay.setInnerLoading(false);
    }
}

export async function resumeContentRegeneration(options = {}) {
    const existing = options.existing;
    if (!generation_recovery.generationRecoverySummary(existing) || existing.operation?.kind !== 'content-item') {
        throw new Error('没有有效的单项续写草稿；不会转为整个分类重新生成。');
    }
    const selected = existing.operation.target;
    if (!selected || typeof selected.itemHash !== 'string' || !/^[a-f0-9]{64}$/.test(selected.itemHash)) throw new Error('原单项目标身份不完整。');
    return runContentRegeneration(selected.type, selected.id, selected.parentId, {
        ...options, mode: existing.identity.mode, continueRecovery: true, confirmed: true,
    });
}

function actionButton(action, item, label, danger = false) {
    if (action === 'manage-delete-target' && !item.canDelete) return '';
    if (action === 'manage-regenerate-target' && !item.canRegenerate) return '';
    return `<button type="button" class="rmt-btn ${danger ? 'rmt-manage-danger' : ''}" data-rmt-action="${action}" data-rmt-manage-type="${core_text.esc(item.type)}" data-rmt-manage-id="${core_text.esc(item.id)}" data-rmt-manage-parent="${core_text.esc(item.parentId)}">${core_text.esc(label)}</button>`;
}

export function renderContentManager() {
    const session = runtimeState.activeSession;
    const mode = runtimeState.activeMode;
    if (!session || !mode || session.kind !== mode || mode === core_constants.MODE.INBOX) return ui_overlay.renderActive();
    runtimeState.contentManagerOpen = true;
    ui_overlay.topTitle(`${core_constants.MODE_LABEL[mode] || mode} · 管理`);
    ui_overlay.setBackVisible(true, '返回内容');
    ui_overlay.setRegenerateVisible(false);
    ui_overlay.setManageVisible(false);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    const targets = managementTargetsForSession(session);
    const rows = targets.map(item => `<article class="rmt-manage-row">
      <div class="rmt-manage-copy"><b>${core_text.esc(item.label)}</b>${item.detail ? `<small>${core_text.esc(item.detail)}</small>` : ''}</div>
      <div class="rmt-manage-actions">${actionButton('manage-regenerate-target', item, '重新生成')}${actionButton('manage-delete-target', item, '删除', true)}</div>
    </article>`).join('');
    const dependentNote = mode === core_constants.MODE.ROOM
        ? '<p class="rmt-manage-note">重新生成或删除整个“他的房间”会同时清除依赖旧房间结构的“他的物品”和“私人终端”派生缓存；正式档案不会动。</p>'
        : '';
    body.innerHTML = `<div class="rmt-manage-shell">
      <section class="rmt-manage-hero">
        <div><div class="rmt-archive-kicker">CONTENT CONTROL</div><h2>${core_text.esc(core_constants.MODE_LABEL[mode] || mode)}</h2><p>删除和重新生成都只处理心跳回忆的派生内容。每一次操作都必须连续确认两次；正式聊天档案 Mxxx 不会被这里的按钮删除。</p>${dependentNote}</div>
        <div class="rmt-manage-category-actions">
          <button type="button" class="rmt-btn" data-rmt-action="manage-regenerate-category">重新生成整个分类</button>
          <button type="button" class="rmt-btn rmt-manage-danger" data-rmt-action="manage-delete-category">删除整个分类</button>
        </div>
      </section>
      <section class="rmt-manage-list">${rows || '<div class="rmt-manage-empty">这个分类暂时没有可单独管理的子项。仍可在上方删除或重新生成整个分类。</div>'}</section>
    </div>`;
}
