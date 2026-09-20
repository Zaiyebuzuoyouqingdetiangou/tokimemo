// A view projection of received JSON, never a second generation or a relaxed
// final-response validator. Domain modules own validation of each readable item.
import * as json_parser from './jsonParser.js';
import * as album from '../modes/album.js';
import * as butterfly from '../modes/butterfly.js';
import * as ending from '../modes/ending.js';
import * as pastLives from '../modes/pastLives.js';
import * as adv from '../modes/advEvent.js';
import * as phone from '../modes/phone.js';
import * as room from '../modes/room.js';
import * as heart from '../modes/heart.js';
import * as items from '../modes/items.js';
import * as cabinet from '../modes/cabinet.js';
import * as inbox from '../modes/inbox.js';
import * as themeSong from '../modes/themeSong.js';
import * as timeStories from '../modes/timeStories.js';
import * as travel from '../modes/travel.js';
import * as calendar from '../modes/calendar.js';
import * as relations from '../modes/relations.js';
import * as achievements from '../modes/achievements.js';

export function generationProgressSegments(journal) {
    return (Array.isArray(journal?.segments) ? journal.segments : []).filter(segment =>
        segment.state === 'complete' || segment.state === 'truncated').map(segment => {
        const parsed = json_parser.parsePartialJsonObject(segment.state === 'complete' ? segment.rawJson : segment.partial);
        return { slot: segment.slot, state: segment.state, contract: segment.contract, value: parsed.value, partialValue: parsed.partialValue,
            complete: segment.state === 'complete' && parsed.complete,
            items: parsed.items, has: parsed.has, at: parsed.at };
    });
}

function projectorFor(mode) {
    return {
        album: album.projectAlbumProgress, butterfly: butterfly.projectButterflyProgress,
        ending: ending.projectEndingProgress, pastLives: pastLives.projectPastLivesProgress,
        adv: adv.projectAdvProgress, phone: phone.projectPhoneProgress,
        room: room.projectRoomProgress, heart: heart.projectHeartProgress,
        items: items.projectItemsProgress, cabinet: cabinet.projectCabinetProgress,
        inbox: inbox.projectInboxProgress, themeSong: themeSong.projectThemeSongProgress,
        timeEcho: timeStories.projectTimeStoriesProgress, travel: travel.projectTravelProgress,
        calendar: calendar.projectCalendarProgress, relations: relations.projectRelationsProgress,
        achievements: achievements.projectAchievementsProgress,
    }[mode];
}

export async function projectGenerationProgress(journal, options = {}) {
    const mode = journal?.identity?.mode, project = projectorFor(mode);
    if (typeof project !== 'function') return null;
    const segments = generationProgressSegments(journal);
    if (!segments.some(segment => segment.value && typeof segment.value === 'object')) return null;
    const frozenInputs = {};
    for (const [key, value] of Object.entries(journal.frozenInputs || {})) {
        try { frozenInputs[key] = JSON.parse(value); } catch { /* Old malformed evidence is not replaced by current data. */ }
    }
    const snapshot = journal.contentSnapshotVersion === 1 ? journal.contentSnapshot : null;
    const contentInputs = options.contentInputs || snapshot?.contentInputs || {};
    const memoryBank = options.memoryBank || snapshot?.memoryBank;
    if (!memoryBank) return null;
    const pageId = options.pageId || journal.pageId || mode;
    const session = await project({ segments, memoryBank, context: options.context,
        previousSession: options.previousSession !== undefined ? options.previousSession
            : contentInputs.previousSession !== undefined ? contentInputs.previousSession : contentInputs.baseSession || null,
        contentInputs, pageId, operation: journal.operation || {}, frozenInputs,
        createdAt: journal.createdAt, draftId: journal.draftId || '' });
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    return { ...session, chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision,
        readableProgress: { version: 1, complete: false, draftId: journal.draftId || '', pageId } };
}
