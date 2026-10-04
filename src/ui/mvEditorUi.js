// Editor-only presentation. All actions continue through mvView and the existing
// song-scoped storage, image editor, audio player and export implementations.
export function editorMarkup(o) {
    const { esc, btn, song, tab, panels, width, height, strip, stripNav, selectedLabel, time, total, playing, audio, exporting, drawer, drawerHtml } = o;
    const tabs = [['shots', '分镜'], ['timing', '定段 · 定句'], ['look', '画面']].map(([id, label]) =>
        btn('editor-tab', label, { id, cls: 'rmt-mve-tab' + (tab === id ? ' on' : ''), extra: ` aria-pressed="${tab === id}"` })).join('');
    return `<header class="rmt-mve-head"><div><small>手书剪辑台</small><h2>${esc(song.title)}</h2></div><div class="rmt-mve-head-actions">${btn('editor-drawer', '导出', { id: 'export', cls: 'rmt-x-primary' })}${btn('editor-drawer', '更多', { id: 'more' })}</div></header>
      <div class="rmt-mve-layout-scope"><div class="rmt-mve-workspace" data-editor-tab="${tab}"><section class="rmt-mve-preview" aria-label="手书预览">
        <div class="rmt-mv-canvas-wrap${width < height ? ' portrait' : ''}"><canvas data-rmt-mv-canvas width="${width}" height="${height}"></canvas></div>
        <div class="rmt-mve-transport"><button type="button" class="rmt-mv-play" data-rmt-mv="play" aria-label="${playing ? '暂停' : '播放'}"${exporting ? ' disabled' : ''}>${playing ? '❚❚' : '▶'}</button><span class="rmt-mve-clock" data-rmt-mv-time>${esc(time)}</span><input type="range" min="0" max="${total}" step="0.1" value="${o.seconds}" data-rmt-mv-seek aria-label="播放位置"${exporting ? ' disabled' : ''}><small>${esc(o.totalLabel)}</small>${btn('editor-drawer', '歌曲', { id: 'audio' })}</div>
        <div class="rmt-mve-meta"><span>${esc(selectedLabel)}</span><span>${audio ? '本机歌曲已接入' : '未放入歌曲 · 可静音预览'}</span></div>
        <div class="rmt-mve-filmstrip"><div class="rmt-mv-strip">${strip}</div>${stripNav}</div>
      </section><section class="rmt-mve-tools"><nav class="rmt-mve-tabs" aria-label="剪辑工作区">${tabs}</nav><div class="rmt-mve-panel">${panels[tab] || panels.shots}</div></section></div></div>
      ${drawer ? `<div class="rmt-mve-sheet-shade"><section class="rmt-mve-sheet" role="dialog" aria-modal="true" aria-label="${esc({ export: '导出手书', more: '素材与项目', audio: '歌曲' }[drawer] || '选项')}"><header><b>${esc({ export: '导出手书', more: '素材与项目', audio: '歌曲' }[drawer] || '选项')}</b>${btn('editor-drawer', '关闭', { extra: ' aria-label="关闭选项面板"' })}</header><div>${drawerHtml}</div></section></div>` : ''}`;
}

export function editorCss(root) {
    const r = root;
    return `
${r} .rmt-x-page.rmt-mv-editor{max-width:1160px;width:100%;gap:18px;padding:8px 4px 24px}
${r} .rmt-mve-layout-scope{min-width:0;width:100%;container-type:inline-size}
${r} .rmt-mve-back{align-self:flex-start;width:auto;min-height:40px;padding:4px 0;border:0;background:none;color:var(--rmt-theme-muted,#63788f);font-size:12px;cursor:pointer}
${r} .rmt-mve-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:2px 0 14px;border-bottom:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-head>div:first-child{min-width:0;flex:1}
${r} .rmt-mve-head small{display:block;font-size:12px;color:var(--rmt-theme-muted,#63788f);margin-bottom:5px}
${r} .rmt-mve-head h2{font-size:20px;line-height:1.4;margin:0;overflow-wrap:anywhere;color:var(--rmt-theme-text,#294762)}
${r} .rmt-mve-head-actions{display:flex;gap:8px;flex:none}
${r} .rmt-mve-head-actions button{width:auto;min-height:42px;font-size:13px;border-radius:10px;padding:0 15px}
${r} .rmt-mve-workspace{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:18px;min-width:0}
${r} .rmt-mve-preview,${r} .rmt-mve-tools{min-width:0}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap{width:100%;border-radius:13px;margin:0;overflow:hidden;background:var(--rmt-theme-soft,#e7f1fa)}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap.portrait{width:min(100%,300px);margin:0 auto}
${r} .rmt-mve-preview canvas{display:block;width:100%;height:auto}
${r} .rmt-mve-transport{display:flex;align-items:center;gap:10px;padding:10px 0 3px;min-width:0}
${r} .rmt-mve-transport .rmt-mv-play{width:42px;min-width:42px;height:42px;min-height:42px;border-radius:50%;font-size:15px;background:var(--rmt-theme-soft,#e3eef9);color:var(--rmt-theme-text,#294762);border:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-clock{font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
${r} .rmt-mve-transport input[type=range]{flex:1;width:0;min-width:28px;height:44px;padding:0;accent-color:var(--rmt-theme-accent,#bc779d);cursor:pointer}
${r} .rmt-mve-transport>small{font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-transport>button:last-child{font-size:12px;min-height:40px;padding:0 10px;border-radius:9px}
${r} .rmt-mve-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--rmt-theme-muted,#63788f);padding:4px 1px 14px;flex-wrap:wrap}
${r} .rmt-mve-tools{background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cddfed);border-radius:14px;overflow:hidden}
${r} .rmt-mve-tabs{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:4px;padding:6px;background:var(--rmt-theme-soft,#e7f1fa)}
${r} .rmt-mve-tab{border:0;background:transparent;color:var(--rmt-theme-muted,#63788f);border-radius:9px;min-height:43px;font-size:13px;padding:0 8px;cursor:pointer}
${r} .rmt-mve-tab.on{background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#294762);font-weight:600}
${r} .rmt-mve-panel{padding:18px;display:flex;flex-direction:column;gap:13px;min-width:0}
${r} .rmt-mve-panel .rmt-x-card{padding:0;border:0;background:transparent}
${r} .rmt-mve-panel .rmt-x-row-head{align-items:center;gap:9px;flex-wrap:wrap}
${r} .rmt-mve-panel .rmt-mv-grid2{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
${r} .rmt-mve-panel button{font-size:13px}
${r} .rmt-mve-panel .rmt-x-segs{display:flex;gap:7px;flex-wrap:wrap}
${r} .rmt-mve-panel .rmt-x-seg{min-height:42px;height:auto;flex:1 0 75px;padding:7px 10px;font-size:12px}
${r} .rmt-mve-panel details{border-top:1px solid var(--rmt-theme-border,#cddfed);padding:10px 0 0;min-width:0}
${r} .rmt-mve-panel summary{cursor:pointer;min-height:36px;font-size:13px}
${r} .rmt-mve-panel details>div{display:flex;flex-direction:column;gap:12px;padding-top:12px}
${r} .rmt-mve-panel input:not([type=checkbox]):not([type=range]),${r} .rmt-mve-panel select{font-size:16px}
${r} .rmt-mve-filmstrip .rmt-mv-strip{gap:7px;padding:4px 2px 10px}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button{width:84px!important;min-width:84px;height:102px;flex:0 0 84px;border-radius:9px;overflow:hidden;background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button img{display:block;height:72px;width:100%;object-fit:cover}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button>span{position:static;display:block;background:transparent;padding:5px 2px;border-radius:0;color:var(--rmt-theme-text,#294762);font-size:11px;line-height:1.3}
${r} .rmt-mve-strip-nav{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-strip-nav button{font-size:11px;padding:0 10px;min-height:36px}
${r} .rmt-mve-sync-list{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-sync-group{border-bottom:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-section{display:flex;align-items:center;gap:4px}
${r} .rmt-mve-section-pick{display:flex;align-items:center;gap:10px;min-height:48px;flex:1;min-width:0;border:0;border-radius:8px;background:transparent;color:var(--rmt-theme-text,#294762);padding:8px;text-align:left;cursor:pointer}
${r} .rmt-mve-section-pick b{font-size:13px;flex:1;overflow-wrap:anywhere}
${r} .rmt-mve-section-pick small{font-size:10px;flex:none;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-section-pick time{font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
${r} .rmt-mve-fold{border:0;background:transparent;min-width:40px;min-height:44px;color:var(--rmt-theme-text,#294762);cursor:pointer}
${r} .rmt-mve-lines{margin:0 0 10px 10px;padding-left:10px;border-left:1px solid var(--rmt-theme-border,#cddfed);display:flex;flex-direction:column;gap:5px}
${r} .rmt-mve-line{border:1px solid transparent;border-radius:9px;background:transparent;color:var(--rmt-theme-text,#294762);display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;min-height:56px;padding:10px;cursor:pointer}
${r} .rmt-mve-line>span{font-size:13px;line-height:1.65;flex:1;min-width:0;overflow-wrap:anywhere}
${r} .rmt-mve-line>small{display:flex;flex-direction:column;gap:4px;text-align:right;flex:none;font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-line em{font-style:normal;font-size:10px}
${r} .rmt-mve-line.on,${r} .rmt-mve-section-pick.on{border-color:var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-soft,#e7f1fa);color:var(--rmt-theme-text,#294762)}
${r} .rmt-mve-timing-actions{display:flex;gap:8px}
${r} .rmt-mve-timing-actions>button:first-child{flex:1}
${r} .rmt-mv-editor .rmt-mv-tap{width:auto;height:auto;min-height:48px;max-width:none;border-radius:10px;padding:10px 14px;font-size:14px;flex:1}
${r} .rmt-mv-editor .rmt-mv-tap b{font-size:14px;line-height:1.4}
${r} .rmt-mve-nudge{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap}
${r} .rmt-mve-nudge button{min-height:38px;font-size:11px;padding:0 8px}
${r} .rmt-mve-nudge input{width:85px;min-height:38px;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:8px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#294762);text-align:center}
${r} .rmt-mve-sheet-shade{position:fixed;inset:0;z-index:2147482990;background:rgba(20,35,50,.42);display:flex;align-items:center;justify-content:center;padding:14px;padding:calc(env(safe-area-inset-top,0px) + 14px) 14px calc(env(safe-area-inset-bottom,0px) + 14px);box-sizing:border-box}
${r} .rmt-mve-sheet{width:min(100%,560px);max-height:85vh;overflow:auto;border-radius:18px;border:1px solid var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#294762);box-shadow:0 15px 65px rgba(0,0,0,.2);overscroll-behavior:contain}
${r} .rmt-mve-sheet>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-sheet>div{padding:18px;display:flex;flex-direction:column;gap:14px}
${r} .rmt-mve-sheet button{font-size:14px}
${r} .rmt-mve-sheet .rmt-mv-file{flex-wrap:wrap;gap:10px}
${r} .rmt-mve-sheet .rmt-mv-file>div{min-width:120px;overflow-wrap:anywhere}
${r} .rmt-mv-editor button:focus-visible,${r} .rmt-mv-editor input:focus-visible{outline:2px solid var(--rmt-theme-accent-ink,#4f769d);outline-offset:2px}
${r} .rmt-mve-group-fold{border:1px solid var(--rmt-theme-border,#cddfed);border-radius:14px;background:var(--rmt-theme-surface-solid,#fff);padding:12px}
${r} .rmt-mve-group-fold summary{min-height:44px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;list-style:none}
${r} .rmt-mve-group-fold .rmt-mv-gcard{border:0;padding:12px 0 0}
@media(min-width:960px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 340px}}
@supports(container-type:inline-size){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr)}@container (min-width:780px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 340px}}}
@media(max-width:600px){${r} .rmt-mve-head h2{font-size:17px}${r} .rmt-mve-head-actions button{padding:0 10px;font-size:12px}${r} .rmt-mve-panel{padding:14px}${r} .rmt-mve-transport{gap:7px}${r} .rmt-mve-transport>small{display:none}${r} .rmt-mve-workspace:not([data-editor-tab=shots]) .rmt-mve-filmstrip{display:none}${r} .rmt-mve-sheet{max-height:88vh}${r} .rmt-mve-head{padding-bottom:10px}}
@container (max-width:700px){${r} .rmt-mve-workspace:not([data-editor-tab=shots]) .rmt-mve-filmstrip{display:none}}
`;
}
