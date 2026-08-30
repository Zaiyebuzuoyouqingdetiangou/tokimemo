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
    if (item?.basis === '记忆' && item?.sourceMemoryAnchor) return `剧情足迹 · ${item.sourceMemoryAnchor}`;
    return '角色生活 / 世界设定';
}

function travelPostcardHtml(item) {
    const card = item?.postcard || {};
    const userName = core_text.normalizeText(runtimeState.activeArchiveSnapshot
        ? runtimeState.activeArchiveSnapshot.memory?.userName
        : core_context.getContext()?.name1, 100) || '你';
    return `<section class="rmt-travel-postcard tone-${core_text.esc(card.tone || 'paper')}" role="dialog" aria-modal="false" aria-label="${core_text.esc(item.name)}的文字明信片">
      <button type="button" class="rmt-travel-detail-close" data-rmt-action="travel-close-detail" aria-label="收起明信片">×</button>
      <div class="rmt-travel-postcard-mark"><span>${core_text.esc(card.stampLabel || 'POST')}</span><i>${core_text.esc(card.postmark || item.region || 'FAR AWAY')}</i></div>
      <div class="rmt-travel-postcard-copy">
        <small>POSTCARD FROM ${core_text.esc(item.region || item.name)}</small>
        <h3>${core_text.esc(card.title)}</h3>
        ${card.greeting ? `<b>${core_text.esc(card.greeting)}</b>` : ''}
        <p>${core_text.esc(card.body)}</p>
        <footer>${core_text.esc(card.closing)}</footer>
      </div>
      <div class="rmt-travel-postcard-address"><span>TO</span><b>${core_text.esc(userName)}</b><small>${core_text.esc(item.distanceLabel)}</small></div>
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
      <div class="rmt-travel-dialogue-place"><small>NEARBY STOP · ${core_text.esc(item.distanceLabel)}</small><h3>${core_text.esc(item.name)}</h3><p>${core_text.esc(item.summary)}</p></div>
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
        ? selected.kind === 'far' ? travelPostcardHtml(selected) : travelDialogueHtml(selected, session)
        : '';
    const legendRows = session.locations.map(item => `<button type="button" class="${selected?.id === item.id ? 'active' : ''}" data-rmt-travel-location="${core_text.esc(item.id)}"><i class="fa-solid ${item.kind === 'near' ? 'fa-location-dot' : 'fa-envelope'}"></i><span><b>${core_text.esc(item.name)}</b><small>${core_text.esc(item.region || item.distanceLabel)} · ${core_text.esc(travelSourceLabel(item))}</small></span></button>`).join('');
    body.innerHTML = `<div class="rmt-travel" data-rmt-travel-theme="${core_text.esc(session.mapTheme)}">
      <header class="rmt-travel-head"><div><small>THE ROUTES HE TAKES</small><h2>${core_text.esc(session.title)}</h2><p>${core_text.esc(session.routeSummary)}</p></div><div><span><b>${near.length}</b> 附近</span><span><b>${far.length}</b> 远方</span></div></header>
      <div class="rmt-travel-layout">
        <section class="rmt-travel-map" aria-label="他的出行路线地图">
          <div class="rmt-travel-grid" aria-hidden="true"></div>
          <svg class="rmt-travel-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M7 73 C22 57 27 29 46 39 S70 78 93 47"/><path d="M12 22 C31 12 44 27 55 61 S73 86 91 82"/><path d="M18 89 C33 70 54 83 66 52 S81 19 94 17"/></svg>
          <div class="rmt-travel-horizon" aria-hidden="true"><span></span><span></span><span></span></div>
          ${markers}
          ${selectedDetail}
          <div class="rmt-travel-map-key"><span><i class="near"></i>附近 · 点击听他说</span><span><i class="far"></i>远方 · 点击收明信片</span></div>
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
