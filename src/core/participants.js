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

export function participantPromptBlock(raw) {
    const snapshot = normalizeParticipantSnapshot(raw);
    if (!snapshot) return '';
    return `\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n${JSON.stringify(snapshot, null, 2)}\n\n以上是用户选定的人物设定，不是已经发生的事实。不能把角色卡名称当作选定人物的姓名。保留其他已有历史，不因这份人物名单而删除或改写。\n`;
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
