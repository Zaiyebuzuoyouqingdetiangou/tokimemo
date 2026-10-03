export function themeSongCss(root) {
    root += ' .rmt-body';
    return `
${root} .rmt-theme-song{max-width:1000px;margin:auto;min-width:0;color:var(--rmt-theme-text)}
${root} .rmt-song-heading{display:flex;align-items:center;gap:12px;margin-bottom:8px}
${root} .rmt-song-heading h2{font-size:25px!important;margin:0 0 3px!important}
${root} .rmt-song-heading p,${root} .rmt-song-note{font-size:13px!important;color:var(--rmt-theme-muted)!important;margin:0;line-height:1.7!important}
${root} .rmt-song-emblem{width:42px;height:42px;display:grid;place-items:center;flex:none;border-radius:13px;font-size:24px;background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink)!important}
${root} .rmt-song-composer{background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:14px;padding:0 18px;margin:18px 0 24px}
${root} .rmt-song-composer>summary{cursor:pointer;min-height:48px;display:flex;align-items:center;gap:9px;font-weight:600!important;font-size:14px;list-style:none}
${root} .rmt-song-composer>summary::-webkit-details-marker{display:none}
${root} .rmt-song-composer>summary:after{content:'';margin-left:auto;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);flex:none}
${root} .rmt-song-composer[open]>summary:after{transform:rotate(225deg)}
${root} .rmt-song-composer:not([open])>.rmt-song-form{display:none}
${root} .rmt-song-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:8px 0 18px}
${root} .rmt-song-form label{display:grid;gap:7px;font-size:13px;min-width:0}
${root} .rmt-song-form [data-rmt-song-custom-row][hidden]{display:none!important}
${root} .rmt-song-wide{grid-column:1/-1}
${root} .rmt-theme-song :is(input,select,textarea){width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:44px;border:1px solid var(--rmt-theme-border);border-radius:9px;color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);padding:10px 12px;font:inherit;font-size:16px!important}
${root} .rmt-theme-song textarea{min-height:180px;resize:vertical;line-height:1.7!important}
${root} .rmt-theme-song textarea[data-rmt-song-direction]{min-height:96px}
${root} .rmt-theme-song .rmt-btn{min-height:44px;border-radius:10px!important;box-shadow:none!important;padding:9px 14px!important;max-width:100%;font-size:14px!important;white-space:normal!important}
${root} .rmt-theme-song .rmt-song-write,${root} .rmt-theme-song .rmt-song-mv-open{background:var(--rmt-theme-accent-ink)!important;border-color:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important;--rmt-content-ink:var(--rmt-theme-surface-solid);font-weight:600!important}
${root} .rmt-song-write{justify-self:start;grid-column:1/-1;min-width:130px}
${root} .rmt-theme-song :is(button,input,select,textarea):disabled{opacity:.55!important;cursor:default}
${root} .rmt-song-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:28px;min-width:0}
${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(145px,0.65fr) minmax(0,2.5fr)}
${root} .rmt-song-detail{min-width:0}
${root} .rmt-song-list{display:flex;flex-direction:column;gap:6px;min-width:0;align-self:start}
${root} .rmt-song-list>button{display:flex;align-items:center;text-align:left;gap:10px;min-height:62px;white-space:normal;overflow-wrap:anywhere;min-width:0;width:100%;border:1px solid transparent;background:transparent!important;border-radius:11px;color:var(--rmt-theme-text);padding:11px 12px;cursor:pointer;font:inherit;box-shadow:none!important}
${root} .rmt-song-list>button.active{border-color:var(--rmt-theme-border)!important;background:var(--rmt-theme-soft)!important;--rmt-content-ink:var(--rmt-theme-text);color:var(--rmt-theme-text)!important}
${root} .rmt-song-list>button>span:first-child{color:var(--rmt-theme-accent-ink)!important;flex:none}
${root} .rmt-song-list b{display:block;font-size:14px!important}
${root} .rmt-song-list small{display:block;margin-top:4px;font-size:12px!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-song-sheet,${root} .rmt-song-empty{min-width:0;color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:18px;padding:24px}
${root} .rmt-song-summary{display:grid;grid-template-columns:minmax(100px,160px) minmax(0,1fr);align-items:start;gap:22px;padding-bottom:8px;border:0}
${root} .rmt-song-meta{min-width:0;align-self:center;text-align:left}
${root} .rmt-song-meta>small{font-size:12px!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-song-meta h2{font-size:28px!important;line-height:1.4!important;overflow-wrap:anywhere;margin:7px 0 9px!important}
${root} .rmt-song-meta p{font-size:13px!important;line-height:1.75!important;margin:4px 0;color:var(--rmt-theme-muted)!important}
${root} .rmt-song-meta .rmt-song-credit{font-size:11px!important}
${root} .rmt-song-cover{min-width:0;max-width:none;margin:0}
${root} .rmt-song-cover .rmt-expanded-cg{margin:0}
${root} .rmt-song-cover .rmt-thumb{aspect-ratio:auto;min-height:0;overflow:hidden;border-radius:12px}
${root} .rmt-song-cover .rmt-thumb img{width:100%;height:auto;display:block;object-fit:contain;border-radius:12px}
${root} .rmt-song-cover-empty{display:grid;place-content:center;gap:7px;text-align:center;min-height:150px;border-radius:12px;background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink)!important;border:1px solid var(--rmt-theme-border)}
${root} .rmt-song-cover-empty>span{font-size:34px;color:var(--rmt-theme-accent-ink)!important}
${root} .rmt-song-cover-empty>b{font-size:12px!important}
${root} .rmt-song-cover .rmt-cg-menu-row{justify-content:flex-start}
${root} .rmt-song-cover .rmt-cg-menu{align-items:flex-start;width:100%}
${root} .rmt-song-cover .rmt-cg-menu-toggle{width:auto;min-height:44px;height:auto;display:flex;gap:5px;border:0;border-radius:7px;background:transparent!important;color:var(--rmt-theme-accent-ink)!important;font-size:12px;padding:0 3px}
${root} .rmt-song-cover .rmt-cg-menu-toggle:after{content:'封面设置'}
${root} .rmt-song-cover .rmt-cg-menu-toggle .rmt-bunny-icon{display:none}
${root} .rmt-song-cover .rmt-cg-menu-single .rmt-btn{flex:1 1 auto!important;max-width:100%;min-width:0;font-size:12px!important;padding:8px 6px!important;text-align:left;border:0!important;background:transparent!important;color:var(--rmt-theme-accent-ink)!important}
${root} .rmt-song-cover .rmt-cg-menu-single .rmt-bunny-icon{display:none}
${root} .rmt-song-cover .rmt-cg-menu-list{box-sizing:border-box;width:100%;padding:4px}
${root} .rmt-song-cover .rmt-cg-menu-list .rmt-btn{font-size:12px!important;padding:8px!important}
${root} .rmt-song-display-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:8px 0 24px;padding:12px 0 15px;border-bottom:1px solid var(--rmt-theme-border);position:sticky;top:0;z-index:5;background:var(--rmt-theme-surface-solid)}
${root} .rmt-song-display-options{display:flex;align-items:center;gap:2px;padding:3px;border-radius:11px;background:var(--rmt-theme-soft);min-width:0}
${root} .rmt-song-display-options .rmt-btn{border:1px solid transparent!important;padding:8px 11px!important;border-radius:8px!important;background:transparent!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-song-display-options .rmt-btn[aria-pressed="true"]{border-color:var(--rmt-theme-border)!important;background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-accent-ink)!important;box-shadow:0 1px 3px var(--rmt-theme-shadow)!important}
${root} .rmt-song-sheet h3{font-size:17px!important;margin:0 0 10px!important}
${root} .rmt-song-sheet p{font-size:15px;line-height:1.8;margin:6px 0}
${root} .rmt-song-sheet :is(.rmt-song-style,.rmt-song-lyrics){padding-top:4px}
${root} .rmt-song-sheet pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;font:inherit;line-height:1.9;font-size:16px;background:none;border:0;color:inherit;margin:12px 0 24px;padding:0}
${root} .rmt-song-style pre{font-size:14px;padding:16px;border:1px solid var(--rmt-theme-border);border-radius:10px;background:var(--rmt-theme-soft)}
${root} .rmt-song-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
${root} .rmt-song-toolbar h3{margin:0 auto 0 0!important}
${root} .rmt-song-sheet footer{border-top:1px solid var(--rmt-theme-border);padding-top:18px}
${root} .rmt-song-sheet footer [data-rmt-song="delete"]{margin-left:auto;background:transparent!important;border-color:transparent!important;color:var(--rmt-theme-muted)!important}
${root} .rmt-song-empty{text-align:center;padding:42px 24px}
${root} .rmt-song-empty>span{font-size:36px;color:var(--rmt-theme-accent-ink)!important}
${root} .rmt-theme-song :is(button,input,select,textarea,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
${root} .rmt-song-reading-lyrics{max-width:38em;margin:0 auto 32px}
${root} .rmt-song-stanza{margin:28px 0}
${root} .rmt-song-stanza:first-child{margin-top:0}
${root} .rmt-song-stanza h3{font-size:12px!important;color:var(--rmt-theme-muted)!important;margin:0 0 12px!important;font-weight:500!important}
${root} .rmt-song-stanza p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px!important;line-height:2.15!important;margin:0}
${root} .rmt-song-arrangement>summary{min-height:44px;cursor:pointer;padding:9px 0;box-sizing:border-box;color:var(--rmt-theme-accent-ink)!important;font-size:13px}
${root} .rmt-song-arrangement:not([open])>p{display:none}
@media(max-width:760px){
${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(0,1fr);gap:18px}
${root} .rmt-song-list{display:flex;flex-direction:row;overflow:auto;gap:8px;padding-bottom:3px;scrollbar-width:thin}
${root} .rmt-song-list>button{flex:0 0 auto;max-width:190px;width:auto;min-width:118px;min-height:52px;padding:8px 11px}
${root} .rmt-song-list b{font-size:13px!important}
${root} .rmt-song-list small{font-size:11px!important}
${root} .rmt-song-sheet{padding:20px}
${root} .rmt-song-summary{grid-template-columns:110px minmax(0,1fr);gap:18px}
${root} .rmt-song-meta h2{font-size:24px!important}
${root} .rmt-song-cover-empty{min-height:126px}
}
@media(max-width:480px){
${root} .rmt-song-heading h2{font-size:24px!important}
${root} .rmt-song-sheet{padding:0;border:0;border-radius:0;background:transparent}
${root} .rmt-song-summary{grid-template-columns:108px minmax(0,1fr);gap:17px}
${root} .rmt-song-meta h2{font-size:22px!important}
${root} .rmt-song-meta>small{font-size:11px!important}
${root} .rmt-song-meta p{font-size:12px!important}
${root} .rmt-song-display-switch{margin:8px 0 24px;gap:8px;background:var(--rmt-theme-bg)}
${root} .rmt-song-display-options .rmt-btn{font-size:13px!important;padding:8px 9px!important}
${root} .rmt-song-mv-open{font-size:13px!important;padding-inline:12px!important}
${root} .rmt-song-composer{padding:0 14px;margin:17px 0 20px}
${root} .rmt-song-stanza p{font-size:16px!important;line-height:2.15!important}
}
@media(max-width:350px){
${root} .rmt-song-form{grid-template-columns:minmax(0,1fr)}
${root} .rmt-song-summary{grid-template-columns:90px minmax(0,1fr);gap:13px}
${root} .rmt-song-meta h2{font-size:20px!important}
${root} .rmt-song-cover-empty{min-height:108px}
${root} .rmt-song-display-options .rmt-btn{font-size:12px!important;padding-inline:7px!important}
${root} .rmt-theme-song .rmt-song-mv-open{font-size:12px!important;padding-inline:10px!important}
${root} .rmt-song-sheet footer [data-rmt-song="delete"]{margin-left:0}
}
`;
}
