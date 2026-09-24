import * as contextApi from '../core/context.js';
import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as people from '../core/participants.js';
import * as repository from '../archive/repository.js';
import * as text from '../core/text.js';

let activePicker = null;

export function closeParticipantPicker() {
    const current = activePicker;
    if (!current) return false;
    activePicker = null;
    current.controller.abort();
    current.element.remove();
    if (current.opener?.isConnected) current.opener.focus();
    current.onClose?.();
    return true;
}

function dialog(context, title, body) {
    const host = document.getElementById(constants.OVERLAY_ID);
    if (!host) return null;
    closeParticipantPicker();
    const element = document.createElement('div');
    element.className = 'rmt-participant-backdrop';
    element.innerHTML = `<section class="rmt-participant-dialog" role="dialog" aria-modal="true" aria-labelledby="rmt-participant-title" tabindex="-1">
      <header><h2 id="rmt-participant-title">${text.esc(title)}</h2><button type="button" class="rmt-btn" data-rmt-participant-close>取消</button></header>
      ${body}<p data-rmt-participant-status role="status" aria-live="polite"></p></section>`;
    const current = { element, context, scope: contextApi.chatScopeKey(context),
        controller: new AbortController(), opener: document.activeElement };
    activePicker = current;
    current.isCurrent = () => {
        if (activePicker !== current || !element.isConnected || current.controller.signal.aborted) return false;
        try { return current.scope === contextApi.chatScopeKey(contextApi.currentCharacterGuard()); }
        catch { return false; }
    };
    element.querySelector('[data-rmt-participant-close]').addEventListener('click', event => {
        event.stopPropagation(); closeParticipantPicker();
    });
    element.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeParticipantPicker(); return; }
        if (event.key !== 'Tab') return;
        const fields = [...element.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')]
            .filter(field => !field.disabled && !field.hidden && field.getClientRects().length);
        if (!fields.length) { event.preventDefault(); return; }
        const first = fields[0], last = fields.at(-1);
        if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
        }
    });
    host.appendChild(element);
    element.querySelector('section').focus();
    return current;
}

function status(current, message, error = false) {
    if (!current.isCurrent()) return;
    const node = current.element.querySelector('[data-rmt-participant-status]');
    node.setAttribute('role', error ? 'alert' : 'status');
    node.textContent = message;
}

export function showArchiveCardTypePicker({ context = contextApi.currentCharacterGuard(), onSingle, onMultiple } = {}) {
    const current = dialog(context, '这是一张单人卡，还是多人卡？', `
      <div class="rmt-participant-card-types">
        <button type="button" class="rmt-btn" data-rmt-card-type="single"><b>单人卡</b><span>沿用原来的建档方式</span></button>
        <button type="button" class="rmt-btn" data-rmt-card-type="multi"><b>多人卡</b><span>从世界书勾选要加入回廊的人物</span></button>
      </div>`);
    if (!current) return false;
    for (const button of current.element.querySelectorAll('[data-rmt-card-type]')) button.addEventListener('click', event => {
        event.stopPropagation();
        if (!current.isCurrent()) return;
        const callback = button.dataset.rmtCardType === 'single' ? onSingle : onMultiple;
        closeParticipantPicker();
        callback?.();
    });
    return true;
}

const sourceKey = ref => JSON.stringify([ref.world, String(ref.uid)]);
const copySource = entry => ({ world: entry.world, uid: String(entry.uid), title: entry.title,
    content: entry.content, keys: [...(entry.keys || [])] });

// This is intentionally called only from the visible random-selection button.
// Re-rendering and confirmation must reuse the selected draft ID, never roll again.
export function chooseRandomParticipantId(roster, { excludedIds = [], random = Math.random } = {}) {
    const normalized = people.normalizeParticipantRoster(roster);
    if (!normalized) return '';
    const excluded = new Set(excludedIds);
    const candidates = normalized.people.filter(person => person.identity !== 'user' && !excluded.has(person.id));
    if (!candidates.length) return '';
    const value = Number(random());
    const index = Math.min(candidates.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * candidates.length)));
    return candidates[index].id;
}

// Selection is local until the caller explicitly commits it. Loading books, naming
// people, toggling checkboxes and closing this dialog never request generation.
export async function showParticipantPicker({ context = contextApi.currentCharacterGuard(), roster,
    onConfirm, requireSelection = false, title = '选择加入回廊的人物', confirmLabel = '保存人物名单' } = {}) {
    const originalScope = contextApi.chatScopeKey(context);
    if (roster === undefined) {
        if (repository.getImportedMemory(context)) await cache.ensureCurrentArchiveBackup(context);
        await cache.ensureCacheHydrated(context);
        if (originalScope !== contextApi.chatScopeKey(contextApi.currentCharacterGuard())) return false;
        roster = cache.readParticipantRoster(context);
    }
    const initial = people.normalizeParticipantRoster(roster);
    const draft = initial || { version: 1, cardType: 'multi', revision: '', people: [], selectedIds: [] };
    const current = dialog(context, title, `
      <p>勾选世界书中的人物条目，核对下方姓名。一个条目可以加入多个人物，也可以为同一人物补充多个条目。</p>
      <p>选人、改名不调用生成 API。人物设定不会作为已经发生的剧情写入记忆。</p>
      <label class="rmt-participant-book-label">世界书<select data-rmt-participant-book aria-label="人物来源世界书"><option value="">正在读取世界书列表…</option></select></label>
       <div class="rmt-participant-entries" data-rmt-participant-entries></div>
       <h3>人物名单</h3><div data-rmt-participant-people></div>
        <div class="rmt-participant-actions"><button type="button" class="rmt-btn" data-rmt-participant-random>随机加一人</button><button type="button" class="rmt-btn" data-rmt-participant-ensemble>选为群像</button><button type="button" class="rmt-btn" data-rmt-participant-add>手动补充人物</button></div>
      <footer><span data-rmt-participant-count></span><button type="button" class="rmt-btn" data-rmt-participant-confirm>${text.esc(confirmLabel)}</button></footer>`);
    if (!current) return false;
    current.draft = draft;
    current.entries = [];
    current.loading = 0;
    current.busy = false;
    const selected = id => draft.selectedIds.includes(id);
    const setSelected = (id, checked) => {
        draft.selectedIds = checked ? [...new Set([...draft.selectedIds, id])] : draft.selectedIds.filter(value => value !== id);
    };
    const addPerson = (name, refs = []) => {
        const person = { id: people.createParticipantId(), name, sourceRefs: refs.map(copySource) };
        draft.people.push(person); setSelected(person.id, true);
        return person;
    };
    function renderPeople() {
        current.element.querySelector('[data-rmt-participant-people]').innerHTML = draft.people.length ? draft.people.map((person, index) => `
          <article class="rmt-participant-person" data-rmt-participant-person="${index}">
            <label class="rmt-participant-select"><input type="checkbox" data-rmt-participant-selected="${index}" ${selected(person.id) ? 'checked' : ''}> 加入回廊</label>
            <label>人物名字<input type="text" data-rmt-participant-name="${index}" value="${text.esc(person.name)}"></label>
            <small>${person.sourceRefs.length ? person.sourceRefs.map(ref => `${text.esc(ref.world)} · ${text.esc(ref.title)} (#${text.esc(ref.uid)})`).join('<br>') : '手动补充，未关联世界书条目'}</small>
            ${person.sourceRefs.length ? `<button type="button" class="rmt-btn" data-rmt-participant-duplicate="${index}">这些条目里还有其他人物</button>` : ''}
          </article>`).join('') : '<p>尚未加入人物。展开世界书条目后勾选，或手动补充。</p>';
        current.element.querySelector('[data-rmt-participant-count]').textContent = `已勾选 ${draft.selectedIds.length} 人`;
    }
    function renderEntries() {
        const node = current.element.querySelector('[data-rmt-participant-entries]');
        node.innerHTML = current.entries.length ? current.entries.map((entry, index) => {
            const linked = draft.people.filter(person => person.sourceRefs.some(ref => sourceKey(ref) === sourceKey(entry)));
            const checked = linked.some(person => selected(person.id));
            return `<section class="rmt-participant-entry">
              <label class="rmt-participant-select"><input type="checkbox" data-rmt-participant-entry="${index}" ${checked ? 'checked' : ''}><b>${text.esc(entry.title)}</b></label>
              <small>#${text.esc(entry.uid)}${entry.disabled ? ' · 世界书原条目已禁用' : ''}</small>
              <details><summary>查看条目内容</summary><p>${text.esc(entry.content)}</p></details>
              ${draft.people.length ? `<label>也可作为人物的补充资料<select data-rmt-participant-link="${index}"><option value="">选择已有的人物…</option>${draft.people.map((person, i) => `<option value="${i}">${text.esc(person.name || '未填写姓名')} · ${i + 1}</option>`).join('')}</select></label>` : ''}
            </section>`;
        }).join('') : '<p>这本世界书没有可读取的文字条目。</p>';
    }
    function changed({ entries = true } = {}) { renderPeople(); if (entries) renderEntries(); status(current, ''); }
    current.element.addEventListener('input', event => {
        const index = event.target?.dataset?.rmtParticipantName;
        if (index === undefined || current.busy || !current.isCurrent()) return;
        event.stopPropagation();
        draft.people[Number(index)].name = event.target.value;
        // Do not rerender the input being typed in: preserve caret/IME composition.
    });
    current.element.addEventListener('change', event => {
        if (current.busy || !current.isCurrent()) return;
        const data = event.target?.dataset || {};
        if (data.rmtParticipantSelected !== undefined) {
            event.stopPropagation(); setSelected(draft.people[Number(data.rmtParticipantSelected)].id, event.target.checked); changed();
        } else if (data.rmtParticipantEntry !== undefined) {
            event.stopPropagation();
            const entry = current.entries[Number(data.rmtParticipantEntry)];
            const linked = draft.people.filter(person => person.sourceRefs.some(ref => sourceKey(ref) === sourceKey(entry)));
            if (event.target.checked && !linked.length) addPerson(entry.title, [entry]);
            else for (const person of linked) {
                if (event.target.checked) person.sourceRefs = person.sourceRefs.map(ref => sourceKey(ref) === sourceKey(entry) ? copySource(entry) : ref);
                setSelected(person.id, event.target.checked);
            }
            changed();
        } else if (data.rmtParticipantLink !== undefined && event.target.value !== '') {
            event.stopPropagation();
            const person = draft.people[Number(event.target.value)], entry = current.entries[Number(data.rmtParticipantLink)];
            if (!person.sourceRefs.some(ref => sourceKey(ref) === sourceKey(entry))) person.sourceRefs.push(copySource(entry));
            else person.sourceRefs = person.sourceRefs.map(ref => sourceKey(ref) === sourceKey(entry) ? copySource(entry) : ref);
            changed();
        }
    });
    current.element.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-rmt-participant-add], [data-rmt-participant-duplicate], [data-rmt-participant-random], [data-rmt-participant-ensemble]');
        if (!button || current.busy || !current.isCurrent()) return;
        event.stopPropagation();
        if (button.hasAttribute('data-rmt-participant-random')) {
            const id = chooseRandomParticipantId(draft, { excludedIds: draft.selectedIds });
            if (!id) { status(current, '没有可随机加入的非用户人物；可先从世界书加入人物或调整现有勾选。', true); return; }
            setSelected(id, true);
            changed();
            status(current, '已随机勾选一人；确认前仍可手动调整。');
            return;
        }
        if (button.hasAttribute('data-rmt-participant-ensemble')) {
            for (const person of draft.people) if (person.identity !== 'user') setSelected(person.id, true);
            changed();
            status(current, '已将现有非用户人物选为群像；确认前仍可手动调整。');
            return;
        }
        const index = button.dataset.rmtParticipantDuplicate;
        const person = index === undefined ? addPerson('') : addPerson('', draft.people[Number(index)].sourceRefs);
        changed();
        current.element.querySelector(`[data-rmt-participant-name="${draft.people.indexOf(person)}"]`)?.focus();
    });
    current.element.querySelector('[data-rmt-participant-book]').addEventListener('change', async event => {
        event.stopPropagation();
        if (!current.isCurrent() || current.busy) return;
        const serial = ++current.loading, world = event.target.value;
        if (!world) { current.entries = []; current.element.querySelector('[data-rmt-participant-entries]').textContent = ''; return; }
        current.element.querySelector('[data-rmt-participant-entries]').textContent = '正在读取条目…';
        try {
            const entries = await repository.loadMemoryWorldInfoBook(context, world, current.controller.signal, { participantSource: true });
            if (!current.isCurrent() || serial !== current.loading) return;
            current.entries = entries; renderEntries();
        } catch (error) { if (current.isCurrent() && serial === current.loading) status(current, `读取失败：${text.safeErrorSummary(error)}`, true); }
    });
    current.element.querySelector('[data-rmt-participant-confirm]').addEventListener('click', async event => {
        event.stopPropagation();
        if (!current.isCurrent() || current.busy) return;
        // Explicit user decision: a multi-person archive needs a manual selection.
        if (requireSelection && !draft.selectedIds.length) {
            status(current, '请先勾选要加入回廊的人物，再开始建档。', true); return;
        }
        const snapshot = people.normalizeParticipantRoster(draft);
        current.busy = true;
        for (const field of current.element.querySelectorAll('button:not([data-rmt-participant-close]), input, select')) field.disabled = true;
        status(current, '正在确认人物选择…');
        try {
            const accepted = await onConfirm?.(snapshot, initial?.revision || '');
            if (current.isCurrent() && accepted !== false) closeParticipantPicker();
            else if (current.isCurrent()) {
                current.busy = false;
                for (const field of current.element.querySelectorAll('button, input, select')) field.disabled = false;
                status(current, '名单尚未更改，可以继续调整或取消。');
            }
        } catch (error) {
            if (current.isCurrent()) {
                current.busy = false;
                for (const field of current.element.querySelectorAll('button, input, select')) field.disabled = false;
                status(current, text.safeErrorSummary(error), true);
            } else globalThis.toastr?.error?.(text.safeErrorSummary(error), '心迹回廊');
        }
    });
    renderPeople();
    try {
        if (typeof context.getWorldInfoNames !== 'function') throw new Error('酒馆当前未提供世界书列表，请确认世界书已加载。');
        const raw = await context.getWorldInfoNames();
        if (!current.isCurrent()) return false;
        const names = [...new Set((Array.isArray(raw) ? raw : []).filter(name => typeof name === 'string' && name))];
        current.element.querySelector('[data-rmt-participant-book]').innerHTML = '<option value="">请选择世界书…</option>'
            + names.map(name => `<option value="${text.esc(name)}">${text.esc(name)}</option>`).join('');
        if (!names.length) status(current, '当前没有可读取的世界书。可载入世界书后重开选人页，或手动补充人物。');
    } catch (error) {
        if (current.isCurrent()) {
            current.element.querySelector('[data-rmt-participant-book]').innerHTML = '<option value="">世界书列表暂不可用</option>';
            status(current, text.safeErrorSummary(error), true);
        }
    }
    return true;
}

// These decisions occur before either a roster write or a new paid request.
export function chooseParticipantChange({ context, tasks = [], scopes = [], appendedNames = [], selectedNames = [] }) {
    return new Promise(resolve => {
        const running = tasks.length > 0;
        const current = dialog(context, running ? '正在按原名单生成' : '怎样应用这次人物选择？', `
          ${running ? `<p>以下任务仍按开始时的名单生成：${tasks.map(task => text.esc(task.label || task.mode || '档案')).join('、')}。</p>
          <p>继续原任务会保留原名单。中断后重做会重新调用 API；已经发送的请求仍可能计费。</p>
          ${tasks.some(task => task.kind === 'participant-plan') ? '<p>中断正在执行的重做计划，也会停止这份计划中尚未开始的页面。接下来只生成你重新勾选的范围。</p>' : ''}
          <button type="button" class="rmt-btn" data-rmt-participant-decision="continue">继续原任务，不更改名单</button>`
          : `<p>追加会把新勾选的人加入原名单，原来的人和已有内容保留。只保存名单，不调用生成 API。</p>
          <p>追加后的名单：${appendedNames.map(name => text.esc(name || '未填写姓名')).join('、')}</p>
          <button type="button" class="rmt-btn" data-rmt-participant-decision="append">确认追加新人物</button>`}
          <button type="button" class="rmt-btn" data-rmt-participant-decision="select-scopes">${running ? '选择中断并重做的范围' : '选择重新生成的范围'}</button>
          <section data-rmt-participant-regenerate-options hidden>
            <p>本轮使用当前勾选的名单：${selectedNames.map(name => text.esc(name || '未填写姓名')).join('、')}</p>
            <p>只重做你勾选的页面；未勾选的内容保留。重做前保存可查看的旧版本，不会自动重新绘制旧图片。</p>
            <p>只重做房间时，旧生活和物品所依赖的空间、物件仍保留，避免原记录失去对应位置。</p>
            <div class="rmt-participant-scope-options">${scopes.map(scope => `<label class="rmt-participant-select"><input type="checkbox" data-rmt-participant-scope="${text.esc(scope.id)}">${text.esc(scope.label)}</label>`).join('')}</div>
            <p>勾选多个页面会依次执行各自的生成流程；部分页面本来需要多段请求，不是一次 API 完成全部。生成失败时保留已保存的旧版。</p>
            <button type="button" class="rmt-btn" data-rmt-participant-decision="regenerate">确认所选范围并生成</button>
          </section>`);
        if (!current) { resolve(null); return; }
        current.onClose = () => resolve(null);
        const finish = value => {
            current.onClose = null;
            closeParticipantPicker();
            resolve(value);
        };
        current.element.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-rmt-participant-decision]');
            if (!button) return;
            event.stopPropagation();
            if (!current.isCurrent()) { finish(null); return; }
            const action = button.dataset.rmtParticipantDecision;
            if (action === 'select-scopes') {
                current.element.querySelector('[data-rmt-participant-regenerate-options]').hidden = false;
                current.element.querySelector('[data-rmt-participant-scope]')?.focus();
                return;
            }
            if (action === 'regenerate') {
                const pages = [...current.element.querySelectorAll('[data-rmt-participant-scope]:checked')].map(node => node.dataset.rmtParticipantScope);
                if (!pages.length) { status(current, '请勾选本次要重做的范围，或者取消。'); return; }
                finish({ action, pages });
            } else finish({ action });
        });
    });
}

export function showParticipantVersions({ context, versions, onOpen }) {
    const current = dialog(context, '重做前的旧版本', `
      <p>这里保留重做前已经生成的内容。打开后查看旧版本，不会替换当前内容。</p>
      ${versions.length ? versions.map((version, index) => `<button type="button" class="rmt-btn" data-rmt-participant-version="${index}">${text.esc(version.label || version.reason || '重做前版本')} · ${text.esc(version.createdAt ? new Date(version.createdAt).toLocaleString() : '保存时间未记录')}</button>`).join('') : '<p>还没有保存的旧版本。</p>'}`);
    if (!current) return false;
    current.element.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-rmt-participant-version]');
        if (!button || !current.isCurrent()) return;
        event.stopPropagation();
        const version = versions[Number(button.dataset.rmtParticipantVersion)];
        if (!version) return;
        closeParticipantPicker();
        void onOpen(version);
    });
    return true;
}

export function chooseGenerationTaskResult({ context, title = '旧任务已生成完成' }) {
    return new Promise(resolve => {
        const current = dialog(context, title, `
          <p>结果已经保存。它沿用旧任务的原资料，当前档案已有较新的版本。</p>
          <p>你可以单独保留这份成果，也可以更新对应的当前页面；更新前会保留当前页面的旧版本。</p>
          <button type="button" class="rmt-btn" data-rmt-task-result-decision="independent">保存为独立成果并查看</button>
          <button type="button" class="rmt-btn" data-rmt-task-result-decision="apply">更新当前页面，并保留旧版</button>
          <p>关闭此页可以稍后决定，已生成的结果不会丢失。这里的选择不会调用生成 API。</p>`);
        if (!current) { resolve(null); return; }
        current.onClose = () => resolve(null);
        current.element.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-rmt-task-result-decision]');
            if (!button || !current.isCurrent()) return;
            event.stopPropagation();
            const decision = button.dataset.rmtTaskResultDecision;
            current.onClose = null;
            closeParticipantPicker();
            resolve(decision);
        });
    });
}
