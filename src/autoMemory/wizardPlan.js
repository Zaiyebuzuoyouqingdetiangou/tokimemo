// 自动留忆向导的纯决定。不读聊天、不打开界面、不发请求。
import * as core_constants from '../core/constants.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as auto_memory_plan from './planStore.js';

export const WIZARD_STEPS = Object.freeze(['api', 'card', 'people', 'sources', 'modules', 'preference', 'interval', 'archive', 'first', 'run']);

function count(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(number, Number.MAX_SAFE_INTEGER);
}

function uniqueDrawIds(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const id of value) {
        if (seen.has(id) || !auto_memory_registry.isAutoMemoryDrawModule(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

export function inspectAutoMemoryApi(input = {}) {
    const mode = input.mode === 'manual' ? 'manual' : 'profile';
    if (mode === 'manual') {
        if (input.manualReady === true) return { ready: true, message: '手动 API 已就绪。', action: '' };
        return { ready: false, message: input.manualMessage || '手动 API 还没配好。', action: '请到设置的 API 页填写地址、模型和 Key，保存后再打开向导。' };
    }
    if (input.profileReady === true) return { ready: true, message: '一键连接已就绪。', action: '' };
    if (input.profileConfigured === true) return { ready: false, message: '一键连接还不能安全读取凭证。', action: '请改用手动 API，或换用支持凭证绑定的酒馆后再试。' };
    return { ready: false, message: '一键连接未配置。', action: '请到设置的 API 页选择连接配置，或改用手动 API。' };
}

export function archiveSegmentEstimate({ chatCharacters = 0, externalCharacters = 0 } = {}) {
    const chat = count(chatCharacters);
    const external = count(externalCharacters);
    const chatRequests = chat ? Math.ceil(chat / core_constants.IMPORT_CHUNK_CHARS) : 0;
    const externalRequests = external ? Math.ceil(external / core_constants.EXTERNAL_MEMORY_CHUNK_CHARS) : 0;
    return {
        chatCharacters: chat,
        externalCharacters: external,
        chatRequests,
        externalRequests,
        archiveRequests: chatRequests + externalRequests,
        checkpoints: chat ? Math.ceil(chat / core_constants.ARCHIVE_BATCH_CHAT_CHARS) : 0,
    };
}

export function wizardModuleCards(queueableIds = []) {
    const queueable = new Set(Array.isArray(queueableIds) ? queueableIds : []);
    return auto_memory_registry.listAutoMemoryModules().map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        contentKind: item.contentKind,
        contentLabel: item.contentKind === 'historical' ? '剧情里程碑' : '作品收藏',
        normalRequestEstimate: item.normalRequestEstimate,
        autoEligible: item.autoEligible === true,
        inDrawPool: item.inDrawPool === true,
        unavailableReason: item.autoEligible === true ? '' : (item.unavailableReason || '暂不可自动生成'),
        queueable: item.inDrawPool === true && queueable.has(item.id),
    }));
}

export function createWizardDraft(plan = null) {
    const excludedModuleIds = uniqueDrawIds(plan?.excludedModuleIds);
    const preferredModuleIds = uniqueDrawIds(plan?.preferredModuleIds).filter(id => !excludedModuleIds.includes(id));
    return {
        cardType: '',
        participantConfirmed: false,
        participantIds: [],
        preferredModuleIds,
        excludedModuleIds,
        intervalFloors: normalizeInterval(plan?.intervalFloors).ok ? plan.intervalFloors : 5,
        doArchive: true,
        skipFirst: false,
        archiveOnly: false,
        cardChoiceDirty: false,
        firstModuleIds: [],
    };
}

export function preferenceUpdate(draft, id, choice) {
    const item = auto_memory_registry.autoMemoryModuleById(id);
    const next = { ...draft, preferredModuleIds: uniqueDrawIds(draft?.preferredModuleIds).filter(itemId => itemId !== id),
        excludedModuleIds: uniqueDrawIds(draft?.excludedModuleIds).filter(itemId => itemId !== id), error: '' };
    if (!item || item.inDrawPool !== true) return { ...next, error: 'unavailable' };
    if (choice === 'prefer') next.preferredModuleIds = [...next.preferredModuleIds, id];
    else if (choice === 'exclude') next.excludedModuleIds = [...next.excludedModuleIds, id];
    return next;
}

export function normalizeInterval(value) {
    if (!Number.isSafeInteger(value) || value < auto_memory_plan.AUTO_MEMORY_INTERVAL_MIN || value > auto_memory_plan.AUTO_MEMORY_INTERVAL_MAX) {
        return { ok: false, message: '自动间隔只能是 1 到 1000 的整数。' };
    }
    return { ok: true, intervalFloors: value };
}

export function firstQueueRoutes(draft, queueableIds = []) {
    if (!draft || draft.archiveOnly === true || draft.skipFirst === true) return [];
    const allowed = new Set(Array.isArray(queueableIds) ? queueableIds : []);
    return uniqueDrawIds(draft.firstModuleIds).filter(id => allowed.has(id));
}

export function splitRequestPreview(estimate, routes) {
    const cards = wizardModuleCards();
    const selected = (Array.isArray(routes) ? routes : []).map(id => cards.find(item => item.id === id)).filter(Boolean);
    return {
        archiveRequests: estimate?.archiveRequests || 0,
        chatRequests: estimate?.chatRequests || 0,
        externalRequests: estimate?.externalRequests || 0,
        checkpoints: estimate?.checkpoints || 0,
        moduleCount: selected.length,
        moduleEstimates: selected.map(item => ({ id: item.id, title: item.title, estimate: item.normalRequestEstimate })),
    };
}

// 一项失败只改自己的状态，不撤销已经完成或仍在排队的其他项。
export function queueAfterItemFailure(items, failedId) {
    return (Array.isArray(items) ? items : []).map(item => item?.id === failedId ? { ...item, status: 'failed' } : { ...item });
}

export function wizardResumeView(snapshot, archiveRecovery = null) {
    if (!snapshot?.plan?.enabled) return { completed: false, archiveStillRunning: false };
    return {
        completed: true,
        intervalFloors: snapshot.plan.intervalFloors,
        preferredModuleIds: [...snapshot.plan.preferredModuleIds],
        excludedModuleIds: [...snapshot.plan.excludedModuleIds],
        archiveStillRunning: !!archiveRecovery,
    };
}

export function wizardEntry({ archivePresent = false, cardType = '', apiReady = false } = {}) {
    const known = cardType === 'single' || cardType === 'multiple';
    const skipArchive = archivePresent === true && known;
    return {
        skipArchive,
        step: skipArchive && apiReady === true ? 'preference' : 'api',
        doArchive: !skipArchive,
        cardType: known ? cardType : '',
    };
}

// 改过人物且已有档案时先问。同意才重建；不同意就留着旧档案。
export function archiveRebuildChoice({ cardChoiceDirty = false, archivePresent = false } = {}) {
    return cardChoiceDirty === true && archivePresent === true ? 'ask' : 'keep';
}

export function archiveActionAfterChoice({ asked = 'keep', rebuild = false, doArchive = false } = {}) {
    if (asked === 'ask') return rebuild === true ? 'rebuild' : 'keep';
    return doArchive === true ? 'create' : 'keep';
}

export function disableAutoMemoryPlan(chatMetadata, now = 0) {
    const existing = auto_memory_plan.readAutoMemoryMetadata(chatMetadata);
    if (!existing?.plan.enabled) return { changed: false, snapshot: existing };
    const updatedAt = Number.isSafeInteger(now) && now > existing.plan.updatedAt ? now : existing.plan.updatedAt + 1;
    return {
        changed: true,
        snapshot: auto_memory_plan.parseAutoMemorySnapshot({
            plan: auto_memory_plan.parseAutoMemoryPlan({
                ...existing.plan, enabled: false, revision: existing.plan.revision + 1, updatedAt,
            }),
            revealRecords: existing.revealRecords, drawTickets: existing.drawTickets, modulePlan: existing.modulePlan,
        }),
    };
}

export function wizardBlocksChatInput() {
    return false;
}

export function wizardCloseAbortsTasks() {
    return false;
}

export function wizardCompletionSnapshot(chatMetadata, draft, now = 0) {
    const interval = normalizeInterval(draft?.intervalFloors);
    if (!interval.ok) throw auto_memory_plan.createAutoMemoryPlan({ intervalFloors: draft?.intervalFloors });
    const excludedModuleIds = uniqueDrawIds(draft?.excludedModuleIds);
    const existing = auto_memory_plan.readAutoMemoryMetadata(chatMetadata);
    const preferredModuleIds = uniqueDrawIds(draft?.preferredModuleIds).filter(id => !excludedModuleIds.includes(id));
    const updatedAt = Number.isSafeInteger(now) && now > 0 ? now : 0;
    if (!existing) {
        return auto_memory_plan.parseAutoMemorySnapshot({
            plan: auto_memory_plan.createAutoMemoryPlan({
                enabled: true, intervalFloors: interval.intervalFloors, preferredModuleIds, excludedModuleIds,
                legacyPreferencesMigrated: true, updatedAt,
            }),
            revealRecords: [], drawTickets: [], modulePlan: null,
        });
    }
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...existing.plan, enabled: true, intervalFloors: interval.intervalFloors, preferredModuleIds, excludedModuleIds,
            legacyPreferencesMigrated: true, revision: existing.plan.revision + 1,
            updatedAt: updatedAt > existing.plan.updatedAt ? updatedAt : existing.plan.updatedAt + 1,
        }),
        revealRecords: existing.revealRecords, drawTickets: existing.drawTickets, modulePlan: existing.modulePlan,
    });
}
