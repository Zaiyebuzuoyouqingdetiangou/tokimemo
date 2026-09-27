import * as generation_recovery from './recovery.js';
import * as split_generationContext from './generationContext.js';
import * as split_generationRequest from './generationRequest.js';
import * as split_generationSavedActions from './generationSavedActions.js';
import * as split_generationModes from './generationModes.js';
import { autoContinuedDrafts } from './generationModes.js';
import * as core_generationBridge from '../core/generationBridge.js';
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
queueMicrotask(() => {
    if (typeof generation_recovery.setTruncationContinueHandler !== 'function') return;
    generation_recovery.setTruncationContinueHandler(item => {
        const key = `${item?.mode || ''}:${item?.draftId || ''}`;
        if (!item?.mode || !item?.draftId || autoContinuedDrafts.has(key)) return;
        autoContinuedDrafts.add(key);
        setTimeout(() => {
            continueSavedGeneration(item.mode, {
                draftId: item.draftId,
                pageId: item.pageId || '',
                skipConfirm: true,
                background: true,
            }).catch(error => {
                console.warn('[HeartbeatMemories] automatic continuation did not start', error?.code || error?.name || 'failed');
            });
        }, 400);
    });
});

// 重构清单 C-3b（r84.99）：把 core 层要用的函数登记到 core/generationBridge.js（core 不再 import 本文件）。
core_generationBridge.registerGenerationBridge({ generateMode });
