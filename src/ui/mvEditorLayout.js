// Approved workbench layout. This module owns presentation only; no requests,
// model limits, image processing, audio transport or persistence live here.
export const EDITOR_PAGE_SIZE = 4;

export function editorFilmstripMarkup({ btn, selectedLabel, strip, stripNav }) {
    return `<div class="rmt-mve-strip-head"><small data-rmt-mv-selection>${selectedLabel}</small><div class="rmt-mve-strip-actions">${stripNav}${btn('editor-drawer', '全部分镜', { id: 'shots' })}</div></div><div class="rmt-mv-strip">${strip}</div>`;
}

export function editorMarkup(o) {
    const { esc, btn, song, tab, panels, width, height, time, total, playing, audio, audioName, exporting, drawer, drawerHtml } = o;
    const musicLabel = audio ? (audioName || song.title) : '导入音乐';
    const pending = Math.max(0, Number(o.pendingCount) || 0);
    const moreLabel = `⋯${pending ? ` <span class="rmt-mve-pending-count">${pending}</span>` : ''}`;
    const tabs = [['shots', '分镜'], ['timing', '定段 · 定句'], ['look', '全片样式']].map(([id, label]) =>
        btn('editor-tab', label, { id, cls: 'rmt-mve-tab' + (tab === id ? ' on' : ''), extra: ` role="tab" aria-selected="${tab === id}" aria-pressed="${tab === id}" aria-controls="rmt-mve-active-panel"` })).join('');
    const drawerTitle = { export: '导出手书', more: '素材与项目', audio: '歌曲', shots: '全部分镜' }[drawer] || '选项';
    return `<header class="rmt-mve-head">${btn('back', '‹', { cls: 'rmt-mve-back', extra: ' aria-label="返回素材库"' })}<div class="rmt-mve-title"><h2>${esc(song.title)}</h2><small>手书剪辑台</small></div><div class="rmt-mve-head-actions">${btn('editor-drawer', moreLabel, { id: 'more', cls: 'rmt-mve-more', extra: ` aria-label="${pending ? `更多，${pending} 份结果待保存` : '更多操作'}"${pending ? ` data-rmt-mv-pending="${pending}"` : ''}` })}${btn('editor-drawer', '导出', { id: 'export', cls: 'rmt-x-primary' })}</div></header>
      <div class="rmt-mve-layout-scope"><div class="rmt-mve-workspace" data-editor-tab="${tab}" data-editor-paged="${!!o.stripNav}" data-preview-only="${!!o.previewOnly}"><section class="rmt-mve-preview" aria-label="手书预览">
        <div class="rmt-mve-preview-head"><span data-rmt-mv-current>${esc(o.selectedLabel)}</span>${btn('editor-preview', o.previewOnly ? '恢复编辑' : '只看画面', { extra: ` aria-pressed="${!!o.previewOnly}"` })}</div>
        <div class="rmt-mv-canvas-wrap${width < height ? ' portrait' : ''}"><canvas data-rmt-mv-canvas width="${width}" height="${height}" aria-label="当前分镜画面"></canvas></div>
        <div class="rmt-mve-transport"><button type="button" class="rmt-mv-play" data-rmt-mv="play" aria-label="${playing ? '暂停' : '播放'}"${exporting ? ' disabled' : ''}>${playing ? '❚❚' : '▶'}</button><span class="rmt-mve-clock" data-rmt-mv-time>${esc(time)}</span><input type="range" min="0" max="${total}" step="0.1" value="${o.seconds}" data-rmt-mv-seek aria-label="播放位置"${exporting ? ' disabled' : ''}><small>${esc(o.totalLabel)}</small></div>
        <div class="rmt-mve-projectbar">${btn('editor-drawer', `<span aria-hidden="true">♪</span> <span>${esc(musicLabel)}</span> <span aria-hidden="true">›</span>`, { id: 'audio', extra: ` title="${esc(musicLabel)}" aria-label="${audio ? '管理当前音乐：' + esc(musicLabel) : '导入音乐'}"` })}<small class="rmt-mve-meta">${audio ? '音画同步' : '静音预览'}</small></div>
        <div class="rmt-mve-filmstrip" data-rmt-mv-filmstrip>${editorFilmstripMarkup({ ...o, selectedLabel: esc(o.selectedLabel) })}</div>
      </section><section class="rmt-mve-tools" aria-label="剪辑工具"><nav class="rmt-mve-tabs" role="tablist" aria-label="剪辑工作区">${tabs}</nav><div id="rmt-mve-active-panel" role="tabpanel" aria-label="${esc({shots:'分镜',timing:'定段与定句',look:'全片样式'}[tab] || '分镜')}" class="rmt-mve-panel"${tab === 'shots' ? ' data-rmt-mv-shot-panel' : ''}>${panels[tab] || panels.shots}</div></section></div></div>
      ${drawer ? `<div class="rmt-mve-sheet-shade"><section class="rmt-mve-sheet" data-editor-drawer="${drawer}" role="dialog" aria-modal="true" aria-label="${esc(drawerTitle)}"><header><b>${esc(drawerTitle)}</b>${btn('editor-drawer', '关闭', { extra: ' aria-label="关闭选项面板"' })}</header><div>${drawerHtml}</div></section></div>` : ''}`;
}

export function editorLayoutCss(root) {
    // Structural themes have important global metrics. Only the editor gets
    // these scoped overrides; other pages retain their original typography.
    const r = `${root} .rmt-body.rmt-mve-body .rmt-x-page.rmt-mv-editor`;
    const focus = `${root} .rmt-shell.rmt-mve-focus`;
    const themed = `${root}.rmt-workspace[data-rmt-theme-mode] .rmt-shell.rmt-mve-focus`;
    return `
${focus}>.rmt-topbar,${focus}>.rmt-workspace-tabs,${focus}>.rmt-workspace-location,${themed}>.rmt-topbar,${themed}>.rmt-workspace-tabs,${themed}>.rmt-workspace-location{display:none!important}
${focus}>.rmt-body.rmt-mve-body,${themed}>.rmt-body.rmt-mve-body{display:flex!important;flex-direction:column;flex:1 1 0!important;min-height:0;padding:0!important;overflow:auto!important;scrollbar-gutter:auto!important;touch-action:pan-y pinch-zoom!important}
${r}{box-sizing:border-box;flex:none;min-height:0;max-width:none;width:100%;gap:0;margin:0;padding:0 0 max(12px,env(safe-area-inset-bottom,0px));overflow:visible;background:var(--rmt-theme-bg,#f8fbfd)}
${r} *{box-sizing:border-box}
${r} [hidden]{display:none!important}
${r} button{min-height:44px;min-width:0;height:auto;padding:8px 12px;border:1px solid transparent;border-radius:10px;font-size:14px!important;line-height:1.4!important;background:transparent!important;color:var(--rmt-theme-text,#294762)!important;box-shadow:none!important;touch-action:manipulation}
${r} button:disabled{opacity:.5!important}
${r} .rmt-x-secondary{background:var(--rmt-theme-surface-solid,#fff)!important;border-color:var(--rmt-theme-border,#dce5ed)!important}
${r} .rmt-x-primary{--rmt-content-ink:var(--rmt-theme-surface-solid,#fff);background:var(--rmt-theme-accent-ink,#3575a8)!important;border-color:var(--rmt-theme-accent-ink,#3575a8)!important;color:var(--rmt-theme-surface-solid,#fff)!important;font-weight:600!important}
${r} .rmt-mve-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--rmt-theme-border,#dce5ed);background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-head>.rmt-mve-back{flex:0 0 40px;width:40px;min-height:44px;align-self:center;padding:0;font-size:28px!important;border:0!important}
${r} .rmt-mve-title{flex:1;min-width:0}
${r} .rmt-mve-head h2{font-size:17px!important;line-height:1.4!important;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mve-title small{display:block;margin:3px 0 0;--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:11px!important}
${r} .rmt-mve-head-actions{display:flex;align-items:center;gap:6px;flex:none}
${r} .rmt-mve-head-actions button{min-width:44px;min-height:44px;padding:8px 12px;border-radius:10px}
${r} .rmt-mve-head-actions .rmt-mve-more{font-size:25px!important;line-height:1!important;padding:4px 8px}
${r} .rmt-mve-pending-count{display:inline-grid;place-items:center;min-width:17px;min-height:17px;padding:1px 3px;border-radius:6px;background:var(--rmt-theme-soft,#e7f1fa);font-size:10px!important;vertical-align:middle}
${r} .rmt-mve-layout-scope{display:block;min-width:0;width:100%;container-type:inline-size}
${r} .rmt-mve-workspace{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto;align-items:start;gap:0;min-width:0;min-height:0}
${r} .rmt-mve-preview{display:flex;flex-direction:column;min-width:0;min-height:0;padding:14px 16px 0;align-self:start;overflow:visible}
${r} .rmt-mve-preview-head{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:38px;margin-bottom:7px;padding:0}
${r} .rmt-mve-preview-head>span{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:12px!important;min-width:0;overflow-wrap:anywhere}
${r} .rmt-mve-preview-head button{flex:none;min-height:38px;padding:5px 9px;font-size:12px!important;border:0!important;background:transparent!important}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap{position:relative;width:100%;height:auto;min-height:0;max-width:none;aspect-ratio:16/9;border-radius:10px;margin:0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap.portrait{width:min(100%,266px);aspect-ratio:9/16;margin:0 auto}
${r} .rmt-mve-preview canvas{position:absolute;inset:0;display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain}
${r} .rmt-mve-transport{display:flex;align-items:center;gap:10px;padding:8px 0 0;min-width:0;flex:none}
${r} .rmt-mve-transport .rmt-mv-play{flex:0 0 44px;min-width:44px;width:44px;height:44px;border-radius:10px;font-size:16px!important;background:var(--rmt-theme-soft,#e7f1fa)!important;border:0!important}
${r} .rmt-mve-clock{font-size:12px!important;min-width:43px;white-space:nowrap;font-variant-numeric:tabular-nums}
${r} .rmt-mve-transport>small{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:11px!important;white-space:nowrap;font-variant-numeric:tabular-nums}
${r} .rmt-mve-transport input[type=range]::-webkit-slider-runnable-track{background:linear-gradient(to right,var(--rmt-theme-accent-ink,#3575a8) 0%,var(--rmt-theme-accent-ink,#3575a8) var(--rmt-mv-seek,0%),var(--rmt-theme-border,#cddfed) var(--rmt-mv-seek,0%),var(--rmt-theme-border,#cddfed) 100%)}
${r} .rmt-mve-projectbar{display:flex;justify-content:space-between;align-items:center;gap:10px;min-width:0;padding:0 0 7px;border-bottom:1px solid var(--rmt-theme-border,#dce5ed)}
${r} .rmt-mve-projectbar>button{display:flex;align-items:center;gap:7px;max-width:76%;min-width:0;padding:5px 0;min-height:38px;font-size:12px!important;text-align:left;border:0!important;background:transparent!important}
${r} .rmt-mve-projectbar>button>span:nth-child(2){overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${r} .rmt-mve-meta{--rmt-content-ink:var(--rmt-theme-muted,#63788f);display:block;padding:0;font-size:11px!important;white-space:nowrap}
${r} .rmt-mve-filmstrip{min-width:0;padding-bottom:14px;display:block}
${r} .rmt-mve-strip-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 0 3px}
${r} .rmt-mve-strip-head>small{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:11px!important;min-width:0}
${r} .rmt-mve-strip-actions,${r} .rmt-mve-strip-nav{display:flex;align-items:center;gap:2px;flex:none}
${r} .rmt-mve-strip-actions>button{font-size:12px!important;padding:5px 4px;min-height:44px;border:0!important;background:transparent!important}
${r} .rmt-mve-strip-nav button{font-size:22px!important;width:40px;min-height:44px;padding:0;border:0!important;background:transparent!important}
${r} .rmt-mve-filmstrip .rmt-mv-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:2px;overflow:visible}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button{display:flex;flex-direction:column;gap:0;width:100%!important;min-width:0;height:auto;min-height:64px;padding:3px!important;border:2px solid transparent!important;border-radius:9px;overflow:hidden;background:var(--rmt-theme-surface-solid,#fff)!important}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button img{position:static!important;inset:auto!important;display:block;width:100%!important;height:auto!important;aspect-ratio:16/10;min-height:0;max-height:none;object-fit:contain;border-radius:4px}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button>span{position:static;display:block;width:100%;padding:5px 0 1px;min-height:23px;border-radius:0;background:transparent!important;color:var(--rmt-theme-text)!important;font-size:11px!important;line-height:1.3!important;white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button.on,${r} .rmt-mve-filmstrip .rmt-mv-strip>button[aria-current=true]{border-color:var(--rmt-theme-accent-ink,#3575a8)!important;box-shadow:none!important}
${r} .rmt-mve-tools{min-width:0;background:var(--rmt-theme-surface-solid,#fff);border:0;border-top:1px solid var(--rmt-theme-border,#dce5ed);border-radius:0;overflow:visible}
${r} .rmt-mve-tabs{display:flex;gap:18px;padding:0 20px;border-bottom:1px solid var(--rmt-theme-border,#dce5ed);background:transparent}
${r} .rmt-mve-tab{position:relative;flex:1;min-width:0;min-height:48px;padding:12px 0;border:0!important;border-radius:0;font-size:13px!important;white-space:nowrap;background:transparent!important;color:var(--rmt-theme-muted,#63788f)!important}
${r} .rmt-mve-tab.on{color:var(--rmt-theme-accent-ink,#3575a8)!important;background:transparent!important;box-shadow:none!important;font-weight:600!important}
${r} .rmt-mve-tab.on:after{content:"";position:absolute;bottom:0;left:12%;right:12%;height:3px;border-radius:3px;background:var(--rmt-theme-accent-ink,#3575a8)}
${r} .rmt-mve-panel{display:flex;flex-direction:column;min-width:0;padding:0;gap:0;overflow:visible}
${r} .rmt-mve-panel-scroll{display:flex;flex-direction:column;min-width:0;padding:20px;gap:14px;overflow:visible}
${r} .rmt-mve-panel-scroll>*{min-width:0;flex-shrink:0}
${r} .rmt-mve-panel .rmt-x-row-head{align-items:center;flex-wrap:wrap;gap:8px}
${r} .rmt-mve-panel .rmt-x-row-head>b{font-size:15px!important}
${r} .rmt-mve-panel .rmt-x-row-head>span{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:12px!important;font-variant-numeric:tabular-nums}
${r} .rmt-mve-panel .rmt-x-note{font-size:14px!important;line-height:1.75!important;margin:0}
${r} .rmt-mve-panel .rmt-mve-lyric{font-size:15px!important;line-height:1.75!important;margin:0 0 2px}
${r} .rmt-mve-image-actions{display:grid;grid-template-columns:minmax(0,1fr) 82px;gap:10px}
${r} .rmt-mve-image-actions>button,${r} .rmt-mve-image-actions>label{display:flex;align-items:center;justify-content:center;min-width:0;min-height:46px;padding:9px 12px;margin:0;border-radius:10px;font-size:14px!important}
${r} .rmt-mve-image-note{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:11px!important;line-height:1.5!important}
${r} .rmt-mve-panel details{padding:0;border:0;border-top:1px solid var(--rmt-theme-border,#dce5ed)}
${r} .rmt-mve-panel summary{min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;font-size:14px!important;line-height:1.5!important;list-style:none;cursor:pointer}
${r} .rmt-mve-panel summary::-webkit-details-marker{display:none}
${r} .rmt-mve-panel summary:after{content:"›";font-size:20px;line-height:1;flex:none}
${r} .rmt-mve-panel details[open]>summary:after{content:"⌄"}
${r} .rmt-mve-panel details>div{display:flex;flex-direction:column;gap:12px;padding:0 0 12px}
${r} .rmt-mve-panel b{font-size:14px!important}
${r} .rmt-x-seg{border-radius:9px}
${r} button[aria-pressed=true]:not(.rmt-mve-tab){background:var(--rmt-theme-soft)!important;border-color:var(--rmt-theme-accent-ink)!important;box-shadow:none!important}
${r} .rmt-mve-panel input:not([type=checkbox]):not([type=range]):not([type=file]),${r} .rmt-mve-panel select,${r} .rmt-mve-panel textarea{min-width:0;max-width:100%;font-size:16px!important;min-height:44px;border-radius:9px}
${r} .rmt-mve-dock{display:flex;align-items:center;justify-content:space-between;flex:none;gap:8px;padding:10px 20px;border-top:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid)}
${r} .rmt-mve-dock>small{--rmt-content-ink:var(--rmt-theme-muted,#63788f);font-size:11px!important}
${r} .rmt-mve-dock button{min-height:44px;font-size:12px!important}
${r} .rmt-mve-timing-dock{position:sticky;bottom:0;z-index:2;display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:12px 16px}
${r} .rmt-mve-timing-dock .rmt-mv-check{display:flex;flex-direction:row;align-items:center;min-height:36px;margin:0;font-size:12px!important}
${r} .rmt-mve-workspace[data-preview-only=true]{grid-template-columns:minmax(0,1fr)!important}
${r} .rmt-mve-workspace[data-preview-only=true] .rmt-mve-tools,${r} .rmt-mve-workspace[data-preview-only=true] .rmt-mve-filmstrip{display:none}
${r} .rmt-mve-workspace[data-preview-only=true] .rmt-mve-preview{padding-bottom:16px}
@media(min-width:960px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 335px}${r} .rmt-mve-tools{border-top:0;border-left:1px solid var(--rmt-theme-border)}${r} .rmt-mve-preview{padding:20px 24px}}
@supports(container-type:inline-size){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr)}${r} .rmt-mve-tools{border-left:0;border-top:1px solid var(--rmt-theme-border)}@container(min-width:780px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 335px}${r} .rmt-mve-tools{border-top:0;border-left:1px solid var(--rmt-theme-border)}${r} .rmt-mve-preview{padding:20px 24px}}}
@media(max-width:360px){${r} .rmt-mve-head{padding:8px;gap:5px}${r} .rmt-mve-head-actions button{padding-inline:9px}${r} .rmt-mve-head h2{font-size:16px!important}${r} .rmt-mve-preview{padding:12px 12px 0}${r} .rmt-mve-panel-scroll{padding:16px}${r} .rmt-mve-tabs{padding:0 14px;gap:12px}${r} .rmt-mve-transport{gap:7px}${r} .rmt-mve-filmstrip .rmt-mv-strip{gap:5px}${r} .rmt-mve-strip-nav button{width:36px}}
${root} .rmt-shell .rmt-mve-sheet .rmt-mve-shot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
${root} .rmt-mve-shot-grid>button{display:flex;flex-direction:column;gap:5px;min-width:0;width:100%;padding:4px;border:1px solid var(--rmt-theme-border);border-radius:9px;overflow:hidden}
${root} .rmt-mve-shot-grid img{display:block;width:100%;aspect-ratio:16/10;object-fit:contain;border-radius:5px}
${root} .rmt-mve-shot-grid span{font-size:11px!important;font-variant-numeric:tabular-nums;white-space:nowrap}
${root} .rmt-mve-sheet .rmt-mve-host-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid var(--rmt-theme-border)}
${root} .rmt-mve-host-actions button{flex:1}
`;
}
