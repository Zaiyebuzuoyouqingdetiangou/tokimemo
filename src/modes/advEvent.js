import * as split_advEventData from './advEventData.js';
import * as split_advEventGeneration from './advEventGeneration.js';
import * as generation_modesBridge from '../generation/modesBridge.js';
// 以下导出已搬到 modes/advEventData.js、modes/advEventGeneration.js，这里原样转发，调用方不用改。
export const advPrompt = split_advEventData.advPrompt;
export const advIndexRepairPrompt = split_advEventData.advIndexRepairPrompt;
export const advBatchPrompt = split_advEventData.advBatchPrompt;
export const deriveAdvFromAlbum = split_advEventData.deriveAdvFromAlbum;
export const normalizeEventList = split_advEventData.normalizeEventList;
export const normalizeEventCandidate = split_advEventData.normalizeEventCandidate;
export const normalizeAdvBatch = split_advEventData.normalizeAdvBatch;
export const projectAdvProgress = split_advEventData.projectAdvProgress;
export const normalizeAdv = split_advEventData.normalizeAdv;
export const compactAdvExisting = split_advEventData.compactAdvExisting;
export const advImportantIndexPrompt = split_advEventData.advImportantIndexPrompt;
export const advEvidenceKey = split_advEventData.advEvidenceKey;
export const mergeAdvIncremental = split_advEventData.mergeAdvIncremental;
export const generateAdvIndexWithRepair = split_advEventData.generateAdvIndexWithRepair;
export const generateAllAdvForSession = split_advEventGeneration.generateAllAdvForSession;
export const repairFailedAdvForSession = split_advEventGeneration.repairFailedAdvForSession;
export const generateAdvForSelected = split_advEventGeneration.generateAdvForSelected;

// 重构清单 C-4（r84.118）：把生成层要用的函数登记到 generation/modesBridge.js（生成层不再 import 本文件）。
generation_modesBridge.registerGenerationModesBridge({
    advPrompt, normalizeEventList, normalizeEventCandidate, projectAdvProgress, normalizeAdv, generateAdvIndexWithRepair, generateAllAdvForSession, repairFailedAdvForSession, generateAdvForSelected,
});


