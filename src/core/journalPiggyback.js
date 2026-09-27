// r84.175 · 自动留忆最后一步顺便给「等批注」的手帐页写一句。读写都只碰本机手帐；任何失败都不影响自动留忆本身。
import * as journal from './handJournal.js';
import * as core_context from './context.js';

function liveScope() {
    try { return core_context.chatScopeKey(core_context.currentCharacterGuard()); } catch { return ''; }
}

export async function wantedJournalPages() {
    const scope = liveScope();
    if (!scope) return { scope: '', pages: [] };
    try {
        const pages = await journal.createJournalStore({ currentScope: liveScope }).read(scope);
        return { scope, pages: pages.filter(page => page.annotationWanted === true && !page.annotation).map(page => ({ pageId: page.id, text: journal.journalPageDigest(page) })) };
    } catch { return { scope: '', pages: [] }; }
}

export async function saveJournalNotes(scope, notes, by = '') {
    const ids = Object.keys(notes || {});
    if (!scope || !ids.length || liveScope() !== scope) return 0;
    try {
        const at = Date.now();
        await journal.createJournalStore({ currentScope: liveScope }).annotate(scope, Object.fromEntries(ids.map(id => [id, { text: notes[id], at, by }])));
        return ids.length;
    } catch { return 0; }
}
