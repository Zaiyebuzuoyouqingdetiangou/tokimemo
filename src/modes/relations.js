import * as split_characterProfile from './characterProfile.js';
import * as split_relationsView from './relationsView.js';
// 以下导出已搬到 modes/characterProfile.js、modes/relationsView.js，这里原样转发，调用方不用改。
export const relationParticipantNames = split_characterProfile.relationParticipantNames;
export const extractLiteralCharacterFacts = split_characterProfile.extractLiteralCharacterFacts;
export const collectCharacterProfileSources = split_characterProfile.collectCharacterProfileSources;
export const characterProfileContextEnvelope = split_characterProfile.characterProfileContextEnvelope;
export const characterProfilePrompt = split_characterProfile.characterProfilePrompt;
export const normalizeCharacterProfile = split_characterProfile.normalizeCharacterProfile;
export const patchCharacterProfileFromCard = split_characterProfile.patchCharacterProfileFromCard;
export const getCharacterProfiles = split_characterProfile.getCharacterProfiles;
export const getCharacterProfile = split_characterProfile.getCharacterProfile;
export const setCharacterProfile = split_characterProfile.setCharacterProfile;
export const deleteCharacterProfile = split_characterProfile.deleteCharacterProfile;
export const archiveCharacterProfileKey = split_characterProfile.archiveCharacterProfileKey;
export const generateCharacterProfileForGroup = split_characterProfile.generateCharacterProfileForGroup;
export const fitRelationSettingEntries = split_characterProfile.fitRelationSettingEntries;
export const mergeBudgetRetainedSettingRelations = split_characterProfile.mergeBudgetRetainedSettingRelations;
export const relationsPrompt = split_characterProfile.relationsPrompt;
export const normalizeSettingRelationships = split_characterProfile.normalizeSettingRelationships;
export const normalizeRelations = split_relationsView.normalizeRelations;
export const projectRelationsProgress = split_relationsView.projectRelationsProgress;
export const relationsViewIdentity = split_relationsView.relationsViewIdentity;
export const mergeRelationLayers = split_relationsView.mergeRelationLayers;
export const relationGardenPositions = split_relationsView.relationGardenPositions;
export const relationGardenHtml = split_relationsView.relationGardenHtml;
export const cardRelationSourcesHtml = split_relationsView.cardRelationSourcesHtml;
export const characterProfileHtml = split_relationsView.characterProfileHtml;
export const worldlineDiscoveriesHtml = split_relationsView.worldlineDiscoveriesHtml;
export const renderRelations = split_relationsView.renderRelations;


