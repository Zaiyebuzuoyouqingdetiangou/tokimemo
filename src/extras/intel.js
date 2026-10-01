// 朋友情报：从人际庭园的人物出发，请 TA 用自己的口吻讲“他提起你的样子”。
// 事实只认档案；编号对不上档案时不报错，改标为“生活设定”。温度等生成参数完全沿用用户设置。
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
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
2. mention 与 seen 里说到的过去之事，必须来自上方档案，并在 sourceMemoryIds 填对应编号；${person.name} 没亲历、档案也没写的事，就让 TA 说“这个我就不清楚了”，不要编造。
3. advice 是建议，不是事实，sourceMemoryIds 留空数组。
4. 每段 2～5 句，口语化，符合 ${person.name} 的身份、时代和世界观；不要替 ${userName} 做决定或说话。
5. scene 写这次打听发生的时间地点，一句话，符合世界观。

【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
{"scene":"时间地点","sections":[{"kind":"mention","text":"……","sourceMemoryIds":["M001"]},{"kind":"seen","text":"……","sourceMemoryIds":["M002"]},{"kind":"advice","text":"……","sourceMemoryIds":[]}]}`;
}

export function normalizeIntel(data, memory, person) {
    const raw = Array.isArray(data?.sections) ? data.sections : [];
    const sections = SECTION_KINDS.map(kind => {
        const item = raw.find(row => core_text.normalizeText(row?.kind, 20) === kind) || null;
        const text = core_text.normalizeText(item?.text, 1600);
        if (!text) return null;
        const ids = kind === 'advice' ? [] : core_evidence.normalizeSourceMemoryIds(item?.sourceMemoryIds, memory, 0);
        return { kind, text, sourceMemoryIds: ids };
    }).filter(Boolean);
    // 模型没按 kind 写时，按顺序兜底，不因为格式小偏差丢掉整次结果。
    if (!sections.length) {
        raw.slice(0, 3).forEach((item, index) => {
            const text = core_text.normalizeText(item?.text, 1600);
            if (text) sections.push({ kind: SECTION_KINDS[index], text, sourceMemoryIds: index === 2 ? [] : core_evidence.normalizeSourceMemoryIds(item?.sourceMemoryIds, memory, 0) });
        });
    }
    if (!sections.length) throw core_text.safeUserError(`这次没有收到${person.name}的回答，可以再问一次。`, 'RMT_INTEL_EMPTY');
    return { scene: core_text.normalizeText(data?.scene, 120), sections };
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
                reason: '已收到结果，但格式需要检查。请导出原始结果，不会自动重新生成。' };
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
