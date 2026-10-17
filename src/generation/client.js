import * as generation_recovery from './recovery.js';
import * as split_generationContext from './generationContext.js';
import * as split_generationRequest from './generationRequest.js';
import * as split_generationSavedActions from './generationSavedActions.js';
import * as split_generationModes from './generationModes.js';
import { autoContinuedDrafts } from './generationModes.js';
import * as core_generationBridge from '../core/generationBridge.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
// 以下导出已搬到 generation/generationContext.js、generation/generationRequest.js、generation/generationSavedActions.js、generation/generationModes.js，这里原样转发，调用方不用改。
export const generationContentSettings = split_generationContext.generationContentSettings;
export const fitGenerationContentSnapshot = split_generationContext.fitGenerationContentSnapshot;
export const generationContentContext = split_generationContext.generationContentContext;
export const generationWorldInfoScanTerms = split_generationContext.generationWorldInfoScanTerms;
export const buildWorldPresentationContext = split_generationContext.buildWorldPresentationContext;
export const captureRoomParticipantSnapshot = split_generationContext.captureRoomParticipantSnapshot;
export const captureAlbumParticipantSnapshot = split_generationContext.captureAlbumParticipantSnapshot;
export const captureModeParticipantSnapshot = split_generationContext.captureModeParticipantSnapshot;
export const chunkForGeneration = split_generationContext.chunkForGeneration;
export const mapGenerationConcurrent = split_generationContext.mapGenerationConcurrent;
export const requestValidatedSegment = split_generationRequest.requestValidatedSegment;
export const TOKEN_COUNT_TIMEOUT_MS = split_generationContext.TOKEN_COUNT_TIMEOUT_MS;
export const assertPromptBudget = split_generationContext.assertPromptBudget;
export const GENERATED_PHRASE_EVIDENCE_KEYS = split_generationContext.GENERATED_PHRASE_EVIDENCE_KEYS;
export const generatedPhrasePolicyText = split_generationContext.generatedPhrasePolicyText;
export const findBannedGeneratedPhrase = split_generationContext.findBannedGeneratedPhrase;
export const assertNoBannedGeneratedPhrase = split_generationContext.assertNoBannedGeneratedPhrase;
export const normalizeConnectionManagerError = split_generationRequest.normalizeConnectionManagerError;
export const generateConfiguredJson = split_generationRequest.generateConfiguredJson;
export const composeOutgoingGenerationPrompt = split_generationRequest.composeOutgoingGenerationPrompt;
export const requestJson = split_generationRequest.requestJson;
export const generateArchiveChunkJson = split_generationRequest.generateArchiveChunkJson;
export const beginModeRecovery = split_generationSavedActions.beginModeRecovery;
export const continueSavedGeneration = split_generationModes.continueSavedGeneration;
export const exportSavedGeneration = split_generationSavedActions.exportSavedGeneration;
export const discardSavedGeneration = split_generationSavedActions.discardSavedGeneration;
export const generateMode = split_generationModes.generateMode;
export const startAdvScriptSecondStep = split_generationSavedActions.startAdvScriptSecondStep;

// Recovery is a dependency of this module, but the bundle initializes this file first
// when the import cycle is cut. Register after the current init turn so the export exists.
const pendingAutoContinuations = new Set();

const AUTO_CONTINUE_SETTLE_PAUSE_MS = 400;

const AUTO_CONTINUE_MAX_WAITS = 8;

function liveChatScope() {
    try { return core_context.chatScopeKey(core_context.getContext()); } catch { return ''; }
}

// The truncated run is still finishing when it reports the draft. Wait until
// every whole operation that owns this draft/mode has settled, then start the
// continuation once. The draft counts as auto-continued only when that run
// really starts; a cancelled owner or a chat switch leaves 继续生成 to the user.
async function startAutoContinuation(item, key, scope) {
    try {
        for (let round = 0; round < AUTO_CONTINUE_MAX_WAITS; round += 1) {
            const busy = core_requestCoordinator.runningLogicalTasksForDraft({ mode: item.mode, draftId: item.draftId });
            if (busy.length) {
                const outcomes = await Promise.all(busy.map(task => task.settled));
                if (outcomes.some(outcome => outcome?.status === 'cancelled')) return;
                continue;
            }
            await new Promise(resolve => setTimeout(resolve, AUTO_CONTINUE_SETTLE_PAUSE_MS));
            if (core_requestCoordinator.runningLogicalTasksForDraft({ mode: item.mode, draftId: item.draftId }).length) continue;
            if (scope && liveChatScope() !== scope) return;
            // From here to the logical-task registration there is no await, so
            // nothing else can claim this mode in between.
            autoContinuedDrafts.add(key);
            await continueSavedGeneration(item.mode, {
                draftId: item.draftId,
                pageId: item.pageId || '',
                skipConfirm: true,
                background: true,
            });
            return;
        }
    } catch (error) {
        if (error?.code === 'RMT_LOGICAL_TASK_BUSY') autoContinuedDrafts.delete(key);
        console.warn('[HeartbeatMemories] automatic continuation did not start', error?.code || error?.name || 'failed');
    } finally {
        pendingAutoContinuations.delete(key);
    }
}

queueMicrotask(() => {
    if (typeof generation_recovery.setTruncationContinueHandler !== 'function') return;
    generation_recovery.setTruncationContinueHandler(item => {
        const key = `${item?.mode || ''}:${item?.draftId || ''}`;
        if (!item?.mode || !item?.draftId || autoContinuedDrafts.has(key) || pendingAutoContinuations.has(key)) return;
        pendingAutoContinuations.add(key);
        void startAutoContinuation(item, key, liveChatScope());
    });
});

// 重构清单 C-3b（r84.99）：把 core 层要用的函数登记到 core/generationBridge.js（core 不再 import 本文件）。
core_generationBridge.registerGenerationBridge({ generateMode });
