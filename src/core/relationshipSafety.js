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

export function assertPairRelationshipSafety(value, context = {}, label = '角色关系', invalidRelationship = pairRelationshipError) {
    const text = core_text.normalizeText(value, 30000);
    if (FORMER_RELATIONSHIP_RE.test(text)) throw new Error(`${label}包含被禁止的前任/旧爱情节。`);
    const userName = core_text.normalizeText(context?.name1, 120);
    const userMarker = userName && !/^\{\{user\}\}$/i.test(userName)
        ? new RegExp(`(?:你|妳|您|用户|\\{\\{user\\}\\}|${escapeRegExp(userName)})`, 'i')
        : /(?:你|妳|您|用户|\{\{user\}\})/i;
    let userAntecedent = false;
    let precedingComma = false;
    const clauses = text.match(/[^，,。！？!?；;\n]+[，,。！？!?；;\n]?/g) || [];
    for (const fragment of clauses) {
        const clause = fragment.replace(/[，,。！？!?；;\n]+$/, '').trim();
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
        if (predicates.length && predicates.every(match => {
            const prefix = clause.slice(0, match.index);
            const suffix = clause.slice(match.index + match[0].length);
            return /(?:并未|并没有|没有|从未|未曾|不会|拒绝|不存在|绝无)(?:曾经|真正|再|去)?$/.test(prefix)
                || /(?:没有与|不会与|不与)[^而但却然后]{1,12}$/.test(prefix)
                || /^(?:变量|概率)?\s*(?:[=:：]\s*)?(?:0|零|无|不存在|未发生|不成立)(?:$|\s)/.test(suffix);
        })) continue;
        if (separatePartners) throw invalidRelationship();
        if (THIRD_PARTY_RE.test(clause)) throw new Error(`${label}包含 {{char}} 与第三方的恋爱/婚姻/成家情节。`);
        const namedTargets = [
            ...clause.matchAll(/(?:与|和|跟)\s*([^，,。！？!?；;、\n]{1,24}?)\s*(?:恋爱|相爱|约会|结婚|成婚|订婚|组建家庭|建立家庭|成家|有了(?:一个)?家(?:庭)?|生儿育女|养育孩子|育有子女)/gi),
            ...clause.matchAll(/(?:爱上|爱着|深爱|倾心于?|嫁给|娶了)\s*([^，,。！？!?；;、\n]{1,24})/gi),
            ...clause.matchAll(/([^，,。！？!?；;、\n]{1,24}?)\s*(?:成为|是)(?:了)?我的(?:恋人|伴侣|爱人|妻子|丈夫|老公|老婆)/gi),
        ].map(match => core_text.normalizeText(match?.[1], 40)).filter(Boolean);
        if (namedTargets.some(target => !userMarker.test(target))) {
            throw new Error(`${label}包含 {{char}} 与具名第三方的恋爱/婚姻/成家情节。`);
        }
        if (!refersToUser && !inheritedUser) throw invalidRelationship();
    }
    return text;
}

export function presentRelationshipAllows(prose, memory) {
    const tier = core_presentExpression.relationshipExpressionTier(memory);
    const clauses = String(prose).split(/[，,。！？!?；;\n]+/u);
    const names = [memory.characterName + '和' + memory.userName, memory.characterName + '与' + memory.userName,
        memory.userName + '和' + memory.characterName, memory.userName + '与' + memory.characterName, '两人', '双方', '我们', '角色与用户'];
    const married = tier >= 3 && (memory.memories || []).some(item =>
        [item.title, item.summary, ...(item.anchors || [])].join('\n').split(/[。！？!?；;\n]+/u).some(line =>
            names.some(name => line.includes(name)) && /(?:结婚|已婚|夫妻|配偶)/u.test(line) && !/(?:未|没有|不是|并非|想|希望|离婚|分手)/u.test(line)));
    return clauses.every(line => {
        if (/(?:想|希望|愿意|要不要|如果|假如|未来)/u.test(line)) return true;
        if (/(?:我的|你的|亲爱的|致|给).{0,4}(?:妻子|丈夫|老婆|老公|夫君|娘子)|我们(?:是|已经是)?.{0,3}(?:夫妻|夫妇)/u.test(line)) return married;
        if (/(?:我的|你的|亲爱的|致|给).{0,4}(?:女朋友|男朋友|恋人|伴侣|爱人)|我们(?:是|已经是)?.{0,3}(?:情侣|恋人)/u.test(line)) return tier >= 3;
        return true;
    });
}

