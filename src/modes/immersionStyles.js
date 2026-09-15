// Presentation only: local styles never alter saved prose, basis, or image records.
export function immersionCss(root) {
    return `
${root} .rmt-mail-paper[data-rmt-paper]{--rmt-content-ink:var(--rmt-letter-ink);background:var(--rmt-letter-paper)!important;color:var(--rmt-letter-ink)!important;-webkit-text-fill-color:var(--rmt-letter-ink)!important;border-color:var(--rmt-letter-line);border-top-color:var(--rmt-letter-line)}
${root} [data-rmt-paper=cream]{--rmt-letter-paper:#fff8e5;--rmt-letter-ink:#4b3c27;--rmt-letter-line:#b9a477}
${root} [data-rmt-paper=rose]{--rmt-letter-paper:#fff0f4;--rmt-letter-ink:#653b4a;--rmt-letter-line:#bd8498}
${root} [data-rmt-paper=sky]{--rmt-letter-paper:#edf6ff;--rmt-letter-ink:#2d4d68;--rmt-letter-line:#85a9c7}
${root} [data-rmt-paper=sage]{--rmt-letter-paper:#f0f6ea;--rmt-letter-ink:#3d5135;--rmt-letter-line:#9aaa86}
${root} [data-rmt-paper=lilac]{--rmt-letter-paper:#f4effc;--rmt-letter-ink:#514061;--rmt-letter-line:#ab94c1}
${root} [data-rmt-paper=peach]{--rmt-letter-paper:#fff1e7;--rmt-letter-ink:#68442c;--rmt-letter-line:#c59b7c}
${root} .rmt-archive-portals>.rmt-archive-portal{min-width:0;grid-column:auto}
${root}[data-rmt-theme-mode] .rmt-archive-portals .rmt-portal-open{width:100%;background:transparent!important;border:0!important}
${root} .rmt-travel-index nav{align-content:start;grid-auto-rows:max-content}
${root} .rmt-travel-index nav button{height:auto!important;min-height:60px;overflow:visible;align-items:center;padding:12px;box-sizing:border-box}
${root} .rmt-travel-index nav button>span{min-width:0;display:grid;gap:4px}
${root} .rmt-travel-index nav :is(b,small){white-space:normal;overflow-wrap:anywhere;line-height:1.5}
${root} .rmt-phone-detail{padding:12px!important;min-width:0}
${root} .rmt-phone-detail-toolbar{margin-bottom:16px;gap:10px;align-items:center}
${root} .rmt-phone-detail-toolbar .rmt-btn{min-height:44px;font-size:13px;flex-shrink:0}
${root} .rmt-phone-detail-toolbar>span{font-size:12px;line-height:1.6;overflow-wrap:anywhere}
${root} .rmt-phone-detail article,${root} .rmt-phone-conversation{min-width:0;overflow-wrap:anywhere}
${root} .rmt-phone-detail h3{font-size:20px;line-height:1.5;margin:12px 0;font-weight:650}
${root} .rmt-phone-detail .rmt-phone-record-copy{font-size:16px;line-height:1.9;white-space:pre-wrap;font-weight:400;margin:16px 0}
${root} .rmt-phone-record-mark{display:inline-flex}
${root} .rmt-phone-record-mark .rmt-phone-icon{width:36px;height:36px;font-size:18px;border-radius:10px}
${root} .rmt-phone-fields{display:grid;gap:0;margin:16px 0;border-top:1px solid var(--rmt-screen-muted);border-bottom:1px solid var(--rmt-screen-muted)}
${root} .rmt-phone-fields>div{display:grid;grid-template-columns:minmax(65px,.7fr) minmax(0,1fr);gap:14px;padding:12px 4px;border:0;border-bottom:1px dashed color-mix(in srgb,var(--rmt-screen-muted) 30%,transparent);border-radius:0;background:transparent}
${root} .rmt-phone-fields>div:last-child{border-bottom:0}
${root} .rmt-phone-fields dt{font-size:13px;line-height:1.7}
${root} .rmt-phone-fields dd{margin:0;font-size:15px;line-height:1.7;overflow-wrap:anywhere}
${root} .rmt-phone-ledger{padding:20px 14px;border:1px dashed var(--rmt-screen-muted);border-radius:3px}
${root} .rmt-phone-ledger>header{text-align:center;display:grid;justify-items:center;gap:6px;padding-bottom:8px}
${root} .rmt-phone-ledger>header small{font-size:12px;letter-spacing:.14em}
${root} .rmt-phone-ledger .rmt-phone-fields dd{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
${root} .rmt-phone-ledger-memo{border-top:3px double var(--rmt-screen-muted);margin-top:16px}
${root} .rmt-phone-notepaper{padding:16px 16px 28px;border-top:4px solid var(--rmt-screen-muted);background:repeating-linear-gradient(transparent 0 30px,color-mix(in srgb,var(--rmt-screen-muted) 14%,transparent) 30px 31px);min-height:260px}
${root} .rmt-phone-notepaper .rmt-phone-record-copy{line-height:31px}
${root} .rmt-phone-feed-post>header{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--rmt-screen-muted) 30%,transparent)}
${root} .rmt-phone-contact-avatar{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;background:color-mix(in srgb,var(--rmt-screen-muted) 18%,var(--rmt-screen-bg));color:var(--rmt-screen-ink);border-radius:50%;font-size:24px}
${root} .rmt-phone-contact-card>header{display:grid;justify-items:center;gap:12px;padding:24px 0;border-bottom:1px solid var(--rmt-screen-muted)}
${root} .rmt-phone-contact-card>header .rmt-phone-contact-avatar{width:80px;height:80px;font-size:32px}
${root} .rmt-phone-track-card{padding:18px 8px;text-align:center}
${root} .rmt-phone-record-art{display:grid;place-items:center;margin:0 auto 24px;width:min(200px,80%);aspect-ratio:1;border-radius:50%;border:22px double var(--rmt-screen-muted);box-shadow:inset 0 0 0 12px var(--rmt-screen-bg);font-size:38px}
${root} .rmt-phone-track-card .rmt-phone-record-copy{text-align:left}
${root} .rmt-phone-photo-record figure{margin:0;padding:24px 16px;border:1px solid var(--rmt-screen-muted);border-radius:10px;background:color-mix(in srgb,var(--rmt-screen-muted) 8%,var(--rmt-screen-bg));text-align:center}
${root} .rmt-phone-photo-record figure>i{font-size:32px;margin:8px 0 20px}
${root} .rmt-phone-book-page{padding:20px 18px;border-left:7px double var(--rmt-screen-muted);font-family:Georgia,'Songti SC',serif}
${root} .rmt-phone-book-page>header{border-bottom:1px solid var(--rmt-screen-muted);padding-bottom:18px}
${root} .rmt-phone-document>header,${root} .rmt-phone-record>header{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--rmt-screen-muted);padding-bottom:12px}
${root} .rmt-phone-browser-page>header{display:flex;align-items:center;gap:12px;border:1px solid var(--rmt-screen-muted);border-radius:24px;padding:8px 12px;margin-bottom:20px}
${root} .rmt-phone-dashboard>header,${root} .rmt-phone-collection-card>header{display:grid;justify-items:center;text-align:center;padding:20px 12px;border-radius:14px;background:color-mix(in srgb,var(--rmt-screen-muted) 12%,var(--rmt-screen-bg))}
${root} .rmt-phone-dashboard .rmt-phone-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;border:0}
${root} .rmt-phone-dashboard .rmt-phone-fields>div{display:grid;grid-template-columns:1fr;border:1px solid var(--rmt-screen-muted);border-radius:12px;padding:12px}
${root} .rmt-phone-route-journal>header{display:flex;align-items:center;gap:10px}
${root} .rmt-phone-route-entry{border-left:2px solid var(--rmt-screen-muted);padding-left:18px;margin-left:16px}
${root} .rmt-phone-conversation>header{position:static;text-align:center;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--rmt-screen-muted) 30%,transparent)}
${root} .rmt-phone-conversation .rmt-phone-chat-thread{gap:16px}
${root} .rmt-phone-conversation .rmt-phone-message{max-width:88%;padding:12px;border-radius:16px 16px 16px 4px}
${root} .rmt-phone-conversation .rmt-phone-message-owner{align-self:flex-end;margin-left:auto;border-radius:16px 16px 4px 16px;background:color-mix(in srgb,var(--rmt-screen-muted) 15%,var(--rmt-screen-bg))}
${root} .rmt-phone-conversation .rmt-phone-message p{font-size:16px!important}
@media(max-width:480px){${root} .rmt-travel-index nav{max-height:280px;grid-template-columns:1fr}${root} .rmt-phone-ledger{padding:16px 12px}${root} .rmt-phone-detail-toolbar{flex-wrap:wrap}}
`;
}
