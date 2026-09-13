// Local data and presentation contract. No model-owned markup, selectors or assets.
export const PAST_LIVES_MODE = 'pastLives';
export const PAST_LIVES_VERSION = 1;
export const PAST_LIVES_LIMITS = Object.freeze({ episodes: 48, dossiers: 6, clues: 18, echoes: 12, annotations: 12,
    title: 120, prose: 6000, episodeChars: 180000, sessionChars: 1800000 });
export const PAST_LIVES_CLUE_KINDS = Object.freeze(['object', 'testimony', 'missing', 'note']);
export const PAST_LIVES_VIEWS = Object.freeze(['library', 'draw', 'dossier', 'echoes', 'closing']);

export function pastLivesError(code, message) {
    const error = new Error(message);
    error.code = `RMT_PAST_LIVES_${code}`;
    error.safeToDisplay = true;
    error.safeUserMessage = message;
    error.repairHint = message;
    return error;
}

export function pastLivesText(value, max = PAST_LIVES_LIMITS.prose, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max) throw pastLivesError('STRUCTURE', '番外文字缺失或超过本段安全容量，旧内容与成功进度仍保留。');
    const result = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    if (required && !result) throw pastLivesError('STRUCTURE', '番外这一段缺少正文，请补齐当前段。');
    return result;
}

export function pastLivesArray(value, max) {
    if (!Array.isArray(value) || value.length > max) throw pastLivesError('STRUCTURE', '番外列表缺失或超过安全容量；不要求凑满数量。');
    return value;
}

// A bounded JSON snapshot rejects getters and custom prototypes before any field is read.
export function pastLivesData(value, maxChars = PAST_LIVES_LIMITS.sessionChars) {
    let nodes = 0;
    const active = new Set();
    const copy = (item, depth) => {
        if (++nodes > 80000 || depth > 24) throw new Error('bounds');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'string') { if (item.length > maxChars) throw new Error('size'); return item; }
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (!item || typeof item !== 'object' || active.has(item)) throw new Error('data');
        const proto = Object.getPrototypeOf(item);
        if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) throw new Error('prototype');
        active.add(item);
        if (Array.isArray(item) && item.length > 10000) throw new Error('bounds');
        const descriptors = Object.getOwnPropertyDescriptors(item);
        const result = Array.isArray(item) ? [] : Object.create(null);
        const keys = Array.isArray(item) ? Array.from({ length: item.length }, (_, i) => String(i)) : Object.keys(descriptors);
        if (keys.length > 10000) throw new Error('bounds');
        for (const key of keys) {
            const descriptor = descriptors[key];
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) throw new Error('accessor');
            result[key] = copy(descriptor.value, depth + 1);
        }
        active.delete(item);
        return result;
    };
    try {
        const serialized = JSON.stringify(copy(value, 0));
        if (serialized.length > maxChars) throw new Error('size');
        return JSON.parse(serialized);
    } catch { throw pastLivesError('STRUCTURE', '这份番外不是可安全读取的有界数据，原记录仍保留。'); }
}

// Saved stories are immutable reading material, not fresh model responses.
// Check shape/capacity/local references here without reinterpreting their prose
// against today's persona or relationship. New generation has separate validators.
export function pastLivesStoredData(value) {
    const raw = pastLivesData(value), limits = PAST_LIVES_LIMITS;
    const require = condition => { if (!condition) throw pastLivesError('STRUCTURE', '这份番外结构暂不可读取，原记录保持不变。'); };
    const prose = (item, max = limits.prose, required = true) => pastLivesText(item, max, required);
    const sequence = (items, max, pattern) => {
        const list = pastLivesArray(items, max), seen = new Set();
        for (const item of list) {
            require(item && typeof item.id === 'string' && pattern.test(item.id) && !seen.has(item.id));
            seen.add(item.id);
        }
        return list;
    };
    const source = item => {
        const ids = pastLivesArray(item?.sourceMemoryIds, 16);
        require(ids.length > 0 && ids.every(id => typeof id === 'string' && /^M\d+$/u.test(id)) && new Set(ids).size === ids.length);
        prose(item.sourceMemoryAnchor, 120);
    };
    const presentation = token => require(['classical', 'modern', 'fantasy', 'neutral'].includes(token));
    require(raw.kind === PAST_LIVES_MODE && raw.version === PAST_LIVES_VERSION);
    for (const key of ['chatId', 'archiveRevision']) prose(raw[key], 240);
    for (const key of ['characterName', 'userName', 'title']) prose(raw[key], limits.title);
    prose(raw.ownerKey, 1200, false);
    presentation(raw.presentation);
    for (const episode of sequence(raw.episodes, limits.episodes, /^PL\d+$/u)) {
        require(episode.fiction === true); presentation(episode.presentation);
        prose(episode.title, limits.title);
        prose(episode.opening?.title, limits.title); prose(episode.opening?.motif, 300); prose(episode.opening?.text);
        source(episode.opening);
        const clueIds = new Set();
        for (const dossier of sequence(episode.dossiers, limits.dossiers, /^D\d+$/u)) {
            prose(dossier.title, limits.title); prose(dossier.era, 240, false); prose(dossier.synopsis);
            for (const clue of sequence(dossier.clues, limits.clues, /^D\d+-C\d+$/u)) {
                require(clue.id.startsWith(dossier.id + '-C') && !clueIds.has(clue.id)); clueIds.add(clue.id);
                require(PAST_LIVES_CLUE_KINDS.includes(clue.kind) && ['char', 'user', 'narrator'].includes(clue.speaker));
                prose(clue.title, limits.title); prose(clue.text); prose(clue.revealedText, limits.prose, clue.kind === 'missing');
            }
        }
        for (const echo of sequence(episode.echoes, limits.echoes, /^E\d+$/u)) {
            require(['memory', 'possibility'].includes(echo.kind));
            prose(echo.title, limits.title); prose(echo.text); prose(echo.reflection, 1800, false);
            if (echo.kind === 'memory') source(echo);
            else require(Array.isArray(echo.sourceMemoryIds) && echo.sourceMemoryIds.length === 0 && echo.sourceMemoryAnchor === '');
        }
        for (const annotation of sequence(episode.annotations, limits.annotations, /^A\d+$/u)) {
            const ids = pastLivesArray(annotation.afterClueIds, limits.dossiers * limits.clues);
            require(ids.every(id => typeof id === 'string' && clueIds.has(id)) && new Set(ids).size === ids.length);
            prose(annotation.text);
        }
        prose(episode.closing?.text); prose(episode.closing?.signature, 240, false);
    }
    return raw;
}

export function pastLivesPresentation(profile = {}) {
    const worldStyle = typeof profile === 'string' ? profile : profile?.worldStyle;
    return ['historical', 'nomadic', 'maritime'].includes(worldStyle) ? 'classical'
        : ['fantasy', 'scifi'].includes(worldStyle) ? 'fantasy'
            : ['contemporary', 'institutional'].includes(worldStyle) ? 'modern' : 'neutral';
}

export function pastLivesLabels(presentation) {
    const variants = {
        classical: { draw: '抽一支旧签', token: '签笺', dossier: '前世卷宗', missing: '拂开缺页', annotation: '朱批', closing: '落款', icon: 'fa-scroll' },
        modern: { draw: '翻开旧信', token: '梦中来信', dossier: '另一段人生', missing: '显出背面字迹', annotation: '页边留言', closing: '信末', icon: 'fa-envelope-open-text' },
        fantasy: { draw: '唤醒记忆遗物', token: '遗物回声', dossier: '旧世残卷', missing: '照亮残页', annotation: '星图旁注', closing: '封缄', icon: 'fa-book-open' },
        neutral: { draw: '拾起一页旧梦', token: '旧梦引子', dossier: '前世卷宗', missing: '揭开缺页', annotation: '旁批', closing: '落款', icon: 'fa-book-open' },
    };
    return variants[presentation] || variants.neutral;
}

export function pastLivesReadingState(session) {
    const episodes = Array.isArray(session?.episodes) ? session.episodes : [];
    const selected = episodes.find(item => item?.id === session?.selectedId) || null;
    const clues = selected ? selected.dossiers.flatMap(dossier => dossier.clues) : [];
    const mask = typeof session?.pastLivesReadMask === 'string' && /^[01]{0,108}$/.test(session.pastLivesReadMask)
        ? session.pastLivesReadMask.slice(0, clues.length) : '';
    return {
        selectedId: selected?.id || '',
        selectedEntryId: selected?.dossiers.some(item => item.id === session?.selectedEntryId) ? session.selectedEntryId : selected?.dossiers[0]?.id || '',
        selectedKey: clues.some(item => item.id === session?.selectedKey) ? session.selectedKey : '',
        view: PAST_LIVES_VIEWS.includes(session?.view) && selected ? session.view : 'library',
        pastLivesReadMask: mask,
        pastLivesDrawn: session?.pastLivesDrawn === true,
        pastLivesClosing: session?.pastLivesClosing === true,
    };
}

export function pastLivesReadClueIds(session, ui = pastLivesReadingState(session)) {
    const selected = session?.episodes?.find(item => item.id === ui.selectedId);
    return new Set((selected?.dossiers || []).flatMap(dossier => dossier.clues)
        .filter((_clue, index) => ui.pastLivesReadMask[index] === '1').map(clue => clue.id));
}
