import * as contextApi from './context.js';
// C-3c（r84.100）：别名沿用 repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as repository from './archiveBridge.js';
import * as participants from './participants.js';
import * as generation from './generationParticipants.js';
import * as composer from './generationOptions.js';

const choices = new Map();
const strategies = ['default', 'specified', 'random', 'ensemble'];
function key(route, context, memory) { return `hearttraceRoutePeopleV1:${composer.composerScope(context, memory)}:${route}`; }
export function readRoutePeople(route, context, memory, storage = globalThis.localStorage) {
    const id = key(route, context, memory);
    try { return normalizeChoice(JSON.parse(storage?.getItem(id) || choices.get(id) || '{}')); }
    catch { try { return normalizeChoice(JSON.parse(choices.get(id) || '{}')); } catch { return normalizeChoice({}); } }
}
function normalizeChoice(value) {
    return { strategy: strategies.includes(value?.strategy) ? value.strategy : 'default',
        selectedIds: [...new Set((Array.isArray(value?.selectedIds) ? value.selectedIds : []).filter(id => typeof id === 'string'))] };
}
export function writeRoutePeople(route, value, context, memory, storage = globalThis.localStorage) {
    const id = key(route, context, memory), encoded = JSON.stringify(normalizeChoice(value));
    choices.set(id, encoded);
    try { storage?.setItem(id, encoded); } catch { /* Still usable for this session. */ }
}
// Resolve once at the click/queue boundary. Persist the resulting snapshot with
// the task; a retry must never draw a second random person or read a new choice.
export function captureRoutePeople(route, context = contextApi.getContext(), memory = repository.getImportedMemory(context),
    { storage = globalThis.localStorage, random = Math.random } = {}) {
    const roster = participants.normalizeParticipantRoster(memory?.[participants.PARTICIPANTS_KEY]);
    if (!roster) return null;
    const choice = readRoutePeople(route, context, memory, storage);
    if (choice.strategy === 'default') return generation.resolveGenerationParticipantSnapshot({ roster });
    const candidates = roster.people.filter(person => person.identity !== 'user');
    let selectedIds = choice.selectedIds;
    if (choice.strategy === 'ensemble') selectedIds = candidates.map(person => person.id);
    else if (choice.strategy === 'random') selectedIds = candidates.length ? [candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))].id] : [];
    if (!selectedIds.length) throw new Error('请先为这一页勾选人物，或改为沿用档案人物。');
    if (selectedIds.some(id => !roster.people.some(person => person.id === id))) throw new Error('这一页选择的人物已不在当前档案中，请重新选择。');
    return generation.resolveGenerationParticipantSnapshot({ roster, selectedIds });
}
