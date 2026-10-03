import * as mvStyles from './mvRefreshStyles.js';

// Presentation only. Existing actions, native form controls and source scopes remain in their owners.
export function workspaceRefreshCss(root = '#heartbeat_memories_overlay') {
    const r = root + '.rmt-workspace[data-rmt-theme-mode]';
    return `
${r}{--rmt-ui-line:color-mix(in srgb,var(--rmt-theme-border) 50%,var(--rmt-theme-surface-solid));--rmt-ui-shadow:0 6px 22px var(--rmt-theme-shadow);padding:24px!important}
${r} .rmt-shell{width:min(1200px,100%)!important;height:90dvh!important;max-height:calc(100dvh - 48px)!important;border:1px solid var(--rmt-ui-line)!important;border-radius:22px!important;outline:0!important;box-shadow:0 24px 80px #0e152b38!important;background:var(--rmt-theme-surface-alpha)!important}
${r} .rmt-shell:before{display:none!important}
${r} .rmt-topbar{min-height:64px!important;gap:6px!important;padding:9px 20px!important;flex-wrap:nowrap!important;flex-shrink:0;background:var(--rmt-theme-surface-solid)!important;border-bottom:1px solid var(--rmt-ui-line)!important;box-shadow:none!important}
${r} .rmt-topbar:before,${r} .rmt-topbar:after,${r} .rmt-topbar-title:after{display:none!important}
${r} .rmt-topbar-title{font-size:17px!important;font-weight:650!important;letter-spacing:.02em!important;flex:1 1 auto!important;max-width:none!important}
${r} .rmt-topbar>button{border:0!important;border-radius:12px!important;box-shadow:none!important;background:transparent!important;width:44px!important;height:44px!important;min-height:44px!important;min-width:44px!important;padding:0!important;flex:0 0 44px!important}
${r} .rmt-topbar>button:hover{background:var(--rmt-theme-soft)!important;transform:none!important}
${r} .rmt-topbar>button[data-rmt-action="toolbar-more"]{display:grid!important;place-items:center!important}
${r} .rmt-live-chip{border-radius:8px!important;box-shadow:none!important}
${r} .rmt-live-chip i{animation:none!important;box-shadow:none!important}
${r} .rmt-topbar .rmt-task-count{top:0!important;right:0!important}
${r} .rmt-workspace-tabs{display:flex!important;justify-content:center;gap:24px;padding:0 24px!important;border-bottom:1px solid var(--rmt-ui-line)!important;background:var(--rmt-theme-surface-solid)!important;flex-shrink:0}
${r} .rmt-workspace-tabs button{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-width:104px;min-height:52px!important;padding:10px 16px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:var(--rmt-theme-muted)!important;font-size:14px!important;font-weight:500!important}
${r} .rmt-workspace-tabs button span{color:inherit!important}
${r} .rmt-workspace-tabs button.active{color:var(--rmt-theme-accent-ink)!important;background:transparent!important;--rmt-content-ink:var(--rmt-theme-accent-ink)}
${r} .rmt-workspace-tabs button.active:after{content:"";position:absolute;bottom:0;left:18px;right:18px;height:3px;border-radius:3px 3px 0 0;background:var(--rmt-theme-accent-ink)}
${r} .rmt-nav-icon{width:20px;height:20px;flex:none;pointer-events:none}
${r} .rmt-workspace-location{min-height:34px!important;padding:3px 24px!important;gap:8px!important;background:var(--rmt-theme-surface-solid)!important;border-bottom:1px solid var(--rmt-ui-line)!important;flex-shrink:0;font-size:12px!important}
${r} .rmt-workspace-location .rmt-crumb-button{min-height:32px!important;padding:3px 0!important;font-size:12px!important;border:0!important;background:transparent!important;color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-workspace-location>span{font-size:12px!important;color:var(--rmt-theme-muted)!important}
${r} .rmt-workspace-location small{border-radius:6px;padding:2px 7px;background:var(--rmt-theme-soft);font-size:11px!important}
${r} .rmt-body{padding:28px 32px!important;min-width:0;background:var(--rmt-theme-bg)!important;scroll-padding-block:16px;overscroll-behavior:contain}
${r} .rmt-body>:is(.rmt-workspace-page,.rmt-home){max-width:1080px!important}
${r} .rmt-btn,${r} .rmt-body button.rmt-btn{border-radius:11px!important;box-shadow:none!important;padding:10px 15px!important;font-size:14px!important;font-weight:500!important;transition:background .15s ease,border-color .15s ease!important}
${r} .rmt-btn:hover{transform:none!important}
${r} .rmt-btn:disabled{opacity:.5!important}
${r} :is(.rmt-workspace-section-head,.rmt-home-heading){margin-bottom:24px!important;padding:0!important}
${r} :is(.rmt-workspace-section-head h2,.rmt-home-heading h1){font-size:26px!important;line-height:1.35!important;margin:0 0 6px!important;letter-spacing:.02em!important}
${r} :is(.rmt-workspace-section-head p,.rmt-home-heading p){font-size:14px!important;line-height:1.6!important;color:var(--rmt-theme-muted)!important;margin:0!important}
${r} .rmt-layout-switch{display:flex!important;gap:2px!important;flex-wrap:nowrap!important;padding:3px;background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-ui-line);border-radius:10px}
${r} .rmt-layout-switch button{min-height:38px!important;min-width:46px;padding:6px 9px!important;border:0!important;border-radius:7px!important;background:transparent!important;box-shadow:none!important;font-size:13px!important}
${r} .rmt-layout-switch button.active{background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-workspace-featured{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:28px 32px;margin:0 0 24px;border:1px solid var(--rmt-ui-line);border-radius:18px;background:var(--rmt-theme-soft);overflow:hidden}
${r} .rmt-workspace-featured>div{min-width:0}
${r} .rmt-workspace-featured small{color:var(--rmt-theme-accent-ink)!important;font-size:12px!important;letter-spacing:.04em!important}
${r} .rmt-workspace-featured h3{font-size:26px!important;margin:6px 0 7px!important;line-height:1.35!important}
${r} .rmt-workspace-featured p{font-size:14px!important;color:var(--rmt-theme-muted)!important;line-height:1.6!important;margin:0 0 16px!important}
${r} .rmt-workspace-featured>.fa-solid{font-size:clamp(42px,5vw,74px);color:var(--rmt-theme-accent-ink);opacity:.25;padding:12px;flex:none}
${r} .rmt-workspace-featured .rmt-btn{gap:16px;background:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-ui-line)!important}
${r} .rmt-workspace-groups{display:flex!important;gap:4px!important;margin:0 0 18px!important;padding:0 0 6px;border-bottom:1px solid var(--rmt-ui-line)}
${r} .rmt-workspace-groups button{border:0!important;border-radius:9px!important;padding:9px 18px!important;min-height:44px!important;background:transparent!important;box-shadow:none!important;font-size:14px!important;color:var(--rmt-theme-muted)!important}
${r} .rmt-workspace-groups button.active{color:var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-soft)!important}
${r} .rmt-workspace-portals{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;margin:0!important;padding:0!important}
${r} .rmt-workspace-card{position:relative;border:1px solid var(--rmt-ui-line)!important;border-radius:15px!important;background:var(--rmt-theme-surface-solid)!important;box-shadow:none!important;overflow:hidden!important;min-width:0;transform:none!important}
${r} .rmt-workspace-card:hover{border-color:var(--rmt-theme-accent)!important;box-shadow:none!important;transform:none!important}
${r} .rmt-workspace-card:before,${r} .rmt-workspace-card:after{display:none!important}
${r} .rmt-workspace-card .rmt-portal-open{display:grid!important;grid-template-columns:38px minmax(0,1fr)!important;grid-template-areas:"icon title" "icon subtitle" "icon status"!important;align-items:start!important;align-content:start;gap:5px 13px!important;min-height:140px!important;padding:23px 20px!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;text-align:left!important;width:100%!important;height:auto!important}
${r} .rmt-workspace-card:has(.rmt-queue-pick) .rmt-portal-open{padding-right:42px!important}
${r} .rmt-workspace-card .rmt-portal-avatar{grid-area:icon!important;position:static!important;width:38px!important;height:38px!important;min-width:38px!important;border-radius:11px!important;margin:0!important;background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-accent-ink)!important;box-shadow:none!important;transform:none!important}
${r} .rmt-workspace-card .rmt-portal-avatar i{font-size:20px!important;color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-workspace-card .rmt-portal-title{grid-area:title!important;font-size:16px!important;font-weight:600!important;line-height:1.5!important;color:var(--rmt-theme-text)!important;text-align:left!important;margin:0!important}
${r} .rmt-workspace-card .rmt-portal-subtitle{grid-area:subtitle!important;font-size:13px!important;line-height:1.6!important;text-align:left!important;color:var(--rmt-theme-muted)!important;margin:0!important;max-width:none!important}
${r} .rmt-workspace-card .rmt-portal-status{grid-area:status!important;font-size:12px!important;line-height:1.6!important;text-align:left!important;color:var(--rmt-theme-muted)!important;padding:0!important;margin:4px 0 0!important;border:0!important;background:transparent!important;white-space:normal!important}
${r} .rmt-workspace-card.ready .rmt-portal-status{color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-workspace-card .rmt-workspace-enter{display:none!important}
${r} .rmt-workspace-card .rmt-queue-pick{position:absolute!important;right:2px!important;top:3px!important;min-height:44px!important;width:36px!important;min-width:36px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
${r} .rmt-route-people{padding:0 18px 10px!important;border-top:1px solid var(--rmt-ui-line);margin:0 12px!important}
${r} .rmt-route-people summary{font-size:12px!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"]{grid-template-columns:1fr!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-open{grid-template-columns:38px minmax(0,1fr)!important;min-height:96px!important;padding:17px 52px 17px 19px!important}
${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-subtitle{display:block!important}
${r} .rmt-catalogue-queue{position:sticky;bottom:-12px;z-index:6;display:flex;justify-content:flex-end;gap:8px;margin:20px 0 0!important;padding:12px;border:1px solid var(--rmt-ui-line);border-radius:13px;background:var(--rmt-theme-surface-solid);box-shadow:var(--rmt-ui-shadow)}
${r} .rmt-catalogue-queue [data-rmt-action="queue-selected"]{margin-right:auto!important}
${r} .rmt-catalogue-queue [data-rmt-action="generate-together"]{background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-catalogue-queue .rmt-together-help p{top:auto!important;bottom:100%;right:0;max-width:calc(100vw - 60px)}
${r} .rmt-home .rmt-settings-content{display:grid!important;grid-template-columns:1fr 1fr!important;align-items:start;gap:14px!important;background:transparent!important;padding:0!important}
${r} .rmt-home .rmt-settings-content>details:not([open]){align-self:stretch}
${r} .rmt-home .rmt-settings-content>:is(details[open],.rmt-workspace-more,.rmt-mirror-reader){grid-column:1/-1}
${r} .rmt-home .rmt-settings-card{margin:0!important;box-shadow:none!important;border:1px solid var(--rmt-ui-line)!important;border-radius:14px!important;background:var(--rmt-theme-surface-solid)!important;min-width:0}
${r} .rmt-home .rmt-settings-card-head{padding:18px 20px!important;min-height:86px!important;gap:14px!important}
${r} .rmt-home .rmt-settings-card-head>span{width:36px!important;height:36px!important;border-radius:11px!important;background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-accent-ink)!important}
${r} .rmt-home .rmt-settings-card-head b{font-size:16px!important}
${r} .rmt-home .rmt-settings-card-head small{font-size:12px!important;line-height:1.6!important;color:var(--rmt-theme-muted)!important}
${r} .rmt-home details[open]>.rmt-settings-card-head{background:var(--rmt-theme-surface-solid)!important;--rmt-content-ink:var(--rmt-theme-text);border-bottom-color:var(--rmt-ui-line)!important}
${r} .rmt-settings-section-body :is(input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=file]),select,textarea){border-radius:9px!important;border:1px solid var(--rmt-ui-line)!important;background:var(--rmt-theme-bg)!important;min-width:0!important;width:100%;font-size:16px!important;box-shadow:none!important}
${r} .rmt-settings-section-body .menu_button{border-radius:10px!important;box-shadow:none!important;padding:10px 13px!important;min-height:44px!important;white-space:normal!important}
${r} .rmt-api-source-card{min-height:112px!important;gap:5px!important;padding:17px!important;box-shadow:none!important;border-radius:12px!important}
${r} .rmt-api-source-card b{font-size:16px!important}
${r} .rmt-api-source-card small{font-size:12px!important}
${r} :is(.rmt-api-source-panel,.rmt-api-status){border-radius:10px!important;box-shadow:none!important;border-color:var(--rmt-ui-line)!important}
${r} .rmt-workspace-more{border:1px solid var(--rmt-ui-line)!important;border-radius:14px!important;padding:0!important;background:var(--rmt-theme-surface-solid)!important}
${r} .rmt-workspace-more>summary{padding:17px 20px!important;font-size:15px!important;min-height:54px;cursor:pointer}
${r} .rmt-workspace-more-body{padding:0 14px 14px!important;display:grid;gap:12px}
${r} .rmt-workspace-page .rmt-memory-gate{margin:20px 0!important;padding:24px!important;border-radius:16px!important;border:1px solid var(--rmt-ui-line)!important;box-shadow:none!important;background:var(--rmt-theme-surface-solid)!important}
${r} .rmt-workspace-page .rmt-memory-gate:before,${r} .rmt-workspace-page .rmt-memory-gate:after{display:none!important}
${r} :is(.rmt-external-memory-row,.rmt-archive-file-import,.rmt-archive-adopt){border-radius:14px!important;border-color:var(--rmt-ui-line)!important;box-shadow:none!important}
${r} .rmt-archive-summary-preview{font-size:16px!important;line-height:1.9!important}
${r} :is(.rmt-archive-quick-update,.rmt-archive-file){gap:10px!important}
${r} .rmt-archive-full-details>summary,${r} .rmt-archive-tools>summary{min-height:44px;align-content:center;color:var(--rmt-theme-accent-ink)!important}
${r} :is(.rmt-character-card,.rmt-archive-group-entry,.rmt-manage-row){border-radius:14px!important;border-color:var(--rmt-ui-line)!important;box-shadow:none!important}
${r} .rmt-task-center{top:64px!important;border-radius:16px!important;border-color:var(--rmt-ui-line)!important;box-shadow:0 14px 48px #10182738!important;padding:18px!important}
${r} .rmt-task-card{border-radius:12px!important;border-color:var(--rmt-ui-line)!important;padding:14px!important;margin-bottom:10px!important}
${r} .rmt-task-center .rmt-btn{min-height:44px!important;border-radius:9px!important;padding:8px 12px!important;font-size:13px!important}
${r} .rmt-cg-prompt-dialog{border-radius:18px!important;border-color:var(--rmt-ui-line)!important;padding:24px!important;box-shadow:0 20px 70px #0004!important}
${r} .rmt-cg-prompt-head{position:sticky;top:-24px;z-index:4;padding:12px 0;background:var(--rmt-theme-surface-solid)!important}
${r} .rmt-cg-prompt-head #rmt-cg-prompt-title{font-size:20px!important}
${r} .rmt-cg-prompt-actions{position:sticky;bottom:-24px;z-index:4;background:var(--rmt-theme-surface-solid);border-top:1px solid var(--rmt-ui-line);padding:14px 0 4px!important}
${r} .rmt-participant-dialog{border-radius:18px!important;border-color:var(--rmt-ui-line)!important}
${r} .rmt-cg-prompt-dialog :is(textarea,input),${r} .rmt-participant-dialog :is(textarea,input:not([type=checkbox])){background:var(--rmt-theme-bg)!important;border-color:var(--rmt-ui-line)!important}
${r} .rmt-body :is(.rmt-album,.rmt-adv,.rmt-room-view,.rmt-travel,.rmt-heart,.rmt-relations-mode){max-width:1080px;margin-inline:auto}
${r} .rmt-album .rmt-card{border-radius:14px!important;border-color:var(--rmt-ui-line)!important;box-shadow:none!important;overflow:hidden}
${r} .rmt-album .rmt-card .rmt-thumb{border-radius:10px!important}
${r} .rmt-album .rmt-card .rmt-cg-caption{padding:15px!important}
${r} .rmt-recovery-status{border-radius:10px!important;box-shadow:none!important}
${r} :is(.rmt-home,.rmt-workspace-catalogue) [hidden],${r} .rmt-shell>[hidden],${r} .rmt-topbar>[hidden]{display:none!important}
@media(max-width:1000px){
 ${r} .rmt-workspace-portals{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
@media(max-width:760px){
 ${r},${r}.rmt-workspace-expanded{padding:0!important;padding-top:max(env(safe-area-inset-top,0px),var(--rmt-mobile-safe-top,0px))!important;height:100vh!important;height:100dvh!important;max-height:100dvh!important;align-items:stretch!important}
 ${r} .rmt-shell,${r}.rmt-workspace-expanded .rmt-shell{width:100%!important;height:100%!important;max-height:100%!important;border-radius:0!important;border:0!important;box-shadow:none!important}
 ${r} .rmt-topbar{order:0;min-height:60px!important;padding:8px 12px!important;gap:2px!important}
 ${r} .rmt-topbar-title{font-size:16px!important;letter-spacing:0!important}
 ${r} .rmt-topbar>button{width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important;flex:0 0 44px!important}
 ${r} .rmt-topbar>button:is([data-rmt-action="workspace-expand"],[data-rmt-action="regenerate"],[data-rmt-action="manage"]){display:none!important}
 ${r} .rmt-workspace-tabs{order:10;gap:0!important;justify-content:space-around;padding:4px 12px calc(5px + env(safe-area-inset-bottom,0px))!important;border-top:1px solid var(--rmt-ui-line)!important;border-bottom:0!important;position:relative;z-index:8}
 ${r} .rmt-workspace-tabs button{flex:1;min-width:0;flex-direction:column;gap:3px;padding:6px 4px!important;min-height:56px!important;font-size:11px!important;line-height:1.25!important}
 ${r} .rmt-workspace-tabs button.active:after{display:none}
 ${r} .rmt-workspace-tabs button.active .rmt-nav-icon{background:var(--rmt-theme-soft);box-shadow:0 0 0 5px var(--rmt-theme-soft);border-radius:5px}
 ${r} .rmt-workspace-tabs .rmt-nav-icon{width:21px;height:21px}
 ${r} .rmt-workspace-location{order:1;padding:2px 16px!important;min-height:30px!important}
 ${r} .rmt-body{order:2;flex:1 1 auto!important;min-height:0!important;padding:22px 17px 24px!important;scrollbar-gutter:auto!important}
 ${r} :is(.rmt-workspace-section-head,.rmt-home-heading){margin-bottom:20px!important}
 ${r} :is(.rmt-workspace-section-head h2,.rmt-home-heading h1){font-size:24px!important}
 ${r} .rmt-workspace-featured{padding:22px!important;margin-bottom:20px;gap:10px;border-radius:15px}
 ${r} .rmt-workspace-featured h3{font-size:23px!important}
 ${r} .rmt-workspace-featured>.fa-solid{font-size:42px;padding:4px}
 ${r} .rmt-workspace-featured .rmt-btn{font-size:13px!important}
 ${r} .rmt-workspace-groups{gap:2px!important}
 ${r} .rmt-workspace-groups button{flex:1;min-width:0;padding:8px!important;font-size:14px!important}
 ${r} .rmt-workspace-portals{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
 ${r} .rmt-workspace-card .rmt-portal-open{grid-template-columns:minmax(0,1fr)!important;grid-template-areas:"icon" "title" "subtitle" "status"!important;min-height:158px!important;padding:16px 14px 13px!important;gap:5px!important}
 ${r} .rmt-workspace-card:has(.rmt-queue-pick) .rmt-portal-open{padding-right:14px!important}
 ${r} .rmt-workspace-card .rmt-portal-avatar{width:30px!important;height:30px!important;min-width:30px!important;margin-bottom:5px!important;border-radius:8px!important}
 ${r} .rmt-workspace-card .rmt-portal-avatar i{font-size:18px!important}
 ${r} .rmt-workspace-card .rmt-portal-title{font-size:14px!important}
 ${r} .rmt-workspace-card .rmt-portal-subtitle{font-size:12px!important}
 ${r} .rmt-workspace-card .rmt-portal-status{font-size:11px!important;line-height:1.5!important}
 ${r} .rmt-workspace-portals[data-rmt-layout="list"] .rmt-portal-open{grid-template-areas:"icon title" "icon subtitle" "icon status"!important;grid-template-columns:34px minmax(0,1fr)!important;gap:4px 12px!important;min-height:108px!important;padding:16px 43px 16px 16px!important}
 ${r} .rmt-route-people{padding:0 2px 8px!important;margin-inline:12px!important}
 ${r} .rmt-route-people summary{font-size:11px!important}
 ${r} .rmt-catalogue-queue{bottom:-12px;padding:10px;gap:6px;margin-top:16px!important;border-radius:11px}
 ${r} .rmt-catalogue-queue .rmt-btn{font-size:12px!important;padding:9px 10px!important}
 ${r} .rmt-catalogue-queue .rmt-together-help summary{width:34px}
 ${r} .rmt-home .rmt-settings-content{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}
 ${r} .rmt-home .rmt-settings-card-head{min-height:80px!important;padding:16px!important}
 ${r} .rmt-home .rmt-settings-card .rmt-settings-section-body{padding:16px!important;gap:16px!important}
 ${r} .rmt-workspace-page .rmt-memory-gate{padding:20px!important}
 ${r} .rmt-task-center{top:60px!important;right:10px!important;width:calc(100% - 20px)!important;max-height:calc(100% - 144px - env(safe-area-inset-bottom,0px))!important;padding:14px!important}
 ${r} .rmt-cg-prompt-backdrop{align-items:flex-end!important;padding:0!important;padding-top:max(16px,env(safe-area-inset-top,0px),var(--rmt-mobile-safe-top,0px))!important}
 ${r} .rmt-cg-prompt-dialog{width:100%!important;max-width:none!important;max-height:94dvh!important;border-radius:20px 20px 0 0!important;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))!important}
 ${r} .rmt-cg-prompt-head{top:-18px;padding:8px 0 12px!important}
 ${r} .rmt-cg-prompt-actions{bottom:calc(-18px - env(safe-area-inset-bottom,0px));padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))!important;flex-direction:row!important}
 ${r} .rmt-cg-prompt-actions .rmt-btn{width:auto!important;flex:1 1 120px!important;font-size:14px!important}
 ${r} .rmt-participant-dialog{width:100%!important;max-height:94dvh!important;border-radius:20px!important}
}
@media(max-width:359px){
 ${r} .rmt-topbar{padding-inline:6px!important;gap:0!important}
 ${r} .rmt-topbar-title{font-size:14px!important}
 ${r} .rmt-body{padding-inline:13px!important}
 ${r} .rmt-workspace-featured{padding:18px!important}
 ${r} .rmt-workspace-featured>.fa-solid{display:none}
 ${r} .rmt-workspace-card .rmt-portal-open{padding-inline:12px!important}
 ${r} .rmt-catalogue-queue{padding:8px}
}
@media(prefers-reduced-motion:reduce){
 ${r} :is(.rmt-btn,.rmt-workspace-card,.rmt-live-chip i){animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
${mvStyles.mvRefreshCss(r)}
`;
}
