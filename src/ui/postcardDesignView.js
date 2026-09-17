// Pure SVG composition renderer. All tags, paths, classes and colours are local code.
// The optional design only chooses validated motifs and bounded layout parameters.
import * as design_contract from '../modes/postcardDesign.js';
import * as core_text from '../core/text.js';
const WIDTH = 120, HEIGHT = 86;
const LAYERS = Object.freeze({ far: { base: 46, scale: .62 }, mid: { base: 58, scale: .86 }, near: { base: 72, scale: 1.12 } });
const SIZES = Object.freeze({ s: .65, m: 1, l: 1.4 });
const SPREAD = Object.freeze({ sparse: 1.45, balanced: 1, dense: .68 });
const HALF_WIDTH = Object.freeze({ peak:23,hill:24,shore:0,water:0,field:0,tree:10,grove:12,reed:3,flower:4,leaf:6,pavilion:14,cabin:14,tower:8,bridge:29,gate:17,wall:25,boat:14,orb:11,cloud:10,bird:4,rain:2,snow:2,star:2,lantern:8 });
const SKY_KINDS = Object.freeze(['orb', 'cloud', 'bird', 'rain', 'snow', 'star']);
const SURFACE_KINDS = Object.freeze(['water', 'shore', 'field']);
const n = value => Number(value.toFixed(3));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function shapeNodes(item, scene) {
    const x = item.px, y = item.py, s = item.scale, kind = item.kind;
    const X = value => n(x + value * s), Y = value => n(y + value * s), S = value => n(value * s);
    const out = [];
    const path = (cls, d) => out.push(`<path class="${cls}" data-pd-kind="${kind}" d="${d}"/>`);
    const rect = (cls, xx, yy, w, h) => out.push(`<rect class="${cls}" data-pd-kind="${kind}" x="${X(xx)}" y="${Y(yy)}" width="${S(w)}" height="${S(h)}"/>`);
    const circle = (cls, xx, yy, r) => out.push(`<circle class="${cls}" data-pd-kind="${kind}" cx="${X(xx)}" cy="${Y(yy)}" r="${S(r)}"/>`);
    const ellipse = (cls, xx, yy, rx, ry) => out.push(`<ellipse class="${cls}" data-pd-kind="${kind}" cx="${X(xx)}" cy="${Y(yy)}" rx="${S(rx)}" ry="${S(ry)}"/>`);
    const tree = broad => {
        path('pd-solid', broad ? `M${X(-10)} ${Y(-1)} Q${X(-12)} ${Y(-17)} ${X(-2)} ${Y(-19)} Q${X(9)} ${Y(-20)} ${X(10)} ${Y(-1)}Z`
            : `M${X(-9)} ${Y(-1)} L${X(-4)} ${Y(-10)} L${X(-6)} ${Y(-10)} L${X(0)} ${Y(-22)} L${X(6)} ${Y(-10)} L${X(4)} ${Y(-10)} L${X(9)} ${Y(-1)}Z`);
        rect('pd-solid', -1, -2, 2, 5);
    };
    switch (kind) {
    case 'peak':
        path('pd-solid', `M${X(-23)} ${Y(1)} L${X(-14)} ${Y(-9)} L${X(-7)} ${Y(-25)} L${X(-1)} ${Y(-22)} L${X(5)} ${Y(-14)} L${X(10)} ${Y(-17)} L${X(23)} ${Y(1)}Z`);
        path(scene.sky === 'snow' ? 'pd-snow' : 'pd-soft', `M${X(-12)} ${Y(-14)} L${X(-7)} ${Y(-25)} L${X(-1)} ${Y(-22)} L${X(5)} ${Y(-14)} L${X(-3)} ${Y(-17)} L${X(-6)} ${Y(-16)}Z`);
        break;
    case 'hill': path('pd-soft', `M${X(-24)} ${Y(2)} Q${X(-9)} ${Y(-24)} ${X(8)} ${Y(-11)} Q${X(18)} ${Y(-7)} ${X(24)} ${Y(2)}Z`); break;
    case 'water': {
        const w = item.surface;
        path('pd-water', `M${n(w.left)} ${n(w.top)} Q${n(x)} ${n(w.top-1)} ${n(w.right)} ${n(w.top)} L${n(w.right)} ${n(w.bottom)} L${n(w.left)} ${n(w.bottom)}Z`);
        for (let i=0; i<8; i+=1) {
            const yy=w.top+2+(w.bottom-w.top-4)*(Math.floor(i/2)/3), length=(w.right-w.left)*.28;
            const xx=w.left+(w.right-w.left)*(.08+(i%2)*.5);
            path('pd-ripple', `M${n(xx)} ${n(yy)} q${n(length/4)} -1 ${n(length/2)} 0 t${n(length/2)} 0`);
        }
        break;
    }
    case 'shore': {
        const w=item.surface;
        path('pd-water', `M${n(w.left)} ${n(w.top)} L${n(w.right)} ${n(w.top)} L${n(w.right)} ${n(w.bottom)} L${n(w.left)} ${n(w.bottom)}Z`);
        path('pd-soft', `M${n(w.left)} ${n(w.top-1)} Q${n(x)} ${n(w.top+5)} ${n(w.right)} ${n(w.top)} L${n(w.right)} ${n(w.top+3)} Q${n(x)} ${n(w.top+8)} ${n(w.left)} ${n(w.top+2)}Z`);
        break;
    }
    case 'field':
        path(scene.sky === 'snow' ? 'pd-snowfield' : 'pd-soft', `M${n(item.left)} ${Y(0)} Q${X(-9)} ${Y(-4)} ${X(0)} ${Y(-1)} T${n(item.right)} ${Y(0)} L${n(item.right)} 86 L${n(item.left)} 86Z`);
        break;
    case 'tree': tree(false); break;
    case 'grove': tree(true); break;
    case 'reed': path('pd-line', `M${X(0)} ${Y(2)} Q${X(2)} ${Y(-10)} ${X(1)} ${Y(-17)}`); ellipse('pd-solid', 1, -18, 1.2, 3.5); break;
    case 'flower':
        path('pd-line', `M${X(0)} ${Y(2)} L${X(0)} ${Y(-9)}`);
        for(let i=0;i<5;i+=1) circle('pd-bloom',Math.cos(i*Math.PI*2/5)*2.3,-9+Math.sin(i*Math.PI*2/5)*2.3,1.7);
        break;
    case 'leaf': path('pd-bloom', `M${X(-5)} ${Y(0)} Q${X(0)} ${Y(-6)} ${X(6)} ${Y(-1)} Q${X(1)} ${Y(4)} ${X(-5)} ${Y(0)}Z`); break;
    case 'pavilion':
        path('pd-soft', `M${X(-14)} ${Y(0)} H${X(14)} L${X(12)} ${Y(3)} H${X(-12)}Z`);
        path('pd-solid', `M${X(-14)} ${Y(-13)} Q${X(-3)} ${Y(-17)} ${X(0)} ${Y(-22)} Q${X(4)} ${Y(-17)} ${X(14)} ${Y(-13)}Z`);
        rect('pd-solid',-10,-13,20,2);rect('pd-solid',-9,-12,1.8,12);rect('pd-solid',7.2,-12,1.8,12);break;
    case 'cabin': rect('pd-solid',-11,-12,22,13);path('pd-solid',`M${X(-14)} ${Y(-12)} L${X(0)} ${Y(-22)} L${X(14)} ${Y(-12)}Z`);rect('pd-window',-2.5,-8,5,6);break;
    case 'tower':
        path('pd-soft',`M${X(-8)} ${Y(0)} H${X(8)} L${X(6)} ${Y(3)} H${X(-6)}Z`);rect('pd-solid',-4,-28,8,28);
        path('pd-solid',`M${X(-7)} ${Y(-28)} L${X(0)} ${Y(-34)} L${X(7)} ${Y(-28)}Z`);rect('pd-window',-1.5,-19,3,4);break;
    case 'bridge':
        path('pd-solid',`M${X(-20)} ${Y(-1)} Q${X(0)} ${Y(-15)} ${X(20)} ${Y(-1)} V${Y(2)} Q${X(0)} ${Y(-11)} ${X(-20)} ${Y(2)}Z`);
        path('pd-line',`M${X(-20)} ${Y(-4)} Q${X(0)} ${Y(-18)} ${X(20)} ${Y(-4)}`);
        rect('pd-solid',-11,-8,2,15);rect('pd-solid',9,-8,2,15);
        path('pd-soft',`M${X(-29)} ${Y(6)} L${X(-18)} ${Y(1)} V${Y(6)}Z`);path('pd-soft',`M${X(29)} ${Y(6)} L${X(18)} ${Y(1)} V${Y(6)}Z`);break;
    case 'gate':
        rect('pd-solid',-12,-19,3,20);rect('pd-solid',9,-19,3,20);rect('pd-solid',-14,-20,28,3);
        path('pd-solid',`M${X(-17)} ${Y(-20)} L${X(0)} ${Y(-27)} L${X(17)} ${Y(-20)}Z`);break;
    case 'wall': rect('pd-soft',-25,-8,50,9);for(let i=0;i<4;i+=1)rect('pd-solid',-25+i*14,-10,7,3);break;
    case 'boat':
        path('pd-hull',`M${X(-11)} ${Y(0)} Q${X(0)} ${Y(9)} ${X(11)} ${Y(0)}Z`);
        path('pd-ripple',`M${X(-14)} ${Y(4)} q${S(7)} -1 ${S(14)} 0 t${S(14)} 0`);
        rect('pd-hull',-.7,-17,1.4,17);path('pd-soft',`M${X(1)} ${Y(-17)} L${X(9)} ${Y(-2)} H${X(1)}Z`);break;
    case 'orb':
        if(scene.light==='night')path('pd-orb',`M${X(2)} ${Y(-9)} C${X(-11)} ${Y(-10)} ${X(-11)} ${Y(10)} ${X(2)} ${Y(9)} C${X(-5)} ${Y(6)} ${X(-5)} ${Y(-6)} ${X(2)} ${Y(-9)}Z`);
        else circle('pd-orb',0,0,7);break;
    case 'cloud': ellipse('pd-cloud',0,0,10,3.4);ellipse('pd-cloud',3,-2,5.6,3.6);break;
    case 'bird':path('pd-line',`M${X(-4)} ${Y(0)} q${S(2)} ${S(-3)} ${S(4)} 0 q${S(2)} ${S(-3)} ${S(4)} 0`);break;
    case 'rain':path('pd-ripple',`M${X(1)} ${Y(-4)} l${S(-2)} ${S(8)}`);break;
    case 'snow':circle('pd-snow',0,0,1.4);break;
    case 'star':path('pd-star',`M${X(0)} ${Y(-2)} L${X(.6)} ${Y(-.6)} L${X(2)} ${Y(0)} L${X(.6)} ${Y(.6)} L${X(0)} ${Y(2)} L${X(-.6)} ${Y(.6)} L${X(-2)} ${Y(0)} L${X(-.6)} ${Y(-.6)}Z`);break;
    case 'lantern':path('pd-line',`M${X(0)} ${Y(1)} V${Y(-18)} h${S(5)} v${S(3)}`);ellipse('pd-glow',5,-12,3,4);break;
    default: return [];
    }
    return out;
}
function makeScene(design) {
    const instances=[];
    for (const element of design.elements) {
        const level=LAYERS[element.layer], scale=level.scale*SIZES[element.size];
        const margin=Math.min(48,HALF_WIDTH[element.kind]*scale+1);
        const step=Math.min(12*SPREAD[design.density]*Math.min(1,scale),(WIDTH-2*margin)/Math.max(1,element.count-1));
        const halfSpan=step*(element.count-1)/2;
        const center=clamp(element.x*1.2,margin+halfSpan,WIDTH-margin-halfSpan);
        for(let i=0;i<element.count;i+=1) {
            // Whole motif bounds stay in the canvas; do not crop a valid motif mid-render.
            const px=center+(i-(element.count-1)/2)*step;
            const py=SKY_KINDS.includes(element.kind)?({far:13,mid:24,near:33}[element.layer])+((i%3)-1)*2:level.base;
            const span=({s:32,m:65,l:114}[element.size])*Math.max(.65,level.scale);
            const left=clamp(px-span/2,0,WIDTH),right=clamp(px+span/2,0,WIDTH);
            const item={...element,px,py,scale,left,right,ordinal:instances.length};
            if(['water','shore'].includes(item.kind)) item.surface={left,right,top:py-2,bottom:HEIGHT};
            instances.push(item);
        }
    }
    const surfaces=instances.filter(item=>item.surface);
    for(const item of instances) {
        if(!['boat','bridge'].includes(item.kind)) continue;
        const eligible=surfaces.filter(w=>design_contract.DESIGN_LAYERS.indexOf(w.layer)<=design_contract.DESIGN_LAYERS.indexOf(item.layer));
        eligible.sort((a,b)=>Math.abs(a.px-item.px)-Math.abs(b.px-item.px)||b.py-a.py||a.ordinal-b.ordinal);
        const w=eligible[0]?.surface;
        if(w) {
            // Keep the complete hull on the declared water, including its ripple.
            if(item.kind==='boat') {
                item.scale=Math.min(item.scale,(w.right-w.left)/30);
                item.px=clamp(item.px,w.left+14*item.scale,w.right-14*item.scale);
                item.py=clamp(w.top+5+(item.layer==='near'?6:0),w.top+2,HEIGHT-7*item.scale);
            } else item.py=w.top+1;
        }
    }
    instances.sort((a,b)=>design_contract.DESIGN_LAYERS.indexOf(a.layer)-design_contract.DESIGN_LAYERS.indexOf(b.layer)
        || Number(!SURFACE_KINDS.includes(a.kind))-Number(!SURFACE_KINDS.includes(b.kind)) || a.ordinal-b.ordinal);
    return instances;
}
export function renderPostcardDesign(value, label = '') {
    const design=design_contract.normalizePostcardDesign(value);
    if(!design) return '';
    const parts=[];
    for(const item of makeScene(design)) {
        const nodes=shapeNodes(item,design);
        // A renderer/contract mismatch fails as a whole, not a partial illustration.
        if(nodes.length!==design_contract.ELEMENT_NODE_COST[item.kind]) return '';
        parts.push(...nodes);
    }
    if(parts.length+design_contract.DESIGN_BASE_NODES!==design_contract.postcardDesignNodeCount(design)
        || parts.length+design_contract.DESIGN_BASE_NODES>design_contract.MAX_DESIGN_NODES) return '';
    const ground=design.sky==='snow'?'pd-snowfield':'pd-soft';
    // Two fixed colour planes provide support, not extra invented scenery.
    return `<svg class="rmt-postcard-design-scene" data-rmt-design-version="1" data-rmt-design-palette="${design.palette}" data-rmt-design-sky="${design.sky}" data-rmt-design-light="${design.light}" viewBox="0 0 120 86" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${core_text.esc(core_text.normalizeText(label,160)||'明信片插画')}"><rect class="pd-sky" width="120" height="86"/><path class="${ground}" d="M0 44 Q30 42 60 44 T120 44 V86 H0Z"/>${parts.join('')}</svg>`;
}
export function renderPostcardDesignFallback() {
    return '<svg class="rmt-postcard-design-scene" data-rmt-design-state="fallback" data-rmt-design-palette="paper" viewBox="0 0 120 50" role="img" aria-label="简洁信纸"><rect class="pd-sky" width="120" height="50"/><path class="pd-line" d="M18 20H102M18 28H83M18 36H95"/></svg>';
}

// The actual runtime calls this from styles.js; previews use that same runtime style.
export function postcardDesignCss(root) {
    return `
${root} .rmt-designed-postcard .rmt-travel-postcard-face,${root} .rmt-designed-postcard .rmt-travel-artifact-figure{height:auto;min-height:0;aspect-ratio:auto}
${root} .rmt-designed-postcard figure>.rmt-postcard-design-scene{display:block;width:100%;height:auto;aspect-ratio:120/86;max-height:none;overflow:hidden}
${root} .rmt-designed-postcard figure>figcaption{position:static;inset:auto;display:grid;gap:2px;min-height:0;padding:9px 12px;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;text-shadow:none;box-sizing:border-box;overflow-wrap:anywhere}
${root} .rmt-designed-postcard figure>figcaption :is(small,b){color:inherit!important;-webkit-text-fill-color:currentColor!important;text-shadow:none}
${root} .rmt-designed-postcard :is(.rmt-travel-postcard-copy,.rmt-travel-artifact-copy,.rmt-travel-postcard-address,.rmt-travel-postcard-mark,.rmt-travel-artifact-meta,.rmt-travel-artifact-head){color:var(--pc-ink,#655740)!important;-webkit-text-fill-color:currentColor!important}
${root} .rmt-designed-postcard :is(.rmt-travel-postcard-copy,.rmt-travel-artifact-copy,.rmt-travel-postcard-address) :is(p,h3,b,footer,small){color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1;text-shadow:none}
${root} .rmt-designed-postcard.tone-rose{--pc-ink:#764656}
${root} .rmt-designed-postcard.tone-night{background-color:#293845!important;color:#edf2ed!important;--pc-ink:#edf2ed}
${root} .rmt-designed-postcard .rmt-postcard-design-scene{--pc-sky-b:#f5efe2;--pc-solid:#88785f;--pc-ground:#d4c8aa;--pc-orb:#ffe4a2;--pc-glow:#bb9461;--pc-sea:#b6c8c6;--pc-ink:#655740}
${root} .rmt-postcard-design-scene[data-rmt-design-palette=rose]{--pc-sky-b:#fdeee3;--pc-solid:#9f697d;--pc-ground:#ead0d8;--pc-orb:#ffe9b9;--pc-glow:#c9809d;--pc-sea:#bfd5da;--pc-ink:#75475b}
${root} .rmt-postcard-design-scene[data-rmt-design-palette=ocean]{--pc-sky-b:#eaf7f6;--pc-solid:#4d7986;--pc-ground:#b3d3d5;--pc-orb:#ffeec2;--pc-glow:#518da1;--pc-sea:#8fc9d8;--pc-ink:#3f6a73}
${root} .rmt-postcard-design-scene[data-rmt-design-palette=forest]{--pc-sky-b:#f2f6e6;--pc-solid:#5f7c5c;--pc-ground:#bcd0ac;--pc-orb:#f6e8b0;--pc-glow:#79a559;--pc-sea:#a9c9b4;--pc-ink:#4a6149}
${root} .rmt-postcard-design-scene[data-rmt-design-palette=sunset]{--pc-sky-b:#fdeddc;--pc-solid:#8f6a5c;--pc-ground:#dfbb98;--pc-orb:#ff9f6e;--pc-glow:#be7c55;--pc-sea:#bdd1d1;--pc-ink:#79564a}
${root} .rmt-postcard-design-scene[data-rmt-design-palette=night]{--pc-sky-b:#1e2c3c;--pc-solid:#c0ced9;--pc-ground:#324858;--pc-orb:#e8eeda;--pc-glow:#9fd6e6;--pc-sea:#2b4353;--pc-ink:#cfdae0}
${root} .rmt-postcard-design-scene .pd-sky{fill:var(--pc-sky-b)}
${root} .rmt-postcard-design-scene .pd-solid{fill:var(--pc-solid)}
${root} .rmt-postcard-design-scene .pd-soft{fill:var(--pc-ground)}
${root} .rmt-postcard-design-scene .pd-water{fill:var(--pc-sea)}
${root} .rmt-postcard-design-scene :is(.pd-line,.pd-ripple){fill:none;stroke:var(--pc-ink);stroke-width:.55;stroke-linecap:round;stroke-linejoin:round}
${root} .rmt-postcard-design-scene .pd-ripple{stroke:var(--pc-ink);opacity:.8}
${root} .rmt-postcard-design-scene .pd-hull{fill:var(--pc-ink)}
${root} .rmt-postcard-design-scene .pd-snow{fill:#fff}
${root} .rmt-postcard-design-scene .pd-snowfield{fill:#edf3f7}
${root} .rmt-postcard-design-scene :is(.pd-star,.pd-orb){fill:var(--pc-orb)}
${root} .rmt-postcard-design-scene .pd-glow{fill:var(--pc-glow)}
${root} .rmt-postcard-design-scene .pd-cloud{fill:#fff;opacity:.6}
${root} .rmt-postcard-design-scene .pd-bloom{fill:var(--pc-glow)}
${root} .rmt-postcard-design-scene .pd-window{fill:var(--pc-orb)}
`;
}
