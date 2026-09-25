// Symbolic object drawings, built locally from a recognized object noun. Neither
// labels nor provider-supplied visualKind values become SVG markup or geometry.
const wood = 'var(--rmt-interior-wood)', dark = 'var(--rmt-interior-line)', cloth = 'var(--rmt-interior-fabric)', paper = 'var(--rmt-interior-paper)', glass = 'var(--rmt-interior-glass)';
const stroke = `fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
const shadow = '<ellipse cx="0" cy="81" rx="64" ry="12" fill="#00000013"/>';
export const ROOM_OBJECT_DRAWINGS = Object.freeze({
    bicycle: `${shadow}<g ${stroke} stroke-width="5"><circle cx="-53" cy="40" r="37"/><circle cx="57" cy="40" r="37"/><path d="M-53 40-23-17 18 40h-71l72-56 38 56M18 40-8-29m-17 0h32M40-27h21l-5 15"/></g>`,
    guitar: `${shadow}<path d="M-9-75h18v83q47-8 39 26q26 45-9 52h-57q-35-7-9-52q-8-34 18-26z" fill="${wood}" stroke="${dark}" stroke-width="3"/><circle cy="39" r="16" fill="${dark}"/><path d="M-3-75v143m6-143v143M-16 70h32" stroke="${paper}" stroke-width="2"/>`,
    petBed: `${shadow}<ellipse cx="0" cy="65" rx="71" ry="20" fill="${wood}"/><path d="M-63 51q0-65 62-65q59 0 61 65l-15 14h-92z" fill="${cloth}" stroke="${dark}" stroke-width="3"/><path d="M-29 54V26q1-28 29-28q29 0 30 28v29z" fill="${dark}"/><ellipse cy="57" rx="46" ry="13" fill="${paper}"/><path d="M-37 56q34-12 73 0m-57-47-6-11m49 11 6-11" ${stroke} opacity=".5"/>`,
    basket: `${shadow}<path d="M-49 15q-5-59 47-59q54 0 51 59" fill="none" stroke="${wood}" stroke-width="10"/><path d="M-58 12q58-20 116 0l-15 62q-43 24-88 0z" fill="${wood}" stroke="${dark}" stroke-width="3"/><ellipse cy="12" rx="59" ry="16" fill="${dark}"/><ellipse cy="10" rx="53" ry="11" fill="${paper}" opacity=".42"/><g ${stroke} opacity=".6"><path d="M-53 30q52 15 105 0m-99 19q47 17 94 0m-89 20q43 16 84 0M-33 23l6 57M-11 26l3 60m20-60-3 60m25-63-7 57"/></g>`,
    mat: `${shadow}<path d="m-79 39 105-24 59 38-105 28z" fill="${wood}" stroke="${dark}" stroke-width="2"/><g ${stroke} stroke-width="1.5" opacity=".5"><path d="m-66 42 48 31m-32-35 48 31m-31-35 48 31m-31-35 48 31m-31-35 48 31M-63 51l105-24M-50 59 55 35m-92 32 105-24"/></g><path d="m-82 39-6 7m64 38 3 7m110-36 7 5" ${stroke}/>` ,
    sword: `${shadow}<g transform="rotate(31)"><path d="M-7-88 0-111 7-88 5 41-5 41z" fill="${glass}" stroke="${dark}" stroke-width="3"/><path d="M0-94V38" stroke="${paper}" stroke-width="2"/><path d="M-25 38q25-8 50 0v8h-50z" fill="${wood}" stroke="${dark}" stroke-width="3"/><rect x="-6" y="46" width="12" height="34" rx="3" fill="${dark}"/><path d="m-5 53 10 4m-10 4 10 4m-10 4 10 4" stroke="${wood}" stroke-width="3"/><circle cy="85" r="8" fill="${wood}"/></g>`,
    saber: `${shadow}<g transform="rotate(28)"><path d="M-6 41q-20-71 7-132q-2 65 17 111L8 44z" fill="${glass}" stroke="${dark}" stroke-width="3"/><path d="M-17 41h43" stroke="${wood}" stroke-width="10"/><path d="m4 48 10 36" stroke="${dark}" stroke-width="13"/><circle cx="16" cy="87" r="7" fill="${wood}"/></g>`,
    spear: `${shadow}<path d="M-43 98 39-73" stroke="${wood}" stroke-width="7"/><path d="M27-56 43-115 53-71 39-44z" fill="${glass}" stroke="${dark}" stroke-width="3"/><path d="M32-55q-29 14-28 36q14-16 22-17l-7 29 24-30" fill="${cloth}"/>`,
    medical: `${shadow}<path d="M-25-11v-22h50v22" fill="none" stroke="${dark}" stroke-width="8"/><rect x="-58" y="-12" width="116" height="87" rx="12" fill="${paper}" stroke="${dark}" stroke-width="4"/><path d="M-58 9H58" stroke="${wood}" stroke-width="6"/><path d="M-10 22h20v14h14v20H10v14h-20V56h-14V36h14z" fill="${cloth}"/><path d="M-40 2v15m80-15v15" stroke="${dark}" stroke-width="6"/>`,
    door: `<path d="M-66 85V-96H65V85" fill="${dark}"/><path d="M-52-82H51V85H-52z" fill="${wood}"/><path d="M-42-70h83v62h-83zm0 79h83v62h-83z" fill="none" stroke="${dark}" stroke-width="4"/><circle cx="31" cy="1" r="5" fill="${paper}"/><path d="M-71 85H72" stroke="${dark}" stroke-width="7"/>`,
    stairs: `${shadow}<path d="M-75 83V54h31V26h31V-2h31v-28h31v-28h30V83z" fill="${wood}" stroke="${dark}" stroke-width="3"/><path d="M-74 54H79m-122-28H79M-12-2h91M19-30h60M-71 24 66-103m-109 99v31m31-60v31m31-60v31m31-60v31" fill="none" stroke="${dark}" stroke-width="4"/>`,
    zither: `${shadow}<path d="m-89 42 155-26 26 34-156 27z" fill="${wood}" stroke="${dark}" stroke-width="3"/><path d="m-79 43 155-19m-150 26 155-20m-149 26 153-19m-148 25 151-20m-146 26 150-20" stroke="${paper}" stroke-width="1.5"/><path d="m-51 40 10 21m95-36 9 21" stroke="${dark}" stroke-width="4"/><path d="m-52 74-2 12m125-32 7 13" stroke="${dark}" stroke-width="6"/>`,
    rack: `${shadow}<path d="M-70 82h35m-17-3V-84H56V79m-18 3h37" fill="none" stroke="${wood}" stroke-width="7"/><path d="M-38-73h26l6 13h15l6-13h26l-8 99-17 42h-39l-8-41z" fill="${cloth}" stroke="${dark}" stroke-width="3"/><path d="m-12-70 15 27 14-27M3-42v107m-24-28h45" ${stroke}/>` ,
    vase: `${shadow}<path d="M-15-50h30l-3 30q0 16 16 32q29 41-2 67h-52q-31-26-2-67q16-16 16-32z" fill="${glass}" stroke="${dark}" stroke-width="3"/><ellipse cy="-51" rx="17" ry="5" fill="${paper}"/><path d="M-19 39q22-14 40 5m-36-18-3 30" stroke="${paper}" stroke-width="5" fill="none" opacity=".7"/>`,
    scroll: `${shadow}<path d="M-61-31h110v89H-61z" fill="${paper}" stroke="${dark}" stroke-width="2"/><path d="M-60-33v96m110-100v93" stroke="${wood}" stroke-width="12"/><path d="M-34-7h57m-57 17h65m-65 17h54m-54 17h38" stroke="${dark}" stroke-width="3" opacity=".6"/>`,
    mirror: `${shadow}<ellipse cy="-14" rx="50" ry="65" fill="${glass}" stroke="${wood}" stroke-width="9"/><path d="M-9 51v23m18-23v23m-42 4h66M-32-21l41-33m-31 58 50-40" fill="none" stroke="${paper}" stroke-width="4"/>`,
    bowl: `${shadow}<path d="M-56 28q3 51 55 51q51 0 57-51z" fill="${glass}" stroke="${dark}" stroke-width="3"/><ellipse cy="28" rx="57" ry="17" fill="${paper}" stroke="${dark}" stroke-width="3"/>`,
    piano: `${shadow}<path d="M-80-55H77V40H-80z" fill="${dark}"/><path d="M-88 15H84v25H-88z" fill="${paper}"/><path d="M-82 40v45m157-45v45" stroke="${dark}" stroke-width="9"/><g stroke="${dark}" stroke-width="7"><path d="M-67 16v14m16-14v14m32-14v14m16-14v14m16-14v14m32-14v14m16-14v14"/></g><path d="M-26-15h53v16h-53z" fill="${wood}"/>`,
    tech: `${shadow}<rect x="-67" y="-58" width="134" height="88" rx="6" fill="${dark}"/><path d="M-59-49H59v69H-59z" fill="${glass}"/><path d="M-9 30v25h-35v8h88v-8H9V30" fill="${dark}"/><path d="M-53-32h25m-25 13h45" stroke="${paper}" stroke-width="3" opacity=".7"/>`,
    camera: `${shadow}<path d="M-30-14h45l10 15h24v62H-52V1h15z" fill="${dark}"/><circle cy="33" r="28" fill="${glass}" stroke="${wood}" stroke-width="5"/><circle cy="33" r="14" fill="${dark}"/><circle cx="-5" cy="28" r="5" fill="${paper}"/><path d="M-38 11h15" stroke="${paper}" stroke-width="6"/>`,
    travel: `${shadow}<path d="M-19-17v-20h38v20" fill="none" stroke="${dark}" stroke-width="7"/><rect x="-51" y="-17" width="102" height="91" rx="14" fill="${cloth}" stroke="${dark}" stroke-width="3"/><path d="M-29-15v87m58-87v87" stroke="${wood}" stroke-width="8"/><path d="M-28 77v10m56-10v10" stroke="${dark}" stroke-width="7"/>`,
    tool: `${shadow}<g transform="rotate(33)"><path d="M-8-8h16v83q-8 15-16 0z" fill="${wood}" stroke="${dark}" stroke-width="3"/><path d="M-17 0q-34-34-3-60v29l20 12 20-12v-29Q51-34 17 0z" fill="${glass}" stroke="${dark}" stroke-width="3"/></g>`,
    fitness: `${shadow}<path d="M-53 34H53" stroke="${glass}" stroke-width="13"/><path d="M-54 4v60m-18-50v40M54 4v60m18-50v40" stroke="${dark}" stroke-width="18"/>`,
    music: `${shadow}<path d="M-26 50v-92l73-17V33M-26-24l73-17" fill="none" stroke="${wood}" stroke-width="9"/><ellipse cx="-43" cy="54" rx="23" ry="14" fill="${dark}" transform="rotate(-15 -43 54)"/><ellipse cx="30" cy="38" rx="23" ry="14" fill="${dark}" transform="rotate(-15 30 38)"/>`,
    other: `<ellipse cy="60" rx="42" ry="15" fill="${paper}" opacity=".6"/><path d="M-45 40q-8-34 17-57q28-20 51-1q32 25 19 57" fill="none" stroke="${dark}" stroke-dasharray="4 6" stroke-width="3" opacity=".6"/><path d="M-11 4q2-20 19-13q15 10-3 20v7" ${stroke}/><circle cx="5" cy="30" r="2.5" fill="${dark}"/>`,
});

const kinds = [
    ['bicycle', /(?:自行车|自行車|单车|單車|山地车|山地車|bicycle|bike)/giu],
    ['guitar', /(?:吉他|guitar)/giu],
    ['petBed', /(?:猫窝|貓窩|狗窝|狗窩|宠物窝|寵物窩|pet\s*bed|cat\s*bed|dog\s*bed)/giu],
    ['medical', /(?:医疗.{0,8}(?:箱|包)|醫療.{0,8}(?:箱|包)|急救(?:箱|包)|药箱|藥箱|first\s*aid\s*kit|medical\s*kit)/giu],
    ['stairs', /(?:楼梯|樓梯|台阶|臺階|stairs?|staircase)/giu],
    ['door', /(?:钢门|鋼門|木门|木門|房门|房門|单扇.{0,4}门|單扇.{0,4}門|防盗门|防盜門|(?:^|的)门$|door)/giu],
    ['zither', /(?:古琴|古筝|古箏|七弦琴|瑶琴|瑤琴|guqin|guzheng|zither)/giu],
    ['piano', /(?:钢琴|鋼琴|piano)/giu],
    ['rack', /(?:衣架|衣帽架|挂衣架|掛衣架|coat\s*rack|clothes\s*rack)/giu],
    ['sword', /(?:剑|劍|sword)/giu], ['saber', /(?:刀|saber|sabre|dagger)/giu], ['spear', /(?:长枪|長槍|长矛|長矛|spear|lance)/giu],
    ['basket', /(?:竹篓|竹簍|竹篮|竹籃|藤篮|藤籃|篮子|籃子|编篓|編簍|basket)/giu],
    ['mat', /(?:草垫|草墊|竹席|凉席|涼席|地毯|蒲团|蒲團|地垫|地墊|rug|floor\s*mat|straw\s*mat)/giu],
    ['vase', /(?:花瓶|瓷瓶|vase)/giu], ['scroll', /(?:卷轴|卷軸|画卷|畫卷|scroll)/giu],
    ['mirror', /(?:铜镜|銅鏡|穿衣镜|穿衣鏡|梳妆镜|梳妝鏡|mirror)/giu],
    ['bowl', /(?:碗|bowl)/giu], ['camera', /(?:相机|相機|camera)/giu],
    ['shelf', /(?:书架|書架|书柜|書櫃|bookshelf|bookcase)/giu],
    ['seat', /(?:椅|沙发|沙發|凳|chair|sofa|stool)/giu],
];

export function roomDrawingKind(label, visualKind, available = {}) {
    const name = typeof label === 'string' ? label : '';
    // The item after a location prefix owns the silhouette. For the paired
    // "cat bed and straw mat", show the specific bed rather than a generic mat.
    if (/(?:猫窝|貓窩|狗窝|狗窩|pet\s*bed|cat\s*bed|dog\s*bed).*(?:与|和|及|and).*(?:草垫|草墊|竹席|mat)/iu.test(name)) return 'petBed';
    let winner = null;
    for (const [kind, pattern] of kinds) {
        const hits = [...name.matchAll(pattern)];
        const hit = hits.at(-1);
        if (hit && (!winner || hit.index > winner.index)) winner = { kind, index: hit.index };
    }
    if (winner) return winner.kind;
    return Object.hasOwn(ROOM_OBJECT_DRAWINGS, visualKind) || Object.hasOwn(available, visualKind) ? visualKind : 'other';
}
