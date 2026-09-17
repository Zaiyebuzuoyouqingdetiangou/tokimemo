// Bounded text-only creative works. Never a source of historical archive facts.
import * as safeData from './pastLivesContract.js';
import * as text from './text.js';
export const THEME_SONG_MODE = 'themeSong';
export const THEME_SONG_VERSION = 1;
export const SONG_LIMITS = Object.freeze({ songs: 80, title: 120, style: 900, description: 1200,
    vocal: 400, lyrics: 5000, direction: 400, songChars: 14000, sessionChars: 1200000 });
export const SONG_LANGUAGES = Object.freeze({ zh: '中文', ja: '日语', en: '英语', ko: '韩语', custom: '自定义' });
export const SONG_VOICES = Object.freeze({ char: '角色独唱', duet: '双人合唱', narrator: '旁观者演唱', ensemble: '群像' });
export function songError(code, message) { return text.safeUserError(message, `RMT_SONG_${code}`); }
export function songData(value, max = SONG_LIMITS.sessionChars) {
    try { return safeData.pastLivesData(value, max); }
    catch { throw songError('STRUCTURE', '印象曲不是可安全读取的有界文本，原作品保留。'); }
}
export function songText(value, max, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || required && !value.trim())
        throw songError('FIELDS', '印象曲字段缺失或过长；请保留完整歌名、曲风和歌词。');
    return value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
}
export function customSongLanguage(value) {
    const label = songText(value, 40, true);
    if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} /()+._·（）-]{0,39}$/u.test(label))
        throw songError('LANGUAGE', '请填写有效的歌词语言名称。');
    return label;
}
export function songLanguageLabel(song) {
    return song?.language === 'custom' ? customSongLanguage(song.customLanguage) : SONG_LANGUAGES[song?.language] || SONG_LANGUAGES.zh;
}
export function assertCompleteLyrics(value) {
    const lyrics = songText(value, SONG_LIMITS.lyrics, true);
    // Structure, not a verse/word quota. No silent clipping or filling repeated sections.
    const sections = [...lyrics.matchAll(/^\[([^\]\n]+)\][ \t]*\n?/gm)];
    const hasWords = name => sections.some((m, i) => name.test(m[1])
        && !!lyrics.slice(m.index + m[0].length, sections[i + 1]?.index ?? lyrics.length).trim());
    if (!hasWords(/^Verse(?: \d+)?$/) || !hasWords(/^(?:Final )?Chorus$/)
        || !/^\[End\]$/m.test(lyrics) || !lyrics.endsWith('[End]')
        || sections.some((m, i) => m[1] === 'End' && i !== sections.length - 1)
        || /(?:歌词待补|副歌同上|重复上文|其余省略|repeat (?:the )?(?:chorus|above)|lyrics here)/iu.test(lyrics))
        throw songError('LYRICS', '歌词尚未完整返回；需要完整主歌、副歌与收尾，不用占位文字代替。');
    return lyrics;
}
export function emptyThemeSongs(memory, ownerKey = '') {
    return { kind: THEME_SONG_MODE, themeSongVersion: THEME_SONG_VERSION,
        chatId: memory.chatId, archiveRevision: memory.archiveRevision, ownerKey,
        characterName: memory.characterName || '', userName: memory.userName || '', songs: [], selectedId: '' };
}
export function normalizeStoredThemeSongs(value, memory = null) {
    const raw = songData(value);
    if (raw.kind !== THEME_SONG_MODE || raw.themeSongVersion !== THEME_SONG_VERSION
        || !Array.isArray(raw.songs) || raw.songs.length > SONG_LIMITS.songs)
        throw songError('STRUCTURE', '这份印象曲结构暂不可读取，原作品保留。');
    for (const key of ['chatId', 'archiveRevision']) songText(raw[key], 240, true);
    for (const key of ['characterName', 'userName']) songText(raw[key], 120, true);
    songText(raw.ownerKey, 1200);
    if (memory && (raw.chatId !== memory.chatId || raw.archiveRevision !== memory.archiveRevision
        || raw.characterName !== memory.characterName || raw.userName !== memory.userName))
        throw songError('SOURCE', '印象曲所属角色、聊天或档案版本已变化。');
    const used = new Set();
    for (const song of raw.songs) {
        if (!song || !/^SONG_[a-z0-9_-]{1,80}$/u.test(song.id || '') || used.has(song.id)
            || !Object.hasOwn(SONG_LANGUAGES, song.language) || !Object.hasOwn(SONG_VOICES, song.voice)
            || !['character', 'event'].includes(song.subject) || song.fiction !== true
            || !Number.isFinite(song.createdAt) || song.createdAt < 0)
            throw songError('STRUCTURE', '印象曲条目身份或结构不完整，原作品保留。');
        used.add(song.id);
        if (song.language === 'custom') customSongLanguage(song.customLanguage);
        songText(song.title, SONG_LIMITS.title, true); songText(song.singer, 300, true);
        songText(song.vocalDescription, SONG_LIMITS.vocal, true);
        songText(song.styleDescription, SONG_LIMITS.description, true);
        songText(song.stylePrompt, SONG_LIMITS.style, true); assertCompleteLyrics(song.lyrics);
        if (!Array.isArray(song.sourceMemoryIds) || song.sourceMemoryIds.length > 1
            || song.sourceMemoryIds.some(id => !/^M\d+$/u.test(id))) throw songError('SOURCE', '印象曲事件来源格式无效。');
        songText(song.sourceMemoryAnchor, 160); songText(song.subjectTitle, 240, true);
        if (song.subject === 'character' && (song.sourceMemoryIds.length || song.sourceMemoryAnchor)
            || song.subject === 'event' && (!song.sourceMemoryIds.length || !song.sourceMemoryAnchor))
            throw songError('SOURCE', '角色印象与事件来源必须分开，不能补造记忆编号。');
    }
    raw.selectedId = typeof raw.selectedId === 'string' && used.has(raw.selectedId) ? raw.selectedId : raw.songs[0]?.id || '';
    return raw;
}
export function readableThemeSongs(value, memory) {
    try { normalizeStoredThemeSongs(value, memory); return true; } catch { return false; }
}
export function mergeThemeSongs(latest, incoming) {
    const next = normalizeStoredThemeSongs(incoming);
    if (!latest) return next;
    const previous = normalizeStoredThemeSongs(latest);
    for (const key of ['chatId', 'archiveRevision', 'characterName', 'userName']) {
        if (previous[key] !== next[key]) throw songError('SOURCE', '印象曲所属聊天或档案版本已变化。');
    }
    if (previous.ownerKey && next.ownerKey && previous.ownerKey !== next.ownerKey)
        throw songError('SOURCE', '印象曲所属角色已变化。');
    const byId = new Map(previous.songs.map(song => [song.id, song]));
    for (const song of next.songs) {
        const saved = byId.get(song.id);
        if (saved) {
            if (JSON.stringify(saved) !== JSON.stringify(song)) throw songError('CONFLICT', '同一首印象曲已被更新，旧作品没有覆盖。');
            continue;
        }
        if (previous.songs.length >= SONG_LIMITS.songs) throw songError('LIMIT', '印象曲已到本地容量上限；已有作品保留，请先备份整理。');
        previous.songs.push(song); byId.set(song.id, song);
    }
    previous.selectedId ||= previous.songs[0]?.id || '';
    return previous;
}
export function themeSongExport(song, field = 'all') {
    // Allowlisted fields, never a provider-selected property or filename.
    if (field === 'title') return song.title;
    if (field === 'style') return song.stylePrompt;
    if (field === 'lyrics') return song.lyrics;
    return `歌名\n${song.title}\n\n演唱者（创作设定）\n${song.singer}\n${song.vocalDescription}\n\n曲风描述\n${song.styleDescription}\n\n风格提示词\n${song.stylePrompt}\n\n完整歌词\n${song.lyrics}\n`;
}
