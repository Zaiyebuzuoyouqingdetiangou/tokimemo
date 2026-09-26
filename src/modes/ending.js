import * as split_endingData from './endingData.js';
import * as split_endingGeneration from './endingGeneration.js';
import * as generation_modesBridge from '../generation/modesBridge.js';
// 以下导出已搬到 modes/endingData.js、modes/endingGeneration.js，这里原样转发，调用方不用改。
export const ENDING_CONFESSION_HINT_RE = split_endingData.ENDING_CONFESSION_HINT_RE;
export const ENDING_EASTER_EGG_MODULES = split_endingData.ENDING_EASTER_EGG_MODULES;
export const normalizeEndingEasterEgg = split_endingData.normalizeEndingEasterEgg;
export const compactEndingConfessionsExisting = split_endingData.compactEndingConfessionsExisting;
export const endingConfessionRefreshPrompt = split_endingData.endingConfessionRefreshPrompt;
export const endingOutlinePrompt = split_endingData.endingOutlinePrompt;
export const normalizeEndingOutline = split_endingData.normalizeEndingOutline;
export const compactEndingRoutesExisting = split_endingData.compactEndingRoutesExisting;
export const endingIncrementOutlinePrompt = split_endingData.endingIncrementOutlinePrompt;
export const projectEndingProgress = split_endingData.projectEndingProgress;
export const normalizeEndingIncrementOutline = split_endingData.normalizeEndingIncrementOutline;
export const endingRouteEvidenceKey = split_endingData.endingRouteEvidenceKey;
export const endingConfessionEvidenceKey = split_endingData.endingConfessionEvidenceKey;
export const mergeEndingConfessions = split_endingData.mergeEndingConfessions;
export const mergeEndingIncremental = split_endingGeneration.mergeEndingIncremental;
export const endingRouteDetailPrompt = split_endingData.endingRouteDetailPrompt;
export const splitEndingConfessionText = split_endingData.splitEndingConfessionText;
export const normalizeEndingConfessionLines = split_endingData.normalizeEndingConfessionLines;
export const normalizeEndingRouteDetail = split_endingData.normalizeEndingRouteDetail;
export const generateEndingWithRepair = split_endingGeneration.generateEndingWithRepair;
export const normalizeEndingConfessionReplays = split_endingData.normalizeEndingConfessionReplays;
export const normalizeEnding = split_endingGeneration.normalizeEnding;

// 重构清单 C-4（r84.117）：把生成层要用的函数登记到 generation/modesBridge.js（生成层不再 import 本文件）。
generation_modesBridge.registerGenerationModesBridge({
    endingRouteDetailPrompt, normalizeEndingRouteDetail, normalizeEndingConfessionReplays, normalizeEnding, generateEndingWithRepair, projectEndingProgress, endingOutlinePrompt,
    endingConfessionHintTest(...args) { return ENDING_CONFESSION_HINT_RE.test(...args); },
});


