import * as inbox from '../modes/inbox.js';
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

let view = { scope: '', selected: '', filter: 'all' };
const readonly = () => !!runtimeState.activeArchiveSnapshot && (runtimeState.activeArchiveReadOnly || runtimeState.activeArchiveSnapshot.backupOnly);
const letterTypeLabel = type => type === 'stage' ? '阶段来信' : type === 'daily' ? '日常来信' : type === 'travel' ? '旅行明信片' : '来信';
function sessionScope(session) { return JSON.stringify([session?.chatId, session?.archiveRevision, session?.ownerKey, session?.sender, session?.recipient]); }
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
    const stamp = time => new Date(time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const tab = (id, label) => `<button type="button" class="rmt-btn" data-rmt-inbox="filter" data-rmt-inbox-id="${id}" aria-pressed="${view.filter === id}">${label}</button>`;
    const detail = selected ? `<article class="rmt-mail-open">
        <div class="rmt-mail-actions"><button type="button" class="rmt-btn" data-rmt-inbox="back">← 收件箱</button><button type="button" class="rmt-btn" data-rmt-inbox="favorite" data-rmt-inbox-id="${text.esc(selected.id)}" aria-pressed="${selected.favorite}" ${readonly() ? 'disabled' : ''}>${selected.favorite ? '已收藏' : '收藏这封信'}</button></div>
        ${selected.travelSnapshot ? travelView.travelPostcardHtml(selected.travelSnapshot.location, selected.travelSnapshot, { recipient: session.recipient, closeAction: 'inbox-back' })
            : `<div class="rmt-mail-paper"><header><small>${letterTypeLabel(selected.type)} · TO ${text.esc(session.recipient || '你')} · ${text.esc(stamp(selected.createdAt))}</small><h2>${text.esc(selected.title)}</h2></header><b>${text.esc(selected.greeting)}</b><p>${text.esc(selected.body)}</p><footer>${text.esc(selected.closing || session.sender)}</footer></div>`}
        <details class="rmt-mail-about"><summary>关于这封信</summary><p>${selected.type === 'travel' ? '收藏自本档案的出行路线，风景和文字保留收藏时的版本。' : '依据当前角色与关系生成的来信，不写入主聊天，也不作为共同往事的证据。'}${selected.sourceMemoryAnchor ? ' 关联记忆：' + text.esc(selected.sourceMemoryAnchor) : ''}</p></details>
    </article>` : `<nav class="rmt-mail-filters" aria-label="筛选信件">${tab('all','全部')}${tab('unread','未读')}${tab('favorite','收藏')}</nav><div class="rmt-mail-list">${letters.map(letter =>
        `<button type="button" class="rmt-mail-row ${letter.readAt ? '' : 'is-unread'}" data-rmt-inbox="read" data-rmt-inbox-id="${text.esc(letter.id)}"><span class="rmt-mail-seal" aria-hidden="true">${letter.type === 'travel' ? '▧' : '✉'}</span><span><small>${letterTypeLabel(letter.type)} · ${text.esc(session.sender || '来信')} · ${text.esc(stamp(letter.createdAt))}${letter.favorite ? ' · 收藏' : ''}${!letter.readAt ? ' · 未读' : ''}</small><b>${text.esc(letter.title)}</b><span>${text.esc(letter.body.slice(0, 90))}</span></span><i aria-hidden="true">›</i></button>`).join('') || '<div class="rmt-mail-empty"><span aria-hidden="true">✉</span><h3>信箱里留着位置</h3><p>可以收一封今天的来信，也可以把路线中的明信片收进来。</p></div>'}</div>`;
    overlay.bodyEl().innerHTML = `<section class="rmt-inbox"><header class="rmt-mail-header"><div><small>LETTERS TO YOU</small><h2>${text.esc(session.recipient || '你')}的邮箱</h2><p>${session.letters.length} 封来信 · ${session.letters.filter(item => !item.readAt).length} 封未读</p></div><div class="rmt-mail-actions"><button type="button" class="rmt-btn" data-rmt-inbox="receive" ${readonly() ? 'disabled' : ''}>收取新信</button><button type="button" class="rmt-btn" data-rmt-inbox="postcards" ${readonly() ? 'disabled' : ''}>收进路线明信片</button></div></header>${detail}</section>`;
}
// State changes use the same durable CAS as model output. Navigation never calls saveSession.
export function assertShownInboxTarget() {
    const shown = runtimeState.activeSession;
    if (shown?.kind !== 'inbox' || runtimeState.activeMode !== 'inbox') throw new Error('邮箱已关闭。');
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot) {
        if (shown.chatId !== snapshot.chatId || shown.archiveRevision !== snapshot.memory?.archiveRevision || shown.sender !== snapshot.memory?.characterName || shown.recipient !== snapshot.memory?.userName) throw new Error('显示的邮箱与目标档案不一致。');
        return;
    }
    const context = contextApi.currentCharacterGuard(), memory = repository.requireArchive(context);
    if (shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision || shown.sender !== memory.characterName || shown.recipient !== memory.userName
        || (shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context))) throw new Error('聊天或角色已切换，请重新打开对应邮箱。');
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
        if (shown.chatId !== target.chatId || shown.archiveRevision !== target.memory.archiveRevision || shown.sender !== target.memory.characterName || shown.recipient !== target.memory.userName) throw new Error('显示的邮箱与目标档案不一致。');
        // Capture the canonical cache fence, including an in-flight generation's fence.
        options.context.chatMetadata[constants.MEMORY_KEY] = target.memory;
        options.context.chatMetadata[constants.CACHE_KEY] = target.cache;
        const origin = contextApi.captureTaskOrigin(options.context, target.memory.archiveRevision);
        const result = await options.commitArchiveTargetMutation(target, 'inbox', origin,
            latest => mutator(latest?.kind === 'inbox' ? latest : inbox.emptyInbox(target.memory, options.context), target.memory, target.cache),
            inbox.emptyInbox(target.memory, options.context), () => contextApi.runtimeLifecycleStillCurrent(lifecycle));
        updated = result.session;
    } else {
        const context = contextApi.currentCharacterGuard(), memory = repository.requireArchive(context);
        if (shown.chatId !== memory.chatId || shown.archiveRevision !== memory.archiveRevision
            || shown.sender !== memory.characterName || shown.recipient !== memory.userName
            || (shown.ownerKey && shown.ownerKey !== contextApi.currentCharacterRuntimeKey(context)))
            throw new Error('聊天或角色已切换，请重新打开对应邮箱。');
        const origin = contextApi.captureTaskOrigin(context, memory.archiveRevision);
        writeOrigin = origin;
        updated = await cache.commitSessionMutation('inbox', memory.chatId, origin,
            (latest, bank) => mutator(latest?.kind === 'inbox' ? latest : inbox.emptyInbox(bank, context), bank, cache.getCache(context)), inbox.emptyInbox(memory, context));
        if (!updated) throw new Error('聊天或档案已经切换，本次操作没有写入。');
    }
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
        if (action === 'filter') { view.filter = ['all','unread','favorite'].includes(id) ? id : 'all'; view.selected = ''; return renderInbox(); }
        if (action === 'read') {
            if (!runtimeState.activeSession.letters.some(letter => letter.id === id)) return;
            view.selected = id;
            if (readonly()) return renderInbox();
            return await mutateInbox(session => { const letter = session.letters.find(item => item.id === id); if (letter && !letter.readAt) letter.readAt = Date.now(); return session; });
        }
        if (action === 'favorite') return await mutateInbox(session => { const letter = session.letters.find(item => item.id === id); if (letter) letter.favorite = !letter.favorite; return session; });
        if (action === 'postcards') {
            const result = await mutateInbox((session, memory, sourceCache) => {
                const travel = cache.loadSession('travel', { cache: sourceCache, memoryBank: memory, chatId: memory.chatId });
                for (const location of travel?.locations || []) {
                    if (location.postcard?.body || (location.keepsake?.kind === 'postcard' && location.keepsake.body))
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
