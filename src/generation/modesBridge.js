// 重构清单 C-4（r84.103）：生成层不再直接 import 玩法层。按玩法分轮。
// 睡前故事（r84.103）、前世今生（r84.104）、时间故事（r84.105）、印象曲（r84.106）、出行路线（r84.107）、邮箱（r84.108）、他的物品（r84.109）、他的房间（r84.110）、蝴蝶效应（r84.111）、关系（r84.112）、日历（r84.113）、私人终端（r84.114）、陈列柜（r84.115）、成就库（r84.116）、结局（r84.117）、ADV（r84.118）、相簿（r84.119）、HEART（r84.120）由各自的 modes 文件加载时登记，生成层调用时按名字转过去。
// 还没登记就被调用，说明加载顺序出了问题，直接报错，不猜默认值。
const hooks = Object.create(null);

export function registerGenerationModesBridge(entries = {}) {
    for (const [name, fn] of Object.entries(entries)) if (typeof fn === 'function') hooks[name] = fn;
}

export function generationModesBridgeRegistered(name) { return typeof hooks[name] === 'function'; }

function call(name, args) {
    const fn = hooks[name];
    if (!fn) throw new Error(`心迹回廊内部错误：玩法函数 ${name} 尚未登记`);
    return fn(...args);
}

export function createBedtimePlan(...args) { return call('createBedtimePlan', args); }

export function validateBedtimePlan(...args) { return call('validateBedtimePlan', args); }

export function bedtimePrompt(...args) { return call('bedtimePrompt', args); }

export function normalizeGeneratedBedtime(...args) { return call('normalizeGeneratedBedtime', args); }

export function generateBedtime(...args) { return call('generateBedtime', args); }

export function projectBedtimeProgress(...args) { return call('projectBedtimeProgress', args); }

export function projectPastLivesProgress(...args) { return call('projectPastLivesProgress', args); }

export function generatePastLivesWithRepair(...args) { return call('generatePastLivesWithRepair', args); }

export function normalizePastLives(...args) { return call('normalizePastLives', args); }

export function projectTimeStoriesProgress(...args) { return call('projectTimeStoriesProgress', args); }

export function generateTimeStoryWithRepair(...args) { return call('generateTimeStoryWithRepair', args); }

export function normalizeTimeStories(...args) { return call('normalizeTimeStories', args); }

export function createThemeSongPlan(...args) { return call('createThemeSongPlan', args); }

export function validateThemeSongPlan(...args) { return call('validateThemeSongPlan', args); }

export function themeSongPrompt(...args) { return call('themeSongPrompt', args); }

export function normalizeGeneratedSong(...args) { return call('normalizeGeneratedSong', args); }

export function generateThemeSong(...args) { return call('generateThemeSong', args); }

export function projectThemeSongProgress(...args) { return call('projectThemeSongProgress', args); }

export function normalizeTravel(...args) { return call('normalizeTravel', args); }

export function projectTravelProgress(...args) { return call('projectTravelProgress', args); }

export function fillTravelProse(...args) { return call('fillTravelProse', args); }

export function generateTravelWithRepair(...args) { return call('generateTravelWithRepair', args); }

export function inboxPlan(...args) { return call('inboxPlan', args); }

export function inboxPrompt(...args) { return call('inboxPrompt', args); }

export function normalizeInboxLetters(...args) { return call('normalizeInboxLetters', args); }

export function frozenInboxCharacterEvidence(...args) { return call('frozenInboxCharacterEvidence', args); }

export function generateInbox(...args) { return call('generateInbox', args); }

export function projectInboxProgress(...args) { return call('projectInboxProgress', args); }

export function normalizePossessionNode(...args) { return call('normalizePossessionNode', args); }

export function normalizeItems(...args) { return call('normalizeItems', args); }

export function fillItemsLines(...args) { return call('fillItemsLines', args); }

export function generateItemsWithRepair(...args) { return call('generateItemsWithRepair', args); }

export function generateItemsIncrementalWithRepair(...args) { return call('generateItemsIncrementalWithRepair', args); }

export function projectItemsProgress(...args) { return call('projectItemsProgress', args); }

export function roomNarrativeClaimsSharedHistory(...args) { return call('roomNarrativeClaimsSharedHistory', args); }

export function roomNeedsSchemaUpgrade(...args) { return call('roomNeedsSchemaUpgrade', args); }

export function normalizeRoom(...args) { return call('normalizeRoom', args); }

export function projectRoomProgress(...args) { return call('projectRoomProgress', args); }

export function generateRoomWithRepair(...args) { return call('generateRoomWithRepair', args); }

export function refreshRoomFigure(...args) { return call('refreshRoomFigure', args); }

export function generateRoomIncrementalWithRepair(...args) { return call('generateRoomIncrementalWithRepair', args); }

export function ensureRoomLifePlan(...args) { return call('ensureRoomLifePlan', args); }

export function renderRoom(...args) { return call('renderRoom', args); }

export function preserveRoomLinkedContent(...args) { return call('preserveRoomLinkedContent', args); }

export function normalizeButterflyBranch(...args) { return call('normalizeButterflyBranch', args); }

export function normalizeButterflyOmega(...args) { return call('normalizeButterflyOmega', args); }

export function projectButterflyProgress(...args) { return call('projectButterflyProgress', args); }

export function normalizeButterfly(...args) { return call('normalizeButterfly', args); }

export function fillButterflyProse(...args) { return call('fillButterflyProse', args); }

export function generateButterflyWithRepair(...args) { return call('generateButterflyWithRepair', args); }

export function generateButterflyIncrementalWithRepair(...args) { return call('generateButterflyIncrementalWithRepair', args); }

export function normalizeRelations(...args) { return call('normalizeRelations', args); }

export function fitRelationSettingEntries(...args) { return call('fitRelationSettingEntries', args); }

export function relationsPrompt(...args) { return call('relationsPrompt', args); }

export function mergeBudgetRetainedSettingRelations(...args) { return call('mergeBudgetRetainedSettingRelations', args); }

export function archiveCharacterProfileKey(...args) { return call('archiveCharacterProfileKey', args); }

export function projectRelationsProgress(...args) { return call('projectRelationsProgress', args); }

export function relationsViewIdentity(...args) { return call('relationsViewIdentity', args); }

export function normalizeCalendar(...args) { return call('normalizeCalendar', args); }

export function storyCalendarDate(...args) { return call('storyCalendarDate', args); }

export function normalizeCalendarDate(...args) { return call('normalizeCalendarDate', args); }

export function mergeCalendarRefresh(...args) { return call('mergeCalendarRefresh', args); }

export function projectCalendarProgress(...args) { return call('projectCalendarProgress', args); }

export function calendarDayPage(...args) { return call('calendarDayPage', args); }

export function calendarEntryPageKey(...args) { return call('calendarEntryPageKey', args); }

export function normalizeCalendarTags(...args) { return call('normalizeCalendarTags', args); }

export function normalizePhone(...args) { return call('normalizePhone', args); }

export function phoneHasMissingEntries(...args) { return call('phoneHasMissingEntries', args); }

export function generatePhoneMissingWithRepair(...args) { return call('generatePhoneMissingWithRepair', args); }

export function generatePhoneIncrementalWithRepair(...args) { return call('generatePhoneIncrementalWithRepair', args); }

export function generatePhoneWithRepair(...args) { return call('generatePhoneWithRepair', args); }

export function phoneCompletionSummary(...args) { return call('phoneCompletionSummary', args); }

export function projectPhoneProgress(...args) { return call('projectPhoneProgress', args); }

export function phoneAppPrompt(...args) { return call('phoneAppPrompt', args); }

export function assertPhoneReplacementPreservesRecords(...args) { return call('assertPhoneReplacementPreservesRecords', args); }

export function normalizePhoneDraftApp(...args) { return call('normalizePhoneDraftApp', args); }

export function cabinetPrompt(...args) { return call('cabinetPrompt', args); }

export function normalizeCabinet(...args) { return call('normalizeCabinet', args); }

export function mergeCabinet(...args) { return call('mergeCabinet', args); }

export function projectCabinetProgress(...args) { return call('projectCabinetProgress', args); }

export function achievementsPrompt(...args) { return call('achievementsPrompt', args); }

export function normalizeAchievements(...args) { return call('normalizeAchievements', args); }

export function mergeAchievementsIncremental(...args) { return call('mergeAchievementsIncremental', args); }

export function generateAchievementsWithRepair(...args) { return call('generateAchievementsWithRepair', args); }

export function projectAchievementsProgress(...args) { return call('projectAchievementsProgress', args); }

export function endingRouteDetailPrompt(...args) { return call('endingRouteDetailPrompt', args); }

export function normalizeEndingRouteDetail(...args) { return call('normalizeEndingRouteDetail', args); }

export function normalizeEndingConfessionReplays(...args) { return call('normalizeEndingConfessionReplays', args); }

export function normalizeEnding(...args) { return call('normalizeEnding', args); }

export function generateEndingWithRepair(...args) { return call('generateEndingWithRepair', args); }

export function projectEndingProgress(...args) { return call('projectEndingProgress', args); }

export function endingOutlinePrompt(...args) { return call('endingOutlinePrompt', args); }

export function endingConfessionHintTest(...args) { return call('endingConfessionHintTest', args); }

export const ENDING_CONFESSION_HINT_RE = { test(...args) { return endingConfessionHintTest(...args); } };

export function advPrompt(...args) { return call('advPrompt', args); }

export function normalizeEventList(...args) { return call('normalizeEventList', args); }

export function normalizeEventCandidate(...args) { return call('normalizeEventCandidate', args); }

export function projectAdvProgress(...args) { return call('projectAdvProgress', args); }

export function normalizeAdv(...args) { return call('normalizeAdv', args); }

export function generateAdvIndexWithRepair(...args) { return call('generateAdvIndexWithRepair', args); }

export function generateAllAdvForSession(...args) { return call('generateAllAdvForSession', args); }

export function repairFailedAdvForSession(...args) { return call('repairFailedAdvForSession', args); }

export function generateAdvForSelected(...args) { return call('generateAdvForSelected', args); }

export function albumRelationshipScanPrompt(...args) { return call('albumRelationshipScanPrompt', args); }

export function normalizeAlbumRelationshipSnapshot(...args) { return call('normalizeAlbumRelationshipSnapshot', args); }

export function albumCommentsPrompt(...args) { return call('albumCommentsPrompt', args); }

export function normalizeAlbumCommentsBatch(...args) { return call('normalizeAlbumCommentsBatch', args); }

export function normalizeAlbumCategory(...args) { return call('normalizeAlbumCategory', args); }

export function normalizeAlbumIndex(...args) { return call('normalizeAlbumIndex', args); }

export function normalizeAlbum(...args) { return call('normalizeAlbum', args); }

export function generateAlbumWithRepair(...args) { return call('generateAlbumWithRepair', args); }

export function albumIndexPrompt(...args) { return call('albumIndexPrompt', args); }

export function projectAlbumProgress(...args) { return call('projectAlbumProgress', args); }

export function heartCorePrompt(...args) { return call('heartCorePrompt', args); }

export function heartPostVoicePrompt(...args) { return call('heartPostVoicePrompt', args); }

export function heartSeasonVoicePrompt(...args) { return call('heartSeasonVoicePrompt', args); }

export function heartSeasonScenarioPrompt(...args) { return call('heartSeasonScenarioPrompt', args); }

export function heartStripsPrompt(...args) { return call('heartStripsPrompt', args); }

export function heartDramaRelationshipOnlyContext(...args) { return call('heartDramaRelationshipOnlyContext', args); }

export function requestHeartPart(...args) { return call('requestHeartPart', args); }

export function normalizeVoiceDramaPart(...args) { return call('normalizeVoiceDramaPart', args); }

export function normalizeScenarioDramaPart(...args) { return call('normalizeScenarioDramaPart', args); }

export function normalizeFireflyVoicesPart(...args) { return call('normalizeFireflyVoicesPart', args); }

export function normalizeHeartStripsPart(...args) { return call('normalizeHeartStripsPart', args); }

export function normalizeHeart(...args) { return call('normalizeHeart', args); }

export function makeHeartShell(...args) { return call('makeHeartShell', args); }

export function generateHeartSection(...args) { return call('generateHeartSection', args); }

export function generateHeartFirefliesSection(...args) { return call('generateHeartFirefliesSection', args); }

export function generateHeartSeasonSection(...args) { return call('generateHeartSeasonSection', args); }

export function generateHeartWithRepair(...args) { return call('generateHeartWithRepair', args); }

export function projectHeartProgress(...args) { return call('projectHeartProgress', args); }
