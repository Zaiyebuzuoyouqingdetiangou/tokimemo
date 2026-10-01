// 新页面：回忆收集率（含毕业结算）、朋友情报、他在等你（含你不在的时候）。
// 页面自己渲染、自己处理点击；只通过 overlay 的公开函数换标题和返回键，不碰其他模块的会话数据。
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as archive_repository from '../archive/repository.js';
import { state as runtimeState } from '../core/state.js';
import * as overlay from './overlay.js';
import * as ui_workspaceState from './workspaceState.js';
import * as workspace_ui from './workspace.js';
import * as extras_store from '../extras/store.js';
import * as extras_collection from '../extras/collection.js';
import * as extras_intel from '../extras/intel.js';
import * as extras_waiting from '../extras/waiting.js';
import * as extras_styles from './extrasStyles.js';
import * as mv_view from './mvView.js';

const esc = core_text.esc;
export const EXTRA_MODES = Object.freeze(['collection', 'waiting', 'intel', 'songMv']);
const view = { mode: '', sub: 'main', id: '', person: '', recordId: '', dial: [0, 0, 0, 0], wrong: false, loading: false };

export function isExtraMode(mode) {
    return EXTRA_MODES.includes(mode);
}

function body() { return overlay.bodyEl(); }

function currentContext() {
    try { return core_context.currentCharacterGuard(); } catch { return null; }
}

function readOnlyTarget() {
    return !!runtimeState.activeArchiveSnapshot;
}

function chrome(title, backLabel) {
    extras_styles.ensureExtrasStyles();
    overlay.topTitle(title);
    overlay.setBackVisible(true, backLabel);
    overlay.setManageVisible(false);
    overlay.setRegenerateVisible(false);
}

function toastError(error) {
    if (error?.name === 'AbortError') return;
    globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
}

function stillShowing(mode, scope) {
    const context = currentContext();
    return runtimeState.activeMode === mode && !!context && extras_store.extrasScope(context) === scope
        && !document.getElementById(core_constants.OVERLAY_ID)?.hidden;
}

export function openExtra(mode, options = {}) {
    if (!isExtraMode(mode)) return false;
    if (mode === mv_view.MV_MODE) return mv_view.openMv(options);
    const route = mode;
    ui_workspaceState.leaveWorkspaceReader();
    ui_workspaceState.workspace.route = route; ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.empty = null;
    runtimeState.activeMode = mode; runtimeState.activeSession = null;
    view.mode = mode; view.sub = options.sub || 'main'; view.id = ''; view.recordId = ''; view.wrong = false;
    if (mode === 'intel') view.person = core_text.normalizeText(options.person, 120);
    overlay.openOverlay();
    renderExtra();
    const el = body(); if (el) el.scrollTop = 0;
    return true;
}

export function renderExtra() {
    if (!isExtraMode(runtimeState.activeMode)) return false;
    if (runtimeState.activeMode === mv_view.MV_MODE) { mv_view.renderMv(); workspace_ui.syncWorkspaceChrome(); return true; }
    if (view.mode !== runtimeState.activeMode) { view.mode = runtimeState.activeMode; view.sub = 'main'; }
    if (view.mode === 'collection') renderCollection();
    else if (view.mode === 'intel') renderIntel();
    else renderWaiting();
    renderExtraRecovery();
    workspace_ui.syncWorkspaceChrome();
    return true;
}

function renderExtraRecovery() {
    const context = currentContext();
    if (!context || readOnlyTarget() || !body()) return;
    const scope = extras_store.extrasScope(context);
    const rows = extras_store.pendingExtras(scope);
    const panel = document.createElement('section');
    panel.className = 'rmt-x-card';
    panel.innerHTML = `${rows.length ? `<h3>待保存的生成结果（${rows.length}）</h3><p>结果已保留。保存失败时请先导出再刷新；重试保存不会请求模型。档案已变化的结果只供导出。</p>${rows.map(row => `<button type="button" class="rmt-btn" data-rmt-extra="retry-save" data-rmt-extra-id="${esc(row.id)}">仅重试保存 · ${esc(row.kind === 'intel' ? '朋友情报' : '他在等你')}</button>`).join('')}` : ''}<button type="button" class="rmt-btn" data-rmt-extra="export-results">导出全部记录与待保存结果</button>`;
    body().prepend(panel);
}

function showExtraSaveResult(result, message) {
    if (result.pending) {
        globalThis.toastr?.warning?.(`${result.reason || '结果等待保存。'}${result.durable ? '' : ' 请先导出，刷新会丢失页面内副本。'}`, '心迹回廊');
    } else globalThis.toastr?.success?.(message, '心迹回廊');
}

function exportExtraResults() {
    const url = URL.createObjectURL(new Blob([extras_store.exportExtras()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `hearttrace-extras-${Date.now()}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function navigateExtraBack() {
    if (!isExtraMode(runtimeState.activeMode)) return false;
    if (runtimeState.activeMode === mv_view.MV_MODE) return mv_view.navigateMvBack();
    if (view.mode === 'collection' && view.sub === 'graduation') { view.sub = 'main'; renderExtra(); return true; }
    if (view.mode === 'waiting' && ['note', 'lock'].includes(view.sub)) { view.sub = 'grid'; view.wrong = false; renderExtra(); return true; }
    if (view.mode === 'waiting' && view.sub === 'grid') { view.sub = 'main'; renderExtra(); return true; }
    if (view.mode === 'intel') { openGarden(); return true; }
    return false;
}

function openGarden() {
    ui_workspaceState.leaveWorkspaceReader();
    void overlay.openCachedOrGenerate(core_constants.MODE.RELATIONS, { workspaceRoute: 'relations' });
}

function emptyPage(title, message, action = '') {
    const el = body(); if (!el) return;
    el.innerHTML = `<main class="rmt-x-page"><header class="rmt-x-head"><h2>${esc(title)}</h2><p>${esc(message)}</p></header>${action}</main>`;
}

// ---------- 回忆收集率 ----------

function renderCollection() {
    if (view.sub === 'graduation') return renderGraduation();
    chrome('回忆收集率', '内容');
    const el = body(); if (!el) return;
    if (!view.loading) {
        view.loading = true;
        el.innerHTML = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在统计…</b></div></div>';
        extras_collection.prepareCollectionSource().catch(() => {}).finally(() => {
            if (runtimeState.activeMode === 'collection') renderExtra();
            view.loading = false;
        });
        return;
    }
    let data;
    try { data = extras_collection.computeCollection(); }
    catch { return emptyPage('回忆收集率', '先为当前聊天建立档案，生成内容后这里会开始统计。', '<button type="button" class="rmt-btn" data-rmt-workspace-tab="archive">前往当前档案</button>'); }
    const circumference = 2 * Math.PI * 60;
    const dash = `${(circumference * data.percent / 100).toFixed(1)} ${circumference.toFixed(1)}`;
    const rows = data.rows.map(row => `<div class="rmt-x-row"><div class="rmt-x-row-head"><span>${esc(row.name)}</span><span>${row.got} / ${row.total}</span></div><div class="rmt-x-bar"><i style="width:${row.total ? Math.round(row.got / row.total * 100) : 0}%"></i></div></div>`).join('');
    const counts = data.counts.map(item => `<div class="rmt-x-count"><small>${esc(item.name)}</small><b>${item.value} ${esc(item.unit)}</b></div>`).join('');
    const recent = data.recent.length ? `<section class="rmt-x-block"><h3>最近点亮</h3><div class="rmt-x-recent">${data.recent.map(item => `<div class="rmt-x-recent-item"><span class="rmt-x-recent-tile">${item.url ? `<img src="${esc(item.url)}" alt="" loading="lazy">` : ''}<em>${esc(item.kind)}</em></span><small>${esc(item.title)}</small></div>`).join('')}</div></section>` : '';
    el.innerHTML = `<main class="rmt-x-page">
      <header class="rmt-x-head"><small>COLLECTION</small><h2>回忆收集率</h2><p>两个人一起点亮过的东西。全部在本地统计，不发请求。</p></header>
      <section class="rmt-x-card rmt-x-ring-card">
        <div class="rmt-x-ring"><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="60" class="rmt-x-ring-bg"></circle><circle cx="70" cy="70" r="60" class="rmt-x-ring-fg" stroke-dasharray="${dash}" transform="rotate(-90 70 70)"></circle></svg><div><b>${data.percent}%</b><small>已点亮</small></div></div>
        <div class="rmt-x-ring-copy">${data.total ? `<p>共 <b>${data.got}</b> / ${data.total}</p><p>${data.total - data.got > 0 ? `离“全部点亮”还差 ${data.total - data.got} 个。` : '全部点亮了。'}</p>` : '<p>相簿、ADV、成就、ENDING 生成后，这里开始计算百分比。</p>'}</div>
      </section>
      ${rows ? `<section class="rmt-x-card"><h3>分项</h3>${rows}</section>` : ''}
      <section class="rmt-x-card"><h3>收藏数量</h3><p class="rmt-x-note">可以一直追加的内容只记数量，不算进百分比。</p><div class="rmt-x-counts">${counts}</div></section>
      ${recent}
      <button type="button" class="rmt-x-primary rmt-x-dark" data-rmt-extra="graduation">查看毕业结算</button>
    </main>`;
}

function renderGraduation() {
    chrome('毕业结算', '回忆收集率');
    const el = body(); if (!el) return;
    let data;
    try { data = extras_collection.computeCollection(); } catch { view.sub = 'main'; return renderCollection(); }
    const g = data.graduation;
    const count = id => data.counts.find(item => item.id === id)?.value || 0;
    const stats = [
        g.days ? [String(g.days), '天', '一起走过'] : null,
        [String(g.memoryCount), '条', '共同的记忆'],
        data.total ? [String(data.percent), '%', '回忆收集率'] : null,
        count('fireflies') ? [String(count('fireflies')), '颗', '点亮的萤火虫'] : null,
        count('letters') ? [String(count('letters')), '封', '收到的信'] : null,
        count('places') ? [String(count('places')), '处', '去过的地方'] : null,
    ].filter(Boolean).slice(0, 6);
    const lines = [
        g.firstMemory ? ['最初的记忆', g.firstMemory] : null,
        g.firstCg ? ['第一张 CG', g.firstCg] : null,
        g.firstPlace ? ['一起去过的地方', g.firstPlace] : null,
        g.route ? ['当前路线', g.route] : null,
        g.lastMemory ? ['档案里最后一条', g.lastMemory] : null,
    ].filter(Boolean);
    const today = new Date();
    el.innerHTML = `<main class="rmt-x-cert-page"><article class="rmt-x-cert">
      <div class="rmt-x-cert-frame">
        <header class="rmt-x-cert-head"><small>GRADUATION · 心迹回廊</small><h2>毕业纪念册</h2>
          <p class="rmt-x-cert-names"><b>${esc(g.characterName)}</b><span>与</span><b>${esc(g.userName)}</b></p>
          <i class="rmt-x-cert-ribbon" aria-hidden="true"></i></header>
        <div class="rmt-x-cert-stats">${stats.map(([n, unit, label]) => `<div><b>${esc(n)}<small>${esc(unit)}</small></b><span>${esc(label)}</span></div>`).join('')}</div>
        <ol class="rmt-x-cert-lines">${lines.map(([label, value]) => `<li><span>${esc(label)}</span><b>${esc(value)}</b></li>`).join('')}</ol>
        <footer class="rmt-x-cert-foot"><span>Thank you for this story</span><small>${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日</small></footer>
      </div></article>
      <button type="button" class="rmt-x-secondary" data-rmt-extra="collection-main">返回收集率</button></main>`;
}

// ---------- 朋友情报 ----------

function avatarTone(name) {
    const tones = ['rose', 'teal', 'lilac', 'peach', 'sky', 'sage'];
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return tones[h % tones.length];
}

function avatar(name, size = 40) {
    const initial = Array.from(core_text.normalizeText(name, 40))[0] || '?';
    return `<span class="rmt-x-avatar" data-tone="${avatarTone(name)}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc(initial)}</span>`;
}

function sourceChips(ids, fallback) {
    return ids?.length ? `<div class="rmt-x-chips">${ids.map((id, i) => `<span class="rmt-x-chip">${i ? '' : '依据 '}${esc(id)}</span>`).join('')}</div>` : `<div class="rmt-x-chips"><span class="rmt-x-chip muted">${esc(fallback)}</span></div>`;
}

function renderIntel() {
    chrome('朋友情报', '人际庭园');
    const context = currentContext();
    if (!context || readOnlyTarget()) return emptyPage('朋友情报', '朋友情报只在当前聊天里使用。请回到当前聊天，从人际庭园打开。');
    let people = [];
    try { archive_repository.requireArchive(context); people = extras_intel.intelPeople(context); }
    catch { return emptyPage('朋友情报', '先为当前聊天建立档案，再生成人际庭园。', '<button type="button" class="rmt-btn" data-rmt-workspace-tab="archive">前往当前档案</button>'); }
    if (!people.length) return emptyPage('朋友情报', '人际庭园里还没有可以打听的人。先生成或刷新人际庭园。', '<button type="button" class="rmt-btn" data-rmt-extra="intel-garden">打开人际庭园</button>');
    if (!people.some(p => p.name === view.person)) view.person = people[0].name;
    const scope = extras_store.extrasScope(context);
    const extras = extras_store.readExtras(context);
    const current = people.find(p => p.name === view.person);
    const running = extras_intel.isIntelRunning(scope, current.key);
    const record = extras.intel.find(item => item.id === view.recordId) || extras.intel.find(item => item.person === current.name) || null;
    const labels = { mention: '他提起你的样子', seen: `${record?.person || current.name}看到的`, advice: '悄悄话' };
    const result = record ? `<section class="rmt-x-paper">
        <div class="rmt-x-paper-head">${avatar(record.person, 40)}<div><b>${esc(record.person)}的情报</b><small>${esc(record.scene || new Date(record.createdAt).toLocaleDateString('zh-CN'))}</small></div></div>
        ${record.sections.map((section, index) => `${index ? '<hr>' : ''}<div class="rmt-x-sec"><small>${esc(labels[section.kind] || '')}</small><p>${esc(section.text)}</p>${section.kind === 'advice' ? '<div class="rmt-x-chips"><span class="rmt-x-chip muted">建议 · 不写入档案</span></div>' : sourceChips(section.sourceMemoryIds, '生活设定')}</div>`).join('')}
      </section>` : `<section class="rmt-x-card"><p class="rmt-x-note">还没向${esc(current.name)}打听过。</p></section>`;
    const history = extras.intel.slice(0, 12).map(item => `<button type="button" class="rmt-x-list-row" data-rmt-extra="intel-record" data-rmt-extra-id="${esc(item.id)}">${avatar(item.person, 36)}<span><b>${esc((item.sections[0]?.text || '').slice(0, 22))}${(item.sections[0]?.text || '').length > 22 ? '…' : ''}</b><small>${esc(item.person)} · ${esc(new Date(item.createdAt).toLocaleDateString('zh-CN'))}</small></span><i aria-hidden="true">›</i></button>`).join('');
    const el = body(); if (!el) return;
    el.innerHTML = `<main class="rmt-x-page">
      <header class="rmt-x-head"><small>INTEL</small><h2>朋友情报</h2><p>去问问身边的人，他提起你的时候，是什么样子。</p></header>
      <section class="rmt-x-card">
        <div class="rmt-x-card-head"><h3>向谁打听</h3><small>在庭园里选中的人</small></div>
        <div class="rmt-x-people">${people.slice(0, 18).map(p => `<button type="button" class="rmt-x-person${p.name === current.name ? ' active' : ''}" aria-pressed="${p.name === current.name}" data-rmt-extra="intel-pick" data-rmt-extra-person="${esc(p.name)}">${avatar(p.name, 40)}<b>${esc(p.name)}</b><small>${esc(p.relation || (p.layer === 'setting' ? '设定人物' : '本世界线'))}</small></button>`).join('')}</div>
        <button type="button" class="rmt-x-primary" data-rmt-extra="intel-ask" ${running ? 'disabled' : ''}>${running ? `正在向${esc(current.name)}打听…` : `去找${esc(current.name)}打听一下`}</button>
        <p class="rmt-x-note">只会说档案里真实发生过的事。没有依据的部分，${esc(current.name)}会说“这个我就不清楚了”。</p>
      </section>
      ${result}
      ${history ? `<section class="rmt-x-block"><h3>以前打听到的</h3>${history}</section>` : ''}
    </main>`;
}

async function askIntel() {
    const context = currentContext(); if (!context) return;
    const scope = extras_store.extrasScope(context);
    const person = view.person;
    const rerender = () => { if (stillShowing('intel', scope)) renderExtra(); };
    try {
        const promise = extras_intel.askIntel(person, { onSettled: rerender });
        rerender();
        const result = await promise;
        if (!result.pending && stillShowing('intel', scope) && view.person === person) view.recordId = result.record.id;
        rerender();
        showExtraSaveResult(result, `${core_text.toastText(person, 60)}的情报已经收好。`);
    } catch (error) { toastError(error); rerender(); }
}

// ---------- 他在等你 ----------

function renderWaiting() {
    if (view.sub === 'grid' || view.sub === 'note' || view.sub === 'lock') return renderWaitingGrid();
    chrome('他在等你', '内容');
    const context = currentContext();
    if (!context || readOnlyTarget()) return emptyPage('他在等你', '这个功能只在当前聊天里使用。');
    let memoryReady = true;
    try { archive_repository.requireArchive(context); } catch { memoryReady = false; }
    const scope = extras_store.extrasScope(context);
    const settings = extras_waiting.waitingSettings(context);
    const away = extras_waiting.awayState(context);
    const record = extras_waiting.latestWaitingRecord(context);
    const running = extras_waiting.isWaitingRunning(scope);
    const lockedCount = record ? record.locked.filter(item => !(record.unlocked || []).includes(item.id)).length : 0;
    const entry = record ? `<button type="button" class="rmt-x-entry" data-rmt-extra="waiting-grid">
        <span class="rmt-x-entry-grid" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i data-i="${i}"></i>`).join('')}</span>
        <span><b>你不在的时候</b><small>离开第 ${record.awayDays} 天 · ${record.points.length} 处有记录${lockedCount ? ` · ${lockedCount} 处上锁` : ''}</small></span><em aria-hidden="true">›</em></button>` : '';
    const generate = settings.enabled && memoryReady ? `<button type="button" class="rmt-x-primary" data-rmt-extra="waiting-generate" ${running ? 'disabled' : ''}>${running ? '正在看他这几天…' : record ? '再看看他这几天' : '看看他这几天'}</button>
        <p class="rmt-x-note">${away.known ? `上次聊天在 ${away.days} 天前。` : '没能读出上次聊天的时间，会按“刚离开”来写。'}${away.known && away.days < settings.days ? `还没到你设的 ${settings.days} 天，也可以先看一次。` : ''}</p>` : (!memoryReady ? '<p class="rmt-x-note">先为当前聊天建立档案。</p>' : '');
    const dayButtons = extras_store.WAITING_DAY_OPTIONS.map(n => `<button type="button" class="rmt-x-seg${settings.days === n ? ' active' : ''}" aria-pressed="${settings.days === n}" data-rmt-extra="waiting-days" data-rmt-extra-id="${n}">${n} 天</button>`).join('');
    const options = settings.enabled ? `<hr><div class="rmt-x-field"><b>离开多久后开始</b><div class="rmt-x-segs">${dayButtons}</div></div>
      <div class="rmt-x-field"><b>出现在哪里</b>
        <label class="rmt-x-check"><input type="checkbox" data-rmt-extra-setting="showInbox" ${settings.showInbox ? 'checked' : ''}><span>你的邮箱 · 一封没寄出的信</span></label>
        <label class="rmt-x-check"><input type="checkbox" data-rmt-extra-setting="showRoom" ${settings.showRoom ? 'checked' : ''}><span>他的房间 · 今日生活里的一个节点</span></label></div>` : '';
    const preview = record && (record.roomNode || record.letter) ? `<h3 class="rmt-x-section-title">效果预览 · 离开第 ${record.awayDays} 天</h3>
      ${record.roomNode ? roomNodeHtml(record.roomNode) : ''}${record.letter ? letterHtml(record.letter) : ''}` : '';
    const el = body(); if (!el) return;
    el.innerHTML = `<main class="rmt-x-page">
      <header class="rmt-x-head"><small>WAITING</small><h2>他在等你</h2><p>你离开一阵子，他的房间和信里会留下一点痕迹。</p></header>
      ${entry}
      <section class="rmt-x-card">
        <div class="rmt-x-switch-row"><span><b>开启“他在等你”</b><small>默认关闭 · 只对当前聊天生效</small></span>
          <button type="button" role="switch" aria-checked="${settings.enabled}" aria-label="开启他在等你" class="rmt-x-toggle${settings.enabled ? ' on' : ''}" data-rmt-extra="waiting-toggle"><i aria-hidden="true"></i><span>${settings.enabled ? '已开启' : '点此开启'}</span></button></div>
        ${options}
        ${generate}
      </section>
      ${preview}
    </main>`;
}

function roomNodeHtml(node) {
    return `<section class="rmt-x-card rmt-x-node"><small><i class="fa-solid fa-house" aria-hidden="true"></i> 他的房间 · 今日生活${node.time ? ` · ${esc(node.time)}` : ''}</small><p>${esc(node.text)}</p>${node.line ? `<em>“${esc(node.line)}”</em>` : ''}</section>`;
}

function letterHtml(letter, extra = '') {
    return `<section class="rmt-x-paper rmt-x-letter"><div class="rmt-x-letter-head"><small><i class="fa-solid fa-envelope" aria-hidden="true"></i> 你的邮箱 · ${esc(letter.title || '没寄出的信')}</small><span class="rmt-x-chip warm">不写入档案</span></div><p>${esc(letter.body)}</p>${extra}</section>`;
}

function currentWaitingRecord() {
    const context = currentContext();
    return context ? extras_waiting.latestWaitingRecord(context) : null;
}

function renderWaitingGrid() {
    const record = currentWaitingRecord();
    if (!record) { view.sub = 'main'; return renderWaiting(); }
    chrome('你不在的时候', view.sub === 'grid' ? '他在等你' : '全部房间');
    const unlocked = new Set(record.unlocked || []);
    const cells = [
        ...record.points.map(item => ({ ...item, locked: false })),
        ...record.locked.map(item => ({ ...item, locked: !unlocked.has(item.id), wasLocked: true })),
    ];
    const el = body(); if (!el) return;
    const topRow = (label, action) => `<div class="rmt-x-night-top"><button type="button" class="rmt-x-back" data-rmt-extra="${action}">‹ ${label}</button><div class="rmt-x-now"><i></i>REC · 离开第 ${record.awayDays} 天</div></div>`;
    const nowLine = topRow('回到全部房间', 'waiting-grid');
    if (view.sub === 'grid') {
        const tiles = cells.slice(0, 9).map((cell, i) => `<button type="button" class="rmt-x-tile${cell.locked ? ' locked' : ''}" data-tone="${i % 6}" data-rmt-extra="waiting-cell" data-rmt-extra-id="${esc(cell.id)}" aria-label="${esc(cell.name)}${cell.locked ? '，已上锁' : ''}"><span class="rmt-x-tile-top"><small>${cell.locked ? '??:??' : esc(cell.time || '--:--')}</small>${cell.locked ? '<i class="fa-solid fa-lock" aria-hidden="true"></i>' : `<em class="rmt-x-cam">● ${String(i + 1).padStart(2, '0')}</em>`}</span><b>${esc(cell.name)}</b></button>`);
        while (tiles.length < 9) tiles.push('<div class="rmt-x-tile empty"><span class="rmt-x-tile-top"><small>--:--</small></span><span>[ 还没有记录 ]</span></div>');
        el.innerHTML = `<main class="rmt-x-night">${topRow('他在等你', 'waiting-main')}<header><h2>你不在的时候</h2><p>他不知道你在看。点开一处，看看他那天在那里做了什么。</p></header>
          <div class="rmt-x-tiles">${tiles.join('')}</div>
          ${record.locked.length ? '<div class="rmt-x-hint"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>有的地方上了锁。密码就藏在其他房间的细节里。</span></div>' : ''}</main>`;
        return;
    }
    const cell = cells.find(item => item.id === view.id);
    if (!cell) { view.sub = 'grid'; return renderWaitingGrid(); }
    if (view.sub === 'lock' && cell.locked) {
        el.innerHTML = `<main class="rmt-x-night rmt-x-lock">${nowLine}<i class="fa-solid fa-lock rmt-x-lock-icon" aria-hidden="true"></i><h2>${esc(cell.name)}</h2><p>${esc(cell.hint || '线索藏在别的地方。')}</p>
          <div class="rmt-x-dials">${view.dial.map((v, i) => `<div><button type="button" aria-label="第 ${i + 1} 位加一" data-rmt-extra="waiting-dial-up" data-rmt-extra-id="${i}"><i class="fa-solid fa-chevron-up"></i></button><b>${v}</b><button type="button" aria-label="第 ${i + 1} 位减一" data-rmt-extra="waiting-dial-down" data-rmt-extra-id="${i}"><i class="fa-solid fa-chevron-down"></i></button></div>`).join('')}</div>
          ${view.wrong ? '<p class="rmt-x-wrong" role="status">不是这个。再去别的房间看看？</p>' : ''}
          <button type="button" class="rmt-x-primary rmt-x-lamp" data-rmt-extra="waiting-unlock">打开</button></main>`;
        return;
    }
    el.innerHTML = `<main class="rmt-x-night">${nowLine}
      <div class="rmt-x-hero rmt-x-peep" data-tone="${Math.max(0, cells.indexOf(cell)) % 6}"><em class="rmt-x-cam">● 偷看中</em><span>${esc(cell.name)} · ${esc(cell.time || '--:--')}</span></div>
      ${cell.wasLocked ? '<p class="rmt-x-unlocked">已解锁 · 他最不想被看到的一面</p>' : ''}
      <section class="rmt-x-sheet">
        <div><small>此刻的他</small><p>${esc(cell.state)}</p></div>
        ${cell.detail ? `<div><small>细节</small><p>${esc(cell.detail)}</p></div>` : ''}
        ${cell.voice ? `<div><small>心里话</small><p class="rmt-x-voice">${esc(cell.voice)}</p></div>` : ''}
        <div class="rmt-x-chips">${cell.sourceMemoryIds?.length ? `<span class="rmt-x-chip">依据 ${esc(cell.sourceMemoryIds.join(' · '))}</span>` : '<span class="rmt-x-chip muted">生活设定</span>'}<span class="rmt-x-chip warm">不写入档案</span></div>
      </section></main>`;
}

async function generateWaiting() {
    const context = currentContext(); if (!context) return;
    const scope = extras_store.extrasScope(context);
    const rerender = () => { if (stillShowing('waiting', scope)) renderExtra(); };
    try {
        const promise = extras_waiting.generateWaiting({ onSettled: rerender });
        rerender();
        const result = await promise;
        if (!result.pending && stillShowing('waiting', scope)) { view.sub = 'grid'; view.id = ''; }
        rerender();
        showExtraSaveResult(result, '他这几天的样子已经收好。');
    } catch (error) { toastError(error); rerender(); }
}

function tryUnlock() {
    const record = currentWaitingRecord();
    const cell = record?.locked.find(item => item.id === view.id);
    if (!cell) return;
    if (view.dial.join('') === cell.code) {
        try { extras_waiting.markUnlocked(record.id, cell.id); } catch (error) { toastError(error); }
        view.sub = 'note'; view.wrong = false;
    } else view.wrong = true;
    renderExtra();
}

// ---------- 点击与设置 ----------

export function handleExtraClick(event) {
    if (mv_view.handleMvClick(event)) return true;
    const el = event.target?.closest?.('[data-rmt-extra]');
    if (!el || el.disabled) return false;
    const action = el.dataset.rmtExtra;
    const id = el.dataset.rmtExtraId || '';
    event.preventDefault?.();
    if (action === 'intel-open') { openExtra('intel', { person: el.dataset.rmtExtraPerson }); return true; }
    if (action === 'waiting-open-grid') { openExtra('waiting', { sub: 'grid' }); return true; }
    if (action === 'intel-garden') { openGarden(); return true; }
    if (!isExtraMode(runtimeState.activeMode)) return true;
    if (action === 'export-results') {
        try { exportExtraResults(); } catch (error) { toastError(error); }
        return true;
    }
    if (action === 'retry-save') {
        const context = currentContext();
        if (context && !readOnlyTarget()) {
            el.disabled = true;
            void extras_store.retryExtraSave(extras_store.extrasScope(context), id)
                .then(result => showExtraSaveResult(result, '结果已经收好。'))
                .catch(toastError).finally(renderExtra);
        }
        return true;
    }
    if (action === 'graduation') { view.sub = 'graduation'; renderExtra(); body().scrollTop = 0; }
    else if (action === 'collection-main') { view.sub = 'main'; renderExtra(); }
    else if (action === 'intel-pick') { view.person = el.dataset.rmtExtraPerson || ''; view.recordId = ''; renderExtra(); }
    else if (action === 'intel-ask') void askIntel();
    else if (action === 'intel-record') {
        const context = currentContext();
        const record = context && extras_store.readExtras(context).intel.find(item => item.id === id);
        if (record) { view.person = record.person; view.recordId = record.id; renderExtra(); body().scrollTop = 0; }
    }
    else if (action === 'waiting-toggle' || action === 'waiting-days') {
        try {
            const current = extras_waiting.waitingSettings();
            extras_waiting.saveWaitingSettings(action === 'waiting-toggle' ? { enabled: !current.enabled } : { days: Number(id) });
        } catch (error) { toastError(error); }
        renderExtra();
    }
    else if (action === 'waiting-generate') void generateWaiting();
    else if (action === 'waiting-main') { view.sub = 'main'; renderExtra(); body().scrollTop = 0; }
    else if (action === 'waiting-grid') { view.sub = 'grid'; renderExtra(); body().scrollTop = 0; }
    else if (action === 'waiting-cell') {
        const record = currentWaitingRecord();
        const locked = record?.locked.find(item => item.id === id);
        view.id = id; view.wrong = false;
        view.sub = locked && !(record.unlocked || []).includes(id) ? 'lock' : 'note';
        if (view.sub === 'lock') view.dial = [0, 0, 0, 0];
        renderExtra(); body().scrollTop = 0;
    }
    else if (action === 'waiting-dial-up' || action === 'waiting-dial-down') {
        const i = Number(id);
        if (i >= 0 && i < 4) { view.dial[i] = (view.dial[i] + (action === 'waiting-dial-up' ? 1 : 9)) % 10; view.wrong = false; renderExtra(); }
    }
    else if (action === 'waiting-unlock') tryUnlock();
    return true;
}

export function handleExtraChange(event) {
    if (mv_view.handleMvChange(event)) return true;
    const input = event.target?.closest?.('[data-rmt-extra-setting]');
    if (!input) return false;
    const key = input.dataset.rmtExtraSetting;
    if (!['showInbox', 'showRoom'].includes(key)) return true;
    try { extras_waiting.saveWaitingSettings({ [key]: !!input.checked }); } catch (error) { toastError(error); }
    return true;
}

// ---------- 内容目录卡片 ----------

export function extraCardInfo(key) {
    extras_styles.ensureExtrasStyles();
    if (key === 'collection') return { status: extras_collection.collectionCardStatus(), off: false };
    if (key === 'waiting') {
        if (readOnlyTarget()) return { status: '只在当前聊天使用', off: true };
        const info = extras_waiting.waitingCardStatus();
        return { status: info.text, off: info.off };
    }
    return null;
}

// ---------- 挂到其他页面的小入口 ----------

export function decorateRelationDetail(host) {
    try {
        if (readOnlyTarget() || !host?.querySelector) return;
        const detail = host.querySelector('.rmt-relation-detail');
        const head = detail?.querySelector('.rmt-relation-detail-head');
        if (!detail || !head || head.querySelector('span')) return;
        const name = core_text.normalizeText(head.querySelector('b')?.textContent, 120);
        const context = currentContext();
        if (!name || !context) return;
        const person = extras_intel.intelPeople(context).find(item => item.name === name);
        if (!person) return;
        const count = extras_store.readExtras(context).intel.filter(item => item.person === name).length;
        extras_styles.ensureExtrasStyles();
        const wrap = document.createElement('div');
        wrap.className = 'rmt-x-ask-wrap';
        wrap.innerHTML = `<button type="button" class="rmt-x-primary" data-rmt-extra="intel-open" data-rmt-extra-person="${esc(name)}"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i> 向${esc(name)}打听他的事</button>${count ? `<small>已打听过 ${count} 次</small>` : ''}`;
        detail.appendChild(wrap);
    } catch { /* 装饰失败不影响人际庭园本身。 */ }
}

export function decorateInbox(host, listView) {
    try {
        if (!listView || readOnlyTarget() || !host?.querySelector) return;
        const context = currentContext(); if (!context) return;
        const settings = extras_waiting.waitingSettings(context);
        const trace = extras_waiting.activeTrace(context);
        if (!settings.showInbox || !trace?.letter) return;
        extras_styles.ensureExtrasStyles();
        const header = host.querySelector('.rmt-mail-header');
        const card = document.createElement('div');
        card.innerHTML = letterHtml(trace.letter, '<button type="button" class="rmt-x-secondary" data-rmt-extra="waiting-open-grid">看看你不在的时候</button>');
        if (header) header.after(card.firstElementChild); else host.prepend(card.firstElementChild);
    } catch { /* 邮箱照常显示。 */ }
}

export function decorateRoom(host) {
    try {
        if (readOnlyTarget() || !host?.querySelector) return;
        const context = currentContext(); if (!context) return;
        const settings = extras_waiting.waitingSettings(context);
        const trace = extras_waiting.activeTrace(context);
        if (!settings.showRoom || !trace?.roomNode) return;
        extras_styles.ensureExtrasStyles();
        const card = document.createElement('div');
        card.innerHTML = roomNodeHtml(trace.roomNode).replace('</section>', '<button type="button" class="rmt-x-secondary" data-rmt-extra="waiting-open-grid">看看你不在的时候</button></section>');
        const node = card.firstElementChild;
        const style = host.querySelector(':scope > style');
        if (style) style.after(node); else host.prepend(node);
    } catch { /* 房间照常显示。 */ }
}
