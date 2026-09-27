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
import * as generation_client from '../generation/client.js';
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
.rmt-journal-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.rmt-journal-top p{margin:0;color:var(--rmt-theme-muted)}
.rmt-journal details>summary{list-style:none;cursor:pointer}.rmt-journal details>summary::-webkit-details-marker{display:none}
.rmt-journal-more{position:relative;flex:0 0 auto}.rmt-journal-more>summary,.rmt-journal-page-more>summary{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid,var(--rmt-theme-surface));font-size:18px;line-height:1}
.rmt-journal-more-list,.rmt-journal-page-more-list{display:grid;gap:6px;margin-top:6px;padding:8px;min-width:210px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-surface-solid,var(--rmt-theme-surface))}
.rmt-journal-more[open] .rmt-journal-more-list{position:absolute;right:0;z-index:5}.rmt-journal-more-list small{color:var(--rmt-theme-muted);font-size:12px;line-height:1.6}
.rmt-journal-filter{display:flex;gap:8px;overflow-x:auto;margin:14px 0 10px;padding-bottom:2px}.rmt-journal-filter button{flex:0 0 auto;min-height:34px;padding:4px 14px;border-radius:999px;border:1px solid var(--rmt-theme-border);background:transparent;color:var(--rmt-theme-text);font-size:13px;cursor:pointer}.rmt-journal-filter button[aria-pressed="true"]{background:var(--rmt-theme-surface-tint,var(--rmt-theme-soft));font-weight:600}
.rmt-journal-book{touch-action:pan-y}
.rmt-journal-page{position:relative;margin:18px 0 10px;padding:26px clamp(16px,4vw,28px) 20px;border:1px solid;border-left-width:6px;border-radius:6px 16px 16px 6px}
.rmt-journal-tape{position:absolute;top:-9px;left:50%;width:96px;height:20px;transform:translateX(-50%) rotate(-3deg);background:var(--rmt-journal-accent);opacity:.8;border-radius:2px}
.rmt-journal-page>header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.rmt-journal-page>header h3{margin:0;font-size:19px}
.rmt-journal-stamp{flex:0 0 auto;padding:1px 7px;border:1.5px solid var(--rmt-journal-ink);border-radius:6px;font-size:12px;transform:rotate(6deg);opacity:.75}
.rmt-journal-fav-mark{flex:0 0 auto;color:var(--rmt-journal-ink);opacity:.8}
.rmt-journal-photo{margin:12px auto;padding:8px 8px 22px;max-width:min(100%,520px);background:#fff;border:1px solid var(--rmt-journal-accent);transform:rotate(var(--rmt-photo-tilt,0deg));box-shadow:0 4px 12px #0000000f}
.rmt-journal-photo img{display:block;width:100%;height:auto}.rmt-journal-photo figcaption{margin-top:6px;text-align:center;font-size:12px;color:#6b5a50}
.rmt-journal-note{position:relative;margin:14px 0 4px auto;max-width:min(100%,320px);padding:10px 30px 10px 12px;background:var(--rmt-journal-accent);color:var(--rmt-journal-ink);transform:rotate(var(--rmt-note-tilt,0deg));box-shadow:0 3px 8px #0000000f}.rmt-journal-note p{margin:0;white-space:pre-wrap;font-size:14px;line-height:1.7}
.rmt-journal-note-remove{position:absolute;top:2px;right:4px;width:28px;height:28px;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:inherit!important;font-size:16px;cursor:pointer;opacity:.7}
.rmt-journal-page-bar{display:flex;align-items:flex-start;justify-content:flex-end;gap:8px}.rmt-journal-page-more{position:relative}.rmt-journal-page-more[open] .rmt-journal-page-more-list{position:absolute;right:0;z-index:5}
.rmt-journal-note-editor{display:grid;gap:8px;margin:10px 0}.rmt-journal-note-editor textarea{min-height:88px}
.rmt-journal-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 16px}.rmt-journal-pager span{color:var(--rmt-theme-muted);font-size:13px}
.rmt-journal-add{margin:10px 0 16px}.rmt-journal-add>summary{display:flex;justify-content:center}.rmt-journal-add>summary span{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:8px 20px;border-radius:999px;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid,var(--rmt-theme-surface))}
.rmt-journal-steps{margin:10px 0 0;padding-left:1.4em;color:var(--rmt-theme-muted);font-size:13px}.rmt-journal-deco>summary{margin:10px 0;color:var(--rmt-theme-muted);font-size:14px}
.rmt-journal-annotation{margin:16px 0 0;padding-left:12px;border-left:2px solid var(--rmt-journal-accent);font-family:'LXGW WenKai','Kaiti SC',STKaiti,KaiTi,serif;font-size:15px;line-height:1.8;transform:rotate(-.6deg)}.rmt-journal-annotation span{display:block;font-size:12px;opacity:.7}
.rmt-journal-layout-photo .rmt-journal-photo{transform:none;max-width:100%;padding:6px}.rmt-journal-layout-photo .rmt-journal-prose{font-size:14px}
.rmt-journal-layout-quote .rmt-journal-prose{position:relative;padding:4px 0 4px 26px;font-family:'Noto Serif SC',Georgia,serif;font-size:17px;line-height:1.9}.rmt-journal-layout-quote .rmt-journal-prose:before{content:'“';position:absolute;left:0;top:-6px;font-size:34px;opacity:.45}.rmt-journal-layout-quote .rmt-journal-photo{max-width:min(100%,260px)}
.rmt-journal-layout-timeline .rmt-journal-entry{position:relative;margin-left:10px;padding:0 0 14px 18px;border-left:2px solid var(--rmt-journal-accent)}.rmt-journal-layout-timeline .rmt-journal-entry:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--rmt-journal-accent)}
.rmt-journal-quote{display:grid;gap:8px;margin:10px 0}.rmt-journal-quote textarea{min-height:110px}
</style>`;

// r84.174：像实体手帐：顶上一条和纸胶带，日期做成印章，图片是微微歪斜的拍立得，便签贴在页上。
// editable 只在手帐页本身打开（预览和导出不带删除按钮）。
export function journalPageHtml(page, index = 0, { editable = false } = {}) {
    const colors=journal.journalPalette(page.palette,index);
    let photo = 0;
    const date = new Date(page.createdAt);
    const stamp = Number.isFinite(date.getTime()) ? `${date.getMonth() + 1} · ${date.getDate()}` : '';
    const notes = (page.notes || []).map((note, n) => `<aside class="rmt-journal-note" style="--rmt-note-tilt:${n % 2 ? 2 : -2}deg"><p>${esc(note.text)}</p>${editable ? `<button type="button" class="rmt-journal-note-remove" data-journal-note-remove="${esc(note.id)}" aria-label="撕下这张便签" style="background:transparent!important;border:0!important;box-shadow:none!important;min-width:0!important;min-height:0!important">×</button>` : ''}</aside>`).join('');
    const layout = journal.JOURNAL_LAYOUTS.some(item => item.id === page.layout) ? page.layout : 'collage';
    const annotation = page.annotation?.text ? `<p class="rmt-journal-annotation">${esc(page.annotation.text)}${page.annotation.by ? `<span>—— ${esc(page.annotation.by)}</span>` : ''}</p>` : '';
    return `<article class="rmt-journal-page rmt-journal-layout-${layout}" style="--rmt-journal-paper:${colors.paper};--rmt-journal-ink:${colors.ink};--rmt-journal-accent:${colors.accent};background:${colors.paper};color:${colors.ink};border-color:${colors.accent}"><span class="rmt-journal-tape" aria-hidden="true"></span><header><h3>${esc(page.title)}</h3>${stamp ? `<span class="rmt-journal-stamp" title="${esc(date.toLocaleDateString())}">${stamp}</span>` : ''}${page.favorite ? '<span class="rmt-journal-fav-mark" aria-label="已收藏">★</span>' : ''}</header>${page.entries.map((entry, i) => `<section class="rmt-journal-entry"><small>${esc(constants.MODE_LABEL[entry.source?.mode] || (entry.source?.mode==='chat'?'聊天末条回复':'已存内容'))}</small><h4>${esc(entry.title)}</h4>${entry.blocks.map((block, j) => block.type === 'text' ? `<p class="rmt-journal-prose">${block.speaker ? `<b>${esc(block.speaker)}</b>\n` : ''}${esc(block.text)}</p>` : block.type === 'image' ? `<figure class="rmt-journal-photo" style="--rmt-photo-tilt:${(photo++ % 2) ? 1.5 : -1.5}deg"><img src="${esc(block.url)}" alt="${esc(block.caption || entry.title)}" loading="lazy"><figcaption>${esc(block.caption || entry.title || '')}</figcaption></figure>` : block.type === 'letterIllustration' ? `<figure>${letterArt.renderLetterIllustration(block.illustration, {idPrefix:`journal-${page.id}-${index}-${i}-${j}`,label:entry.title})}</figure>` : '').join('')}</section>`).join('')}${notes}${annotation}</article>`;
}

function layoutSelect(value = 'collage', pageId = '') {
    return `<label>版式<select ${pageId ? `data-journal-layout="${esc(pageId)}"` : 'data-journal-layout-new'}>${journal.JOURNAL_LAYOUTS.map(item => `<option value="${item.id}" ${item.id === (value || 'collage') ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>`;
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
    body.innerHTML=`${style}<main class="rmt-journal"><header class="rmt-journal-top"><div><h2>手帐</h2><p>把想留下的文字和画面，收在属于你们的册子里。</p></div><details class="rmt-journal-more"><summary aria-label="更多">⋯</summary><div class="rmt-journal-more-list"><button type="button" class="rmt-btn" data-journal-export disabled>导出手帐备份</button><button type="button" class="rmt-btn" data-journal-import disabled>导入手帐备份</button><button type="button" class="rmt-btn" data-journal-annotate disabled>请他批注这个月的手帐</button><small>手帐单独保存在本设备浏览器中，可导出备份迁移。收录已有内容不消耗生成次数。</small></div></details></header><p class="rmt-journal-status" role="status" aria-live="polite">正在读取手帐…</p><nav class="rmt-journal-filter" data-journal-filters aria-label="按月份筛选"></nav><section class="rmt-journal-book" data-journal-pages></section><div class="rmt-journal-pager" data-journal-pager hidden><button type="button" class="rmt-btn" data-journal-prev>‹ 上一页</button><span data-journal-count></span><button type="button" class="rmt-btn" data-journal-next>下一页 ›</button></div><details class="rmt-journal-add" hidden><summary><span>＋ 添一页</span></summary><section class="rmt-journal-compose"><ol class="rmt-journal-steps"><li>选内容</li><li>看看排版</li><li>保存</li></ol><div class="rmt-journal-controls"><label>内容来源<select data-journal-source aria-label="手帐内容来源"></select></label><label>这一页的标题<input data-journal-title placeholder="给这一页起个名字"></label></div><div class="rmt-journal-quote" data-journal-quote hidden><label>第几楼<select data-journal-quote-floor aria-label="选择聊天楼层"></select></label><label>摘下来的这句（可以删减）<textarea data-journal-quote-text></textarea></label><button class="rmt-btn" data-journal-quote-preview>预览这一句</button></div><div class="rmt-journal-actions" data-journal-import-actions><button class="rmt-btn" data-journal-whole>整页导入 · 预览</button><button class="rmt-btn" data-journal-pick>从已有内容选择制作</button></div><div class="rmt-journal-choices" hidden></div><button class="rmt-btn" data-journal-preview hidden>预览所选内容</button><details class="rmt-journal-deco"><summary>版式、装饰与配色 ›</summary>${layoutSelect()}${journalPaletteControls()}</details><div data-journal-draft hidden></div><div class="rmt-journal-actions"><button class="rmt-btn" data-journal-save hidden>保存这一页</button><button class="rmt-btn" data-journal-cancel hidden>取消预览</button></div></section></details><input type="file" accept=".json,application/json" data-journal-file hidden></main>`;
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
    // r84.174：一次看一页，左右翻；按月份 / 收藏筛选；每一页的操作收进这一页的 ⋯。
    let filter='all', currentId='', noteFor='', quoteRows=[];
    const syncQuote=()=>{const quote=source.value==='chat-quote';root.querySelector('[data-journal-quote]').hidden=!quote;root.querySelector('[data-journal-import-actions]').hidden=quote;
        if(quote){const floor=Number(root.querySelector('[data-journal-quote-floor]').value);const row=quoteRows.find(item=>item.index===floor);const box=root.querySelector('[data-journal-quote-text]');if(row&&box.dataset.floor!==String(floor)){box.value=row.message.mes;box.dataset.floor=String(floor);}}};
    const monthKey=page=>{const d=new Date(page.createdAt);return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'';};
    const shownPages=()=>pages.filter(page=>filter==='all'||(filter==='fav'?page.favorite===true:monthKey(page)===filter));
    const drawPages=()=>{
        const months=[...new Set(pages.map(monthKey).filter(Boolean))].sort().reverse();
        if(filter==='fav'&&!pages.some(page=>page.favorite))filter='all';
        if(filter!=='all'&&filter!=='fav'&&!months.includes(filter))filter='all';
        const chip=(value,label)=>`<button type="button" data-journal-filter="${esc(value)}" aria-pressed="${filter===value}">${esc(label)}</button>`;
        root.querySelector('[data-journal-filters]').innerHTML=pages.length?chip('all',`全部 · ${pages.length} 页`)+(pages.some(page=>page.favorite)?chip('fav','★ 收藏'):'')+months.map(m=>chip(m,`${Number(m.slice(0,4))} 年 ${Number(m.slice(5))} 月`)).join(''):'';
        const shown=shownPages();
        let index=shown.findIndex(page=>page.id===currentId);
        if(index<0)index=shown.length-1;
        const page=shown[index];currentId=page?.id||'';
        const whole=page?pages.indexOf(page):0;
        root.querySelector('[data-journal-pages]').innerHTML=page?`<div class="rmt-journal-saved" data-journal-current="${esc(page.id)}">${journalPageHtml(page, whole, {editable:true})}${noteFor===page.id?`<div class="rmt-journal-note-editor"><textarea data-journal-note-text aria-label="便签内容" placeholder="写点什么，贴在这一页上"></textarea><div class="rmt-journal-actions"><button type="button" class="rmt-btn" data-journal-note-save>贴上</button><button type="button" class="rmt-btn" data-journal-note-cancel>取消</button></div></div>`:''}<div class="rmt-journal-page-bar"><button type="button" class="rmt-btn" data-journal-fav="${esc(page.id)}" aria-pressed="${page.favorite===true}">${page.favorite?'★ 已收藏':'☆ 收藏'}</button><details class="rmt-journal-page-more"><summary aria-label="这一页的更多操作">⋯</summary><div class="rmt-journal-page-more-list"><button type="button" class="rmt-btn" data-journal-note-open="${esc(page.id)}">贴一张便签</button><button type="button" class="rmt-btn" data-journal-rename="${esc(page.id)}">改标题</button>${layoutSelect(page.layout, page.id)}<details><summary>调整这一页配色 ›</summary>${journalPaletteControls(journal.journalPalette(page.palette,whole),page.id)}</details><button type="button" class="rmt-btn" data-journal-delete="${esc(page.id)}">删除这一页</button></div></details></div></div>`:`<p class="rmt-journal-empty">${pages.length?'这一组里还没有页。':'手帐还是空白的，点下面的「＋ 添一页」收下第一段回忆吧。'}</p>`;
        syncPager();
        const editor=root.querySelector('[data-journal-note-text]');if(editor)editor.focus();
    };
    // 翻页按钮的状态单独算：保存时 setBusy 会把按钮恢复成保存前的样子，保存完要重新对一次。
    const syncPager=()=>{const shown=shownPages();const index=shown.findIndex(page=>page.id===currentId);
        root.querySelector('[data-journal-pager]').hidden=shown.length<2;
        root.querySelector('[data-journal-count]').textContent=shown.length?`${index+1} / ${shown.length}`:'';
        root.querySelector('[data-journal-prev]').disabled=index<=0;root.querySelector('[data-journal-next]').disabled=index<0||index>=shown.length-1;};
    const turn=step=>{const shown=shownPages();const index=shown.findIndex(page=>page.id===currentId);const next=shown[index+step];if(next){currentId=next.id;noteFor='';drawPages();}};
    // 手机上左右滑动翻页；在按钮、输入框和菜单上滑动不算。
    {let swipe=null;const book=root.querySelector('[data-journal-pages]');
    book.addEventListener('pointerdown',e=>{swipe=e.target.closest('button,textarea,input,select,summary,details,a')?null:{x:e.clientX,y:e.clientY};});
    book.addEventListener('pointerup',e=>{if(!swipe||busy)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);});
    book.addEventListener('pointercancel',()=>{swipe=null;});}
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
    const preview=items=>{if(!items.length)return report('先选择想收录的内容。');pending=journal.createJournalPage({title:title.value||`${source.selectedOptions[0]?.textContent || '我们的回忆'}`,entries:items,palette:readPalette(root.querySelector('[data-journal-palette=""]')),layout:root.querySelector('[data-journal-layout-new]')?.value});draft.innerHTML=journalPageHtml(pending);draft.hidden=false;root.querySelector('[data-journal-save]').hidden=false;root.querySelector('[data-journal-cancel]').hidden=false;report(`预览已准备好，这一页有 ${items.length} 条。保存后会新增，不会覆盖旧页。`);};
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
        // r84.175：从聊天摘一句——选一楼，删减成想留下的那句。
        const chatRows = snapshot ? [] : (Array.isArray(ctx.chat) ? ctx.chat : []).map((message, index) => ({ message, index })).filter(row => row.message && !row.message.is_system && typeof row.message.mes === 'string' && row.message.mes.trim()).slice(-80).reverse();
        quoteRows = chatRows;
        source.innerHTML=modes.map(mode=>`<option value="${esc(mode)}">${esc(sourceLabel(mode))}</option>`).join('') + (modes.length > 1 ? '<option value="*">跨模块挑选内容</option>' : '') + (chatRows.length ? '<option value="chat-quote">从聊天摘一句</option>' : '');
        root.querySelector('[data-journal-quote-floor]').innerHTML=chatRows.map(row=>`<option value="${row.index}">第 ${row.index + 1} 楼 · ${esc(row.message.name || (row.message.is_user ? ctx.name1 : ctx.name2) || '')}</option>`).join('');
        root.querySelector('[data-journal-annotate]').disabled=!!snapshot;
        refreshWholeLabel();
        drawPages();root.querySelector('.rmt-journal-add').hidden=!entries.length&&!quoteRows.length;syncQuote();
        root.querySelector('[data-journal-export]').disabled=false;root.querySelector('[data-journal-import]').disabled=false;
        report(entries.length?'':'还没有可收录的已存内容。也可以导入之前导出的手帐备份。');
    }catch(error){report(`手帐读取失败，原数据保留：${error.message}`);return false;}
    title.addEventListener('input',()=>{if(pending){pending=journal.createJournalPage({...pending,title:title.value});draft.querySelector('header h3').textContent=title.value;}});
    root.addEventListener('change',async event=>{
        if(event.target===source){clearDraft();choices.hidden=true;root.querySelector('[data-journal-preview]').hidden=true;refreshWholeLabel();syncQuote();return;}
        if(event.target.matches('[data-journal-quote-floor]')){syncQuote();return;}
        if(event.target.matches('[data-journal-layout-new]')){if(pending){pending=journal.createJournalPage({...pending,layout:event.target.value});draft.innerHTML=journalPageHtml(pending);}return;}
        if(event.target.matches('[data-journal-layout]')&&!busy&&current()){const id=event.target.getAttribute('data-journal-layout');try{setBusy(true);await store.layout(scope,id,event.target.value);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已换这一页的版式。');}catch(error){report(`未完成，原页面保留：${error.message}`);}finally{setBusy(false);syncPager();}}
    });
    root.addEventListener('click',async event=>{
        const button=event.target.closest('button');if(!button||busy||!current())return;
        try {
            if(button.hasAttribute('data-journal-quote-preview')){const floor=Number(root.querySelector('[data-journal-quote-floor]').value);const row=quoteRows.find(item=>item.index===floor);const value=root.querySelector('[data-journal-quote-text]').value;if(!row||!value.trim())return report('先选一楼，留下想摘的那句。');const name=row.message.name||(row.message.is_user?ctx.name1:ctx.name2)||'';preview([{id:`quote:${floor}:${Date.now()}`,title:`摘自 ${name} · 第 ${floor+1} 楼`,source:{mode:'chat',id:String(floor),title:'聊天摘句'},blocks:[{type:'text',text:value,...(name?{speaker:name}:{})}]}]);return;}
            if(button.hasAttribute('data-journal-annotate')){
                if(snapshot)return report('正在翻看只读档案，回到当前聊天后再请他批注。');
                const here=pages.find(page=>page.id===currentId)||pages[pages.length-1];if(!here)return report('手帐还是空的。');
                const month=monthKey(here);const target=pages.filter(page=>monthKey(page)===month&&!page.annotation);
                if(!target.length)return report('这个月的每一页都已经有他的批注了。');
                if(!overlay.confirmExplicitAction(`请他批注这个月的 ${target.length} 页？`,`会发 1 次文字请求，一次写完这 ${target.length} 页；已有批注的页不动。`,{}))return;
                setBusy(true);report('正在请他写批注…');
                const card=ctx.characters?.[ctx.characterId]||{};const persona=[card.description,card.personality].filter(item=>typeof item==='string'&&item.trim()).join('\n').slice(0,2000);
                const parsed=await generation_client.generateConfiguredJson(journal.journalAnnotationPrompt(target,{charName:ctx.name2||'角色',userName:ctx.name1||'用户',persona}),{});
                if(!current())return;
                const found=journal.parseJournalAnnotations(parsed,target),at=Date.now();
                const map=Object.fromEntries(Object.entries(found).map(([id,note])=>[id,{text:note,at,by:ctx.name2||''}]));
                if(!Object.keys(map).length)return report('这次没有收到能用的批注，原页面没有改动。');
                await store.annotate(scope,map);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();
                report(`已写好 ${Object.keys(map).length} 页的批注${Object.keys(map).length<target.length?`，另有 ${target.length-Object.keys(map).length} 页这次没写上，可以再点一次`:''}。`);return;
            }
            if(button.hasAttribute('data-journal-filter')){filter=button.getAttribute('data-journal-filter');currentId='';noteFor='';drawPages();return;}
            if(button.hasAttribute('data-journal-prev')){turn(-1);return;}
            if(button.hasAttribute('data-journal-next')){turn(1);return;}
            if(button.hasAttribute('data-journal-fav')){const id=button.getAttribute('data-journal-fav');const page=pages.find(item=>item.id===id);if(!page)return;setBusy(true);await store.favorite(scope,id,page.favorite!==true);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report(page.favorite?'已取消收藏。':'已收藏这一页。');return;}
            if(button.hasAttribute('data-journal-note-open')){noteFor=button.getAttribute('data-journal-note-open');drawPages();return;}
            if(button.hasAttribute('data-journal-note-cancel')){noteFor='';drawPages();return;}
            if(button.hasAttribute('data-journal-note-save')){const page=pages.find(item=>item.id===noteFor);const value=root.querySelector('[data-journal-note-text]')?.value||'';if(!page||!value.trim())return report('便签还是空的。');setBusy(true);const note={id:globalThis.crypto?.randomUUID?.()||`note-${Date.now()}`,text:value};await store.notes(scope,page.id,[...(page.notes||[]),note]);if(!current())return;pages=await store.read(scope);if(!current())return;noteFor='';drawPages();report('便签已贴上。');return;}
            if(button.hasAttribute('data-journal-note-remove')){const noteId=button.getAttribute('data-journal-note-remove');const page=pages.find(item=>(item.notes||[]).some(note=>note.id===noteId));if(!page)return;setBusy(true);await store.notes(scope,page.id,page.notes.filter(note=>note.id!==noteId));if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已撕下这张便签。');return;}
            if(button.hasAttribute('data-journal-whole')){const items=selectedEntries();preview(items);}
            else if(button.hasAttribute('data-journal-color-save')){const panel=button.closest('[data-journal-palette]');setBusy(true);await store.palette(scope,panel.dataset.journalPalette,readPalette(panel));if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已保存这一页的配色。');}
            else if(button.hasAttribute('data-journal-pick'))openPicker();
            else if(button.hasAttribute('data-journal-rename')){const id=button.getAttribute('data-journal-rename');const page=pages.find(item=>item.id===id);if(!page)return;const nextTitle=globalThis.prompt('给这一页换个标题',page.title);if(nextTitle==null)return;setBusy(true);await store.rename(scope,id,nextTitle);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已改这一页的标题。');}
            else if(button.hasAttribute('data-journal-delete')){const id=button.getAttribute('data-journal-delete');if(!pages.some(item=>item.id===id))return;if(!overlay.confirmExplicitAction('删除这一页手帐？','只删除本机手帐里的这一页，不改原来的档案和内容。',{destructive:true}))return;setBusy(true);await store.remove(scope,id);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report('已删除这一页。');}
            else if(button.hasAttribute('data-journal-preview')){const ids=new Set([...choices.querySelectorAll('input:checked')].map(input=>input.value));preview(selectedEntries().filter(entry=>ids.has(entry.id)));}
            else if(button.hasAttribute('data-journal-cancel'))clearDraft();
            else if(button.hasAttribute('data-journal-save')&&pending){setBusy(true);report('正在保存手帐…');const saved=pending;await store.append(scope,[saved]);if(!current())return;pages=await store.read(scope);if(!current())return;clearDraft();filter='all';currentId=saved.id;root.querySelector('.rmt-journal-add').open=false;drawPages();report('已保存到手帐。');}
            else if(button.hasAttribute('data-journal-export'))downloadJournal(pages);
            else if(button.hasAttribute('data-journal-import'))root.querySelector('[data-journal-file]').click();
        }catch(error){report(`未完成，已有手帐和预览保留：${error.message}`);}finally{setBusy(false);syncPager();}
    });
    root.querySelector('[data-journal-file]').addEventListener('change',async event=>{
        const file=event.target.files?.[0];if(!file||busy)return;
        setBusy(true);
        try{const imported=journal.importJournal(await file.text());if(!current())return;await store.append(scope,imported);if(!current())return;pages=await store.read(scope);if(!current())return;drawPages();report(`已导入手帐备份（${imported.length} 页），原有页面保留。`);}
        catch(error){report(`导入失败，原手帐保留：${error.message}`);}finally{setBusy(false);syncPager();event.target.value='';}
    });
    return true;
}
