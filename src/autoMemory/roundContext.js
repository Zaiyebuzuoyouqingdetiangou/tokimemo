// 一整轮共用同一个来源和取消句柄；步骤之间没有 provider 请求时也不能重绑到另一段聊天。
import * as archive_repository from '../archive/repository.js';
import * as core_context from '../core/context.js';
import * as core_tasks from '../core/requestCoordinator.js';
import * as auto_memory_plan from './planStore.js';

const rounds = new Set();

function revision(context) {
    return archive_repository.getImportedMemory(context)?.archiveRevision || '';
}

function abort(round) {
    const error = core_tasks.createGenerationAbortError('自动留忆的聊天、档案或计划已改变，这一轮已停止。');
    round.task.controller.abort(error);
    throw error;
}

export function autoMemoryOriginCurrent(context, origin) {
    try {
        const live = core_context.currentCharacterGuard();
        return !!context && core_context.isCurrentTaskRunOrigin(origin, live)
            && live.chatMetadata === context.chatMetadata
            && !core_tasks.chatScopeCancellationBlocksOrigin(origin);
    } catch { return false; }
}

export function assertAutoMemoryRound(round, { allowArchiveChange = false } = {}) {
    if (!round) throw core_tasks.createGenerationAbortError();
    core_tasks.assertLogicalGenerationTaskCurrent(round.task);
    let live;
    try { live = core_context.currentCharacterGuard(); }
    catch { abort(round); }
    const plan = round.context.chatMetadata?.[auto_memory_plan.AUTO_MEMORY_PLAN_KEY];
    if (!core_context.isCurrentTaskRunOrigin(round.origin, live)
        || live.chatMetadata !== round.context.chatMetadata
        || !plan?.enabled || plan.revision !== round.planRevision
        || core_tasks.chatScopeCancellationBlocksOrigin(round.origin)
        || (!allowArchiveChange && revision(live) !== round.archiveRevision)) abort(round);
    return round.context;
}

export function notePlanCommit(round, next) {
    round.planRevision = next.plan.revision;
    assertAutoMemoryRound(round);
}

export function generationOptions(round) {
    return { context: assertAutoMemoryRound(round), origin: round.origin,
        signal: round.task.signal, logicalParentTaskId: round.task.id };
}

// 只有本轮导入明确提交的版本能推进栅栏；被取消、延迟或并发覆盖的导入都不能续写。
export function acceptArchiveCommit(round, result) {
    assertAutoMemoryRound(round, { allowArchiveChange: true });
    if (result?.status === 'noop') return assertAutoMemoryRound(round);
    if (result?.status !== 'committed' || !result.archiveRevision
        || revision(round.context) !== result.archiveRevision) abort(round);
    round.archiveRevision = result.archiveRevision;
    round.origin = { ...round.origin, archiveRevision: round.archiveRevision, archivePresent: true };
    core_tasks.bindLogicalGenerationTask(round.task, round.origin);
    return assertAutoMemoryRound(round);
}

export async function withAutoMemoryRound(context, run, existing = null) {
    if (existing) {
        assertAutoMemoryRound(existing);
        const result = await run(existing);
        assertAutoMemoryRound(existing);
        return result;
    }
    const archiveRevision = revision(context);
    const origin = core_context.captureTaskOrigin(context, archiveRevision);
    const planRevision = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata)?.plan?.revision;
    const task = core_tasks.beginLogicalGenerationTask({ kind: 'auto-memory', mode: 'auto-memory',
        label: '自动留忆', taskKey: `auto-memory-round:${core_context.chatScopeKey(context)}`, context, origin });
    const round = { context, origin, task, archiveRevision, planRevision };
    rounds.add(round);
    const unsubscribe = auto_memory_plan.onAutoMemoryDisabled(metadata => {
        if (metadata === context.chatMetadata) task.controller.abort(core_tasks.createGenerationAbortError());
    });
    let outcome;
    try {
        assertAutoMemoryRound(round);
        const result = await run(round);
        assertAutoMemoryRound(round);
        outcome = { status: result?.action === 'failed' ? 'failed' : 'done' };
        return result;
    } catch (error) {
        outcome = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        throw error;
    } finally {
        unsubscribe();
        rounds.delete(round);
        core_tasks.finishLogicalGenerationTask(task, outcome);
    }
}

export function cancelAutoMemoryRounds() {
    for (const round of rounds) round.task.controller.abort(core_tasks.createGenerationAbortError());
}
