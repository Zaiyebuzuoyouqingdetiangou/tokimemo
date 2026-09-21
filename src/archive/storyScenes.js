// Read-only time-scene extraction for archive import. Never writes worldbooks,
// BaiBai/QQJ stores, or chat floors. Dates are comparable only after the user
// confirms a fill (manual or AI preview).
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as story_chronology from '../core/storyChronology.js';
import * as archive_memoryProviders from './memoryProviders.js';
import * as archive_qianqianjie from './qianqianjie.js';
import * as archive_repository from './repository.js';
import * as sourceGuard from './sourceReadGuard.js';

export const SCENE_BATCH_SIZE = 20;
const TIME_HEADING = /^-+\s*时间\s*[：:]\s*(.+)$/gmu;

export function sceneSortKey(scene, index = 0) {
    const date = story_chronology.comparableStoryDate(scene?.date || scene?.timeLabel);
    const tagged = date ? 0 : 1;
    const parts = date?.parts || [9e15, 12, 31];
    return [tagged, date?.calendar || '\uffff', parts[0] || 0, parts[1] || 0, parts[2] || 0,
        Number(scene?.messageIndex) || 0, Number(scene?.displayIndex) || 0, Number(scene?.sceneIndex) || 0, index];
}

export function sortScenes(scenes) {
    return (Array.isArray(scenes) ? scenes : []).map((scene, index) => ({ scene, index, rank: sceneSortKey(scene, index) }))
        .sort((left, right) => {
            for (let i = 0; i < left.rank.length; i += 1) {
                if (left.rank[i] < right.rank[i]) return -1;
                if (left.rank[i] > right.rank[i]) return 1;
            }
            return 0;
        })
        .map(row => row.scene);
}

export function splitWorldbookTimeScenes(entry, { world = '', displayIndex = 0 } = {}) {
    const content = String(entry?.content || '').replace(/\u0000/g, '');
    if (!content.trim()) return [];
    const matches = [...content.matchAll(TIME_HEADING)];
    if (!matches.length) {
        return [{
            id: `wb:${world}:${entry?.uid || displayIndex}:0`,
            provider: 'worldbook',
            world: core_text.normalizeText(world, 240),
            uid: core_text.normalizeText(entry?.uid, 120),
            title: core_text.normalizeText(entry?.title, 180) || '世界书条目',
            timeLabel: '',
            date: '',
            plot: core_text.normalizeText(content, 8000),
            displayIndex,
            sceneIndex: 0,
        }];
    }
    return matches.map((match, sceneIndex) => {
        const start = match.index + match[0].length;
        const end = sceneIndex + 1 < matches.length ? matches[sceneIndex + 1].index : content.length;
        const timeLabel = core_text.normalizeText(match[1], 180);
        return {
            id: `wb:${world}:${entry?.uid || displayIndex}:${sceneIndex}`,
            provider: 'worldbook',
            world: core_text.normalizeText(world, 240),
            uid: core_text.normalizeText(entry?.uid, 120),
            title: core_text.normalizeText(entry?.title, 180) || timeLabel || '时间场景',
            timeLabel,
            date: story_chronology.comparableStoryDate(timeLabel) ? timeLabel : '',
            plot: core_text.normalizeText(content.slice(start, end).trim(), 8000),
            displayIndex,
            sceneIndex,
        };
    }).filter(scene => scene.plot || scene.timeLabel);
}

function characterWorldNames(context) {
    const character = context?.characters?.[Number(context?.characterId)];
    const data = character?.data && typeof character.data === 'object' ? character.data : (character || {});
    const extras = data?.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    const names = [
        data?.character_book?.name,
        extras.world,
        character?.data?.character_book?.name,
        ...(Array.isArray(extras.worlds) ? extras.worlds : []),
    ];
    return core_text.cleanArray(names, 40, 240);
}

function enabledWorldNames(context) {
    const settings = context?.worldInfoSettings || context?.world_info || {};
    const global = settings.globalSelect || settings.global_select || [];
    const chat = context?.chatMetadata?.world_info || context?.chatMetadata?.worldInfo || {};
    const names = [
        ...(Array.isArray(global) ? global : []),
        ...(Array.isArray(chat?.character) ? chat.character : []),
        ...(Array.isArray(chat?.global) ? chat.global : []),
        chat?.character,
        chat?.global,
    ];
    return core_text.cleanArray(names, 80, 240);
}

export async function listSceneWorldbookNames(context = core_context.currentCharacterGuard()) {
    const listed = typeof context.getWorldInfoNames === 'function'
        ? core_text.cleanArray(await context.getWorldInfoNames(), 500, 240) : [];
    const selected = archive_repository.getMemoryWorldInfoSelection(context).books.map(book => book.name);
    return [...new Set([...characterWorldNames(context), ...enabledWorldNames(context), ...selected, ...listed].filter(Boolean))];
}

export async function collectWorldbookScenes(context = core_context.currentCharacterGuard(), signal = null) {
    const names = await listSceneWorldbookNames(context);
    const scenes = [];
    for (const [displayIndex, name] of names.entries()) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        let entries = [];
        try { entries = await archive_repository.loadMemoryWorldInfoBook(context, name, signal); }
        catch { continue; }
        entries.forEach((entry, entryIndex) => {
            scenes.push(...splitWorldbookTimeScenes(entry, { world: name, displayIndex: displayIndex * 1000 + entryIndex }));
        });
    }
    return scenes;
}

function baibaiDate(record) {
    return core_text.normalizeText(
        record?.timeStart || record?.timeLabel || record?.date || record?.timeEnd || record?.timestamp || record?.createdAt,
        100,
    );
}

export async function collectBaiBaiScenes(context = core_context.currentCharacterGuard(), signal = null) {
    const provider = archive_memoryProviders.findBaiBaiBookPublicApi();
    if (!provider) return [];
    const expectedChatId = core_context.getChatId(context);
    const batch = await sourceGuard.boundedSourceRead(
        () => archive_memoryProviders.readBaiBaiBookCurrentChat(provider, expectedChatId, signal),
        signal,
    );
    return (batch?.records || []).map((record, index) => {
        const date = baibaiDate(record);
        return {
            id: `baibai:${record.sourceId || index}`,
            provider: 'baibai',
            title: core_text.normalizeText(record.title, 180) || `柏宝书 ${index + 1}`,
            timeLabel: core_text.normalizeText(record.timeLabel || record.timeStart || record.timeEnd, 180),
            date,
            timeStart: core_text.normalizeText(record.timeStart, 100),
            timeEnd: core_text.normalizeText(record.timeEnd, 100),
            plot: core_text.normalizeText(record.content, 8000),
            displayIndex: index,
            sceneIndex: 0,
        };
    }).filter(scene => scene.plot);
}

export async function collectQianQianJieScenes(context = core_context.currentCharacterGuard(), signal = null) {
    const batch = await archive_qianqianjie.readQianQianJieCurrentChat(context, { signal, assertCurrent: () => {} });
    return (batch?.records || []).map((record, index) => ({
        id: `qqj:${record.sourceId || index}`,
        provider: 'qianqianjie',
        title: core_text.normalizeText(record.title, 180) || `第 ${Number(record.messageIndex) + 1 || index + 1} 楼摘要`,
        timeLabel: '',
        date: '',
        plot: core_text.normalizeText(record.content, 8000),
        messageIndex: Number.isSafeInteger(record.messageIndex) ? record.messageIndex : index,
        displayIndex: index,
        sceneIndex: 0,
    })).filter(scene => scene.plot);
}

export async function collectStoryScenes(context = core_context.currentCharacterGuard(), signal = null) {
    const [worldbook, baibai, qqj] = await Promise.all([
        collectWorldbookScenes(context, signal),
        collectBaiBaiScenes(context, signal),
        collectQianQianJieScenes(context, signal),
    ]);
    return sortScenes([...worldbook, ...baibai, ...qqj]);
}

export function applySceneDate(scene, value) {
    const date = core_text.normalizeText(value, 100);
    const parsed = story_chronology.comparableStoryDate(date);
    return { ...scene, date: parsed ? date : date, unlabeled: !parsed };
}

export function earliestScenes(scenes, limit = SCENE_BATCH_SIZE) {
    return sortScenes(scenes).slice(0, Math.max(1, Math.min(SCENE_BATCH_SIZE, Number(limit) || SCENE_BATCH_SIZE)));
}

export function scenesToExternalRecords(scenes) {
    return (Array.isArray(scenes) ? scenes : []).slice(0, SCENE_BATCH_SIZE).map((scene, index) => ({
        externalId: core_text.normalizeText(scene.id, 120) || `scene:${index + 1}`,
        provider: `story-scene:${scene.provider || 'unknown'}`,
        providerKey: `story-scene:${scene.provider || 'unknown'}`,
        type: 'time-scene',
        date: core_text.normalizeText(scene.date || scene.timeLabel, 100),
        title: core_text.normalizeText(scene.title || scene.timeLabel, 180),
        content: [
            scene.timeLabel ? `时间：${scene.timeLabel}` : '',
            scene.date ? `日期：${scene.date}` : '',
            scene.world ? `世界书：${scene.world}` : '',
            scene.plot,
        ].filter(Boolean).join('\n'),
    }));
}

export function estimateDatePrompt(scenes) {
    const rows = (Array.isArray(scenes) ? scenes : []).slice(0, SCENE_BATCH_SIZE).map((scene, index) => ({
        id: scene.id,
        timeLabel: scene.timeLabel || '',
        plot: core_text.normalizeText(scene.plot, 400),
        index,
    }));
    return `你正在为心迹回廊整理「剧情日期」。下面每条是一段已发生的时间场景，不是设定。
请为每条估计一个可排序日期。公历用 YYYY/MM/DD；古风/历年用「纪年+年+月+日」文字，例如「庆历四年二月初五日」。估不出就 date 留空。
只输出 JSON：{"dates":[{"id":"...","date":"...","reason":"不超过40字"}]}
SCENES_JSON:
${JSON.stringify(rows, null, 2)}`;
}
