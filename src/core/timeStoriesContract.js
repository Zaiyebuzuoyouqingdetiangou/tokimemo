// Bounded inert story data. The renderer owns markup, themes, IDs and controls.
import * as safeData from './pastLivesContract.js';

export const TIME_ECHO_MODE = 'timeEcho';
export const TIME_JOURNEY_MODE = 'timeJourney';
export const TIME_STORY_VERSION = 1;
export const TIME_STORY_LIMITS = Object.freeze({ episodes: 48, lines: 120, encounters: 24,
    title: 120, prose: 30000, line: 3000, episodeChars: 180000, sessionChars: 1800000 });
export const TIME_STORY_PALETTES = Object.freeze(['rose', 'blue', 'moss', 'gold', 'plum', 'slate']);
export const TIME_STORY_PRESENTATIONS = Object.freeze(['modern', 'classical', 'fantasy', 'scifi', 'neutral']);
const MEDIA = ['phone', 'terminal', 'relic', 'object', 'voice'];

export function isTimeStoryMode(mode) { return mode === TIME_ECHO_MODE || mode === TIME_JOURNEY_MODE; }
export function timeStoryLabel(mode) { return mode === TIME_ECHO_MODE ? '时空回响' : mode === TIME_JOURNEY_MODE ? '时空旅行者的妻子' : '时空番外'; }
export function timeStoryError(code, message) {
    const error = new Error(message);
    Object.assign(error, { code: `RMT_TIME_STORY_${code}`, safeToDisplay: true, safeUserMessage: message, repairHint: message });
    return error;
}
export function timeStoryText(value, max = TIME_STORY_LIMITS.prose, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max)
        throw timeStoryError('STRUCTURE', '番外文字缺失或超过本段安全容量，旧篇章仍保留。');
    const result = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    if (required && !result) throw timeStoryError('STRUCTURE', '这一篇缺少完整正文，请补齐当前故事。');
    return result;
}
export function timeStoryArray(value, max) {
    if (!Array.isArray(value) || value.length > max)
        throw timeStoryError('STRUCTURE', '番外列表缺失或超过本地安全容量；无需凑满数量。');
    return value;
}
export function timeStoryData(value, max = TIME_STORY_LIMITS.sessionChars) {
    try { return safeData.pastLivesData(value, max); }
    catch { throw timeStoryError('STRUCTURE', '这份番外不是可安全读取的有界数据，原记录仍保留。'); }
}

export function timeStoryPresentation(profile = {}) {
    const style = typeof profile === 'string' ? profile : profile?.worldStyle;
    if (TIME_STORY_PRESENTATIONS.includes(style)) return style;
    return ['historical', 'nomadic', 'maritime'].includes(style) ? 'classical'
        : ['contemporary', 'institutional'].includes(style) ? 'modern' : 'neutral';
}
export function timeStoryMediumKinds(profile = {}) {
    const presentation = timeStoryPresentation(profile);
    const technology = typeof profile === 'object' && profile ? profile.technology : '';
    // Explicit low/unknown technology must never be upgraded by a visual style.
    if (technology === 'low' || technology === 'neutral') return ['object', 'voice'];
    if (technology === 'magical') return ['relic', 'object', 'voice'];
    if (technology === 'future' || technology === 'modern') return ['phone', 'terminal', 'object', 'voice'];
    return presentation === 'modern' || presentation === 'scifi' ? ['phone', 'terminal', 'object', 'voice']
        : presentation === 'fantasy' ? ['relic', 'object', 'voice'] : ['object', 'voice'];
}

export function assertTimeJourneyOrders(encounters) {
    const require = condition => { if (!condition) throw timeStoryError('STRUCTURE', '故事需有可阅读的场景，双方经历顺序请使用各自唯一的正整数。'); };
    require(encounters.length >= 1);
    for (const field of ['charOrder', 'userOrder']) {
        require(encounters.every(item => Number.isSafeInteger(item[field]) && item[field] > 0 && item[field] <= 100000));
        require(new Set(encounters.map(item => item[field])).size === encounters.length);
    }
}

// Reopening authenticates data shape and local references; it does not rejudge
// yesterday's story against a changed character card or relationship classifier.
export function timeStoriesStoredData(value) {
    const raw = timeStoryData(value), L = TIME_STORY_LIMITS;
    const require = condition => { if (!condition) throw timeStoryError('STRUCTURE', '这份番外结构暂不可读取，原记录保持不变。'); };
    const prose = (item, max = L.prose, required = true) => timeStoryText(item, max, required);
    const sequence = (items, max, pattern) => {
        const list = timeStoryArray(items, max), ids = new Set();
        for (const item of list) {
            require(item && typeof item.id === 'string' && pattern.test(item.id) && !ids.has(item.id)); ids.add(item.id);
        }
        return list;
    };
    require(raw && isTimeStoryMode(raw.kind) && raw.version === TIME_STORY_VERSION);
    for (const key of ['chatId', 'archiveRevision']) prose(raw[key], 240);
    for (const key of ['characterName', 'userName', 'title']) prose(raw[key], L.title);
    prose(raw.ownerKey, 1200, false);
    for (const episode of sequence(raw.episodes, L.episodes, /^TS\d{2,4}$/u)) {
        require(episode.fiction === true && TIME_STORY_PRESENTATIONS.includes(episode.presentation) && TIME_STORY_PALETTES.includes(episode.palette));
        prose(episode.title, L.title); prose(episode.opening); prose(episode.closing); prose(episode.motif, 160, false);
        if (raw.kind === TIME_ECHO_MODE) {
            require(MEDIA.includes(episode.medium?.kind)); prose(episode.medium.label, L.title);
            const ends = timeStoryArray(episode.ends, 2); require(ends.length === 2);
            for (const end of ends) { require(['char', 'user'].includes(end?.role)); prose(end.time, 240); }
            require(ends[0].time !== ends[1].time);
            const lines = timeStoryArray(episode.lines, L.lines);
            for (const line of lines) { require(['a', 'b', 'narrator'].includes(line?.speaker)); prose(line.text, L.line); }
            require(lines.some(line => line.speaker === 'a') && lines.some(line => line.speaker === 'b'));
            prose(episode.message, 1800);
        } else {
            require(['char', 'user'].includes(episode.traveler));
            const scenes = sequence(episode.encounters, L.encounters, /^S\d{2,4}$/u);
            assertTimeJourneyOrders(scenes);
            for (const scene of scenes) {
                prose(scene.title, L.title); prose(scene.charTime, 240); prose(scene.userTime, 240); prose(scene.text);
                prose(scene.charKnows, 1600, false); prose(scene.userKnows, 1600, false);
                prose(scene.waiting, L.prose, false);
            }
        }
    }
    return raw;
}

export function timeStoryReadingState(session) {
    const selected = (Array.isArray(session?.episodes) ? session.episodes : []).find(item => item?.id === session?.selectedId);
    const scenes = Array.isArray(selected?.encounters) ? selected.encounters : [];
    return { selectedId: selected?.id || '',
        selectedEntryId: scenes.some(item => item.id === session?.selectedEntryId) ? session.selectedEntryId : scenes[0]?.id || '',
        view: selected && session?.view === 'story' ? 'story' : 'library',
        dialogueIndex: Math.max(0, Math.min(selected?.lines?.length || 0, Math.floor(Number(session?.dialogueIndex) || 0))),
        reading: session?.reading === true,
        tab: ['story', 'char', 'user'].includes(session?.tab) ? session.tab : 'story' };
}
