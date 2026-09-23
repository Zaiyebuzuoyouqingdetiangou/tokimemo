import test from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../src/ui/mirrorCallView.js';
import {state} from '../src/core/state.js';
import * as constants from '../src/core/constants.js';

test('current call uses real selected person, explicit user and current-chat memory only', () => {
    const oldHost=globalThis.SillyTavern, oldSnapshot=state.activeArchiveSnapshot;
    const bank={version:3,chatId:'live',archiveRevision:'r1',characterName:'世界卡',userName:'档案真名',archiveSummary:'约好的见面',
      participantsV1:{version:1,cardType:'multi',revision:'people1',selectedIds:['a','b'],people:[{id:'a',name:'岚',identity:'character',sourceRefs:[{world:'世界书',uid:'1',title:'岚',content:'岚留短发。'}]},{id:'b',name:'澄',identity:'character',sourceRefs:[]}]},
      memories:[{id:'M1',title:'旧钟楼',summary:'在钟楼见面',anchors:['在钟楼见面'],participants:['岚','档案真名']}]};
    const context={characterId:0,name2:'世界卡',name1:'Persona别名',chatId:'live',characters:[{name:'世界卡',avatar:'world.png',description:'这是一张多人卡。'}],chatMetadata:{[constants.MEMORY_KEY]:bank},extensionSettings:{},chat:[{is_user:true,name:'档案真名',mes:'雨停了吗？'}],getCurrentChatId(){return this.chatId;}};
    globalThis.SillyTavern={getContext:()=>context};state.activeArchiveSnapshot=null;
    try {
      const result=view.describeCurrentCall('岚');
      assert.equal(result.speaker,'岚');assert.equal(result.user,'档案真名');
      const payload=JSON.parse(result.system.split('UNTRUSTED_CALL_CONTEXT_JSON:\n')[1]);
      assert.equal(payload.person.name,'岚');assert.equal(payload.archive.memories[0].id,'M1');assert.equal(payload.recent[0].text,'雨停了吗？');
      assert.equal(JSON.parse(view.describeCurrentCall('岚',false).system.split('UNTRUSTED_CALL_CONTEXT_JSON:\n')[1]).archive,null);
      assert.throws(()=>view.describeCurrentCall('世界卡'),/真实人物/);
      state.activeArchiveSnapshot={entryId:'history'};assert.throws(()=>view.describeCurrentCall('岚'),/历史快照/);state.activeArchiveSnapshot=null;
      const scope=result.scope;bank.archiveRevision='r2';assert.notEqual(view.describeCurrentCall('岚').scope,scope);
      context.chatId='different';assert.throws(()=>view.describeCurrentCall('岚'),/真实人物/);
    } finally {globalThis.SillyTavern=oldHost;state.activeArchiveSnapshot=oldSnapshot;}
});
