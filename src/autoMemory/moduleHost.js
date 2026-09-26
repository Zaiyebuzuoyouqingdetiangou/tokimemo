// 把冻结好的步骤交给现有生成入口。一次唤醒只推进当前这一批，不重做已经记下的步骤。
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as generation_achievement from '../generation/achievementCapture.js';
import * as generation_client from '../generation/client.js';
import * as modes_inbox from '../modes/inbox.js';
import * as auto_memory_plans from './modulePlans.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as auto_memory_runner from './moduleRunner.js';

function loadSession(mode, context, memory) {
    try { return core_cache.loadSession(mode, { context, memoryBank: memory, clone: true }); }
    catch { return null; }
}

export function roomReady(context, memory = archive_repository.getImportedMemory(context)) {
    const session = loadSession('room', context, memory);
    if (!session) return false;
    if (session.archiveRevision && memory?.archiveRevision && session.archiveRevision !== memory.archiveRevision) return false;
    return true;
}

export function collectModuleFacts(moduleId, context, source = {}) {
    const memory = archive_repository.getImportedMemory(context);
    const facts = {
        chatId: source.chatId, archiveRevision: source.archiveRevision,
        sourceMemoryIds: source.sourceMemoryIds, drawId: source.drawId,
    };
    if (moduleId === 'inbox') {
        try { facts.letters = modes_inbox.inboxPlan(memory, loadSession('inbox', context, memory), new Date()).length; }
        catch { /* 信件计划读不到时留下目录步骤，不把空计划当成有信。 */ }
    }
    if (moduleId === 'items') facts.roomReady = roomReady(context, memory);
    if (moduleId === 'album') {
        const session = loadSession('album', context, memory);
        if (session) facts.unlocked = (session.entries || []).filter(item => item?.unlocked !== false && !(item.comments || []).length).length;
    }
    if (moduleId === 'phone') {
        const session = loadSession('phone', context, memory);
        const apps = session?.apps || [];
        facts.incremental = !!session;
        if (apps.length) {
            facts.appIds = apps.map((app, index) => app?.id || `app-${index + 1}`);
            facts.updates = facts.appIds.length;
        }
    }
    if (moduleId === 'butterfly') facts.phase = loadSession('butterfly', context, memory) ? 'increment' : 'first';
    if (moduleId === 'bedtime') facts.bedtime = source.bedtime?.action === 'continue' ? source.bedtime : { action: 'new' };
    if (moduleId === 'themeSong') facts.song = { subject: 'character' };
    facts.firstGeneration = !loadSession(moduleId, context, memory);
    return facts;
}

const SECOND_PASS_MODULES = new Set(['album', 'adv', 'room', 'items', 'phone', 'travel', 'ending', 'heart', 'butterfly', 'pastLives']);
const FIRST_HALF_KINDS = new Set(['catalog', 'index', 'structure', 'map', 'main', 'prologue', 'snapshot']);

function autoIncludesSecondPass(step, plan) {
    // 自动留忆默认把第二次生成一起做完。目录、索引后面还有专门的补全步骤时，由那些步骤来写，避免同一份内容请求两遍。
    if (plan.moduleId === 'adv') return true;
    if (step.kind === 'comments') return true;
    if (!SECOND_PASS_MODULES.has(plan.moduleId)) return false;
    const followers = (plan.steps || []).some(item => item.order > step.order && item.status !== 'completed');
    if (followers && FIRST_HALF_KINDS.has(step.kind)) return false;
    return true;
}

function stepOptions(step, plan) {
    const options = { automatic: true, background: true, autoMemory: true, autoMemoryStep: step.id };
    if (autoIncludesSecondPass(step, plan)) options.secondStep = true;
    if (step.kind === 'slots') options.fillRoomText = true;
    if (step.kind === 'lines') options.fillItemsText = true;
    if (step.kind === 'prose' && plan.moduleId === 'travel') options.fillTravelText = true;
    if (step.kind === 'prose' && plan.moduleId === 'butterfly') options.fillButterflyText = true;
    if (step.kind === 'app' || step.kind === 'catalog' && plan.moduleId === 'phone') options.continueDraft = step.kind === 'app';
    if (plan.moduleId === 'bedtime' && step.id === 'bed-new') options.bedtimeOptions = { action: 'new' };
    if (plan.moduleId === 'bedtime' && step.id.startsWith('cont-')) options.bedtimeOptions = { action: 'continue', storyId: step.id.slice(5) };
    if (plan.moduleId === 'themeSong') options.songOptions = { subject: 'character', language: 'zh', voice: 'char' };
    return options;
}

export async function executeModuleStep({ step, plan, carryAchievement }, context) {
    if (carryAchievement) generation_achievement.armAchievementCapture();
    try {
        const result = await generation_client.generateMode(plan.moduleId, stepOptions(step, plan));
        const achievement = generation_achievement.finishAchievementCapture();
        if (result?.status === 'noop') return { noop: true };
        if (step.kind === 'catalog') {
            const facts = collectModuleFacts(plan.moduleId, context, plan);
            const built = auto_memory_plans.buildModulePlan(plan.moduleId, facts);
            if (built && built.steps.length > 1) return { saved: true, recoverySlot: `${plan.moduleId}:${step.id}`, expand: facts, achievement };
        }
        return { saved: true, recoverySlot: `${plan.moduleId}:${step.id}`, achievement };
    } catch (error) {
        generation_achievement.finishAchievementCapture();
        throw error;
    }
}

export async function runModulePlan(snapshot, persist, context, now = Date.now()) {
    const item = auto_memory_registry.autoMemoryModuleById(snapshot?.modulePlan?.moduleId);
    return auto_memory_runner.runPending(snapshot, {
        now,
        module: item,
        persist,
        execute: request => executeModuleStep(request, context),
    });
}
