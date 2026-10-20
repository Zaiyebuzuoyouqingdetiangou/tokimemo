// 外置壳贴在角色楼层下面，点开才展开。档案没写完时不挂壳，也不显示建档进度。
import * as archive_avatars from './archiveAvatars.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as incremental_view from '../autoMemory/incrementalView.js';
import * as core_cache from '../core/cache.js';
import * as auto_memory_library from '../autoMemory/achievementLibrary.js';
import * as auto_memory_floor from '../autoMemory/floorPace.js';
import * as auto_memory_gap from '../autoMemory/gapFill.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as auto_memory_registry from '../autoMemory/moduleRegistry.js';
import * as auto_memory_redo from '../autoMemory/redo.js';
import * as auto_memory_scheduler from '../autoMemory/scheduler.js';
import * as auto_memory_stream from '../autoMemory/streamGate.js';
import * as shell_state from '../autoMemory/shellState.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as generation_status from '../core/generationStatus.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_text from '../core/text.js';
import * as ui_floor from './chatFloorNav.js';
import * as ui_reveal from './memoryReveal.js';
import * as room_layout from '../modes/roomLayout.js';
import * as ui_heartEnvelope from './heartEnvelope.js';
import * as ui_styles from './styles.js';
import * as ui_taskCenter from './taskCenter.js';
import * as ui_overlay from './overlay.js';
import * as core_theme from '../core/theme.js';
import * as journal_clip from './journalClip.js';

let cleanup = null;
let lastPhase = '';
let sawPhase = false;
let autoRepairLatch = '';
let timer = 0;
let stallState = { signature: '', since: 0 };
let stallNoted = false;
// 每 2 秒的兜底刷新只在楼层壳的输入真的变了时才重画。
let lastSignature = null;
let lastLivePhase = '';
const incrementMemo = new Map();
const INCREMENT_MEMO_MAX = 256;
const writtenRound = new WeakMap();
const achievementLookups = new WeakMap();

export function floorShellCss() {
    return shell_state.floorShellCss();
}

function ensureCss() {
    document.getElementById('rmt-letter-guard')?.remove();
    if (document.getElementById('rmt-floor-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'rmt-floor-shell-style';
    style.textContent = floorShellCss();
    document.head?.appendChild(style);
}

function dropModuleCss() {
    document.getElementById('rmt-floor-module-css')?.remove();
}

// 模块样式约 1MB，只在真的有楼层壳挂出来时才复制一份，没有自动留忆的聊天不注入。
function mirrorModuleCss() {
    if (document.getElementById('rmt-floor-module-css')) return;
    try { ui_styles.ensureStyles(); } catch { /* 样式还没准备好时，楼层壳仍显示摘要。 */ }
    const source = document.getElementById(core_constants.STYLE_ID);
    if (!source || document.getElementById('rmt-floor-module-css')) return;
    const copied = shell_state.mirrorOverlayCss(source.textContent, core_constants.OVERLAY_ID);
    const roomCss = room_layout.roomLayoutCss('.rmt-floor-shell');
    const style = document.createElement('style');
    style.id = 'rmt-floor-module-css';
    // 插件窗口的根规则（全屏 fixed、100vw、去外边距）也会落到楼层壳上，壳自己的尺寸放在最后压住。
    // r84.165：r84.164 在 floorShellCss 里去掉的 70vh 内部滚动和 640px 展开宽度，被这里带 !important 的尾部规则盖回去了；
    // 改在这里：拆开的信 640px（600px 以下占满），信里内容不再限高、宽内容只在信里横向滚动。
    style.textContent = `${copied}
${shell_state.floorShellCss()}
${roomCss}
${shell_state.promoteNarrowLayout(`${copied}\n${roomCss}`)}
.rmt-floor-shell{position:relative!important;inset:auto!important;z-index:auto!important;height:auto!important;width:min(96%,420px)!important;max-width:100%!important;max-height:none!important;margin:8px auto 12px!important;display:block!important;padding:0!important;border:0!important;background:transparent!important;backdrop-filter:none!important}
.rmt-floor-shell:has(.rmt-heart-letter-paper:not([hidden])){width:min(96%,640px)!important}
@media (max-width:600px){.rmt-floor-shell,.rmt-floor-shell:has(.rmt-heart-letter-paper:not([hidden])){width:100%!important}}
.rmt-floor-shell .rmt-floor-body{position:static!important;inset:auto!important;box-sizing:border-box!important;width:auto!important;max-width:100%!important;height:auto!important;max-height:none!important;margin:10px 0 0!important;padding:0!important;display:block!important;border:0!important;background:transparent!important;overflow-x:auto!important;overflow-y:visible!important}`;
    document.head?.appendChild(style);
}

function latestAssistantIndex(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message && message.is_user !== true && message.is_system !== true) return index;
    }
    return -1;
}

function clearShells() {
    document.querySelectorAll('[data-rmt-floor-shell]').forEach(node => node.remove());
    dropModuleCss();
}

// 一次刷新里设置只读一次（整理设置不便宜，200 封信每封都读会占掉大半时间）。
let refreshSettings = null;
function pluginSettings() {
    return refreshSettings || core_settings.getPluginSettings();
}

function latestFloorMode() {
    return pluginSettings().autoMemoryLatestFloor === true;
}

function ticketForReveal(snapshot, reveal) {
    const ids = new Set(reveal?.sourceMemoryIds || []);
    const tickets = [...(snapshot?.drawTickets || [])].reverse();
    return tickets.find(ticket => ticket.selectedModuleId === reveal?.moduleId && (ticket.sourceMemoryIds || []).some(id => ids.has(id)))
        || tickets.find(ticket => ticket.selectedModuleId === reveal?.moduleId)
        || null;
}

function roundReveal(records, moduleId, ids, steps, ticket) {
    const mine = records.filter(row => row.moduleId === moduleId);
    const matched = ids.size ? mine.find(row => (row.sourceMemoryIds || []).some(id => ids.has(id))) : null;
    if (matched) return matched;
    const busy = steps.some(step => step.status !== 'completed') || ticket?.status === 'drawn' || ticket?.status === 'running';
    if (busy || !moduleId) return null;
    return mine[0] || null;
}

// 一次刷新里共用的输入：自动留忆记录、档案、缓存、成就库只读一遍，楼层位置只扫一遍聊天。
function tickInputs(context) {
    const snapshot = readSnapshot(context);
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    let cache = null;
    try { cache = cacheRef(core_cache.getCache(context)); } catch { cache = null; }
    let achievements;
    let lookup = null;
    let index = null;
    return {
        context, snapshot, memory, cache,
        achievements() {
            if (achievements === undefined) {
                // 只读查询：不复制整个成就库。
                achievements = core_cache.loadSession(core_constants.MODE.ACHIEVEMENTS, { context, memoryBank: memory, clone: false }) || null;
            }
            return achievements;
        },
        achievementLookup() {
            if (lookup) return lookup;
            const session = this.achievements();
            lookup = session && typeof session === 'object' ? achievementLookups.get(session) : null;
            if (!lookup) {
                lookup = auto_memory_library.autoAchievementLookup(session);
                if (session && typeof session === 'object') achievementLookups.set(session, lookup);
            }
            return lookup;
        },
        locate(ticket) {
            if (!index) index = chatIndex(context.chat);
            const chat = Array.isArray(context.chat) ? context.chat : [];
            const pinnedAt = ticket?.id ? index.pins.get(ticket.id) : undefined;
            if (pinnedAt !== undefined) return { index: pinnedAt, message: chat[pinnedAt] };
            const floor = Math.floor(Number(ticket?.dueFloor));
            if (!(floor >= 1)) return null;
            if (latestFloorMode()) {
                const at = index.assistants[floor - 1];
                return at === undefined ? null : { index: at, message: chat[at] };
            }
            const message = chat[floor - 1];
            return message ? { index: floor - 1, message } : null;
        },
    };
}

// 压缩缓存还没解开时 getCache 每次给一个新的空对象；比较引用时把它当成“没有缓存”。
function cacheRef(cache) {
    if (!cache || typeof cache !== 'object') return null;
    for (const _key in cache) return cache;
    return null;
}

// 与 redo.findDrawMessage（第一处钉）和 drawFloorMessage（第 N 条角色楼）同义，一次扫完。
function chatIndex(chat) {
    const pins = new Map();
    const assistants = [];
    const list = Array.isArray(chat) ? chat : [];
    for (let index = 0; index < list.length; index += 1) {
        const message = list[index];
        const pin = message?.extra?.[auto_memory_redo.DRAW_PIN_KEY];
        if (pin && !pins.has(pin)) pins.set(pin, index);
        if (message && message.is_user !== true && message.is_system !== true) assistants.push(index);
    }
    return { pins, assistants };
}

function readSnapshot(context) {
    try { return auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata); }
    catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT' || error?.code === 'RMT_AUTO_MEMORY_INTERVAL') return null;
        throw error;
    }
}

function roundIsEmpty(moduleId, reveal, running, steps, ticket, moduleComplete, previewKept) {
    const stepsBusy = steps.some(step => step.status === 'pending' || step.status === 'running' || step.status === 'failed');
    const ticketBusy = (ticket?.status === 'drawn' || ticket?.status === 'running') && moduleComplete !== true;
    const open = running || stepsBusy || ticketBusy;
    if (open || !moduleId || previewKept === true) return false;
    const settled = moduleComplete === true || reveal?.status === 'ready' || reveal?.status === 'opened';
    if (!settled) return false;
    return true;
}

function archiveIsReady(context, rows) {
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    const importing = rows.some(row => row.currentChat && row.running && (row.kind === 'archive' || row.id === 'archive-import'));
    return !!memory && !importing;
}

function viewFor(context, tick = tickInputs(context)) {
    const snapshot = tick.snapshot;
    if (!snapshot?.plan.enabled) return shell_state.shellView({ enabled: false });
    const ticket = snapshot.drawTickets.find(item => item.id === snapshot.plan.activeDrawTicketId) || null;
    const moduleId = snapshot.modulePlan?.moduleId || ticket?.selectedModuleId || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    const stepsForReveal = snapshot.modulePlan?.steps || [];
    const roundIds = new Set([...(snapshot.modulePlan?.sourceMemoryIds || []), ...(ticket?.sourceMemoryIds || [])]);
    const reveal = roundReveal([...snapshot.revealRecords].reverse(), moduleId, roundIds, stepsForReveal, ticket);
    let rows = [];
    try { rows = core_requestCoordinator.listChatTaskSnapshot(context); } catch { rows = []; }
    const steps = snapshot.modulePlan?.steps || [];
    const failedStep = steps.some(step => step.status === 'failed') || ticket?.status === 'failed';
    const moduleRow = rows.find(row => row.currentChat && row.running && row.kind !== 'archive' && row.id !== 'archive-import');
    const running = !!moduleRow;
    const common = generation_status.resolveGenerationStatus({
        running, partial: failedStep, hasContent: steps.some(step => step.status === 'completed'),
    });
    const moduleComplete = item?.isComplete?.(null, snapshot.modulePlan) === true;
    const previewKept = moduleId ? incrementFor(moduleId, reveal?.id || '', tick).kept === true : false;
    const stored = auto_memory_library.autoAchievementForReveal(context, {
        achievementId: reveal?.achievementId || '',
        moduleId,
        sourceMemoryIds: [...roundIds],
    }, { lookup: tick.achievementLookup() });
    const rememberedTitle = auto_memory_gap.rememberedAchievementTitle(context.chatMetadata, reveal?.achievementId);
    const rememberedCopy = auto_memory_gap.rememberedAchievementCopy(context.chatMetadata, reveal?.achievementId);
    return shell_state.shellView({
        enabled: true,
        archiveReady: archiveIsReady(context, rows),
        moduleId,
        moduleTitle: item?.title || '',
        moduleComplete,
        steps,
        ticketStatus: ticket?.status || '',
        revealStatus: reveal?.status || '',
        revealId: reveal?.id || '',
        drawFloor: (snapshot.drawTickets.find(item => item.id === (snapshot.modulePlan?.drawId || snapshot.plan.activeDrawTicketId)) || ticket)?.dueFloor || 0,
        roundReveal: !!reveal && !stepsForReveal.some(step => step.status !== 'completed') && (reveal.status === 'ready' || reveal.status === 'opened'),
        revealLine: stored?.title || rememberedTitle || '',
        achievementCopy: stored?.description || rememberedCopy || '',
        preferLibraryAchievement: true,
        roundEmpty: roundIsEmpty(moduleId, reveal, running, steps, ticket, moduleComplete, previewKept),
        canOpen: previewKept,
        failureRecoverable: !running && (failedStep || common.state === 'failed' || common.state === 'retry'),
        paused: moduleRow?.phase === 'queue',
        floor: pluginSettings().autoMemoryLatestFloor === true
            ? auto_memory_floor.assistantFloorCount(context.chat)
            : (Array.isArray(context.chat) ? context.chat.length : 0),
        nextDueFloor: snapshot.plan.nextDueFloor,
        intervalFloors: snapshot.plan.intervalFloors,
        gapText: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.text || '',
        canFill: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.canFill === true,
    });
}

function envelopeSkin() {
    let skin = 'pink';
    try { skin = pluginSettings().heartEnvelopeSkin; } catch { skin = 'pink'; }
    return ui_heartEnvelope.heartEnvelopeId(skin);
}

function envelopeArt() {
    return ui_heartEnvelope.heartEnvelopeSvg(envelopeSkin());
}

function markup(view) {
    if (view.phase === 'pace') {
        const gap = view.gapText
            ? `<small>${core_text.esc(view.gapText)}</small>${view.canFill ? '<button type="button" class="rmt-btn rmt-floor-fill" data-rmt-floor-fill>补</button>' : ''}`
            : '';
        return `<p class="rmt-floor-pace" data-rmt-floor-pace><span>留忆</span><b>${core_text.esc(view.detail)}</b>${gap}</p>`;
    }
    const repair = view.canRepairAchievement
        ? '<button type="button" class="rmt-btn" data-rmt-floor-achievement>补成就</button>'
        : '';
    const complete = view.canComplete
        ? '<button type="button" class="rmt-btn" data-rmt-floor-complete>补全</button>'
        : '';
    const redo = view.canRedo
        ? '<button type="button" class="rmt-btn" data-rmt-floor-redo>重试</button>'
        : '';
    const retry = view.canRetry
        ? '<button type="button" class="rmt-btn" data-rmt-floor-retry>重试</button>'
        : '';
    const actions = repair || complete || redo || retry ? `<div class="rmt-heart-letter-actions">${repair}${complete}${redo}${retry}</div>` : '';
    const revealPaper = view.phase === 'reveal' && view.showReveal;
    const writing = view.phase === 'generating' || view.phase === 'planning';
    const esc = core_text.esc;
    const moduleTitle = view.moduleTitle || '回忆';
    const heading = view.title ? `<p data-rmt-letter-achievement>${esc(view.title)}</p>` : '';
    const copy = view.achievementCopy ? `<p data-rmt-letter-copy>${esc(view.achievementCopy)}</p>` : '';
    const read = `<button type="button" class="rmt-btn" data-rmt-letter-read data-rmt-reveal="${esc(view.revealId)}" data-rmt-module="${esc(view.moduleId)}">打开回忆</button>`;
    // r84.162：打开回忆仍在信里直接展开内容；另给一个按钮去心迹回廊看同一份（只打开已保存的，不会重新生成）。
    const jump = view.moduleId ? `<button type="button" class="rmt-btn" data-rmt-letter-jump data-rmt-reveal="${esc(view.revealId)}" data-rmt-module="${esc(view.moduleId)}">去心迹回廊看</button>` : '';
    // r84.175：把这封信夹进手帐（标题和一句简介）。
    const clip = view.title ? `<button type="button" class="rmt-btn" data-rmt-journal-clip="${journal_clip.clipPayload({ mode: view.moduleId, id: view.revealId, title: view.title, body: view.achievementCopy || '' })}">夹进手帐</button>` : '';
    const paper = revealPaper
        ? `<div class="rmt-letter-head"><span class="rmt-letter-badge">${esc(moduleTitle)}</span></div>${heading}${copy}<div class="rmt-letter-buttons">${read}${jump}${clip}<button type="button" class="rmt-btn rmt-heart-letter-close" data-rmt-letter-close>收起</button></div>`
        : '';
    // r84.162：只有最新一楼用迷你信封；更早的楼压缩成一行提示条，没拆的带红点。
    const seal = view.compact
        ? `<button type="button" class="rmt-heart-letter-seal rmt-heart-letter-strip${view.opened ? ' is-opened' : ''}" data-rmt-letter-open aria-label="${esc(revealPaper ? `拆开这封信：${moduleTitle}` : view.detail || '回忆')}">
            ${view.opened ? '' : '<span class="rmt-letter-dot" aria-hidden="true"></span>'}${envelopeArt()}<span class="rmt-letter-seal-text"><b>回忆 · ${esc(moduleTitle)}</b><small data-rmt-letter-detail>${esc(revealPaper ? (view.title || '') : (view.detail || ''))}</small></span><em>${revealPaper ? (view.opened ? '已读' : '未拆') : ''}</em>
        </button>`
        : `<button type="button" class="rmt-heart-letter-seal" data-rmt-letter-open aria-label="${esc(revealPaper ? '拆开这封信' : view.detail || '回忆')}">
            ${envelopeArt()}<span class="rmt-letter-seal-text"><b>${revealPaper ? '你获得了一份回忆' : writing ? '回忆正在写' : esc(view.title || moduleTitle)}</b><small data-rmt-letter-detail>${esc(revealPaper ? `${moduleTitle} · 轻点拆信` : (view.detail || (writing ? '正在生成中' : '')))}</small></span>
        </button>`;
    // r84.164：提示条、信纸的颜色跟着设置里选的信封走。
    return `<article class="rmt-heart-letter${writing ? ' is-writing' : ''}${view.compact ? ' is-compact' : ''}" data-rmt-envelope="${esc(envelopeSkin())}">
        ${seal}
        <div class="rmt-heart-letter-paper" data-rmt-letter-paper hidden>
            ${paper}
            <div class="rmt-floor-body" data-rmt-floor-body data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}"></div>
        </div>
        ${actions}
    </article>`;
}

function generationRunning(context) {
    try {
        return core_requestCoordinator.listChatTaskSnapshot(context).some(row => row.currentChat && row.running && row.kind !== 'archive' && row.id !== 'archive-import');
    } catch {
        return false;
    }
}

function watchStall(view, context) {
    const running = generationRunning(context);
    const active = view.phase === 'generating' || view.phase === 'planning';
    const signature = [view.phase, view.moduleId, view.revealId, view.progress?.done || 0, view.progress?.total || 0, view.detail].join('|');
    const next = shell_state.generationStall({
        active, running, storyOpen: auto_memory_scheduler.storyStillWriting(context),
        signature, previous: stallState, now: Date.now(),
    });
    stallState = { signature: next.signature, since: next.since };
    if (next.stalled) {
        const detail = '90 秒没有新的进度。可以补全没写完的部分，或再试一次。';
        if (!stallNoted) {
            stallNoted = true;
            ui_taskCenter.noteAutoMemoryFloorFailure({ label: view.moduleTitle || '自动留忆', detail });
            void auto_memory_scheduler.failStalledFloor().catch(error => {
                console.warn('[HeartbeatMemories] stall mark skipped', core_text.safeErrorDiagnostic(error));
            });
        }
        return { ...view, phase: 'failed', canRetry: true, canComplete: true, title: '这份回忆停住了', detail };
    }
    if (running || view.phase === 'reveal' || view.phase === 'pace' || view.phase === 'hidden') {
        stallNoted = false;
        ui_taskCenter.clearAutoMemoryFloorFailure();
        return view;
    }
    if (view.phase === 'failed') {
        ui_taskCenter.noteAutoMemoryFloorFailure({
            label: view.moduleTitle || '自动留忆',
            detail: view.detail || '可以补全没写完的部分，或再试一次。',
        });
    }
    return view;
}

function viewForReveal(context, snapshot, reveal, tick, ticket = ticketForReveal(snapshot, reveal)) {
    const moduleId = reveal.moduleId || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    const previewKept = moduleId ? incrementFor(moduleId, reveal.id, tick).kept === true : false;
    const stored = auto_memory_library.autoAchievementForReveal(context, {
        achievementId: reveal.achievementId || '',
        moduleId,
        sourceMemoryIds: [...(reveal.sourceMemoryIds || [])],
    }, { lookup: tick.achievementLookup() });
    const rememberedTitle = auto_memory_gap.rememberedAchievementTitle(context.chatMetadata, reveal.achievementId);
    const rememberedCopy = auto_memory_gap.rememberedAchievementCopy(context.chatMetadata, reveal.achievementId);
    return shell_state.shellView({
        enabled: true,
        archiveReady: true,
        moduleId,
        moduleTitle: item?.title || '',
        moduleComplete: true,
        steps: [{ status: 'completed' }],
        ticketStatus: ticket?.status || 'completed',
        revealStatus: reveal.status,
        revealId: reveal.id,
        drawFloor: ticket?.dueFloor || 0,
        floor: ticket?.dueFloor || 0,
        canOpen: previewKept,
        revealLine: stored?.title || rememberedTitle || '',
        achievementCopy: stored?.description || rememberedCopy || '',
        preferLibraryAchievement: true,
        intervalFloors: snapshot.plan.intervalFloors,
        nextDueFloor: snapshot.plan.nextDueFloor,
    });
}

function letterSlots(context) {
    const tick = tickInputs(context);
    const snapshot = tick.snapshot;
    const slots = [];
    const seen = new Set();
    if (snapshot?.plan.enabled) {
        for (const reveal of snapshot.revealRecords || []) {
            if (reveal.status !== 'ready' && reveal.status !== 'opened' && reveal.status !== 'achievement_pending') continue;
            const ticket = ticketForReveal(snapshot, reveal);
            const located = tick.locate(ticket);
            if (!located) continue;
            const view = viewForReveal(context, snapshot, reveal, tick, ticket);
            if (view.phase === 'hidden') continue;
            slots.push({ key: reveal.id, drawId: ticket?.id || '', messageIndex: located.index, view: { ...view, opened: reveal.status === 'opened' } });
            seen.add(reveal.id);
        }
    }
    const live = watchStall(viewFor(context, tick), context);
    const latest = latestAssistantIndex(context.chat);
    if (latest >= 0 && live.phase !== 'hidden') {
        // 倒计时只是借用了上一轮的信的编号：它属于最新一楼，不能盖掉出信那一楼的信封，
        // 否则信封变成“留忆 还差几层”，后面的楼层也就再也没有提示。
        const ownsLetter = live.revealId && live.phase !== 'pace';
        const existing = ownsLetter ? slots.find(slot => slot.key === live.revealId) : null;
        if (existing) existing.view = { ...live, opened: existing.view.opened === true };
        else slots.push({ key: ownsLetter ? live.revealId : `live:${latest}`, messageIndex: latest, view: live });
    }
    // r84.162：最新那一楼用信封，更早的楼都压缩成提示条。
    const newest = slots.reduce((max, slot) => Math.max(max, slot.messageIndex), -1);
    for (const slot of slots) slot.view = { ...slot.view, compact: slot.messageIndex < newest };
    return { slots, live };
}

function paintHost(host, view) {
    if (view.phase === 'pace' && host.dataset.rmtPhase === 'pace' && host.dataset.rmtPace === view.detail && host.dataset.rmtGap === (view.gapText || '')) return;
    const paper = host.querySelector('[data-rmt-letter-paper]');
    const body = host.querySelector('[data-rmt-floor-body]');
    const contentOpen = view.phase === 'reveal' && (host.dataset.rmtRead === view.revealId || body?.dataset?.rmtLetterRead === '1');
    view.contentOpen = contentOpen;
    const face = `${view.compact ? 'strip' : 'envelope'}|${view.opened ? 'opened' : ''}|${envelopeSkin()}`;
    const sameLetter = host.dataset.rmtPhase === view.phase && host.dataset.rmtReveal === view.revealId && host.dataset.rmtPace === (view.phase === 'pace' ? view.detail : '') && host.dataset.rmtOpen === (contentOpen ? '1' : '') && host.dataset.rmtFace === face;
    host.dataset.rmtFace = face;
    host.dataset.rmtPhase = view.phase;
    host.dataset.rmtReveal = view.revealId;
    host.dataset.rmtPace = view.phase === 'pace' ? view.detail : '';
    host.dataset.rmtGap = view.gapText || '';
    host.dataset.rmtOpen = contentOpen ? '1' : '';
    host.dataset.rmtPending = view.phase === 'reveal' ? '0' : '1';
    if (view.phase !== 'reveal') delete host.dataset.rmtRead;
    if (sameLetter) {
        if (view.phase !== 'reveal' && body) {
            body.replaceChildren();
            delete body.dataset.rmtLetterRead;
        } else if (body?.dataset?.rmtLetterRead === '1') {
            if (body.dataset.rmtFloorLive === '1') body.removeAttribute('data-rmt-floor-live');
            writeRound(body, view.moduleId, view.revealId);
        }
        const achievement = host.querySelector('[data-rmt-letter-achievement]');
        const copy = host.querySelector('[data-rmt-letter-copy]');
        const detail = host.querySelector('[data-rmt-letter-detail]');
        // 同样的字不重写：textContent 赋值会换掉文字节点，长按选中的字会丢。
        const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
        if (view.phase === 'reveal') setText(achievement, view.title);
        if (view.phase === 'reveal') setText(copy, view.achievementCopy || '');
        if (view.phase !== 'reveal') setText(detail, view.detail || '正在生成中');
        if (view.phase !== 'reveal') closeLetter(host);
        host.querySelector('.rmt-heart-letter')?.classList.toggle('is-writing', view.phase === 'generating' || view.phase === 'planning');
        return;
    }
    const paperWasOpen = view.phase === 'reveal' && ((paper && !paper.hidden) || contentOpen);
    host.innerHTML = markup(view);
    if (paperWasOpen) {
        const nextPaper = host.querySelector('[data-rmt-letter-paper]');
        const seal = host.querySelector('[data-rmt-letter-open]');
        const nextBody = host.querySelector('[data-rmt-floor-body]');
        if (nextPaper) nextPaper.hidden = false;
        if (seal && !seal.classList.contains('rmt-heart-letter-strip')) seal.hidden = true;
        if (nextBody && (contentOpen || nextBody.dataset.rmtLetterRead === '1')) {
            nextBody.dataset.rmtLetterRead = '1';
            writeRound(nextBody, view.moduleId, view.revealId);
        }
    }
}

function paint(context) {
    if (shell_state.shellBlocksChatInput()) return;
    if (auto_memory_scheduler.storyStillWriting(context)) {
        stallState = { signature: '', since: 0 };
        stallNoted = false;
        try { ui_taskCenter.clearAutoMemoryFloorFailure(); } catch { /* 任务条稍后还会刷。 */ }
        return;
    }
    if (!auto_memory_floor.assistantBodyReady(context.chat, { generating: auto_memory_stream.generationOpen(context) })) return;
    if (ui_floor.writesMessageText()) return;
    const { slots, live } = letterSlots(context);
    lastLivePhase = live.phase;
    const toast = shell_state.toastForTransition(lastPhase, live.phase, { line: live.title }, { initial: !sawPhase });
    sawPhase = true;
    lastPhase = live.phase;
    ensureCss();
    if (toast) {
        // r84.162：仍用酒馆原生弹出提示，颜色跟随插件主题。
        const options = { toastClass: 'toast rmt-heart-toast', ...(live.revealId ? { onclick: () => openReveal(live.revealId) } : {}) };
        const shown = globalThis.toastr?.[toast.level]?.(toast.message, toast.title, options);
        const node = shown?.[0] || shown;
        if (node?.style) {
            try { themeToast(node, core_settings.getPluginSettings(context)); } catch { /* 取不到主题时保留原生颜色。 */ }
        }
    }
    ensureCss();
    const wanted = new Set();
    let pinsChanged = false;
    for (const slot of slots) {
        const mes = ui_floor.messageElement(slot.messageIndex);
        if (!mes) continue;
        if (slot.drawId) {
            const pin = auto_memory_redo.rememberDrawPin(context, slot.drawId, context.chat?.[slot.messageIndex]);
            if (pin === 'changed') pinsChanged = true;
        }
        let host = [...mes.querySelectorAll('[data-rmt-floor-shell="1"]')].find(node => node.dataset.rmtLetterKey === slot.key);
        if (!host) {
            mirrorModuleCss();
            host = ui_floor.placeAfterMessage(mes);
        }
        if (!host) continue;
        host.dataset.rmtLetterKey = slot.key;
        wanted.add(host);
        paintHost(host, slot.view);
    }
    if (pinsChanged) {
        context.saveChatDebounced?.();
        context.saveMetadataDebounced?.();
    }
    document.querySelectorAll('[data-rmt-floor-shell]').forEach(node => {
        if (!wanted.has(node)) node.remove();
    });
    if (wanted.size) mirrorModuleCss();
    else dropModuleCss();
    try { ui_taskCenter.syncLiveTaskStrip(); } catch { /* 任务条刷新失败时，楼层下面的状态仍保留。 */ }
    queueAutomaticRepair(live);
}

// r84.164：弹出提示跟随心迹回廊的主题。颜色直接写成带 important 的行内样式，
// 酒馆或美化主题给 toast 写的颜色（包括 !important）都盖不过它。
function themeToast(node, settings) {
    const { palette } = core_theme.resolveThemePalette(settings);
    core_theme.applyThemeToElement(node, settings);
    const set = (name, value) => node.style.setProperty(name, value, 'important');
    set('background-color', palette.surface);
    set('background-image', 'none');
    set('color', palette.text);
    set('border-left', `4px solid ${palette.accent}`);
    set('padding-left', '15px');
    set('opacity', '1');
    for (const part of node.querySelectorAll('.toast-title,.toast-message')) {
        part.style.setProperty('color', palette.text, 'important');
    }
}

function queueAutomaticRepair(view) {
    if (!view?.canRetry && !view?.canRepairAchievement) {
        autoRepairLatch = '';
        return;
    }
    if (pluginSettings().autoRetryEnabled !== true) return;
    const token = `${view.phase}|${view.revealId}|${view.moduleId}|${view.canRepairAchievement ? 'achievement' : 'module'}`;
    if (autoRepairLatch === token) return;
    autoRepairLatch = token;
    void auto_memory_scheduler.automaticRepairIfNeeded().then(did => {
        if (did) sync();
    }).catch(error => {
        console.warn('[HeartbeatMemories] automatic repair skipped', core_text.safeErrorDiagnostic(error));
    });
}

function sync() {
    try {
        try { refreshSettings = core_settings.getPluginSettings(); } catch { refreshSettings = null; }
        syncNow();
    } finally {
        lastSignature = shellSignature();
        refreshSettings = null;
    }
}

function syncNow() {
    let context;
    try { context = core_context.getContext(); }
    catch { clearShells(); return; }
    if (context?.groupId) { clearShells(); return; }
    try { context = core_context.currentCharacterGuard(); }
    catch { clearShells(); return; }
    try { paint(context); }
    catch (error) {
        console.warn('[HeartbeatMemories] floor shell skipped', core_text.safeErrorDiagnostic(error));
        clearShells();
    }
}

// 楼层壳要读的东西：聊天与楼层、自动留忆四个记录、档案、模块缓存、设置、任务行、流式状态、页面上的壳。
// 都是引用或短值，逐项 === 比较，不复制、不解析。
function shellSignature() {
    let context;
    try { context = core_context.getContext(); } catch { return null; }
    if (!context) return null;
    const metadata = context.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : {};
    const chat = Array.isArray(context.chat) ? context.chat : null;
    const last = chat?.[chat.length - 1];
    let cache = null;
    try { cache = cacheRef(core_cache.getCache(context)); } catch { cache = null; }
    let settings = {};
    try { settings = pluginSettings() || {}; } catch { settings = {}; }
    let rows = '';
    try {
        rows = core_requestCoordinator.listChatTaskSnapshot(context)
            .filter(row => row.currentChat)
            .map(row => `${row.id}:${row.kind}:${row.phase}:${row.running ? 1 : 0}:${row.progressText || ''}`)
            .join('|');
    } catch { rows = ''; }
    let story = false, generating = false;
    try { story = auto_memory_scheduler.storyStillWriting(context); } catch { story = false; }
    try { generating = auto_memory_stream.generationOpen(context); } catch { generating = false; }
    let chatNodes = -1, shells = -1;
    try {
        chatNodes = document.getElementById('chat')?.childElementCount ?? -1;
        shells = document.querySelectorAll('[data-rmt-floor-shell]').length;
    } catch { /* 没有 DOM 时只比数据。 */ }
    let chatId = '';
    try { chatId = core_context.getChatId(context); } catch { chatId = ''; }
    return [
        chatId, context.characterId, context.groupId, context.name1, context.name2,
        chat, chat?.length ?? -1, last, last?.mes, last?.swipe_id, last?.extra?.[auto_memory_redo.DRAW_PIN_KEY],
        metadata[auto_memory_plan.AUTO_MEMORY_PLAN_KEY], metadata[auto_memory_plan.AUTO_MEMORY_PLAN_KEY]?.revision,
        metadata[auto_memory_plan.AUTO_MEMORY_REVEAL_KEY],
        metadata[auto_memory_plan.AUTO_MEMORY_DRAW_TICKETS_KEY], metadata[auto_memory_plan.AUTO_MEMORY_MODULE_PLAN_KEY],
        metadata[auto_memory_gap.GAP_KEY], metadata[auto_memory_redo.DRAW_PIN_LEDGER_KEY],
        metadata[core_constants.MEMORY_KEY], metadata[core_constants.MEMORY_KEY]?.archiveRevision, metadata[core_constants.CACHE_KEY], cache, core_cache.cacheCommitToken(cache),
        settings.autoMemoryLatestFloor, settings.heartEnvelopeSkin, settings.autoRetryEnabled,
        rows, story, generating, chatNodes, shells,
    ];
}

function sameSignature(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
    return true;
}

// 主要靠酒馆事件刷新；定时器只兜底。正在写的时候照常每次都刷（停住检测要看时间），其余时候没变就跳过。
function fallbackTick() {
    const active = lastLivePhase === 'generating' || lastLivePhase === 'planning';
    if (!active && sameSignature(shellSignature(), lastSignature)) return false;
    sync();
    return true;
}

function incrementFor(moduleId, revealId, tick = null) {
    try {
        const context = tick?.context || core_context.currentCharacterGuard();
        const snapshot = tick ? tick.snapshot : readSnapshot(context);
        const reveal = snapshot?.revealRecords?.find(row => row.id === revealId && row.moduleId === moduleId)
            || snapshot?.revealRecords?.find(row => row.id === revealId);
        const ids = Array.isArray(reveal?.sourceMemoryIds) && reveal.sourceMemoryIds.length ? reveal.sourceMemoryIds : null;
        const ticket = ticketForReveal(snapshot, reveal || { moduleId, sourceMemoryIds: ids || [] });
        const livePlan = snapshot?.modulePlan?.moduleId === moduleId && (!revealId || snapshot.modulePlan.drawId === ticket?.id)
            ? snapshot.modulePlan
            : null;
        const sourceMemoryIds = ids
            || (ticket?.sourceMemoryIds?.length ? ticket.sourceMemoryIds : null)
            || livePlan?.sourceMemoryIds
            || [];
        const memory = tick ? tick.memory : archive_repository.getImportedMemory(context);
        let cache = null;
        if (tick) cache = tick.cache;
        else { try { cache = cacheRef(core_cache.getCache(context)); } catch { cache = null; } }
        // 同一封信、同一份档案、同一份模块缓存，投影结果不会变；缓存对象或提交号一换就重算。
        const key = JSON.stringify([core_context.getChatId(context), moduleId, revealId, memory?.archiveRevision || '',
            sourceMemoryIds, reveal?.createdAt || 0]);
        const raw = cache && typeof cache === 'object' ? cache[moduleId] : undefined;
        const token = core_cache.cacheCommitToken(cache);
        const hit = incrementMemo.get(key);
        if (hit && hit.cache === cache && hit.raw === raw && hit.token === token && hit.memory === memory?.archiveRevision) return hit.value;
        // 只读：投影只换出新的列表，不改原会话，所以不必先把整个模块会话复制一遍。
        const loaded = core_cache.loadSession(moduleId, { context, memoryBank: memory, clone: false });
        const session = loaded && typeof loaded === 'object' && !loaded.kind && moduleId ? { ...loaded, kind: moduleId } : loaded;
        // 只按这封信自己的档案编号收。当前这一轮的 frozenAt 会把旧信的段落判成更早的一轮。
        const value = incremental_view.incrementalProjection(session, {
            sourceMemoryIds,
            createdAt: reveal?.createdAt || 0,
            since: 0,
        });
        if (incrementMemo.size >= INCREMENT_MEMO_MAX) incrementMemo.clear();
        incrementMemo.set(key, { cache, raw, token, memory: memory?.archiveRevision, value });
        return value;
    } catch {
        return { kept: false, session: null };
    }
}

function letterIdentity() {
    let context = null;
    try { context = core_context.getContext(); } catch { context = null; }
    const userFile = archive_avatars.currentUserAvatar(context);
    const userAvatar = userFile ? archive_avatars.personaAvatarUrl(userFile, context) : '';
    let charAvatar = '';
    try {
        const file = archive_snapshots.currentCharacterAvatar(context);
        charAvatar = file ? (archive_avatars.characterAvatarUrl(file, context) || '') : '';
    } catch { charAvatar = ''; }
    return {
        characterName: context?.name2 || '角色',
        userName: context?.name1 || '你',
        charAvatar,
        userAvatar,
    };
}

const EMPTY_ROUND = '<p class="rmt-floor-note">这一轮写完了，但是没有新的段落。</p><div class="rmt-heart-letter-actions"><button type="button" class="rmt-btn" data-rmt-floor-complete>补全</button><button type="button" class="rmt-btn" data-rmt-floor-redo>重试</button></div>';

// 内容没变就不重写 innerHTML：重写会清掉正在长按选中的文字。
function setRoundHtml(body, html) {
    if (writtenRound.get(body) === html && body.innerHTML) return;
    body.innerHTML = html;
    writtenRound.set(body, html);
}

function roundHtml(increment) {
    const identity = letterIdentity();
    const memo = increment.html;
    const signature = `${identity.characterName}\n${identity.userName}\n${identity.charAvatar}\n${identity.userAvatar}`;
    if (memo && memo.signature === signature) return memo.html;
    const html = incremental_view.roundReadingHtml(increment.session, identity);
    try { Object.defineProperty(increment, 'html', { value: { signature, html }, configurable: true, writable: true, enumerable: false }); } catch { /* 冻结对象就每次重算。 */ }
    return html;
}

function writeRound(body, moduleId, revealId) {
    const increment = incrementFor(moduleId, revealId);
    if (!increment.kept) {
        if (body.dataset.rmtLetterRead === '1' && body.innerHTML) return false;
        const phase = body.closest?.('[data-rmt-floor-shell]')?.dataset?.rmtPhase || '';
        const writing = phase === 'generating' || phase === 'planning';
        setRoundHtml(body, writing ? '<p class="rmt-floor-note">回忆正在生成中。</p>' : EMPTY_ROUND);
        return false;
    }
    const html = roundHtml(increment);
    if (!html) {
        setRoundHtml(body, EMPTY_ROUND);
        return false;
    }
    setRoundHtml(body, html);
    const host = body.closest?.('[data-rmt-floor-shell]');
    if (host && revealId) {
        host.dataset.rmtRead = revealId;
        host.dataset.rmtOpen = '1';
    }
    return true;
}

function closeLetter(host) {
    const paper = host?.querySelector?.('[data-rmt-letter-paper]');
    const seal = host?.querySelector?.('[data-rmt-letter-open]');
    if (paper) paper.hidden = true;
    if (seal) seal.hidden = false;
}

async function openInFloor(body) {
    const moduleId = body?.dataset?.rmtModule || '';
    const revealId = body?.dataset?.rmtReveal || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item || !body) return;
    if (body.dataset.rmtFloorLive === '1') body.removeAttribute('data-rmt-floor-live');
    body.dataset.rmtLetterRead = '1';
    const host = body.closest?.('[data-rmt-floor-shell]');
    if (host?.dataset?.rmtPhase !== 'reveal') {
        body.replaceChildren();
        return;
    }
    if (!writeRound(body, moduleId, revealId)) return;
    rememberOpened(revealId);
}

function openReveal(revealId) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(revealId || '')) return;
    const seal = document.querySelector(`[data-rmt-floor-shell][data-rmt-reveal="${revealId}"] [data-rmt-letter-open]`);
    if (!seal || seal.hidden) return;
    const compact = seal.classList.contains('rmt-heart-letter-strip');
    const paper = seal.parentElement?.querySelector('[data-rmt-letter-paper]');
    if (paper) paper.hidden = false;
    if (!compact) seal.hidden = true;
    const body = paper?.querySelector?.('[data-rmt-floor-body]');
    if (compact && body) void openInFloor(body);
}

function watchFloorAction(promise, waiting) {
    return promise.then(result => {
        if (result?.action === 'wait' || result?.action === 'busy') {
            globalThis.toastr?.info?.(waiting, '心迹回廊');
        }
    });
}

function onClick(event) {
    const fill = event.target?.closest?.('[data-rmt-floor-fill]');
    if (fill) {
        event.preventDefault();
        event.stopPropagation();
        fill.disabled = true;
        void auto_memory_scheduler.fillFloorGap().finally(() => { fill.disabled = false; sync(); });
        return;
    }
    const repair = event.target?.closest?.('[data-rmt-floor-achievement]');
    if (repair) {
        event.preventDefault();
        event.stopPropagation();
        repair.disabled = true;
        void auto_memory_scheduler.repairFloorAchievement().catch(error => {
            console.warn('[HeartbeatMemories] achievement repair skipped', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.('这一次没能补上成就。回忆还在，可以再点一次。', '心口顿了一下');
        }).finally(() => { repair.disabled = false; sync(); });
        return;
    }
    const complete = event.target?.closest?.('[data-rmt-floor-complete]');
    if (complete) {
        event.preventDefault();
        event.stopPropagation();
        complete.disabled = true;
        watchFloorAction(auto_memory_scheduler.completeFloorRound(), '等这楼正文写完，再补这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor complete skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { complete.disabled = false; sync(); });
        return;
    }
    const redo = event.target?.closest?.('[data-rmt-floor-redo]');
    if (redo) {
        event.preventDefault();
        event.stopPropagation();
        redo.disabled = true;
        watchFloorAction(auto_memory_scheduler.retryFloorRound(), '等这楼正文写完，再重写这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor redo skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { redo.disabled = false; sync(); });
        return;
    }
    const retry = event.target?.closest?.('[data-rmt-floor-retry]');
    if (retry) {
        event.preventDefault();
        event.stopPropagation();
        retry.disabled = true;
        watchFloorAction(auto_memory_scheduler.resumeFloorPlan(), '等这楼正文写完，再重写这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor retry skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { retry.disabled = false; sync(); });
        return;
    }
    const close = event.target?.closest?.('[data-rmt-letter-close]');
    if (close) {
        event.preventDefault();
        event.stopPropagation();
        const paper = close.closest?.('[data-rmt-letter-paper]');
        const seal = paper?.parentElement?.querySelector?.('[data-rmt-letter-open]');
        if (paper) paper.hidden = true;
        if (seal) seal.hidden = false;
        return;
    }
    const clipButton = event.target?.closest?.('[data-rmt-journal-clip]');
    if (clipButton) { event.preventDefault(); event.stopPropagation(); void journal_clip.clipToJournal(clipButton.dataset.rmtJournalClip); return; }
    const jump = event.target?.closest?.('[data-rmt-letter-jump]');
    if (jump) {
        event.preventDefault();
        event.stopPropagation();
        const mode = jump.dataset.rmtModule || '';
        if (!Object.values(core_constants.MODE).includes(mode)) return;
        rememberOpened(jump.dataset.rmtReveal || '');
        try {
            ui_overlay.openOverlay();
            void Promise.resolve(ui_overlay.openCachedOrGenerate(mode)).catch(error => {
                globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
            });
        } catch (error) {
            globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        }
        return;
    }
    const read = event.target?.closest?.('[data-rmt-letter-read]');
    if (read) {
        event.preventDefault();
        event.stopPropagation();
        const paper = read.closest?.('[data-rmt-letter-paper]') || read.closest?.('[data-rmt-floor-shell]');
        void openInFloor(paper?.querySelector?.('[data-rmt-floor-body]'));
        return;
    }
    const seal = event.target?.closest?.('[data-rmt-letter-open]');
    if (!seal) return;
    event.preventDefault();
    event.stopPropagation();
    const host = seal.closest?.('[data-rmt-floor-shell]');
    if (host?.dataset?.rmtPhase !== 'reveal') return;
    const compact = seal.classList.contains('rmt-heart-letter-strip');
    const paper = seal.parentElement?.querySelector('[data-rmt-letter-paper]');
    if (compact && paper && !paper.hidden) {
        paper.hidden = true;
        return;
    }
    if (paper) paper.hidden = false;
    if (!compact) seal.hidden = true;
    const body = paper?.querySelector?.('[data-rmt-floor-body]');
    if (compact && body) void openInFloor(body);
}
function rememberOpened(revealId) {
    if (!revealId) return;
    try {
        const context = core_context.currentCharacterGuard();
        const snapshot = readSnapshot(context);
        const marked = ui_reveal.markRevealOpened(snapshot, revealId, Date.now());
        if (!marked.changed) return;
        auto_memory_plan.commitAutoMemoryMetadata(context.chatMetadata, marked.snapshot, snapshot.plan.revision);
        context.saveMetadataDebounced?.();
    } catch (error) {
        console.warn('[HeartbeatMemories] reveal read state skipped', core_text.safeErrorDiagnostic(error));
    }
}

export function stopAutoMemoryShell() {
    cleanup?.();
    cleanup = null;
    if (timer) clearInterval(timer);
    timer = 0;
    lastPhase = '';
    sawPhase = false;
    lastSignature = null;
    lastLivePhase = '';
    incrementMemo.clear();
    clearShells();
}

export function startAutoMemoryShell() {
    stopAutoMemoryShell();
    let context;
    try { context = core_context.getContext(); }
    catch { return; }
    const source = context?.eventSource;
    const types = context?.eventTypes || context?.event_types || {};
    const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.MESSAGE_UPDATED, types.CHARACTER_MESSAGE_RENDERED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
    const onChat = () => { lastPhase = ''; sawPhase = false; sync(); };
    const listener = () => sync();
    if (source?.on) {
        for (const type of events) source.on(type, type === types.CHAT_CHANGED ? onChat : listener);
        cleanup = () => { for (const type of events) source.off?.(type, type === types.CHAT_CHANGED ? onChat : listener); };
    }
    document.addEventListener('click', onClick);
    const removeToggle = () => {
        document.removeEventListener('click', onClick);
    };
    const previous = cleanup;
    cleanup = () => { previous?.(); removeToggle(); };
    timer = setInterval(fallbackTick, 2000);
    sync();
}

// 测试用：读出一次刷新的判断，不改任何状态。
export const __autoMemoryShellTesting = Object.freeze({
    sync, fallbackTick, shellSignature, sameSignature, incrementFor, writeRound, paintHost, letterSlots, tickInputs, chatIndex,
    clearIncrementMemo: () => incrementMemo.clear(),
});
