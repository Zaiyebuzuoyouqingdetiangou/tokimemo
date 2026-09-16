export function themeSongCss(root) {
    return `
${root} .rmt-theme-song{max-width:1000px;margin:auto;min-width:0;color:var(--rmt-theme-text)}
${root} .rmt-song-heading{display:flex;align-items:center;gap:14px;margin-bottom:8px}
${root} .rmt-song-heading h2{font-size:24px;margin:0 0 5px}
${root} .rmt-song-heading p,${root} .rmt-song-note{font-size:14px;color:var(--rmt-theme-muted);margin:0;line-height:1.7}
${root} .rmt-song-emblem{width:54px;height:54px;display:grid;place-items:center;flex:none;border-radius:50%;font-size:30px;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink)}
${root} .rmt-song-composer{background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:18px;padding:0 18px;margin:18px 0}
${root} .rmt-song-composer>summary{cursor:pointer;min-height:52px;display:flex;align-items:center;gap:8px;font-weight:600}
${root} .rmt-song-composer>summary:before{content:'›'}
${root} .rmt-song-composer[open]>summary:before{content:'⌄'}
${root} .rmt-song-composer:not([open])>.rmt-song-form{display:none}
${root} .rmt-song-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:4px 0 18px}
${root} .rmt-song-form label{display:grid;gap:7px;font-size:14px;min-width:0}
${root} .rmt-song-wide{grid-column:1/-1}
${root} .rmt-theme-song :is(input,select,textarea){width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:44px;border:1px solid var(--rmt-theme-border);border-radius:10px;color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);padding:10px;font:inherit}
${root} .rmt-theme-song textarea{min-height:200px;resize:vertical}
${root} .rmt-song-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-width:0}
${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(150px,0.8fr) minmax(0,2.4fr)}
${root} .rmt-song-list{display:flex;flex-direction:column;gap:8px;min-width:0}
${root} .rmt-song-list>button{display:flex;align-items:center;text-align:left;gap:10px;min-height:62px;white-space:normal;overflow-wrap:anywhere;min-width:0;width:100%;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);border-radius:14px;color:var(--rmt-theme-text);padding:12px;cursor:pointer;font:inherit}
${root} .rmt-song-list>button.active{border-color:var(--rmt-theme-accent-ink);background:var(--rmt-theme-soft)}
${root} .rmt-song-list b{display:block;font-size:15px}${root} .rmt-song-list small{display:block;margin-top:5px;font-size:12px;color:var(--rmt-theme-muted)}
${root} .rmt-song-sheet,${root} .rmt-song-empty{min-width:0;border-radius:18px;padding:24px;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text)}
${root} .rmt-song-sheet header{border-bottom:1px solid var(--rmt-theme-border);padding-bottom:18px}
${root} .rmt-song-sheet small{color:var(--rmt-theme-muted)}${root} .rmt-song-sheet h2{font-size:26px;line-height:1.4;overflow-wrap:anywhere;margin:12px 0}
${root} .rmt-song-sheet h3{font-size:17px;margin:0 0 10px}${root} .rmt-song-sheet p{font-size:15px;line-height:1.8;margin:6px 0}
${root} .rmt-song-sheet :is(.rmt-song-style,.rmt-song-lyrics){padding-top:20px}
${root} .rmt-song-sheet pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;font:inherit;line-height:1.9;font-size:16px;background:none;border:0;color:inherit;margin:12px 0 20px;padding:0}
${root} .rmt-song-style pre{font-size:14px;padding:14px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-soft)}
${root} .rmt-song-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
${root} .rmt-song-toolbar h3{margin:0 auto 0 0}${root} .rmt-song-toolbar button{min-height:44px;font-size:14px!important;max-width:100%;white-space:normal!important}
${root} .rmt-song-sheet footer{border-top:1px solid var(--rmt-theme-border);padding-top:18px}
${root} .rmt-song-empty{text-align:center;padding:32px 20px}${root} .rmt-song-empty>span{font-size:36px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-theme-song :is(button,input,select,textarea,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink);outline-offset:3px}
${root} .rmt-song-display-switch{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
${root} .rmt-song-display-switch button[aria-pressed="true"]{border-color:var(--rmt-theme-accent-ink)!important;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)!important}
${root} .rmt-song-readable header{text-align:center}
${root} .rmt-song-readable h2{font-size:30px;margin:16px 0}
${root} .rmt-song-readable .rmt-song-credit{font-size:13px;color:var(--rmt-theme-muted)}
${root} .rmt-song-reading-lyrics{max-width:38em;margin:24px auto 32px}
${root} .rmt-song-stanza{margin:28px 0}
${root} .rmt-song-stanza h3{font-size:13px;color:var(--rmt-theme-muted);margin:0 0 10px;font-weight:500}
${root} .rmt-song-stanza p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:17px;line-height:2.1;margin:0}
${root} .rmt-song-arrangement>summary{min-height:44px;cursor:pointer;padding-top:12px;box-sizing:border-box}
${root} .rmt-song-arrangement:not([open])>p{display:none}
@media(max-width:640px){${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(0,1fr)}${root} .rmt-song-sheet{padding:18px}${root} .rmt-song-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}${root} .rmt-song-list>button{height:100%}${root} .rmt-song-heading h2{font-size:22px}}
@media(max-width:350px){${root} .rmt-song-form{grid-template-columns:minmax(0,1fr)}${root} .rmt-song-list{grid-template-columns:minmax(0,1fr)}}
`;
}
