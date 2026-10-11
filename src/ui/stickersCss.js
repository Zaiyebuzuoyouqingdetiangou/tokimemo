// 表情包页跟随心迹回廊当前主题（--rmt-theme-*），不改动全局或酒馆美化。
import * as constants from '../core/constants.js';

export function stickersCss() {
    // The themed overlay paints every button with an id-level rule; the few
    // filled/pressed states here need the same weight to show.
    const o = `#${constants.OVERLAY_ID}[data-rmt-theme-mode] :is(.rmt-stk,.rmt-stk-sheet)`;
    return `
.rmt-stk,.rmt-stk-sheet{color:var(--rmt-theme-text);font-size:14px;line-height:1.6;min-width:0}
.rmt-stk{max-width:760px;margin:auto;padding:4px 0 24px;display:flex;flex-direction:column;gap:14px}
:is(.rmt-stk,.rmt-stk-sheet) *{box-sizing:border-box}
:is(.rmt-stk,.rmt-stk-sheet) [hidden]{display:none!important}
:is(.rmt-stk,.rmt-stk-sheet) :is(button,a.rmt-stk-button){font:inherit!important;color:var(--rmt-theme-text)!important;background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border)!important;border-radius:999px!important;min-height:44px;padding:8px 14px!important;cursor:pointer;line-height:1.4!important;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:6px;box-shadow:none!important;max-width:100%;white-space:normal!important}
:is(.rmt-stk,.rmt-stk-sheet) button:disabled{opacity:.5;cursor:default}
:is(.rmt-stk,.rmt-stk-sheet) :is(button,a).rmt-stk-primary{background:var(--rmt-theme-text)!important;color:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-text)!important;font-weight:600!important}
:is(.rmt-stk,.rmt-stk-sheet) :is(button,a).rmt-stk-danger{color:var(--rmt-theme-accent-ink)!important}
:is(.rmt-stk,.rmt-stk-sheet) :is(input:not([type=checkbox]),select,textarea){font:inherit!important;width:100%;min-width:0;min-height:44px;padding:9px 12px!important;color:var(--rmt-theme-text)!important;background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border)!important;border-radius:12px!important;line-height:1.5!important}
:is(.rmt-stk,.rmt-stk-sheet) textarea{resize:vertical;min-height:84px}
:is(.rmt-stk,.rmt-stk-sheet) input[type=checkbox]{width:22px;height:22px;accent-color:var(--rmt-theme-accent-ink);flex:none}
:is(.rmt-stk,.rmt-stk-sheet) :is(button,a,input,select,textarea,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink);outline-offset:2px}
:is(.rmt-stk,.rmt-stk-sheet) h2{font-size:21px!important;line-height:1.4;margin:0!important}
:is(.rmt-stk,.rmt-stk-sheet) h3{font-size:15px!important;margin:0!important}
:is(.rmt-stk,.rmt-stk-sheet) p{margin:0;line-height:1.7}
.rmt-stk-muted,:is(.rmt-stk,.rmt-stk-sheet) small{color:var(--rmt-theme-muted);font-size:12px;line-height:1.6}
.rmt-stk-head{display:flex;align-items:center;gap:12px}
.rmt-stk-head>div{flex:1;min-width:0}
.rmt-stk-head p{color:var(--rmt-theme-muted);font-size:13px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-back{width:44px;height:44px;padding:0!important;flex:none}
.rmt-stk-status{overflow-wrap:anywhere;color:var(--rmt-theme-accent-ink);font-size:13px}
.rmt-stk-status:empty{display:none}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-row{justify-content:space-between!important;width:100%;text-align:left;padding:10px 16px!important;min-height:48px}
.rmt-stk-row>span:first-child{font-weight:600}
.rmt-stk-row>span:nth-child(2){flex:1;min-width:0;color:var(--rmt-theme-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.rmt-stk-seg{display:grid;gap:4px;padding:4px;border:1px solid var(--rmt-theme-border);border-radius:999px;background:var(--rmt-theme-surface-solid)}
.rmt-stk-seg.is-3{grid-template-columns:repeat(3,minmax(0,1fr))}.rmt-stk-seg.is-4{grid-template-columns:repeat(4,minmax(0,1fr))}
:is(.rmt-stk,.rmt-stk-sheet) .rmt-stk-seg>button{border:0!important;min-height:38px;padding:4px 6px!important;background:transparent!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap!important;display:block}
:is(.rmt-stk,.rmt-stk-sheet) .rmt-stk-seg>button[aria-pressed=true]{background:var(--rmt-theme-text)!important;color:var(--rmt-theme-surface-solid)!important;font-weight:600!important}
.rmt-stk-packs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-pack{flex-direction:column;gap:6px!important;border-radius:18px!important;padding:12px 8px 10px!important;min-height:0}
.rmt-stk-pack img,.rmt-stk-pack .rmt-stk-plus{width:72px;height:72px;object-fit:contain}
.rmt-stk-plus{display:flex;align-items:center;justify-content:center;font-size:30px!important;line-height:1!important;color:var(--rmt-theme-muted);border:1px dashed var(--rmt-theme-border);border-radius:50%}
.rmt-stk-pack b{font-size:13px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rmt-stk-pack small{margin-top:-4px}
.rmt-stk-empty{grid-column:1/-1;text-align:center;color:var(--rmt-theme-muted);font-size:13px;padding:8px 0}
.rmt-stk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-cell{flex-direction:column;gap:4px!important;border-radius:16px!important;padding:8px 6px!important;min-height:0;position:relative}
.rmt-stk-cell img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
.rmt-stk-cell span{font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rmt-stk-cell.is-removed{opacity:.35}
.rmt-stk-cell em{position:absolute;top:6px;right:6px;font-style:normal;font-size:11px;padding:0 6px;border-radius:999px;background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink)}
.rmt-stk-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rmt-stk-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rmt-stk-four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
:is(.rmt-stk,.rmt-stk-sheet) .rmt-stk-four>button{min-height:38px;padding:4px 6px!important;font-size:13px!important}
.rmt-stk-card{background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px}
.rmt-stk-field{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13px}
.rmt-stk-field>small{font-weight:400}
.rmt-stk-check{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-style{flex-direction:column;align-items:flex-start!important;text-align:left;border-radius:14px!important;padding:10px 12px!important;gap:2px!important}
.rmt-stk-style small{font-size:11px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-style[aria-pressed=true]{border-color:var(--rmt-theme-accent-ink)!important;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-soft)!important}
.rmt-stk-items{display:flex;flex-direction:column;gap:8px}
.rmt-stk-item{display:grid;grid-template-columns:28px minmax(0,1fr) 40px;gap:6px 10px;align-items:start;background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:16px;padding:10px}
.rmt-stk-item>b{width:28px;height:28px;border-radius:50%;background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink);font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:8px}
.rmt-stk-item>div{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:6px}
.rmt-stk-item>div>textarea{grid-column:1/-1;min-height:52px;font-size:12px!important;font-family:ui-monospace,Menlo,monospace!important}
:is(.rmt-stk,.rmt-stk-sheet) .rmt-stk-item>button{width:40px;height:40px;padding:0!important;min-height:0;margin-top:2px;color:var(--rmt-theme-muted)!important}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-dashed{border-style:dashed!important;background:transparent!important}
.rmt-stk-foot{display:flex;flex-direction:column;gap:8px;padding-top:4px;border-top:1px solid var(--rmt-theme-border)}
.rmt-stk-warn{font-size:12px;line-height:1.6;color:var(--rmt-theme-accent-ink)}
.rmt-stk-progress{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--rmt-theme-border);border-radius:16px;background:var(--rmt-theme-soft)}
.rmt-stk-progress span{flex:1;min-width:0;overflow-wrap:anywhere}
.rmt-stk-sheets{display:flex;gap:8px;overflow-x:auto}
.rmt-stk-sheets img{height:90px;border-radius:10px;border:1px solid var(--rmt-theme-border);background:#fff}
.rmt-stk-pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.7;color:var(--rmt-theme-muted);background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:14px;padding:12px;margin:0}
.rmt-stk-shade{--stk-safe-top:max(16px,env(safe-area-inset-top,0px),var(--rmt-mobile-safe-top,0px));position:fixed;inset:0;z-index:10000;background:rgba(30,22,20,.5);display:flex;align-items:flex-end;justify-content:center;padding-top:var(--stk-safe-top);box-sizing:border-box}
.rmt-stk-sheet{width:min(560px,100%);max-height:100%;padding-bottom:max(20px,env(safe-area-inset-bottom,0px))!important;overflow:auto;background:var(--rmt-theme-bg,var(--rmt-theme-surface-solid));border-radius:24px 24px 0 0;padding:14px 18px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 -8px 30px rgba(0,0,0,.18)}
.rmt-stk-sheet>header{display:flex;align-items:center;justify-content:space-between;gap:12px}
:is(.rmt-stk,.rmt-stk-sheet) button.rmt-stk-close{width:44px;height:44px;padding:0!important;flex:none}
.rmt-stk-preview{align-self:center;width:200px;height:200px;border-radius:20px;background-color:#f6efe3;background-image:linear-gradient(45deg,#ece2d1 25%,transparent 25%,transparent 75%,#ece2d1 75%),linear-gradient(45deg,#ece2d1 25%,transparent 25%,transparent 75%,#ece2d1 75%);background-size:20px 20px;background-position:0 0,10px 10px;display:flex;align-items:center;justify-content:center}
.rmt-stk-preview img{width:180px;height:180px;object-fit:contain}
.rmt-stk-token{display:block;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--rmt-theme-muted);overflow-wrap:anywhere}
@media (max-width:420px){.rmt-stk-packs,.rmt-stk-grid{gap:8px}.rmt-stk-pack img,.rmt-stk-pack .rmt-stk-plus{width:60px;height:60px}.rmt-stk-item>div{grid-template-columns:1fr}}
${o} :is(button,a).rmt-stk-primary{background:var(--rmt-theme-text)!important;color:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-text)!important}
${o} :is(button,a).rmt-stk-danger{color:var(--rmt-theme-accent-ink)!important}
${o} .rmt-stk-seg>button{background:transparent!important;border-color:transparent!important}
${o} .rmt-stk-seg>button[aria-pressed=true]{background:var(--rmt-theme-text)!important;color:var(--rmt-theme-surface-solid)!important}
${o} button.rmt-stk-style[aria-pressed=true]{background:var(--rmt-theme-soft)!important;border-color:var(--rmt-theme-accent-ink)!important}
${o} button.rmt-stk-dashed{background:transparent!important;border-style:dashed!important}
`;
}
