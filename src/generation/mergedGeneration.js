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
import * as ui_overlay from '../ui/overlay.js';
import * as ui_workspaceState from '../ui/workspaceState.js';

const PENDING_KEY = 'heartbeatMemoriesMergedPendingV1';

export const MERGEABLE_ROUTES = Object.freeze(['cabinet', 'achievements', 'inbox', 'themeSong']);
export const MERGED_NOW = '目前接入合并的只有：两个人的陈列柜、成就库、你的邮箱、角色印象曲。其他页这次按单项发送，以后还可以继续接入。';

const OUTPUT_RESERVE = Object.freeze({
    cabinet: 1500,
    achievements: 4000,
    inbox: 2000,
    themeSong: 4500,
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

export function buildMergeTask(route, context, memoryBank, previous = null, date = new Date()) {
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
        const plan = modes_inbox.inboxPlan(memoryBank, previous, date);
        if (!plan.length) {
            const error = new Error('邮箱今天没有新的可写来信。');
            error.solo = true;
            throw error;
        }
        const singlePrompt = modes_inbox.inboxPrompt(memoryBank, plan);
        return {
            key: 'inbox', route, mode: core_constants.MODE.INBOX, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.inbox,
            singlePrompt, taskText: inboxTaskText(singlePrompt),
            example: { letters: [{ slot: 'daily', title: '今天', greeting: '称呼', body: '近况写完整。', closing: '署名' }] },
            accept: raw => modes_inbox.normalizeInboxLetters(raw, memoryBank, plan, date),
        };
    }
    if (route === 'themeSong') {
        const plan = modes_themeSong.validateThemeSongPlan(modes_themeSong.createThemeSongPlan({}, memoryBank, previous), memoryBank);
        const singlePrompt = modes_themeSong.themeSongPrompt(plan, memoryBank);
        return {
            key: 'themeSong', route, mode: core_constants.MODE.THEME_SONG, label: routeTitle(route), outputReserve: OUTPUT_RESERVE.themeSong,
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
    const lines = [MERGED_NOW, `预计请求 ${requestCount} 次。最大输出仍是你设置的 ${maxOutputTokens}，这几页共用这一次回复的额度。`];
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

export function createPendingStore(storage = globalThis.localStorage) {
    const readAll = () => {
        try {
            const data = JSON.parse(storage?.getItem?.(PENDING_KEY) || '{}');
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch { return {}; }
    };
    const writeAll = data => { storage?.setItem?.(PENDING_KEY, JSON.stringify(data)); };
    return {
        read(chatId) {
            const rows = readAll()[chatId];
            return Array.isArray(rows) ? rows : [];
        },
        write(chatId, items) {
            const data = readAll();
            data[chatId] = items;
            writeAll(data);
        },
        replaceRoutes(chatId, routes, items) {
            const replacing = new Set(routes);
            const data = readAll();
            const kept = (Array.isArray(data[chatId]) ? data[chatId] : []).filter(item => !replacing.has(item.route));
            data[chatId] = kept.concat(items);
            writeAll(data);
        },
        upsert(chatId, item) {
            const data = readAll();
            const kept = (Array.isArray(data[chatId]) ? data[chatId] : []).filter(row => row.route !== item.route);
            data[chatId] = kept.concat([item]);
            writeAll(data);
        },
        remove(chatId, route) {
            const data = readAll();
            data[chatId] = (Array.isArray(data[chatId]) ? data[chatId] : []).filter(item => item.route !== route);
            writeAll(data);
        },
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

export async function runMergedBatch({ prompt, tasks, request, save, pending, chatId, sends = null }) {
    const before = typeof sends?.read === 'function' ? Number(sends.read()) || 0 : null;
    const raw = await request(prompt);
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!body || typeof body.modules !== 'object' || Array.isArray(body.modules)) {
        const error = new Error('一起生成没有返回各页结果，已完成的页面不会被这轮覆盖。');
        error.code = 'RMT_MERGED_SHAPE';
        throw error;
    }
    const saved = [];
    const failed = [];
    for (const task of tasks) {
        const value = body.modules[task.key];
        if (value == null) {
            failed.push({ route: task.route, mode: task.mode, label: task.label, kind: 'invalid', reason: '这一页没有返回' });
            continue;
        }
        let session = null;
        try { session = task.accept(value); }
        catch (error) {
            failed.push({ route: task.route, mode: task.mode, label: task.label, kind: 'invalid', reason: core_text.safeErrorSummary(error) });
            continue;
        }
        try {
            await saveWithRetry(save, task.mode, session);
            saved.push({ route: task.route, mode: task.mode, label: task.label });
        } catch (error) {
            failed.push({ route: task.route, mode: task.mode, label: task.label, kind: 'unsaved', reason: core_text.safeErrorSummary(error), session });
        }
    }
    if (pending && chatId) pending.replaceRoutes(chatId, tasks.map(task => task.route), failed);
    const providerRequests = before == null ? 1 : Math.max(0, (Number(sends.read()) || 0) - before);
    return { saved, failed, providerRequests };
}

export async function runMergedRepair({ item, request, save, pending, chatId, singlePrompt, accept }) {
    if (!item) return { requested: false };
    if (item.kind === 'unsaved') {
        await saveWithRetry(save, item.mode, item.session);
        pending?.remove(chatId, item.route);
        return { requested: false };
    }
    const raw = await request(singlePrompt);
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const session = accept(body);
    try {
        await saveWithRetry(save, item.mode, session);
    } catch (error) {
        pending?.upsert(chatId, { ...item, kind: 'unsaved', session, reason: core_text.safeErrorSummary(error) });
        throw error;
    }
    pending?.remove(chatId, item.route);
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

async function openMergedRecoveries(context, memoryBank, modes, envelope) {
    const logical = core_requestCoordinator.beginLogicalGenerationTask({
        kind: 'mode', mode: modes[0], pageIds: [...modes], context,
        taskKey: `merged:${core_context.comparableChatId(memoryBank.chatId)}:${modes.join(',')}`,
        label: `一起生成：${modes.map(mode => core_constants.MODE_LABEL[mode] || mode).join('、')}`,
    });
    const opened = [];
    try {
        for (const mode of modes) {
            const origin = mergedOrigin(context, memoryBank);
            core_requestCoordinator.bindLogicalGenerationTask(logical, origin);
            const handle = await generation_client.beginModeRecovery(mode, context, memoryBank, origin, {
                operation: { kind: 'mode', mode },
                contentInputs: { mergedWith: modes },
            });
            opened.push({ mode, origin, fresh: handle?.continueRequested !== true });
        }
        await generation_recovery.frozenGenerationInput(opened[0].origin, 'context:merged', async () => envelope);
        return { logical, opened };
    } catch (error) {
        await clearFreshJournals(context, memoryBank, opened);
        for (const row of opened) generation_recovery.detachGenerationRecovery(row.origin);
        core_requestCoordinator.finishLogicalGenerationTask(logical, { status: 'failed', error });
        throw error;
    }
}

async function dropFailedJournals(context, memoryBank, opened, failed, primaryMode) {
    const modes = new Set(failed.map(item => item.mode));
    for (const row of opened) {
        if (!modes.has(row.mode)) continue;
        if (row.mode !== primaryMode && !row.fresh) continue;
        try { await core_cache.saveGenerationRecovery(context, memoryBank, row.mode, null, row.origin); }
        catch { /* The pending row already keeps this page. */ }
    }
}

function saveMergedSession(context, memoryBank, origin) {
    return async (mode, session) => {
        session.chatId = memoryBank.chatId;
        session.archiveRevision = memoryBank.archiveRevision;
        const committed = await core_cache.commitSession(mode, session, memoryBank.chatId, origin);
        if (!committed) throw core_text.safeUserError('这一页的结果已经通过校验，但还没有写上。', 'RMT_MERGED_SAVE');
    };
}

export async function startTogether(routes, { confirm = null, date = new Date() } = {}) {
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const settings = core_settings.getPluginSettings(context);
    const maxOutputTokens = core_outputBudget.normalizeOutputTokens(settings.maxTokens);
    const inputBudgetTokens = core_outputBudget.normalizeInputBudgetTokens(settings.inputBudgetTokens);
    const sharedBackground = sharedBackgroundText(context, memoryBank);
    const tasks = [];
    const blocked = [];
    for (const route of routes) {
        if (!MERGEABLE_ROUTES.includes(route)) continue;
        try { tasks.push(buildMergeTask(route, context, memoryBank, previousSession(ui_workspaceState.WORKSPACE_ROUTES[route].mode, context, memoryBank), date)); }
        catch (error) { blocked.push({ route, label: routeTitle(route), reason: core_text.safeErrorSummary(error) }); }
    }
    const previewModes = [...new Set(tasks.map(task => task.mode))];
    const previewTerms = [...new Set(previewModes.flatMap(mode => generation_client.generationWorldInfoScanTerms(mode, context)))];
    const envelope = previewModes.length ? await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: previewTerms }) : '';
    const measure = groupTasks => generation_client.composeOutgoingGenerationPrompt(
        assembleMergedPrompt({ sharedBackground, tasks: groupTasks }), context, settings, envelope);
    const plan = planTogether(routes, { tasks, sharedBackground, maxOutputTokens, inputBudgetTokens, measure });
    for (const item of blocked) {
        const existing = plan.solo.find(row => row.route === item.route);
        if (existing) {
            plan.summary = plan.summary.replace(`${existing.label}。${existing.reason}`, `${existing.label}。${item.reason}`);
            existing.reason = item.reason;
        } else plan.solo.push(item);
    }
    plan.requestCount = plan.mergedGroups.length + plan.solo.length;
    if (!plan.mergedGroups.length && plan.solo.length) {
        plan.summary = `${MERGED_NOW}\n这几项这次还没接入合并。预计请求 ${plan.solo.length} 次，按原来的单项生成逐项发送。\n${plan.solo.map(item => `单独发送：${item.label}。${item.reason}`).join('\n')}`;
    }
    const approved = typeof confirm === 'function' ? confirm(plan) : ui_overlay.confirmExplicitAction('一起生成', plan.summary);
    if (!approved) return { cancelled: true, plan, providerRequests: 0 };
    const modes = plan.mergedGroups.flat().map(route => ui_workspaceState.WORKSPACE_ROUTES[route].mode);
    const pending = createPendingStore();
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    if (!modes.length) return { cancelled: false, plan, providerRequests: 0, soloRoutes: plan.solo.map(item => item.route), pending: pending.read(chatId) };
    const release = holdModes(context, modes);
    const trace = core_taskTrace.startTaskTrace('', modes[0]);
    let providerRequests = 0;
    let failure = null;
    let openedTask = null;
    try {
        openedTask = await openMergedRecoveries(context, memoryBank, modes, envelope);
        for (const group of plan.mergedGroups) {
            const groupTasks = group.map(route => tasks.find(task => task.route === route));
            const primary = openedTask.opened.find(row => row.mode === groupTasks[0].mode);
            const prompt = assembleMergedPrompt({ sharedBackground, tasks: groupTasks });
            const before = Number(trace.providerRequests) || 0;
            try {
                const outcome = await runMergedBatch({
                    prompt, tasks: groupTasks, pending, chatId, sends: { read: () => trace.providerRequests },
                    request: text => generation_client.requestValidatedSegment(text, '一起生成 · 同一次回复交回各页…', {
                        context, contextEnvelope: envelope, origin: primary.origin, mode: primary.mode, background: true, taskTrace: trace,
                        taskKey: core_requestCoordinator.generationTaskKeyForMode(primary.mode, context),
                    }, value => {
                        if (!value || typeof value.modules !== 'object' || Array.isArray(value.modules)) throw core_text.safeUserError('一起生成没有返回各页结果。', 'RMT_MERGED_SHAPE');
                        return value;
                    }),
                    save: async (mode, session) => saveMergedSession(context, memoryBank, openedTask.opened.find(row => row.mode === mode).origin)(mode, session),
                });
                providerRequests += outcome.providerRequests;
                await dropFailedJournals(context, memoryBank, openedTask.opened.filter(row => groupTasks.some(task => task.mode === row.mode)), outcome.failed, primary.mode);
            } catch (error) {
                providerRequests += Math.max(0, (Number(trace.providerRequests) || 0) - before);
                const laterModes = new Set(plan.mergedGroups.slice(plan.mergedGroups.indexOf(group) + 1).flat()
                    .map(route => ui_workspaceState.WORKSPACE_ROUTES[route].mode));
                const groupModes = new Set(groupTasks.map(task => task.mode));
                await clearFreshJournals(context, memoryBank, openedTask.opened.filter(row => row.mode !== primary.mode
                    && (groupModes.has(row.mode) || laterModes.has(row.mode))));
                throw error;
            }
        }
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        if (openedTask) {
            for (const row of openedTask.opened) generation_recovery.detachGenerationRecovery(row.origin);
            core_requestCoordinator.finishLogicalGenerationTask(openedTask.logical, failure ? { status: failure?.name === 'AbortError' ? 'cancelled' : 'failed', error: failure } : { status: 'settled' });
        }
        core_taskTrace.endTaskTrace(trace, failure ? (failure?.name === 'AbortError' ? 'cancelled' : 'failed') : 'ok', failure);
        release();
    }
    return { cancelled: false, plan, providerRequests, soloRoutes: plan.solo.map(item => item.route), pending: pending.read(chatId) };
}

export async function repairPending(route) {
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const pending = createPendingStore();
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    const item = pending.read(chatId).find(row => row.route === route);
    if (!item) return { requested: false };
    const release = holdModes(context, [item.mode]);
    const origin = mergedOrigin(context, memoryBank);
    const trace = core_taskTrace.startTaskTrace('', item.mode);
    let logical = null;
    let failure = null;
    try {
        logical = core_requestCoordinator.beginLogicalGenerationTask({
            kind: 'mode', mode: item.mode, context, origin,
            taskKey: `merged-repair:${chatId}:${route}`,
            label: item.label || route,
        });
        const save = saveMergedSession(context, memoryBank, origin);
        if (item.kind === 'unsaved') return await runMergedRepair({ item, save, pending, chatId });
        await generation_client.beginModeRecovery(item.mode, context, memoryBank, origin, {
            operation: { kind: 'mode', mode: item.mode },
        });
        const task = buildMergeTask(route, context, memoryBank, previousSession(item.mode, context, memoryBank));
        const before = Number(trace.providerRequests) || 0;
        try {
            const outcome = await runMergedRepair({
                item, save, pending, chatId, singlePrompt: task.singlePrompt, accept: task.accept,
                request: text => generation_client.requestValidatedSegment(text, `一起生成 · 只补${task.label}…`, {
                    context, origin, mode: task.mode, background: true, taskTrace: trace,
                    taskKey: core_requestCoordinator.generationTaskKeyForMode(task.mode, context),
                }, value => value),
            });
            return { ...outcome, providerRequests: Math.max(0, (Number(trace.providerRequests) || 0) - before) };
        } catch (error) {
            const current = pending.read(chatId).find(row => row.route === route);
            if (current?.kind === 'unsaved') {
                try { await core_cache.saveGenerationRecovery(context, memoryBank, item.mode, null, origin); }
                catch { /* The save-only row already holds the checked session. */ }
            }
            throw error;
        }
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        generation_recovery.detachGenerationRecovery(origin);
        if (logical) core_requestCoordinator.finishLogicalGenerationTask(logical, failure ? { status: failure?.name === 'AbortError' ? 'cancelled' : 'failed', error: failure } : { status: 'settled' });
        core_taskTrace.endTaskTrace(trace, failure ? (failure?.name === 'AbortError' ? 'cancelled' : 'failed') : 'ok', failure);
        release();
    }
}

export function pendingNote(chatId, store = createPendingStore()) {
    return store.read(chatId).map(item => item.kind === 'unsaved'
        ? `${item.label}已通过校验，还没写上`
        : `${item.label}还没完成：${item.reason}`);
}
