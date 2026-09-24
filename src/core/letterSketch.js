// All geometry is local. Only normalized, evidenced v2 facts reach this painter.
// Neutral graphite marks stand in for unspecified colours; no new anatomy,
// accessories, animals, or character traits are inferred from a name.
const colours = { black:'#403b46', brown:'#785542', blonde:'#d7b96d', red:'#ad5361', white:'#f9f6ef', gray:'#9a98aa', blue:'#728eae', pink:'#d894ae', purple:'#9a83b2', green:'#7c9b86', amber:'#bf9653', cream:'#e9dcca', navy:'#536278' };
const ink = '#625565', skin = '#fff0e0';
const outline = `stroke="${ink}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
const line = `${outline} fill="none"`;
const get = (design, kind) => design.visualFacts.find(row => row.kind === kind)?.value || '';
const colour = (value, fallback) => colours[value] || fallback;

export function sketchBackdrop(kind, tone = '#d4b4ce') {
    const outside = ['walk','flower','rain'].includes(kind);
    const light = `<ellipse cx="172" cy="153" rx="133" ry="115" fill="${tone}" opacity=".15"/><ellipse cx="172" cy="159" rx="118" ry="108" fill="${tone}" opacity=".09"/>`;
    const frame = ['window','rain','lamp'].includes(kind)
        ? `<g ${line} opacity=".34"><path d="M225 63q24-25 48 0v101h-48z" fill="#e4eef4"/><path d="M249 50v112m-24-54h48"/><path d="M219 166h60"/></g>` : '';
    const rain = kind === 'rain' ? `<g stroke="#8aa7bf" stroke-width="2" opacity=".5"><path d="m230 84 3-7m8 19 3-7m9-13 3-7m-24 63 3-7m26 12 3-7m-16-8 3-7"/></g>` : '';
    const ground = `<path d="M45 244q125 22 252-1" fill="none" stroke="${tone}" stroke-width="3" opacity=".55"/>`;
    const botanical = outside ? `<g ${line} opacity=".55"><path d="M51 230q-8-27 4-57m-1 25q-16-20-20-10q0 12 20 13m-3 14q20-24 23-11q-1 10-23 14M281 236q12-20 8-36"/><path d="M57 178q-15-9-11-18q11-5 15 13q-1-18 10-16q9 9-14 21" fill="#b9cfb2"/></g>` : '';
    return `<g data-rmt-letter-background="${kind}">${light}${frame}${rain}${ground}${botanical}</g>`;
}

export function sketchPerson(design) {
    const length=get(design,'hairLength'), style=get(design,'hairStyle'), hair=get(design,'hairColor');
    const clothing=get(design,'outfitKind'), clothingColour=get(design,'outfitColor'), eye=get(design,'eyeColor');
    const hairFill=colour(hair,'#b8aca4'), dress=colour(clothingColour,'#e6dfd4');
    const kind=design.scene.kind, markers=design.visualFacts.filter(row=>row.kind==='marker').map(row=>row.value);
    const seated=['read','write','tea','photo','music','cook'].includes(kind);
    const turn=kind==='write'?-7:kind==='flower'?7:kind==='window'?5:0;
    const hairBottom=length==='long'?172:length==='medium'?131:91;
    const hairKnown=!!(length||style||hair);
    const tail=style==='ponytail'?`<path d="M186 58q61 5 29 70q-14 27 9 32q-37 12-33-31q7-33-5-53" fill="${hairFill}" ${outline}/>`:'';
    const braid=style==='braid'?`<path d="M193 85q18 20 2 33q-14 12 1 22q15 11-1 24q-8 8 0 16" fill="none" stroke="${hairFill}" stroke-width="15"/><path d="M192 105l12 13m-16 11 14 11m-14 10 13 13" ${line}/>`:'';
    const bun=style==='bun'?`<ellipse cx="137" cy="34" rx="21" ry="18" fill="${hairFill}" ${outline}/><path d="M123 35q8-15 21-4" stroke="#fff" fill="none" opacity=".25" stroke-width="3"/>`:'';
    const texture=['curly','wavy'].includes(style)?`<path d="M105 95q-11 13 0 23q11 12-2 23M197 93q12 14 1 25q-9 12 4 22" ${line}/>`:'';
    const back=hairKnown?`<g data-rmt-letter-hair="${length||'specified'}:${style||'unspecified'}:${hair||'unspecified'}">${tail}${braid}${bun}<path d="M105 83q-2-48 45-48q49-2 50 49v${Math.max(12,hairBottom-83)}q-16 18-30 4q-20 19-43 4q-18 12-26-5z" fill="${hairFill}" ${outline}/>${texture}</g>`:'';
    const feet=seated?`<path d="M131 219q-21 3-27 15q11 10 34 1l18-13m10-2q7 17 27 18q18 0 10-11l-23-14" fill="${hairFill}" ${outline}/>`:`<path d="m135 218-4 23q-14 2-13 10h26l5-30m17-1 8 21q14 3 12 10h-25l-9-29" fill="${hairFill}" ${outline}/>`;
    const robe=['robe','dress','coat','ruqun'].includes(clothing);
    const body=`<path data-rmt-letter-outfit="${clothing||'unspecified'}:${clothingColour||'unspecified'}" d="M125 134q25-14 49 0l${robe?'25 91q-45 10-93 0':'13 85q-35 12-75 0'}z" fill="${dress}" ${outline}/>`;
    const details=clothing==='robe'?`<path d="m128 135 32 28 14-26m-40 51h48m-21-25-21 59" ${line}/><path d="m131 192 50-1" stroke="${ink}" stroke-width="5"/>`
        : clothing==='hoodie'?`<path d="M125 137q25 31 50 0m-44 57q20-12 40 0v12h-40zM143 148v20m13-20v20" ${line}/>`
        : ['suit','coat','jacket'].includes(clothing)?`<path d="m125 138 25 32 25-32m-45 6-6 20 26 6 25-6-6-20m-19 26v48" ${line}/>`
        : clothing==='uniform'?`<path d="m124 138 26 17 27-17m-40 8 13 11 14-11m-14 12v52" ${line}/><path d="m147 155-5 18 9 6 8-6-6-18" fill="${ink}" opacity=".65"/>`
        : clothing==='martial'?`<path d="m130 136 20 18 20-18m-40 44h40" ${line}/><path d="m129 179h42" stroke="${ink}" stroke-width="5"/>`
        : clothing==='ruqun'?`<path d="m128 150h44" stroke="${ink}" stroke-width="4"/><path d="M138 162l-7 58m19-58v60m12-60 7 58" ${line} opacity=".45"/>`
        : clothing==='sweater'?`<g ${line} opacity=".35"><path d="M124 159h52m-54 13h57m-59 13h61m-61 14h63"/></g>`
        : ''; // 角色卡没有写明衣服时不画领口和门襟，避免每封信都是同一件外套
    const arms=kind==='walk'?`<path d="m125 143-16 26-10 24m76-50 11 19 19-13" stroke="${dress}" stroke-width="17" fill="none" stroke-linecap="round"/><path d="m102 190-5 8m106-51 8-5" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>`
        : ['flower','gift'].includes(kind)?`<path d="m124 144-8 31 24 5m34-36 12 27-26 12" stroke="${dress}" stroke-width="17" fill="none" stroke-linecap="round"/><path d="m139 180 13 2m9 1-11 2" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>`
        : kind==='window'?`<path d="m124 144-5 40 20 5m36-45 16 11 5-37" stroke="${dress}" stroke-width="17" fill="none" stroke-linecap="round"/><path d="m195 120 1-11m-57 79 8 0" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>`
        : `<path d="m124 144-15 34 32 14m34-47 14 32-26 14" stroke="${dress}" stroke-width="17" fill="none" stroke-linecap="round"/><path d="m139 190 10 4m13-3-10 3" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>`;
    const face=`<path data-rmt-letter-face-opening="true" d="M110 79q0-35 40-35q41 0 41 35v20q-3 34-41 35q-37-2-40-35z" fill="${skin}" ${outline}/>`;
    const fringe=hairKnown?`<path data-rmt-letter-hair-fringe="true" d="M106 84q-8-49 45-49q47 0 48 47q-23-7-31-22q-14 21-39 27l6-12-26 14z" fill="${hairFill}" ${outline}/><path d="M123 53q14-12 29-8m10-1 15 11" stroke="#fff" stroke-width="4" opacity=".2" fill="none" stroke-linecap="round"/>`:'';
    const eyeFill=colour(eye,ink);
    const happy=['gift','flower','tea','walk'].includes(kind);
    const eyes=happy?`<g data-rmt-letter-eyes="${eye||'unspecified'}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" fill="none"><path d="M123 97q7-10 14 0m26 0q7-10 14 0"/></g>`:`<g data-rmt-letter-eyes="${eye||'unspecified'}"><path d="M122 95q8-7 17 0m22 0q8-7 17 0" ${line}/><ellipse cx="131" cy="100" rx="5.2" ry="7.5" fill="${eyeFill}"/><ellipse cx="169" cy="100" rx="5.2" ry="7.5" fill="${eyeFill}"/><g fill="#fffaf6"><circle cx="129" cy="97" r="2"/><circle cx="167" cy="97" r="2"/></g></g>`;
    const expression=`<g data-rmt-letter-expression="${happy?'smile':'attentive'}"><ellipse cx="120" cy="111" rx="9" ry="4" fill="#eab5b5" opacity=".56"/><ellipse cx="181" cy="111" rx="9" ry="4" fill="#eab5b5" opacity=".56"/><path d="M143 117q7 ${happy?'8':'5'} 14 0" ${line}/><path d="m150 106-2 4h3" ${line} opacity=".4"/></g>`;
    // 斗篷和背负的剑属于身后一层：先画，再由身体和手臂盖住，只露出两侧、剑柄与剑尖。
    const behind=[
        markers.includes('cloak')?`<g data-rmt-letter-marker="cloak" ${line}><path d="M121 136q-24 42-30 94h22M179 136q24 42 30 94h-22" fill="#aeb9cb" opacity=".9"/></g>`:'',
        markers.includes('sword')?`<g data-rmt-letter-marker="sword"><path d="M196 110l-78 112" stroke="#9aa3b2" stroke-width="5" stroke-linecap="round"/><path d="M186 116l17 11" stroke="#b39153" stroke-width="4" stroke-linecap="round"/><path d="M204 98l-8 14" stroke="#5b4636" stroke-width="5" stroke-linecap="round"/><circle cx="206" cy="95" r="3.2" fill="#b39153"/></g>`:'',
    ].join('');
    const marker=markers.map(value=>{
        const body={glasses:`<rect x="117" y="89" width="26" height="21" rx="8"/><rect x="157" y="89" width="26" height="21" rx="8"/><path d="M143 97h14"/>`,freckles:`<path d="m119 110 1 0m6 4 1 0m-7 2 1 0m52-6 1 0m6 4 1 0m-7 2 1 0"/>`,scar:`<path d="m174 89-10 20m5-13 6 2m-9 5 6 2"/>`,earrings:`<circle cx="109" cy="113" r="4"/><circle cx="192" cy="113" r="4"/>`,ribbon:`<path d="M184 51q-25-22-26-3q11 13 26 8q10 15 24 5q8-19-24-10z" fill="#c98d9f"/>`,hat:`<path d="M100 65q49-14 102 1l-13-7-10-25h-54l-12 26z" fill="#b8cbb4"/>`,scarf:`<path d="M124 131q27 12 51-1l2 17q-23 13-54 0zM165 145l7 42 14-6-9-39" fill="#ca98a6"/>`,crown:`<path d="M138 40h24l-3-13h-18z" fill="#d8c27c"/><path d="M132 37h36M150 27v-5"/>`,hairpin:`<path d="M176 52l24-18" stroke-width="3"/><circle cx="202" cy="32" r="4" fill="#c98d9f"/>`,jade:`<path d="M160 188v18"/><circle cx="160" cy="212" r="6" fill="#a9cdb2"/><path d="M157 220l-2 9m5-9v9m3-9 2 9"/>`,fan:`<path d="M101 188l-15-22q17-11 33 0z" fill="#efe3c6"/><path d="M101 188l-8-20m8 20v-22m0 22 8-20"/>`}[value];
        return body?`<g data-rmt-letter-marker="${value}" ${line}>${body}</g>`:'';
    }).join('');
    return `<g data-rmt-letter-person="true" data-rmt-letter-pose="${kind}" transform="rotate(${turn} 150 170)">${behind}${feet}${body}${details}${back}${face}${fringe}${eyes}${expression}${arms}${marker}</g>`;
}
