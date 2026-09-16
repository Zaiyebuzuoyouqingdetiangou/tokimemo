import { r8411ContractSource } from './helpers/r8411SourceCompatibility.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>r8411ContractSource(p,fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=v=>createHash('sha256').update(v).digest('hex');
// r84.9 original files are the source of these hashes; no skipped tests or new
// historical evidence exemptions. The reviewer pack contains the exact original ZIP.
const frozen={
  "src/heartbeatMemories.js": "44491555ce353ab61195dea2b6a3b6eb133abb539bd4c0deb0270b9b528c6e53",
  "src/generation/recovery.js": "53bbf72c1a3fa7563c75df3e286d1f5d2e204fa59fff342a01387aa5496b7297",
  "src/generation/jsonParser.js": "bf79af499283c40a53f6fc5b2d3e0e6860d0d1cce73b224857d8deee505e5d7a",
  "src/generation/contentRegeneration.js": "0cf1da4bec10a12859966f1491438cb8acac0367b40d1ad8c65a00ec6030c43c",
  "src/generation/normalizers.js": "5e23dc73d0b6c6b873f1a49768521b05218b11912ae2b84bb80e456d5c12e18e",
  "src/generation/prompts.js": "70a615e2af5dd680e80ba7b06f7ad502cffacf4a8c4d9ed22ea67039c3a5ff25",
  "src/archive/memoryFileImport.js": "451c9bb6cd668becf542c0e9cd475ed92f7f76f9ad88ac86a7ab64fede09a0d4",
  "src/archive/backupStore.js": "2404ad8ba7ec7c51ab47f954eb43d412aad4861469a200d34798d87fcffc2faa",
  "src/archive/snapshots.js": "275442ddfba4b6c82e903375f1d077a743741ac5b2bd329ece7296f24999367f",
  "src/archive/repository.js": "422ccef055faad7f6adfe8fa8d021b9090776b1f89781827a2b57478f1af4be5",
  "src/archive/memoryProviders.js": "1d248984e4a32c2f1967723913dfd1a79c39168769c5a3f1069197bceb90063c",
  "src/archive/groups.js": "a3335a22757fa3d41b7df021450af44400da63a3c39757b6b98826efeaf48690",
  "src/archive/sourceLedger.js": "8a59578d476210dc367b05ecfe422af35dd73ee5c3ffba485243b582bb880904",
  "src/archive/library.js": "c32f60ca232c16eb3a563e1c749d9c59469cc5f048061600ca7f7a8af8e480cd",
  "src/archive/importRecovery.js": "491655e017e91e6101dbac9fe39518f19e0d413aa66e5c8a1cfc1fc005e07f03",
  "src/core/dialogue.js": "4f0f0aba64c9051d1008a70c89b1ffda2c90ebadaa0bff7ef080dceab7bd59ae",
  "src/core/butterflyContract.js": "30563b9d9a27c837416f7ed6cf1d047022961818c863746ea803120e5d298a7a",
  "src/core/incremental.js": "efa99564e9324c1999bf64362a5b79aea26f27aa22644e834d7ae5d77e25564c",
  "src/core/state.js": "b4b6322455b3b0fca7afebceadd49d0b815ea3e7af9e10b94532cdb2f816f7ef",
  "src/core/timeStoriesContract.js": "d19635e1ec646f4cfd4534b9390c9cf73d99691e5a5bbc1593d9b622bf55f5aa",
  "src/core/contextTags.js": "893dc93ce75b737435f201c3b3d135fdafc242320c84601f116799adacca0a02",
  "src/core/archiveCover.js": "aee42f10e264518fe992fe0130331b3eca11ec9a2ab45a80022604196fef53d4",
  "src/core/autoUpdates.js": "f662ad3e9c30ab6ba245d21722358e2deff969fb456dd09fbecfb5d37d31a6fe",
  "src/core/diagnosticReport.js": "72a18b9c26477c7de23a1d42ce31016d536c22fc616a877eeb7eb7739fc3b600",
  "src/core/heartLanguage.js": "b712c325e5644860d2c37ccddb5bf5c6763021ac47adba5324d9be46ae1233bd",
  "src/core/cgImagePatch.js": "44b2570eee4644ddeb2d622831687c56eb037b11fc33a9a511545128eceef225",
  "src/core/selfUpdater.js": "bc74bad78441c7220f005e3fd0965185cd668b9c1a677916b411488eb19bfbfd",
  "src/core/butterflyLegacyRecovery.js": "af55b40d9a7fde894a74ad32a53ef24b44020e1c8e42606b4620f39bd45d3b15",
  "src/core/chatReadRange.js": "6a41afed20eb6d8f1242eb2cc943e466f25c2612eea61a5612d75449a35ca3e2",
  "src/core/worldPresentation.js": "812649836fe62772d0470928c8d0ef0cbb343e66ec5fbc53eab87f5b55ff35d0",
  "src/core/taskTrace.js": "301ce85ad70444e53cc2d5025f5c4d9a2ad811a2da12bdb142df766cbb65246f",
  "src/core/theme.js": "3d7e8b5426d9cb19c4d902199ae2d3c6e613671ec56400593d679ee16d18ae78",
  "src/core/relationshipSafety.js": "80ce9298a03a0436bae52322f83f0472d5b0e6d8ea0b83c9a5bf945d60f803da",
  "src/core/context.js": "965d102dac0fa6b5589a679a02c4f96095c1d617ab34e630dd0abd27103ddc52",
  "src/core/digest.js": "c75129141d4687c920d12adf6e7b25ce1d1ca436ba6d29a414ef18db3e8a9b37",
  "src/core/creativeSupplement.js": "01d05dc346ec54f3221b2ff486ce31b57c458431cb3998cc5a2ea1ab146f8572",
  "src/core/backupDiagnostics.js": "7814d7cdb088258ee0a359ffaab9a9b01ce104002f937b3da0e51f4b4d0660a4",
  "src/core/autoUpdatePolicy.js": "d4455e72db0d3e4386a42f26af8e27e074c05e5d9ad8b0f64be5395739655980",
  "src/core/cache.js": "02b05d358dd4d4ade23aaa6060ee0bae78ff26ea928858baca28fb29e645c20e",
  "src/core/castLooks.js": "b30670aaf951716aed144a14249d8b4af54913a99d80cdc57f7a5cf9961e16b6",
  "src/core/narrativeAuthority.js": "e03054faf79a46f309b853cf1dca229325a32e33518a276baf4f35181527f76a",
  "src/core/independentApi.js": "0eab27d796fd7ef1fc31e834f4c053157b6401beb94e2c0457af1352e656eff5",
  "src/core/evidence.js": "c68df199006c048c1023580aa203671f07598e0be44e92adaaf6a8e9051fe08e",
  "src/core/requestCoordinator.js": "7e925db79bc6ed2ff302f0d3f5a42e44c53e5c3a3a2e954c3c4396b957addd5c",
  "src/core/pastLivesContract.js": "a755afbb886fa32b95e301150dba86f265780527ce4283a249af7a60a03ffff7",
  "src/core/text.js": "5643200fcebbafe719bf71fbd1482cc15bb72b01ae4ed8391740fb966f239848",
  "src/core/presentExpression.js": "5f0842b43c5c614ac72dfa272cd5180f31274c06ae7fa799ea343c721dfe9c13",
  "src/core/deferredCommitStore.js": "a245c739bc8e869a393ffbad6522283cc7597d7d837925dff296143f1c7ed96b",
  "src/modes/travelView.js": "913a6b3fa82d698c5656df8dcfda93b3c1de74156521537129e3515da32a5e04",
  "src/modes/relations.js": "4e9255c308ad0911cd96e2b6f7819cf377f90450915fdd54b9f4ad66a518dc01",
  "src/modes/inbox.js": "d39c4bafac0062f17af64f8ab6a7c13aeef2da0d49f975769edabbee77ddf269",
  "src/modes/styles.js": "520fe4f9732c08a4ae6ad01d7aaa8a9be59effc264d716d0d41b67c71305ae08",
  "src/modes/overlay.js": "37013bebe20011b06ad9976aa2433fb0eab05eba6a5883efaf52e73b649b62c5",
  "src/modes/cgImageViewer.js": "90a26ef9da746a60a472c36b09f7ced4fff651877db84633d67f47d69707ff3a",
  "src/modes/cabinet.js": "6c6e0cf80743a7fd060d6d78abb041f0a26a87b78c62862303a044cb025701bc",
  "src/modes/endingView.js": "0c5f3f1cacb584fe55bd349bb6858a6d1c32fa370c6c705f89cc7f73c63ae000",
  "src/modes/room.js": "8ecf49c9cd1d82a849397f25d505519c99d2637d95550ffb3c9762d41038d1c7",
  "src/modes/album.js": "c753abb5999de0bebca64a5a6d80ebd4723f527654a4eff8551369c1cff57242",
  "src/modes/inboxStyles.js": "a49b6ffca06aae7f5d8656a1ddab24df3a91a1f79a8b7b2bb3e243a7460c428d",
  "src/modes/albumView.js": "51c715276c7c77819986ddb07f05564dde2530698e1dc71e32d100f57a584f4d",
  "src/modes/floatingArchive.js": "91714d8dba491354bced204fa5af34c2cc7ca84333e4f01daa1405ee6317de84",
  "src/modes/contentManager.js": "39ab1dfafd1bcb41982f12f4c7bf8ce207c8f3927a54493c81d6e3eb032ba3d6",
  "src/modes/inboxView.js": "07e7f27d4c0c6e6346d6986db1d534cf1e235f268ebbc5ce2c49826ad3a712c1",
  "src/modes/cgPromptEditor.js": "780f4658146c1fbfb3ae34993758f4d35d3d226775f40f2177289204b8bf4ddd",
  "src/modes/calendarView.js": "a10e8ea4fb32129528600cc6a5a051776309732214c17914e1304cd7a662e0ea",
  "src/modes/achievements.js": "662adfde6cb2d900fe0d617032d096d8e79092a4a003a558292a853dc0e87437",
  "src/modes/phone.js": "e28da23932999f6ef1e73855e00994abd310c3eeacd62572b6f8bedaf9bf2c02",
  "src/modes/items.js": "c9ef5566a788c889a05e8bbbbb737c7656e6b07cc76efb0759952e752faebefa",
  "src/modes/travel.js": "231b6d322bbb184773eb3156cd2f1628e66fc47ebf96ed3373fd0bdb47a77340",
  "src/modes/butterflyView.js": "4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a",
  "src/modes/floatingAvatarButton.js": "7c159891006d1544738f6150cf38c39ef3900a08eda5cc33484cc9817e9ee5b5",
  "src/modes/pastLives.js": "8351ee6132b8c186852c2a8dda096899a54957f35b1cde4c690f990744305377",
  "src/modes/timeStories.js": "0bee7d84698ec5c93c01b468a3826f93444dcc51aee4d6ecdf0036f3a9145127",
  "src/modes/advEventView.js": "7a0e1dd4ed494ff54409b60d4c8621cbf7e59043287ece470ec67d32e97d8a75",
  "src/modes/heart.js": "b03a8d8469948a03cd975d7d9aaba801cfeb1fa0301afa67bea3ff84410eda37",
  "src/modes/archiveAvatars.js": "39165063c1d8f6cdbef116d99d97363866c68d9d049f89220d1c4aa53ff25d86",
  "src/modes/ending.js": "b074a159a3859202b5d769fe402c028ad946d4c1b7fc7d9a94d989d811f50fa5",
  "src/modes/readingStyles.js": "476b2fc2bacd8292f47f0744c4840c7b2d3c753794a6aa3e82b25dcc19394453",
  "src/modes/immersionStyles.js": "0673a48498a355c64a9d1d16646ea560b2cf62399aa5032e9214e68be7155b13",
  "src/modes/calendar.js": "e6c0aecb100ad989839d162408ea22161a80ef3b1644d4d380e097420b74110b",
  "src/modes/themeSurfaces.js": "bd2a8e1aa9e968f98e9a6e64d58161398413601a0bd6182c87a8dda419baad1d",
  "src/modes/advEvent.js": "a82e1c62f024c944acfefaf5e3722ae3558056eb2aee49b29329e414da76d5d0",
  "src/modes/recoveryView.js": "b7dc6ed7255e4a713b3df17dc084d36a709e287e11363747499d6081ee95c9e5",
  "src/modes/butterfly.js": "f20e972e7493ad1ee82355bedad54b9f4147ad5227a4be9885105f68776eec3b",
  "src/modes/phoneView.js": "2e33b6b100d92d1c654b7d5317cd6748605c7b60316d04180c01731876fadad7",
  "src/modes/homeView.js": "29a027dc059d270e484913d58afdbaa5e4c7bf90dc2f824f9451a0fcc72646cb",
  "src/modes/timeStoriesView.js": "db2d646ccb0a39ce2bf22b4bd916c53a160ce849c9440a7bd6a97c0ef3f1494c",
  "src/modes/navigationBookmark.js": "832ccce86f3b85bcaedca68611fe9e4c8f928e9bbf5e89c53e74e2f5e801da37",
  "src/modes/settingsPanel.js": "a7c4c4c34a0e13f0aeca1aa0632404a50cf4a281baacbae03a13cbf109a6b2bd",
  "src/modes/heartView.js": "6cfd03c4cc20c3bbfe7bb0e4f8d7b0f734b0c345023b32b6fb51531cccc0af3c",
  "src/modes/pastLivesView.js": "b6bc3aef8a92c1f595adaeee96b440019e4e208b1e4843b01462ffea8fda9dbf",
  "src/modes/archivePortal.js": "88005c53634a233a49381298a9b3a0bbac6c95eed6ebfd28d6a17a4edb6f6d3f",
  "src/ui/travelView.js": "913a6b3fa82d698c5656df8dcfda93b3c1de74156521537129e3515da32a5e04",
  "src/ui/styles.js": "eb698b2d7c07d29debb9e46118fff9942b453657b7f2fd9099b51efe8d9c9ce5",
  "src/ui/cgImageViewer.js": "90a26ef9da746a60a472c36b09f7ced4fff651877db84633d67f47d69707ff3a",
  "src/ui/endingView.js": "5a0fd0ba9e2555e3816dd55e2ad7da87d80ca1370b15eaeb9dfe743ed65f92f4",
  "src/ui/albumCategory.js": "f8884f97c71a8837bf0f09c8e9f913c2b2a5c7b6b57c44b7d66e61e54e55d9fb",
  "src/ui/languageView.js": "94910168c9dcce9dac6a184c0d056fb486d3964cc080eb82ac34b4001aed247f",
  "src/ui/inboxStyles.js": "a49b6ffca06aae7f5d8656a1ddab24df3a91a1f79a8b7b2bb3e243a7460c428d",
  "src/ui/floatingArchive.js": "dafd16ccfb32dc6a30881c662483fc8d325b28ac7c8925c8bacf201e13d2b042",
  "src/ui/contentManager.js": "344097c10d532fd1b3992668a644706b3904239dda68fc7a7d465b1ca380b367",
  "src/ui/inboxView.js": "07e7f27d4c0c6e6346d6986db1d534cf1e235f268ebbc5ce2c49826ad3a712c1",
  "src/ui/calendarView.js": "a10e8ea4fb32129528600cc6a5a051776309732214c17914e1304cd7a662e0ea",
  "src/ui/butterflyView.js": "4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a",
  "src/ui/floatingAvatarButton.js": "7c159891006d1544738f6150cf38c39ef3900a08eda5cc33484cc9817e9ee5b5",
  "src/ui/archiveAvatars.js": "39165063c1d8f6cdbef116d99d97363866c68d9d049f89220d1c4aa53ff25d86",
  "src/ui/readingStyles.js": "476b2fc2bacd8292f47f0744c4840c7b2d3c753794a6aa3e82b25dcc19394453",
  "src/ui/immersionStyles.js": "0673a48498a355c64a9d1d16646ea560b2cf62399aa5032e9214e68be7155b13",
  "src/ui/roomInterior.js": "eb137818816599f4577ef3fffdaf891645c561f72788752c8a70d0b1b2013ece",
  "src/ui/themeSurfaces.js": "bd2a8e1aa9e968f98e9a6e64d58161398413601a0bd6182c87a8dda419baad1d",
  "src/ui/recoveryView.js": "b7dc6ed7255e4a713b3df17dc084d36a709e287e11363747499d6081ee95c9e5",
  "src/ui/phoneView.js": "2d2ec0dfabf786fb13f455a1dd67639ee230758898a9a64483465b2ab57ff17c",
  "src/ui/homeView.js": "4e2ae5f6fcb275fc2b0d4d17046086b87f772df42594cacb58d7b058f9e8bd33",
  "src/ui/timeStoriesView.js": "db2d646ccb0a39ce2bf22b4bd916c53a160ce849c9440a7bd6a97c0ef3f1494c",
  "src/ui/pastLivesView.js": "b6bc3aef8a92c1f595adaeee96b440019e4e208b1e4843b01462ffea8fda9dbf",
  "src/ui/archivePortal.js": "09303ba61ce4c09f805d0d28ecf63c843673d22793206ed05df7a6f855d2abf9"
};
for(const group of ['archive','core','generation','modes','ui'])test('r8410 untouched '+group+' production sources match r84.9 byte-for-byte',()=>{
 const rows=Object.entries(frozen).filter(([path])=>path.startsWith('src/'+group+'/'));assert.ok(rows.length);
 for(const [path,hash] of rows)assert.equal(sha(read(path)),hash,path);
});
const authorized={
  "src/core/constants.js": {
    "sha": "b1d0cff1a020bfc458f0410e228c6405bf082a355a35622a512ca0bea0079908",
    "changes": [
      {
        "old": "",
        "new": "    cgPromptFormat: 'nai5-natural',\n"
      }
    ]
  },
  "src/core/settings.js": {
    "sha": "69e04d677aef0a42bda3b2e4737d91272fb23a7d4b39195a0c91727385369b2b",
    "changes": [
      {
        "old": "",
        "new": "import * as cg_format from './cgPromptFormat.js';\n"
      },
      {
        "old": "",
        "new": "        cgPromptFormat: cg_format.normalizeCgPromptFormat(settings.cgPromptFormat, 'nai5-natural'),\n"
      }
    ]
  },
  "src/generation/client.js": {
    "sha": "dbf9ae1bde857e214a60975e60fbc3d601a8a84eae1ce2e947e5f6536f12d205",
    "changes": [
      {
        "old": "",
        "new": "import * as cg_policy from './cgPromptPolicy.js';\n"
      },
      {
        "old": "",
        "new": "    prompt = cg_policy.cgPromptForSegment(prompt, options);\n"
      },
      {
        "old": "    const operation = options.operation || { kind: 'mode', mode };\n",
        "new": "    const operation = cg_policy.cgRecoveryOperation(mode, options.operation || { kind: 'mode', mode }, existing,\n        options.cgPromptFormat || core_settings.getPluginSettings(context).cgPromptFormat);\n    cg_policy.bindCgPromptFormat(origin, operation.cgPromptFormat);\n"
      },
      {
        "old": "",
        "new": "    options = { ...options, cgPromptFormat: options.cgPromptFormat || core_settings.getPluginSettings(options.context || core_context.getContext()).cgPromptFormat };\n"
      }
    ]
  },
  "src/generation/baibaiImage.js": {
    "sha": "7e16a0bff41828d7823073b0718d8019967240b75203c4dc283ed9bc077918c1",
    "changes": [
      {
        "old": "",
        "new": "    const formatted = appearance.formattedCgProviderPrompts(visual, metadata, state.supportsCharacters);\n    if (formatted) {\n        request.prompt = formatted.prompt; request.nl = formatted.nl;\n        if (formatted.characters) request.characters = formatted.characters;\n        else delete request.characters;\n    }\n"
      }
    ]
  }
};
for(const [path,spec]of Object.entries(authorized))test('r8410 authorized CG-only hunks preserve original boundary: '+path,()=>{
 let source=read(path);for(const patch of [...spec.changes].reverse()){
  assert.ok(patch.new && source.includes(patch.new),path+' exact authorized hunk missing');source=source.replace(patch.new,patch.old);
 }assert.equal(sha(source),spec.sha,path+' unrelated change');
});
test('bootstrap contains only new version/cache identity changes',()=>assert.equal(sha(read('index.js').replace("const VERSION = '0.8.86';","const VERSION = '0.8.85';").replace("const BUILD = '0.8.86-tt-cg-r84.10-reader-cg';","const BUILD = '0.8.85-tt-cg-r84.9-workspace';")), '0bfa6b90a4fe8cd7d9b6cc979c5ca547331334fd4c3542014c8c02e151f57f39'));
test('new dialect and cursor code has no network, code execution or archive write authority',()=>{
 for(const path of ['src/core/cgPromptFormat.js','src/generation/cgPromptPolicy.js','src/ui/heartReaderState.js'])assert.doesNotMatch(read(path),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\blocalStorage\b|\bindexedDB\b|\bcommitSession|\bsaveSession|\bAuthorization\b|\binnerHTML\b|\bmanualApiKey\b/);
});
test('no dynamic external stylesheet was introduced and format fields remain finite',()=>{
 const bundle=read('dist/heartbeatMemories.bundle.js');assert.doesNotMatch(bundle,/heartbeatMemories\.bundle\.css|createElement\(['"]link['"]\)/);assert.match(bundle,/nai45-tags/);assert.match(bundle,/nai5-natural/);
});
