import * as constants from '../core/constants.js';
import * as cards from '../core/lenticularCards.js';
import * as targets from '../core/cgTargets.js';
import * as images from '../core/cgImagePatch.js';
import * as text from '../core/text.js';
import * as cacheApi from '../core/cache.js';
import * as contextApi from '../core/context.js';
import * as actions from '../generation/pastLivesCardActions.js';
import * as image_menu from './imageMenu.js';

const esc = text.esc;
let disposeCurrent = null;

export function pastLivesCardHtml(session, descriptor, cache, readOnly = false, { menuButtons = '' } = {}) {
    const resolved = targets.expandedCgItem(session, descriptor);
    if (!resolved) return '';
    const item = resolved.item, front = images.normalizeCgImageRecord(item.cgImage);
    const pair = cards.pastLivesCardPair(session, item.id);
    const back = pair && cards.resolveCardReference(cache, session, pair.reference);
    const both = !!(front && back);
    const photo = (record, side, title) => `<img class="rmt-lenticular-${side}" data-card-image="${side}" src="${esc(record.url)}" alt="${esc(title)}" decoding="async" referrerpolicy="no-referrer">`;
    return `<figure class="rmt-lenticular" data-rmt-lenticular="${esc(item.id)}" data-card-both="${both}">
        <div class="rmt-lenticular-stage" style="--card-position:0;--card-shine:15%;--card-turn:0deg">
            <div class="rmt-lenticular-surface">${front ? photo(front, 'past', '前世 · ' + item.title) : '<span class="rmt-lenticular-empty">前世还未留下画面</span>'}
                ${back ? photo(back.image, 'present', '今生 · ' + back.title) : ''}<span class="rmt-lenticular-foil" aria-hidden="true"></span>
                <span class="rmt-lenticular-face">${front ? '前世' : back ? '今生' : '前世 · 今生'}</span>
            </div>
        </div>
        ${image_menu.imageMenuHtml(`${menuButtons}${readOnly ? '' : `<button type="button" class="rmt-btn" data-card-pick>${pair ? '更换今生' : '挑一张今生'}</button>${pair ? '<button type="button" class="rmt-btn" data-card-clear>移除配对</button>' : ''}`}<button type="button" class="rmt-btn" data-card-tilt hidden>启用倾斜</button>`)}
        <figcaption><div class="rmt-lenticular-controls"><button type="button" data-card-side="0" ${both ? '' : 'disabled'}>前世</button><input type="range" min="0" max="100" value="0" step="1" aria-label="前世与今生" aria-valuetext="前世" ${both ? '' : 'disabled'}><button type="button" data-card-side="100" ${both ? '' : 'disabled'}>今生</button></div>
            <p class="rmt-lenticular-status" role="status">${pair && !back ? '原图已不可用，请重新挑选今生。' : !back ? '今生还没留下画面' : !front ? '生成前世画面后即可切换两面' : '横滑或拖动滑杆，看见另一世'}</p>
        </figcaption>
    </figure>`;
}

function openPicker(root, entries, selected, commit, onClose) {
    const host = root.closest('.rmt-shell') || root.parentElement;
    const previous = root.ownerDocument.activeElement;
    const panel = root.ownerDocument.createElement('div');
    panel.className = 'rmt-card-picker';
    panel.innerHTML = `<section role="dialog" aria-modal="true" aria-label="挑一张今生" tabindex="-1"><header><h3>挑一张今生</h3><button type="button" class="rmt-btn" data-picker-close aria-label="关闭选图">×</button></header><div class="rmt-card-picker-filters"><input type="search" aria-label="搜索已有图片" placeholder="搜索画面"><select aria-label="筛选图片来源"><option value="">全部来源</option>${[...new Set(entries.map(row => row.reference.mode))].map(mode => `<option value="${esc(mode)}">${esc(entries.find(row => row.reference.mode === mode).label)}</option>`).join('')}</select></div><p class="rmt-card-picker-status" role="status"></p><div class="rmt-card-picker-grid"></div></section>`;
    host.appendChild(panel);
    const grid = panel.querySelector('.rmt-card-picker-grid'), status = panel.querySelector('[role="status"]');
    const search = panel.querySelector('input'), filter = panel.querySelector('select');
    let busy = false, closed = false;
    const close = () => {
        if (closed) return;
        closed = true; panel.ownerDocument.removeEventListener('keydown', keydown, true); panel.remove();
        if (previous?.isConnected) previous.focus();
        onClose?.();
    };
    const render = () => {
        const query = search.value.trim().toLocaleLowerCase();
        const visible = entries.map((entry, index) => ({ ...entry, index })).filter(entry => (!filter.value || entry.reference.mode === filter.value)
            && [entry.title, entry.label, ...entry.sharedMemoryIds].join(' ').toLocaleLowerCase().includes(query));
        status.textContent = entries.length ? visible.length ? '' : '没有匹配的画面' : '今生还没留下画面。先在其他模块保存一张图，再来挑选。';
        grid.innerHTML = visible.map(entry => `<button type="button" class="rmt-card-choice" data-picker-index="${entry.index}" aria-pressed="${JSON.stringify(entry.reference) === JSON.stringify(selected)}"><span class="rmt-card-choice-picture"><img src="${esc(entry.image.url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><b>${esc(entry.title)}</b><small>${esc(entry.label)}${entry.sourceLabel ? ' · ' + esc(entry.sourceLabel) : ''}</small>${entry.sharedMemoryIds.length ? `<span class="rmt-card-recommend">推荐 · 与本篇回响同源 ${esc(entry.sharedMemoryIds.join('、'))}</span>` : ''}</button>`).join('');
        for (const img of grid.querySelectorAll('img')) img.addEventListener('error', () => {
            img.hidden = true;
            const button = img.closest('button'); button.disabled = true;
            img.parentElement.textContent = '图片暂不可读取';
        }, { once: true });
    };
    const keydown = event => {
        if (closed || !panel.isConnected) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) close(); }
        else if (event.key === 'Tab') {
            const focusable = [...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && (panel.ownerDocument.activeElement === first || !panel.contains(panel.ownerDocument.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (panel.ownerDocument.activeElement === last || !panel.contains(panel.ownerDocument.activeElement))) { event.preventDefault(); first?.focus(); }
        }
    };
    panel.ownerDocument.addEventListener('keydown', keydown, true);
    search.addEventListener('input', render); filter.addEventListener('change', render);
    panel.addEventListener('click', async event => {
        event.stopPropagation();
        if (event.target.closest('[data-picker-close]')) { if (!busy) close(); return; }
        const button = event.target.closest('[data-picker-index]');
        if (!button || busy || button.disabled) return;
        const entry = entries[Number(button.dataset.pickerIndex)];
        if (!entry) return;
        busy = true; panel.setAttribute('aria-busy', 'true');
        for (const control of panel.querySelectorAll('input,select,[data-picker-index]')) control.disabled = true;
        status.textContent = '正在保存配对…';
        try { await commit(entry.reference); close(); }
        catch (error) { if (!closed) { render(); status.textContent = text.safeErrorSummary(error); } }
        finally { busy = false; panel.removeAttribute('aria-busy'); search.disabled = false; filter.disabled = false; }
    });
    render(); search.focus();
    return close;
}

// Ownership lasts only while this reading page is mounted. In particular, sensor
// listeners and permission promises must not survive a chat/page/overlay change.
export function bindPastLivesCard(body, session, stored, { readOnly = false, onChange = () => {} } = {}) {
    disposeCurrent?.();
    const root = body?.querySelector('[data-rmt-lenticular]');
    if (!root) return;
    const descriptor = targets.cgTargetDescriptorFromItemId(root.dataset.rmtLenticular);
    const stage = root.querySelector('.rmt-lenticular-stage'), slider = root.querySelector('input[type="range"]');
    const label = root.querySelector('.rmt-lenticular-face'), status = root.querySelector('[role="status"]');
    const tilt = root.querySelector('[data-card-tilt]');
    const win = body.ownerDocument.defaultView || globalThis;
    const host = root.closest('#' + constants.OVERLAY_ID);
    let live = true, both = root.dataset.cardBoth === 'true', drag = null, closePicker = null, sensor = null, sensorTimer = null, sensorEpoch = 0;
    const setPosition = value => {
        if (!live || !root.isConnected) return;
        const position = Math.max(0, Math.min(100, value));
        stage.style.setProperty('--card-position', String(both ? position / 100 : 0));
        stage.style.setProperty('--card-shine', position + '%');
        stage.style.setProperty('--card-turn', ((position - 50) / 25) + 'deg');
        slider.value = String(position);
        if (both) slider.setAttribute('aria-valuetext', position < 45 ? '前世' : position > 55 ? '今生' : '两世交叠');
        if (both) label.textContent = position < 45 ? '前世' : position > 55 ? '今生' : '前世 · 今生';
    };
    const stopSensor = () => {
        sensorEpoch++;
        if (sensor) win.removeEventListener('deviceorientation', sensor);
        sensor = null; win.clearTimeout(sensorTimer); sensorTimer = null;
        tilt.disabled = false; tilt.textContent = '启用倾斜'; tilt.setAttribute('aria-pressed', 'false');
    };
    const dispose = () => {
        if (!live) return;
        live = false; stopSensor(); closePicker?.(); observer?.disconnect();
        if (disposeCurrent === dispose) disposeCurrent = null;
    };
    const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => {
        if (!root.isConnected || host?.hidden || host?.getAttribute('aria-hidden') === 'true') dispose();
    }) : null;
    observer?.observe(body, { childList: true });
    if (host) observer?.observe(host, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    observer?.observe(body.ownerDocument.body, { childList: true });
    disposeCurrent = dispose;
    slider.addEventListener('input', () => { stopSensor(); setPosition(Number(slider.value)); });
    for (const button of root.querySelectorAll('[data-card-side]')) button.addEventListener('click', event => {
        event.stopPropagation(); stopSensor(); setPosition(Number(button.dataset.cardSide));
    });
    stage.addEventListener('pointerdown', event => {
        if (event.isPrimary === false || event.button > 0) return;
        stopSensor(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: Number(slider.value), horizontal: false };
    });
    stage.addEventListener('pointermove', event => {
        if (!live || closePicker) return;
        const rect = stage.getBoundingClientRect();
        if (drag?.id === event.pointerId) {
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; return; }
            if (!drag.horizontal && Math.abs(dx) > 8) { drag.horizontal = true; stage.setPointerCapture?.(event.pointerId); }
            if (drag.horizontal) setPosition(drag.start + dx / Math.max(1, rect.width) * 160);
        } else if (event.pointerType === 'mouse' && !sensor) setPosition((event.clientX - rect.left) / Math.max(1, rect.width) * 100);
    });
    const finishDrag = () => { drag = null; };
    stage.addEventListener('pointerup', finishDrag); stage.addEventListener('pointercancel', finishDrag); stage.addEventListener('lostpointercapture', finishDrag);
    for (const img of root.querySelectorAll('[data-card-image]')) img.addEventListener('error', () => {
        img.hidden = true; both = false; root.dataset.cardBoth = 'false';
        root.classList.add(img.dataset.cardImage === 'present' ? 'is-present-unavailable' : 'is-past-unavailable');
        for (const control of root.querySelectorAll('[data-card-side],input[type="range"]')) control.disabled = true;
        label.textContent = img.dataset.cardImage === 'present' ? '前世' : '今生';
        status.textContent = '图片暂不可读取，可更换今生或检查原图。'; setPosition(0);
    }, { once: true });
    tilt.hidden = typeof win.DeviceOrientationEvent === 'undefined';
    tilt.setAttribute('aria-pressed', 'false');
    tilt.addEventListener('click', async event => {
        event.stopPropagation();
        if (sensor) { stopSensor(); return; }
        const epoch = ++sensorEpoch; tilt.disabled = true;
        try {
            const permission = typeof win.DeviceOrientationEvent?.requestPermission === 'function'
                ? await win.DeviceOrientationEvent.requestPermission() : 'granted';
            if (!live || epoch !== sensorEpoch) return;
            if (permission !== 'granted') throw new Error('permission');
            let baseline = null;
            sensor = event => {
                if (!live || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
                const angle = Number(win.screen?.orientation?.angle ?? win.orientation ?? 0);
                const value = Math.abs(angle) === 90 ? event.beta * (angle === 90 ? -1 : 1) : event.gamma * (Math.abs(angle) === 180 ? -1 : 1);
                if (baseline === null) baseline = value;
                win.clearTimeout(sensorTimer); sensorTimer = null;
                if (!closePicker) setPosition(50 + (value - baseline) * 2);
            };
            win.addEventListener('deviceorientation', sensor);
            tilt.disabled = false; tilt.textContent = '停止倾斜'; tilt.setAttribute('aria-pressed', 'true');
            sensorTimer = win.setTimeout(() => { stopSensor(); if (live) status.textContent = '未收到倾斜数据，仍可横滑或使用滑杆。'; }, 4000);
        } catch { if (live && epoch === sensorEpoch) { stopSensor(); status.textContent = '暂不能读取倾斜，仍可横滑或使用滑杆。'; } }
    });
    root.addEventListener('click', async event => {
        const pick = event.target.closest('[data-card-pick]'), clear = event.target.closest('[data-card-clear]');
        if (!pick && !clear) return;
        event.stopPropagation();
        if (readOnly || !live || closePicker) return;
        stopSensor();
        try {
            const captured = actions.capturePastLivesCard(session, descriptor);
            if (!captured) throw text.safeUserError('请在当前聊天的前世今生中选择画面。', 'RMT_CARD_READ_ONLY');
            if (clear) {
                clear.disabled = true;
                try { await actions.savePastLivesCard(captured, null); if (live) onChange(); }
                finally { clear.disabled = false; }
                return;
            }
            const currentCache = cacheApi.getCache(contextApi.currentCharacterGuard());
            const entries = cards.cardImageCatalog(currentCache, session, cards.cardEchoMemoryIds(session, descriptor.containerId));
            closePicker = openPicker(root, entries, cards.pastLivesCardPair(session, root.dataset.rmtLenticular)?.reference,
                async reference => {
                    if (!live) throw text.safeUserError('阅读页面已关闭，请重新选图。', 'RMT_CARD_CLOSED');
                    await actions.savePastLivesCard(captured, reference);
                    closePicker?.(); if (live) onChange();
                }, () => { closePicker = null; });
        } catch (error) { if (live) status.textContent = text.safeErrorSummary(error); }
    });
}
