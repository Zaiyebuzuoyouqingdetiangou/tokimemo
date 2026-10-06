// Shared editor controls and dialogs retain their existing styles.
import * as layout from './mvEditorLayout.js';
export const EDITOR_PAGE_SIZE = layout.EDITOR_PAGE_SIZE;
export function editorMarkup(o) { return layout.editorMarkup(o); }
export function editorFilmstripMarkup(o) { return layout.editorFilmstripMarkup(o); }

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

function workbenchCss(root) { return layout.editorLayoutCss(root); }
