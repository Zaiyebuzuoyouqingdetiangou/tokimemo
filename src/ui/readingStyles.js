// Reading-only presentation. No persistence, provider calls or generated styles.
export function readingCss(root) {
    return `
${root} .rmt-memory-scene{display:flex;flex-direction:column;min-height:0;padding-bottom:16px;background:var(--rmt-theme-bg)}
${root} .rmt-reading-image{position:relative;display:block;aspect-ratio:16/10;height:auto;min-height:160px;max-height:none;box-sizing:border-box;overflow:hidden;background:var(--rmt-theme-soft);border-color:var(--rmt-theme-surface-solid)}
${root} .rmt-reading-image-saved{aspect-ratio:auto;min-height:0}
${root} .rmt-reading-image .rmt-cg-real{position:relative;inset:auto;display:block;width:100%;height:auto;max-height:none;object-fit:contain;transform:none}
${root} .rmt-reading-image:has(.rmt-cg-real[hidden]){aspect-ratio:16/10;min-height:160px}
${root} .rmt-memory-scene .rmt-memory-cg{flex:none;margin:16px 18px 10px}
${root} .rmt-memory-caption,${root} .rmt-cg-caption{position:static;inset:auto;backdrop-filter:none;box-shadow:none;border:0;border-radius:0;padding:0;background:transparent!important;color:var(--rmt-theme-text)!important;overflow-wrap:anywhere;line-height:1.7;font-size:14px}
${root} .rmt-memory-caption{margin:0 22px 24px}
${root} :is(.rmt-memory-caption,.rmt-cg-caption)>b{display:block;font-size:18px}
${root} :is(.rmt-memory-caption,.rmt-cg-caption)>span{display:block;font-size:13px;color:var(--rmt-theme-muted)!important}
${root} :is(.rmt-memory-caption,.rmt-cg-caption)>p{margin:6px 0 0;white-space:pre-wrap}
${root} .rmt-dialogue{background:var(--rmt-theme-surface-solid);border-color:var(--rmt-theme-border);color:var(--rmt-theme-text)}
${root} .rmt-dialogue-text{font-size:16px;line-height:1.85;min-height:0;margin-bottom:16px}
${root} .rmt-cg-memory-actions{margin:0 18px;justify-content:flex-end}
${root} .rmt-adv{min-height:0;align-items:start}
${root} .rmt-event-list,${root} .rmt-event-detail{overflow:visible;min-width:0}
${root} .rmt-adv-library-tools{margin:0 0 12px;border-bottom:1px solid var(--rmt-theme-border);font-size:13px;min-width:0}
${root} .rmt-adv-library-tools>summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;list-style:none;color:var(--rmt-theme-muted)}
${root} .rmt-adv-library-tools>summary:before{content:'›';font-size:20px}
${root} .rmt-adv-library-tools[open]>summary:before{content:'⌄'}
${root} .rmt-adv-library-tools:not([open])>div{display:none!important}
${root} .rmt-adv-library-tools>div{display:grid;gap:10px;padding:0 0 12px;min-width:0}
${root} .rmt-adv-library-tools .rmt-cg-provider-bar{margin:0}
${root} .rmt-adv-reading-actions{margin:0 0 12px;align-items:center;gap:8px}
${root} .rmt-adv-reading-actions .rmt-picture-settings{margin-left:auto;flex:none}
${root} .rmt-adv-reading-actions [data-rmt-action="read-adv"]:disabled{display:none}
${root} .rmt-adv-reading-layout{display:grid;gap:16px;min-width:0;align-items:start}
${root} .rmt-adv-reading-layout>*,${root} .rmt-adv-reading-copy{min-width:0}
${root} .rmt-adv-reading .rmt-cg-caption{margin:0 0 16px}
${root} .rmt-cg-caption>summary{cursor:pointer;min-height:44px;padding:8px 0}
${root} .rmt-cg-caption>summary>span{margin-left:12px;font-size:13px;color:var(--rmt-theme-muted)!important}
${root} .rmt-cg-caption:not([open])>p{display:none!important}
${root} .rmt-adv-reading .rmt-big-cg{margin:0}
${root} .rmt-adv-reader{min-height:0;padding:16px}
${root} .rmt-adv-para{font-size:16px;line-height:1.85;min-height:0;overflow-wrap:anywhere}
${root} .rmt-cg-only .rmt-big-cg{margin:0}
${root} :is(.rmt-memory-scene,.rmt-adv) :is(button,select,summary){min-height:44px;box-sizing:border-box}
${root} :is(.rmt-memory-scene,.rmt-adv) :is(button,select,summary):focus-visible{outline:3px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
@media(min-width:1180px){
 ${root} .rmt-adv-reading-layout{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}
 ${root} .rmt-adv-picture{position:sticky;top:12px}
}
@media(max-width:760px), (max-height:500px){
 ${root} .rmt-adv{grid-template-columns:minmax(0,1fr)}
 ${root} .rmt-adv .rmt-event-list{position:static;top:auto;z-index:auto;padding:8px 12px 0;border-right:0;box-shadow:none}
 ${root} .rmt-event-list:before,${root} .rmt-event-items{display:none}
 ${root} .rmt-adv-mobile-picker{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px;align-items:center}
 ${root} .rmt-adv-mobile-picker .rmt-btn{padding:8px!important;font-size:22px!important;line-height:1!important}
 ${root} .rmt-adv-mobile-picker select{display:block;width:100%;min-width:0;max-width:100%;min-height:44px;margin:0;border:1px solid var(--rmt-theme-border);border-radius:10px;padding:8px;font-size:16px!important;text-overflow:ellipsis}
 ${root} .rmt-adv-library-tools{margin:0}
 ${root} .rmt-event-detail{padding:12px}
 ${root} .rmt-adv-reading .rmt-reading-image .rmt-cg-real{max-height:40vh;max-height:40dvh;object-fit:contain}
 ${root} .rmt-memory-scene .rmt-memory-cg{margin:12px 10px 10px;border-width:5px}
 ${root} .rmt-memory-caption{margin:0 16px 24px}
 ${root} .rmt-cg-memory-actions{margin:0 10px}
 ${root} .rmt-adv-reading-actions .rmt-btn{flex:0 1 auto}
}
@media(max-height:500px) and (min-width:600px){
 ${root} .rmt-adv-reading-layout{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}
 ${root} .rmt-adv-reading .rmt-reading-image .rmt-cg-real{max-height:64vh;max-height:64dvh}
}
@media(prefers-reduced-motion:reduce){${root} :is(.rmt-memory-scene,.rmt-adv) *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
}
