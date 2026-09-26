import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
export async function harness({root=path.resolve('.'),messages=80,failAfter=15,bundle=false,batchChars=1200000,autoPartial=false,transientFailures=0,failCode='RMT_CONNECTION_FAILED'}={}) {
 let transientLeft=transientFailures;
 const events=[],providerCalls=[],disk=new Map(),backups=new Map(),kv=new Map();let allowed=failAfter;
 const host={characterId:0,name1:'User',name2:'Char',chatId:'test-chat',characters:[{name:'Char',avatar:'char.png',data:{name:'Char',description:'Test character'}}],
  chat:Array.from({length:messages},(_,i)=>({name:'Char',is_user:false,mes:`事件${i+1}散步。`+'春'.repeat(5990)})),chatMetadata:{},extensionSettings:{connectionManager:{profiles:[]},heartbeatMemories:{useCurrentChatExternalMemory:false,useActivatedWorldInfo:false,chatReadRange:{mode:'all',includeHidden:false}}},
  saveMetadata:async()=>{},saveSettingsDebounced:()=>{},getCharacterCardFields:()=>({}),getTokenCountAsync:async()=>100};
 const sandbox={console:{log:()=>{},warn:(...a)=>events.push(a),error:(...a)=>events.push(a)},TextEncoder,TextDecoder,AbortController,DOMException,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,
  queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,
  document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}}},window:{},navigator:{},location:{protocol:'https:',origin:'https://localhost'},
  localStorage:{getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v),removeItem:k=>kv.delete(k)},
  SillyTavern:{getContext:()=>host},toastr:{info:()=>{},success:()=>{},warning:()=>{},error:(s)=>events.push(s)}};
 const context=vm.createContext(sandbox),modules=new Map();
 // All values crossing into production JS are native to the VM, just like parsed
 // browser JSON. No implementation mocks at the normalizer/recovery/CAS seams.
 const copy=v=>v===undefined?undefined:vm.runInContext('JSON.parse',context)(JSON.stringify(v));
 sandbox.structuredClone=copy;
 const fakeUI=new Set(['ui/overlay.js','ui/settingsPanel.js']);
 function get(file) {
  if(modules.has(file))return modules.get(file);
  const source=fs.readFileSync(path.join(root,'src',file),'utf8');let mod;
  if(fakeUI.has(file)||file==='generation/client.js') {
   const names=[...source.matchAll(/^export (?:async )?(?:function|const)\s+(\w+)/gm)].map(m=>m[1]);
   mod=new vm.SyntheticModule(names,function(){for(const name of names){let fn=()=>{};
    if(name.startsWith('confirmExplicit'))fn=()=>true;
    if(name==='generateConfiguredJson')fn=async prompt=>{
      if(transientLeft>0){transientLeft-=1;throw Object.assign(new Error('fixture 502'),{code:'RMT_CONNECTION_SERVER'});}
      if(providerCalls.length>=allowed)throw Object.assign(new Error('fixture interruption'),{code:failCode});
      providerCalls.push(prompt);
      const marker='UNTRUSTED_CHAT_JSON:\n',at=prompt.lastIndexOf(marker);
      if(at<0) {
       const externalMarker='EXTERNAL_MEMORY_JSON:\n',externalAt=prompt.lastIndexOf(externalMarker);
       if(externalAt<0)throw new Error('Unexpected paid step in fixture');
       const rows=JSON.parse(prompt.slice(externalAt+externalMarker.length));
       return copy({memories:[{title:rows[0].externalId,summary:'记录中已经散步。',sourceExternalIds:[rows[0].externalId],sourceExternalAnchor:rows[0].content.slice(-5),anchors:['散步']}]});
      }
      const rows=JSON.parse(prompt.slice(at+marker.length));
      return copy({memories:[{title:`事件${rows[0].messageIndex}`,summary:`在第${rows[0].messageIndex}楼散步。`,anchors:['散步'],participants:['Char','User'],messageStart:rows[0].messageIndex,messageEnd:rows.at(-1).messageIndex}]});
    };this.setExport(name,fn);}}, {context,identifier:file});
  }else mod=new vm.SourceTextModule(source,{context,identifier:file});
  modules.set(file,mod);return mod;
 }
 let entry=get('archive/repository.js');await entry.link((specifier,referencing)=>get(path.posix.normalize(path.posix.join(path.posix.dirname(referencing.identifier),specifier))));await entry.evaluate();
 let bundled = null, originalClient = null;
 if (bundle) {
  const code=fs.readFileSync(path.join(root,'dist/heartbeatMemories.bundle.js'),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const exposed='\nexport const __testNamespaces={'+paths.map(file=>JSON.stringify(file)+':__m_'+file.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};';
  const compiled=new vm.SourceTextModule(code+exposed,{context});await compiled.link(()=>{throw new Error('unexpected bundle import');});await compiled.evaluate();
  bundled=compiled.namespace.__testNamespaces; originalClient={...bundled['generation/client.js']};
  for(const file of [...fakeUI,'generation/client.js']) Object.assign(bundled[file],modules.get(file).namespace);
  entry={namespace:bundled['archive/repository.js']};
 }
 const module=file=>bundled?bundled[file]:modules.get(file).namespace;
 const local=module('core/localRecoveryStore.js');local.setLocalRecoveryBackendForTests({read:async key=>copy(disk.get(key)||null),compare:async(key,revision,payload)=>{assert.equal(disk.get(key)?.revision||0,revision);disk.set(key,{key,revision:revision+1,payload:copy(payload)});return revision+1;}});
 module('archive/backupStore.js').setArchiveBackupBackendForTests({read:async entry=>copy(backups.get(module('core/context.js').archiveIndexEntryId(entry))||null),put:async(record,expected,options)=>{
   options?.stillCurrent?.();const previous=backups.get(record.entryId);
   if(expected?.present===true&&previous)assert.equal(previous.archiveRevision,expected.revision);
   if(expected?.present===false)assert.ok(!previous||previous.deleted);
   backups.set(record.entryId,copy(record));return true;
 },delete:async()=>{}});
 module('archive/importBatches.js').setArchiveBatchCharsForTests(batchChars);
 module('archive/repository.js').setAutoPartialCommitForTests(autoPartial);
 module('archive/importRecovery.js').setArchiveTransientRetryDelaysForTests([0,0]);
 return {repo:entry.namespace,originalClient,module,host,events,providerCalls,disk,backups,copy,allow:n=>allowed=n,
 reload:async()=>{module('archive/importRecovery.js').resetArchiveRecoveryMemoryForTests();await entry.namespace.hydrateCurrentArchiveRecovery(host,{operation:'import'});}};
}
