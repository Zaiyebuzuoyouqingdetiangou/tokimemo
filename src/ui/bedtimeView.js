import * as expanded_cg_view from './expandedCgView.js';
import * as contract from '../core/bedtimeContract.js';
import * as bedtimeMode from '../modes/bedtime.js';
import * as contextApi from '../core/context.js';
import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as coordinator from '../core/requestCoordinator.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';
import * as generation from '../generation/client.js';
import * as recoveryView from './recoveryView.js';
import * as overlay from './overlay.js';
import * as text from '../core/text.js';
import * as coreState from '../core/state.js';

const MODE = 'bedtime';
const esc = text.esc;
const runtime = () => coreState.state;
const readOnly = () => !!runtime().activeArchiveSnapshot && (runtime().activeArchiveReadOnly || runtime().activeArchiveSnapshot.backupOnly);
const shownMemory = () => runtime().activeArchiveSnapshot?.memory || repository.getImportedMemory(contextApi.getContext());
const busy = () => runtime().activeArchiveSnapshot ? coordinator.isArchiveTargetModeGenerating(MODE, runtime().activeArchiveSnapshot)
    : coordinator.isModeGenerating(MODE);
const paragraphs = value => `<p>${esc(value || '').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
const button = (action, label, id = '', disabled = false) => `<button type="button" class="rmt-btn" data-rmt-bedtime="${action}"${id ? ` data-rmt-bedtime-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

export function bedtimeHtml(session, { locked = false, generating = false } = {}) {
    try {
        if (session?.kind !== MODE || !Array.isArray(session.stories)) throw new Error('shape');
        const ui = contract.bedtimeReadingState(session);
        const selected = session.stories.find(story => story.id === ui.selectedId) || null;
        const storyPartial = selected?.generationIncomplete === true || selected?.chapters?.some(chapter => chapter.generationIncomplete === true);
        const composer = locked ? '' : `<details class="rmt-bedtime-composer" ${session.stories.length ? '' : 'open'}><summary>写一个新故事</summary><label>题材、气氛或想看的内容（可不填）<textarea data-rmt-bedtime-direction maxlength="${contract.BEDTIME_LIMITS.direction}" placeholder="例如：太空站失窃案；古城里的轻喜剧；由角色自由决定"></textarea></label>${button('new', generating ? '正在写故事…' : '开始新故事', '', generating)}</details>`;
        let content;
        if (ui.view !== 'story' || !selected) {
            content = session.stories.length ? `<nav class="rmt-bedtime-library" aria-label="已保存的睡前故事">${[...session.stories].reverse().map(story => `<button type="button" class="rmt-bedtime-cover" data-rmt-bedtime="open" data-rmt-bedtime-id="${esc(story.id)}"><span aria-hidden="true">☾</span><span><small>${esc(story.genre || '题材待完成')}</small><b>${esc(story.title || '未完成的故事')}</b><small>${story.chapters?.length || 0} 章${story.generationIncomplete || story.chapters?.some(chapter => chapter.generationIncomplete) ? ' · 草稿' : ''}</small></span><span aria-hidden="true">›</span></button>`).join('')}</nav>`
                : '<div class="rmt-bedtime-empty"><span aria-hidden="true">☾</span><h3>今晚想听一个怎样的故事？</h3><p>题材可以自由选择，也可以把方向留空。</p></div>';
        } else {
            const chapters = selected.chapters || [];
            const chapter = chapters[ui.chapterIndex] || chapters[0];
            const controls = `<div class="rmt-bedtime-page-controls">${button('prev', '上一章', '', ui.chapterIndex <= 0)}<span>${chapters.length ? `${ui.chapterIndex + 1} / ${chapters.length}` : '0 / 0'}</span>${button('next', '下一章', '', ui.chapterIndex >= chapters.length - 1)}</div>`;
            content = `<article class="rmt-bedtime-reader"><header>${button('library', '返回故事架')}<small>${esc(selected.genre || '题材待完成')} · 睡前故事</small><h2>${esc(selected.title || '未完成的故事')}</h2><p>${esc(selected.premise || '')}</p></header>${storyPartial ? '<p class="rmt-recovery-status" role="status">这一章尚未完成；已收到的正文可以先读，继续会按原草稿补齐，不会重写旧章节。</p>' : ''}${chapter ? `<section class="rmt-bedtime-chapter"><small>第 ${ui.chapterIndex + 1} 章</small><h3>${esc(chapter.title || '本章标题待完成')}</h3>${paragraphs(chapter.text)}${expanded_cg_view.expandedCgHtml(session, {kind:'bedtime-chapter',containerId:selected.id,slot:'chapter:'+chapter.id}, locked)}</section>${controls}` : '<p role="status">本章正文尚未收到。</p>'}<footer>${locked ? '' : button('continue', generating ? '正在续写…' : '追加下一章', selected.id, generating || storyPartial)}</footer></article>`;
        }
        return `<section class="rmt-bedtime"><header class="rmt-bedtime-head"><div><small>可连续阅读的虚构作品${locked ? ' · 只读' : ''}</small><h2>睡前故事</h2></div>${ui.view === 'story' ? '' : `<small>已保存 ${session.stories.length} 篇</small>`}</header><p class="rmt-bedtime-note">写一个新故事，或接着喜欢的故事读下一章。</p>${composer}${content}</section>`;
    } catch { return '<section class="rmt-bedtime"><p role="status">这份睡前故事暂时无法读取，原内容仍保留。</p></section>'; }
}

function assertShownTarget() {
    const shown = runtime().activeSession;
    if (runtime().activeMode !== MODE || shown?.kind !== MODE) throw contract.bedtimeError('SOURCE', '故事已经关闭，请重新打开。');
    const snapshot = runtime().activeArchiveSnapshot;
    const context = snapshot ? null : contextApi.currentCharacterGuard();
    const currentMemory = snapshot ? snapshot.memory : repository.requireArchive(context);
    const source = cache.generationPageReadingSource(shown, MODE, currentMemory);
    if (!source.memoryBank || shown.chatId !== currentMemory?.chatId || shown.archiveRevision !== currentMemory?.archiveRevision
        || source.session.chatId !== source.memoryBank.chatId || source.session.archiveRevision !== source.memoryBank.archiveRevision
        || (snapshot && shown.chatId !== snapshot.chatId)
        || (!snapshot && !source.source && shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context)))
        throw contract.bedtimeError('SOURCE', '档案或角色已经变化，请重新打开对应故事。');
    const readable = shown.readableProgress?.version === 1
        ? bedtimeMode.readableBedtimeProgressSession(source.session, source.memoryBank)
        : contract.readableBedtime(source.session, source.memoryBank);
    if (!readable) throw contract.bedtimeError('STRUCTURE', '这份睡前故事暂时无法读取，原内容仍保留。');
    return { context, memory: currentMemory };
}

async function persistPartialReading(shown) {
    if (readOnly() || shown.readableProgress?.complete !== false || !shown.readableProgress.draftId) return true;
    const snapshot = runtime().activeArchiveSnapshot, lifecycle = runtime().runtimeLifecycleEpoch;
    let context, target = null;
    if (snapshot) {
        const options = library.archiveTargetGenerationOptions(snapshot);
        target = await options.revalidateArchiveTarget(options.archiveTarget, lifecycle);
        context = options.context;
        context.chatMetadata[constants.MEMORY_KEY] = target.memory;
        context.chatMetadata[constants.CACHE_KEY] = target.cache;
    } else context = contextApi.currentCharacterGuard();
    const memory = target?.memory || repository.requireArchive(context);
    const origin = contextApi.captureTaskOrigin(context, memory.archiveRevision);
    const reading = contract.bedtimeReadingState(shown);
    const updated = await cache.commitGenerationTaskResultMutation(context, shown.readableProgress.draftId,
        (latest, sourceMemory) => {
            if (!bedtimeMode.readableBedtimeProgressSession(latest, sourceMemory)) return null;
            Object.assign(latest, reading); return latest;
        }, { expectedTaskOrigin: origin, archiveTarget: target, stillCurrent: () => contextApi.runtimeLifecycleStillCurrent(lifecycle) });
    if (!updated) throw contract.bedtimeError('SAVE', '阅读位置尚未确认保存，已收到的故事仍保留。');
    if (snapshot && runtime().activeArchiveSnapshot?.entryId === snapshot.entryId) runtime().activeArchiveSnapshot.cache = target.cache;
    if (runtime().activeSession === shown && JSON.stringify(contract.bedtimeReadingState(shown)) === JSON.stringify(reading)) runtime().activeSession = updated;
    return true;
}

export function renderBedtime() {
    if (runtime().activeMode !== MODE || runtime().activeSession?.kind !== MODE) return;
    overlay.topTitle('睡前故事');
    overlay.setBackVisible(true, runtime().activeSession.view === 'story' ? '故事架' : '内容');
    const body = overlay.bodyEl();
    if (!body) return;
    try {
        const { context, memory } = assertShownTarget();
        const stored = runtime().activeArchiveSnapshot?.cache || (context ? cache.getCache(context) : null);
        const recovery = stored ? recoveryView.recoveryBannerHtml({ ...stored, __generationRecoveryV1: { [MODE]: stored.__generationRecoveryV1?.[MODE] } }, memory, { readOnly: readOnly() }) : '';
        body.innerHTML = recovery + bedtimeHtml(runtime().activeSession, { locked: readOnly(), generating: busy() });
    } catch (error) { body.innerHTML = `<section class="rmt-bedtime"><p role="status">${esc(text.safeErrorSummary(error))}</p></section>`; }
}

export function closeBedtimeDetail() {
    if (runtime().activeMode !== MODE || runtime().activeSession?.view !== 'story') return false;
    try { assertShownTarget(); runtime().activeSession.view = 'library'; renderBedtime(); void persistPartialReading(runtime().activeSession); return true; }
    catch { return false; }
}

export async function handleBedtimeAction(action, id = '') {
    try {
        assertShownTarget();
        const session = runtime().activeSession;
        if (action === 'new' || action === 'continue') {
            if (readOnly() || busy()) return false;
            const direction = overlay.bodyEl()?.querySelector?.('[data-rmt-bedtime-direction]')?.value || '';
            const target = runtime().activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtime().activeArchiveSnapshot) : {};
            await generation.generateMode(MODE, { ...target, bedtimeOptions: { action, direction, storyId: action === 'continue' ? id || session.selectedId : '' }, background: false });
            return true;
        }
        Object.assign(session, contract.bedtimeReadingState(session));
        if (action === 'library') session.view = 'library';
        if (action === 'open') {
            const story = session.stories.find(item => item.id === id);
            if (!story) return false;
            session.selectedId = id; session.view = 'story'; session.chapterIndex = 0;
        }
        const selected = session.stories.find(item => item.id === session.selectedId);
        if (selected && action === 'prev') session.chapterIndex = Math.max(0, session.chapterIndex - 1);
        if (selected && action === 'next') session.chapterIndex = Math.min(selected.chapters.length - 1, session.chapterIndex + 1);
        if (!['library', 'open', 'prev', 'next'].includes(action)) return false;
        renderBedtime();
        if (session.readableProgress?.complete === false && !readOnly()) await persistPartialReading(session);
        return true;
    } catch (error) {
        globalThis.toastr?.error?.(text.toastText(text.safeErrorSummary(error)), '心迹回廊 · 睡前故事');
        return false;
    }
}

export function bedtimeCss(root = '#' + constants.OVERLAY_ID + '[data-rmt-theme-mode] .rmt-body') {
    return `
${root} .rmt-bedtime{max-width:960px;margin-inline:auto;padding:clamp(14px,3vw,30px);color:var(--rmt-theme-text);font-size:16px;line-height:1.85;min-width:0}
${root} .rmt-bedtime *{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:anywhere}
${root} .rmt-bedtime-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--rmt-theme-border);padding-bottom:18px;margin-bottom:12px}
${root} .rmt-bedtime :is(h2,h3){color:inherit!important;line-height:1.45!important;margin:4px 0 12px!important}
${root} .rmt-bedtime h2{font-size:28px!important}${root} .rmt-bedtime h3{font-size:21px!important}
${root} .rmt-bedtime p{white-space:pre-wrap;margin:0 0 1em!important}${root} .rmt-bedtime small{color:var(--rmt-theme-muted)}
${root} .rmt-bedtime-note{color:var(--rmt-theme-muted);font-size:14px}
${root} .rmt-bedtime-composer{margin:18px 0;padding:16px;border:1px solid var(--rmt-theme-border);border-radius:16px;background:var(--rmt-theme-surface)}
${root} .rmt-bedtime-composer summary{cursor:pointer;font-weight:700}${root} .rmt-bedtime-composer label{display:grid;gap:8px;margin-top:14px}
${root} .rmt-bedtime-composer textarea{width:100%;min-height:94px;resize:vertical;padding:12px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-bg);color:var(--rmt-theme-text)}
${root} .rmt-bedtime-composer .rmt-btn{margin-top:12px;min-height:44px}
${root} .rmt-bedtime-library{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin-top:20px}
${root} .rmt-bedtime-cover{display:grid;grid-template-columns:34px minmax(0,1fr) 12px;align-items:center;gap:14px;min-height:132px;padding:20px;text-align:left;border:1px solid var(--rmt-theme-border);border-radius:20px;background:var(--rmt-theme-surface);color:var(--rmt-theme-text);cursor:pointer}
${root} .rmt-bedtime-cover>span:nth-child(1){font-size:27px;color:var(--rmt-theme-accent-ink)}${root} .rmt-bedtime-cover>span:nth-child(2){display:grid;gap:4px}${root} .rmt-bedtime-cover b{font-size:19px}
${root} .rmt-bedtime-empty{text-align:center;padding:48px 18px;border:1px dashed var(--rmt-theme-border);border-radius:20px}${root} .rmt-bedtime-empty>span{font-size:40px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-bedtime-reader>header{display:grid;gap:5px;margin:20px 0}${root} .rmt-bedtime-reader>header>.rmt-btn{justify-self:start;min-height:44px}
${root} .rmt-bedtime-chapter{padding:clamp(20px,4vw,42px);border:1px solid var(--rmt-theme-border);border-radius:20px;background:var(--rmt-theme-surface);box-shadow:0 18px 46px color-mix(in srgb,var(--rmt-theme-text) 7%,transparent)}
${root} .rmt-bedtime-chapter>p{font-family:Georgia,'Noto Serif SC',serif;font-size:17px;line-height:2;text-wrap:pretty}
${root} .rmt-bedtime-page-controls,${root} .rmt-bedtime-reader>footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px}
${root} .rmt-bedtime-page-controls .rmt-btn,${root} .rmt-bedtime-reader>footer .rmt-btn{min-height:44px}
${root} .rmt-bedtime button:focus-visible,${root} .rmt-bedtime textarea:focus-visible{outline:3px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
@media(max-width:620px){${root} .rmt-bedtime-library{grid-template-columns:1fr}${root} .rmt-bedtime-chapter{padding:20px 16px}${root} .rmt-bedtime-head{align-items:flex-start}}
`;
}
