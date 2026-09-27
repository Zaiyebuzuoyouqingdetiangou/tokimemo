import * as letterArt from './letterIllustration.js';
// Independent, local-only hand journal. No generation calls or archive writes.
// Reading fields are allowlisted below; never walk arbitrary session properties.
const FORMAT = 'HearttraceHandJournal';
const DATABASE = 'hearttrace-hand-journal-v1';
const STORE = 'journals';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function fail(code, message) { return Object.assign(new Error(message), { code, safeToDisplay: true, safeUserMessage: message }); }
function requireValue(ok, message = '手帐数据格式不完整，原记录没有改动。') { if (!ok) throw fail('RMT_JOURNAL_DATA', message); }
function string(value) { requireValue(typeof value === 'string'); return value; }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export const JOURNAL_PALETTES = Object.freeze([
    {id:'mint',label:'薄荷晨光',paper:'#f0faf5',ink:'#30544b',accent:'#a5d3bf'},
    {id:'sky',label:'晴空蓝',paper:'#eef7fc',ink:'#354f68',accent:'#a9cfe4'},
    {id:'peach',label:'白桃汽水',paper:'#fff3ef',ink:'#714d50',accent:'#efc0b4'},
    {id:'lilac',label:'丁香花笺',paper:'#f5f1fc',ink:'#584c70',accent:'#c9bcdf'},
    {id:'lemon',label:'柠檬奶油',paper:'#fffceb',ink:'#666044',accent:'#e6d894'},
    {id:'rose',label:'蔷薇清露',paper:'#fff2f6',ink:'#6d485b',accent:'#e5b5ca'},
]);
export function journalPalette(value, index = 0) {
    const fallback = JOURNAL_PALETTES[((index % JOURNAL_PALETTES.length) + JOURNAL_PALETTES.length) % JOURNAL_PALETTES.length];
    const found = JOURNAL_PALETTES.find(item => item.id === value?.id) || fallback;
    const result = {id: found.id};
    for (const key of ['paper','ink','accent']) result[key] = /^#[0-9a-f]{6}$/i.test(value?.[key] || '') ? value[key].toLowerCase() : found[key];
    return result;
}

export function safeJournalImageUrl(value) {
    if (typeof value !== 'string' || !value || /[\\\u0000-\u001f\u007f]/.test(value)) return '';
    const raw=value.trim();
    if (!raw || raw.startsWith('//') || /%(?:2f|5c|2e|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw) || /(?:^|\/)\.{1,2}(?:\/|$|[?#])/.test(raw)) return '';
    const hasScheme=/^[a-z][a-z0-9+.-]*:/i.test(raw);
    if(hasScheme && !/^https?:\/\//i.test(raw))return '';
    try {
        const url=new URL(raw,'https://journal.invalid/');
        if(!['https:','http:'].includes(url.protocol) || url.username || url.password || !url.hostname || url.pathname.startsWith('//'))return '';
        return hasScheme ? url.href : url.origin==='https://journal.invalid' ? url.pathname+url.search+url.hash : '';
    } catch { return ''; }
}

function normalizeBlock(value) {
    requireValue(object(value));
    if (value.type === 'text') return { type: 'text', text: string(value.text), ...(value.speaker === undefined ? {} : { speaker: string(value.speaker) }) };
    if (value.type === 'letterIllustration') {
        const illustration = letterArt.normalizeLetterIllustration(value.illustration);
        requireValue(!!illustration, '随信小画数据不完整，未导入。');
        return { type: 'letterIllustration', illustration };
    }
    requireValue(value.type === 'image');
    const url = safeJournalImageUrl(value.url); requireValue(!!url, '手帐中含有不支持的图片地址，未导入。');
    return { type: 'image', url, ...(value.caption === undefined ? {} : { caption: string(value.caption) }) };
}
function normalizeEntry(value) {
    requireValue(object(value) && object(value.source) && Array.isArray(value.blocks));
    const id = string(value.id), title = string(value.title);
    requireValue(!!id && !!value.source.mode && !!value.source.id);
    return { id, title, source: { mode: string(value.source.mode), id: string(value.source.id), title: string(value.source.title),
        ...(value.source.path === undefined ? {} : { path: string(value.source.path) }) }, blocks: value.blocks.map(normalizeBlock) };
}
function normalizePage(value) {
    requireValue(object(value) && Array.isArray(value.entries) && typeof value.id === 'string' && value.id.length > 0
        && Number.isFinite(value.createdAt) && value.createdAt >= 0);
    return { id: value.id, title: string(value.title), createdAt: value.createdAt, entries: value.entries.map(normalizeEntry), ...(value.palette ? {palette:journalPalette(value.palette)} : {}) };
}
function pages(value) {
    requireValue(Array.isArray(value)); const rows = value.map(normalizePage), ids = new Set();
    for (const row of rows) { requireValue(!ids.has(row.id), '手帐页面标识重复，原记录没有改动。'); ids.add(row.id); }
    return rows;
}
export function createJournalPage({ title = '', entries, id = globalThis.crypto?.randomUUID?.(), createdAt = Date.now(), palette } = {}) {
    requireValue(typeof id === 'string' && !!id, '无法创建手帐页面标识，请稍后重试。');
    return freeze(normalizePage({ id, title, entries, createdAt, palette }));
}
export function exportJournal(value) { return JSON.stringify({ format: FORMAT, version: 1, pages: pages(value) }, null, 2); }
export function importJournal(value) {
    let raw; try { raw = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw fail('RMT_JOURNAL_DATA', '这个文件不是完整的手帐 JSON，未导入。'); }
    requireValue(object(raw) && raw.format === FORMAT && raw.version === 1);
    return freeze(pages(raw.pages)); // Imported scope, credentials and unknown fields are never carried forward.
}

// path -> scalar text or arrays of explicit readable fields. Text is copied byte
// for byte as a JS string; the UI renders it as text, never evaluates HTML.
export const JOURNAL_READING_FIELDS = freeze({
    butterfly: [['nodes', ['label','code','worldSpec.era','worldSpec.setting','divergence.choice','monologue','intervention','systemNote']]],
    items: [['containers', ['label','spaceLabel','description']]],
    inbox: [['letters', ['greeting','body','closing']]],
    album: [['entries', ['date','desc','charComment','userComment','sharedMemory','comments[]','comments[].text']]],
    adv: [['events', ['date','cgDesc','adv.opening','adv.script[].text','adv.lines[].text','adv.paragraphs[]','adv.paragraphs[].text','adv.ending']], ['entries', ['desc','script[].text']]],
    heart: [['voiceDramas', ['subtitle','setting','script[].text']], ['scenarioDramas', ['subtitle','setting','script[].text']], ['dailyStrips', ['panels[].{caption,action,charLine,userLine}']], ['fireflyVoices', ['script[].text']]],
    ending: [['endings', ['subtitle','endingScene','creditsLine','epilogue.title','epilogue.timeSkip','epilogue.scenes[].{title,text}','epilogue.finalLine']], ['confessionReplays', ['subtitle','scene','confessionText','confessionLines[]','responseSummary','afterEffect']]],
    themeSong: [['songs', ['vocalDescription','styleDescription','lyrics']]],
    bedtime: [['stories', ['genre','premise','chapters[].{title,text}']]],
    timeEcho: [['episodes', ['motif','opening','lines[].text','message','closing']]],
    pastLives: [['episodes', ['opening.title','opening.motif','opening.text','dossiers[].{title,synopsis,clues[].{title,text,revealedText}}','echoes[].{title,text,reflection}','closing.text','closing.signature']]],
    travel: [['locations', ['description','desc','dialogue[].text','dialogue.lines[].text','postcard.title','postcard.greeting','postcard.body','postcard.closing','keepsake.title','keepsake.greeting','keepsake.body','keepsake.closing','keepsakes[].{title,body}']]],
    cabinet: [['items', ['name','objectEvidence','description','desc','story','charComment']]],
    achievements: [['entries', ['description','unlockCondition','hint']]],
    calendar: [['entries', ['date','title','tags[]','description','summary','note']]],
    room: [['spaces', ['label','spaceType','atmosphere','objects[].{label,description,summary,observation,line}']], ['residents', ['name','presenceLines[]']], ['pets', ['name','description','habit','interaction']]],
    phone: [],
    relations: [['relationships', ['ownerName','name','relation','state','sentiments[]','summary','npcPerspective']], ['discoveries', ['label','value']], ['settingRelationships', ['name','relation','summary','npcPerspective']]],
});
function textAt(value, path, visit) {
    if (path.startsWith('{') && path.endsWith('}')) {
        let depth=0, start=1;
        for(let i=1;i<path.length;i++) {
            if(path[i]==='{')depth++;
            else if(path[i]==='}' && i<path.length-1)depth--;
            if((path[i]===',' && depth===0) || i===path.length-1){textAt(value,path.slice(start,i),visit);start=i+1;}
        }
        return;
    }
    const [part, ...remaining] = path.split('.'), array = part.endsWith('[]'), name = array ? part.slice(0,-2) : part;
    const next = value?.[name];
    for (const row of array ? (Array.isArray(next) ? next : []) : [next]) {
        if (remaining.length) textAt(row, remaining.join('.'), visit);
        else if (typeof row === 'string' && row !== '') visit(row, value?.speaker);
    }
}
function imageBlocks(item) {
    const rows = [item?.cgImage, ...(Array.isArray(item?.cgImageHistory) ? item.cgImageHistory : [])];
    const addVisual = visual => { if (object(visual)) rows.push(visual.cgImage, ...(Array.isArray(visual.cgImageHistory) ? visual.cgImageHistory : [])); };
    addVisual(item?.visual); Object.values(object(item?.visuals) ? item.visuals : {}).forEach(addVisual);
    (Array.isArray(item?.previousCgVisuals) ? item.previousCgVisuals : []).forEach(addVisual);
    (Array.isArray(item?.previousSceneVisuals) ? item.previousSceneVisuals : []).forEach(row => addVisual(row.visual));
    const urls = new Set(), result = [];
    for (const row of rows) { const url = safeJournalImageUrl(row?.url); if (url && !urls.has(url)) { urls.add(url); result.push({type:'image',url}); } }
    return result;
}
export function extractJournalEntries(mode, session) {
    if (typeof mode !== 'string' || !object(session)) return [];
    const result = [];
    const add = (item, path, fields) => {
        if (!object(item)) return;
        const sourceId = typeof item.id === 'string' && item.id ? item.id : path;
        const title = typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : typeof item.label === 'string' ? item.label : sourceId;
        const blocks = [];
        fields.forEach(field => textAt(item, field, (text, speaker) => blocks.push({type:'text',text,...(typeof speaker === 'string' ? {speaker} : {})})));
        blocks.push(...imageBlocks(item));
        if (mode === 'inbox' && item.illustration) { const illustration=letterArt.normalizeLetterIllustration(item.illustration); if (illustration) blocks.push({type:'letterIllustration',illustration}); }
        if (blocks.length) result.push({id:`${mode}:${path}:${sourceId}`,title,source:{mode,id:sourceId,title,path},blocks});
    };
    for (const [collection, fields] of JOURNAL_READING_FIELDS[mode] || []) {
        (Array.isArray(session[collection]) ? session[collection] : []).forEach((item,index) => add(item,`${collection}[${index}]`,fields));
    }
    if (mode === 'items') {
        const visited = new WeakSet();
        const visit = (node,path) => { if (!object(node) || visited.has(node)) return; visited.add(node); add(node,path,['label','summary','line']); (Array.isArray(node.children)?node.children:[]).forEach((child,index)=>visit(child,path+'.children['+index+']')); };
        (Array.isArray(session.containers)?session.containers:[]).forEach((container,index)=>(Array.isArray(container.nodes)?container.nodes:[]).forEach((node,n)=>visit(node,'containers['+index+'].nodes['+n+']')));
    }
    if (mode === 'calendar') {
        const supplements = {drafts:['text'],stickyNotes:['date','text'],moodNotes:['date','text'],holidayCards:['title','message','calligraphy','signature'],manualTodos:['title']};
        const collect = (owner,prefix) => { for(const [collection,fields] of Object.entries(supplements)) (Array.isArray(owner?.[collection])?owner[collection]:[]).forEach((item,index)=>add(item,prefix+collection+'['+index+']',fields)); };
        collect(session,'');
        for(const [key,day] of Object.entries(object(session.dayPages)?session.dayPages:{})) collect(day,'dayPages.'+key+'.');
    }
    if (mode === 'room') {
        add(session,'home',['homeName','homeSummary','presenceLines[]','lifePlan.beats[].{time,activity,line,ambient,trace,participants[].{activity,line,ambient,trace}}']);
        for(const [key,part] of Object.entries(object(session.dayparts)?session.dayparts:{}))add(part,'dayparts.'+key,['activity','line']);
        (Array.isArray(session.residents)?session.residents:[]).forEach((resident,index)=>{for(const [key,part] of Object.entries(object(resident.dayparts)?resident.dayparts:{}))add(part,'residents['+index+'].dayparts.'+key,['activity','line']);});
    }
    if (mode === 'relations') add(session,'introduction',['summary']);
    if (mode === 'phone') (Array.isArray(session.apps) ? session.apps : []).forEach((app,a) => {
        (Array.isArray(app?.entries) ? app.entries : []).forEach((entry,e) => add(entry,`apps[${a}].entries[${e}]`,['subtitle','detail','fields[].{label,value}','messages[].text','imageCaption']));
    });
    if (mode === 'heart') {
        for (const [category, lines] of Object.entries(object(session.greetings) ? session.greetings : {})) {
            if (Array.isArray(lines)) lines.forEach((line,index) => { if (typeof line === 'string') add({id:`${category}:${index}`,title:category,text:line},`greetings.${category}[${index}]`,['text']); });
        }
        if (object(session.languagePortrait)) add(session.languagePortrait,'languagePortrait',[]);
        (Array.isArray(session.languageVisuals) ? session.languageVisuals : []).forEach((item,index)=>add(item,`languageVisuals[${index}]`,[]));
    }
    return freeze(result);
}

export function createJournalStore({ indexedDB = globalThis.indexedDB, currentScope } = {}) {
    function guard(scope) { if (typeof scope !== 'string' || !scope || typeof currentScope !== 'function' || currentScope() !== scope) throw fail('RMT_JOURNAL_SCOPE', '聊天已切换，请回到原聊天后保存手帐。'); }
    function open() {
        return new Promise((resolve,reject) => {
            if (!indexedDB?.open) { reject(fail('RMT_JOURNAL_STORAGE','此浏览器无法使用本机手帐存储。')); return; }
            let request, failed=false;
            const stop = () => { failed=true; reject(fail('RMT_JOURNAL_STORAGE','无法打开本机手帐，请关闭其他旧版页面后重试。')); };
            try {
                request=indexedDB.open(DATABASE,1);
                request.onupgradeneeded=()=>{ if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'scope'}); };
                request.onerror=request.onblocked=stop;
                request.onsuccess=()=>{if(failed){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
            } catch { stop(); }
        });
    }
    async function transact(scope, additions, edit) {
        guard(scope); const incoming = additions === undefined ? null : pages(additions);
        const db=await open();
        try {
            guard(scope);
            return await new Promise((resolve,reject) => {
                let tx, result, error;
                try {
                    const writing = incoming !== null || !!edit?.remove || !!edit?.rename || !!edit?.palette;
                    tx=db.transaction(STORE,writing?'readwrite':'readonly');
                    tx.oncomplete=()=>resolve(freeze(result));
                    tx.onabort=tx.onerror=()=>reject(error || fail('RMT_JOURNAL_STORAGE','手帐保存未完成，原记录保留；请保留未保存页面后重试。'));
                    const store=tx.objectStore(STORE), request=store.get(scope);
                    request.onsuccess=()=>{
                        try {
                            guard(scope);
                            const stored=request.result;
                            requireValue(stored===undefined || (object(stored) && stored.scope===scope && stored.version===1));
                            result=stored===undefined ? [] : pages(stored.pages);
                            if (edit?.remove) {
                                requireValue(result.some(page => page.id === edit.remove), '找不到这一页，原手帐没有改动。');
                                result = result.filter(page => page.id !== edit.remove);
                                store.put({scope,version:1,pages:result});
                                return;
                            }
                            if (edit?.palette) {
                                const index = result.findIndex(page => page.id === edit.palette.id);
                                requireValue(index >= 0, '找不到这一页，原手帐没有改动。');
                                result = result.slice();
                                result[index] = createJournalPage({...result[index], palette:edit.palette.value});
                                store.put({scope,version:1,pages:result});
                                return;
                            }
                            if (edit?.rename) {
                                const index = result.findIndex(page => page.id === edit.rename.id);
                                requireValue(index >= 0, '找不到这一页，原手帐没有改动。');
                                const next = createJournalPage({ ...result[index], title: edit.rename.title });
                                result = result.slice();
                                result[index] = next;
                                store.put({scope,version:1,pages:result});
                                return;
                            }
                            if(incoming===null)return;
                            const ids=new Map(result.map(page=>[page.id,page]));
                            for(const page of incoming){
                                const old=ids.get(page.id);
                                requireValue(!old || JSON.stringify(old)===JSON.stringify(page),'已有同名页面标识对应不同内容，未覆盖原手帐。');
                                if(!old){result.push(page);ids.set(page.id,page);}
                            }
                            store.put({scope,version:1,pages:result});
                        } catch(caught){error=caught;tx.abort();}
                    };
                } catch(caught){try{tx?.abort();}catch{}reject(caught?.code?caught:fail('RMT_JOURNAL_STORAGE','本机手帐存储未能完成，原记录保留。'));}
            });
        } finally { db.close(); }
    }
    return Object.freeze({
        read:scope=>transact(scope),
        append:(scope,value)=>transact(scope,value),
        rename:(scope,id,title)=>transact(scope,undefined,{rename:{id,title:typeof title==='string'?title:''}}),
        palette:(scope,id,value)=>transact(scope,undefined,{palette:{id,value}}),
        remove:(scope,id)=>transact(scope,undefined,{remove:id}),
    });
}
