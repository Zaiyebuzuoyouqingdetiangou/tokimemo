// Presentation only. MV navigation, assets, timing and canvas sizing stay with
// their existing owners; the workspace scope also outranks lazy MV styles.
export function mvRefreshCss(root) {
    const p = `${root} .rmt-song-mv`;
    return `
${p}{--rmt-mv-tile-width:160px;max-width:960px;width:100%;min-width:0;gap:18px;padding:6px 0 24px}
${p}>*{min-width:0}
${p} .rmt-x-head{gap:7px;padding:4px 0 10px}
${p} .rmt-x-head small{--rmt-content-ink:var(--rmt-theme-muted);font-size:12px!important;letter-spacing:.03em}
${p} .rmt-x-head h2{margin:0!important;font-size:25px!important;line-height:1.35!important}
${p} .rmt-x-head p,${p} .rmt-x-note{--rmt-content-ink:var(--rmt-theme-muted);font-size:13px!important;line-height:1.7!important;margin:0}
${p} .rmt-x-section-title{margin:8px 0 0!important;font-size:16px!important}
${p} .rmt-x-card,${p} .rmt-mv-gcard,${p} .rmt-mv-shot,${p} .rmt-mv-step{min-width:0;gap:14px;padding:18px;border:1px solid var(--rmt-theme-border);border-radius:16px;background:var(--rmt-theme-surface-solid);box-shadow:none}
${p} details.rmt-x-card{display:block}
${p} details.rmt-x-card[open]>*+*{margin-top:14px}
${p} summary{min-height:28px;line-height:1.6;cursor:pointer;overflow-wrap:anywhere}
${p} .rmt-x-row-head{gap:12px;align-items:flex-start;line-height:1.6}
${p} .rmt-x-row-head>b{flex:1;min-width:0}
${p} .rmt-x-row-head>span{--rmt-content-ink:var(--rmt-theme-muted);flex:0 1 40%;min-width:0;text-align:right;font-size:12px!important}
${p} button,${p} .rmt-mv-upload{min-width:0;white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;box-shadow:none}
${p} .rmt-x-primary,${p} .rmt-x-secondary,${p} .rmt-x-seg,${p} .rmt-mv-edit-open{min-height:44px;height:auto;padding:10px 13px;border-radius:11px;line-height:1.5!important;font-size:14px!important}
${p} .rmt-x-primary{--rmt-content-ink:var(--rmt-theme-surface-solid);background:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-accent-ink)!important}
${p} .rmt-x-secondary{background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border)!important}
${p} :is(.rmt-x-seg.active,.rmt-mv-choice.on,.rmt-mv-toggle button.on){--rmt-content-ink:var(--rmt-theme-wash-ink);background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important;border-color:var(--rmt-theme-accent-ink)!important;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)}
${p} .rmt-mv-actions{min-width:0;display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
${p} .rmt-mv-actions>*{flex:1 1 132px;min-width:0;max-width:100%}
${p} .rmt-mv-actions>label{display:flex;flex-direction:column;gap:6px;font-size:13px}
${p} .rmt-mv-actions>label.rmt-mv-upload{flex-direction:row;align-items:center}
${p} .rmt-mv-grid2,${p} .rmt-mv-range-selects{gap:10px;min-width:0}
${p} .rmt-mv-steps{gap:6px;padding:5px;border-radius:13px;background:var(--rmt-theme-soft)}
${p} .rmt-mv-steps span{height:auto;min-height:44px;box-sizing:border-box;padding:7px 6px;border-radius:9px;border:1px solid transparent;background:transparent;text-align:center;line-height:1.45;font-size:12px}
${p} .rmt-mv-steps span.on{background:var(--rmt-theme-surface-solid);border-color:var(--rmt-theme-border);--rmt-content-ink:var(--rmt-theme-accent-ink);box-shadow:0 2px 8px var(--rmt-theme-shadow)}
${p} .rmt-mv-steps span.done{background:transparent;--rmt-content-ink:var(--rmt-theme-muted)}
${p} .rmt-mv-choice{height:auto;min-height:86px;padding:16px;border-radius:13px;align-items:flex-start;border-width:1px}
${p} .rmt-mv-choice span{gap:7px;min-width:0}
${p} .rmt-mv-choice b{font-size:15px!important}
${p} .rmt-mv-choice small{--rmt-content-ink:var(--rmt-theme-muted);font-size:12px!important;line-height:1.65}
${p} .rmt-mv-choice em{font-size:12px;color:var(--rmt-theme-accent-ink)}
${p} .rmt-mv-choice.on small{--rmt-content-ink:var(--rmt-theme-wash-ink)}
${p} .rmt-mv-look{gap:7px;margin:4px 0 0;font-size:13px}
${p} .rmt-mv-look :is(input,select,textarea),${p} .rmt-mv-range-selects select{min-width:0;width:100%;min-height:44px;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);line-height:1.55!important}
${p} .rmt-mv-look textarea{resize:vertical;min-height:84px}
${p} .rmt-mv-cast-person{padding:14px 0;border-top:1px solid var(--rmt-theme-border)}
${p} .rmt-mv-cast-person>*+*{margin-top:7px}
${p} .rmt-mv-cast-person:last-child{padding-bottom:0}
${p} .rmt-mv-gname{--rmt-content-ink:var(--rmt-theme-text);font-size:16px!important;line-height:1.65}
${p} .rmt-mv-group{padding:9px 0 0;gap:5px}
${p} .rmt-mv-group b{--rmt-content-ink:var(--rmt-theme-accent-ink)}
${p} .rmt-mv-link{--rmt-content-ink:var(--rmt-theme-muted);font-size:12px;padding:0;line-height:1.7}
${p} .rmt-mv-assets{gap:12px;min-width:0;max-width:100%;padding:2px 2px 7px;align-items:flex-start;overscroll-behavior-x:contain}
${p} .rmt-mv-assets>div{width:var(--rmt-mv-tile-width);max-width:100%;flex:0 0 var(--rmt-mv-tile-width);gap:7px;align-items:stretch}
${p} .rmt-mv-assets small{--rmt-content-ink:var(--rmt-theme-text);font-size:13px!important;line-height:1.55;text-align:left;overflow-wrap:anywhere}
${p} button.rmt-mv-asset{width:100%;height:120px;min-height:96px;padding:0;border-radius:11px;background:var(--rmt-theme-soft)!important;border:1px solid var(--rmt-theme-border)!important;flex:none}
${p} .rmt-mv-asset.cut.done{background:repeating-conic-gradient(var(--rmt-theme-soft) 0 25%,var(--rmt-theme-surface-solid) 0 50%) 0 0/14px 14px!important}
${p} .rmt-mv-asset img{object-fit:contain}
${p} .rmt-mv-asset i{top:7px;left:7px;padding:3px 7px;font-size:10px;line-height:1.35;border-radius:5px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-muted);box-shadow:0 1px 4px var(--rmt-theme-shadow)}
${p} .rmt-mv-asset.done i{background:var(--rmt-theme-wash);color:var(--rmt-theme-wash-ink)}
${p} .rmt-mv-edit-open{width:100%;padding:8px 10px;background:transparent!important;color:var(--rmt-theme-accent-ink)!important;font-size:13px!important}
${p} .rmt-mv-plus{align-self:center;padding:0 0 62px;font-size:20px;--rmt-content-ink:var(--rmt-theme-muted)}
${p} .rmt-mv-inspect{padding-top:3px}
${p} .rmt-mv-inspect summary{padding:7px 0;font-size:13px}
${p} .rmt-mv-inspect-row{display:grid;grid-template-columns:76px 76px minmax(0,1fr);gap:10px;align-items:start;padding:14px 0;border-top:1px solid var(--rmt-theme-border)}
${p} .rmt-mv-inspect-row figure{min-width:0;gap:6px}
${p} .rmt-mv-inspect-row img{width:100%;height:108px;background:var(--rmt-theme-soft)}
${p} .rmt-mv-inspect-row figure.cut img{background:repeating-conic-gradient(var(--rmt-theme-soft) 0 25%,var(--rmt-theme-surface-solid) 0 50%) 0 0/12px 12px}
${p} .rmt-mv-inspect-row>div{gap:7px;min-width:0}
${p} .rmt-mv-inspect-row figcaption{--rmt-content-ink:var(--rmt-theme-muted);font-size:11px!important}
${p} .rmt-mv-lyric{--rmt-content-ink:var(--rmt-theme-text);background:var(--rmt-theme-soft);border:0;border-radius:10px;padding:12px 14px}
${p} .rmt-mv-lyric p{font-size:14px!important;line-height:1.9!important}
${p} .rmt-mv-lyric small{--rmt-content-ink:var(--rmt-theme-muted);font-size:12px!important}
${p} .rmt-mv-palette{gap:14px;padding:15px 16px;border-radius:14px}
${p} .rmt-mv-palette>div{min-width:0}
${p} .rmt-mv-palette>div span{flex-wrap:wrap}
${p} .rmt-mv-palette>div i{width:20px;height:20px;border-radius:5px;border:1px solid var(--rmt-theme-border)}
${p} .rmt-mv-cover{width:60px;height:70px;border-radius:10px}
${p} .rmt-mv-toggle{gap:4px;padding:4px;border-radius:12px}
${p} .rmt-mv-toggle button{height:auto;min-height:44px;padding:9px 12px;border:1px solid transparent;border-radius:9px}
${p} .rmt-mv-thumb{width:82px;height:126px;border-radius:11px}
${p} .rmt-mv-thumb.wide{width:126px;height:82px}
${p} .rmt-mv-shot-copy{gap:8px}
${p} .rmt-mv-shot-copy b{font-size:15px!important;line-height:1.65}
${p} .rmt-mv-prompt{padding:16px;border:1px solid var(--rmt-theme-border);border-radius:11px;line-height:1.9;overflow-wrap:anywhere}
${p} .rmt-mv-bar{padding:10px 12px;border-radius:14px;gap:12px}
${p} .rmt-mv-play{min-width:44px;border:0!important;border-radius:50%;--rmt-content-ink:var(--rmt-theme-surface-solid);background:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important}
${p} .rmt-mv-track{min-width:0;gap:7px}
${p} .rmt-mv-track>div{background:var(--rmt-theme-soft)}
${p} .rmt-mv-track>div i{background:var(--rmt-theme-accent-ink)}
${p} .rmt-mv-strip{gap:9px;padding:3px 2px 8px;overscroll-behavior-x:contain}
${p} .rmt-mv-strip button{border-radius:10px;background:var(--rmt-theme-soft)!important}
${p} .rmt-mv-strip button.on{border-color:var(--rmt-theme-accent-ink)!important;box-shadow:0 0 0 2px var(--rmt-theme-accent-ink)}
${p} .rmt-mv-strip span{--rmt-content-ink:var(--rmt-theme-text);max-width:calc(100% - 8px);box-sizing:border-box;background:var(--rmt-theme-surface-solid);padding:3px 5px;line-height:1.35;font-size:10px}
${p} button.rmt-mv-tap.rmt-mv-tap{height:152px;min-height:152px;border-radius:16px;padding:16px;gap:9px;line-height:1.5;box-shadow:none}
${p} .rmt-mv-tap b{font-size:21px!important;line-height:1.5}
${p} .rmt-mv-tap small{font-size:13px!important}
${p} .rmt-mv-clock{font-size:32px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
${p} .rmt-mv-sec{min-width:0;gap:6px;border-radius:13px;border-width:1px;padding:0 7px 0 0}
${p} .rmt-mv-sec.cur{border-color:var(--rmt-theme-accent-ink);box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)}
${p} .rmt-mv-section-pick{min-height:78px;gap:10px;padding:12px 10px;border-radius:12px;align-items:center}
${p} .rmt-mv-section-pick>i{width:27px;height:27px;background:var(--rmt-theme-wash);color:var(--rmt-theme-wash-ink)}
${p} .rmt-mv-sec.tapped .rmt-mv-section-pick>i{background:var(--rmt-theme-accent-ink);color:var(--rmt-theme-surface-solid)}
${p} .rmt-mv-section-copy{gap:5px}
${p} .rmt-mv-section-copy b{font-size:14px!important}
${p} .rmt-mv-section-copy small{font-size:12px!important}
${p} .rmt-mv-section-pick>em{font-size:14px;font-variant-numeric:tabular-nums}
${p} .rmt-mv-sec>span{flex:none;gap:4px;padding-block:5px}
${p} .rmt-mv-sec>span button{min-width:44px;width:44px;min-height:44px;height:44px;border-radius:8px;padding:5px;font-size:11px!important}
${p} .rmt-mv-file{gap:12px;padding:14px;border-radius:12px}
${p} .rmt-mv-file label{flex:none;min-height:44px;line-height:1.4}
${p} .rmt-mv-file b{overflow-wrap:anywhere}
${p} .rmt-mv-editor{position:relative;overflow:visible;padding:18px;gap:12px;border-radius:16px}
${p} .rmt-mv-editor label{gap:8px;line-height:1.55;font-size:13px}
${p} .rmt-mv-editor :is(textarea,select){padding:12px;border-radius:10px;line-height:1.7!important}
${p} .rmt-mv-editor textarea{min-height:174px;resize:vertical}
${p} .rmt-mv-editor input[type="range"]{width:100%;margin:3px 0;accent-color:var(--rmt-theme-accent-ink)}
${p} .rmt-mv-editor-tools{gap:8px;margin:0;align-items:stretch}
${p} .rmt-mv-editor-tools button,${p} .rmt-mv-editor-upload,${p} .rmt-mv-editor button[data-edit="apply-crop"]{min-height:44px;box-sizing:border-box;border:1px solid var(--rmt-theme-border);border-radius:10px;padding:10px 12px;line-height:1.45!important;font-size:13px!important;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text)}
${p} .rmt-mv-editor-tools button[aria-pressed="true"]{border-color:var(--rmt-theme-accent-ink);border-width:1px;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)}
${p} .rmt-mv-editor-upload{margin:0;justify-content:center;color:var(--rmt-theme-accent-ink)!important}
${p} .rmt-mv-editor>.rmt-mv-editor-tools:first-child{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;border-radius:12px;background:var(--rmt-theme-soft)}
${p} .rmt-mv-editor>.rmt-mv-editor-tools:first-child button{border-color:transparent;border-radius:9px}
${p} .rmt-mv-editor-viewport{border:1px solid var(--rmt-theme-border);border-radius:12px;box-sizing:border-box;background:repeating-conic-gradient(var(--rmt-theme-soft) 0 25%,var(--rmt-theme-surface-solid) 0 50%) 0 0/16px 16px}
${p} .rmt-mv-editor [data-editor-status]{--rmt-content-ink:var(--rmt-theme-muted);font-size:13px!important;line-height:1.65!important;min-height:0;margin:0}
${p} .rmt-mv-editor [data-paint-tools]>label+label{flex-direction:row;align-items:center;gap:10px;min-height:44px}
${p} .rmt-mv-editor>.rmt-mv-editor-tools:last-of-type{position:sticky;bottom:0;z-index:3;display:flex;gap:10px;margin:6px -1px 0;padding:14px 1px 10px;background:var(--rmt-theme-surface-solid);border-top:1px solid var(--rmt-theme-border);box-shadow:0 -6px 14px var(--rmt-theme-shadow)}
${p} .rmt-mv-editor>.rmt-mv-editor-tools:last-of-type>button{flex:1 1 0;min-width:0}
${p} .rmt-mv-editor button[data-edit="save"]{--rmt-content-ink:var(--rmt-theme-surface-solid);background:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-accent-ink)!important}
${p} :is(button,select,textarea,input,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
@media(min-width:1100px){
  ${p}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
  ${p}>*{grid-column:1/-1}
  ${p}>.rmt-mv-gcard{grid-column:auto;height:100%;box-sizing:border-box}
}
@media(max-width:700px){
  ${p}{--rmt-mv-tile-width:min(160px,calc((100vw - 96px)/2));gap:16px;padding-top:2px}
  ${p} .rmt-x-card,${p} .rmt-mv-gcard,${p} .rmt-mv-shot,${p} .rmt-mv-step{padding:16px;gap:12px}
  ${p} .rmt-x-head h2{font-size:23px!important}
  ${p} .rmt-mv-choice{padding:13px;min-height:82px}
  ${p} .rmt-mv-assets{gap:10px}
  ${p} button.rmt-mv-asset{height:calc(var(--rmt-mv-tile-width) * .78)}
  ${p} .rmt-mv-inspect-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  ${p} .rmt-mv-inspect-row img{height:132px}
  ${p} .rmt-mv-inspect-row>div{grid-column:1/-1}
  ${p} .rmt-mv-inspect-row>div>button{align-self:flex-start}
  ${p} .rmt-mv-steps span{gap:4px;font-size:11px}
  ${p} .rmt-mv-palette{padding:13px;gap:12px}
  ${p} .rmt-mv-palette>small{font-size:11px!important}
  ${p} .rmt-mv-thumb.wide{width:106px;height:76px}
  ${p} .rmt-mv-shot-row{gap:10px}
  ${p} .rmt-mv-editor{padding:15px}
  ${p} .rmt-mv-editor-tools>button,${p} .rmt-mv-editor-upload{flex:1 1 120px}
  ${p} .rmt-mv-editor>.rmt-mv-editor-tools:last-of-type{padding:12px 1px 10px}
}
@media(max-width:360px){
  ${p} .rmt-mv-choice{padding:11px}
  ${p} .rmt-mv-choice b{font-size:14px!important}
  ${p} .rmt-mv-section-pick{gap:7px;padding-inline:8px}
  ${p} .rmt-mv-section-pick>i{width:24px;height:24px}
  ${p} .rmt-mv-section-pick>em{font-size:12px}
  ${p} .rmt-mv-file{gap:9px;padding:12px}
  ${p} .rmt-mv-file label{padding-inline:9px}
}
`;
}
