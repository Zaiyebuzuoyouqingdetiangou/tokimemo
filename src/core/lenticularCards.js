import * as targets from './cgTargets.js';
import * as images from './cgImagePatch.js';
import * as text from './text.js';
import * as pastLivesContract from './pastLivesContract.js';

export const LENTICULAR_KEY = 'lenticularCardsV1';
const MODES = ['album', 'adv', 'heart', 'bedtime', 'ending', 'butterfly'];
const LABELS = { album: '相簿', adv: 'ADV', heart: '角色互动', bedtime: '睡前故事 · 创作', ending: '结局 · 推演', butterfly: '蝴蝶效应 · 推演' };
const rows = value => Array.isArray(value) ? value : [];
const sameChat = (a, b) => typeof a === 'string' && a !== '' && a === b;
const memoryIds = value => [...new Set(rows(value).filter(id => typeof id === 'string' && /^M\d+$/.test(id)))];
const fingerprint = item => item?.sourceHash || 'card-v1-' + (text.hashString(JSON.stringify([
    item?.id, item?.title, item?.subtitle, item?.desc, item?.cgDesc, item?.date, item?.panels, memoryIds(item?.sourceMemoryIds),
])) >>> 0).toString(36);

// Local locators only: never copy image bytes, URLs, prompts or character data.
export function normalizeCardReference(value) {
    if (!value || value.version !== 1 || !MODES.includes(value.mode) || !['current', 'draft', 'version'].includes(value.source)) return null;
    if (!['chatId', 'revision', 'itemId', 'sourceHash'].every(key => typeof value[key] === 'string' && value[key])) return null;
    if (value.source !== 'current' && (typeof value.sourceId !== 'string' || !value.sourceId)) return null;
    return { version: 1, source: value.source, sourceId: value.source === 'current' ? '' : value.sourceId,
        chatId: value.chatId, revision: value.revision, mode: value.mode, itemId: value.itemId, sourceHash: value.sourceHash };
}

function sessionItems(mode, session) {
    const result = [];
    const simple = mode === 'album' ? session.entries : mode === 'adv' ? session.events : mode === 'heart' ? session.dailyStrips : [];
    for (const item of rows(simple)) if (item?.id) result.push({ item, ids: memoryIds(item.sourceMemoryIds) });
    const add = (kind, containerId, slot, owner) => {
        const id = targets.cgTargetItemId({ version: 1, kind, containerId, slot });
        const item = id && targets.cgTargetInSession(mode, session, id);
        if (item) result.push({ item, ids: memoryIds(owner?.sourceMemoryIds) });
    };
    if (mode === 'heart') {
        for (const item of rows(session.voiceDramas)) add('heart-voice', item.id, 'voice', item);
        for (const item of rows(session.scenarioDramas)) add('heart-scenario', item.id, 'scenario', item);
        for (const item of rows(session.photoshoots)) add('heart-photoshoot', item.id, 'grid', item);
        add('heart-firefly', 'habitat', 'habitat', null);
        add('heart-portrait', 'language', 'portrait', session.languagePortrait);
        for (const item of rows(session.languageVisuals)) add('heart-language', item.category, item.lineHash, item);
    }
    if (mode === 'bedtime') for (const story of rows(session.stories)) for (const chapter of rows(story.chapters))
        add('bedtime-chapter', story.id, 'chapter:' + chapter.id, chapter);
    if (mode === 'butterfly') for (const item of rows(session.nodes)) add('butterfly-node', item.id, 'scene', item);
    if (mode === 'ending') {
        for (const item of rows(session.endings)) {
            add('ending-ending', item.id, 'ending', item);
            add('ending-epilogue', item.id, 'epilogue', item.epilogue);
            rows(item.epilogue?.scenes).forEach((scene, index) => add('ending-epilogue-scene', item.id, 'scene:' + index, scene));
        }
        for (const item of rows(session.confessionReplays)) add('ending-confession', item.id, 'confession', item);
    }
    return result;
}

function scopedSession(session, scope) {
    return session && sameChat(session.chatId, scope?.chatId)
        && !(session.ownerKey && scope.ownerKey && session.ownerKey !== scope.ownerKey);
}

function sourceSessions(cache, scope) {
    const result = [];
    const add = (session, mode, source, sourceId = '') => {
        if (session?.kind === mode && scopedSession(session, scope) && typeof session.archiveRevision === 'string') result.push({ session, mode, source, sourceId });
    };
    for (const mode of MODES) add(cache?.[mode], mode, 'current');
    for (const [id, record] of Object.entries(cache?.__generationDraftsV2?.records || {})) {
        if (['open', 'awaiting-choice'].includes(record?.status) && sameChat(record.result?.sourceMemory?.chatId, scope?.chatId) && MODES.includes(record.result?.mode))
            add(record.result.session, record.result.mode, 'draft', id);
    }
    // Saved versions belong to this archive only; never scan other archive entries.
    for (const version of rows(cache?.__archiveVersionsV1)) if (version?.version === 1 && sameChat(version.memory?.chatId, scope?.chatId))
        for (const mode of MODES) add(version.cache?.[mode], mode, 'version', version.versionId);
    return result;
}

export function cardEchoMemoryIds(session, episodeId) {
    const episode = rows(session?.episodes).find(row => row.id === episodeId);
    return memoryIds(rows(episode?.echoes).filter(row => row.kind === 'memory').flatMap(row => rows(row.sourceMemoryIds)));
}

export function cardImageCatalog(cache, scope, echoIds = []) {
    const result = [], seen = new Set(), matching = new Set(memoryIds(echoIds));
    for (const source of sourceSessions(cache, scope)) {
        for (const { item, ids } of sessionItems(source.mode, source.session)) {
            const image = images.normalizeCgImageRecord(item.cgImage);
            if (!image || seen.has(image.url)) continue;
            const reference = normalizeCardReference({ version: 1, source: source.source, sourceId: source.sourceId,
                chatId: source.session.chatId, revision: source.session.archiveRevision, mode: source.mode, itemId: item.id, sourceHash: fingerprint(item) });
            if (!reference) continue;
            seen.add(image.url);
            result.push({ reference, image, title: item.title || '已保存画面', label: LABELS[source.mode],
                sourceLabel: source.source === 'draft' ? '草稿' : source.source === 'version' ? '历史版本' : '',
                sharedMemoryIds: ids.filter(id => matching.has(id)) });
        }
    }
    return result.sort((a, b) => b.sharedMemoryIds.length - a.sharedMemoryIds.length || b.image.generatedAt - a.image.generatedAt);
}

export function resolveCardReference(cache, scope, value) {
    const ref = normalizeCardReference(value);
    if (!ref || !sameChat(ref.chatId, scope?.chatId)) return null;
    let session;
    if (ref.source === 'current') session = cache?.[ref.mode];
    else if (ref.source === 'version') {
        const version = rows(cache?.__archiveVersionsV1).find(row => row?.versionId === ref.sourceId && sameChat(row.memory?.chatId, scope.chatId));
        session = version?.cache?.[ref.mode];
    } else {
        const record = cache?.__generationDraftsV2?.records?.[ref.sourceId];
        if (record?.result?.mode !== ref.mode || !sameChat(record.result?.sourceMemory?.chatId, scope.chatId)) return null;
        // Completion transfers ownership to the formal page; do not resurrect a deleted picture from its draft.
        session = record.status === 'complete' ? cache?.[ref.mode] : ['open', 'awaiting-choice'].includes(record.status) ? record.result.session : null;
    }
    if (!scopedSession(session, scope) || session.kind !== ref.mode || session.archiveRevision !== ref.revision) return null;
    const item = targets.cgTargetInSession(ref.mode, session, ref.itemId);
    if (!item || fingerprint(item) !== ref.sourceHash) return null;
    const image = images.normalizeCgImageRecord(item.cgImage);
    return image ? { image, title: item.title || '今生画面', label: LABELS[ref.mode], reference: ref } : null;
}

function cardRecord(session, itemId) {
    const item = targets.cgTargetInSession('pastLives', session, itemId);
    if (!item || session?.kind !== 'pastLives') return null;
    const saved = rows(session[LENTICULAR_KEY]).find(row => row?.targetId === itemId && row.sourceHash === item.sourceHash);
    if (!saved || !Number.isSafeInteger(saved.editRevision) || saved.editRevision < 1) return null;
    const reference = saved.reference === null ? null : normalizeCardReference(saved.reference);
    return saved.reference === null || (reference && sameChat(reference.chatId, session.chatId))
        ? { targetId: itemId, sourceHash: item.sourceHash, reference, editRevision: saved.editRevision } : null;
}

export function pastLivesCardPair(session, itemId) {
    const record = cardRecord(session, itemId);
    return record?.reference ? record : null;
}

export function cardPairSignature(session, itemId) { return JSON.stringify(cardRecord(session, itemId)); }

export function nextCardEditRevision(cache, session, itemId) {
    let revision = cardRecord(session, itemId)?.editRevision || 0;
    const candidates = [cache?.pastLives, ...Object.values(cache?.__generationDraftsV2?.records || {}).map(row => row?.result?.session)];
    for (const candidate of candidates) if (candidate?.kind === 'pastLives' && sameChat(candidate.chatId, session?.chatId))
        revision = Math.max(revision, cardRecord(candidate, itemId)?.editRevision || 0);
    return revision + 1;
}

export function applyPastLivesCardPair(session, itemId, expectedHash, expectedPair, reference, editRevision = null) {
    const item = targets.cgTargetInSession('pastLives', session, itemId);
    const ref = reference === null ? null : normalizeCardReference(reference);
    if (session?.kind !== 'pastLives' || !item || item.sourceHash !== expectedHash || cardPairSignature(session, itemId) !== expectedPair
        || (reference !== null && (!ref || !sameChat(ref.chatId, session.chatId)))) return null;
    const revision = editRevision ?? ((cardRecord(session, itemId)?.editRevision || 0) + 1);
    if (!Number.isSafeInteger(revision) || revision <= (cardRecord(session, itemId)?.editRevision || 0)) return null;
    const next = structuredClone(session);
    next[LENTICULAR_KEY] = rows(next[LENTICULAR_KEY]).filter(row => row?.targetId !== itemId);
    // A small tombstone prevents a stale generation snapshot resurrecting a cleared pairing.
    next[LENTICULAR_KEY].push({ targetId: itemId, sourceHash: item.sourceHash, reference: ref, editRevision: revision });
    // Honor the existing saved-reader contract before writing; never save a
    // pairing that makes an already full story unreadable on its next opening.
    pastLivesContract.pastLivesData(next);
    return next;
}

export function preservePastLivesCards(incoming, saved) {
    if (incoming?.kind !== 'pastLives' || saved?.kind !== 'pastLives' || !sameChat(incoming.chatId, saved.chatId) || !Object.hasOwn(saved, LENTICULAR_KEY)) return incoming;
    const merged = new Map();
    for (const session of [incoming, saved]) for (const entry of rows(session[LENTICULAR_KEY])) {
        const row = cardRecord(session, entry?.targetId);
        if (!row || targets.cgTargetInSession('pastLives', incoming, row.targetId)?.sourceHash !== row.sourceHash) continue;
        if (!merged.has(row.targetId) || row.editRevision >= merged.get(row.targetId).editRevision) merged.set(row.targetId, row);
    }
    incoming[LENTICULAR_KEY] = [...merged.values()];
    return incoming;
}
