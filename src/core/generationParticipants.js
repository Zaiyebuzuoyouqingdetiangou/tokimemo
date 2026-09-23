// Frozen generation participants are deliberately separate from the saved
// archive roster. Callers own when a snapshot is frozen; this module only
// resolves that decision and derives an isolated prompt-time memory bank.
import * as participants from './participants.js';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

// `frozenSnapshot` is presence-sensitive: null means a previously frozen
// single-card/no-participant recipe, and must not fall through to new choices.
export function resolveGenerationParticipantSnapshot({ roster = null, selectedIds = null, frozenSnapshot = undefined } = {}) {
    if (frozenSnapshot !== undefined) return frozenSnapshot === null ? null : participants.normalizeParticipantSnapshot(frozenSnapshot);
    const normalizedRoster = participants.normalizeParticipantRoster(roster);
    if (!normalizedRoster) return null;
    if (selectedIds === null || selectedIds === undefined) return participants.selectedParticipantSnapshot(normalizedRoster);
    if (!Array.isArray(selectedIds)) throw new TypeError('指定生成的人物 ID 必须是数组。');
    const requested = new Set();
    for (const id of selectedIds) {
        if (typeof id !== 'string' || !normalizedRoster.people.some(person => person.id === id) || requested.has(id)) {
            throw new TypeError('指定生成的人物 ID 必须是名单中的不重复 ID。');
        }
        requested.add(id);
    }
    return participants.normalizeParticipantSnapshot({ version: 1,
        people: normalizedRoster.people.filter(person => requested.has(person.id)) });
}

// This is a prompt-only projection. It never mutates the host/archive memory
// and deliberately leaves characterName, chatId and archiveRevision untouched.
export function deriveGenerationParticipantMemoryBank(memoryBank, snapshot) {
    if (!memoryBank || typeof memoryBank !== 'object' || Array.isArray(memoryBank)) throw new TypeError('生成档案必须是对象。');
    const derived = clone(memoryBank);
    const selected = participants.normalizeParticipantSnapshot(snapshot);
    if (!selected) return derived;
    const existing = participants.normalizeParticipantRoster(memoryBank[participants.PARTICIPANTS_KEY]);
    derived[participants.PARTICIPANTS_KEY] = {
        version: 1,
        cardType: 'multi',
        revision: existing?.revision || '',
        people: clone(selected.people),
        selectedIds: selected.people.map(person => person.id),
    };
    return derived;
}
