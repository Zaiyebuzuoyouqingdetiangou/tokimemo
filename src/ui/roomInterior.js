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
export function roomInteriorHtml(layout, { figure = {}, personIsHere = false, charName = '', selectedId = '', world = 'neutral', participants = null } = {}) {
    if (Array.isArray(participants)) {
        const interior = roomInteriorHtml(layout, { selectedId, world });
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
        panels.push(`<div class="rmt-interior" data-rmt-interior-world="${['historical','scifi','fantasy'].includes(world)?world:'neutral'}"><svg viewBox="0 0 900 550" class="rmt-interior-svg" role="img" aria-label="当前房间的内装示意"><path d="M0 0h900v396l-145-95H145L0 396Z" fill="var(--rmt-interior-wall)"/><path d="M145 0h610v301H145Z" fill="var(--rmt-interior-backwall)"/><path d="m0 396 145-95h610l145 95v154H0Z" fill="var(--rmt-interior-floor)"/><path d="M145 0v301L0 396m755-396v301l145 95M102 330h696M37 375h825M0 428h900M0 488h900M315 301 188 550m284-249-16 249m169-249 127 249" fill="none" stroke="var(--rmt-interior-line)" stroke-opacity=".22" stroke-width="3"/><ellipse cx="455" cy="411" rx="263" ry="72" fill="var(--rmt-interior-fabric)" opacity=".12"/>${world==='scifi'?'<path d="M150 26h600m-600 261h600" stroke="var(--rmt-interior-glass)" stroke-width="5"/>':world==='historical'?'<path d="M145 12h610M156 0v292m586-292v292" stroke="var(--rmt-interior-wood)" stroke-width="12"/>':''}${furniture}${personIsHere ? `<g transform="translate(840 326) scale(.82)">${roomFigureSvg(figure)}</g>`:''}</svg>${hits}${personIsHere ? `<button type="button" class="rmt-interior-person" data-rmt-action="room-presence" aria-label="听${text.esc(charName)}说话">${text.esc(charName)}</button>`:''}</div>`);
    }
    return panels.join('');
}
