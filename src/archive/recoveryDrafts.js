import * as archive_batches from './importBatches.js';
import * as archive_coverage from './coverageRanges.js';
import * as core_cache from '../core/cache.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_text from '../core/text.js';
import * as archive_importRecovery from './importRecovery.js';
import * as generation_jsonParser from '../generation/jsonParser.js';
import * as modes_heart from '../modes/heart.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';
import { clearMemoryPreflight, getImportedMemory, isArchiveCancellation, isCompatibleArchive } from './archiveCore.js';
import { archivedChatFingerprint, normalizeExternalImportedMemories } from './externalMemory.js';
import { getCurrentUsableMessageCount, normalizeImportedChunk, requireArchive } from './importPrompts.js';
import { admitArchiveBatch, assertBatchCommitIdentity, batchIdentity, checkedArchiveTaskInput, retainedBatchExternal } from './importIdentity.js';
// 建档恢复：延迟提交、恢复草稿读写、导出、待入档保存与重试
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

export async function flushDeferredCommitsForCurrentChat() {
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return; }
    const list = [];
    for (const [storageKey, bucket] of runtimeState.deferredChatCommits.entries()) {
        for (const item of Array.isArray(bucket) ? bucket : []) {
            if (core_context.deferredCommitOriginMatchesContext(item?.origin, context)) list.push({ storageKey, item });
        }
    }
    if (!list?.length) return;
    const currentOriginContext = origin => {
        const live = core_context.currentCharacterGuard();
        if (!core_context.deferredCommitOriginMatchesContext(origin, live)) {
            throw new Error('后台结果对应的角色已经切换，已保留结果等待回到原角色。');
        }
        return live;
    };
    for (const queued of list) {
        const { storageKey, item } = queued;
        let acknowledge = false;
        try {
            context = currentOriginContext(item?.origin);
            if (item.kind === 'archive') {
                const bank = { ...item.memoryBank };
                // currentOriginContext has already proven same chat + card slot + avatar +
                // previous archive revision. Carry an ordinary live card rename forward so the
                // canonical memory, durable identity and library row do not retain a stale name.
                const liveCharacterName = core_text.normalizeText(context.name2, 120);
                if (liveCharacterName) bank.characterName = liveCharacterName;
                const hasBatchCheckpoint = !!bank[archive_batches.IMPORT_PROGRESS_KEY];
                if (hasBatchCheckpoint) assertBatchCommitIdentity(context, bank, { completedSaveOnly: true });
                const currentCount = getCurrentUsableMessageCount(context);
                if (Number(bank?.sourceMessageCount) !== currentCount) {
                    globalThis.toastr?.warning?.(`后台档案已完成，但原聊天在此期间发生变化，因此没有自动覆盖「${bank?.archiveName || '档案'}」。请重新更新档案。`, '心迹回廊');
                    acknowledge = !hasBatchCheckpoint;
                    continue;
                }
                const hasMemory = Object.prototype.hasOwnProperty.call(context.chatMetadata || {}, core_constants.MEMORY_KEY);
                const liveRevision = core_text.normalizeText(context.chatMetadata?.[core_constants.MEMORY_KEY]?.archiveRevision, 240);
                const expectedRevision = core_text.normalizeText(item.origin?.archiveRevision, 240);
                const completedRevision = core_text.normalizeText(bank?.archiveRevision, 240);
                if (hasMemory && completedRevision && liveRevision === completedRevision) {
                    // A prior metadata save may have reached the host even if its acknowledgement
                    // was interrupted. Treat the exact generated revision as an idempotent success;
                    // never replay it over a different revision and never report it as stale.
                    clearMemoryPreflight(context, item.origin.chatId);
                    acknowledge = true;
                    continue;
                }
                if ((item.origin?.archivePresent === true && (!hasMemory || liveRevision !== expectedRevision))
                    || (item.origin?.archivePresent === false && hasMemory)) {
                    globalThis.toastr?.warning?.('后台档案对应的是旧版本，已停止写回，较新的档案没有被覆盖。', '心迹回廊');
                    acknowledge = !hasBatchCheckpoint;
                    continue;
                }
                if (item.preserveDerivedCache && core_cache.isCompressedCacheRecord(context.chatMetadata?.[core_constants.CACHE_KEY])) {
                    try { await core_cache.ensureCacheHydrated(context); }
                    catch (error) {
                        globalThis.toastr?.warning?.('后台增量档案已完成，但旧的 ADV EVENT 缓存暂时无法读取，因此没有覆盖原档案。请刷新后重新更新。', '心迹回廊');
                        continue;
                    }
                    context = currentOriginContext(item.origin);
                }
                await core_cache.saveImportedMemory(context, bank, item.origin.chatId, {
                    preserveDerivedCache: !!item.preserveDerivedCache,
                    expectedTaskOrigin: item.origin,
                    ...(hasBatchCheckpoint ? { assertTaskCurrent: () => assertBatchCommitIdentity(currentOriginContext(item.origin), bank, { completedSaveOnly: true }) } : {}),
                    explicitCreate: item.origin.archivePresent === false,
                    expectedPreviousArchiveState: {
                        present: item.origin.archivePresent === true,
                        revision: item.origin.archiveRevision,
                    },
                });
                context = core_context.currentCharacterGuard();
                const committedMemory = getImportedMemory(context);
                const sameCommittedTarget = core_context.comparableChatId(core_context.getChatId(context)) === core_context.comparableChatId(item.origin.chatId)
                    && (!core_text.normalizeText(item.origin.characterId, 40) || String(context.characterId ?? '') === String(item.origin.characterId))
                    && (!core_text.normalizeText(item.origin.characterAvatar, 300) || core_context.currentCharacterAvatar(context) === core_text.normalizeText(item.origin.characterAvatar, 300))
                    && core_text.normalizeText(committedMemory?.archiveRevision, 240) === completedRevision;
                if (!sameCommittedTarget) throw new Error('后台档案保存后目标窗口已经变化；完成记录保留等待精确确认。');
                clearMemoryPreflight(context, item.origin.chatId);
                globalThis.toastr?.success?.(`后台档案已写回：${bank.archiveName}`, '心迹回廊');
                acknowledge = true;
            } else if (item.kind === 'heartPatches') {
                let memory;
                try { memory = requireArchive(context); }
                catch {
                    globalThis.toastr?.warning?.('原聊天已经没有可写入的档案，旧的后台角色互动结果已停止写回。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                if (memory.archiveRevision !== item.origin.archiveRevision) {
                    globalThis.toastr?.warning?.('后台角色互动结果对应的是旧档案版本，已停止写回。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                await core_cache.ensureCacheHydrated(context);
                context = currentOriginContext(item.origin);
                memory = requireArchive(context);
                if (memory.archiveRevision !== item.origin.archiveRevision) continue;
                const fallback = core_cache.loadSession(core_constants.MODE.HEART, { context, chatId: item.origin.chatId, memoryBank: memory, clone: true });
                if (!fallback) {
                    globalThis.toastr?.warning?.('原聊天没有可合并的角色互动缓存，旧的后台结果已停止写回。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                const merged = await core_cache.commitSessionMutation(
                    core_constants.MODE.HEART,
                    item.origin.chatId,
                    item.origin,
                    (latest, liveMemory) => {
                        let session = latest || fallback;
                        return modes_heart.normalizeHeartContentPatch(session, Object.values(item.patches || {}), liveMemory);
                    },
                    fallback,
                );
                if (!merged) continue;
                globalThis.toastr?.success?.('之前窗口的角色互动结果已自动写回。', '心迹回廊');
                acknowledge = true;
            } else if (item.kind === 'cgImagePatch') {
                const patch = image_patch.normalizeCgImagePatch(item.patch);
                const memory = getImportedMemory(context);
                if (!patch || !memory || memory.archiveRevision !== item.origin.archiveRevision) {
                    globalThis.toastr?.warning?.('旧图片结果已停止写回；原档案或图片目标已变化。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                let patchStatus = '';
                const mutate = (latest, liveMemory) => {
                    if (liveMemory.archiveRevision !== item.origin.archiveRevision) return null;
                    const result = image_patch.applyCgImagePatch(latest, patch);
                    patchStatus = result.status;
                    return result.session;
                };
                let saved = null;
                if (item.draftId) saved = await core_cache.commitGenerationTaskResultMutation(context, item.draftId, mutate,
                    { expectedTaskOrigin: item.origin });
                const draft = item.draftId && core_cache.getCache(context)?.[core_cache.GENERATION_DRAFTS_CACHE_KEY]?.records?.[item.draftId];
                if (!saved && (!item.draftId || draft?.status === 'complete')) {
                    saved = await core_cache.commitSessionMutation(patch.mode, item.origin.chatId, item.origin, mutate);
                }
                if (saved) {
                    globalThis.toastr?.success?.('之前窗口的图片已保存。', '心迹回廊');
                    acknowledge = true;
                } else if (patchStatus === 'conflict' || patchStatus === 'invalid') {
                    globalThis.toastr?.warning?.('这张回忆已更新，旧图片结果未替换当前图片；可以在柏宝绘图库查看。', '心迹回廊');
                    acknowledge = true;
                }
            } else if (item.kind === 'sessions') {
                let memory;
                try { memory = requireArchive(context); }
                catch {
                    globalThis.toastr?.warning?.('原聊天已经没有可写入的档案，旧的后台生成结果已停止写回。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                if (memory.archiveRevision !== item.origin.archiveRevision) {
                    globalThis.toastr?.warning?.('后台生成结果对应的是旧档案版本，已停止写回。', '心迹回廊');
                    acknowledge = true;
                    continue;
                }
                await core_cache.ensureCacheHydrated(context);
                context = currentOriginContext(item.origin);
                memory = requireArchive(context);
                if (memory.archiveRevision !== item.origin.archiveRevision) continue;
                let allSaved = true;
                for (const [mode, session] of Object.entries(item.sessions || {})) {
                    if (!await core_cache.commitSession(mode, session, item.origin.chatId, item.origin)) allSaved = false;
                }
                if (!allSaved) continue;
                globalThis.toastr?.success?.('之前窗口的后台生成结果已自动写回。', '心迹回廊');
                acknowledge = true;
            } else {
                acknowledge = true;
            }
        } catch (error) {
            if (error?.code === 'RMT_ARCHIVE_DELETED_FENCE') {
                globalThis.toastr?.warning?.('这项后台建档任务启动后，目标档案已被明确删除；旧结果已停止写回。', '心迹回廊');
                acknowledge = true;
            } else if (error?.code === 'RMT_MODE_WRITE_FENCE') {
                globalThis.toastr?.warning?.('这项后台内容已被删除或由更新的任务接管；旧结果已停止写回。', '心迹回廊');
                acknowledge = true;
            }
            console.warn('[HeartbeatMemories] deferred commit failed', core_text.safeErrorDiagnostic(error));
        } finally {
            // A save failure keeps the durable item for a later retry. Only a successful
            // write or a result that can no longer safely target this archive is removed.
            if (acknowledge) core_requestCoordinator.acknowledgeDeferredCommit(storageKey, item);
        }
    }
}

export function exportCurrentArchiveImportProgress(context = core_context.currentCharacterGuard()) {
    const bank = getImportedMemory(context);
    const origin = core_context.captureTaskOrigin(context, bank?.archiveRevision || '');
    const pending = currentPendingArchiveSave(context);
    return { format: 'hearttrace-unarchived-results-v2', exportedAt: new Date().toISOString(),
        notice: '这是含私人档案内容的成果导出，不是脱敏诊断。待入档或待保存结果尚不是正式证据；导出不会推进进度或请求模型。',
        pendingSave: pending ? { memoryBank: structuredClone(pending.item.memoryBank), formallyCommitted: false } : null,
        progress: bank?.[archive_batches.IMPORT_PROGRESS_KEY] || null,
        paused: bank?.archiveImportPaused || [], pageDrafts: archive_importRecovery.exportArchiveRecovery(origin) };
}

function archiveDraftParts(entry, context) {
    const inputs = entry.inputs || {}, captured = checkedArchiveTaskInput(inputs.taskInputV1, context);
    const progress = inputs.progress;
    if (progress && captured?.snapshot?.messages && captured?.external?.records) {
        return archive_batches.resolveBatchParts(progress, captured.snapshot.messages, captured.external.records);
    }
    return [];
}

export function archiveSourceBank(memory) {
    if (!memory) return null;
    const saved = structuredClone(memory);
    // The evidence/cover baseline is independent of previous task recipes.
    // Do not recursively copy earlier full chat snapshots into every batch.
    delete saved[archive_batches.IMPORT_PROGRESS_KEY];
    delete saved.archiveImportPaused;
    return saved;
}

// A draft row must not store the same full source snapshot twice. The live
// progress object keeps its own copy for the archive-bank commit (later batches
// read it back from the bank); only the serialized draft inputs drop the
// duplicate. Matching digests prove the two copies are identical, so a
// mismatched older manifest is never silently stripped.
export function progressForDraftRow(progress, taskInputV1) {
    if (!progress?.taskInputV1 || !taskInputV1 || progress.taskInputV1.digest !== taskInputV1.digest) return progress;
    const stored = { ...progress };
    delete stored.taskInputV1;
    return stored;
}

export function archivedRequestJson(segment, marker) {
    const prompt = segment?.requestRecipe?.identity?.prompt;
    if (typeof prompt !== 'string') return null;
    const at = prompt.lastIndexOf(marker);
    if (at < 0) return null;
    try { const value = JSON.parse(prompt.slice(at + marker.length)); return Array.isArray(value) ? value : null; }
    catch { return null; }
}

// No formal M IDs, archive revision or completion markers are assigned here.
// Only closed model values are displayed, using the original source chunk and
// the same per-memory normalizers as the production import.
export async function readCurrentArchiveRecoveryDraft(draftId, context = core_context.currentCharacterGuard()) {
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    try { await hydrateCurrentArchiveRecovery(context); }
    catch (error) {
        // An already received in-page segment remains readable when its durable
        // acknowledgement fails. This fallback does not enable generation.
        try { archive_importRecovery.readArchiveRecoveryDraft(origin, draftId); } catch { throw error; }
    }
    const entry = archive_importRecovery.readArchiveRecoveryDraft(origin, draftId);
    let parts = [];
    try { parts = archiveDraftParts(entry, context); } catch { /* Reading raw saved values never substitutes newer source rows. */ }
    const sections = [];
    for (const segment of entry.journal?.segments || []) {
        const raw = segment.state === 'complete' ? segment.rawJson : segment.state === 'truncated' ? segment.partial : '';
        if (!raw) continue;
        const parsed = generation_jsonParser.parsePartialJsonObject(raw);
        if (segment.slot === 'profile') {
            const fields = {};
            for (const key of ['archiveName', 'archiveSummary', 'archiveVerdict', 'verdictStyle']) {
                if (parsed.has(`/${key}`) && typeof parsed.at(`/${key}`) === 'string') fields[key] = parsed.at(`/${key}`);
            }
            const readings = {};
            for (const key of ['char', 'user', 'relation', 'tension', 'direction']) if (parsed.has(`/relationshipReading/${key}`)
                && typeof parsed.at(`/relationshipReading/${key}`) === 'string') readings[key] = parsed.at(`/relationshipReading/${key}`);
            const keywords = parsed.items('/keywords').filter(value => typeof value === 'string');
            if (Object.keys(fields).length || Object.keys(readings).length || keywords.length) sections.push({ kind: 'profile',
                complete: segment.state === 'complete', fields, readings, keywords });
            continue;
        }
        const match = /^(chat|external):(\d+)$/.exec(segment.slot);
        if (!match) continue;
        const [, kind, rawIndex] = match, index = Number(rawIndex);
        const selected = parts.filter(part => part.kind === kind)[index];
        const source = selected?.data || archivedRequestJson(segment, kind === 'chat' ? 'UNTRUSTED_CHAT_JSON:\n' : 'EXTERNAL_MEMORY_JSON:\n');
        const rows = parsed.items('/memories');
        if (!source) {
            if (rows.length) sections.push({ kind: 'unverified', label: `${kind === 'chat' ? '聊天' : '外部资料'}分块 ${index + 1}`,
                items: rows.filter(item => typeof item?.title === 'string' && typeof item?.summary === 'string')
                    .map(item => ({ title: item.title, summary: item.summary })) });
            continue;
        }
        const items = rows.flatMap(row => kind === 'chat' ? normalizeImportedChunk({ memories: [row] }, source)
            : normalizeExternalImportedMemories({ memories: [row] }, source));
        if (items.length) sections.push({ kind: 'memories', label: `${kind === 'chat' ? '聊天' : '外部资料'}分块 ${index + 1}`,
            complete: segment.state === 'complete', items });
    }
    return { draftId, operation: entry.operation, stage: entry.stage, paused: entry.paused, active: entry.active,
        durable: entry.durable, createdAt: entry.journal.createdAt, updatedAt: entry.journal.updatedAt, sections,
        ...(entry.profileResult ? { profileResult: structuredClone(entry.profileResult) } : {}),
        ...(entry.archiveResult ? { archiveResult: structuredClone(entry.archiveResult), profilePending: entry.profilePending,
            hasNextBatch: archive_batches.hasPendingBatches(entry.archiveResult.memoryBank?.[archive_batches.IMPORT_PROGRESS_KEY]) } : {}) };
}

export function refreshArchiveRecoveryReading() {
    try { Promise.resolve(ui_overlay.refreshArchiveRecoveryView?.()).catch(() => {}); }
    catch { /* Reading failure must not repeat a received model segment. */ }
}

// Explicit current-archive view/read actions only. No sources, credentials or
// providers are touched here; loaded checkpoints are not formal archive writes.
export async function hydrateCurrentArchiveRecovery(context = core_context.currentCharacterGuard(), { operation = null, force = false } = {}) {
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    const assertCurrent = () => {
        if (!core_context.isCurrentTaskOrigin(origin)
            || (getImportedMemory(core_context.getContext())?.archiveRevision || '') !== origin.archiveRevision) {
            throw new DOMException('Archive view changed', 'AbortError');
        }
    };
    assertCurrent();
    for (const target of operation ? [operation] : ['import', 'profile']) {
        await archive_importRecovery.hydrateArchiveRecovery(origin, target, { force });
        assertCurrent();
    }
    return { archive: getCurrentArchiveImportRecoverySummary(context),
        profile: getCurrentArchiveProfileRecoverySummary(context) };
}

export async function exportCurrentArchiveRecoveryAfterLoad(context = core_context.currentCharacterGuard()) {
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    let readFailure = null;
    try { await hydrateCurrentArchiveRecovery(context, { operation: 'import' }); }
    catch (error) { readFailure = error; }
    if (!core_context.isCurrentTaskOrigin(origin)
        || (getImportedMemory(core_context.getContext())?.archiveRevision || '') !== origin.archiveRevision) {
        throw new DOMException('Archive view changed', 'AbortError');
    }
    // Failed storage must not take away the escape hatch for successes still in
    // this page. Export only those actual records, never an invented empty file.
    const result = exportCurrentArchiveImportProgress(context);
    if (!result.pageDrafts.length && !result.pendingSave && !result.progress && !result.paused.length) {
        if (readFailure) throw readFailure;
        throw core_text.safeUserError('本机没有找到这条聊天的整理草稿或待入档成果。未删除任何记录；旧版导出文件仍可导入。', 'RMT_ARCHIVE_DRAFT_NOT_FOUND');
    }
    return result;
}

export async function saveCurrentArchiveRecovery(context = core_context.currentCharacterGuard(), operation = 'import') {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) throw core_text.safeUserError('当前请求尚未结束，草稿仍保留。', 'RMT_RECOVERY_BUSY');
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    await hydrateCurrentArchiveRecovery(context, { operation });
    if (!archive_importRecovery.listArchiveRecoveryDrafts(origin, operation).length) {
        throw core_text.safeUserError('没有找到当前整理草稿，未修改原记录。', 'RMT_ARCHIVE_DRAFT_NOT_FOUND');
    }
    if (!await archive_importRecovery.flushArchiveRecovery(origin, operation)) {
        throw core_text.safeUserError('本机草稿存储不可用，成功分段仍仅在本页；请先导出，不要刷新。', 'RMT_ARCHIVE_DRAFT_STORAGE');
    }
    if (!core_context.isCurrentTaskOrigin(origin)
        || (getImportedMemory(core_context.getContext())?.archiveRevision || '') !== origin.archiveRevision) {
        throw new DOMException('Archive view changed', 'AbortError');
    }
    return archive_importRecovery.archiveRecoverySummary(origin, operation);
}

export async function importCurrentArchiveRecoveryFile(data, context = core_context.currentCharacterGuard()) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) throw core_text.safeUserError('当前有请求进行中，未导入。', 'RMT_RECOVERY_BUSY');
    const origin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    // Imported snapshots remain untrusted. Prove the same current source before
    // retaining their original recipes; a different chat cannot import authority.
    for (const row of data?.pageDrafts || []) {
        const captured = checkedArchiveTaskInput(row?.inputs?.taskInputV1, context);
        if (captured) archive_batches.assertIdentity(captured.identity,
            batchIdentity(context, { fullFingerprint: core_context.completeArchiveChatFingerprint(context) }));
    }
    const result = await archive_importRecovery.importArchiveRecoveryData(origin, data);
    if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed', 'AbortError');
    return result;
}

export function getCurrentArchiveImportRecoverySummary(context = core_context.getContext()) {
    try {
        const bank = getImportedMemory(context);
        const origin = core_context.captureTaskOrigin(context, bank?.archiveRevision || '');
        archive_importRecovery.acknowledgeArchiveRecoveryCommit(origin);
        const summary = archive_importRecovery.archiveRecoverySummary(origin, 'import', { includeArchived: true });
        const pending = currentPendingArchiveSave(context);
        if (pending) return { ...summary, operation: 'import', profileOnly: false, awaitingCommit: true,
            committedRevision: pending.item.memoryBank.archiveRevision,
            completed: summary?.completed || Number(pending.item.completedChunks) || 0,
            canContinue: false, canRetry: true, pageOnly: true,
            notice: '整理已完成，尚未保存；仅重试保存不会请求模型。当前批不能标为已保存。' };
        const progress = bank?.[archive_batches.IMPORT_PROGRESS_KEY];
        if (archive_batches.hasPendingBatches(progress) && !(bank?.archivePartialDraft && summary && !summary.onlyArchivedDrafts)) {
            const totals = archive_batches.progressTotals(progress);
            const capacity = totals.pendingMemories > 0;
            const pageParts = !totals.pendingMemories && summary && !summary.profileOnly
                ? progress.batches[progress.nextBatch].slice(0, summary.completed) : [];
            const pageProcessed = pageParts.reduce((n, part) => n + part.refs.length, 0);
            const processed = Math.min(totals.total, totals.processed + pageProcessed);
            const detail = `来源 ${totals.total} 片段 / ${totals.chars.toLocaleString()} 字符；已处理 ${processed}、已正式保存 ${totals.saved}、未完成 ${totals.remaining}（其中待发送 ${totals.total - processed}）。批次 ${totals.currentBatch}/${totals.batches}。`;
            return { ...summary, operation: 'import', profileOnly: false, onlyArchivedDrafts: false, awaitingCommit: false, fullRebuild: false,
                completed: summary?.completed || 0, canContinue: true, canRetry: true, pageOnly: false,
                batchProgress: totals, capacityBlocked: false, pendingAdmission: capacity,
                notice: detail + (capacity ? `本批有 ${totals.pendingMemories} 条已校验结果待保存。点击“保存待入档结果（不生成）”即可正式入档，不请求模型，不删除或顶掉旧记忆。`
                    : '本批完成后会停止；下一批需明确点击。已保存成果现在即可阅读。')
                    + (summary && !summary.profileOnly ? ` ${summary.notice}` : '') };
        }
        return summary;
    } catch { return null; }
}

function currentPendingArchiveSave(context) {
    const savedRevision = getImportedMemory(context)?.archiveRevision;
    let pending = null;
    for (const [key, bucket] of runtimeState.deferredChatCommits) {
        for (const item of Array.isArray(bucket) ? bucket : []) {
            if (item?.kind !== 'archive' || !core_context.deferredCommitOriginMatchesContext(item.origin, context)
                || !isCompatibleArchive(item.memoryBank) || !item.memoryBank.archiveRevision
                || core_context.comparableChatId(item.memoryBank.chatId) !== core_context.comparableChatId(item.origin.chatId)
                || item.memoryBank.archiveRevision === savedRevision) continue;
            if (!pending || Number(item.queuedAt) >= Number(pending.item.queuedAt)) pending = { key, item };
        }
    }
    return pending;
}

// The existing explicit discard confirmation owns permission. Remove the exact
// pending archive records first so a later chat-open flush cannot resurrect them.
export function discardCurrentArchiveImportRecovery(context = core_context.currentCharacterGuard()) {
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return false;
    for (const [key, bucket] of runtimeState.deferredChatCommits) {
        for (const item of Array.isArray(bucket) ? bucket.slice() : []) {
            if (item?.kind !== 'archive' || !core_context.deferredCommitOriginMatchesContext(item.origin, context)) continue;
            if (!core_requestCoordinator.acknowledgeDeferredCommit(key, item)) {
                const code = runtimeState.deferredChatCommits.diagnosticStatus?.().errorCode || 'RMT_DEFERRED_UNKNOWN';
                throw core_text.safeUserError('待写回草稿尚未移除，整理草稿继续保留。', code);
            }
        }
    }
    return archive_importRecovery.discardArchiveRecovery(core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || ''));
}

export async function retryCurrentArchiveSave(context, taskTrace) {
    const pending = currentPendingArchiveSave(context);
    if (!pending) return { status: 'blocked' };
    const { key, item } = pending;
    const bank = { ...item.memoryBank,
        characterName: core_text.normalizeText(context.name2, 120) || item.memoryBank.characterName };
    const liveOrigin = core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || '');
    const controller = new AbortController();
    const liveTaskCurrent = () => !controller.signal.aborted && core_context.isCurrentTaskOrigin(liveOrigin);
    const stillCurrent = () => liveTaskCurrent()
        && core_context.deferredCommitOriginMatchesContext(item.origin, core_context.getContext());
    const assertCurrent = () => {
        if (!stillCurrent()) throw core_text.safeUserError('原聊天或任务已经变化，待保存结果保留。', 'RMT_RECOVERY_ORIGIN_CHANGED');
        assertBatchCommitIdentity(core_context.currentCharacterGuard(), bank, { completedSaveOnly: true });
    };
    runtimeState.busy = true;
    runtimeState.activeTaskTrace = taskTrace;
    runtimeState.activeTaskOrigin = liveOrigin;
    runtimeState.activeTaskAbortController = controller;
    runtimeState.activeTaskLabel = '正在保存已整理的档案…';
    try {
        ui_overlay.setBusyUi(true, runtimeState.activeTaskLabel);
        core_taskTrace.beginStage(taskTrace, 'validate');
        const snapshot = await core_context.buildChatSnapshot(context, { completeSource: !!bank.fullSourceFingerprint, expectedChatId: item.origin.chatId, stillCurrent });
        assertCurrent();
        if (!runtimeState.deferredChatCommits.get(key)?.includes(item)) return { status: 'blocked' };
        if (!archivedChatFingerprint(bank) || archivedChatFingerprint(bank) !== snapshot.fingerprint
            || Number(bank.sourceMessageCount) !== snapshot.totalMessages
            || (bank.fullSourceFingerprint && bank.fullSourceFingerprint !== snapshot.fullFingerprint)) {
            throw archive_batches.changedInput('chat');
        }
        core_taskTrace.markStage(taskTrace, 'validate');
        core_taskTrace.beginStage(taskTrace, 'save');
        await core_cache.saveImportedMemory(core_context.currentCharacterGuard(), bank, item.origin.chatId, {
            preserveDerivedCache: !!item.preserveDerivedCache,
            expectedTaskOrigin: item.origin, assertTaskCurrent: assertCurrent,
            explicitCreate: item.origin.archivePresent === false,
            expectedPreviousArchiveState: { present: item.origin.archivePresent === true, revision: item.origin.archiveRevision },
        });
        // After commit the old origin's revision no longer exists. Keep the live
        // chat/card/lifecycle fence, then confirm the exact committed revision.
        if (!liveTaskCurrent()) throw core_text.safeUserError('原聊天或任务已经变化，未确认本次保存。', 'RMT_RECOVERY_ORIGIN_CHANGED');
        const savedContext = core_context.currentCharacterGuard();
        if (getImportedMemory(savedContext)?.archiveRevision !== bank.archiveRevision) {
            throw core_text.safeUserError('档案版本已变化，未确认本次保存。', 'RMT_CACHE_CAS_CONFLICT');
        }
        core_taskTrace.markStage(taskTrace, 'save');
        core_requestCoordinator.acknowledgeDeferredCommit(key, item);
        archive_importRecovery.acknowledgeArchiveRecoveryCommit({ ...item.origin, archiveRevision: bank.archiveRevision });
        clearMemoryPreflight(savedContext);
        ui_settingsPanel.refreshSettingsMemoryStatus();
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        if (overlay && !overlay.hidden && !runtimeState.activeMode && runtimeState.archiveViewLevel === 'chooser') ui_overlay.showChooser();
        globalThis.toastr?.success?.('档案已保存，本次没有请求模型。', '心迹回廊');
        return { status: 'committed' };
    } catch (error) {
        core_taskTrace.endTaskTrace(taskTrace, controller.signal.aborted ? 'cancelled' : 'failed', error);
        globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 保存未完成');
        return { status: controller.signal.aborted ? 'cancelled' : 'failed' };
    } finally {
        if (runtimeState.activeTaskAbortController === controller) {
            runtimeState.activeTaskAbortController = null;
            runtimeState.activeTaskOrigin = null;
            runtimeState.activeTaskLabel = '';
            runtimeState.busy = false;
            ui_overlay.setBusyUi(false);
        }
    }
}

export function getCurrentArchiveProfileRecoverySummary(context = core_context.getContext()) {
    try { return archive_importRecovery.archiveRecoverySummary(core_context.captureTaskOrigin(context, getImportedMemory(context)?.archiveRevision || ''), 'profile', { includeArchived: true }); }
    catch { return null; }
}

// Old releases committed the validated overflow inside the canonical bank,
// but left its source batch unfinished. Admit that exact local result, never
// replay the source through a provider or evict old memories to make room.
export async function saveCurrentArchivePendingResults(context, existing, logicalTask, taskTrace) {
    const origin = { ...core_context.captureTaskOrigin(context, existing.archiveRevision), archivePresent: true };
    core_requestCoordinator.bindLogicalGenerationTask(logicalTask, origin);
    const assertCurrent = () => {
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat or archive changed', 'AbortError');
        if ((getImportedMemory(core_context.currentCharacterGuard())?.archiveRevision || '') !== existing.archiveRevision) {
            throw archive_batches.changedInput('archive');
        }
        assertBatchCommitIdentity(core_context.currentCharacterGuard(), existing, { completedSaveOnly: true });
        if (existing.fullSourceFingerprint && core_context.completeArchiveChatFingerprint(core_context.currentCharacterGuard()) !== existing.fullSourceFingerprint) {
            throw archive_batches.changedInput('chat');
        }
    };
    try {
        const progress = archive_batches.checkedProgress(existing[archive_batches.IMPORT_PROGRESS_KEY]);
        if (!progress?.capacityPending?.length || progress.nextBatch >= progress.batches.length
            || progress.archiveRevision !== existing.archiveRevision) throw archive_batches.changedInput('archive');
        assertCurrent();
        core_taskTrace.beginStage(taskTrace, 'validate');
        const snapshot = await core_context.buildChatSnapshot(context, { completeSource: true, expectedChatId: origin.chatId,
            stillCurrent: () => { assertCurrent(); return true; } });
        assertCurrent();
        if (Number(existing.sourceMessageCount) !== snapshot.totalMessages
            || (!existing.fullSourceFingerprint && archivedChatFingerprint(existing) !== snapshot.fingerprint)) throw archive_batches.changedInput('chat');
        const captured = checkedArchiveTaskInput(progress.taskInputV1, context, { completedSaveOnly: true });
        const external = captured?.external || await retainedBatchExternal(context, progress);
        assertCurrent();
        archive_batches.resolveBatchParts(progress, snapshot.messages, external.records);
        const admitted = admitArchiveBatch(existing.memories, progress.capacityPending, existing.coldArchive);
        if (admitted.pending.length) throw core_text.safeUserError('待入档结果未全部保存，原成果继续保留。', 'RMT_ARCHIVE_CHUNK');
        const bank = structuredClone(existing);
        bank.memories = admitted.memories;
        bank.coldArchive = admitted.coldArchive;
        bank.updatedAt = Date.now();
        bank.archiveRevision = `${bank.updatedAt}-${snapshot.fingerprint}-admitted-${archive_batches.sourceHash(existing.archiveRevision).slice(0, 12)}`;
        const staged = archive_batches.advanceProgress(progress, { archiveRevision: bank.archiveRevision });
        bank[archive_batches.IMPORT_PROGRESS_KEY] = staged;
        const savedRefs = archive_batches.savedSourceRefs(staged);
        bank.usedMessageCount = (staged.baseUsedMessages || 0) + new Set(savedRefs.filter(ref => ref.kind === 'chat').map(ref => ref.index)).size;
        bank.usedCharacterCount = (staged.baseUsedChars || 0) + savedRefs.reduce((sum, ref) => sum + ref.length, 0);
        bank.coverageMode = archive_batches.hasPendingBatches(staged) ? 'batched-pending' : 'batched-complete';
        bank.coveredRanges = archive_coverage.coveredRangesForSave(existing, {
            window: { start: 1, end: snapshot.totalMessages }, revision: bank.archiveRevision, progress: staged });
        core_taskTrace.markStage(taskTrace, 'validate');
        core_taskTrace.beginStage(taskTrace, 'save');
        core_requestCoordinator.noteChatTaskPhase('save', { origin });
        // Retain the exact candidate for a metadata failure AFTER the independent
        // backup committed. The existing local save retry can then satisfy the
        // idempotent CAS without creating a new revision or re-admitting results.
        const commitIntent = core_requestCoordinator.queueDeferredCommitRecord(origin, {
            kind: 'archive', memoryBank: bank, preserveDerivedCache: true,
            profilePending: false, completedChunks: progress.batches[progress.nextBatch].length,
        });
        await core_cache.saveImportedMemory(context, bank, origin.chatId, {
            preserveDerivedCache: true, expectedTaskOrigin: origin, assertTaskCurrent: assertCurrent,
            expectedPreviousArchiveState: { present: true, revision: existing.archiveRevision },
        });
        core_taskTrace.markStage(taskTrace, 'save');
        core_requestCoordinator.acknowledgeDeferredCommit(commitIntent.key, commitIntent.item);
        archive_importRecovery.acknowledgeArchiveRecoveryCommit({ ...origin, archiveRevision: bank.archiveRevision });
        clearMemoryPreflight(context);
        ui_settingsPanel.refreshSettingsMemoryStatus();
        refreshArchiveRecoveryReading();
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        if (overlay && !overlay.hidden && !runtimeState.activeMode) ui_overlay.showChooser();
        globalThis.toastr?.success?.(archive_batches.hasPendingBatches(staged)
            ? '本批待入档结果已保存，旧记忆保留；可继续下一批。本次没有请求模型。'
            : '待入档结果已全部保存，建档完成；旧记忆保留。本次没有请求模型。', '心迹回廊');
        return { status: 'committed' };
    } catch (error) {
        const cancelled = isArchiveCancellation(error);
        core_taskTrace.endTaskTrace(taskTrace, cancelled ? 'cancelled' : 'failed', error);
        globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 原待入档结果保留');
        return { status: cancelled ? 'cancelled' : 'failed', error };
    }
}
