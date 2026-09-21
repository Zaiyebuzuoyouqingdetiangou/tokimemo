import * as archive_capacity from '../archive/capacity.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_storyScenes from '../archive/storyScenes.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import { state as runtimeState } from '../core/state.js';

const STYLE_ID = 'heartbeat_memories_scene_picker_styles';
let lastScenes = [];
let selectedIds = new Set();
let mode = 'check';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.rmt-scene-picker{display:grid;gap:10px;margin-top:12px;padding:12px;border:1px solid var(--rmt-theme-border,#d4e1e7);border-radius:14px;background:rgba(255,255,255,.72)}
.rmt-scene-picker h3{margin:0;font-size:14px;color:var(--rmt-theme-text,#52677b)}
.rmt-scene-picker-toolbar,.rmt-scene-picker-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rmt-scene-item{border:1px solid var(--rmt-theme-border,#d8e3e8);border-radius:12px;padding:8px 10px;background:var(--rmt-theme-surface,#fff)}
.rmt-scene-item summary{display:flex;gap:8px;align-items:flex-start;cursor:pointer;list-style:none}
.rmt-scene-item summary::-webkit-details-marker{display:none}
.rmt-scene-item em{display:block;margin-top:8px;white-space:pre-wrap;font-style:normal;color:var(--rmt-theme-muted,#718092);font-size:12px;line-height:1.65}
.rmt-scene-item input[type=text]{width:100%;min-height:36px;margin-top:6px;box-sizing:border-box}
.rmt-scene-unlabeled{opacity:.92}
.rmt-memory-lock-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
`;
    document.head.appendChild(style);
}

function host() {
    return document.querySelector(`#${core_constants.SETTINGS_ID} [data-rmt-scene-picker], #${core_constants.OVERLAY_ID} [data-rmt-scene-picker]`);
}

function selectedScenes() {
    const chosen = lastScenes.filter(scene => selectedIds.has(scene.id));
    if (mode === 'earliest') return archive_storyScenes.earliestScenes(lastScenes, archive_storyScenes.SCENE_BATCH_SIZE);
    return archive_storyScenes.sortScenes(chosen).slice(0, archive_storyScenes.SCENE_BATCH_SIZE);
}

function renderList(root) {
    const unlabeled = lastScenes.filter(scene => !scene.date || !scene.date.trim()).length;
    const rows = archive_storyScenes.sortScenes(lastScenes).map(scene => {
        const unlabeledItem = !scene.date;
        const checked = mode === 'earliest'
            ? archive_storyScenes.earliestScenes(lastScenes).some(item => item.id === scene.id)
            : selectedIds.has(scene.id);
        return `<details class="rmt-scene-item ${unlabeledItem ? 'rmt-scene-unlabeled' : ''}" data-rmt-scene-id="${core_text.esc(scene.id)}">
          <summary><label><input type="checkbox" data-rmt-scene-check="${core_text.esc(scene.id)}" ${checked ? 'checked' : ''} ${mode === 'earliest' ? 'disabled' : ''}> <b>${core_text.esc(scene.title || scene.timeLabel || scene.id)}</b></label>
          <small>${core_text.esc(scene.provider)} · ${core_text.esc(scene.timeLabel || '未标注时间')} · ${core_text.esc(scene.date || '未标注日期')}</small></summary>
          <input type="text" data-rmt-scene-date="${core_text.esc(scene.id)}" value="${core_text.esc(scene.date || '')}" placeholder="手填公历 YYYY/MM/DD 或历年，例如庆历四年二月初五日">
          <em>${core_text.esc(scene.plot || '')}</em>
        </details>`;
    }).join('');
    root.querySelector('[data-rmt-scene-list]').innerHTML = rows || '<p>还没有扫描到时间场景。先选世界书或确认柏宝书/千千结可读，再点「扫描场景」。</p>';
    const status = root.querySelector('[data-rmt-scene-status]');
    if (status) {
        status.textContent = lastScenes.length
            ? `共 ${lastScenes.length} 条场景，未标注 ${unlabeled}。勾选最多 20 条，或改用从早到晚 20 条。扫描不请求模型。`
            : '尚未扫描。';
    }
}

export function mountScenePicker(target) {
    if (!target) return;
    ensureStyles();
    target.innerHTML = `<section class="rmt-scene-picker" data-rmt-scene-picker-root>
      <h3>按时间场景建档</h3>
      <p>一段「时间」场景 = 1 条。目标是正式档案 Mxxx，不是相簿。世界书全展示、默认都可勾；重复覆盖由你去重。</p>
      <div class="rmt-scene-picker-toolbar">
        <label><input type="radio" name="rmt-scene-mode" data-rmt-scene-mode="check" ${mode === 'check' ? 'checked' : ''}> 勾选 1–20 条</label>
        <label><input type="radio" name="rmt-scene-mode" data-rmt-scene-mode="earliest" ${mode === 'earliest' ? 'checked' : ''}> 从早到晚 20 条</label>
        <button type="button" class="menu_button" data-rmt-scene-scan>扫描场景</button>
        <button type="button" class="menu_button" data-rmt-scene-estimate>用 AI 估日期</button>
      </div>
      <div data-rmt-scene-status role="status">展开后扫描。扫描本身不收费。</div>
      <div data-rmt-scene-list></div>
      <div class="rmt-scene-picker-actions">
        <button type="button" class="menu_button rmt-settings-wide" data-rmt-scene-import>用当前选择建档</button>
      </div>
    </section>`;
    renderList(target);
}

async function scanScenes(root) {
    const status = root.querySelector('[data-rmt-scene-status]');
    if (status) status.textContent = '正在扫描世界书 / 柏宝书 / 千千结…';
    lastScenes = await archive_storyScenes.collectStoryScenes();
    selectedIds = new Set();
    renderList(root);
}

async function estimateDates(root) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) {
        globalThis.toastr?.info?.('当前还有任务，等结束后再用 AI 估日期。', '心迹回廊');
        return;
    }
    const unlabeled = lastScenes.filter(scene => !scene.date);
    const target = unlabeled.length ? unlabeled : lastScenes.filter(scene => selectedIds.has(scene.id));
    if (!target.length) {
        globalThis.toastr?.info?.('没有未标注或已勾选的场景需要估日期。', '心迹回廊');
        return;
    }
    const preview = target.slice(0, archive_storyScenes.SCENE_BATCH_SIZE);
    if (!globalThis.confirm?.(`将请求模型估计 ${preview.length} 条场景的日期。结果先预览，确认后才写入。继续？`)) return;
    const parsed = await generation_client.generateConfiguredJson(
        archive_storyScenes.estimateDatePrompt(preview),
        { skipTokenCount: false, maxTokens: 4000, temperature: 0.2 },
    );
    const rows = Array.isArray(parsed?.dates) ? parsed.dates : [];
    const lines = preview.map(scene => {
        const row = rows.find(item => item?.id === scene.id);
        const date = core_text.normalizeText(row?.date, 100);
        return `${scene.title || scene.timeLabel || scene.id}\n原标签：${scene.timeLabel || '（无）'}\n估计：${date || '（估不出）'}${row?.reason ? ` · ${row.reason}` : ''}`;
    }).join('\n\n');
    if (!globalThis.confirm?.(`预览后写入已估出的日期？\n\n${lines.slice(0, 1800)}`)) return;
    const byId = new Map(lastScenes.map(scene => [scene.id, scene]));
    for (const row of rows) {
        const scene = byId.get(row?.id);
        if (!scene) continue;
        const next = archive_storyScenes.applySceneDate(scene, row.date);
        if (next.date) byId.set(scene.id, next);
    }
    lastScenes = archive_storyScenes.sortScenes([...byId.values()]);
    renderList(root);
}

async function importScenes() {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) {
        globalThis.toastr?.info?.('当前还有任务，等结束后再按场景建档。', '心迹回廊');
        return;
    }
    const scenes = selectedScenes();
    if (!scenes.length) {
        globalThis.toastr?.info?.('请先勾选 1–20 条场景，或改用从早到晚 20 条。', '心迹回廊');
        return;
    }
    const existing = archive_repository.getImportedMemory();
    if (existing && !archive_capacity.canAdmitToHot(existing.memories) && (existing.memories || []).length >= core_constants.MAX_MEMORY_ITEMS) {
        globalThis.toastr?.warning?.('热位已满且均为锁定。新结果会进待入档，可导出；已有相簿/ADV/房间仍可生成。', '心迹回廊');
    }
    await archive_repository.importSelectedStoryScenes(scenes);
}

export async function handleScenePickerEvent(event) {
    const root = event.target.closest?.('[data-rmt-scene-picker-root]') || host()?.querySelector?.('[data-rmt-scene-picker-root]');
    if (!root) return false;
    const modeInput = event.target.closest?.('[data-rmt-scene-mode]');
    if (modeInput) {
        mode = modeInput.dataset.rmtSceneMode === 'earliest' ? 'earliest' : 'check';
        renderList(root);
        return true;
    }
    const check = event.target.closest?.('[data-rmt-scene-check]');
    if (check) {
        if (check.checked) {
            if (selectedIds.size >= archive_storyScenes.SCENE_BATCH_SIZE && !selectedIds.has(check.dataset.rmtSceneCheck)) {
                check.checked = false;
                globalThis.toastr?.info?.('一次最多勾选 20 条。', '心迹回廊');
                return true;
            }
            selectedIds.add(check.dataset.rmtSceneCheck);
        } else selectedIds.delete(check.dataset.rmtSceneCheck);
        return true;
    }
    const dateInput = event.target.closest?.('[data-rmt-scene-date]');
    if (dateInput && (event.type === 'change' || event.type === 'blur')) {
        const scene = lastScenes.find(item => item.id === dateInput.dataset.rmtSceneDate);
        if (scene) {
            Object.assign(scene, archive_storyScenes.applySceneDate(scene, dateInput.value));
            lastScenes = archive_storyScenes.sortScenes(lastScenes);
            renderList(root);
        }
        return true;
    }
    if (event.target.closest?.('[data-rmt-scene-scan]')) {
        await scanScenes(root);
        return true;
    }
    if (event.target.closest?.('[data-rmt-scene-estimate]')) {
        await estimateDates(root);
        return true;
    }
    if (event.target.closest?.('[data-rmt-scene-import]')) {
        await importScenes();
        return true;
    }
    return false;
}

export function refreshScenePicker() {
    const target = host();
    if (target) mountScenePicker(target);
}
