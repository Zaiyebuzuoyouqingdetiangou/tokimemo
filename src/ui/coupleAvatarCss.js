// Couples share the active Hearttrace theme; no global theme or host controls are changed.
export function coupleAvatarCss() {
    return `
.rmt-couple,.rmt-pair-sheet{color:var(--rmt-theme-text);font-size:14px;line-height:1.6;min-width:0}
.rmt-couple{max-width:1120px;margin:auto;padding:4px 0 24px}
:is(.rmt-couple,.rmt-pair-sheet) *{box-sizing:border-box}
:is(.rmt-couple,.rmt-pair-sheet) [hidden]{display:none!important}
:is(.rmt-couple,.rmt-pair-sheet) :is(button,a.rmt-pair-button){font:inherit!important;color:var(--rmt-theme-text)!important;background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border)!important;border-radius:12px!important;min-height:44px;padding:9px 14px!important;cursor:pointer;line-height:1.4!important;white-space:normal!important;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:6px;box-shadow:none!important;max-width:100%}
:is(.rmt-couple,.rmt-pair-sheet) button:disabled{opacity:.5;cursor:default}
:is(.rmt-couple,.rmt-pair-sheet) button[aria-pressed=true]{border-color:var(--rmt-theme-accent-ink)!important;background:var(--rmt-theme-soft)!important;box-shadow:inset 0 0 0 1px var(--rmt-theme-accent-ink)!important}
:is(.rmt-couple,.rmt-pair-sheet) .rmt-pair-primary{background:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important;border-color:var(--rmt-theme-accent-ink)!important;font-weight:600!important}
:is(.rmt-couple,.rmt-pair-sheet) :is(input,select,textarea){font:inherit!important;width:100%;min-width:0;max-width:100%;min-height:44px;padding:10px 12px!important;color:var(--rmt-theme-text)!important;background:var(--rmt-theme-surface-solid)!important;border:1px solid var(--rmt-theme-border)!important;border-radius:10px!important;box-sizing:border-box;line-height:1.5!important}
:is(.rmt-couple,.rmt-pair-sheet) textarea{resize:vertical;min-height:80px}
:is(.rmt-couple,.rmt-pair-sheet) input[type=range]{padding:8px 0!important;border:0!important;accent-color:var(--rmt-theme-accent-ink)}
:is(.rmt-couple,.rmt-pair-sheet) :is(button,a,input,select,textarea,summary):focus-visible{outline:2px solid var(--rmt-theme-accent-ink);outline-offset:3px}
:is(.rmt-couple,.rmt-pair-sheet) h2{font-size:23px!important;line-height:1.4;margin:0!important}
:is(.rmt-couple,.rmt-pair-sheet) h3{font-size:16px!important;margin:0!important}
:is(.rmt-couple,.rmt-pair-sheet) p{margin:6px 0 0;line-height:1.7}
:is(.rmt-couple,.rmt-pair-sheet) small,.rmt-pair-muted{color:var(--rmt-theme-muted);font-size:12px;line-height:1.6}
.rmt-pair-head,.rmt-pair-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rmt-pair-head{margin-bottom:18px}
.rmt-pair-head p{color:var(--rmt-theme-muted)}
.rmt-pair-nav,.rmt-pair-actions{display:flex;gap:8px;flex-wrap:wrap}
.rmt-pair-layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(300px,.88fr);gap:24px;align-items:start}
.rmt-pair-preview,.rmt-pair-form,.rmt-pair-history{min-width:0}
.rmt-pair-stage{padding:18px;border:1px solid var(--rmt-theme-border);border-radius:18px;background:var(--rmt-theme-surface-solid)}
.rmt-pair-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0 12px}
.rmt-pair-person{min-width:0;text-align:center}
.rmt-pair-person strong{display:block;overflow-wrap:anywhere;font-size:14px;margin:10px 0}
.rmt-pair-person>button{width:100%}
.rmt-pair-square{position:relative;aspect-ratio:1;overflow:hidden;border-radius:18px;background:var(--rmt-theme-soft);border:1px solid var(--rmt-theme-border);width:100%;touch-action:pan-y}
.rmt-pair-square img{display:block;user-select:none;-webkit-user-select:none}
.rmt-pair-two.is-circle .rmt-pair-square{border-radius:50%}
.rmt-pair-empty{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;color:var(--rmt-theme-muted);padding:10px}
.rmt-pair-empty b{font-size:32px;line-height:1.2;font-weight:400;color:var(--rmt-theme-accent-ink)}
.rmt-pair-preview-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.rmt-pair-result-meta{margin-top:12px;color:var(--rmt-theme-muted);font-size:12px;overflow-wrap:anywhere}
.rmt-pair-form{display:flex;flex-direction:column;gap:20px;padding:4px 0}
.rmt-pair-field{display:flex;flex-direction:column;gap:7px;min-width:0}
.rmt-pair-field>span{font-weight:600}
.rmt-pair-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rmt-pair-block{display:flex;flex-direction:column;gap:12px}
.rmt-pair-style-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
:is(.rmt-couple,.rmt-pair-sheet) .rmt-pair-style{flex-direction:column;align-items:flex-start;text-align:left;gap:5px!important;padding:12px!important;min-height:76px}
.rmt-pair-style b{font-weight:600;line-height:1.5}.rmt-pair-style small{font-size:11px}
.rmt-pair-custom{display:none}.rmt-pair-custom.is-visible{display:flex}
.rmt-pair-choice{display:flex;gap:8px}.rmt-pair-choice>button{flex:1}
.rmt-pair-options{border-top:1px solid var(--rmt-theme-border);border-bottom:1px solid var(--rmt-theme-border);padding:0 2px}
.rmt-pair-options>summary{cursor:pointer;min-height:48px;display:flex;align-items:center;justify-content:space-between;font-weight:600;list-style:none}
.rmt-pair-options>summary:after{content:'＋';font-size:18px}.rmt-pair-options[open]>summary:after{content:'−'}
.rmt-pair-options>summary::-webkit-details-marker{display:none}
.rmt-pair-options>div{display:grid;gap:14px;padding:2px 0 16px}
.rmt-pair-options:not([open])>div{display:none}
.rmt-pair-create{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;position:static!important}
.rmt-pair-note{color:var(--rmt-theme-muted);font-size:12px}
.rmt-pair-status{margin:12px 0;overflow-wrap:anywhere}
.rmt-pair-status:empty{display:none}
.rmt-pair-jobs{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.rmt-pair-job{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-soft);border-radius:12px;padding:10px}
.rmt-pair-job span{min-width:0;overflow-wrap:anywhere}
.rmt-pair-job>button{flex-shrink:0}
.rmt-pair-history-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}
:is(.rmt-couple,.rmt-pair-sheet) .rmt-pair-history-card{display:block;text-align:left;width:100%;padding:12px!important}
.rmt-pair-mini{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:10px}
.rmt-pair-mini .rmt-pair-square{border-radius:10px}
.rmt-pair-history-card b,.rmt-pair-history-card small{display:block;overflow-wrap:anywhere}
.rmt-pair-shade{position:fixed;inset:0;z-index:10000;background:rgba(15,24,38,.48);display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:auto}
.rmt-pair-sheet{display:flex;flex-direction:column;width:min(720px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);border-radius:20px;box-shadow:0 12px 40px #0003;overflow:hidden}
.rmt-pair-sheet>header{padding:18px 20px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex:none}
.rmt-pair-sheet>header h2{font-size:20px!important}
.rmt-pair-sheet>header button{flex:none}
.rmt-pair-sheet-body{padding:4px 20px 20px;overflow:auto;overscroll-behavior:contain;min-height:0}
.rmt-pair-sheet-body>.rmt-pair-actions{margin-top:16px}
.rmt-pair-style-search{margin-bottom:12px}
.rmt-pair-groups{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
.rmt-pair-picker-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rmt-pair-crop-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:start}
.rmt-pair-sliders{display:flex;flex-direction:column;gap:12px}
.rmt-pair-sliders label{display:block}
.rmt-pair-seam{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;margin:12px 0}
.rmt-pair-seam .rmt-pair-square{border-radius:0;border:0}
.rmt-pair-full-image{display:block;width:auto!important;max-width:100%!important;max-height:54vh;height:auto!important;object-fit:contain;margin:0 auto;border-radius:0;user-select:auto!important;-webkit-user-select:auto!important;-webkit-touch-callout:default!important;touch-action:auto}
.rmt-pair-restore-note{padding:12px;background:var(--rmt-theme-soft);border:1px solid var(--rmt-theme-border);border-radius:12px;margin-top:12px}
@media(max-width:950px){.rmt-pair-layout{grid-template-columns:minmax(0,1fr);gap:24px}.rmt-pair-preview{width:100%;max-width:580px;justify-self:center}.rmt-pair-history-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:500px){.rmt-couple{padding-top:0}.rmt-pair-head{gap:12px}.rmt-pair-head h2{font-size:21px!important}.rmt-pair-head p{font-size:12px}.rmt-pair-stage{padding:12px;border-radius:16px}.rmt-pair-two{gap:10px;margin-top:14px}.rmt-pair-square{border-radius:14px}.rmt-pair-person strong{margin:8px 0}.rmt-pair-style-grid{gap:6px}.rmt-pair-style-grid button{padding:10px 8px!important}.rmt-pair-style-grid b{font-size:13px}.rmt-pair-history-grid{gap:10px}.rmt-pair-shade{padding:8px}.rmt-pair-sheet{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);border-radius:16px}.rmt-pair-sheet>header{padding:14px 14px 10px}.rmt-pair-sheet-body{padding:4px 14px 16px}.rmt-pair-picker-results{grid-template-columns:repeat(2,minmax(0,1fr))}.rmt-pair-crop-layout{grid-template-columns:minmax(0,1fr)}.rmt-pair-crop-layout>.rmt-pair-square{max-width:230px;justify-self:center}.rmt-pair-sliders{gap:4px}.rmt-pair-full-image{max-height:48vh}}
`;
}
