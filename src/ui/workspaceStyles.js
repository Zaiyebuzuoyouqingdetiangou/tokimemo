import * as song_styles from './themeSongStyles.js';
// Layout only; all colours continue to use the production theme palette.
export function workspaceCss(root = '#heartbeat_memories_overlay') {
    const r = root + '.rmt-workspace[data-rmt-theme-mode]';
    return `${song_styles.themeSongCss(r)}
${r} .rmt-cg-format{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin:0 0 14px;min-width:0;padding:10px 12px;border:1px solid var(--rmt-theme-border);border-radius:14px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text)}
${r} .rmt-cg-format>span{font-size:14px;font-weight:600}
${r} .rmt-cg-format select,${r} [data-rmt-cg-editor-format]{box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:44px;font:inherit;font-size:15px;color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:10px;padding:8px}
${r} .rmt-cg-format small{font-size:12px;line-height:1.5;color:var(--rmt-theme-muted)}

${r}{position:fixed!important;inset:0!important;box-sizing:border-box!important;width:100vw!important;width:100dvw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;padding:24px!important;margin:0!important;border:0!important;display:flex;align-items:center!important;justify-content:center!important;background:rgba(17,22,32,.28)!important}
${r}[hidden]{display:none!important}
${r} .rmt-shell{box-sizing:border-box!important;width:min(1060px,100%)!important;height:84vh!important;height:84dvh!important;max-height:calc(100dvh - 48px)!important;min-height:0!important;border:1px solid var(--rmt-theme-border)!important;outline:0!important;border-radius:22px!important;background:var(--rmt-theme-bg)!important;box-shadow:0 16px 60px #17203238!important;overflow:hidden!important}
${r} .rmt-shell:before{display:none!important}
${r}.rmt-workspace-expanded{padding:0!important}
${r}.rmt-workspace-expanded .rmt-shell{width:100%!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important}
${r} .rmt-topbar{flex:0 0 auto!important;min-height:62px!important;padding:8px 14px!important;gap:8px!important;background:var(--rmt-theme-header-tint)!important;border:0!important;border-bottom:3px solid var(--rmt-theme-border)!important}
${r} .rmt-topbar-title:after{display:none!important}
${r} .rmt-topbar-title{flex:1!important;min-width:0!important;font-size:17px!important;line-height:1.4!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
${r} .rmt-topbar>button{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:none!important;box-sizing:border-box!important;min-width:44px!important;width:44px!important;min-height:44px!important;height:44px!important;max-width:44px!important;padding:0!important;margin:0!important;border:1px solid var(--rmt-theme-border)!important;border-radius:50%!important;color:var(--rmt-theme-text)!important;background:var(--rmt-theme-surface-solid)!important;letter-spacing:0!important;font-size:19px!important;line-height:1!important}
${r} .rmt-topbar>button:before,${r} .rmt-topbar>button:after{content:none!important;display:none!important}
${r} .rmt-topbar>button[hidden]{display:none!important}
${r} .rmt-body button.rmt-btn{align-items:center!important;justify-content:center!important;box-sizing:border-box!important;min-height:44px!important;min-width:44px;max-width:100%;height:auto!important;padding:10px 18px!important;margin:0;border-width:1px!important;border-style:solid!important;border-radius:999px!important;border-color:var(--rmt-theme-border,#cbdce6)!important;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;font-family:inherit!important;font-size:15px!important;font-weight:600!important;line-height:1.5!important;text-decoration:none!important;white-space:normal!important;overflow-wrap:anywhere;box-shadow:0 2px 7px var(--rmt-theme-shadow,#0001);cursor:pointer;touch-action:manipulation}
${r} .rmt-body button.rmt-btn.rmt-cg-primary{border-color:var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-text)!important;font-weight:700!important}
${r} .rmt-body button.rmt-btn.rmt-manage-danger{border-color:#b46a7f!important;color:var(--rmt-theme-text)!important;text-decoration:underline!important;text-underline-offset:3px}
${r} .rmt-body button.rmt-btn:not(:disabled):hover{border-color:var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-soft)!important}
${r} .rmt-body button.rmt-btn:focus-visible{outline:2px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
${r} .rmt-body button.rmt-btn:disabled{opacity:.55!important;cursor:not-allowed;box-shadow:none}
${r} .rmt-body .rmt-adv-mobile-picker>button.rmt-btn{padding:0!important;width:44px!important;min-width:44px!important}
${r} .rmt-cg-provider-bar{gap:10px!important;align-items:center;flex-wrap:wrap;padding:12px!important}
${r} .rmt-cg-provider-bar>button.rmt-btn{flex:0 1 auto;min-width:112px!important}
${r} .rmt-cg-provider-bar>[data-rmt-cg-progress]{font-size:14px!important;line-height:1.5;overflow-wrap:anywhere}
${r} .rmt-body .rmt-card-actions>button.rmt-btn{width:100%;min-height:46px!important}
${r} .rmt-workspace-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;flex:none;gap:8px;padding:12px 16px;background:var(--rmt-theme-surface-solid);border-bottom:1px solid var(--rmt-theme-border)}
${r} .rmt-workspace-tabs button,${r} .rmt-workspace-groups button,${r} .rmt-layout-switch button{min-height:44px;min-width:0;padding:8px 16px;border:1px solid var(--rmt-theme-border);border-radius:24px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);font:inherit;font-size:15px!important;cursor:pointer}
${r} :is(.rmt-workspace-tabs,.rmt-workspace-groups,.rmt-layout-switch) button.active{border-color:var(--rmt-theme-accent-ink);box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink);background:var(--rmt-theme-soft)}
${r} .rmt-workspace-location{flex:none;display:flex;gap:10px;align-items:center;min-width:0;padding:4px 16px;border-bottom:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid);font-size:13px}
${r} .rmt-workspace-location[hidden]{display:none}
${r} .rmt-workspace-location>span{min-width:0;overflow-wrap:anywhere}
${r} .rmt-workspace-location>small{margin-left:auto;font-size:12px;max-width:45%;overflow-wrap:anywhere;color:var(--rmt-theme-muted)!important}
${r} .rmt-crumb-button{min-height:38px;flex:none;border:0;background:transparent;color:var(--rmt-theme-text);font:inherit;padding:6px;cursor:pointer}
${r} .rmt-body{flex:1 1 auto!important;min-height:0!important;min-width:0!important;overflow:auto!important;overscroll-behavior:contain!important;padding:20px!important;background:var(--rmt-theme-bg)!important;scrollbar-gutter:stable;touch-action:pan-y pinch-zoom!important}
${r} .rmt-body>:is(.rmt-workspace-page,.rmt-home){width:100%;max-width:960px;margin:0 auto;padding:0;box-sizing:border-box}
${r} .rmt-workspace-section-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:0 0 18px}
${r} .rmt-workspace-section-head h2{margin:0!important;font-size:22px!important}
${r} .rmt-workspace-section-head p{margin:5px 0 0!important;font-size:14px!important;color:var(--rmt-theme-muted)!important}
${r} .rmt-layout-switch{display:flex;gap:6px;flex:none}
${r} .rmt-layout-switch button{padding:6px 12px}
${r} .rmt-workspace-groups{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
${r} .rmt-workspace-portals{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important;margin:0!important}
${r} .rmt-workspace-card{min-width:0!important;margin:0!important;padding:0!important;border:1px solid var(--rmt-theme-border)!important;border-radius:18px!important;box-shadow:0 5px 18px var(--rmt-theme-shadow)!important;overflow:hidden;background:var(--rmt-theme-surface-solid)!important}
${r} .rmt-workspace-card .rmt-portal-open{width:100%!important;min-height:204px!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:7px!important;padding:20px 12px!important;box-sizing:border-box;border:0;background:transparent;color:var(--rmt-theme-text);cursor:pointer}
${r} .rmt-workspace-card .rmt-portal-avatar{width:66px!important;height:66px!important;min-width:66px!important;border-width:3px!important;outline:1px solid var(--rmt-theme-border)!important;box-shadow:none!important;margin:0 0 4px!important;border-radius:50%!important;flex:none}
${r} .rmt-workspace-card .rmt-portal-avatar>i{font-size:24px!important}
${r} .rmt-workspace-card .rmt-portal-title{font-size:17px!important;margin:0!important;text-align:center;font-weight:600!important;line-height:1.4!important}
${r} .rmt-workspace-card .rmt-portal-subtitle{font-size:13px!important;line-height:1.5!important;margin:0!important;min-height:0!important;color:var(--rmt-theme-muted)!important;white-space:normal!important}
${r} .rmt-workspace-card .rmt-portal-status{font-size:12px!important;line-height:1.5!important;margin:3px 0 0!important;color:var(--rmt-theme-muted)!important;white-space:normal!important}
${r} .rmt-workspace-enter{display:none}
${r} .rmt-workspace-portals[data-rmt-layout="list"]{grid-template-columns:minmax(0,1fr)!important;gap:10px!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-open{display:grid!important;grid-template-columns:56px minmax(0,1fr) 22px;grid-template-rows:auto auto auto;min-height:100px!important;gap:2px 14px!important;align-items:center!important;justify-items:stretch!important;padding:16px!important;text-align:left!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-avatar{grid-column:1;grid-row:1/4;width:52px!important;height:52px!important;min-width:52px!important;margin:0!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] :is(.rmt-portal-title,.rmt-portal-subtitle,.rmt-portal-status){grid-column:2;text-align:left!important;margin:0!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-workspace-enter{display:block;grid-column:3;grid-row:1/4;font-size:24px}
${r} .rmt-workspace-page .rmt-memory-gate{display:flex!important;flex-direction:column;gap:14px;padding:22px!important;margin:16px 0;border-radius:18px!important}
${r} .rmt-workspace-page .rmt-archive-card:before,${r} .rmt-workspace-page .rmt-archive-card:after{display:none!important}
${r} .rmt-workspace-page .rmt-archive-title{font-size:22px!important;margin:0 0 12px!important}
${r} .rmt-archive-summary-preview{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:6px 0 12px;font-size:15px!important;line-height:1.8!important}
${r} .rmt-source-status>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:13px}
${r} .rmt-source-status:not([open])>small{display:none}
${r} .rmt-archive-full-details>summary,${r} .rmt-archive-tools>summary{min-height:44px;display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--rmt-theme-accent-ink)!important;font-size:14px!important;list-style:none}
${r} :is(.rmt-archive-full-details,.rmt-archive-tools)>summary:before{content:'›'}
${r} :is(.rmt-archive-full-details,.rmt-archive-tools)[open]>summary:before{content:'⌄'}
${r} .rmt-archive-full-details:not([open])>.rmt-archive-cover,${r} .rmt-archive-tools:not([open])>button{display:none!important}
${r} .rmt-current-archive-actions{display:flex!important;align-items:start;flex-wrap:wrap;gap:10px;min-width:0}
${r} .rmt-current-archive-actions>.rmt-btn{min-height:46px!important;width:auto!important;max-width:100%;padding:10px 18px!important;font-size:15px!important}
${r} .rmt-current-archive-actions>.rmt-archive-update{background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important;border-color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-archive-tools[open]{display:grid;gap:8px}
${r} .rmt-workspace-page .rmt-external-memory-row{padding:18px!important;border:1px solid var(--rmt-theme-border)!important;border-radius:18px!important;box-shadow:none!important}
${r} .rmt-external-memory-row h3{font-size:18px!important;margin:0 0 8px!important}
${r} .rmt-external-memory-row .rmt-source-note{font-size:14px!important;margin:0 0 14px!important}
${r} .rmt-external-memory-row .rmt-external-memory-toggle{font-size:16px!important;line-height:1.6!important;align-items:center}
${r} .rmt-external-memory-row>small{display:block;line-height:1.7;font-size:13px!important;margin-top:10px;overflow-wrap:anywhere}
${r} .rmt-external-memory-row button{min-height:44px!important;font-size:14px!important}
${r} .rmt-calendar-quick{margin:16px 0;padding:16px!important;border-radius:18px!important}
${r} .rmt-calendar-quick-copy>span{display:none}
${r} .rmt-calendar-quick-copy>small{font-size:13px!important;line-height:1.6!important}
${r} .rmt-workspace-browse{display:block;margin:20px auto 8px;min-height:46px;font-size:16px}
${r} .rmt-home-heading{padding:0 0 16px!important}
${r} .rmt-home-heading h1{font-size:24px!important;margin:0 0 6px!important}
${r} .rmt-home-heading p{font-size:14px!important;margin:0!important;color:var(--rmt-theme-muted)!important}
${r} .rmt-settings-content{gap:14px!important}
${r} .rmt-settings-card-head{min-height:68px!important;padding:14px 16px!important}
${r} .rmt-settings-card-head small{font-size:13px!important}
${r} .rmt-settings-card-head b{font-size:17px!important}
${r} .rmt-settings-card .rmt-settings-section-body{padding:18px!important}
${r} .rmt-settings-archive-actions{display:none!important}
${r} .rmt-workspace-more{padding:0 16px;background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:16px}
${r} .rmt-workspace-more>summary{min-height:60px;display:flex;align-items:center;cursor:pointer;font-size:16px}
${r} .rmt-workspace-more-body{display:grid;gap:12px;padding-bottom:16px;min-width:0}
${r} .rmt-workspace-more:not([open])>.rmt-workspace-more-body{display:none!important}
${r} .rmt-workspace-empty{padding:28px;max-width:720px;margin:20px auto;border:1px solid var(--rmt-theme-border);border-radius:20px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text)}
${r} .rmt-workspace-empty p{margin:16px 0 24px!important;line-height:1.8}
${r} .rmt-workspace-empty button{font-size:15px!important;min-height:46px}
${r} .rmt-language-reader{max-width:760px;margin:0 auto;min-width:0}
${r} .rmt-language-reader .rmt-heart-script{margin:24px 0}
${r} .rmt-language-reader .rmt-heart-line-avatar{width:44px;height:44px;flex:none}
${r} .rmt-language-reader :is(select,button){min-height:44px!important;box-sizing:border-box;font-size:15px!important}
${r} .rmt-language-pager{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:20px 0}
${r} .rmt-heart-summary{padding:16px!important;margin-bottom:18px!important;min-height:0!important}
${r} .rmt-heart-summary>details>summary{min-height:44px;cursor:pointer;font-size:15px}
${r} .rmt-heart-summary>details:not([open])>p{display:none}
${r} .rmt-heart-top-actions{flex-wrap:wrap;gap:10px}
${r} .rmt-heart-top-actions button{max-width:100%;white-space:normal;min-height:44px}
${r} .rmt-heart-single-drama:not(:has(>nav)){grid-template-columns:minmax(0,1fr)!important}
${r} .rmt-heart-line>div{background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important}
${r} .rmt-heart-line.user>div{background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important}
${r} .rmt-adv-reading-layout.rmt-adv-text-first{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:16px;max-width:780px;margin:0 auto}
${r} .rmt-adv-reader{padding:22px!important}
${r} .rmt-adv-para{font-size:17px!important;line-height:1.95!important}
${r} .rmt-filter{display:flex;flex-wrap:wrap;gap:8px}
${r} .rmt-filter .rmt-btn{min-height:44px!important}
${r} .rmt-room-view{--rmt-interior-wall:#ece6de;--rmt-interior-backwall:#f5f0e9;--rmt-interior-floor:#dcc7b1;--rmt-interior-wood:#bda087;--rmt-interior-line:#79614e;--rmt-interior-fabric:#b4a8b9;--rmt-interior-glass:#b7cfda;--rmt-interior-paper:#fff8ec}
${r}[data-rmt-theme-dark="true"] .rmt-room-view{--rmt-interior-wall:#353442;--rmt-interior-backwall:#404050;--rmt-interior-floor:#453c3b;--rmt-interior-wood:#70605b;--rmt-interior-line:#aa9690;--rmt-interior-fabric:#796c89;--rmt-interior-glass:#536d87;--rmt-interior-paper:#c3b9b5}
${r} .rmt-room-view[data-rmt-room-world="historical"]{--rmt-interior-fabric:#8d9f9c;--rmt-interior-glass:#bac7c0}
${r} .rmt-room-view[data-rmt-room-world="scifi"]{--rmt-interior-fabric:#8093ad;--rmt-interior-wood:#a0aebc;--rmt-interior-line:#5d6b81}
${r}[data-rmt-theme-dark="true"] .rmt-room-view[data-rmt-room-world="scifi"]{--rmt-interior-wood:#536579;--rmt-interior-line:#9fb4d0}
${r} .rmt-room-view .rmt-room-layout-scene{padding:0!important;background:var(--rmt-interior-backwall)!important;min-height:0!important;overflow:hidden;isolation:isolate;border:0!important}
${r} .rmt-room-view .rmt-room-layout-scene:before,${r} .rmt-room-view .rmt-room-layout-scene:after{display:none!important}
${r} .rmt-room-interior-layout{display:grid;gap:0;position:relative;min-width:0}
${r} .rmt-interior{position:relative;width:100%;min-width:0;isolation:isolate;overflow:hidden}
${r} .rmt-interior-svg{width:100%;height:auto;display:block;aspect-ratio:900/550}
${r} .rmt-interior-hotspot{position:absolute;transform:translate(-50%,-15%);display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:44px;min-height:44px;max-width:124px;padding:5px 9px;gap:3px;border:0;border-radius:12px;background:transparent;color:var(--rmt-interior-line);font:inherit;cursor:pointer;box-shadow:none}
${r} .rmt-interior-hotspot b{font-size:12px!important;line-height:1.4!important;text-align:center;white-space:normal}
${r} .rmt-interior-hotspot span{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);border:1px solid var(--rmt-theme-border);font-size:13px!important;line-height:1.3;font-weight:600!important}
${r} .rmt-interior-hotspot.active span{border-color:var(--rmt-theme-accent-ink);box-shadow:0 0 0 2px var(--rmt-theme-accent-ink)}
${r} .rmt-interior-person{position:absolute;right:1%;top:69%;min-height:44px;max-width:22%;padding:5px 8px;border:1px solid var(--rmt-theme-border);border-radius:22px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);font:inherit;font-size:12px!important;cursor:pointer}
${r} .rmt-room-pets-overlay{position:absolute;inset:0;pointer-events:none;z-index:2}
${r} .rmt-room-flow{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr)!important;gap:18px!important;align-items:start}
${r} .rmt-room-stage{grid-column:1;grid-row:1/3;min-width:0;margin:0!important}
${r} .rmt-room-space-note-card{grid-column:2;grid-row:1}
${r} .rmt-room-private-life-card{grid-column:2;grid-row:2}
${r} .rmt-room-flow>.rmt-room-card{padding:18px!important;min-width:0;margin:0!important;background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border:1px solid var(--rmt-theme-border)!important;border-radius:18px!important}
${r} .rmt-room-card-kicker{font-size:14px!important;color:var(--rmt-theme-muted)!important;margin-bottom:10px!important}
${r} .rmt-room-object-title{font-size:20px!important;margin-bottom:12px}
${r} .rmt-room-object-line{background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important;padding:14px;border-radius:12px;margin-top:16px}
${r} .rmt-room-object-line>b{display:block;font-size:13px!important}
${r} .rmt-room-object-line>p{margin:8px 0 0!important;font-size:15px!important;line-height:1.85!important}
${r} .rmt-room-object-line *{color:inherit!important}
${r} .rmt-room-object-rail{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:8px;min-width:0;background:transparent!important;padding:10px 0!important}
${r} .rmt-room-object-rail .rmt-room-layout-chip{background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important;min-height:48px!important}
${r} .rmt-room-object-rail .rmt-room-layout-chip.active{background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important}
${r} :is(.rmt-room-map,.rmt-room-location){flex-wrap:wrap;gap:10px}
${r} .rmt-room-location{margin:16px 0!important;padding:0!important;min-width:0}
${r} .rmt-room-location-actions{display:flex;gap:8px;flex-wrap:wrap}
${r} .rmt-room-caption{line-height:1.8!important}
${r} :is(button,select,input,textarea){box-sizing:border-box;max-width:100%}
${r} :is(button,select,summary,[tabindex]):focus-visible{outline:3px solid var(--rmt-theme-accent-ink)!important;outline-offset:2px!important}
/* Dark follow-mode reaches the terminal's internal theme, not only its outer card. */
${r} .rmt-room-deep-toolbar{background:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-border)!important;border-radius:14px;padding:10px!important}
${r}[data-rmt-theme-dark="true"] .rmt-phone-shell{--rmt-screen-bg:var(--rmt-theme-bg);--rmt-screen-ink:var(--rmt-theme-text);--rmt-screen-muted:var(--rmt-theme-muted);--rmt-screen-accent:var(--rmt-theme-accent-ink);--rmt-screen-soft:var(--rmt-theme-surface-solid)}
${r}[data-rmt-theme-dark="true"] .rmt-phone-home{background:var(--rmt-screen-bg)!important}
${r}[data-rmt-theme-dark="true"] .rmt-phone-home:before{opacity:.08!important}
${r}[data-rmt-theme-dark="true"] :is(.rmt-phone-icon,.rmt-phone-dock,.rmt-phone-message,.rmt-phone-contact-card,.rmt-phone-browser-page,.rmt-phone-feed-post,.rmt-phone-photo-record,.rmt-phone-image-caption,.rmt-phone-dashboard,.rmt-phone-document,.rmt-phone-track-card,.rmt-phone-book-page,.rmt-phone-list,.rmt-phone-detail){color:var(--rmt-screen-ink)!important;background:var(--rmt-screen-soft)!important;border-color:var(--rmt-theme-border)!important;text-shadow:none!important}
${r}[data-rmt-theme-dark="true"] :is(.rmt-phone-message-owner,.rmt-phone-entry.active){background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important}
${r}[data-rmt-theme-dark="true"] :is(.rmt-phone-notepaper,.rmt-phone-ledger,.rmt-phone-route-journal){background:var(--rmt-paper-letter)!important;color:var(--rmt-paper-letter-ink)!important;--rmt-screen-ink:var(--rmt-paper-letter-ink);--rmt-screen-muted:var(--rmt-paper-letter-ink)}
${r}[data-rmt-theme-dark="true"] .rmt-phone-screen :is(p,h3,b,small,span,dt,dd){color:var(--rmt-screen-ink)!important;-webkit-text-fill-color:currentColor;text-shadow:none!important}
${r} .rmt-phone-home-grid .rmt-phone-app>span:last-of-type{font-size:12px!important;white-space:normal!important;line-height:1.6!important;text-shadow:none!important}
${r} .rmt-phone-page-back{width:44px!important;height:44px!important;min-height:44px!important}
${r} .rmt-phone-page-header{grid-template-columns:44px 42px minmax(0,1fr)!important}
@media(max-width:850px){
 ${r} .rmt-room-flow{grid-template-columns:minmax(0,1fr)!important}
 ${r} .rmt-room-flow>*{grid-column:1!important;grid-row:auto!important}
 ${r} .rmt-workspace-portals{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 ${r} .rmt-adv{grid-template-columns:minmax(0,1fr)!important}
 ${r} .rmt-event-items{display:none}
 ${r} .rmt-adv-mobile-picker{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px}
 ${r} .rmt-adv-mobile-picker select{min-width:0;max-width:100%;min-height:44px}
}
@media(max-width:600px){
 ${r}{padding:12px 8px!important;padding-top:max(12px,env(safe-area-inset-top),var(--rmt-mobile-safe-top,0px))!important;padding-bottom:max(12px,env(safe-area-inset-bottom))!important}
 ${r} .rmt-shell{width:100%!important;height:90dvh!important;max-height:calc(100dvh - max(12px,env(safe-area-inset-top),var(--rmt-mobile-safe-top,0px)) - max(12px,env(safe-area-inset-bottom)))!important;border-radius:18px!important}
 ${r}.rmt-workspace-expanded .rmt-shell{height:100dvh!important;max-height:100%!important;border-radius:0!important}
 ${r}.rmt-workspace-expanded{padding:0!important;padding-top:max(env(safe-area-inset-top),var(--rmt-mobile-safe-top,0px))!important;padding-bottom:env(safe-area-inset-bottom)!important}
 ${r} .rmt-topbar{gap:5px!important;padding:8px 10px!important;min-height:60px!important}
 ${r} .rmt-topbar:before{display:none!important}
 ${r} .rmt-topbar-title{font-size:15px!important}
 ${r} .rmt-topbar>button{width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important;min-height:44px!important}
 ${r} .rmt-workspace-tabs{padding:10px;gap:6px}
 ${r} .rmt-workspace-tabs button{padding:7px 6px;font-size:15px!important}
 ${r} .rmt-workspace-location{padding:2px 10px;font-size:12px}
 ${r} .rmt-body{padding:16px 12px!important;scrollbar-gutter:auto}
 ${r} .rmt-workspace-groups{gap:6px;margin-bottom:14px}
 ${r} .rmt-workspace-groups button{padding:6px 12px;min-height:44px;font-size:14px!important}
 ${r} .rmt-workspace-section-head{gap:10px;margin-bottom:14px}
 ${r} .rmt-workspace-section-head h2{font-size:21px!important}
 ${r} .rmt-workspace-portals{gap:10px!important}
 ${r} .rmt-workspace-card .rmt-portal-open{padding:16px 8px!important;min-height:204px!important}
 ${r} .rmt-workspace-card .rmt-portal-title{font-size:16px!important}
 ${r} .rmt-workspace-card .rmt-portal-subtitle{font-size:13px!important}
 ${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-open{padding:13px!important;min-height:98px!important;grid-template-columns:48px minmax(0,1fr) 16px;gap:3px 10px!important}
 ${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-avatar{width:44px!important;min-width:44px!important;height:44px!important}
 ${r} .rmt-workspace-page .rmt-memory-gate{padding:18px!important}
 ${r} .rmt-current-archive-actions{display:grid!important;grid-template-columns:minmax(0,1fr)}
 ${r} .rmt-current-archive-actions>.rmt-btn{width:100%!important}
 ${r} .rmt-workspace-empty{padding:22px;margin:8px auto}
 ${r} .rmt-interior-hotspot{max-width:76px;min-width:44px;padding:4px 6px;gap:0}
 ${r} .rmt-interior-hotspot b{display:none}
 ${r} .rmt-interior-person{font-size:11px!important;padding:4px;min-height:44px}
 ${r} .rmt-room-object-rail{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 ${r} .rmt-adv .rmt-event-list,${r} .rmt-adv .rmt-event-detail{padding:0!important}
 ${r} .rmt-adv-para{font-size:16px!important;line-height:1.9!important}
 ${r} .rmt-adv-reader{padding:18px!important}
 ${r} .rmt-cg-prompt-dialog{max-height:90dvh!important}
}
@media(max-width:360px){${r} .rmt-workspace-portals{grid-template-columns:minmax(0,1fr)!important}${r} .rmt-workspace-card .rmt-portal-open{min-height:172px!important}${r} .rmt-topbar-title{font-size:13px!important}${r} .rmt-topbar>button{width:44px!important;min-width:44px!important;max-width:44px!important}${r} .rmt-workspace-tabs button{font-size:14px!important}}
@media(prefers-reduced-motion:reduce){${r} :is(.rmt-workspace-card,.rmt-interior-hotspot){transition:none!important}}
`;
}


// Layout only. Keep full labels and existing actions, including modal controls
// outside .rmt-body. This runs after theme/component styles to avoid conflicts.
export function capsuleCss(root = '#heartbeat_memories_overlay') {
    const r = root + '.rmt-workspace[data-rmt-theme-mode]';
    const groups = ':is(.rmt-recovery-actions,.rmt-actions,.rmt-mode-actions,.rmt-filter,.rmt-cg-card-actions,.rmt-cg-prompt-actions,.rmt-cg-prompt-secondary,.rmt-manage-actions,.rmt-manage-category-actions,.rmt-mail-actions,.rmt-mail-filters,.rmt-heart-top-actions,.rmt-heart-summary-actions,.rmt-room-heading-actions,.rmt-room-location-actions,.rmt-dialogue-actions,.rmt-loading-actions,.rmt-travel-dialogue-actions,.rmt-ending-confession-actions,.rmt-ending-easter-controls,.rmt-current-archive-actions)';
    return `
${r} .rmt-btn,${r} .rmt-body button.rmt-btn{display:inline-flex;align-items:center!important;justify-content:center!important;gap:6px;box-sizing:border-box!important;min-width:0;max-width:100%;min-height:44px!important;height:auto!important;padding:10px 14px!important;margin:0!important;border-radius:24px!important;font-family:inherit!important;font-size:15px!important;line-height:1.4!important;letter-spacing:normal!important;white-space:normal!important;word-break:normal;overflow-wrap:anywhere;text-align:center;vertical-align:middle;touch-action:manipulation}
${r} .rmt-btn>i,${r} .rmt-btn>svg{flex-shrink:0}
${r} .rmt-btn[hidden]{display:none!important}
${r} ${groups}{display:flex;align-items:stretch;justify-content:flex-start;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%}
${r} ${groups}>.rmt-btn{flex:0 1 auto;width:auto;min-width:0;max-width:100%}
${r} :is(.rmt-recovery-actions,.rmt-cg-prompt-actions)>.rmt-btn{flex:1 1 auto;width:auto!important}
${r} .rmt-recovery-actions{margin-top:12px}
${r} .rmt-cg-prompt-secondary>small{flex-basis:100%}
${r} :is(.rmt-participant-dialog,.rmt-cg-prompt-dialog) .rmt-btn{color:var(--rmt-theme-text);background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border)}
${r} .rmt-participant-dialog footer{justify-content:flex-end;gap:8px}
${r} :is(.rmt-workspace-tabs,.rmt-workspace-groups,.rmt-layout-switch) button{box-sizing:border-box;max-width:100%;min-width:0;line-height:1.4;white-space:normal;word-break:normal;overflow-wrap:anywhere;text-align:center}
${r} :is(.rmt-filter,.rmt-workspace-groups) button{flex:0 1 auto}
${r} .rmt-layout-switch{flex-wrap:wrap;max-width:100%}
${r} .rmt-btn:focus-visible{outline:2px solid var(--rmt-theme-accent-ink);outline-offset:3px}
@media(max-width:600px){
 ${r} .rmt-body .rmt-current-archive-actions{display:flex!important;gap:8px}
 ${r} .rmt-body .rmt-current-archive-actions>.rmt-btn{flex:1 1 144px;width:auto!important}
 ${r} .rmt-body :is(.rmt-travel-dialogue-actions,.rmt-ending-confession-actions,.rmt-ending-easter-controls){display:flex;flex-wrap:wrap;gap:8px}
 ${r} .rmt-body :is(.rmt-travel-dialogue-actions,.rmt-ending-confession-actions,.rmt-ending-easter-controls)>.rmt-btn{flex:1 1 112px}
}
`;
}
