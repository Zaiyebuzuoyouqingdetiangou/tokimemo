// Presentation shared by the storyboard and editing pages. Theme values come
// from the host; generation, media and saved records stay in their own modules.
export function workspaceHeader({ esc, btn, song, editing, ready, pending = 0 }) {
    return `<div class="rmt-mvf-top"><header class="rmt-mvf-head">${btn('back-song', '‹ 返回印象曲', { cls: 'rmt-mvf-return' })}<div class="rmt-mvf-song" title="${esc(song.title)}">${esc(song.title)}</div><div class="rmt-mvf-head-actions">${btn('editor-drawer', `⋯${pending ? ` <small>${pending}</small>` : ''}`, { id: 'more', extra: ' aria-label="更多操作"' })}${ready ? btn('editor-drawer', '导出', { id: 'export', cls: 'rmt-x-primary' }) : ''}</div></header><nav class="rmt-mvf-tabs" aria-label="手书制作">${[['board', '分镜与画面'], ['editor', '剪辑与导出']].map(([id, title]) => btn('workspace-tab', title, { id, cls: 'rmt-mvf-tab', extra: ` aria-current="${editing === (id === 'editor') ? 'page' : 'false'}"` })).join('')}</nav></div>`;
}

export function workspaceSheet({ esc, btn, drawer, html }) {
    if (!drawer) return '';
    const title = { export: '导出手书', more: '更多操作', audio: '导入与管理音乐', shots: '全部分镜', settings: '制作设置', materials: '共享素材' }[drawer] || '选项';
    return `<div class="rmt-mve-sheet-shade"><section class="rmt-mve-sheet" data-editor-drawer="${drawer}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><b>${esc(title)}</b>${btn('editor-drawer', '关闭', { extra: ' aria-label="关闭选项面板"' })}</header><div data-rmt-mv-scroll="drawer-${drawer}">${html}</div></section></div>`;
}

export function workspaceCss(root) {
    const r = `${root} .rmt-shell`;
    const b = `${r} .rmt-body.rmt-mve-body .rmt-mvf-page`;
    return `
${root} .rmt-shell.rmt-mvf-focus>.rmt-topbar,${root} .rmt-shell.rmt-mvf-focus>.rmt-workspace-tabs,${root} .rmt-shell.rmt-mvf-focus>.rmt-workspace-location{display:none!important}
${root} .rmt-shell.rmt-mvf-focus>.rmt-body.rmt-mve-body{display:flex!important;flex-direction:column;flex:1 1 0!important;min-height:0;overflow:hidden!important;padding:0!important;scrollbar-gutter:auto!important}
${b}{display:flex;flex-direction:column;flex:1 1 0;min-height:0;max-width:none;width:100%;gap:0;padding:0;margin:0;overflow:hidden;background:var(--rmt-theme-bg)}
${r} .rmt-mvf-top{flex:none;min-width:0;background:var(--rmt-theme-surface-solid);border-bottom:1px solid var(--rmt-theme-border)}
${r} .rmt-mvf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 16px 0;min-width:0}
${r} .rmt-mvf-head button{min-height:44px;min-width:44px;height:auto;margin:0;padding:8px 12px;border-radius:9px;font-size:13px!important;line-height:1.4!important;box-shadow:none!important;touch-action:manipulation}
${r} .rmt-mvf-head>.rmt-mvf-return{min-width:0;padding-left:0;border:0!important;background:transparent!important;color:var(--rmt-theme-text)!important}
${r} .rmt-mvf-head-actions{display:flex;gap:8px;flex:none}
${r} .rmt-mvf-head-actions>button:first-child{border:0;background:transparent!important;color:var(--rmt-theme-text)!important;font-size:23px!important}
${r} .rmt-mvf-head-actions small{font-size:11px!important}
${r} .rmt-mvf-song{min-width:0;flex:1;padding:0;font-size:14px!important;font-weight:600;line-height:1.5!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--rmt-theme-text)}
${r} .rmt-mvf-tabs{display:flex;gap:20px;padding:0 16px;min-width:0}
${r} .rmt-mvf-tabs .rmt-mvf-tab{flex:1;min-width:0;min-height:44px;height:auto;padding:10px 0;border:0!important;border-bottom:3px solid transparent!important;border-radius:0!important;background:transparent!important;color:var(--rmt-theme-muted)!important;box-shadow:none!important;font-size:13px!important;line-height:1.5!important;touch-action:manipulation}
${r} .rmt-mvf-tabs .rmt-mvf-tab[aria-current=page]{border-bottom-color:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-accent-ink)!important;font-weight:600}
${b} .rmt-mvf-scroll{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;gap:16px;padding:20px 18px max(24px,env(safe-area-inset-bottom,0px));scrollbar-gutter:auto}
${b} .rmt-mvf-scroll>*{flex-shrink:0;min-width:0}
${b} button,${b} summary{min-height:44px;touch-action:manipulation;font-size:13px!important;line-height:1.5!important}
${b} button{height:auto;padding:9px 12px;border-radius:9px;white-space:normal;box-shadow:none!important}
${b} .rmt-x-primary{--rmt-content-ink:var(--rmt-theme-surface-solid);background:var(--rmt-theme-accent-ink)!important;border-color:var(--rmt-theme-accent-ink)!important;color:var(--rmt-theme-surface-solid)!important;font-weight:600}
${b} .rmt-x-card,${b} .rmt-mve-group-fold{padding:14px;border-radius:12px}
${b} :is(p,small,label,summary){line-height:1.65!important}
${b} .rmt-x-note,${b} .rmt-mv-shot-copy>b{font-size:13px!important}
${b} .rmt-x-row-head b{font-size:16px!important}
${b} input:not([type=checkbox]):not([type=range]):not([type=file]),${b} select,${b} textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box;font-size:16px!important;min-height:44px}
${b} .rmt-mvf-overview{display:flex;flex-direction:column;gap:12px}
${b} .rmt-mvf-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
${b} .rmt-mvf-toolbar>button{flex:1;min-width:0}
${b} .rmt-mvf-overview .rmt-x-note{margin:0}
${b} .rmt-mvf-groups{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
${b} .rmt-mve-group-fold{margin:0;background:var(--rmt-theme-surface-solid);border:1px solid var(--rmt-theme-border);overflow:hidden}
${b} .rmt-mve-group-fold>summary{display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:0;list-style:none;text-align:left}
${b} .rmt-mve-group-fold>summary::-webkit-details-marker{display:none}
${b} .rmt-mvf-group-preview{display:flex;align-items:center;justify-content:center;flex:0 0 104px;width:104px;height:72px;border-radius:7px;overflow:hidden;background:var(--rmt-theme-soft);font-size:12px!important;color:var(--rmt-theme-muted)}
${b} .rmt-mvf-group-preview img{display:block;width:100%;height:100%;object-fit:contain}
${b} .rmt-mvf-group-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
${b} .rmt-mvf-group-copy>b{font-size:14px!important;line-height:1.65!important;overflow-wrap:anywhere}
${b} .rmt-mvf-group-copy small{font-size:11px!important;color:var(--rmt-theme-muted)}
${b} .rmt-mve-group-fold summary>em{flex:none;font-style:normal;font-size:20px}
${b} .rmt-mvf-frame-links{display:flex;flex-direction:column;gap:4px}
${b} .rmt-mvf-frame-links>button{display:flex;justify-content:space-between;gap:12px;align-items:center;text-align:left;border:0;border-radius:6px;background:var(--rmt-theme-soft);color:var(--rmt-theme-text);font-size:12px!important}
${b} .rmt-mvf-frame-links small{flex:none;font-size:11px!important}
${b} .rmt-mv-assets{gap:12px;padding:4px 0 8px;align-items:start}
${b} .rmt-mv-assets>div{flex:0 0 130px;min-width:0}
${b} .rmt-mv-asset-actions{display:flex;flex-wrap:wrap;gap:6px}
${b} .rmt-mv-asset-actions>button{flex:1 1 48%;min-width:0;font-size:12px!important;padding:6px}
${b} .rmt-mvf-setup h2{font-size:19px!important;margin:0 0 8px}
${b} .rmt-mvf-setup>p{margin:0}
${b} .rmt-mvf-generate{position:sticky;bottom:-24px;margin:0 -18px -24px;padding:12px 18px max(12px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;background:var(--rmt-theme-surface-solid);border-top:1px solid var(--rmt-theme-border)}
${b} .rmt-mvf-generate>.rmt-x-primary{width:100%}
${r} .rmt-mve-sheet :is(input,textarea,select){box-sizing:border-box;max-width:100%}
${r} .rmt-mve-sheet details>summary{min-height:44px;cursor:pointer}
${r} .rmt-mve-sheet .rmt-x-card{padding:12px;border:1px solid var(--rmt-theme-border);border-radius:10px;background:var(--rmt-theme-surface-solid)}
${r} .rmt-mve-sheet .rmt-mv-asset-actions{display:flex;flex-wrap:wrap;gap:6px}
${r} .rmt-mve-sheet .rmt-mv-asset-actions button{flex:1 1 40%}
@media(min-width:960px){${b} .rmt-mvf-scroll{padding:24px 32px}${b} .rmt-mvf-groups{grid-template-columns:repeat(2,minmax(0,1fr))}${b} .rmt-mvf-overview{max-width:760px;width:100%}${r} .rmt-mvf-tabs{justify-content:flex-start}${r} .rmt-mvf-tabs .rmt-mvf-tab{flex:0 1 200px}}
@media(max-width:360px){${b} .rmt-mvf-scroll{padding-inline:12px}${b} .rmt-mvf-group-preview{flex-basis:80px;width:80px;height:64px}${b} .rmt-mve-group-fold{padding:12px}${r} .rmt-mvf-head,${r} .rmt-mvf-tabs{padding-inline:12px}${r} .rmt-mvf-song{padding-inline:12px}}
`;
}
