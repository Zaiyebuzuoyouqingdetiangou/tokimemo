import * as recovery_merge from './recoveryMerge.js';
import * as split_recoveryFeedback from './recoveryFeedback.js';
import * as split_recoverySegments from './recoverySegments.js';
import { TOKEN, changeJournal, holdUnsavedReply, noteHeldReplyExport, projectHeldReply, recoveryError, requestTokens } from './recoveryFeedback.js';
import { assertRetainedSize, replaceSegment } from './recoverySegments.js';
import * as core_generationBridge from '../core/generationBridge.js';
// 以下导出已搬到 generation/recoveryFeedback.js、generation/recoverySegments.js，这里原样转发，调用方不用改。
export const GENERATION_RECOVERY_CACHE_KEY = split_recoveryFeedback.GENERATION_RECOVERY_CACHE_KEY;
export const GENERATION_RECOVERY_LIMITS = split_recoveryFeedback.GENERATION_RECOVERY_LIMITS;
export const generationRecoveryMismatch = split_recoveryFeedback.generationRecoveryMismatch;
export const generationFailureReason = split_recoveryFeedback.generationFailureReason;
export const generationRetryFeedbackText = split_recoveryFeedback.generationRetryFeedbackText;
export const generationRetryPrompt = split_recoveryFeedback.generationRetryPrompt;
export const generationPhoneRetryPrompt = split_recoveryFeedback.generationPhoneRetryPrompt;
export const generationRecoveryDigest = split_recoveryFeedback.generationRecoveryDigest;
export const generationRecoveryHeldReplies = split_recoveryFeedback.generationRecoveryHeldReplies;
export const discardGenerationRecoveryHeldReplies = split_recoveryFeedback.discardGenerationRecoveryHeldReplies;
export const generationRecoverySummary = split_recoveryFeedback.generationRecoverySummary;
export const canRestartLegacyConfiguration = split_recoveryFeedback.canRestartLegacyConfiguration;
export const exportGenerationRecovery = split_recoveryFeedback.exportGenerationRecovery;
export const createGenerationRecovery = split_recoverySegments.createGenerationRecovery;
export const attachGenerationRecovery = split_recoveryFeedback.attachGenerationRecovery;
export const detachGenerationRecovery = split_recoveryFeedback.detachGenerationRecovery;
export const generationRecoverySnapshot = split_recoveryFeedback.generationRecoverySnapshot;
export const readGenerationContentSnapshot = split_recoveryFeedback.readGenerationContentSnapshot;
export const generationContentSnapshotForOrigin = split_recoveryFeedback.generationContentSnapshotForOrigin;
export const persistGenerationRecovery = split_recoveryFeedback.persistGenerationRecovery;
export const publishGenerationRecoveryProgress = split_recoveryFeedback.publishGenerationRecoveryProgress;
export const freezeRecoveryRequestPayload = split_recoverySegments.freezeRecoveryRequestPayload;
export const generationRecoveryForOrigin = split_recoveryFeedback.generationRecoveryForOrigin;
export const generationRecoveryProgress = split_recoveryFeedback.generationRecoveryProgress;
export const frozenGenerationInput = split_recoverySegments.frozenGenerationInput;
export const generationRecoverySegmentsForOrigin = split_recoveryFeedback.generationRecoverySegmentsForOrigin;
export const generationContinuationPrompt = split_recoverySegments.generationContinuationPrompt;
export const legacyRecoveryPromptPermitted = split_recoverySegments.legacyRecoveryPromptPermitted;
export const withRecoverySegment = split_recoverySegments.withRecoverySegment;
export const noteGenerationRecoveryFailure = split_recoverySegments.noteGenerationRecoveryFailure;

let truncationContinueHandler = null;

export function setTruncationContinueHandler(handler) {
    truncationContinueHandler = typeof handler === 'function' ? handler : null;
}

export async function recordRecoveryTruncation(options, raw, error) {
    const record = options?.[TOKEN] && requestTokens.get(options[TOKEN]);
    if (!record || error?.code !== 'RMT_JSON_TRUNCATED' || typeof raw !== 'string' || !raw.trim()) return false;
    if (raw.length > GENERATION_RECOVERY_LIMITS.segmentChars) {
        throw recoveryError('RMT_RECOVERY_LIMIT', '截断草稿过长，无法完整保存；此前成功部分和旧内容仍保留，请勿关闭当前页面。');
    }
    try {
        await changeJournal(record.handle, journal => {
            const previous = journal.segments.find(row => row.slot === record.slot);
            const retainedPartials = recovery_merge.retainedRecoveryPartials(previous, raw);
            assertRetainedSize(raw, retainedPartials);
            replaceSegment(journal, { slot: record.slot, requestHash: record.requestHash,
                state: 'truncated', partial: raw, ...(retainedPartials.length ? { retainedPartials } : {}), failureCode: 'RMT_JSON_TRUNCATED', failureFeedback: 'truncated', ...(record.contract ? { contract: record.contract } : {}), ...(record.recipe ? { requestRecipe: record.recipe } : {}) });
            journal.failureCode = 'RMT_JSON_TRUNCATED';
        });
    } catch (changeError) {
        // The truncated draft did not fit the journal's existing total capacity.
        // Hold it in bounded page memory and project it; the capacity error
        // still propagates and stops later requests.
        if (changeError?.code !== 'RMT_RECOVERY_LIMIT') throw changeError;
        if (holdUnsavedReply(record.handle, record.slot, raw)) {
            noteHeldReplyExport(changeError);
            await projectHeldReply(record.handle, record.slot, record.requestHash, raw);
        }
        throw changeError;
    }
    // Empty replies reroll the whole segment. A half-written reply is continued once,
    // keeping the partial instead of discarding it.
    error.retryableJson = false;
    error.retryable = false;
    error.safeToDisplay = true;
    error.safeUserMessage = record.handle.durable
        ? '本段正文写到一半。已保留写好的部分，并会自动接着补；也可以在任务中心点“继续生成”。'
        : record.handle.pageOnly ? '本段正文写到一半，草稿暂存在当前页面。请勿刷新；会自动接着补，也可以点“继续生成”。'
        : '本段正文未写完，但浏览器没有成功保存这段草稿；旧内容仍在，请检查本地存储后重试。';
    error.message = error.safeUserMessage;
    await publishGenerationRecoveryProgress(record.handle);
    if (record.handle.durable && typeof truncationContinueHandler === 'function') {
        const journal = record.handle.journal;
        const summary = generationRecoverySummary(journal);
        if (summary?.canContinue && summary.mode && journal?.draftId) {
            try {
                truncationContinueHandler({
                    mode: summary.mode,
                    draftId: journal.draftId,
                    pageId: typeof journal.pageId === 'string' ? journal.pageId : '',
                });
            } catch { /* The task center still offers 继续生成. */ }
        }
    }
    return true;
}

// 重构清单 C-3b（r84.99）：把 core 层要用的函数登记到 core/generationBridge.js（core 不再 import 本文件）。
core_generationBridge.registerGenerationBridge({ readGenerationContentSnapshot, generationRecoverySummary, generationRecoveryDigest, canRestartLegacyConfiguration, generationRecoveryMismatch, generationRecoveryProgress, generationRecoveryForOrigin });
