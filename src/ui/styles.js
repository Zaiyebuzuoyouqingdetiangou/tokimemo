import * as bedtime_view from './bedtimeView.js';
import * as ui_workspaceStyles from './workspaceStyles.js';
import * as postcard_design_view from './postcardDesignView.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import * as ui_themeSurfaces from './themeSurfaces.js';
import * as ui_inboxStyles from './inboxStyles.js';
import * as ui_pastLivesView from './pastLivesView.js';
import * as time_stories_view from './timeStoriesView.js';
import * as ui_immersionStyles from './immersionStyles.js';
import * as ui_readingStyles from './readingStyles.js';
import * as css_overlayShellCss from './css/overlayShellCss.js';
import * as css_butterflyAlbumAdvCss from './css/butterflyAlbumAdvCss.js';
import * as css_roomCss from './css/roomCss.js';
import * as css_roomMotifsItemsCss from './css/roomMotifsItemsCss.js';
import * as css_phoneMobileCss from './css/phoneMobileCss.js';
import * as css_calendarCss from './css/calendarCss.js';
import * as css_heartProfileTravelCss from './css/heartProfileTravelCss.js';

export function participantPickerCss() {
    const root = '#' + core_constants.OVERLAY_ID;
    return `
${root} .rmt-participant-backdrop{position:absolute;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.4);box-sizing:border-box}
${root} .rmt-participant-dialog{display:flex;flex-direction:column;gap:14px;width:min(760px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:24px;border-radius:20px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#334155);line-height:1.6;overscroll-behavior:contain;scroll-padding-block:16px}
${root} .rmt-participant-dialog :is(header,footer){display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
${root} .rmt-participant-dialog :is(h2,h3,p){margin:0;overflow-wrap:anywhere}
${root} .rmt-participant-dialog label{display:flex;flex-direction:column;gap:6px;min-width:0}
${root} .rmt-participant-dialog :is(input[type=text],select){box-sizing:border-box;width:100%;min-width:0;min-height:44px;font:inherit;color:inherit;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:8px;padding:8px}
${root} .rmt-participant-dialog :is(button,summary){min-height:44px;white-space:normal;overflow-wrap:anywhere}
${root} .rmt-participant-dialog .rmt-participant-select{flex-direction:row;align-items:center;min-height:44px;gap:10px;cursor:pointer}
${root} .rmt-participant-select input{width:20px;height:20px;flex:0 0 20px}
${root} .rmt-participant-card-types{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
${root} .rmt-participant-card-types button{display:flex;flex-direction:column;gap:8px;padding:18px}
${root} .rmt-participant-card-types span{font-size:14px;font-weight:normal}
${root} .rmt-participant-entries:empty{display:none}
${root} :is(.rmt-participant-entry,.rmt-participant-person){display:flex;flex-direction:column;gap:8px;min-width:0;padding:14px 0;border-bottom:1px solid var(--rmt-theme-border,#cbdce6)}
${root} .rmt-participant-entry details p{white-space:pre-wrap;overflow-wrap:anywhere}
${root} .rmt-participant-dialog small{font-size:13px;color:var(--rmt-theme-muted,#59677a);overflow-wrap:anywhere}
${root} .rmt-participant-dialog :is(button,input,select,summary):focus-visible{outline:3px solid var(--rmt-theme-accent-ink,#5f5770);outline-offset:3px}
${root} .rmt-participant-dialog [role=alert]{font-weight:600}
${root} .rmt-participant-scope-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:6px 16px;margin-block:12px}
${root} :is(.rmt-room-participants,.rmt-room-resident-figures){display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
${root} .rmt-room-resident-figure{position:static;display:flex;flex-direction:column;align-items:center;min-height:44px;max-width:100%;gap:8px}
${root} .rmt-room-resident-figure svg{height:110px;width:90px;max-width:100%}
${root} .rmt-room-participant small{display:block}
${root} .rmt-room-participant-states{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
${root} .rmt-cg-person{display:grid;gap:8px;padding:12px 0;border-bottom:1px solid var(--rmt-theme-border,#cbdce6)}
${root} .rmt-cg-person label{display:grid;gap:4px}
${root} .rmt-cg-person :is(input[type=text],textarea){width:100%;min-width:0;box-sizing:border-box}
${root} .rmt-cg-person label:has(input[type=checkbox]){display:flex;align-items:center;gap:6px}
${root} [data-rmt-cg-cast]{border:0;padding:0;min-width:0}
${root} [data-rmt-cg-cast] legend{font-weight:600}
@media(max-width:480px){${root} .rmt-participant-backdrop{padding:8px}${root} .rmt-participant-dialog{padding:16px;border-radius:14px}${root} .rmt-participant-card-types{grid-template-columns:1fr}}
`;
}

export function homeAndReadingCss() {
    const root = '#' + core_constants.OVERLAY_ID;
    const settings = root + ' #' + core_constants.SETTINGS_ID;
    return `
${root} .rmt-home{max-width:960px;margin:0 auto;padding:12px 0 32px}
${root} .rmt-heart-language{max-width:100%;min-width:0}
${root} .rmt-heart-language>summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
${root} .rmt-heart-language select{max-width:100%;min-width:0;min-height:44px;flex:1 1 160px}
${root} .rmt-heart-language button{min-height:44px;max-width:100%;white-space:normal}
${root} .rmt-home-heading{padding:20px 8px 28px;color:var(--rmt-theme-text,#334155)}
${root} .rmt-home-heading small{letter-spacing:.18em;font-size:12px;color:var(--rmt-theme-accent-ink,#5f5770)}
${root} .rmt-home-heading h1{margin:8px 0 12px;font-size:clamp(26px,5vw,38px);line-height:1.4}
${root} .rmt-home-heading p{font-size:16px;line-height:1.8;margin:0 0 8px}
${root} .rmt-home-heading>span{font-size:14px;color:var(--rmt-theme-muted,#59677a)}
${settings}{--rmt-s-ink:var(--rmt-theme-text,#334155);--rmt-s-muted:var(--rmt-theme-muted,#59677a);--rmt-s-line:var(--rmt-theme-border,#cbdce6);margin:0}
${settings} .rmt-settings-header{display:none!important}
${settings} .rmt-settings-content{display:flex!important;flex-direction:column;border:0;padding:0!important;background:transparent;gap:14px}
${settings} .rmt-settings-archive-actions{order:-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
${settings} .rmt-settings-archive-actions>[data-rmt-performance-diagnostic]{grid-column:1/-1}
${settings} .rmt-performance-diagnostic-panel{grid-column:1/-1}
${settings} .rmt-settings-card{display:block;padding:0;border:1px solid var(--rmt-theme-border,#cbdce6)!important;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;border-radius:16px;overflow:hidden}
${settings} details:not([open])>.rmt-settings-section-body{display:none!important}
${settings} [hidden]{display:none!important}
${settings} .rmt-settings-card-head{min-height:72px;padding:14px 16px;box-sizing:border-box;gap:12px;cursor:pointer;color:var(--rmt-theme-text,#334155)!important}
${settings} .rmt-settings-card-head>span{width:36px;height:36px;border-radius:12px;background:var(--rmt-theme-soft,#f3f0f5);color:var(--rmt-theme-accent-ink,#5f5770);box-shadow:none;font-size:11px}
${settings} .rmt-settings-card-head b{font-size:17px;line-height:1.5}
${settings} .rmt-settings-card-head small{font-size:13px;line-height:1.5;color:var(--rmt-theme-muted,#59677a)!important}
${settings} .rmt-settings-section-body{padding:6px 18px 20px;display:grid;gap:14px;min-width:0}
${settings} .rmt-coverage-map{display:flex;flex-wrap:wrap;gap:8px}
${settings} .rmt-coverage-map button{flex:1 1 180px}
${settings} :is(p,small,.rmt-settings-field,.rmt-settings-field>span,.rmt-settings-check,.rmt-api-status,.rmt-api-source-panel){color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;font-size:14px;line-height:1.7;opacity:1}
${settings} :is(input,select,textarea){font-size:16px!important;max-width:100%!important;box-sizing:border-box}
${settings} :is(select,input:not([type="checkbox"]):not([type="range"]):not([type="color"])){min-height:44px!important}
${settings} textarea{min-height:120px;line-height:1.65}
${settings} .menu_button,${settings} button{min-height:44px!important;border:1px solid var(--rmt-theme-border,#cbdce6)!important;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;font-size:14px;line-height:1.6!important;white-space:normal}
${settings} .rmt-settings-check{min-height:44px;display:flex;align-items:center;gap:12px}
${settings} .rmt-settings-check input{flex:0 0 auto;width:20px;height:20px}
${settings} .rmt-api-source-panel{background:var(--rmt-theme-soft,var(--rmt-theme-surface-solid,#fff));border-color:var(--rmt-theme-border,#cbdce6);padding:14px}
${settings} .rmt-settings-card>button,${settings} .rmt-settings-card>small{margin:14px}
${settings} :is(button,input,select,textarea,summary):focus-visible,${root} .rmt-memory-primary:focus-visible,${root} .rmt-heart-strip-image-full:focus-visible,${root} .rmt-cg-prompt-secondary a:focus-visible{outline:3px solid var(--rmt-theme-accent-ink,#5f5770)!important;outline-offset:3px}
${root} .rmt-btn.rmt-memory-primary{width:100%;min-height:48px;background:var(--rmt-theme-accent-ink,#5f5770)!important;color:var(--rmt-theme-surface-solid,#fff)!important;-webkit-text-fill-color:currentColor!important;font-size:16px;font-weight:750;box-shadow:0 3px 10px #0001}
${root} .rmt-cg-prompt-secondary{display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid var(--rmt-theme-border,#cbdce6);padding-top:16px}
${root} .rmt-cg-prompt-secondary .rmt-btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;box-sizing:border-box;text-decoration:none;font-size:14px;white-space:normal}
${root} .rmt-cg-prompt-secondary small{flex-basis:100%;font-size:13px;line-height:1.6}
${root} .rmt-heart-strip-image-full{display:block;position:relative;aspect-ratio:auto;min-height:0;height:auto;max-height:none;width:100%;background:var(--rmt-theme-surface-solid,#fff)}
${root} .rmt-heart-strip-image-full .rmt-cg-real{position:relative;inset:auto;display:block;width:100%;height:auto;max-height:none;object-fit:contain;transform:none}
${root} .rmt-heart-strip-image-full .rmt-abstract{display:none}
${root} .rmt-ending-section .rmt-ending-prose{white-space:pre-wrap;line-height:1.95;font-size:16px;max-width:70ch;margin:0 auto 1.1em;color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;overflow-wrap:anywhere}
${root} .rmt-ending-section .rmt-ending-prose:last-child{margin-bottom:0}
${root} .rmt-ending-final{color:var(--rmt-theme-accent-ink,#5f5770)!important;-webkit-text-fill-color:currentColor!important;font-size:16px;line-height:1.85;border-left:3px solid var(--rmt-theme-accent-ink,#5f5770);padding:12px 16px;background:var(--rmt-theme-soft,var(--rmt-theme-surface-solid,#fff));border-radius:0 12px 12px 0}
@media(max-width:480px){
 ${root} .rmt-home-heading{padding:12px 4px 20px}
 ${settings} .rmt-settings-archive-actions{grid-template-columns:1fr}
 ${settings} .rmt-settings-section-body{padding:4px 14px 16px}
 ${settings} .rmt-model-row,${settings} .rmt-manual-key-row{grid-template-columns:minmax(0,1fr)}
 ${settings} .rmt-settings-card-head{padding:12px 14px}
 ${root} .rmt-cg-prompt-secondary .rmt-btn{flex:1 1 100%}
}
@media(prefers-reduced-motion:reduce){${root} .rmt-home *,${root} .rmt-heart-strip-image-full{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
}

export function ensureSettingsStyles() {
    if (document.getElementById(core_constants.SETTINGS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = core_constants.SETTINGS_STYLE_ID;
    style.textContent = `
#${core_constants.SETTINGS_ID}{margin-top:10px;--rmt-s-ink:#53647a;--rmt-s-muted:#7c8998;--rmt-s-blue:#8ebfd5;--rmt-s-pink:#e99ab9;--rmt-s-line:#cddfe8}
#${core_constants.SETTINGS_ID} .rmt-settings-header{min-height:42px;border-radius:12px 12px 0 0;background:linear-gradient(90deg,rgba(233,154,185,.12),rgba(142,191,213,.10));border:1px solid var(--rmt-s-line);padding:8px 11px;color:var(--rmt-s-ink)}
#${core_constants.SETTINGS_ID} .rmt-settings-header small{font-size:8px;letter-spacing:.14em;color:#98a7b4;margin-left:6px}
#${core_constants.SETTINGS_ID} .rmt-settings-content{padding:11px!important;border:1px solid var(--rmt-s-line);border-top:0;border-radius:0 0 14px 14px;background:linear-gradient(180deg,rgba(248,252,254,.72),rgba(255,252,249,.70));display:grid;gap:10px}
#${core_constants.SETTINGS_ID} .rmt-settings-card{padding:11px;border:1px solid var(--rmt-s-line);border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(249,252,253,.94));display:grid;gap:8px;box-shadow:0 4px 12px rgba(70,95,112,.05)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head{display:flex;gap:8px;align-items:center;color:var(--rmt-s-ink)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head>span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;font-size:9px;font-weight:900;background:linear-gradient(145deg,#f8c7da,#cde7f2);color:#667789;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head b{display:block;font-size:12px}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head small{display:block;font-size:9px;color:#98a4af;margin-top:2px;line-height:1.35}
#${core_constants.SETTINGS_ID} .menu_button{writing-mode:horizontal-tb!important;text-orientation:mixed!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:34px!important;max-height:none!important;white-space:normal!important;line-height:1.25!important;padding:8px 11px!important;border-radius:10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;overflow:visible!important;word-break:keep-all!important;flex:none}
#${core_constants.SETTINGS_ID} .rmt-settings-wide{width:100%!important}
#${core_constants.SETTINGS_ID} .rmt-api-box .text_pole{width:100%!important;max-width:none!important;box-sizing:border-box!important;min-height:34px;writing-mode:horizontal-tb!important}
#${core_constants.SETTINGS_ID} .rmt-settings-field{display:grid;gap:4px;min-width:0;font-size:10px;color:#7b8997}
#${core_constants.SETTINGS_ID} .rmt-settings-field>span{font-weight:750;color:#6c7c8e}
#${core_constants.SETTINGS_ID} .rmt-api-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#${core_constants.SETTINGS_ID} .rmt-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:end}
#${core_constants.SETTINGS_ID} .rmt-model-refresh{min-width:84px!important;white-space:nowrap!important}
#${core_constants.SETTINGS_ID} .rmt-api-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#${core_constants.SETTINGS_ID} .rmt-api-source-card{position:relative;width:100%!important;min-height:92px!important;padding:12px 9px 10px!important;display:flex!important;flex-direction:column!important;gap:4px!important;border:1px solid #cedfe8!important;background:linear-gradient(155deg,#fff,#f7fbfd)!important;color:#627489!important;box-shadow:0 4px 10px rgba(74,101,120,.06)!important}
#${core_constants.SETTINGS_ID} .rmt-api-source-card:nth-child(1){background:linear-gradient(155deg,#fff8fb,#f7fbfd)!important}
#${core_constants.SETTINGS_ID} .rmt-api-source-card:nth-child(2){background:linear-gradient(155deg,#f7fcff,#fffafd)!important}
#${core_constants.SETTINGS_ID} .rmt-api-source-card.is-active{border-color:#e59ab8!important;box-shadow:0 0 0 2px rgba(233,154,185,.17),0 6px 14px rgba(74,101,120,.09)!important}
#${core_constants.SETTINGS_ID} .rmt-api-source-card b{font-size:13px;color:#53667d}
#${core_constants.SETTINGS_ID} .rmt-api-source-card small{font-size:9px;color:#8996a4;line-height:1.35}
#${core_constants.SETTINGS_ID} .rmt-api-source-badge{align-self:center;padding:2px 7px;border-radius:999px;background:rgba(142,191,213,.14);color:#6e91a4;font-size:8px;font-weight:850;letter-spacing:.04em}
#${core_constants.SETTINGS_ID} .rmt-api-source-card:first-child .rmt-api-source-badge{background:rgba(233,154,185,.14);color:#a56f86}
#${core_constants.SETTINGS_ID} .rmt-api-status{padding:6px 9px;border:1px solid #d8e4ea;border-radius:999px;background:#f7fafc;color:#8a96a2;font-size:9px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${core_constants.SETTINGS_ID} .rmt-api-status.is-ready{border-color:#bdded6;background:#f5fbf9;color:#5f8e83}
#${core_constants.SETTINGS_ID} .rmt-api-source-panel{display:grid;gap:8px;padding:9px;border:1px dashed #d5e3e9;border-radius:11px;background:rgba(248,252,254,.68)}
#${core_constants.SETTINGS_ID} .rmt-api-source-panel[hidden]{display:none!important}
#${core_constants.SETTINGS_ID} [data-rmt-memory-file-preview-binding]{color:#738394;word-break:break-all}
#${core_constants.SETTINGS_ID} [data-rmt-memory-file-preview-sample]{max-height:120px;overflow:auto;padding:7px 8px;border-radius:8px;background:rgba(38,49,63,.055);color:#627386;font-size:9px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
#${core_constants.SETTINGS_ID} .rmt-manual-key-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
#${core_constants.SETTINGS_ID} .rmt-manual-key-row .menu_button{min-width:82px!important;white-space:nowrap!important}
#${core_constants.SETTINGS_ID} .rmt-manual-save{background:linear-gradient(90deg,#fff6fa,#f3faff)!important;border-color:#d5dfe8!important;font-weight:850!important}
#${core_constants.SETTINGS_ID} .rmt-settings-check{font-size:10px!important;line-height:1.45;color:#6f7d8c}
#${core_constants.SETTINGS_ID} .rmt-theme-custom-panel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
#${core_constants.SETTINGS_ID} .rmt-theme-custom-panel[hidden]{display:none!important}
#${core_constants.SETTINGS_ID} .rmt-theme-custom-panel label{display:grid;gap:4px;justify-items:center;padding:7px 4px;border:1px solid #dbe5ea;border-radius:10px;background:#fbfdfe;color:#778696;font-size:9px}
#${core_constants.SETTINGS_ID} .rmt-theme-custom-panel input[type="color"]{width:38px;height:30px;padding:0;border:0;background:transparent}
#${core_constants.SETTINGS_ID} [data-rmt-theme-alpha]{width:100%}
#${core_constants.SETTINGS_ID} .rmt-api-note{font-size:9px;line-height:1.55;opacity:.72;color:#758493}
#${core_constants.SETTINGS_ID} input.text_pole,#${core_constants.SETTINGS_ID} select.text_pole,#${core_constants.SETTINGS_ID} textarea.text_pole{background:#fff!important;color:var(--rmt-s-ink)!important;-webkit-text-fill-color:var(--rmt-s-ink)!important;border-color:var(--rmt-s-line)!important;opacity:1!important;writing-mode:horizontal-tb!important;text-orientation:mixed!important}
#${core_constants.SETTINGS_ID} .menu_button:not(.rmt-api-source-card){background:#f9fcfe!important;color:var(--rmt-s-ink)!important;border-color:var(--rmt-s-line)!important;opacity:1!important;writing-mode:horizontal-tb!important;text-orientation:mixed!important}
#${core_constants.SETTINGS_ID} .rmt-open-archive-room{width:100%!important;min-height:48px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;background:linear-gradient(90deg,#fff6fa,#f2faff)!important;border:1px solid #d4e2e9!important;color:#566a80!important;font-weight:850!important}
#${core_constants.SETTINGS_ID} .rmt-settings-archive-actions{display:grid;gap:8px;margin-top:10px}
#${core_constants.SETTINGS_ID} .rmt-performance-diagnostic-panel{display:grid;gap:6px;min-width:0;max-width:100%}
#${core_constants.SETTINGS_ID} .rmt-performance-diagnostic-panel[hidden]{display:none!important}
#${core_constants.SETTINGS_ID} .rmt-performance-diagnostic-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;color:var(--rmt-s-ink);font-size:10px;writing-mode:horizontal-tb}
#${core_constants.SETTINGS_ID} .rmt-performance-diagnostic-close{min-width:88px!important;min-height:40px!important;white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important;touch-action:manipulation}
#${core_constants.SETTINGS_ID} .rmt-performance-diagnostic-output{margin:0;padding:9px;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:9px;line-height:1.5;border-radius:9px;background:rgba(38,49,63,.07);color:#5f6f80}
#${core_constants.MENU_ID}{cursor:pointer}
.rmt-manual-model-picker{display:block;width:100%!important;max-width:100%!important;min-width:0!important;margin-top:6px;overflow:hidden;text-overflow:ellipsis}.rmt-manual-model-picker[hidden]{display:none!important}
@media(max-width:760px){
  #${core_constants.SETTINGS_ID} .rmt-api-grid{grid-template-columns:1fr 1fr}
  #${core_constants.SETTINGS_ID} .rmt-model-row{grid-template-columns:1fr}
  #${core_constants.SETTINGS_ID} .rmt-model-refresh{width:100%!important}
  #${core_constants.SETTINGS_ID} .rmt-manual-key-row{grid-template-columns:1fr}
  #${core_constants.SETTINGS_ID} .rmt-manual-key-row .menu_button{width:100%!important}
  #${core_constants.SETTINGS_ID} .rmt-theme-custom-panel{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;
    style.textContent += ui_themeSurfaces.structuralThemeCss('#' + core_constants.SETTINGS_ID);
    style.textContent += `
#${core_constants.SETTINGS_ID}_launcher{padding:16px;border:1px solid var(--SmartThemeBorderColor,#cbdce6);border-radius:14px;color:var(--SmartThemeBodyColor,#334155);background:var(--SmartThemeBlurTintColor,#fff);line-height:1.6}
#${core_constants.SETTINGS_ID}_launcher b{font-size:16px}
#${core_constants.SETTINGS_ID}_launcher p{font-size:14px;margin:8px 0 12px}
#${core_constants.SETTINGS_ID}_launcher button{min-height:44px!important;width:100%;padding:10px!important;white-space:normal!important}
#${core_constants.SETTINGS_ID}_launcher button:focus-visible{outline:3px solid currentColor;outline-offset:3px}
`;
    style.textContent += ui_workspaceStyles.capsuleCss('#' + core_constants.OVERLAY_ID);
    style.textContent += `
#${core_constants.OVERLAY_ID} .rmt-generation-completion{margin:12px 0 20px;padding:16px;border:1px solid var(--rmt-theme-border);border-left:4px solid var(--rmt-theme-accent-ink);border-radius:14px;background:var(--rmt-theme-soft);color:var(--rmt-theme-text)}
#${core_constants.OVERLAY_ID} .rmt-generation-completion h3{margin:0 0 8px;font-size:17px}
#${core_constants.OVERLAY_ID} .rmt-generation-completion p{margin:0 0 12px;font-size:14px;line-height:1.7;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-generation-completion .rmt-btn{min-height:44px;white-space:normal}
@media(max-width:760px){
 #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar{flex-wrap:wrap!important}
 #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar-title{max-width:none!important}
 #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-live-tasks:not([hidden]){display:flex!important;order:20;flex:1 0 100%;max-width:100%;margin:2px 0 0;padding:0;overflow-x:auto}
 #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar .rmt-live-chip{min-width:0!important;min-height:44px!important;max-width:220px!important;flex:0 0 auto!important}
}
`;
    style.textContent += bedtime_view.bedtimeCss();
    style.textContent += `
#${core_constants.OVERLAY_ID} .rmt-expanded-cg{margin:16px 0;max-width:100%}
#${core_constants.OVERLAY_ID} .rmt-expanded-cg .rmt-thumb{box-sizing:border-box;width:100%;max-width:100%;min-width:0;height:auto;min-height:120px;max-height:540px;aspect-ratio:16/9;border-radius:16px;overflow:hidden}
#${core_constants.OVERLAY_ID} .rmt-expanded-cg img{width:100%;height:100%;object-fit:contain}
#${core_constants.OVERLAY_ID} .rmt-language-scene{padding:16px;margin:12px 0;border:1px solid var(--rmt-theme-border);border-radius:14px}
#${core_constants.OVERLAY_ID} .rmt-language-scene label{display:grid;gap:8px;margin:12px 0}
#${core_constants.OVERLAY_ID} .rmt-language-scene textarea{width:100%;min-height:96px;font-size:16px}
#${core_constants.OVERLAY_ID} .rmt-language-scene p{font-size:14px;line-height:1.6}
`;
    style.textContent += `
#${core_constants.OVERLAY_ID} .rmt-relation-garden-scroll{max-width:100%;overflow:auto;border-radius:20px;-webkit-overflow-scrolling:touch}
#${core_constants.OVERLAY_ID} .rmt-relation-garden-group{aspect-ratio:auto;flex:none}
#${core_constants.OVERLAY_ID} .rmt-relation-garden-group .rmt-relation-node{width:108px;min-height:90px;padding:6px 5px}
#${core_constants.OVERLAY_ID} .rmt-relation-garden-group .rmt-relation-node-avatar{width:28px;height:28px}
#${core_constants.OVERLAY_ID} .rmt-relation-garden-group .rmt-relation-node b{max-width:94px;font-size:12px}
#${core_constants.OVERLAY_ID} .rmt-relation-garden-group .rmt-relation-node small{max-width:94px;font-size:11px}
`;
    document.head.appendChild(style);
}

export function ensureStyles() {
    ensureSettingsStyles();
    if (document.getElementById(core_constants.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = core_constants.STYLE_ID;
    // 主窗口 CSS 按层叠顺序分放在 ui/css/*.js，这里只负责按原顺序拼接，不要调换。
    style.textContent = css_overlayShellCss.overlayShellCss()
        + css_butterflyAlbumAdvCss.butterflyAlbumAdvCss()
        + css_roomCss.roomCss()
        + css_roomMotifsItemsCss.roomMotifsItemsCss()
        + css_phoneMobileCss.phoneMobileCss()
        + css_calendarCss.calendarCss()
        + css_heartProfileTravelCss.heartProfileTravelCss();
    style.textContent += ui_inboxStyles.inboxCss('#' + core_constants.OVERLAY_ID);
    style.textContent += ui_pastLivesView.PAST_LIVES_CSS;
    style.textContent += time_stories_view.timeStoriesCss();
    style.textContent += ui_themeSurfaces.structuralThemeCss('#' + core_constants.OVERLAY_ID) + ui_themeSurfaces.structuralThemeCss('.rmt-avatar-dialog-pop[data-rmt-theme-mode]');
    // CG controls are structural UI, not part of the generated artwork. Keep the
    // editor opaque and locally scoped so host themes cannot wash out its text.
    style.textContent += `
#${core_constants.OVERLAY_ID} .rmt-task-center,#${core_constants.OVERLAY_ID} .rmt-loading-card,#${core_constants.OVERLAY_ID} .rmt-workspace-empty,#${core_constants.OVERLAY_ID} .rmt-cg-format{background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-live-tasks{background:transparent!important;color:var(--rmt-theme-text)!important;border:0!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-topbar .rmt-live-chip{width:auto!important;height:auto!important;min-height:28px!important;padding:3px 10px!important;font-size:12px!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-live-chip{background:var(--rmt-theme-surface-solid)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-live-chip em{color:var(--rmt-theme-accent-ink)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-live-fail em{color:#c24545!important;-webkit-text-fill-color:#c24545!important}
#${core_constants.OVERLAY_ID} .rmt-task-card{background:var(--rmt-theme-bg)!important;border-color:var(--rmt-theme-border)!important;color:var(--rmt-theme-text)!important}
#${core_constants.OVERLAY_ID} .rmt-inline-status{background:color-mix(in srgb,var(--rmt-theme-bg) 92%,transparent)!important;color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-loading{color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important;background:transparent!important}
#${core_constants.OVERLAY_ID} :is(.rmt-task-note,.rmt-task-empty,.rmt-task-row p,.rmt-task-card p,.rmt-task-center h3,.rmt-queue-bar small,.rmt-cg-format small){color:var(--rmt-theme-muted)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} :is(.rmt-task-head b,.rmt-task-main b,.rmt-task-row header b,.rmt-queue-pick){color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-task-row,.rmt-task-card{border-color:var(--rmt-theme-border)!important}
#${core_constants.OVERLAY_ID} .rmt-task-state,.rmt-task-row header span{color:var(--rmt-theme-accent-ink)!important;-webkit-text-fill-color:currentColor!important;background:var(--rmt-theme-soft)!important}
#${core_constants.OVERLAY_ID} .rmt-task-state[data-state="failed"],#${core_constants.OVERLAY_ID} .rmt-task-state[data-state="retry"]{color:#c24545!important;-webkit-text-fill-color:#c24545!important;background:#fde8ea!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"]:not(.rmt-live-chip){width:36px;height:36px;padding:0!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"]:not(.rmt-live-chip) i{font-size:15px!important;line-height:1!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"] .rmt-task-count{font-size:10px!important;color:var(--rmt-theme-wash-ink,#fff)!important;-webkit-text-fill-color:currentColor!important;background:var(--rmt-theme-accent)!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"].rmt-task-alert{color:#e15b70!important;-webkit-text-fill-color:#e15b70!important;border-color:#e15b70!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"].rmt-task-alert i{color:#e15b70!important;-webkit-text-fill-color:#e15b70!important}
#${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"] .rmt-task-count.rmt-task-count-alert{background:#d64545!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
#${core_constants.OVERLAY_ID} .rmt-toolbar-icon{display:block;width:20px;height:20px;pointer-events:none;flex:0 0 auto}
#${core_constants.OVERLAY_ID} .rmt-topbar>button:focus-visible{outline:3px solid var(--rmt-theme-accent-ink,#607c8d)!important;outline-offset:2px}
#${core_constants.OVERLAY_ID} .rmt-topbar>button[data-rmt-action="toolbar-more"]{display:none}
#${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu{position:absolute;z-index:20;right:56px;top:calc(100% - 3px);display:grid;gap:5px;min-width:168px;padding:7px;border:1px solid var(--rmt-theme-border,#dce7ec);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff);box-shadow:0 12px 28px rgba(36,50,70,.2)}
#${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu[hidden]{display:none!important}
#${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu button{display:flex;align-items:center;gap:9px;min-height:44px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--rmt-theme-text,#526a80);font:inherit;font-size:14px;font-weight:700;text-align:left;cursor:pointer}
#${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu button:hover,#${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu button:focus-visible{background:var(--rmt-theme-soft,#f3f8fa);outline:2px solid var(--rmt-theme-accent-ink,#607c8d);outline-offset:1px}
@media(max-width:760px){
  #${core_constants.OVERLAY_ID} .rmt-topbar{gap:4px;padding-right:6px}
  #${core_constants.OVERLAY_ID} .rmt-topbar:before{font-size:16px;margin-right:0}
  #${core_constants.OVERLAY_ID} .rmt-topbar-title{flex:1 1 0;min-width:0;font-size:13px}
  #${core_constants.OVERLAY_ID} .rmt-live-tasks{display:none!important}
  #${core_constants.OVERLAY_ID} .rmt-topbar>button:is([data-rmt-action="back"],[data-rmt-action="library-home"],[data-rmt-action="tasks"],[data-rmt-action="toolbar-more"],[data-rmt-action="close"]){display:grid!important;place-items:center;width:44px!important;height:44px!important;min-width:44px!important;padding:0!important;flex:0 0 44px}
  #${core_constants.OVERLAY_ID} .rmt-topbar>button:is([data-rmt-action="workspace-expand"],[data-rmt-action="regenerate"],[data-rmt-action="manage"]){display:none!important}
  #${core_constants.OVERLAY_ID} .rmt-topbar>button[hidden]{display:none!important}
  #${core_constants.OVERLAY_ID} .rmt-topbar button[data-rmt-action="tasks"] .rmt-toolbar-icon{width:20px!important;height:20px!important}
  #${core_constants.OVERLAY_ID} .rmt-toolbar-more-menu{right:52px;top:calc(100% - 2px);min-width:172px}
}
#${core_constants.OVERLAY_ID} .rmt-character-portals{grid-template-columns:repeat(auto-fit,minmax(220px,320px))!important;justify-content:center!important}
#${core_constants.OVERLAY_ID} .rmt-character-portal-open{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;text-align:center!important;gap:2px!important;grid-template-columns:none!important;grid-template-areas:none!important;width:100%!important;min-height:0!important;padding:8px 8px 4px!important}
#${core_constants.OVERLAY_ID} .rmt-character-portal-open>.rmt-portal-avatar{position:relative!important;inset:auto!important;transform:none!important;grid-area:auto!important;grid-column:auto!important;display:grid!important;place-items:center!important;width:88px!important;height:88px!important;margin:4px auto 12px!important;overflow:visible!important;flex:0 0 auto!important;z-index:0}
#${core_constants.OVERLAY_ID} .rmt-character-portal-open>.rmt-portal-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important;display:block}
#${core_constants.OVERLAY_ID} .rmt-character-portal-open>.rmt-avatar-talk-mark,#${core_constants.OVERLAY_ID} .rmt-character-portal-open .rmt-avatar-talk-mark{position:absolute!important;right:-3px!important;bottom:-2px!important}
#${core_constants.OVERLAY_ID} .rmt-character-portal-open>:is(.rmt-portal-title,.rmt-portal-subtitle,.rmt-portal-status){position:static!important;inset:auto!important;transform:none!important;display:block!important;width:100%!important;grid-area:auto!important;grid-column:auto!important;margin-left:0!important;margin-right:0!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} :is(.rmt-adv,.rmt-event-list,.rmt-event,.rmt-event-detail){color:var(--rmt-theme-text)!important;-webkit-text-fill-color:currentColor!important}
#${core_constants.OVERLAY_ID} .rmt-adv{background:var(--rmt-theme-bg)!important}
#${core_constants.OVERLAY_ID} :is(.rmt-event-list,.rmt-event){background:var(--rmt-theme-surface-alpha)!important;border-color:var(--rmt-theme-border)!important}
#${core_constants.OVERLAY_ID} .rmt-event:hover,#${core_constants.OVERLAY_ID} .rmt-event.active{background:var(--rmt-theme-soft)!important;color:var(--rmt-theme-text)!important;border-color:var(--rmt-theme-border)!important}
#${core_constants.OVERLAY_ID} .rmt-recovery-status{margin:12px 0;padding:16px;border:1px solid var(--rmt-theme-border,#cbdce6);border-left:4px solid var(--rmt-theme-accent-ink,#5f5770);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#334155);font-size:14px;line-height:1.65;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-recovery-status p{margin:8px 0;white-space:pre-wrap}
#${core_constants.OVERLAY_ID} .rmt-recovery-status .rmt-btn{min-height:44px;font-size:14px;max-width:100%;white-space:normal}
#${core_constants.OVERLAY_ID} .rmt-cg-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;min-width:0}
#${core_constants.OVERLAY_ID} .rmt-cg-card-actions .rmt-btn{position:static;flex:1 1 120px;min-width:0;min-height:44px;white-space:normal;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;padding: max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;background:rgba(15,23,42,.58);overflow:auto;overscroll-behavior:contain}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog{display:flex;flex-direction:column;gap:12px;width:min(720px,100%);min-width:0;max-width:100%;max-height:100%;overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:24px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:20px;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;-webkit-text-fill-color:currentColor!important;box-shadow:0 20px 60px rgba(15,23,42,.3);font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.6;opacity:1!important;text-align:left;writing-mode:horizontal-tb!important}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog>*{flex-shrink:0;min-width:0;max-width:100%;box-sizing:border-box}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
#${core_constants.OVERLAY_ID} #rmt-cg-prompt-title{margin:0!important;font-size:22px!important;line-height:1.4!important;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-head .rmt-btn{flex:0 0 auto;min-width:64px;min-height:44px}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-scene{margin:0;padding:0;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:12px;background:var(--rmt-theme-soft,var(--rmt-theme-surface-solid,#fff))}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-scene summary{min-height:44px;padding:10px 12px;box-sizing:border-box;cursor:pointer;line-height:1.5}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-scene p{padding:0 12px 12px}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog label{display:block;margin:0;font-size:16px;line-height:1.5}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog :is([data-rmt-cg-tag-input],[data-rmt-cg-scene-tags],[data-rmt-cg-flat-prompt],[data-rmt-cg-send-preview]){display:block;box-sizing:border-box;width:100%;min-height:72px;margin:8px 0;padding:10px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:10px;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;font-size:16px!important;line-height:1.6;resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} #rmt-cg-prompt-input{display:block;box-sizing:border-box;width:100%;min-height:180px;height:220px;max-height:50vh;padding:12px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff)!important;color:var(--rmt-theme-text,#334155)!important;font-size:16px!important;line-height:1.6!important;resize:vertical;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} #rmt-cg-prompt-count{font-size:14px!important;line-height:1.5;text-align:right;font-variant-numeric:tabular-nums}
#${core_constants.OVERLAY_ID} #rmt-cg-prompt-help{font-size:14px!important;line-height:1.7!important;color:var(--rmt-theme-text,#334155)!important}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog [data-rmt-cg-prompt-status]:empty{display:none}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog [data-rmt-cg-prompt-status]:not(:empty){padding:12px;border:1px solid var(--rmt-theme-border,#cbdce6);border-left:3px solid var(--rmt-theme-accent-ink,var(--rmt-theme-text,#334155));border-radius:8px;background:var(--rmt-theme-soft,var(--rmt-theme-surface-solid,#fff));overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-actions{display:flex;flex-wrap:wrap;gap:10px;padding-top:4px}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-actions .rmt-btn{flex:1 1 180px;min-width:0;min-height:44px;white-space:normal;overflow-wrap:anywhere}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog .rmt-btn:disabled,#${core_constants.OVERLAY_ID} #rmt-cg-prompt-input:disabled{cursor:wait;border-style:dashed!important}
#${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog :is(button,summary):focus-visible,#${core_constants.OVERLAY_ID} #rmt-cg-prompt-input:focus-visible,#${core_constants.OVERLAY_ID} .rmt-cg-card-actions .rmt-btn:focus-visible{outline:3px solid var(--rmt-theme-accent-ink,var(--rmt-theme-text,#334155))!important;outline-offset:3px}
@media(max-width:480px){
  #${core_constants.OVERLAY_ID} .rmt-cg-prompt-dialog{padding:16px;gap:10px;border-radius:16px}
  #${core_constants.OVERLAY_ID} .rmt-cg-prompt-actions{flex-direction:column}
  #${core_constants.OVERLAY_ID} .rmt-cg-prompt-actions .rmt-btn{flex:auto;width:100%}
}
@media(prefers-reduced-motion:reduce){
  #${core_constants.OVERLAY_ID} .rmt-cg-prompt-backdrop,#${core_constants.OVERLAY_ID} .rmt-cg-prompt-backdrop *,#${core_constants.OVERLAY_ID} .rmt-cg-card-actions .rmt-btn{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
`;
    style.textContent += homeAndReadingCss();
    style.textContent += participantPickerCss();
    style.textContent += ui_immersionStyles.immersionCss('#' + core_constants.OVERLAY_ID);
    style.textContent += ui_readingStyles.readingCss('#' + core_constants.OVERLAY_ID);
    style.textContent += ui_workspaceStyles.workspaceCss('#' + core_constants.OVERLAY_ID);
    style.textContent += postcard_design_view.postcardDesignCss('#' + core_constants.OVERLAY_ID);
    style.textContent += ui_workspaceStyles.capsuleCss('#' + core_constants.OVERLAY_ID);
    // workspaceCss is appended above and makes every direct topbar button visible.
    // Keep the narrow toolbar rule last, with matching root specificity.
    style.textContent += `
@media(max-width:760px){
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar>button:is([data-rmt-action="workspace-expand"],[data-rmt-action="regenerate"],[data-rmt-action="manage"]){display:none!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar>button:is([data-rmt-action="back"],[data-rmt-action="library-home"],[data-rmt-action="home"],[data-rmt-action="tasks"],[data-rmt-action="toolbar-more"],[data-rmt-action="close"]){display:grid!important;place-items:center!important;width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;flex:0 0 44px!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar button:before,#${core_constants.OVERLAY_ID}.rmt-workspace .rmt-topbar button:after{content:none!important;display:none!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-toolbar-more-menu[hidden]{display:none!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-toolbar-more-menu>button{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:44px!important;padding:10px 14px!important;font-size:14px!important;white-space:nowrap!important;border-radius:8px!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-toolbar-more-menu>button[hidden]{display:none!important}
  #${core_constants.OVERLAY_ID}.rmt-workspace .rmt-toolbar-more-menu>button span{font-size:14px!important;white-space:nowrap!important}
}
`;
    style.textContent += bedtime_view.bedtimeCss();
    style.textContent += `
#${core_constants.OVERLAY_ID} .rmt-expanded-cg{margin:16px 0;max-width:100%}
#${core_constants.OVERLAY_ID} .rmt-expanded-cg .rmt-thumb{box-sizing:border-box;width:100%;max-width:100%;min-width:0;height:auto;min-height:120px;max-height:540px;aspect-ratio:16/9;border-radius:16px;overflow:hidden}
#${core_constants.OVERLAY_ID} .rmt-expanded-cg img{width:100%;height:100%;object-fit:contain}
#${core_constants.OVERLAY_ID} .rmt-language-scene{padding:16px;margin:12px 0;border:1px solid var(--rmt-theme-border);border-radius:14px}
#${core_constants.OVERLAY_ID} .rmt-language-scene label{display:grid;gap:8px;margin:12px 0}
#${core_constants.OVERLAY_ID} .rmt-language-scene textarea{width:100%;min-height:96px;font-size:16px}
#${core_constants.OVERLAY_ID} .rmt-language-scene p{font-size:14px;line-height:1.6}
`;
    document.head.appendChild(style);
}

export function abstractStyle(seed, id) {
    const key = `${id}|${Array.isArray(seed) ? seed.join('|') : ''}`;
    const h = core_text.hashString(key);
    // Soft, slightly desaturated palette so abstract CGs read like collectible event stills
    // rather than generic neon gradients. The seed still changes composition per memory.
    const baseHues = [338, 199, 43, 162, 269, 18];
    const hue1 = baseHues[h % baseHues.length];
    const hue2 = baseHues[(h >>> 5) % baseHues.length];
    const x1 = 18 + (h % 62);
    const y1 = 16 + ((h >>> 7) % 68);
    const x2 = 15 + ((h >>> 11) % 70);
    const y2 = 18 + ((h >>> 17) % 64);
    const angle = (h % 160) + 10;
    return `--x1:${x1}%;--y1:${y1}%;--x2:${x2}%;--y2:${y2}%;--angle:${angle}deg;--c1:hsla(${hue1},54%,72%,.68);--c2:hsla(${hue2},48%,76%,.56)`;
}
