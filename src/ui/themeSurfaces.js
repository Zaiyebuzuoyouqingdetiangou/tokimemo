// Structural surfaces share one palette; illustrated scenes retain their own local art colours.
export function structuralThemeCss(root) {
    root += '[data-rmt-theme-mode]';
    const surface = [
        'archive-card','character-card','archive-portal','portal-card','calendar-quick','choice-card','card','info','event-list','event','cg-caption','adv-reader','adv-bulkbar',
        'memory-gate','memory-settings-status','task-banner','external-memory-row','archive-readonly-control','archive-overview-item','archive-group-entry',
        'settings-header','settings-content','settings-card','api-source-card','api-source-panel','api-status','performance-diagnostic-output',
        'avatar-dialog-card','avatar-dialog-bubble','memory-wi-picker-card','memory-wi-book','memory-wi-entry','loading-card',
        'heart-summary','heart-current-line','heart-greeting-group','heart-drama-card','heart-strip-card','heart-single-drama','heart-season-stage','heart-setting','heart-script-bubble','heart-panel','heart-panel-line',
        'ending-summary','ending-route','ending-detail','ending-confession','ending-epilogue','confession-card','ending-confession-stage','ending-confession-bubble','achievement-card',
        'calendar-hero','calendar-paper','calendar-month-head','calendar-day','calendar-pending','calendar-todo','calendar-filter','calendar-sticky-panel','calendar-master-todo','calendar-special-notes','calendar-mood-section','calendar-sticky','calendar-mood-note',
        'manage-hero','manage-row','profile-fact','profile-discovery','profile-worldline-note','relation-detail','relation-detail-head',
        'room-card','room-caption','room-space','room-object-chip','room-object-rail','room-activity-strip','room-stage-head','room-schema-notice',
        'items-toolbar','item-node','item-detail','travel-head','travel-index','travel-dialogue','travel-dialogue-bubble','cg-provider-bar','cabinet-detail','cabinet-piece','theme-preview'
    ];
    const surfaces = surface.map(name => root + ' .rmt-' + name).join(',');
    const art = ':not(.rmt-crt,.rmt-crt *,.rmt-room-scene,.rmt-room-scene *,.rmt-phone-screen,.rmt-phone-screen *,.rmt-travel-artifact,.rmt-travel-artifact *,.rmt-ending-easter-layer,.rmt-ending-easter-layer *,.rmt-calendar-holiday-art,.rmt-calendar-holiday-art *,.rmt-firefly-field,.rmt-firefly-field *)';
    return `
${root}{--gs-ink:var(--rmt-theme-text);--gs-muted:var(--rmt-theme-muted);--gs-paper:var(--rmt-theme-surface-solid);--gs-paper-blue:var(--rmt-theme-soft);--gs-line:var(--rmt-theme-border);color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif!important;font-size:15px!important;font-weight:400!important;line-height:1.6;text-shadow:none!important;filter:none!important;opacity:1!important}
${root} .rmt-shell{--gs-ink:var(--rmt-theme-text);--gs-muted:var(--rmt-theme-muted);--gs-paper:var(--rmt-theme-surface-solid);--gs-paper-blue:var(--rmt-theme-soft);--gs-line:var(--rmt-theme-border)}
${surfaces}{background:var(--rmt-theme-surface-alpha)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important;opacity:1!important;text-shadow:none!important;box-shadow:0 7px 20px var(--rmt-theme-shadow)}
${root} :is(.rmt-album,.rmt-adv,.rmt-room-view,.rmt-travel,.rmt-heart-drama-layout,.rmt-archive-room){background:var(--rmt-theme-bg)!important}
${root} :is(p,b,strong,small,span,label,blockquote,h1,h2,h3,summary,legend,div[class^="rmt-"],div[class*=" rmt-"])${art}{color:var(--rmt-content-ink,var(--rmt-theme-text))!important;-webkit-text-fill-color:currentColor!important;text-shadow:none!important;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif!important;font-weight:400!important;letter-spacing:normal;overflow-wrap:anywhere}
${root} :is(h1,h2,h3,b,strong,.rmt-topbar-title)${art}{font-weight:600!important}
${root} :is(h1,h2,h3)${art}{line-height:1.4!important;margin-block:12px 16px}
${root} :is(h1,h2)${art}{font-size:22px!important}
${root} h3${art}{font-size:18px!important}
${root} :is(.rmt-portal-title,.rmt-calendar-quick-copy>b){font-size:18px!important;font-weight:600!important}
${root} .rmt-archive-card{padding:20px!important}
${root} :is(p,blockquote,.rmt-adv-reader,.rmt-avatar-dialog-bubble,.rmt-heart-script-bubble)${art}{font-size:16px!important;line-height:1.8!important;font-weight:400!important;opacity:1!important}
${root} :is(small,.rmt-api-note,.rmt-avatar-dialog-note,.rmt-settings-field,.rmt-settings-check)${art}{font-size:13px!important;color:var(--rmt-content-ink,var(--rmt-theme-muted))!important;-webkit-text-fill-color:currentColor!important;opacity:1!important}
${root} :is(button,select,input,textarea,.menu_button)${art}{font-family:inherit!important;font-size:14px!important;font-weight:500!important;line-height:1.4!important;min-height:44px;max-width:100%;color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important;background:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-border)!important;opacity:1!important;text-shadow:none!important;writing-mode:horizontal-tb!important}
${root} :is(button,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink)!important;outline-offset:3px}
${root} :is(button.active,button.is-active,[aria-pressed="true"]){background:var(--rmt-theme-wash)!important;--rmt-content-ink:var(--rmt-theme-wash-ink);color:var(--rmt-theme-wash-ink)!important;border-color:var(--rmt-theme-accent)!important;box-shadow:0 0 0 1px var(--rmt-theme-accent)}
${root} :is(.rmt-archive-keywords span,.rmt-calendar-tag){background:var(--rmt-theme-soft)!important;border:1px solid var(--rmt-theme-border)!important;box-shadow:none!important;padding:5px 11px;font-size:13px!important}
${root} :is(.rmt-archive-portal,.rmt-character-card,.rmt-calendar-quick,.rmt-room-card){background:linear-gradient(165deg,var(--rmt-theme-surface-alpha),var(--rmt-theme-surface-tint))!important;box-shadow:0 10px 26px var(--rmt-theme-shadow)}
${root} .rmt-btn{border-width:1px!important;border-radius:999px!important;box-shadow:0 3px 10px #34546b0a;padding:10px 16px!important}
${root} :is(.rmt-portal-avatar,.rmt-calendar-quick-icon),${root} :is(.rmt-portal-avatar,.rmt-calendar-quick-icon)>i{color:#fff!important;-webkit-text-fill-color:currentColor!important}
${root} .rmt-portal-ready-dot{color:var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-surface-solid)!important}
${root} :is(.rmt-relations-mode,.rmt-heart){padding:20px!important;max-width:1100px;margin-inline:auto;min-width:0}
${root} :is(.rmt-relations-head,.rmt-profile-discoveries,.rmt-profile-discovery,.rmt-profile-worldline-note){padding:20px!important}
${root} .rmt-profile-discovery-empty{font-size:13px!important;line-height:1.7!important}
${root} .rmt-heart-line{background:transparent!important;box-shadow:none!important;gap:12px;margin:18px 0}
${root} .rmt-heart-line>div{background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border);border-radius:6px 20px 20px 20px;padding:14px 18px!important;min-width:0}
${root} .rmt-heart-line.user{flex-direction:row-reverse;justify-content:flex-start}
${root} .rmt-heart-line.user>div{background:var(--rmt-theme-soft)!important;border-radius:20px 6px 20px 20px;border-color:var(--rmt-theme-accent-alt)}
${root} .rmt-heart-line p{margin:6px 0!important}
${root} .rmt-auto-rule{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px;padding:12px 0;border-bottom:1px solid var(--rmt-theme-border)}
${root} .rmt-auto-rule>label{display:flex;align-items:center;gap:8px;min-width:0;min-height:44px;cursor:pointer}
${root} .rmt-auto-rule input[type=checkbox]{width:18px;height:18px;min-width:18px;min-height:18px;accent-color:var(--rmt-theme-accent-ink)}
${root} .rmt-auto-rule>small{flex-basis:100%}
${root} .rmt-auto-rule input[type=number]{width:76px;min-height:44px;padding:8px;border:1px solid var(--rmt-theme-border);border-radius:12px}
${root}[data-rmt-theme-mode=gs1] .rmt-topbar{background:linear-gradient(110deg,#fff,#dcefc9)!important;border-bottom-color:#d8b857!important}
${root}[data-rmt-theme-mode=gs2] .rmt-topbar{background:linear-gradient(110deg,#e1f2ff,#e7def9)!important;border-bottom-color:#66a9d3!important}
${root}[data-rmt-theme-mode=gs3] .rmt-topbar{background:linear-gradient(110deg,#ffe0ed,#e3f3e2)!important;border-bottom-color:#d97aa4!important}
${root}[data-rmt-theme-mode=gs4] .rmt-topbar{background:linear-gradient(110deg,#ffe3ae,#dfedff)!important;border-bottom-color:#e8a15c!important}
/* Local paper roles override structural surfaces; no generated CSS or model tokens. */
${root} :is(.rmt-calendar-sticky,.rmt-calendar-paper,.rmt-calendar-mood-note,.rmt-ending-confession){
  --rmt-paper:var(--rmt-paper-note);--rmt-content-ink:var(--rmt-paper-note-ink);
  background:var(--rmt-paper)!important;color:var(--rmt-content-ink)!important;
  -webkit-text-fill-color:currentColor!important;border-color:color-mix(in srgb,var(--rmt-content-ink) 22%,var(--rmt-paper))!important;
  box-shadow:0 9px 18px var(--rmt-theme-shadow),inset 0 1px 0 #ffffff44!important;
}
${root} .rmt-calendar-sticky:nth-child(even){--rmt-paper:var(--rmt-paper-note-blue);--rmt-content-ink:var(--rmt-paper-note-blue-ink)}
${root} :is(.rmt-calendar-sticky.special,.rmt-ending-confession){--rmt-paper:var(--rmt-paper-note-rose);--rmt-content-ink:var(--rmt-paper-note-rose-ink)}
${root} .rmt-calendar-paper{--rmt-paper:var(--rmt-paper-letter);--rmt-content-ink:var(--rmt-paper-letter-ink);box-shadow:0 15px 32px var(--rmt-theme-shadow)!important}
${root} .rmt-calendar-mood-note{--rmt-paper:var(--rmt-paper-journal);--rmt-content-ink:var(--rmt-paper-journal-ink);border-left:3px solid var(--rmt-content-ink)!important;box-shadow:none!important}
${root} .rmt-calendar-sticky{padding:20px 16px 16px!important;border-radius:3px 3px 16px 3px;overflow:visible}
${root} .rmt-calendar-sticky:before{content:"";position:absolute;top:-6px;left:calc(50% - 22px);width:44px;height:13px;background:#ffffff70;transform:rotate(-3deg);border:1px solid #ffffff55;pointer-events:none}
${root} .rmt-calendar-sticky-pin{background:var(--rmt-content-ink)!important;opacity:.4}
${root} .rmt-calendar-sticky footer{color:var(--rmt-content-ink)!important;font-size:13px!important;border-top-color:color-mix(in srgb,var(--rmt-content-ink) 24%,transparent)}
${root} .rmt-calendar-sticky :is(h3,p){margin-block:8px!important}
${root} :is(.rmt-calendar-day,.rmt-calendar-month-head){--rmt-content-ink:var(--rmt-theme-text)}
${root} :is(.rmt-calendar-counts>span,.rmt-calendar-day.marked .rmt-calendar-day-number){background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important}
${root} .rmt-calendar-day.selected{border-color:var(--rmt-theme-accent)!important;box-shadow:0 0 0 2px var(--rmt-theme-accent)!important}
${root} .rmt-calendar-selected-chip{--rmt-content-ink:var(--rmt-paper-note-blue-ink);background:var(--rmt-paper-note-blue)!important;color:var(--rmt-content-ink)!important}
${root} :is(.rmt-calendar-sticky-panel,.rmt-calendar-master-todo,.rmt-calendar-special-notes,.rmt-calendar-mood-section){padding:20px!important}
${root} .rmt-settings-content{background:var(--rmt-theme-bg)!important;box-shadow:none;gap:0}
${root} .rmt-settings-content>.rmt-settings-card{margin-bottom:12px}
${root} details[data-rmt-settings-section]{display:block!important;padding:0!important;overflow:hidden}
${root} details[data-rmt-settings-section]>summary{display:flex;list-style:none;cursor:pointer;padding:16px;min-height:72px;gap:12px;touch-action:manipulation}
${root} details[data-rmt-settings-section]>summary::-webkit-details-marker{display:none}
${root} details[data-rmt-settings-section]>summary>div{flex:1;min-width:0}
${root} details[data-rmt-settings-section]>summary:after{content:"";width:8px;height:8px;flex:0 0 8px;border:solid var(--rmt-theme-accent-ink);border-width:0 2px 2px 0;transform:rotate(45deg);margin:0 6px 4px}
${root} details[data-rmt-settings-section][open]>summary{background:var(--rmt-theme-wash)!important;--rmt-content-ink:var(--rmt-theme-wash-ink);border-bottom:1px solid var(--rmt-theme-border)}
${root} details[data-rmt-settings-section][open]>summary:after{transform:rotate(225deg);margin-bottom:0}
${root} details[data-rmt-settings-section]:not([open])>:not(summary){display:none!important}
${root} .rmt-settings-section-body{display:grid;gap:14px;padding:18px;min-width:0}
${root} .rmt-settings-card-head>span{width:36px;height:36px;flex:0 0 36px;border-radius:12px;background:var(--rmt-theme-wash)!important;color:var(--rmt-theme-wash-ink)!important;font-size:11px!important}
${root} .rmt-settings-card-head b{font-size:16px!important}
${root} .rmt-settings-section-body .rmt-settings-field{margin:0}
${root} .rmt-portal-open{background:transparent!important;box-shadow:none!important}
${root} :is(.rmt-archive-kicker,.rmt-heart-summary-kicker,.rmt-portal-status){color:var(--rmt-theme-accent-ink)!important}
@media(max-width:480px){${root} .rmt-calendar-sticky-grid{grid-template-columns:1fr;gap:16px}${root} .rmt-calendar-sticky-panel{padding:16px!important}}

${root} .rmt-heart-drama-dot{position:relative;width:44px!important;height:44px!important;min-width:44px;min-height:44px;border:0!important;box-shadow:none!important;background:transparent!important;padding:0!important}
${root} .rmt-heart-drama-dot:before{content:"";position:absolute;inset:18px;border-radius:50%;background:var(--rmt-theme-border)}
${root} .rmt-heart-drama-dot.active:before{background:var(--rmt-theme-accent);box-shadow:0 0 0 4px var(--rmt-theme-soft)}
${root} .rmt-heart-narration{font-size:15px!important;font-weight:400!important;font-style:normal;line-height:1.8!important;padding:12px 16px!important;text-align:left;color:var(--rmt-theme-muted)!important}
@media(max-width:700px){${root} :is(.rmt-relations-mode,.rmt-heart){padding:16px!important}${root} :is(.rmt-relations-head,.rmt-profile-discoveries,.rmt-profile-discovery,.rmt-profile-worldline-note){padding:16px!important}}
${root} :is(b,strong,span,label)${art}{font-size:max(13px,1em)}
${root} :is(.rmt-api-status,.rmt-progress,.rmt-archive-meta,.rmt-api-note){font-size:13px!important}
${root} :is(input:not([type="checkbox"]):not([type="color"]):not([type="range"]),textarea,select){font-size:16px!important}
${root} button:disabled{opacity:.55!important;cursor:default}
${root} .rmt-avatar-dialog-close{width:44px;height:44px}
@media(max-width:700px){${root} .rmt-topbar button[data-rmt-action]{font-size:0!important}}
${root} .rmt-theme-custom-panel{grid-template-columns:repeat(2,minmax(0,1fr))}
${root} .rmt-theme-custom-panel label{padding:10px;background:var(--rmt-theme-surface-solid);border-color:var(--rmt-theme-border)}
${root} .rmt-theme-custom-panel input[type="color"]{width:100%;height:44px;min-height:44px;padding:3px;border:1px solid var(--rmt-theme-border)}
${root} .rmt-theme-presets{display:flex;gap:8px;flex-wrap:wrap}
${root} .rmt-task-banner{position:relative}
${root} .rmt-task-banner:before{opacity:.15}
${root} :is(.rmt-settings-card-head small,.rmt-archive-kicker){letter-spacing:.04em}
@media(prefers-reduced-motion:reduce){${root} *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
${root} :is(.rmt-crt,.rmt-crt *,.rmt-room-scene,.rmt-room-scene *,.rmt-phone-screen,.rmt-phone-screen *,.rmt-travel-artifact,.rmt-travel-artifact *,.rmt-ending-easter-layer,.rmt-ending-easter-layer *,.rmt-calendar-holiday-art,.rmt-calendar-holiday-art *,.rmt-firefly-field,.rmt-firefly-field *){-webkit-text-fill-color:currentColor!important}
${root} .rmt-cabinet{padding:20px;max-width:1100px;margin:auto}
${root} .rmt-cabinet>header{padding:20px;border-radius:18px}
${root} .rmt-cabinet-shelves{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:20px;padding:20px 0}
${root} .rmt-cabinet-piece{border:1px solid var(--rmt-theme-border);border-bottom:8px solid var(--rmt-theme-border);border-radius:18px;overflow:hidden}
${root} .rmt-cabinet-piece summary{list-style:none;display:grid;gap:12px;place-items:center;cursor:pointer;padding:24px;min-height:200px}
${root} .rmt-cabinet-object{font-size:52px!important;padding:10px 40px;border-bottom:1px solid var(--rmt-theme-border)}
${root} .rmt-cabinet-detail{padding:16px}
${root} :is(.rmt-easter-oscilloscope,.rmt-easter-constellation,.rmt-easter-lighthouse,.rmt-easter-drawers){position:relative;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%;min-height:180px;overflow:hidden;border-radius:18px}
${root} .rmt-easter-oscilloscope{background:#142632;color:#b5ecd9}
${root} .rmt-easter-oscilloscope>span{display:block;width:100%;font-size:32px;letter-spacing:6px;transform:scaleY(calc(.5 + var(--rmt-easter-intensity,.4)))}
${root} .rmt-easter-constellation{background:radial-gradient(ellipse at 50% 80%,#323c64,#111727);color:#ecddbc;align-items:flex-end;padding:48px 16px 24px}
${root} .rmt-easter-constellation>i{position:absolute;top:12px;left:15%;font-size:35px;letter-spacing:18px;opacity:calc(.4 + var(--rmt-easter-intensity,.4))}
${root} .rmt-easter-star{border-radius:50%!important;width:100px;min-height:72px;z-index:1}
${root} .rmt-easter-lighthouse{background:linear-gradient(#16263b,#3b6072);color:#eff4f5;padding:24px}
${root} .rmt-easter-lighthouse>span{font-size:80px;width:100%;z-index:1}
${root} .rmt-easter-beam{position:absolute;inset:-70%;background:conic-gradient(from 20deg,transparent 0deg,#f9ebbb77 20deg,transparent 40deg);transform:rotate(calc(var(--rmt-easter-intensity,.4)*160deg));transition:transform .4s}
${root} .rmt-easter-lighthouse button{z-index:1}
${root} .rmt-easter-drawers{display:grid;grid-template-columns:1fr;background:#e8ddcf;padding:24px}
${root} .rmt-easter-envelope{min-height:85px!important;background:linear-gradient(25deg,#efe3d1 49%,#fff7eb 50%)!important;color:#4e443b!important;border-radius:2px!important}
${root} .rmt-easter-seal{border-radius:50%!important;justify-self:center;background:#74494f!important;color:#fff!important}
`;
}
