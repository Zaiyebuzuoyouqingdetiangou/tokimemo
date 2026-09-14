import * as contract from '../core/timeStoriesContract.js';
import * as modes from '../modes/timeStories.js';
import * as text from '../core/text.js';
import * as constants from '../core/constants.js';
import * as contextApi from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as cache from '../core/cache.js';
import * as coordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as overlay from './overlay.js';
import * as recoveryView from './recoveryView.js';

const esc = text.esc;
const paragraphs = value => String(value || '').split(/\n+/u).filter(Boolean).map(part => `<p>${esc(part)}</p>`).join('');
const readOnly = () => !!runtimeState.activeArchiveSnapshot && (runtimeState.activeArchiveReadOnly || runtimeState.activeArchiveSnapshot.backupOnly === true);
const button = (action, label, id = '', extra = '') => `<button type="button" class="rmt-btn" data-rmt-time-story="${action}" data-rmt-time-story-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
const nameFor = (session, role) => role === 'char' ? session.characterName : session.userName;
const presentation = value => ['modern', 'classical', 'fantasy', 'scifi', 'neutral'].includes(value) ? value : 'neutral';
const palette = value => ['rose', 'blue', 'moss', 'gold', 'plum', 'slate'].includes(value) ? value : 'slate';
const mediumIcon = value => ({ phone: 'fa-phone', terminal: 'fa-satellite-dish', relic: 'fa-gem', object: 'fa-hourglass-half', voice: 'fa-wave-square' })[value] || 'fa-wave-square';
const connectLabel = value => ({ phone: '接通', terminal: '接入通讯', relic: '回应回响', object: '倾听回响', voice: '循声回应' })[value] || '倾听回响';

function echoHtml(session, episode, ui) {
    const ends = episode.ends || [];
    const end = (value, index) => `<div class="rmt-time-end"><small>${index ? '彼端' : '此端'}</small><b>${esc(nameFor(session, value?.role) || '')}</b><span>${esc(value?.time || '')}</span></div>`;
    const endpoints = `<div class="rmt-time-connection">${end(ends[0], 0)}<div class="rmt-time-medium" aria-label="联络媒介"><i class="fa-solid ${mediumIcon(episode.medium?.kind)}" aria-hidden="true"></i><span>${esc(episode.medium?.label || '回响')}</span></div>${end(ends[1], 1)}</div>`;
    const lines = Array.isArray(episode.lines) ? episode.lines : [];
    const index = Math.max(0, Math.min(lines.length, Number(ui.dialogueIndex) || 0));
    let reader;
    if (!ui.reading) {
        reader = `<article class="rmt-time-prose rmt-time-opening">${paragraphs(episode.opening)}<div class="rmt-time-actions">${button('connect', connectLabel(episode.medium?.kind))}</div></article>`;
    } else if (index < lines.length) {
        const line = lines[index];
        const endpoint = line.speaker === 'a' ? ends[0] : line.speaker === 'b' ? ends[1] : null;
        reader = `<article class="rmt-time-line" data-rmt-time-speaker="${['a', 'b'].includes(line.speaker) ? line.speaker : 'narrator'}" aria-live="polite"><header><b>${esc(endpoint ? nameFor(session, endpoint.role) : '回声之间')}</b>${endpoint ? `<small>${esc(endpoint.time)}</small>` : ''}</header>${paragraphs(line.text)}</article><div class="rmt-time-reading-controls">${button('prev-line', '上一句', '', index === 0 ? 'disabled' : '')}<span>${index + 1} / ${lines.length}</span>${button('next-line', index + 1 === lines.length ? '此后' : '下一句')}</div>`;
    } else {
        reader = `<article class="rmt-time-prose rmt-time-closing" aria-live="polite"><small>传递的信息</small>${paragraphs(episode.message)}<hr><h3>回响之后</h3>${paragraphs(episode.closing)}</article><div class="rmt-time-actions">${button('prev-line', '返回最后一句')}${button('replay', '重听回响')}</div>`;
    }
    return endpoints + reader;
}

export function timeStoriesHtml(session, { readOnly: locked = false, busy = false } = {}) {
    try {
        if (!contract.isTimeStoryMode(session?.kind) || session.version !== 1 || !Array.isArray(session.episodes)) throw new Error('shape');
        const mode = session.kind;
        const label = contract.timeStoryLabel(mode);
        const ui = contract.timeStoryReadingState(session);
        const selected = session.episodes.find(item => item.id === ui.selectedId);
        const inStory = !!selected && ui.view === 'story';
        const generate = locked || inStory ? '' : `<button type="button" class="rmt-btn" data-rmt-generate-mode="${mode}" ${busy ? 'disabled' : ''}>${busy ? '正在写下故事…' : session.episodes.length ? '再写一篇' : '生成第一篇'}</button>`;
        const returnButton = '<button type="button" class="rmt-btn" data-rmt-mode="phone">返回终端</button>';
        const header = `<header class="rmt-time-head"><div><small>时空番外${locked ? ' · 只读' : ''}</small><h2>${esc(label)}</h2></div><div class="rmt-time-actions">${generate}${returnButton}</div></header>`;
        const content = inStory
            ? `<div class="rmt-time-story-head">${button('library', '返回篇章')}<div><small>${esc(selected.motif)}</small><h3>${esc(selected.title)}</h3></div></div>${echoHtml(session, selected, ui)}`
            : session.episodes.length ? `<div class="rmt-time-library">${session.episodes.map(episode => `<button type="button" class="rmt-time-cover" data-rmt-time-story="open" data-rmt-time-story-id="${esc(episode.id)}"><i class="fa-solid ${mediumIcon(episode.medium?.kind)}" aria-hidden="true"></i><span><small>${esc(episode.motif)}</small><b>${esc(episode.title)}</b><small>${esc(episode.medium?.label || '')}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`
                : `<div class="rmt-time-empty"><i class="fa-solid fa-wave-square" aria-hidden="true"></i><h3>有一道回声，尚未抵达</h3></div>`;
        return `<section class="rmt-time-stories" data-rmt-time-presentation="${presentation(selected?.presentation)}" data-rmt-time-palette="${palette(selected?.palette)}">${header}${content}</section>`;
    } catch { return '<section class="rmt-time-stories"><p role="status">这篇故事暂时无法读取，原内容仍保留。</p></section>'; }
}

function assertShownTarget() {
    const shown = runtimeState.activeSession;
    if (!contract.isTimeStoryMode(runtimeState.activeMode) || shown?.kind !== runtimeState.activeMode) throw new Error('故事已经关闭。');
    const snapshot = runtimeState.activeArchiveSnapshot;
    const context = snapshot ? null : contextApi.currentCharacterGuard();
    const memory = snapshot ? snapshot.memory : repository.requireArchive(context);
    if (!memory || shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision
        || shown.characterName !== memory.characterName || shown.userName !== memory.userName
        || (snapshot && shown.chatId !== snapshot.chatId)
        || (!snapshot && shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context)))
        throw new Error('档案或角色已经变化，请重新打开对应故事。');
    if (!modes.readableTimeStoriesSession(shown, memory)) throw new Error('这篇故事暂时无法读取，原内容仍保留。');
    return { context, memory };
}

export function renderTimeStories() {
    if (!contract.isTimeStoryMode(runtimeState.activeMode) || runtimeState.activeSession?.kind !== runtimeState.activeMode) return;
    const mode = runtimeState.activeMode;
    overlay.topTitle(contract.timeStoryLabel(mode));
    overlay.setBackVisible(true, runtimeState.activeSession.view === 'story' ? '篇章' : '私人终端');
    const body = overlay.bodyEl();
    if (!body) return;
    try {
        const { context, memory } = assertShownTarget();
        const stored = runtimeState.activeArchiveSnapshot?.cache || (context ? cache.getCache(context) : null);
        const recovery = stored ? recoveryView.recoveryBannerHtml({ ...stored, __generationRecoveryV1: { [mode]: stored.__generationRecoveryV1?.[mode] } }, memory, { readOnly: readOnly() }) : '';
        body.innerHTML = recovery + timeStoriesHtml(runtimeState.activeSession, { readOnly: readOnly(), busy: coordinator.isModeGenerating(mode, context) });
    } catch (error) { body.innerHTML = `<section class="rmt-time-stories"><p role="status">${esc(text.safeErrorSummary(error))}</p></section>`; }
}

export function closeTimeStoryDetail() {
    if (!contract.isTimeStoryMode(runtimeState.activeMode) || runtimeState.activeSession?.view !== 'story') return false;
    try { assertShownTarget(); runtimeState.activeSession.view = 'library'; renderTimeStories(); return true; } catch { return false; }
}

// Only scalar reading state changes here. Generation is handled by the existing
// explicit generate-mode action, with the normal archive target and save guards.
export function handleTimeStoryAction(action, id = '') {
    if (!['library', 'open', 'connect', 'prev-line', 'next-line', 'replay'].includes(action)) return false;
    try {
        assertShownTarget();
        const session = runtimeState.activeSession;
        Object.assign(session, contract.timeStoryReadingState(session));
        if (action === 'library') session.view = 'library';
        if (action === 'open') {
            if (!session.episodes.some(item => item.id === id)) return false;
            if (session.selectedId !== id) Object.assign(session, { selectedId: id, selectedEntryId: '', reading: false, dialogueIndex: 0, tab: 'story' });
            session.view = 'story';
        }
        const episode = session.episodes.find(item => item.id === session.selectedId);
        if (episode && session.kind === 'timeEcho') {
            const count = episode.lines.length;
            if (action === 'connect' || action === 'replay') { session.reading = true; session.dialogueIndex = 0; }
            if (session.reading && action === 'next-line') session.dialogueIndex = Math.min(count, session.dialogueIndex + 1);
            if (session.reading && action === 'prev-line') session.dialogueIndex = Math.max(0, session.dialogueIndex - 1);
        }
        renderTimeStories();
        const body = overlay.bodyEl();
        const nodes = body?.querySelectorAll?.('[data-rmt-time-story]') || [];
        const matching = [...nodes].find(node => node.dataset.rmtTimeStory === action && node.dataset.rmtTimeStoryId === id && !node.disabled);
        const focus = matching || body?.querySelector?.('.rmt-time-line, .rmt-time-closing, .rmt-time-library');
        if (focus) { if (!matching) focus.tabIndex = -1; focus.focus?.({ preventScroll: true }); }
        return true;
    } catch (error) { globalThis.toastr?.error?.(text.toastText(text.safeErrorSummary(error)), '心迹回廊 · 时空番外'); return false; }
}

export function timeStoriesCss(root = '#' + constants.OVERLAY_ID + '[data-rmt-theme-mode] .rmt-body') {
    return `
${root} .rmt-time-stories{--rmt-time-accent:var(--rmt-theme-accent-ink);max-width:1040px;margin-inline:auto;padding:clamp(14px,3vw,30px);color:var(--rmt-theme-text);background:var(--rmt-theme-bg);font-size:16px;line-height:1.8;min-width:0;writing-mode:horizontal-tb}
${root} .rmt-time-stories *{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:anywhere}
${root} .rmt-time-stories p{margin:0 0 1em!important;white-space:pre-wrap}
${root} .rmt-time-stories :is(h2,h3){margin:4px 0 12px!important;color:inherit!important;line-height:1.4!important}
${root} .rmt-time-stories h2{font-size:27px!important}
${root} .rmt-time-stories h3{font-size:21px!important}
${root} .rmt-time-stories small{font-size:13px;line-height:1.6;color:var(--rmt-theme-muted)}
${root} .rmt-time-stories button{min-height:44px;cursor:pointer;touch-action:manipulation;white-space:normal;line-height:1.5}
${root} .rmt-time-stories button:disabled{cursor:default}
${root} .rmt-time-stories button:focus-visible{outline:3px solid var(--rmt-time-accent)!important;outline-offset:3px}
${root} .rmt-time-stories [aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--rmt-time-accent)!important}
${root} .rmt-time-head,${root} .rmt-time-story-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--rmt-theme-border);padding-bottom:18px;margin-bottom:22px}
${root} .rmt-time-story-head{justify-content:flex-start;align-items:flex-start}
${root} .rmt-time-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
${root} .rmt-time-library{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
${root} .rmt-time-cover{display:grid;grid-template-columns:32px minmax(0,1fr) 12px;align-items:center;gap:14px;padding:22px!important;text-align:left;border:1px solid var(--rmt-theme-border);border-radius:18px;background:var(--rmt-theme-surface)!important;color:var(--rmt-theme-text)!important;min-height:132px!important}
${root} .rmt-time-cover>span:nth-child(2){display:grid;gap:5px}
${root} .rmt-time-cover b{font-size:20px}
${root} .rmt-time-cover>i{color:var(--rmt-time-accent);font-size:25px}
${root} .rmt-time-empty{text-align:center;padding:50px 18px;border:1px dashed var(--rmt-theme-border);border-radius:20px}
${root} .rmt-time-empty>i{font-size:36px;color:var(--rmt-time-accent);margin-bottom:18px}
${root} .rmt-time-connection{display:grid;grid-template-columns:minmax(0,1fr) minmax(64px,.7fr) minmax(0,1fr);align-items:center;gap:12px;padding:24px 12px;border:1px solid var(--rmt-theme-border);border-radius:24px;background:var(--rmt-theme-surface);margin-bottom:22px}
${root} .rmt-time-end{display:grid;gap:4px;text-align:center}
${root} .rmt-time-end>b{font-size:22px}
${root} .rmt-time-end>span{font-size:14px}
${root} .rmt-time-medium{display:grid;place-items:center;gap:10px;text-align:center;font-size:13px;color:var(--rmt-time-accent);border-inline:1px solid var(--rmt-theme-border);padding-inline:8px}
${root} .rmt-time-medium>i{font-size:30px}
${root} .rmt-time-prose,${root} .rmt-time-line{padding:clamp(18px,3vw,30px);border:1px solid var(--rmt-theme-border);border-radius:18px;background:var(--rmt-theme-surface);color:var(--rmt-theme-text);margin-bottom:18px}
${root} .rmt-time-line{border-left:4px solid var(--rmt-time-accent);min-height:210px}
${root} .rmt-time-line[data-rmt-time-speaker=b]{border-left-width:1px;border-right:4px solid var(--rmt-time-accent)}
${root} .rmt-time-line header{display:flex;gap:12px;justify-content:space-between;align-items:baseline;flex-wrap:wrap;margin-bottom:22px}
${root} .rmt-time-reading-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0}
${root} .rmt-time-reading-controls>span{font-size:13px;color:var(--rmt-theme-muted)}
${root} .rmt-time-stories[data-rmt-time-palette=rose]{--rmt-time-accent:#c36d89}
${root} .rmt-time-stories[data-rmt-time-palette=blue]{--rmt-time-accent:#679abe}
${root} .rmt-time-stories[data-rmt-time-palette=moss]{--rmt-time-accent:#77977b}
${root} .rmt-time-stories[data-rmt-time-palette=gold]{--rmt-time-accent:#b19760}
${root} .rmt-time-stories[data-rmt-time-palette=plum]{--rmt-time-accent:#a883b1}
${root} .rmt-time-stories[data-rmt-time-palette=slate]{--rmt-time-accent:#8295a3}
${root} .rmt-time-stories[data-rmt-time-presentation=classical]{font-family:Georgia,'Noto Serif SC',serif}
${root} .rmt-time-stories[data-rmt-time-presentation=classical] :is(p,b,strong,small,span,h2,h3,button){font-family:Georgia,'Noto Serif SC',serif!important}
${root} [data-rmt-time-presentation=classical] :is(.rmt-time-prose,.rmt-time-line){border-radius:3px 18px 18px 3px;border-left:4px solid var(--rmt-time-accent);background-image:repeating-linear-gradient(0deg,transparent 0 29px,color-mix(in srgb,var(--rmt-time-accent) 6%,transparent) 30px)}
${root} [data-rmt-time-presentation=fantasy] .rmt-time-connection{border-radius:40px 10px;background-image:radial-gradient(ellipse at center,color-mix(in srgb,var(--rmt-time-accent) 12%,transparent),transparent 70%)}
${root} [data-rmt-time-presentation=fantasy] .rmt-time-prose{border-radius:24px 4px 24px 4px;background-image:radial-gradient(ellipse at top left,color-mix(in srgb,var(--rmt-time-accent) 10%,transparent),transparent 65%)}
${root} [data-rmt-time-presentation=scifi] :is(.rmt-time-connection,.rmt-time-line){border-radius:4px;background-image:linear-gradient(color-mix(in srgb,var(--rmt-time-accent) 5%,transparent) 1px,transparent 1px);background-size:100% 8px}
${root} [data-rmt-time-presentation=scifi] :is(.rmt-time-end,.rmt-time-medium){font-family:ui-monospace,monospace}
${root} .rmt-phone-empty-terminal{width:min(620px,100%);margin:20px auto;padding:24px;border:1px solid var(--rmt-theme-border);border-radius:20px;background:var(--rmt-theme-surface);color:var(--rmt-theme-text);box-sizing:border-box;overflow-wrap:anywhere}
${root} .rmt-phone-empty-terminal .rmt-time-actions{display:flex;gap:12px;flex-wrap:wrap}
${root} .rmt-phone-empty-terminal button{min-height:44px;max-width:100%;white-space:normal}
${root} .rmt-phone-home-grid .rmt-phone-time-echo{min-height:64px}
@media(max-width:600px){${root} .rmt-time-library{grid-template-columns:1fr}${root} .rmt-time-connection{gap:6px;padding:18px 8px}${root} .rmt-time-end>b{font-size:18px}${root} .rmt-time-end>span{font-size:12px}${root} .rmt-time-medium{padding-inline:4px}${root} .rmt-time-head{align-items:flex-start}}
`;
}
