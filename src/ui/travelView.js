// Independent code-drawn travel map. Generated values are escaped text or allowlisted tokens;
// route lines, marker positions and postcard composition are entirely local.
import * as design_view from './postcardDesignView.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_travel from '../modes/travel.js';
import * as ui_overlay from './overlay.js';

export function selectedTravelLocation() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.TRAVEL) return null;
    const locations = runtimeState.activeSession.locations;
    const selected = locations.find(item => item.id === runtimeState.activeSession.selectedLocationId);
    if (!selected) return null;
    const key = modes_travel.travelPostcardContentKey(selected);
    return key ? modes_travel.visibleTravelLocations(locations).find(item => modes_travel.travelPostcardContentKey(item) === key) || selected : selected;
}

function travelSourceLabel(item) {
    // The reader sees a place, not a provenance audit. Stored basis is unchanged.
    return item?.distanceLabel || '';
}

// ---------------------------------------------------------------------------
// Postcard picture side.
//
// Every number below is produced locally: either a literal, or a value derived
// from a hash of the location id/name. The model may contribute validated theme/tone
// enums plus optional picture-plan text, but that text never becomes markup or style.
// This file only parses it into local motifs; every coordinate, colour, URL, class name
// and SVG node remains owned by local code.
// ---------------------------------------------------------------------------

const POSTCARD_SCENE_WIDTH = 120;
const POSTCARD_SCENE_HEIGHT = 60;
const POSTCARD_SCENE_HORIZON = 52;

// Deterministic small-integer generator so one location always draws the same
// picture across reopens, devices and read-only snapshots.
function sceneRandom(item) {
    const source = modes_travel.travelKeepsakeForItem(item);
    const picturePlan = source?.picturePlan && typeof source.picturePlan === 'object' ? source.picturePlan : null;
    const planSeed = picturePlan ? [picturePlan.summary, picturePlan.foreground, picturePlan.midground, picturePlan.background,
        picturePlan.details, picturePlan.atmosphere, picturePlan.layout].filter(Boolean).join('|') : '';
    let seed = core_text.hashString(`${core_text.normalizeText(item?.name, 120)}|${core_text.normalizeText(item?.region, 120)}|${modes_travel.travelPostcardContentKey(item)}|${planSeed}|postcard`) >>> 0;
    return (min, max) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const span = Math.max(0, Math.floor(max) - Math.floor(min));
        return Math.floor(min) + (span ? seed % (span + 1) : 0);
    };
}

function picturePlanText(plan) {
    return plan ? [plan.summary, plan.foreground, plan.midground, plan.background, plan.details, plan.atmosphere, plan.layout]
        .map(value => core_text.normalizeText(value, 240)).filter(Boolean).join('\n') : '';
}

function picturePlanIncludes(text, pattern, negative = null) {
    if (!text || !pattern.test(text)) return false;
    return !(negative && negative.test(text));
}

function picturePlanLayout(plan) {
    const value = core_text.normalizeText(plan?.layout, 40).toLowerCase() || picturePlanText(plan).toLowerCase();
    if (/(?:^|\b)(?:left|左侧|左边|左景)(?:\b|$)/iu.test(value)) return 'left';
    if (/(?:^|\b)(?:right|右侧|右边|右景)(?:\b|$)/iu.test(value)) return 'right';
    return 'center';
}

function inferPlanTheme(text) {
    if (/(?:灯塔|海边|海湾|海面|海港|码头|船|湖畔|湖边|河岸|coast|sea|ocean|beach|harbou?r|lake|boat|shore)/iu.test(text)) return 'coast';
    if (/(?:雪山|山顶|山脊|山道|山间|山谷|小亭|凉亭|木屋|cabin|mountain|peak|ridge|alpine|pavilion)/iu.test(text)) return 'mountain';
    if (/(?:森林|树林|林间|步道|花丛|溪谷|林屋|forest|woodland|grove|trail|wildflower)/iu.test(text)) return 'forest';
    if (/(?:校园|校门|图书馆|教学楼|操场|campus|library|academy|college|school)/iu.test(text)) return 'campus';
    if (/(?:古桥|古寺|神殿|城门|长廊|古城|historic|temple|shrine|ruins|ancient)/iu.test(text)) return 'historic';
    if (/(?:魔法|尖塔|秘境|发光|精灵|fantasy|magic|spire|enchanted)/iu.test(text)) return 'fantasy';
    if (/(?:科幻|飞船|观景舷窗|霓虹|轨道|星港|赛博|scifi|cyber|spaceport|futuristic)/iu.test(text)) return 'scifi';
    if (/(?:列车|站台|街灯|高楼|天际线|city|urban|station|street|downtown|skyline)/iu.test(text)) return 'city';
    return 'neutral';
}

function travelPostcardPicturePlan(item, baseProfile) {
    const keepsake = modes_travel.travelKeepsakeForItem(item);
    const plan = keepsake?.picturePlan && typeof keepsake.picturePlan === 'object' ? keepsake.picturePlan : null;
    const text = picturePlanText(plan);
    const theme = baseProfile.theme === 'neutral' && text ? inferPlanTheme(text) : baseProfile.theme;
    const time = baseProfile.time !== 'unspecified' ? baseProfile.time
        : picturePlanIncludes(text, /(?:夜色|夜晚|深夜|月光|星空|night|moon|star)/iu)
            ? 'night'
            : picturePlanIncludes(text, /(?:清晨|晨光|日出|午后|日光|sunrise|morning|daylight|afternoon)/iu)
                ? 'day' : 'unspecified';
    const snow = baseProfile.snow || (theme === 'mountain' && picturePlanIncludes(text, /(?:雪|积雪|snow|frost|glacier)/iu, /(?:没有雪|无雪|not snow|without snow)/iu));
    const lighthouse = baseProfile.lighthouse || (theme === 'coast' && picturePlanIncludes(text, /(?:灯塔|lighthouse)/iu));
    const features = [];
    const push = name => { if (!features.includes(name)) features.push(name); };
    if (picturePlanIncludes(text, /(?:亭子|凉亭|亭台|pavilion|gazebo)/iu)) push('pavilion');
    if (picturePlanIncludes(text, /(?:木屋|小屋|屋舍|cabin|hut|lodge)/iu)) push('cabin');
    if (picturePlanIncludes(text, /(?:桥|拱桥|桥面|bridge)/iu)) push('bridge');
    if (picturePlanIncludes(text, /(?:船|小舟|帆船|boat|ship|ferry)/iu)) push('boat');
    if (picturePlanIncludes(text, /(?:校门|门楼|牌坊|gate|entrance)/iu)) push('gate');
    if (picturePlanIncludes(text, /(?:列车|站台|火车|train|tram)/iu)) push('train');
    if (picturePlanIncludes(text, /(?:塔|尖塔|高塔|tower|spire)/iu)) push('tower');
    if (picturePlanIncludes(text, /(?:瀑布|waterfall)/iu)) push('waterfall');
    if (theme === 'mountain' && !features.length) push('pavilion');
    else if (theme === 'coast' && !features.length && lighthouse) push('boat');
    else if (theme === 'campus' && !features.length) push('gate');
    else if (theme === 'historic' && !features.length) push('bridge');
    else if (theme === 'city' && !features.length) push('train');
    return {
        ...baseProfile,
        theme,
        time,
        snow,
        lighthouse,
        plan,
        planText: text,
        layout: picturePlanLayout(plan),
        features,
        rain: picturePlanIncludes(text, /(?:雨|细雨|雨丝|下雨|rain|drizzle)/iu),
        flowers: picturePlanIncludes(text, /(?:花|花丛|花树|花枝|flower|blossom)/iu),
        lanterns: picturePlanIncludes(text, /(?:灯笼|提灯|路灯|灯火|lantern|lamp)/iu),
        waterfall: picturePlanIncludes(text, /(?:瀑布|waterfall)/iu),
    };
}

function sceneSky(next) {
    // A few drifting clouds / stars, placed above the horizon only.
    const marks = [];
    const count = next(3, 5);
    for (let i = 0; i < count; i += 1) {
        const x = next(6, 114);
        const y = next(6, 29);
        const r = next(2, 5);
        marks.push(`<circle class="pc-speck" cx="${x}" cy="${y}" r="${r / 2}"/>`);
        marks.push(`<circle class="pc-speck" cx="${x + r}" cy="${y + 1}" r="${r / 3}"/>`);
    }
    return marks.join('');
}

function sceneBirds(next) {
    const marks = [];
    for (let i = 0, count = next(2, 4); i < count; i += 1) {
        const x = next(14, 104);
        const y = next(10, 24);
        const w = next(3, 5);
        marks.push(`<path class="pc-bird" d="M${x} ${y} q${w / 2} -${w / 2} ${w} 0 q${w / 2} -${w / 2} ${w} 0"/>`);
    }
    return marks.join('');
}

function sceneSkyline(next) {
    let out = '';
    let x = 2;
    while (x < POSTCARD_SCENE_WIDTH) {
        const w = next(7, 15);
        const h = next(14, 34);
        out += `<rect class="pc-solid" x="${x}" y="${POSTCARD_SCENE_HORIZON - h}" width="${w}" height="${h}" rx="1"/>`;
        for (let wy = POSTCARD_SCENE_HORIZON - h + 4; wy < POSTCARD_SCENE_HORIZON - 4; wy += 7) {
            out += `<rect class="pc-window" x="${x + 2}" y="${wy}" width="2" height="3"/>`;
            if (w > 10) out += `<rect class="pc-window" x="${x + 6}" y="${wy}" width="2" height="3"/>`;
        }
        x += w + next(1, 4);
    }
    return out;
}

function sceneTrees(next) {
    let out = '';
    for (let i = 0, count = next(7, 10); i < count; i += 1) {
        const x = next(4, 116);
        const h = next(12, 27);
        out += `<path class="pc-solid" d="M${x} ${POSTCARD_SCENE_HORIZON} L${x - h / 3} ${POSTCARD_SCENE_HORIZON} L${x} ${POSTCARD_SCENE_HORIZON - h} L${x + h / 3} ${POSTCARD_SCENE_HORIZON} Z"/>`;
        out += `<rect class="pc-solid" x="${x - 1}" y="${POSTCARD_SCENE_HORIZON - 2}" width="2" height="4"/>`;
    }
    return out;
}

function scenePeaks(next, snowy = false) {
    let out = '';
    let x = -6;
    while (x < POSTCARD_SCENE_WIDTH + 6) {
        const w = next(22, 34);
        const h = next(20, 38);
        out += `<path class="pc-solid" d="M${x} ${POSTCARD_SCENE_HORIZON} L${x + w / 2} ${POSTCARD_SCENE_HORIZON - h} L${x + w} ${POSTCARD_SCENE_HORIZON} Z"/>`;
        if (snowy) out += `<path class="pc-snow" d="M${x + w / 2 - w / 9} ${POSTCARD_SCENE_HORIZON - h + w / 7} L${x + w / 2} ${POSTCARD_SCENE_HORIZON - h} L${x + w / 2 + w / 9} ${POSTCARD_SCENE_HORIZON - h + w / 7} Z"/>`;
        x += w - next(5, 10);
    }
    return out;
}

function sceneWaves(next, lighthouse = false) {
    let out = '<path class="pc-sea" d="M0 46 L120 46 L120 60 L0 60 Z"/>';
    for (let i = 0, count = next(3, 4); i < count; i += 1) {
        const y = 49 + i * 3;
        const x = next(4, 35);
        out += `<path class="pc-wave" d="M${x} ${y} q4 -2 8 0 t8 0 t8 0"/>`;
        out += `<path class="pc-wave" d="M${x + 55} ${y + 1} q4 -2 8 0 t8 0"/>`;
    }
    if (lighthouse) {
        const lx = next(78, 104);
        const top = next(24, 30);
        out += `<path class="pc-solid" d="M${lx - 4} 46 L${lx - 2} ${top} L${lx + 2} ${top} L${lx + 4} 46 Z"/>`;
        out += `<circle class="pc-glow" cx="${lx}" cy="${top - 2}" r="3"/>`;
    }
    return out;
}

function sceneCampus(next) {
    const cx = next(52, 68);
    let out = `<rect class="pc-solid" x="${cx - 24}" y="39" width="48" height="13" rx="1"/>`;
    out += `<path class="pc-solid" d="M${cx - 28} 39 L${cx} ${next(29, 34)} L${cx + 28} 39 Z"/>`;
    out += `<rect class="pc-solid" x="${cx - 3}" y="${next(19, 24)}" width="6" height="12"/>`;
    out += `<circle class="pc-window" cx="${cx}" cy="${next(22, 27)}" r="2"/>`;
    for (let i = 0, count = next(3, 5); i < count; i += 1) {
        const x = next(6, 114);
        out += `<circle class="pc-solid" cx="${x}" cy="47" r="${next(4, 7)}"/>`;
    }
    return out;
}

function sceneHistoric(next) {
    let out = '';
    const base = next(12, 24);
    for (let i = 0; i < 5; i += 1) {
        const x = base + i * 19;
        out += `<rect class="pc-solid" x="${x}" y="32" width="8" height="20"/>`;
        out += `<path class="pc-arch" d="M${x} 32 q4 -8 8 0 Z"/>`;
    }
    out += `<rect class="pc-solid" x="${base - 4}" y="27" width="84" height="5" rx="1"/>`;
    return out;
}

function sceneFantasy(next) {
    let out = '';
    for (let i = 0, count = next(3, 4); i < count; i += 1) {
        const x = next(12, 108);
        const h = next(22, 36);
        out += `<rect class="pc-solid" x="${x - 3}" y="${POSTCARD_SCENE_HORIZON - h}" width="6" height="${h}"/>`;
        out += `<path class="pc-arch" d="M${x - 6} ${POSTCARD_SCENE_HORIZON - h} L${x} ${POSTCARD_SCENE_HORIZON - h - next(7, 12)} L${x + 6} ${POSTCARD_SCENE_HORIZON - h} Z"/>`;
        out += `<circle class="pc-glow" cx="${x}" cy="${POSTCARD_SCENE_HORIZON - h - 4}" r="1.6"/>`;
    }
    out += `<circle class="pc-glow" cx="${next(20, 100)}" cy="${next(10, 19)}" r="${next(5, 8)}"/>`;
    return out;
}

function sceneScifi(next) {
    let out = '';
    for (let i = 0, count = next(4, 6); i < count; i += 1) {
        const x = next(8, 112);
        const h = next(18, 38);
        out += `<rect class="pc-solid" x="${x - 4}" y="${POSTCARD_SCENE_HORIZON - h}" width="8" height="${h}" rx="3"/>`;
        out += `<rect class="pc-glow" x="${x - 4}" y="${POSTCARD_SCENE_HORIZON - h + 3}" width="8" height="1.4"/>`;
    }
    for (let i = 0, count = next(2, 3); i < count; i += 1) {
        const y = next(10, 27);
        out += `<path class="pc-wave" d="M${next(4, 24)} ${y} L${next(72, 116)} ${y - next(2, 6)}"/>`;
    }
    out += `<circle class="pc-glow" cx="${next(18, 102)}" cy="${next(8, 18)}" r="${next(4, 7)}"/>`;
    return out;
}

function sceneNeutral(next) {
    const left = next(18, 34);
    const right = next(78, 104);
    const middle = next(48, 70);
    return `<path class="pc-solid" d="M0 ${POSTCARD_SCENE_HORIZON} Q${left} ${next(35, 45)} ${middle} ${POSTCARD_SCENE_HORIZON} T${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HORIZON} Z"/>
      <path class="pc-arch" d="M0 ${POSTCARD_SCENE_HORIZON + 5} Q${middle} ${next(40, 49)} ${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HORIZON + 5} Z"/>
      <circle class="pc-glow" cx="${right}" cy="${next(13, 23)}" r="${next(4, 7)}"/>`;
}

function sceneLayoutAnchors(layout) {
    return layout === 'left' ? [26, 46, 88] : layout === 'right' ? [88, 66, 26] : [60, 32, 90];
}

function sceneFeatureHeight(theme) {
    return theme === 'coast' ? 45 : theme === 'mountain' ? 42 : theme === 'city' ? 44 : 46;
}

function renderPavilionFeature(x, y, scale = 1) {
    const width = 12 * scale, roof = 6 * scale;
    return `<path class="pc-solid" d="M${x - width / 2} ${y - roof} L${x} ${y - roof - 4 * scale} L${x + width / 2} ${y - roof} Z"/><rect class="pc-solid" x="${x - width / 2 + 1}" y="${y - roof}" width="${width - 2}" height="2" rx="1"/><rect class="pc-solid" x="${x - 4 * scale}" y="${y - roof}" width="1.8" height="${roof}"/><rect class="pc-solid" x="${x + 2.2 * scale}" y="${y - roof}" width="1.8" height="${roof}"/>`;
}

function renderCabinFeature(x, y, scale = 1) {
    const width = 12 * scale, height = 8 * scale;
    return `<rect class="pc-solid" x="${x - width / 2}" y="${y - height}" width="${width}" height="${height}" rx="1"/><path class="pc-arch" d="M${x - width / 2 - 1} ${y - height} L${x} ${y - height - 5 * scale} L${x + width / 2 + 1} ${y - height} Z"/><rect class="pc-window" x="${x - 2 * scale}" y="${y - height + 2 * scale}" width="3" height="3" rx=".5"/>`;
}

function renderBridgeFeature(x, y, scale = 1) {
    const width = 18 * scale;
    return `<path class="pc-wave" d="M${x - width / 2} ${y} Q${x} ${y - 5 * scale} ${x + width / 2} ${y}"/><path class="pc-solid" d="M${x - width / 2} ${y} h${width}"/>`;
}

function renderBoatFeature(x, y, scale = 1) {
    return `<path class="pc-solid" d="M${x - 7 * scale} ${y} Q${x} ${y + 3 * scale} ${x + 7 * scale} ${y} L${x + 5 * scale} ${y + 2 * scale} H${x - 5 * scale} Z"/><path class="pc-solid" d="M${x} ${y - 8 * scale} V${y}"/><path class="pc-window" d="M${x} ${y - 8 * scale} L${x} ${y - 2 * scale} L${x + 5 * scale} ${y - 4 * scale} Z"/>`;
}

function renderGateFeature(x, y, scale = 1) {
    const width = 14 * scale;
    return `<rect class="pc-solid" x="${x - width / 2}" y="${y - 9 * scale}" width="2" height="9"/><rect class="pc-solid" x="${x + width / 2 - 2}" y="${y - 9 * scale}" width="2" height="9"/><rect class="pc-solid" x="${x - width / 2 - 1}" y="${y - 11 * scale}" width="${width + 2}" height="2.4" rx="1"/><path class="pc-arch" d="M${x - width / 2 - 2} ${y - 11 * scale} L${x} ${y - 15 * scale} L${x + width / 2 + 2} ${y - 11 * scale} Z"/>`;
}

function renderTrainFeature(x, y, scale = 1) {
    const width = 20 * scale;
    return `<rect class="pc-solid" x="${x - width / 2}" y="${y - 6 * scale}" width="${width}" height="${6 * scale}" rx="3"/><rect class="pc-window" x="${x - width / 2 + 2}" y="${y - 5 * scale}" width="4" height="2.2" rx="1"/><rect class="pc-window" x="${x - width / 2 + 8}" y="${y - 5 * scale}" width="4" height="2.2" rx="1"/><rect class="pc-window" x="${x - width / 2 + 14}" y="${y - 5 * scale}" width="4" height="2.2" rx="1"/>`;
}

function renderTowerFeature(x, y, scale = 1) {
    return `<rect class="pc-solid" x="${x - 3 * scale}" y="${y - 16 * scale}" width="6" height="${16 * scale}" rx="2"/><rect class="pc-glow" x="${x - 2 * scale}" y="${y - 12 * scale}" width="4" height="1.8" rx="1"/><path class="pc-arch" d="M${x - 6 * scale} ${y - 16 * scale} L${x} ${y - 22 * scale} L${x + 6 * scale} ${y - 16 * scale} Z"/>`;
}

function renderWaterfallFeature(x, y, scale = 1) {
    return `<path class="pc-window" d="M${x} ${y - 18 * scale} Q${x + 2 * scale} ${y - 10 * scale} ${x} ${y} Q${x - 2 * scale} ${y - 7 * scale} ${x} ${y - 18 * scale} Z" opacity=".7"/>`;
}

function renderScenePlanFeatures(plan, next) {
    const [primaryX, secondaryX] = sceneLayoutAnchors(plan.layout);
    const baseY = sceneFeatureHeight(plan.theme);
    const scale = plan.theme === 'coast' || plan.theme === 'city' ? 0.95 : 1;
    const renderers = {
        pavilion: renderPavilionFeature,
        cabin: renderCabinFeature,
        bridge: renderBridgeFeature,
        boat: renderBoatFeature,
        gate: renderGateFeature,
        train: renderTrainFeature,
        tower: renderTowerFeature,
        waterfall: renderWaterfallFeature,
    };
    let out = '';
    plan.features.slice(0, 2).forEach((feature, index) => {
        const renderer = renderers[feature];
        if (!renderer) return;
        const x = index === 0 ? primaryX : secondaryX;
        const y = feature === 'boat' ? baseY + 1 : feature === 'bridge' ? baseY : baseY;
        out += renderer(x + next(-3, 3), y + next(-1, 1), scale * (index === 0 ? 1 : 0.82));
    });
    if (plan.lanterns) {
        const lampX = plan.layout === 'right' ? 92 : 26;
        out += `<rect class="pc-solid" x="${lampX}" y="34" width="1.3" height="14"/><circle class="pc-glow" cx="${lampX + 0.7}" cy="33" r="2.2"/>`;
    }
    if (plan.waterfall && !plan.features.includes('waterfall')) out += renderWaterfallFeature(plan.layout === 'right' ? 86 : 36, 46, 1);
    return out;
}

function renderScenePlanWeather(plan, next) {
    let out = '';
    if (plan.rain) {
        for (let i = 0; i < 10; i += 1) {
            const x = next(8, 112);
            const y = next(8, 34);
            out += `<path class="pc-wave" d="M${x} ${y} l-2 5" opacity=".35"/>`;
        }
    }
    if (plan.flowers) {
        for (let i = 0; i < 6; i += 1) {
            const x = next(8, 112);
            const y = next(49, 58);
            out += `<circle class="pc-glow" cx="${x}" cy="${y}" r="1.2"/><circle class="pc-window" cx="${x + 1.5}" cy="${y - 0.6}" r="0.8"/>`;
        }
    }
    return out;
}

function travelPostcardScene(item, profile) {
    const plan = travelPostcardPicturePlan(item, profile);
    const next = sceneRandom(item);
    const safeTheme = plan.theme;
    const nightish = plan.time === 'night';
    const orb = nightish ? '<path class="pc-orb" d="M96 8 A8 8 0 1 0 96 24 A7 7 0 0 1 96 8 Z"/>' : plan.time === 'unspecified' ? '' : safeTheme === 'coast' || safeTheme === 'campus'
        ? `<circle class="pc-orb" cx="${next(78, 105)}" cy="${next(10, 18)}" r="${next(6, 9)}"/>`
        : `<circle class="pc-orb" cx="${next(18, 102)}" cy="${next(9, 18)}" r="${next(5, 8)}"/>`;
    const body = safeTheme === 'coast' ? sceneWaves(next, plan.lighthouse)
        : safeTheme === 'forest' ? sceneTrees(next)
        : safeTheme === 'mountain' ? scenePeaks(next, plan.snow)
        : safeTheme === 'campus' ? sceneCampus(next)
        : safeTheme === 'historic' ? sceneHistoric(next)
        : safeTheme === 'fantasy' ? sceneFantasy(next)
        : safeTheme === 'scifi' ? sceneScifi(next)
        : safeTheme === 'city' ? sceneSkyline(next)
        : sceneNeutral(next);
    const skyMarks = nightish ? sceneSky(next) : plan.rain ? '' : sceneBirds(next);
    const ambience = sceneSky(next);
    const features = renderScenePlanFeatures(plan, next);
    const weather = renderScenePlanWeather(plan, next);
    const pathStart = plan.layout === 'left' ? next(12, 24) : plan.layout === 'right' ? next(52, 72) : next(24, 48);
    const pathMid = plan.layout === 'left' ? next(46, 58) : plan.layout === 'right' ? next(58, 70) : next(54, 66);
    const pathEnd = plan.layout === 'left' ? next(78, 102) : plan.layout === 'right' ? next(18, 44) : next(70, 96);
    return `<svg class="rmt-travel-postcard-scene" data-rmt-scene-theme="${safeTheme}" data-rmt-scene-time="${plan.time}" data-rmt-plan-layout="${plan.layout}" viewBox="0 0 ${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${core_text.esc(`${item.name} 的明信片风景示意`)}">
      <rect class="pc-sky" x="0" y="0" width="${POSTCARD_SCENE_WIDTH}" height="${POSTCARD_SCENE_HEIGHT}"/>
      ${orb}
      ${skyMarks}
      ${ambience}
      ${body}
      ${features}
      ${weather}
      <path class="pc-ground" d="M0 ${POSTCARD_SCENE_HORIZON} L${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HORIZON} L${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HEIGHT} L0 ${POSTCARD_SCENE_HEIGHT} Z"/>
      <path class="pc-path" d="M${pathStart} ${POSTCARD_SCENE_HEIGHT} Q${pathMid} ${next(54, 57)} ${pathEnd} ${POSTCARD_SCENE_HORIZON}"/>
    </svg>`;
}

export function travelPostcardHtml(item, session, options = {}) {
    const source = modes_travel.travelKeepsakeForItem(item);
    const card = source ? { title: source.title, postmark: source.mark, greeting: source.greeting, body: source.body, closing: source.closing, stampLabel: source.emblem, tone: source.tone } : {};
    const rawTone = core_text.normalizeText(card.tone, 30).toLowerCase();
    const tone = core_constants.TRAVEL_POSTCARD_TONES.has(rawTone) ? rawTone : 'paper';
    const userName = core_text.normalizeText(options.recipient || (runtimeState.activeArchiveSnapshot
        ? runtimeState.activeArchiveSnapshot.memory?.userName
        : core_context.getContext()?.name1), 100) || '你';
    const sceneProfile = modes_travel.travelPostcardSceneProfile(item, session?.mapTheme);
    const pictureProfile = travelPostcardPicturePlan(item, sceneProfile);
    const theme = pictureProfile.theme;
    const hasDesign = !!source && Object.hasOwn(source, 'design');
    const designArt = hasDesign ? design_view.renderPostcardDesign(source.design, item.name) || design_view.renderPostcardDesignFallback() : '';
    return `<section class="rmt-travel-postcard tone-${tone}${hasDesign ? ' rmt-designed-postcard' : ''}" data-rmt-postcard-theme="${theme}" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的明信片">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="${core_text.esc(options.closeAction || 'travel-close-detail')}" aria-label="收起明信片">×</button>
      <figure class="rmt-travel-postcard-face">
        ${hasDesign ? designArt : travelPostcardScene(item, sceneProfile)}
        <figcaption><small>GREETINGS FROM</small><b>${core_text.esc(item.region || item.name)}</b></figcaption>
      </figure>
      <div class="rmt-travel-postcard-back">
        <div class="rmt-travel-postcard-mark"><span>${core_text.esc(card.stampLabel || 'POST')}</span><i>${core_text.esc(card.postmark || item.region || 'FAR AWAY')}</i></div>
        <div class="rmt-travel-postcard-copy">
          <small>POSTCARD FROM ${core_text.esc(item.region || item.name)}</small>
          <h3>${core_text.esc(card.title)}</h3>
          ${card.greeting ? `<b>${core_text.esc(card.greeting)}</b>` : ''}
          <p>${core_text.esc(card.body)}</p>
          <footer>${core_text.esc(card.closing)}</footer>
        </div>
        <div class="rmt-travel-postcard-address"><span>TO</span><b>${core_text.esc(userName)}</b><small>${core_text.esc(item.distanceLabel)}</small></div>
      </div>
    </section>`;
}

function travelKeepsakeForView(item) {
    return modes_travel.travelKeepsakeForItem(item);
}

function travelKeepsakeHtml(item, session) {
    const keepsake = travelKeepsakeForView(item);
    if (!keepsake || keepsake.kind === 'postcard') return travelPostcardHtml(item, session);
    const labels = { letter: 'LETTER', journal: 'JOURNAL', scroll: 'SCROLL', fieldnote: 'FIELD NOTE', dossier: 'DOSSIER', datalog: 'DATA LOG', token: 'TOKEN' };
    const label = labels[keepsake.kind] || 'KEEPSAKE';
    const emblem = core_text.normalizeText(keepsake.emblem || label.slice(0, 4), 40);
    const sceneProfile = modes_travel.travelPostcardSceneProfile(item, session?.mapTheme);
    const theme = sceneProfile.theme;
    const hasDesign = Object.hasOwn(keepsake, 'design');
    const designArt = hasDesign ? design_view.renderPostcardDesign(keepsake.design, item.name) || design_view.renderPostcardDesignFallback() : '';
    return `<section class="rmt-travel-artifact artifact-${keepsake.kind} tone-${core_text.esc(keepsake.tone || 'paper')}${hasDesign ? ' rmt-designed-postcard' : ''}" data-rmt-artifact-kind="${keepsake.kind}" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的出行纪念">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="travel-close-detail" aria-label="收起出行纪念">×</button>
      <header class="rmt-travel-artifact-head"><span>${label}</span><i>${core_text.esc(keepsake.mark || item.region || label)}</i></header>
      <figure class="rmt-travel-artifact-figure" data-rmt-artifact-theme="${core_text.esc(theme)}">${hasDesign ? designArt : travelPostcardScene(item, sceneProfile).replace('rmt-travel-postcard-scene', 'rmt-travel-artifact-scene').replaceAll('pc-', 'artifact-scene-').replace('明信片风景示意', '出行纪念风景示意')}<figcaption>${core_text.esc(item.region || item.name)}</figcaption></figure>
      <div class="rmt-travel-artifact-emblem" aria-hidden="true">${core_text.esc(emblem)}</div>
      <article class="rmt-travel-artifact-copy"><small>${core_text.esc(item.region || item.name)}</small><h3>${core_text.esc(keepsake.title)}</h3>${keepsake.greeting ? `<b>${core_text.esc(keepsake.greeting)}</b>` : ''}<p>${core_text.esc(keepsake.body)}</p><footer>${core_text.esc(keepsake.closing)}</footer></article>
      <div class="rmt-travel-artifact-meta">${core_text.esc(item.distanceLabel)}</div>
    </section>`;
}

function travelDialogueHtml(item, session) {
    const lines = Array.isArray(item?.dialogueLines) ? item.dialogueLines : [];
    const max = Math.max(0, lines.length - 1);
    const index = Math.max(0, Math.min(max, Math.floor(Number(session.dialogueIndex) || 0)));
    session.dialogueIndex = index;
    const charName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext()?.name2, 100) || '他';
    return `<section class="rmt-travel-dialogue" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的地点对话">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="travel-close-detail" aria-label="收起地点对话">×</button>
      <div class="rmt-travel-dialogue-place"><small>NEARBY STOP · ${core_text.esc(item.distanceLabel)}</small><h3>${core_text.esc(item.name)}</h3><p>${core_text.esc(item.summary)}</p></div>
      <div class="rmt-travel-dialogue-bubble"><b>${core_text.esc(charName)}</b><p>${core_text.esc(lines[index] || '')}</p><span>${lines.length ? `${index + 1} / ${lines.length}` : '0 / 0'}</span></div>
      <div class="rmt-travel-dialogue-actions">
        <button type="button" class="rmt-btn" data-rmt-action="travel-dialogue-prev" ${index <= 0 ? 'disabled' : ''}>上一句</button>
        <button type="button" class="rmt-btn" data-rmt-action="travel-dialogue-replay">重听</button>
        <button type="button" class="rmt-btn" data-rmt-action="travel-dialogue-next" ${index >= max ? 'disabled' : ''}>下一句</button>
      </div>
    </section>`;
}

export function renderTravel() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.TRAVEL) return;
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.TRAVEL]);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    const selected = selectedTravelLocation();
    const locations = modes_travel.visibleTravelLocations(session.locations);
    const near = locations.filter(item => item.kind === 'near');
    const far = locations.filter(item => item.kind === 'far');
    const markerPositions = modes_travel.travelMarkerPositions(locations);
    const markers = locations.map((item, index) => {
        const position = markerPositions[index];
        const active = selected?.id === item.id;
        const kind = modes_travel.safeTravelLocationKind(item.kind);
        return `<button type="button" class="rmt-travel-marker ${kind} ${active ? 'active' : ''}" style="--map-x:${position.x}%;--map-y:${position.y}%" data-rmt-travel-location="${core_text.esc(item.id)}" aria-label="${core_text.esc(`${kind === 'near' ? '附近地点' : '远方地点'}：${item.name}`)}"><i class="fa-solid ${kind === 'near' ? 'fa-location-dot' : 'fa-envelope'}"></i><span>${core_text.esc(item.name)}</span></button>`;
    }).join('');
    const selectedDetail = selected
        ? selected.kind === 'far' ? travelKeepsakeHtml(selected, session) : travelDialogueHtml(selected, session)
        : '';
    const legendRows = locations.map(item => `<button type="button" class="${selected?.id === item.id ? 'active' : ''}" data-rmt-travel-location="${core_text.esc(item.id)}"><i class="fa-solid ${item.kind === 'near' ? 'fa-location-dot' : 'fa-envelope'}"></i><span><b>${core_text.esc(item.name)}</b><small>${core_text.esc([...new Set([item.region, travelSourceLabel(item)].filter(Boolean))].join(' · '))}</small></span></button>`).join('');
    body.innerHTML = `<div class="rmt-travel" data-rmt-travel-theme="${modes_travel.safeTravelTheme(session.mapTheme)}">
      <div class="rmt-mail-actions"><button type="button" class="rmt-btn" data-rmt-mode="inbox">打开你的邮箱 · 收藏路线明信片</button></div><header class="rmt-travel-head"><div><small>THE ROUTES HE TAKES</small><h2>${core_text.esc(session.title)}</h2><p>${core_text.esc(session.routeSummary)}</p></div><div><span><b>${near.length}</b> 附近</span><span><b>${far.length}</b> 远方</span></div></header>
      <div class="rmt-travel-layout">
        <section class="rmt-travel-map" aria-label="他的出行路线地图">
          <div class="rmt-travel-grid" aria-hidden="true"></div>
          <svg class="rmt-travel-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M7 73 C22 57 27 29 46 39 S70 78 93 47"/><path d="M12 22 C31 12 44 27 55 61 S73 86 91 82"/><path d="M18 89 C33 70 54 83 66 52 S81 19 94 17"/></svg>
          <div class="rmt-travel-horizon" aria-hidden="true"><span></span><span></span><span></span></div>
          ${markers}
          ${selectedDetail}
          <div class="rmt-travel-map-key"><span><i class="near"></i>附近 · 点击听他说</span><span><i class="far"></i>远方 · 点击收下纪念</span></div>
        </section>
        <aside class="rmt-travel-index"><div><small>ROUTE INDEX</small><h3>地图坐标</h3></div>${!near.length ? '<p>还没有可确认的附近地点。</p>' : ''}${!far.length ? '<p>远方坐标待故事留下线索。</p>' : ''}<nav>${legendRows}</nav></aside>
      </div>
    </div>`;
}

export function selectTravelLocation(id) {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.TRAVEL) return;
    const item = session.locations.find(candidate => candidate.id === id);
    if (!item) return;
    session.selectedLocationId = item.id;
    session.dialogueIndex = 0;
    renderTravel();
}

export function closeTravelDetail() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.TRAVEL) return;
    runtimeState.activeSession.selectedLocationId = '';
    runtimeState.activeSession.dialogueIndex = 0;
    renderTravel();
}

export function travelDialogueStep(delta) {
    const session = runtimeState.activeSession;
    const item = selectedTravelLocation();
    if (!session || session.kind !== core_constants.MODE.TRAVEL || item?.kind !== 'near') return;
    const max = Math.max(0, item.dialogueLines.length - 1);
    session.dialogueIndex = Math.max(0, Math.min(max, Math.floor(Number(session.dialogueIndex) || 0) + Number(delta || 0)));
    renderTravel();
}

export function replayTravelDialogue() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.TRAVEL) return;
    runtimeState.activeSession.dialogueIndex = 0;
    renderTravel();
}
