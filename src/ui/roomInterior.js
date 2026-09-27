import * as pixelFigure from './roomPixelFigure.js';
import * as roomObjectDrawing from './roomObjectDrawing.js';
// Code-owned SVG interior. Only bounded labels/IDs and existing local profile tokens are used.
// Provider output cannot supply markup, CSS, colours, coordinates, URLs or SVG paths.
import * as text from '../core/text.js';
const SHAPES = Object.freeze({
    table: '<ellipse cx="0" cy="53" rx="80" ry="17" fill="#00000016"/><path d="M-73 1h133l28 29H-92Z" fill="var(--rmt-interior-wood)"/><path d="M-77 30v55m146-55v55" stroke="var(--rmt-interior-line)" stroke-width="8"/><path d="m-34 4 26-7 27 14-28 9z" fill="var(--rmt-interior-paper)"/>',
    storage: '<path d="M-60-35h103l18 13v102H-60Z" fill="var(--rmt-interior-line)"/><path d="M-60-35H43V80H-60Z" fill="var(--rmt-interior-wood)"/><path d="M-57 4h97m-97 37h97M-20-13h22m-22 35h22m-22 37h22" stroke="var(--rmt-interior-paper)" stroke-width="3"/>',
    shelf: '<rect x="-60" y="-63" width="126" height="150" rx="3" fill="var(--rmt-interior-wood)"/><rect x="-52" y="-55" width="110" height="130" fill="var(--rmt-interior-line)"/><g fill="var(--rmt-interior-fabric)"><path d="M-42-45h16v33h-16zm22-3h11v36h-11zm18 8h21v28H-2zM-44 6h13v34h-13zm23 5h21v29h-21zM21 4h17v36H21z"/></g><path d="M28-46h15v34H28zM-26 59h64v13H-26z" fill="var(--rmt-interior-glass)"/><path d="M-53-7H60M-53 45H60" stroke="var(--rmt-interior-wood)" stroke-width="7"/>',
    seat: '<ellipse cx="0" cy="77" rx="60" ry="12" fill="#00000018"/><rect x="-50" y="-14" width="95" height="83" rx="18" fill="var(--rmt-interior-fabric)"/><rect x="-61" y="29" width="119" height="41" rx="12" fill="var(--rmt-interior-fabric)"/><path d="M-43 69v26m79-26v26M-58 54H53" stroke="var(--rmt-interior-line)" stroke-width="5"/>',
    bed: '<path d="M-104-4h162l43 75H-138Z" fill="var(--rmt-interior-wood)"/><path d="M-102-48H58V5h-160Z" fill="var(--rmt-interior-line)"/><path d="M-104 2H60l36 60h-220Z" fill="var(--rmt-interior-fabric)"/><path d="M-84-4h48l9 21h-60Zm58 0h48l10 21h-54Z" fill="var(--rmt-interior-paper)"/><path d="M-125 67v19m211-19v19" stroke="var(--rmt-interior-line)" stroke-width="8"/>',
    window: '<rect x="-57" y="-72" width="117" height="132" rx="4" fill="var(--rmt-interior-glass)" stroke="var(--rmt-interior-wood)" stroke-width="8"/><path d="M0-73V60M-59-4H60M-64 65H70" stroke="var(--rmt-interior-wood)" stroke-width="5"/>',
    light: '<path d="M0-28v112m-21 0h43" stroke="var(--rmt-interior-line)" stroke-width="6"/><path d="M-22-57h44l24 45h-92Z" fill="var(--rmt-interior-fabric)"/>',
    plant: '<path d="M-24 34h50L18 84H-16Z" fill="var(--rmt-interior-fabric)"/><path d="M0 35V-28m0 41Q-54 4-34-37 3-24 0 13m2-4Q48-52 54-6 32 23 2 9" fill="var(--rmt-interior-line)"/>',
    book: '<path d="m-63 29 56-16 70 26-61 18Z" fill="var(--rmt-interior-fabric)"/><path d="m-62 15 55-15 68 27v12L-5 18l-57 12Z" fill="var(--rmt-interior-paper)"/><path d="M-6 1V19" stroke="var(--rmt-interior-line)"/>',
    cup: '<ellipse cy="50" rx="42" ry="10" fill="var(--rmt-interior-paper)"/><path d="M-23 0h43v33q-20 34-43 0Z" fill="var(--rmt-interior-fabric)"/><path d="M20 7q38-2 24 25L21 38" fill="none" stroke="var(--rmt-interior-fabric)" stroke-width="7"/>',
    art: '<rect x="-65" y="-70" width="127" height="99" rx="3" fill="var(--rmt-interior-paper)" stroke="var(--rmt-interior-wood)" stroke-width="7"/><circle cx="-25" cy="-42" r="12" fill="var(--rmt-interior-fabric)"/><path d="M-56 20-4-32 22-2 39-19 53 20Z" fill="var(--rmt-interior-glass)"/>',
});
export function roomFigureSvg(profile = {}) {
    return pixelFigure.pixelFigureSvg(profile);
}
export function roomInteriorHtml(layout, { figure = {}, personIsHere = false, charName = '', selectedId = '', world = 'neutral', participants = null, space = {}, night = false } = {}) {
    if (Array.isArray(participants)) {
        const interior = roomInteriorHtml(layout, { selectedId, world, space, night });
        const figures = participants.map(person => `<button type="button" class="rmt-room-resident-figure" data-rmt-action="room-participant" data-rmt-participant-id="${text.esc(person.id)}" aria-label="听${text.esc(person.name)}说话"><svg viewBox="-70 -115 140 220" role="img" aria-label="${text.esc(person.name)}的像素小人">${roomFigureSvg(person.figure)}</svg><b>${text.esc(person.name)}</b></button>`).join('');
        return `<div class="rmt-room-shared-interior">${interior}<div class="rmt-room-resident-figures">${figures}</div></div>`;
    }
    const entries = Array.isArray(layout) ? layout : [];
    const selectedIndex = Math.max(0, entries.findIndex(entry => entry.id === selectedId));
    const pageStart = Math.floor(selectedIndex / 6) * 6;
    const panels = [];
    // Keep every actual item reachable; no invisible overlap or model-controlled positions.
    for (let start=pageStart; start<Math.max(1, Math.min(entries.length, pageStart+6)); start+=6) {
        const part = entries.slice(start,start+6);
        const furniture = part.map((entry,i) => {
            const positions = [[230,275],[505,252],[720,277],[170,426],[445,409],[690,441]];
            const [x,y] = positions[i];
            const label = text.normalizeText(entry.item?.label,100);
            // A location prefix (e.g. 窗边的椅子) is not the furnishing itself.
            const kind = roomObjectDrawing.roomDrawingKind(label, entry.visualKind, SHAPES);
            return `<g transform="translate(${x} ${y}) scale(.88)" data-rmt-furniture="${kind}">${roomObjectDrawing.ROOM_OBJECT_DRAWINGS[kind] || SHAPES[kind]}</g>`;
        }).join('');
        const hits = part.map((entry,i) => {
            const positions = [[25.6,58],[56.1,55],[80,58],[18.9,85],[49.4,85],[76.7,89]];
            const [x,y] = positions[i]; const label = text.normalizeText(entry.item?.label,100) || '物件';
            const number = Math.max(1,Math.floor(Number(entry.number)||start+i+1));
            return `<button type="button" class="rmt-interior-hotspot ${entry.id === selectedId ? 'active' : ''}" style="left:${x}%;top:${y}%" data-rmt-room-id="${text.esc(entry.id)}" aria-pressed="${entry.id===selectedId}" aria-controls="heartbeat_memories_overlay_room_object_detail" aria-label="${number}. ${text.esc(label)}"><span>${number}</span><b>${text.esc(label)}</b></button>`;
        }).join('');
        panels.push(`<div class="rmt-interior" data-rmt-room-architecture="${roomArchitectureKind(space)}" data-rmt-interior-world="${['historical','scifi','fantasy'].includes(world)?world:'neutral'}"><svg viewBox="0 0 900 550" class="rmt-interior-svg" role="img" aria-label="当前房间的内装示意">${roomArchitectureSvg(space, world, night)}${furniture}${personIsHere ? `<g transform="translate(840 326) scale(.82)">${roomFigureSvg(figure)}</g>`:''}</svg>${hits}${personIsHere ? `<button type="button" class="rmt-interior-person" data-rmt-action="room-presence" aria-label="听${text.esc(charName)}说话">${text.esc(charName)}</button>`:''}</div>`);
    }
    return panels.join('');
}


// Space names choose local architecture, never generated SVG or coordinates.
export function roomArchitectureKind(space = {}) {
    const name = `${space.label || ''} ${space.spaceType || ''}`;
    if (/阳台|陽台|露台|游廊|遊廊|balcony|terrace|veranda/iu.test(name)) return 'balcony';
    if (/庭院|花园|花園|屋顶|屋頂|院子|garden|courtyard|rooftop/iu.test(name)) return 'garden';
    if (/厨房|廚房|灶房|kitchen/iu.test(name)) return 'kitchen';
    if (/浴室|洗手间|洗手間|bathroom/iu.test(name)) return 'bathroom';
    if (/琴房|练习|練習|music|studio/iu.test(name)) return 'music';
    if (/书房|書房|study|library|office/iu.test(name)) return 'study';
    if (/客厅|客廳|会客|會客|living|lounge/iu.test(name)) return 'living';
    if (/卧室|臥室|寝|寢|bedroom/iu.test(name)) return 'bedroom';
    return 'interior';
}
export function roomArchitectureSvg(space = {}, world = 'neutral', night = false) {
    const kind = roomArchitectureKind(space);
    const outdoor = ['balcony', 'garden'].includes(kind);
    const floor = outdoor ? '#c5cfbf' : kind === 'bathroom' ? '#d7e5e5' : kind === 'kitchen' ? '#d9d5c5' : 'var(--rmt-interior-floor)';
    const shell = outdoor
        ? '<path d="M0 0h900v550H0z" fill="#cbdde6"/><path d="M0 185q115-82 229 0t225 0t225 0t221 0v201H0z" fill="#aabdaa"/><path d="M0 234q140-63 290 0t310 0t300 0v152H0z" fill="#8fa994"/><circle cx="717" cy="67" r="26" fill="#faf2d7"/>'
        : '<path d="M0 0h900v396l-145-95H145L0 396Z" fill="var(--rmt-interior-wall)"/><path d="M145 0h610v301H145Z" fill="var(--rmt-interior-backwall)"/>';
    const litShell = night && outdoor ? shell.replace('#cbdde6', '#273848').replace('#aabdaa', '#3e5a56').replace('#8fa994', '#344b48') : shell;
    const ground = `<path d="m0 396 145-95h610l145 95v154H0Z" fill="${floor}"/><path d="M102 330h696M37 375h825M0 428h900M0 488h900M315 301 188 550m284-249-16 249m169-249 127 249" fill="none" stroke="var(--rmt-interior-line)" stroke-opacity=".16" stroke-width="3"/>`;
    const railing = '<g stroke="#edf1e9" fill="none"><path d="M0 246h900M0 318h900" stroke-width="13"/><path d="M40 247v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71m82-71v71" stroke-width="7"/></g>';
    const window = '<rect x="334" y="36" width="220" height="146" rx="4" fill="var(--rmt-interior-glass)" stroke="var(--rmt-interior-wood)" stroke-width="8"/><path d="M444 36v146M334 110h220" stroke="var(--rmt-interior-paper)" stroke-width="5"/>';
    const wallDetails = kind === 'balcony' ? railing
        : kind === 'garden' ? '<path d="M48 316V100m0 55q-72-68-29-110q63 4 37 105m3 0q87-91 98-32q-27 51-98 48" fill="#759579" stroke="#6c8269" stroke-width="12"/>'
        : kind === 'music' ? '<g fill="var(--rmt-interior-wood)" opacity=".65"><path d="M161 24h12v202h-12zm26 0h12v202h-12zm26 0h12v202h-12zm465 0h12v202h-12zm26 0h12v202h-12zm26 0h12v202h-12z"/></g>'+window
        : kind === 'study' ? window+'<path d="M170 51h112v129H170zM603 51h112v129H603z" fill="var(--rmt-interior-wood)"/><path d="M180 67h90m-90 40h90m-90 40h90m343-80h90m-90 40h90m-90 40h90" stroke="var(--rmt-interior-paper)" stroke-width="15"/>'
        : kind === 'kitchen' ? '<path d="M163 24h569v94H163zM163 203h569v98H163z" fill="#becaba" stroke="#8c9989" stroke-width="4"/><path d="M163 194h569" stroke="#f4f1e5" stroke-width="19"/><path d="M302 24v94m143-94v94m143-94v94M302 210v91m143-91v91m143-91v91" stroke="#8c9989" stroke-width="3"/>'
        : kind === 'bathroom' ? '<path d="M145 70h610m-610 70h610m-610 70h610M225 0v301m90-301v301m90-301v301m90-301v301m90-301v301m90-301v301" stroke="#f2f7f5" stroke-width="4"/><ellipse cx="452" cy="126" rx="78" ry="99" fill="#c1dce2" stroke="#f4f6ef" stroke-width="9"/>'
        : kind === 'living' ? window+'<path d="M285 24h40v177h-40zm281 0h40v177h-40z" fill="var(--rmt-interior-fabric)" opacity=".65"/><ellipse cx="455" cy="411" rx="263" ry="72" fill="var(--rmt-interior-fabric)" opacity=".32"/>'
        : kind === 'bedroom' ? window+'<path d="M299 27q30 67 9 166m260-166q-27 76-6 166" fill="none" stroke="var(--rmt-interior-fabric)" stroke-width="31" opacity=".6"/>' : window;
    const trim = !outdoor && world === 'historical' ? '<path d="M145 12h610M156 0v292m586-292v292" stroke="var(--rmt-interior-wood)" stroke-width="12"/>' : !outdoor && world === 'scifi' ? '<path d="M150 26h600m-600 261h600" stroke="var(--rmt-interior-glass)" stroke-width="5"/>' : '';
    return `<g data-rmt-architecture="${kind}">${litShell}${ground}${wallDetails}${trim}</g>`;
}
