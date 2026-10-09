// A writing choice belongs to a newly authored storyboard, not the current
// provider. Missing snapshots deliberately keep the legacy drawing path.
import * as formats from '../core/cgPromptFormat.js';
import * as settings from '../core/settings.js';

export function normalize(value) { return formats.normalizeCgPromptFormat(value); }

export function selected(context, value = '') {
    return normalize(value) || normalize(settings.getPluginSettings(context).cgPromptFormat);
}

export function recordFormat(record) { return normalize(record?.settings?.promptFormat); }

export function isTags(record) { return recordFormat(record) === 'nai45-tags'; }

export function metadata(record, value = null) {
    const promptFormat = recordFormat(record);
    return promptFormat ? { ...(value || { selectedRoles: [], characters: [] }), promptFormat } : value;
}

export function directive(value) {
    const format = normalize(value);
    if (!format) return '';
    const fields = 'shot.imagePrompt、group.characterPrompt / compositionPrompt、diff.imagePrompt、backgroundPrompt、bgs[].prompt、stage.backgrounds[].prompt、motif.prompt，以及新写的 cast[].action、wardrobe.era / char / user / characters[].clothing';
    const common = `本节覆盖前文同名图像字段的语言与标签写法要求。本次只改变生图字段的写法，不改变已选画风、分镜方向、构图、出镜名单、表情、动作幅度、差分复用、时间与舞台参数。${fields}都遵守下述格式。已有手填外貌与衣着原文保留，不翻译或删掉；participantId、人物姓名、歌词、标签、说明和 videoZh / videoEn 的职责与语言保持原样。图像字段通过 cast 的 participantId 和已有明确方位绑定人物，不从数组顺序臆造左右站位。结构示例仅演示结构，实际图像字段以此格式为准。`;
    return format === 'nai45-tags'
        ? `【本次图像提示格式：NAI 4.5 · 英文 Tag】\n${common}\n新写的生图字段用英文逗号分隔的短标签，动作、表情、景别、位置、衣着、背景与光线写成具体可见标签；不写完整叙述句、中文标题、姓名前缀或 english: 前缀。稳定外貌单独按 participantId 写入 appearances[].tag，不混入场景；nl 可空。示例：medium shot, subject on the left, open palm, quiet smile, soft window light。`
        : `【本次图像提示格式：NAI 5 · 自然语言】\n${common}\n新写的生图字段用连贯的自然语言描述单张静态画面，清楚说明每个人的动作、表情、已有方位、衣着、场景、光线和构图，不用逗号标签串代替主体描述；中英文均可。稳定外貌单独按 participantId 写入 appearances[].nl（tag 可保留有依据的英文标签），不混入场景。`;
}

// Keep literal text intact. Only automatic separators differ for new tag work.
export function join(record, parts) {
    return parts.filter(Boolean).join(isTags(record) ? ', ' : '\n');
}

export function legacyLooks(record, value, fallback) {
    if (!isTags(record)) return fallback();
    return [value?.char ? `${value.user ? 'main character' : 'character'}, ${value.char}` : '', value?.user ? `${value.char ? 'second character' : 'character'}, ${value.user}` : ''].filter(Boolean).join(', ');
}
