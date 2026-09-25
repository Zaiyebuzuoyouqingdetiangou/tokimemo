import * as split_settingsPanelParts from './settingsPanelParts.js';
import * as split_settingsPanelHome from './settingsPanelHome.js';
// 以下导出已搬到 ui/settingsPanelParts.js、ui/settingsPanelHome.js，这里原样转发，调用方不用改。
export const SETTINGS_LAUNCHER_ID = split_settingsPanelParts.SETTINGS_LAUNCHER_ID;
export const clearHomeSettingsPanel = split_settingsPanelHome.clearHomeSettingsPanel;
export const refreshImageGenerationSettingsUi = split_settingsPanelParts.refreshImageGenerationSettingsUi;
export const voiceSettingsHtml = split_settingsPanelParts.voiceSettingsHtml;
export const chatReadingSettingsHtml = split_settingsPanelParts.chatReadingSettingsHtml;
export const bindImageProviderEvents = split_settingsPanelParts.bindImageProviderEvents;
export const unbindImageProviderEvents = split_settingsPanelParts.unbindImageProviderEvents;
export const refreshMemoryIngressUi = split_settingsPanelHome.refreshMemoryIngressUi;
export const refreshModelOptions = split_settingsPanelParts.refreshModelOptions;
export const refreshManualModelOptions = split_settingsPanelParts.refreshManualModelOptions;
export const refreshGenerationSettingsUi = split_settingsPanelParts.refreshGenerationSettingsUi;
export const hydrateSettingsPanel = split_settingsPanelHome.hydrateSettingsPanel;
export const refreshSettingsTaskStatus = split_settingsPanelParts.refreshSettingsTaskStatus;
export const refreshSettingsMemoryStatus = split_settingsPanelParts.refreshSettingsMemoryStatus;
export const mountSettings = split_settingsPanelHome.mountSettings;


