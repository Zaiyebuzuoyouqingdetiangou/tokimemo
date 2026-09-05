// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as modes_ending from '../modes/ending.js';
import * as ui_heartView from './heartView.js';
import * as ui_overlay from './overlay.js';

export function selectedEndingRoute() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return null;
    return runtimeState.activeSession.endings.find(item => item.id === runtimeState.activeSession.selectedId)
        || runtimeState.activeSession.endings.find(item => item.id === runtimeState.activeSession.recommendedEndingId)
        || runtimeState.activeSession.endings[0]
        || null;
}

export function endingConfessionTypeLabel(type) {
    return ({
        true: '真心告白',
        mutual: '双向告白',
        friendship: '友情告白',
        indirect: '间接告白',
        relationship: '关系确认',
        rejected: '未被接受',
        other: '告白回看',
    })[type] || '告白回看';
}

export function selectedConfessionReplay() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return null;
    const list = Array.isArray(runtimeState.activeSession.confessionReplays) ? runtimeState.activeSession.confessionReplays : [];
    return list.find(item => item.id === runtimeState.activeSession.selectedConfessionId) || list[0] || null;
}

const ENDING_EASTER_EGG_MAX_LOGS = 12;

function endingEasterEggTimestamp(value = new Date()) {
    const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');
}

function endingEasterEggLogLine(text, value = new Date()) {
    const message = core_text.normalizeText(text, 700).replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '');
    return message ? `[${endingEasterEggTimestamp(value)}] ${message}` : '';
}

export function createEndingEasterEggRuntime(replay, returnFocus = null) {
    const egg = modes_ending.normalizeEndingEasterEgg(replay?.easterEgg, replay);
    const initialCount = Math.min(3, egg.logs.length);
    return {
        replayId: core_text.normalizeText(replay?.id, 80),
        egg,
        logIndex: initialCount % egg.logs.length,
        poemIndex: 1,
        pulseCount: 0,
        paused: false,
        hovered: false,
        stabilized: false,
        intensity: 38,
        feedbackText: egg.statusLine,
        visibleLogs: egg.logs.slice(0, initialCount).map(line => endingEasterEggLogLine(line)).filter(Boolean),
        returnFocus,
    };
}

function endingEasterEggLayer() {
    return globalThis.document?.querySelector?.(`#${core_constants.OVERLAY_ID} [data-rmt-ending-easter]`) || null;
}

function endingEasterEggPoemHtml(runtime) {
    return runtime.egg.poem.slice(0, Math.max(1, runtime.poemIndex)).map((line, index) => (
        `<span data-rmt-easter-poem-line="${index}">${core_text.esc(line)}</span>`
    )).join('');
}

export function endingEasterEggPopupHtml(replay, runtime = createEndingEasterEggRuntime(replay)) {
    const egg = runtime.egg;
    const logs = runtime.visibleLogs.map(line => `<li>${core_text.esc(line)}</li>`).join('');
    const monologue = egg.monologue.map((block, index) => `<p data-rmt-easter-monologue="${index}">${core_text.esc(block)}</p>`).join('');
    return `<div class="rmt-ending-easter-layer" data-rmt-ending-easter data-rmt-easter-module="${core_text.esc(egg.moduleType)}" data-rmt-intensity="${runtime.intensity}">
      <button type="button" class="rmt-ending-easter-backdrop" data-rmt-action="ending-easter-close" aria-label="关闭彩蛋"></button>
      <section class="rmt-ending-easter-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-ending-easter-title" tabindex="-1">
        <header><div><small>PRIVATE EMOTION MODULE</small><h2 id="rmt-ending-easter-title">${core_text.esc(egg.title)}</h2></div><button type="button" class="rmt-ending-easter-close" data-rmt-action="ending-easter-close" aria-label="关闭彩蛋">×</button></header>
        <div class="rmt-ending-easter-core" data-rmt-easter-core tabindex="0" aria-label="悬停或聚焦以读取情感核心">
          <span class="rmt-ending-easter-heart" aria-hidden="true">♥</span>
          <b data-rmt-easter-status>${core_text.esc(runtime.feedbackText)}</b>
          <small data-rmt-easter-metrics>核心强度 ${runtime.intensity}% · 主动触发 ${runtime.pulseCount} 次</small>
          <progress data-rmt-easter-meter max="100" value="${runtime.intensity}">${runtime.intensity}%</progress>
        </div>
        <div class="rmt-ending-easter-controls" aria-label="情感模块交互">
          <button type="button" class="rmt-btn" data-rmt-action="ending-easter-pulse">触碰心跳</button>
          <button type="button" class="rmt-btn" data-rmt-action="ending-easter-reveal">解锁一句话</button>
          <button type="button" class="rmt-btn" data-rmt-action="ending-easter-toggle" aria-pressed="false">暂停日志</button>
          <button type="button" class="rmt-btn" data-rmt-action="ending-easter-stabilize">稳定信号</button>
        </div>
        <section class="rmt-ending-easter-log"><small>情感运行日志</small><ol data-rmt-easter-logs aria-live="polite">${logs}</ol></section>
        <section class="rmt-ending-easter-monologue"><small>没有说出口的内心独白</small>${monologue}</section>
        <section class="rmt-ending-easter-poem" aria-live="polite"><small>逐渐浮现</small><div data-rmt-easter-poem>${endingEasterEggPoemHtml(runtime)}</div></section>
      </section>
    </div>`;
}

function syncEndingEasterEggView() {
    const runtime = runtimeState.endingEasterEggRuntime;
    const layer = endingEasterEggLayer();
    if (!runtime || !layer) return;
    const intensity = Math.max(0, Math.min(100, Math.round(Number(runtime.intensity) || 0)));
    layer.dataset.rmtIntensity = String(intensity);
    layer.dataset.rmtPaused = runtime.paused ? 'true' : 'false';
    layer.dataset.rmtHovered = runtime.hovered ? 'true' : 'false';
    layer.dataset.rmtStabilized = runtime.stabilized ? 'true' : 'false';
    layer.style.setProperty('--rmt-easter-intensity', String(intensity / 100));
    const status = layer.querySelector('[data-rmt-easter-status]');
    if (status) status.textContent = runtime.feedbackText || runtime.egg.statusLine;
    const metrics = layer.querySelector('[data-rmt-easter-metrics]');
    if (metrics) metrics.textContent = `核心强度 ${intensity}% · 主动触发 ${runtime.pulseCount} 次`;
    const meter = layer.querySelector('[data-rmt-easter-meter]');
    if (meter) meter.value = intensity;
    const logList = layer.querySelector('[data-rmt-easter-logs]');
    if (logList && globalThis.document?.createElement) {
        const nodes = runtime.visibleLogs.map(line => {
            const item = document.createElement('li');
            item.textContent = line;
            return item;
        });
        logList.replaceChildren(...nodes);
        logList.scrollTop = logList.scrollHeight;
    }
    const poem = layer.querySelector('[data-rmt-easter-poem]');
    if (poem && globalThis.document?.createElement) {
        const nodes = runtime.egg.poem.slice(0, Math.max(1, runtime.poemIndex)).map(line => {
            const item = document.createElement('span');
            item.textContent = line;
            return item;
        });
        poem.replaceChildren(...nodes);
    }
    const toggle = layer.querySelector('[data-rmt-action="ending-easter-toggle"]');
    if (toggle) {
        toggle.textContent = runtime.paused ? '恢复日志' : '暂停日志';
        toggle.setAttribute('aria-pressed', runtime.paused ? 'true' : 'false');
    }
}

function appendEndingEasterEggLog(text, value = new Date()) {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    const line = endingEasterEggLogLine(text, value);
    if (!line) return false;
    runtime.visibleLogs.push(line);
    if (runtime.visibleLogs.length > ENDING_EASTER_EGG_MAX_LOGS) {
        runtime.visibleLogs.splice(0, runtime.visibleLogs.length - ENDING_EASTER_EGG_MAX_LOGS);
    }
    syncEndingEasterEggView();
    return true;
}

export function endingEasterEggTick(value = new Date()) {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (runtime && (runtimeState.activeMode !== core_constants.MODE.ENDING
        || runtimeState.activeSession?.kind !== core_constants.MODE.ENDING
        || (runtime.session && runtime.session !== runtimeState.activeSession))) {
        closeEndingEasterEgg({ restoreFocus: false });
        return false;
    }
    if (!runtime || runtime.paused || !runtime.egg.logs.length) return false;
    const line = runtime.egg.logs[runtime.logIndex % runtime.egg.logs.length];
    runtime.logIndex = (runtime.logIndex + 1) % runtime.egg.logs.length;
    runtime.intensity = Math.min(96, runtime.intensity + (runtime.hovered ? 2 : 1));
    runtime.feedbackText = runtime.egg.statusLine;
    return appendEndingEasterEggLog(line, value);
}

export function stopEndingEasterEggTimer() {
    if (runtimeState.endingEasterEggTimer) globalThis.clearInterval?.(runtimeState.endingEasterEggTimer);
    runtimeState.endingEasterEggTimer = 0;
}

export function closeEndingEasterEgg({ restoreFocus = true } = {}) {
    const returnFocus = runtimeState.endingEasterEggRuntime?.returnFocus;
    stopEndingEasterEggTimer();
    endingEasterEggLayer()?.remove();
    runtimeState.endingEasterEggRuntime = null;
    if (restoreFocus && returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
}

export function openEndingEasterEgg() {
    const replay = selectedConfessionReplay();
    if (!replay) return null;
    const returnFocus = globalThis.document?.activeElement || null;
    closeEndingEasterEgg({ restoreFocus: false });
    const runtime = createEndingEasterEggRuntime(replay, returnFocus);
    runtime.session = runtimeState.activeSession;
    runtimeState.endingEasterEggRuntime = runtime;
    const overlay = globalThis.document?.getElementById?.(core_constants.OVERLAY_ID);
    if (!overlay || !globalThis.document?.createElement) return runtime;
    const holder = document.createElement('div');
    holder.innerHTML = endingEasterEggPopupHtml(replay, runtime);
    const layer = holder.firstElementChild;
    if (!layer) return runtime;
    overlay.append(layer);
    const core = layer.querySelector('[data-rmt-easter-core]');
    core?.addEventListener('pointerenter', () => endingEasterEggHover(true));
    core?.addEventListener('pointerleave', () => endingEasterEggHover(false));
    core?.addEventListener('focus', () => endingEasterEggHover(true));
    core?.addEventListener('blur', () => endingEasterEggHover(false));
    layer.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeEndingEasterEgg();
        }
    });
    layer.querySelector('.rmt-ending-easter-dialog')?.focus();
    if (typeof globalThis.setInterval === 'function') {
        runtimeState.endingEasterEggTimer = globalThis.setInterval(() => endingEasterEggTick(), 1800);
    }
    syncEndingEasterEggView();
    return runtime;
}

export function endingEasterEggPulse() {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    runtime.pulseCount += 1;
    runtime.stabilized = false;
    runtime.intensity = Math.min(100, runtime.intensity + 13);
    runtime.feedbackText = runtime.egg.feedback.pulse;
    return appendEndingEasterEggLog(runtime.egg.feedback.pulse);
}

export function endingEasterEggHover(active = true) {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    const next = !!active;
    if (runtime.hovered === next) return true;
    runtime.hovered = next;
    runtime.intensity = Math.max(0, Math.min(100, runtime.intensity + (next ? 7 : -3)));
    runtime.feedbackText = next ? runtime.egg.feedback.hover : runtime.egg.statusLine;
    if (next) return appendEndingEasterEggLog(runtime.egg.feedback.hover);
    syncEndingEasterEggView();
    return true;
}

export function endingEasterEggReveal() {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    runtime.poemIndex = Math.min(runtime.egg.poem.length, runtime.poemIndex + 1);
    runtime.feedbackText = runtime.egg.feedback.reveal;
    runtime.intensity = Math.min(100, runtime.intensity + 5);
    return appendEndingEasterEggLog(runtime.egg.feedback.reveal);
}

export function endingEasterEggToggleLogs() {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    runtime.paused = !runtime.paused;
    runtime.feedbackText = runtime.paused ? runtime.egg.feedback.pause : runtime.egg.feedback.resume;
    return appendEndingEasterEggLog(runtime.feedbackText);
}

export function endingEasterEggStabilize() {
    const runtime = runtimeState.endingEasterEggRuntime;
    if (!runtime) return false;
    runtime.stabilized = true;
    runtime.intensity = Math.max(28, Math.min(62, runtime.intensity));
    runtime.feedbackText = runtime.egg.feedback.stabilize;
    return appendEndingEasterEggLog(runtime.egg.feedback.stabilize);
}

export function confessionReplayPlayerHtml(replay, session) {
    const lines = modes_ending.normalizeEndingConfessionLines(replay?.confessionLines, replay?.confessionText);
    if (!lines.length) return `<div class="rmt-ending-confession">${core_text.esc(replay?.confessionText || '')}</div>`;
    const index = Math.max(0, Math.min(lines.length - 1, Math.floor(Number(session?.confessionLineIndex) || 0)));
    session.confessionLineIndex = index;
    const context = core_context.getContext();
    const charName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || context?.name2, 120) || '角色';
    const avatar = ui_heartView.heartCharacterAvatarUrl(runtimeState.activeArchiveSnapshot, context);
    return `<div class="rmt-ending-confession-stage">
      <div class="rmt-ending-confession-dialogue">
        <span class="rmt-ending-confession-avatar">${avatar ? `<img src="${core_text.esc(avatar)}" alt="">` : '<i class="fa-solid fa-heart"></i>'}</span>
        <div class="rmt-ending-confession-bubble"><small>${core_text.esc(charName)}</small><p>${core_text.esc(lines[index])}</p></div>
      </div>
      <div class="rmt-ending-confession-actions">
        <button type="button" class="rmt-btn" data-rmt-action="ending-confession-prev" ${index <= 0 ? 'disabled' : ''}>上一句</button>
        <button type="button" class="rmt-btn" data-rmt-action="ending-confession-replay">重播</button>
        <button type="button" class="rmt-btn" data-rmt-action="ending-confession-next" ${index >= lines.length - 1 ? 'disabled' : ''}>下一句</button>
      </div>
    </div>`;
}

export function renderEnding() {
    closeEndingEasterEgg({ restoreFocus: false });
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.ENDING) return;
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.ENDING]);
    const replays = Array.isArray(session.confessionReplays) ? session.confessionReplays : [];
    const readOnlyArchive = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    const view = session.view === 'confessions' ? 'confessions' : 'routes';
    session.view = view;
    const tabs = `<div class="rmt-ending-tabs"><button type="button" class="rmt-ending-tab ${view === 'routes' ? 'active' : ''}" data-rmt-ending-view="routes">结局路线 <span>${session.endings.length}</span></button><button type="button" class="rmt-ending-tab ${view === 'confessions' ? 'active' : ''}" data-rmt-ending-view="confessions">告白回看 <span>${replays.length}</span></button></div>`;
    const confessionRefreshAction = view === 'confessions' && !readOnlyArchive ? '<button type="button" class="rmt-btn" data-rmt-action="refresh-ending-confessions"><i class="fa-solid fa-rotate"></i> 只重新读取告白</button>' : '';
    const summary = `<section class="rmt-ending-summary"><b>${core_text.esc(session.relationshipState)}</b><p>${core_text.esc(session.relationshipSummary)}</p><div class="rmt-ending-extra-actions">${confessionRefreshAction}<button type="button" class="rmt-btn" data-rmt-action="open-heart"><i class="fa-solid fa-heart"></i> 角色互动</button></div></section>`;
    if (view === 'confessions') {
        const selectedReplay = selectedConfessionReplay();
        if (selectedReplay) session.selectedConfessionId = selectedReplay.id;
        const replayList = replays.map(item => `<button type="button" class="rmt-confession-card ${selectedReplay?.id === item.id ? 'active' : ''}" data-rmt-confession-id="${core_text.esc(item.id)}"><b>${core_text.esc(item.title)}</b><span>${core_text.esc(item.subtitle || item.date || endingConfessionTypeLabel(item.type))}</span><em>${core_text.esc(endingConfessionTypeLabel(item.type))} · ${core_text.esc(item.date || '待定')}</em></button>`).join('');
        const replayDetail = selectedReplay
            ? `<div class="rmt-ending-head"><div><h2>${core_text.esc(selectedReplay.title)}</h2><div class="rmt-ending-subtitle">${core_text.esc(selectedReplay.subtitle || endingConfessionTypeLabel(selectedReplay.type))}</div></div><span>已发生 · 档案回看</span></div>
               <section class="rmt-ending-section"><small>告白场景</small><p>${core_text.esc(selectedReplay.scene)}</p>${confessionReplayPlayerHtml(selectedReplay, session)}<div class="rmt-ending-easter-entry"><button type="button" class="rmt-btn" data-rmt-action="ending-easter-open"><i class="fa-solid fa-heart-pulse"></i> 打开隐藏心跳</button><small>一段只在本地运行的告白彩蛋</small></div></section>
               ${selectedReplay.responseSummary ? `<section class="rmt-ending-section"><small>当时的回应</small><p>${core_text.esc(selectedReplay.responseSummary)}</p></section>` : ''}
               ${selectedReplay.afterEffect ? `<section class="rmt-ending-section"><small>之后</small><p>${core_text.esc(selectedReplay.afterEffect)}</p></section>` : ''}`
            : `<div class="rmt-ending-lock"><b>还没有可回看的告白。</b></div>`;
        ui_overlay.bodyEl().innerHTML = `<div class="rmt-ending">${summary}${tabs}<nav class="rmt-ending-list" aria-label="告白回看">${replayList || '<div class="rmt-ending-lock">没有检测到可验证的告白记录。</div>'}</nav><main class="rmt-ending-detail">${replayDetail}</main></div>`;
        return;
    }
    const selected = selectedEndingRoute();
    if (!selected) {
        ui_overlay.bodyEl().innerHTML = `<div class="rmt-ending">${summary}${tabs}<nav class="rmt-ending-list" aria-label="结局路线"><div class="rmt-ending-lock">当前没有结局路线。</div></nav><main class="rmt-ending-detail"><div class="rmt-ending-lock"><b>结局路线已全部移除。</b><br>可从顶部管理器重新生成整个“结局与后日谈”；告白回看若仍存在，也可切换上方标签继续查看。</div></main></div>`;
        return;
    }
    session.selectedId = selected.id;
    const typeLabel = { route: '当前路线', romance: '恋爱', reverse: '逆转告白', bond: '羁绊', open: '开放', personal: '个人' };
    const routes = session.endings.map(item => `<button type="button" class="rmt-ending-route ${item.id === selected.id ? 'active' : ''} ${item.available ? '' : 'locked'}" data-rmt-ending-id="${core_text.esc(item.id)}"><b>${item.id === session.recommendedEndingId ? '♥ ' : ''}${core_text.esc(item.title)}</b><span>${core_text.esc(item.subtitle || typeLabel[item.type] || '路线')}</span><em>${item.available ? '可观测 · 未来推演' : '未解锁'}</em></button>`).join('');
    const detail = selected.available
        ? `<div class="rmt-ending-head"><div><h2>${core_text.esc(selected.title)}</h2><div class="rmt-ending-subtitle">${core_text.esc(selected.subtitle || typeLabel[selected.type] || '')}</div></div><span>未来路线推演</span></div>
           <section class="rmt-ending-section"><small>终章</small><p>${core_text.esc(selected.endingScene)}</p>${selected.creditsLine ? `<div class="rmt-ending-final">— ${core_text.esc(selected.creditsLine)}</div>` : ''}</section>
           <section class="rmt-ending-section"><small>EPILOGUE // 后日谈 · ${core_text.esc(selected.epilogue?.timeSkip || '未来')}</small><div class="rmt-ending-epilogue">${(selected.epilogue?.scenes || []).map(scene => `<article><b>${core_text.esc(scene.title)}</b><p>${core_text.esc(scene.text)}</p></article>`).join('')}</div>${selected.epilogue?.finalLine ? `<div class="rmt-ending-final">${core_text.esc(selected.epilogue.finalLine)}</div>` : ''}</section>
           `
        : `<div class="rmt-ending-head"><div><h2>${core_text.esc(selected.title)}</h2><div class="rmt-ending-subtitle">${core_text.esc(selected.subtitle || typeLabel[selected.type] || '')}</div></div><span>未解锁</span></div><div class="rmt-ending-lock"><b>这条路线还没有被当前档案解锁。</b><br>${core_text.esc(selected.unlockHint || '继续让关系在真实聊天中自然发展后，再增量更新档案并追加结局。')}</div>`;
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-ending">${summary}${tabs}<nav class="rmt-ending-list" aria-label="结局路线">${routes}</nav><main class="rmt-ending-detail">${detail}</main></div>`;
}

export async function refreshEndingConfessionReplays() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const context = core_context.currentCharacterGuard();
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.ENDING, context)) {
        globalThis.toastr?.info?.('ENDING / 告白扫描已经有任务在进行中，请等它完成。', '心跳回忆');
        return;
    }
    const memoryBank = archive_repository.requireArchive(context);
    const baseSession = structuredClone(runtimeState.activeSession);
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(baseSession, memoryBank, 'confessions');
    if (!sourceMemoryIds.length) {
        globalThis.toastr?.info?.('当前档案没有尚未扫描告白的新记忆。旧告白回看保持不变。', '心跳回忆');
        return;
    }
    const confirmed = ui_overlay.confirmExplicitAction(
        '从新增档案追加“告白回看”？',
        '这次只扫描尚未消费的新档案记忆；旧告白回看逐条原样保留，只追加能被新证据证明的告白 / 关系确认。结局路线、后日谈和 Voice Drama 都不会重写。',
        { destructive: false },
    );
    if (!confirmed) return;
    const expectedChatId = core_context.getChatId(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const scope = core_context.chatScopeKey(context);
    const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    ui_overlay.setInnerLoading(true, '正在从新增档案追加已发生的告白节点…');
    try {
        const raw = await generation_client.requestJson(
            modes_ending.endingConfessionRefreshPrompt(context, memoryBank, baseSession, sourceMemoryIds),
            '正在扫描新增档案里的告白 / 关系确认…',
            {
                maxTokens: 10000,
                temperature: 0.35,
                context,
                origin,
                taskKey: `ending-confessions:${scope}`,
                mode: core_constants.MODE.ENDING,
                background: true,
            },
        );
        const freshReplays = modes_ending.normalizeEndingConfessionReplays(raw?.confessionReplays, memoryBank)
            .filter(item => core_incremental.usesIncrementalMemoryId(item.sourceMemoryIds, sourceMemoryIds));
        const mergedReplays = modes_ending.mergeEndingConfessions(baseSession.confessionReplays, freshReplays);
        const updated = baseSession;
        updated.confessionReplays = mergedReplays.items;
        updated.selectedConfessionId = mergedReplays.added
            ? updated.confessionReplays.at(-1)?.id || updated.selectedConfessionId || ''
            : updated.selectedConfessionId || updated.confessionReplays[0]?.id || '';
        updated.view = 'confessions';
        core_incremental.stampIncrementalCoverage(updated, baseSession, memoryBank, 'confessions', sourceMemoryIds, mergedReplays.added);
        updated.chatId = expectedChatId;
        updated.archiveRevision = expectedArchiveRevision;
        let committed = false;
        if (core_context.isCurrentTaskOrigin(origin)) {
            try {
                const latestMemory = archive_repository.requireArchive(core_context.currentCharacterGuard());
                if (latestMemory.archiveRevision === expectedArchiveRevision) committed = await core_cache.commitSession(core_constants.MODE.ENDING, updated, expectedChatId, origin);
            } catch {}
        }
        if (!committed) core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [core_constants.MODE.ENDING]: updated } });
        if (core_context.isCurrentTaskOrigin(origin) && !document.getElementById(core_constants.OVERLAY_ID)?.hidden) {
            runtimeState.activeMode = core_constants.MODE.ENDING;
            runtimeState.activeSession = updated;
            renderEnding();
        }
        globalThis.toastr?.success?.(`告白回看已追加 ${mergedReplays.added} 条；当前共 ${updated.confessionReplays.length} 条。旧告白、结局路线与后日谈保持不变。`, '心跳回忆');
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('[HeartbeatMemories] confession replay refresh failed', core_text.safeErrorDiagnostic(error));
            ui_overlay.showInlineError(core_text.safeErrorSummary(error));
            globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心跳回忆 · 告白回看更新失败');
        }
    } finally {
        ui_overlay.setInnerLoading(false);
        core_requestCoordinator.refreshConcurrentTaskUi(core_constants.MODE.ENDING, origin);
    }
}

export function endingSetView(view) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return;
    runtimeState.activeSession.view = view === 'confessions' ? 'confessions' : 'routes';
    renderEnding();
}

export function confessionSelect(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return;
    const item = (runtimeState.activeSession.confessionReplays || []).find(replay => replay.id === id);
    if (!item) return;
    runtimeState.activeSession.view = 'confessions';
    runtimeState.activeSession.selectedConfessionId = item.id;
    runtimeState.activeSession.confessionLineIndex = 0;
    renderEnding();
}

export function endingSelect(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return;
    const item = runtimeState.activeSession.endings.find(route => route.id === id);
    if (!item) return;
    runtimeState.activeSession.view = 'routes';
    runtimeState.activeSession.selectedId = item.id;
    runtimeState.activeSession.confessionLineIndex = 0;
    renderEnding();
}

export function endingConfessionStep(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING || runtimeState.activeSession.view !== 'confessions') return;
    const replay = selectedConfessionReplay();
    const lines = modes_ending.normalizeEndingConfessionLines(replay?.confessionLines, replay?.confessionText);
    if (!lines.length) return;
    const current = Math.max(0, Math.min(lines.length - 1, Math.floor(Number(runtimeState.activeSession.confessionLineIndex) || 0)));
    runtimeState.activeSession.confessionLineIndex = Math.max(0, Math.min(lines.length - 1, current + Number(delta || 0)));
    renderEnding();
}

export function replayEndingConfession() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ENDING) return;
    runtimeState.activeSession.confessionLineIndex = 0;
    renderEnding();
}
