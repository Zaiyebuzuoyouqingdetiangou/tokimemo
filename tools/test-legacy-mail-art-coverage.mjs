import test from 'node:test';
import assert from 'node:assert/strict';
import * as art from '../src/core/letterIllustrationV2.js';
import {normalizeInboxLetters} from '../src/modes/inbox.js';
const envelope=(card,world='')=>`CHARACTER_CARD_JSON:\n${JSON.stringify(card)}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n${world}\n【上下文结束】`;
const person=(id,name,content)=>({id,name,identity:'character',sourceRefs:[{world:'人物',uid:id,title:name,content}]});
const local=(card,world,names,letter='今天下雨了，我在窗边写信。')=>art.normalizeGenerated(null,{characterEvidence:art.captureEvidence(envelope(card,world)),characterNames:names,letterText:letter});
const facts=value=>value?Object.fromEntries(value.visualFacts.map(f=>[f.kind,f.value])):null;

test('single card: appearance in an unnamed world-book entry is used',()=>{
 assert.equal(facts(local({name:'顾言',description:'性格冷淡。'},'外貌：黑色短发，穿白衬衫。',['顾言'])).hairColor,'black');
});
test('single card: decorated card name still reads the sent world book',()=>{
 assert.ok(local({name:'【冷面上司】顾言',description:'性格冷淡'},'顾言：黑色短发',['【冷面上司】顾言']));
});
test('single card: named lines win over unnamed world-book lines',()=>{
 const value=local({name:'甲',description:'温柔'},'路人：白色长发\n甲：黑色短发',['甲']);
 assert.equal(facts(value).hairColor,'black');
});
test('mixed colours pick the colour nearest to hair / eyes',()=>{
 assert.deepEqual([facts(local({name:'X',description:'银白长发，红瞳'},'',['X'])).hairColor,facts(local({name:'X',description:'黑眸白发'},'',['X'])).hairColor,facts(local({name:'X',description:'黑眸白发'},'',['X'])).eyeColor],['white','white','black']);
 const both=facts(local({name:'X',description:'金发碧眼'},'',['X']));assert.equal(both.hairColor,'blonde');assert.equal(both.eyeColor,'green');
 assert.equal(facts(local({name:'X',description:'发色：银白\n瞳色：金'},'',['X'])).eyeColor,'amber');
});
test('english appearance words are recognised',()=>{
 const value=facts(local({name:'Kael',description:'Kael has silver hair and crimson eyes.'},'',['Kael']));
 assert.equal(value.hairColor,'gray');assert.equal(value.eyeColor,'red');
});
test('substring traps and negations do not invent facts',()=>{
 const value=facts(local({name:'X',description:'穿一件fashion感的外套，黑色长发'},'',['X']));assert.equal(value.outfitColor,undefined);
 assert.equal(local({name:'X',description:'身高185，气质清冷，眉眼锋利。'},'',['X']),null);
 assert.equal(local({name:'X',description:'没有黑色长发'},'',['X']),null);
});
test('multi-person: card lines that name one person count for that person only',()=>{
 const snapshot={people:[person('a','甲','性格温柔'),person('b','乙','性格冷淡')]};
 const evidence=art.captureEvidence(envelope({description:'甲：黑色长发\n乙：白色短发'},'性格温柔\n性格冷淡'),snapshot);
 const a=art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'甲\n我正在喝茶'});
 const b=art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'乙\n我正在喝茶'});
 assert.equal(facts(a).hairColor,'black');assert.equal(facts(b).hairColor,'white');
});
test('multi-person: unnamed world book is still never lent across people',()=>{
 const snapshot={people:[person('a','甲','性格温柔'),person('b','乙','性格冷淡')]};
 const evidence=art.captureEvidence(envelope({},'性格温柔\n性格冷淡\n黑色长发'),snapshot);
 assert.equal(art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'甲\n我正在喝茶'}),null);
});
test('new letters without art record a plain reason; letters with art do not',()=>{
 const memory={chatId:'t',archiveRevision:'r',characterName:'甲',userName:'你',memories:[]};
 const plan=[{slot:'daily',eventKey:'daily:1',sourceMemoryIds:[],sourceMemoryAnchor:''}];
 const make=(description,body)=>normalizeInboxLetters({letters:[{slot:'daily',title:'近况',greeting:'你好',body,closing:'甲'}]},memory,plan,new Date(),{characterEvidence:art.captureEvidence(envelope({name:'甲',description}))}).letters[0];
 assert.equal(make('性格冷淡','我正在喝茶。').illustrationMissing,'appearance');
 assert.equal(make('黑色长发','一切安好。').illustrationMissing,'scene');
 const drawn=make('黑色长发','我正在喝茶。');assert.ok(drawn.illustration);assert.equal(drawn.illustrationMissing,undefined);
});
