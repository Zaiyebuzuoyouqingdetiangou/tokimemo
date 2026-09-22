import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    assembleMergedPrompt, buildMergeTask, createPendingStore, planTogether, runMergedBatch, runMergedRepair, sharedBackgroundText,
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
    const tight = planTogether(routes, { tasks: pageTasks, sharedBackground: shared, maxOutputTokens: 5000, inputBudgetTokens: 60000 });
    assert.equal(tight.requestCount > 1, true);
    assert.equal(tight.summary.includes('没有缩短'), true);
});

test('merged generation does not launch the old generators together', async () => {
    const source = await readFile(new URL('../src/generation/mergedGeneration.js', import.meta.url), 'utf8');
    assert.equal(source.includes('Promise.all'), false);
    assert.equal(source.includes('generateMode'), false);
});
