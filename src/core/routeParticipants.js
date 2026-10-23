import * as contextApi from './context.js';
// C-3c（r84.100）：别名沿用 repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as repository from './archiveBridge.js';
import * as participants from './participants.js';
import * as generation from './generationParticipants.js';
import * as composer from './generationOptions.js';

const choices = new Map();
const strategies = ['default', 'archive', 'specified', 'random', 'ensemble'];
const LEGACY_PREFIX = 'hearttraceRoutePeopleV1:';
function storageOrDefault(storage) {
    if (storage !== undefined) return storage;
    try { return globalThis.localStorage; } catch { return null; }
}
function archiveCreatedAt(memory) {
    const value = Number(memory?.createdAt);
    return Number.isFinite(value) && value > 0 ? value : 0;
}
function key(route, context, memory) {
    // An increment changes archiveRevision, but keeps createdAt. A newly created
    // archive must not inherit the deleted archive's page-level selections.
    const lifetime = archiveCreatedAt(memory) || `revision:${memory?.archiveRevision || ''}`;
    return `hearttraceRoutePeopleV2:${JSON.stringify([contextApi.currentCharacterRuntimeKey(context), memory?.chatId, lifetime])}:${route}`;
}
function parseChoice(encoded) {
    if (!encoded) return null;
    try {
        const value = JSON.parse(encoded);
        return value && typeof value === 'object' && strategies.includes(value.strategy) ? normalizeChoice(value) : null;
    } catch { return null; }
}
function revisionTime(revision) {
    const match = /^(\d+)-/.exec(String(revision || ''));
    return match ? Number(match[1]) : 0;
}
function legacyChoice(route, context, memory, storage) {
    const exact = parseChoice(storage?.getItem(`${LEGACY_PREFIX}${composer.composerScope(context, memory)}:${route}`));
    if (exact) return exact;
    const createdAt = archiveCreatedAt(memory), currentTime = revisionTime(memory?.archiveRevision);
    if (!createdAt || currentTime < createdAt) return null;
    const character = contextApi.currentCharacterRuntimeKey(context), suffix = `:${route}`;
    let latestTime = 0, latest = null, ambiguous = false;
    for (let i = 0; i < (storage?.length || 0); i++) {
        const candidateKey = storage.key(i);
        if (!candidateKey?.startsWith(LEGACY_PREFIX) || !candidateKey.endsWith(suffix)) continue;
        let scope;
        try { scope = JSON.parse(candidateKey.slice(LEGACY_PREFIX.length, -suffix.length)); } catch { continue; }
        if (!Array.isArray(scope) || scope.length !== 3 || scope[0] !== character || scope[1] !== (memory?.chatId ?? null)) continue;
        const time = revisionTime(scope[2]);
        if (time < createdAt || time > currentTime || time < latestTime) continue;
        const value = parseChoice(storage.getItem(candidateKey));
        if (!value) continue;
        if (time > latestTime) { latestTime = time; latest = value; ambiguous = false; }
        else if (JSON.stringify(value) !== JSON.stringify(latest)) ambiguous = true;
    }
    return ambiguous ? null : latest;
}
export function readRoutePeople(route, context, memory, storage) {
    const id = key(route, context, memory), transient = parseChoice(choices.get(id));
    // A quota/permission failure must not let the older disk value override the
    // choice the user just made in this session.
    if (transient) return transient;
    storage = storageOrDefault(storage);
    try {
        const saved = parseChoice(storage?.getItem(id));
        if (saved) return saved;
        const restored = legacyChoice(route, context, memory, storage);
        if (restored) {
            writeRoutePeople(route, restored, context, memory, storage);
            return restored;
        }
    } catch { /* Storage can be unavailable; leave legacy records untouched. */ }
    return normalizeChoice({});
}
function normalizeChoice(value) {
    return { strategy: strategies.includes(value?.strategy) ? value.strategy : 'default',
        selectedIds: [...new Set((Array.isArray(value?.selectedIds) ? value.selectedIds : []).filter(id => typeof id === 'string'))] };
}
export function writeRoutePeople(route, value, context, memory, storage) {
    const id = key(route, context, memory), encoded = JSON.stringify(normalizeChoice(value));
    choices.set(id, encoded);
    try {
        storage = storageOrDefault(storage);
        if (!storage?.setItem) return false;
        storage.setItem(id, encoded);
        choices.delete(id);
        return true;
    } catch { return false; /* Still usable for this session. */ }
}
// 「按档案剧情」：只取档案记忆里真的出场过的人物。建档时勾了、但剧情里还没登场的人不算。
// 先看每条记忆写明的参与者，再在标题、摘要和锚点里找名字或世界书关键词。
function castTerms(person) {
    const terms = new Set();
    const add = value => {
        const term = String(value || '').replace(/\s+/g, '').toLowerCase();
        // 一个字或两个字母太容易误中，不拿来找。
        if (Array.from(term).length >= 2 && !/^[a-z0-9]{1,2}$/.test(term)) terms.add(term);
    };
    add(person.name);
    for (const part of String(person.name || '').split(/[·・•\s/()（）「」【】]+/)) add(part);
    for (const ref of person.sourceRefs || []) for (const keyword of ref.keys || []) add(keyword);
    return [...terms];
}
function memoryCastText(item) {
    const parts = [];
    for (const field of ['title', 'summary']) if (typeof item?.[field] === 'string') parts.push(item[field]);
    for (const field of ['anchors', 'participants']) if (Array.isArray(item?.[field])) parts.push(...item[field].filter(value => typeof value === 'string'));
    return parts.join('\n').replace(/\s+/g, '').toLowerCase();
}
export function archiveCastIds(roster, memory) {
    const normalized = participants.normalizeParticipantRoster(roster);
    if (!normalized) return [];
    const items = Array.isArray(memory?.memories) ? memory.memories : [];
    const named = new Set(), texts = [];
    for (const item of items) {
        for (const name of Array.isArray(item?.participants) ? item.participants : []) {
            if (typeof name === 'string' && name.trim()) named.add(name.replace(/\s+/g, '').toLowerCase());
        }
        texts.push(memoryCastText(item));
    }
    const text = texts.join('\n');
    return normalized.people.filter(person => person.identity !== 'user').filter(person => {
        const terms = castTerms(person);
        const fullName = String(person.name || '').replace(/\s+/g, '').toLowerCase();
        // 记忆里只写了名字的一部分（比如只写名不写姓）也算。
        return terms.some(term => named.has(term) || text.includes(term))
            || [...named].some(name => Array.from(name).length >= 2 && fullName.includes(name));
    }).map(person => person.id);
}

// Resolve once at the click/queue boundary. Persist the resulting snapshot with
// the task; a retry must never draw a second random person or read a new choice.
export function captureRoutePeople(route, context = contextApi.getContext(), memory = repository.getImportedMemory(context),
    { storage, random = Math.random } = {}) {
    const roster = participants.normalizeParticipantRoster(memory?.[participants.PARTICIPANTS_KEY]);
    if (!roster) return null;
    const choice = readRoutePeople(route, context, memory, storage);
    if (choice.strategy === 'default') return generation.resolveGenerationParticipantSnapshot({ roster });
    const candidates = roster.people.filter(person => person.identity !== 'user');
    let selectedIds = choice.selectedIds;
    if (choice.strategy === 'ensemble') selectedIds = candidates.map(person => person.id);
    else if (choice.strategy === 'archive') {
        selectedIds = archiveCastIds(roster, memory);
        if (!selectedIds.length) throw new Error('档案记忆里还没有找到名单里的人物出场。可以改为指定人物，或沿用档案人物。');
    }
    else if (choice.strategy === 'random') selectedIds = candidates.length ? [candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))].id] : [];
    if (!selectedIds.length) throw new Error('请先为这一页勾选人物，或改为沿用档案人物。');
    if (selectedIds.some(id => !roster.people.some(person => person.id === id))) throw new Error('这一页选择的人物已不在当前档案中，请重新选择。');
    return generation.resolveGenerationParticipantSnapshot({ roster, selectedIds });
}
