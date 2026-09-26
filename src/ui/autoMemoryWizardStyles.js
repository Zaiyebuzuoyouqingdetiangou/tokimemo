// 回忆向导的排版。步骤条、回忆卡片和底部操作栏。
export function wizardCss(root) {
    return `
${root} .rmt-body:has([data-rmt-auto-memory-root]){display:flex;flex-direction:column;overflow:hidden}
${root} [data-rmt-auto-memory-root]{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;max-width:none;margin:0;padding:0}
${root} .rmt-auto-scroll{flex:1 1 auto;min-height:0;overflow:auto}
${root} .rmt-auto-page{padding:8px 16px 24px}
${root} .rmt-auto-progress{display:grid;gap:8px;margin:0 0 16px}
${root} .rmt-auto-progress-track{height:8px;border-radius:999px;background:var(--rmt-theme-soft,#f3f0f5);overflow:hidden}
${root} .rmt-auto-progress-track>span{display:block;height:100%;border-radius:inherit;background:var(--rmt-theme-accent-ink,#5f5770)}
${root} .rmt-auto-progress p{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0}
${root} .rmt-auto-progress b{font-size:16px;line-height:1.4}
${root} .rmt-auto-progress small{font-size:13px;line-height:1.4;color:var(--rmt-theme-muted,#59677a)}
${root} .rmt-auto-page h2{margin:0 0 8px;font-size:22px;line-height:1.35}
${root} .rmt-auto-page p{margin:0 0 12px;font-size:15px;line-height:1.65}
${root} .rmt-auto-page small,${root} .rmt-auto-why{display:block;font-size:13px;line-height:1.55;color:var(--rmt-theme-muted,#59677a)}
${root} .rmt-auto-lead{font-size:15px;line-height:1.65}
${root} .rmt-auto-field{display:grid;gap:6px;margin:0 0 12px}
${root} .rmt-auto-field>span{font-size:14px;font-weight:650}
${root} .rmt-auto-field :is(input,select){box-sizing:border-box;width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:12px;background:var(--rmt-theme-surface-solid,#fff);color:inherit;font:inherit}
${root} .rmt-auto-api{display:grid;gap:12px}
${root} .rmt-auto-api-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
${root} .rmt-auto-api-mode{min-height:44px;padding:12px;border-radius:14px;border:1px solid var(--rmt-theme-border,#cbdce6);background:var(--rmt-theme-surface-solid,#fff);color:inherit;text-align:left}
${root} .rmt-auto-api-mode b,${root} .rmt-auto-api-mode small{display:block}
${root} .rmt-auto-api-mode.is-on{border-color:var(--rmt-theme-accent-ink,#5f5770);background:var(--rmt-theme-soft,#f3f0f5)}
${root} .rmt-auto-api-row{display:flex;flex-wrap:wrap;gap:8px;align-items:end}
${root} .rmt-auto-api-row .rmt-auto-field{flex:1 1 180px}
${root} .rmt-auto-api .rmt-btn,${root} .rmt-auto-page>.rmt-btn{min-height:44px;margin-top:8px}
${root} .rmt-auto-page>.rmt-btn{width:100%}
${root} .rmt-auto-page .rmt-settings-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px}
${root} .rmt-auto-page label:has([data-rmt-auto-memory-interval]){display:flex;align-items:center;gap:8px;font-size:15px}
${root} .rmt-auto-page [data-rmt-auto-memory-interval]{width:6em;min-height:44px;padding:8px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:12px;font:inherit}
${root} .rmt-auto-all{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 0 8px;font-size:15px}
${root} .rmt-auto-cards{display:grid;grid-template-columns:1fr;gap:12px;margin:0 0 12px}
${root} .rmt-auto-card{display:grid;grid-template-columns:36px minmax(0,1fr);gap:8px 10px;padding:14px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:16px;background:var(--rmt-theme-surface-solid,#fff)}
${root} .rmt-auto-card-icon{width:32px;height:32px;color:var(--rmt-theme-accent-ink,#5f5770)}
${root} .rmt-auto-card h3{margin:0;font-size:16px;line-height:1.4}
${root} .rmt-auto-card p{margin:4px 0;font-size:14px;line-height:1.55}
${root} .rmt-auto-tag{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--rmt-theme-soft,#f3f0f5);color:var(--rmt-theme-accent-ink,#5f5770);font-size:12px;line-height:1.5}
${root} .rmt-auto-switches{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}
${root} .rmt-auto-switch{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:999px;background:var(--rmt-theme-bg,#fff);font-size:14px}
${root} .rmt-auto-switch input{width:18px;height:18px;margin:0;accent-color:var(--rmt-theme-accent-ink,#5f5770)}
${root} .rmt-auto-switch:has(input:checked){border-color:var(--rmt-theme-accent-ink,#5f5770);background:var(--rmt-theme-soft,#f3f0f5)}
${root} .rmt-auto-switch:has(input:disabled){border-style:dashed}
${root} .rmt-auto-switch:has(input:focus-visible){outline:3px solid var(--rmt-theme-accent-ink,#5f5770);outline-offset:3px}
${root} .rmt-auto-why{grid-column:1/-1;margin:0}
${root} .rmt-auto-achieve{margin:4px 0 0;font-size:14px;line-height:1.6;color:var(--rmt-theme-muted,#59677a)}
${root} .rmt-auto-summary{display:grid;gap:8px;margin:8px 0 0;padding:18px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:18px;background:var(--rmt-theme-soft,#f3f0f5)}
${root} .rmt-auto-summary strong{font-size:20px;line-height:1.45;font-weight:750}
${root} .rmt-auto-bar{flex:none;display:grid;gap:4px;padding:10px 16px 14px;border-top:1px solid var(--rmt-theme-border,#cbdce6);background:var(--rmt-theme-surface-solid,#fff)}
${root} .rmt-auto-bar-main{display:flex;gap:8px}
${root} .rmt-auto-bar-main:empty{display:none}
${root} .rmt-auto-bar-main .rmt-btn{flex:1 1 0;min-height:48px;min-width:0}
${root} .rmt-auto-save{background:var(--rmt-theme-accent-ink,#5f5770)!important;color:var(--rmt-theme-surface-solid,#fff)!important;-webkit-text-fill-color:currentColor!important;font-size:16px;font-weight:750}
${root} .rmt-auto-bar-quiet{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
${root} .rmt-auto-bar-quiet button{min-height:44px;padding:8px 12px;border:0;background:transparent;color:var(--rmt-theme-muted,#59677a);font-size:13px;line-height:1.4}
${root} .rmt-auto-bar [data-rmt-auto-memory-status]:empty{display:none}
${root} .rmt-auto-bar [data-rmt-auto-memory-status]{margin:0;font-size:14px;line-height:1.5}
${root} [data-rmt-auto-memory-root] :is(button,input,select,summary):focus-visible{outline:3px solid var(--rmt-theme-accent-ink,#5f5770);outline-offset:3px}
@media(min-width:760px){${root} .rmt-auto-cards{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){${root} [data-rmt-auto-memory-root] *{transition:none!important}}
`;
}
