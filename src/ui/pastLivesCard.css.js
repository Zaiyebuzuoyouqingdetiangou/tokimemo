export function pastLivesCardCss(root) {
    return `
${root} .rmt-lenticular{margin:24px 0 12px;min-width:0}
${root} .rmt-lenticular-stage{aspect-ratio:16/9;width:100%;perspective:900px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
${root} .rmt-lenticular-surface{width:100%;height:100%;position:relative;overflow:hidden;border-radius:16px;background:#182129;transform:rotateY(var(--card-turn));box-shadow:0 8px 22px #0003;isolation:isolate}
${root} .rmt-lenticular-surface img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none}
${root} .rmt-lenticular-present{opacity:var(--card-position)}
${root} .rmt-lenticular[data-card-both="false"] .rmt-lenticular-present{opacity:1}
${root} .rmt-lenticular-foil{position:absolute;inset:0;pointer-events:none;opacity:.14;background:linear-gradient(115deg,transparent 18%,#ffd2b7 32%,#ecdbff 42%,#abffeb 50%,#ffdfa9 57%,transparent 74%),repeating-linear-gradient(90deg,#fff2 0 1px,transparent 1px 4px);background-size:250% 100%,100% 100%;background-position:var(--card-shine) center,center;mix-blend-mode:screen}
${root} .rmt-lenticular-face{position:absolute;left:12px;bottom:12px;background:#101820b8;color:#fff;border:1px solid #fff4;border-radius:20px;padding:4px 12px;font-size:12px;letter-spacing:2px}
${root} .rmt-lenticular-empty{position:absolute;inset:0;display:grid;place-items:center;color:#d0cbc0;font-size:14px}
${root} .rmt-lenticular-controls{display:flex;align-items:center;gap:12px;margin-top:14px}
${root} .rmt-lenticular-controls button{background:none;border:0;color:inherit;padding:10px 6px;white-space:nowrap;min-height:44px;font:inherit}
${root} .rmt-lenticular-controls input{flex:1;min-width:0;width:100%;height:44px;accent-color:var(--rmt-theme-accent-ink,#9b7858);cursor:ew-resize}
${root} .rmt-lenticular-controls button:disabled,${root} .rmt-lenticular-controls input:disabled{opacity:.4;cursor:default}
${root} .rmt-lenticular-status{font-size:12px!important;margin:2px 0 10px!important;opacity:.78;line-height:1.6}
${root} .rmt-lenticular-actions{display:flex;gap:8px;flex-wrap:wrap}
${root} .rmt-lenticular [hidden],${root} .rmt-card-picker [hidden]{display:none!important}
${root} .rmt-card-picker{position:absolute;inset:0;z-index:45;padding:16px;background:#111b;display:grid;place-items:center;border-radius:inherit}
${root} .rmt-card-picker,${root} .rmt-card-picker *{box-sizing:border-box}
${root} .rmt-card-picker section{width:min(850px,100%);height:min(740px,100%);min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid #ad9a8370;border-radius:20px;background:var(--rmt-theme-bg,#faf6ec);color:var(--rmt-theme-text,#302a24);box-shadow:0 12px 48px #0005}
${root} .rmt-card-picker header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px}
${root} .rmt-card-picker h3{margin:0;font-size:18px}
${root} .rmt-card-picker-filters{display:flex;gap:10px;padding:0 18px}
${root} .rmt-card-picker-filters input,${root} .rmt-card-picker-filters select{min-width:0;padding:10px;border:1px solid #b0a38f;border-radius:8px;font:inherit;color:inherit;background:transparent}
${root} .rmt-card-picker-filters input{flex:1;width:40%}
${root} .rmt-card-picker-status{margin:10px 18px;font-size:13px;line-height:1.5}
${root} .rmt-card-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));align-content:start;gap:12px;padding:4px 18px 18px;overflow:auto;overscroll-behavior:contain;min-height:0}
${root} .rmt-card-choice{display:flex;flex-direction:column;gap:7px;align-items:stretch;text-align:left;padding:9px;border:1px solid #b0a38f66;border-radius:12px;background:#ffffff16;color:inherit;min-width:0;cursor:pointer}
${root} .rmt-card-choice[aria-pressed="true"]{outline:2px solid #917551;outline-offset:-2px}
${root} .rmt-card-choice:disabled{opacity:.6;cursor:default}
${root} .rmt-card-choice-picture{aspect-ratio:16/9;background:#202b32;display:grid;place-items:center;border-radius:7px;overflow:hidden;color:#ddd;font-size:12px}
${root} .rmt-card-choice-picture img{width:100%;height:100%;object-fit:contain;min-height:0}
${root} .rmt-card-choice b{font-size:14px;overflow-wrap:anywhere}
${root} .rmt-card-choice small{font-size:11px;opacity:.75}
${root} .rmt-card-recommend{font-size:11px;color:#477a66;overflow-wrap:anywhere}
${root} .rmt-lenticular :focus-visible,${root} .rmt-card-picker :focus-visible{outline:2px solid #ab8e66;outline-offset:3px}
@media(max-width:540px){${root} .rmt-card-picker{padding:6px}${root} .rmt-card-picker-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:4px 10px 14px;gap:8px}${root} .rmt-card-picker-filters{padding:0 10px;gap:6px}${root} .rmt-card-picker-filters select{max-width:44%}}
@media(prefers-reduced-motion:reduce){${root} .rmt-lenticular-surface{transform:none}${root} .rmt-lenticular-foil{background-position:center}}
`;
}
