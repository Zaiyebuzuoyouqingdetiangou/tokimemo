// 新页面样式：只作用于 .rmt-x-* 类名，颜色跟随档案室主题变量；夜色页面固定配色。
import * as core_constants from '../core/constants.js';

const STYLE_ID = 'heartbeat_memories_extras_styles';

export function extrasCss(root = '#' + core_constants.OVERLAY_ID) {
    const r = root;
    const text = 'var(--rmt-theme-text,#34495d)';
    const muted = 'var(--rmt-theme-muted,#586b7c)';
    const accent = 'var(--rmt-theme-accent,#ce729c)';
    const ink = 'var(--rmt-theme-accent-ink,#a8527a)';
    const border = 'var(--rmt-theme-border,#cfdae5)';
    const surface = 'var(--rmt-theme-surface-solid,#fff)';
    return `
${r} .rmt-x-page{display:flex;flex-direction:column;gap:16px;padding:14px 4px 28px;color:${text};max-width:760px;margin:0 auto;box-sizing:border-box}
${r} .rmt-x-head{display:flex;flex-direction:column;gap:4px;padding:0 4px}
${r} .rmt-x-head small{font-size:11px;letter-spacing:3px;color:${muted}}
${r} .rmt-x-head h2{margin:0;font-size:26px;font-weight:700;color:${text}}
${r} .rmt-x-head p,${r} .rmt-x-note{margin:0;font-size:13px;line-height:1.7;color:${muted}}
${r} .rmt-x-card{display:flex;flex-direction:column;gap:12px;background:${surface};border:1px solid ${border};border-radius:18px;padding:16px}
${r} .rmt-x-card h3,${r} .rmt-x-block h3,${r} .rmt-x-section-title{margin:0;font-size:15px;font-weight:600;color:${text}}
${r} .rmt-x-block{display:flex;flex-direction:column;gap:10px}
${r} .rmt-x-card-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
${r} .rmt-x-card-head small{font-size:12px;color:${muted}}
${r} .rmt-x-card hr,${r} .rmt-x-paper hr{border:0;height:1px;background:${border};margin:2px 0;width:100%}
${r} .rmt-x-primary{min-height:46px;border:0;border-radius:14px;background:${ink};color:#fff;font-size:15px;font-weight:600;cursor:pointer;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%}
${r} .rmt-x-primary:disabled{opacity:.6;cursor:default}
${r} .rmt-x-primary.rmt-x-dark{background:${text}}
${r} .rmt-x-secondary{min-height:44px;border:1px solid ${border};border-radius:12px;background:${surface};color:${text};font-size:14px;cursor:pointer;padding:0 14px}
${r} .rmt-x-ring-card{flex-direction:row;align-items:center;gap:18px;flex-wrap:wrap}
${r} .rmt-x-ring{position:relative;width:140px;height:140px;flex-shrink:0}
${r} .rmt-x-ring svg{width:140px;height:140px}
${r} .rmt-x-ring circle{fill:none;stroke-width:12}
${r} .rmt-x-ring-bg{stroke:${border};opacity:.55}
${r} .rmt-x-ring-fg{stroke:${accent};stroke-linecap:round}
${r} .rmt-x-ring>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
${r} .rmt-x-ring b{font-size:32px;font-weight:700;color:${text}}
${r} .rmt-x-ring small{font-size:12px;color:${muted}}
${r} .rmt-x-ring-copy{display:flex;flex-direction:column;gap:6px;min-width:150px;flex:1}
${r} .rmt-x-ring-copy p{margin:0;font-size:14px;line-height:1.7;color:${text}}
${r} .rmt-x-ring-copy b{font-size:20px}
${r} .rmt-x-row{display:flex;flex-direction:column;gap:6px}
${r} .rmt-x-row-head{display:flex;justify-content:space-between;font-size:14px;color:${text}}
${r} .rmt-x-row-head span:last-child{font-size:13px;color:${muted}}
${r} .rmt-x-bar{height:8px;border-radius:999px;background:${border};overflow:hidden}
${r} .rmt-x-bar i{display:block;height:100%;border-radius:999px;background:${accent}}
${r} .rmt-x-counts{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
${r} .rmt-x-count{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:var(--rmt-theme-bg,#f5f4fb)}
${r} .rmt-x-count small{font-size:12px;color:${muted}}
${r} .rmt-x-count b{font-size:17px;color:${text}}
${r} .rmt-x-recent{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
${r} .rmt-x-recent-item{display:flex;flex-direction:column;gap:6px;font-size:12px;color:${text}}
${r} .rmt-x-recent-tile{height:84px;border-radius:12px;background:linear-gradient(160deg,#c9d8e6,#efd6e1);display:flex;align-items:flex-end;padding:6px;box-sizing:border-box}
${r} .rmt-x-recent-tile em{font-style:normal;font-size:11px;color:#fff;background:rgba(52,73,93,.72);border-radius:6px;padding:2px 6px}
${r} .rmt-x-grad{display:flex;flex-direction:column;align-items:center;gap:26px;text-align:center;padding:48px 24px 32px;background:#1f2a44;color:#f6efe6;border-radius:18px;margin:8px auto;max-width:560px;box-sizing:border-box;font-family:'Noto Serif SC','Songti SC',serif}
${r} .rmt-x-grad-title{display:flex;flex-direction:column;align-items:center;gap:10px}
${r} .rmt-x-grad-title small{font-size:12px;letter-spacing:6px;color:#c9b8a6}
${r} .rmt-x-grad-title b{font-size:28px}
${r} .rmt-x-grad-title i{width:36px;height:1px;background:#f0b7a4}
${r} .rmt-x-grad-title span{font-size:17px}
${r} .rmt-x-credit{display:flex;flex-direction:column;gap:6px}
${r} .rmt-x-credit small,${r} .rmt-x-grad-last small{font-size:12px;letter-spacing:3px;color:#c9b8a6}
${r} .rmt-x-credit b{font-size:18px;font-weight:500;line-height:1.6}
${r} .rmt-x-grad-last{display:flex;flex-direction:column;gap:8px;padding:16px 20px;border:1px solid #45557a;border-radius:16px}
${r} .rmt-x-grad-last b{font-size:15px;font-weight:500;line-height:1.8}
${r} .rmt-x-grad-thanks{font-size:14px;letter-spacing:4px;color:#f0b7a4}
${r} .rmt-x-secondary.rmt-x-on-dark{background:transparent;border-color:#6a7aa0;color:#f6efe6;font-family:inherit}
${r} .rmt-x-people{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
${r} .rmt-x-person{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:14px;cursor:pointer;color:${text};background:${surface};border:1px solid ${border};min-height:44px}
${r} .rmt-x-person.active{border:2px solid ${ink}}
${r} .rmt-x-person b{font-size:14px}
${r} .rmt-x-person small{font-size:11px;color:${muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
${r} .rmt-x-avatar{border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
${r} .rmt-x-avatar[data-tone=rose]{background:#f3dbe6;color:#8a3f63}
${r} .rmt-x-avatar[data-tone=teal]{background:#dcecea;color:#2f6b66}
${r} .rmt-x-avatar[data-tone=lilac]{background:#e4e3f3;color:#4b4a7a}
${r} .rmt-x-avatar[data-tone=peach]{background:#f6e2d2;color:#8a5230}
${r} .rmt-x-avatar[data-tone=sky]{background:#dbe7f3;color:#34587a}
${r} .rmt-x-avatar[data-tone=sage]{background:#e0ecd9;color:#44633a}
${r} .rmt-x-paper{display:flex;flex-direction:column;gap:12px;background:#fffaf2;border:1px solid #ecdcc3;border-radius:18px;padding:18px;color:#3a3346}
${r} .rmt-x-paper-head{display:flex;align-items:center;gap:10px}
${r} .rmt-x-paper-head div{display:flex;flex-direction:column;gap:2px}
${r} .rmt-x-paper-head b{font-size:17px}
${r} .rmt-x-paper-head small{font-size:12px;color:#6b5a44}
${r} .rmt-x-paper hr{background:#ecdcc3}
${r} .rmt-x-sec{display:flex;flex-direction:column;gap:6px}
${r} .rmt-x-sec small{font-size:12px;font-weight:600;letter-spacing:1px;color:#a8527a}
${r} .rmt-x-sec p,${r} .rmt-x-letter p{margin:0;font-size:15px;line-height:1.85;white-space:pre-wrap}
${r} .rmt-x-chips{display:flex;gap:6px;flex-wrap:wrap}
${r} .rmt-x-chip{font-size:11px;color:#2f6b66;background:#e2f0ee;border-radius:999px;padding:3px 9px}
${r} .rmt-x-chip.muted{color:#5d5566;background:#ecebf1}
${r} .rmt-x-chip.warm{color:#6b5a44;background:#f1e7d8}
${r} .rmt-x-list-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:${surface};border:1px solid ${border};border-radius:14px;color:${text};cursor:pointer;text-align:left;width:100%}
${r} .rmt-x-list-row span{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
${r} .rmt-x-list-row b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${r} .rmt-x-list-row small{font-size:12px;color:${muted}}
${r} .rmt-x-list-row>i{font-style:normal;color:${muted}}
${r} .rmt-x-ask-wrap{display:flex;flex-direction:column;gap:6px;margin-top:10px}
${r} .rmt-x-ask-wrap small{font-size:12px;color:${muted};text-align:center}
${r} .rmt-x-entry{display:flex;align-items:center;gap:14px;padding:16px;background:#262b40;border:0;border-radius:18px;color:#f3eee6;cursor:pointer;text-align:left;width:100%}
${r} .rmt-x-entry>span:nth-child(2){display:flex;flex-direction:column;gap:3px;flex:1}
${r} .rmt-x-entry b{font-size:17px}
${r} .rmt-x-entry small{font-size:12px;color:#d8d2e4}
${r} .rmt-x-entry em{font-style:normal;color:#f2c38b;font-size:20px}
${r} .rmt-x-entry-grid{width:52px;height:52px;border-radius:14px;background:#3a4058;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:8px;box-sizing:border-box;flex-shrink:0}
${r} .rmt-x-entry-grid i{border-radius:2px;background:#4b4466}
${r} .rmt-x-entry-grid i[data-i="4"]{background:#f2c38b}
${r} .rmt-x-entry-grid i[data-i="7"],${r} .rmt-x-entry-grid i[data-i="8"]{background:#2f3450}
${r} .rmt-x-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}
${r} .rmt-x-switch-row span{display:flex;flex-direction:column;gap:2px}
${r} .rmt-x-switch-row b{font-size:15px}
${r} .rmt-x-switch-row small{font-size:12px;color:${muted}}
${r} .rmt-x-switch{position:relative;width:52px;height:32px;border:0;border-radius:999px;background:#b7c3cf;cursor:pointer;flex-shrink:0;padding:0}
${r} .rmt-x-switch i{position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s}
${r} .rmt-x-switch.on{background:${ink}}
${r} .rmt-x-switch.on i{left:24px}
${r} .rmt-x-field{display:flex;flex-direction:column;gap:10px}
${r} .rmt-x-field>b{font-size:14px}
${r} .rmt-x-segs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
${r} .rmt-x-seg{height:44px;border-radius:12px;font-size:14px;cursor:pointer;color:${text};background:${surface};border:1px solid ${border}}
${r} .rmt-x-seg.active{color:#fff;background:${text};border-color:${text}}
${r} .rmt-x-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;cursor:pointer}
${r} .rmt-x-check input{width:20px;height:20px;accent-color:#a8527a}
${r} .rmt-x-node small{font-size:12px;color:${muted}}
${r} .rmt-x-node p{margin:0;font-size:15px;line-height:1.8}
${r} .rmt-x-node em{font-style:normal;font-size:13px;color:${ink}}
${r} .rmt-x-letter-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
${r} .rmt-x-letter-head small{font-size:12px;color:#6b5a44}
${r} .rmt-x-letter p{font-family:'Noto Serif SC','Songti SC',serif;font-size:16px;line-height:1.9}
${r} .rmt-x-night{display:flex;flex-direction:column;gap:16px;background:#262b40;color:#f3eee6;border-radius:18px;padding:16px;margin:8px auto;max-width:640px;box-sizing:border-box}
${r} .rmt-x-night header{display:flex;flex-direction:column;gap:6px}
${r} .rmt-x-night h2{margin:0;font-size:26px;font-weight:700;color:#f3eee6}
${r} .rmt-x-night p{margin:0;font-size:14px;line-height:1.7;color:#d8d2e4}
${r} .rmt-x-now{align-self:flex-end;display:flex;align-items:center;gap:6px;font-size:12px;color:#d8d2e4}
${r} .rmt-x-now i{width:8px;height:8px;border-radius:50%;background:#f2c38b;animation:rmt-x-breathe 2.4s ease-in-out infinite}
@keyframes rmt-x-breathe{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){${r} .rmt-x-now i{animation:none}}
${r} .rmt-x-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
${r} .rmt-x-tile,${r} .rmt-x-hero{background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 3px)}
${r} .rmt-x-tile{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;gap:6px;height:108px;padding:10px;box-sizing:border-box;border-radius:14px;cursor:pointer;color:#f3eee6;border:1px solid rgba(255,255,255,.08);text-align:left}
${r} .rmt-x-tile b{font-size:13px;font-weight:600;width:100%}
${r} .rmt-x-tile-top{display:flex;justify-content:space-between;align-items:center;width:100%}
${r} .rmt-x-tile-top small{font-size:10px;color:#d8d2e4}
${r} .rmt-x-tile-top i{color:#f2c38b;font-size:12px}
${r} .rmt-x-tile.locked{background-color:#2f3450;border:1px dashed #f2c38b}
${r} .rmt-x-tile.empty{background-color:#3a4058;border:1px dashed #5d6480;cursor:default;color:#b9b4c7;font-size:11px}
${r} [data-tone="0"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="0"]{background-color:#4a5372}
${r} [data-tone="1"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="1"]{background-color:#5a4f6e}
${r} [data-tone="2"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="2"]{background-color:#44607a}
${r} [data-tone="3"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="3"]{background-color:#4b4466}
${r} [data-tone="4"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="4"]{background-color:#3f5a5c}
${r} [data-tone="5"].rmt-x-tile:not(.locked),${r} .rmt-x-hero[data-tone="5"]{background-color:#55506a}
${r} .rmt-x-hint{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:#313752;border-radius:12px;font-size:12px;line-height:1.7;color:#d8d2e4}
${r} .rmt-x-hint i{color:#f2c38b;margin-top:3px}
${r} .rmt-x-hero{height:150px;border-radius:16px;display:flex;align-items:flex-end;padding:12px;box-sizing:border-box}
${r} .rmt-x-hero span{font-size:11px;color:#f3eee6;background:rgba(38,43,64,.7);border-radius:6px;padding:3px 8px}
${r} .rmt-x-unlocked{font-size:12px!important;letter-spacing:2px;color:#f2c38b!important}
${r} .rmt-x-sheet{display:flex;flex-direction:column;gap:14px;background:#fbf6ee;color:#3a3346;border-radius:16px;padding:18px}
${r} .rmt-x-sheet small{font-size:11px;letter-spacing:2px;color:#8a5a3b}
${r} .rmt-x-sheet p{margin:4px 0 0;font-size:15px;line-height:1.85;color:#3a3346;white-space:pre-wrap}
${r} .rmt-x-sheet .rmt-x-voice{font-family:'Noto Serif SC','Songti SC',serif;font-size:16px;color:#6e3553}
${r} .rmt-x-lock{align-items:center;text-align:center}
${r} .rmt-x-lock-icon{font-size:34px;color:#f2c38b}
${r} .rmt-x-dials{display:flex;gap:10px;justify-content:center}
${r} .rmt-x-dials>div{display:flex;flex-direction:column;align-items:center;gap:4px}
${r} .rmt-x-dials button{width:56px;height:44px;border:0;border-radius:10px;background:#313752;color:#f3eee6;cursor:pointer}
${r} .rmt-x-dials b{width:56px;height:64px;border-radius:12px;background:#fbf6ee;color:#3a3346;display:flex;align-items:center;justify-content:center;font-size:30px}
${r} .rmt-x-wrong{color:#f2b3a6!important;font-size:13px!important}
${r} .rmt-x-primary.rmt-x-lamp{background:#f2c38b;color:#262b40}
${r} .rmt-archive-portal.rmt-x-off{opacity:.72}
${r} .rmt-x-night{--rmt-content-ink:#f3eee6}
${r} .rmt-x-night .rmt-x-sheet{--rmt-content-ink:#3a3346}
${r} .rmt-x-night-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
${r} button.rmt-x-back{min-height:44px;padding:0 14px!important;border-radius:999px!important;border:1px solid rgba(243,238,230,.35)!important;background:rgba(243,238,230,.08)!important;color:#f3eee6!important;-webkit-text-fill-color:#f3eee6!important;font-size:14px!important;cursor:pointer}
${r} .rmt-x-night .rmt-x-now{align-self:auto;letter-spacing:1px;color:#f2b3a6!important;-webkit-text-fill-color:#f2b3a6!important}
${r} .rmt-x-now i{background:#e0605a!important}
${r} .rmt-x-cam{font-style:normal;font-size:10px;letter-spacing:1px;color:#f2b3a6!important;-webkit-text-fill-color:#f2b3a6!important;animation:rmt-x-breathe 1.6s ease-in-out infinite}
${r} .rmt-x-tile{position:relative;overflow:hidden}
${r} .rmt-x-tile::after,${r} .rmt-x-peep::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(10,10,20,.55) 100%),repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 3px)}
${r} .rmt-x-peep{position:relative;overflow:hidden;height:190px!important;justify-content:space-between;flex-direction:column;align-items:flex-start!important;gap:6px}
${r} .rmt-x-peep::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(8,8,14,.92) 0 12%,transparent 30% 70%,rgba(8,8,14,.92) 88% 100%)}
${r} .rmt-x-peep>*{position:relative;z-index:1}
${r} .rmt-x-hero span{color:#f3eee6!important;-webkit-text-fill-color:#f3eee6!important}
${r} .rmt-x-recent-tile{position:relative;overflow:hidden}
${r} .rmt-x-recent-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
${r} .rmt-x-recent-tile em{position:relative}
${r} button.rmt-x-toggle{display:inline-flex!important;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 8px!important;border-radius:999px!important;border:2px solid #b7c3cf!important;background:#ffffff!important;color:#586b7c!important;font-size:14px!important;font-weight:600;cursor:pointer;flex-shrink:0}
${r} button.rmt-x-toggle i{width:28px;height:28px;border-radius:50%;background:#b7c3cf!important;display:block}
${r} button.rmt-x-toggle.on{border-color:#a8527a!important;background:#fbf0f5!important;color:#8a3f63!important}
${r} button.rmt-x-toggle.on i{background:#a8527a!important}
${r} .rmt-x-cert-page{display:flex;flex-direction:column;gap:14px;padding:14px 4px 28px;max-width:560px;margin:0 auto;box-sizing:border-box}
${r} .rmt-x-cert{background:#fffaf1!important;border-radius:20px;padding:10px;box-shadow:0 8px 24px rgba(80,60,40,.12);background-image:radial-gradient(circle at 20% 0%,rgba(242,195,139,.18),transparent 45%),radial-gradient(circle at 90% 100%,rgba(206,114,156,.14),transparent 50%)!important}
${r} .rmt-x-cert-frame{border:1.5px solid #d9c3a3;outline:1px solid #eadcc6;outline-offset:-6px;border-radius:14px;padding:26px 18px 20px;display:flex;flex-direction:column;gap:20px}
${r} .rmt-x-cert *{color:#3d3346!important}
${r} .rmt-x-cert-head{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
${r} .rmt-x-cert-head small{font-size:11px;letter-spacing:4px;color:#a0845f!important}
${r} .rmt-x-cert-head h2{margin:0;font-family:"Noto Serif SC","Songti SC",serif;font-size:26px;font-weight:700;color:#3d3346!important}
${r} .rmt-x-cert-names{margin:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;justify-content:center;font-family:"Noto Serif SC","Songti SC",serif}
${r} .rmt-x-cert-names b{font-size:20px;color:#8a3f63!important}
${r} .rmt-x-cert-names span{font-size:14px;color:#8b7a66!important}
${r} .rmt-x-cert-ribbon{width:64px;height:8px;border-radius:999px;background:linear-gradient(90deg,#f2c38b,#e7a9c4)!important}
${r} .rmt-x-cert-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
${r} .rmt-x-cert-stats div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 4px;border-radius:14px;background:#ffffff!important;border:1px solid #efe2cf}
${r} .rmt-x-cert-stats b{font-size:24px;font-weight:700;color:#8a3f63!important;font-family:"Noto Serif SC","Songti SC",serif}
${r} .rmt-x-cert-stats b small{font-size:12px;margin-left:2px;color:#8a3f63!important}
${r} .rmt-x-cert-stats span{font-size:11px;color:#7a6a58!important;text-align:center}
${r} .rmt-x-cert-lines{margin:0;padding:0;list-style:none;display:flex;flex-direction:column}
${r} .rmt-x-cert-lines li{display:flex;flex-direction:column;gap:3px;padding:10px 2px;border-bottom:1px dashed #e6d6bf}
${r} .rmt-x-cert-lines li:last-child{border-bottom:0}
${r} .rmt-x-cert-lines span{font-size:11px;letter-spacing:2px;color:#a0845f!important}
${r} .rmt-x-cert-lines b{font-size:15px;font-weight:600;line-height:1.6;color:#3d3346!important}
${r} .rmt-x-cert-foot{display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:4px}
${r} .rmt-x-cert-foot span{font-family:"Noto Serif SC","Songti SC",serif;font-size:14px;letter-spacing:2px;color:#8a3f63!important}
${r} .rmt-x-cert-foot small{font-size:12px;color:#8b7a66!important}
${r} .rmt-x-grad,${r} .rmt-x-grad *{color:#f6efe6!important}
${r} .rmt-x-grad small{color:#d9c9b6!important}
${r} .rmt-x-grad .rmt-x-grad-thanks{color:#f4bfad!important}
${r} .rmt-x-night,${r} .rmt-x-night h2,${r} .rmt-x-night b,${r} .rmt-x-night span,${r} .rmt-x-night small{color:#f3eee6!important}
${r} .rmt-x-night p{color:#e2ddeb!important}
${r} .rmt-x-night .rmt-x-sheet,${r} .rmt-x-night .rmt-x-sheet p,${r} .rmt-x-night .rmt-x-sheet span{color:#3a3346!important}
${r} .rmt-x-night .rmt-x-sheet small{color:#8a5a3b!important}
${r} .rmt-x-night .rmt-x-sheet .rmt-x-voice{color:#6e3553!important}
${r} .rmt-x-night .rmt-x-sheet .rmt-x-chip{color:#2f6b66!important}
${r} .rmt-x-night .rmt-x-sheet .rmt-x-chip.warm{color:#6b5a44!important}
${r} .rmt-x-night .rmt-x-sheet .rmt-x-chip.muted{color:#5d5566!important}
${r} .rmt-x-night .rmt-x-dials b{color:#3a3346!important}
${r} .rmt-x-night .rmt-x-lamp{color:#262b40!important}
${r} .rmt-x-night .rmt-x-wrong{color:#f2b3a6!important}
${r} .rmt-x-night .rmt-x-unlocked{color:#f2c38b!important}
${r} .rmt-x-grad .rmt-x-secondary.rmt-x-on-dark{color:#f6efe6!important}
${r} .rmt-x-entry b{color:#f3eee6!important}
${r} .rmt-x-entry small{color:#d8d2e4!important}
${r} .rmt-x-entry em{color:#f2c38b!important}
${r} .rmt-archive-portal.rmt-x-off:hover,${r} .rmt-archive-portal.rmt-x-off:focus-within{opacity:.8}
`;
}

export function ensureExtrasStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = extrasCss();
    document.head.appendChild(style);
}
