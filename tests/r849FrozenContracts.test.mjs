import { r8411ContractSource } from './helpers/r8411SourceCompatibility.mjs';
// r84.10: authorized successor hashes only (src/core/constants.js, src/core/settings.js, src/generation/baibaiImage.js, src/generation/cgAppearance.js, src/generation/client.js, src/generation/imageGeneration.js, src/ui/cgPromptEditor.js, src/ui/settingsPanel.js).
// Baseline-normalized boundary checks and unchanged story recipes are separately pinned in r8410FrozenContracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>r8411ContractSource(p,fs.readFileSync(new URL(p,root),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const baseline={
  "archive": {
    "src/archive/backupStore.js": "2404ad8ba7ec7c51ab47f954eb43d412aad4861469a200d34798d87fcffc2faa",
    "src/archive/groups.js": "a3335a22757fa3d41b7df021450af44400da63a3c39757b6b98826efeaf48690",
    "src/archive/importRecovery.js": "491655e017e91e6101dbac9fe39518f19e0d413aa66e5c8a1cfc1fc005e07f03",
    "src/archive/memoryFileImport.js": "451c9bb6cd668becf542c0e9cd475ed92f7f76f9ad88ac86a7ab64fede09a0d4",
    "src/archive/memoryProviders.js": "1d248984e4a32c2f1967723913dfd1a79c39168769c5a3f1069197bceb90063c",
    "src/archive/repository.js": "422ccef055faad7f6adfe8fa8d021b9090776b1f89781827a2b57478f1af4be5",
    "src/archive/snapshots.js": "275442ddfba4b6c82e903375f1d077a743741ac5b2bd329ece7296f24999367f",
    "src/archive/sourceLedger.js": "8a59578d476210dc367b05ecfe422af35dd73ee5c3ffba485243b582bb880904"
  },
  "core": {
    "src/core/archiveCover.js": "aee42f10e264518fe992fe0130331b3eca11ec9a2ab45a80022604196fef53d4",
    "src/core/autoUpdatePolicy.js": "d4455e72db0d3e4386a42f26af8e27e074c05e5d9ad8b0f64be5395739655980",
    "src/core/autoUpdates.js": "f662ad3e9c30ab6ba245d21722358e2deff969fb456dd09fbecfb5d37d31a6fe",
    "src/core/backupDiagnostics.js": "7814d7cdb088258ee0a359ffaab9a9b01ce104002f937b3da0e51f4b4d0660a4",
    "src/core/butterflyContract.js": "30563b9d9a27c837416f7ed6cf1d047022961818c863746ea803120e5d298a7a",
    "src/core/butterflyLegacyRecovery.js": "af55b40d9a7fde894a74ad32a53ef24b44020e1c8e42606b4620f39bd45d3b15",
    "src/core/cache.js": "02b05d358dd4d4ade23aaa6060ee0bae78ff26ea928858baca28fb29e645c20e",
    "src/core/castLooks.js": "b30670aaf951716aed144a14249d8b4af54913a99d80cdc57f7a5cf9961e16b6",
    "src/core/cgImagePatch.js": "44b2570eee4644ddeb2d622831687c56eb037b11fc33a9a511545128eceef225",
    "src/core/chatReadRange.js": "6a41afed20eb6d8f1242eb2cc943e466f25c2612eea61a5612d75449a35ca3e2",
    "src/core/constants.js": "9b4b99486af420fcbd86d5cebe77c3efd7b9829e9caccffff367a437ce75115f",
    "src/core/context.js": "965d102dac0fa6b5589a679a02c4f96095c1d617ab34e630dd0abd27103ddc52",
    "src/core/contextTags.js": "893dc93ce75b737435f201c3b3d135fdafc242320c84601f116799adacca0a02",
    "src/core/creativeSupplement.js": "01d05dc346ec54f3221b2ff486ce31b57c458431cb3998cc5a2ea1ab146f8572",
    "src/core/deferredCommitStore.js": "a245c739bc8e869a393ffbad6522283cc7597d7d837925dff296143f1c7ed96b",
    "src/core/diagnosticReport.js": "72a18b9c26477c7de23a1d42ce31016d536c22fc616a877eeb7eb7739fc3b600",
    "src/core/dialogue.js": "4f0f0aba64c9051d1008a70c89b1ffda2c90ebadaa0bff7ef080dceab7bd59ae",
    "src/core/digest.js": "c75129141d4687c920d12adf6e7b25ce1d1ca436ba6d29a414ef18db3e8a9b37",
    "src/core/evidence.js": "c68df199006c048c1023580aa203671f07598e0be44e92adaaf6a8e9051fe08e",
    "src/core/heartLanguage.js": "b712c325e5644860d2c37ccddb5bf5c6763021ac47adba5324d9be46ae1233bd",
    "src/core/incremental.js": "efa99564e9324c1999bf64362a5b79aea26f27aa22644e834d7ae5d77e25564c",
    "src/core/independentApi.js": "0eab27d796fd7ef1fc31e834f4c053157b6401beb94e2c0457af1352e656eff5",
    "src/core/narrativeAuthority.js": "e03054faf79a46f309b853cf1dca229325a32e33518a276baf4f35181527f76a",
    "src/core/pastLivesContract.js": "a755afbb886fa32b95e301150dba86f265780527ce4283a249af7a60a03ffff7",
    "src/core/presentExpression.js": "5f0842b43c5c614ac72dfa272cd5180f31274c06ae7fa799ea343c721dfe9c13",
    "src/core/relationshipSafety.js": "80ce9298a03a0436bae52322f83f0472d5b0e6d8ea0b83c9a5bf945d60f803da",
    "src/core/requestCoordinator.js": "7e925db79bc6ed2ff302f0d3f5a42e44c53e5c3a3a2e954c3c4396b957addd5c",
    "src/core/selfUpdater.js": "bc74bad78441c7220f005e3fd0965185cd668b9c1a677916b411488eb19bfbfd",
    "src/core/settings.js": "d7583337d6f643061686fc15b78658cd5b91bfaf91f3e90d21e716d567332b89",
    "src/core/state.js": "b4b6322455b3b0fca7afebceadd49d0b815ea3e7af9e10b94532cdb2f816f7ef",
    "src/core/taskTrace.js": "301ce85ad70444e53cc2d5025f5c4d9a2ad811a2da12bdb142df766cbb65246f",
    "src/core/text.js": "5643200fcebbafe719bf71fbd1482cc15bb72b01ae4ed8391740fb966f239848",
    "src/core/timeStoriesContract.js": "d19635e1ec646f4cfd4534b9390c9cf73d99691e5a5bbc1593d9b622bf55f5aa",
    "src/core/worldPresentation.js": "812649836fe62772d0470928c8d0ef0cbb343e66ec5fbc53eab87f5b55ff35d0"
  },
  "generation": {
    "src/generation/baibaiImage.js": "5acd34a34a3fb7f1a1540c8b6a6ff7cdf077aefc0fa08d704edd45ee59f50b56",
    "src/generation/cgAppearance.js": "071fed2e0e3cd79d8af7b8d13826a16be4fb61bcf18c5fa8a8c5696a25948232",
    "src/generation/client.js": "6111e619253590d94ac8427b80769117aa2a1d736c936ad37a4f8c80ff6770bc",
    "src/generation/contentRegeneration.js": "0cf1da4bec10a12859966f1491438cb8acac0367b40d1ad8c65a00ec6030c43c",
    "src/generation/imageGeneration.js": "9c36585d2fc8685b0d2be9ee5b40bcfe5c0e6bc8a4179e19a31cc8abb5068589",
    "src/generation/jsonParser.js": "bf79af499283c40a53f6fc5b2d3e0e6860d0d1cce73b224857d8deee505e5d7a",
    "src/generation/normalizers.js": "5e23dc73d0b6c6b873f1a49768521b05218b11912ae2b84bb80e456d5c12e18e",
    "src/generation/prompts.js": "70a615e2af5dd680e80ba7b06f7ad502cffacf4a8c4d9ed22ea67039c3a5ff25",
    "src/generation/recovery.js": "53bbf72c1a3fa7563c75df3e286d1f5d2e204fa59fff342a01387aa5496b7297"
  },
  "heartbeatMemories.js": {
    "src/heartbeatMemories.js": "44491555ce353ab61195dea2b6a3b6eb133abb539bd4c0deb0270b9b528c6e53"
  },
  "modes": {
    "src/modes/achievements.js": "662adfde6cb2d900fe0d617032d096d8e79092a4a003a558292a853dc0e87437",
    "src/modes/advEvent.js": "a82e1c62f024c944acfefaf5e3722ae3558056eb2aee49b29329e414da76d5d0",
    "src/modes/advEventView.js": "7a0e1dd4ed494ff54409b60d4c8621cbf7e59043287ece470ec67d32e97d8a75",
    "src/modes/album.js": "c753abb5999de0bebca64a5a6d80ebd4723f527654a4eff8551369c1cff57242",
    "src/modes/albumView.js": "51c715276c7c77819986ddb07f05564dde2530698e1dc71e32d100f57a584f4d",
    "src/modes/archiveAvatars.js": "39165063c1d8f6cdbef116d99d97363866c68d9d049f89220d1c4aa53ff25d86",
    "src/modes/archivePortal.js": "88005c53634a233a49381298a9b3a0bbac6c95eed6ebfd28d6a17a4edb6f6d3f",
    "src/modes/butterfly.js": "f20e972e7493ad1ee82355bedad54b9f4147ad5227a4be9885105f68776eec3b",
    "src/modes/butterflyView.js": "4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a",
    "src/modes/cabinet.js": "6c6e0cf80743a7fd060d6d78abb041f0a26a87b78c62862303a044cb025701bc",
    "src/modes/calendar.js": "e6c0aecb100ad989839d162408ea22161a80ef3b1644d4d380e097420b74110b",
    "src/modes/calendarView.js": "a10e8ea4fb32129528600cc6a5a051776309732214c17914e1304cd7a662e0ea",
    "src/modes/cgImageViewer.js": "90a26ef9da746a60a472c36b09f7ced4fff651877db84633d67f47d69707ff3a",
    "src/modes/cgPromptEditor.js": "780f4658146c1fbfb3ae34993758f4d35d3d226775f40f2177289204b8bf4ddd",
    "src/modes/contentManager.js": "39ab1dfafd1bcb41982f12f4c7bf8ce207c8f3927a54493c81d6e3eb032ba3d6",
    "src/modes/ending.js": "b074a159a3859202b5d769fe402c028ad946d4c1b7fc7d9a94d989d811f50fa5",
    "src/modes/endingView.js": "0c5f3f1cacb584fe55bd349bb6858a6d1c32fa370c6c705f89cc7f73c63ae000",
    "src/modes/floatingArchive.js": "91714d8dba491354bced204fa5af34c2cc7ca84333e4f01daa1405ee6317de84",
    "src/modes/floatingAvatarButton.js": "7c159891006d1544738f6150cf38c39ef3900a08eda5cc33484cc9817e9ee5b5",
    "src/modes/heart.js": "b03a8d8469948a03cd975d7d9aaba801cfeb1fa0301afa67bea3ff84410eda37",
    "src/modes/heartView.js": "6cfd03c4cc20c3bbfe7bb0e4f8d7b0f734b0c345023b32b6fb51531cccc0af3c",
    "src/modes/homeView.js": "29a027dc059d270e484913d58afdbaa5e4c7bf90dc2f824f9451a0fcc72646cb",
    "src/modes/immersionStyles.js": "0673a48498a355c64a9d1d16646ea560b2cf62399aa5032e9214e68be7155b13",
    "src/modes/inbox.js": "d39c4bafac0062f17af64f8ab6a7c13aeef2da0d49f975769edabbee77ddf269",
    "src/modes/inboxStyles.js": "a49b6ffca06aae7f5d8656a1ddab24df3a91a1f79a8b7b2bb3e243a7460c428d",
    "src/modes/inboxView.js": "07e7f27d4c0c6e6346d6986db1d534cf1e235f268ebbc5ce2c49826ad3a712c1",
    "src/modes/items.js": "c9ef5566a788c889a05e8bbbbb737c7656e6b07cc76efb0759952e752faebefa",
    "src/modes/navigationBookmark.js": "832ccce86f3b85bcaedca68611fe9e4c8f928e9bbf5e89c53e74e2f5e801da37",
    "src/modes/overlay.js": "37013bebe20011b06ad9976aa2433fb0eab05eba6a5883efaf52e73b649b62c5",
    "src/modes/pastLives.js": "8351ee6132b8c186852c2a8dda096899a54957f35b1cde4c690f990744305377",
    "src/modes/pastLivesView.js": "b6bc3aef8a92c1f595adaeee96b440019e4e208b1e4843b01462ffea8fda9dbf",
    "src/modes/phone.js": "e28da23932999f6ef1e73855e00994abd310c3eeacd62572b6f8bedaf9bf2c02",
    "src/modes/phoneView.js": "2e33b6b100d92d1c654b7d5317cd6748605c7b60316d04180c01731876fadad7",
    "src/modes/readingStyles.js": "476b2fc2bacd8292f47f0744c4840c7b2d3c753794a6aa3e82b25dcc19394453",
    "src/modes/recoveryView.js": "b7dc6ed7255e4a713b3df17dc084d36a709e287e11363747499d6081ee95c9e5",
    "src/modes/relations.js": "4e9255c308ad0911cd96e2b6f7819cf377f90450915fdd54b9f4ad66a518dc01",
    "src/modes/settingsPanel.js": "a7c4c4c34a0e13f0aeca1aa0632404a50cf4a281baacbae03a13cbf109a6b2bd",
    "src/modes/styles.js": "520fe4f9732c08a4ae6ad01d7aaa8a9be59effc264d716d0d41b67c71305ae08",
    "src/modes/themeSurfaces.js": "bd2a8e1aa9e968f98e9a6e64d58161398413601a0bd6182c87a8dda419baad1d",
    "src/modes/timeStories.js": "0bee7d84698ec5c93c01b468a3826f93444dcc51aee4d6ecdf0036f3a9145127",
    "src/modes/timeStoriesView.js": "db2d646ccb0a39ce2bf22b4bd916c53a160ce849c9440a7bd6a97c0ef3f1494c",
    "src/modes/travel.js": "231b6d322bbb184773eb3156cd2f1628e66fc47ebf96ed3373fd0bdb47a77340",
    "src/modes/travelView.js": "913a6b3fa82d698c5656df8dcfda93b3c1de74156521537129e3515da32a5e04"
  },
  "ui": {
    "src/ui/archiveAvatars.js": "39165063c1d8f6cdbef116d99d97363866c68d9d049f89220d1c4aa53ff25d86",
    "src/ui/butterflyView.js": "4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a",
    "src/ui/calendarView.js": "a10e8ea4fb32129528600cc6a5a051776309732214c17914e1304cd7a662e0ea",
    "src/ui/cgImageViewer.js": "90a26ef9da746a60a472c36b09f7ced4fff651877db84633d67f47d69707ff3a",
    "src/ui/cgPromptEditor.js": "e8f0e5f61deeb97a657d9a2a349f6da8d530a6de9f846af244039c249031a6b7",
    "src/ui/floatingAvatarButton.js": "7c159891006d1544738f6150cf38c39ef3900a08eda5cc33484cc9817e9ee5b5",
    "src/ui/immersionStyles.js": "0673a48498a355c64a9d1d16646ea560b2cf62399aa5032e9214e68be7155b13",
    "src/ui/inboxStyles.js": "a49b6ffca06aae7f5d8656a1ddab24df3a91a1f79a8b7b2bb3e243a7460c428d",
    "src/ui/inboxView.js": "07e7f27d4c0c6e6346d6986db1d534cf1e235f268ebbc5ce2c49826ad3a712c1",
    "src/ui/pastLivesView.js": "b6bc3aef8a92c1f595adaeee96b440019e4e208b1e4843b01462ffea8fda9dbf",
    "src/ui/phoneView.js": "2d2ec0dfabf786fb13f455a1dd67639ee230758898a9a64483465b2ab57ff17c",
    "src/ui/readingStyles.js": "476b2fc2bacd8292f47f0744c4840c7b2d3c753794a6aa3e82b25dcc19394453",
    "src/ui/recoveryView.js": "b7dc6ed7255e4a713b3df17dc084d36a709e287e11363747499d6081ee95c9e5",
    "src/ui/settingsPanel.js": "f73bba0c5de7bd87e5c44353788231943c9bd17e75d5e0e542b35a2603cb8f1d",
    "src/ui/themeSurfaces.js": "bd2a8e1aa9e968f98e9a6e64d58161398413601a0bd6182c87a8dda419baad1d",
    "src/ui/timeStoriesView.js": "db2d646ccb0a39ce2bf22b4bd916c53a160ce849c9440a7bd6a97c0ef3f1494c",
    "src/ui/travelView.js": "913a6b3fa82d698c5656df8dcfda93b3c1de74156521537129e3515da32a5e04"
  }
};
for(const [group,files] of Object.entries(baseline)) test(`UI scope: ${group} / ${Object.keys(files).length} production files frozen (authorized r84.10 updates)`,()=>{
 for(const [path,expected] of Object.entries(files)) assert.equal(sha(read(path)),expected,path);
});
function roomWithoutView(s){s=s.replace("import * as room_interior from '../ui/roomInterior.js';\n",'');const a=s.indexOf('export function renderRoom()'),z=s.indexOf('export function roomSelectSpace',a);return s.slice(0,a)+s.slice(z)}
test('room change is strictly the view: all generation/prompt/normalizer/deep handlers match baseline',()=>assert.equal(sha(roomWithoutView(read('src/modes/room.js'))),'fc244a32940d693a28c6e17d00c46a2209d2bd5c70ebec95b40712f3f38ae6f2'));
test('archive library change is strictly a render hook',()=>{
 const s=read('src/archive/library.js').replace("import * as workspace_ui from '../ui/workspace.js';\n",'').replace('    workspace_ui.arrangeArchiveWorkspace(body, { portals, ready: true, snapshot });\n\n','');
 assert.equal(sha(s),'20acebc24fc9eb3f809c0010d6ae83bb6cf495ed21937bad7d50d38128e15d5c');
});
test('theme palette rules unchanged; only a local dark-state attribute was added',()=>{
 assert.equal(sha(read('src/core/theme.js').replace('    element.dataset.rmtThemeDark = String(dark);\n','')),'6d4ec9e994d0949a7cb32d636b8de5e1fb0206257ee8740193922ba74f23e993');
});
test('bootstrap unchanged except version and cache identity; no new startup work',()=>{
 assert.equal(sha(read('index.js').replace("const VERSION = '0.8.86';","const VERSION = '0.8.84';").replace("const BUILD = '0.8.86-tt-cg-r84.10-reader-cg';","const BUILD = '0.8.84-tt-cg-r84.8-actual-count';")),'028b4a5e13177169c2dda79651af87d2d45b5cb87e60292fb2029ae1f7a0d7a4');
});
function fn(s,n){const m=new RegExp('^export (?:async )?function '+n+'\\(','m').exec(s);assert.ok(m);const start=m.index,offset=start+m[0].length;const next=/^(?:export )?(?:async )?function /m.exec(s.slice(offset));return s.slice(start,next?offset+next.index:undefined)}
for(const [name,hash] of Object.entries({"confirmExplicitAction": "ac21568fba308ffd9e0aafbf7710928f473df5e7eee6d37ddee8e0430a8f62f6", "confirmExplicitActionTwice": "d90ae3ed3c60053cc5eb53f7ff09e8eb2a19cf0def01ebcaf4838564689647f3", "confirmModeRegeneration": "b083831ded0ff161d3027493a83435852469f39a5e22713b02db94649b109b4c", "confirmRoomLifeRefresh": "8c0cc9d1268c0657477d41fb7546c97643ed4351f478b10d58b09bf81fb79acd", "requestCurrentArchiveImport": "21282e759a7c4662ad9440eaf6d1aac9525da27228174a175e8861e31ac87cfc", "requestCurrentArchiveFullRebuild": "5bc1c0656c48644fb581d4ee95c85de7a2794c68f741d09b09054a554d7fa06c", "decorateReadOnlyModeUi": "d626a266c29c1bcfce6dbbe4e010e2f7d899367c59b9af630f805dfc98208642"})) test('original UI protection remains: '+name,()=>assert.equal(sha(fn(read('src/ui/overlay.js'),name)),hash));
test('new workspace code cannot initiate fetch, provider generation or archive persistence',()=>{
 for(const file of ['workspace.js','workspaceState.js','languageView.js','albumCategory.js','roomInterior.js','workspaceStyles.js']) {
  const s=read('src/ui/'+file);
  assert.doesNotMatch(s,/\bfetch\s*\(|requestValidatedSegment\s*\(|generateMode\s*\(|\.saveSession\s*\(|commitSessionMutation\s*\(/,file);
 }
});
test('runtime output is embedded styles and no external stylesheet dependency',()=>{
 assert.ok(!fs.existsSync(new URL('dist/heartbeatMemories.bundle.css',root)));
 const bundle=read('dist/heartbeatMemories.bundle.js');assert.doesNotMatch(bundle,/heartbeatMemories\.bundle\.css|createElement\(['"]link['"]\)/);
});
test('manifest and bootstrap declare one matching r84.10 build',()=>{
 const m=JSON.parse(read('manifest.json'));assert.equal(m.version,'0.8.86');assert.equal(m.js,'index.js?heartbeat=0.8.86-tt-cg-r84.10-reader-cg');assert.match(read('index.js'),/const BUILD = '0\.8\.86-tt-cg-r84\.10-reader-cg'/);
});

test('content manager original data contract: managementTargetsForSession',()=>assert.equal(sha(fn(read('src/ui/contentManager.js'),'managementTargetsForSession')),'3d0b5ae5ee9fba30e4b22181ec0bbf8ac2686de42a02ccfed5cb0c43f9ca2f2d'));

test('content manager original data contract: resumeContentRegeneration',()=>assert.equal(sha(fn(read('src/ui/contentManager.js'),'resumeContentRegeneration')),'8b87a2a114ca9fe3fd5fccf254e507d6758b30a350dc06f4d5155001ce7f9b70'));

test('single-item generation logic unchanged except non-hijacking UI completion guard',()=>{
 const s=fn(read('src/ui/contentManager.js'),'runContentRegeneration')
 .replace('    const startedUiEpoch = ui_workspaceState.workspace.epoch;\n    const startedUiRoute = ui_workspaceState.workspace.route;\n','')
 .replace('if (ui_overlay.bodyEl() && runtimeState.contentManagerOpen && startedUiEpoch === ui_workspaceState.workspace.epoch && startedUiRoute === ui_workspaceState.workspace.route) renderContentManager();','if (ui_overlay.bodyEl()) renderContentManager();');
 assert.equal(sha(s),'d17c2c26da2a2cad0ea0a52df88c72e1ec6476797abae5c1c31882920eeb9d03');
});
