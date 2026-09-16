// View-only categorization. Existing records and generation prompts are not rewritten.
// This classifies explicit metadata/wording, not image pixels. Ordinary affection is not NSFW.
const MARKERS = new Set(['私密','成人','成人内容','nsfw','explicit','r18','r-18','18+']);
const EXPLICIT = /(?:性爱|性交|性行为|做爱|交媾|交欢|口交|肛交|自慰|情欲|床笫|春宵|云雨之欢|共赴云雨|赤裸交缠|裸身交缠|肉体交缠|性爱之后|\b(?:nsfw|r-?18|sexual intercourse|oral sex|explicit sexual|having sex|making love)\b)/iu;
function strings(value) { return typeof value === 'string' ? value.slice(0,10000) : ''; }
export function albumIsPrivate(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.adult === true || entry.nsfw === true || entry.isAdult === true || entry.private === true) return true;
    if ([entry.category,entry.contentRating,...(Array.isArray(entry.tags)?entry.tags.slice(0,20):[])].some(item => MARKERS.has(strings(item).trim().toLowerCase()))) return true;
    const fields = [entry.title,entry.desc,entry.cgDesc,entry.imagePrompt,...(Array.isArray(entry.comments)?entry.comments.slice(0,24):[])];
    return fields.some(value => strings(value).split(/[。！？!?；;\n]+/u).some(line => {
        if (/^(?:[^，,]{0,15})?(?:禁止|不要|不包含|无|没有|no |without ).{0,12}(?:成人|性爱|性交|nsfw|explicit)/iu.test(line)) return false;
        return EXPLICIT.test(line);
    }));
}
export function albumDisplayCategory(entry) { return albumIsPrivate(entry) ? '私密' : ['日常','约会','结局'].includes(entry?.category) ? entry.category : '日常'; }
export const ALBUM_DISPLAY_CATEGORIES = Object.freeze(['全部','日常','约会','私密','结局']);
