import test from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../src/ui/handJournalView.js';
import * as journal from '../src/core/handJournal.js';
import * as letterArt from '../src/core/letterIllustration.js';

test('journal rendering escapes original markup and retains line breaks and speaker attribution',()=>{
    const page=journal.createJournalPage({id:'page-a',title:'<script>title</script>',entries:[{id:'entry',title:'<&>',source:{mode:'inbox',id:'mail',title:'source'},blocks:[{type:'text',speaker:'甲',text:'  原文\n<script>not code</script>\n末行  '},{type:'image',url:'/custom/图.jpg',caption:'画'}]}]});
    const html=view.journalPageHtml(page);
    assert.ok(html.includes('  原文\n&lt;script&gt;not code&lt;/script&gt;\n末行  '));
    assert.ok(html.includes('<b>甲</b>'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('<img src="/custom/%E5%9B%BE.jpg"'));
});

test('whole-page selection distinguishes individual HEART reader routes',()=>{
    const entry=(path,id='a')=>({source:{mode:'heart',path,id}});
    assert.equal(view.journalSourceRoute(entry('greetings.morning[0]')),'language');
    assert.equal(view.journalSourceRoute(entry('languagePortrait')),'language');
    assert.equal(view.journalSourceRoute(entry('dailyStrips[0]')),'strips');
    assert.equal(view.journalSourceRoute(entry('fireflyVoices[0]')),'fireflies');
    const session={voiceDramas:[{id:'post',kind:'postending'},{id:'spring',kind:'season'}]};
    assert.equal(view.journalSourceRoute(entry('voiceDramas[0]','post'),session),'postending');
    assert.equal(view.journalSourceRoute(entry('voiceDramas[1]','spring'),session),'heart');
    assert.equal(view.journalSourceRoute({source:{mode:'calendar'}}),'calendar');
});

test('letter art identifiers stay unique between preview and saved journal pages',()=>{
    const illustration=letterArt.normalizeLetterIllustration({version:2,characterName:'岚',focus:'person',visualFacts:[{kind:'hairLength',value:'long',evidence:'长发'}],scene:{kind:'read',evidence:'看书'}});
    assert.ok(illustration);
    const make=id=>journal.createJournalPage({id,title:'小画',entries:[{id:'e',title:'小画',source:{mode:'inbox',id:'e',title:'小画'},blocks:[{type:'letterIllustration',illustration}]}]});
    const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    const first=ids(view.journalPageHtml(make('first'))),second=ids(view.journalPageHtml(make('second')));
    assert.ok(first.length);assert.ok(second.length);assert.equal(first.filter(id=>second.includes(id)).length,0);
});
