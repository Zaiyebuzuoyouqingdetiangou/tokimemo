import test from 'node:test';
import assert from 'node:assert/strict';
import * as phone from '../src/modes/phone.js';
import * as view from '../src/ui/phoneView.js';
const bank = { characterName: '青岚', userName: '小雨', memories: [] };
const plan = { id: 'CHAT', label: '通讯', kind: 'chat', entries: [{ id: 'C01', title: '给小雨的草稿' }] };
const owner = { speakerRole: 'owner', speaker: '青岚', text: '明天一起去看花，好吗？' };
const entry = { id: 'C01', title: '未发送草稿', preview: '明天的邀请', detail: '', contactName: '小雨', basis: '推演', messages: [owner] };
const normalize = (row, memory = bank, options = {}) => phone.normalizePhoneDraftApp({ id: 'CHAT', entries: [row] }, plan, memory, 'phone', null, { allowPartial: true, ...options }).entries[0];
test('user thread saves one owner draft without requiring invented user reply', () => {
 const saved = normalize(entry); assert.equal(saved.conversationMode, 'draft'); assert.equal(saved.messages.length, 1); assert.equal(saved.messages[0].speaker, '青岚');
});
test('user messages including falsely labelled owner are discarded while owner draft survives', () => {
 const saved = normalize({ ...entry, messages: [...entry.messages, { speakerRole: 'owner', speaker: '小雨', text: '好呀' }] });
 assert.equal(saved.messages.length, 1); assert.equal(saved.conversationMode, 'draft');
});
test('all discarded threads have explicit terminal reason', () => {
 assert.throws(() => normalize({ ...entry, messages: [{ speakerRole: 'contact', speaker: '小雨', text: '好呀' }] }), e => e.code === 'RMT_PHONE_NO_CONVERSATION' && e.nonRetryable === true);
});
test('summarized historical conversation becomes owner-only unsent draft', () => {
 const memory = { ...bank, memories: [{ id: 'M001', title: '花约', summary: '青岚邀请小雨看花。', anchors: ['花约'] }] };
 const saved = normalize({ ...entry, basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '花约', sourceMemoryEvidence: '青岚邀请小雨看花。', messages: [owner, { speakerRole: 'contact', speaker: '小雨', text: '好呀' }] }, memory);
 assert.equal(saved.conversationMode, 'draft'); assert.equal(saved.basis, '推演'); assert.deepEqual(saved.sourceMemoryIds, []); assert.equal(saved.messages.length, 1);
});
test('only verbatim attributed quotes in referenced memory stay history', () => {
 const evidence = '青岚：明天一起去看花，好吗？\n小雨：好呀';
 const memory = { ...bank, memories: [{ id: 'M001', title: '花约', summary: evidence, anchors: ['花约'] }] };
 const saved = normalize({ ...entry, basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '花约', sourceMemoryEvidence: evidence, messages: [owner, { speakerRole: 'contact', speaker: '小雨', text: '好呀' }] }, memory);
 assert.equal(saved.basis, '记忆'); assert.equal(saved.conversationMode, 'history'); assert.equal(saved.messages.length, 2);
 const changed = normalize({ ...entry, basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '花约', sourceMemoryEvidence: evidence, messages: [owner, { speakerRole: 'contact', speaker: '小雨', text: '好的' }] }, memory);
 assert.equal(changed.conversationMode, 'draft');
});
test('group member actual name survives save and display; card title and forged roster cannot speak', () => {
 const memory = { ...bank, characterName: '群像卡' };
 const options = { controlledEvidence: '成员青岚负责管理花园。', ownerMembers: [{ name: '青岚', sourceEvidence: '成员青岚负责管理花园。' }] };
 const saved = normalize(entry, memory, options);
 assert.equal(saved.messages[0].speaker, '青岚');
 const html = view.renderPhoneEntryDetail(saved, plan, { ownerName: '群像卡' });
 assert.match(html, /<b>青岚<\/b>/); assert.match(html, /未发送草稿/); assert.doesNotMatch(html, /<b>群像卡<\/b>/);
 assert.throws(() => normalize({ ...entry, messages: [{ ...owner, speaker: '群像卡' }] }, memory, options), e => e.code === 'RMT_PHONE_NO_CONVERSATION');
 assert.throws(() => normalize(entry, memory, { ...options, controlledEvidence: '没有任何成员资料。' }), e => e.code === 'RMT_PHONE_NO_CONVERSATION');
});
test('concrete missing-thread plan omits empty slots and never rewrites a saved other app', () => {
 const app = { ...plan, entries: ['C01','C02','C03'].map(id => ({ id, sourceStatus: 'unavailable' })) };
 const note = { id: 'NOTES', kind: 'notes', entries: [{ id: 'N01', detail: '逐字保留我的笔记' }] };
 const before = JSON.stringify(note);
 const pending = phone.phoneMissingThreadPlan(app, { apps: [app, note] }, bank);
 assert.equal(pending.entries.length, 1); assert.equal(pending.entries[0].contactName, '小雨'); assert.match(pending.entries[0].title, /给小雨.*草稿/);
 assert.deepEqual(pending.omittedEntryIds, ['C02', 'C03']); assert.equal(JSON.stringify(note), before);
 assert.equal(phone.phoneMissingThreadPlan(app, { apps: [app] }, { ...bank, userName: '' }).entries.length, 0);
});
test('known NPC daily exchange remains two-way and identity/provenance guards remain', () => {
 const row = { ...entry, contactName: '阿林', messages: [owner, { speakerRole: 'contact', speaker: '阿林', text: '明天再商量。' }] };
 assert.equal(normalize(row, bank, { controlledEvidence: '阿林是花店店员。' }).messages.length, 2);
 assert.throws(() => normalize(row), e => e.code === 'RMT_PHONE_NO_CONVERSATION');
});
test('full session normalization and reload keep group draft identity and evidence roster', () => {
 const memory = { ...bank, characterName: '群像卡' };
 const options = { controlledEvidence: '成员青岚负责管理花园。', ownerMembers: [{ name: '青岚', sourceEvidence: '成员青岚负责管理花园。' }] };
 const app = phone.normalizePhoneDraftApp({ id:'CHAT', entries:[entry] }, { ...plan, ownerMembers: options.ownerMembers }, memory, 'phone', null, { ...options, allowPartial:true });
 const session = phone.normalizePhone({ deviceKind:'phone', apps:[app] }, memory, options);
 assert.equal(session.ownerName, '群像卡'); assert.equal(session.apps[0].entries[0].messages[0].speaker, '青岚');
 const restored = phone.normalizePhone(session, memory, { trustedStored:true });
 assert.equal(restored.apps[0].entries[0].conversationMode, 'draft'); assert.equal(restored.apps[0].entries[0].messages[0].speaker, '青岚');
});
test('partial merge removes only locally omitted unavailable slots and preserves saved siblings byte-for-byte', () => {
 const saved = { id:'OLD', basis:'推演', detail:'已保存正文\n保留空格  ', messages:[] };
 const previous = { ...plan, entries:[saved, {id:'C01',sourceStatus:'unavailable'}, {id:'C02',sourceStatus:'unavailable'}] };
 const result = phone.mergePhoneMissingEntries(previous, { entries:[{...entry}], omittedEntryIds:['OLD','C02'] });
 assert.deepEqual(result.entries[0], saved); assert.deepEqual(result.entries.map(row=>row.id), ['OLD','C01']);
 assert.equal(previous.entries.length,3);
});
test('directory roster and concrete recipient fields survive only with real controlled quotes', () => {
 const data = { deviceKind:'phone', ownerMembers:[{name:'青岚',sourceEvidence:'成员青岚负责管理花园。'}], apps:[{...plan, entries:[{id:'C01',title:'草稿',contactName:'小雨',conversationMode:'draft'}]}] };
 const parsed = phone.normalizePhonePlan(data, { ...bank, characterName:'群像卡' }, {controlledEvidence:'成员青岚负责管理花园。'});
 assert.equal(parsed.apps[0].ownerMembers[0].name,'青岚'); assert.equal(parsed.apps[0].entries[0].contactName,'小雨');
 assert.deepEqual(phone.normalizePhonePlan(data,bank,{controlledEvidence:'无关材料'}).apps[0].ownerMembers,[]);
});
test('existing user-controlled multiplayer archive repairs without regenerating the directory', () => {
 const memory = { ...bank, characterName:'群像卡', participantsV1:{version:1,cardType:'multi',revision:'1',selectedIds:['a'],people:[{id:'a',name:'青岚',sourceRefs:[]},{id:'u',name:'小雨',identity:'user',sourceRefs:[]}]} };
 assert.equal(normalize(entry,memory).messages[0].speaker,'青岚');
 assert.throws(()=>normalize({...entry,messages:[{...owner,speaker:'群像卡'}]},memory),e=>e.code==='RMT_PHONE_NO_CONVERSATION');
 assert.match(phone.phoneAppPrompt({},memory,{deviceName:'群像卡',deviceKind:'phone'},plan),/受控档案人物显示名.*青岚/);
});
test('old directory receives member list in same App response and verifies against frozen evidence', () => {
 const memory={...bank,characterName:'群像卡'};
 const data={id:'CHAT',ownerMembers:[{name:'青岚',sourceEvidence:'成员青岚负责管理花园。'}],entries:[entry]};
 const saved=phone.normalizePhoneDraftApp(data,plan,memory,'phone',null,{allowPartial:true,controlledEvidence:'成员青岚负责管理花园。'});
 assert.equal(saved.entries[0].messages[0].speaker,'青岚'); assert.equal(saved.ownerMembers[0].name,'青岚');
 assert.throws(()=>phone.normalizePhoneDraftApp(data,plan,memory,'phone',null,{allowPartial:true,controlledEvidence:'无关冻结资料'}),e=>e.code==='RMT_PHONE_NO_CONVERSATION');
});
test('non-chat owner normalization/display remains legacy behavior including messages', () => {
 const memory={...bank,characterName:'群像卡'};
 const row={...entry,contactName:'',messages:[owner]};
 assert.equal(phone.normalizePhoneConversationMessages(row,memory).messages[0].speaker,'群像卡');
 const html=view.renderPhoneEntryDetail(row,{kind:'notes',label:'备忘录'},{ownerName:'群像卡'});
 assert.match(html,/<b>群像卡<\/b>/); assert.doesNotMatch(html,/<b>青岚<\/b>/);
});

test('explicit multiplayer selection excludes unselected members from new dialogue', () => {
 const memory={...bank,characterName:'群像卡',participantsV1:{version:1,cardType:'multi',selectedIds:['a'],people:[{id:'a',name:'青岚',sourceRefs:[]},{id:'b',name:'白羽',sourceRefs:[]}]}};
 assert.throws(()=>normalize({...entry,messages:[{...owner,speaker:'白羽'}]},memory),e=>e.code==='RMT_PHONE_NO_CONVERSATION');
 assert.equal(normalize(entry,memory).messages[0].speaker,'青岚');
});

test('missing-thread repair preserves explicit recipients without deduplicating valid drafts', () => {
 const app={...plan,entries:[{id:'C01',sourceStatus:'unavailable',contactName:'小雨'},{id:'C02',sourceStatus:'unavailable',contactName:'小雨'},{id:'C03',sourceStatus:'unavailable',contactName:'阿林'}]};
 const pending=phone.phoneMissingThreadPlan(app,{apps:[app]},bank,{controlledEvidence:'阿林是花店店员。'});
 assert.deepEqual(pending.entries.map(row=>[row.id,row.contactName]),[['C01','小雨'],['C02','小雨'],['C03','阿林']]);
 assert.deepEqual(pending.omittedEntryIds,[]);
});
