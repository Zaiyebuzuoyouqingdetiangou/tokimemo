import * as core_text from '../core/text.js';
import * as world_sources from '../archive/worldInfoSources.js';
// r84.74+ 房间 Q 版小人按人设显示（dev/active/room-figure）。
// 只在本地读：角色卡正文 → 角色卡内嵌世界书 / 角色卡绑定的世界书里点名这个人的条目 → 按身份推断。
// 不请求模型，不写回存档；结果只用于画小人，全部是代码自有的枚举值。
// 优先级：房间生成时已核验的字段（explicitFields）> 角色卡 > 世界书 > 按身份推断 > 原值。

const SENTENCE_SPLIT = /[\n。！？!?；;]+|\.(?:\s|$)/;
const CLAUSE_SPLIT = /[，,、]+/;
const LOOK_WORDS = /(发|髮|眸|瞳|眼|衣|袍|衫|裙|服|装|袖|斗篷|披风|身材|身形|个子|身高|体型|肩|戴|耳|角|尾|帽|冠|巾|围巾|镜|\bhair\b|\beyes?\b|\bwear(s|ing)?\b|\bdress(es|ed)?\b|\brobes?\b|\bcoats?\b|\bsuits?\b|\bglasses\b|\bears\b|\bhorns?\b|\bbuilt\b|\btall\b)/i;
const NEGATION = /(不|没|无|未|别|非)[^，。；,\n]{0,3}$|\b(?:not|never|without|no|doesn't|don't)\b[^.,;\n]{0,12}$/i;
// r84.79: 英文词一律按整词匹配（\b），避免 that→hat、childhood→hood、himself→elf 这类误判。
const either = (zh, en) => new RegExp(`${zh}|\\b(?:${en})\\b`, 'i');

// 颜色词 → 代码自有色板键。顺序决定“银白”先于“白”。
const COLOUR_WORDS = [
    ['silver', /银白色|银白|银灰色|银灰|银色|银/], ['white', /雪白|纯白|霜白|月白|素白|白色|白/], ['black', /漆黑|乌黑|墨黑|黑色|黑|乌|墨|玄/],
    ['red', /绯红|赤红|殷红|酒红|红|赤|绯/], ['pink', /粉/], ['gold', /金黄|金色|金|黄/], ['brown', /棕|栗|褐|茶色/],
    ['blue', /湛蓝|深蓝|藏蓝|蓝/], ['cyan', /青|碧/], ['green', /绿/], ['purple', /紫/], ['gray', /灰/],
];
const HAIR_FROM_COLOUR = { silver: 'silver', white: 'white', black: 'black', red: 'red', pink: 'fantasy_warm', gold: 'light', brown: 'brown', blue: 'fantasy_cool', cyan: 'fantasy_cool', green: 'fantasy_cool', purple: 'fantasy_cool', gray: 'silver' };
// 英文发色：颜色词与 hair 之间允许夹几个词（long black hair / silver, waist-length hair）。
const EN_HAIR = (colour) => new RegExp(`\\b(?:${colour})\\b[^.;!?\\n]{0,24}?\\bhair\\b`, 'i');
const HAIR_ENGLISH = [['silver', EN_HAIR('silver|silvery|platinum|grey|gray')], ['white', EN_HAIR('white|snowy')], ['black', EN_HAIR('black|jet-black|raven|dark')],
    ['red', EN_HAIR('red|crimson|ginger|auburn')], ['light', EN_HAIR('blond|blonde|golden|fair')], ['brown', EN_HAIR('brown|chestnut|brunette')],
    ['fantasy_cool', EN_HAIR('blue|green|purple|violet|teal')], ['fantasy_warm', EN_HAIR('pink|orange')]];
const EYE_TONES = new Set(['gold', 'red', 'blue', 'cyan', 'green', 'purple', 'silver', 'pink', 'brown', 'black', 'gray']);
const EN_EYES = [['gold', 'golden|gold|amber'], ['red', 'red|crimson|scarlet'], ['blue', 'blue|azure'], ['cyan', 'teal|cyan'], ['green', 'green|emerald'],
    ['purple', 'purple|violet'], ['silver', 'silver'], ['gray', 'gray|grey'], ['brown', 'brown|hazel'], ['black', 'black|dark']]
    .map(([key, words]) => [key, new RegExp(`\\b(?:${words})\\b[^.;!?\\n]{0,12}?\\beyes?\\b`, 'i')]);

const HAIR_SHAPES = [
    ['tied', either('马尾|束发|发髻|高束|挽发|发冠|玉冠|束冠|盘发|扎起', 'ponytail|bun|topknot|braid(?:ed|s)?')],
    ['cropped', either('寸头|板寸|平头', 'buzz ?cut|crew ?cut|shaved head')],
    ['curly', either('卷发|卷毛|自然卷', 'curly|wavy')],
    ['long', /长发|及腰|披发|披肩|长至|垂腰|\blong\b[^.;!?\n]{0,20}?\bhair\b|\bwaist-length\b/i],
    ['medium', /及肩|中长发|齐肩|\bshoulder-length\b|\bshoulder length\b/i],
    ['short', /短发|碎发|利落的发|\bshort\b[^.;!?\n]{0,20}?\bhair\b/i],
    ['covered', either('兜帽|头巾|面纱|头纱', 'hood(?:ed)?|veil(?:ed)?|headscarf')],
];
const OUTFITS = [
    ['combat', either('铠甲|盔甲|战甲|甲胄|作战服|劲装', 'armou?r|plate mail|combat gear')],
    ['technical', either('实验服|白大褂|防护服|宇航服|机甲驾驶服', 'lab coat|space ?suit|hazmat')],
    ['uniform', either('制服|军装|警服|军服', 'uniform')],
    ['academic', either('校服|学生服|学院服', 'school uniform')],
    ['formal', either('西装|西服|正装|礼服|衬衫|领带', 'suit|tuxedo|necktie|dress shirt')],
    ['fantasy', either('法袍|魔法袍|斗篷|巫师袍', 'mage robes?|wizard robes?|cloak')],
    ['ceremonial', /祭服|祭袍|礼袍/],
    ['historical', either('[长锦道僧儒蟒]袍|衣袍|袍子|长衫|青衫|襦裙|汉服|古装|广袖|宽袖|衣袂|锦衣|玄衣|白衣|黑衣|素衣|长袍', 'kimono|hanfu|robes?')],
    ['work', either('工装|围裙|工作服', 'apron|overalls')],
    ['casual', either('卫衣|T恤|牛仔|休闲|运动服|便服|夹克', 'hoodie|t-shirt|tee|jeans|jacket')],
];
const BUILDS = [
    ['broad', either('宽肩|魁梧|高大健壮|健硕|肌肉结实|壮硕', 'broad-shouldered|broad shoulders|muscular|burly')],
    ['slender', either('修长|清瘦|纤细|瘦削|颀长|单薄', 'slender|lanky|slim')],
    ['compact', either('娇小|矮小|小个子|个子小', 'petite|short and small')],
    ['soft', either('微胖|圆润|丰腴', 'plump|chubby')],
];
const DETAILS = [
    ['glasses', either('眼镜|镜片', 'glasses|spectacles')],
    ['animal_ears', either('兽耳|猫耳|狐耳|狼耳|犬耳|兔耳', 'cat ears|fox ears|wolf ears|animal ears|bunny ears')],
    ['pointed_ears', either('尖耳|精灵耳', 'pointed ears|elven ears|elf ears')],
    ['horns', either('犄角|龙角|羊角|鹿角|双角|头上长着?角', 'horns?')],
    ['visor', either('护目镜|面罩', 'visor|goggles')],
    ['headphones', either('耳机', 'headphones')],
    ['scarf', either('围巾', 'scarf')],
    ['headwear', either('发冠|玉冠|帽子|戴着?帽|头盔|王冠|发簪', 'hat|helmet|crown|circlet|tiara')],
];
// 按身份推断（用户 2026-09-25 授权）。r84.79: 只在“写角色本人身份”的分句里找：
// 关键词前有“是 / 身为 / 作为 / 担任…”，或整个分句就是这个身份词（如“剑修”）。
const IDENTITY_OUTFITS = [
    ['historical', /修仙|仙门|宗门|门派|剑修|江湖|侠客|大侠|王爷|皇子|皇帝|将军|公子|师尊|掌门|古代|朝廷|书生|世子|少主/],
    ['combat', either('骑士|战士|佣兵|士兵|军人|武士', 'knight|soldier|mercenary|warrior')],
    ['fantasy', either('魔法师|法师|巫师|精灵|魔王|龙族', 'mage|wizard|sorcerer|sorceress|witch|elf|elven')],
    ['technical', either('赛博|机甲|星舰|科学家|研究员|医生', 'scientist|researcher|doctor|engineer')],
    ['uniform', either('警察|警官|军官|机长|空乘', 'police officer|policeman|policewoman|detective|pilot')],
    ['academic', either('学生|高中生|初中生', 'student')],
    ['formal', either('总裁|律师|经理|董事|商人|老板|秘书', 'ceo|lawyer|manager|businessman|businesswoman|secretary')],
];
const IDENTITY_MARKER = /(是|为|身为|作为|担任|身份|职业|出身|乃|当上|成为|\bis an?\b|\bwas an?\b|\bworks? as\b|\bserves? as\b|\boccupation\b|\bjob\b|\brole\b)/i;
const WORLD_OUTFIT = { historical: 'historical', fantasy: 'fantasy', scifi: 'technical', contemporary: 'casual', institutional: 'uniform', maritime: 'uniform', nomadic: 'artisan' };
const WORLD_HAIR = { historical: 'long' };

// r84.79: 按分句判断“这句在说谁”。句首是 你 / 您 / {{user}} / 用户名 → 用户；
// “他的妹妹”“his sister” 这类 → 别人；他 / 她 / 角色名 / {{char}} → 角色本人；
// 没写主语的分句沿用同一句里前一个分句的主语，每句开头默认是角色本人。
const RELATIONS = '妹妹|姐姐|哥哥|弟弟|母亲|父亲|妈妈|爸爸|娘亲|爹爹|妻子|丈夫|老婆|老公|女友|男友|女朋友|男朋友|朋友|同伴|伙伴|手下|下属|徒弟|师父|师尊|师兄|师姐|师弟|师妹|侍女|侍从|仆人|管家|宠物|孩子|儿子|女儿|恋人|爱人|未婚妻|未婚夫|对手|敌人|同事|上司|室友|同学';
const EN_RELATIONS = 'sister|brother|mother|father|mom|dad|wife|husband|girlfriend|boyfriend|friends?|partner|servant|maid|butler|pet|child|son|daughter|lover|fiancee?|fiancée|rival|enemy|colleague|boss|roommate|classmate|master|apprentice|twin';
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function subjectMatchers(charName = '', userName = '') {
    const char = core_text.normalizeText(charName, 60), user = core_text.normalizeText(userName, 60);
    const charAlt = ['他', '她', '它', '\\{\\{char\\}\\}', '<char>', char && escapeRe(char)].filter(Boolean).join('|');
    const userAlt = ['你', '您', '\\{\\{user\\}\\}', '<user>', user && user !== char && escapeRe(user)].filter(Boolean).join('|');
    return {
        other: new RegExp(`^(?:(?:${charAlt}|你|您|\\{\\{user\\}\\})的?)?(?:${RELATIONS})|^(?:his|her|their|my|your|\\{\\{char\\}\\}'s)\\s+(?:${EN_RELATIONS})\\b`, 'i'),
        user: new RegExp(`^(?:${userAlt})|^(?:you|your|user)\\b`, 'i'),
        char: new RegExp(`^(?:${charAlt})|^(?:he|she|they|his|her|their)\\b`, 'i'),
    };
}

export function characterClauses(texts, { charName = '', userName = '', perClause = false } = {}) {
    const who = subjectMatchers(charName, userName), out = [];
    for (const raw of texts) {
        for (const sentence of plain(raw).split(SENTENCE_SPLIT)) {
            let subject = 'char';
            const kept = [];
            for (const part of sentence.split(CLAUSE_SPLIT)) {
                const clause = part.trim().replace(/^["'“”‘’「」『』（）()\s*-]+/, '');
                if (!clause) continue;
                if (who.other.test(clause)) subject = 'other';
                else if (who.user.test(clause)) subject = 'user';
                else if (who.char.test(clause)) subject = 'char';
                if (subject === 'char') kept.push(clause);
            }
            if (perClause) out.push(...kept); else if (kept.length) out.push(kept.join('，'));
            if (out.length >= 160) return out;
        }
    }
    return out;
}

const plain = (value, max = 20000) => typeof value === 'string' ? value.slice(0, max) : '';

function firstMatch(text, table) {
    let best = null;
    for (const [value, pattern] of table) {
        const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        for (const match of text.matchAll(re)) {
            if (NEGATION.test(text.slice(Math.max(0, match.index - 10), match.index))) continue;
            if (!best || match.index < best.index) best = { value, index: match.index };
            break;
        }
    }
    return best?.value || '';
}

function colourBefore(text, targets) {
    // 取紧挨在“发 / 衣 / 瞳”前面（最多 4 个字）的颜色词。
    const re = new RegExp(`([^，。；,\\n]{0,4})(?:${targets})`, 'g');
    for (const match of text.matchAll(re)) {
        const window = match[1];
        // 离目标字最近的颜色词胜出；同样近时取表里靠前的（“银白”先于“白”）。
        let found = null;
        for (const [key, pattern] of COLOUR_WORDS) {
            const hit = window.match(pattern);
            if (!hit) continue;
            const end = hit.index + hit[0].length;
            if (NEGATION.test(window.slice(Math.max(0, hit.index - 3), hit.index))) continue;
            if (!found || end > found.end) found = { key, end };
        }
        if (found) return found.key;
    }
    return '';
}

function colourAfter(text, targets) {
    // “眸色漆黑”“发色银白”“衣服是黑色的”：颜色写在后面（最多 4 个字内）。
    const re = new RegExp(`(?:${targets})([^，。；,\\n]{0,4})`, 'g');
    for (const match of text.matchAll(re)) {
        const window = match[1];
        let found = null;
        for (const [key, pattern] of COLOUR_WORDS) {
            const hit = window.match(pattern);
            if (hit && (!found || hit.index < found.at)) found = { key, at: hit.index };
        }
        if (found) return found.key;
    }
    return '';
}

export function appearanceSentences(texts, names = {}) {
    return characterClauses(texts, names).filter(line => LOOK_WORDS.test(line)).slice(0, 80);
}

export function figureFromText(texts, names = {}) {
    const text = appearanceSentences(texts, names).join('。');
    if (!text) return {};
    const hairColour = colourBefore(text, '发|髮|头发|长发|短发|卷发') || colourAfter(text, '发色|头发是|头发');
    const hairTone = HAIR_FROM_COLOUR[hairColour] || firstMatch(text, HAIR_ENGLISH);
    const outfitTone = colourBefore(text, '衣|袍|衫|裙|服|装|斗篷|披风|外套|西装') || colourAfter(text, '衣服|衣着|着装|穿着');
    const eyeTone = colourBefore(text, '瞳|眸|眼睛|眼珠') || colourAfter(text, '瞳色|眸色|瞳孔|眼眸|眼睛|眼珠') || firstMatch(text, EN_EYES);
    const figure = {
        hairTone, hairShape: firstMatch(text, HAIR_SHAPES), outfit: firstMatch(text, OUTFITS),
        build: firstMatch(text, BUILDS), detail: firstMatch(text, DETAILS),
        outfitTone, eyeTone: EYE_TONES.has(eyeTone) ? eyeTone : '',
    };
    return Object.fromEntries(Object.entries(figure).filter(([, value]) => value));
}

function identityOutfit(clauses) {
    let best = null;
    for (const clause of clauses) {
        const marker = clause.search(IDENTITY_MARKER);
        for (const [value, pattern] of IDENTITY_OUTFITS) {
            const hit = clause.match(pattern);
            if (!hit) continue;
            const labelOnly = clause.trim().length <= hit[0].length + 2;
            if ((marker >= 0 && hit.index > marker) || labelOnly) { if (!best) best = value; break; }
        }
        if (best) return best;
    }
    return '';
}

export function figureFromIdentity(texts, worldStyle = '', names = {}) {
    const outfit = identityOutfit(characterClauses(texts.map(value => plain(value, 6000)), { ...names, perClause: true })) || WORLD_OUTFIT[worldStyle] || '';
    const hairShape = outfit === 'historical' ? 'long' : (WORLD_HAIR[worldStyle] || '');
    return Object.fromEntries(Object.entries({ outfit, hairShape }).filter(([, value]) => value));
}

const unset = value => !value || value === 'unspecified' || value === 'none';

export function localRoomFigure(figure = {}, { explicitFields = [], cardTexts = [], worldTexts = [], worldStyle = '', charName = '', userName = '' } = {}) {
    const verified = new Set((Array.isArray(explicitFields) ? explicitFields : []).map(field => String(field).replace(/^figure\./, '')));
    const names = { charName, userName };
    const card = figureFromText(cardTexts, names), world = figureFromText(worldTexts, names);
    const guess = figureFromIdentity([...cardTexts, ...worldTexts], worldStyle, names);
    const out = { ...(figure && typeof figure === 'object' ? figure : {}) };
    for (const key of ['hairTone', 'hairShape', 'outfit', 'build', 'detail', 'outfitTone', 'eyeTone']) {
        if (verified.has(key) && !unset(out[key])) continue;
        const value = card[key] || world[key] || (unset(out[key]) ? guess[key] : '') || '';
        if (value) out[key] = value;
    }
    return out;
}

// ---- 读取来源（同步读角色卡；绑定世界书异步读一次后缓存） ----

const worldCache = new Map();

function cardsNamed(context, name) {
    const wanted = core_text.normalizeText(name, 120);
    const list = Array.isArray(context?.characters) ? context.characters : [];
    const current = list[Number(context?.characterId)];
    const exact = list.filter(card => core_text.normalizeText(card?.data?.name || card?.name, 120) === wanted);
    if (exact.length === 1) return exact;
    if (current && core_text.normalizeText(context?.name2, 120) === wanted) return [current];
    return [];
}

export function roomFigureSources(context, name, onWorldReady = null) {
    const cards = cardsNamed(context, name);
    const userName = core_text.normalizeText(context?.name1, 60);
    if (cards.length !== 1) return { cardTexts: [], worldTexts: [], charName: core_text.normalizeText(name, 60), userName };
    const card = cards[0], data = card.data && typeof card.data === 'object' ? card.data : {};
    const cardTexts = [data.description, card.description, data.personality, card.personality, data.scenario, card.scenario].map(value => plain(value)).filter(Boolean);
    const wanted = core_text.normalizeText(name, 120);
    const pick = entries => entries.filter(entry => entry && entry.disable !== true && entry.disabled !== true && entry.enabled !== false).flatMap(entry => {
        const content = plain(entry.content, 8000);
        const keys = [entry.keys, entry.key, entry.title, entry.comment, entry.name].flat().filter(value => typeof value === 'string');
        if (keys.some(key => key.includes(wanted))) return [content];
        return content.split(SENTENCE_SPLIT).filter(line => line.includes(wanted));
    }).filter(Boolean);
    const embedded = Array.isArray(data.character_book?.entries) ? data.character_book.entries : [];
    const worldTexts = pick(embedded);
    const linked = core_text.normalizeText(data.extensions?.world, 240);
    if (linked) {
        const key = `${linked}\u001f${wanted}`;
        if (worldCache.has(key)) worldTexts.push(...(worldCache.get(key) || []));
        else {
            worldCache.set(key, null);
            world_sources.loadMemoryWorldInfoBook(context, linked).then(entries => {
                worldCache.set(key, pick(Array.isArray(entries) ? entries : []));
                if (typeof onWorldReady === 'function') onWorldReady();
            }).catch(() => worldCache.set(key, []));
        }
    }
    return { cardTexts, worldTexts, charName: core_text.normalizeText(name, 60), userName };
}
