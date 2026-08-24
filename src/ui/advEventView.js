// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_overlay from './overlay.js';

export function selectedAdvEvent() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return null;
    return runtimeState.activeSession.events.find(x => x.id === runtimeState.activeSession.selectedId) || runtimeState.activeSession.events[0] || null;
}

export function renderAdvMode() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.ADV) return;
    ui_overlay.setBackVisible(true, '当前档案');
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.ADV]);
    const selected = selectedAdvEvent();
    let scope = '';
    try { scope = core_context.chatScopeKey(core_context.currentCharacterGuard()); } catch {}
    const bulkRunning = scope ? runtimeState.activeAdvBulkScopes.has(scope) : false;
    const completedAdv = session.events.filter(item => item.adv?.paragraphs?.length).length;
    const readOnlyArchive = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    const selectedIndex = Math.max(0, session.events.findIndex(item => item.id === selected?.id));
    const list = session.events.map((item, index) => `<button type="button" class="rmt-event ${item.id === session.selectedId ? 'active' : ''}" data-rmt-event-id="${core_text.esc(item.id)}"><span class="rmt-event-index">${String(index + 1).padStart(2, '0')}</span><span class="rmt-event-copy"><b>${core_text.esc(item.title)}</b><small>${core_text.esc(item.date)}</small></span><em class="rmt-event-state">${generation_imageGeneration.normalizeCgImageRecord(item.cgImage) ? '图✓ ' : ''}${item.adv?.paragraphs?.length ? 'ADV✓' : 'CG'}</em></button>`).join('');
    const options = session.events.map((item, index) => `<option value="${core_text.esc(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} · ${core_text.esc(item.title)} · ${core_text.esc(item.date)}${item.adv?.paragraphs?.length ? ' · ADV✓' : ''}</option>`).join('');
    let detail = '';
    if (selected) {
        if (session.view === 'adv' && selected.adv?.paragraphs?.length) {
            const paras = selected.adv.paragraphs;
            session.paragraphIndex = Math.max(0, Math.min(session.paragraphIndex, paras.length - 1));
            detail = `${generation_imageGeneration.cgImageProviderBar({ readOnly: readOnlyArchive })}<div class="rmt-big-cg">${generation_imageGeneration.cgImageLayerHtml(selected, { lazy: false })}<div class="rmt-cg-caption"><b>${core_text.esc(selected.title)}</b> · ${core_text.esc(selected.date)}<br>${core_text.esc(selected.cgDesc)}</div></div>
              <div class="rmt-mode-actions">${readOnlyArchive ? '' : `<button type="button" class="rmt-btn rmt-cg-primary ${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? 'rmt-cg-drawing' : ''}" data-rmt-action="draw-cg" ${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? 'disabled' : ''}>${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? '正在绘制CG…' : generation_imageGeneration.normalizeCgImageRecord(selected.cgImage) ? '↻ 重绘CG' : '🎨 绘制CG'}</button>`}<button type="button" class="rmt-btn" data-rmt-action="cg-only">只看CG</button><button type="button" class="rmt-btn" data-rmt-action="read-adv">阅读ADV</button>${!readOnlyArchive && generation_imageGeneration.normalizeCgImageRecord(selected.cgImage) ? '<button type="button" class="rmt-btn" data-rmt-action="clear-cg-image">恢复抽象CG</button>' : ''}</div>
              <div class="rmt-adv-reader"><div class="rmt-progress">第 ${session.paragraphIndex + 1} 段 / 共 ${paras.length} 段</div><div class="rmt-adv-para">${core_text.esc(paras[session.paragraphIndex])}</div><div class="rmt-reader-actions"><button type="button" class="rmt-btn" data-rmt-action="adv-prev" ${session.paragraphIndex <= 0 ? 'disabled' : ''}>上一段</button><button type="button" class="rmt-btn" data-rmt-action="adv-next">${session.paragraphIndex >= paras.length - 1 ? '重看' : '下一段'}</button></div></div>`;
        } else {
            detail = `${generation_imageGeneration.cgImageProviderBar({ readOnly: readOnlyArchive })}<div class="rmt-big-cg">${generation_imageGeneration.cgImageLayerHtml(selected, { lazy: false })}<div class="rmt-cg-caption"><b>${core_text.esc(selected.title)}</b> · ${core_text.esc(selected.date)}<br>${core_text.esc(selected.cgDesc)}</div></div>
              <div class="rmt-mode-actions">${readOnlyArchive ? '' : `<button type="button" class="rmt-btn rmt-cg-primary ${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? 'rmt-cg-drawing' : ''}" data-rmt-action="draw-cg" ${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? 'disabled' : ''}>${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.ADV, selected.id) ? '正在绘制CG…' : generation_imageGeneration.normalizeCgImageRecord(selected.cgImage) ? '↻ 重绘CG' : '🎨 绘制CG'}</button>`}<button type="button" class="rmt-btn" data-rmt-action="cg-only">只看CG</button><button type="button" class="rmt-btn" data-rmt-action="read-adv" ${bulkRunning || (readOnlyArchive && !selected.adv) ? 'disabled' : ''}>${selected.adv ? '阅读ADV' : readOnlyArchive ? 'ADV 尚未生成' : '生成并阅读ADV'}</button>${!readOnlyArchive && generation_imageGeneration.normalizeCgImageRecord(selected.cgImage) ? '<button type="button" class="rmt-btn" data-rmt-action="clear-cg-image">恢复抽象CG</button>' : ''}</div>
              <div class="rmt-adv-summary">${core_text.esc(selected.cgDesc)}</div>`;
        }
    }
    const recoveryIds = new Set(core_text.cleanArray(session.advBulkRecovery?.failedIds, 64, 100));
    const recoveryCount = session.events.filter(item => !item.adv?.paragraphs?.length && (!recoveryIds.size || recoveryIds.has(item.id))).length;
    const recoveryActions = !readOnlyArchive && recoveryCount > 0 && session.advBulkRecovery
        ? `<div class="rmt-adv-recovery"><button type="button" class="rmt-btn" data-rmt-action="repair-failed-adv" ${bulkRunning ? 'disabled' : ''}>逐个补失败项 · ${recoveryCount}</button></div>`
        : '';
    const bulkLabel = session.advBulkRecovery && recoveryCount
        ? `重试失败批 · 最多${core_constants.ADV_BULK_BATCH_SIZE}篇`
        : completedAdv ? `生成下一批 ADV · 最多${core_constants.ADV_BULK_BATCH_SIZE}篇` : `生成第一批 ADV · 最多${core_constants.ADV_BULK_BATCH_SIZE}篇`;
    const bulkBar = `<div class="rmt-adv-bulkbar"><div><b>ADV ${completedAdv}/${session.events.length}</b><span>${readOnlyArchive ? '只读' : completedAdv >= session.events.length ? '已完成' : `每批最多 ${core_constants.ADV_BULK_BATCH_SIZE} 篇`}</span></div>${readOnlyArchive ? '' : `<button type="button" class="rmt-btn" data-rmt-action="generate-all-adv" ${bulkRunning || completedAdv >= session.events.length ? 'disabled' : ''}>${bulkRunning ? '生成中…' : bulkLabel}</button>`}</div>${recoveryActions}`;
    const mobilePicker = `<div class="rmt-adv-mobile-picker"><div class="rmt-adv-picker-status"><b>${String(selectedIndex + 1).padStart(2, '0')} / ${session.events.length}</b><span>${core_text.esc(selected?.title || '')}</span></div><select data-rmt-adv-select aria-label="选择 ADV EVENT 事件">${options}</select><div class="rmt-adv-picker-actions"><button type="button" class="rmt-btn" data-rmt-action="adv-event-prev" ${selectedIndex <= 0 ? 'disabled' : ''}>← 上一个</button><button type="button" class="rmt-btn" data-rmt-action="adv-event-next" ${selectedIndex >= session.events.length - 1 ? 'disabled' : ''}>下一个 →</button></div></div>`;
    const body = ui_overlay.bodyEl();
    body.innerHTML = `<div class="rmt-adv"><aside class="rmt-event-list">${bulkBar}${mobilePicker}<div class="rmt-event-items">${list}</div></aside><section class="rmt-event-detail">${detail}</section><div class="rmt-inline-status" hidden></div></div>`;
}

export function advSelect(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return;
    const item = runtimeState.activeSession.events.find(x => x.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedId = item.id;
    runtimeState.activeSession.view = 'cg';
    runtimeState.activeSession.paragraphIndex = 0;
    renderAdvMode();
}

export function advEventStep(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV || !runtimeState.activeSession.events.length) return;
    const current = Math.max(0, runtimeState.activeSession.events.findIndex(item => item.id === runtimeState.activeSession.selectedId));
    const next = Math.max(0, Math.min(runtimeState.activeSession.events.length - 1, current + delta));
    const item = runtimeState.activeSession.events[next];
    if (!item || next === current) return;
    runtimeState.activeSession.selectedId = item.id;
    runtimeState.activeSession.view = 'cg';
    runtimeState.activeSession.paragraphIndex = 0;
    renderAdvMode();
}

export function advStep(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ADV) return;
    const event = selectedAdvEvent();
    const paras = event?.adv?.paragraphs || [];
    if (!paras.length) return;
    if (delta > 0 && runtimeState.activeSession.paragraphIndex >= paras.length - 1) {
        runtimeState.activeSession.paragraphIndex = 0;
    } else {
        runtimeState.activeSession.paragraphIndex = Math.max(0, Math.min(paras.length - 1, runtimeState.activeSession.paragraphIndex + delta));
    }
    renderAdvMode();
}
