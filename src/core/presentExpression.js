// Code-owned present-tense microgrammar for derived surfaces that have no historical source.
// Models select semantic tokens only; they never supply the rendered sentence. This deliberately
// trades unrestricted prose for a boundary that cannot smuggle an invented shared event.
import * as core_text from './text.js';

export const PRESENT_EXPRESSION_SCHEMA = Object.freeze({
    times: Object.freeze(['none', 'now', 'today', 'tonight', 'from-now-on']),
    emotions: Object.freeze(['love', 'miss', 'cherish', 'care', 'calm', 'grateful', 'joy']),
    wishes: Object.freeze(['peace', 'joy', 'health', 'freedom', 'warmth', 'good-dreams', 'success']),
    gestures: Object.freeze(['stay', 'meet', 'hold-hands', 'embrace', 'walk', 'listen']),
    tones: Object.freeze(['quiet', 'direct', 'warm', 'playful', 'ceremonial']),
    registers: Object.freeze(['plain', 'restrained', 'lyrical', 'classical', 'futurist']),
    images: Object.freeze(['none', 'light', 'stars', 'wind', 'rain', 'sea', 'home', 'path', 'season']),
    intensities: Object.freeze(['low', 'medium', 'high']),
    cadences: Object.freeze(['single', 'stacked', 'fragments']),
});

const PHRASE_BANKS = Object.freeze({
    plain: Object.freeze({
        time: { none: '', now: '此刻', today: '今天', tonight: '今夜', 'from-now-on': '从今往后' },
        emotion: { love: '我爱你', miss: '我想念你', cherish: '我珍惜你', care: '我牵挂你', calm: '有你在，我很安心', grateful: '谢谢你在这里', joy: '见到你，我很开心' },
        wish: { peace: '愿你平安', joy: '愿你快乐', health: '愿你健康', freedom: '愿你自在', warmth: '愿你常有温暖', 'good-dreams': '愿你今夜好梦', success: '愿你所愿皆成' },
        gesture: { stay: '我想陪在你身边', meet: '我想见你', 'hold-hands': '我想牵你的手', embrace: '我想抱抱你', walk: '我想和你走一段路', listen: '我想听你说话' },
    }),
    restrained: Object.freeze({
        time: { none: '', now: '现在', today: '今天', tonight: '今晚', 'from-now-on': '以后' },
        emotion: { love: '心意在你这里', miss: '有些想你', cherish: '你很重要', care: '我在意你', calm: '你在就好', grateful: '幸好你在', joy: '见你就很好' },
        wish: { peace: '平安就好', joy: '愿你开心', health: '照顾好自己', freedom: '愿你从容自在', warmth: '愿你身边常暖', 'good-dreams': '今晚好梦', success: '愿你顺利' },
        gesture: { stay: '我会在这里', meet: '想见你', 'hold-hands': '手给我吧', embrace: '让我抱一下', walk: '再走一段吧', listen: '我听着' },
    }),
    lyrical: Object.freeze({
        time: { none: '', now: '这一刻', today: '今日', tonight: '今夜', 'from-now-on': '往后的日子' },
        emotion: { love: '心正向你靠近', miss: '思念正落向你', cherish: '想把你珍重地放在心上', care: '牵挂沿着目光生长', calm: '你在，心便有了安静的去处', grateful: '庆幸此刻有你', joy: '见你时，心里有光' },
        wish: { peace: '愿平安一直找到你', joy: '愿欢喜停在你眼里', health: '愿你身心安稳', freedom: '愿你永远自由舒展', warmth: '愿温暖常常拥住你', 'good-dreams': '愿月色送你一夜好梦', success: '愿每一份心愿都有回声' },
        gesture: { stay: '想安静地陪着你', meet: '想让目光抵达你', 'hold-hands': '想把手交给你', embrace: '想把此刻的拥抱留给你', walk: '想和你向前走', listen: '想听你慢慢说' },
    }),
    classical: Object.freeze({
        time: { none: '', now: '此刻', today: '今日', tonight: '今宵', 'from-now-on': '自今而后' },
        emotion: { love: '心悦于君', miss: '念君', cherish: '愿珍重君心', care: '常有所牵', calm: '君在，心安', grateful: '幸得君在', joy: '见君则喜' },
        wish: { peace: '愿君长安', joy: '愿君常乐', health: '愿君安康', freedom: '愿君自在', warmth: '愿暖意常随君侧', 'good-dreams': '愿君今宵好梦', success: '愿君所愿皆成' },
        gesture: { stay: '愿伴君侧', meet: '愿与君相见', 'hold-hands': '愿执君手', embrace: '愿拥君片刻', walk: '愿与君同行', listen: '愿闻君言' },
    }),
    futurist: Object.freeze({
        time: { none: '', now: '当前时刻', today: '今日周期', tonight: '今夜时段', 'from-now-on': '从下一刻开始' },
        emotion: { love: '心意信号指向你', miss: '想念信号持续在线', cherish: '你被标记为最重要', care: '关切参数正在上升', calm: '你的存在让核心趋于安稳', grateful: '系统记录：庆幸你在', joy: '检测到因你而起的愉悦' },
        wish: { peace: '愿你的坐标始终平安', joy: '愿快乐保持高亮', health: '愿你的状态稳定健康', freedom: '愿你自由选择每条航线', warmth: '愿温度一直环绕你', 'good-dreams': '愿今夜进入好梦模式', success: '愿所有愿望顺利抵达' },
        gesture: { stay: '想与你保持同一频道', meet: '想抵达你的坐标', 'hold-hands': '想把掌心权限交给你', embrace: '想给你一个真实的拥抱', walk: '想与你继续这条航线', listen: '接收频道一直为你开启' },
    }),
});

const SHORT_TEXT = Object.freeze({
    emotion: { love: '爱你', miss: '想你', cherish: '珍惜', care: '牵挂', calm: '安心', grateful: '感谢', joy: '欢喜' },
    wish: { peace: '平安', joy: '快乐', health: '安康', freedom: '自在', warmth: '温暖', 'good-dreams': '好梦', success: '如愿' },
    gesture: { stay: '陪伴', meet: '相见', 'hold-hands': '牵手', embrace: '拥抱', walk: '同行', listen: '倾听' },
});

const IMAGE_TEXT = Object.freeze({
    light: '想把一束光留给你', stars: '想把今夜的星光写给你', wind: '想让风替我轻轻问候你',
    rain: '想把雨声折成一行安静的话', sea: '想让潮声把心意送向你', home: '想让你此刻有归处',
    path: '想和你看向前面的路', season: '想把这一季的温柔留给你',
});

function token(value, allowed, fallback = 'none') {
    const normalized = core_text.normalizeText(value, 30).toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
}

export function relationshipExpressionTier(memoryBank) {
    const summary = core_text.normalizeText(memoryBank?.archiveSummary, 2400);
    const splitClauses = value => core_text.normalizeText(value, 12000)
        .split(/[，,。.!！？?；;\n]+/u).map(item => item.trim()).filter(Boolean);
    const escapeRegExp = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const charName = escapeRegExp(core_text.normalizeText(memoryBank?.characterName, 120));
    const userName = escapeRegExp(core_text.normalizeText(memoryBank?.userName, 120));
    const namedPairSubject = charName && userName
        ? `(?:${charName}\\s*(?:和|与|及|、|and)\\s*${userName}|${userName}\\s*(?:和|与|及|、|and)\\s*${charName})`
        : '';
    const genericPairSubject = '(?:双方|两人|两个人|我们|咱们|彼此|互相|角色和用户|角色与用户|\\bwe\\b|\\bboth(?:\\s+of\\s+us)?\\b|\\bthe\\s+two\\b|the\\s+character\\s+and\\s+(?:the\\s+)?user)';
    const pairSubject = namedPairSubject ? `(?:${namedPairSubject}|${genericPairSubject})` : genericPairSubject;
    const pairFiller = '(?:(?:目前|现在|当前|已经|已|正式|仍然|渐渐|越来越|都|正|早已|终于|确实|相互|彼此|关系|的关系|之间|确认|成为|是|为|处于|are|became|become|currently|now|already|officially|still|mutually)\\s*){0,4}';
    const pastOnly = /(?:曾经|过去|以前|从前|一度|当时|formerly|used\s+to|once\s+were)/iu;
    const negativeRelationship = /(?:刚(?:刚)?认识|初次见面|互不熟悉|仍然陌生|还是陌生|没有恋爱关系|并非(?:恋人|情侣|伴侣|夫妻)|不是(?:恋人|情侣|伴侣|夫妻)|不再是(?:恋人|情侣|伴侣|夫妻)|单方面(?:喜欢|感情)|尚未确认(?:关系|恋爱)|关系(?:已经)?结束|(?:已经)?结束|结束(?:了)?关系|只做朋友|只是(?:普通)?朋友|回到朋友(?:关系)?|分手|解除婚约|离婚|拒绝(?:了)?(?:告白|交往|恋爱)|疏远|敌对|互相戒备|just\s+met|still\s+strangers?|not\s+(?:dating|lovers?|partners?|married|engaged|a\s+couple)|no\s+romantic\s+relationship|just\s+friends?|only\s+friends?|back\s+to\s+(?:being\s+)?friends?|one[- ]sided|unrequited|broke\s+up|relationship\s+ended|no\s+longer\s+(?:lovers?|partners?|married|together)|divorced|rejected\s+(?:the\s+)?confession)/iu;
    const tier3 = /(?:已确认(?:交往|恋爱|关系|双向亲密关系)|双向亲密关系|正式交往|稳定交往|开始交往|同意开始交往|成为恋人|是恋人|情侣|相爱|互相爱|彼此爱|伴侣|夫妻|已婚|结婚|订婚|爱人|dating|stably\s+dating|confirmed\s+mutual\s+intimacy|started\s+dating|agreed\s+to\s+date|became\s+lovers?|are\s+lovers?|a\s+couple|in\s+love|partners?|married|engaged)/iu;
    const tier2 = /(?:暧昧|彼此喜欢|互有好感|亲近|亲密|熟悉|信任|依赖|心意相通|关系升温|mutual\s+(?:feelings?|affection)|close\s+friends?|close|intimate|trust|fond\s+of\s+each\s+other)/iu;
    const tier1 = /(?:合作伙伴|朋友|同伴|伙伴|熟人|合作|关心|友好|friends?|companions?|acquaintances?|friendly|care\s+about)/iu;
    const terminalWithoutSubject = /(?:关系(?:已经)?结束|结束(?:了)?关系|只做朋友|回到朋友(?:关系)?|(?:现在|当前|已经).{0,8}(?:疏远|敌对|互相戒备)|分手|解除婚约|离婚|relationship\s+ended|back\s+to\s+(?:being\s+)?friends?|broke\s+up|divorced|now\s+(?:distant|hostile))/iu;
    const transitionBridge = '(?:(?:但|不过|后来|而)|[，,。.!！？?；;]\\s*(?:现在|当前|如今|后来))';
    const currentReunion = new RegExp(`(?:
        (?:过去|曾经|以前).{0,18}(?:分手|离婚|解除婚约|关系(?:曾经)?结束).{0,8}${transitionBridge}.{0,10}(?:复合|重新交往|恢复恋爱)
        |(?:formerly|once).{0,24}(?:broke\\s+up|separated|divorced|relationship\\s+ended).{0,10}(?:but|later|now|[,.!?;]\\s*now).{0,14}(?:reconciled|back\\s+together|dating\\s+again)
    )`.replace(/\s+/g, ''), 'iu');
    const currentRepaired = new RegExp(`(?:
        (?:过去|曾经|以前).{0,18}(?:争吵|冲突|闹翻|疏远|不和).{0,8}${transitionBridge}.{0,10}(?:和好|重归于好|恢复友好)
        |(?:formerly|once).{0,24}(?:argued|fought|conflict|fell\\s+out|became\\s+distant).{0,10}(?:but|later|now|[,.!?;]\\s*now).{0,14}(?:made\\s+up|reconciled)
    )`.replace(/\s+/g, ''), 'iu');
    const relationshipTail = '(?:\\s*(?:了|中|关系|状态|至今|现在|当前|不久|多年|多时|很久|一段时间|now|currently|still|with\\s+each\\s+other|for\\s+(?:years?|months?|a\\s+while)|since\\s+[^,，。.!！？?；;]{1,24})){0,3}\\s*$';
    const directSubjectMatch = (clause, relation, subject) => !!subject
        && new RegExp(`^\\s*${subject}\\s*${pairFiller}(?:${relation.source})${relationshipTail}`, 'iu').test(clause);
    const participantStatusMatch = (clause, relation) => new RegExp(`^\\s*${pairFiller}(?:${relation.source})${relationshipTail}`, 'iu').test(clause);
    const relationMatches = (clause, relation, { participants = [], summaryContext = false } = {}) => {
        const participantSet = new Set(core_text.cleanArray(participants, 12, 120).map(item => item.toLowerCase()));
        const participantsBindPair = !!charName && !!userName
            && participantSet.has(core_text.normalizeText(memoryBank?.characterName, 120).toLowerCase())
            && participantSet.has(core_text.normalizeText(memoryBank?.userName, 120).toLowerCase());
        return directSubjectMatch(clause, relation, namedPairSubject)
            || (summaryContext && directSubjectMatch(clause, relation, genericPairSubject))
            || (participantsBindPair && (directSubjectMatch(clause, relation, genericPairSubject)
                || participantStatusMatch(clause, relation)));
    };
    const classify = (clause, options = {}) => {
        const matches = relation => relationMatches(clause, relation, options);
        if (matches(currentReunion)) return 3;
        if (matches(currentRepaired)) return 2;
        if (matches(negativeRelationship) || matches(terminalWithoutSubject)) return 0;
        if (!pastOnly.test(clause) && matches(tier3)) return 3;
        if (matches(tier2)) return 2;
        if (matches(tier1)) return 1;
        return null;
    };
    const classifyRecord = (value, options) => {
        const text = core_text.normalizeText(value, 12000);
        // A narrow past-to-present transition has to see the whole record because punctuation is
        // commonly used between the old state and the current one. All ordinary statuses remain
        // clause-scoped so an unrelated suffix cannot inherit the pair subject from another clause.
        const wholeRecordTransition = classify(text, options);
        if (wholeRecordTransition !== null
            && (relationMatches(text, currentReunion, options) || relationMatches(text, currentRepaired, options))) {
            return [wholeRecordTransition];
        }
        return splitClauses(text).map(clause => classify(clause, options)).filter(value => value !== null);
    };
    let state = 0;
    for (const next of classifyRecord(summary, { summaryContext: true })) {
        if (next !== null) state = next;
    }
    // Relationship state is cumulative: an older explicit commitment remains current until a
    // later relationship event changes it. Scanning only a recent tail forgets that state after
    // enough ordinary memories, so walk the complete bounded archive in stored chronology.
    const timeline = Array.isArray(memoryBank?.memories) ? memoryBank.memories : [];
    for (const memory of timeline) {
        const text = [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].join(' ');
        for (const next of classifyRecord(text, { participants: memory?.participants })) {
            if (next !== null) state = next;
        }
    }
    return state;
}

export function normalizePresentExpression(value, { relationshipTier = 3 } = {}) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = {
        time: token(raw.time, PRESENT_EXPRESSION_SCHEMA.times),
        emotion: token(raw.emotion, PRESENT_EXPRESSION_SCHEMA.emotions),
        wish: token(raw.wish, PRESENT_EXPRESSION_SCHEMA.wishes),
        gesture: token(raw.gesture, PRESENT_EXPRESSION_SCHEMA.gestures),
        tone: token(raw.tone, PRESENT_EXPRESSION_SCHEMA.tones, 'quiet'),
        register: token(raw.register, PRESENT_EXPRESSION_SCHEMA.registers, 'plain'),
        image: token(raw.image, PRESENT_EXPRESSION_SCHEMA.images),
        intensity: token(raw.intensity, PRESENT_EXPRESSION_SCHEMA.intensities, 'medium'),
        cadence: token(raw.cadence, PRESENT_EXPRESSION_SCHEMA.cadences, 'stacked'),
    };
    const tier = Math.max(0, Math.min(3, Number(relationshipTier) || 0));
    const allowedEmotion = tier >= 3
        ? PRESENT_EXPRESSION_SCHEMA.emotions
        : tier >= 2
            ? ['none', 'miss', 'cherish', 'care', 'calm', 'grateful', 'joy']
            : tier >= 1
                ? ['none', 'grateful', 'joy']
                : ['none'];
    const allowedGesture = tier >= 3
        ? PRESENT_EXPRESSION_SCHEMA.gestures
        : tier >= 2
            ? ['none', 'stay', 'meet', 'walk', 'listen']
            : tier >= 1
                ? ['none', 'walk', 'listen']
                : ['none'];
    if (!allowedEmotion.includes(normalized.emotion)) normalized.emotion = 'none';
    if (!allowedGesture.includes(normalized.gesture)) normalized.gesture = 'none';
    return normalized;
}

export function presentExpressionHasContent(value) {
    const item = normalizePresentExpression(value);
    return item.emotion !== 'none' || item.wish !== 'none' || item.gesture !== 'none';
}

export function renderPresentExpressionLines(value, { compact = false } = {}) {
    const item = normalizePresentExpression(value);
    const bank = PHRASE_BANKS[item.register] || PHRASE_BANKS.plain;
    const lines = [];
    const prefix = bank.time[item.time] || '';
    const intensityPrefix = item.intensity === 'low'
        ? (item.register === 'classical' ? '悄然' : '轻轻地')
        : item.intensity === 'high'
            ? (item.register === 'classical' ? '至深' : '很认真地')
            : '';
    const phrase = (group, value) => compact ? SHORT_TEXT[group]?.[value] : bank[group]?.[value];
    if (item.emotion !== 'none') lines.push(`${!compact && prefix ? `${prefix}，` : ''}${!compact ? intensityPrefix : ''}${phrase('emotion', item.emotion)}`);
    if (item.gesture !== 'none') lines.push(`${!compact && !lines.length && prefix ? `${prefix}，` : ''}${phrase('gesture', item.gesture)}`);
    if (item.wish !== 'none') lines.push(phrase('wish', item.wish));
    if (!compact && item.image !== 'none') lines.push(IMAGE_TEXT[item.image]);
    let unique = [...new Set(lines.filter(Boolean))].slice(0, 4);
    if (compact || item.cadence === 'fragments') unique = unique.map(line => line.replace(/[，。！!]/g, ''));
    if (!compact && item.cadence === 'single' && unique.length > 1) unique = [unique.join('，')];
    const suffix = item.tone === 'playful' ? '！' : item.tone === 'quiet' ? '' : '。';
    return unique.map(line => compact ? line : `${line}${suffix}`);
}

export function renderPresentExpressionText(value, options = {}) {
    const lines = renderPresentExpressionLines(value, options);
    return lines.join(options.compact ? ' · ' : '\n');
}
