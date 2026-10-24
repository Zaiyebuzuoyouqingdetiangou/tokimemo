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
// 每条记忆先用明确参与者；旧记忆没有可识别的参与者时，才从实际行动句补判。
// 世界书关键词只在「这个条目只属于这一个人、条目标题里写着他的名字」时才拿来认人。
// 一个条目里写了一整个门派或好几个 NPC 时，它的关键词（地名、门派名）是大家共用的，
// 拿来认人会把整个条目的人都算成出场。名字本身照常认。
function trustedKeywords(person, roster) {
    const plain = participants.plainPersonName(person.name).replace(/\s+/g, '');
    if (!plain) return [];
    const owners = new Map();
    for (const other of roster?.people || []) for (const ref of other.sourceRefs || []) {
        const id = `${ref.world}\u0000${ref.uid}`;
        owners.set(id, (owners.get(id) || 0) + 1);
    }
    const keywords = [];
    for (const ref of person.sourceRefs || []) {
        if ((owners.get(`${ref.world}\u0000${ref.uid}`) || 0) !== 1) continue;
        if (!String(ref.title || '').replace(/\s+/g, '').includes(plain)) continue;
        keywords.push(...(ref.keys || []));
    }
    return keywords;
}
function castTerms(person, roster) {
    const terms = new Set();
    const add = value => {
        const term = String(value || '').replace(/\s+/g, '').toLowerCase();
        // 一个字或两个字母太容易误中，不拿来找。
        if (Array.from(term).length >= 2 && !/^[a-z0-9]{1,2}$/.test(term)) terms.add(term);
    };
    add(person.name);
    add(participants.plainPersonName(person.name));
    for (const part of participants.plainPersonName(person.name).split(/[·・•\s/()（）「」【】]+/)) add(part);
    for (const keyword of trustedKeywords(person, roster)) add(keyword);
    // 用户确认过的化名、外号也算这个人。
    for (const alias of person.aliases || []) add(alias);
    return [...terms];
}
function castCatalog(roster) {
    const rows = roster.people.filter(person => person.identity !== 'user').map(person => ({
        id: person.id, name: participants.plainPersonName(person.name).replace(/\s+/g, '').toLowerCase(),
        terms: castTerms(person, roster),
    }));
    // 同一外号或名字片段指向多人时，不猜是哪一个，更不能一次选中全部。
    const owners = new Map();
    for (const row of rows) for (const term of row.terms) owners.set(term, (owners.get(term) || 0) + 1);
    return rows.map(row => ({ ...row, terms: row.terms.filter(term => owners.get(term) === 1) }));
}
function namedCastIds(item, catalog) {
    const ids = new Set();
    for (const raw of Array.isArray(item?.participants) ? item.participants : []) {
        if (typeof raw !== 'string') continue;
        const name = participants.plainPersonName(raw).replace(/\s+/g, '').toLowerCase();
        if (!name) continue;
        let matches = catalog.filter(row => row.name === name);
        if (!matches.length) matches = catalog.filter(row => row.terms.includes(name));
        if (!matches.length && Array.from(name).length >= 2) matches = catalog.filter(row => row.name.includes(name));
        if (matches.length === 1) ids.add(matches[0].id);
    }
    return ids;
}

// 只用于缺少参与者的旧档补判，不改原记忆，也不请求模型。标题/锚点中的孤立人名不是出场证据。
const NON_EVENT_FRAME = /如果|假如|假设|倘若|万一|梦见|梦到|幻想|设想|想象|担心|害怕|据说|听说|听闻|传闻/u;
const PLANNED_TARGET = /计划|打算|准备|想要|希望|期待|盼望|将要|(?:明天|明日|下周|下月|下个月|来日|改天|日后)(?!的)/u;
const MENTIONED_TARGET = /(?:提起|提到|谈到|说起|听说|听闻|想起|想念|打听|关于|有关)(?:了|过)?[“”"'「」]*$/u;
const ABSENT_TARGET = /(?:未曾|尚未|还未|没能|没有|不会|不能|无法)[^，,：:]*(?:见到|看见|遇到|等来|找到)(?:了|过)?$/u;
const NOT_PRESENT = /^(?:(?:还|仍|尚|一直|依然|暂时)?(?:未|没|没有|不曾|从未|不会|并未|尚未)(?:曾|能)?(?:出场|登场|到场|露面|出现|来|抵达|在场)|不在(?:场|这里)|可能|也许|或许|将要|计划|打算|准备|预计|明天|明日|下周|下月|未来|会(?!合|面))/u;
const SETTING_PREDICATE = /^(?:的|之|是|作为|来自|属于|擅长|喜欢|喜爱|名叫|被称为|拥有|年龄|性格|身份|外貌|惯用|绰号)/u;
function appearsInSentences(sentences, term, allTerms) {
    for (const sentence of sentences) {
        let from = 0, index;
        while ((index = sentence.indexOf(term, from)) !== -1) {
            from = index + term.length;
            // 假设/未来可在逗号前；只有明确转折/转场才结束该作用域。
            const scope = sentence.slice(0, index).split(/但是|然而|后来|随后|实际上|事实上|但/u).at(-1)
                .replace(/(?:计划|安排|假设|想法)(?:之后|以后|后)/gu, '');
            const before = scope.split(/[，,：:]/u).at(-1);
            let after = sentence.slice(from).split(/[，,。！？!?；;]/u)[0];
            if (NON_EVENT_FRAME.test(scope) || PLANNED_TARGET.test(scope) || MENTIONED_TARGET.test(before)
                || ABSENT_TARGET.test(before) || NOT_PRESENT.test(after) || /(?:吗|么|来不来|会不会)[”」"']*$/u.test(after)) continue;
            // 「甲和乙一起走来」中的甲也是真实参与者；只跨过名单里可确认的人名。
            while (/^[、和与及跟]/u.test(after)) {
                const rest = after.slice(1), next = allTerms.find(name => rest.startsWith(name));
                if (!next) break;
                after = rest.slice(next.length);
            }
            const subject = !before || /[、和与及跟]$/u.test(before)
                || /^(?:[“「"']|这时|此时|当时|突然|忽然|与此同时|而|只见|只听|一旁的|身旁的)*$/u.test(before);
            // 不限定动作动词：击退、修好、沉默等既有剧情同样有效。人设介绍不当作现场行为。
            if (subject && /^[\p{L}]/u.test(after) && !SETTING_PREDICATE.test(after) && !NOT_PRESENT.test(after)) return true;
            if (/(?:见到|看见|遇到|碰到|接住|抱住|拉住|扶住|迎来|送走|告别)(?:了|过)?$/u.test(before)) return true;
        }
    }
    return false;
}
export function archiveCastIds(roster, memory) {
    const normalized = participants.normalizeParticipantRoster(roster);
    if (!normalized) return [];
    const items = Array.isArray(memory?.memories) ? memory.memories : [];
    const catalog = castCatalog(normalized), found = new Set();
    const allTerms = [...new Set(catalog.flatMap(row => row.terms))].sort((a, b) => b.length - a.length);
    for (const item of items) {
        const named = namedCastIds(item, catalog);
        for (const id of named) found.add(id);
        const prose = [item?.summary, item?.title, ...(Array.isArray(item?.anchors) ? item.anchors : [])]
            .filter(value => typeof value === 'string');
        // 多人长档案在主线程读：同条记忆只规范化一次，无关人物先用短路查找跳过。
        const sentences = prose.flatMap(value => value.split(/[。！？!?；;\n]/u)).map(value => value.replace(/\s+/g, '').toLowerCase());
        const searchable = sentences.join('\n');
        // 旧抽取的参与者可能不完整；只补有实际叙述的人，不因出现一名参与者就截掉其余人。
        for (const row of catalog) if (!named.has(row.id) && row.terms.some(term => searchable.includes(term) && appearsInSentences(sentences, term, allTerms))) found.add(row.id);
    }
    return catalog.filter(row => found.has(row.id)).map(row => row.id);
}

// 多人卡：一段内容只写这段剧情里的人。先看它引用的档案记忆里有谁，再看正文点到了谁，
// 都找不到才用整页/整份的名字（超过 3 人时缩成「前 3 人 等 N 人」）。只用于显示。
export function storyCastLabel(memory, { sourceMemoryIds = [], text = '', fallback = '' } = {}) {
    let roster = null;
    try { roster = participants.normalizeParticipantRoster(memory?.[participants.PARTICIPANTS_KEY]); } catch { roster = null; }
    const fallbackLabel = participants.compactCastLabel(Array.isArray(fallback) ? fallback.join('、') : String(fallback || ''));
    if (!roster) return fallbackLabel;
    const label = ids => participants.compactCastLabel(ids.map(id => roster.people.find(person => person.id === id)?.name).filter(Boolean).join('、'));
    const refs = new Set(Array.isArray(sourceMemoryIds) ? sourceMemoryIds : []);
    const memories = refs.size ? (Array.isArray(memory?.memories) ? memory.memories : []).filter(item => refs.has(item?.id)) : [];
    const fromMemories = memories.length ? archiveCastIds(roster, { memories }) : [];
    if (fromMemories.length) return label(fromMemories);
    // 虚构正文/歌词的显示姓名与真实档案选人不同：正文点名即可，不把它反写为已发生历史。
    const prose = String(text || '').replace(/\s+/g, '').toLowerCase();
    const fromText = prose ? castCatalog(roster).filter(row => row.terms.some(term => prose.includes(term))).map(row => row.id) : [];
    return fromText.length ? label(fromText) : fallbackLabel;
}

// 这一页现在「本页人物」选的是谁：指定人物、按档案剧情出场时给出这些人的名字，
// 其他方式给空，由调用处用存下来的名字。只用于显示，不抽随机、不改设置。
export function routeCastNames(route, context, memory, storage) {
    let roster = null;
    try { roster = participants.normalizeParticipantRoster(memory?.[participants.PARTICIPANTS_KEY]); } catch { roster = null; }
    if (!roster) return [];
    let choice;
    try { choice = readRoutePeople(route, context, memory, storage); } catch { return []; }
    const ids = choice.strategy === 'specified' ? choice.selectedIds
        : choice.strategy === 'archive' ? archiveCastIds(roster, memory) : [];
    return ids.map(id => roster.people.find(person => person.id === id)?.name).filter(Boolean);
}

// 历史阅读只使用历史内容自己的姓名，绝不借用当前聊天的本页人物设置。
export function storyCastFallback(route, context, memory, fallback = '', { historical = false, storage } = {}) {
    const names = !historical && context ? routeCastNames(route, context, memory, storage) : [];
    const value = names.length ? names : fallback;
    return participants.compactCastLabel(Array.isArray(value) ? value.join('、') : String(value || ''));
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
