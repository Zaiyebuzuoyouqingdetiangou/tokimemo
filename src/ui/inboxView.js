import * as letterArt from '../core/letterIllustration.js';
import * as inbox from '../modes/inbox.js';
import * as travel_mode from '../modes/travel.js';
import * as constants from '../core/constants.js';
import * as cache from '../core/cache.js';
import * as contextApi from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';
import { state as runtimeState } from '../core/state.js';
import * as text from '../core/text.js';
import * as generation from '../generation/client.js';
import * as overlay from './overlay.js';
import * as travelView from './travelView.js';
import * as mailGallery from '../core/mailGallery.js';

let view = { scope: '', selected: '', filter: 'all' };
const readonly = () => !!runtimeState.activeArchiveSnapshot && (runtimeState.activeArchiveReadOnly || runtimeState.activeArchiveSnapshot.backupOnly);
const letterTypeLabel = type => type === 'stage' ? '阶段来信' : type === 'daily' ? '日常来信' : type === 'travel' ? '旅行明信片' : '来信';
const PAPER_TONES = Object.freeze(['cream', 'rose', 'sky', 'sage', 'lilac', 'peach']);
export function inboxPaperTone(letter) {
    if (PAPER_TONES.includes(letter?.paperTone)) return letter.paperTone;
    return PAPER_TONES[(text.hashString(String(letter?.id || letter?.title || 'letter')) >>> 0) % PAPER_TONES.length];
}
const mailStamp = time => new Date(time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export function inboxGalleryHtml(session) {
    const drawings = mailGallery.savedMailDrawings(session);
    return `<section class="rmt-mail-gallery" aria-label="随信画册"><header><small>OUR LITTLE SKETCHBOOK</small><h3>信里的小小世界</h3><p>${drawings.length} 幅随信小画 · 每封有画的信都会留在这里</p></header><div class="rmt-mail-gallery-grid">${drawings.map(letter => `<button type="button" class="rmt-mail-drawing" data-rmt-paper="${inboxPaperTone(letter)}" data-rmt-inbox="read" data-rmt-inbox-id="${text.esc(letter.id)}" aria-label="查看来信：${text.esc(letter.title)}"><span class="rmt-mail-drawing-art">${letterArt.renderLetterIllustration(letter.illustration, { idPrefix: 'gallery-' + letter.id, label: letter.title || '随信小画' })}</span><strong>${text.esc(letter.title)}</strong><small>${text.esc(mailStamp(letter.createdAt))}</small></button>`).join('') || '<p class="rmt-mail-empty">画册还留着空白页。带画的新信收到后，会自动收藏到这里。</p>'}</div></section>`;
}
function sessionScope(session) { return JSON.stringify([session?.chatId, session?.archiveRevision, session?.ownerKey, session?.sender, session?.recipient]); }
export function inboxSenderLabel(letter, session) {
    const names = Array.isArray(letter?.participantNames) ? letter.participantNames.filter(Boolean)
        : Array.isArray(session?.participantNames) ? session.participantNames.filter(Boolean) : [];
    return names.join('、') || session?.sender || '来信';
}
function resetView(session) {
    const scope = sessionScope(session);
    if (view.scope !== scope) view = { scope, selected: '', filter: 'all' };
}
export function closeInboxLetter() {
    if (!view.selected) return false;
    view.selected = ''; renderInbox(); return true;
}
export function renderInbox() {
    const session = runtimeState.activeSession;
    if (session?.kind !== 'inbox') return;
    resetView(session);
    overlay.topTitle('你的邮箱');
    const selected = session.letters.find(letter => letter.id === view.selected);
    const letters = [...session.letters].reverse().filter(letter =>
        view.filter === 'unread' ? !letter.readAt : view.filter === 'favorite' ? letter.favorite : true);
    const stamp = mailStamp;
    const tab = (id, label) => `<button type="button" class="rmt-btn" data-rmt-inbox="filter" data-rmt-inbox-id="${id}" aria-pressed="${view.filter === id}">${label}</button>`;
    const detail = selected ? `<article class="rmt-mail-open">
        <div class="rmt-mail-actions"><button type="button" class="rmt-btn" data-rmt-inbox="back">← 收件箱</button><button type="button" class="rmt-btn" data-rmt-inbox="favorite" data-rmt-inbox-id="${text.esc(selected.id)}" aria-pressed="${selected.favorite}" ${readonly() ? 'disabled' : ''}>${selected.favorite ? '已收藏' : '收藏这封信'}</button></div>
        ${selected.travelSnapshot ? travelView.travelPostcardHtml(selected.travelSnapshot.location, selected.travelSnapshot, { recipient: session.recipient, closeAction: 'inbox-back' })
            : `<div class="rmt-mail-paper" data-rmt-paper="${inboxPaperTone(selected)}"><header><small>${letterTypeLabel(selected.type)} · TO ${text.esc(session.recipient || '你')} · ${text.esc(stamp(selected.createdAt))}</small><h2>${text.esc(selected.title)}</h2></header><b>${text.esc(selected.greeting)}</b><p>${text.esc(selected.body)}</p><figure class="rmt-letter-illustration" style="margin:24px auto;text-align:center">${letterArt.renderLetterIllustration(selected.illustration, { idPrefix: selected.id, label: '随信小画' })}</figure><footer>${text.esc(selected.closing || inboxSenderLabel(selected, session))}</footer></div>`}
    </article>` : `<nav class="rmt-mail-filters" aria-label="筛选信件">${tab('all','全部')}${tab('unread','未读')}${tab('favorite','收藏')}${tab('gallery','随信画册 · ' + mailGallery.savedMailDrawings(session).length)}</nav>${view.filter === 'gallery' ? inboxGalleryHtml(session) : `<div class="rmt-mail-list">${letters.map(letter =>
        `<button type="button" class="rmt-mail-row ${letter.readAt ? '' : 'is-unread'}" data-rmt-inbox="read" data-rmt-inbox-id="${text.esc(letter.id)}"><span class="rmt-mail-seal" aria-hidden="true">${letter.type === 'travel' ? '▧' : '✉'}</span><span><small>${letterTypeLabel(letter.type)} · ${text.esc(inboxSenderLabel(letter, session))} · ${text.esc(stamp(letter.createdAt))}${letter.favorite ? ' · 收藏' : ''}${!letter.readAt ? ' · 未读' : ''}</small><b>${text.esc(letter.title)}</b><span>${text.esc(letter.body.slice(0, 90))}</span></span><i aria-hidden="true">›</i></button>`).join('') || '<div class="rmt-mail-empty"><span aria-hidden="true">✉</span><h3>信箱里留着位置</h3><p>可以收一封今天的来信，也可以把路线中的明信片收进来。</p></div>'}</div>`}`;
    overlay.bodyEl().innerHTML = `<section class="rmt-inbox"><header class="rmt-mail-header"><div><small>LETTERS TO YOU</small><h2>${text.esc(session.recipient || '你')}的邮箱</h2><p>${session.letters.length} 封来信 · ${session.letters.filter(item => !item.readAt).length} 封未读</p></div><div class="rmt-mail-actions"><button type="button" class="rmt-btn" data-rmt-inbox="receive" ${readonly() ? 'disabled' : ''}>收取新信</button><button type="button" class="rmt-btn" data-rmt-inbox="postcards" ${readonly() ? 'disabled' : ''}>收进路线明信片</button></div></header>${detail}</section>`;
}
// State changes use the same durable CAS as model output. Navigation never calls saveSession.
export function assertShownInboxTarget() {
    const shown = runtimeState.activeSession;
    if (shown?.kind !== 'inbox' || runtimeState.activeMode !== 'inbox') throw new Error('邮箱已关闭。');
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot) {
        const source = cache.generationPageReadingSource(shown, 'inbox', snapshot.memory);
        if (shown.chatId !== snapshot.chatId || shown.archiveRevision !== snapshot.memory?.archiveRevision
            || source.session.sender !== source.memoryBank?.characterName || source.session.recipient !== source.memoryBank?.userName) throw new Error('显示的邮箱与目标档案不一致。');
        return;
    }
    const context = contextApi.currentCharacterGuard(), memory = repository.requireArchive(context);
    const source = cache.generationPageReadingSource(shown, 'inbox', memory);
    if (shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision
        || source.session.sender !== source.memoryBank.characterName || source.session.recipient !== source.memoryBank.userName
        || (!source.source && shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context))) throw new Error('聊天或角色已切换，请重新打开对应邮箱。');
}
export async function mutateInbox(mutator) {
    assertShownInboxTarget();
    if (readonly()) throw new Error('这份邮箱正在只读查看。');
    const lifecycle = runtimeState.runtimeLifecycleEpoch;
    const shown = runtimeState.activeSession;
    const shownScope = sessionScope(shown);
    const snapshot = runtimeState.activeArchiveSnapshot;
    let updated, writeOrigin = null;
    if (shown?.kind !== 'inbox') throw new Error('邮箱已关闭。');
    if (snapshot) {
        const options = library.archiveTargetGenerationOptions(snapshot);
        const target = await options.revalidateArchiveTarget(options.archiveTarget);
        const reading = cache.generationPageReadingSource(shown, 'inbox', target.memory);
        if (shown.chatId !== target.chatId || shown.archiveRevision !== target.memory.archiveRevision
            || reading.session.sender !== reading.memoryBank.characterName || reading.session.recipient !== reading.memoryBank.userName) throw new Error('显示的邮箱与目标档案不一致。');
        // Capture the canonical cache fence, including an in-flight generation's fence.
        options.context.chatMetadata[constants.MEMORY_KEY] = target.memory;
        options.context.chatMetadata[constants.CACHE_KEY] = target.cache;
        const origin = contextApi.captureTaskOrigin(options.context, target.memory.archiveRevision);
        if (shown.readableProgress?.complete === false && shown.readableProgress.draftId) {
            updated = await cache.commitGenerationTaskResultMutation(options.context, shown.readableProgress.draftId,
                (latest, sourceMemory) => mutator(latest, sourceMemory, target.cache),
                { expectedTaskOrigin: origin, archiveTarget: target, stillCurrent: () => contextApi.runtimeLifecycleStillCurrent(lifecycle) });
            if (runtimeState.activeArchiveSnapshot?.entryId === snapshot.entryId) runtimeState.activeArchiveSnapshot.cache = target.cache;
        } else {
            const result = await options.commitArchiveTargetMutation(target, 'inbox', origin,
                latest => mutator(latest?.kind === 'inbox' ? latest : inbox.emptyInbox(target.memory, options.context), reading.memoryBank, target.cache),
                inbox.emptyInbox(target.memory, options.context), () => contextApi.runtimeLifecycleStillCurrent(lifecycle));
            updated = result.session;
        }
    } else {
        const context = contextApi.currentCharacterGuard(), memory = repository.requireArchive(context);
        const reading = cache.generationPageReadingSource(shown, 'inbox', memory);
        if (shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision
            || reading.session.sender !== reading.memoryBank.characterName || reading.session.recipient !== reading.memoryBank.userName
            || (!reading.source && shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context)))
            throw new Error('聊天或角色已切换，请重新打开对应邮箱。');
        const origin = contextApi.captureTaskOrigin(context, memory.archiveRevision);
        writeOrigin = origin;
        updated = shown.readableProgress?.complete === false && shown.readableProgress.draftId
            ? await cache.commitGenerationTaskResultMutation(context, shown.readableProgress.draftId,
                (latest, sourceMemory) => mutator(latest, sourceMemory, cache.getCache(context)), { expectedTaskOrigin: origin })
            : await cache.commitSessionMutation('inbox', memory.chatId, origin,
                (latest, bank) => mutator(latest?.kind === 'inbox' ? latest : inbox.emptyInbox(bank, context),
                    cache.generationPageSourceMemory(latest, 'inbox', bank), cache.getCache(context)), inbox.emptyInbox(memory, context));
        if (!updated) throw new Error('聊天或档案已经切换，本次操作没有写入。');
    }
    if (!updated) throw new Error('未能确认这次邮箱操作已保存，原信件仍保留。');
    if (runtimeState.activeMode === 'inbox' && shownScope === sessionScope(runtimeState.activeSession)
        && (snapshot ? runtimeState.activeArchiveSnapshot?.entryId === snapshot.entryId : !runtimeState.activeArchiveSnapshot && contextApi.isCurrentTaskOrigin(writeOrigin))) {
        runtimeState.activeSession = updated;
        renderInbox();
    }
    return updated;
}
export async function handleInboxAction(action, id = '') {
    try {
        if (runtimeState.activeMode !== 'inbox' || runtimeState.activeSession?.kind !== 'inbox') return;
        if (['read', 'favorite', 'postcards', 'receive'].includes(action)) assertShownInboxTarget();
        resetView(runtimeState.activeSession);
        if (action === 'back') { view.selected = ''; return renderInbox(); }
        if (action === 'filter') { view.filter = ['all','unread','favorite','gallery'].includes(id) ? id : 'all'; view.selected = ''; return renderInbox(); }
        if (action === 'read') {
            if (!runtimeState.activeSession.letters.some(letter => letter.id === id)) return;
            view.selected = id;
            if (readonly() || runtimeState.activeSession.letters.find(letter => letter.id === id)?.readAt) return renderInbox();
            return await mutateInbox(session => { const letter = session.letters.find(item => item.id === id); if (letter && !letter.readAt) letter.readAt = Date.now(); return session; });
        }
        if (action === 'favorite') return await mutateInbox(session => { const letter = session.letters.find(item => item.id === id); if (letter) letter.favorite = !letter.favorite; return session; });
        if (action === 'postcards') {
            const result = await mutateInbox((session, memory, sourceCache) => {
                const travel = cache.loadSession('travel', { cache: sourceCache, memoryBank: memory, chatId: memory.chatId });
                for (const location of travel?.locations || []) {
                    const card = travel_mode.travelKeepsakeForItem(location);
                    if (card?.kind === 'postcard' && card.body)
                        session = inbox.mergeInboxLatest(session, inbox.postcardInboxItem(location, travel, memory));
                }
                return session;
            });
            globalThis.toastr?.info?.(`邮箱现有 ${result.letters.length} 封；已有明信片不会重复收录。`, '心迹回廊');
            return;
        }
        if (action === 'receive') {
            if (readonly()) return;
            const extra = runtimeState.activeArchiveSnapshot ? library.archiveTargetGenerationOptions(runtimeState.activeArchiveSnapshot) : {};
            return await generation.generateMode('inbox', { ...extra, background: false });
        }
    } catch (error) { globalThis.toastr?.error?.(text.safeErrorSummary(error), '心迹回廊 · 邮箱'); }
}
