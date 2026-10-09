// Adapt only our own recipes. Literal user and provider appearances are never
// rewritten, translated, shortened or shared with the other subject here.
const text = value => typeof value === 'string' ? value.trim() : '';

export function coupleEyesCovered(value) {
    const positive = text(value).replace(/_/g, ' ').split(/[,，;；。\n]/u).filter(part =>
        !/(?:\b(?:no|not|without|remove|removed)\b[^,，;；。\n]{0,30}(?:blindfold|eye covering)|\bblindfold(?:ed)?\s+(?:(?:is|was|has been)\s+)?(?:removed|off|absent)\b|\bblindfold\b[^,，;；。\n]{0,30}\b(?:around|on)\s+(?:(?:his|her|the|their)\s+)?(?:neck|forehead|wrist)\b|(?:不要|不戴|没有|去掉|摘下|摘掉|取下|未戴|无)(?:[^,，;；。\n]{0,12})(?:眼罩|蒙眼|遮眼|轻纱|白纱)|(?:眼罩|蒙眼布|轻纱|白纱)(?:已|被|已经)?(?:摘下|摘掉|取下|去掉)|(?:眼罩|蒙眼布|轻纱|白纱)[^,，;；。\n]{0,10}(?:挂|放|系|戴|推)[^,，;；。\n]{0,8}(?:脖|颈|额头|手腕))/iu.test(part)).join(', ');
    return /\bblindfold(?:ed)?\b|\b(?:both\s+)?eyes\s+(?:are\s+)?(?:covered|concealed|hidden|wrapped)\b|\b(?:covering|concealing)\s+(?:both\s+)?eyes\b|(?:蒙|遮)(?:住)?(?:双眼|双目|眼睛|眼部|眼)|(?:双眼|双目|眼睛|眼部)[^,，;；。\n]{0,24}(?:覆|遮|蒙|缠|系)[^,，;；。\n]{0,24}(?:纱|布|带|绸)|(?:纱|布|绸)[^,，;；。\n]{0,24}(?:蒙|覆|遮)[^,，;；。\n]{0,12}(?:双眼|双目|眼睛)/iu.test(positive)
        || /眼罩/u.test(positive) && !/(?:单眼罩|(?:单眼|左眼|右眼)[^,，;；。\n]{0,12}眼罩|眼罩[^,，;；。\n]{0,16}(?:左眼|右眼|单眼))/u.test(positive);
}

export function coupleCoveredEyeGuidance(covered, tagMode = false) {
    if (!covered) return '';
    return tagMode ? 'covered eyes, retained eye covering, expression through mouth and head tilt'
        : 'Keep this subject\'s specified covering across the eyes, with the eyes concealed beneath it. Show the reaction through the mouth, head angle and body gesture; the chosen style changes how the covering is drawn, not whether it is present.';
}

// This function accepts owned style/action text only, never a user direction,
// an appearance, a custom style or a provider preset.
export function coupleVisibleRecipe(value, covered) {
    if (!covered || !value) return value || '';
    return value
        .replace(/half-closed eyes/gi, 'a drowsy head tilt and relaxed mouth')
        .replace(/(?:deliberately )?(?:enlarged )?expressive (?:affectionate )?eyes|(?:clear airy|legible|readable|affectionate) eyes/gi, 'expressive mouth and head angle')
        .replace(/keeping the eyes readable/gi, 'keeping visible features readable')
        .replace(/dot eyes/gi, 'simple mouth marks')
        .replace(/(?:delicate eye lashes|delicate eyelashes)/gi, 'delicate facial lines')
        .replace(/embroidered eyes and mouth(?:s)?/gi, 'embroidered visible facial features')
        .replace(/stitched eyes/gi, 'stitched visible facial features')
        .replace(/pleasantly surprised eyes/gi, 'a pleasantly surprised posture')
        .replace(/return(?:ing)? (?:the )?gaze|mutual gaze|attentive gaze|inward gaze/gi, 'head turned toward partner')
        .replace(/follow the drifting bubble with the eyes/gi, 'turn toward the drifting bubble')
        .replace(/(?:confident playful|bashful|playful) wink/gi, 'playful head tilt')
        .replace(/\bwink(?:s|ing)?\b/gi, 'playful head tilt')
        .replace(/eyes following/gi, 'head oriented toward');
}

function mentionsName(part, name) {
    if (!name) return false;
    const offset = part.indexOf(name);
    if (offset < 0) return false;
    const rest = part.slice(offset + name.length);
    return /^(?:\s|[:：的是穿着戴披系]|wears?\b|wearing\b)/iu.test(rest);
}

function namesSide(part, side) {
    const chinese = side === 'left' ? '(?:左边|左侧|左方|左)' : '(?:右边|右侧|右方|右)';
    // Directional words on a sleeve, pocket or lapel describe a garment, not
    // the wearer. Require a subject label rather than any left/right token.
    return new RegExp(`(?:^|而|以及|和)${chinese}(?:的人物|人物|角色|的人)?\\s*(?=[:：是穿戴披系着身红白黑蓝青紫粉金银灰绿黄棕])`, 'u').test(part)
        || new RegExp(`(?:^|\\band\\s+)(?:(?:for|on)\\s+)?(?:the\\s+)?(?:${side}(?:\\s+(?:subject|character|person|figure))?|(?:subject|character|person|figure)\\s+on\\s+the\\s+${side})\\s*(?::|wear(?:s|ing)?\\b|is\\b|in\\b|has\\b|with\\b)`, 'iu').test(part)
        || new RegExp(`^${side}\\s+(?!sleeve\\b|chest\\b|pocket\\b|lapel\\b|cuff\\b|shoulder\\b|arm\\b|hem\\b|leg\\b|shoe\\b|hand\\b|wrist\\b|eye\\b|side\\b|collar\\b|ear\\b|cheek\\b|face\\b)\\S`, 'iu').test(part);
}

export function coupleClothingParts(value, people = []) {
    const source = text(value), shared = [], left = [], right = [];
    if (!source) return { source: '', people: ['', ''] };
    let owner = '';
    for (const raw of source.split(/([,，;；。\n])/u)) {
        if (/^[,，;；。\n]$/u.test(raw)) {
            if (/[;；。\n]/u.test(raw)) owner = '';
            continue;
        }
        const part = raw.trim(); if (!part) continue;
        const hasLeft = namesSide(part, 'left')
            || mentionsName(part, text(people[0]?.name));
        const hasRight = namesSide(part, 'right')
            || mentionsName(part, text(people[1]?.name));
        // Mixed-person prose belongs to the scene. Do not duplicate one
        // subject's garment in the other's caption by guessing its grammar.
        if (hasLeft && hasRight) { owner = 'mixed'; continue; }
        if (hasLeft) owner = 'left';
        else if (hasRight) owner = 'right';
        else if (people.some(person => text(person?.name) && part.includes(text(person.name)))) owner = 'mixed';
        else if (/^(?:双方|两人|都|共同|同款|both\b|shared\b|matching\b)/iu.test(part)) owner = '';
        (owner === 'left' ? left : owner === 'right' ? right : owner === 'mixed' ? [] : shared).push(part);
    }
    return { source, people: [[...shared, ...left].join(', '), [...shared, ...right].join(', ')] };
}
