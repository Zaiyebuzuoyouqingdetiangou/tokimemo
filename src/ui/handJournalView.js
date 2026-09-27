import * as journal from '../core/handJournal.js';
import * as context from '../core/context.js';
import * as cache from '../core/cache.js';
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as letterArt from '../core/letterIllustration.js';
import * as overlay from './overlay.js';
import * as workspace from './workspace.js';
import * as routes from './workspaceState.js';
import * as room from '../modes/room.js';
import * as phone from './phoneView.js';
import { state as state } from '../core/state.js';

const esc = text.esc;
export function journalSourceRoute(entry, session) {
    if (entry.source.mode !== 'heart') return entry.source.mode;
    const path = entry.source.path || '';
    if (path.startsWith('greetings.') || path.startsWith('language')) return 'language';
    if (path.startsWith('dailyStrips')) return 'strips';
    if (path.startsWith('fireflyVoices')) return 'fireflies';
    return session?.voiceDramas?.some(item => item.id === entry.source.id && item.kind === 'postending') ? 'postending' : 'heart';
}
function sourceLabel(key) { return routes.WORKSPACE_ROUTES[key]?.title || constants.MODE_LABEL[key] || (key === 'chat' ? '聊天末条回复' : key); }
const style = `<style>
.rmt-journal{padding:18px;max-width:900px;margin:auto;min-width:0;overflow-wrap:anywhere}.rmt-journal *{box-sizing:border-box;min-width:0}.rmt-journal h2,.rmt-journal h3{margin:0 0 12px}.rmt-journal-controls,.rmt-journal-actions{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.rmt-journal label{display:grid;gap:6px;flex:1}.rmt-journal input:not([type=checkbox]),.rmt-journal select,.rmt-journal textarea{width:100%;max-width:100%;font:inherit;padding:10px;border:1px solid var(--rmt-theme-line,#ddc9d3);border-radius:12px;background:var(--rmt-theme-bg,#fff);color:inherit}.rmt-journal button{min-height:42px;white-space:normal}.rmt-journal [hidden]{display:none!important}.rmt-journal-choices{display:grid;gap:8px;max-height:40vh;overflow:auto;padding:8px 0}.rmt-journal-choices label{display:flex;align-items:start;padding:10px;border:1px solid var(--rmt-theme-line,#ddc9d3);border-radius:12px}.rmt-journal-choices input{flex-shrink:0;margin-top:5px}.rmt-journal-choices small{display:block;opacity:.75}.rmt-journal-page{padding:24px;margin:18px 0;border:1px solid #e1d7c7;border-radius:10px 22px 22px 10px;background:#fffdf3;color:#554653;box-shadow:inset 7px 0 #efe4d5,0 5px 18px #523d4810}.rmt-journal-page:nth-child(3n+2){background:#f4f9f5}.rmt-journal-page:nth-child(3n+3){background:#fff4f6}.rmt-journal-page>header{border-bottom:1px dashed #d5c8c7;margin-bottom:18px;padding-bottom:12px}.rmt-journal-saved{margin:0}.rmt-journal-page-tools{display:flex;flex-wrap:wrap;gap:8px;margin:-8px 0 18px}.rmt-journal-entry{margin-top:22px}.rmt-journal-prose{white-space:pre-wrap;line-height:1.85;margin:10px 0}.rmt-journal figure{margin:16px 0}.rmt-journal img,.rmt-journal svg{display:block;max-width:100%;height:auto;margin:auto}.rmt-journal figcaption,.rmt-journal small{font-size:13px}.rmt-journal-empty{padding:28px 8px;text-align:center;opacity:.7}.rmt-journal-compose{padding:14px;border:1px solid var(--rmt-theme-line,#ddc9d3);border-radius:18px}.rmt-journal-status{white-space:pre-wrap;line-height:1.6}.rmt-journal-status:empty{display:none}@media(max-width:420px){.rmt-journal{padding:12px}.rmt-journal-page{padding:20px 16px 20px 22px}.rmt-journal-controls{display:grid}.rmt-journal-actions button{flex:1}}
.rmt-journal-palette{display:flex;flex-wrap:wrap;align-items:end;gap:12px;border:1px solid #cdded5;border-radius:14px;margin:12px 0;padding:12px}.rmt-journal-palette label{flex:0 1 auto}.rmt-journal-palette input[type=color]{width:56px;height:40px;padding:3px;cursor:pointer}.rmt-journal-palette legend{font-size:13px}
</style>`;

export function journalPageHtml(page, index = 0) {
    const colors=journal.journalPalette(page.palette,index);
    return `<article class="rmt-journal-page" style="background:${colors.paper};color:${colors.ink};border-color:${colors.accent};box-shadow:inset 7px 0 ${colors.accent},0 5px 18px #523d4810"><header><small>${esc(new Date(page.createdAt).toLocaleDateString())}</small><h3>${esc(page.title)}</h3></header>${page.entries.map((entry, i) => `<section class="rmt-journal-entry"><small>${esc(constants.MODE_LABEL[entry.source?.mode] || (entry.source?.mode==='chat'?'聊天末条回复':'已存内容'))}</small><h4>${esc(entry.title)}</h4>${entry.blocks.map((block, j) => block.type === 'text' ? `<p class="rmt-journal-prose">${block.speaker ? `<b>${esc(block.speaker)}</b>\n` : ''}${esc(block.text)}</p>` : block.type === 'image' ? `<figure><img src="${esc(block.url)}" alt="${esc(block.caption || entry.title)}" loading="lazy"><figcaption>${esc(block.caption || '')}</figcaption></figure>` : block.type === 'letterIllustration' ? `<figure>${letterArt.renderLetterIllustration(block.illustration, {idPrefix:`journal-${page.id}-${index}-${i}-${j}`,label:entry.title})}</figure>` : '').join('')}</section>`).join('')}</article>`;
}

export function journalPaletteControls(value, pageId = '') {
    const colors=journal.journalPalette(value);
    return `<fieldset class="rmt-journal-palette" data-journal-palette="${esc(pageId)}"><legend>信纸配色</legend><label>调色盘<select data-journal-preset>${journal.JOURNAL_PALETTES.map(p=>`<option value="${p.id}" ${p.id===colors.id?'selected':''}>${p.label}</option>`).join('')}</select></label>${[['paper','纸色'],['ink','文字'],['accent','装饰']].map(([key,label])=>`<label>${label}<input type="color" data-journal-color="${key}" value="${colors[key]}" aria-label="${label}"></label>`).join('')}${pageId?'<button type="button" class="rmt-btn" data-journal-color-save>保存配色</button>':''}</fieldset>`;
}

function downloadJournal(pages) {
    const url = URL.createObjectURL(new Blob([journal.exportJournal(pages)], {type:'application/json;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download='心迹回廊-手帐.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openHandJournal() {
    room.stopRoomClock(); phone.stopPhoneClock();
    const host = document.getElementById(constants.OVERLAY_ID);
    if (!host) return false;
    const ctx = context.currentCharacterGuard();
    const liveScope = context.chatScopeKey(ctx), snapshot = state.activeArchiveSnapshot;
    const scope = snapshot ? `archive:${context.archiveSourceIdentityKey(snapshot)}|${context.comparableChatId(snapshot.chatId)}` : liveScope;
    state.activeMode='journal'; state.activeSession=null;
    routes.workspace.route='journal'; routes.workspace.tab='content'; routes.workspace.empty=null;
    overlay.topTitle('手帐'); overlay.setBackVisible(true,'内容'); overlay.setRegenerateVisible(false); overlay.setManageVisible(false);
    const body=overlay.bodyEl();
    body.innerHTML=`${style}<main class="rmt-journal"><h2>手帐</h2><p>把想留下的文字和画面，收在属于你们的册子里。</p><p class="rmt-journal-status" role="status" aria-live="polite">正在读取手帐…</p><section class="rmt-journal-compose" hidden><h3>添一页</h3><div class="rmt-journal-controls"><label>内容来源<select data-journal-source aria-label="手帐内容来源"></select></label><label>这一页的标题<input data-journal-title placeholder="给这一页起个名字"></label></div>${journalPaletteControls()}<div class="rmt-journal-actions"><button class="rmt-btn" data-journal-whole>整页导入 · 预览</button><button class="rmt-btn" data-journal-pick>从已有内容选择制作</button></div><div class="rmt-journal-choices" hidden></div><button class="rmt-btn" data-journal-preview hidden>预览所选内容</button><div class="rmt-journal-actions"><button class="rmt-btn" data-journal-save hidden>保存这一页</button><button class="rmt-btn" data-journal-cancel hidden>取消预览</button></div><div data-journal-draft hidden></div></section><div class="rmt-journal-actions"><button class="rmt-btn" data-journal-export disabled>导出手帐备份</button><button class="rmt-btn" data-journal-import disabled>导入手帐备份</button><input type="file" accept=".json,application/json" data-journal-file hidden></div><small>手帐单独保存在本设备浏览器中，可导出备份迁移。收录已有内容不消耗生成次数。</small><div data-journal-pages></div></main>`;
    const root=body.querySelector('.rmt-journal'), epoch=routes.workspace.epoch;
    const current=()=>{try{return root.isConnected && !host.hidden && state.activeMode==='journal' && state.activeArchiveSnapshot===snapshot && routes.workspace.epoch===epoch && context.chatScopeKey(context.currentCharacterGuard())===liveScope;}catch{return false;}};
    const store=journal.createJournalStore({currentScope:()=>current()?scope:''});
    const status=root.querySelector('[role=status]'), source=root.querySelector('[data-journal-source]');
    const title=root.querySelector('[data-journal-title]'), choices=root.querySelector('.rmt-journal-choices'), draft=root.querySelector('[data-journal-draft]');
    let pages=[], entries=[], pending=null, busy=false;
    const sourceRoutes = new Map();
    const disabledBeforeSave = new Map();
    const setBusy = value => {
        busy = value;
        if (value) for (const control of root.querySelectorAll('input,select,textarea,button')) {
            disabledBeforeSave.set(control, control.disabled); control.disabled = true;
        } else { for (const [control, disabled] of disabledBeforeSave) control.disabled = disabled; disabledBeforeSave.clear(); }
    };
    const report=message=>{if(current())status.textContent=message;};

    const wholeButton = () => root.querySelector('[data-journal-whole]');
    const refreshWholeLabel = () => { const count = selectedEntries().length; if (wholeButton()) wholeButton().textContent = `整页导入 · 预览（${count} 条）`; };
    const drawPages=()=>{root.querySelector('[data-journal-pages]').innerHTML=pages.map((page, index) => `<div class="rmt-journal-saved">${journalPageHtml(page, index)}<details><summary>调整这一页配色</summary>${journalPaletteControls(journal.journalPalette(page.palette,index),page.id)}</details><div class="rmt-journal-page-tools"><button type="button" class="rmt-btn" data-journal-rename="${esc(page.id)}">改标题</button><button type="button" class="rmt-btn" data-journal-delete="${esc(page.id)}">删除这一页</button></div></div>`).join('')||'<p class="rmt-journal-empty">手帐还是空白的，从上面收下第一段回忆吧。</p>';};
    const clearDraft=()=>{pending=null;draft.hidden=true;draft.replaceChildren();for(const key of ['save','cancel'])root.querySelector(`[data-journal-${key}]`).hidden=true;};
    const selectedEntries=()=>entries.filter(entry=>source.value==='*'||(sourceRoutes.get(entry.id)||entry.source.mode)===source.value);
    const readPalette=panel=>({id:panel.querySelector('[data-journal-preset]').value,...Object.fromEntries([...panel.querySelectorAll('[data-journal-color]')].map(input=>[input.dataset.journalColor,input.value]))});
    root.addEventListener('input',event=>{
        const panel=event.target.closest('[data-journal-palette]');if(!panel||busy)return;
        if(event.target.hasAttribute('data-journal-preset')){const preset=journal.JOURNAL_PALETTES.find(p=>p.id===event.target.value);for(const input of panel.querySelectorAll('[data-journal-color]'))input.value=preset[input.dataset.journalColor];}
        const colors=readPalette(panel),id=panel.dataset.journalPalette;
        if(!id&&pending){pending=journal.createJournalPage({...pending,palette:colors});draft.innerHTML=journalPageHtml(pending);}
        if(id){const paper=panel.closest('.rmt-journal-saved')?.querySelector('.rmt-journal-page');if(paper){paper.style.background=colors.paper;paper.style.color=colors.ink;paper.style.borderColor=colors.accent;paper.style.boxShadow=`inset 7px 0 ${colors.accent},0 5px 18px #523d4810`;}}
    });
    const preview=items=>{if(!items.length)return report('先选择想收录的内容。');pending=journal.createJournalPage({title:title.value||`${source.selectedOptions[0]?.textContent || '我们的回忆'}`,entries:items,palette:readPalette(root.querySelector('[data-journal-palette=""]'))});draft.innerHTML=journalPageHtml(pending);draft.hidden=false;root.querySelector('[data-journal-save]').hidden=false;root.querySelector('[data-journal-cancel]').hidden=false;report(`预览已准备好，这一页有 ${items.length} 条。保存后会新增，不会覆盖旧页。`);};
    const openPicker=()=>{clearDraft();choices.innerHTML=selectedEntries().map(entry=>`<label><input type="checkbox" value="${esc(entry.id)}"><span>${esc(entry.title)}<small>${esc(constants.MODE_LABEL[entry.source.mode] || (entry.source.mode==='chat'?'聊天末条回复':'已存内容'))}</small></span></label>`).join('');choices.hidden=false;root.querySelector('[data-journal-preview]').hidden=false;};
    workspace.syncWorkspaceChrome();
    try {
        pages=await store.read(scope);
        if(!current())return false;
        if(!snapshot)await cache.ensureCacheHydrated(ctx);
        if(!current())return false;
        for(const mode of Object.values(constants.MODE)) {
            const session=cache.loadSession(mode,snapshot?{cache:snapshot.cache,chatId:snapshot.chatId,memoryBank:snapshot.memory,clone:true}:{context:ctx,clone:true});
            if(session) {
                const extracted = journal.extractJournalEntries(mode,session);
                extracted.forEach(entry=>sourceRoutes.set(entry.id,journalSourceRoute(entry,session)));
                entries.push(...extracted);
            }
        }
        if (!snapshot) {
            const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
            const last = chat.findLastIndex(message => message && message.is_user === false && !message.is_system && typeof message.mes === 'string' && message.mes.length > 0);
            if (last >= 0) entries.push({id:'chat:last-reply',title:`第 ${last + 1} 楼 · ${chat[last].name || ctx.name2 || 'TA'}`,source:{mode:'chat',id:String(last),title:'聊天末条回复'},blocks:[{type:'text',text:chat[last].mes}]});
        }
        const modes=[...new Set(entries.map(entry=>sourceRoutes.get(entry.id)||entry.source.mode))];
        source.innerHTML=modes.map(mode=>`<option value="${esc(mode)}">${esc(sourceLabel(mode))}</option>`).join('') + (modes.length > 1 ? '<option value="*">跨模块挑选内容</option>' : '');
        refreshWholeLabel();
        drawPages();root.querySelector('.rmt-journal-compose').hidden=!entries.length;
        root.querySelector('[data-journal-export]').disabled=false;root.querySelector('[data-journal-import]').disabled=false;
        report(entries.length?'':'还没有可收录的已存内容。也可以导入之前导出的手帐备份。');
    }catch(error){report(`手帐读取失败，原数据保留：${error.message}`);return false;}
    title.addEventListener('input',()=>{if(pending){pending=journal.createJournalPage({...pending,title:title.value});draft.querySelector('header h3').textContent=title.value;}});
    root.addEventListener('change',event=>{if(event.target===source){clearDraft();choices.hidden=true;root.querySelector('[data-journal-preview]').hidden=true;refreshWholeLabel();}});
    root.addEventListener('click',async event=>{
        const button=event.target.closest('button');if(!button||busy||!current())return;
        try {
            if(button.hasAttribute('data-journal-whole')){const items=selectedEntries();preview(items);}
            else if(button.hasAttribute('data-journal-color-save')){const panel=button.closest('[data-journal-palette]');setBusy(true);await store.palette(scope,panel.dataset.journalPalette,readPalette(panel));if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已保存这一页的配色。');}
            else if(button.hasAttribute('data-journal-pick'))openPicker();
            else if(button.hasAttribute('data-journal-rename')){const id=button.getAttribute('data-journal-rename');const page=pages.find(item=>item.id===id);if(!page)return;const nextTitle=globalThis.prompt('给这一页换个标题',page.title);if(nextTitle==null)return;setBusy(true);await store.rename(scope,id,nextTitle);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已改这一页的标题。');}
            else if(button.hasAttribute('data-journal-delete')){const id=button.getAttribute('data-journal-delete');if(!pages.some(item=>item.id===id))return;if(!overlay.confirmExplicitAction('删除这一页手帐？','只删除本机手帐里的这一页，不改原来的档案和内容。',{destructive:true}))return;setBusy(true);await store.remove(scope,id);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已删除这一页。');}
            else if(button.hasAttribute('data-journal-preview')){const ids=new Set([...choices.querySelectorAll('input:checked')].map(input=>input.value));preview(selectedEntries().filter(entry=>ids.has(entry.id)));}
            else if(button.hasAttribute('data-journal-cancel'))clearDraft();
            else if(button.hasAttribute('data-journal-save')&&pending){setBusy(true);report('正在保存手帐…');const saved=pending;await store.append(scope,[saved]);if(!current())return;pages=await store.read(scope);if(!current())return;clearDraft();drawPages();report('已保存到手帐。');}
            else if(button.hasAttribute('data-journal-export'))downloadJournal(pages);
            else if(button.hasAttribute('data-journal-import'))root.querySelector('[data-journal-file]').click();
        }catch(error){report(`未完成，已有手帐和预览保留：${error.message}`);}finally{setBusy(false);}
    });
    root.querySelector('[data-journal-file]').addEventListener('change',async event=>{
        const file=event.target.files?.[0];if(!file||busy)return;
        setBusy(true);
        try{const imported=journal.importJournal(await file.text());if(!current())return;await store.append(scope,imported);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report(`已导入手帐备份（${imported.length} 页），原有页面保留。`);}
        catch(error){report(`导入失败，原手帐保留：${error.message}`);}finally{setBusy(false);event.target.value='';}
    });
    return true;
}
