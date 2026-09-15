// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from './overlay.js';

export function renderButterfly() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.BUTTERFLY) return;
    session.selected = Math.max(1, Math.min(Number(session.selected) || 1, session.nodes.length - 1));
    const selected = session.nodes[session.selected];
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.BUTTERFLY]);
    const main = session.nodes[0];
    const branches = session.nodes.slice(1, -1);
    const ending = session.nodes[session.nodes.length - 1];
    const branchNodes = branches.map((node, index) => `<button type="button" class="rmt-node rmt-branch-node ${index + 1 === session.selected ? 'active' : ''}" data-rmt-node="${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span>${core_text.esc(node.label)}</button>`).join('');
    const endingIndex = session.nodes.length - 1;
    const isOmega = session.selected === endingIndex || !!selected.trueEnding;
    const observerName = core_text.esc(session.subject || runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext().name2 || '{{char}}');
    const observationPanel = isOmega
        ? `<section class="rmt-terminal-block rmt-observation-screen rmt-omega-screen">
            <div class="rmt-terminal-section-title">III. OBSERVATION POINT Ω // 现世终局观测</div>
            <div class="rmt-record-code">${core_text.esc(selected.code || '> OBSERVATION POINT #OMEGA')}</div>
            <div class="rmt-signal rmt-omega-signal"><div class="rmt-signal-noise"></div><div class="rmt-signal-center">[ ALL PARALLEL SUBJECT FEEDS CLOSED ]<br>[ RETURNING TO MAIN WORLDLINE ]</div></div>
            <div class="rmt-mono rmt-omega-monologue"><b>CURRENT WORLD SUBJECT // 现世 ${observerName} 最终发言</b><br>${core_text.esc(selected.intervention)}</div>
          </section>
          <section class="rmt-terminal-block rmt-system-block"><div class="rmt-terminal-section-title">IV. SYSTEM NOTE // 观测完成</div><div class="rmt-system-note">${core_text.esc(selected.systemNote)}</div></section>`
        : `<section class="rmt-terminal-block rmt-observation-screen">
            <div class="rmt-terminal-section-title">III. OBSERVATION SCREEN // 平行世界观测</div>
            <div class="rmt-record-code">${core_text.esc(selected.code)}</div>
            <div class="rmt-signal" data-rmt-signal><div class="rmt-signal-noise"></div><div class="rmt-signal-center">[ SIGNAL LOST: IMAGE DATA CORRUPTED ]</div></div>
            <div class="rmt-mono"><b>PARALLEL SUBJECT // 平行世界 ${observerName} 本人发言</b><br>${core_text.esc(selected.monologue)}</div>
          </section>
          <section class="rmt-terminal-block rmt-intervention-block"><div class="rmt-terminal-section-title">IV. CURRENT-WORLD RESPONSE // 现世回应</div><div class="rmt-intervention">${core_text.esc(selected.intervention)}</div></section>
          <section class="rmt-terminal-block rmt-system-block"><div class="rmt-terminal-section-title">V. SYSTEM NOTE // 系统评估</div><div class="rmt-system-note">${core_text.esc(selected.systemNote)}</div></section>`;
    const body = ui_overlay.bodyEl();
    body.innerHTML = `<div class="rmt-crt"><div class="rmt-crt-content">
      <section class="rmt-terminal-block rmt-terminal-header-block">
        <div class="rmt-terminal-section-title">I. TERMINAL HEADER // 终端抬头</div>
        <div class="rmt-terminal-head">&gt; TEMPORAL OBSERVATION UNIT // SUBJECT: ${observerName} // STATUS: UNSTABLE</div>
        <div class="rmt-terminal-codeflow">0101::TEMPORAL-LINK / WORLD-LINE SCAN / SUBJECT LOCKED / DIVERGENCE SIGNAL ACTIVE</div>
      </section>
      <section class="rmt-terminal-block rmt-divergence-map-block">
        <div class="rmt-terminal-section-title">II. DIVERGENCE MAP // 时间分歧树</div>
        <div class="rmt-tree-root"><button type="button" class="rmt-node rmt-main-node" disabled><span>MAIN</span>${core_text.esc(main.label)} <em>LOCKED</em></button></div>
        <div class="rmt-tree-trunk" aria-hidden="true"></div>
        <div class="rmt-tree-branches">${branchNodes}</div>
        <div class="rmt-tree-ending"><button type="button" class="rmt-node true-ending ${endingIndex === session.selected ? 'active' : ''}" data-rmt-node="${endingIndex}"><span>Ω</span>${core_text.esc(ending.label)}</button></div>
      </section>
      ${observationPanel}
    </div></div>`;
}

export function selectButterflyNode(index) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.BUTTERFLY) return;
    const next = Math.max(1, Math.min(Number(index) || 1, runtimeState.activeSession.nodes.length - 1));
    if (runtimeState.butterflyTransitionTimer) clearTimeout(runtimeState.butterflyTransitionTimer);
    const signal = document.querySelector('[data-rmt-signal]');
    document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-node]`).forEach(button => { button.disabled = true; });
    if (signal) {
        signal.classList.add('loading');
        signal.innerHTML = '<div class="rmt-signal-noise"></div><div class="rmt-signal-center">SIGNAL INTERFERENCE // LOADING TEMPORAL DATA</div>';
    }
    runtimeState.butterflyTransitionTimer = window.setTimeout(() => {
        runtimeState.butterflyTransitionTimer = 0;
        if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.BUTTERFLY) return;
        runtimeState.activeSession.selected = next;
        renderButterfly();
    }, 1000);
}
