// The user chooses a prompt dialect, not a provider/model or write target.
import * as text from './text.js';
export const CG_PROMPT_FORMATS = Object.freeze(['nai45-tags', 'nai5-natural']);
export function normalizeCgPromptFormat(value, fallback = '') {
    return CG_PROMPT_FORMATS.includes(value) ? value : fallback;
}
export function cgPromptFormatLabel(value) {
    return value === 'nai45-tags' ? 'NAI 4.5 · 英文 Tag' : 'NAI 5 · 自然语言';
}
export function isEnglishTagPrompt(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1800 || /[^\x20-\x7e\r\n]/u.test(value)) return false;
    // This checks the transport format, not whether a tag exists in Danbooru.
    // Do not silently strip Chinese or turn an English paragraph into comma tags.
    const tags = value.split(/[,\n]+/u).map(x => x.trim()).filter(Boolean);
    return tags.length > 0 && tags.every(tag => tag.length <= 150 && tag.split(/\s+/u).length <= 12
        && !/[!?]|(?:^|\s)(?:The|There|Please|Depict|Draw|Preserve)\s/u.test(tag)
        && !/\.(?:\s|$)/u.test(tag) && !/[<>]|https?:\/\/|\{\{/iu.test(tag));
}
export function assertEnglishTagPrompt(value) {
    if (!isEnglishTagPrompt(value)) throw text.safeUserError('NAI 4.5 需要英文标签式提示；请重新构思或手动转换后再绘图。原图与草稿保留。', 'RMT_CG_TAG_FORMAT');
    return value.trim();
}
export function cgFormatFieldDirective(format) {
    if (!normalizeCgPromptFormat(format)) return '';
    const rule = format === 'nai45-tags'
        ? 'imagePrompt 必须为英文 Danbooru 风格的短 Tag，以英文逗号分隔，不含中文、人名标签、解释句或 Markdown。人数、每人的外貌/服装与动作、镜头、场景和光线来自原有可见画面；不猜人数或外貌，不把两人的动作、特征混成同一个人。'
        : 'imagePrompt 使用连贯自然语言（优先英文），清楚绑定每个人的位置、外貌、动作与同一场景光线，不是只有人物肖像或抽象气氛。';
    return '\n\n【CG_PROMPT_FORMAT_V1 · ' + format + '】\n只调整 JSON 中 imagePrompt 这一生图字段的写法，不改标题、日期、剧情正文、台词、分镜动作、历史证据或输出结构。\n'
        + rule + '\n保留原场景、人数、镜头比例和日常一格分镜数量。图片不含文字、对白框、字幕、Logo或水印。其他字段继续遵守原任务要求。';
}
export function cgPreparationDirective(format) {
    if (!normalizeCgPromptFormat(format)) return '';
    return format === 'nai45-tags'
        ? '\n【NAI 4.5 提示词格式】本段仅覆盖生图文本写法：imagePrompt、sceneTags、flatPrompt 和 characters.tag 均用纯英文、逗号分隔的短 Tag，不能包含中文姓名、自然语言长句、解释或 Markdown。characters.nl 留空。flatPrompt 是可独立使用的完整 Tag 串，包含已知人数、场景、动作、视角与明确外貌，稳定特征与对应人物的位置/动作一致；不要把一男一女机械合成一个角色。imagePrompt 和 sceneTags 保留场景及动作，外貌分别放入 characters。日常一格必须覆盖原分镜动作而不是只画一张肖像。'
        : '\n【NAI 5 提示词格式】imagePrompt 与 flatPrompt 用连贯自然语言（优先英文），保持清楚的人物/动作/位置绑定与场景。sceneTags 和 characters.tag 仍为英文短 Tag，供兼容后端使用。不要只写外貌或抽象气氛，不添加原回忆没有的事件。';
}
export function cgFieldSegment(mode, taskKey) {
    if (typeof taskKey !== 'string') return false;
    return mode === 'album' && /:(?:index|album)$/u.test(taskKey)
        || mode === 'adv' && /:(?:index|event)$/u.test(taskKey)
        || mode === 'heart' && /:(?:strip|strips)$/u.test(taskKey);
}
export function cgOperationHasImageFields(mode, op) {
    return ['album', 'adv'].includes(mode) && op?.kind === 'mode'
        || mode === 'heart' && op?.kind === 'heart-section' && op.part === 'strips'
        || op?.kind === 'content-item' && ['album-entry', 'adv-event', 'heart-strip'].includes(op.target?.type);
}
export function formatDailyComicPrompt(item, scene, format) {
    if (!normalizeCgPromptFormat(format)) return scene;
    const count = Math.max(1, Math.min(4, Number(item?.panelCount) || item?.panels?.length || 1));
    const prefix = format === 'nai45-tags'
        ? `chibi, super deformed, ${count === 1 ? 'single panel' : count + 'koma, comic, vertical composition'}, consistent characters, distinct poses, no text, no speech bubble, no watermark`
        : `Chibi visual story with oversized heads and tiny bodies, ${count} ${count === 1 ? 'panel (single-panel comic)' : 'vertically arranged panels'}. Keep the same characters and clothing, with distinct actions and framing in each panel. No text, speech bubbles, subtitles, logos or watermarks.`;
    let base = String(scene || '').trim();
    if (base.startsWith(prefix)) return base;
    if (base.startsWith('DAILY_COMIC_Q_V1') && base.includes('[SCENE] ')) base = base.slice(base.indexOf('[SCENE] ') + 8);
    if (format === 'nai45-tags') assertEnglishTagPrompt(base);
    const result = prefix + (format === 'nai45-tags' ? ', ' : '\n') + base;
    if (result.length > 1800) throw text.safeUserError('分镜要求与提示词合计超过 1800 字符，请缩短后再绘图；没有发送请求。', 'RMT_CG_PROMPT_INVALID');
    return result;
}
