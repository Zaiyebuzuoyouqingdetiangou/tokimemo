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
import * as generation_client from './client.js';
import * as generation_prompts from './prompts.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_cabinet from '../modes/cabinet.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_themeSong from '../modes/themeSong.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_workspaceState from '../ui/workspaceState.js';

const PENDING_KEY = 'heartbeatMemoriesMergedPendingV1';

export const MERGEABLE_ROUTES = Object.freeze(['cabinet', 'achievements', 'inbox', 'themeSong']);

const OUTPUT_RESERVE = Object.freeze({
    cabinet: 1500,
    achievements: 4000,
    inbox: 2000,
    themeSong: 4500,
});

export const SOLO_REASON = Object.freeze({
    album: '回忆相簿先写目录，再写共同回忆。',
    adv: 'ADV 先写事件索引，再写正文。',
    room: '他的房间还要单独补对白。',
    phone: '私人终端要先有计划，再写各个应用。',
    travel: '出行要逐站核对锚点和正文。',
    heart: '春夏秋冬后一段依赖前一段。',
    language: '基础语言和萤火虫、日常一格写在同一份互动存档里。',
    fireflies: '萤火虫和基础语言、日常一格写在同一份互动存档里。',
    strips: '日常一格和基础语言、萤火虫写在同一份互动存档里。',
    postending: '后日谈和春夏秋冬写在同一份互动存档里。',
    relations: '人际庭园是判断页，温度上限和创作页不同。',
    ending: '结局先写路线目录，再写正文。',
    butterfly: '蝴蝶效应后一段依赖前一段。',
    pastLives: '前世今生后一段依赖前一段。',
    calendar: '日历要按故事日期逐条核对。',
    items: '他的物品依赖已经生成的房间。',
    timeEcho: '时空回响后一段依赖前一段。',
});

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

function packRoutes(routes, tasksByRoute, sharedBackground, maxOutputTokens, inputBudgetTokens) {
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
            const prompt = assembleMergedPrompt({ sharedBackground, tasks: trial.map(item => tasksByRoute.get(item)) });
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

export function planTogether(selectedRoutes, { tasks = [], sharedBackground = '', maxOutputTokens = 60000, inputBudgetTokens = 60000 } = {}) {
    const order = Object.keys(ui_workspaceState.WORKSPACE_ROUTES);
    const routes = [...selectedRoutes].filter(route => ui_workspaceState.WORKSPACE_ROUTES[route]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const tasksByRoute = new Map(tasks.map(task => [task.route, task]));
    const solo = [];
    const mergeable = [];
    for (const route of routes) {
        if (SOLO_REASON[route]) solo.push({ route, label: routeTitle(route), reason: SOLO_REASON[route] });
        else if (!tasksByRoute.has(route)) solo.push({ route, label: routeTitle(route), reason: '这一页现在不能和别的页放进同一次回复。' });
        else mergeable.push(route);
    }
    const packed = mergeable.length ? packRoutes(mergeable, tasksByRoute, sharedBackground, maxOutputTokens, inputBudgetTokens) : { groups: [], notes: [] };
    const mergedGroups = packed.groups.filter(group => group.length >= 2);
    const singleRoutes = packed.groups.filter(group => group.length < 2).flat();
    for (const route of singleRoutes) {
        const task = tasksByRoute.get(route);
        const alone = estimateTokens(assembleMergedPrompt({ sharedBackground, tasks: [task] }));
        solo.push({
            route, label: routeTitle(route),
            reason: alone > inputBudgetTokens ? '这一项单独发送也会按现有输入预算拦截，不会裁短内容。' : '这一项单独发送。',
        });
    }
    const requestCount = mergedGroups.length + solo.length;
    const lines = [`预计请求 ${requestCount} 次。最大输出仍是你设置的 ${maxOutputTokens}，这几页共用这一次回复的额度。`];
    mergedGroups.forEach((group, index) => {
        const prompt = assembleMergedPrompt({ sharedBackground, tasks: group.map(route => tasksByRoute.get(route)) });
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

export async function runMergedBatch({ prompt, tasks, request, save, pending, chatId }) {
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
    if (pending && chatId) pending.write(chatId, failed);
    return { saved, failed, providerRequests: 1 };
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
    await saveWithRetry(save, item.mode, session);
    pending?.remove(chatId, item.route);
    return { requested: true };
}

function previousSession(mode, context, memoryBank) {
    try { return core_cache.loadSession(mode, { context, chatId: memoryBank.chatId, memoryBank, clone: true }); }
    catch { return null; }
}

function holdModes(context, modes) {
    const keys = [];
    for (const mode of modes) {
        if (core_requestCoordinator.isModeGenerating(mode, context)) {
            throw core_text.safeUserError(`${core_constants.MODE_LABEL[mode] || mode}正在生成，等它结束再一起生成。`, 'RMT_LOGICAL_TASK_BUSY');
        }
        const key = core_requestCoordinator.generationTaskKeyForMode(mode, context);
        runtimeState.activeModeBuildScopes.add(key);
        keys.push(key);
    }
    return () => { for (const key of keys) runtimeState.activeModeBuildScopes.delete(key); };
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
        if (SOLO_REASON[route] || !MERGEABLE_ROUTES.includes(route)) continue;
        try { tasks.push(buildMergeTask(route, context, memoryBank, previousSession(ui_workspaceState.WORKSPACE_ROUTES[route].mode, context, memoryBank), date)); }
        catch (error) { blocked.push({ route, label: routeTitle(route), reason: core_text.safeErrorSummary(error) }); }
    }
    const plan = planTogether(routes, { tasks, sharedBackground, maxOutputTokens, inputBudgetTokens });
    for (const item of blocked) if (!plan.solo.some(row => row.route === item.route)) plan.solo.push(item);
    plan.requestCount = plan.mergedGroups.length + plan.solo.length;
    if (!plan.mergedGroups.length && plan.solo.length) {
        plan.summary = `这几项不能放进同一次回复。预计请求 ${plan.solo.length} 次，仍按原来的单项生成逐项发送。\n${plan.solo.map(item => `单独发送：${item.label}。${item.reason}`).join('\n')}`;
    } else if (blocked.length) {
        plan.summary += `\n${blocked.map(item => `单独发送：${item.label}。${item.reason}`).join('\n')}`;
    }
    const approved = typeof confirm === 'function' ? confirm(plan) : ui_overlay.confirmExplicitAction('一起生成', plan.summary);
    if (!approved) return { cancelled: true, plan, providerRequests: 0 };
    const modes = plan.mergedGroups.flat().map(route => ui_workspaceState.WORKSPACE_ROUTES[route].mode);
    const release = holdModes(context, modes);
    const pending = createPendingStore();
    let providerRequests = 0;
    try {
        const terms = [...new Set(modes.flatMap(mode => generation_client.generationWorldInfoScanTerms(mode, context)))];
        const envelope = modes.length ? await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: terms }) : '';
        for (const group of plan.mergedGroups) {
            const groupTasks = group.map(route => tasks.find(task => task.route === route));
            const prompt = assembleMergedPrompt({ sharedBackground, tasks: groupTasks });
            const outcome = await runMergedBatch({
                prompt, tasks: groupTasks, pending, chatId: core_context.comparableChatId(memoryBank.chatId),
                request: text => generation_client.requestValidatedSegment(text, '一起生成 · 同一次回复交回各页…', {
                    context, contextEnvelope: envelope, origin: null, mode: groupTasks[0].mode, background: true,
                }, value => {
                    if (!value || typeof value.modules !== 'object' || Array.isArray(value.modules)) throw core_text.safeUserError('一起生成没有返回各页结果。', 'RMT_MERGED_SHAPE');
                    return value;
                }),
                save: async (mode, session) => {
                    session.chatId = memoryBank.chatId;
                    session.archiveRevision = memoryBank.archiveRevision;
                    const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(memoryBank.chatId) };
                    const committed = await core_cache.commitSession(mode, session, memoryBank.chatId, origin);
                    if (!committed) throw core_text.safeUserError('这一页的结果已经通过校验，但还没有写上。', 'RMT_MERGED_SAVE');
                },
            });
            providerRequests += outcome.providerRequests;
        }
    } finally { release(); }
    return { cancelled: false, plan, providerRequests, soloRoutes: plan.solo.map(item => item.route), pending: pending.read(core_context.comparableChatId(memoryBank.chatId)) };
}

export async function repairPending(route) {
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const pending = createPendingStore();
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    const item = pending.read(chatId).find(row => row.route === route);
    if (!item) return { requested: false };
    const save = async (mode, session) => {
        session.chatId = memoryBank.chatId;
        session.archiveRevision = memoryBank.archiveRevision;
        const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(memoryBank.chatId) };
        const committed = await core_cache.commitSession(mode, session, memoryBank.chatId, origin);
        if (!committed) throw core_text.safeUserError('这一页的结果已经通过校验，但还没有写上。', 'RMT_MERGED_SAVE');
    };
    if (item.kind === 'unsaved') return runMergedRepair({ item, save, pending, chatId });
    const task = buildMergeTask(route, context, memoryBank, previousSession(item.mode, context, memoryBank));
    const release = holdModes(context, [task.mode]);
    try {
        return await runMergedRepair({
            item, save, pending, chatId, singlePrompt: task.singlePrompt, accept: task.accept,
            request: text => generation_client.requestValidatedSegment(text, `一起生成 · 只补${task.label}…`, {
                context, origin: null, mode: task.mode, background: true,
            }, value => value),
        });
    } finally { release(); }
}

export function pendingNote(chatId, store = createPendingStore()) {
    return store.read(chatId).map(item => item.kind === 'unsaved'
        ? `${item.label}已通过校验，还没写上`
        : `${item.label}还没完成：${item.reason}`);
}
