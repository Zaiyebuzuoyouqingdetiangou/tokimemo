// r84.175 · 「夹进手帐」：把一张图或一封回忆信直接收成手帐里的一页。不发请求，只写本机手帐。
import * as journal from '../core/handJournal.js';
import * as context from '../core/context.js';
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';

const KIND_MODE = [['heart', 'heart'], ['ending', 'ending'], ['past-life', 'pastLives'], ['bedtime', 'bedtime'], ['butterfly', 'butterfly']];
export function clipModeForKind(kind) { return KIND_MODE.find(([prefix]) => String(kind || '').startsWith(prefix))?.[1] || ''; }

export function clipPayload({ mode = '', id = '', title = '', url = '', body = '' } = {}) {
    return text.esc(JSON.stringify({ mode, id: String(id || ''), title: String(title || ''), url: String(url || ''), text: String(body || '') }));
}

export async function clipToJournal(raw) {
    let payload = null;
    try { payload = JSON.parse(raw || ''); } catch { payload = null; }
    if (!payload || typeof payload !== 'object') return false;
    if (runtimeState.activeArchiveSnapshot) { globalThis.toastr?.info?.('正在翻看只读档案，回到当前聊天后再夹进手帐。', '心迹回廊'); return false; }
    try {
        const scope = context.chatScopeKey(context.currentCharacterGuard());
        const live = () => { try { return context.chatScopeKey(context.currentCharacterGuard()); } catch { return ''; } };
        const store = journal.createJournalStore({ currentScope: live });
        const mode = Object.values(constants.MODE).includes(payload.mode) ? payload.mode : 'chat';
        const title = text.normalizeText(payload.title, 120) || constants.MODE_LABEL?.[mode] || '回忆';
        const blocks = [];
        const url = journal.safeJournalImageUrl(payload.url);
        if (url) blocks.push({ type: 'image', url, caption: title });
        if (typeof payload.text === 'string' && payload.text.trim()) blocks.push({ type: 'text', text: payload.text });
        if (!blocks.length) return false;
        // 夹进来的页标记「等批注」：下一轮自动留忆写回忆时顺便给它写一句，不另发请求。
        const page = journal.createJournalPage({ title, annotationWanted: true, entries: [{ id: `clip-${Date.now()}`, title, source: { mode, id: payload.id || title, title }, blocks }] });
        await store.append(scope, [page]);
        globalThis.toastr?.success?.('已夹进手帐。下一轮自动留忆会顺便让他写一句批注。', '心迹回廊');
        return true;
    } catch (error) {
        globalThis.toastr?.error?.(`没能夹进手帐：${text.safeErrorSummary?.(error) || error?.message || ''}`, '心迹回廊');
        return false;
    }
}
