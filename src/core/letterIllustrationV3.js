// New mail carries a scene-specific drawing in the same response as its prose.
// SVG stays static and isolated in an image; old illustrations keep their renderers.
export const VERSION = 3;
export const CONTRACT = '先完整输出 letters 中所有信的 slot、title、greeting、body、closing，再在同一份 JSON 的末尾输出 letterIllustrations 数组。每幅小画对应一封信：{"slot":"对应信的 slot","version":3,"characterName":"本信人物姓名","summary":"简短记录本次具体情节、动作、表情、衣着和视角，供后续小画避重","svg":"<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 400 320\'>…</svg>"}。从本封信选择一个具体瞬间，直接绘制有辨识度的信末手绘小插画；让身体和手指的动作、表情、衣褶、人物朝向、远近、道具与环境位置真正呈现这一幕，不要每次套用正面半身端东西的同一人物模板。角色固有外貌和标志特征依据已提供的角色卡、世界书保持一致；服装优先跟随本信描写，未写明时结合角色身份、时代和当次情境自然选择，不把人设服装当作每封信唯一可穿的衣服。没有明确外貌的细节不必臆造，可用适合情节的侧影、背影、手部或物件构图。参照近期小画记录自然变化动作、表情和构图，情节需要时可以沿用；不必为避重改写信意。不受场景、姿势、颜色或服装枚举限制，不需要逐字证据或关键词匹配。自行设计 SVG 路径、形状、层次、色彩和构图，画幅按情节选择；可用渐变、裁切、蒙版与少量文字。优先使用图形属性或内联样式，SVG 字符串正确转义为 JSON；不用脚本、事件、外部图片/字体/链接、foreignObject 或动画。全部在本次来信请求完成，不另发绘图请求；小画是信末附加内容，先保证信文完整。';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TAGS = new Map([
    'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line',
    'polyline', 'polygon', 'text', 'tspan', 'textPath', 'title', 'desc', 'linearGradient',
    'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'filter',
    'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
    'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
    'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode',
    'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
    'feTile', 'feTurbulence',
].map(name => [name.toLowerCase(), name]));
const ATTRIBUTES = new Map((
    'id class x y x1 x2 y1 y2 cx cy r rx ry dx dy width height d points pathLength ' +
    'viewBox preserveAspectRatio transform rotate opacity fill fill-opacity fill-rule ' +
    'stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit ' +
    'stroke-dasharray stroke-dashoffset clip-rule clip-path mask filter ' +
    'color color-interpolation color-interpolation-filters color-rendering ' +
    'shape-rendering text-rendering vector-effect paint-order display visibility overflow ' +
    'font-family font-size font-style font-weight font-stretch font-variant ' +
    'text-anchor text-decoration textLength lengthAdjust dominant-baseline alignment-baseline ' +
    'baseline-shift letter-spacing word-spacing writing-mode direction unicode-bidi ' +
    'startOffset method spacing gradientUnits gradientTransform spreadMethod offset ' +
    'stop-color stop-opacity fx fy fr patternUnits patternContentUnits patternTransform ' +
    'clipPathUnits maskUnits maskContentUnits markerWidth markerHeight markerUnits ' +
    'refX refY orient marker-start marker-mid marker-end filterUnits primitiveUnits ' +
    'in in2 result mode type values operator k1 k2 k3 k4 order kernelMatrix divisor bias ' +
    'targetX targetY edgeMode kernelUnitLength preserveAlpha surfaceScale diffuseConstant ' +
    'specularConstant specularExponent limitingConeAngle scale xChannelSelector yChannelSelector ' +
    'azimuth elevation stdDeviation flood-color flood-opacity tableValues slope intercept ' +
    'amplitude exponent radius dx dy z pointsAtX pointsAtY pointsAtZ ' +
    'baseFrequency numOctaves seed stitchTiles'
).split(/\s+/u).map(name => [name.toLowerCase(), name]));
const STYLE_PROPERTIES = new Set((
    'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap ' +
    'stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color ' +
    'clip-rule clip-path mask filter marker-start marker-mid marker-end ' +
    'stop-color stop-opacity flood-color flood-opacity color-interpolation ' +
    'color-interpolation-filters color-rendering shape-rendering text-rendering ' +
    'vector-effect paint-order display visibility overflow font-family font-size font-style ' +
    'font-weight font-stretch font-variant text-anchor text-decoration dominant-baseline ' +
    'alignment-baseline baseline-shift letter-spacing word-spacing writing-mode direction ' +
    'unicode-bidi white-space transform transform-origin transform-box mix-blend-mode isolation'
).split(/\s+/u));
const DRAWING_TAGS = new Set(['use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);
const DROP_CONTENT = new Set(['script', 'foreignobject', 'image', 'feimage', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animatemotion', 'animatetransform', 'set']);

function escapeXml(value) {
    return String(value).replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function ownText(value, key) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string' ? descriptor.value : '';
}
function text(value) {
    return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
}
function fragment(value) {
    return /^#[^\s"'()<>\\\u0000-\u001f\u007f]+$/u.test(value);
}
function staticValue(value) {
    const clean = value.trim();
    // CSS escapes/comments can disguise a URL or executable legacy expression.
    // Local paint-server references are the only URLs retained anywhere in SVG.
    if (!clean || /[\\<>@{}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\/\*|\*\/|(?:javascript|vbscript)\s*:|expression\s*\(/iu.test(clean)) return '';
    let external = false;
    const remainder = clean.replace(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/giu, (whole, double, single, bare) => {
        if (!fragment(double ?? single ?? bare ?? '')) external = true;
        return '';
    });
    return external || /url\s*\(/iu.test(remainder) ? '' : clean;
}
function cleanStyle(value) {
    const rules = [];
    for (const declaration of value.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        if (!STYLE_PROPERTIES.has(property)) continue;
        const clean = staticValue(declaration.slice(colon + 1));
        if (clean) rules.push(`${property}:${clean}`);
    }
    return rules.join(';');
}
function cleanStylesheet(value) {
    const rules = [];
    // Keep ordinary selectors, but never imports, font faces, animations, or nested rules.
    for (const match of value.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
        const selector = match[1].trim();
        if (!selector || /[\\@<>\/\u0000-\u001f\u007f]/u.test(selector)) continue;
        const declarations = cleanStyle(match[2]);
        if (declarations) rules.push(`${selector}{${declarations}}`);
    }
    return rules.join('\n');
}
function positiveLength(value) {
    const match = /^\s*(\d*\.?\d+)(?:px)?\s*$/iu.exec(value || '');
    return match && Number.isFinite(Number(match[1])) && Number(match[1]) > 0 ? Number(match[1]) : null;
}
function viewBox(root) {
    const supplied = (root.getAttribute('viewBox') || root.getAttribute('viewbox') || '').trim().split(/[\s,]+/u).map(Number);
    if (supplied.length === 4 && supplied.every(Number.isFinite) && supplied[2] > 0 && supplied[3] > 0) return supplied;
    return [0, 0, positiveLength(root.getAttribute('width')) || 400, positiveLength(root.getAttribute('height')) || 320];
}
function sanitizeSvg(raw) {
    if (typeof DOMParser !== 'function') return '';
    const source = raw.trim().replace(/^```(?:svg|xml|html)?\s*/iu, '').replace(/\s*```$/u, '').trim();
    if (!source) return '';
    // Do not resolve declarations/entities supplied by model text.
    if (/<!DOCTYPE|<!ENTITY/iu.test(source)) return '';
    const parser = new DOMParser();
    const parsed = parser.parseFromString(source, 'image/svg+xml');
    const root = parsed?.documentElement;
    if (!root || String(root.localName || root.nodeName).toLowerCase() !== 'svg' || parsed.getElementsByTagName('parsererror').length) return '';
    if (root.namespaceURI && root.namespaceURI !== SVG_NS) return '';
    let drawing = false;
    function visit(node, inDefinitions = false, top = false) {
        if (node.nodeType === 3 || node.nodeType === 4) return escapeXml(node.nodeValue || '');
        if (node.nodeType !== 1 || (node.namespaceURI && node.namespaceURI !== SVG_NS)) return '';
        const name = String(node.localName || node.nodeName).toLowerCase();
        if (DROP_CONTENT.has(name)) return '';
        if (name === 'style') {
            const css = cleanStylesheet(node.textContent || '');
            return css ? `<style>${escapeXml(css)}</style>` : '';
        }
        const tag = TAGS.get(name);
        if (!tag) {
            // An inert wrapper such as <a> need not discard the shapes it contains.
            return Array.from(node.childNodes || []).map(child => visit(child, inDefinitions)).join('');
        }
        const definitions = inDefinitions || ['defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'filter'].includes(name);
        if (!definitions && DRAWING_TAGS.has(name)) drawing = true;
        const attributes = [];
        const seenAttributes = new Set();
        let hasHref = false;
        for (const attr of Array.from(node.attributes || [])) {
            const attrName = String(attr.localName || attr.name).toLowerCase();
            if (attr.namespaceURI && !(attr.namespaceURI === XLINK_NS && attrName === 'href')) continue;
            if (attrName === 'href') {
                const link = attr.value.trim();
                if (!hasHref && fragment(link) && ['use', 'textpath', 'lineargradient', 'radialgradient', 'pattern'].includes(name)) {
                    attributes.push(`href="${escapeXml(link)}"`, `xlink:href="${escapeXml(link)}"`);
                    hasHref = true;
                }
                continue;
            }
            if (attrName === 'style') {
                const style = cleanStyle(attr.value);
                if (style && !seenAttributes.has('style')) { attributes.push(`style="${escapeXml(style)}"`); seenAttributes.add('style'); }
                continue;
            }
            const canonical = ATTRIBUTES.get(attrName);
            if (!canonical || seenAttributes.has(canonical) || (top && ['width', 'height', 'viewbox'].includes(attrName))) continue;
            const clean = staticValue(attr.value);
            if (clean) { attributes.push(`${canonical}="${escapeXml(clean)}"`); seenAttributes.add(canonical); }
        }
        if (top) {
            const box = viewBox(node);
            attributes.unshift(`xmlns="${SVG_NS}"`, `xmlns:xlink="${XLINK_NS}"`, `viewBox="${box.join(' ')}"`, `width="${box[2]}"`, `height="${box[3]}"`);
        }
        return `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${Array.from(node.childNodes || []).map(child => visit(child, definitions)).join('')}</${tag}>`;
    }
    const result = visit(root, false, true);
    return drawing ? result : '';
}

export function normalize(value) {
    try {
        if (!value || (typeof value !== 'object' && typeof value !== 'string') || Array.isArray(value)) return null;
        const svg = sanitizeSvg(typeof value === 'string' ? value : ownText(value, 'svg'));
        if (!svg) return null;
        return {
            version: VERSION,
            characterName: typeof value === 'string' ? '' : text(ownText(value, 'characterName')),
            summary: typeof value === 'string' ? '' : text(ownText(value, 'summary')),
            svg,
        };
    } catch { return null; }
}

export function svgSource(value) { return normalize(value)?.svg || ''; }

export function render(value, { label = '' } = {}) {
    try {
        const design = normalize(value);
        if (!design) return '';
        const description = typeof label === 'string' && label.trim() ? label.trim() : design.summary || (design.characterName ? `${design.characterName}的来信小画` : '来信小画');
        // Image documents are inert: SVG IDs/CSS cannot collide with the host or another letter.
        return `<img class="rmt-letter-illustration" data-rmt-letter-illustration-version="3" src="data:image/svg+xml;charset=utf-8,${escapeXml(encodeURIComponent(design.svg))}" alt="${escapeXml(description)}" style="display:block;width:100%;max-width:420px;height:auto;margin:0 auto" decoding="async">`;
    } catch { return ''; }
}
