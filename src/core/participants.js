// Explicit multiplayer identities. This module never reads the active host,
// chooses a participant, or changes a name supplied by the user.
export const PARTICIPANTS_KEY = 'participantsV1';

function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(field) {
    throw new TypeError(`Invalid participant data: ${field}`);
}

function string(value, field) {
    if (typeof value !== 'string') invalid(field);
    return value;
}

function array(value, field) {
    if (!Array.isArray(value)) invalid(field);
    for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) invalid(`${field}[${index}]`);
    }
    return value;
}

function sourceRef(raw) {
    if (!record(raw)) invalid('sourceRefs[]');
    const ref = {
        world: string(raw.world, 'sourceRef.world'),
        uid: string(raw.uid, 'sourceRef.uid'),
        title: string(raw.title, 'sourceRef.title'),
        content: string(raw.content, 'sourceRef.content'),
    };
    if (Object.hasOwn(raw, 'keys')) {
        ref.keys = array(raw.keys, 'sourceRef.keys').map(key => string(key, 'sourceRef.keys[]'));
    }
    return ref;
}

function people(raw) {
    const ids = new Set();
    return array(raw, 'people').map(person => {
        if (!record(person)) invalid('people[]');
        const id = string(person.id, 'person.id');
        if (!id || ids.has(id)) invalid('person.id must be nonempty and unique');
        ids.add(id);
        return {
            id,
            name: string(person.name, 'person.name'),
            ...(person.identity === 'user' ? { identity: 'user' } : {}),
            sourceRefs: array(person.sourceRefs, 'person.sourceRefs').map(sourceRef),
        };
    });
}

// An absent multiplayer marker is the legacy path. Once explicitly marked,
// malformed data must fail instead of falling back to the host card's name.
export function normalizeParticipantRoster(raw) {
    if (!record(raw) || raw.cardType !== 'multi') return null;
    if (raw.version !== 1) invalid('roster.version');
    const normalizedPeople = people(raw.people);
    const knownIds = new Set(normalizedPeople.map(person => person.id));
    const selected = new Set();
    const selectedIds = array(raw.selectedIds, 'selectedIds').map(value => {
        const id = string(value, 'selectedIds[]');
        if (!knownIds.has(id) || selected.has(id)) invalid('selectedIds must refer to distinct existing people');
        selected.add(id);
        return id;
    });
    return {
        version: 1,
        cardType: 'multi',
        revision: raw.revision === undefined ? '' : string(raw.revision, 'roster.revision'),
        people: normalizedPeople,
        selectedIds,
    };
}

export function normalizeParticipantSnapshot(raw) {
    if (raw === null || raw === undefined) return null;
    if (!record(raw) || raw.version !== 1) invalid('snapshot.version');
    return { version: 1, people: people(raw.people) };
}

export function selectedParticipantSnapshot(raw) {
    const roster = normalizeParticipantRoster(raw);
    if (!roster) return null;
    const selectedIds = new Set(roster.selectedIds);
    return { version: 1, people: roster.people.filter(person => selectedIds.has(person.id)) };
}

export function appendParticipantSelection(previous, draft) {
    const before = normalizeParticipantRoster(previous), next = normalizeParticipantRoster(draft);
    if (!next) throw new TypeError('追加人物需要明确的多人名单。');
    if (!before) return next;
    const edited = new Map(next.people.map(person => [person.id, person]));
    const people = before.people.map(person => edited.get(person.id) || person);
    const known = new Set(people.map(person => person.id));
    people.push(...next.people.filter(person => !known.has(person.id)));
    return normalizeParticipantRoster({ ...next, people,
        selectedIds: [...new Set([...before.selectedIds, ...next.selectedIds])] });
}

export function participantIndexPayload(raw) {
    const snapshot = normalizeParticipantSnapshot(raw);
    if (!snapshot) return null;
    return {
        version: 1,
        people: snapshot.people.map(person => ({
            id: person.id,
            name: person.name,
            identity: person.identity === 'user' ? 'user' : 'character',
            summary: person.sourceRefs.map(ref => ref.title).filter(Boolean).join('、').slice(0, 240),
            sourceKeys: person.sourceRefs.map(ref => ({ world: ref.world, uid: ref.uid, title: ref.title })),
        })),
    };
}

export function participantIndexPromptBlock(raw) {
    const payload = participantIndexPayload(raw);
    if (!payload) return '';
    return `\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n${JSON.stringify(payload, null, 2)}\n\n以上是用户选定人物的索引。每人只有姓名、短标题和来源键；正文只在受控来源段出现一次，这里不是证据全文。不能把角色卡名称当作选定人物的姓名。保留其他已有历史，不因这份人物名单而删除或改写。\n`;
}

export function participantPromptBlock(raw) {
    const snapshot = normalizeParticipantSnapshot(raw);
    if (!snapshot) return '';
    return `\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n${JSON.stringify(snapshot, null, 2)}\n\n以上是用户选定的人物设定，不是已经发生的事实。不能把角色卡名称当作选定人物的姓名。保留其他已有历史，不因这份人物名单而删除或改写。\n`;
}

function stringName(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function nameKey(value) {
    return stringName(value).toLocaleLowerCase();
}

function uniqueNames(values) {
    const seen = new Set();
    const names = [];
    for (const value of values || []) {
        const name = stringName(value);
        const key = nameKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

export function nameMatches(value, names) {
    const key = nameKey(value);
    return !!key && (Array.isArray(names) ? names : []).some(name => nameKey(name) === key);
}

export function archivePeopleNames(memoryBank) {
    const names = [];
    for (const memory of Array.isArray(memoryBank?.memories) ? memoryBank.memories : []) {
        for (const name of Array.isArray(memory?.participants) ? memory.participants : []) {
            const text = stringName(name);
            if (text) names.push(text);
        }
    }
    return uniqueNames(names);
}

// Explicit archive user first; Persona stays an alias for the same user.
export function resolveStoryIdentities(memoryBank = null, context = null, people = null) {
    const cardName = stringName(context?.name2 || memoryBank?.characterName, '{{char}}');
    const personaName = stringName(context?.name1);
    const archivedUser = stringName(memoryBank?.userName);
    const roster = normalizeParticipantRoster(memoryBank?.[PARTICIPANTS_KEY]);
    const selectedFromPeople = Array.isArray(people) && people.some(person => person && typeof person === 'object' && person.id)
        ? people : [];
    const selected = selectedFromPeople.length
        ? selectedFromPeople
        : roster ? selectedParticipantSnapshot(roster).people : [];
    const rosterNames = uniqueNames(selected.filter(person => person?.identity !== 'user').map(person => person?.name));
    const rosterUserNames = uniqueNames((roster?.people || []).filter(person => person.identity === 'user').map(person => person.name));
    // Explicit archive/Persona identity establishes User; never infer from NPC frequency.
    const userDisplay = archivedUser || rosterUserNames[0] || personaName || '{{user}}';
    const userAliases = uniqueNames([userDisplay, archivedUser, ...rosterUserNames, personaName]);
    const ownerNames = rosterNames.length
        ? rosterNames
        : uniqueNames([stringName(memoryBank?.characterName), cardName === '{{char}}' ? '' : cardName]);
    const compatNote = userAliases.length > 1
        ? `Persona / 档案用户名 ${userAliases.filter(name => nameKey(name) !== nameKey(userDisplay)).join('、')} 也视为同一人。`
        : '';
    return { cardName, userDisplay, userAliases, ownerNames, peopleNames: uniqueNames([...ownerNames, ...archivePeopleNames(memoryBank)]), compatNote };
}

export function promptIdentityLines(context, people = null, memoryBank = null) {
    const story = resolveStoryIdentities(memoryBank, context, people);
    const names = Array.isArray(people)
        ? uniqueNames(people.map(person => typeof person === 'string' ? person : person?.name))
        : story.ownerNames;
    const userLine = `当前用户：${story.userDisplay}${story.compatNote ? `\n${story.compatNote}` : ''}`;
    if (names.length) {
        return `角色卡名称：${story.cardName}。这是卡名，不是人物。
选定人物：${names.join('、')}
${userLine}`;
    }
    return `角色卡名称：${story.cardName}。卡名不是人物；人物姓名以档案记忆 participants、选定名单和资料里的真名为准。单人卡时，卡名往往就是那个人的真名。
${userLine}`;
}

export function promptRomanceRule(context, people = null, memoryBank = null) {
    const story = resolveStoryIdentities(memoryBank, context, people);
    const names = Array.isArray(people)
        ? uniqueNames(people.map(person => typeof person === 'string' ? person : person?.name))
        : story.ownerNames;
    if (names.length) {
        return `5. 禁止前任、前女友。禁止把角色卡名称写成恋爱、婚姻或家庭对象。恋爱对象只能是选定人物（${names.join('、')}）与 ${story.userDisplay}。${story.compatNote}`;
    }
    return `5. 禁止前任、前女友。禁止把角色卡名称写成恋爱、婚姻或家庭对象。恋爱对象只能是档案/名单里的人物真名与 ${story.userDisplay}。${story.compatNote}`;
}

let localIdSequence = 0;

// Called only when creating a person; normalization always preserves saved IDs.
// The fallback also works in webviews without secure-context crypto APIs.
export function createParticipantId() {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') {
        try { return `participant-${cryptoApi.randomUUID()}`; } catch { /* Try the next available local source. */ }
    }
    if (typeof cryptoApi?.getRandomValues === 'function') {
        try {
            const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
            return `participant-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        } catch { /* Some embedded hosts expose crypto but reject its use. */ }
    }
    localIdSequence += 1;
    return `participant-${Date.now().toString(36)}-${localIdSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function participantName(raw, id) {
    const snapshot = normalizeParticipantSnapshot(raw);
    if (!snapshot || typeof id !== 'string') return '';
    return snapshot.people.find(person => person.id === id)?.name ?? '';
}
