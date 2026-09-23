// Evidence-gated, local-only letter art. The model selects bounded facts and quotes
// their source; it never supplies markup, geometry, colours, URLs, or executable code.
export const VERSION = 2;
export const MAX_FACTS = 6;
export const MAX_BYTES = 4096;

const FOCUS = Object.freeze(['person', 'object']);
const SCENES = Object.freeze(['read', 'tea', 'rain', 'photo', 'music', 'flower', 'gift', 'window', 'lamp', 'cook', 'walk', 'write']);
const FACT_VALUES = Object.freeze({
    hairLength: ['short', 'medium', 'long'],
    hairStyle: ['straight', 'wavy', 'curly', 'ponytail', 'braid', 'bun'],
    hairColor: ['black', 'brown', 'blonde', 'red', 'white', 'gray', 'blue', 'pink', 'purple', 'green'],
    eyeColor: ['black', 'brown', 'blue', 'green', 'gray', 'amber', 'purple', 'red'],
    outfitKind: ['shirt', 'sweater', 'hoodie', 'jacket', 'coat', 'dress', 'suit', 'uniform', 'robe'],
    outfitColor: ['black', 'brown', 'white', 'gray', 'red', 'blue', 'green', 'pink', 'purple', 'cream', 'navy'],
    marker: ['glasses', 'freckles', 'scar', 'earrings', 'ribbon', 'hat', 'scarf'],
    signatureObject: ['book', 'cup', 'camera', 'umbrella', 'flower', 'instrument', 'letter', 'lamp'],
});
const APPEARANCE_KINDS = new Set(['hairLength', 'hairStyle', 'hairColor', 'eyeColor', 'outfitKind', 'outfitColor', 'marker']);

export const CONTRACT = '可选 letterIllustration，只能使用 v2：{"version":2,"characterName":"本信人物真名","focus":"person或object","visualFacts":[{"kind":"hairLength|hairStyle|hairColor|eyeColor|outfitKind|outfitColor|marker|signatureObject","value":"下列对应枚举值","evidence":"逐字摘录当前char原文"}],"scene":{"kind":"read|tea|rain|photo|music|flower|gift|window|lamp|cook|walk|write","evidence":"逐字摘录本封信正文"}}。value 枚举：hairLength=short|medium|long；hairStyle=straight|wavy|curly|ponytail|braid|bun；hairColor=black|brown|blonde|red|white|gray|blue|pink|purple|green；eyeColor=black|brown|blue|green|gray|amber|purple|red；outfitKind=shirt|sweater|hoodie|jacket|coat|dress|suit|uniform|robe；outfitColor=black|brown|white|gray|red|blue|green|pink|purple|cream|navy；marker=glasses|freckles|scar|earrings|ribbon|hat|scarf；signatureObject=book|cup|camera|umbrella|flower|instrument|letter|lamp。focus=person 时至少给一项有原文依据的外貌、衣着或标志特征；focus=object 时只能画char原文明确拥有或使用的 signatureObject。每项 evidence 必须直接支持对应值；本信没有可画场景，或char没有相应明确依据时，省略 letterIllustration。不得默认动物、宠物或通用人物，不得输出 version 1、HTML、SVG、CSS、URL、颜色、坐标或任何代码。';

const VALUE_TOKENS = Object.freeze({
    hairLength: {
        short: ['短发', '短髮', 'ショートヘア', 'short hair'], medium: ['中长发', '中長髮', '及肩', '肩まで', 'medium hair', 'shoulder-length'],
        long: ['长发', '長髮', '长髮', 'ロングヘア', '長い髪', 'long hair', 'waist-length'],
    },
    hairStyle: {
        straight: ['直发', '直髮', 'ストレートヘア', 'straight hair'], wavy: ['波浪发', '波浪髮', 'ウェーブヘア', 'wavy hair'],
        curly: ['卷发', '捲髮', '卷髮', '巻き髪', 'curly hair'], ponytail: ['马尾', '馬尾', 'ポニーテール', 'ponytail'],
        braid: ['辫子', '辮子', '编发', '編髮', '三つ編み', 'braid'], bun: ['发髻', '髮髻', '丸子头', 'お団子', 'bun'],
    },
    hairColor: {}, eyeColor: {}, outfitColor: {},
    outfitKind: {
        shirt: ['衬衫', '襯衫', 'シャツ', 'shirt'], sweater: ['毛衣', '针织衫', '針織衫', 'セーター', 'sweater'],
        hoodie: ['卫衣', '連帽衫', 'パーカー', 'hoodie'], jacket: ['夹克', '夾克', 'ジャケット', 'jacket'],
        coat: ['大衣', '外套', 'コート', 'coat'], dress: ['连衣裙', '連衣裙', '洋装', 'ドレス', 'dress'],
        suit: ['西装', '西裝', 'スーツ', 'suit'], uniform: ['制服', '校服', 'ユニフォーム', 'uniform'],
        robe: ['长袍', '長袍', 'ローブ', 'robe'],
    },
    marker: {
        glasses: ['眼镜', '眼鏡', 'メガネ', 'glasses'], freckles: ['雀斑', 'そばかす', 'freckles'], scar: ['伤疤', '傷疤', '疤痕', '傷跡', 'scar'],
        earrings: ['耳环', '耳環', '耳钉', '耳釘', 'ピアス', 'earrings'], ribbon: ['发带', '髮帶', '丝带', '絲帶', 'リボン', 'ribbon'],
        hat: ['帽子', 'ハット', 'hat'], scarf: ['围巾', '圍巾', 'マフラー', 'scarf'],
    },
    signatureObject: {
        book: ['书', '書', '本を', '本が', '本は', '一冊', 'book'], cup: ['杯', 'マグ', 'cup', 'mug'], camera: ['相机', '相機', 'カメラ', 'camera'],
        umbrella: ['伞', '傘', 'umbrella'], flower: ['鲜花', '鮮花', '花朵', '花束', 'flower'], instrument: ['乐器', '樂器', '吉他', '钢琴', '鋼琴', '小提琴', '楽器', 'instrument', 'guitar', 'piano', 'violin'],
        letter: ['信纸', '信紙', '信封', '便笺', '便箋', 'letter'], lamp: ['灯', '燈', 'ランプ', 'lamp'],
    },
});
const COLOR_TOKENS = Object.freeze({
    black: ['黑', '黒', 'black'], brown: ['棕', '褐', '茶色', 'brown'], blonde: ['金色', '金发', '金髮', '金髪', 'blonde', 'blond'],
    red: ['红', '紅', '赤', 'red'], white: ['白', 'white'], gray: ['灰', '银灰', '銀灰', 'グレー', 'gray', 'grey'],
    blue: ['蓝', '藍', '青い', 'blue'], green: ['绿', '綠', '緑', 'green'], pink: ['粉', '桃色', 'pink'],
    purple: ['紫', 'purple'], cream: ['奶油色', '米白', 'クリーム', 'cream'], navy: ['藏青', '海军蓝', '海軍藍', 'ネイビー', 'navy'],
    amber: ['琥珀', 'amber'],
});
const CATEGORY_TOKENS = Object.freeze({
    hairColor: ['发', '髮', '髪', 'hair'], eyeColor: ['眼', '眸', '瞳', 'eye'], outfitColor: ['穿', '着', '著', '衣', '服', '衫', '裙', '袍', '外套', '大衣', '西装', '西裝', '制服', 'wear', 'shirt', 'dress', 'robe', 'coat', 'suit', 'uniform'],
});
const SCENE_TOKENS = Object.freeze({
    read: ['读', '讀', '看书', '看書', '阅读', '閱讀', '読む', 'read', 'book'], tea: ['茶', '咖啡', 'tea', 'coffee'],
    rain: ['雨', '下雨', 'rain'], photo: ['照片', '拍照', '摄影', '攝影', '写真', 'photo', 'camera'],
    music: ['音乐', '音樂', '歌', '演奏', '音乐', '音楽', 'music', 'song', 'play'], flower: ['花', 'flower'],
    gift: ['礼物', '禮物', '赠', '贈', 'プレゼント', 'gift'], window: ['窗', '窓', 'window'], lamp: ['灯', '燈', '明かり', 'lamp', 'light'],
    cook: ['做饭', '做飯', '料理', '烹饪', '烹飪', 'cook'], walk: ['散步', '走走', '漫步', '歩く', 'walk'],
    write: ['写', '寫', '便签', '便簽', '便笺', '便箋', '書く', 'write', 'note'],
});
const OBJECT_SCENES = Object.freeze({ book:['read', 'write'], cup:['tea'], camera:['photo'], umbrella:['rain'], flower:['flower', 'gift'], instrument:['music'], letter:['write', 'gift'], lamp:['lamp'] });

const PALETTE = Object.freeze({ paper: '#fff8e9', ink: '#66584f', accent: '#c96f7d', soft: '#91a995', blue: '#779aad' });
const SAFE_COLOURS = Object.freeze({ black:'#4e4a49', brown:'#765642', blonde:'#d5b46b', red:'#a64f48', white:'#fffaf0', gray:'#96949a', blue:'#617fa6', pink:'#d98fa0', purple:'#826c9d', green:'#64866f', amber:'#b77b3b', cream:'#eadcc2', navy:'#46566f' });

function ownRecord(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) return null;
        const names = Reflect.ownKeys(value);
        if (names.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
        const copy = Object.create(null);
        for (const key of names) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
            copy[key] = descriptor.value;
        }
        return copy;
    } catch { return null; }
}
function plainText(value, max) {
    if (typeof value !== 'string' || /[<>]/u.test(value)) return '';
    const result = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
    return result && result.length <= max ? result : '';
}
function includesToken(text, tokens) {
    const folded = String(text || '').toLocaleLowerCase();
    return tokens.some(token => folded.includes(token.toLocaleLowerCase()));
}
function factSupported(fact) {
    const direct = VALUE_TOKENS[fact.kind]?.[fact.value] || [];
    if (direct.length) return includesToken(fact.evidence, direct);
    if (!['hairColor', 'eyeColor', 'outfitColor'].includes(fact.kind)) return false;
    return includesToken(fact.evidence, COLOR_TOKENS[fact.value] || []) && includesToken(fact.evidence, CATEGORY_TOKENS[fact.kind]);
}
function exactEvidence(source, quote) {
    return !!source && quote.length >= 2 && String(source).normalize('NFKC').includes(quote.normalize('NFKC'));
}

export function normalize(value) {
    try {
        const raw = ownRecord(value, ['version', 'characterName', 'focus', 'visualFacts', 'scene']);
        if (!raw || raw.version !== VERSION || !FOCUS.includes(raw.focus)) return null;
        const characterName = plainText(raw.characterName, 120);
        if (!characterName || !Array.isArray(raw.visualFacts) || Object.getPrototypeOf(raw.visualFacts) !== Array.prototype
            || raw.visualFacts.length < 1 || raw.visualFacts.length > MAX_FACTS || Reflect.ownKeys(raw.visualFacts).length !== raw.visualFacts.length + 1) return null;
        const visualFacts = [];
        for (let index = 0; index < raw.visualFacts.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(raw.visualFacts, String(index));
            const fact = descriptor && Object.hasOwn(descriptor, 'value') ? ownRecord(descriptor.value, ['kind', 'value', 'evidence']) : null;
            const kind = plainText(fact?.kind, 30), valueName = plainText(fact?.value, 30), evidence = plainText(fact?.evidence, 180);
            if (!kind || !FACT_VALUES[kind]?.includes(valueName) || !evidence) return null;
            if (!visualFacts.some(item => item.kind === kind && item.value === valueName)) visualFacts.push({ kind, value: valueName, evidence });
        }
        const sceneRaw = ownRecord(raw.scene, ['kind', 'evidence']);
        const scene = { kind: plainText(sceneRaw?.kind, 30), evidence: plainText(sceneRaw?.evidence, 180) };
        if (!SCENES.includes(scene.kind) || !scene.evidence) return null;
        if (raw.focus === 'person' && !visualFacts.some(fact => APPEARANCE_KINDS.has(fact.kind))) return null;
        if (raw.focus === 'object' && !visualFacts.some(fact => fact.kind === 'signatureObject')) return null;
        const design = { version: VERSION, characterName, focus: raw.focus, visualFacts, scene };
        if (new TextEncoder().encode(JSON.stringify(design)).byteLength > MAX_BYTES) return null;
        return design;
    } catch { return null; }
}

export function normalizeGenerated(value, { characterEvidence = '', letterText = '', characterNames = [] } = {}) {
    const design = normalize(value);
    if (!design) return null;
    const names = Array.isArray(characterNames) ? characterNames.filter(name => typeof name === 'string' && name.trim()) : [];
    if (!names.includes(design.characterName)) return null;
    if (!design.visualFacts.every(fact => exactEvidence(characterEvidence, fact.evidence) && factSupported(fact))) return null;
    if (!exactEvidence(letterText, design.scene.evidence) || !includesToken(design.scene.evidence, SCENE_TOKENS[design.scene.kind])) return null;
    if (names.length > 1 && !design.visualFacts.every(fact => fact.evidence.includes(design.characterName) || fact.evidence.includes('{{char}}'))) return null;
    if (design.focus === 'object') {
        const object = design.visualFacts.find(fact => fact.kind === 'signatureObject')?.value;
        if (!OBJECT_SCENES[object]?.includes(design.scene.kind)) return null;
    }
    return design;
}

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
function safeId(value) { return String(value ?? 'letter').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'letter'; }
function fact(design, kind) { return design.visualFacts.find(item => item.kind === kind)?.value || ''; }
function colour(value, fallback = PALETTE.ink) { return SAFE_COLOURS[value] || fallback; }
function stroke() { return `fill="none" stroke="${PALETTE.ink}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"`; }
function outline() { return `stroke="${PALETTE.ink}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"`; }

function sceneMotif(kind, x = 159, y = 67) {
    const s = stroke();
    if (kind === 'read') return `<g data-rmt-letter-scene-motif="read" ${s}><path d="M${x-22} ${y-9}q13-6 22 3q9-9 22-3v27q-13-5-22 3q-9-8-22-3z" fill="${PALETTE.paper}"/><path d="M${x} ${y-6}v27"/></g>`;
    if (kind === 'tea') return `<g data-rmt-letter-scene-motif="tea" ${s}><path d="M${x-15} ${y}h27l-4 20q-10 7-19 0z" fill="${PALETTE.paper}"/><path d="M${x+12} ${y+5}q15 0 7 11M${x-7} ${y-7}q-4-7 1-12M${x+3} ${y-7}q4-7 0-12"/></g>`;
    if (kind === 'rain') return `<g data-rmt-letter-scene-motif="rain" ${s}><path d="M${x-25} ${y+1}q25-26 50 0q-13-7-25 0q-12-7-25 0z" fill="${PALETTE.blue}" opacity=".38"/><path d="M${x} ${y+1}v28q0 8 8 5"/><path d="M${x-21} ${y+17}l-4 8m47-8 4 8"/></g>`;
    if (kind === 'photo') return `<g data-rmt-letter-scene-motif="photo" ${s}><rect x="${x-23}" y="${y-6}" width="46" height="30" rx="4" fill="${PALETTE.paper}"/><circle cx="${x}" cy="${y+9}" r="9"/><path d="M${x-13} ${y-6}l5-7h14l5 7"/></g>`;
    if (kind === 'music') return `<g data-rmt-letter-scene-motif="music" ${s}><path d="M${x-8} ${y+18}V${y-12}l22-5v29"/><ellipse cx="${x-15}" cy="${y+21}" rx="8" ry="5" fill="${PALETTE.accent}" opacity=".45"/><ellipse cx="${x+7}" cy="${y+15}" rx="8" ry="5" fill="${PALETTE.accent}" opacity=".45"/></g>`;
    if (kind === 'flower' || kind === 'gift') return kind === 'gift'
        ? `<g data-rmt-letter-scene-motif="gift" ${s}><rect x="${x-20}" y="${y}" width="40" height="29" rx="2" fill="${PALETTE.paper}"/><path d="M${x} ${y}v29M${x-23} ${y}h46M${x} ${y}q-18-20-19-3q8 7 19 3q18-20 19-3q-8 7-19 3"/></g>`
        : `<g data-rmt-letter-scene-motif="flower" ${s}><path d="M${x} ${y+29}V${y+3}m0 13q-14-9-17-2m17 7q13-10 17-3"/><g fill="${PALETTE.accent}" opacity=".55"><circle cx="${x}" cy="${y}" r="7"/><circle cx="${x-8}" cy="${y+1}" r="6"/><circle cx="${x+8}" cy="${y+1}" r="6"/></g></g>`;
    if (kind === 'window') return `<g data-rmt-letter-scene-motif="window" ${s}><rect x="${x-24}" y="${y-18}" width="48" height="49" fill="${PALETTE.paper}"/><path d="M${x} ${y-18}v49M${x-24} ${y+6}h48M${x-17} ${y-9}q10-7 17 0"/></g>`;
    if (kind === 'lamp') return `<g data-rmt-letter-scene-motif="lamp" ${s}><path d="M${x-17} ${y+4}h34l-8-22h-18z" fill="${PALETTE.accent}" opacity=".36"/><path d="M${x} ${y+4}v25m-12 0h24"/></g>`;
    if (kind === 'cook') return `<g data-rmt-letter-scene-motif="cook" ${s}><path d="M${x-22} ${y+5}q22 18 44 0l-4 20h-36z" fill="${PALETTE.paper}"/><path d="M${x-27} ${y+5}h54M${x-8} ${y-4}q-5-9 0-15m15 15q5-9 0-15"/></g>`;
    if (kind === 'walk') return `<g data-rmt-letter-scene-motif="walk" ${s}><path d="M${x-22} ${y+26}q17-13 32-3q12 8 25-4"/><path d="M${x+21} ${y-10}v28m0-20l-11 10m11-10 10 9m-10 11-9 15m9-15 11 15"/><circle cx="${x+21}" cy="${y-17}" r="6" fill="${PALETTE.paper}"/></g>`;
    return `<g data-rmt-letter-scene-motif="write" ${s}><rect x="${x-24}" y="${y-13}" width="42" height="38" rx="3" fill="${PALETTE.paper}"/><path d="M${x-16} ${y-3}h23m-23 9h18m-18 9h13M${x+2} ${y+20}l24-30 5 4-24 30z" fill="${PALETTE.accent}" opacity=".45"/></g>`;
}

function signatureObject(kind, x = 110, y = 45) {
    const sceneForObject = { book:'read', cup:'tea', camera:'photo', umbrella:'rain', flower:'flower', instrument:'music', letter:'write', lamp:'lamp' }[kind];
    return `<g data-rmt-letter-signature-object="${kind}">${sceneMotif(sceneForObject, x, y)}</g>`;
}

function person(design) {
    const hairLength = fact(design, 'hairLength'), hairStyle = fact(design, 'hairStyle'), hairColor = fact(design, 'hairColor');
    const eyeColor = fact(design, 'eyeColor'), outfitKind = fact(design, 'outfitKind'), outfitColor = fact(design, 'outfitColor');
    const markers = design.visualFacts.filter(item => item.kind === 'marker').map(item => item.value);
    const hairFill = hairColor ? colour(hairColor) : 'none';
    const outfitFill = outfitColor ? colour(outfitColor) : PALETTE.paper;
    const hairBottom = hairLength === 'long' ? 105 : hairLength === 'medium' ? 85 : 64;
    const ponytail = hairStyle === 'ponytail' ? `<path d="M88 42q-23 9-14 38q13-10 11-29" fill="${hairFill}"/>` : '';
    const braid = hairStyle === 'braid' ? `<path d="M84 54q-10 9 0 17q10 8 0 17q-8 8 1 18" stroke-width="5"/>` : '';
    const bun = hairStyle === 'bun' ? `<circle cx="80" cy="24" r="12" fill="${hairFill}"/>` : '';
    const texture = hairStyle === 'curly' ? `<path d="M57 55q-8 8 0 16q-8 8 0 16M106 55q8 8 0 16q8 8 0 16"/>`
        : hairStyle === 'wavy' ? `<path d="M58 55q-7 8 0 16q7 8 0 16M105 55q7 8 0 16q-7 8 0 16"/>` : '';
    const hasHair = hairLength || hairStyle || hairColor;
    // The mass of the hair sits behind the paper-coloured face. A small fringe is
    // drawn later, so long dark hair cannot turn the whole face into a dark mask.
    const hairBack = hasHair ? `<g data-rmt-letter-hair="${hairLength || 'specified'}:${hairStyle || 'unspecified'}:${hairColor || 'unspecified'}" ${stroke()}><path d="M55 55q0-35 26-35q29 0 29 35v${hairBottom-55}q-13 6-20-6q-10 10-35 5z" fill="${hairFill}"/>${texture}${ponytail}${braid}${bun}</g>` : '';
    const hairFront = hasHair ? `<path data-rmt-letter-hair-fringe="true" d="M59 47q0-27 22-27q25 0 25 28q-8-13-16-16q-10 11-29 13z" fill="${hairFill}" ${outline()}/>` : '';
    const eyes = eyeColor ? `<g data-rmt-letter-eyes="${eyeColor}" fill="${colour(eyeColor)}"><circle cx="72" cy="50" r="2.2"/><circle cx="91" cy="50" r="2.2"/></g>` : '';
    const outfitPath = ['dress', 'robe', 'coat'].includes(outfitKind) ? 'M54 81q27-17 54 0l17 52H37z' : 'M54 81q27-17 54 0l9 52H45z';
    const outfitDetail = outfitKind === 'hoodie' ? `<path d="M61 83q20-17 40 0q-5 13-20 14q-15-1-20-14" ${stroke()}/>`
        : ['jacket', 'coat', 'suit'].includes(outfitKind) ? `<path d="M63 81l18 22l18-22M81 103v30" ${stroke()}/>`
            : outfitKind === 'uniform' ? `<path d="M61 84l20 16l20-16M69 91h24" ${stroke()}/>`
                : outfitKind === 'sweater' ? `<path d="M51 97q30 9 61 0M49 110q31 9 65 0" ${stroke()}/>` : '';
    const outfit = `<path data-rmt-letter-outfit="${outfitKind || 'unspecified'}:${outfitColor || 'unspecified'}" d="${outfitPath}" fill="${outfitFill}" ${outline()}/>${outfitDetail}`;
    const markerSvg = [
        markers.includes('glasses') ? `<g data-rmt-letter-marker="glasses" ${stroke()}><rect x="63" y="43" width="15" height="11" rx="5"/><rect x="85" y="43" width="15" height="11" rx="5"/><path d="M78 48h7"/></g>` : '',
        markers.includes('freckles') ? `<g data-rmt-letter-marker="freckles" fill="${PALETTE.accent}"><circle cx="67" cy="59" r="1"/><circle cx="71" cy="61" r="1"/><circle cx="95" cy="59" r="1"/><circle cx="91" cy="61" r="1"/></g>` : '',
        markers.includes('scar') ? `<path data-rmt-letter-marker="scar" d="M95 44l-8 17" fill="none" ${outline()}/>` : '',
        markers.includes('earrings') ? `<g data-rmt-letter-marker="earrings" fill="${PALETTE.accent}"><circle cx="57" cy="59" r="3"/><circle cx="105" cy="59" r="3"/></g>` : '',
        markers.includes('ribbon') ? `<path data-rmt-letter-marker="ribbon" d="M77 26q-15-15-16 2q8 8 18 3q12 7 20-3q-1-16-18-2z" fill="${PALETTE.accent}"/>` : '',
        markers.includes('hat') ? `<path data-rmt-letter-marker="hat" d="M48 34h67M60 32l8-23h30l8 23" fill="${PALETTE.soft}" ${outline()}/>` : '',
        markers.includes('scarf') ? `<path data-rmt-letter-marker="scarf" d="M58 76q24 13 48 0l-4 17q-22 9-40 0z" fill="${PALETTE.accent}" ${stroke()}/>` : '',
    ].join('');
    return `<g data-rmt-letter-person="true">${outfit}${hairBack}<path data-rmt-letter-face-opening="true" d="M61 47q0-24 20-24q21 0 21 24v11q-2 22-21 22q-18 0-20-22z" fill="${PALETTE.paper}" ${outline()}/>${hairFront}${eyes}${markerSvg}</g>`;
}

export function render(value, { idPrefix = 'rmt-letter', label = '' } = {}) {
    const design = normalize(value);
    if (!design) return '';
    const titleId = `${safeId(idPrefix)}-illustration-title`;
    const named = typeof label === 'string' && label.trim().length > 0;
    const title = named ? `<title id="${titleId}">${esc(label.slice(0, 160))}</title>` : '';
    const semantic = named ? `role="img" aria-labelledby="${titleId}"` : 'aria-hidden="true"';
    const signature = fact(design, 'signatureObject');
    const foreground = design.focus === 'person' ? person(design) : signatureObject(signature);
    const scene = design.focus === 'person' ? sceneMotif(design.scene.kind) : '';
    return `<svg class="rmt-letter-illustration" data-rmt-letter-illustration-version="2" data-rmt-letter-focus="${design.focus}" data-rmt-letter-scene="${design.scene.kind}" width="220" height="150" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" ${semantic}>${title}<path d="M15 133q45-11 91 0t99-1" fill="none" stroke="${PALETTE.soft}" stroke-width="1.4" opacity=".65"/>${foreground}${scene}</svg>`;
}
