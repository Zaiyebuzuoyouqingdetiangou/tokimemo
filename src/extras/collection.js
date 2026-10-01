// 回忆收集率：只读取已保存的内容，全部在本地统计，不发请求、不写档案。
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as archive_repository from '../archive/repository.js';
import { state as runtimeState } from '../core/state.js';

const list = value => Array.isArray(value) ? value : [];

function sourceOptions() {
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot) return { options: { chatId: snapshot.chatId, memoryBank: snapshot.memory, cache: snapshot.cache || {}, clone: false, includePartial: true }, memory: snapshot.memory, context: null };
    const context = core_context.currentCharacterGuard();
    const memory = archive_repository.requireArchive(context);
    return { options: { context, memoryBank: memory, clone: false, includePartial: true }, memory, context };
}

export async function prepareCollectionSource() {
    if (runtimeState.activeArchiveSnapshot) return;
    const context = core_context.currentCharacterGuard();
    if (core_cache.isCompressedCacheRecord(context.chatMetadata?.[core_constants.CACHE_KEY])) await core_cache.ensureCacheHydrated(context);
}

function load(mode, options) {
    try { return core_cache.loadSession(mode, options); } catch { return null; }
}

function parseChatTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
    const raw = core_text.normalizeText(value, 80);
    if (!raw) return 0;
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;
    const m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour = Number(m[4]) % 12;
    if (/pm/i.test(m[6] || '')) hour += 12;
    if (!m[6]) hour = Number(m[4]);
    const parsed = Date.parse(`${m[1]} ${m[2]}, ${m[3]} ${String(hour).padStart(2, '0')}:${m[5]}:00`);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function messageTime(message) {
    return parseChatTime(message?.send_date) || parseChatTime(message?.gen_finished) || parseChatTime(message?.extra?.gen_finished) || 0;
}

export function chatSpanDays(context) {
    const chat = list(context?.chat);
    const first = chat.map(messageTime).find(Boolean) || 0;
    let last = 0;
    for (let i = chat.length - 1; i >= 0 && !last; i -= 1) last = messageTime(chat[i]);
    if (!first || !last || last < first) return 0;
    return Math.max(1, Math.round((last - first) / 86400000) + 1);
}

export function computeCollection() {
    const { options, memory, context } = sourceOptions();
    const album = load(core_constants.MODE.ALBUM, options);
    const adv = load(core_constants.MODE.ADV, options);
    const achievements = load(core_constants.MODE.ACHIEVEMENTS, options);
    const ending = load(core_constants.MODE.ENDING, options);
    const heart = load(core_constants.MODE.HEART, options);
    const inbox = load(core_constants.MODE.INBOX, options);
    const bedtime = load(core_constants.MODE.BEDTIME, options);
    const song = load(core_constants.MODE.THEME_SONG, options);
    const cabinet = load(core_constants.MODE.CABINET, options);
    const travel = load(core_constants.MODE.TRAVEL, options);
    const albumEntries = list(album?.entries);
    const advEvents = list(adv?.events);
    const achievementEntries = list(achievements?.entries);
    const endingRoutes = list(ending?.endings);
    const rows = [
        { id: 'album', name: '回忆相簿 CG', got: albumEntries.filter(item => item?.unlocked).length, total: albumEntries.length },
        { id: 'adv', name: 'ADV EVENT 正文', got: advEvents.filter(item => item?.adv).length, total: advEvents.length },
        { id: 'achievements', name: '成就', got: achievementEntries.filter(item => item?.unlocked).length, total: achievementEntries.length },
        { id: 'ending', name: 'ENDING 路线', got: endingRoutes.filter(item => item?.available).length, total: endingRoutes.length },
    ].filter(row => row.total > 0);
    const got = rows.reduce((sum, row) => sum + row.got, 0);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const counts = [
        { id: 'fireflies', name: '萤火虫', value: list(heart?.fireflyVoices).length, unit: '颗' },
        { id: 'letters', name: '收到的信', value: list(inbox?.letters).length, unit: '封' },
        { id: 'strips', name: '日常一格', value: list(heart?.dailyStrips).length, unit: '格' },
        { id: 'stories', name: '睡前故事', value: list(bedtime?.stories).length, unit: '篇' },
        { id: 'songs', name: '角色印象曲', value: list(song?.songs).length, unit: '首' },
        { id: 'cabinet', name: '陈列柜', value: list(cabinet?.items).length, unit: '件' },
        { id: 'places', name: '去过的地方', value: list(travel?.locations).length, unit: '处' },
    ];
    const cgUrl = item => { const url = item?.cgImage?.url; return typeof url === 'string' && /^(\/|https?:|blob:|data:image\/)/.test(url) ? url : ''; };
    const unlockedCg = albumEntries.filter(item => item?.unlocked);
    const withImage = unlockedCg.filter(cgUrl);
    const recent = (withImage.length ? withImage : unlockedCg).slice(-3).reverse().map(item => ({ kind: 'CG', title: core_text.normalizeText(item.title, 40), url: cgUrl(item) }));
    const memories = list(memory?.memories);
    const firstCg = albumEntries.find(item => item?.unlocked);
    const recommended = endingRoutes.find(item => item?.id === ending?.recommendedEndingId) || endingRoutes.find(item => item?.available);
    return {
        rows, got, total,
        percent: total ? Math.round(got / total * 100) : 0,
        counts, recent,
        graduation: {
            characterName: core_text.normalizeText(memory?.characterName || context?.name2, 80) || '他',
            userName: core_text.normalizeText(memory?.userName || context?.name1, 80) || '你',
            days: context ? chatSpanDays(context) : 0,
            memoryCount: memories.length,
            firstMemory: memories[0] ? `${memories[0].id} · ${core_text.normalizeText(memories[0].title, 60)}` : '',
            lastMemory: memories.length ? `${memories[memories.length - 1].id} · ${core_text.normalizeText(memories[memories.length - 1].title, 60)}` : '',
            firstCg: firstCg ? core_text.normalizeText(firstCg.title, 60) : '',
            firstPlace: core_text.normalizeText(list(travel?.locations)[0]?.name, 60),
            route: recommended ? core_text.normalizeText(recommended.title, 60) : '',
        },
    };
}

export function collectionCardStatus() {
    try {
        const data = computeCollection();
        return data.total ? `已点亮 ${data.percent}% · ${data.got} / ${data.total}` : '内容生成后在这里统计';
    } catch { return '先建立当前聊天档案'; }
}
