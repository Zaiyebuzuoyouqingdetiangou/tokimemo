// Shared relationship checks. No mode imports or mutable story/session state.
// Consumers keep their public wrappers and may supply their existing error factory.
import * as core_text from './text.js';
import * as core_presentExpression from './presentExpression.js';

const FORMER_RELATIONSHIP_RE = /(?:前任|前女友|前男友|旧爱|前妻|前夫|前对象|上一任)/i;
const ROMANCE_RE = /(?:恋爱|相爱|爱上|爱着|深爱|倾心|约会|结婚|成婚|订婚|婚姻|婚礼|嫁给|娶了|恋人|伴侣|爱人|妻子|丈夫|夫妻|老公|老婆|组建家庭|建立家庭|成家|有了(?:一个)?家(?:庭)?|生儿育女|养育孩子|育有子女)/i;
const THIRD_PARTY_RE = /(?:别人|他人|其他人|第三者|另一个人|某个人|陌生人|除你以外|非用户)/i;

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pairRelationshipError() {
    return core_text.safeUserError('关系表述只能围绕角色与用户，不能新增第三方恋爱、婚姻或家庭。', 'RMT_PAIR_RELATIONSHIP');
}

// Inspect the predicate, not an entire clause. A negative first predicate cannot
// excuse a later affirmative relationship ("没有恋爱但和别人结婚").
function negatedPredicate(clause, index, length) {
    const prefix = clause.slice(0, index).split(/(?:但是|然而|不过|可是|却|但|而且|而|随后|然后|并且|也|又|还|并(?=与|和|跟|会|娶|嫁))/u).at(-1);
    const suffix = clause.slice(index + length);
    return /(?:并未|并没有|没有|从未|未曾|不曾|不会|拒绝|不存在|绝无|并非|不是|不)(?:曾经|真正|再|去)?$/u.test(prefix)
        || /(?:没有|从未|未曾|不曾|不会|不|拒绝)(?:与|和|跟)[^，,。！？!?；;\n]{1,24}?$/u.test(prefix)
        || /^(?:变量|概率)?\s*(?:[=:：]\s*)?(?:0|零|无|不存在|未发生|不成立)(?:$|\s)/u.test(suffix);
}

export function assertPairRelationshipSafety(value, context = {}, label = '角色关系', invalidRelationship = pairRelationshipError, options = {}) {
    const text = core_text.normalizeText(value, 30000);
    const fictionPairScope = options.fictionPairScope === true;
    const userName = core_text.normalizeText(context?.name1, 120);
    const userMarker = userName && !/^\{\{user\}\}$/i.test(userName)
        ? new RegExp(`(?:你|妳|您|用户|\\{\\{user\\}\\}|${escapeRegExp(userName)})`, 'i')
        : /(?:你|妳|您|用户|\{\{user\}\})/i;
    let userAntecedent = false;
    let precedingComma = false;
    const clauses = text.match(/[^，,。！？!?；;\n]+[，,。！？!?；;\n]?/g) || [];
    for (const fragment of clauses) {
        const clause = fragment.replace(/[，,。！？!?；;\n]+$/, '').trim();
        const former = [...clause.matchAll(new RegExp(FORMER_RELATIONSHIP_RE.source, 'gi'))];
        if (former.some(match => !(fictionPairScope && match[0] === '前任'
            && /^(?:掌门|馆主|店主|主持|县令|知府|官员|主管|负责人|校长|院长|会长|船长|将军|国王|女王)/u.test(clause.slice(match.index + match[0].length)))
            && !negatedPredicate(clause, match.index, match[0].length))) throw invalidRelationship();
        const refersToUser = userMarker.test(clause);
        const separatePartners = /(?:各自|分别|另有|新(?:的)?(?:恋人|爱人|伴侣|妻子|丈夫))/.test(clause);
        const inheritedUser = !separatePartners && userAntecedent && (/^(?:我们|咱们|我俩|双方)/.test(clause)
            || precedingComma && /^(?:我的|婚姻|家庭)/.test(clause));
        // Only an explicit joint subject licenses the immediately following same-subject clause.
        // A new named or third-person subject clears the antecedent even without punctuation.
        userAntecedent = !separatePartners && !THIRD_PARTY_RE.test(clause) && (inheritedUser
            || refersToUser && (ROMANCE_RE.test(clause) || /(?:我\s*(?:与|和|跟)|(?:你|妳|您)\s*(?:与|和|跟)\s*我)/.test(clause)));
        precedingComma = /[，,]$/.test(fragment);
        if (!ROMANCE_RE.test(clause)) continue;
        const predicates = [...clause.matchAll(new RegExp(ROMANCE_RE.source, 'gi'))];
        // Negation belongs to one predicate, never to the entire clause.
        if (predicates.length && predicates.every(match => negatedPredicate(clause, match.index, match[0].length))) continue;
        if (separatePartners) throw invalidRelationship();
        if (!fictionPairScope && THIRD_PARTY_RE.test(clause)) throw invalidRelationship();
        const namedTargets = [
            ...clause.matchAll(/(?:与|和|跟)\s*([^，,。！？!?；;、\n]{1,24}?)\s*(?:恋爱|相爱|约会|结婚|成婚|订婚|组建家庭|建立家庭|成家|有了(?:一个)?家(?:庭)?|生儿育女|养育孩子|育有子女)/gi),
            // Do not swallow a later romantic predicate into its predecessor's
            // target ("爱上你而爱上别人" is two targets, not a target containing 你).
            ...clause.matchAll(/(?:爱上|爱着|深爱|倾心于?|嫁给|娶了)\s*((?:(?!(?:而|但|却|也|又|并且|然后|随后)(?:爱上|爱着|深爱|倾心|嫁给|娶了|与|和|跟))[^，,。！？!?；;、\n]){1,24})/gi),
            ...clause.matchAll(/([^，,。！？!?；;、\n]{1,24}?)\s*(?:成为|是)(?:了)?我的(?:恋人|伴侣|爱人|妻子|丈夫|老公|老婆)/gi),
            ...(fictionPairScope ? [...clause.matchAll(/([^，,。！？!?；;、\n]{1,24}?)\s*(?:与|和|跟)\s*我\s*(?:恋爱|相爱|约会|结婚|成婚|订婚|组建家庭|建立家庭|成家|有了(?:一个)?家(?:庭)?)/gi)] : []),
            ...(fictionPairScope ? [...clause.matchAll(/(?:与|和|跟)\s*([^，,。！？!?；;、\n]{1,24}?)\s*(?:终成|成为)(?:夫妻|恋人|伴侣)/gi),
                ...clause.matchAll(/我的(?:恋人|伴侣|爱人|妻子|丈夫|老公|老婆)(?:就是|是)\s*([^，,。！？!?；;、\n]{1,24})/gi)] : []),
        ].filter(match => {
            const predicate = [...match[0].matchAll(new RegExp(ROMANCE_RE.source, 'gi'))].at(-1);
            return !predicate || !negatedPredicate(clause, match.index + predicate.index, predicate[0].length);
        }).map(match => core_text.normalizeText(match?.[1], 40)).filter(Boolean);
        const charName = core_text.normalizeText(context?.name2, 120);
        const pairTarget = target => userMarker.test(target) || fictionPairScope
            && (/^(?:我|他|她|对方|彼此|眼前人|心上人)$/u.test(target) || charName && target === charName);
        if (namedTargets.some(target => !pairTarget(target))) {
            throw invalidRelationship();
        }
        // Fiction is already locally scoped to the pair. An isolated noun,
        // narrator's "两人" or an omitted subject is not proof of a third party.
        // Current-life consumers retain their existing antecedent requirement.
        if (!fictionPairScope && !refersToUser && !inheritedUser) throw invalidRelationship();
    }
    return text;
}


// Deliberately narrow subject/predicate grammar: a name near “married” is not
// authority. Only a direct statement about this exact pair can authorize address.
function pairRelationshipStates(value, memory, { generic = false } = {}) {
    const charName = core_text.normalizeText(memory?.characterName, 120);
    const userName = core_text.normalizeText(memory?.userName, 120);
    const ref = (name, marker) => `(?:${name && escapeRegExp(name) + '|'}\\{\\{${marker}\\}\\})`;
    const c = ref(charName, 'char'), u = ref(userName, 'user');
    const named = `(?:${c}\\s*(?:和|与|及|、|and)\\s*${u}|${u}\\s*(?:和|与|及|、|and)\\s*${c})`;
    const subject = generic ? `(?:${named}|两人|双方|我们|咱们|角色与用户|we)` : named;
    const filler = '(?:(?:目前|现在|当前|已经|早已|已|仍然|正式|确认|成为|是|为|关系|的关系|之间|处于|are|have\\s+been|currently|now|already|still)\\s*){0,5}';
    const tail = '(?:\\s*(?:关系|状态|了|多年|至今|多年了|for\\s+years|now|currently))?\\s*$';
    const direct = pattern => new RegExp(`^${subject}\\s*${filler}(?:${pattern})${tail}`, 'iu');
    const married = direct('夫妻|夫妇|配偶|已婚|结婚|成婚|married|spouses');
    const dating = direct('恋人|情侣|伴侣|交往|恋爱|复合|重新交往|恢复恋爱|lovers|partners|dating|a\\s+couple|back\\s+together');
    const ended = direct('离婚|分手|解除婚约|不再是(?:夫妻|情侣|恋人)|不是(?:夫妻|情侣|恋人)|并非(?:夫妻|情侣|恋人)|没有恋爱关系|尚未确认关系|只是(?:普通)?朋友|只做朋友|刚刚认识|刚认识|初次见面|陌生人|divorced|broke\\s+up|not\\s+(?:married|dating|lovers)|just\\s+friends');
    const friends = direct('朋友|普通朋友|同伴|熟人|friends|companions');
    const possessive = relation => new RegExp(`^(?:${c}\\s*(?:是|为)\\s*${u}\\s*的(?:${relation})|${u}\\s*(?:是|为)\\s*${c}\\s*的(?:${relation}))${tail}`, 'iu');
    const english = relation => new RegExp(`^(?:${c}\\s+is\\s+(?:the\\s+)?(?:${relation})\\s+of\\s+${u}|${u}\\s+is\\s+(?:the\\s+)?(?:${relation})\\s+of\\s+${c}|${c}\\s+is\\s+${u}['’]s\\s+(?:${relation})|${u}\\s+is\\s+${c}['’]s\\s+(?:${relation}))${tail}`, 'iu');
    const marriedTo = new RegExp(`^(?:${c}\\s+is\\s+married\\s+to\\s+${u}|${u}\\s+is\\s+married\\s+to\\s+${c})${tail}`, 'iu');
    const frame = /(?:如果|假如|假设|可能|设想|希望|想象|扮演|梦里|梦境|剧本|小说|台词|假装|伪装|将来|未来|曾经|过去|以前)|\b(?:if|maybe|hypothetical|pretend|roleplay|dream|fiction|formerly|wish)\b/iu;
    const result = [];
    for (const fragment of core_text.normalizeText(value, 30000).match(/[^。.!?！？；;\n]+[。.!?！？；;]?/gu) || []) {
        if (/[?？]$/.test(fragment) || frame.test(fragment)) continue;
        const sentence = fragment.replace(/[。.!！？；;]$/, '');
        for (const raw of sentence.split(/[，,]/u)) {
            const clause = raw.trim().replace(/^(?:角色卡|人设|设定|关系|当前关系|初始关系|开局关系|婚姻状态)\s*[:：]\s*/u, '');
            if (ended.test(clause)) result.push({ tier: 0, married: false });
            else if (friends.test(clause)) result.push({ tier: 1, married: false });
            else if (married.test(clause) || possessive('妻子|丈夫|老婆|老公|夫君|娘子|配偶').test(clause)
                || english('wife|husband|spouse').test(clause) || marriedTo.test(clause)) result.push({ tier: 3, married: true });
            else if (dating.test(clause) || possessive('恋人|伴侣|女朋友|男朋友|爱人').test(clause)
                || english('girlfriend|boyfriend|partner|lover').test(clause)) result.push({ tier: 3, married: false });
        }
    }
    return result;
}

export function explicitPairRelationship(controlledEvidence, memory) {
    const settings = pairRelationshipStates(controlledEvidence, memory);
    // Conflicting initial statements grant no new intimacy. Model-generated prose
    // cannot provide this parameter; it comes only from the captured input envelope.
    let state = settings[0] || null;
    if (settings.some(item => item.tier !== state.tier || item.married !== state.married)) state = null;
    if (!state) return null;
    // Current archive state is authoritative over the initial setting. Do not use
    // max(tiers): divorce/return to friendship must be able to lower that baseline.
    for (const next of pairRelationshipStates(memory?.archiveSummary, memory, { generic: true })) state = next;
    for (const record of Array.isArray(memory?.memories) ? memory.memories : []) {
        const participants = new Set(Array.isArray(record?.participants) ? record.participants : []);
        const pairBound = participants.size === 2 && participants.has(memory.characterName) && participants.has(memory.userName);
        for (const field of [record?.title, record?.summary, ...(Array.isArray(record?.anchors) ? record.anchors : [])]) {
            for (const next of pairRelationshipStates(field, memory, { generic: pairBound })) state = next;
        }
    }
    return state;
}

export function presentRelationshipAllows(prose, memory, options = {}) {
    const archiveTier = core_presentExpression.relationshipExpressionTier(memory);
    const setting = explicitPairRelationship(options?.controlledEvidence, memory);
    const tier = setting ? setting.tier : archiveTier;
    const clauses = String(prose).split(/[，,。！？!?；;\n]+/u);
    const names = [memory.characterName + '和' + memory.userName, memory.characterName + '与' + memory.userName,
        memory.userName + '和' + memory.characterName, memory.userName + '与' + memory.characterName, '两人', '双方', '我们', '角色与用户'];
    const married = setting ? setting.married : tier >= 3 && (memory.memories || []).some(item =>
        [item.title, item.summary, ...(item.anchors || [])].join('\n').split(/[。！？!?；;\n]+/u).some(line =>
            names.some(name => line.includes(name)) && /(?:结婚|已婚|夫妻|配偶)/u.test(line) && !/(?:未|没有|不是|并非|想|希望|离婚|分手)/u.test(line)));
    return clauses.every(line => {
        if (/(?:想|希望|愿意|要不要|如果|假如|未来)/u.test(line)) return true;
        if (/(?:我的|你的|亲爱的|致|给).{0,4}(?:妻子|丈夫|老婆|老公|夫君|娘子)|我们(?:是|已经是)?.{0,3}(?:夫妻|夫妇)/u.test(line)) return married;
        if (/(?:我的|你的|亲爱的|致|给).{0,4}(?:女朋友|男朋友|恋人|伴侣|爱人)|我们(?:是|已经是)?.{0,3}(?:情侣|恋人)/u.test(line)) return tier >= 3;
        return true;
    });
}
