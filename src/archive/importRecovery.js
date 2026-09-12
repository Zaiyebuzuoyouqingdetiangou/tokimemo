// Page-only checkpoints for archive extraction / cover editing. These are not
// archives, MODE sessions, pending commits, or evidence. No host storage is used.
import * as recovery from '../generation/recovery.js';
import * as client from '../generation/client.js';
import * as text from '../core/text.js';

export const ARCHIVE_RECOVERY_PAGE_NOTICE = '档案整理草稿仅本页保留，请勿刷新；关闭缘侧可保留。';
export const ARCHIVE_RECOVERY_MAX_DRAFTS = 4;
const drafts = new Map();
const tickets = new WeakSet();

function draftKey(origin, operation) {
    if (!['import', 'profile'].includes(operation) || !origin?.characterKey || !origin?.chatId) return '';
    return JSON.stringify([origin.characterKey, String(origin.characterId ?? ''), origin.characterAvatar || '', origin.chatId, operation]);
}

function incompatible() {
    return text.safeUserError('这份档案整理草稿与当前来源、档案或生成设置不一致。原草稿仍保留，本次没有重新生成成功分块。', 'RMT_RECOVERY_INPUT_CHANGED');
}

export function archiveRecoverySummary(origin, operation = 'import') {
    const entry = drafts.get(draftKey(origin, operation));
    if (!entry) return null;
    const summary = recovery.generationRecoverySummary(entry.journal);
    return { operation, fullRebuild: entry.fullRebuild, profileOnly: entry.stage === 'profile-only',
        awaitingCommit: entry.stage === 'awaiting-commit', committedRevision: entry.committedRevision || '',
        completed: summary?.completed || 0, truncated: summary?.truncated || 0,
        canContinue: entry.stage === 'segments' && !!summary?.canContinue,
        canRetry: entry.stage === 'profile-only' || !!summary?.canRetry,
        failureCode: summary?.failureCode || '', pageOnly: true, notice: ARCHIVE_RECOVERY_PAGE_NOTICE };
}

// Called only after a real saved bank of exactly this revision is observed.
// Deferred archive writes must not discard checkpoints before their origin commits.
export function acknowledgeArchiveRecoveryCommit(origin) {
    const key = draftKey(origin, 'import'), entry = drafts.get(key);
    if (!entry || entry.stage !== 'awaiting-commit' || entry.committedRevision !== origin?.archiveRevision) return false;
    if (entry.profilePending) entry.stage = 'profile-only';
    else drafts.delete(key);
    return true;
}

export async function beginArchiveRecovery({ origin, operation = 'import', sourceIdentity, sourceFragments = [], settingsIdentity,
    fullRebuild = false, continueApproved = false, assertCurrent = () => true } = {}) {
    const key = draftKey(origin, operation);
    if (!key) throw text.safeUserError('无法确定档案整理草稿属于哪个聊天，本次没有发送请求。', 'RMT_RECOVERY_IDENTITY');
    const existing = drafts.get(key);
    if (existing?.active) throw text.safeUserError('这份档案草稿正在处理，请等当前请求结束。', 'RMT_RECOVERY_BUSY');
    if (existing && (!continueApproved || existing.stage !== 'segments')) throw incompatible();
    if (!existing && drafts.size >= ARCHIVE_RECOVERY_MAX_DRAFTS) {
        throw text.safeUserError('本页已保留 4 份未完成的档案整理草稿。请先完成或明确放弃其中一份；旧草稿没有被挤掉。', 'RMT_RECOVERY_LIMIT');
    }
    if (!Array.isArray(sourceFragments) || sourceFragments.length > recovery.GENERATION_RECOVERY_LIMITS.segments) {
        throw text.safeUserError('档案整理来源超过本页可保留的分段范围，旧草稿仍保留。', 'RMT_RECOVERY_LIMIT');
    }
    const sourceHash = await recovery.generationRecoveryDigest({
        identity: await recovery.generationRecoveryDigest(sourceIdentity),
        fragments: await Promise.all(sourceFragments.map(fragment => recovery.generationRecoveryDigest(fragment))),
    });
    if (assertCurrent() === false) throw new DOMException('Archive recovery origin changed', 'AbortError');
    if (existing && (existing.sourceHash !== sourceHash || existing.fullRebuild !== !!fullRebuild)) throw incompatible();
    // The shared engine requires a nonempty identity field called archiveRevision.
    // Here it is ONLY a draft fingerprint, never an origin for archive/cache writes.
    // An initial import has no bank and must remain that way until normal commit.
    const recoveryOrigin = { ...origin, archiveRevision: `archive-draft:${sourceHash}` };
    const entry = existing || { key, operation, sourceHash, fullRebuild: !!fullRebuild, stage: 'segments', journal: null, active: false };
    let attached = false;
    const stillCurrent = () => (!attached || drafts.get(key) === entry) && assertCurrent() !== false;
    const handle = await recovery.createGenerationRecovery({ origin: recoveryOrigin,
        mode: operation === 'import' ? 'archive-import' : 'archive-profile', settingsIdentity, pageOnly: true,
        existing: entry.journal, continueRequested: !!existing, assertCurrent: stillCurrent,
        save: async journal => {
            // Returning false is intentional: memory survives closing the overlay,
            // not page refresh. The engine must never describe this as durable.
            if (drafts.get(key) !== entry) throw new DOMException('Archive draft cleared', 'AbortError');
            entry.journal = journal;
            return false;
        } });
    if (drafts.get(key) && drafts.get(key) !== existing) throw incompatible();
    if (existing?.active) throw text.safeUserError('这份档案草稿正在处理，请等当前请求结束。', 'RMT_RECOVERY_BUSY');
    if (!existing && drafts.size >= ARCHIVE_RECOVERY_MAX_DRAFTS) throw text.safeUserError('本页档案整理草稿已满，旧草稿仍保留。', 'RMT_RECOVERY_LIMIT');
    entry.active = true;
    entry.journal = recovery.generationRecoverySnapshot(handle);
    drafts.set(key, entry);
    attached = true;
    recovery.attachGenerationRecovery(recoveryOrigin, handle);
    const ticket = { key, entry, origin: recoveryOrigin, handle, assertCurrent: stillCurrent, released: false };
    tickets.add(ticket);
    return ticket;
}

export async function requestArchiveRecoverySegment(ticket, slot, prompt, options, validator) {
    if (!tickets.has(ticket) || ticket.released || drafts.get(ticket.key) !== ticket.entry || !ticket.entry.active) throw incompatible();
    return recovery.withRecoverySegment(prompt, { ...options, origin: ticket.origin, taskKey: slot }, validator,
        async (effectivePrompt, requestOptions, accepted) => {
            // Archive extraction owns runtimeState.busy, so requestJson's module
            // task gate is deliberately not used. Same provider/parser, no retries.
            const raw = await client.generateConfiguredJson(effectivePrompt, requestOptions);
            if (ticket.assertCurrent() === false) throw new DOMException('Archive recovery origin changed', 'AbortError');
            const result = await validator(raw);
            await accepted(raw);
            return result;
        });
}

export function stageArchiveRecoveryCommit(ticket, revision, { profilePending = false } = {}) {
    if (!tickets.has(ticket) || ticket.released || drafts.get(ticket.key) !== ticket.entry || !revision) return false;
    ticket.entry.stage = 'awaiting-commit';
    ticket.entry.committedRevision = String(revision);
    ticket.entry.profilePending = !!profilePending;
    return true;
}

export function finishArchiveProfileRecovery(ticket, committedOrigin) {
    if (!tickets.has(ticket) || ticket.released || drafts.get(ticket.key) !== ticket.entry) return false;
    drafts.delete(ticket.key);
    const importKey = draftKey(committedOrigin, 'import'), pending = drafts.get(importKey);
    if (pending?.stage === 'profile-only' && pending.committedRevision === committedOrigin.archiveRevision) drafts.delete(importKey);
    return true;
}

export function releaseArchiveRecovery(ticket) {
    if (!tickets.has(ticket) || ticket.released) return;
    ticket.released = true;
    ticket.entry.active = false;
    recovery.detachGenerationRecovery(ticket.origin);
}

// An explicit user discard / destructive archive action may invoke this. Merely
// closing the overlay must not. Also provides deterministic test cleanup.
export function clearArchiveRecovery(origin, operation = null) {
    for (const kind of operation ? [operation] : ['import', 'profile']) {
        const key = draftKey(origin, kind);
        drafts.delete(key);
    }
}
