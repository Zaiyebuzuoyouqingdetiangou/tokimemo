// Narrow-screen reading rules live beside the reader rather than the shared
// stylesheet: this keeps the long-form layout self-contained and importable by
// the existing bundle entrypoint.
export function pastLivesReadingCss(root) {
    return `
@media(max-width:600px){
${root} .rmt-past-lives{padding:14px 12px 28px;font-size:16px;line-height:1.85}
${root} .rmt-past-head{display:block;padding-bottom:14px}
${root} .rmt-past-head h2{font-size:25px!important;line-height:1.35!important;letter-spacing:.04em!important}
${root} .rmt-past-head p{font-size:14px!important;line-height:1.65!important}
${root} .rmt-past-head .rmt-past-actions{margin-top:12px}
${root} .rmt-past-head .rmt-past-actions .rmt-btn{width:100%}
${root} .rmt-past-boundary{margin:12px 0 18px!important;font-size:13px!important;line-height:1.65!important}
${root} .rmt-past-notice{margin:0 0 16px!important;padding:10px 12px;font-size:14px!important;line-height:1.65!important}
${root} .rmt-past-reader-back{align-items:flex-start;gap:8px;margin-bottom:12px}
${root} .rmt-past-reader-back>span{flex:1 1 100%;font-size:13px;line-height:1.55}
${root} .rmt-past-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 0 14px;margin-bottom:16px}
${root} .rmt-past-tabs>.rmt-btn{width:100%;min-height:46px;padding:8px!important;font-size:14px!important;line-height:1.35!important}
${root} :is(.rmt-past-lives,.rmt-past-reader,.rmt-past-main,.rmt-past-margin){max-height:none!important;overflow:visible!important}
${root} .rmt-past-reader{display:block}
${root} .rmt-past-main>.rmt-past-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:16px}
${root} .rmt-past-main>.rmt-past-actions .rmt-btn{width:100%}
${root} .rmt-past-draw{padding:24px 16px;border-radius:12px;box-shadow:none}
${root} .rmt-past-slip{margin:18px 0;padding:18px 0;max-width:none}
${root} .rmt-past-paper,${root} .rmt-past-evidence,${root} .rmt-past-closing,${root} .rmt-past-echo{padding:20px 16px;border-radius:12px;box-shadow:none}
${root} .rmt-past-paper p,${root} .rmt-past-evidence p,${root} .rmt-past-closing p,${root} .rmt-past-echo p,${root} .rmt-past-slip p{font-size:16px!important;line-height:1.9!important}
${root} .rmt-past-paper :is(h3),${root} .rmt-past-evidence :is(h3),${root} .rmt-past-closing :is(h3),${root} .rmt-past-echo :is(h3){font-size:21px!important;line-height:1.45!important}
${root} .rmt-past-docket{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:12px}
${root} .rmt-past-docket .rmt-btn{width:100%;text-align:left;padding-inline:14px!important}
${root} .rmt-past-clues{grid-template-columns:1fr;gap:10px;margin:14px 0}
${root} .rmt-past-clue{min-height:0!important;padding:14px 16px!important;gap:4px;border-radius:8px}
${root} .rmt-past-clue>span{font-size:14px;line-height:1.55}
${root} .rmt-past-revealed{margin-top:16px;padding:14px}
${root} .rmt-past-margin{margin-top:20px;padding:16px 0 0;border-left:0;border-top:1px solid var(--rmt-theme-border);overflow:visible}
${root} .rmt-past-margin>h3{font-size:16px!important;margin:0 0 10px!important}
${root} .rmt-past-annotation{margin-bottom:12px;padding:14px;border-radius:8px;box-shadow:none}
${root} .rmt-past-annotation p{font-size:15px!important;line-height:1.75!important}
${root} .rmt-past-echoes{gap:14px}
${root} .rmt-past-source{margin-top:16px}
${root} .rmt-past-source summary{font-size:14px;line-height:1.45}
${root} .rmt-past-source p{font-size:15px!important;line-height:1.75!important}
${root} .rmt-past-library{gap:12px}
${root} .rmt-past-cover{min-height:112px!important;padding:16px!important;gap:12px;border-radius:10px;box-shadow:none}
${root} .rmt-past-cover b{font-size:18px!important;line-height:1.45!important}
${root} .rmt-past-cover-icon{font-size:22px}
}
@media(max-width:360px){
${root} .rmt-past-lives{padding-inline:10px}
${root} .rmt-past-head h2{font-size:23px!important}
${root} .rmt-past-paper,${root} .rmt-past-evidence,${root} .rmt-past-closing,${root} .rmt-past-echo{padding:18px 14px}
${root} .rmt-past-tabs>.rmt-btn{font-size:13px!important}
}
`;
}
