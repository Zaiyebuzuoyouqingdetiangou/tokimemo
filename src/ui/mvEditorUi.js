// Editor-only presentation. All actions continue through mvView and the existing
// song-scoped storage, image editor, audio player and export implementations.
export function editorMarkup(o) {
    const { esc, btn, song, tab, panels, width, height, strip, stripNav, selectedLabel, time, total, playing, audio, audioName, exporting, drawer, drawerHtml } = o;
    const musicLabel = audio ? (audioName || song.title) : '导入音乐';
    const pending = Math.max(0, Number(o.pendingCount) || 0);
    const moreLabel = pending ? `更多 <span class="rmt-mve-pending-count">${pending}</span>` : '更多';
    const tabs = [['shots', '分镜'], ['timing', '定段 · 定句'], ['look', '全片样式']].map(([id, label]) =>
        btn('editor-tab', label, { id, cls: 'rmt-mve-tab' + (tab === id ? ' on' : ''), extra: ` aria-pressed="${tab === id}"` })).join('');
    return `<header class="rmt-mve-head"><div><h2>${esc(song.title)}</h2></div><div class="rmt-mve-head-actions">${btn('editor-drawer', moreLabel, { id: 'more', extra: pending ? ` data-rmt-mv-pending="${pending}" aria-label="更多，${pending} 份结果待保存"` : '' })}${btn('editor-drawer', '导出', { id: 'export', cls: 'rmt-x-primary' })}</div></header>
      <div class="rmt-mve-projectbar"><span class="rmt-mve-meta">${esc(o.storyLabel || '手书')} · ${audio ? '音乐与画面共用进度' : '静音预览'}</span>${btn('editor-drawer', esc(musicLabel), { id: 'audio', extra: ` title="${esc(musicLabel)}" aria-label="${audio ? '管理当前音乐：' + esc(musicLabel) : '导入音乐'}"` })}</div>
      <div class="rmt-mve-layout-scope"><div class="rmt-mve-workspace" data-editor-tab="${tab}" data-editor-paged="${!!stripNav}" data-preview-only="${!!o.previewOnly}"><section class="rmt-mve-preview" aria-label="手书预览">
        <div class="rmt-mve-preview-head"><span data-rmt-mv-current>${esc(selectedLabel)}</span><div class="rmt-mve-preview-actions">${btn('go-board', '素材库')}${btn('editor-preview', o.previewOnly ? '恢复编辑' : '只看画面')}</div></div>
        <div class="rmt-mv-canvas-wrap${width < height ? ' portrait' : ''}"><canvas data-rmt-mv-canvas width="${width}" height="${height}"></canvas></div>
        <div class="rmt-mve-transport"><button type="button" class="rmt-mv-play" data-rmt-mv="play" aria-label="${playing ? '暂停' : '播放'}"${exporting ? ' disabled' : ''}>${playing ? '❚❚' : '▶'}</button><span class="rmt-mve-clock" data-rmt-mv-time>${esc(time)}</span><input type="range" min="0" max="${total}" step="0.1" value="${o.seconds}" data-rmt-mv-seek aria-label="播放位置"${exporting ? ' disabled' : ''}><small>${esc(o.totalLabel)}</small></div>
        <div class="rmt-mve-filmstrip" data-rmt-mv-filmstrip><div class="rmt-mv-strip">${strip}</div>${stripNav}</div>
      </section><section class="rmt-mve-tools"><nav class="rmt-mve-tabs" aria-label="剪辑工作区">${tabs}</nav><div class="rmt-mve-panel"${tab === 'shots' ? ' data-rmt-mv-shot-panel' : ''}>${panels[tab] || panels.shots}</div></section></div></div>
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
${r} .rmt-mve-transport input[type=range]{appearance:none!important;-webkit-appearance:none!important;display:block;flex:1;width:0;min-width:28px;height:44px!important;min-height:44px!important;max-height:44px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;filter:none!important;cursor:pointer}
${r} .rmt-mve-transport input[type=range]::-webkit-slider-runnable-track{height:6px;border:0;border-radius:999px;box-shadow:none;background:linear-gradient(to right,var(--rmt-theme-accent,#bc779d) 0%,var(--rmt-theme-accent,#bc779d) var(--rmt-mv-seek,0%),var(--rmt-theme-border,#cddfed) var(--rmt-mv-seek,0%),var(--rmt-theme-border,#cddfed) 100%)}
${r} .rmt-mve-transport input[type=range]::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:18px!important;height:18px!important;margin-top:-6px!important;border:2px solid var(--rmt-theme-surface-solid,#fff)!important;border-radius:50%!important;background:var(--rmt-theme-accent-ink,#4f769d)!important;box-shadow:0 1px 4px #0002!important}
${r} .rmt-mve-transport input[type=range]::-moz-range-track{height:6px;border:0;border-radius:999px;background:var(--rmt-theme-border,#cddfed)}
${r} .rmt-mve-transport input[type=range]::-moz-range-progress{height:6px;border-radius:999px;background:var(--rmt-theme-accent,#bc779d)}
${r} .rmt-mve-transport input[type=range]::-moz-range-thumb{width:14px;height:14px;border:2px solid var(--rmt-theme-surface-solid,#fff);border-radius:50%;background:var(--rmt-theme-accent-ink,#4f769d);box-shadow:0 1px 4px #0002}
${r} .rmt-mve-transport>small{font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-transport>button:last-child{font-size:12px;min-height:40px;padding:0 10px;border-radius:999px;max-width:34%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;display:block}
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
${r} .rmt-mve-filmstrip .rmt-mv-strip>button{display:grid;grid-template-rows:72px 26px;box-sizing:border-box;width:84px!important;min-width:84px;height:102px;flex:0 0 84px;padding:0!important;border-radius:9px;overflow:hidden;background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button img{position:static!important;inset:auto!important;grid-row:1;display:block;height:72px!important;width:100%!important;min-height:0;max-height:72px;object-fit:contain;align-self:center}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button>span{position:static;grid-row:2;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:var(--rmt-theme-surface-solid,#fff);padding:2px;border-radius:0;color:var(--rmt-theme-text,#294762);font-size:11px;line-height:1.3;white-space:nowrap}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button[aria-current=true]{border-color:var(--rmt-theme-accent-ink,#4f769d)!important;box-shadow:0 0 0 1px var(--rmt-theme-accent-ink,#4f769d)}
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
${r} .rmt-shell>.rmt-mve-sheet-shade{position:absolute;inset:0;z-index:200;background:rgba(20,35,50,.42);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;isolation:isolate;overflow:hidden;touch-action:pan-y pinch-zoom}
${r} .rmt-shell>.rmt-mve-sheet-shade .rmt-mve-sheet{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:0;width:min(100%,560px);max-height:100%;overflow:hidden;border-radius:18px;border:1px solid var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#294762);box-shadow:0 15px 65px rgba(0,0,0,.2)}
${r} .rmt-mve-sheet>header{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-sheet>div{padding:16px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
${r} .rmt-mve-sheet>div>*{flex-shrink:0;min-width:0}
${r} .rmt-shell .rmt-mve-sheet button{font-size:14px!important;min-height:44px;touch-action:manipulation}
${r} .rmt-shell .rmt-mve-sheet :is(p,b,summary){font-size:14px!important;line-height:1.65!important;overflow-wrap:anywhere}
${r} .rmt-mve-sheet input:not([type=checkbox]):not([type=range]),${r} .rmt-mve-sheet select{min-width:0;max-width:100%;font-size:16px!important}
${r} .rmt-mve-recovery{border:1px solid var(--rmt-theme-border,#cddfed);border-radius:14px;padding:12px;background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-recovery>summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
${r} .rmt-mve-recovery>div{margin-top:12px}
${r} .rmt-mve-recovery-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
${r} .rmt-mve-recovery-actions button{flex:1 1 100px;min-height:44px;border-radius:999px}
${r} .rmt-mve-clear-confirm{padding:10px;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:12px;background:var(--rmt-theme-soft,#f7f4fb)}
${r} .rmt-mve-sheet .rmt-mv-file{flex-wrap:wrap;gap:10px}
${r} .rmt-mve-sheet .rmt-mv-file>div{min-width:120px;overflow-wrap:anywhere}
${r} .rmt-mv-editor button:focus-visible,${r} .rmt-mv-editor input:focus-visible{outline:2px solid var(--rmt-theme-accent-ink,#4f769d);outline-offset:2px}
${r} .rmt-mve-group-fold{border:1px solid var(--rmt-theme-border,#cddfed);border-radius:14px;background:var(--rmt-theme-surface-solid,#fff);padding:12px}
${r} .rmt-mve-group-fold summary{min-height:44px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;list-style:none}
${r} .rmt-mve-group-fold .rmt-mv-gcard{border:0;padding:12px 0 0}
@media(min-width:960px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 340px}}
@supports(container-type:inline-size){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr)}@container (min-width:780px){${r} .rmt-mve-workspace{grid-template-columns:minmax(0,1fr) 340px}}}
@media(max-width:600px){${r} .rmt-mve-head h2{font-size:17px}${r} .rmt-mve-head-actions button{padding:0 10px;font-size:12px}${r} .rmt-mve-panel{padding:14px}${r} .rmt-mve-transport{gap:7px}${r} .rmt-mve-transport>small{font-size:11px!important;white-space:nowrap}${r} .rmt-mve-workspace:not([data-editor-tab=shots]) .rmt-mve-filmstrip{display:none}${r} .rmt-mve-sheet{max-height:88vh}${r} .rmt-mve-head{padding-bottom:10px}}
@container (max-width:700px){${r} .rmt-mve-workspace:not([data-editor-tab=shots]) .rmt-mve-filmstrip{display:none}}
${workbenchCss(r)}
`;
}

function workbenchCss(root) {
    // The structural theme also sets button and heading metrics. Scope the real
    // workbench above that selector so its height budget matches what is drawn.
    const r = `${root} .rmt-body.rmt-mve-body`;
    return `
${root} .rmt-body.rmt-mve-body,${root}.rmt-workspace[data-rmt-theme-mode] .rmt-body.rmt-mve-body{display:flex;flex-direction:column;padding:10px!important;overflow:auto!important;touch-action:pan-y pinch-zoom!important;scrollbar-gutter:auto!important}
${r} .rmt-x-page.rmt-mv-editor{flex:1 0 740px;min-height:740px;max-width:none;width:100%;gap:0;padding:0;overflow:visible}
${r} .rmt-mve-head{flex:none;min-height:38px;padding:0 0 5px;border:0}
${r} .rmt-mve-head h2{font-size:16px!important;line-height:1.4!important;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mve-head-actions button{min-height:36px;font-size:12px!important;padding:5px 12px;border-radius:999px}
${r} .rmt-mve-pending-count{display:inline-block;margin-left:3px;min-width:18px;border-radius:999px;background:var(--rmt-theme-soft,#e7f1fa);font-size:11px!important;text-align:center}
${r} .rmt-mve-projectbar{flex:none;display:flex;justify-content:space-between;align-items:center;min-width:0;gap:12px;padding:2px 0 8px;font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-projectbar>button{font-size:12px!important;min-height:34px;padding:5px 12px;border-radius:999px;max-width:60%;min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mve-projectbar .rmt-mve-meta{flex:1;display:block;min-width:0;padding:0;font-size:11px!important;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mve-layout-scope{display:flex;flex:1;min-height:0;min-width:0}
${r} .rmt-mve-workspace{--rmt-mve-tools-min:300px;flex:1;min-height:630px;min-width:0;align-items:stretch;gap:10px;grid-template-columns:minmax(0,1fr);grid-template-rows:max-content minmax(var(--rmt-mve-tools-min),1fr)}
${r} .rmt-mve-workspace[data-editor-tab=shots][data-editor-paged=true]{min-height:670px}
${r} .rmt-mve-workspace[data-editor-tab=timing]{--rmt-mve-tools-min:390px}
${r} .rmt-mve-workspace[data-editor-tab=look]{--rmt-mve-tools-min:320px}
${r} .rmt-mve-preview{display:flex;flex-direction:column;min-height:0;min-width:0;align-self:start;overflow:visible}
${r} .rmt-mve-preview-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:0 0 4px;font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-preview-head>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mve-preview-actions{display:flex;flex:none;gap:6px}
${r} .rmt-mve-preview-head button{font-size:12px!important;min-height:34px;padding:4px 10px;border-radius:999px;white-space:nowrap}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap{position:relative;width:100%;height:auto;min-height:0;max-width:none;aspect-ratio:16/9;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto}
${r} .rmt-mve-preview .rmt-mv-canvas-wrap.portrait{width:min(100%,300px);aspect-ratio:9/16;margin:0 auto}
${r} .rmt-mve-preview canvas{position:absolute;inset:0;display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain}
${r} .rmt-mve-transport{flex:none;padding:3px 0 0;gap:9px}
${r} .rmt-mve-transport>small{font-size:11px!important;white-space:nowrap}
${r} .rmt-mve-filmstrip{flex:none;min-height:0}
${r} .rmt-mve-filmstrip .rmt-mv-strip{padding:1px 2px 4px;overscroll-behavior-x:contain;scrollbar-width:thin}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button{grid-template-rows:44px 20px;width:74px!important;min-width:74px;flex-basis:74px;height:68px;border-radius:9px}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button img{height:44px!important;max-height:44px;object-fit:contain}
${r} .rmt-mve-filmstrip .rmt-mv-strip>button>span{font-size:10px}
${r} .rmt-mve-strip-nav{font-size:10px}
${r} .rmt-mve-strip-nav button{min-height:30px;padding:2px 8px;font-size:11px!important;border-radius:999px}
${r} .rmt-mve-tools{display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
${r} .rmt-mve-tabs{flex:none;padding:5px;gap:3px;grid-template-columns:1fr 1.25fr 1fr}
${r} .rmt-mve-tab{min-height:38px;font-size:12px!important;border-radius:999px}
${r} .rmt-mve-panel{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;padding:0;gap:0}
${r} .rmt-mve-panel-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:auto;scrollbar-width:thin;padding:12px;display:flex;flex-direction:column;gap:12px;touch-action:pan-y pinch-zoom}
${r} .rmt-mve-panel-scroll>*{flex-shrink:0}
${r} .rmt-mve-panel-scroll .rmt-x-note{font-size:13px!important;line-height:1.7!important;margin:0}
${r} .rmt-mve-dock{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-dock>small{font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-dock button{font-size:12px!important;min-height:38px;border-radius:999px;padding:6px 12px}
${r} .rmt-mve-image-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
${r} .rmt-mve-image-actions>button,${r} .rmt-mve-image-actions>label{flex:1;min-height:42px;display:flex;align-items:center;justify-content:center;border-radius:999px;margin:0;padding:8px;font-size:13px}
${r} .rmt-mve-image-note{font-size:11px;color:var(--rmt-theme-muted,#63788f)}
${r} .rmt-mve-timing-dock{display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:8px 12px}
${r} .rmt-mve-timing-dock .rmt-mv-check{flex-direction:row;margin:0;min-height:28px;font-size:11px}
${r} .rmt-mve-panel .rmt-x-seg{border-radius:999px}
${r} .rmt-mve-panel summary{border:1px solid var(--rmt-theme-border,#cddfed);border-radius:999px;padding:7px 12px;min-height:36px;box-sizing:border-box}
${r} .rmt-mve-panel details{padding:0;border-top:0}
${r} .rmt-mve-workspace[data-preview-only=true]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
${r} .rmt-mve-workspace[data-preview-only=true] .rmt-mve-tools,${r} .rmt-mve-workspace[data-preview-only=true] .rmt-mve-filmstrip{display:none}
${r} .rmt-mve-recovery{flex:none;max-height:200px;overflow:auto;padding:8px;margin:0 0 7px;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mve-recovery>summary{font-size:12px!important;min-height:30px;cursor:pointer}
@media(min-width:960px){${r} .rmt-x-page.rmt-mv-editor{flex-basis:450px;min-height:450px}${r} .rmt-mve-workspace[data-editor-tab][data-editor-paged]{min-height:340px;grid-template-columns:minmax(0,1fr) 335px;grid-template-rows:minmax(340px,1fr)}}
@supports(container-type:inline-size){${r} .rmt-mve-workspace[data-editor-tab]{min-height:630px;grid-template-columns:minmax(0,1fr);grid-template-rows:max-content minmax(var(--rmt-mve-tools-min),1fr)}${r} .rmt-mve-workspace[data-editor-tab=shots][data-editor-paged=true]{min-height:670px}@container(min-width:740px){${r} .rmt-mve-workspace[data-editor-tab][data-editor-paged]{min-height:340px;grid-template-columns:minmax(0,1fr) 335px;grid-template-rows:minmax(340px,1fr)}}}
@media(max-height:700px){${r} .rmt-mve-filmstrip .rmt-mv-strip>button{grid-template-rows:30px 18px;height:52px}${r} .rmt-mve-filmstrip .rmt-mv-strip>button img{height:30px!important;max-height:30px}${r} .rmt-mve-head-actions button{min-height:32px}${r} .rmt-mve-projectbar{padding-bottom:4px}${r} .rmt-mve-preview-head{padding:0}${r} .rmt-mve-meta{padding-bottom:2px}}
@media(max-height:600px) and (orientation:landscape){${r} .rmt-x-page.rmt-mv-editor{flex-basis:450px;min-height:450px}${r} .rmt-mve-workspace[data-editor-tab][data-editor-paged]{min-height:340px;grid-template-columns:minmax(0,1fr) minmax(250px,.8fr);grid-template-rows:minmax(340px,1fr)}}
${r} .rmt-mve-workspace[data-editor-tab][data-editor-paged][data-preview-only=true]{min-height:340px;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(340px,1fr)}
`;
}
