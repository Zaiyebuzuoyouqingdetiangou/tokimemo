import * as split_travelScenes from './travelScenes.js';
import * as split_travelGeneration from './travelGeneration.js';
import * as generation_modesBridge from '../generation/modesBridge.js';
// 以下导出已搬到 modes/travelScenes.js、modes/travelGeneration.js，这里原样转发，调用方不用改。
export const safeTravelLocationKind = split_travelScenes.safeTravelLocationKind;
export const safeTravelTheme = split_travelScenes.safeTravelTheme;
export const resolveTravelSceneTheme = split_travelScenes.resolveTravelSceneTheme;
export const travelKeepsakeForItem = split_travelScenes.travelKeepsakeForItem;
export const travelPostcardSceneProfile = split_travelScenes.travelPostcardSceneProfile;
export const travelPostcardContentKey = split_travelScenes.travelPostcardContentKey;
export const visibleTravelLocations = split_travelScenes.visibleTravelLocations;
export const normalizeTravel = split_travelScenes.normalizeTravel;
export const compactTravelExisting = split_travelScenes.compactTravelExisting;
export const travelPrompt = split_travelScenes.travelPrompt;
export const structuredTravelPrompt = split_travelGeneration.structuredTravelPrompt;
export const travelLocationKey = split_travelGeneration.travelLocationKey;
export const mergeTravelIncremental = split_travelGeneration.mergeTravelIncremental;
export const projectTravelProgress = split_travelGeneration.projectTravelProgress;
export const fillTravelProse = split_travelGeneration.fillTravelProse;
export const generateTravelWithRepair = split_travelGeneration.generateTravelWithRepair;
export const travelMarkerPosition = split_travelGeneration.travelMarkerPosition;
export const travelMarkerPositions = split_travelGeneration.travelMarkerPositions;
// 重构清单 C-4（r84.107）：把生成层要用的函数登记到 generation/modesBridge.js（生成层不再 import 本文件）。
generation_modesBridge.registerGenerationModesBridge({ normalizeTravel, projectTravelProgress, fillTravelProse, generateTravelWithRepair });


