export function themeSongCss(root) {
    return `
${root} .rmt-theme-song{max-width:1000px;margin:auto;min-width:0;color:var(--rmt-theme-text)}
${root} .rmt-song-heading{display:flex;align-items:center;gap:14px;margin-bottom:8px}
${root} .rmt-song-heading h2{font-size:calc(24px*var(--rmt-font-scale,1));margin:0 0 5px}
${root} .rmt-song-heading p,${root} .rmt-song-note{font-size:calc(14px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted);margin:0;line-height:1.7}
${root} .rmt-song-emblem{width:54px;height:54px;display:grid;place-items:center;flex:none;border-radius:50%;font-size:calc(30px*var(--rmt-font-scale,1));border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink)}
${root} .rmt-song-composer{background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:18px;padding:0 18px;margin:18px 0}
${root} .rmt-song-composer>summary{cursor:pointer;min-height:52px;display:flex;align-items:center;gap:8px;font-weight:600}
${root} .rmt-song-composer>summary:before{content:'›'}
${root} .rmt-song-composer[open]>summary:before{content:'⌄'}
${root} .rmt-song-composer:not([open])>.rmt-song-form{display:none}
${root} .rmt-song-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:4px 0 18px}
${root} .rmt-song-form label{display:grid;gap:7px;font-size:calc(14px*var(--rmt-font-scale,1));min-width:0}
${root} .rmt-song-form [data-rmt-song-custom-row][hidden]{display:none!important}
${root} .rmt-song-wide{grid-column:1/-1}
${root} .rmt-theme-song :is(input,select,textarea){width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:44px;border:1px solid var(--rmt-theme-border);border-radius:10px;color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);padding:10px;font:inherit}
${root} .rmt-theme-song textarea{min-height:200px;resize:vertical}
${root} .rmt-song-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-width:0}
${root} .rmt-song-detail{min-width:0}
${root} .rmt-song-cover{max-width:480px;margin:0 auto 20px;min-width:0}
${root} .rmt-song-audio{--rmt-song-vinyl:#17151a;max-width:640px;margin:0 auto 20px;padding:16px 18px 14px;border:1px solid var(--rmt-theme-border);border-radius:20px;background:var(--rmt-theme-surface-solid);display:flex;flex-direction:column;gap:12px;min-width:0}
${root} .rmt-song-deck{display:flex;align-items:center;gap:18px;min-width:0}
${root} .rmt-song-record{position:relative;flex:none;width:176px;height:112px}
${root} .rmt-song-sleeve{position:absolute;left:0;top:0;z-index:1;width:112px;height:112px;border-radius:10px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(150deg,var(--rmt-theme-soft),var(--rmt-theme-surface-solid));border:1px solid var(--rmt-theme-border);box-shadow:4px 0 10px -6px rgba(0,0,0,.45)}
${root} .rmt-song-sleeve>span{font-size:calc(34px*var(--rmt-font-scale,1));color:var(--rmt-theme-accent-ink);opacity:.75}
${root} .rmt-song-sleeve>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${root} .rmt-song-sleeve>img~span{display:none}
${root} .rmt-song-disc{position:absolute;left:40px;top:4px;width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,transparent 0 19px,rgba(255,255,255,.06) 20px,transparent 21px),repeating-radial-gradient(circle,var(--rmt-song-vinyl) 0 2px,#232026 2px 3px),var(--rmt-song-vinyl);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);transition:left .45s cubic-bezier(.2,.7,.2,1)}
${root} .rmt-song-disc:after{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 30deg,transparent 0 12%,rgba(255,255,255,.12) 16%,transparent 22% 62%,rgba(255,255,255,.08) 66%,transparent 72%)}
${root} .rmt-song-disc>i{position:relative;width:38px;height:38px;border-radius:50%;overflow:hidden;background:var(--rmt-theme-accent-ink);display:block}
${root} .rmt-song-disc>i:after{content:'';position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--rmt-song-vinyl)}
${root} .rmt-song-disc>i>img{width:100%;height:100%;object-fit:cover;display:block}
${root} .rmt-song-audio.is-playing .rmt-song-disc{left:72px;animation:rmt-song-spin 2.4s linear infinite}
@keyframes rmt-song-spin{to{transform:rotate(360deg)}}
${root} .rmt-song-deck.is-empty .rmt-song-record{width:112px}
${root} .rmt-song-deck.is-empty .rmt-song-sleeve{border-style:dashed;box-shadow:none;background:var(--rmt-theme-soft)}
${root} .rmt-song-now{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
${root} .rmt-song-name{font-size:calc(18px*var(--rmt-font-scale,1));line-height:1.4;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${root} .rmt-song-deck.is-empty .rmt-song-name{font-size:calc(16px*var(--rmt-font-scale,1))}
${root} .rmt-song-by{font-size:calc(13px*var(--rmt-font-scale,1));line-height:1.5;color:var(--rmt-theme-muted);overflow-wrap:anywhere}
${root} .rmt-song-by>span{margin:0 6px;opacity:.5}
${root} .rmt-song-by a{color:inherit;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
${root} .rmt-song-transport{display:flex;align-items:center;gap:12px;margin-top:10px;min-width:0}
${root} .rmt-song-audio .rmt-song-play{flex:none;width:46px;height:46px;min-height:0!important;border-radius:50%;border:0!important;padding:0!important;display:grid;place-items:center;cursor:pointer;background:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid,#fff)!important;-webkit-text-fill-color:currentColor!important;box-shadow:0 6px 14px -8px var(--rmt-theme-accent-ink);transition:transform .15s}
${root} .rmt-song-audio .rmt-song-play:active{transform:scale(.94)}
${root} .rmt-song-play svg{width:22px;height:22px;fill:currentColor}
${root} .rmt-song-progress{flex:1;min-width:0}
${root} .rmt-theme-song .rmt-song-progress input[type=range]{--p:0%;-webkit-appearance:none;appearance:none;width:100%;min-height:0;height:20px;margin:0;padding:0;border:0;background:transparent;cursor:pointer}
${root} .rmt-song-progress input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:linear-gradient(90deg,var(--rmt-theme-accent-ink) var(--p),var(--rmt-theme-border) var(--p))}
${root} .rmt-song-progress input[type=range]::-moz-range-track{height:4px;border-radius:4px;background:linear-gradient(90deg,var(--rmt-theme-accent-ink) var(--p),var(--rmt-theme-border) var(--p))}
${root} .rmt-song-progress input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;border:0;background:var(--rmt-theme-accent-ink)}
${root} .rmt-song-progress input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;border:0;background:var(--rmt-theme-accent-ink)}
${root} .rmt-song-times{display:flex;justify-content:space-between;font-size:calc(12px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted);font-variant-numeric:tabular-nums}
${root} .rmt-song-source{border-top:1px solid var(--rmt-theme-border);padding-top:8px}
${root} .rmt-song-source>summary{cursor:pointer;min-height:36px;display:flex;align-items:center;gap:6px;font-size:calc(13px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted);list-style:none}
${root} .rmt-song-source>summary::-webkit-details-marker{display:none}
${root} .rmt-song-source>summary:before{content:'›'}
${root} .rmt-song-source[open]>summary:before{content:'⌄'}
${root} .rmt-song-source[open]>summary{margin-bottom:8px}
${root} .rmt-song-source>.rmt-song-toolbar{margin-top:8px}
${root} .rmt-song-link-row{display:flex;gap:8px;align-items:stretch}
${root} .rmt-song-link-row input{flex:1;min-width:0;min-height:44px;padding:0 12px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);font-size:calc(14px*var(--rmt-font-scale,1))}
${root} .rmt-song-link-row button{flex:0 0 auto;min-height:44px}
${root} .rmt-song-file{display:inline-flex;align-items:center;cursor:pointer}
${root} .rmt-song-audio>.rmt-song-note{margin:0;font-size:calc(13px*var(--rmt-font-scale,1));line-height:1.5;color:var(--rmt-theme-muted)}
${root} .rmt-song-audio>.rmt-song-note:empty{display:none}
@media(prefers-reduced-motion:reduce){${root} .rmt-song-audio.is-playing .rmt-song-disc{animation:none}${root} .rmt-song-disc{transition:none}}
@media(max-width:480px){${root} .rmt-song-audio{padding:14px}${root} .rmt-song-deck{gap:12px}${root} .rmt-song-record{width:120px;height:76px}${root} .rmt-song-deck.is-empty .rmt-song-record{width:76px}${root} .rmt-song-sleeve{width:76px;height:76px}${root} .rmt-song-disc{left:26px;top:3px;width:70px;height:70px}${root} .rmt-song-disc>i{width:26px;height:26px}${root} .rmt-song-audio.is-playing .rmt-song-disc{left:48px}${root} .rmt-song-name{font-size:calc(16px*var(--rmt-font-scale,1))}${root} .rmt-song-transport{margin-top:6px}${root} .rmt-song-audio .rmt-song-play{width:42px;height:42px}}
${root} .rmt-song-cover .rmt-thumb{aspect-ratio:auto;min-height:0;overflow:hidden;border-radius:16px}
${root} .rmt-song-cover .rmt-thumb img{width:100%;height:auto;display:block;object-fit:contain}
${root} .rmt-song-cover-empty{display:grid;place-content:center;gap:8px;text-align:center;min-height:150px;border-radius:16px;background:var(--rmt-theme-soft);color:var(--rmt-theme-accent-ink);border:1px solid var(--rmt-theme-border)}
${root} .rmt-song-cover-empty>span{font-size:calc(40px*var(--rmt-font-scale,1))}
${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(0,1fr)}
${root} .rmt-song-library{min-width:0;border:1px solid var(--rmt-theme-border);border-radius:16px;background:var(--rmt-theme-surface-solid);padding:0 14px}
${root} .rmt-song-library>summary{min-height:52px;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 0;font-weight:600;list-style:none}
${root} .rmt-song-library>summary::-webkit-details-marker{display:none}
${root} .rmt-song-library>summary:before{content:'›';flex:none}
${root} .rmt-song-library[open]>summary:before{content:'⌄'}
${root} .rmt-song-library>summary>span{flex:none}
${root} .rmt-song-library>summary>small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:auto;color:var(--rmt-theme-muted);font-weight:400}
${root} .rmt-song-library:not([open])>.rmt-song-list{display:none}
${root} .rmt-song-library[open]>.rmt-song-list{display:flex;max-height:55vh;overflow:auto;padding:0 0 14px;overscroll-behavior:contain}
${root} .rmt-song-list{display:flex;flex-direction:column;gap:8px;min-width:0}
${root} .rmt-song-list>button{display:flex;align-items:center;text-align:left;gap:10px;min-height:62px;white-space:normal;overflow-wrap:anywhere;min-width:0;width:100%;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);border-radius:14px;color:var(--rmt-theme-text);padding:12px;cursor:pointer;font:inherit}
${root} .rmt-song-list>button.active{border-color:var(--rmt-theme-accent-ink);background:var(--rmt-theme-soft)}
${root} .rmt-song-list b{display:block;font-size:calc(15px*var(--rmt-font-scale,1))}${root} .rmt-song-list small{display:block;margin-top:5px;font-size:calc(12px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted)}
${root} .rmt-song-sheet,${root} .rmt-song-empty{min-width:0;border-radius:18px;padding:24px;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text)}
${root} .rmt-song-sheet header{border-bottom:1px solid var(--rmt-theme-border);padding-bottom:18px}
${root} .rmt-song-sheet small{color:var(--rmt-theme-muted)}${root} .rmt-song-sheet h2{font-size:calc(26px*var(--rmt-font-scale,1));line-height:1.4;overflow-wrap:anywhere;margin:12px 0}
${root} .rmt-song-sheet h3{font-size:calc(17px*var(--rmt-font-scale,1));margin:0 0 10px}${root} .rmt-song-sheet p{font-size:calc(15px*var(--rmt-font-scale,1));line-height:1.8;margin:6px 0}
${root} .rmt-song-sheet :is(.rmt-song-style,.rmt-song-lyrics){padding-top:20px}
${root} .rmt-song-sheet pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;font:inherit;line-height:1.9;font-size:calc(16px*var(--rmt-font-scale,1));background:none;border:0;color:inherit;margin:12px 0 20px;padding:0}
${root} .rmt-song-style pre{font-size:calc(14px*var(--rmt-font-scale,1));padding:14px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-soft)}
${root} .rmt-song-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
${root} .rmt-song-toolbar h3{margin:0 auto 0 0}${root} .rmt-song-toolbar button{min-height:44px;font-size:calc(14px*var(--rmt-font-scale,1))!important;max-width:100%;white-space:normal!important}
${root} .rmt-song-sheet footer{border-top:1px solid var(--rmt-theme-border);padding-top:18px}
${root} .rmt-song-empty{text-align:center;padding:32px 20px}${root} .rmt-song-empty>span{font-size:calc(36px*var(--rmt-font-scale,1));color:var(--rmt-theme-accent-ink)}
${root} .rmt-theme-song :is(button,input,select,textarea,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink);outline-offset:3px}
${root} .rmt-song-display-switch{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
${root} .rmt-song-display-switch button[aria-pressed="true"]{border-color:var(--rmt-theme-accent-ink)!important;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)!important}
${root} .rmt-song-readable header{text-align:center}
${root} .rmt-song-readable h2{font-size:calc(30px*var(--rmt-font-scale,1));margin:16px 0}
${root} .rmt-song-readable .rmt-song-credit{font-size:calc(13px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted)}
${root} .rmt-song-reading-lyrics{max-width:38em;margin:24px auto 32px}
${root} .rmt-song-stanza{margin:28px 0}
${root} .rmt-song-stanza h3{font-size:calc(13px*var(--rmt-font-scale,1));color:var(--rmt-theme-muted);margin:0 0 10px;font-weight:500}
${root} .rmt-song-stanza p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(17px*var(--rmt-font-scale,1));line-height:2.1;margin:0}
${root} .rmt-song-arrangement>summary{min-height:44px;cursor:pointer;padding-top:12px;box-sizing:border-box}
${root} .rmt-song-arrangement:not([open])>p{display:none}
@media(max-width:640px){${root} .rmt-song-layout.has-songs{grid-template-columns:minmax(0,1fr)}${root} .rmt-song-sheet{padding:18px}${root} .rmt-song-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}${root} .rmt-song-list>button{height:100%}${root} .rmt-song-heading h2{font-size:calc(22px*var(--rmt-font-scale,1))}}
@media(max-width:350px){${root} .rmt-song-form{grid-template-columns:minmax(0,1fr)}${root} .rmt-song-list{grid-template-columns:minmax(0,1fr)}}
`;
}
