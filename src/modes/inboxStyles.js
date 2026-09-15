export function inboxCss(root) {
    return `
${root} .rmt-inbox{max-width:1020px;margin:0 auto;padding:clamp(16px,3vw,30px);color:var(--rmt-theme-text);font-size:15px;line-height:1.6}
${root} .rmt-inbox *{box-sizing:border-box}
${root} .rmt-mail-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding:12px 0 24px;border-bottom:1px solid var(--rmt-theme-border)}
${root} .rmt-mail-header h2{margin:5px 0;font-size:25px;font-weight:650;letter-spacing:.04em}
${root} .rmt-mail-header p{margin:0;color:var(--rmt-theme-muted);font-size:13px}
${root} .rmt-mail-header small{letter-spacing:.15em;font-size:11px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-mail-actions,${root} .rmt-mail-filters{display:flex;flex-wrap:wrap;gap:10px}
${root} .rmt-mail-filters{margin:20px 0}
${root} .rmt-inbox button{min-height:44px;cursor:pointer}
${root} .rmt-inbox button:disabled{cursor:default}
${root} .rmt-inbox button:focus-visible{outline:3px solid var(--rmt-theme-accent-ink);outline-offset:3px}
${root} .rmt-inbox [aria-pressed=true]{border:2px solid var(--rmt-theme-accent-ink)!important}
${root} .rmt-mail-list{display:grid;gap:12px}
${root} .rmt-mail-row{display:grid;grid-template-columns:42px minmax(0,1fr) 16px;align-items:center;gap:16px;width:100%;padding:20px;text-align:left;border:1px solid var(--rmt-theme-border);border-radius:14px;background:var(--rmt-theme-surface-solid);color:var(--rmt-theme-text);font:inherit;box-shadow:0 4px 14px var(--rmt-theme-shadow)}
${root} .rmt-mail-row>span:nth-child(2){display:grid;gap:5px;min-width:0}
${root} .rmt-mail-row b{font-size:17px;font-weight:600;overflow-wrap:anywhere}
${root} .rmt-mail-row small{font-size:12px;color:var(--rmt-theme-muted)}
${root} .rmt-mail-row>span:nth-child(2)>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:400;overflow-wrap:anywhere}
${root} .rmt-mail-row.is-unread{border-left:4px solid var(--rmt-theme-accent-ink)}
${root} .rmt-mail-seal{font-size:27px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-mail-open{padding-top:20px}
${root} .rmt-mail-paper{--rmt-content-ink:var(--rmt-paper-note-ink,#4c4030);margin-top:20px;padding:clamp(24px,6vw,62px);border:1px solid var(--rmt-theme-border);border-top:4px solid var(--rmt-theme-accent-alt);border-radius:3px 3px 16px 16px;background:var(--rmt-paper-note,#fff7dc)!important;color:var(--rmt-paper-note-ink,#4c4030)!important;box-shadow:0 12px 25px var(--rmt-theme-shadow)}
${root} .rmt-mail-paper :is(p,b,h2,small,footer){color:inherit!important;-webkit-text-fill-color:currentColor!important;text-shadow:none!important}
${root} .rmt-mail-paper header{margin-bottom:30px;padding-bottom:20px;border-bottom:1px solid currentColor}
${root} .rmt-mail-paper h2{font-size:23px;line-height:1.5}
${root} .rmt-mail-paper small{font-size:12px;letter-spacing:.08em}
${root} .rmt-mail-paper p{font-size:16px;line-height:2;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:400}
${root} .rmt-mail-paper footer{white-space:pre-wrap;text-align:right;margin-top:30px}
${root} .rmt-mail-about{margin-top:24px;font-size:12px;color:var(--rmt-theme-muted)}
${root} .rmt-mail-about summary{cursor:pointer;min-height:32px}
${root} .rmt-mail-empty{padding:50px 22px;text-align:center;border:1px dashed var(--rmt-theme-border);border-radius:16px;background:var(--rmt-theme-surface-solid)}
${root} .rmt-mail-empty>span{font-size:42px;color:var(--rmt-theme-accent-ink)}
${root} .rmt-travel-postcard-copy p{font-size:16px;line-height:1.9}
${root} .rmt-travel-postcard-copy>b,${root} .rmt-travel-postcard-copy footer,${root} .rmt-travel-postcard-address b{font-size:14px}
${root} .rmt-phone-detail p,${root} .rmt-phone-image-caption{font-size:14px;line-height:1.85}
${root} .rmt-phone-entry-main>b{font-size:15px;line-height:1.5}
${root} .rmt-phone-entry-main>small{font-size:12px;line-height:1.5}
${root} .rmt-phone-entry-main>span{font-size:14px;line-height:1.7}
${root} .rmt-phone-list-gallery .rmt-phone-entry>b,${root} .rmt-phone-list-camera .rmt-phone-entry>b{font-size:14px}
${root} .rmt-phone-list-gallery .rmt-phone-entry>small,${root} .rmt-phone-list-camera .rmt-phone-entry>small{font-size:12px}
${root} .rmt-phone-list-gallery .rmt-phone-entry>span,${root} .rmt-phone-list-camera .rmt-phone-entry>span{font-size:14px;line-height:1.7}
${root} .rmt-phone-message p{font-size:14px!important;line-height:1.8!important}
${root} .rmt-phone-message b{font-size:12px}
${root} .rmt-phone-message small{font-size:11px}
${root} .rmt-mail-open .rmt-travel-postcard{position:relative;inset:auto;width:100%;max-width:none;transform:none;margin:20px 0}
${root} .rmt-phone-list-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px}
${root} .rmt-phone-list-notes .rmt-phone-entry-notes{display:block;min-width:0;padding:0;border:0}
${root} .rmt-phone-note-sheet{display:grid!important;gap:9px;width:100%;min-width:0;text-align:left;border-top:3px solid #ddbd67;padding:14px;min-height:120px;overflow-wrap:anywhere;white-space:normal!important;-webkit-line-clamp:unset!important}
${root} .rmt-phone-note-sheet>small{font-size:12px}
${root} .rmt-phone-note-sheet>b{font-size:15px;line-height:1.5}
${root} .rmt-phone-note-sheet>span{font-size:14px;line-height:1.7;white-space:normal!important}
${root} .rmt-phone-book-spine{display:grid;place-items:center;align-self:stretch;min-width:34px;padding:8px;background:#786448;color:#fff5da;writing-mode:vertical-rl;letter-spacing:.15em;font-size:10px}
${root} .rmt-phone-entry-games{display:flex;gap:16px;align-items:center}
${root} .rmt-phone-entry-games>i{font-size:28px}
${root} .rmt-room-person[data-rmt-outfit=historical]{--rmt-room-outfit-a:#d8cbb5;--rmt-room-outfit-b:#aa9272}
${root} .rmt-room-person[data-rmt-hair-shape=long] .rmt-room-hair:after{height:80px;border-radius:25% 35% 45% 45%}
@media(max-width:480px){${root} .rmt-inbox{padding:16px}${root} .rmt-mail-row{padding:16px 12px;grid-template-columns:26px minmax(0,1fr) 12px;gap:10px}${root} .rmt-mail-header h2{font-size:22px}${root} .rmt-mail-paper{padding:24px 20px}${root} .rmt-mail-actions{width:100%}${root} .rmt-mail-actions .rmt-btn{flex:1}}
`;
}
