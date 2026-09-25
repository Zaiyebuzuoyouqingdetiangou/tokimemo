import * as core_constants from '../core/constants.js';
import * as core_participants from '../core/participants.js';
import * as core_text from '../core/text.js';
import { normalizeRoomVisualProfile, roomNarrativeClaimsSharedHistory } from './roomProfile.js';
// 多人房间：参与者身份、文本与外形规范化
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

export function roomParticipantError(message, field = 'residents') {
    const error = core_text.safeUserError(message, 'RMT_ROOM_PARTICIPANTS');
    error.participantField = field;
    return error;
}

export function roomParticipantId(snapshot, value, allowEmpty = false, field = 'spaces') {
    if (allowEmpty && (value === undefined || value === '')) return '';
    if (typeof value !== 'string' || !snapshot.people.some(person => person.id === value)) {
        throw roomParticipantError('房间说话人或人物身份与本次所选名单不匹配。', field);
    }
    return value;
}

function roomParticipantText(value, memoryBank) {
    if (typeof value !== 'string' || !value.trim()) throw roomParticipantError('人物当前动作或对白没有写完整。');
    if (roomNarrativeClaimsSharedHistory(value, memoryBank)) {
        throw roomParticipantError('人物当前状态混入了没有档案证据的既往共同经历。');
    }
    return value;
}

export function participantVisualProfile(raw, person, { identityKey = '', worldPresentation = null } = {}) {
    return normalizeRoomVisualProfile(raw, {
        identitySeed: `${identityKey}|${person.id}`, bindPersona: true, worldPresentation,
        controlledEvidence: person.sourceRefs.map(ref => ref.content).join('\n'),
    });
}

export function normalizeRoomResidents(raw, snapshot, spaces, memoryBank, options = {}) {
    snapshot = core_participants.normalizeParticipantSnapshot(snapshot);
    if (!snapshot) return [];
    if (!Array.isArray(raw)) throw roomParticipantError('房间缺少按人物区分的生活状态。');
    const byId = new Map();
    for (const row of raw) {
        const id = roomParticipantId(snapshot, row?.participantId, false, 'residents');
        if (byId.has(id)) throw roomParticipantError('房间中同一人物身份出现了重复条目。');
        byId.set(id, row);
    }
    const spacesById = new Map(spaces.map(space => [space.id, space]));
    return snapshot.people.map(person => {
        const row = byId.get(person.id);
        if (!row) throw roomParticipantError('房间遗漏了本次选定人物的生活状态。');
        const dayparts = {};
        for (const key of core_constants.ROOM_DAYPART_KEYS) {
            const input = row.dayparts?.[key];
            const space = spacesById.get(input?.spaceId);
            if (!space) throw roomParticipantError('人物当前所在空间没有对应房间。');
            const focusObjectId = space.objects.some(item => item.id === input?.focusObjectId) ? input.focusObjectId : '';
            dayparts[key] = { spaceId: space.id,
                activity: roomParticipantText(input?.activity, memoryBank),
                line: roomParticipantText(input?.line, memoryBank), focusObjectId };
        }
        if (row.presenceLines !== undefined && !Array.isArray(row.presenceLines)) throw roomParticipantError('人物互动台词格式不完整。');
        return { participantId: person.id, name: person.name,
            visualProfile: participantVisualProfile(row.visualProfile, person, options), dayparts,
            presenceLines: (row.presenceLines || []).map(line => roomParticipantText(line, memoryBank)), presenceIndex: 0 };
    });
}

export function mergeRoomParticipantState(previous, snapshot, freshResidents = []) {
    const residents = structuredClone(previous.residents || []);
    for (const resident of freshResidents) {
        if (!residents.some(old => old.participantId === resident.participantId)) residents.push(structuredClone(resident));
    }
    return { participantSnapshot: core_participants.normalizeParticipantSnapshot(snapshot), residents,
        selectedParticipantId: snapshot.people.some(person => person.id === previous.selectedParticipantId) ? previous.selectedParticipantId : '' };
}
