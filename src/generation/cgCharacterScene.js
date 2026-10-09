// Per-picture activity is separate from reusable appearance. Never infer the
// actor from prose here: the existing authoring request binds each row by ID.
import * as text from '../core/text.js';

export function cgCharacterSceneFields(row) {
    const result = {};
    for (const key of ['sceneTag', 'sceneNl']) {
        const value = typeof row?.[key] === 'string' ? text.normalizeText(row[key], Infinity) : '';
        if (value) result[key] = value;
    }
    return result;
}

export function cgCharacterSceneValue(row, format) {
    const fields = cgCharacterSceneFields(row);
    // Switching dialect is not a translation request; keep a manually authored
    // value usable until the user explicitly reconceives it.
    return format === 'nai45-tags' ? fields.sceneTag || fields.sceneNl || '' : fields.sceneNl || fields.sceneTag || '';
}

export function cgCharacterCaption(row, format) {
    return [row.tag || row.nl || '', cgCharacterSceneValue(row, format)].filter(Boolean)
        .join(format === 'nai45-tags' ? ', ' : '\n');
}

export function cgFlatCharacterScenePrompt(scene, metadata) {
    if (!metadata?.characters?.some(row => cgCharacterSceneValue(row, metadata.promptFormat))) return '';
    const tags = metadata.promptFormat === 'nai45-tags';
    const rows = metadata.characters.map(row => {
        const caption = [row.tag || row.nl || '', cgCharacterSceneValue(row, metadata.promptFormat)].filter(Boolean)
            .join(tags ? ', ' : '. ');
        if (!caption) return '';
        // Separate complete subject blocks also on flat transports. Tag mode
        // retains English-only generated data without injecting display names.
        return !tags && row.name ? `${row.name}: ${caption}` : caption;
    }).filter(Boolean);
    return [scene, ...rows].filter(Boolean).join('\n');
}

export function cgCharacterSceneInstructions(format) {
    return `\n【CG_CHARACTER_SCENE_V1 · 本图人物动作】保留原JSON结构，每个 characters 项增加可选 sceneTag、sceneNl，仍用原 role 或 participantId 绑定，不能按姓名猜人或交换同名人物。tag/nl 仍只放稳定外貌，不把动作、服装、位置或 source#/target#/mutual# 存进外貌。即使人物预设已提供外貌，也必须分别整理本图已明确的动作、朝向、位置及当前衣着到这些新字段；没有依据的内容留空。人物实际出场且只有动作依据时允许 tag/nl 留空，仍保留该人物行。\nsceneTag 是该人物本图英文短Tag；sceneNl ${format === 'nai45-tags' ? '留空' : '是该人物本图连贯自然描述，可用中文；sceneTag 仍提供对应英文短Tag兼容写法'}。一人的动作只放其本人行。对画面明确有主动方与接受方、且适用NAI互动tag的动作，可分别写 source#hug / target#hug 等对应tag；明确双方互相参与才分别写 mutual#hug。这些只是语法示例，绝不因此添加拥抱等原画面没有的动作；关系不明不强分主动被动，不机械把同一套动作复制给所有人物。不推断未写的位置或额外动作。sceneTags 保留总人数、共同场景、镜头和光线，逐人动作衣着由对应人物行承载；flatPrompt 将每个人的明确外貌与其本图动作、衣着、位置分别组织在一起，不能裸拼两组外貌。imagePrompt、sceneTags、flatPrompt 和逐人动作必须描绘同一瞬间，不增加文本请求。`;
}
