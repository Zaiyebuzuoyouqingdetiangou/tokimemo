import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { composeOutgoingGenerationPrompt } from '../src/generation/client.js';
import {
    MERGED_NOW, acquireGenerationScopes, assembleMergedPrompt, buildMergeTask, createPendingStore, estimateTokens, planTogether, runMergedBatch, runMergedRepair, sharedBackgroundText,
} from '../src/generation/mergedGeneration.js';

const memory = {
    chatId: 'chat-together',
    archiveRevision: 'rev-together',
    archiveName: '测试档案',
    archiveSummary: 'SHARED_BACKGROUND_SENTENCE_共同档案摘要只放一份。',
    archiveKeywords: [],
    characterName: '林深',
    userName: '阿宁',
    memories: [{
        id: 'M001',
        title: '雨天的票根',
        summary: '林深把一张票根放进阿宁的掌心，两人一起听完了最后一首。',
        anchors: ['票根还在'],
        participants: ['林深', '阿宁'],
    }],
};
const context = { name1: '阿宁', name2: '林深' };
const when = new Date('2026-09-22T12:00:00+09:00');
const routes = ['cabinet', 'achievements', 'inbox', 'themeSong'];

function tasks() {
    return routes.map(route => buildMergeTask(route, context, memory, null, when));
}

function modules() {
    return {
        cabinet: {
            items: [{
                name: '票根',
                objectEvidence: '林深把一张票根放进阿宁的掌心，两人一起听完了最后一首。',
                sourceMemoryIds: ['M001'],
                sourceMemoryAnchor: '雨天的票根',
            }],
        },
        achievements: {
            title: '成就库',
            entries: [{
                id: 'ACH01', title: '下次再听', description: '还没有发生的一个目标。',
                category: '特别', tier: 'bronze', unlocked: false, hint: '以后再说',
            }],
        },
        inbox: {
            letters: [{ slot: 'daily', title: '今晚', greeting: '窗边', body: '窗开了一条缝，风是凉的，今晚先把灯留着。', closing: '林深' }],
        },
        themeSong: {
            title: '窗边',
            vocalDescription: '中低音，轻轻唱',
            styleDescription: '慢板钢琴，夜里的人声。',
            stylePrompt: 'slow piano, intimate vocal, night',
            lyrics: '[Verse 1]\n窗边有风\n[Chorus]\n把灯留着\n[End]',
        },
    };
}

function disk() {
    const sessions = new Map();
    return {
        sessions,
        async save(mode, session) { sessions.set(mode, structuredClone(session)); },
        load(mode) { return sessions.has(mode) ? structuredClone(sessions.get(mode)) : null; },
    };
}

function storage() {
    const box = new Map();
    return { getItem: key => box.get(key) ?? null, setItem: (key, value) => box.set(key, String(value)) };
}

function api(reply) {
    const sent = [];
    return {
        sent,
        get count() { return sent.length; },
        async request(prompt) {
            sent.push(prompt);
            return reply(prompt, sent.length);
        },
    };
}

test('four pages succeed in one request and can be reopened', async () => {
    const pageTasks = tasks();
    const shared = sharedBackgroundText(context, memory);
    const prompt = assembleMergedPrompt({ sharedBackground: shared, tasks: pageTasks });
    const plan = planTogether(routes, { tasks: pageTasks, sharedBackground: shared, maxOutputTokens: 60000, inputBudgetTokens: 60000 });
    assert.equal(plan.requestCount, 1);
    assert.equal(plan.mergedGroups.length, 1);
    const store = disk();
    const pending = createPendingStore(storage());
    const model = api(() => ({ modules: modules() }));
    const outcome = await runMergedBatch({ prompt, tasks: pageTasks, request: model.request, save: store.save, pending, chatId: memory.chatId });
    assert.equal(model.count, 1);
    assert.equal(outcome.saved.length, 4);
    assert.equal(outcome.failed.length, 0);
    const reopened = {
        cabinet: store.load('cabinet'),
        achievements: store.load('achievements'),
        inbox: store.load('inbox'),
        themeSong: store.load('themeSong'),
    };
    assert.equal(reopened.cabinet.items.length, 1);
    assert.equal(reopened.achievements.entries.length, 1);
    assert.equal(reopened.inbox.letters.length, 1);
    assert.equal(reopened.themeSong.songs.length, 1);
    assert.equal(reopened.cabinet.kind, 'cabinet');
    assert.equal(reopened.inbox.kind, 'inbox');
    assert.equal(pending.read(memory.chatId).length, 0);
});

test('three pages stay saved and the repair request only contains the failed page', async () => {
    const pageTasks = tasks();
    const shared = sharedBackgroundText(context, memory);
    const prompt = assembleMergedPrompt({ sharedBackground: shared, tasks: pageTasks });
    const store = disk();
    const pending = createPendingStore(storage());
    const broken = modules();
    broken.themeSong = null;
    const model = api(text => {
        if (model.count === 1) return { modules: broken };
        return {
            title: '窗边',
            vocalDescription: '中低音，轻轻唱',
            styleDescription: '慢板钢琴，夜里的人声。',
            stylePrompt: 'slow piano, intimate vocal, night',
            lyrics: '[Verse 1]\n窗边有风\n[Chorus]\n把灯留着\n[End]',
        };
    });
    const outcome = await runMergedBatch({ prompt, tasks: pageTasks, request: model.request, save: store.save, pending, chatId: memory.chatId });
    assert.equal(model.count, 1);
    assert.deepEqual(outcome.saved.map(item => item.route).sort(), ['achievements', 'cabinet', 'inbox']);
    assert.equal(outcome.failed.length, 1);
    assert.equal(outcome.failed[0].route, 'themeSong');
    assert.equal(store.load('themeSong'), null);
    const kept = store.load('cabinet').items[0].name;
    const waiting = pending.read(memory.chatId);
    assert.equal(waiting.length, 1);
    const song = pageTasks.find(task => task.route === 'themeSong');
    await runMergedRepair({
        item: waiting[0], request: model.request, save: store.save, pending, chatId: memory.chatId,
        singlePrompt: song.singlePrompt, accept: song.accept,
    });
    assert.equal(model.count, 2);
    assert.equal(model.sent[1].includes('不得从世界书推测'), false);
    assert.equal(model.sent[1].includes('未解锁成就只能表示'), false);
    assert.equal(model.sent[1].includes('不是通知报告'), false);
    assert.equal(model.sent[1].includes('副歌同上'), true);
    assert.equal(store.load('cabinet').items[0].name, kept);
    assert.equal(store.load('themeSong').songs.length, 1);
    assert.equal(pending.read(memory.chatId).length, 0);
});

test('shared background is sent once and each page keeps its own requirements', () => {
    const pageTasks = tasks();
    const shared = sharedBackgroundText(context, memory);
    const prompt = assembleMergedPrompt({ sharedBackground: shared, tasks: pageTasks });
    assert.equal(prompt.split('SHARED_BACKGROUND_SENTENCE_共同档案摘要只放一份。').length - 1, 1);
    assert.equal(prompt.includes('不得从世界书推测'), true);
    assert.equal(prompt.includes('未解锁成就只能表示'), true);
    assert.equal(prompt.includes('不是通知报告'), true);
    assert.equal(prompt.includes('副歌同上'), true);
    assert.equal(prompt.includes('不要为了放在一起而缩短'), true);
});

test('a save failure retries the save and does not send another request', async () => {
    const pageTasks = tasks().filter(task => task.route === 'cabinet');
    const store = disk();
    let attempts = 0;
    const save = async (mode, session) => {
        attempts += 1;
        if (attempts === 1) throw new Error('磁盘忙');
        await store.save(mode, session);
    };
    const model = api(() => ({ modules: { cabinet: modules().cabinet } }));
    const outcome = await runMergedBatch({
        prompt: 'unused', tasks: pageTasks, request: model.request, save, pending: createPendingStore(storage()), chatId: memory.chatId,
    });
    assert.equal(model.count, 1);
    assert.equal(attempts, 2);
    assert.equal(outcome.saved.length, 1);
    assert.equal(store.load('cabinet').items.length, 1);
});

test('pages that depend on each other stay separate requests', () => {
    const pageTasks = tasks();
    const shared = sharedBackgroundText(context, memory);
    const plan = planTogether(['room', ...routes], { tasks: pageTasks, sharedBackground: shared, maxOutputTokens: 60000, inputBudgetTokens: 60000 });
    assert.equal(plan.mergedGroups.some(group => group.includes('room')), false);
    assert.equal(plan.solo.some(item => item.route === 'room'), true);
    assert.equal(plan.requestCount, 2);
    assert.equal(plan.summary.includes('预计请求 2 次'), true);
    assert.equal(plan.summary.includes('这次还没接入合并'), true);
    assert.equal(plan.summary.includes(MERGED_NOW), true);
    assert.equal(plan.summary.includes('以后都不能'), false);
    const tight = planTogether(routes, { tasks: pageTasks, sharedBackground: shared, maxOutputTokens: 5000, inputBudgetTokens: 60000 });
    assert.equal(tight.requestCount > 1, true);
    assert.equal(tight.summary.includes('没有缩短'), true);
});

test('pending rows for other tasks stay when this batch records a gap', async () => {
    const pending = createPendingStore(storage());
    pending.write(memory.chatId, [{ route: 'room', mode: 'room', label: '他的房间', kind: 'invalid', reason: '上一轮留下的' }]);
    const pageTasks = tasks().filter(task => task.route === 'cabinet');
    const model = api(() => ({ modules: { cabinet: null } }));
    await runMergedBatch({
        prompt: 'unused', tasks: pageTasks, request: model.request, save: disk().save, pending, chatId: memory.chatId,
    });
    const rows = pending.read(memory.chatId);
    assert.equal(rows.some(row => row.route === 'room' && row.reason === '上一轮留下的'), true);
    assert.equal(rows.some(row => row.route === 'cabinet' && row.kind === 'invalid'), true);
});

test('a repair that checks out but fails to save becomes save-only', async () => {
    const song = tasks().find(task => task.route === 'themeSong');
    const pending = createPendingStore(storage());
    pending.write(memory.chatId, [{ route: 'themeSong', mode: 'themeSong', label: song.label, kind: 'invalid', reason: '这一页没有返回' }]);
    const model = api(() => modules().themeSong);
    await assert.rejects(() => runMergedRepair({
        item: pending.read(memory.chatId)[0], request: model.request,
        save: async () => { throw new Error('磁盘忙'); },
        pending, chatId: memory.chatId, singlePrompt: song.singlePrompt, accept: song.accept,
    }));
    assert.equal(model.count, 1);
    const waiting = pending.read(memory.chatId);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].kind, 'unsaved');
    assert.equal(typeof waiting[0].session, 'object');
    const again = api(() => { throw new Error('不应再请求'); });
    const store = disk();
    await runMergedRepair({
        item: waiting[0], request: again.request, save: store.save, pending, chatId: memory.chatId,
        singlePrompt: song.singlePrompt, accept: song.accept,
    });
    assert.equal(again.count, 0);
    assert.equal(store.load('themeSong').songs.length, 1);
    assert.equal(pending.read(memory.chatId).length, 0);
});

test('a failed generation-status check releases scopes already taken', () => {
    const held = new Set();
    assert.throws(() => acquireGenerationScopes(['cabinet', 'inbox'], {
        running: mode => { if (mode === 'inbox') throw new Error('状态读失败'); return false; },
        keyFor: mode => mode,
        add: key => held.add(key),
        remove: key => held.delete(key),
    }), /状态读失败/);
    assert.equal(held.size, 0);
});

test('input preview counts the final outgoing request', () => {
    const pageTasks = tasks();
    const shared = sharedBackgroundText(context, memory);
    const measure = groupTasks => `ENVELOPE_MARKER\n${assembleMergedPrompt({ sharedBackground: shared, tasks: groupTasks })}`;
    const plan = planTogether(routes, { tasks: pageTasks, sharedBackground: shared, maxOutputTokens: 60000, inputBudgetTokens: 60000, measure });
    const full = measure(pageTasks);
    assert.equal(plan.summary.includes(`输入约 ${estimateTokens(full)} tokens`), true);
    assert.equal(estimateTokens(full) > estimateTokens(assembleMergedPrompt({ sharedBackground: shared, tasks: pageTasks })), true);
    const outgoing = composeOutgoingGenerationPrompt(assembleMergedPrompt({ sharedBackground: shared, tasks: pageTasks.slice(0, 1) }), context, {}, 'ENVELOPE_MARKER');
    assert.equal(outgoing.startsWith('ENVELOPE_MARKER\n'), true);
    assert.equal(outgoing.includes('【输出】\n只输出一个 JSON 对象'), true);
    assert.equal(outgoing.split('【最短合法例子】').length - 1, 1);
});

test('provider request count follows real sends', async () => {
    let sends = 0;
    const outcome = await runMergedBatch({
        prompt: 'unused', tasks: tasks().filter(task => task.route === 'cabinet'),
        request: async () => { sends += 2; return { modules: { cabinet: modules().cabinet } }; },
        save: disk().save, pending: createPendingStore(storage()), chatId: memory.chatId,
        sends: { read: () => sends },
    });
    assert.equal(outcome.providerRequests, 2);
});

test('merged generation does not launch the old generators together', async () => {
    const source = await readFile(new URL('../src/generation/mergedGeneration.js', import.meta.url), 'utf8');
    assert.equal(source.includes('Promise.all'), false);
    assert.equal(source.includes('generateMode'), false);
});
