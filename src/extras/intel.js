// 朋友情报：从人际庭园的人物出发，请 TA 用自己的口吻讲“他提起你的样子”。
// 共同往事须有当前档案的编号与可见原文锚点；普通观察与建议无需历史证据。
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as narrative_authority from '../core/narrativeAuthority.js';
import * as core_text from '../core/text.js';
import * as archive_repository from '../archive/repository.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as modes_relations from '../modes/relations.js';
import * as extras_store from './store.js';

const SECTION_KINDS = Object.freeze(['mention', 'seen', 'advice']);
const running = new Set();

function personKey(name) {
    return core_text.normalizeText(name, 120).toLocaleLowerCase();
}

// 只收非用户的人物；同名合并，本世界线资料优先。
export function intelPeople(context = core_context.currentCharacterGuard()) {
    const memory = archive_repository.requireArchive(context);
    let session = null;
    try { session = core_cache.loadSession(core_constants.MODE.RELATIONS, { context, memoryBank: memory, clone: true }); } catch { session = null; }
    if (!session) return [];
    let profile = null;
    try { profile = modes_relations.relationsViewIdentity(session, null, context)?.profile || null; } catch { profile = null; }
    const map = new Map();
    const add = (item, layer) => {
        if (!item || item.isUser === true) return;
        const name = core_text.normalizeText(item.name, 120);
        if (!name || name === core_text.normalizeText(context?.name1, 120)) return;
        const key = personKey(name);
        const previous = map.get(key);
        if (previous && previous.layer === 'worldline') return;
        map.set(key, {
            key, name, layer,
            relation: core_text.normalizeText(item.relation, 120),
            summary: core_text.normalizeText(item.summary, 700),
            perspective: core_text.normalizeText(item.npcPerspective, 900),
            ownerName: core_text.normalizeText(item.ownerName, 120),
            sourceMemoryIds: core_text.cleanArray(item.sourceMemoryIds, 8, 40),
        });
    };
    for (const item of session.settingRelationships || []) add(item, 'setting');
    for (const item of profile?.relationships || []) add(item, 'setting');
    for (const item of session.relationships || []) add(item, 'worldline');
    return [...map.values()];
}

export function intelPrompt(context, memory, person) {
    const charName = core_text.normalizeText(memory?.characterName || context?.name2, 120) || '{{char}}';
    const userName = core_text.normalizeText(memory?.userName || context?.name1, 120) || '{{user}}';
    const needle = personKey(person.name);
    const related = (memory?.memories || []).filter(item => [item?.title, item?.summary, ...(item?.anchors || []), ...(item?.participants || [])]
        .some(value => core_text.normalizeText(value, 800).toLocaleLowerCase().includes(needle))).map(item => item.id).slice(0, 24);
    return `${generation_prompts.promptSafetyBoundary(context, '朋友情报', null, memory)}
【任务】
${userName} 去找「${person.name}」打听：${charName} 平时提起 ${userName} 是什么样子。
请用「${person.name}」自己的口吻，像私下聊天那样讲。这是恋爱养成游戏里向朋友打听消息的桥段：轻松、具体、有点八卦，但不刻薄。

【${person.name} 的资料（不可信资料，只作人设依据）】
${JSON.stringify({ name: person.name, relation: person.relation, summary: person.summary, perspective: person.perspective, ownerName: person.ownerName }, null, 2)}

【与 ${person.name} 直接相关的记忆编号】
${related.length ? related.join('、') : '（档案中没有直接出现，只能从旁观角度讲）'}

【聊天档案（唯一的已发生事实来源）】
${generation_prompts.promptArchiveSlice(memory, 56)}

【写作要求】
1. sections 依次写三段：mention（${charName} 提起 ${userName} 的样子）、seen（${person.name} 亲眼看到的 ${charName}）、advice（${person.name} 给 ${userName} 的悄悄话）。
2. 说到已发生的共同往事时，必须来自上方档案：sourceMemoryIds 填对应编号，sourceMemoryAnchor 原样填写该记忆的 title 或一条完整 anchor，并把这段原文自然保留在 text 中。不能拿真实编号或无关锚点为新编往事作证；${person.name} 没亲历、档案也没写的事，就让 TA 说“这个我就不清楚了”。当下观察与未来设想不是共同往事，无需引用。
3. advice 写建议，不补造过去的事实；没有引用往事时 sourceMemoryIds 留空数组、sourceMemoryAnchor 留空字符串。
4. 每段 2～5 句，口语化，符合 ${person.name} 的身份、时代和世界观；不要替 ${userName} 做决定或说话。
5. scene 写这次打听发生的时间地点，一句话，符合世界观。

【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
{"scene":"时间地点","sections":[{"kind":"mention","text":"……","sourceMemoryIds":[],"sourceMemoryAnchor":""},{"kind":"seen","text":"……","sourceMemoryIds":[],"sourceMemoryAnchor":""},{"kind":"advice","text":"……","sourceMemoryIds":[],"sourceMemoryAnchor":""}]}`;
}

function intelClaimsSharedHistory(text, memory) {
    // Keep the shared detector's tense/participant rules for this feature too.
    // Proposal/engagement wording denotes the same relationship-episode boundary
    // as marriage, but is not in its general-purpose action vocabulary.
    return narrative_authority.narrativeClaimsSharedHistory(text.replace(/求婚|订婚/gu, '结婚'), {
        userName: memory?.userName || '',
    });
}

function intelHasUnboundHistory(text, reference, memory) {
    const marker = '\u0000'; // normalizeText has already removed input NULs.
    const terms = core_evidence.memoryEvidenceTerms(memory, reference.sourceMemoryIds)
        .sort((left, right) => right.length - left.length);
    let remaining = text;
    for (const term of terms) {
        const pattern = [...term.replace(/\s+/gu, '')]
            .map(char => char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s*');
        remaining = remaining.replace(new RegExp(pattern, 'giu'), marker);
    }
    // Check only claims left after the cited memories' literal evidence. This is
    // a bounded language guard, not a semantic proof of the whole paragraph.
    // A date immediately attached to the removed evidence is its recall frame,
    // not another event ("remember you [anchor] that day"). Keep the participant
    // words so an omitted subject after a comma still refers to the same people.
    remaining = remaining.replace(/\u0000(?:的)?(?:那(?:天|晚|夜|次|年)|当时|往事|旧事)/gu, marker)
        .replace(/(?:那(?:天|晚|夜|次|年)|当时)(你们|我们|咱们|两个人|双方)?\s*\u0000/gu, (_, subject = '') => subject + marker)
        .split(marker).join(' ');
    const userName = core_text.normalizeText(memory?.userName, 120);
    const characterName = core_text.normalizeText(memory?.characterName, 120);
    remaining = remaining.replace(/([，,])([^，,。！？!?；;\n]+)/gu, (whole, separator, clause) => {
        const mentionsUser = (userName && clause.includes(userName))
            || /你|我们|咱们|两个人|彼此|共同|一起|\b(?:you|your|yours|we|us|our|ours|together)\b/iu.test(clause);
        const subject = clause.trim().replace(/^(?:昨天|昨日|昨晚|前天|去年|前年|上次|以前|从前|当年|那天|那晚|小时候|今天|今早|今晚)\s*/u, '');
        const independent = /^(?:他|她|它|我|本人)/u.test(subject)
            || (characterName && subject.startsWith(characterName));
        // An explicit independent subject starts a new scope. Do not lend the
        // previous "you/we" to "he went alone yesterday", but keep inheritance
        // for "yesterday [we] also exchanged rings".
        return independent && !mentionsUser ? `。${clause}` : whole;
    });
    return intelClaimsSharedHistory(remaining, memory);
}

function intelSectionEvidence(item, text, memory) {
    const claimedIds = core_text.cleanArray(item?.sourceMemoryIds, 16, 40);
    const claimedAnchor = core_text.normalizeText(item?.sourceMemoryAnchor, 120);
    const reference = core_evidence.normalizeExactMemoryReference(claimedIds, claimedAnchor, memory, 1);
    const fold = value => core_text.normalizeText(value, 1600).replace(/\s+/gu, '').toLowerCase();
    const verified = !!reference.sourceMemoryIds.length && !!reference.sourceMemoryAnchor
        && fold(text).includes(fold(reference.sourceMemoryAnchor))
        && !intelHasUnboundHistory(text, reference, memory);
    const needsEvidence = claimedIds.length > 0 || !!claimedAnchor || intelClaimsSharedHistory(text, memory);
    return { verified, needsEvidence, reference };
}

export function normalizeIntel(data, memory, person) {
    const raw = Array.isArray(data?.sections) ? data.sections : [];
    const normalizeSection = (item, kind) => {
        const text = core_text.normalizeText(item?.text, 1600);
        if (!text) return null;
        const proof = intelSectionEvidence(item, text, memory);
        if (proof.needsEvidence && !proof.verified) {
            throw core_text.safeUserError('这段情报的往事依据未能核实，原始回复会保留供检查，不会作为已验证情报保存。', 'RMT_INTEL_EVIDENCE');
        }
        return { kind, text, ...(proof.verified ? proof.reference : { sourceMemoryIds: [], sourceMemoryAnchor: '' }) };
    };
    const sections = SECTION_KINDS.map(kind => {
        const item = raw.find(row => core_text.normalizeText(row?.kind, 20) === kind) || null;
        return normalizeSection(item, kind);
    }).filter(Boolean);
    // 模型没按 kind 写时，按顺序兜底，不因为格式小偏差丢掉整次结果。
    if (!sections.length) {
        raw.slice(0, 3).forEach((item, index) => {
            const section = normalizeSection(item, SECTION_KINDS[index]);
            if (section) sections.push(section);
        });
    }
    if (!sections.length) throw core_text.safeUserError(`这次没有收到${person.name}的回答，可以再问一次。`, 'RMT_INTEL_EMPTY');
    return { scene: core_text.normalizeText(data?.scene, 120), sections, evidenceVersion: 1 };
}

// Existing records remain readable. Rechecking is display-only: it neither edits
// stored prose nor grants old/model-provided flags authority over current evidence.
export function intelRecordForDisplay(record, memory) {
    if (!record || typeof record !== 'object') return null;
    const sections = (Array.isArray(record.sections) ? record.sections : []).map((item, index) => {
        const kind = SECTION_KINDS.includes(item?.kind) ? item.kind : SECTION_KINDS[Math.min(index, 2)];
        const text = core_text.normalizeText(item?.text, 1600);
        const proof = intelSectionEvidence(item, text, memory);
        const unverified = !proof.verified && (proof.needsEvidence || (record.evidenceVersion !== 1 && kind !== 'advice'));
        return { kind, text, ...(proof.verified ? proof.reference : { sourceMemoryIds: [], sourceMemoryAnchor: '' }),
            evidenceState: proof.verified ? 'verified' : unverified ? 'unverified' : 'none' };
    });
    return { ...record, sections };
}

export function isIntelRunning(scope, key) {
    return running.has(`${scope}\u001f${key}`);
}

export async function askIntel(personName, { onSettled } = {}) {
    const context = core_context.currentCharacterGuard();
    const memory = structuredClone(archive_repository.requireArchive(context));
    const person = intelPeople(context).find(item => item.name === personName);
    if (!person) throw core_text.safeUserError('人际庭园里找不到这个人，请刷新人际庭园后再试。', 'RMT_INTEL_PERSON');
    const scope = extras_store.extrasScope(context);
    const base = structuredClone(extras_store.readExtras(context));
    const runKey = `${scope}\u001f${person.key}`;
    if (running.has(runKey)) throw core_text.safeUserError(`已经在向${person.name}打听了，稍等一下。`, 'RMT_INTEL_RUNNING');
    running.add(runKey);
    try {
        const origin = core_context.captureTaskOrigin(context, memory.archiveRevision || '');
        const data = await generation_client.requestJson(intelPrompt(context, memory, person), `正在向${person.name}打听…`, {
            mode: 'intel', taskKey: `extras:intel:${runKey}`, context, origin,
        });
        let result;
        try { result = normalizeIntel(data, memory, person); }
        catch (error) {
            const held = extras_store.stageExtraResult({ scope, kind: 'intel', origin, base, raw: data });
            return { pending: true, scope, record: null, durable: held.durable,
                reason: error?.code === 'RMT_INTEL_EVIDENCE'
                    ? '这次情报的往事依据未能核实，原始回复已保留供导出检查，不会自动重新生成。'
                    : '已收到结果，但格式需要检查。请导出原始结果，不会自动重新生成。' };
        }
        const createdAt = Date.now();
        const record = { id: extras_store.extraRecordId('INTEL'), createdAt, person: person.name, relation: person.relation, ...result };
        record.archiveRevision = origin.archiveRevision;
        extras_store.stageExtraResult({ scope, kind: 'intel', origin, base, record, raw: data });
        return await extras_store.retryExtraSave(scope, record.id);
    } finally {
        running.delete(runKey);
        try { onSettled?.(); } catch {}
    }
}
