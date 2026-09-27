// r84.172 · 图片操作收进图片外右下角的小兔子（心迹回廊在魔法棒菜单里的那只）。
// 用 <details>/<summary>，点兔子展开、再点收起；按钮原样搬进菜单，原来的点击处理不变。
// 菜单在图片下方就地展开（不浮在别的内容上），不会被外层 overflow 裁掉，手机和 TT 也好点。
export const BUNNY_SVG = '<svg class="rmt-bunny-icon" viewBox="0 0 32 32" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><path d="M10 16C4 2 11 1 14 14M18 14C20 1 27 2 23 16M9 16c-7 11 3 15 9 14s13-8 5-14c-4-3-10-3-14 0Z"/><path d="M12 22h1m6 0h1m-6 4 2 1 2-1"/></svg>';

export function imageMenuHtml(buttonsHtml, { label = '图片操作' } = {}) {
    if (!buttonsHtml) return '';
    return `<div class="rmt-cg-menu-row"><details class="rmt-cg-menu"><summary class="rmt-cg-menu-toggle" aria-label="${label}" title="${label}">${BUNNY_SVG}</summary><div class="rmt-cg-menu-list">${buttonsHtml}</div></details></div>`;
}

// 还没有图时只有一个动作：直接给一个带小兔子的按钮，不用先展开菜单。
export function imageSetupHtml(buttonHtml) {
    return buttonHtml ? `<div class="rmt-cg-menu-row rmt-cg-menu-single">${buttonHtml}</div>` : '';
}

// 点菜单里的按钮后收起；点菜单外面时收起所有打开的菜单。只装一次。
export function installImageMenuDismiss(doc = globalThis.document) {
    if (!doc || doc.__rmtImageMenuDismiss) return;
    doc.__rmtImageMenuDismiss = true;
    doc.addEventListener('click', event => {
        const target = event.target;
        const inside = target?.closest?.('.rmt-cg-menu');
        for (const menu of doc.querySelectorAll('.rmt-cg-menu[open]')) {
            if (menu === inside) {
                if (target.closest?.('.rmt-cg-menu-list button:not([data-card-tilt])')) globalThis.setTimeout?.(() => { menu.open = false; }, 0);
                continue;
            }
            menu.open = false;
        }
    }, true);
}

export function imageMenuCss(root) {
    return `
${root} .rmt-cg-menu-row{display:flex;justify-content:flex-end;align-items:flex-start;margin-top:6px;min-width:0}
${root} .rmt-cg-menu{display:flex;flex-direction:column;align-items:flex-end;max-width:100%}
${root} .rmt-cg-menu-toggle{list-style:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:1px solid var(--rmt-theme-border);background:var(--rmt-theme-surface-solid,var(--rmt-theme-surface));color:var(--rmt-theme-text);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
${root} .rmt-cg-menu-toggle::-webkit-details-marker{display:none}
${root} .rmt-cg-menu-toggle::marker{content:''}
${root} .rmt-cg-menu[open] .rmt-cg-menu-toggle{background:var(--rmt-theme-wash,var(--rmt-theme-surface-tint));color:var(--rmt-theme-accent-ink,var(--rmt-theme-text))}
${root} .rmt-cg-menu-toggle:focus-visible{outline:3px solid var(--rmt-theme-accent-ink,var(--rmt-theme-text))!important;outline-offset:2px}
${root} .rmt-cg-menu-list{display:grid;gap:2px;margin-top:6px;width:min(100%,260px);padding:6px;border:1px solid var(--rmt-theme-border);border-radius:12px;background:var(--rmt-theme-surface-solid,var(--rmt-theme-surface))}
${root} .rmt-cg-menu-list .rmt-btn,${root} .rmt-cg-menu-list button{display:flex!important;align-items:center;justify-content:flex-start!important;width:100%!important;min-height:40px;margin:0!important;padding:8px 12px!important;border:0!important;border-radius:8px!important;background:transparent!important;box-shadow:none!important;color:var(--rmt-theme-text)!important;text-align:left!important;font-size:14px;white-space:normal}
${root} .rmt-cg-menu-list button:hover,${root} .rmt-cg-menu-list button:focus-visible{background:var(--rmt-theme-surface-tint,var(--rmt-theme-soft))!important}
${root} .rmt-cg-menu-list button[hidden]{display:none!important}
${root} .rmt-cg-menu-list button:disabled{opacity:.5}
${root} .rmt-cg-menu-single .rmt-btn{display:inline-flex!important;align-items:center;gap:6px;width:auto!important;flex:0 0 auto!important}
${root} .rmt-cg-menu-single .rmt-bunny-icon{flex:0 0 auto}
`;
}
