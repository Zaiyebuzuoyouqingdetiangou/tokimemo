// Domain-specific recovery schemas. These are not a generic object/array merge:
// every collection path, identity and parent binding is owned by the extension.
// Existing mode normalizers and reading projectors remain the authority.
import * as recovery_merge from './recoveryMerge.js';
import * as json_parser from './jsonParser.js';
import * as core_constants from '../core/constants.js';
import * as song_contract from '../core/themeSongContract.js';
import * as bedtime_contract from '../core/bedtimeContract.js';
import * as album from '../modes/album.js';
import * as cabinet from '../modes/cabinet.js';
import * as achievements from '../modes/achievements.js';
import * as inbox from '../modes/inbox.js';
import * as items from '../modes/items.js';
import * as room from '../modes/room.js';
import * as phone from '../modes/phone.js';
import * as travel from '../modes/travel.js';
import * as relations from '../modes/relations.js';
import * as calendar from '../modes/calendar.js';
import * as advEvent from '../modes/advEvent.js';
import * as butterfly from '../modes/butterfly.js';
import * as pastLives from '../modes/pastLives.js';
import * as ending from '../modes/ending.js';
import * as themeSong from '../modes/themeSong.js';
import * as timeStories from '../modes/timeStories.js';
import * as heart from '../modes/heart.js';

function projectOne(project, input, raw) {
    try {
        const parsed = json_parser.parsePartialJsonObject(JSON.stringify(raw));
        const completed = (input.segments || []).filter(row => row.state === 'complete' && row.slot !== input.slot)
            .map(row => ({ ...json_parser.parsePartialJsonObject(row.rawJson), slot: row.slot, state: 'complete' }));
        return project({ ...input, segments: [...completed, { ...parsed, slot: input.slot, state: 'truncated', complete: false }],
            contentInputs: input.contentInputs || {}, frozenInputs: input.frozenInputs || {} });
    } catch { return null; }
}

function albumSchema({ slot, memoryBank, frozenInputs = {} }) {
    const m = recovery_merge;
    if (/:index$/u.test(slot)) return m.recoveryRecord({ title: { accept: m.recoveryText },
        entries: m.recoveryList(m.recoveryItemKey('id', 'title'), null, row => m.recoveryCheck(() =>
            album.normalizeAlbumIndex({ entries: row?.unlocked ? [row] : [] }, memoryBank).entries.length) || row?.unlocked === false) });
    if (/:comments:\d+$/u.test(slot)) return m.recoveryRecord({ items: m.recoveryList(m.recoveryItemKey('id'),
        m.recoveryRecord({ comments: m.recoveryList(null, null, line => typeof line === 'string'
            ? m.recoveryText(line) : m.recoveryText(line?.text)) }, ['id'])) });
    // Relationship evidence is atomic; no text is grafted onto a different pair.
    return null;
}

function cabinetSchema({ memoryBank }) {
    const m = recovery_merge;
    return m.recoveryRecord({ title: { accept: m.recoveryText }, items: m.recoveryList(m.recoveryItemKey('name', 'id'), null,
        row => m.recoveryCheck(() => cabinet.normalizeCabinet({ items: [row] }, memoryBank).items.length)) });
}

function achievementsSchema({ memoryBank }) {
    const m = recovery_merge;
    return m.recoveryRecord({ title: { accept: m.recoveryText }, entries: m.recoveryList(m.recoveryItemKey('id', 'title'), null,
        row => m.recoveryCheck(() => achievements.normalizeAchievements({ entries: [row] }, memoryBank, { allowPartial: true }).entries.length)) });
}

function inboxSchema({ memoryBank, previousSession, operation = {}, frozenInputs = {}, createdAt }) {
    const m = recovery_merge, date = operation.inboxDate || createdAt;
    const plan = inbox.inboxPlan(memoryBank, previousSession, new Date(date));
    return m.recoveryRecord({ title: { accept: m.recoveryText }, letters: m.recoveryList(m.recoveryItemKey('slot'), null, row => {
        const selected = plan.find(item => item.slot === row?.slot);
        return !!selected && m.recoveryCheck(() => inbox.normalizeInboxLetters({ letters: [row] }, memoryBank, [selected], new Date(date),
            { characterEvidence: inbox.frozenInboxCharacterEvidence(frozenInputs) }).letters.length);
    }) });
}

function itemsSchema({ memoryBank }) {
    const m = recovery_merge;
    const node = m.recoveryRecord({}, ['id', 'kind', 'label', 'basis', 'sourceMemoryIds', 'sourceMemoryAnchor']);
    node.children.children = m.recoveryList(m.recoveryItemKey('id', 'label'), node, value =>
        m.recoveryCheck(() => items.normalizePossessionNode(value, memoryBank)));
    return m.recoveryRecord({ title: { accept: m.recoveryText }, containers: m.recoveryList(m.recoveryItemKey('id', 'label'),
        m.recoveryRecord({ nodes: m.recoveryList(m.recoveryItemKey('id', 'label'), node,
            value => m.recoveryCheck(() => items.normalizePossessionNode(value, memoryBank))) },
            ['id', 'label', 'containerType', 'spaceLabel'])) });
}

function roomSchema(input) {
    const { memoryBank, frozenInputs = {} } = input;
    const m = recovery_merge, key = m.recoveryItemKey('id', 'label');
    const snapshot = frozenInputs['participants:room'] || null;
    const objects = m.recoveryList(key, null, (value, parent) => !!projectOne(room.projectRoomProgress, input,
        { spaces: [{ ...parent, id: parent?.id || 'recovery-space', label: parent?.label || 'recovery-space', objects: [value] }] })?.spaces?.[0]?.objects?.length);
    return m.recoveryRecord({ title: { accept: m.recoveryText },
        spaces: m.recoveryList(key, m.recoveryRecord({ objects, atmosphere: { accept: value => m.recoveryText(value)
            && !room.roomNarrativeClaimsSharedHistory(value, memoryBank?.userName) } }, ['id', 'label', 'spaceType'])),
        additions: m.recoveryList(m.recoveryItemKey('id'), null),
        residents: m.recoveryList(m.recoveryItemKey('participantId'), null),
        beats: m.recoveryList(m.recoveryItemKey('id'), null),
    }, ['date', 'dateKey']);
}

function phoneSchema(input) {
    const { slot } = input;
    const m = recovery_merge;
    // A plan is consumed only after the existing whole-plan validator succeeds.
    if (/(?:increment-)?plan$/u.test(slot)) return null;
    const app = m.recoveryRecord({ entries: m.recoveryList(m.recoveryItemKey('id'), null,
        (row, parent) => !!projectOne(phone.projectPhoneProgress, input, { app: { ...parent, entries: [row] } })) },
        ['id', 'kind', 'label', 'deviceKind']);
    return m.recoveryRecord({ ...app.children, app }, app.bind);
}

function travelSchema({ memoryBank, frozenInputs = {}, operation = {}, contract }) {
    const m = recovery_merge, presentation = frozenInputs['presentation:travel'] || {};
    return m.recoveryRecord({ title: { accept: m.recoveryText }, locations: m.recoveryList(m.recoveryItemKey('id', 'name'), null,
        row => m.recoveryCheck(() => travel.normalizeTravel({ locations: [row] }, memoryBank, {
            allowPartial: true, allowPersonaExpansion: operation.allowPersonaExpansion === true,
            worldPresentation: presentation.profile, controlledEvidence: presentation.settingEvidence || '',
            structuredDesign: ['travel-structured-design-r8416', 'travel-sketch-design-r8418'].includes(contract),
        }).locations.length)) });
}

function relationsSchema({ memoryBank, context, frozenInputs = {} }) {
    const m = recovery_merge;
    return m.recoveryRecord({ title: { accept: m.recoveryText },
        relationships: m.recoveryList(m.recoveryItemKey('id', 'name'), null, row => m.recoveryCheck(() =>
            relations.normalizeRelations({ relationships: [row], discoveries: [] }, memoryBank, context).relationships.length)),
        discoveries: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
        settingRelationships: m.recoveryList(m.recoveryItemKey('id', 'name'), null),
    });
}

function calendarSchema() {
    const m = recovery_merge;
    // Date and evidence travel with the complete record, never as shared metadata.
    const dated = row => m.recoveryValueKey([row?.id || '', row?.date || row?.dateKey || '', row?.title || row?.text || '']);
    return m.recoveryRecord(Object.fromEntries(['past', 'promised', 'future', 'stickyNotes', 'moodNotes', 'holidayCards']
        .map(key => [key, m.recoveryList(dated, null)])));
}

function advEventSchema({ slot, memoryBank }) {
    const m = recovery_merge;
    if (/:index$/u.test(slot)) return m.recoveryRecord({ title: { accept: m.recoveryText },
        events: m.recoveryList(m.recoveryItemKey('id', 'title'), null, row => m.recoveryCheck(() => advEvent.normalizeEventCandidate(row, 0, memoryBank))) });
    const story = m.recoveryRecord({ sections: m.recoveryList(m.recoveryItemKey('type'),
        m.recoveryRecord({ paragraphs: m.recoveryList(null, null, m.recoveryText) }, ['type']),
        section => ['past', 'daily', 'during', 'after'].includes(section?.type)) }, ['eventId', 'narrator']);
    return m.recoveryRecord({ ...story.children, items: m.recoveryList(m.recoveryItemKey('eventId'), story) }, story.bind);
}

function butterflySchema() {
    const m = recovery_merge;
    const node = m.recoveryRecord(Object.fromEntries(['label', 'monologue', 'intervention', 'systemNote'].map(key =>
        [key, { accept: m.recoveryText }])), ['id', 'sourceMemoryIds', 'sourceMemoryAnchor', 'worldSpec', 'primaryAxis', 'trueEnding']);
    return m.recoveryRecord({ node, nodes: m.recoveryList(m.recoveryItemKey('id', 'label'), node), omega: node });
}

function pastLivesSchema() {
    const m = recovery_merge;
    return m.recoveryRecord({ title: { accept: m.recoveryText }, opening: null,
        synopsis: { accept: m.recoveryText }, closing: { accept: m.recoveryText },
        dossiers: m.recoveryList(m.recoveryItemKey('id', 'title'), null), clues: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
        echoes: m.recoveryList(m.recoveryItemKey('id', 'title'), null), annotations: m.recoveryList(m.recoveryItemKey('id', 'dossierId'), null),
    }, ['id', 'era', 'sourceMemoryIds', 'sourceMemoryAnchor']);
}

function endingSchema() {
    const m = recovery_merge, prose = { accept: m.recoveryText };
    const route = m.recoveryRecord({ endingScene: prose, creditsLine: prose,
        epilogue: m.recoveryRecord({ title: prose, timeSkip: prose, finalLine: prose,
            scenes: m.recoveryList(m.recoveryItemKey('id', 'title'), null) }),
    }, ['id', 'sourceMemoryIds', 'sourceMemoryAnchor']);
    return m.recoveryRecord({ ...route.children, ending: route, endings: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
        confessionReplays: m.recoveryList(m.recoveryItemKey('id'), null),
    }, ['id', 'relationshipState', 'relationshipSummary', 'relationshipSourceMemoryIds', 'relationshipSourceMemoryAnchor']);
}

function themeSongSchema() {
    const L = song_contract.SONG_LIMITS;
    const m = recovery_merge, keys = { title: L.title, vocalDescription: L.vocal, styleDescription: L.description, stylePrompt: L.style, lyrics: L.lyrics };
    return m.recoveryRecord(Object.fromEntries(Object.entries(keys).map(([key, maximum]) => [key, {
        accept: value => m.recoveryCheck(() => song_contract.songText(value, maximum))
            && (key !== 'stylePrompt' || !/[^\x09\x0a\x0d\x20-\x7e]/u.test(value)),
    }])));
}

function bedtimeSchema(input) {
    const m = recovery_merge, L = bedtime_contract.BEDTIME_LIMITS;
    const field = maximum => ({ accept: value => m.recoveryCheck(() => bedtime_contract.bedtimeText(value, maximum)) });
    const chapter = m.recoveryRecord({ title: field(L.chapterTitle), text: field(L.chapterText) });
    return m.recoveryRecord({
        title: field(L.title), genre: field(L.genre), premise: field(L.premise), chapter,
    });
}

function timeStoriesSchema(input) {
    const m = recovery_merge;
    return m.recoveryRecord({ ...Object.fromEntries(['title', 'opening', 'closing', 'message', 'motif'].map(key =>
        [key, { accept: value => !!projectOne(timeStories.projectTimeStoriesProgress, input, { [key]: value })?.episodes?.at(-1)?.[key] }])),
        lines: { ...m.recoveryList(null, null, row => ['a', 'b', 'narrator'].includes(row?.speaker) && m.recoveryText(row?.text)), parentRequired: ['ends'] },
    }, ['ends', 'medium']);
}

function heartSchema({ memoryBank }) {
    const m = recovery_merge;
    const greetings = m.recoveryRecord(Object.fromEntries(core_constants.HEART_GREETING_KEYS.map(key =>
        [key, m.recoveryList(null, null, m.recoveryText)])));
    return m.recoveryRecord({ greetings,
        voiceDramas: m.recoveryList(m.recoveryItemKey('id', 'title'), null, row => m.recoveryCheck(() =>
            heart.normalizeVoiceDramaPart({ voiceDramas: [row] }, [row?.kind], memoryBank).length)),
        scenarioDramas: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
        dailyStrips: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
        fireflyVoices: m.recoveryList(m.recoveryItemKey('id', 'title'), null),
    }, ['relationshipState', 'relationshipSummary', 'sourceMemoryIds', 'sourceMemoryAnchor']);
}

export function recoveryProgressSchema(mode, input) {
    return ({ album: albumSchema, cabinet: cabinetSchema, achievements: achievementsSchema, inbox: inboxSchema,
        items: itemsSchema, room: roomSchema, phone: phoneSchema, travel: travelSchema, relations: relationsSchema,
        calendar: calendarSchema, adv: advEventSchema, butterfly: butterflySchema, pastLives: pastLivesSchema,
        ending: endingSchema, themeSong: themeSongSchema, bedtime: bedtimeSchema, timeEcho: timeStoriesSchema, heart: heartSchema }[mode])?.(input) || null;
}
