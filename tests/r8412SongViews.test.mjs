import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/r847Host.mjs';
import * as view from '../src/ui/themeSongView.js';
import * as song from '../src/modes/themeSong.js';
import * as contract from '../src/core/themeSongContract.js';
import * as constants from '../src/core/constants.js';
import * as cache from '../src/core/cache.js';
import * as context from '../src/core/context.js';
import * as overlay from '../src/ui/overlay.js';
import {state} from '../src/core/state.js';
const raw={title:'微光里',vocalDescription:'温暖低音',styleDescription:'温柔钢琴抒情',stylePrompt:'Piano ballad, warm vocals',lyrics:'[Verse 1]\n请把这片微光留下\n再慢慢说一次晚安\n[Chorus]\n我听见你心里的星光\n落在安静窗前\n[End]'};
async function seed(f){
 const plan=song.createThemeSongPlan({subject:'character',language:'zh',voice:'char'},f.liveBank);
 const value={...contract.emptyThemeSongs(f.liveBank,context.currentCharacterRuntimeKey(f.ctx)),songs:[song.normalizeGeneratedSong(raw,plan,f.liveBank)]};value.selectedId=value.songs[0].id;
 f.liveCache.themeSong=structuredClone(value);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);f.records.get(f.aEntry.entryId).cache=structuredClone(f.liveCache);state.runtimeSessionCache.clear();
 await overlay.openCachedOrGenerate('themeSong');return value;
}
test('reader is default and has title singer honest author credit and readable verse headings',async t=>{
 const f=await fixture(t);await seed(f);await view.handleThemeSongAction('view-read');
 assert.match(f.body.innerHTML,/data-rmt-song-presentation="read"/);assert.match(f.body.innerHTML,/作者 · 未署名（原创生成）/);assert.match(f.body.innerHTML,/主歌 1/);
 assert.doesNotMatch(f.body.innerHTML,/作者 · 林舟/);assert.doesNotMatch(f.body.innerHTML,/复制曲风/);
});
test('two views leave all canonical songs, lyrics and archive backup byte-for-byte unchanged',async t=>{
 const f=await fixture(t);await seed(f);const before=await f.persisted(),source=JSON.stringify(state.activeSession);
 for(const action of ['view-format','view-read','view-format','view-read'])await view.handleThemeSongAction(action);
 assert.equal(JSON.stringify(state.activeSession),source);assert.deepEqual(await f.persisted(),before);assert.equal(f.requests.length,0);
});
test('format view still exposes unmodified tag-structured lyrics and separate export controls',async t=>{
 const f=await fixture(t);await seed(f);await view.handleThemeSongAction('view-format');assert.match(f.body.innerHTML,/data-rmt-song-presentation="format"/);
 for(const action of ['copy-title','copy-style','copy-lyrics','copy-all','export'])assert.match(f.body.innerHTML,new RegExp(`data-rmt-song="${action}"`));
 assert.match(f.body.innerHTML,/\[Verse 1\]/);assert.equal(contract.themeSongExport(state.activeSession.songs[0],'lyrics'),raw.lyrics);
});
test('reading renderer keeps unknown section labels and text inert',()=>{
 const html=view.songLyricsReadingHtml('[Verse 1]\n<img src=x onerror=alert(1)>\n[<script>alert(2)</script>]\n<script>alert(3)</script>\n[End]');
 assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);assert.doesNotMatch(html,/>End</);
});
test('poetry line breaks and repeated chorus are preserved, only structural markers prettified',()=>{
 const html=view.songLyricsReadingHtml('[Verse]\n第一行\n第二行\n\n[Chorus]\n回来吧\n[Final Chorus]\n回来吧\n[End]');
 assert.match(html,/第一行\n第二行/);assert.equal((html.match(/回来吧/g)||[]).length,2);assert.match(html,/最后的副歌/);
});
test('UI display choice persists through another reader open without creating provider work',async t=>{
 const f=await fixture(t);await seed(f);await view.handleThemeSongAction('view-format');await f.open('phone');await f.open('themeSong');assert.match(f.body.innerHTML,/data-rmt-song-presentation="format"/);assert.equal(f.requests.length,0);
});
test('read-only archived song permits both displays but never exposes delete or generate writes',async t=>{
 const f=await fixture(t);const data=await seed(f);state.activeArchiveSnapshot={...f.aEntry,memory:f.liveBank,cache:{...f.liveCache,themeSong:data}};state.activeArchiveReadOnly=true;
 const before=await f.persisted();for(const action of ['view-read','view-format']){await view.handleThemeSongAction(action);assert.doesNotMatch(f.body.innerHTML,/data-rmt-song="delete"/);assert.match(f.body.innerHTML,/data-rmt-song="generate" disabled/);}
 assert.deepEqual(await f.persisted(),before);assert.equal(f.requests.length,0);
});
test('song empty reader remains usable with either display and no hard generation gate',async t=>{
 const f=await fixture(t);await f.open('themeSong');for(const action of ['view-read','view-format']){await view.handleThemeSongAction(action);assert.match(f.body.innerHTML,/rmt-song-empty/);}assert.equal(f.requests.length,0);assert.equal((await f.persisted()).themeSong,undefined);
});
