import * as split_phoneBasics from './phoneBasics.js';
import * as split_phoneEvidence from './phoneEvidence.js';
import * as split_phonePrompts from './phonePrompts.js';
import * as split_phoneData from './phoneData.js';
import * as split_phoneIncrement from './phoneIncrement.js';
import * as split_phoneGeneration from './phoneGeneration.js';
import * as core_modesBridge from '../core/modesBridge.js';
import * as generation_modesBridge from '../generation/modesBridge.js';
// 以下导出已搬到 modes/phoneBasics.js、modes/phoneEvidence.js、modes/phonePrompts.js、modes/phoneData.js、modes/phoneIncrement.js、modes/phoneGeneration.js，这里原样转发，调用方不用改。
export const PHONE_COMMUNICATION_REPAIR_CONTRACT = split_phoneBasics.PHONE_COMMUNICATION_REPAIR_CONTRACT;
export const PHONE_LIFESTYLE_REPAIR_CONTRACT = split_phoneBasics.PHONE_LIFESTYLE_REPAIR_CONTRACT;
export const normalizePhoneUiProfile = split_phoneBasics.normalizePhoneUiProfile;
export const normalizePhoneAppKind = split_phoneBasics.normalizePhoneAppKind;
export const normalizePhoneAppIcon = split_phoneBasics.normalizePhoneAppIcon;
export const migrateLegacyPhoneSession = split_phoneData.migrateLegacyPhoneSession;
export const phoneConversationOwnerName = split_phoneBasics.phoneConversationOwnerName;
export const phoneControlledOwnerNames = split_phoneEvidence.phoneControlledOwnerNames;
export const normalizePhoneChatEntry = split_phoneData.normalizePhoneChatEntry;
export const inferPhoneContactName = split_phoneEvidence.inferPhoneContactName;
export const normalizePhoneConversationMessages = split_phoneEvidence.normalizePhoneConversationMessages;
export const assertPhoneReplacementPreservesRecords = split_phoneEvidence.assertPhoneReplacementPreservesRecords;
export const compactPhoneRoomContext = split_phonePrompts.compactPhoneRoomContext;
export const phonePlanPrompt = split_phonePrompts.phonePlanPrompt;
export const normalizePhonePlan = split_phoneData.normalizePhonePlan;
export const phoneAppPrompt = split_phonePrompts.phoneAppPrompt;
export const validatePhoneAppPart = split_phoneData.validatePhoneAppPart;
export const normalizePhoneDraftApp = split_phoneData.normalizePhoneDraftApp;
export const projectPhoneProgress = split_phoneIncrement.projectPhoneProgress;
export const generatePhoneWithRepair = split_phoneGeneration.generatePhoneWithRepair;
export const phoneHasMissingEntries = split_phoneData.phoneHasMissingEntries;
export const phoneCompletionSummary = split_phoneData.phoneCompletionSummary;
export const mergePhoneMissingEntries = split_phoneData.mergePhoneMissingEntries;
export const phoneMissingThreadPlan = split_phonePrompts.phoneMissingThreadPlan;
export const generatePhoneMissingWithRepair = split_phoneGeneration.generatePhoneMissingWithRepair;
export const compactPhoneExisting = split_phonePrompts.compactPhoneExisting;
export const phoneIncrementPlanPrompt = split_phonePrompts.phoneIncrementPlanPrompt;
export const normalizePhoneIncrementPlan = split_phoneIncrement.normalizePhoneIncrementPlan;
export const phoneEntryKey = split_phoneIncrement.phoneEntryKey;
export const mergePhoneIncremental = split_phoneIncrement.mergePhoneIncremental;
export const generatePhoneIncrementalWithRepair = split_phoneGeneration.generatePhoneIncrementalWithRepair;
export const normalizePhone = split_phoneData.normalizePhone;

// 重构清单 C-3（r84.98）：把 core 层要用的函数登记到 core/modesBridge.js（core 不再 import 本文件）。
core_modesBridge.registerModesBridge({ normalizePhonePlan, normalizePhoneDraftApp, migrateLegacyPhoneSession });
// 重构清单 C-4（r84.114）：把生成层要用的函数登记到 generation/modesBridge.js（生成层不再 import 本文件）。
generation_modesBridge.registerGenerationModesBridge({ normalizePhone, phoneHasMissingEntries, generatePhoneMissingWithRepair, generatePhoneIncrementalWithRepair, generatePhoneWithRepair, phoneCompletionSummary, projectPhoneProgress, phoneAppPrompt, assertPhoneReplacementPreservesRecords, normalizePhoneDraftApp });
