import * as core_participants from '../core/participants.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
// 房间人物外形档案（视觉枚举、证据核对、外形规范化）与“共同往事”措辞检查
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

const ROOM_VISUAL_PROFILE_VERSION = 1;

export const ROOM_VISUAL_VALUES = Object.freeze({
    worldStyle: Object.freeze(['neutral', 'contemporary', 'historical', 'fantasy', 'scifi', 'nomadic', 'maritime', 'institutional']),
    palette: Object.freeze(['mist', 'warm', 'earth', 'forest', 'ocean', 'night', 'mono', 'jewel', 'violet']),
    material: Object.freeze(['wood', 'stone', 'fabric', 'metal', 'glass', 'mixed']),
    density: Object.freeze(['sparse', 'balanced', 'layered']),
    build: Object.freeze(['unspecified', 'slender', 'lean', 'average', 'broad', 'compact', 'soft']),
    hairShape: Object.freeze(['unspecified', 'cropped', 'short', 'medium', 'long', 'tied', 'curly', 'covered', 'nonhuman']),
    hairTone: Object.freeze(['unspecified', 'dark', 'brown', 'light', 'red', 'silver', 'fantasy_cool', 'fantasy_warm']),
    outfit: Object.freeze(['unspecified', 'casual', 'formal', 'uniform', 'academic', 'artisan', 'combat', 'ceremonial', 'technical', 'historical', 'fantasy']),
    detail: Object.freeze(['none', 'glasses', 'headphones', 'scarf', 'headwear', 'pointed_ears', 'animal_ears', 'horns', 'visor']),
    posture: Object.freeze(['reserved', 'relaxed', 'upright', 'active', 'studious', 'tired']),
});

const ROOM_VISUAL_ALLOWLISTS = Object.freeze(Object.fromEntries(
    Object.entries(ROOM_VISUAL_VALUES).map(([key, values]) => [key, new Set(values)]),
));

const ROOM_VISUAL_EXPLICIT_FIELDS = new Set([
    'worldStyle', 'palette', 'material', 'density',
    'figure.build', 'figure.hairShape', 'figure.hairTone', 'figure.outfit', 'figure.detail', 'figure.posture',
]);

const ROOM_VISUAL_LEGACY_ALIASES = Object.freeze({
    worldStyle: Object.freeze({ modern: 'contemporary' }),
    hairTone: Object.freeze({ cool: 'fantasy_cool', warm: 'fantasy_warm' }),
    detail: Object.freeze({ 'pointed-ears': 'pointed_ears', 'animal-ears': 'animal_ears' }),
});

export function roomNarrativeClaimsSharedHistory(value, userNameOrBank = '', userAliases = []) {
    if (userNameOrBank && typeof userNameOrBank === 'object') {
        const story = core_participants.resolveStoryIdentities(userNameOrBank);
        return core_narrativeAuthority.narrativeClaimsSharedHistory(value, {
            userName: story.userDisplay, userAliases: story.userAliases,
        });
    }
    return core_narrativeAuthority.narrativeClaimsSharedHistory(value, { userName: userNameOrBank, userAliases });
}

export function roomTextContainsAnchor(value, anchor) {
    const fold = input => core_text.normalizeText(input, 6000).replace(/\s+/gu, '').toLowerCase();
    const needle = fold(anchor);
    return needle.length >= 2 && fold(value).includes(needle);
}

const ROOM_VISUAL_PRESETS = Object.freeze([
    Object.freeze({ worldStyle: 'neutral', palette: 'mist', material: 'mixed', density: 'balanced', build: 'unspecified', hairShape: 'unspecified', hairTone: 'unspecified', outfit: 'unspecified', detail: 'none', posture: 'reserved' }),
    Object.freeze({ worldStyle: 'contemporary', palette: 'mist', material: 'mixed', density: 'balanced', build: 'average', hairShape: 'short', hairTone: 'dark', outfit: 'casual', detail: 'none', posture: 'relaxed' }),
    Object.freeze({ worldStyle: 'institutional', palette: 'ocean', material: 'glass', density: 'balanced', build: 'lean', hairShape: 'cropped', hairTone: 'brown', outfit: 'uniform', detail: 'glasses', posture: 'upright' }),
    Object.freeze({ worldStyle: 'historical', palette: 'warm', material: 'wood', density: 'layered', build: 'slender', hairShape: 'tied', hairTone: 'dark', outfit: 'historical', detail: 'none', posture: 'reserved' }),
    Object.freeze({ worldStyle: 'fantasy', palette: 'jewel', material: 'stone', density: 'layered', build: 'soft', hairShape: 'long', hairTone: 'silver', outfit: 'fantasy', detail: 'pointed_ears', posture: 'upright' }),
    Object.freeze({ worldStyle: 'scifi', palette: 'night', material: 'metal', density: 'sparse', build: 'lean', hairShape: 'cropped', hairTone: 'fantasy_cool', outfit: 'technical', detail: 'visor', posture: 'active' }),
    Object.freeze({ worldStyle: 'nomadic', palette: 'earth', material: 'fabric', density: 'layered', build: 'broad', hairShape: 'medium', hairTone: 'red', outfit: 'artisan', detail: 'scarf', posture: 'relaxed' }),
    Object.freeze({ worldStyle: 'maritime', palette: 'ocean', material: 'wood', density: 'balanced', build: 'compact', hairShape: 'short', hairTone: 'brown', outfit: 'uniform', detail: 'none', posture: 'upright' }),
    Object.freeze({ worldStyle: 'contemporary', palette: 'violet', material: 'fabric', density: 'layered', build: 'soft', hairShape: 'curly', hairTone: 'fantasy_warm', outfit: 'casual', detail: 'headphones', posture: 'active' }),
    Object.freeze({ worldStyle: 'institutional', palette: 'mist', material: 'metal', density: 'sparse', build: 'slender', hairShape: 'medium', hairTone: 'dark', outfit: 'academic', detail: 'glasses', posture: 'studious' }),
    Object.freeze({ worldStyle: 'fantasy', palette: 'forest', material: 'wood', density: 'layered', build: 'lean', hairShape: 'long', hairTone: 'fantasy_cool', outfit: 'fantasy', detail: 'animal_ears', posture: 'active' }),
    Object.freeze({ worldStyle: 'historical', palette: 'earth', material: 'stone', density: 'balanced', build: 'broad', hairShape: 'medium', hairTone: 'dark', outfit: 'ceremonial', detail: 'scarf', posture: 'reserved' }),
    Object.freeze({ worldStyle: 'scifi', palette: 'jewel', material: 'glass', density: 'balanced', build: 'compact', hairShape: 'nonhuman', hairTone: 'silver', outfit: 'combat', detail: 'horns', posture: 'upright' }),
]);

function roomVisualPreset(identitySeed) {
    const seed = core_text.normalizeText(identitySeed, 12000).toLowerCase();
    let pool = [1, 2, 8, 9];
    if (/(?:赛博|科幻|星舰|飞船|宇宙|未来|机甲|机械|机器人|数据舱|驾驶舱|cyber|sci-?fi|spaceship|android)/i.test(seed)) pool = [5, 12];
    else if (/(?:魔法|法师|精灵|龙族|神殿|异世界|妖|仙|灵力|fantasy|magic|elf|dragon)/i.test(seed)) pool = [4, 10];
    else if (/(?:古代|王朝|宫殿|和室|茶室|武士|骑士|中世纪|historical|medieval|ancient)/i.test(seed)) pool = [3, 11];
    else if (/(?:船舱|舰桥|港口|航海|海员|水手|maritime|ship|cabin|sailor)/i.test(seed)) pool = [7];
    else if (/(?:营帐|帐篷|游牧|荒野|行军|露营|nomad|tent|camp)/i.test(seed)) pool = [6];
    else if (/(?:宿舍|学校|学院|医院|军营|办公室|实验室|dorm|school|academy|hospital|office|laboratory)/i.test(seed)) pool = [2, 9];
    return ROOM_VISUAL_PRESETS[pool[core_text.hashString(seed || 'heartbeat-room') % pool.length]];
}

function roomVisualEvidenceSupports(path, value, excerpt) {
    const text = core_text.normalizeText(excerpt, 800).toLowerCase();
    const patterns = {
        'figure.build:slender': /(?:纤长|纤细|修长|清瘦|slender)/iu,
        'figure.build:lean': /(?:精瘦|精实|劲瘦|lean)/iu,
        'figure.build:average': /(?:中等身材|匀称|average build)/iu,
        'figure.build:broad': /(?:宽肩|魁梧|高大健壮|broad|stocky)/iu,
        'figure.build:compact': /(?:娇小|小个子|矮小|compact|petite)/iu,
        'figure.build:soft': /(?:圆润|柔软的身形|微胖|soft build|plump)/iu,
        'figure.hairTone:dark': /(?:黑|乌|墨)[^，。；\n]{0,8}(?:发|髮)|dark hair|black hair/iu,
        'figure.hairTone:brown': /(?:棕|栗|褐)[^，。；\n]{0,8}(?:发|髮)|brown hair|brunette/iu,
        'figure.hairTone:light': /(?:金|浅色|亚麻)[^，。；\n]{0,8}(?:发|髮)|blond|light hair/iu,
        'figure.hairTone:red': /(?:红|赤|赭)[^，。；\n]{0,8}(?:发|髮)|red hair|ginger hair/iu,
        'figure.hairTone:silver': /(?:银白|银|白)(?:色|的|及腰|长|短|头|卷|直|柔顺|一头){0,5}(?:发|髮)|silver hair|white hair/iu,
        'figure.hairTone:fantasy_cool': /(?:蓝|绿|青|紫)[^，。；\n]{0,8}(?:发|髮)|blue hair|green hair|purple hair/iu,
        'figure.hairTone:fantasy_warm': /(?:粉|橙)[^，。；\n]{0,8}(?:发|髮)|pink hair|orange hair/iu,
        'figure.outfit:casual': /(?:便服|休闲服|T恤|卫衣|casual|hoodie|t-shirt)/iu,
        'figure.outfit:formal': /(?:西装|礼服|正装|formal|suit|tuxedo)/iu,
        'figure.outfit:uniform': /(?:制服|警服|军装|工装制服|uniform)/iu,
        'figure.outfit:academic': /(?:校服|学袍|学院制服|academic|school uniform)/iu,
        'figure.outfit:artisan': /(?:围裙|工匠服|工作围裙|artisan|apron)/iu,
        'figure.outfit:combat': /(?:战斗服|铠甲|盔甲|作战服|combat|armor)/iu,
        'figure.outfit:ceremonial': /(?:祭服|礼仪长袍|祭祀袍|ceremonial)/iu,
        'figure.outfit:technical': /(?:防护服|宇航服|实验服|technical|spacesuit)/iu,
        'figure.outfit:historical': /(?:古装|长袍|汉服|和服|道袍|historic|kimono|hanfu)/iu,
        'figure.outfit:fantasy': /(?:法袍|魔法袍|精灵长袍|fantasy|mage robe)/iu,
        'figure.posture:reserved': /(?:拘谨|收敛|内敛|reserved)/iu,
        'figure.posture:relaxed': /(?:放松|慵懒|随意坐|relaxed)/iu,
        'figure.posture:upright': /(?:挺拔|端正|笔直|upright)/iu,
        'figure.posture:active': /(?:活泼|好动|矫健|active)/iu,
        'figure.posture:studious': /(?:伏案|专注读书|埋头阅读|studious)/iu,
        'figure.posture:tired': /(?:疲惫|疲倦|困倦|tired)/iu,
        'figure.hairShape:medium': /(?:中长发|齐颈|及肩|medium hair|shoulder.length hair)/iu,
        'figure.detail:headphones': /(?:耳机|headphones)/iu,
        'figure.detail:scarf': /(?:围巾|scarf)/iu,
        'figure.hairShape:long': /(?:长发|长头发|及腰|披肩发|long hair)/iu,
        'figure.hairShape:short': /(?:短发|短头发|short hair)/iu,
        'figure.hairShape:cropped': /(?:寸头|板寸|剃短|cropped|buzz cut)/iu,
        'figure.hairShape:tied': /(?:束发|扎发|马尾|发髻|ponytail|tied hair)/iu,
        'figure.hairShape:curly': /(?:卷发|卷曲头发|curly hair)/iu,
        'figure.hairShape:covered': /(?:兜帽|头巾|面纱|头纱|hood|veil|headscarf)/iu,
        'figure.hairShape:nonhuman': /(?:无毛|机械头部|非人头部|nonhuman|robotic head)/iu,
        'figure.detail:headwear': /(?:帽|冠|头巾|兜帽|头盔|发饰|hat|cap|hood|helmet|crown)/iu,
        'figure.detail:glasses': /(?:眼镜|镜片|glasses|spectacles)/iu,
        'figure.detail:pointed_ears': /(?:尖耳|精灵耳|pointed ears|elven ears)/iu,
        'figure.detail:animal_ears': /(?:兽耳|猫耳|犬耳|animal ears|cat ears)/iu,
        'figure.detail:horns': /(?:角|犄角|horns?)/iu,
        'figure.detail:visor': /(?:面罩|护目镜|visor|goggles)/iu,
    };
    const pattern = patterns[`${path}:${value}`];
    return pattern ? pattern.test(text) : text.includes(String(value || '').replace(/_/g, ' '));
}

function allowlistedRoomVisualValue(source, key, fallback) {
    const rawValue = core_text.normalizeText(source?.[key], 40).toLowerCase();
    const value = ROOM_VISUAL_LEGACY_ALIASES[key]?.[rawValue] || rawValue;
    return ROOM_VISUAL_ALLOWLISTS[key].has(value) ? value : fallback;
}

export function normalizeRoomVisualProfile(value, { identitySeed = '', bindPersona = false, worldPresentation = null, controlledEvidence = null } = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const figure = input.figure && typeof input.figure === 'object' && !Array.isArray(input.figure) ? input.figure : {};
    const normalizedSeed = core_text.normalizeText(identitySeed, 12000) || 'heartbeat-room';
    const neutralFigure = ROOM_VISUAL_PRESETS[0];
    const controlledWorldStyle = core_text.normalizeText(worldPresentation?.worldStyle, 40).toLowerCase();
    // World presentation may colour the environment, but it is not appearance evidence. A
    // deterministic preset must never turn an unknown character into a short-haired soldier,
    // elf or android. Figure fields stay explicitly unspecified unless their source excerpt is
    // present in the controlled card/world envelope and independently matches the value.
    const environmentFallback = ROOM_VISUAL_PRESETS.find(preset => preset.worldStyle === controlledWorldStyle)
        || ROOM_VISUAL_PRESETS[0];
    const identityHash = core_text.hashString(normalizedSeed);
    const evidenceMap = input.explicitEvidence && typeof input.explicitEvidence === 'object' && !Array.isArray(input.explicitEvidence)
        ? input.explicitEvidence : {};
    const explicitEvidence = {};
    const explicitFields = core_text.cleanArray(input.explicitFields, ROOM_VISUAL_EXPLICIT_FIELDS.size, 40)
        .filter(field => ROOM_VISUAL_EXPLICIT_FIELDS.has(field))
        .filter(field => {
            if (controlledEvidence === null) return true;
            const excerpt = core_text.normalizeText(evidenceMap[field], 800);
            const [group, key] = field.includes('.') ? field.split('.') : ['', field];
            const rawValue = group === 'figure' ? figure?.[key] : input?.[key];
            const normalizedValue = ROOM_VISUAL_LEGACY_ALIASES[key]?.[core_text.normalizeText(rawValue, 40).toLowerCase()]
                || core_text.normalizeText(rawValue, 40).toLowerCase();
            if (!excerpt || !core_worldPresentation.controlledEvidenceContains(controlledEvidence, excerpt)
                || !roomVisualEvidenceSupports(field, normalizedValue, excerpt)) return false;
            explicitEvidence[field] = excerpt;
            return true;
        });
    const explicit = new Set(explicitFields);
    const choose = (source, key, fallbackValue, path = key) => bindPersona && !explicit.has(path)
        ? fallbackValue
        : allowlistedRoomVisualValue(source, key, fallbackValue);
    let hairShape = choose(figure, 'hairShape', neutralFigure.hairShape, 'figure.hairShape');
    let detail = choose(figure, 'detail', neutralFigure.detail, 'figure.detail');
    if (bindPersona && hairShape === 'covered' && !explicit.has('figure.hairShape')) hairShape = neutralFigure.hairShape;
    if (bindPersona && detail === 'headwear' && !explicit.has('figure.detail')) detail = 'none';
    return {
        version: ROOM_VISUAL_PROFILE_VERSION,
        identityKey: `room-visual:${identityHash.toString(36)}`,
        explicitFields,
        explicitEvidence,
        worldStyle: worldPresentation?.worldStyle || choose(input, 'worldStyle', environmentFallback.worldStyle),
        palette: choose(input, 'palette', environmentFallback.palette),
        material: choose(input, 'material', environmentFallback.material),
        density: choose(input, 'density', environmentFallback.density),
        figure: {
            build: choose(figure, 'build', neutralFigure.build, 'figure.build'),
            hairShape,
            hairTone: choose(figure, 'hairTone', neutralFigure.hairTone, 'figure.hairTone'),
            outfit: choose(figure, 'outfit', neutralFigure.outfit, 'figure.outfit'),
            detail,
            posture: choose(figure, 'posture', neutralFigure.posture, 'figure.posture'),
            facing: 'away',
        },
    };
}

export function roomVisualIdentitySeed(room, memoryBank = null, identityHint = '') {
    const spaces = (Array.isArray(room?.spaces) ? room.spaces : []).slice(0, 10).map(space => [
        core_text.normalizeText(space?.label, 80),
        core_text.normalizeText(space?.spaceType, 100),
        core_text.normalizeText(space?.atmosphere, 360),
        (Array.isArray(space?.objects) ? space.objects : []).slice(0, 8).map(item => core_text.normalizeText(item?.label, 60)).join('、'),
    ].filter(Boolean).join('：')).join('\n');
    return [
        core_text.normalizeText(identityHint, 360),
        core_text.normalizeText(memoryBank?.characterName, 120),
        core_text.normalizeText(memoryBank?.chatId || room?.chatId, 240),
        core_text.normalizeText(room?.homeName, 120),
        core_text.normalizeText(room?.homeSummary, 1000),
        spaces,
    ].filter(Boolean).join('\u001f');
}
