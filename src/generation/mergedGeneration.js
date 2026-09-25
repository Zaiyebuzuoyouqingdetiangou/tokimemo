import * as inbox_art from '../core/letterIllustrationV2.js';
import * as generationParticipants from '../core/generationParticipants.js';
import * as participants from '../core/participants.js';
import * as composerOptions from '../core/generationOptions.js';
// One text request can return several finished pages. Shared background is sent once.
// Each page keeps its own prompt and normalizer. This file does not call the model to plan,
// and it does not run the old generators side by side.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_outputBudget from '../core/outputBudget.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as song_contract from '../core/themeSongContract.js';
import * as archive_repository from '../archive/repository.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as generation_client from './client.js';
import * as generation_prompts from './prompts.js';
import * as generation_recovery from './recovery.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_themeSong from '../modes/themeSong.js';
import * as modes_bedtime from '../modes/bedtime.js';
import * as bedtime_contract from '../core/bedtimeContract.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_workspaceState from '../ui/workspaceState.js';

import * as routePeople from '../core/routeParticipants.js';

const PENDING_KEY = 'heartbeatMemoriesMergedPendingV1';

export const MERGEABLE_ROUTES = Object.freeze(['cabinet', 'achievements', 'inbox', 'themeSong', 'bedtime']);
export const MERGED_NOW = '可合并：两个人的陈列柜、成就库、你的邮箱、角色印象曲、睡前故事。其他页面保留原来的分阶段生成流程，按单项发送。';

const OUTPUT_RESERVE = Object.freeze({
    cabinet: 1500,
    achievements: 4000,
    inbox: 2000,
    themeSong: 4500,
    bedtime: 6500,
});
const NOT_ADAPTED = '这次还没接入合并，先按单项发送。';

export function estimateTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 3));
}

export function withoutRepeatedBackground(taskText, pieces) {
    let text = String(taskText || '');
    for (const piece of pieces) {
        if (typeof piece === 'string' && piece.length >= 24 && text.includes(piece)) text = text.split(piece).join('');
    }
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function sharedBackgroundText(context, memoryBank) {
    return [
        generation_prompts.promptSafetyBoundary(context, '一起生成', null, memoryBank),
        '共同背景只放这一份：人设、世界书和相关档案。下面各页不要再抄同一份背景，也不要把这些页写成同一个故事。',
        'UNTRUSTED_SHARED_ARCHIVE_JSON:',
        generation_prompts.promptArchiveSlice(memoryBank, 64),
    ].join('\n');
}

export function assembleMergedPrompt({ sharedBackground, tasks }) {
    const pages = Array.isArray(tasks) ? tasks : [];
    const lines = [
        sharedBackground,
        '本次用同一次回复，分别交回下面这些互相独立的页面。共用的是上面的背景。每一页保留自己的篇幅、人物、创作要求和结果格式，不要为了放在一起而缩短。',
        '下面各页里写的「只输出一个 JSON」「第一个字符必须是 {」，指的是 modules 里该页自己的值，不是整个回复。',
    ];
    for (const task of pages) lines.push(`【页面 ${task.key}：${task.label}】\n${task.taskText}`);
    const shape = pages.map(task => `"${task.key}":<${task.label}自己那一段要求的完整 JSON>`).join(',');
    lines.push(`【输出】\n只输出一个 JSON 对象：{"modules":{${shape}}}。\n某个页面写不出来时，把它的值写成 null，不要影响其他页面。第一个字符必须是 {，最后一个字符必须是 }。`);
    lines.push(`【最短合法例子】\n只示范整份回复的外层。每一页内部仍按该页自己的合同写全，不要照抄短句，也不要少写篇幅。\n${JSON.stringify({ modules: Object.fromEntries(pages.map(task => [task.key, task.example])) }, null, 2)}`);
    return lines.join('\n\n');
}

function routeTitle(route) {
    return ui_workspaceState.WORKSPACE_ROUTES[route]?.title || route;
}

function inboxTaskText(prompt) {
    const marker = 'UNTRUSTED_RELATIONSHIP_ARCHIVE:';
    const at = prompt.indexOf(marker);
    const head = (at === -1 ? prompt : prompt.slice(0, at)).trim();
    return `${head}\n人物和档案见这次回复开头的共同背景，不要再抄一份。`;
}

export function buildMergeTask(route, context, memoryBank, previous = null, date = new Date(), options = {}) {
    const participantSnapshot = Object.hasOwn(options, 'participantSnapshot') ? options.participantSnapshot
        : generationParticipants.resolveGenerationParticipantSnapshot({ roster: previous?.generationSources?.[route]?.sourceMemory?.participantsV1 || memoryBank.participantsV1 });
    memoryBank = generationParticipants.deriveGenerationParticipantMemoryBank(memoryBank, participantSnapshot);
    const task = buildMergeTaskBody(route, context, memoryBank, previous, date, options);
    if (task) {
        task.participantSnapshot = participantSnapshot;
        task.memoryBank = memoryBank;
        const block = participants.participantPromptBlock(participantSnapshot);
        task.singlePrompt += block;
        task.taskText += block;
        const accept = task.accept;
        task.acceptOptions = route === 'inbox' ? { characterEvidence: typeof options.characterEvidence === 'string' ? options.characterEvidence : '' } : {};
        task.accept = raw => {
            const result = accept(raw, task.acceptOptions);
            result.generationSources = { ...(result.generationSources || {}), [task.mode]: { sourceMemory: structuredClone(memoryBank) } };
            return result;
        };
    }
    if (task) task.snapshot = JSON.parse(JSON.stringify({ version: 1, route, previous, date: date.toISOString(), plan: task.plan || null,
        participantSnapshot, singlePrompt: task.singlePrompt, taskText: task.taskText }));
    return task;
}

export function applyInboxEvidence(task, characterEvidence = '') {
    if (task?.route === 'inbox') task.acceptOptions = { characterEvidence: typeof characterEvidence === 'string' ? characterEvidence : '' };
    return task;
}
function buildMergeTaskBody(route, context, memoryBank, previous, date, options) {
    if (route === 'bedtime') {
        const plan=modes_bedtime.validateBedtimePlan(options.frozenPlan || modes_bedtime.createBedtimePlan({},memoryBank,previous,date.getTime()),memoryBank,previous);
        const singlePrompt=modes_bedtime.bedtimePrompt(plan,memoryBank,previous);
        return {plan,key:route,route,mode:core_constants.MODE.BEDTIME,label:routeTitle(route),outputReserve:OUTPUT_RESERVE.bedtime,
            singlePrompt,taskText:singlePrompt,example:{title:'故事名',genre:'题材',premise:'故事引子',chapter:{title:'本篇标题',text:'完整故事正文'}},
            accept:raw=>bedtime_contract.mergeBedtime(previous,modes_bedtime.normalizeGeneratedBedtime(raw,plan,memoryBank,previous))};
    }
    if (route === 'cabinet') {
        const boundary = generation_prompts.promptSafetyBoundary(context, '两个人的陈列柜', null, memoryBank);
        const archive = generation_prompts.promptArchiveSlice(memoryBank, 64);
        const singlePrompt = modes_cabinet.cabinetPrompt(context, memoryBank);
        return {
            key: 'cabinet', route, mode: core_constants.MODE.CABINET, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.cabinet,
            singlePrompt, taskText: withoutRepeatedBackground(singlePrompt, [boundary, archive]),
            example: { items: [] },
            accept: raw => {
                const fresh = modes_cabinet.normalizeCabinet(raw, memoryBank);
                return previous ? modes_cabinet.mergeCabinet(previous, fresh) : fresh;
            },
        };
    }
    if (route === 'achievements') {
        const boundary = generation_prompts.promptSafetyBoundary(context, '档案室 / 成就库', null, memoryBank);
        const archive = previous
            ? ''
            : generation_prompts.promptArchiveSlice(memoryBank, 48);
        const singlePrompt = modes_achievements.achievementsPrompt(context, memoryBank, previous, null);
        return {
            key: 'achievements', route, mode: core_constants.MODE.ACHIEVEMENTS, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.achievements,
            singlePrompt, taskText: withoutRepeatedBackground(singlePrompt, [boundary, archive]),
            example: { title: '成就库', entries: [] },
            accept: raw => {
                const fresh = modes_achievements.normalizeAchievements(raw, memoryBank);
                return previous ? modes_achievements.mergeAchievementsIncremental(previous, fresh, memoryBank) : fresh;
            },
        };
    }
    if (route === 'inbox') {
        const plan = options.frozenPlan || modes_inbox.inboxPlan(memoryBank, previous, date);
        if (!plan.length) {
            const error = core_text.safeUserError('邮箱今天的来信已经收过了，明天再来收新信吧。', 'RMT_LOCAL_OPERATION', { retryable: false });
            error.solo = true;
            throw error;
        }
        const singlePrompt = modes_inbox.inboxPrompt(memoryBank, plan, previous);
        return {
            plan, key: 'inbox', route, mode: core_constants.MODE.INBOX, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.inbox,
            singlePrompt, taskText: inboxTaskText(singlePrompt),
            example: { letters: [{ slot: 'daily', title: '今天', greeting: '称呼', body: '近况写完整。', closing: '署名' }] },
            accept: (raw, acceptOptions = {}) => modes_inbox.normalizeInboxLetters(raw, memoryBank, plan, date, acceptOptions),
        };
    }
    if (route === 'themeSong') {
        const plan = modes_themeSong.validateThemeSongPlan(options.frozenPlan || modes_themeSong.createThemeSongPlan(options.songOptions || composerOptions.readSongOptions(context, memoryBank), memoryBank, previous), memoryBank);
        const singlePrompt = modes_themeSong.themeSongPrompt(plan, memoryBank);
        return {
            plan, key: 'themeSong', route, mode: core_constants.MODE.THEME_SONG, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.themeSong,
            singlePrompt, taskText: singlePrompt,
            example: { title: '原创歌名', vocalDescription: '中低音', styleDescription: '慢，钢琴。', stylePrompt: 'slow piano, intimate vocal', lyrics: '[Verse 1]\n一句歌词。\n[Chorus]\n一句副歌。\n[End]' },
            accept: raw => {
                const song = modes_themeSong.normalizeGeneratedSong(raw, plan, memoryBank);
                const session = previous ? structuredClone(previous) : song_contract.emptyThemeSongs(memoryBank, '');
                session.songs = [...(session.songs || []).filter(item => item.id !== song.id), song];
                session.selectedId = song.id;
                return session;
            },
        };
    }
    return null;
}

function groupPrompt(sharedBackground, routes, tasksByRoute, measure) {
    const groupTasks = routes.map(route => tasksByRoute.get(route));
    return typeof measure === 'function' ? measure(groupTasks) : assembleMergedPrompt({ sharedBackground, tasks: groupTasks });
}

function packRoutes(routes, tasksByRoute, sharedBackground, maxOutputTokens, inputBudgetTokens, measure) {
    const notes = [];
    const outputGroups = [];
    let current = [];
    let used = 0;
    const flush = () => {
        if (!current.length) return;
        outputGroups.push(current);
        current = [];
        used = 0;
    };
    for (const route of routes) {
        const need = tasksByRoute.get(route).outputReserve;
        if (need > maxOutputTokens) {
            flush();
            outputGroups.push([route]);
            notes.push(`${routeTitle(route)}自己的完整篇幅已经超过当前最大输出，不缩短它，单独发送。`);
            continue;
        }
        if (current.length && used + need > maxOutputTokens) {
            flush();
            notes.push('一次回复的输出额度装不下这些页的完整篇幅，所以拆开，没有缩短各页要求。');
        }
        current.push(route);
        used += need;
    }
    flush();
    const groups = [];
    for (const outputGroup of outputGroups) {
        let batch = [];
        for (const route of outputGroup) {
            const trial = batch.concat(route);
            const prompt = groupPrompt(sharedBackground, trial, tasksByRoute, measure);
            if (batch.length && estimateTokens(prompt) > inputBudgetTokens) {
                groups.push(batch);
                notes.push('合并后的输入超过你设置的输入预算，多出来的页另发一次，没有裁掉背景或正文要求。');
                batch = [route];
            } else batch.push(route);
        }
        if (batch.length) groups.push(batch);
    }
    return { groups, notes };
}

export function planTogether(selectedRoutes, { tasks = [], sharedBackground = '', maxOutputTokens = 60000, inputBudgetTokens = 60000, measure = null } = {}) {
    const order = Object.keys(ui_workspaceState.WORKSPACE_ROUTES);
    const routes = [...selectedRoutes].filter(route => ui_workspaceState.WORKSPACE_ROUTES[route]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const tasksByRoute = new Map(tasks.map(task => [task.route, task]));
    const solo = [];
    const mergeable = [];
    for (const route of routes) {
        if (!MERGEABLE_ROUTES.includes(route)) solo.push({ route, label: routeTitle(route), reason: NOT_ADAPTED });
        else if (!tasksByRoute.has(route)) solo.push({ route, label: routeTitle(route), reason: '这一页这次没能接进合并，先按单项发送。' });
        else mergeable.push(route);
    }
    const packed = mergeable.length ? packRoutes(mergeable, tasksByRoute, sharedBackground, maxOutputTokens, inputBudgetTokens, measure) : { groups: [], notes: [] };
    const mergedGroups = packed.groups.filter(group => group.length >= 2);
    const singleRoutes = packed.groups.filter(group => group.length < 2).flat();
    for (const route of singleRoutes) {
        const alone = estimateTokens(groupPrompt(sharedBackground, [route], tasksByRoute, measure));
        solo.push({
            route, label: routeTitle(route),
            reason: alone > inputBudgetTokens ? '这一项单独发送也会按现有输入预算拦截，不会裁短内容。' : '这一项单独发送。',
        });
    }
    const requestCount = mergedGroups.length + solo.length;
    const lines = [MERGED_NOW, `合并回复预计 ${mergedGroups.length} 次；另有 ${solo.length} 项按原流程单独发送。合计至少 ${requestCount} 个生成任务，实际请求次数另计。最大输出仍是你设置的 ${maxOutputTokens}，这几页共用这一次回复的额度。`];
    mergedGroups.forEach((group, index) => {
        const prompt = groupPrompt(sharedBackground, group, tasksByRoute, measure);
        lines.push(`第 ${index + 1} 次：${group.map(routeTitle).join('、')}。输入约 ${estimateTokens(prompt)} tokens（上限 ${inputBudgetTokens}）。`);
    });
    for (const item of solo) lines.push(`单独发送：${item.label}。${item.reason}`);
    for (const note of packed.notes) if (!lines.includes(note)) lines.push(note);
    return {
        requestCount,
        mergedGroups,
        solo,
        summary: lines.join('\n'),
        maxOutputTokens,
        inputBudgetTokens,
    };
}

function pendingId() {
    return `merged-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

// Rows remain in the legacy chat bucket, but visibility and actions require all
// of the durable ownership fences to match the live archive target.
export function pendingScopeForOrigin(origin) {
    const chatId = core_context.comparableChatId(origin?.chatId);
    const characterKey = core_text.normalizeText(origin?.characterKey, 500);
    const archiveRevision = core_text.normalizeText(origin?.archiveRevision, 240);
    const archiveTargetEntryId = core_text.normalizeText(origin?.archiveTargetEntryId, 160);
    return chatId && characterKey && archiveRevision && archiveTargetEntryId
        ? { chatId, characterKey, archiveRevision, archiveTargetEntryId }
        : null;
}

export function pendingScopeMatches(row, scopeOrOrigin) {
    const scope = pendingScopeForOrigin(scopeOrOrigin);
    const rowScope = pendingScopeForOrigin(row?.origin);
    return !!scope && !!rowScope
        && scope.chatId === rowScope.chatId
        && scope.characterKey === rowScope.characterKey
        && scope.archiveRevision === rowScope.archiveRevision
        && scope.archiveTargetEntryId === rowScope.archiveTargetEntryId;
}

export function currentPendingScope(context = core_context.getContext()) {
    const memoryBank = archive_repository.getImportedMemory(context);
    if (!memoryBank) return null;
    const entry = core_cache.archiveBackupEntryForContext(context, memoryBank);
    return pendingScopeForOrigin({ ...mergedOrigin(context, memoryBank), archiveTargetEntryId: entry.entryId });
}

export function createPendingStore(storage = globalThis.localStorage) {
    const storageError = () => core_text.safeUserError('合并成果暂存区无法读取或写入；旧记录没有被清空，请保留并导出草稿。', 'RMT_MERGED_STORAGE');
    const readAll = () => {
        try {
            if (typeof storage?.getItem !== 'function') throw storageError();
            const raw = storage.getItem(PENDING_KEY);
            const data = raw == null ? {} : JSON.parse(raw);
            if (!data || typeof data !== 'object' || Array.isArray(data)
                || Object.values(data).some(rows => !Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object'))) throw storageError();
            // Old rows acquire a stable locator only; never invent their provenance.
            for (const rows of Object.values(data)) rows.forEach((row, index) => { row.id ||= `legacy-${index}-${row.route || 'unknown'}`; });
            return data;
        } catch { throw storageError(); }
    };
    const writeAll = data => {
        try {
            if (typeof storage?.setItem !== 'function') throw storageError();
            storage.setItem(PENDING_KEY, JSON.stringify(data));
        } catch { throw storageError(); }
    };
    const update = (chatId, change) => {
        const data = readAll();
        Object.defineProperty(data, chatId, { value: change(Object.hasOwn(data, chatId) ? data[chatId] : []), enumerable: true, configurable: true, writable: true });
        writeAll(data);
    };
    return {
        read(chatId) { const data = readAll(); return Object.hasOwn(data, chatId) ? data[chatId] : []; },
        readForOrigin(scopeOrOrigin) {
            const scope = pendingScopeForOrigin(scopeOrOrigin);
            return scope ? this.read(scope.chatId).filter(row => pendingScopeMatches(row, scope)) : [];
        },
        readUnattributed(chatId) { return this.read(chatId).filter(row => !pendingScopeForOrigin(row?.origin)); },
        write(chatId, items) { update(chatId, () => items.map(item => ({ ...item, id: item.id || pendingId() }))); },
        replaceRoutes(chatId, routes, items, scopeOrOrigin = null) {
            // Compatibility name: replacement is task-scoped, never route-scoped.
            const ids = new Set(items.map(item => item.id).filter(Boolean));
            const scope = pendingScopeForOrigin(scopeOrOrigin);
            update(chatId, rows => rows.filter(item => !ids.has(item.id) || (scope && !pendingScopeMatches(item, scope))).concat(items.map(item => ({ ...item, id: item.id || pendingId() }))));
        },
        upsert(chatId, item, scopeOrOrigin = null) {
            const row = { ...item, id: item.id || pendingId() };
            const scope = pendingScopeForOrigin(scopeOrOrigin || row.origin);
            update(chatId, rows => rows.filter(known => known.id !== row.id || (scope && !pendingScopeMatches(known, scope))).concat([row]));
        },
        remove(chatId, id) { update(chatId, rows => rows.filter(item => item.id !== id)); },
        removeForOrigin(scopeOrOrigin, id) {
            const scope = pendingScopeForOrigin(scopeOrOrigin);
            if (!scope) return;
            update(scope.chatId, rows => rows.filter(row => row.id !== id || !pendingScopeMatches(row, scope)));
        },
        // 只删除调用方刚导出过的那几条未归属记录；导出之后新出现的记录不受影响，
        // 有所属人物的记录永远不会被这里删除。
        discardUnattributed(chatId, ids) {
            const allowed = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
            const targets = new Set(this.readUnattributed(chatId).map(row => row.id).filter(id => allowed.has(id)));
            if (!targets.size) return 0;
            update(chatId, rows => rows.filter(row => !targets.has(row.id)));
            return targets.size;
        },
        exportUnattributed(chatId) {
            return JSON.stringify({ kind: 'hearttrace-merged-unattributed-pending', version: 1, chatId: core_context.comparableChatId(chatId), records: this.readUnattributed(chatId) }, null, 2);
        },
        exportRaw() { return storage?.getItem?.(PENDING_KEY) || '{}'; },
    };
}

async function saveWithRetry(save, mode, session) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            await save(mode, session);
            return;
        } catch (error) { lastError = error; }
    }
    throw lastError || new Error('保存没有写上');
}

export async function runMergedBatch({ prompt, tasks, request, save, pending, chatId, sends = null, pendingScope = null }) {
    pending?.read(chatId); // Fail before sending if the existing index cannot be preserved.
    const batchId = pendingId();
    const before = typeof sends?.read === 'function' ? Number(sends.read()) || 0 : null;
    const raw = await request(prompt);
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!body || !body.modules || typeof body.modules !== 'object' || Array.isArray(body.modules)) {
        const error = new Error('一起生成没有返回各页结果，已完成的页面不会被这轮覆盖。');
        error.code = 'RMT_MERGED_SHAPE';
        throw error;
    }
    const saved = [];
    const failed = [];
    for (const task of tasks) {
        const identity = { id: task.pendingId || `${batchId}:${task.route}`, ...(task.origin ? { origin: structuredClone(task.origin) } : {}), ...(task.snapshot ? { snapshot: structuredClone(task.snapshot) } : {}) };
        const value = body.modules[task.key];
        if (value == null) {
            failed.push({ ...identity, route: task.route, mode: task.mode, label: task.label, kind: 'invalid', reason: '这一页没有返回' });
            continue;
        }
        let session = null;
        try { session = task.accept(value); }
        catch (error) {
            failed.push({ ...identity, route: task.route, mode: task.mode, label: task.label, kind: 'invalid', reason: core_text.safeErrorSummary(error) });
            continue;
        }
        try {
            await saveWithRetry(save, task.mode, session);
            saved.push({ route: task.route, mode: task.mode, label: task.label });
            if (task.pendingId) pendingScope ? pending?.removeForOrigin(pendingScope, task.pendingId) : pending?.remove(chatId, task.pendingId);
        } catch (error) {
            failed.push({ ...identity, route: task.route, mode: task.mode, label: task.label, kind: 'unsaved', reason: core_text.safeErrorSummary(error), session });
        }
    }
    if (pending && chatId) pending.replaceRoutes(chatId, tasks.map(task => task.route), failed, pendingScope);
    const providerRequests = before == null ? 1 : Math.max(0, (Number(sends.read()) || 0) - before);
    return { saved, failed, providerRequests };
}

export async function runMergedRepair({ item, request, save, pending, chatId, singlePrompt, accept, pendingScope = null }) {
    if (!item) return { requested: false };
    if (item.kind === 'unsaved') {
        await saveWithRetry(save, item.mode, item.session);
        pendingScope ? pending?.removeForOrigin(pendingScope, item.id) : pending?.remove(chatId, item.id);
        return { requested: false };
    }
    const raw = await request(singlePrompt);
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const session = accept(body);
    try {
        await saveWithRetry(save, item.mode, session);
    } catch (error) {
        pending?.upsert(chatId, { ...item, kind: 'unsaved', session, reason: core_text.safeErrorSummary(error) }, pendingScope);
        throw error;
    }
    pendingScope ? pending?.removeForOrigin(pendingScope, item.id) : pending?.remove(chatId, item.id);
    return { requested: true, saved: true };
}

function previousSession(mode, context, memoryBank) {
    try { return core_cache.loadSession(mode, { context, chatId: memoryBank.chatId, memoryBank, clone: true }); }
    catch { return null; }
}

export function acquireGenerationScopes(modes, { running, keyFor, add, remove }) {
    const keys = [];
    try {
        for (const mode of modes) {
            if (running(mode)) {
                throw core_text.safeUserError(`${core_constants.MODE_LABEL[mode] || mode}正在生成，等它结束再一起生成。`, 'RMT_LOGICAL_TASK_BUSY');
            }
            const key = keyFor(mode);
            add(key);
            keys.push(key);
        }
    } catch (error) {
        for (const key of keys) remove(key);
        throw error;
    }
    let released = false;
    return () => {
        if (released) return;
        released = true;
        for (const key of keys) remove(key);
    };
}

function holdModes(context, modes) {
    const scopes = runtimeState.activeModeBuildScopes;
    return acquireGenerationScopes(modes, {
        running: mode => core_requestCoordinator.isModeGenerating(mode, context),
        keyFor: mode => core_requestCoordinator.generationTaskKeyForMode(mode, context),
        add: key => scopes.add(key),
        remove: key => scopes.delete(key),
    });
}

function mergedOrigin(context, memoryBank) {
    const origin = core_context.captureTaskOrigin(context, memoryBank.archiveRevision);
    origin.chatId = core_context.comparableChatId(memoryBank.chatId);
    return origin;
}

async function clearFreshJournals(context, memoryBank, opened) {
    for (const row of opened) {
        if (!row.fresh) continue;
        try { await core_cache.saveGenerationRecovery(context, memoryBank, row.mode, null, row.origin); }
        catch { /* A draft that could not be cleared stays; nothing new was sent. */ }
        generation_recovery.detachGenerationRecovery(row.origin);
    }
}

export function assertMergedSaveIdentity(session, origin, memoryBank) {
    if (!origin?.characterKey || !origin?.archiveRevision || !origin?.chatId || !origin?.modeWriteFences
        || session?.chatId !== origin.chatId || session?.archiveRevision !== origin.archiveRevision
        || memoryBank?.chatId !== origin.chatId || memoryBank?.archiveRevision !== origin.archiveRevision) {
        throw core_text.safeUserError('原任务与当前档案不一致，成果仍保留；请回到原档案保存，或导出保留的成果。', 'RMT_MERGED_ORIGIN');
    }
}
function assertMergedTarget(origin, context, memoryBank, mode) {
    assertMergedSaveIdentity({ chatId: origin?.chatId, archiveRevision: origin?.archiveRevision }, origin, memoryBank);
    if (!core_context.deferredCommitOriginMatchesContext(origin, context)
        || core_cache.modeWriteFenceForCache(core_cache.getCache(context), mode) !== core_cache.modeWriteFenceSignature(origin.modeWriteFences?.[mode])) {
        throw core_text.safeUserError('原人物或页面写入权限已变化，旧成果保留，不能写入新的任务。', 'RMT_MERGED_ORIGIN');
    }
    const entry = core_cache.archiveBackupEntryForContext(context, memoryBank);
    if (!origin.archiveTargetEntryId || entry.entryId !== origin.archiveTargetEntryId) throw generation_recovery.generationRecoveryMismatch('target');
}
function saveMergedSession(context, memoryBank, origin) {
    return async (mode, session) => {
        assertMergedSaveIdentity(session, origin, memoryBank);
        assertMergedTarget(origin, context, memoryBank, mode);
        const committed = await core_cache.commitSession(mode, session, origin.chatId, origin);
        if (!committed) throw core_text.safeUserError('这一页的结果已经通过校验，但还没有写上。', 'RMT_MERGED_SAVE');
    };
}
function restoredTask(snapshot, context, memoryBank, frozenInputs = {}) {
    if (snapshot?.version !== 1 || !MERGEABLE_ROUTES.includes(snapshot.route)
        || !Number.isFinite(new Date(snapshot.date).getTime()) || typeof snapshot.singlePrompt !== 'string') {
        throw core_text.safeUserError('旧任务没有完整的生成选项，成果与草稿保留，请先导出。', 'RMT_MERGED_RECIPE');
    }
    const task = buildMergeTask(snapshot.route, context, memoryBank, snapshot.previous, new Date(snapshot.date), {
        frozenPlan: snapshot.plan, participantSnapshot: Object.hasOwn(snapshot, 'participantSnapshot') ? snapshot.participantSnapshot
            : generationParticipants.resolveGenerationParticipantSnapshot({ roster: memoryBank.participantsV1 }),
        characterEvidence: snapshot.route === 'inbox' ? modes_inbox.frozenInboxCharacterEvidence(frozenInputs) : '',
    });
    task.singlePrompt = snapshot.singlePrompt;
    task.taskText = snapshot.taskText;
    task.snapshot = structuredClone(snapshot);
    return task;
}
async function openMergedRecoveries(context, memoryBank, tasks, groups, envelope, sharedBackground) {
    const modes = tasks.map(task => task.mode);
    const logical = core_requestCoordinator.beginLogicalGenerationTask({
        kind: 'merged', mode: modes[0], pageIds: modes, context,
        taskKey: `merged:${core_context.comparableChatId(memoryBank.chatId)}:${modes.join(',')}`,
        label: `一起生成：${tasks.map(task => task.label).join('、')}`,
    });
    const entry = core_cache.archiveBackupEntryForContext(context, memoryBank);
    const opened = [];
    for (const task of tasks) {
        task.origin = { ...mergedOrigin(context, memoryBank), archiveTargetEntryId: entry.entryId, generationRecoveryDraftId: pendingId() };
        task.pendingId = task.origin.generationRecoveryDraftId;
    }
    try {
        for (const group of groups) {
            const groupTasks = group.map(route => tasks.find(task => task.route === route));
            const prompt = assembleMergedPrompt({ sharedBackground, tasks: groupTasks });
            const descriptors = groupTasks.map(task => ({ snapshot: task.snapshot, origin: task.origin }));
            for (const task of groupTasks) {
                core_requestCoordinator.bindLogicalGenerationTask(logical, task.origin, { participantSnapshot: task.participantSnapshot });
                const operation = { kind: 'merged', version: 1, mode: task.mode, prompt, group: descriptors, origin: task.origin };
                const handle = await generation_client.beginModeRecovery(task.mode, context, task.memoryBank, task.origin, {
                    operation, draftId: task.pendingId, contentInputs: { mergedWith: group }, existing: null,
                });
                opened.push({ mode: task.mode, origin: task.origin, fresh: true, task, handle });
                await generation_recovery.frozenGenerationInput(task.origin, 'context:merged', async () => envelope);
                await generation_recovery.frozenGenerationInput(task.origin, 'participants:merged', () => task.participantSnapshot);
                if (task.route === 'inbox') await generation_recovery.frozenGenerationInput(task.origin, 'presentation:inbox', () => ({
                    characterEvidence: task.acceptOptions?.characterEvidence || '',
                }));
            }
        }
        return { logical, opened };
    } catch (error) {
        await clearFreshJournals(context, memoryBank, opened);
        core_requestCoordinator.finishLogicalGenerationTask(logical, { status: 'failed', error });
        throw error;
    }
}
async function mergedReply(prompt, rows, context, envelope, trace) {
    // Every child's original journal retains the same reply before any child is
    // committed. Removing a completed primary cannot strand remaining children.
    const retained = rows.find(row => typeof row.handle?.journal?.frozenInputs?.['merged:reply'] === 'string');
    const primary = rows[0];
    const body = retained ? JSON.parse(retained.handle.journal.frozenInputs['merged:reply'])
        : await generation_client.requestValidatedSegment(prompt, '一起生成 · 同一次回复交回各页…', {
            context, contextEnvelope: envelope, origin: primary.origin, mode: primary.mode, background: true, taskTrace: trace,
            enforceGeneratedPhrasePolicy: true, participantPromptApplied: true,
            taskKey: core_requestCoordinator.generationTaskKeyForMode(primary.mode, context),
        }, value => {
            if (!value?.modules || typeof value.modules !== 'object' || Array.isArray(value.modules)) throw core_text.safeUserError('一起生成没有返回各页结果。', 'RMT_MERGED_SHAPE');
            return value;
        });
    for (const row of rows) await generation_recovery.frozenGenerationInput(row.origin, 'merged:reply', async () => body);
    return body;
}

export async function startTogether(routes, { confirm = null, date = new Date() } = {}) {
    const context = core_context.currentCharacterGuard();
    const archive = archive_repository.requireArchive(context);
    const memoryBank = archive;
    const settings = core_settings.getPluginSettings(context);
    const maxOutputTokens = core_outputBudget.normalizeOutputTokens(settings.maxTokens);
    const inputBudgetTokens = core_outputBudget.normalizeInputBudgetTokens(settings.inputBudgetTokens);
    const frozenOptions = Object.fromEntries(routes.map(route => [route, { participantSnapshot: routePeople.captureRoutePeople(route, context, memoryBank),
        ...(route === 'themeSong' ? { songOptions: structuredClone(composerOptions.readSongOptions(context, memoryBank)) } : {}) }]));
    const sharedBackground = sharedBackgroundText(context, memoryBank) + '\n共同背景中的人物只提供参考。每一页末尾的人物名单分别有效，不要将其他页的选择套入这一页。';
    const tasks = [];
    const blocked = [];
    const held = [];
    for (const route of routes) {
        if (!MERGEABLE_ROUTES.includes(route)) continue;
        const mode = ui_workspaceState.WORKSPACE_ROUTES[route].mode;
        let openDraft = false;
        try { openDraft = !!core_cache.loadGenerationRecovery(mode, context); }
        catch { openDraft = false; }
        if (openDraft) {
            held.push({ route, label: routeTitle(route), reason: '这一页还有未提交的生成草稿，先续写或放弃。这次不放进同一次回复，也不会自动另开一项。' });
            continue;
        }
        try { tasks.push(buildMergeTask(route, context, memoryBank, previousSession(mode, context, memoryBank), date, frozenOptions[route])); }
        catch (error) { blocked.push({ route, label: routeTitle(route), reason: core_text.safeErrorSummary(error) }); }
    }
    const previewModes = [...new Set(tasks.map(task => task.mode))];
    const previewTerms = [...new Set(previewModes.flatMap(mode => generation_client.generationWorldInfoScanTerms(mode, context)))];
    const envelope = previewModes.length ? await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: previewTerms }) : '';
    for (const task of tasks) if (task.route === 'inbox') applyInboxEvidence(task, inbox_art.captureEvidence(envelope, task.participantSnapshot, (task.participantSnapshot?.people || []).flatMap(person => (person.sourceRefs || []).map(ref => ref.content)).join('\n')));
    const measure = groupTasks => generation_client.composeOutgoingGenerationPrompt(
        assembleMergedPrompt({ sharedBackground, tasks: groupTasks }), context, settings, envelope,
        { enforceGeneratedPhrasePolicy: true });
    const plan = planTogether(routes, { tasks, sharedBackground, maxOutputTokens, inputBudgetTokens, measure });
    for (const item of blocked) {
        const existing = plan.solo.find(row => row.route === item.route);
        if (existing) {
            plan.summary = plan.summary.replace(`${existing.label}。${existing.reason}`, `${existing.label}。${item.reason}`);
            existing.reason = item.reason;
        } else plan.solo.push(item);
    }
    for (const item of held) {
        plan.summary = plan.summary.replace(`单独发送：${item.label}。这一页这次没能接进合并，先按单项发送。`, `${item.label}：${item.reason}`);
        plan.solo = plan.solo.filter(row => row.route !== item.route);
    }
    plan.requestCount = plan.mergedGroups.length + plan.solo.length;
    plan.summary = plan.summary.replace(/合计至少 \d+ 个生成任务/g, `合计至少 ${plan.requestCount} 个生成任务`);
    if (!plan.mergedGroups.length && plan.solo.length) {
        plan.summary = `${MERGED_NOW}\n这几项这次还没接入合并。共 ${plan.solo.length} 项按原来的单项生成逐项发送，实际请求次数另计。\n${plan.solo.map(item => `单独发送：${item.label}。${item.reason}`).join('\n')}`;
    }
    for (const item of held) {
        const line = `${item.label}：${item.reason}`;
        if (!plan.summary.includes(line)) plan.summary += `\n${line}`;
    }
    const approved = typeof confirm === 'function' ? confirm(plan) : ui_overlay.confirmExplicitAction('一起生成', plan.summary);
    if (!approved) return { cancelled: true, plan, providerRequests: 0 };
    const modes = plan.mergedGroups.flat().map(route => ui_workspaceState.WORKSPACE_ROUTES[route].mode);
    const pending = createPendingStore();
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    const pendingScope = currentPendingScope(context);
    if (!modes.length) return { cancelled: false, plan, providerRequests: 0, waiting: [], heldRoutes: held.map(item => item.route), frozenOptions, soloRoutes: plan.solo.map(item => item.route), pending: pending.readForOrigin(pendingScope) };
    const release = holdModes(context, modes);
    const trace = core_taskTrace.startTaskTrace('', modes[0]);
    let providerRequests = 0;
    const waiting = [];
    let failure = null;
    let openedTask = null;
    try {
        openedTask = await openMergedRecoveries(context, memoryBank, tasks.filter(task => modes.includes(task.mode)), plan.mergedGroups, envelope, sharedBackground);
        for (const group of plan.mergedGroups) {
            const groupTasks = group.map(route => tasks.find(task => task.route === route));
            const primary = openedTask.opened.find(row => row.mode === groupTasks[0].mode);
            const prompt = assembleMergedPrompt({ sharedBackground, tasks: groupTasks });
            const before = Number(trace.providerRequests) || 0;
            try {
                const outcome = await runMergedBatch({
                    prompt, tasks: groupTasks, pending, chatId, pendingScope, sends: { read: () => trace.providerRequests },
                    request: text => mergedReply(text, openedTask.opened.filter(row => groupTasks.some(task => task.mode === row.mode)), context, envelope, trace),
                    save: async (mode, session) => saveMergedSession(context, memoryBank, openedTask.opened.find(row => row.mode === mode).origin)(mode, session),
                });
                providerRequests += outcome.providerRequests;
                waiting.push(...outcome.failed);
            } catch (error) {
                providerRequests += Math.max(0, (Number(trace.providerRequests) || 0) - before);
                // Original group journals (including not-yet-requested groups) remain recoverable.
                throw error;
            }
        }
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        if (openedTask) {
            for (const row of openedTask.opened) generation_recovery.detachGenerationRecovery(row.origin);
            core_requestCoordinator.finishLogicalGenerationTask(openedTask.logical, failure ? { status: failure?.name === 'AbortError' ? 'cancelled' : 'failed', error: failure } : { status: waiting.length ? 'failed' : 'settled' });
        }
        core_taskTrace.endTaskTrace(trace, failure ? (failure?.name === 'AbortError' ? 'cancelled' : 'failed') : 'ok', failure);
        release();
    }
    return { cancelled: false, plan, providerRequests, waiting, frozenOptions, soloRoutes: plan.solo.map(item => item.route), pending: pending.readForOrigin(pendingScope), heldRoutes: held.map(item => item.route) };
}

export async function resumeMergedGeneration(existing, options = {}) {
    if (options.archiveTarget) throw core_text.safeUserError('请在原聊天打开这份合并草稿；历史快照保持只读。', 'RMT_MERGED_ORIGIN');
    const context = options.context || core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const operation = existing.operation;
    if (operation?.kind !== 'merged' || operation.version !== 1 || !Array.isArray(operation.group)) throw generation_recovery.generationRecoveryMismatch('operation');
    const pending = createPendingStore();
    const pendingScope = currentPendingScope(context);
    const pendingRows = pending.readForOrigin(pendingScope);
    const descriptors = operation.group.filter(item => core_cache.loadGenerationRecovery(item.origin?.mode || ui_workspaceState.WORKSPACE_ROUTES[item.snapshot?.route]?.mode,
        context, undefined, { draftId: item.origin?.generationRecoveryDraftId }));
    if (!descriptors.length) return { requested: false, saved: [], failed: [] };
    // Recover an index write failure from the original durable child journal.
    // This restores the exact missing/checked result before choosing repair;
    // a retained invalid module must not trap the user in replaying it forever.
    for (const descriptor of descriptors) {
        const id = descriptor.origin.generationRecoveryDraftId;
        if (pendingRows.some(row => row.id === id)) continue;
        const mode = ui_workspaceState.WORKSPACE_ROUTES[descriptor.snapshot.route].mode;
        const journal = core_cache.loadGenerationRecovery(mode, context, undefined, { draftId: id });
        const retained = journal?.frozenInputs?.['merged:reply'];
        if (typeof retained !== 'string') continue;
        const source = generation_recovery.readGenerationContentSnapshot(journal);
        if (!source?.memoryBank || !source.fields) throw generation_recovery.generationRecoveryMismatch('source');
        const frozenContext = { ...context, ...source.fields, getCharacterCardFields: () => structuredClone(source.cardFields || {}) };
        const task = restoredTask(descriptor.snapshot, frozenContext, source.memoryBank, journal.frozenInputs);
        const item = { id, route: task.route, mode, label: task.label, origin: descriptor.origin, snapshot: descriptor.snapshot,
            kind: 'invalid', reason: '这一页没有完整返回' };
        try { item.session = task.accept(JSON.parse(retained).modules?.[task.key]); item.kind = 'unsaved'; item.reason = '已通过校验，等待保存'; }
        catch { /* The original malformed module stays in the journal for export. */ }
        pending.upsert(memoryBank.chatId, item, pendingScope); pendingRows.push(item);
    }
    // A checked pending result is always save-only, even when recovery was opened
    // through the ordinary draft button instead of the pending-result button.
    const known = descriptors.map(item => pendingRows.find(row => row.id === item.origin.generationRecoveryDraftId));
    if (known.every(Boolean)) {
        const results = [];
        for (const row of known) results.push(await repairPending(row.route, row.id));
        return { requested: results.some(row => row.requested), providerRequests: results.reduce((sum, row) => sum + (row.providerRequests || 0), 0) };
    }
    const modes = descriptors.map(item => ui_workspaceState.WORKSPACE_ROUTES[item.snapshot.route].mode);
    const release = holdModes(context, modes), trace = core_taskTrace.startTaskTrace('', modes[0]);
    const logical = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'merged', mode: modes[0], pageIds: modes, context, label: '继续原合并任务' });
    const rows = [];
    let failure = null, result = null;
    try {
        for (const descriptor of descriptors) {
            const mode = ui_workspaceState.WORKSPACE_ROUTES[descriptor.snapshot.route].mode;
            const origin = { ...structuredClone(descriptor.origin), lifecycleEpoch: runtimeState.runtimeLifecycleEpoch };
            assertMergedTarget(origin, context, memoryBank, mode);
            const journal = core_cache.loadGenerationRecovery(mode, context, undefined, { draftId: origin.generationRecoveryDraftId });
            const participantSnapshot = journal?.frozenInputs?.['participants:merged']
                ? generationParticipants.resolveGenerationParticipantSnapshot({ frozenSnapshot: JSON.parse(journal.frozenInputs['participants:merged']) }) : null;
            core_requestCoordinator.bindLogicalGenerationTask(logical, origin, { participantSnapshot });
            const handle = await generation_client.beginModeRecovery(mode, context, memoryBank, origin, { existing: journal, operation: journal.operation });
            const source = generation_recovery.readGenerationContentSnapshot(journal);
            const task = restoredTask(descriptor.snapshot, handle.contentContext, source.memoryBank, journal?.frozenInputs);
            Object.assign(task, { origin, pendingId: origin.generationRecoveryDraftId });
            rows.push({ mode, origin, handle, task });
        }
        const envelope = await generation_recovery.frozenGenerationInput(rows[0].origin, 'context:merged', () => { throw generation_recovery.generationRecoveryMismatch('source'); });
        result = await runMergedBatch({ prompt: operation.prompt, tasks: rows.map(row => row.task), pending, chatId: memoryBank.chatId, pendingScope, sends: { read: () => trace.providerRequests },
            request: text => mergedReply(text, rows, context, envelope, trace),
            save: (mode, session) => saveMergedSession(context, memoryBank, rows.find(row => row.mode === mode).origin)(mode, session) });
        return result;
    } catch (error) { failure = error; throw error; }
    finally {
        for (const row of rows) generation_recovery.detachGenerationRecovery(row.origin);
        core_requestCoordinator.finishLogicalGenerationTask(logical, { status: failure || result?.failed?.length ? 'failed' : 'settled', error: failure });
        core_taskTrace.endTaskTrace(trace, failure ? 'failed' : 'ok', failure); release();
    }
}
export async function repairPending(route, id = '') {
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context), pending = createPendingStore();
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    const pendingScope = currentPendingScope(context);
    const matches = pending.readForOrigin(pendingScope).filter(row => id ? row.id === id && row.route === route : row.route === route);
    if (!matches.length) {
        // Do not disclose another character's row, but retain the existing hard
        // rejection for this character's stale revision/target.
        const staleOwnRow = id && pendingScope ? pending.read(chatId).find(row => row.id === id && row.route === route
            && core_context.comparableChatId(row?.origin?.chatId) === pendingScope.chatId
            && core_text.normalizeText(row?.origin?.characterKey, 500) === pendingScope.characterKey) : null;
        if (staleOwnRow) assertMergedTarget({ ...structuredClone(staleOwnRow.origin || {}), lifecycleEpoch: runtimeState.runtimeLifecycleEpoch }, context, memoryBank, staleOwnRow.mode);
        return { requested: false };
    }
    if (matches.length !== 1) throw core_text.safeUserError('这一页有多份成果，请选择具体的一份。', 'RMT_MERGED_AMBIGUOUS');
    const item = matches[0];
    // Renew only this invocation's volatile lifecycle. Original target, version,
    // draft ID and deletion/write fences are never replaced with current values.
    const origin = { ...structuredClone(item.origin || {}), lifecycleEpoch: runtimeState.runtimeLifecycleEpoch };
    assertMergedTarget(origin, context, memoryBank, item.mode);
    const release = holdModes(context, [item.mode]);
    const trace = core_taskTrace.startTaskTrace('', item.mode);
    let logical = null, failure = null;
    try {
        logical = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'merged', mode: item.mode, context, origin,
            taskKey: `merged-repair:${chatId}:${item.id}`, label: item.label || route });
        const save = saveMergedSession(context, memoryBank, origin);
        if (item.kind === 'unsaved') return await runMergedRepair({ item, save, pending, chatId, pendingScope });
        const existing = core_cache.loadGenerationRecovery(item.mode, context, undefined, { draftId: origin.generationRecoveryDraftId });
        if (!existing) throw generation_recovery.generationRecoveryMismatch('record');
        const source = generation_recovery.readGenerationContentSnapshot(existing);
        const participantSnapshot = existing?.frozenInputs?.['participants:merged']
            ? generationParticipants.resolveGenerationParticipantSnapshot({ frozenSnapshot: JSON.parse(existing.frozenInputs['participants:merged']) }) : null;
        core_requestCoordinator.bindLogicalGenerationTask(logical, origin, { participantSnapshot });
        const handle = await generation_client.beginModeRecovery(item.mode, context, memoryBank, origin, { existing, operation: existing.operation });
        const task = restoredTask(item.snapshot, handle.contentContext, source.memoryBank, existing?.frozenInputs);
        const envelope = await generation_recovery.frozenGenerationInput(origin, 'context:merged', () => { throw generation_recovery.generationRecoveryMismatch('source'); });
        const before = Number(trace.providerRequests) || 0;
        const outcome = await runMergedRepair({ item, save, pending, chatId, pendingScope, singlePrompt: task.singlePrompt, accept: task.accept,
            request: text => generation_client.requestValidatedSegment(text, `一起生成 · 只补${task.label}…`, {
                context, contextEnvelope: envelope, origin, mode: task.mode, background: true, taskTrace: trace, enforceGeneratedPhrasePolicy: true, participantPromptApplied: true,
                taskKey: `${core_requestCoordinator.generationTaskKeyForMode(task.mode, context)}:merged-repair`,
            }, value => { task.accept(value); return value; }) });
        return { ...outcome, providerRequests: Math.max(0, (Number(trace.providerRequests) || 0) - before) };
    } catch (error) { failure = error; throw error; }
    finally {
        generation_recovery.detachGenerationRecovery(origin);
        if (logical) core_requestCoordinator.finishLogicalGenerationTask(logical, failure ? { status: failure?.name === 'AbortError' ? 'cancelled' : 'failed', error: failure } : { status: 'settled' });
        core_taskTrace.endTaskTrace(trace, failure ? 'failed' : 'ok', failure); release();
    }
}

export function pendingNote(scopeOrOrigin, store = createPendingStore()) {
    return store.readForOrigin(scopeOrOrigin).map(item => item.kind === 'unsaved'
        ? `${item.label}已通过校验，还没写上`
        : `${item.label}还没完成：${item.reason}`);
}
