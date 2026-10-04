// Each asset is one still. A complete per-diff description supersedes the
// group's reference pose; old boards remain readable without a new model call.
const text = value => typeof value === 'string' ? value.trim() : '';
export function cleanStillText(value) {
    return text(value).replace(/\benglish\s*:\s*/giu, '').trim();
}
const expression = /\b(?:smil\w*|smirk\w*|grin\w*|frown\w*|furrow\w*|surpris\w*|startl\w*|gaze|expression|(?:eyes?|eyebrows?|brows?)\s+(?:(?:slightly|wide|tightly|gently)\s+)?(?:open\w*|clos\w*|widen\w*|narrow\w*|raised|lowered))\b|表情|微笑|皱眉|驚|惊|呆愣|睁眼|闭眼/iu;
const camera = /\b(?:close[ -]?up|shot|framing|angle|composition|view|crop)\b|特写|机位|构图|景别/iu;

export function stillScene(group, diff, singlePerson = false) {
    const complete = cleanStillText(diff?.imagePrompt);
    if (complete) return complete;
    const moment = cleanStillText(diff?.change);
    let shared = cleanStillText(group?.characterPrompt);
    if (!moment) return shared;
    // Only replace recognisable facial-state clauses for a single actor. Never
    // guess which of several people an old unbound change belongs to, or drop
    // a clause containing framing. New boards use complete imagePrompt instead.
    if (singlePerson && expression.test(moment)) shared = shared.split(/[,，;；\n]+/u)
        .map(part => part.trim()).filter(part => part && (!expression.test(part) || camera.test(part))).join(', ');
    return [...new Set([shared, moment].filter(Boolean))].join('\n');
}

export function stillCast(group, diff) {
    if (!Array.isArray(group?.cast)) return group;
    const complete = !!text(diff?.imagePrompt);
    const moment = cleanStillText(diff?.change);
    return { ...group, cast: group.cast.map(person => ({ ...person,
        // The full per-diff scene already binds every actor's current action.
        // In legacy solo expression shots the old action often describes the
        // whole transition; it must not compete with the selected still.
        action: complete || group.cast.length === 1 && expression.test(moment) ? '' : person.action,
    })) };
}

export function joinStillPrompt(parts) {
    const seen = new Set();
    return parts.map(cleanStillText).filter(part => {
        if (!part) return false;
        const key = part.toLocaleLowerCase().replace(/\s+/gu, ' ');
        if (seen.has(key)) return false;
        seen.add(key); return true;
    }).join('\n');
}
