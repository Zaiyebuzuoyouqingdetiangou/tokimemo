import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_participants from '../core/participants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import { ROOM_VISUAL_VALUES, normalizeRoomVisualProfile, roomNarrativeClaimsSharedHistory } from './roomProfile.js';
import { roomDaypartState, roomMotifToken, roomObjectSafeForPresentation, roomObjectVisualKind, roomSceneClass } from './roomLayout.js';
import { mergeRoomParticipantState, normalizeRoomResidents, participantVisualProfile, roomParticipantError, roomParticipantId } from './roomParticipantData.js';
import { normalizeRoomLifePlan } from './roomLife.js';
// 房间数据：规范化、修复、增量合并、外形刷新、多人增量
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

// Fixed templates only. The single interpolated value is a locally counted integer.
function roomRepairHint(reason) {
    const count = () => {
        const found = /得到\s*(\d{1,3})\s*个/.exec(reason);
        return found ? Number(found[1]) : null;
    };
    if (/私人生活空间不足/.test(reason)) {
        const got = count();
        return `上一轮只有 ${got === null ? '不足 3' : got} 个空间通过校验。每个空间必须写满至少 3 件物件，且每件物件的 description 与 line 都不能为空——物件不足 3 件的空间会被整个丢弃。请输出 3～10 个彼此明显不同的空间（label 与 spaceType 不可重复），每个空间 3～8 件物件。`;
    }
    if (/空间或物件未写完整/.test(reason)) {
        return '上一轮有空间的 objects 少于 3 件或缺字段。每件物件都必须同时有 label、description、line 三项，缺任意一项该物件即作废。';
    }
    if (/既往共同经历/.test(reason)) {
        return `上一轮有物件在 basis 非"记忆"的情况下写了与 {{user}} 的共同往事。basis=设定/推演 的物件只能写他自己的生活痕迹，不能出现"你们/我们一起/陪你/上次你"之类表述。`;
    }
    if (/宠物/.test(reason)) {
        return '上一轮的宠物缺少受控原文证据。没有角色卡/世界书明确写到宠物时，pets 请直接留空数组。';
    }
    if (/时段|daypart/i.test(reason)) {
        return 'dayparts 必须同时包含 morning/daytime/evening/night 四个时段，每段都要有 spaceId、activity、line 与 focusObjectId。';
    }
    return '';
}

export function roomNeedsSchemaUpgrade(session) {
    // The former upgrade was a paid pet scan. Existing versions remain readable;
    // visual refresh is a separate explicit action and must not resurrect pet creation.
    return false;
}

// Errors that assert something untrue about the user, or about evidence that does exist.
// These are never relaxed: a second pass must not be able to buy its way past them.
function roomTruthClaimFailure(reason) {
    return /既往共同经历|宠物/.test(String(reason || ''));
}

export function normalizeRoom(data, memoryBank, options = {}) {
    try { return normalizeRoomData(data, memoryBank, options); }
    catch (first) {
        // Tiering, per the evidence layer's actual purpose: it exists to stop false claims
        // about the user, not to enforce how many corners a character's flat has. A purely
        // structural shortfall degrades to a smaller room instead of no room at all.
        if (!options.relaxStructure && !roomTruthClaimFailure(first?.message)) {
            try {
                const relaxed = normalizeRoomData(data, memoryBank, { ...options, relaxStructure: true });
                return { ...relaxed, structureRelaxed: true };
            } catch { /* fall through to the original, more informative failure */ }
        }
        const error = first;
        const reason = String(error?.message || '');
        const code = /宠物/.test(reason) ? 'RMT_ROOM_PETS' : /既往共同经历/.test(reason) ? 'RMT_ROOM_HISTORY' : 'RMT_ROOM_STRUCTURE';
        error.code = code;
        error.retryable = true;
        // The user-facing message is deliberately sanitised, which left the retry with
        // "something was incomplete" and no idea what to fix. The shortfall itself is
        // computed locally from counts, so a fixed-template hint carries no model or user
        // text and can safely be fed back into the next attempt.
        error.repairHint = roomRepairHint(reason);
        throw error;
    }
}

function normalizeRoomSpaceObjects(rawObjects, spaceId, memoryBank, participantSnapshot = null, structureOnly = false) {
    const usedObjectIds = new Set();
    return rawObjects.slice(0, 8).map((item, objectIndex) => {
        const basis = core_constants.ROOM_BASIS_VALUES.has(item?.basis) ? item.basis : '设定';
        const label = core_text.normalizeText(item?.label, 60) || `角落 ${objectIndex + 1}`;
        let description = core_text.normalizeText(item?.description, 1600);
        let line = core_text.normalizeText(item?.line, 800);
        if (structureOnly && basis !== '记忆') {
            if (roomNarrativeClaimsSharedHistory(description, memoryBank)) description = '';
            if (roomNarrativeClaimsSharedHistory(line, memoryBank)) line = '';
        } else if (basis !== '记忆' && [label, description, line].some(field => roomNarrativeClaimsSharedHistory(field, memoryBank))) return null;
        const reference = basis === '记忆'
            ? core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, `${item?.label || ''}\n${description}\n${line}`, memoryBank, 1)
            : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        const sourceMemoryIds = reference.sourceMemoryIds;
        const fallbackObjectId = `${spaceId}_OBJ${String(objectIndex + 1).padStart(2, '0')}`;
        let objectId = core_text.safeId(item?.id, fallbackObjectId);
        if (usedObjectIds.has(objectId)) objectId = fallbackObjectId;
        while (usedObjectIds.has(objectId)) objectId = `${fallbackObjectId}_${usedObjectIds.size + 1}`;
        usedObjectIds.add(objectId);
        return { id: objectId, label,
            zone: core_constants.ROOM_ZONE_VALUES.has(item?.zone) ? item.zone : ['左上', '右上', '左下', '右下', '中央', '近景'][objectIndex % 6],
            basis, searchable: core_evidence.isSearchableRoomObject(item), description, line,
            ...(participantSnapshot ? { speakerId: roomParticipantId(participantSnapshot, item?.speakerId, !participantSnapshot.people.length) } : {}),
            sourceMemoryIds, sourceMemoryAnchor: reference.sourceMemoryAnchor };
    }).filter(item => item && (structureOnly ? item.label : (item.description && item.line)) && (item.basis !== '记忆' || (item.sourceMemoryIds.length >= 1 && item.sourceMemoryAnchor)));
}

function normalizeRoomData(data, memoryBank, { identityKey = '', worldPresentation = null, controlledEvidence = null, characterEvidence = null, relaxStructure = false, participantSnapshot = null, structureOnly = false } = {}) {
    participantSnapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
    // Minimums for the character's own space. Truth-claim checks below ignore this entirely.
    const minObjects = 1;
    const minSpaces = 1;
    const minPresenceLines = 0;
    const rawSpaces = Array.isArray(data?.spaces) ? data.spaces : [];
    const usedSpaceIds = new Set();
    const spaces = rawSpaces.slice(0, 10).map((space, spaceIndex) => {
        const fallbackSpaceId = `SP${String(spaceIndex + 1).padStart(2, '0')}`;
        let spaceId = core_text.safeId(space?.id, fallbackSpaceId);
        if (usedSpaceIds.has(spaceId)) spaceId = fallbackSpaceId;
        while (usedSpaceIds.has(spaceId)) spaceId = `${fallbackSpaceId}_${usedSpaceIds.size + 1}`;
        usedSpaceIds.add(spaceId);
        const rawObjects = Array.isArray(space?.objects) ? space.objects : [];
        const objects = normalizeRoomSpaceObjects(rawObjects, spaceId, memoryBank, participantSnapshot, structureOnly);
        const requestedAtmosphere = core_text.normalizeText(space?.atmosphere, 1800);
        return {
            id: spaceId,
            label: core_text.normalizeText(space?.label, 60) || `空间 ${spaceIndex + 1}`,
            spaceType: core_text.normalizeText(space?.spaceType, 80) || core_text.normalizeText(space?.label, 60) || '私人空间',
            atmosphere: requestedAtmosphere && !roomNarrativeClaimsSharedHistory(requestedAtmosphere, memoryBank)
                ? requestedAtmosphere : '这里保留着他长期生活留下的细小痕迹。',
            objects,
        };
    }).filter(space => space.objects.length >= minObjects);
    if (spaces.length < minSpaces) throw new Error(`私人生活空间不足：得到 ${spaces.length} 个有效空间，至少需要 ${minSpaces} 个。`);
    const spaceSignatures = new Set(spaces.map(space => `${core_incremental.normalizedContentKey(space.label, 80)}|${core_incremental.normalizedContentKey(space.spaceType, 100)}`));
    if (spaceSignatures.size !== spaces.length) throw new Error('私人空间出现重复：每个空间必须有不同的名称和主功能。');
    const sceneClasses = new Set(spaces.map(space => roomSceneClass(space.spaceType, space.label)));
    const motifs = new Set(spaces.map(space => roomMotifToken({ visualProfile: data?.visualProfile || {} }, space)));
    if (spaces.length > 1 && sceneClasses.size < 2 && motifs.size < 2) {
        throw new Error('私人空间缺少功能差异：至少要呈现 2 种明显不同的空间结构或陈设母题。');
    }
    const visibleSignatures = new Set(spaces.map(space => {
        const objectKinds = [...new Set(space.objects.map(roomObjectVisualKind))].sort().join(',');
        return `${roomSceneClass(space.spaceType, space.label)}|${roomMotifToken({ visualProfile: data?.visualProfile || {} }, space)}|${objectKinds}`;
    }));
    const requiredVisibleSignatures = Math.min(spaces.length, Math.max(2, Math.ceil(spaces.length / 2)));
    if (visibleSignatures.size < requiredVisibleSignatures) {
        throw new Error(`私人空间的可见结构过于相似：${spaces.length} 个空间至少需要 ${requiredVisibleSignatures} 种不同的主陈设/物件组合。`);
    }

    const spaceById = new Map(spaces.map(space => [space.id, space]));
    const dayparts = {};
    for (const key of participantSnapshot ? [] : core_constants.ROOM_DAYPART_KEYS) {
        const raw = data?.dayparts?.[key] || {};
        const rawSpaceId = core_text.safeId(raw?.spaceId, '');
        const space = spaceById.get(rawSpaceId) || spaces[0];
        let activity = core_text.normalizeText(raw?.activity, 1000);
        let line = core_text.normalizeText(raw?.line, 800);
        const objectIds = new Set(space.objects.map(item => item.id));
        const focusObjectId = objectIds.has(String(raw?.focusObjectId || '')) ? String(raw.focusObjectId) : space.objects[0].id;
        if (structureOnly) {
            if (!activity || roomNarrativeClaimsSharedHistory(activity, memoryBank)) activity = '在这个空间里';
            if (!line || roomNarrativeClaimsSharedHistory(line, memoryBank)) line = '……';
        } else {
            if (!activity || !line) throw new Error(`“他的房间”缺少 ${key} 时段的生活状态。`);
            if ([activity, line].some(field => roomNarrativeClaimsSharedHistory(field, memoryBank))) {
                throw new Error(`“他的房间”${key} 时段混入了没有档案证据的既往共同经历。`);
            }
        }
        dayparts[key] = { spaceId: space.id, activity, line, focusObjectId };
    }
    const presenceLines = core_text.cleanArray(participantSnapshot ? [] : data?.presenceLines, 12, 900)
        .filter(line => !roomNarrativeClaimsSharedHistory(line, memoryBank));
    if (presenceLines.length < minPresenceLines) throw new Error(`“他的房间”角色互动台词不足：${presenceLines.length} 句，至少需要 ${minPresenceLines} 句。`);
    const initialDaypart = roomDaypartState();
    const initialSpace = spaceById.get(dayparts[initialDaypart.key]?.spaceId) || spaces[0];
    const title = core_text.normalizeText(data?.title, 100) || '他的房间';
    const homeName = core_text.normalizeText(data?.homeName, 100) || '私人生活空间';
    const requestedHomeSummary = core_text.normalizeText(data?.homeSummary, 2200);
    const homeSummary = requestedHomeSummary && !roomNarrativeClaimsSharedHistory(requestedHomeSummary, memoryBank)
        ? requestedHomeSummary : '这些空间拼成了他日常生活真正会经过的路线。';
    const profileSeed = [identityKey, memoryBank?.characterName, memoryBank?.chatId, worldPresentation?.evidenceHash].filter(Boolean).join('|');
    // This normalizer consumes new model output. Legacy session pets are retained by
    // cache loading/refresh/incremental merge, never reconstructed from model fields.
    const pets = [];
    return {
        kind: core_constants.MODE.ROOM,
        roomVersion: core_constants.ROOM_SESSION_VERSION,
        title,
        homeName,
        homeSummary,
        worldPresentation: worldPresentation ? structuredClone(worldPresentation) : null,
        visualProfile: normalizeRoomVisualProfile(data?.visualProfile, { identitySeed: profileSeed, bindPersona: true, worldPresentation, controlledEvidence }),
        spaces,
        pets,
        dayparts,
        presenceLines,
        selectedSpaceId: initialSpace.id,
        selectedObjectId: initialSpace.objects[0]?.id || '',
        presenceIndex: 0,
        ...(participantSnapshot ? {
            participantSnapshot,
            residents: normalizeRoomResidents(data?.residents, participantSnapshot, spaces, memoryBank, { identityKey, worldPresentation }),
            selectedParticipantId: '',
        } : {}),
    };
}

// Paths are code-owned arrays. Neither model keys nor raw exception messages become diagnostics.
export function roomCandidateRepairSlots(data, memoryBank, options = {}) {
    const slots = [];
    const check = (path, value, history = true) => {
        if (!core_text.normalizeText(value, 6000) || history && roomNarrativeClaimsSharedHistory(value, memoryBank)) {
            slots.push({ path, reason: !core_text.normalizeText(value, 6000) ? 'missing_text' : 'present_scope_unproven' });
        }
    };
    (data?.spaces || []).slice(0, 10).forEach((space, i) => {
        (space?.objects || []).slice(0, 8).forEach((item, j) => {
            for (const key of ['label', 'description', 'line']) check(['spaces', i, 'objects', j, key], item?.[key], item?.basis !== '记忆');
        });
    });
    for (const key of options.participantSnapshot ? [] : core_constants.ROOM_DAYPART_KEYS) {
        for (const field of ['activity', 'line']) check(['dayparts', key, field], data?.dayparts?.[key]?.[field]);
    }
    if (options.participantSnapshot) {
        (Array.isArray(data?.residents) ? data.residents : []).forEach((resident, index) => {
            for (const key of core_constants.ROOM_DAYPART_KEYS) {
                for (const field of ['activity', 'line']) check(['residents', index, 'dayparts', key, field], resident?.dayparts?.[key]?.[field]);
            }
            (Array.isArray(resident?.presenceLines) ? resident.presenceLines : []).forEach((line, i) => check(['residents', index, 'presenceLines', i], line));
        });
    } else for (let i = 0; i < Math.min(12, data?.presenceLines?.length || 0); i++) check(['presenceLines', i], data?.presenceLines?.[i]);
    return slots;
}

export function applyRoomTextRepairs(candidate, slots, response) {
    if (!Array.isArray(response?.repairs) || response.repairs.length !== slots.length) throw core_text.safeUserError('房间待补字段不完整。', 'RMT_ROOM_FIELDS');
    const result = structuredClone(candidate), seen = new Set();
    for (const repair of response.repairs) {
        const key = JSON.stringify(repair?.path);
        const slot = slots.find(item => JSON.stringify(item.path) === key);
        if (!slot || seen.has(key) || typeof repair.text !== 'string' || !repair.text.trim() || repair.text.length > 1600) throw core_text.safeUserError('房间待补字段不完整。', 'RMT_ROOM_FIELDS');
        seen.add(key);
        let target = result;
        for (const part of slot.path.slice(0, -1)) {
            if (!Object.hasOwn(target, part) || !target[part] || typeof target[part] !== 'object') {
                // Missing containers may only be the locally enumerated daypart/presence slots.
                target[part] = part === 'presenceLines' ? [] : {};
            }
            target = target[part];
        }
        target[slot.path.at(-1)] = core_text.normalizeText(repair.text, 1600);
    }
    return result;
}

export function projectRoomProgress({ segments = [], memoryBank, previousSession = null, contentInputs = {}, frozenInputs = {}, pageId = 'room', operation = {}, createdAt = 0 }) {
    const previous = contentInputs.previousSession || contentInputs.roomSession || previousSession;
    const presentation = frozenInputs['presentation:room'] || {};
    const snapshot = frozenInputs['participants:room'] || previous?.participantSnapshot || null;
    const options = { worldPresentation: presentation.profile, controlledEvidence: presentation.settingEvidence,
        characterEvidence: presentation.characterEvidence, participantSnapshot: snapshot };
    let session = previous ? structuredClone(previous) : { kind: core_constants.MODE.ROOM, roomVersion: core_constants.ROOM_SESSION_VERSION,
        title: '他的房间', homeName: '', homeSummary: '', spaces: [], pets: [], dayparts: {}, presenceLines: [], residents: [],
        visualProfile: normalizeRoomVisualProfile({}), selectedSpaceId: '', selectedObjectId: '', presenceIndex: 0,
        ...(snapshot ? { participantSnapshot: structuredClone(snapshot), selectedParticipantId: '' } : {}) };
    let added = false;
    if (pageId === 'roomLife') {
        const blueprint = frozenInputs['room:daily-blueprint'] || contentInputs.roomSession || previous;
        if (!blueprint?.spaces?.length || !/^\d{4}-\d{2}-\d{2}$/.test(operation.dateKey || '')) return null;
        const beats = segments.flatMap(segment => segment.items('/beats'));
        const accepted = [];
        for (const beat of beats) {
            try {
                const actors = snapshot && Array.isArray(beat.participants)
                    ? { ...snapshot, people: snapshot.people.filter(person => beat.participants.some(row => row.participantId === person.id)) } : snapshot;
                const plan = normalizeRoomLifePlan({ beats: [beat] }, blueprint, memoryBank, new Date(`${operation.dateKey}T12:00:00`), { participantSnapshot: actors });
                accepted.push(...plan.beats);
            } catch { /* A closed life node retains its original evidence checks. */ }
        }
        if (!accepted.length) return null;
        session = { ...structuredClone(blueprint), lifePlan: { dateKey: operation.dateKey, archiveRevision: memoryBank.archiveRevision,
            generatedAt: createdAt, beats: accepted.sort((a, b) => a.minute - b.minute), ...(snapshot ? { participantSnapshot: structuredClone(snapshot) } : {}) } };
        added = true;
    } else for (const segment of segments) {
        if (segment.has('')) {
            try { session = normalizeRoom(segment.value, memoryBank, options); added = true; continue; } catch { /* Project valid units below. */ }
        }
        for (let index = 0; index < 10; index++) {
            const path = `/spaces/${index}`, raw = segment.at?.(path);
            if (!raw || !segment.has(`${path}/id`) || !segment.has(`${path}/label`)) continue;
            const id = core_text.safeId(raw.id, '');
            if (!id) continue;
            let objects;
            try { objects = normalizeRoomSpaceObjects(segment.items(`${path}/objects`), id, memoryBank, snapshot); } catch { continue; }
            if (!objects.length) continue;
            const old = session.spaces.find(space => space.id === id);
            const space = old || { id, label: core_text.normalizeText(raw.label, 60), spaceType: core_text.normalizeText(raw.spaceType, 80) || core_text.normalizeText(raw.label, 60),
                atmosphere: segment.has(`${path}/atmosphere`) && !roomNarrativeClaimsSharedHistory(raw.atmosphere, memoryBank) ? core_text.normalizeText(raw.atmosphere, 1800) : '', objects: [] };
            for (const item of objects) if (!space.objects.some(saved => saved.id === item.id)) space.objects.push(item);
            if (!old) session.spaces.push(space);
            added = true;
        }
        if (snapshot && session.spaces.length) for (const resident of segment.items('/residents')) {
            const person = snapshot.people.find(row => row.id === resident?.participantId);
            if (!person) continue;
            try {
                const normalized = normalizeRoomResidents([resident], { ...snapshot, people: [person] }, session.spaces, memoryBank, options)[0];
                const index = (session.residents || []).findIndex(row => row.participantId === person.id);
                session.residents ||= [];
                if (index < 0) session.residents.push(normalized); else session.residents[index] = normalized;
                added = true;
            } catch { /* Incomplete resident remains pending; no substitute dialogue. */ }
        }
        if (previous && segment.items('/additions').length) {
            for (const addition of segment.items('/additions')) try {
                const ids = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
                const fresh = normalizeRoomIncrementPatch({ additions: [addition] }, previous, memoryBank, ids, { ...options, allowPersonaExpansion: operation.allowPersonaExpansion });
                session = mergeRoomIncremental(session, fresh, ids, { memoryBank, allowPersonaExpansion: operation.allowPersonaExpansion }).session; added = true;
            } catch { /* Invalid additions do not suppress other closed items. */ }
        }
    }
    if (!added || !session.spaces.length) return null;
    session.selectedSpaceId ||= session.spaces[0].id; session.selectedObjectId ||= session.spaces[0].objects[0]?.id || '';
    session.kind = core_constants.MODE.ROOM; session.chatId = memoryBank.chatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
}

export async function generateRoomWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const participantSnapshot = core_participants.normalizeParticipantSnapshot(options.participantSnapshot);
    const presentation = options.presentationContext || {};
    const request = options.request || generation_client.requestValidatedSegment;
    const normalizeOptions = { identityKey: core_context.currentCharacterRuntimeKey(context), worldPresentation: presentation.profile,
        controlledEvidence: presentation.settingEvidence, characterEvidence: presentation.characterEvidence, participantSnapshot };
    const prompt = (participantSnapshot
        ? generation_prompts.multiplayerRoomPrompt(context, memoryBank, participantSnapshot, ROOM_VISUAL_VALUES)
        : generation_prompts.PROMPTS[core_constants.MODE.ROOM](context, memoryBank))
        + '\nCONTROLLED_WORLD_PRESENTATION_JSON:\n' + JSON.stringify(presentation.profile || {});
    const requestOptions = { maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ROOM], context, contextEnvelope: presentation.contextEnvelope, origin, taskKey, mode: core_constants.MODE.ROOM, background: true };
    const fillTextNow = options.secondStep === true || options.fillExisting === true || core_settings.getPluginSettings().autoSecondPass === true;
    let raw = options.fillExisting && options.existingSession ? structuredClone(options.existingSession) : await request(prompt, '他的房间 · 正在整理空间…', requestOptions, value => {
        // This pre-check only decides whether a response is worth normalising at all, so it
        // must not be stricter than the normaliser's own relaxed fallback — otherwise the
        // fallback is unreachable and a slightly thin room is rejected before it is tried.
        const usable = Array.isArray(value?.spaces)
            ? value.spaces.filter(space => Array.isArray(space?.objects) && space.objects.length >= 1) : [];
        if (!Array.isArray(value?.spaces) || value.spaces.length > 10 || usable.length < 1) {
            throw core_text.safeUserError('房间空间或物件未写完整。', 'RMT_ROOM_STRUCTURE');
        }
        return value;
    });
    if (!fillTextNow) {
        try {
            const session = normalizeRoom(raw, memoryBank, normalizeOptions);
            core_requestCoordinator.noteSecondStepOffer(origin, null);
            return session;
        } catch (error) {
            try {
                const session = normalizeRoom(raw, memoryBank, { ...normalizeOptions, structureOnly: true });
                core_requestCoordinator.noteSecondStepOffer(origin, {
                    label: '对白和描述',
                    kind: 'room-lines',
                    mode: core_constants.MODE.ROOM,
                    pageId: core_constants.MODE.ROOM,
                });
                return session;
            } catch {
                throw error;
            }
        }
    }
    core_requestCoordinator.noteSecondStepOffer(origin, null);
    const slots = roomCandidateRepairSlots(raw, memoryBank, { participantSnapshot });
    // Small fixed groups keep feedback/repair output bounded; good fields are never regenerated.
    for (let offset = 0; offset < slots.length; offset += 6) {
        const group = slots.slice(offset, offset + 6);
        raw = await request(prompt + '\n【仅修复文字字段】只输出 {"repairs":[{"path":["spaces",0,"objects",0,"line"],"text":"修复文字"}]}。'
            + '\n只重写下面的路径；不改变 basis、来源或任何其他字段。present_scope_unproven 表示不能确认是当前观察/当下对白，请明确表达当下邀请、观察或感受，不能陈述任何无证据往事。'
            + '\nREPAIR_SLOTS_JSON:' + JSON.stringify(group)
            + '\nROOM_INDEX_JSON:' + JSON.stringify(compactRoomExisting(raw)),
        '他的房间 · 只补齐待确认字段…', { ...requestOptions, maxTokens: 3000, taskKey: taskKey + ':fields:' + offset },
        value => {
            const repaired = applyRoomTextRepairs(raw, group, value);
            const unresolved = new Set(roomCandidateRepairSlots(repaired, memoryBank, { participantSnapshot }).map(slot => JSON.stringify(slot.path)));
            if (group.some(slot => unresolved.has(JSON.stringify(slot.path)))) throw core_text.safeUserError('房间待补字段仍不能确认。', 'RMT_ROOM_FIELDS');
            return repaired;
        });
    }
    const repairedGroups = new Set();
    for (;;) {
        try { return normalizeRoom(raw, memoryBank, normalizeOptions); }
        catch (error) {
            const field = participantSnapshot && error?.participantField === 'residents' ? 'residents' : 'spaces';
            if (repairedGroups.has(field) || repairedGroups.size >= 2) throw error;
            repairedGroups.add(field);
            raw = await request(prompt + '\n【最终局部修复】仅返回 {"' + field + '":修复后的该字段完整值}。其他已通过字段由本地保留。'
                + '\n修复原因：' + core_text.safeErrorSummary(error)
                + '\nCURRENT_ROOM_INDEX_JSON:' + JSON.stringify(compactRoomExisting(raw)),
            '他的房间 · 补齐空间与证据', { ...requestOptions, taskKey: taskKey + ':final:' + field },
            value => {
                if (!Array.isArray(value?.[field])) throw core_text.safeUserError('房间局部修复不完整。', 'RMT_ROOM_FIELDS');
                const repaired = { ...raw, [field]: value[field] };
                if (roomCandidateRepairSlots(repaired, memoryBank, { participantSnapshot }).length) throw core_text.safeUserError('房间局部修复仍有无据描述。', 'RMT_ROOM_FIELDS');
                try { normalizeRoom(repaired, memoryBank, normalizeOptions); }
                catch (nextError) {
                    const nextField = participantSnapshot && nextError?.participantField === 'residents' ? 'residents' : 'spaces';
                    if (nextField === field || repairedGroups.has(nextField)) throw nextError;
                    // This group passed; the other group can be repaired once next. Nothing commits here.
                }
                return repaired;
            });
        }
    }
}

export function compactRoomExisting(session) {
    return (Array.isArray(session?.spaces) ? session.spaces : []).slice(0, 20).map(space => ({
        id: core_text.normalizeText(space?.id, 80),
        label: core_text.normalizeText(space?.label, 80),
        spaceType: core_text.normalizeText(space?.spaceType, 100),
        objects: (Array.isArray(space?.objects) ? space.objects : []).slice(0, 40).map(item => ({
            id: core_text.normalizeText(item?.id, 80),
            label: core_text.normalizeText(item?.label, 80),
            basis: core_text.normalizeText(item?.basis, 20),
            sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
            sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 120),
        })),
    }));
}

export function roomIncrementPrompt(context, memoryBank, previous, sourceMemoryIds, { allowPersonaExpansion = false } = {}) {
    return generation_prompts.promptSafetyBoundary(context, '他的房间 / 增量物件', null, memoryBank)
        + '\n旧房间由本地原样保留，只输出新增物件 patch，不返回旧描述、dayparts、presenceLines 或完整房间。'
        + '\n严格输出 {"additions":[{"spaceId":"已有空间id","objects":[{"id":"新id","label":"物件名称","basis":"记忆|推演","zone":"中央","description":"物件与生活描述","line":"当下角色对白","sourceMemoryIds":["仅记忆时 Mxxx"],"sourceMemoryAnchor":"仅记忆时精确原文"}]}]}'
        + (allowPersonaExpansion ? '\n可向已有空间追加两类普通生活物件：basis=记忆 时必须由本轮新增记忆明确证明；basis=推演 时可依据明确人设、职业、时代和既有房间生活方式补充合理物件，sourceMemoryIds/sourceMemoryAnchor 留空。推演物件不得声称是 {{user}} 赠送、共同购买或两人过去共同使用过，也不得伪造既往事件。不扩建空间。没有合适新增就 additions=[]。' : '\n本轮只同步历史：新物件必须 basis=记忆 并由新增 Mxxx 证明；无新增则 additions=[]，不补人设推演。')
        + '\n本轮不生成宠物节点或 companions；旧宠物由本地原样保留。此限制不改变 char/user 的身份、称呼或普通物件中的宠物用品。'
        + '\nUNTRUSTED_INCREMENTAL_ROOM_ARCHIVE_JSON:\n' + core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        + '\nEXISTING_ROOM_INDEX_JSON:\n' + JSON.stringify(compactRoomExisting(previous));
}

export function normalizeRoomIncrementPatch(raw, previous, memoryBank, sourceMemoryIds, options = {}) {
    if (!Array.isArray(raw?.additions) || raw.additions.length > 20) throw core_text.safeUserError('房间增量 patch 不完整。', 'RMT_ROOM_FIELDS');
    const fresh = { spaces: [], pets: [] };
    const seen = new Set();
    for (const part of raw.additions) {
        const existing = previous.spaces.find(space => space.id === part?.spaceId);
        if (!existing || seen.has(existing.id) || !Array.isArray(part.objects) || part.objects.length > 8) throw core_text.safeUserError('房间增量空间不匹配。', 'RMT_ROOM_FIELDS');
        seen.add(existing.id);
        const objects = part.objects.map(item => {
            const basis = ['推演', '设定'].includes(item?.basis) ? '推演' : '记忆';
            const label = core_text.normalizeText(item.label, 60), description = core_text.normalizeText(item.description, 1600), line = core_text.normalizeText(item.line, 800);
            if (!label || !description || !line) throw core_text.safeUserError('新物件正文不完整。', 'RMT_ROOM_FIELDS');
            if (basis === '推演') {
                if (options.allowPersonaExpansion !== true) throw core_text.safeUserError('历史同步不能追加推演物件。', 'RMT_ROOM_HISTORY');
                const visible = [label, description, line].join('\n');
                if (roomNarrativeClaimsSharedHistory(visible, memoryBank)) {
                    throw core_text.safeUserError('人设推演物件不能冒充两人已经发生的共同往事。', 'RMT_ROOM_HISTORY');
                }
                return { id: core_text.safeId(item.id, 'NEW'), label, description, line, basis: '推演',
                    sourceMemoryIds: [], sourceMemoryAnchor: '',
                    zone: core_constants.ROOM_ZONE_VALUES.has(item.zone) ? item.zone : '中央', searchable: core_evidence.isSearchableRoomObject({ label, description }) };
            }
            if (!roomObjectUsesIncrement(item, sourceMemoryIds, memoryBank)) throw core_text.safeUserError('记忆物件缺少新增记忆证据。', 'RMT_ROOM_HISTORY');
            const reference = core_evidence.normalizeMemoryReference(item.sourceMemoryIds, item.sourceMemoryAnchor, [label, description, line].join('\n'), memoryBank, 1);
            if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) throw core_text.safeUserError('记忆物件证据不完整。', 'RMT_ROOM_FIELDS');
            const normalized = { id: core_text.safeId(item.id, 'NEW'), label, description, line, basis: '记忆', ...reference,
                zone: core_constants.ROOM_ZONE_VALUES.has(item.zone) ? item.zone : '中央', searchable: core_evidence.isSearchableRoomObject(item) };
            if (!roomObjectSafeForPresentation(normalized, memoryBank)) throw core_text.safeUserError('物件可见正文缺少精确记忆锚点。', 'RMT_ROOM_HISTORY');
            return normalized;
        });
        fresh.spaces.push({ id: existing.id, label: existing.label, spaceType: existing.spaceType, atmosphere: existing.atmosphere, objects });
    }
    // Ignore both retired output keys even if a provider supplies them anyway.
    return fresh;
}

export function roomSpaceKey(space) {
    return `${core_incremental.normalizedContentKey(space?.label, 100)}|${core_incremental.normalizedContentKey(space?.spaceType, 100)}`;
}

export function roomObjectKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 140);
    return ids && anchor ? `memory|${ids}|${anchor}` : `label|${core_incremental.normalizedContentKey(item?.label, 100)}`;
}

export function roomObjectAllowedIncrement(item, sourceMemoryIds, memoryBank = null, { allowPersonaExpansion = false } = {}) {
    if (item?.basis === '推演' && allowPersonaExpansion) {
        if (item?.sourceMemoryIds?.length || item?.sourceMemoryAnchor || !item?.label || !item?.description || !item?.line) return false;
        const visible = [item?.label, item?.description, item?.line].map(value => core_text.normalizeText(value, 1800)).filter(Boolean).join('\n');
        return !!visible && !roomNarrativeClaimsSharedHistory(visible, memoryBank);
    }
    return roomObjectUsesIncrement(item, sourceMemoryIds, memoryBank);
}

export function roomObjectUsesIncrement(item, sourceMemoryIds, memoryBank = null) {
    if (item?.basis !== '记忆') return false;
    const allowed = new Set(core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40));
    if (!core_text.cleanArray(item?.sourceMemoryIds, 12, 40).some(id => allowed.has(id))) return false;
    if (!memoryBank) return true;
    const incrementalBank = core_incremental.incrementalPromptMemoryBank(memoryBank, sourceMemoryIds);
    const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, '', incrementalBank, 1);
    return !!reference.sourceMemoryAnchor
        && core_text.normalizeText(item?.sourceMemoryAnchor, 120) === reference.sourceMemoryAnchor;
}

export function mergeRoomIncremental(previous, fresh, sourceMemoryIds, { memoryBank = null, allowPersonaExpansion = false } = {}) {
    const merged = structuredClone(previous);
    merged.roomVersion = core_constants.ROOM_SESSION_VERSION;
    if (!previous?.worldPresentation && fresh?.worldPresentation) merged.worldPresentation = structuredClone(fresh.worldPresentation);
    if (!previous?.visualProfile && fresh?.visualProfile) merged.visualProfile = structuredClone(fresh.visualProfile);
    const usedSpaceIds = new Set((merged.spaces || []).map(space => space.id));
    const bySpace = new Map((merged.spaces || []).map((space, index) => [roomSpaceKey(space), index]));
    let added = 0;
    for (const freshSpace of fresh.spaces || []) {
        const key = roomSpaceKey(freshSpace);
        const existingIndex = bySpace.get(key);
        if (existingIndex === undefined) {
            const grounded = (freshSpace.objects || []).some(item => roomObjectUsesIncrement(item, sourceMemoryIds, memoryBank));
            if (!grounded || merged.spaces.length >= 20) continue;
            const next = structuredClone(freshSpace);
            next.id = core_incremental.uniqueGeneratedId(next.id, usedSpaceIds, 'SP');
            const usedObjectIds = new Set();
            next.objects = (next.objects || [])
                .filter(item => roomObjectUsesIncrement(item, sourceMemoryIds, memoryBank))
                .slice(0, 24).map(item => ({
                ...item,
                id: core_incremental.uniqueGeneratedId(item.id, usedObjectIds, `${next.id}_OBJ`),
            }));
            bySpace.set(key, merged.spaces.length);
            merged.spaces.push(next);
            added += next.objects.length || 1;
            continue;
        }
        const target = merged.spaces[existingIndex];
        const seenObjects = new Set((target.objects || []).map(roomObjectKey));
        const usedObjectIds = new Set((target.objects || []).map(item => item.id));
        for (const item of freshSpace.objects || []) {
            if (!roomObjectAllowedIncrement(item, sourceMemoryIds, memoryBank, { allowPersonaExpansion })) continue;
            const objectKey = roomObjectKey(item);
            if (!objectKey || seenObjects.has(objectKey) || target.objects.length >= 24) continue;
            seenObjects.add(objectKey);
            target.objects.push({
                ...structuredClone(item),
                id: core_incremental.uniqueGeneratedId(item.id, usedObjectIds, `${target.id}_OBJ`),
            });
            added += 1;
        }
    }
    // Keep the exact old array (including identities/evidence), never revalidate it
    // against a newer character card or append newly returned pet nodes.
    if (!Array.isArray(merged.pets)) merged.pets = [];
    // Incremental presence lines carry no per-line evidence fields, so they cannot be
    // attributed to this update safely. Keep the previously validated lines unchanged.
    merged.presenceLines = structuredClone(previous.presenceLines || []);
    merged.selectedSpaceId = previous.selectedSpaceId;
    merged.selectedObjectId = previous.selectedObjectId;
    return { session: merged, added };
}

export async function refreshRoomFigure(context, memoryBank, origin, taskKey, previous, options = {}) {
    if (options.participantSnapshot) return refreshRoomParticipantFigures(context, memoryBank, origin, taskKey, previous, options);
    const presentation = options.presentationContext || {};
    const request = options.request || generation_client.requestValidatedSegment;
    const visualProfile = await request(
        `仅提取当前 char 的外形，不生成房间、对白或故事。返回 {"figure":{...},"explicitFields":["figure.hairShape"],"explicitEvidence":{"figure.hairShape":"角色卡或世界书精确原文"}}。枚举：${JSON.stringify(ROOM_VISUAL_VALUES)}。
只填写确属 char 的外形。没有写明的字段用 unspecified，detail 用 none；不要把 User/NPC 的外形、衣服颜色当发色。不凭房间风格猜人长相。`,
        '正在更新人物外形，保留房间内容…',
        { context, contextEnvelope: presentation.contextEnvelope, origin, taskKey: `${taskKey}:figure`, mode: core_constants.MODE.ROOM, maxTokens: 2500, background: true },
        raw => normalizeRoomVisualProfile({ ...previous.visualProfile, ...raw },
            { identitySeed: core_context.currentCharacterRuntimeKey(context), bindPersona: true, worldPresentation: presentation.profile,
                controlledEvidence: presentation.characterEvidence || presentation.settingEvidence || '' }),
    );
    return { ...structuredClone(previous), visualProfile };
}

export async function generateRoomIncrementalWithRepair(context, memoryBank, origin, taskKey, previous, options = {}) {
    if (options.participantSnapshot) return generateRoomParticipantsIncrement(context, memoryBank, origin, taskKey, previous, options);
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const presentationContext = options.presentationContext || {};
    const worldPresentation = previous?.worldPresentation || presentationContext.profile
        || core_worldPresentation.resolveWorldPresentation(presentationContext.contextEnvelope || '', memoryBank);
    const fresh = await generation_client.requestValidatedSegment(
        `${roomIncrementPrompt(context, memoryBank, previous, sourceMemoryIds, options)}\nCONTROLLED_WORLD_PRESENTATION_JSON:\n${JSON.stringify(worldPresentation, null, 2)}`,
        '他的房间 · 正在从新增档案追加生活痕迹…',
        { maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ROOM], context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:increment`, mode: core_constants.MODE.ROOM, background: true },
        raw => normalizeRoomIncrementPatch(raw, previous, memoryBank, sourceMemoryIds, {
            allowPersonaExpansion: options.allowPersonaExpansion === true,
            identityKey: core_context.currentCharacterRuntimeKey(context),
            worldPresentation,
            controlledEvidence: presentationContext.settingEvidence ?? '',
            characterEvidence: presentationContext.characterEvidence ?? '',
        }),
    );
    const { session, added } = mergeRoomIncremental(previous, fresh, sourceMemoryIds, { memoryBank, allowPersonaExpansion: options.allowPersonaExpansion === true });
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

// A room-only replacement does not own the saved daily plan or the ITEMS page.
// Preserve their exact targets. Generated IDs are local to the new response and
// are remapped on collision; similar names never establish physical identity.
export function preserveRoomLinkedContent(previous, fresh) {
    if (!previous) return fresh;
    const session = structuredClone(fresh);
    const usedSpaces = new Set((previous.spaces || []).map(space => space.id));
    const usedObjects = new Set((previous.spaces || []).flatMap(space => (space.objects || []).map(item => item.id)));
    const spaceIds = new Map(), objectIds = new Map();
    for (const space of session.spaces || []) {
        const originalId = space.id;
        space.id = core_incremental.uniqueGeneratedId(space.id, usedSpaces, 'SP');
        spaceIds.set(originalId, space.id);
        for (const object of space.objects || []) {
            const oldId = object.id;
            object.id = core_incremental.uniqueGeneratedId(object.id, usedObjects, 'OBJ');
            objectIds.set(JSON.stringify([originalId, oldId]), object.id);
        }
    }
    const remapSlot = slot => {
        if (!slot) return;
        const oldSpace = slot.spaceId;
        slot.spaceId = spaceIds.get(oldSpace) || oldSpace;
        if (slot.focusObjectId) slot.focusObjectId = objectIds.get(JSON.stringify([oldSpace, slot.focusObjectId])) || slot.focusObjectId;
    };
    for (const slot of Object.values(session.dayparts || {})) remapSlot(slot);
    for (const resident of session.residents || []) for (const slot of Object.values(resident.dayparts || {})) remapSlot(slot);
    session.selectedObjectId = objectIds.get(JSON.stringify([session.selectedSpaceId, session.selectedObjectId])) || session.selectedObjectId;
    session.selectedSpaceId = spaceIds.get(session.selectedSpaceId) || session.selectedSpaceId;
    session.spaces.push(...structuredClone(previous.spaces || []));
    for (const key of ['lifePlan', 'lifePlanAttempt', 'pets']) {
        if (Object.hasOwn(previous, key)) session[key] = structuredClone(previous[key]);
    }
    return session;
}

async function generateRoomParticipantsIncrement(context, memoryBank, origin, taskKey, previous, options) {
    const snapshot = core_participants.normalizeParticipantSnapshot(options.participantSnapshot);
    const request = options.request || generation_client.requestValidatedSegment;
    const presentation = options.presentationContext || {};
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const oldResidents = previous.residents || [];
    const newPeople = snapshot.people.filter(person => !oldResidents.some(resident => resident.participantId === person.id));
    const newSnapshot = { version: 1, people: newPeople };
    const prompt = generation_prompts.multiplayerRoomPrompt(context, memoryBank, snapshot, ROOM_VISUAL_VALUES)
        + '\n本轮已有房间只增补，不返回完整 spaces。返回 {"additions":[{"spaceId":"已有空间id","objects":["按上文物件结构填写，含speakerId"]}],"residents":["仅为 NEW_RESIDENT_IDS_JSON 中的人填写上文完整人物结构"]}。'
        + '\n旧房间、旧人物状态、旧台词与图片由本地原样保留。只在现有空间中补充物件，不新建空间。'
        + (options.allowPersonaExpansion === true ? '\n新物件可 basis=推演，依据选定人物设定描写当下；不捏造用户过去行为。basis=记忆 必须由本轮新增记忆支持。' : '\n新物件仅允许 basis=记忆，必须由本轮新增记忆支持；没有合适内容时 additions=[]。')
        + '\nNEW_RESIDENT_IDS_JSON:' + JSON.stringify(newPeople.map(person => person.id))
        + '\nEXISTING_ROOM_INDEX_JSON:' + JSON.stringify(compactRoomExisting(previous))
        + '\nUNTRUSTED_INCREMENTAL_ROOM_ARCHIVE_JSON:' + core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS);
    const fresh = await request(prompt, '正在更新共同房间，保留已有内容…', {
        maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ROOM], context, origin,
        contextEnvelope: presentation.contextEnvelope, taskKey: `${taskKey}:increment`, mode: core_constants.MODE.ROOM, background: true,
    }, raw => {
        const normalized = normalizeRoomIncrementPatch(raw, previous, memoryBank, sourceMemoryIds, options);
        for (let i = 0; i < normalized.spaces.length; i++) {
            normalized.spaces[i].objects.forEach((item, j) => { item.speakerId = roomParticipantId(snapshot, raw.additions[i].objects[j].speakerId, !snapshot.people.length); });
        }
        normalized.residents = normalizeRoomResidents(raw.residents || [], newSnapshot, previous.spaces, memoryBank,
            { identityKey: core_context.currentCharacterRuntimeKey(context), worldPresentation: presentation.profile });
        return normalized;
    });
    const { session, added } = mergeRoomIncremental(previous, fresh, sourceMemoryIds, { memoryBank, allowPersonaExpansion: options.allowPersonaExpansion === true });
    Object.assign(session, mergeRoomParticipantState(previous, snapshot, fresh.residents));
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

async function refreshRoomParticipantFigures(context, memoryBank, origin, taskKey, previous, options) {
    const snapshot = core_participants.normalizeParticipantSnapshot(options.participantSnapshot);
    const presentation = options.presentationContext || {};
    const request = options.request || generation_client.requestValidatedSegment;
    const figures = await request(`仅更新所选人物各自外形，不生成房间、对白或故事。一次返回 {"residents":[{"participantId":"原id","visualProfile":{"figure":{},"explicitFields":[],"explicitEvidence":{}}}]}。
${core_participants.participantIndexPromptBlock(snapshot)}
枚举：${JSON.stringify(ROOM_VISUAL_VALUES)}。每人只使用自己的来源设定作外貌证据；explicitEvidence 必须原样复制对应人物所选世界书内容。缺乏证据的外貌用 unspecified，detail 用 none，不借用其他人物或玩家外貌。`,
    '正在更新所选人物外形，保留房间内容…', { context, contextEnvelope: presentation.contextEnvelope, origin,
        taskKey: `${taskKey}:figure`, mode: core_constants.MODE.ROOM, maxTokens: 2500, background: true }, raw => {
        if (!Array.isArray(raw?.residents)) throw roomParticipantError('人物外形列表不完整。');
        const seen = new Set();
        const result = raw.residents.map(row => {
            const id = roomParticipantId(snapshot, row?.participantId);
            if (seen.has(id)) throw roomParticipantError('人物外形身份重复。');
            seen.add(id);
            const person = snapshot.people.find(person => person.id === id);
            return { participantId: id, name: person.name,
                visualProfile: participantVisualProfile(row.visualProfile, person,
                    { identityKey: core_context.currentCharacterRuntimeKey(context), worldPresentation: presentation.profile }) };
        });
        if (seen.size !== snapshot.people.length) throw roomParticipantError('人物外形遗漏了所选人物。');
        return result;
    });
    const session = structuredClone(previous);
    Object.assign(session, mergeRoomParticipantState(previous, snapshot));
    for (const figure of figures) {
        const resident = session.residents.find(person => person.participantId === figure.participantId);
        if (resident) resident.visualProfile = figure.visualProfile;
        else session.residents.push({ ...figure, dayparts: {}, presenceLines: [], presenceIndex: 0 });
    }
    return session;
}
