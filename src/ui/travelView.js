// Independent code-drawn travel map. Generated values are escaped text or allowlisted tokens;
// route lines, marker positions and postcard composition are entirely local.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_travel from '../modes/travel.js';
import * as ui_overlay from './overlay.js';

export function selectedTravelLocation() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.TRAVEL) return null;
    return runtimeState.activeSession.locations.find(item => item.id === runtimeState.activeSession.selectedLocationId) || null;
}

function travelSourceLabel(item) {
    if (item?.legacyEvidenceUnverified === true) return '旧版自由文字 · 证据未重新核验';
    if (item?.basis === '记忆' && item?.sourceMemoryAnchor) return `剧情足迹 · ${item.sourceMemoryAnchor}`;
    return '角色生活 / 世界设定';
}

// ---------------------------------------------------------------------------
// Postcard picture side.
//
// Every number below is produced locally: either a literal, or a value derived
// from a hash of the location id/name. The model only ever contributes three
// allowlisted enum tokens (mapTheme, sceneTheme, postcard.tone) which are validated in
// modes/travel.js before they reach here. No generated coordinate, colour, URL,
// class name or markup can enter this SVG.
// ---------------------------------------------------------------------------

const POSTCARD_SCENE_WIDTH = 120;
const POSTCARD_SCENE_HEIGHT = 60;
const POSTCARD_SCENE_HORIZON = 52;

// Deterministic small-integer generator so one location always draws the same
// picture across reopens, devices and read-only snapshots.
function sceneRandom(item) {
    let seed = core_text.hashString(`${core_text.normalizeText(item?.id, 80)}|${core_text.normalizeText(item?.name, 120)}|postcard`) >>> 0;
    return (min, max) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const span = Math.max(0, Math.floor(max) - Math.floor(min));
        return Math.floor(min) + (span ? seed % (span + 1) : 0);
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

function scenePeaks(next) {
    let out = '';
    let x = -6;
    while (x < POSTCARD_SCENE_WIDTH + 6) {
        const w = next(22, 34);
        const h = next(20, 38);
        out += `<path class="pc-solid" d="M${x} ${POSTCARD_SCENE_HORIZON} L${x + w / 2} ${POSTCARD_SCENE_HORIZON - h} L${x + w} ${POSTCARD_SCENE_HORIZON} Z"/>`;
        out += `<path class="pc-snow" d="M${x + w / 2 - w / 9} ${POSTCARD_SCENE_HORIZON - h + w / 7} L${x + w / 2} ${POSTCARD_SCENE_HORIZON - h} L${x + w / 2 + w / 9} ${POSTCARD_SCENE_HORIZON - h + w / 7} Z"/>`;
        x += w - next(5, 10);
    }
    return out;
}

function sceneWaves(next) {
    let out = '<path class="pc-sea" d="M0 46 L120 46 L120 60 L0 60 Z"/>';
    for (let i = 0, count = next(3, 4); i < count; i += 1) {
        const y = 49 + i * 3;
        const x = next(4, 35);
        out += `<path class="pc-wave" d="M${x} ${y} q4 -2 8 0 t8 0 t8 0"/>`;
        out += `<path class="pc-wave" d="M${x + 55} ${y + 1} q4 -2 8 0 t8 0"/>`;
    }
    const lx = next(78, 104);
    const top = next(24, 30);
    out += `<path class="pc-solid" d="M${lx - 4} 46 L${lx - 2} ${top} L${lx + 2} ${top} L${lx + 4} 46 Z"/>`;
    out += `<circle class="pc-glow" cx="${lx}" cy="${top - 2}" r="3"/>`;
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

function travelPostcardScene(item, theme) {
    const next = sceneRandom(item);
    const safeTheme = modes_travel.resolveTravelSceneTheme({ sceneTheme: theme }, 'neutral');
    const nightish = safeTheme === 'scifi' || safeTheme === 'fantasy';
    const orb = safeTheme === 'coast' || safeTheme === 'campus'
        ? `<circle class="pc-orb" cx="${next(78, 105)}" cy="${next(10, 18)}" r="${next(6, 9)}"/>`
        : `<circle class="pc-orb" cx="${next(18, 102)}" cy="${next(9, 18)}" r="${next(5, 8)}"/>`;
    const body = safeTheme === 'coast' ? sceneWaves(next)
        : safeTheme === 'forest' ? sceneTrees(next)
        : safeTheme === 'mountain' ? scenePeaks(next)
        : safeTheme === 'campus' ? sceneCampus(next)
        : safeTheme === 'historic' ? sceneHistoric(next)
        : safeTheme === 'fantasy' ? sceneFantasy(next)
        : safeTheme === 'scifi' ? sceneScifi(next)
        : safeTheme === 'city' ? sceneSkyline(next)
        : sceneNeutral(next);
    return `<svg class="rmt-travel-postcard-scene" viewBox="0 0 ${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${core_text.esc(`${item.name} 的明信片风景插画`)}">
      <rect class="pc-sky" x="0" y="0" width="${POSTCARD_SCENE_WIDTH}" height="${POSTCARD_SCENE_HEIGHT}"/>
      ${orb}
      ${nightish ? sceneSky(next) : sceneBirds(next)}
      ${sceneSky(next)}
      ${body}
      <path class="pc-ground" d="M0 ${POSTCARD_SCENE_HORIZON} L${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HORIZON} L${POSTCARD_SCENE_WIDTH} ${POSTCARD_SCENE_HEIGHT} L0 ${POSTCARD_SCENE_HEIGHT} Z"/>
      <path class="pc-path" d="M${next(24, 48)} ${POSTCARD_SCENE_HEIGHT} Q${next(54, 66)} ${next(54, 57)} ${next(70, 96)} ${POSTCARD_SCENE_HORIZON}"/>
    </svg>`;
}

export function travelPostcardHtml(item, session) {
    const card = item?.postcard || {};
    const rawTone = core_text.normalizeText(card.tone, 30).toLowerCase();
    const tone = core_constants.TRAVEL_POSTCARD_TONES.has(rawTone) ? rawTone : 'paper';
    const userName = core_text.normalizeText(runtimeState.activeArchiveSnapshot
        ? runtimeState.activeArchiveSnapshot.memory?.userName
        : core_context.getContext()?.name1, 100) || '你';
    const theme = modes_travel.resolveTravelSceneTheme(item, session?.mapTheme);
    return `<section class="rmt-travel-postcard tone-${tone}" data-rmt-postcard-theme="${theme}" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的明信片">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="travel-close-detail" aria-label="收起明信片">×</button>
      <figure class="rmt-travel-postcard-face">
        ${travelPostcardScene(item, theme)}
        <figcaption><small>GREETINGS FROM</small><b>${core_text.esc(item.region || item.name)}</b></figcaption>
      </figure>
      <div class="rmt-travel-postcard-back">
        ${item?.legacyEvidenceUnverified === true || item?.keepsake?.legacyEvidenceUnverified === true ? '<div class="rmt-travel-legacy-warning">旧版自由文字 · 证据未重新核验</div>' : ''}
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
    const source = item?.keepsake && typeof item.keepsake === 'object' ? item.keepsake : null;
    if (source) {
        const requested = core_text.normalizeText(source.kind, 30).toLowerCase();
        const kind = core_constants.TRAVEL_KEEPSAKE_KINDS.has(requested) ? requested : 'letter';
        return {
            kind, title: core_text.normalizeText(source.title, 120), mark: core_text.normalizeText(source.mark, 80),
            greeting: core_text.normalizeText(source.greeting, 240), body: core_text.normalizeText(source.body, 4000),
            closing: core_text.normalizeText(source.closing, 500), emblem: core_text.normalizeText(source.emblem, 40),
            tone: core_constants.TRAVEL_POSTCARD_TONES.has(core_text.normalizeText(source.tone, 30).toLowerCase()) ? core_text.normalizeText(source.tone, 30).toLowerCase() : 'paper',
        };
    }
    const card = item?.postcard && typeof item.postcard === 'object' ? item.postcard : null;
    return card ? { kind: 'postcard', title: card.title, mark: card.postmark, greeting: card.greeting, body: card.body, closing: card.closing, emblem: card.stampLabel, tone: card.tone } : null;
}

function travelKeepsakeHtml(item, session) {
    const keepsake = travelKeepsakeForView(item);
    if (!keepsake || keepsake.kind === 'postcard') return travelPostcardHtml(item, session);
    const labels = { letter: 'LETTER', journal: 'JOURNAL', scroll: 'SCROLL', fieldnote: 'FIELD NOTE', dossier: 'DOSSIER', datalog: 'DATA LOG', token: 'TOKEN' };
    const label = labels[keepsake.kind] || 'KEEPSAKE';
    const emblem = core_text.normalizeText(keepsake.emblem || label.slice(0, 4), 40);
    const theme = modes_travel.resolveTravelSceneTheme(item, session?.mapTheme);
    return `<section class="rmt-travel-artifact artifact-${keepsake.kind} tone-${core_text.esc(keepsake.tone || 'paper')}" data-rmt-artifact-kind="${keepsake.kind}" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的出行纪念">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="travel-close-detail" aria-label="收起出行纪念">×</button>
      <header class="rmt-travel-artifact-head"><span>${label}</span><i>${core_text.esc(keepsake.mark || item.region || label)}</i></header>
      ${item?.legacyEvidenceUnverified === true || item?.keepsake?.legacyEvidenceUnverified === true ? '<div class="rmt-travel-legacy-warning">旧版自由文字 · 证据未重新核验</div>' : ''}
      <figure class="rmt-travel-artifact-figure" data-rmt-artifact-theme="${core_text.esc(theme)}">${travelPostcardScene(item, theme).replace('rmt-travel-postcard-scene', 'rmt-travel-artifact-scene').replaceAll('pc-', 'artifact-scene-').replace('明信片风景插画', '出行纪念风景插画')}<figcaption>${core_text.esc(item.region || item.name)}</figcaption></figure>
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
      <div class="rmt-travel-dialogue-place"><small>NEARBY STOP · ${core_text.esc(item.distanceLabel)}</small><h3>${core_text.esc(item.name)}</h3><p>${core_text.esc(item.summary)}</p>${item?.legacyEvidenceUnverified === true ? '<div class="rmt-travel-legacy-warning">旧版自由文字 · 证据未重新核验</div>' : ''}</div>
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
    const near = session.locations.filter(item => item.kind === 'near');
    const far = session.locations.filter(item => item.kind === 'far');
    const markerPositions = modes_travel.travelMarkerPositions(session.locations);
    const markers = session.locations.map((item, index) => {
        const position = markerPositions[index];
        const active = selected?.id === item.id;
        const kind = modes_travel.safeTravelLocationKind(item.kind);
        return `<button type="button" class="rmt-travel-marker ${kind} ${active ? 'active' : ''}" style="--map-x:${position.x}%;--map-y:${position.y}%" data-rmt-travel-location="${core_text.esc(item.id)}" aria-label="${core_text.esc(`${kind === 'near' ? '附近地点' : '远方地点'}：${item.name}`)}"><i class="fa-solid ${kind === 'near' ? 'fa-location-dot' : 'fa-envelope'}"></i><span>${core_text.esc(item.name)}</span></button>`;
    }).join('');
    const selectedDetail = selected
        ? selected.kind === 'far' ? travelKeepsakeHtml(selected, session) : travelDialogueHtml(selected, session)
        : '';
    const legendRows = session.locations.map(item => `<button type="button" class="${selected?.id === item.id ? 'active' : ''}" data-rmt-travel-location="${core_text.esc(item.id)}"><i class="fa-solid ${item.kind === 'near' ? 'fa-location-dot' : 'fa-envelope'}"></i><span><b>${core_text.esc(item.name)}</b><small>${core_text.esc(item.region || item.distanceLabel)} · ${core_text.esc(travelSourceLabel(item))}</small></span></button>`).join('');
    body.innerHTML = `<div class="rmt-travel" data-rmt-travel-theme="${modes_travel.safeTravelTheme(session.mapTheme)}">
      <header class="rmt-travel-head"><div><small>THE ROUTES HE TAKES</small><h2>${core_text.esc(session.title)}</h2><p>${core_text.esc(session.routeSummary)}</p></div><div><span><b>${near.length}</b> 附近</span><span><b>${far.length}</b> 远方</span></div></header>
      <div class="rmt-travel-layout">
        <section class="rmt-travel-map" aria-label="他的出行路线地图">
          <div class="rmt-travel-grid" aria-hidden="true"></div>
          <svg class="rmt-travel-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M7 73 C22 57 27 29 46 39 S70 78 93 47"/><path d="M12 22 C31 12 44 27 55 61 S73 86 91 82"/><path d="M18 89 C33 70 54 83 66 52 S81 19 94 17"/></svg>
          <div class="rmt-travel-horizon" aria-hidden="true"><span></span><span></span><span></span></div>
          ${markers}
          ${selectedDetail}
          <div class="rmt-travel-map-key"><span><i class="near"></i>附近 · 点击听他说</span><span><i class="far"></i>远方 · 点击收下纪念</span></div>
        </section>
        <aside class="rmt-travel-index"><div><small>ROUTE INDEX</small><h3>地图坐标</h3></div><nav>${legendRows}</nav></aside>
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
