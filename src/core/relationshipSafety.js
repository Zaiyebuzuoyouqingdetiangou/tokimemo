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
