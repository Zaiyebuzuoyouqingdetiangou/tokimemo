// Code-owned SVG furniture and room architecture. No model markup, coordinates,
// external pictures or invented archive objects: every foreground node maps to one item.
const FURNITURE = Object.freeze({
    bed: '<path class="wood" d="M14 70V28h15v34h137V39h13v76h-13V92H28v23H14z"/><path class="cloth" d="m29 58 27-22h107l4 42H29z"/><path class="light" d="m39 54 17-14h36l-8 18z"/><path class="cloth2" d="m84 40 78-2 5 40H75z"/><path d="m83 52 73 1M76 66h80"/>',
    table: '<path class="wood" d="m15 45 28-21h128l13 21-23 18H18z"/><path class="dark" d="M21 62h12v56H21zm132-2h12v58h-12z"/><path class="light" d="M49 32h47v17H35z"/>',
    storage: '<path class="wood" d="M40 18h110v98H40z"/><path class="dark" d="m150 18 19 11v87h-19z"/><path class="light" d="M47 27h94v22H47zm0 29h94v23H47zm0 30h94v22H47z"/><path d="M85 39h18M85 69h18M85 98h18"/>',
    seat: '<path class="cloth" d="M30 70V41q0-15 17-15h102q18 0 18 15v29l12 12v24H20V82z"/><path class="cloth2" d="M26 62q12-7 20 6v22h108V68q9-13 21-6v40H26z"/><path class="dark" d="M36 103h10v14H36zm121 0h10v14h-10z"/><path d="M96 30v48M47 83h104"/>',
    book: '<path class="wood" d="M39 99h122v15H39z"/><path class="cloth2" d="M46 81h101v17H46z"/><path class="light" d="m36 59 21-12h96v29H50z"/><path d="M51 64h96M51 70h96"/><path class="cloth" d="m79 16 28 2-10 54-26-6z"/>',
    music: '<path class="wood" d="M85 65q-35-13-40 15c-6 33 56 43 66 15q8-16-9-21l23-52-13-7z"/><circle class="dark" cx="79" cy="86" r="10"/><path d="m81 82 34-62M71 100l17 6"/>',
    plant: '<path class="wood" d="m69 82 13 35h43l12-35z"/><path d="M103 86V32"/><path class="leaf" d="M103 57C50 57 51 22 61 17c34 1 47 19 42 40zm0-13c-6-39 27-43 40-38 5 27-12 43-40 38zm0 40c3-28 28-41 49-28-1 22-22 32-49 28z"/>',
    tech: '<path class="dark" d="M27 16h146v82H27z"/><path class="glass" d="M35 25h130v63H35z"/><path class="wood" d="M91 98h18v16h24v7H69v-7h22z"/><path d="m60 68 23-25 14 16 32-22"/>',
    tool: '<path class="wood" d="M29 72h143v40H29z"/><path class="dark" d="M69 51h66v21h-10V60H80v12H69z"/><path class="light" d="m45 83 19-7 56-58 10 11-57 57-12 17z"/>',
    fitness: '<path class="dark" d="M35 55h24v46H35zm101 0h24v46h-24zM59 73h77v12H59z"/><path class="wood" d="M58 41h12v73H58zm66 0h12v73h-12z"/>',
    pet: '<path class="wood" d="M52 54h95v61H52z"/><path class="cloth" d="m36 55 63-42 63 42z"/><path class="dark" d="M80 115V82q18-25 37 0v33z"/>',
    light: '<path class="wood" d="M97 53h8v65h26v5H72v-5h25z"/><path class="light" d="m69 18 61 0 28 48H45z"/><path d="M130 66v25"/>',
    art: '<path class="wood" d="M46 13h110v104H46z"/><path class="light" d="M56 23h90v84H56z"/><path class="leaf" d="m59 98 35-41 19 24 11-11 19 29z"/><circle class="cloth2" cx="121" cy="44" r="12"/>',
    travel: '<path class="wood" d="M35 47q0-9 10-9h109q10 0 10 9v68H35z"/><path class="dark" d="M79 23h40v15h-10v-6H88v6h-9z"/><path d="M63 41v70M140 41v70M88 75h22"/>',
    cup: '<path class="light" d="M63 46h69v46q-3 24-35 24T63 92z"/><path d="M132 53q42-6 27 28-7 14-27 11M56 120h84M82 33q-12-12 0-22M108 33q-12-12 0-22"/>',
    window: '<path class="wood" d="M39 5h125v110H39z"/><path class="glass" d="M49 14h105v91H49z"/><path class="wood" d="M99 14h6v91h-6zM49 60h105v6H49z"/><path class="cloth" d="M25 8h21v115H25zm135 0h18v115h-18z"/>',
    fabric: '<path class="cloth" d="m31 42 113-16 26 45-121 31z"/><path class="cloth2" d="m48 99 25-53 96 24-39 41z"/><path d="m61 87 74-39M88 97l55-42"/>',
    keepsake: '<ellipse class="cloth2" cx="100" cy="79" rx="48" ry="29"/><ellipse class="light" cx="100" cy="78" rx="34" ry="18"/><path class="wood" d="m100 48 11 13-11 12-11-12z"/><path d="m151 84 27 28M156 78l24 9"/>',
    bag: '<path class="cloth" d="M64 43q-13 7-22 47-6 30 57 30t59-30q-8-42-29-49z"/><path class="cloth2" d="m58 30 44 15 32-22-12 35H78z"/><path d="M75 55q12 32 4 46M123 55q-15 22 4 48M78 55h46"/>',
    other: '<path class="cloth" d="m54 71 48-27 48 27v36l-48 23-48-23z"/><path class="cloth2" d="m54 71 48 24 48-24-48-27z"/><path d="M102 95v34"/>',
});
export function furnitureArt(kind) {
    const key = Object.hasOwn(FURNITURE, kind) ? kind : 'other';
    return `<svg class="rmt-room-furniture-art" viewBox="0 0 200 140" aria-hidden="true" focusable="false" data-rmt-furniture-kind="${key}"><ellipse class="shadow" cx="101" cy="126" rx="81" ry="8"/><g stroke="var(--rmt-room-art-ink,#6f6b68)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" fill="none">${FURNITURE[key]}</g></svg>`;
}
export function roomInteriorArt(kind) {
    const allowed = ['bedroom','study','lounge','studio','lab','bath','dining','tent','cabin','kitchen','balcony','workshop','traditional','office'];
    const key = allowed.includes(kind) ? kind : 'neutral';
    const architecture = key === 'tent'
        ? '<path fill="var(--rmt-room-art-cloth)" opacity=".45" d="m0 0 420 20L0 350zm840 0L420 20l420 330z"/><path d="m420 20-90 320m90-320 90 320"/>'
        : key === 'balcony'
            ? '<path fill="var(--rmt-room-art-glass)" d="M0 0h840v350H0z"/><path d="M0 295h840M0 320h840M70 300v60m100-60v60m100-60v60m100-60v60m100-60v60m100-60v60m100-60v60m100-60v60"/>'
            : key === 'traditional' || key === 'cabin'
                ? '<path d="M0 70h840M150 0v325M690 0v325M0 315h840"/><path fill="var(--rmt-room-art-glass)" opacity=".6" d="M180 85h200v165H180z"/><path d="M230 85v165m50-165v165m50-165v165M180 140h200M180 195h200"/>'
                : key === 'studio'
                    ? '<path opacity=".35" d="M40 85h180v130H40zM265 85h180v130H265zM490 85h180v130H490zM710 85h100v130H710z"/>'
                    : '<path fill="var(--rmt-room-art-glass)" opacity=".65" d="M80 65h200v172H80z"/><path d="M80 65h200v172H80zM180 65v172M80 151h200M64 245h234"/><path opacity=".4" d="M35 28h770v260H35z"/>';
    return `<svg class="rmt-room-interior-art" viewBox="0 0 840 600" preserveAspectRatio="none" aria-hidden="true" focusable="false" data-rmt-interior-kind="${key}"><path fill="var(--rmt-room-art-wall)" d="M0 0h840v105H0z"/><path fill="var(--rmt-room-art-floor)" d="M0 105h840v495H0z"/><g stroke="var(--rmt-room-art-ink)" stroke-width="2" opacity=".22"><path d="M0 105h840M0 240h840M0 380h840M0 580h840M0 600l310-495m-55 495 125-495m205 495L460 105m380 495L530 105"/><g transform="scale(1 .29)">${architecture}</g></g><path fill="var(--rmt-room-art-glass)" opacity=".13" d="m70 70 210 0 280 400H0z"/></svg>`;
}
export function roomSceneCss(root) {
    return `${root} .rmt-room-layout-scene{--rmt-room-art-wall:color-mix(in srgb,var(--rmt-room-paper,#f8f5ed) 87%,var(--rmt-room-accent,#84b7b8));--rmt-room-art-floor:#d6c0a3;--rmt-room-art-wood:#b28d71;--rmt-room-art-cloth:var(--rmt-room-soft,#dbe6ee);--rmt-room-art-cloth2:var(--rmt-room-accent,#8fb2b4);--rmt-room-art-glass:#b1d9dd;--rmt-room-art-ink:#6a5f5b;--rmt-room-art-light:#fff6e8}
${root} .rmt-room-view .rmt-room-layout-scene{position:relative;min-height:480px;padding:62px 22px 14px;isolation:isolate;border:0;border-radius:6px;overflow:hidden;background:var(--rmt-room-art-wall);box-shadow:inset 0 0 45px #604c3718}
${root} .rmt-room-view .rmt-room-layout-scene:before,${root} .rmt-room-view .rmt-room-layout-scene:after{display:none}
${root} .rmt-room-interior-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
${root} .rmt-room-view[data-rmt-room-world="historical"] .rmt-room-layout-scene{--rmt-room-art-wall:#efe0c7;--rmt-room-art-floor:#b5987a;--rmt-room-art-wood:#907258}
${root} .rmt-room-view[data-rmt-room-world="scifi"] .rmt-room-layout-scene{--rmt-room-art-wall:#dce7ed;--rmt-room-art-floor:#879fae;--rmt-room-art-wood:#647c8e;--rmt-room-art-glass:#b0e5e0}
${root} .rmt-room-view[data-rmt-room-world="fantasy"] .rmt-room-layout-scene{--rmt-room-art-wall:#e8deed;--rmt-room-art-floor:#bcb2c6;--rmt-room-art-wood:#93809f}
${root} .rmt-room-layout-scene[data-rmt-room-daypart="night"] .rmt-room-interior-art{filter:brightness(.62) saturate(.75)}
${root} .rmt-room-layout-scene[data-rmt-room-daypart="evening"] .rmt-room-interior-art{filter:sepia(.18)}
${root} .rmt-room-object-layout{position:relative;z-index:3;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 18px;align-items:end}
${root} .rmt-room-view .rmt-room-layout-object,${root} .rmt-room-view .rmt-room-layout-object.active{position:relative;grid-column:var(--rmt-object-column);grid-row:var(--rmt-object-row);min-width:0;min-height:136px;border:1px solid transparent!important;background:transparent!important;box-shadow:none!important;border-radius:18px;padding:2px 5px 8px;display:flex;flex-direction:column;align-items:center;justify-content:end;color:var(--rmt-theme-text,#283c50);cursor:pointer;font:inherit;touch-action:manipulation}
${root} .rmt-room-layout-object .rmt-room-furniture-art{width:100%;max-width:230px;height:134px;overflow:visible;filter:drop-shadow(0 7px 3px #41382817)}
${root} .rmt-room-layout-object[data-rmt-visual-kind="keepsake"] .rmt-room-furniture-art,${root} .rmt-room-layout-object[data-rmt-visual-kind="cup"] .rmt-room-furniture-art{max-width:105px}
${root} .rmt-room-layout-object[data-rmt-visual-kind="book"] .rmt-room-furniture-art,${root} .rmt-room-layout-object[data-rmt-visual-kind="fabric"] .rmt-room-furniture-art{max-width:155px}
${root} .rmt-room-furniture-art .wood{fill:var(--rmt-room-art-wood)}${root} .rmt-room-furniture-art .dark{fill:var(--rmt-room-art-ink)}${root} .rmt-room-furniture-art .cloth{fill:var(--rmt-room-art-cloth)}${root} .rmt-room-furniture-art .cloth2{fill:var(--rmt-room-art-cloth2)}${root} .rmt-room-furniture-art .light{fill:var(--rmt-room-art-light)}${root} .rmt-room-furniture-art .leaf{fill:#85a68a}${root} .rmt-room-furniture-art .glass{fill:var(--rmt-room-art-glass)}${root} .rmt-room-furniture-art .shadow{fill:#453e3820}
${root} .rmt-room-layout-object .rmt-room-layout-name{max-width:100%;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;text-align:center;font-size:13px;line-height:1.6;padding:2px 9px;border-radius:9px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#283c50)}
${root} .rmt-room-layout-object .rmt-room-layout-number{position:absolute;top:0;left:5px;display:grid;place-items:center;width:25px;height:25px;border:1px solid var(--rmt-room-accent);border-radius:50%;background:var(--rmt-room-paper);font-size:12px;color:var(--rmt-room-accent-deep)}
${root} .rmt-room-layout-object.active .rmt-room-furniture-art{filter:drop-shadow(0 0 7px var(--rmt-room-accent))}
${root} .rmt-room-layout-object.active .rmt-room-layout-name{box-shadow:0 0 0 2px var(--rmt-room-accent)}
${root} .rmt-room-layout-object em,${root} .rmt-room-layout-object.focus:after{font-size:11px;line-height:1.5;font-style:normal;padding:1px 8px;background:var(--rmt-room-paper);color:var(--rmt-room-accent-deep);border-radius:8px}
${root} .rmt-room-layout-object.focus:after{content:'正在使用'}
${root} .rmt-room-layout-object:focus-visible,${root} .rmt-room-layout-chip:focus-visible{outline:3px solid var(--rmt-room-accent-deep)!important;outline-offset:2px}
${root} .rmt-room-layout-object:hover .rmt-room-furniture-art{transform:translateY(-3px)}
${root} .rmt-room-object-rail .rmt-room-layout-chip{min-height:48px;display:grid;grid-template-columns:24px 24px minmax(0,1fr);gap:8px;padding:8px;text-align:left}
${root} .rmt-room-layout-chip svg{width:24px;height:24px}${root} .rmt-room-layout-chip .rmt-room-layout-name{font-size:12px;line-height:1.5;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}${root} .rmt-room-layout-chip em{grid-column:3;font-size:11px}
${root} .rmt-room-presence-stage{position:relative;z-index:4;height:176px;margin-top:12px;pointer-events:none}${root} .rmt-room-presence-stage.is-empty{height:80px}${root} .rmt-room-presence-stage .rmt-room-person{left:50%;bottom:2px;transform:translateX(-50%);pointer-events:auto}
${root} .rmt-room-layout-caption{position:relative;z-index:1;margin:12px 0 0;text-align:center;font-size:12px;color:var(--rmt-theme-text,#283c50);line-height:1.5;background:var(--rmt-theme-surface-solid,#fff);border-radius:10px;padding:2px 8px;width:fit-content;margin-left:auto;margin-right:auto}
@media(max-width:600px){${root} .rmt-room-view .rmt-room-layout-scene{padding:50px 10px 12px}${root} .rmt-room-object-layout{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px}${root} .rmt-room-view .rmt-room-layout-object,${root} .rmt-room-view .rmt-room-layout-object.active{grid-column:auto;grid-row:auto;min-height:120px}${root} .rmt-room-layout-object .rmt-room-furniture-art{height:106px}${root} .rmt-room-layout-object .rmt-room-layout-name{font-size:12px}}
@media(prefers-reduced-motion:reduce){${root} .rmt-room-layout-object:hover .rmt-room-furniture-art{transform:none}}`;
}
