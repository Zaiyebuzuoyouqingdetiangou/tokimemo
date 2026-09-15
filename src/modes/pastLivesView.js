import * as contract from '../core/pastLivesContract.js';
import * as pastLives from '../modes/pastLives.js';
import * as text from '../core/text.js';
import * as constants from '../core/constants.js';
import * as contextApi from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';
import * as cache from '../core/cache.js';
import * as coordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as generation from '../generation/client.js';
import * as overlay from './overlay.js';
import * as recoveryView from './recoveryView.js';

const MODE = contract.PAST_LIVES_MODE;
const esc = text.esc;
const readonly = () => !!runtimeState.activeArchiveSnapshot && (runtimeState.activeArchiveReadOnly || runtimeState.activeArchiveSnapshot.backupOnly === true);
const paragraphs = value => String(value || '').split(/\n{2,}/u).filter(Boolean).map(part => `<p>${esc(part)}</p>`).join('');
const clueLabel = kind => ({ object: '物证', testimony: '证词', missing: '缺页', note: '旁记' })[kind] || '线索';
const button = (action, label, id = '', extra = '') => `<button type="button" class="rmt-btn" data-rmt-past-lives="${action}" data-rmt-past-lives-id="${esc(id)}" ${extra}>${esc(label)}</button>`;

export function pastLivesHtml(value, { readOnly = false, busy = false, notice = '' } = {}) {
    try {
        const session = contract.pastLivesData(value);
        if (session.kind !== MODE || session.version !== contract.PAST_LIVES_VERSION || !Array.isArray(session.episodes)) throw new Error('shape');
        const ui = contract.pastLivesReadingState(session);
        const selected = session.episodes.find(item => item.id === ui.selectedId);
        const labels = contract.pastLivesLabels(selected?.presentation || session.presentation);
        const generate = readOnly ? '' : button('generate', busy ? '正在续写篇章…' : session.episodes.length ? '再写一篇番外' : '写下第一篇番外', '', busy ? 'disabled' : '');
        const header = `<header class="rmt-past-head"><div><small>另一段人生 · 此刻的你我</small><h2>前世今生</h2><p>${esc(session.characterName || '角色')} 与 ${esc(session.userName || '你')}的番外卷宗</p></div><div class="rmt-past-actions">${generate}</div></header>`;
        const boundary = '<p class="rmt-past-boundary">前世为虚构番外；今生记忆另附真实来源，故事不替两人决定未来。</p>';
        let content = '';
        if (!selected || ui.view === 'library') {
            content = session.episodes.length ? `<div class="rmt-past-library">${session.episodes.map(episode => {
                const label = contract.pastLivesLabels(episode.presentation);
                return `<button type="button" class="rmt-past-cover" data-rmt-past-lives="open" data-rmt-past-lives-id="${esc(episode.id)}"><span class="rmt-past-cover-icon" aria-hidden="true"><i class="fa-solid ${label.icon}"></i></span><span><small>${esc(label.token)} · 番外推演</small><b>${esc(episode.title)}</b><span>${esc(episode.opening.motif)}</span></span><span aria-hidden="true">›</span></button>`;
            }).join('')}</div>` : `<div class="rmt-past-empty"><i class="fa-solid fa-book-open" aria-hidden="true"></i><h3>有些回声，还没有写下</h3><p>从两人的一件物品、一句话或一个选择，打开另一段虚构人生。</p><small>阅读和探索都在本地完成；点击上方生成按钮才使用文本生成额度。</small></div>`;
        } else {
            const readIds = contract.pastLivesReadClueIds(session, ui);
            const allClues = selected.dossiers.flatMap(item => item.clues);
            const annotationHtml = selected.annotations.filter(item => ui.pastLivesClosing || item.afterClueIds.every(id => readIds.has(id)))
                .map(item => `<article class="rmt-past-annotation"><small>${esc(labels.annotation)}</small>${paragraphs(item.text)}</article>`).join('');
            const hiddenCount = selected.annotations.filter(item => !ui.pastLivesClosing && !item.afterClueIds.every(id => readIds.has(id))).length;
            const tabs = `<nav class="rmt-past-tabs" aria-label="番外阅读章节">${button('tab', labels.token, 'draw', `aria-pressed="${ui.view === 'draw'}"`)}${button('tab', labels.dossier, 'dossier', `aria-pressed="${ui.view === 'dossier'}"`)}${button('tab', '今生回响', 'echoes', `aria-pressed="${ui.view === 'echoes'}"`)}${button('tab', labels.closing, 'closing', `aria-pressed="${ui.view === 'closing'}"`)}</nav>`;
            let scene;
            if (ui.view === 'draw') {
                scene = `<section class="rmt-past-draw ${ui.pastLivesDrawn ? 'is-open' : ''}"><span class="rmt-past-seal" aria-hidden="true">${esc(labels.token)}</span><h3>${esc(selected.title)}</h3>${ui.pastLivesDrawn
                    ? `<article class="rmt-past-slip"><small>${esc(selected.opening.title)}</small><h3>${esc(selected.opening.motif)}</h3>${paragraphs(selected.opening.text)}</article>${button('tab', '翻开卷宗', 'dossier')}`
                    : `<p>一段故事，正从熟悉的意象里醒来。</p>${button('draw', labels.draw)}${button('skip-draw', '直接入卷')}`}
                    <details class="rmt-past-source"><summary>引子的今生来源</summary><p>${esc(selected.opening.sourceMemoryAnchor)}</p><small>${esc(selected.opening.sourceMemoryIds.join(' · '))}</small></details></section>`;
            } else if (ui.view === 'dossier') {
                const dossier = selected.dossiers.find(item => item.id === ui.selectedEntryId) || selected.dossiers[0];
                const chosenClue = dossier?.clues.find(item => item.id === ui.selectedKey);
                const docket = selected.dossiers.length > 1 ? `<nav class="rmt-past-docket" aria-label="选择卷宗">${selected.dossiers.map(item => button('dossier', item.title, item.id, `aria-pressed="${dossier?.id === item.id}"`)).join('')}</nav>` : '';
                scene = dossier ? `${docket}<article class="rmt-past-paper"><header><small>虚构卷宗${dossier.era ? ' · ' + esc(dossier.era) : ''}</small><h3>${esc(dossier.title)}</h3></header>${paragraphs(dossier.synopsis)}</article>
                    <div class="rmt-past-clues" aria-label="可阅读的卷宗线索">${dossier.clues.map(clue => `<button type="button" class="rmt-past-clue ${clue.kind === 'missing' ? 'is-missing' : ''}" data-rmt-past-lives="clue" data-rmt-past-lives-id="${esc(clue.id)}" aria-pressed="${chosenClue?.id === clue.id}"><small>${esc(clueLabel(clue.kind))}${readIds.has(clue.id) ? ' · 已读' : ''}</small><b>${esc(clue.title)}</b><span>${clue.kind === 'missing' ? '一处字迹留着空白' : '点开阅读'}</span></button>`).join('')}</div>
                    ${chosenClue ? `<article class="rmt-past-evidence" id="rmt-past-current-evidence"><small>${esc(clueLabel(chosenClue.kind))}${chosenClue.kind === 'testimony' ? ' · ' + esc(chosenClue.speaker === 'char' ? session.characterName : chosenClue.speaker === 'user' ? session.userName : '卷内记述') : ''} · 虚构</small><h3>${esc(chosenClue.title)}</h3>${paragraphs(chosenClue.text)}${chosenClue.kind === 'missing' ? readIds.has(chosenClue.id)
                        ? `<div class="rmt-past-revealed" role="status"><small>字迹已显</small>${paragraphs(chosenClue.revealedText)}</div>`
                        : button('reveal', labels.missing, chosenClue.id) : ''}</article>` : dossier.clues.length ? '<p class="rmt-past-hint">选一件线索，读它留下的痕迹。</p>' : '<p class="rmt-past-hint">这一卷的文字已经完整，无需额外寻证。</p>'}`
                    : '<article class="rmt-past-paper"><h3>这一篇，写在引子与回响之间</h3><p>没有另设卷宗，可继续读今生回响。</p></article>';
                scene += `<div class="rmt-past-actions">${button('tab', '看看今生回响', 'echoes')}${button('read-all', '略过探索，读完整旁批')}</div>`;
            } else if (ui.view === 'echoes') {
                scene = `<div class="rmt-past-echoes">${selected.echoes.map(echo => `<article class="rmt-past-echo"><small>${echo.kind === 'memory' ? '今生真实记忆' : '未来的一种可能'}</small><h3>${esc(echo.title)}</h3>${paragraphs(echo.text)}${echo.reflection ? `<div class="rmt-past-reflection">${paragraphs(echo.reflection)}</div>` : ''}${echo.kind === 'memory' ? `<details class="rmt-past-source"><summary>记忆来源</summary><p>${esc(echo.sourceMemoryAnchor)}</p><small>${esc(echo.sourceMemoryIds.join(' · '))}</small></details>` : ''}</article>`).join('') || '<article class="rmt-past-paper"><h3>让回声停在纸上</h3><p>这一篇没有另写今生回响，也没有把虚构故事当成已经应验的往事。</p></article>'}</div><div class="rmt-past-actions">${button('tab', `翻到${labels.closing}`, 'closing')}</div>`;
            } else {
                scene = `<article class="rmt-past-closing"><small>${esc(labels.closing)} · 今生仍可选择</small><h3>${esc(selected.title)}</h3>${ui.pastLivesClosing
                    ? `${paragraphs(selected.closing.text)}<footer>${esc(selected.closing.signature || session.characterName)}</footer>`
                    : `<p>卷宗读到这里，留下最后一处字迹。</p>${button('closing', `读${labels.closing}`)}`}</article>`;
            }
            content = `<div class="rmt-past-actions rmt-past-reader-back">${button('library', '返回篇章架')}<span>${esc(selected.title)}</span></div>${tabs}<div class="rmt-past-reader"><div class="rmt-past-main">${scene}</div><aside class="rmt-past-margin" aria-label="${esc(labels.annotation)}"><h3>${esc(labels.annotation)}</h3>${annotationHtml || '<p class="rmt-past-hint">这页暂未留下旁批。</p>'}${hiddenCount ? `<p class="rmt-past-hint">线索里还藏着 ${hiddenCount} 处补记；也可直接读完整旁批。</p>` : ''}${allClues.length && !ui.pastLivesClosing ? button('read-all', '读完整旁批') : ''}</aside></div>`;
        }
        return `<section class="rmt-past-lives" data-rmt-past-presentation="${['classical', 'modern', 'fantasy', 'neutral'].includes(selected?.presentation || session.presentation) ? selected?.presentation || session.presentation : 'neutral'}">${header}${boundary}${notice ? `<p class="rmt-past-notice" role="status">${esc(notice)}</p>` : ''}${content}</section>`;
    } catch { return '<section class="rmt-past-lives"><h2>前世今生</h2><p>这份番外暂不可读取，已保留原记录。</p></section>'; }
}

export function assertShownPastLivesTarget() {
    const shown = runtimeState.activeSession;
    if (runtimeState.activeMode !== MODE || shown?.kind !== MODE) throw new Error('前世今生已关闭。');
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot) {
        if (shown.chatId !== snapshot.chatId || shown.archiveRevision !== snapshot.memory?.archiveRevision
            || shown.characterName !== snapshot.memory?.characterName || shown.userName !== snapshot.memory?.userName)
            throw new Error('显示的番外与目标档案不一致，请重新打开。');
        return { memory: snapshot.memory, context: null };
    }
    const context = contextApi.currentCharacterGuard();
    const memory = repository.requireArchive(context);
    if (shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision
        || shown.characterName !== memory.characterName || shown.userName !== memory.userName
        || (shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context)))
        throw new Error('聊天或角色已切换，请重新打开对应番外。');
    return { memory, context };
}

export function renderPastLives() {
    if (runtimeState.activeMode !== MODE || runtimeState.activeSession?.kind !== MODE) return;
    overlay.topTitle('前世今生');
    const ui = contract.pastLivesReadingState(runtimeState.activeSession);
    overlay.setBackVisible(true, ui.view === 'library' ? (runtimeState.activeArchiveSnapshot ? '档案' : '当前档案') : '篇章架');
    const body = overlay.bodyEl();
    if (!body) return;
    try {
        const { memory, context } = assertShownPastLivesTarget();
        if (!pastLives.readablePastLivesSession(runtimeState.activeSession, memory)) throw new Error('这份番外暂不可读取，原记录保持不变。');
        const stored = runtimeState.activeArchiveSnapshot?.cache || (context ? cache.getCache(context) : null);
        const recovery = stored ? recoveryView.recoveryBannerHtml({ ...stored, __generationRecoveryV1: { [MODE]: stored.__generationRecoveryV1?.[MODE] } }, memory, { readOnly: readonly() }) : '';
        body.innerHTML = recovery + pastLivesHtml(runtimeState.activeSession, { readOnly: readonly(), busy: coordinator.isModeGenerating(MODE, context) });
    } catch (error) {
        body.innerHTML = `<section class="rmt-past-lives"><h2>前世今生</h2><p role="status">${esc(text.safeErrorSummary(error))}</p></section>`;
    }
}

export function closePastLivesDetail() {
    const session = runtimeState.activeSession;
    if (runtimeState.activeMode !== MODE || session?.kind !== MODE || session.view === 'library') return false;
    session.view = 'library';
    renderPastLives();
    return true;
}

function markClueRead(session, episode, id) {
    const clues = episode.dossiers.flatMap(item => item.clues);
    const index = clues.findIndex(item => item.id === id);
    if (index < 0) return;
    const mask = contract.pastLivesReadingState(session).pastLivesReadMask.padEnd(clues.length, '0').split('');
    mask[index] = '1';
    session.pastLivesReadMask = mask.join('');
}

// Reading is UI-only. No provider call or persistence is hidden behind opening a page.
export async function handlePastLivesAction(action, id = '') {
    try {
        assertShownPastLivesTarget();
        const session = runtimeState.activeSession;
        if (action === 'generate') {
            if (readonly() || coordinator.isModeGenerating(MODE)) return;
            const extra = runtimeState.activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtimeState.activeArchiveSnapshot) : {};
            return await generation.generateMode(MODE, { ...extra, background: false });
        }
        const ui = contract.pastLivesReadingState(session);
        Object.assign(session, ui);
        if (action === 'library') session.view = 'library';
        if (action === 'open') {
            const episode = session.episodes.find(item => item.id === id);
            if (!episode) return;
            if (session.selectedId !== episode.id) Object.assign(session, { selectedId: episode.id, selectedEntryId: episode.dossiers[0]?.id || '',
                selectedKey: '', pastLivesReadMask: '', pastLivesDrawn: false, pastLivesClosing: false });
            session.view = 'draw';
        }
        const episode = session.episodes.find(item => item.id === session.selectedId);
        if (episode) {
            if (action === 'draw') session.pastLivesDrawn = true;
            if (action === 'skip-draw') { session.pastLivesDrawn = true; session.view = 'dossier'; }
            if (action === 'tab' && contract.PAST_LIVES_VIEWS.includes(id) && id !== 'library') session.view = id;
            if (action === 'dossier' && episode.dossiers.some(item => item.id === id)) { session.selectedEntryId = id; session.selectedKey = ''; session.view = 'dossier'; }
            if (['clue', 'reveal'].includes(action)) {
                const dossier = episode.dossiers.find(item => item.clues.some(clue => clue.id === id));
                const clue = dossier?.clues.find(item => item.id === id);
                if (!clue) return;
                session.selectedEntryId = dossier.id; session.selectedKey = id; session.view = 'dossier';
                if (action === 'reveal' || clue.kind !== 'missing') markClueRead(session, episode, id);
            }
            if (action === 'read-all') session.pastLivesClosing = true;
            if (action === 'closing') session.pastLivesClosing = true;
        }
        renderPastLives();
        // Restore keyboard focus to the same code-owned action when it still exists.
        const nodes = overlay.bodyEl()?.querySelectorAll?.('[data-rmt-past-lives]') || [];
        const matching = [...nodes].find(node => node.dataset.rmtPastLives === action && node.dataset.rmtPastLivesId === id);
        if (matching) matching.focus?.({ preventScroll: true });
        else {
            // A reveal/draw/closing action replaces its own button. Preserve a
            // meaningful keyboard position in the newly opened local content.
            const target = overlay.bodyEl()?.querySelector?.(action === 'reveal' ? '.rmt-past-revealed'
                : action === 'closing' ? '.rmt-past-closing'
                    : action === 'draw' ? '.rmt-past-slip'
                        : '.rmt-past-main h3, .rmt-past-cover');
            if (target) { target.tabIndex = -1; target.focus?.({ preventScroll: true }); }
        }
    } catch (error) { globalThis.toastr?.error?.(text.toastText(text.safeErrorSummary(error)), '心迹回廊 · 前世今生'); }
}

export function pastLivesCss(root = '#' + constants.OVERLAY_ID) {
    return `
${root} .rmt-past-lives{max-width:1120px;margin-inline:auto;padding:clamp(16px,3vw,32px);background:var(--rmt-theme-bg);color:var(--rmt-theme-text);font-size:16px;line-height:1.75;min-width:0;writing-mode:horizontal-tb}
${root} .rmt-past-lives *{box-sizing:border-box;min-width:0;overflow-wrap:anywhere}
${root} .rmt-past-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-bottom:20px;border-bottom:1px solid var(--rmt-theme-border)}
${root} .rmt-past-head h2{margin:5px 0!important;font-size:28px!important;letter-spacing:.06em!important}
${root} .rmt-past-head p{margin:0!important}
${root} .rmt-past-boundary{margin:14px 0 24px!important;font-size:13px!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-past-actions,${root} .rmt-past-tabs,${root} .rmt-past-docket{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
${root} .rmt-past-lives button{cursor:pointer;min-height:44px;max-width:100%;touch-action:manipulation;transition:background .15s ease,border-color .15s ease}
${root} .rmt-past-lives button:disabled{cursor:default}
${root} .rmt-past-lives :is(button,summary):focus-visible{outline:3px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px;scroll-margin-block:20px}
${root} .rmt-past-lives [aria-pressed=true]{border:2px solid var(--rmt-theme-accent-ink)!important}
${root} .rmt-past-library{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
${root} .rmt-past-cover{width:100%;display:grid;grid-template-columns:44px minmax(0,1fr) 12px;align-items:center;gap:16px;text-align:left;padding:24px!important;min-height:150px!important;border:1px solid var(--rmt-theme-border);border-radius:4px 18px 18px 4px;background:var(--rmt-paper-letter)!important;color:var(--rmt-paper-letter-ink)!important;--rmt-content-ink:var(--rmt-paper-letter-ink);box-shadow:0 8px 22px var(--rmt-theme-shadow),inset 5px 0 var(--rmt-theme-accent)}
${root} .rmt-past-cover>span:nth-child(2){display:grid;gap:6px}
${root} .rmt-past-cover b{font-size:20px!important}
${root} .rmt-past-cover-icon{font-size:28px;opacity:.8}
${root} .rmt-past-empty{text-align:center;padding:50px 20px;border:1px dashed var(--rmt-theme-border);border-radius:18px;background:var(--rmt-theme-surface-solid)}
${root} .rmt-past-empty>i{font-size:40px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-past-empty p{max-width:34em;margin:12px auto!important}
${root} .rmt-past-reader-back{margin-bottom:16px}
${root} .rmt-past-reader-back>span{color:var(--rmt-theme-muted);font-size:14px}
${root} .rmt-past-tabs{padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid var(--rmt-theme-border)}
${root} .rmt-past-reader{display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,25%);align-items:start;gap:24px}
${root} .rmt-past-main>.rmt-past-actions{margin-top:22px}
${root} .rmt-past-draw{padding:clamp(22px,5vw,48px);text-align:center;border:1px solid var(--rmt-theme-border);border-radius:4px 22px 4px 22px;background:var(--rmt-paper-letter)!important;color:var(--rmt-paper-letter-ink)!important;--rmt-content-ink:var(--rmt-paper-letter-ink);box-shadow:0 12px 28px var(--rmt-theme-shadow)}
${root} .rmt-past-seal{display:inline-block;border:1px solid currentColor;padding:7px 14px;letter-spacing:.15em;border-radius:3px}
${root} .rmt-past-draw>.rmt-btn{margin:8px 4px}
${root} .rmt-past-slip{margin:22px auto;padding:22px 18px;border-top:1px solid currentColor;border-bottom:1px solid currentColor;text-align:left;max-width:38em}
${root} .rmt-past-paper,${root} .rmt-past-evidence,${root} .rmt-past-closing,${root} .rmt-past-echo{padding:clamp(18px,3vw,30px);border:1px solid var(--rmt-theme-border);border-radius:6px;background:var(--rmt-paper-letter)!important;color:var(--rmt-paper-letter-ink)!important;--rmt-content-ink:var(--rmt-paper-letter-ink);box-shadow:0 7px 18px var(--rmt-theme-shadow)}
${root} .rmt-past-paper p,${root} .rmt-past-evidence p,${root} .rmt-past-closing p,${root} .rmt-past-echo p,${root} .rmt-past-slip p{white-space:pre-wrap;line-height:1.9!important}
${root} .rmt-past-docket{margin-bottom:16px}
${root} .rmt-past-clues{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}
${root} .rmt-past-clue{display:grid;gap:8px;align-content:start;text-align:left;min-height:132px!important;padding:16px!important;background:var(--rmt-paper-note)!important;color:var(--rmt-paper-note-ink)!important;--rmt-content-ink:var(--rmt-paper-note-ink);border:1px solid var(--rmt-theme-border);border-radius:3px 3px 14px 3px}
${root} .rmt-past-clue.is-missing{border-style:dashed;background:var(--rmt-paper-note-blue)!important;--rmt-content-ink:var(--rmt-paper-note-blue-ink);color:var(--rmt-paper-note-blue-ink)!important}
${root} .rmt-past-clue>span{font-size:13px}
${root} .rmt-past-revealed{margin-top:20px;padding:18px;border-top:1px dashed currentColor;background:var(--rmt-paper-journal)!important;--rmt-content-ink:var(--rmt-paper-journal-ink);color:var(--rmt-paper-journal-ink)!important;animation:rmt-past-reveal .24s ease both}
${root} .rmt-past-margin{padding-left:20px;border-left:1px solid var(--rmt-theme-border)}
${root} .rmt-past-margin>h3{font-size:16px!important}
${root} .rmt-past-annotation{padding:16px;margin:0 0 16px;background:var(--rmt-paper-note-rose)!important;color:var(--rmt-paper-note-rose-ink)!important;--rmt-content-ink:var(--rmt-paper-note-rose-ink);border-radius:3px 3px 12px 3px;border-left:3px solid currentColor}
${root} .rmt-past-annotation p{font-size:14px!important;line-height:1.8!important;white-space:pre-wrap}
${root} .rmt-past-hint{font-size:13px!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-past-echoes{display:grid;gap:18px}
${root} .rmt-past-reflection{padding-top:12px;margin-top:16px;border-top:1px solid currentColor}
${root} .rmt-past-source{margin-top:20px;text-align:left}
${root} .rmt-past-source summary{cursor:pointer;min-height:44px;padding-block:10px;font-size:13px}
${root} .rmt-past-source p{font-size:14px!important}
${root} .rmt-past-closing footer{text-align:right;margin-top:28px;padding-top:16px;border-top:1px solid currentColor}
${root} .rmt-past-notice{padding:12px 16px;border-left:3px solid var(--rmt-theme-accent-ink);background:var(--rmt-theme-soft)}
@keyframes rmt-past-reveal{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:760px){${root} .rmt-past-reader{grid-template-columns:minmax(0,1fr)}${root} .rmt-past-margin{border-left:0;border-top:1px solid var(--rmt-theme-border);padding:14px 0 0}${root} .rmt-past-library{grid-template-columns:minmax(0,1fr)}${root} .rmt-past-clues{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:390px){${root} .rmt-past-clues{grid-template-columns:minmax(0,1fr)}${root} .rmt-past-cover{padding:18px!important;gap:12px}${root} .rmt-past-tabs>.rmt-btn{flex:1 1 calc(50% - 10px)}}
@media(prefers-reduced-motion:reduce){${root} .rmt-past-revealed{animation:none}${root} .rmt-past-lives button{transition:none}}
`;
}

export const PAST_LIVES_CSS = pastLivesCss();
