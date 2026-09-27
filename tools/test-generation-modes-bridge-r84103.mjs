import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构清单 C-4：生成层按玩法登记。r84.103 睡前故事，r84.104 前世今生，r84.105 时间故事，r84.106 印象曲，r84.107 出行路线，r84.108 邮箱，r84.109 他的物品，r84.110 他的房间，r84.111 蝴蝶效应，r84.112 关系，r84.113 日历，r84.114 私人终端，r84.115 陈列柜，r84.116 成就库，r84.117 结局，r84.118 ADV，r84.119 相簿，r84.120 HEART。
const bridgeText = fs.readFileSync(new URL('../src/generation/modesBridge.js', import.meta.url), 'utf8');
const NAMES = [...bridgeText.matchAll(/^export function (\w+)\(\.\.\.args\)/gm)].map(m => m[1]);

test('generation files no longer import bedtime, past lives, time stories, theme song, travel, inbox, items, room, butterfly, relations, calendar, phone, cabinet, achievements, ending, adv, album, or heart', () => {
  for (const file of fs.readdirSync(new URL('../src/generation/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(new URL(`../src/generation/${file}`, import.meta.url), 'utf8');
    assert.equal(/from '\.\.\/modes\/bedtime\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/pastLives\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/timeStories\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/themeSong\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/travel\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/inbox\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/items\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/room\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/butterfly\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/relations\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/calendar\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/phone\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/cabinet\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/achievements\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/ending\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/advEvent\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/album\.js'/.test(text), false, file);
    assert.equal(/from '\.\.\/modes\/heart\.js'/.test(text), false, file);
  }
  assert.deepEqual(NAMES, ['createBedtimePlan', 'validateBedtimePlan', 'bedtimePrompt', 'normalizeGeneratedBedtime', 'generateBedtime', 'projectBedtimeProgress', 'projectPastLivesProgress', 'generatePastLivesWithRepair', 'normalizePastLives', 'projectTimeStoriesProgress', 'generateTimeStoryWithRepair', 'normalizeTimeStories', 'createThemeSongPlan', 'validateThemeSongPlan', 'themeSongPrompt', 'normalizeGeneratedSong', 'generateThemeSong', 'projectThemeSongProgress', 'normalizeTravel', 'projectTravelProgress', 'fillTravelProse', 'generateTravelWithRepair', 'inboxPlan', 'inboxPrompt', 'normalizeInboxLetters', 'frozenInboxCharacterEvidence', 'generateInbox', 'projectInboxProgress', 'normalizePossessionNode', 'normalizeItems', 'fillItemsLines', 'generateItemsWithRepair', 'generateItemsIncrementalWithRepair', 'projectItemsProgress', 'roomNarrativeClaimsSharedHistory', 'roomNeedsSchemaUpgrade', 'normalizeRoom', 'projectRoomProgress', 'generateRoomWithRepair', 'refreshRoomFigure', 'generateRoomIncrementalWithRepair', 'ensureRoomLifePlan', 'renderRoom', 'preserveRoomLinkedContent', 'normalizeButterflyBranch', 'normalizeButterflyOmega', 'projectButterflyProgress', 'normalizeButterfly', 'fillButterflyProse', 'generateButterflyWithRepair', 'generateButterflyIncrementalWithRepair', 'normalizeRelations', 'fitRelationSettingEntries', 'relationsPrompt', 'mergeBudgetRetainedSettingRelations', 'archiveCharacterProfileKey', 'projectRelationsProgress', 'relationsViewIdentity', 'normalizeCalendar', 'storyCalendarDate', 'normalizeCalendarDate', 'mergeCalendarRefresh', 'projectCalendarProgress', 'calendarDayPage', 'calendarEntryPageKey', 'normalizeCalendarTags', 'normalizePhone', 'phoneHasMissingEntries', 'generatePhoneMissingWithRepair', 'generatePhoneIncrementalWithRepair', 'generatePhoneWithRepair', 'phoneCompletionSummary', 'projectPhoneProgress', 'phoneAppPrompt', 'assertPhoneReplacementPreservesRecords', 'normalizePhoneDraftApp', 'cabinetPrompt', 'normalizeCabinet', 'mergeCabinet', 'projectCabinetProgress', 'achievementsPrompt', 'normalizeAchievements', 'mergeAchievementsIncremental', 'generateAchievementsWithRepair', 'projectAchievementsProgress', 'endingRouteDetailPrompt', 'normalizeEndingRouteDetail', 'normalizeEndingConfessionReplays', 'normalizeEnding', 'generateEndingWithRepair', 'projectEndingProgress', 'endingOutlinePrompt', 'endingConfessionHintTest', 'advPrompt', 'normalizeEventList', 'normalizeEventCandidate', 'projectAdvProgress', 'normalizeAdv', 'generateAdvIndexWithRepair', 'generateAllAdvForSession', 'repairFailedAdvForSession', 'generateAdvForSelected', 'albumRelationshipScanPrompt', 'normalizeAlbumRelationshipSnapshot', 'albumCommentsPrompt', 'normalizeAlbumCommentsBatch', 'normalizeAlbumCategory', 'normalizeAlbumIndex', 'normalizeAlbum', 'generateAlbumWithRepair', 'albumIndexPrompt', 'projectAlbumProgress', 'heartCorePrompt', 'heartPostVoicePrompt', 'heartSeasonVoicePrompt', 'heartSeasonScenarioPrompt', 'heartStripsPrompt', 'heartDramaRelationshipOnlyContext', 'requestHeartPart', 'normalizeVoiceDramaPart', 'normalizeScenarioDramaPart', 'normalizeFireflyVoicesPart', 'normalizeHeartStripsPart', 'normalizeHeart', 'makeHeartShell', 'generateHeartSection', 'generateHeartFirefliesSection', 'generateHeartSeasonSection', 'generateHeartWithRepair', 'projectHeartProgress']);
});

test('in the real bundle every bedtime bridge function is the bedtime function', async () => {
  const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
  const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
  const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
  const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
  const N=m.namespace.N;
  const B = N['generation/modesBridge.js'];
  const home = N['modes/bedtime.js'];
  const memory = { chatId: 'c', archiveRevision: 'r', characterName: '岚', userName: '阿宁' };
  for (const name of NAMES) assert.equal(B.generationModesBridgeRegistered(name), true, name);
  const plan = home.createBedtimePlan({}, memory, null, 1000);
  assert.deepEqual(B.createBedtimePlan({}, memory, null, 1000), plan);
  assert.equal(B.bedtimePrompt(plan, memory, null), home.bedtimePrompt(plan, memory, null));
  assert.equal(B.projectBedtimeProgress({ segments: [], memoryBank: memory, context: {}, previousSession: null, operation: {} }), null);
  const lives = N['modes/pastLives.js'];
  assert.equal(B.projectPastLivesProgress({ segments: [] }), lives.projectPastLivesProgress({ segments: [] }));
  const stories = N['modes/timeStories.js'];
  assert.equal(B.projectTimeStoriesProgress({ segments: [] }), stories.projectTimeStoriesProgress({ segments: [] }));
  const song = N['modes/themeSong.js'];
  assert.equal(B.projectThemeSongProgress({ segments: [] }), song.projectThemeSongProgress({ segments: [] }));
  const travel = N['modes/travel.js'];
  assert.equal(B.projectTravelProgress({ segments: [] }), travel.projectTravelProgress({ segments: [] }));
  const inbox = N['modes/inbox.js'];
  assert.equal(B.projectInboxProgress({ segments: [] }), inbox.projectInboxProgress({ segments: [] }));
  const items = N['modes/items.js'];
  assert.equal(B.projectItemsProgress({ segments: [] }), items.projectItemsProgress({ segments: [] }));
  const room = N['modes/room.js'];
  assert.equal(B.projectRoomProgress({ segments: [] }), room.projectRoomProgress({ segments: [] }));
  const butterfly = N['modes/butterfly.js'];
  assert.equal(B.projectButterflyProgress({ segments: [] }), butterfly.projectButterflyProgress({ segments: [] }));
  const relations = N['modes/relations.js'];
  assert.equal(B.projectRelationsProgress({ segments: [] }), relations.projectRelationsProgress({ segments: [] }));
  const calendar = N['modes/calendar.js'];
  assert.equal(B.projectCalendarProgress({ segments: [] }), calendar.projectCalendarProgress({ segments: [] }));
  const phone = N['modes/phone.js'];
  assert.equal(B.projectPhoneProgress({ segments: [] }), phone.projectPhoneProgress({ segments: [] }));
  const cabinet = N['modes/cabinet.js'];
  assert.equal(B.projectCabinetProgress({ segments: [] }), cabinet.projectCabinetProgress({ segments: [] }));
  const achievements = N['modes/achievements.js'];
  assert.equal(B.projectAchievementsProgress({ segments: [] }), achievements.projectAchievementsProgress({ segments: [] }));
  const ending = N['modes/ending.js'];
  assert.equal(B.projectEndingProgress({ segments: [] }), ending.projectEndingProgress({ segments: [] }));
  assert.equal(B.ENDING_CONFESSION_HINT_RE.test('告白'), ending.ENDING_CONFESSION_HINT_RE.test('告白'));
  assert.equal(B.ENDING_CONFESSION_HINT_RE.test('普通天气'), ending.ENDING_CONFESSION_HINT_RE.test('普通天气'));
  const adv = N['modes/advEvent.js'];
  assert.equal(B.projectAdvProgress({ segments: [] }), adv.projectAdvProgress({ segments: [] }));
  const album = N['modes/album.js'];
  assert.equal(B.projectAlbumProgress({ segments: [] }), album.projectAlbumProgress({ segments: [] }));
  const heart = N['modes/heart.js'];
  assert.equal(B.projectHeartProgress({ segments: [] }), heart.projectHeartProgress({ segments: [] }));
});

test('an unregistered bedtime name fails loudly instead of guessing', async () => {
  const fresh = await import(new URL('../src/generation/modesBridge.js', import.meta.url).href + '?isolated-c4');
  assert.throws(() => fresh.createBedtimePlan(), /尚未登记/);
});
