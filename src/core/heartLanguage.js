import * as constants from './constants.js';
import * as text from './text.js';

// A usable library does not need every category or a fixed number of sentences.
// Empty categories are unavailable choices, not an unfinished mandatory plan.
export function heartLanguageStatus(session) {
    const counts = {};
    for (const key of constants.HEART_GREETING_KEYS) counts[key] = text.cleanArray(session?.greetings?.[key], 40, 600).length;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const hasContent = total > 0 || (Array.isArray(session?.specialDays) && session.specialDays.some(day => typeof day?.line === 'string' && day.line.trim()));
    const complete = hasContent && !!text.normalizeText(session?.relationshipSummary, 1800);
    return { complete, hasContent, counts, total, status: complete ? 'ready' : hasContent ? 'partial' : 'empty' };
}

export function makeHeartShell(memory) {
    return {
        kind: constants.MODE.HEART, title: 'HEART VOICE / 角色互动',
        relationshipState: '角色互动', relationshipSummary: '',
        relationshipSourceMemoryIds: [], relationshipSourceMemoryAnchor: '',
        birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [], relationshipHistory: [],
        greetings: Object.fromEntries(constants.HEART_GREETING_KEYS.map(key => [key, []])),
        voiceDramas: [], scenarioDramas: [], dailyStrips: [], fireflyVoices: [],
        selectedFireflyId: '', selectedVoiceId: '', selectedScenarioId: '', selectedDramaKey: '', selectedStripId: '',
        generationParts: { dialogues: false, seasons: false, strips: false, fireflies: false },
        selectedSeason: 'postending', view: 'seasons',
        chatId: text.normalizeText(memory?.chatId, 240), archiveRevision: text.normalizeText(memory?.archiveRevision, 240),
    };
}

export function readableHeartSession(session) {
    if (!session || session.kind !== constants.MODE.HEART) return null;
    const keys = ['voiceDramas', 'scenarioDramas', 'dailyStrips', 'fireflyVoices', 'specialDays', 'relationshipHistory'];
    if (keys.some(key => session[key] != null && !Array.isArray(session[key]))) return null;
    if (session.greetings != null && (typeof session.greetings !== 'object' || Array.isArray(session.greetings))) return null;
    const normalized = { ...session, greetings: { ...(session.greetings || {}) } };
    for (const key of keys) normalized[key] = session[key] || [];
    for (const key of constants.HEART_GREETING_KEYS) {
        if (normalized.greetings[key] != null && !Array.isArray(normalized.greetings[key])) return null;
        normalized.greetings[key] = normalized.greetings[key] || [];
    }
    normalized.generationParts = { ...(session.generationParts || {}), dialogues: heartLanguageStatus(normalized).complete };
    return normalized;
}

export function heartCollectionIssues(session) {
    return Object.fromEntries(['fireflies', 'strips'].map(part => [part,
        Math.max(0, Math.min(6, Math.floor(Number(session?.collectionIssues?.[part]) || 0)))]));
}
