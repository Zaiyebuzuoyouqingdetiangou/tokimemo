// Q-version appearance filter for couple avatars. A long realistic persona
// (age, height, build, bone structure, nose and lip anatomy, skin pores) pulls
// NAI back to adult proportions even when a chibi style is selected. This keeps
// what identifies the person in a tiny figure — hair, eyes, marks, coverings,
// accessories, clothing colours, gender — and drops only body-structure detail.
// It is local and deterministic: no model request, and the user's saved
// appearance is never edited; the caller applies the result to one drawing.

// Groups whose figures are re-proportioned (Q-version and animal avatars).
export const CHIBI_FILTER_GROUPS = Object.freeze(['chibi', 'animal']);
export const CHIBI_FILTER_MODES = Object.freeze({ ask: '每次询问', auto: '自动过滤', off: '不过滤' });

export function chibiFilterMode(value) {
    return Object.hasOwn(CHIBI_FILTER_MODES, value) ? value : 'ask';
}

// Facts a Q-version figure cannot or should not show.
const BODY = new RegExp([
    // age, height, weight
    String.raw`\b\d{1,3}\s*(?:-|\s)?years?(?:-|\s)?old\b`, String.raw`\b(?:aged?|age of)\s*\d`, String.raw`\b\d{2,3}(?:\.\d)?\s*(?:cm|centimet(?:er|re)s?|kg|kilograms?|lbs?|pounds?)\b`,
    String.raw`\b(?:height|tall|weight|heavy|short stature)\b`, String.raw`\bmature\b`, String.raw`\badult\b`,
    // build and body
    String.raw`\b(?:build|physique|figure|frame|proportion(?:ed|s)?|bone structure|bones?|skeleton|muscles?|muscular|toned|abs|abdomen|torso|shoulders?|waist|hips?|thighs?|legs?|limbs?|neck|collarbones?|clavicles?|chest|breasts?|bust|curv(?:y|es)|slender|slim|lean|lanky|stocky|petite|willowy|broad)\b`,
    // facial anatomy and skin micro-detail
    String.raw`\b(?:jaw(?:line)?|chin|cheekbones?|forehead|hairline|temples?|nose|nostrils?|nasal|bridge|lips?|cupid'?s bow|philtrum|mouth corners?|facial (?:features|structure|bones?)|bone|oval face|face shape|v-?line|pores?|poreless|veins?|translucent skin|skin texture)\b`,
    // Chinese
    String.raw`\d{1,3}\s*岁`, '岁', '身高', '体重', '厘米', '公分', '公斤', '斤', String.raw`\d{2,3}\s*cm`, '身材', '体型', '身形', '骨架', '骨相', '骨骼', '骨感', '骨节', '肩', '腰', '臀', '腿', '锁骨', '胸', '肌肉', '腹肌', '修长', '高挑', '纤细', '挺拔', '颀长', '魁梧', '健壮',
    '下颌', '下巴', '颌', '颧骨', '额头', '发际线', '鼻', '唇', '人中', '五官', '脸型', '轮廓', '毛孔', '血管', '成年', '成熟',
].join('|'), 'iu');

// What still identifies someone in a tiny figure.
const IDENTITY = new RegExp([
    String.raw`\bhair(?!line)\w*`, String.raw`\b(?:fringe|bangs|ponytail|pigtails?|twintails?|braids?|bun|curls?|ahoge|strands?|locks?)\b`,
    String.raw`\b(?:eyes?|iris(?:es)?|pupils?|eyebrows?|lashes|gaze|heterochromia)\b`,
    String.raw`\b(?:mole|freckles?|scar|tattoo|birthmark|marking|dimples?|fangs?|blush)\b`,
    String.raw`\b(?:blindfold(?:ed)?|eye ?patch|bandage|gauze|veil|mask|glasses|spectacles|monocle)\b`,
    String.raw`\b(?:ears?|horns?|tails?|wings?|halo|antlers?)\b`,
    String.raw`\b(?:wears?|wearing|dressed|clothing|clothes|outfit|robe|coat|jacket|shirt|dress|skirt|uniform|hood(?:ie)?|scarf|cape|kimono|hanfu|color scheme)\b`,
    String.raw`\b(?:accessor(?:y|ies)|ornaments?|ribbons?|(?<!cupid'?s )bows?|cords?|bracelets?|bangles?|necklaces?|pendant|amulet|lock amulet|earrings?|piercings?|rings?|hat|cap|hairpin|crown|tiara|choker|gloves?|bells?|jewel\w*|gold|silver)\b`,
    String.raw`\b(?:1boy|1girl|boy|girl|male|female|man|woman|androgynous)\b`, String.raw`\bskin\b`,
    '发(?!际线)', '刘海', '马尾', '辫', '眼', '瞳', '眉', '睫', '痣', '雀斑', '疤', '纹身', '胎记', '酒窝', '虎牙', '眼罩', '蒙眼', '纱', '眼镜', '耳', '角', '尾', '翅', '光环',
    '衣', '服', '穿', '戴', '裙', '袍', '围巾', '饰', '链', '镯', '绳', '带', '帽', '簪', '铃', '戒', '男', '女', '肤',
].join('|'), 'iu');
const GENDER = /\b(1boy|1girl|male|female|boy|girl|man|woman)\b|(男|女)(?:性|生|孩)?/iu;
// Skin keeps its tone only; texture, veins and translucency are dropped.
const SKIN_TONE = /\b(?:fair|pale|porcelain|ivory|light|tan(?:ned)?|dark|brown|olive|white|cold white|snow(?:-| )white|rosy)\b(?:[\s,-]+(?:cold|white|fair|pale))*(?=[^.]*\bskin\b)|(?:白皙|冷白|苍白|小麦色|古铜色|黝黑)(?=.*(?:皮|肤))/iu;

function splitSentences(value) {
    return value.split(/(?<=[.!?。！？；;])\s*|\n+/u).map(part => part.trim()).filter(Boolean);
}
function splitParts(sentence) {
    // Comma lists only. "black and red" stays together; a leading "and" is trimmed.
    return sentence.split(/\s*[,，、]\s*/u).map(part => part.replace(/^(?:and|as well as|with)\s+/iu, '').trim()).filter(Boolean);
}
const endMark = sentence => (/[.!?。！？；;]$/u.exec(sentence) || [''])[0];
const strip = value => value.replace(/[\s.!?。！？；;]+$/u, '').trim();

function skinTone(part) {
    const tone = SKIN_TONE.exec(part)?.[0];
    if (!tone) return '';
    return /[一-鿿]/u.test(tone) ? `${tone}皮肤` : `${tone.replace(/\s*,\s*/g, ' ').toLowerCase()} skin`;
}

// Returns { text, removed: string[] } where text is the filtered appearance.
export function chibiFilterAppearance(value) {
    const source = typeof value === 'string' ? value.trim() : '';
    if (!source) return { text: '', removed: [] };
    const kept = [], removed = [];
    for (const sentence of splitSentences(source)) {
        if (!BODY.test(sentence)) { kept.push(sentence); continue; }
        const parts = splitParts(strip(sentence)), out = [];
        // A skin-only sentence keeps just its tone ("fair skin"), never pores or veins.
        if (/\bskin\b|皮肤|肤色/u.test(sentence) && !/\bhair(?!line)|\beyes?\b|发(?!际线)|眼/iu.test(sentence)) {
            const tone = skinTone(sentence);
            if (tone) kept.push(tone + (endMark(sentence) || ''));
            removed.push(...parts); continue;
        }
        for (const part of parts) {
            const body = BODY.test(part), identity = IDENTITY.test(part);
            if (!body) { if (identity) out.push(part); else removed.push(part); continue; }
            if (/\bskin\b|皮|肤/u.test(part) && !/\bhair|发|眼|eyes?\b/iu.test(part)) {
                const tone = skinTone(part); if (tone) out.push(tone); removed.push(part); continue;
            }
            // A body clause that still names an identity feature other than
            // gender keeps that feature; a gender word alone is extracted.
            const nonGender = new RegExp(IDENTITY.source, 'iu').test(part.replace(new RegExp(GENDER.source, 'giu'), ' '));
            if (identity && nonGender) { out.push(part); continue; }
            const gender = GENDER.exec(part);
            if (gender) out.push(gender[0]);
            removed.push(part);
        }
        if (out.length) kept.push(out.join(/[一-鿿]/u.test(sentence) ? '，' : ', ') + (endMark(sentence) || ''));
    }
    const text = kept.join(/[一-鿿]/u.test(source) && !/[a-z]{4}/iu.test(source) ? '' : ' ')
        .replace(/\s{2,}/g, ' ').replace(/^[,，、\s]+/u, '').trim();
    return { text, removed };
}

// Both people at once; `changed` is false when nothing would be removed.
export function chibiFilterPeople(people) {
    const rows = (Array.isArray(people) ? people : []).map(person => ({ ...chibiFilterAppearance(person?.appearance), original: typeof person?.appearance === 'string' ? person.appearance : '' }));
    return { rows, changed: rows.some(row => row.removed.length > 0) };
}
