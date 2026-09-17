// Optional, inert postcard composition data. No raw markup, paths, colours or targets.
// Failure rejects the entire design, never the independently validated letter.
export const DESIGN_VERSION = 1;
export const MAX_DESIGN_BYTES = 8 * 1024;
export const MAX_DESIGN_ELEMENTS = 20;
// Counts ALL rendered SVG descendants, including the two local background nodes.
export const MAX_DESIGN_NODES = 90;
export const DESIGN_BASE_NODES = 2;
export const ELEMENT_NODE_COST = Object.freeze({
    peak: 2, hill: 1, shore: 2, water: 9, field: 1,
    tree: 2, grove: 2, reed: 2, flower: 6, leaf: 1,
    pavilion: 5, cabin: 3, tower: 4, bridge: 6, gate: 4, wall: 5, boat: 4,
    orb: 1, cloud: 2, bird: 1, rain: 1, snow: 1, star: 1, lantern: 2,
});
export const DESIGN_KINDS = Object.freeze(Object.keys(ELEMENT_NODE_COST));
export const DESIGN_LAYERS = Object.freeze(['far', 'mid', 'near']);
export const DESIGN_PALETTES = Object.freeze(['paper', 'rose', 'ocean', 'forest', 'sunset', 'night']);
const rootKeys = Object.freeze(['version', 'sky', 'light', 'density', 'palette', 'elements']);
const elementKeys = Object.freeze(['kind', 'layer', 'x', 'size', 'count']);
const skyValues = Object.freeze(['clear', 'cloud', 'fog', 'rain', 'snow', 'star']);
const lightValues = Object.freeze(['day', 'dawn', 'dusk', 'night']);
const densityValues = Object.freeze(['sparse', 'balanced', 'dense']);
const sizeValues = Object.freeze(['s', 'm', 'l']);

// Do not invoke accessors, valueOf, toJSON or prototype members while validating.
function ownRecord(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const names = Reflect.ownKeys(value);
    if (names.length > keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
    const copy = Object.create(null);
    for (const key of names) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
        copy[key] = descriptor.value;
    }
    return copy;
}
function token(value, allowed, fallback) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.length > 64) return null;
    return allowed.includes(value) ? value : fallback;
}
function integer(value, min, max, fallback) {
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, Math.round(value))) : null;
}
function normalize(value) {
    const raw = ownRecord(value, rootKeys);
    if (!raw || raw.version !== DESIGN_VERSION || !Array.isArray(raw.elements)
        || Object.getPrototypeOf(raw.elements) !== Array.prototype) return null;
    const list = raw.elements;
    if (!list.length || list.length > MAX_DESIGN_ELEMENTS || Reflect.ownKeys(list).length !== list.length + 1) return null;
    // Bound input as well as canonical output. Only the checked primitives are serialized.
    const input = { ...raw, elements: [] };
    const elements = [];
    let nodes = DESIGN_BASE_NODES;
    for (let i = 0; i < list.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(list, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
        const item = ownRecord(descriptor.value, elementKeys);
        if (!item || typeof item.kind !== 'string' || !Object.hasOwn(ELEMENT_NODE_COST, item.kind)) return null;
        const layer = token(item.layer, DESIGN_LAYERS, 'mid');
        const size = token(item.size, sizeValues, 'm');
        const x = integer(item.x, 0, 100, 50), count = integer(item.count, 1, 6, 1);
        if (!layer || !size || x === null || count === null) return null;
        nodes += ELEMENT_NODE_COST[item.kind] * count;
        if (nodes > MAX_DESIGN_NODES) return null;
        elements.push({ kind: item.kind, layer, x, size, count });
        input.elements.push({ ...item });
    }
    const sky = token(raw.sky, skyValues, 'clear'), light = token(raw.light, lightValues, 'day');
    const density = token(raw.density, densityValues, 'balanced'), palette = token(raw.palette, DESIGN_PALETTES, 'paper');
    if (!sky || !light || !density || !palette) return null;
    // A boat needs an explicit water/shore support at the same or an earlier depth.
    if (elements.some(item => item.kind === 'boat' && !elements.some(surface =>
        ['water', 'shore'].includes(surface.kind) && DESIGN_LAYERS.indexOf(surface.layer) <= DESIGN_LAYERS.indexOf(item.layer)))) return null;
    const design = { version: DESIGN_VERSION, sky, light, density, palette, elements };
    const encoder = new TextEncoder();
    if (encoder.encode(JSON.stringify(input)).byteLength > MAX_DESIGN_BYTES
        || encoder.encode(JSON.stringify(design)).byteLength > MAX_DESIGN_BYTES) return null;
    return design;
}
export function normalizePostcardDesign(value) {
    try { return normalize(value); } catch { return null; }
}
export function postcardDesignFields(source) {
    try {
        const descriptor = source && typeof source === 'object' && Object.getOwnPropertyDescriptor(source, 'design');
        if (!descriptor) return {};
        return { design: Object.hasOwn(descriptor, 'value') ? normalizePostcardDesign(descriptor.value) : null };
    } catch { return { design: null }; }
}
export function postcardDesignNodeCount(value) {
    const design = normalizePostcardDesign(value);
    return design ? DESIGN_BASE_NODES + design.elements.reduce((sum, item) => sum + ELEMENT_NODE_COST[item.kind] * item.count, 0) : 0;
}

// Appended only to the travel visual contract, never to other mode prompts.
export function postcardDesignInstructions() {
    return `【仅远方纪念页的视觉设计】
keepsake.design 与本封正文在同一次请求中构思；不是模板编号或自由文本 picturePlan。不要重写附近地点规则或历史证据。
design={"version":1,"sky":"clear","light":"day","density":"balanced","palette":"paper","elements":[{"kind":"peak","layer":"far","x":30,"size":"m","count":3},{"kind":"pavilion","layer":"mid","x":68,"size":"m","count":1},{"kind":"field","layer":"near","x":50,"size":"l","count":1}]}。
只允许这些字段。sky=clear/cloud/fog/rain/snow/star；light=day/dawn/dusk/night；density=sparse/balanced/dense；palette=paper/rose/ocean/forest/sunset/night。
图元 kind=${DESIGN_KINDS.join('/')}。layer=far/mid/near，x为0～100整数，size=s/m/l，count为1～6整数；最多20条图元、8KiB UTF-8，全部展开加两个背景节点最多90个SVG节点。每实例节点成本：${Object.entries(ELEMENT_NODE_COST).map(([k,v]) => k+'='+v).join(',')}。
模型决定元素组合、层次、横向位置、大小和疏密；地面承托和SVG坐标由本地计算。water/shore给boat提供水面，同层或更远处必须显式设计水面。桥可跨水或地面，gate与wall可同层相邻衔接。位置相同、数量多时应主动缩小，保留合理留白。
只画本封信眼前或明确描写的景物，不把回忆、比喻、否定句当眼前场景。没有设计的亭子、船、月亮、雪点等不会自动添加；不要为填满画布臆造景物。
支持范围内自行构图，不要每封重复同一排图标。不能合适表达时design=null，正文仍正常输出。禁止SVG/HTML/CSS/JS、任意path、颜色值、URL、class、Base64、对象路径或嵌套图元。视觉设计不能充当共同往事的证据。`;
}
