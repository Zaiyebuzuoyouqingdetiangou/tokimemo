// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';

export function ensureStyles() {
    if (document.getElementById(core_constants.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = core_constants.STYLE_ID;
    style.textContent = `
#${core_constants.OVERLAY_ID}{
  position:fixed;inset:0;z-index:100000;
  background:
    radial-gradient(circle at 16% 12%,rgba(244,196,216,.20),transparent 28%),
    radial-gradient(circle at 84% 16%,rgba(160,207,228,.18),transparent 30%),
    rgba(26,32,43,.78);
  backdrop-filter:none;display:flex;align-items:stretch;justify-content:center;
  padding:16px;box-sizing:border-box
}
#${core_constants.OVERLAY_ID}[hidden]{display:none!important}
dialog#${core_constants.OVERLAY_ID}{margin:0!important;width:100vw!important;width:100dvw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;border:0!important;padding:16px!important}
dialog#${core_constants.OVERLAY_ID}::backdrop{background:transparent}
.rmt-shell{
  --gs-ink:#4d5d73;
  --gs-muted:#7b8798;
  --gs-paper:#fffdf9;
  --gs-paper-blue:#f4fbff;
  --gs-blue:#8ebfd5;
  --gs-blue-deep:#6fa8c1;
  --gs-pink:#e99ab9;
  --gs-pink-deep:#d97ea3;
  --gs-yellow:#e9cf83;
  --gs-mint:#9ecfc4;
  --gs-line:#cbdce6;
  width:min(1180px,100%);height:100%;max-height:calc(100vh - 32px);
  color:var(--gs-ink);
  background:
    radial-gradient(circle at 1px 1px,rgba(126,159,177,.12) 1px,transparent 1.2px) 0 0/16px 16px,
    linear-gradient(180deg,#fafdff 0%,#f8fbfc 44%,#fffaf8 100%);
  border:3px solid rgba(255,255,255,.94);
  outline:1px solid rgba(123,164,184,.38);
  border-radius:22px;overflow:hidden;
  box-shadow:0 28px 90px rgba(13,22,34,.48),0 0 0 8px rgba(255,255,255,.12);
  display:flex;flex-direction:column;position:relative
}
.rmt-shell:before{
  content:"";position:absolute;inset:7px;pointer-events:none;z-index:2;border-radius:15px;
  border:1px solid rgba(120,166,189,.16)
}
.rmt-topbar{
  min-height:54px;display:flex;align-items:center;gap:8px;padding:9px 12px 9px 16px;
  border-bottom:3px solid #d9eaf2;
  background:
    linear-gradient(90deg,rgba(235,158,190,.16),transparent 24%,transparent 74%,rgba(142,191,213,.15)),
    linear-gradient(180deg,#ffffff,#f6fbfe);
  box-shadow:0 2px 8px rgba(69,91,110,.07);
  position:relative;z-index:8
}
.rmt-topbar:before{
  content:"♥";font-size:19px;color:var(--gs-pink);text-shadow:0 1px white;margin-right:1px
}
.rmt-topbar:after{
  content:"";position:absolute;left:0;right:0;bottom:-3px;height:3px;
  background:linear-gradient(90deg,var(--gs-pink) 0 18%,var(--gs-yellow) 18% 34%,var(--gs-blue) 34% 68%,var(--gs-mint) 68% 84%,var(--gs-pink) 84% 100%);
  opacity:.58
}
.rmt-topbar-title{
  font-weight:800;letter-spacing:.055em;min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:#50627b;font-size:18px
}
.rmt-topbar-title:after{
  content:"  MEMORY ARCHIVE";font-size:9px;letter-spacing:.16em;font-weight:700;color:#9aa7b5;margin-left:9px;vertical-align:2px
}
.rmt-topbar button,.rmt-btn{
  border:1px solid #c9dbe5;
  background:linear-gradient(180deg,#fff,#f7fbfd);
  color:#52647a;border-radius:999px;padding:7px 12px;cursor:pointer;font:inherit;font-weight:700;
  box-shadow:0 2px 5px rgba(77,100,118,.08),inset 0 1px rgba(255,255,255,.95);
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease
}
.rmt-topbar button:hover,.rmt-btn:hover{
  transform:translateY(-1px);border-color:#a9c9d8;background:linear-gradient(180deg,#fff,#eef8fc);
  box-shadow:0 4px 10px rgba(77,100,118,.12)
}
.rmt-topbar button:active,.rmt-btn:active{transform:translateY(0)}
.rmt-topbar button:disabled,.rmt-btn:disabled{opacity:.42;cursor:not-allowed;transform:none;box-shadow:none}
.rmt-topbar button[data-rmt-action="back"]{white-space:nowrap}
.rmt-body{
  position:relative;z-index:4;flex:1;min-height:0;overflow:auto;
  background:
    linear-gradient(135deg,rgba(255,255,255,.48),transparent 38%),
    radial-gradient(circle at 92% 90%,rgba(239,167,196,.12),transparent 26%)
}
.rmt-choice{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;padding:18px 22px 24px}
.rmt-memory-gate{
  margin:20px 22px 0;padding:19px 20px 17px;border:1px solid #c7dce7;border-radius:18px;
  background:
    linear-gradient(90deg,rgba(233,154,185,.06),transparent 19%),
    linear-gradient(180deg,#fff,#fffdf9);
  box-shadow:0 8px 22px rgba(67,95,116,.08),inset 0 0 0 4px rgba(238,247,251,.72);
  display:flex;gap:14px;align-items:center;flex-wrap:wrap;position:relative
}
.rmt-memory-gate:before{
  content:"聊天回忆档案";position:absolute;left:18px;top:-11px;padding:3px 11px 4px;
  border:1px solid #c7dce7;border-radius:999px;background:#f7fcff;color:#71879a;
  font-size:10px;font-weight:800;letter-spacing:.08em;box-shadow:0 2px 5px rgba(75,101,120,.08)
}
.rmt-memory-gate:after{
  content:"♥";position:absolute;right:18px;top:-13px;color:var(--gs-pink);font-size:17px;background:#fff;padding:0 4px
}
.rmt-memory-gate strong{font-size:15px}.rmt-memory-gate-text{min-width:220px;flex:1;line-height:1.55}
.rmt-memory-status{font-size:12px;color:#728093;margin-top:5px}
.rmt-memory-status.pending{color:#b47d2c}.rmt-memory-status.ready{color:#548f84}
.rmt-memory-preview{font-size:11px;color:#8a95a3;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rmt-archive-card{align-items:flex-start}
.rmt-archive-kicker{font-size:10px;letter-spacing:.14em;color:#9aa6b2;margin-bottom:5px}
.rmt-archive-title{display:block;font-size:22px!important;line-height:1.34;margin-bottom:8px;color:#53657d;font-weight:850}
.rmt-archive-summary{font-size:12px;line-height:1.75;color:#647286;white-space:pre-wrap;max-width:820px}
.rmt-archive-keywords{display:flex;gap:5px;flex-wrap:wrap;margin:9px 0}
.rmt-archive-keywords span{
  font-size:10px;padding:3px 8px;border:1px solid #d6e4eb;border-radius:999px;color:#718296;
  background:linear-gradient(180deg,#fff,#f6fbfd)
}
.rmt-archive-keywords span:nth-child(3n+1){border-color:#efc3d5;background:#fff7fa}
.rmt-archive-keywords span:nth-child(3n+2){border-color:#bfdbe7;background:#f5fbfe}
.rmt-archive-keywords span:nth-child(3n){border-color:#e8d7a5;background:#fffdf4}
.rmt-archive-meta{font-size:10px;color:#9aa4af;margin-top:6px}.rmt-archive-update{flex:0 0 auto}
.rmt-choice-card{
  --rmt-accent:var(--gs-pink);
  position:relative;overflow:hidden;border:1px solid #cbdde7;border-radius:17px;padding:22px 18px 17px 20px;
  background:linear-gradient(155deg,#fff 0%,#fbfdfe 68%,#f3f9fc 100%);
  color:#53647a;cursor:pointer;min-height:190px;display:flex;flex-direction:column;gap:9px;text-align:left;
  box-shadow:0 8px 20px rgba(71,97,116,.07);transition:.2s ease
}
.rmt-choice-card:nth-child(1){--rmt-accent:#e99ab9}
.rmt-choice-card:nth-child(2){--rmt-accent:#8ebfd5}
.rmt-choice-card:nth-child(3){--rmt-accent:#9ecfc4}
.rmt-choice-card:nth-child(4){--rmt-accent:#e9cf83}
.rmt-choice-card:before{
  content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:var(--rmt-accent)
}
.rmt-choice-card:after{
  content:"♡";position:absolute;right:13px;top:8px;color:color-mix(in srgb,var(--rmt-accent) 74%,white);
  font-size:31px;line-height:1;opacity:.68
}
.rmt-choice-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--rmt-accent) 64%,#cbdde7);box-shadow:0 12px 24px rgba(71,97,116,.12)}
.rmt-choice-card:disabled{opacity:.43;cursor:not-allowed;transform:none!important;box-shadow:none}
.rmt-choice-card b{font-size:17px;color:#4f6179;padding-right:34px}.rmt-choice-card p{color:#6f7d8f;line-height:1.65;margin:0}
.rmt-choice-card small{margin-top:auto;color:#9aa5b0}
.rmt-loading,.rmt-error{min-height:360px;display:grid;place-items:center;text-align:center;padding:28px;line-height:1.7;color:#5e6d80}
.rmt-spinner{
  width:40px;height:40px;border:3px solid rgba(113,155,175,.18);border-top-color:var(--gs-pink);
  border-right-color:var(--gs-blue);border-radius:50%;animation:rmtSpin .8s linear infinite;margin:auto auto 14px
}
@keyframes rmtSpin{to{transform:rotate(360deg)}}
.rmt-inline-status{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:rgba(247,251,253,.94);backdrop-filter:none;font-weight:700;color:#5c6d82}
.rmt-inline-status[hidden]{display:none}
.rmt-inline-error{margin:10px;padding:10px 12px;border:1px solid #e9a7b5;border-radius:12px;background:#fff5f7;color:#8f4d5f;white-space:pre-wrap}

/* 蝴蝶效应：保留 CRT 异常终端感，但改用与「心跳回忆」主 UI 同源的蓝 / 粉 / 柔金色系。 */
.rmt-crt{
  --crt:#bfefff;--crt-strong:#e8fbff;--crt-dim:#74bfd5;--crt-pink:#f2a8c6;--crt-gold:#e7d49a;
  min-height:100%;
  background:
    radial-gradient(circle at 78% 14%,rgba(242,168,198,.09),transparent 27%),
    radial-gradient(circle at 18% 82%,rgba(116,191,213,.10),transparent 31%),
    linear-gradient(180deg,#091525 0%,#07111f 54%,#060d18 100%);
  color:var(--crt);font-family:"Courier New",ui-monospace,monospace;
  text-shadow:0 0 5px rgba(191,239,255,.46);position:relative;overflow:hidden
}
.rmt-crt:before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    repeating-linear-gradient(to bottom,rgba(220,246,255,.035) 0 1px,transparent 1px 4px),
    linear-gradient(90deg,rgba(242,168,198,.018),transparent 34%,rgba(191,239,255,.018) 70%,transparent);
  mix-blend-mode:screen;z-index:5
}
.rmt-crt:after{content:"";position:absolute;inset:-20%;pointer-events:none;background:radial-gradient(ellipse at center,transparent 48%,rgba(1,5,13,.66) 100%);z-index:6}
.rmt-crt-content{position:relative;z-index:7;padding:16px;animation:rmtFlicker 6s infinite}
@keyframes rmtFlicker{0%,97%,100%{opacity:1}98%{opacity:.92}99%{opacity:.985}}
.rmt-terminal-head{
  border:1px solid rgba(191,239,255,.72);padding:9px 11px;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;
  color:var(--crt-strong);background:linear-gradient(90deg,rgba(116,191,213,.09),rgba(242,168,198,.035));
  box-shadow:inset 0 0 18px rgba(116,191,213,.035),0 0 14px rgba(116,191,213,.045)
}
.rmt-terminal-block{position:relative;border:1px solid rgba(130,219,245,.36);background:rgba(4,14,27,.48);padding:12px;margin-bottom:12px;box-shadow:inset 0 0 18px rgba(41,180,226,.035)}
.rmt-terminal-section-title{font-size:10px;letter-spacing:.16em;color:#86d7ee;margin-bottom:9px;font-weight:800}
.rmt-terminal-codeflow{font-size:9px;opacity:.52;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rmt-divergence-map-block{min-height:220px;max-height:46vh;overflow:auto;position:sticky;top:0;z-index:9;backdrop-filter:blur(7px);box-shadow:0 8px 20px rgba(0,0,0,.18),inset 0 0 18px rgba(41,180,226,.035)}
.rmt-tree-root{text-align:center;position:relative;z-index:2}.rmt-tree-trunk{height:22px;width:1px;background:linear-gradient(#76d7ef,#e79ab8);margin:0 auto;box-shadow:0 0 8px #76d7ef}
.rmt-tree-branches{position:relative;display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:9px;padding:13px 0 8px;border-top:1px solid rgba(118,215,239,.55)}
.rmt-tree-branches:before{content:"";position:absolute;left:50%;top:-14px;width:1px;height:14px;background:#76d7ef}
.rmt-tree-ending{display:flex;justify-content:center;margin-top:12px;padding-top:12px;border-top:1px dashed rgba(229,142,181,.38)}
.rmt-tree-root .rmt-node,.rmt-tree-branches .rmt-node,.rmt-tree-ending .rmt-node{margin-left:0;width:100%}.rmt-tree-root .rmt-node:before,.rmt-tree-branches .rmt-node:before,.rmt-tree-ending .rmt-node:before{display:none}.rmt-tree-ending .rmt-node{width:min(520px,88%)}
.rmt-node span{display:inline-block;min-width:24px;margin-right:6px;color:#79d9f2;font-size:9px}.rmt-main-node{opacity:.82;border-style:dashed!important}.rmt-main-node em{font-style:normal;font-size:8px;color:#e7b0c5;margin-left:6px}
.rmt-observation-screen{min-height:340px}.rmt-record-code{padding:6px 8px;border-left:3px solid #72d8f1;color:#bdeeff;font-size:11px;margin-bottom:9px;background:rgba(73,190,226,.06)}
.rmt-intervention-block{border-color:rgba(241,163,195,.55);background:linear-gradient(135deg,rgba(255,244,249,.10),rgba(240,171,200,.06))}.rmt-system-block{border-style:dashed;border-color:rgba(231,212,154,.5)}
.rmt-node-list{display:flex;flex-direction:column;gap:8px;position:relative}
.rmt-node-list:before{content:"";position:absolute;left:11px;top:10px;bottom:10px;border-left:1px dashed var(--crt-dim);opacity:.5}
.rmt-node{
  position:relative;margin-left:24px;text-align:left;border:1px solid rgba(191,239,255,.58);
  background:linear-gradient(180deg,rgba(16,34,55,.88),rgba(9,23,40,.9));color:inherit;border-radius:3px;padding:8px 9px;cursor:pointer;font:inherit;
  box-shadow:inset 0 0 13px rgba(116,191,213,.025);transition:background .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease
}
.rmt-node:hover{border-color:var(--crt-strong);background:linear-gradient(180deg,rgba(23,48,73,.92),rgba(11,30,50,.94));box-shadow:0 0 12px rgba(116,191,213,.11)}
.rmt-node:before{content:"";position:absolute;left:-25px;top:50%;width:24px;border-top:1px dashed var(--crt-dim);opacity:.58}
.rmt-node.active{
  background:linear-gradient(100deg,#c8eff7 0%,#dff8fb 66%,#f2c6d8 135%);color:#102438;border-color:#e8fbff;text-shadow:none;
  box-shadow:0 0 18px rgba(191,239,255,.22),0 0 26px rgba(242,168,198,.07)
}
.rmt-node.true-ending{color:#ffe4ef;border-color:rgba(242,168,198,.72);opacity:.58;filter:saturate(.75);animation:rmtOmega 1.55s steps(2,end) infinite}.rmt-node.true-ending:hover{opacity:.92;filter:saturate(1.05)}
.rmt-node.true-ending.active{color:#16263a;border-color:#f8d1e1;opacity:1;filter:none}
@keyframes rmtOmega{0%,100%{box-shadow:0 0 6px rgba(242,168,198,.10)}50%{filter:brightness(1.25);box-shadow:0 0 18px rgba(242,168,198,.48),0 0 28px rgba(231,212,154,.13)}}
.rmt-observation{display:flex;flex-direction:column;gap:10px}
.rmt-signal{
  min-height:180px;border:2px double rgba(191,239,255,.75);display:grid;place-items:center;text-align:center;
  background:repeating-linear-gradient(45deg,transparent 0 8px,rgba(116,191,213,.055) 8px 10px),rgba(7,18,32,.5);padding:20px;
  box-shadow:inset 0 0 34px rgba(116,191,255,.035),0 0 0 1px rgba(80,209,239,.30),4px 4px 0 rgba(42,123,151,.20),-4px -4px 0 rgba(225,157,189,.07);
  position:relative;overflow:hidden;image-rendering:pixelated
}
.rmt-signal.loading{animation:rmtInterference .11s steps(2,end) infinite}
@keyframes rmtInterference{0%{transform:translateX(-2px);filter:contrast(1.15)}50%{transform:translateX(2px);filter:contrast(1.55) hue-rotate(8deg)}}
.rmt-mono{white-space:pre-wrap;line-height:1.75;border-left:2px solid var(--crt-dim);padding:10px 12px;background:rgba(116,191,213,.035);color:#c8edf7}
.rmt-intervention{
  white-space:pre-wrap;line-height:1.7;color:#ffe3ee;border:1px solid rgba(242,168,198,.82);
  background:linear-gradient(90deg,rgba(242,168,198,.10),rgba(242,168,198,.035));padding:11px 12px;
  text-shadow:0 0 5px rgba(242,168,198,.34);box-shadow:inset 0 0 18px rgba(242,168,198,.025)
}
.rmt-system-note{white-space:pre-wrap;line-height:1.65;border:1px dashed rgba(231,212,154,.72);padding:10px 12px;opacity:.93;color:#d9eef5;background:rgba(231,212,154,.025)}

/* 相簿：白色相纸、柔和粉蓝页签、收集卡片感。 */
.rmt-album{
  min-height:100%;padding:16px;
  background:
    linear-gradient(90deg,rgba(141,190,212,.08) 1px,transparent 1px) 0 0/28px 28px,
    linear-gradient(rgba(141,190,212,.07) 1px,transparent 1px) 0 0/28px 28px,
    linear-gradient(180deg,#f8fcfe,#fffaf9)
}
.rmt-album-head{
  display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 15px;
  border:1px solid #c9dde7;border-radius:16px;margin-bottom:14px;background:rgba(255,255,255,.94);
  box-shadow:0 6px 16px rgba(75,103,123,.07);position:relative
}
.rmt-album-head:before{
  content:"♡";display:grid;place-items:center;width:30px;height:30px;border-radius:50%;
  background:#fff1f6;color:var(--gs-pink);border:1px solid #efc1d3;font-size:17px;font-weight:900
}
.rmt-album-head h2{margin:0;font-size:20px;color:#53647a}.rmt-count{color:#8290a0;font-size:12px}
.rmt-filter{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.rmt-filter button.active{
  color:#fff;background:linear-gradient(180deg,#eaa0bd,#dc86a9);border-color:#d97fa3;
  box-shadow:0 3px 8px rgba(217,126,163,.20)
}
.rmt-album-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:15px}
.rmt-grid-wrap{min-width:0}.rmt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;transition:opacity .2s ease}.rmt-grid.fade{opacity:.2}
.rmt-card{
  position:relative;border:1px solid #d2e1e8;border-radius:8px;background:#fff;padding:7px 7px 10px;
  overflow:hidden;cursor:pointer;transition:.2s ease;min-width:0;
  box-shadow:0 5px 14px rgba(71,94,111,.09)
}
.rmt-card:before{
  content:"";position:absolute;z-index:4;top:-4px;left:50%;width:46px;height:12px;transform:translateX(-50%) rotate(-1.5deg);
  background:rgba(245,218,151,.66);border-left:1px solid rgba(205,177,112,.25);border-right:1px solid rgba(205,177,112,.25);
  box-shadow:0 1px 2px rgba(89,72,32,.08)
}
.rmt-card:nth-child(3n+2):before{background:rgba(190,222,235,.67);transform:translateX(-50%) rotate(1deg)}
.rmt-card:nth-child(3n):before{background:rgba(240,190,211,.60);transform:translateX(-50%) rotate(-.6deg)}
.rmt-card:hover{transform:translateY(-2px) rotate(.15deg);box-shadow:0 9px 18px rgba(71,94,111,.12)}
.rmt-card.active{border-color:#e69ab8;box-shadow:0 0 0 3px rgba(233,154,185,.18),0 9px 18px rgba(71,94,111,.12)}
.rmt-card.active .rmt-thumb{filter:brightness(1.08);transform:scale(1.012)}
.rmt-card.locked{background:#fbfbfb}.rmt-card.locked .rmt-thumb{filter:blur(.75px) saturate(.48);opacity:.68}
.rmt-thumb{
  aspect-ratio:16/10;position:relative;overflow:hidden;border:1px solid #e3ebef;border-radius:5px;
  transition:.2s ease;background:#eef5f7
}
.rmt-card-meta{padding:9px 3px 1px}.rmt-card-title{font-weight:800;color:#53647a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rmt-card-date{font-size:10px;color:#9aa5af;margin:3px 0 5px;letter-spacing:.03em}
.rmt-card-desc{font-size:11px;color:#748294;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rmt-abstract{
  position:absolute;inset:0;background:
  radial-gradient(circle at var(--x1) var(--y1),rgba(255,255,255,.76) 0 6%,transparent 7%),
  linear-gradient(var(--angle),var(--c1),transparent 46%),
  radial-gradient(ellipse at var(--x2) var(--y2),var(--c2) 0 18%,transparent 19%),
  linear-gradient(160deg,rgba(255,255,255,.28),rgba(85,113,132,.08))
}
.rmt-abstract:before,.rmt-abstract:after{content:"";position:absolute;border:2px solid rgba(255,255,255,.52);border-radius:42% 58% 54% 46%}
.rmt-abstract:before{width:28%;height:55%;left:18%;top:24%}.rmt-abstract:after{width:34%;height:38%;right:12%;bottom:14%}
.rmt-cg-real{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:1;background:#eef5f7}
.rmt-cg-real[hidden]{display:none!important}.rmt-cg-real-badge{position:absolute;z-index:3;top:7px;right:7px;padding:3px 7px;border-radius:999px;background:rgba(33,48,62,.72);color:#fff;font-size:8px;font-weight:800;letter-spacing:.08em;backdrop-filter:blur(5px)}
.rmt-cg-card-draw{position:absolute;z-index:6;right:7px;bottom:7px;min-height:28px;padding:5px 8px;border:1px solid rgba(255,255,255,.86);border-radius:999px;background:rgba(43,58,72,.78);color:#fff;font:700 9px/1.1 inherit;box-shadow:0 3px 9px rgba(37,52,65,.18);backdrop-filter:blur(6px);cursor:pointer}
.rmt-cg-card-draw:hover{background:rgba(35,50,64,.9)}.rmt-cg-card-draw:disabled{opacity:.68;cursor:wait}
.rmt-cg-provider-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 9px;padding:8px 10px;border:1px solid #d7e5eb;border-radius:11px;background:rgba(247,251,253,.92);font-size:10px;color:#718194}
.rmt-cg-provider-bar b{color:#52667a}.rmt-cg-provider-dot{width:7px;height:7px;border-radius:50%;background:#b6c0c8;box-shadow:0 0 0 3px rgba(182,192,200,.14)}.rmt-cg-provider-bar.ready .rmt-cg-provider-dot{background:#6eb99b;box-shadow:0 0 0 3px rgba(110,185,155,.15)}
.rmt-btn.rmt-cg-primary{border-color:#d98bab;background:linear-gradient(180deg,#f7b5cf,#e99ab9);color:#fff;font-weight:800;box-shadow:0 4px 10px rgba(214,126,162,.18)}
.rmt-cg-caption,.rmt-memory-caption{z-index:2}.rmt-cg-draw-note{font-size:10px;color:#8795a4;line-height:1.55;margin-top:8px}.rmt-btn.rmt-cg-drawing{opacity:.72;cursor:wait}
.rmt-info{
  border:1px solid #cbdde7;border-radius:16px;padding:16px;min-height:300px;animation:rmtFade .2s ease;
  background:linear-gradient(180deg,#fff,#fffcf8);box-shadow:0 7px 18px rgba(71,94,111,.07);position:sticky;top:0;align-self:start
}
.rmt-info:before{content:"条目资料";display:inline-block;font-size:10px;color:#8c9aaa;letter-spacing:.08em;margin-bottom:9px}
@keyframes rmtFade{from{opacity:.2;transform:translateY(3px)}to{opacity:1;transform:none}}
.rmt-info h3{margin:0 0 5px;color:#52637a;font-size:19px}.rmt-info-date{color:#9aa5af;font-size:11px;margin-bottom:11px}
.rmt-info-desc{white-space:pre-wrap;line-height:1.72;min-height:100px;color:#68778a}
.rmt-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
.rmt-hint{margin-top:11px;padding:11px 12px;border-radius:12px;border:1px solid #efb2ca;background:#fff4f8;color:#87546a;white-space:pre-wrap;animation:rmtHint .5s ease}
.rmt-hint[hidden]{display:none}@keyframes rmtHint{0%{opacity:0;transform:scale(.98)}40%{filter:brightness(1.08)}100%{opacity:1;transform:none}}
.rmt-pager{display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 0;color:#7c8998;font-size:12px}

/* 共同回忆：事件 CG + 恋爱游戏式对白框。 */
.rmt-memory-scene{
  min-height:calc(100vh - 92px);display:grid;grid-template-rows:minmax(260px,1fr) auto;
  background:
    radial-gradient(circle at 20% 10%,rgba(239,162,192,.20),transparent 28%),
    linear-gradient(180deg,#eaf5fa,#f9f7f4)
}
.rmt-memory-cg{
  position:relative;overflow:hidden;margin:18px 22px 10px;border:9px solid #fff;border-radius:8px;
  box-shadow:0 12px 32px rgba(55,76,93,.20),0 0 0 1px #cbdde7
}
.rmt-memory-cg .rmt-abstract{inset:0}
.rmt-memory-caption{
  position:absolute;left:14px;right:14px;bottom:14px;padding:10px 12px;
  background:rgba(255,255,255,.88);backdrop-filter:blur(7px);border:1px solid rgba(176,201,213,.82);
  color:#4e6076;border-radius:11px;box-shadow:0 3px 12px rgba(63,84,100,.10)
}
.rmt-dialogue{
  position:relative;margin:0 18px 18px;padding:20px 16px 14px;background:rgba(255,255,255,.97);
  border:1px solid #c8dce6;border-top:4px solid #e99ab9;border-radius:14px;
  box-shadow:0 10px 24px rgba(63,84,100,.13)
}
.rmt-dialogue:before{
  content:"共同回忆";position:absolute;left:15px;top:-13px;background:#fff;padding:3px 10px;border-radius:999px;
  border:1px solid #efbfd2;color:#c36d90;font-size:10px;font-weight:800;letter-spacing:.08em
}
.rmt-dialogue-now{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px;color:#91a0ad;font-size:9px;letter-spacing:.08em}.rmt-dialogue-now b{color:#bd7192;font-size:10px;letter-spacing:0}.rmt-dialogue-speaker{font-size:10px;font-weight:850;color:#65778b;margin-bottom:5px}.rmt-dialogue-text{min-height:76px;white-space:pre-wrap;line-height:1.8;color:#586a7f}
.rmt-dialogue-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}

/* ADV：左侧事件索引像回想清单，右侧保留大 CG 与阅读器。 */
.rmt-adv{
  display:grid;grid-template-columns:minmax(225px,.48fr) minmax(0,1.52fr);min-height:calc(100vh - 92px);
  background:linear-gradient(180deg,#f6fbfd,#fffaf9)
}
.rmt-event-list{
  border-right:1px solid #c9dce6;overflow:auto;padding:14px 11px;
  background:
    linear-gradient(90deg,rgba(142,191,213,.07),transparent 38%),
    rgba(255,255,255,.70)
}
.rmt-event-list:before{
  content:"事件回想";display:block;margin:1px 7px 10px;padding-bottom:8px;border-bottom:2px solid #d9eaf2;
  color:#76889a;font-size:11px;font-weight:800;letter-spacing:.08em
}
.rmt-event{
  display:block;width:100%;text-align:left;border:1px solid transparent;border-radius:11px;
  background:rgba(255,255,255,.72);color:#5b6b7e;padding:10px 11px;cursor:pointer;margin-bottom:7px;
  box-shadow:0 2px 6px rgba(70,94,112,.04);transition:.18s ease
}
.rmt-event:hover{background:#fff;border-color:#d3e2e9;transform:translateX(2px)}
.rmt-event.active{
  background:linear-gradient(90deg,#fff5f9,#fff);border-color:#e8b3c8;
  box-shadow:inset 4px 0 #e99ab9,0 4px 10px rgba(88,107,122,.07);transform:translateX(3px)
}
.rmt-event{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:8px;align-items:center}
.rmt-event-index{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:#eef6fa;color:#73889a;font-size:9px;font-weight:900}.rmt-event-copy{min-width:0}.rmt-event-copy b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-event small{display:block;color:#9ca6af;margin-top:3px}.rmt-event-state{font-size:8px;font-style:normal;color:#a56c82;background:#fff3f7;border-radius:999px;padding:3px 6px}.rmt-adv-mobile-picker{display:none}.rmt-adv-summary{white-space:pre-wrap;line-height:1.8;opacity:.82}.rmt-adv-bulkbar>div{display:grid;gap:2px}.rmt-adv-bulkbar b{font-size:11px}.rmt-adv-bulkbar span{font-size:9px}
.rmt-event-detail{min-width:0;overflow:auto;padding:16px 18px}
.rmt-big-cg{
  position:relative;aspect-ratio:16/9;max-height:48vh;overflow:hidden;border-radius:8px;
  border:8px solid #fff;outline:1px solid #cbdde7;margin:2px 2px 14px;
  box-shadow:0 10px 24px rgba(64,86,103,.14)
}
.rmt-big-cg .rmt-abstract{inset:0}
.rmt-cg-caption{
  position:absolute;left:12px;right:12px;bottom:12px;padding:10px 11px;
  background:rgba(255,255,255,.90);backdrop-filter:blur(6px);color:#506279;border:1px solid rgba(189,210,220,.88);border-radius:9px
}
.rmt-mode-actions{display:flex;gap:8px;margin:11px 0;flex-wrap:wrap}
.rmt-adv-reader{
  border:1px solid #cbdde7;border-radius:16px;padding:18px;min-height:260px;
  background:linear-gradient(180deg,#fff,#fffdf9);box-shadow:0 7px 18px rgba(66,88,105,.07)
}
.rmt-adv-reader:before{content:"心情补完";display:block;color:#c37594;font-size:10px;font-weight:800;letter-spacing:.1em;margin-bottom:7px}
.rmt-adv-para{white-space:pre-wrap;line-height:1.95;min-height:160px;color:#5b6b7f}
.rmt-progress{color:#9aa5af;font-size:11px;margin-bottom:8px}
.rmt-reader-actions{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:13px}

/* 他的房间：多空间“生活观测”页。空间类型由角色生活方式决定，不复刻商业游戏资产。 */
.rmt-room-view{min-height:100%;padding:18px 20px 22px;box-sizing:border-box;background:linear-gradient(180deg,#fbfdff,#fffaf8)}
.rmt-room-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 2px 10px;flex-wrap:wrap}
.rmt-room-heading h2{margin:0;color:#51647b;font-size:22px;letter-spacing:.04em}.rmt-room-heading small{color:#9aa6b2}
.rmt-room-map{display:flex;gap:8px;overflow:auto;padding:6px 2px 12px;scrollbar-width:thin}
.rmt-room-space{position:relative;flex:0 0 auto;min-width:108px;max-width:180px;text-align:left;border:1px solid #c9dce6;border-radius:14px;padding:9px 11px;background:rgba(255,255,255,.9);color:#60758a;font:inherit;cursor:pointer;transition:.18s ease;box-shadow:0 4px 12px rgba(66,88,105,.06)}
.rmt-room-space b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-room-space small{display:block;margin-top:3px;font-size:9px;color:#9aa6b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rmt-room-space:hover,.rmt-room-space.active{border-color:#e4a7bf;background:#fff7fa;transform:translateY(-1px);color:#9b5d79}.rmt-room-space.present{box-shadow:0 0 0 3px rgba(142,191,213,.13),0 4px 12px rgba(66,88,105,.06)}
.rmt-room-presence-dot{position:absolute;right:7px;top:6px;font-size:10px;color:#df85aa}.rmt-room-location{display:flex;align-items:center;gap:8px;margin:-2px 2px 12px;color:#7d8b99;font-size:11px;flex-wrap:wrap}.rmt-room-location b{color:#b46f8b}.rmt-room-find{border:0;background:#eef7fb;color:#68859a;border-radius:999px;padding:4px 8px;font:inherit;font-size:10px;cursor:pointer}
.rmt-room-flow{display:grid;gap:13px;max-width:1120px;margin:0 auto}.rmt-room-location>div:first-child{display:grid;gap:2px;min-width:0}.rmt-room-location>div:first-child small{font-size:9px;font-weight:500;color:#98a4af}.rmt-room-location-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.rmt-room-space-note-card,.rmt-room-private-life-card,.rmt-room-private-access-card{width:100%;box-sizing:border-box}.rmt-room-heading-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.rmt-room-stage{border:1px solid #c7dce7;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(66,88,105,.10);overflow:hidden}
.rmt-room-stage-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 13px;border-bottom:1px solid #d9e7ee;background:linear-gradient(90deg,#fff7fa,#f6fbfe)}
.rmt-room-stage-head b{color:#62778d}.rmt-room-clock{font-size:11px;color:#8d9aa8;white-space:nowrap}
.rmt-room-scene{position:relative;min-height:470px;overflow:hidden;background:linear-gradient(180deg,#f6fbfe 0 61%,#e7ddd2 61% 64%,#d8c5b4 64% 100%);transition:box-shadow .6s ease,filter .6s ease}.rmt-room-scene[data-rmt-room-daypart="morning"]{box-shadow:inset 0 0 0 9999px rgba(255,238,190,.035)}.rmt-room-scene[data-rmt-room-daypart="daytime"]{box-shadow:inset 0 0 0 9999px rgba(225,246,255,.018)}.rmt-room-scene[data-rmt-room-daypart="evening"]{box-shadow:inset 0 0 0 9999px rgba(245,184,170,.075)}.rmt-room-scene[data-rmt-room-daypart="night"]{box-shadow:inset 0 0 0 9999px rgba(24,43,76,.18);filter:saturate(.88) brightness(.92)}
.rmt-room-scene:before{content:"";position:absolute;left:6%;right:6%;top:8%;height:49%;border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(237,246,250,.46));border:1px solid rgba(151,183,199,.38);box-shadow:inset 0 -18px rgba(143,181,198,.05)}
.rmt-room-scene:after{content:"";position:absolute;left:7%;right:7%;bottom:8%;height:20%;border-radius:50%;background:radial-gradient(ellipse,rgba(233,154,185,.15),rgba(142,191,213,.08) 48%,transparent 70%)}
.rmt-room-window{position:absolute;right:9%;top:12%;width:24%;height:28%;border:6px solid rgba(255,255,255,.88);outline:1px solid #bcd4df;background:linear-gradient(180deg,#dff2fb,#fff5f9);box-shadow:0 8px 18px rgba(67,91,109,.10)}
.rmt-room-window:before,.rmt-room-window:after{content:"";position:absolute;background:rgba(153,189,205,.55)}.rmt-room-window:before{left:50%;top:0;bottom:0;width:1px}.rmt-room-window:after{top:50%;left:0;right:0;height:1px}
.rmt-room-furniture{position:absolute;left:9%;bottom:15%;width:38%;height:19%;border-radius:12px 12px 6px 6px;background:linear-gradient(180deg,#f3e8df,#dcc7b7);box-shadow:0 8px 0 #c6ad9a,0 14px 22px rgba(68,64,62,.13)}
.rmt-room-furniture:after{content:"";position:absolute;right:-67%;bottom:-1px;width:46%;height:58%;border-radius:7px;background:linear-gradient(180deg,#dceaf0,#c9dce4);box-shadow:0 6px 0 #adc4cf}
.rmt-room-scene[data-rmt-lighting="bright"]{filter:brightness(1.04) saturate(1.01)}.rmt-room-scene[data-rmt-lighting="warm"]{box-shadow:inset 0 0 0 9999px rgba(255,190,133,.10)}.rmt-room-scene[data-rmt-lighting="dim"]{filter:brightness(.82) saturate(.90)}.rmt-room-scene[data-rmt-lighting="dark"]{filter:brightness(.66) saturate(.82);box-shadow:inset 0 0 0 9999px rgba(16,31,58,.20)}
.rmt-room-scene[data-rmt-window="curtained"] .rmt-room-window{background:linear-gradient(90deg,#d7c7d5 0 46%,#bda9ba 47% 53%,#d7c7d5 54%);filter:brightness(.82)}.rmt-room-scene[data-rmt-window="open"] .rmt-room-window{transform:perspective(200px) rotateY(-7deg);box-shadow:8px 7px 18px rgba(67,91,109,.12)}
.rmt-room-scene[data-rmt-order="messy"] .rmt-room-furniture{transform:rotate(-.8deg)}.rmt-room-scene[data-rmt-order="messy"] .rmt-room-furniture:after{transform:rotate(2deg)}.rmt-room-scene[data-rmt-order="tidy"] .rmt-room-furniture{filter:saturate(.92) brightness(1.03)}
.rmt-room-furniture:before{position:absolute;z-index:3;left:21%;top:-36px;font-size:23px;line-height:1;filter:drop-shadow(0 3px 2px rgba(64,70,78,.12))}.rmt-room-scene[data-rmt-surface="drink"] .rmt-room-furniture:before{content:"☕"}.rmt-room-scene[data-rmt-surface="meal"] .rmt-room-furniture:before{content:"◒  ◇";font-size:18px;color:#b58b72}.rmt-room-scene[data-rmt-surface="work"] .rmt-room-furniture:before{content:"▱  ✎";font-size:20px;color:#788c9d}.rmt-room-scene[data-rmt-surface="clear"] .rmt-room-furniture:before{content:""}
.rmt-room-live-prop{position:absolute;z-index:6;left:var(--rtx);top:var(--rty);transform:translate(-50%,-50%) rotate(var(--rtr));max-width:120px;padding:4px 7px;border:1px solid rgba(195,170,178,.58);border-radius:5px;background:rgba(255,250,246,.88);color:#806f76;font-size:9px;font-weight:700;box-shadow:0 2px 8px rgba(69,65,66,.10);pointer-events:none}
.rmt-room-scene-bedroom .rmt-room-furniture{width:43%;height:16%;border-radius:14px 14px 5px 5px;background:linear-gradient(180deg,#f4e8ec,#dccbd1);box-shadow:0 8px 0 #c5b3b8}.rmt-room-scene-bedroom .rmt-room-furniture:after{width:32%;height:72%;right:-46%;background:#d9e7ed;box-shadow:0 6px 0 #b8ccd5}
.rmt-room-scene-lounge{background:linear-gradient(180deg,#f2f8fb 0 61%,#d9d1c9 61% 64%,#c8b9ab 64% 100%)}.rmt-room-scene-lounge .rmt-room-furniture{width:45%;height:18%;border-radius:16px;background:#d8cfd5;box-shadow:0 8px 0 #b9adb4}.rmt-room-scene-lounge .rmt-room-furniture:after{right:-52%;width:36%;height:38%;background:#c8dce6;box-shadow:0 5px 0 #a8c1cd}
.rmt-room-scene-kitchen{background:linear-gradient(180deg,#f6faf9 0 61%,#d7dedc 61% 64%,#bbc6c2 64% 100%)}.rmt-room-scene-kitchen:before{background:repeating-linear-gradient(90deg,#fbfdfc 0 38px,#e3ece8 39px 40px);border-color:#c6d7d0}.rmt-room-scene-kitchen .rmt-room-furniture{left:7%;width:58%;height:15%;background:#e4ece9;box-shadow:0 8px 0 #b7c8c2}.rmt-room-scene-kitchen .rmt-room-furniture:after{right:-44%;width:27%;height:110%;background:#d3dfdc;box-shadow:0 6px 0 #aebfba}
.rmt-room-scene-balcony{background:linear-gradient(180deg,#dff2fb 0 64%,#bac8cc 64% 68%,#9caaa9 68% 100%)}.rmt-room-scene-balcony:before{left:4%;right:4%;height:54%;background:linear-gradient(180deg,rgba(218,240,250,.65),rgba(255,242,247,.34));border-color:#bfd7e1}.rmt-room-scene-balcony .rmt-room-window{display:none}.rmt-room-scene-balcony .rmt-room-furniture{width:28%;height:9%;background:#b7c4bd;box-shadow:0 5px 0 #909e98}.rmt-room-scene-balcony .rmt-room-furniture:after{right:-115%;width:55%;height:210%;border-radius:50% 50% 16% 16%;background:#98b49e;box-shadow:none}
.rmt-room-scene-tent{background:linear-gradient(180deg,#efe4d1 0 61%,#b99b78 61% 100%)}
.rmt-room-scene-tent:before{left:9%;right:9%;top:7%;height:54%;clip-path:polygon(50% 0,100% 100%,0 100%);border:0;border-radius:0;background:linear-gradient(135deg,#f7eedf,#d9c4a4)}
.rmt-room-scene-tent .rmt-room-window{display:none}.rmt-room-scene-tent .rmt-room-furniture{width:34%;height:13%;background:#b38f6d;box-shadow:0 7px 0 #8f6f53}
.rmt-room-scene-cabin{background:linear-gradient(180deg,#dceaf0 0 61%,#8ca2ad 61% 64%,#657984 64% 100%)}
.rmt-room-scene-cabin .rmt-room-window{border-radius:50%;width:19%;height:25%;background:radial-gradient(circle,#bfe7f5 0 45%,#6a8796 48% 57%,#dae7ed 59%);border:4px solid #dbe8ee}
.rmt-room-scene-cabin .rmt-room-furniture{background:#718893;box-shadow:0 8px 0 #546a75}.rmt-room-scene-cabin .rmt-room-furniture:after{background:#879da7;box-shadow:0 6px 0 #657b85}
.rmt-room-scene-workshop{background:linear-gradient(180deg,#edf1f2 0 61%,#a8afb2 61% 64%,#858c90 64% 100%)}
.rmt-room-scene-workshop:before{background:repeating-linear-gradient(90deg,#f8fbfc 0 31px,#e4eaed 32px 33px);border-color:#b7c1c6}.rmt-room-scene-workshop .rmt-room-furniture{background:#aeb9be;box-shadow:0 8px 0 #8e9ba1}.rmt-room-scene-workshop .rmt-room-furniture:after{background:#c6d0d4;box-shadow:0 6px 0 #9daab0}
.rmt-room-scene-traditional{background:linear-gradient(180deg,#f6f1e7 0 61%,#c9bc9d 61% 64%,#b0a27f 64% 100%)}
.rmt-room-scene-traditional:before{background:repeating-linear-gradient(90deg,#fbf8ef 0 54px,#c9b992 55px 57px);border-color:#d0c19e}.rmt-room-scene-traditional .rmt-room-window{background:repeating-linear-gradient(90deg,#fffdf5 0 24px,#d6c8aa 25px 26px);border-color:#d0c19e}.rmt-room-scene-traditional .rmt-room-furniture{height:10%;background:#9e7f5e;box-shadow:0 6px 0 #7f6449}
.rmt-room-scene-office{background:linear-gradient(180deg,#eef4f7 0 61%,#c6d1d6 61% 64%,#aebcc3 64% 100%)}
.rmt-room-scene-office .rmt-room-furniture{width:46%;height:14%;background:#b8c7ce;box-shadow:0 8px 0 #8fa3ad}.rmt-room-scene-office .rmt-room-furniture:after{background:#d5e0e5;box-shadow:0 6px 0 #afc0c8}
/* r21：房间类型拥有不同的代码场景骨架；模型不能提供 CSS/坐标。 */
.rmt-room-scene-studio{background:linear-gradient(180deg,#eef0f6 0 61%,#b4aeb8 61% 64%,#77717c 64% 100%)}
.rmt-room-scene-studio:before{left:5%;right:5%;top:7%;height:51%;background:repeating-linear-gradient(90deg,#d8d4df 0 34px,#aaa4b2 35px 39px,#eeeaf2 40px 72px);border-color:#aaa5b2;box-shadow:inset 0 -38px rgba(78,72,88,.08)}
.rmt-room-scene-studio .rmt-room-window{left:9%;right:auto;top:15%;width:15%;height:20%;border-radius:4px;background:linear-gradient(180deg,#b8d5e3,#e7d9e4);filter:saturate(.7)}
.rmt-room-scene-studio .rmt-room-furniture{left:28%;bottom:16%;width:48%;height:13%;border-radius:5px;background:linear-gradient(180deg,#677382,#505864);box-shadow:0 8px 0 #363d47,0 16px 24px rgba(30,32,38,.22)}
.rmt-room-scene-studio .rmt-room-furniture:after{right:-28%;bottom:-4px;width:22%;height:150%;border-radius:8px;background:repeating-linear-gradient(180deg,#2e333b 0 12px,#778999 13px 15px);box-shadow:0 6px 0 #20252b}
.rmt-room-scene-studio .rmt-room-furniture:before{left:18%;top:-30px;content:"◉  ▥  ◉";font-size:18px;color:#d7e5ee;letter-spacing:.28em}
.rmt-room-scene-study{background:linear-gradient(180deg,#f4f0e8 0 61%,#b79f85 61% 64%,#8f755e 64% 100%)}
.rmt-room-scene-study:before{left:5%;right:auto;top:7%;width:31%;height:52%;border-radius:4px;background:repeating-linear-gradient(180deg,#6f5745 0 8px,#d5c09f 9px 26px,#7e624c 27px 32px);border-color:#745d4a;box-shadow:none}
.rmt-room-scene-study .rmt-room-window{right:8%;top:11%;width:21%;height:25%}
.rmt-room-scene-study .rmt-room-furniture{left:40%;bottom:16%;width:39%;height:12%;border-radius:3px;background:#987a60;box-shadow:0 8px 0 #725841}
.rmt-room-scene-study .rmt-room-furniture:after{right:-31%;bottom:-1px;width:20%;height:118%;background:#876c56;box-shadow:0 5px 0 #65503f}
.rmt-room-scene-lab{background:linear-gradient(180deg,#edf7f7 0 61%,#bccdce 61% 64%,#8fa4a6 64% 100%)}
.rmt-room-scene-lab:before{left:4%;right:4%;top:8%;height:48%;border-radius:5px;background:repeating-linear-gradient(90deg,#f8ffff 0 55px,#c7dedf 56px 58px);border-color:#abc7c8;box-shadow:inset 0 -28px rgba(55,123,127,.07)}
.rmt-room-scene-lab .rmt-room-window{right:6%;top:13%;width:15%;height:22%;background:linear-gradient(180deg,#c9f0f0,#efffff);border-color:#a9cfd0}
.rmt-room-scene-lab .rmt-room-furniture{left:8%;bottom:15%;width:64%;height:13%;border-radius:4px;background:#d8e6e6;box-shadow:0 8px 0 #a6babc}
.rmt-room-scene-lab .rmt-room-furniture:after{right:-31%;bottom:-1px;width:22%;height:145%;border-radius:4px;background:repeating-linear-gradient(180deg,#bed2d3 0 18px,#8ba7a9 19px 21px);box-shadow:0 6px 0 #779496}
.rmt-room-scene-bath{background:linear-gradient(180deg,#eef9fb 0 61%,#d7ecef 61% 64%,#b9d4d9 64% 100%)}
.rmt-room-scene-bath:before{left:4%;right:4%;top:7%;height:52%;border-radius:6px;background:repeating-linear-gradient(0deg,#f9ffff 0 38px,#d9ecef 39px 40px),repeating-linear-gradient(90deg,transparent 0 49px,#d9ecef 50px 51px);border-color:#c5dfe3}
.rmt-room-scene-bath .rmt-room-window{right:9%;top:11%;width:18%;height:19%;background:#e9fbff}
.rmt-room-scene-bath .rmt-room-furniture{left:12%;bottom:13%;width:46%;height:18%;border-radius:8px 8px 28px 28px;background:#f5fbfc;box-shadow:0 7px 0 #a9cbd1}
.rmt-room-scene-bath .rmt-room-furniture:after{right:-63%;bottom:28%;width:29%;height:125%;border-radius:10px;background:#d8e9ec;box-shadow:0 5px 0 #a7c1c6}
.rmt-room-scene-dining{background:linear-gradient(180deg,#f9f4ed 0 61%,#d6c1a9 61% 64%,#b79a7d 64% 100%)}
.rmt-room-scene-dining:before{left:7%;right:7%;top:9%;height:46%;background:linear-gradient(180deg,#fffaf4,#f3e7d8);border-color:#ddc9b3}
.rmt-room-scene-dining .rmt-room-furniture{left:27%;bottom:18%;width:46%;height:11%;border-radius:50% / 24%;background:#b88d6a;box-shadow:0 8px 0 #8b684e}
.rmt-room-scene-dining .rmt-room-furniture:after{right:-25%;bottom:-30%;width:18%;height:115%;background:#a98264;box-shadow:0 5px 0 #7d604b}
.rmt-room-scene-dining .rmt-room-furniture:before{left:35%;top:-35px;content:"◒  ◇";font-size:18px;color:#b58b72}
/* 同类空间仍保留稳定的三种构图，避免每间卧室/书房都只换标题。 */
.rmt-room-scene[data-rmt-layout="2"] .rmt-room-window{right:auto;left:9%}
.rmt-room-scene[data-rmt-layout="2"] .rmt-room-furniture{left:auto;right:9%;transform:scaleX(.96)}
.rmt-room-scene[data-rmt-layout="3"] .rmt-room-window{right:38%;top:10%;width:20%}
.rmt-room-scene[data-rmt-layout="3"] .rmt-room-furniture{left:17%;width:49%}
.rmt-room-scene-studio[data-rmt-layout="2"] .rmt-room-window{left:auto;right:8%}.rmt-room-scene-studio[data-rmt-layout="2"] .rmt-room-furniture{right:auto;left:12%;width:52%}
.rmt-room-scene-study[data-rmt-layout="2"]:before{left:auto;right:5%}.rmt-room-scene-study[data-rmt-layout="2"] .rmt-room-furniture{left:11%}
.rmt-room-scene-lab[data-rmt-layout="3"] .rmt-room-furniture{left:18%;width:66%}
.rmt-room-decor,.rmt-room-decor span{position:absolute;inset:0;pointer-events:none}.rmt-room-decor{z-index:2}.rmt-room-decor span:before,.rmt-room-decor span:after{content:"";position:absolute;display:block;box-sizing:border-box}
/* Each room class owns a different fixed prop silhouette. These are code enums, never model CSS. */
.rmt-room-scene-bedroom .rmt-room-prop-a:before{right:8%;bottom:14%;width:18%;height:42%;border-radius:5px;background:linear-gradient(90deg,#d8c5bd,#bca59c);box-shadow:inset -7px 0 rgba(255,255,255,.16),0 7px 0 #a88f85}.rmt-room-scene-bedroom .rmt-room-prop-b:before{left:10%;bottom:12%;width:18%;height:6%;border-radius:50%;background:#cbbbc2}.rmt-room-scene-bedroom .rmt-room-prop-c:before{left:39%;bottom:34%;width:11%;height:8%;border-radius:6px;background:#e7d7dc;box-shadow:0 4px 0 #cdbbc1}
.rmt-room-scene-lounge .rmt-room-prop-a:before{right:8%;bottom:24%;width:24%;height:23%;border:7px solid #8396a0;border-radius:5px;background:#c9e2ec;box-shadow:0 7px 0 #6f818a}.rmt-room-scene-lounge .rmt-room-prop-b:before{left:39%;bottom:12%;width:25%;height:7%;border-radius:50%;background:#aa8f7d;box-shadow:0 5px 0 #8f7462}.rmt-room-scene-lounge .rmt-room-prop-c:before{right:4%;bottom:12%;width:9%;height:15%;border-radius:50% 50% 30% 30%;background:#9bb59e;box-shadow:0 6px 0 #7f9a84}
.rmt-room-scene-kitchen .rmt-room-prop-a:before{right:7%;bottom:13%;width:18%;height:44%;border-radius:5px;background:#d6e0df;box-shadow:inset 0 -18px #c4d1cf,0 7px 0 #9fb2ae}.rmt-room-scene-kitchen .rmt-room-prop-b:before{left:24%;bottom:35%;width:20%;height:16%;border-radius:50% 50% 4px 4px;background:#aebfba}.rmt-room-scene-kitchen .rmt-room-prop-c:before{left:44%;bottom:11%;width:32%;height:8%;border-radius:5px;background:#d5c1a9;box-shadow:0 6px 0 #b49a7f}
.rmt-room-scene-studio .rmt-room-prop-a:before{left:8%;bottom:12%;width:14%;height:31%;border-radius:6px;background:repeating-linear-gradient(180deg,#252b33 0 17px,#718797 18px 20px);box-shadow:0 7px 0 #1c2127}.rmt-room-scene-studio .rmt-room-prop-b:before{right:9%;bottom:12%;width:15%;height:32%;border-radius:6px;background:repeating-linear-gradient(180deg,#252b33 0 17px,#718797 18px 20px);box-shadow:0 7px 0 #1c2127}.rmt-room-scene-studio .rmt-room-prop-c:before{left:48%;bottom:29%;width:2px;height:30%;background:#59636e;box-shadow:10px -8px 0 2px #7e8995}
.rmt-room-scene-study .rmt-room-prop-a:before{right:8%;bottom:12%;width:20%;height:43%;background:repeating-linear-gradient(180deg,#715744 0 7px,#cfb995 8px 23px,#7b6049 24px 29px);border-radius:3px}.rmt-room-scene-study .rmt-room-prop-b:before{left:48%;bottom:29%;width:8%;height:8%;border-radius:50%;background:#e9cf87;box-shadow:0 6px 0 -2px #95785d}.rmt-room-scene-study .rmt-room-prop-c:before{left:32%;bottom:12%;width:18%;height:5%;background:#c7b093;border-radius:2px}
.rmt-room-scene-lab .rmt-room-prop-a:before{left:10%;bottom:30%;width:11%;height:17%;border:2px solid #6da3a5;border-radius:4px;background:linear-gradient(180deg,#d9ffff,#99d5d5)}.rmt-room-scene-lab .rmt-room-prop-b:before{left:25%;bottom:29%;width:8%;height:13%;border:2px solid #7e9ea0;border-radius:50% 50% 8px 8px;background:#d8eeee}.rmt-room-scene-lab .rmt-room-prop-c:before{right:9%;bottom:15%;width:15%;height:36%;background:repeating-linear-gradient(180deg,#b9cccd 0 14px,#879fa1 15px 17px);border-radius:3px}
.rmt-room-scene-bath .rmt-room-prop-a:before{right:9%;bottom:17%;width:17%;height:25%;border-radius:50% 50% 6px 6px;background:#d8ecef;box-shadow:0 6px 0 #a7c7cc}.rmt-room-scene-bath .rmt-room-prop-b:before{right:8%;top:14%;width:21%;height:21%;border-radius:50%;border:5px solid #e8f6f8;background:#c7e9ef}.rmt-room-scene-bath .rmt-room-prop-c:before{left:9%;bottom:12%;width:16%;height:5%;background:#a8d2d7;border-radius:50%}
.rmt-room-scene-dining .rmt-room-prop-a:before{left:17%;bottom:15%;width:9%;height:22%;border-radius:12px 12px 3px 3px;background:#9f795d}.rmt-room-scene-dining .rmt-room-prop-b:before{right:17%;bottom:15%;width:9%;height:22%;border-radius:12px 12px 3px 3px;background:#9f795d}.rmt-room-scene-dining .rmt-room-prop-c:before{left:48%;bottom:28%;width:8%;height:8%;border-radius:50%;background:#d7aa7c}
.rmt-room-scene-balcony .rmt-room-prop-a:before{left:8%;bottom:10%;width:12%;height:24%;border-radius:50% 50% 12% 12%;background:#8cac91;box-shadow:0 7px 0 #6e8c74}.rmt-room-scene-balcony .rmt-room-prop-b:before{right:8%;bottom:10%;width:13%;height:28%;border-radius:50% 50% 12% 12%;background:#9fba91;box-shadow:0 7px 0 #78956f}.rmt-room-scene-balcony .rmt-room-prop-c:before{left:32%;bottom:12%;width:36%;height:4%;background:#81979a;border-radius:4px}
.rmt-room-scene-workshop .rmt-room-prop-a:before{right:7%;bottom:13%;width:20%;height:42%;background:repeating-linear-gradient(180deg,#919da2 0 15px,#c9d1d4 16px 29px,#808c91 30px 33px);border-radius:3px}.rmt-room-scene-workshop .rmt-room-prop-b:before{left:17%;bottom:30%;width:10%;height:10%;border:4px solid #77858b;border-radius:50%}.rmt-room-scene-workshop .rmt-room-prop-c:before{left:31%;bottom:13%;width:21%;height:5%;background:#6f7b80;transform:rotate(-8deg)}
.rmt-room-scene-office .rmt-room-prop-a:before{left:31%;bottom:34%;width:22%;height:17%;border:6px solid #8197a2;background:#d5e7ef;border-radius:4px}.rmt-room-scene-office .rmt-room-prop-b:before{right:8%;bottom:12%;width:18%;height:39%;background:repeating-linear-gradient(180deg,#afc0c7 0 14px,#dce6ea 15px 29px,#9eb0b8 30px 32px);border-radius:3px}.rmt-room-scene-office .rmt-room-prop-c:before{left:48%;bottom:10%;width:10%;height:16%;border-radius:50% 50% 6px 6px;background:#8da1aa}
.rmt-room-scene-traditional .rmt-room-prop-a:before{left:16%;bottom:14%;width:18%;height:7%;border-radius:50%;background:#b98f69}.rmt-room-scene-traditional .rmt-room-prop-b:before{right:19%;bottom:14%;width:18%;height:7%;border-radius:50%;background:#b98f69}.rmt-room-scene-traditional .rmt-room-prop-c:before{left:38%;bottom:12%;width:24%;height:7%;background:#8e6e51;border-radius:2px}
.rmt-room-scene-tent .rmt-room-prop-a:before{right:16%;bottom:18%;width:8%;height:17%;border-radius:50% 50% 8px 8px;background:#d9a85f;box-shadow:0 0 14px rgba(217,168,95,.35)}.rmt-room-scene-tent .rmt-room-prop-b:before{left:12%;bottom:11%;width:20%;height:12%;background:#9d7858;border-radius:4px;box-shadow:0 6px 0 #7e5e45}.rmt-room-scene-tent .rmt-room-prop-c:before{right:10%;bottom:10%;width:18%;height:10%;background:#8c6e55;border-radius:3px}
.rmt-room-scene-cabin .rmt-room-prop-a:before{left:8%;top:15%;width:15%;height:14%;border-radius:50%;border:5px solid #697f89;background:#b9e2f0}.rmt-room-scene-cabin .rmt-room-prop-b:before{right:7%;bottom:15%;width:25%;height:20%;border-radius:4px;background:repeating-linear-gradient(90deg,#728893 0 17px,#a9bdc5 18px 20px);box-shadow:0 7px 0 #526873}.rmt-room-scene-cabin .rmt-room-prop-c:before{left:46%;bottom:34%;width:15%;height:10%;border-radius:4px;background:#7e949e}
.rmt-room-scene-modern .rmt-room-prop-a:before{right:9%;bottom:13%;width:18%;height:30%;border-radius:5px;background:#d6e3e8;box-shadow:0 7px 0 #afc3cb}.rmt-room-scene-modern .rmt-room-prop-b:before{left:43%;bottom:13%;width:22%;height:6%;border-radius:50%;background:#c8b4a4}.rmt-room-scene-modern .rmt-room-prop-c:before{left:11%;top:18%;width:13%;height:18%;border:4px solid #c7dce5;background:#eff9fc}
.rmt-room-scene[data-rmt-layout="2"] .rmt-room-decor{transform:scaleX(-1)}.rmt-room-scene[data-rmt-layout="3"] .rmt-room-decor{transform:translateX(3%) scale(.94)}
.rmt-room-person{position:absolute;z-index:5;left:48%;bottom:14%;width:94px;height:164px;border:0;background:transparent;cursor:pointer;color:#5c6f83;padding:0;animation:rmtRoomIdle 4.8s ease-in-out infinite}
.rmt-room-person:hover .rmt-room-head{transform:translateY(-2px)}
@keyframes rmtRoomIdle{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.rmt-room-head{position:absolute;left:26px;top:4px;width:43px;height:48px;border-radius:47% 47% 44% 44%;background:linear-gradient(155deg,#6b7180,#4c5362);box-shadow:inset 0 -7px rgba(30,36,47,.15);transition:.18s ease}
.rmt-room-head:after{content:"";position:absolute;left:8px;right:8px;bottom:-13px;height:15px;border-radius:7px;background:#f1d8cb}
.rmt-room-body-figure{position:absolute;left:14px;top:57px;width:68px;height:91px;border-radius:25px 25px 12px 12px;background:linear-gradient(180deg,#8ebfd5,#6fa8c1);box-shadow:inset 10px 0 rgba(255,255,255,.08)}
.rmt-room-body-figure:before,.rmt-room-body-figure:after{content:"";position:absolute;top:22px;width:20px;height:73px;border-radius:12px;background:#80b4ca}.rmt-room-body-figure:before{left:-12px;transform:rotate(7deg)}.rmt-room-body-figure:after{right:-12px;transform:rotate(-7deg)}
.rmt-room-person-label{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:800;color:#73869a;background:rgba(255,255,255,.88);border:1px solid #d3e2e9;border-radius:999px;padding:3px 7px}
.rmt-room-activity-strip{padding:10px 13px;border-bottom:1px solid #d9e7ee;background:#fbfdfe;color:#67798b}.rmt-room-activity-strip>div{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;align-items:baseline}.rmt-room-activity-strip b{color:#9d637b;font-size:11px}.rmt-room-activity-strip span{font-size:12px;line-height:1.55}.rmt-room-activity-strip small{grid-column:2;font-size:9px;color:#8b97a4;line-height:1.45}.rmt-room-activity-strip.empty{background:#f8fbfd}.rmt-room-live-trace{margin-top:8px;padding:7px 9px;border-radius:9px;background:#f8fbfd;color:#788896;font-size:10px}.rmt-room-temp-line{margin-top:7px;color:#81909e;font-size:10px}
.rmt-room-empty{position:absolute;z-index:6;left:50%;top:17%;transform:translateX(-50%);padding:8px 11px;border:1px dashed #cbdde7;border-radius:12px;background:rgba(255,255,255,.78);color:#8a98a5;font-size:11px}
.rmt-room-hotspot{position:absolute;z-index:8;left:var(--rx);top:var(--ry);transform:translate(-50%,-50%);width:28px;height:28px;display:grid;place-items:center;border:1px solid #bcd6e2;border-radius:50%;padding:0;background:rgba(255,255,255,.94);color:#60758a;font:inherit;font-size:10px;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(64,87,103,.13);transition:.18s ease}
.rmt-room-hotspot:hover,.rmt-room-hotspot.active{transform:translate(-50%,-50%) scale(1.08);border-color:#e6a5c0;background:#fff7fa;color:#9b5d79}.rmt-room-hotspot.focus{box-shadow:0 0 0 4px rgba(233,154,185,.18),0 3px 10px rgba(64,87,103,.11)}
.rmt-room-object-rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;padding:10px 12px;border-top:1px solid #d9e7ee;background:#fbfdfe}.rmt-room-object-chip{min-width:0;display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:7px;text-align:left;border:1px solid #d6e4eb;border-radius:10px;background:#fff;color:#647589;padding:7px 8px;font:inherit;cursor:pointer}.rmt-room-object-chip>span{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#eef7fb;color:#6b8396;font-size:9px;font-weight:900}.rmt-room-object-chip b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}.rmt-room-object-chip em{font-size:8px;color:#98743f;font-style:normal;white-space:nowrap}.rmt-room-object-chip.active{border-color:#e6aec4;background:#fff7fa}
.rmt-room-caption{padding:12px 14px 14px;border-top:1px solid #d9e7ee;background:#fffdfb;color:#68788a;line-height:1.7;font-size:12px}.rmt-room-caption b{color:#ba7590}
.rmt-room-side{display:grid;gap:12px}.rmt-room-card{border:1px solid #cbdde7;border-radius:16px;padding:15px;background:linear-gradient(180deg,#fff,#fffdf9);box-shadow:0 7px 18px rgba(66,88,105,.07)}
.rmt-room-card-kicker{font-size:9px;letter-spacing:.13em;font-weight:850;color:#aa7a8e;margin-bottom:6px}.rmt-room-object-title{font-size:18px;font-weight:850;color:#53667c;margin-bottom:8px}.rmt-room-object-desc{white-space:pre-wrap;line-height:1.75;color:#68778a;font-size:12px}.rmt-room-object-line{margin-top:11px;padding:10px 11px;border-left:3px solid #e99ab9;background:#fff7fa;color:#755e69;line-height:1.65;font-size:12px}
.rmt-room-source{margin-top:9px;font-size:10px;color:#98a2ad}.rmt-room-searchable-tag{display:inline-block;margin-left:7px;padding:2px 7px;border:1px solid #d7c08f;border-radius:999px;font-size:9px;color:#8a6b35;background:#fffaf0;vertical-align:2px}.rmt-room-atmosphere{white-space:pre-wrap;line-height:1.72;color:#6c7b8c;font-size:12px}
.rmt-room-note{font-size:10px;color:#9aa5af;line-height:1.55;margin-top:7px}

#${core_constants.SETTINGS_ID}{margin-top:10px;--rmt-s-ink:#53647a;--rmt-s-muted:#7c8998;--rmt-s-blue:#8ebfd5;--rmt-s-pink:#e99ab9;--rmt-s-line:#cddfe8}
#${core_constants.SETTINGS_ID} .rmt-settings-header{min-height:42px;border-radius:12px 12px 0 0;background:linear-gradient(90deg,rgba(233,154,185,.12),rgba(142,191,213,.10));border:1px solid var(--rmt-s-line);padding:8px 11px;color:var(--rmt-s-ink)}
#${core_constants.SETTINGS_ID} .rmt-settings-header small{font-size:8px;letter-spacing:.14em;color:#98a7b4;margin-left:6px}
#${core_constants.SETTINGS_ID} .rmt-settings-content{padding:11px!important;border:1px solid var(--rmt-s-line);border-top:0;border-radius:0 0 14px 14px;background:linear-gradient(180deg,rgba(248,252,254,.72),rgba(255,252,249,.70));display:grid;gap:10px}
#${core_constants.SETTINGS_ID} .rmt-settings-hero{padding:12px 13px;border-radius:13px;background:linear-gradient(135deg,#fff7fa,#f5fbfe 58%,#fffdf5);border:1px solid #d8e5eb;color:var(--rmt-s-ink);box-shadow:0 5px 14px rgba(70,95,112,.06)}
#${core_constants.SETTINGS_ID} .rmt-settings-hero span{display:block;font-size:8px;font-weight:850;letter-spacing:.16em;color:#a98293;margin-bottom:5px}
#${core_constants.SETTINGS_ID} .rmt-settings-hero b{display:block;font-size:13px;line-height:1.5;margin-bottom:5px}
#${core_constants.SETTINGS_ID} .rmt-settings-hero p{margin:0;font-size:10px;line-height:1.6;color:var(--rmt-s-muted)}
#${core_constants.SETTINGS_ID} .rmt-settings-card{padding:11px;border:1px solid var(--rmt-s-line);border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(249,252,253,.94));display:grid;gap:8px;box-shadow:0 4px 12px rgba(70,95,112,.05)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head{display:flex;gap:8px;align-items:center;color:var(--rmt-s-ink)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head>span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;font-size:9px;font-weight:900;background:linear-gradient(145deg,#f8c7da,#cde7f2);color:#667789;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)}
#${core_constants.SETTINGS_ID} .rmt-settings-card-head b{display:block;font-size:12px}.rmt-settings-card-head small{display:block;font-size:9px;color:#98a4af;margin-top:2px;line-height:1.35}
#${core_constants.SETTINGS_ID} .menu_button{writing-mode:horizontal-tb!important;text-orientation:mixed!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:34px!important;max-height:none!important;white-space:normal!important;line-height:1.25!important;padding:8px 11px!important;border-radius:10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;overflow:visible!important;word-break:keep-all!important;flex:none}
#${core_constants.SETTINGS_ID} .rmt-settings-wide{width:100%!important}
#${core_constants.SETTINGS_ID} .rmt-settings-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:1px}
#${core_constants.SETTINGS_ID} .rmt-settings-buttons .menu_button{width:100%!important;min-height:42px!important;background:linear-gradient(180deg,#fff,#f5fafc)!important;border-color:#c9dce6!important;color:#586a7d!important}
#${core_constants.SETTINGS_ID} .rmt-api-box{margin-top:0}.rmt-api-box .text_pole{width:100%!important;max-width:none!important;box-sizing:border-box!important;min-height:34px;writing-mode:horizontal-tb!important}
#${core_constants.SETTINGS_ID} .rmt-settings-field{display:grid;gap:4px;min-width:0;font-size:10px;color:#7b8997}
#${core_constants.SETTINGS_ID} .rmt-settings-field>span{font-weight:750;color:#6c7c8e}
#${core_constants.SETTINGS_ID} .rmt-api-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#${core_constants.SETTINGS_ID} .rmt-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:end}
#${core_constants.SETTINGS_ID} .rmt-model-refresh{min-width:84px!important;white-space:nowrap!important}
#${core_constants.SETTINGS_ID} .rmt-settings-check{font-size:10px!important;line-height:1.45;color:#6f7d8c}
#${core_constants.SETTINGS_ID} .rmt-api-note{font-size:9px;line-height:1.55;opacity:.72;color:#758493}
#${core_constants.SETTINGS_ID} .rmt-memory-settings-status{font-size:10px;line-height:1.55;color:#718092;white-space:pre-wrap;padding:7px 8px;border-radius:9px;background:#f6fafc}
.rmt-loading-card{max-width:560px;padding:24px 26px;border:1px solid #d3e3ea;border-radius:18px;background:rgba(255,255,255,.82);box-shadow:0 10px 30px rgba(67,91,108,.08)}
.rmt-task-banner{margin:0 0 12px;padding:10px 13px;border:1px solid #cfe3eb;border-radius:13px;background:linear-gradient(90deg,rgba(250,219,232,.72),rgba(218,239,247,.72));display:flex;align-items:center;gap:10px;color:#536679}.rmt-task-banner b{display:block;font-size:12px}.rmt-task-banner small{display:block;margin-top:2px;font-size:10px;line-height:1.45;color:#758795}.rmt-task-dot{width:9px;height:9px;border-radius:50%;background:#ed9fbe;box-shadow:0 0 0 4px rgba(237,159,190,.16);animation:rmtPulse 1.5s ease-in-out infinite}
.rmt-loading-note{opacity:.66;margin-top:8px;font-size:11px;line-height:1.55}.rmt-loading-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:15px}
#${core_constants.MENU_ID}{cursor:pointer}


.rmt-archive-room{padding:18px 20px 24px;min-height:100%;box-sizing:border-box}
.rmt-archive-portals{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:16px 0}
.rmt-archive-portal{border:1px solid #d1e1e8;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(248,252,254,.94));padding:14px 12px 12px;min-height:226px;display:flex;flex-direction:column;align-items:stretch;text-align:center;color:#5a6d82;cursor:default;box-shadow:0 7px 18px rgba(66,88,105,.06);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,opacity .18s ease}
.rmt-archive-portal.ready:hover{transform:translateY(-2px);border-color:#efb0c9;box-shadow:0 10px 24px rgba(72,94,112,.10)}
.rmt-archive-portal.empty .rmt-portal-open{opacity:.58;filter:saturate(.72)}
.rmt-archive-portal.generating{border-color:#c8dfe9;box-shadow:0 0 0 3px rgba(142,191,213,.10),0 7px 18px rgba(66,88,105,.06)}
.rmt-portal-open{border:0;background:transparent;color:inherit;font:inherit;display:flex;flex:1;flex-direction:column;align-items:center;text-align:center;padding:4px 0 8px;cursor:pointer;min-width:0}
.rmt-portal-open:disabled{cursor:default}
.rmt-portal-generate{width:100%;margin-top:10px;justify-content:center}
.rmt-portal-avatar{position:relative;width:88px;height:88px;border-radius:50%;display:grid;place-items:center;margin:2px 0 12px;border:4px solid rgba(255,255,255,.92);outline:1px solid #cbdde6;box-shadow:0 7px 18px rgba(67,92,110,.10);font-size:31px;color:#fff;background:linear-gradient(145deg,#9dcddd,#7fb4ca)}
.rmt-archive-portal[data-rmt-archive-character]>.rmt-portal-avatar{align-self:center;margin-left:auto;margin-right:auto;flex:0 0 auto}
.rmt-archive-portal-album .rmt-portal-avatar{background:linear-gradient(145deg,#f0afc8,#d989aa)}
.rmt-archive-portal-adv .rmt-portal-avatar{background:linear-gradient(145deg,#ebcf8c,#c9aa62)}
.rmt-archive-portal-room .rmt-portal-avatar{background:linear-gradient(145deg,#9bcfc4,#78afa5)}
.rmt-archive-portal-butterfly .rmt-portal-avatar{background:linear-gradient(145deg,#708aa9,#4f6585)}
@media(min-width:761px){.rmt-archive-portals>.rmt-archive-portal-butterfly{grid-column:1/-1;min-height:170px}}
.rmt-archive-portal-ending .rmt-portal-avatar{background:linear-gradient(145deg,#efa9bf,#c86e91)}
.rmt-archive-portal-heart .rmt-portal-avatar{background:linear-gradient(145deg,#f0a7b8,#db7895)}
.rmt-portal-ready-dot,.rmt-portal-lock{position:absolute;right:-2px;bottom:2px;width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#cf7599;border:1px solid #edbdd0;font-size:12px;font-weight:900;box-shadow:0 3px 8px rgba(61,79,95,.12)}
.rmt-portal-lock{color:#94a0ab;border-color:#d6dfe4;font-size:10px}
.rmt-portal-title{font-size:16px;font-weight:850;color:#53667c;line-height:1.35}
.rmt-portal-subtitle{font-size:10px;color:#8795a4;line-height:1.5;margin-top:5px;min-height:30px}
.rmt-portal-status{font-size:9px;font-weight:750;color:#a27084;margin-top:auto;padding-top:9px}
.rmt-archive-portal.empty .rmt-portal-status{color:#9aa4ad}
.rmt-archive-generate-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 13px;border:1px dashed #c7dce6;border-radius:14px;background:rgba(249,252,253,.82)}
.rmt-archive-generate{min-width:220px}.rmt-archive-generate-row small{font-size:10px;line-height:1.55;color:#7d8b99}
.rmt-external-memory-row{display:grid;gap:5px;margin:10px 0 2px;padding:10px 12px;border:1px solid #dbe7ec;border-radius:13px;background:rgba(250,253,254,.84);color:#66798a}.rmt-external-memory-toggle{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750}.rmt-external-memory-row small{font-size:10px;line-height:1.55;color:#8794a0}.rmt-memory-wi-picker{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(242,248,251,.88);backdrop-filter:blur(7px)}.rmt-memory-wi-picker-card{width:min(780px,96vw);max-height:min(78vh,780px);overflow:auto;padding:16px;border:1px solid #d6e4ea;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(55,78,92,.18)}.rmt-memory-wi-picker-head,.rmt-memory-wi-book-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.rmt-memory-wi-picker-head small{display:block;margin-top:3px;color:#8795a1}.rmt-memory-wi-picker-note{margin:10px 0;padding:9px 11px;border-radius:11px;background:#f6fafc;color:#71818d;font-size:11px;line-height:1.55}.rmt-memory-wi-books{display:grid;gap:8px}.rmt-memory-wi-book{padding:10px;border:1px solid #e0e9ed;border-radius:13px;background:#fbfdfe}.rmt-memory-wi-book-row label{font-size:12px}.rmt-memory-wi-entry-list{display:grid;gap:7px;margin-top:9px}.rmt-memory-wi-entry{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:10px;background:#fff;border:1px solid #e8eef1}.rmt-memory-wi-entry span{display:grid;gap:2px;min-width:0}.rmt-memory-wi-entry small{font-size:10px;color:#8b98a2}.rmt-memory-wi-entry em{font-style:normal;font-size:10px;line-height:1.45;color:#65747f}.rmt-memory-wi-empty{padding:18px;text-align:center;color:#8b98a2}.rmt-archive-group-manager{position:absolute;inset:0;z-index:61;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(242,248,251,.9);backdrop-filter:blur(7px)}.rmt-archive-group-create{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin:10px 0}.rmt-archive-group-entries{display:grid;gap:8px}.rmt-archive-group-entry{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.8fr);gap:10px;align-items:center;padding:10px;border:1px solid #e0e9ed;border-radius:13px;background:#fbfdfe}.rmt-archive-group-entry b{display:block;color:#5c7083}.rmt-archive-group-entry small{display:block;margin-top:3px;color:#8a98a4;font-size:9px}.rmt-archive-group-entry-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}@media(max-width:720px){.rmt-archive-group-create,.rmt-archive-group-entry{grid-template-columns:1fr}.rmt-archive-group-entry-actions{grid-template-columns:1fr auto}}
#${core_constants.SETTINGS_ID} .rmt-open-archive-room{width:100%!important;min-height:48px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;background:linear-gradient(90deg,#fff6fa,#f2faff)!important;border:1px solid #d4e2e9!important;color:#566a80!important;font-weight:850!important}
#${core_constants.SETTINGS_ID} .rmt-settings-archive-actions{display:grid;gap:8px;margin-top:10px}.rmt-current-archive-card{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.rmt-current-archive-card>div:first-child{display:grid;gap:4px}.rmt-current-archive-card small{font-size:10px;color:#8794a0}.rmt-current-archive-actions{display:flex;gap:8px;flex-wrap:wrap}
.rmt-archive-portal-items .rmt-portal-avatar{background:linear-gradient(145deg,#ddb991,#b99168)}
.rmt-archive-portal-phone .rmt-portal-avatar{background:linear-gradient(145deg,#9fc9d5,#6ca6b6)}
.rmt-items{display:grid;grid-template-columns:220px 1fr;gap:14px;min-height:520px}.rmt-items-boxes{display:flex;flex-direction:column;gap:8px}.rmt-items-main{min-width:0}.rmt-items-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.72)}
.rmt-items-grid{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:12px}.rmt-items-list{display:flex;flex-direction:column;gap:8px}.rmt-item-node{border:1px solid rgba(93,107,128,.16);background:rgba(255,255,255,.8);border-radius:14px;padding:10px;display:flex;align-items:center;gap:10px;text-align:left;color:inherit}.rmt-item-node.active{box-shadow:0 0 0 2px rgba(185,145,104,.22);border-color:rgba(185,145,104,.45)}.rmt-item-node span{display:flex;flex-direction:column;min-width:0;flex:1}.rmt-item-node small{opacity:.62;margin-top:3px}.rmt-item-detail{border-radius:18px;padding:18px;background:rgba(255,255,255,.82);border:1px solid rgba(93,107,128,.14);min-height:220px}.rmt-item-detail-head{display:flex;justify-content:space-between;gap:12px}.rmt-item-detail p{white-space:pre-wrap;line-height:1.8}.rmt-item-detail blockquote{margin:16px 0;padding:12px 14px;border-left:3px solid rgba(185,145,104,.55);background:rgba(246,237,228,.7);border-radius:8px}
.rmt-phone{display:flex;justify-content:center;padding:8px}.rmt-phone-shell{position:relative;width:min(940px,100%);min-height:560px;border-radius:28px;padding:16px;background:linear-gradient(155deg,#f8fbfc,#e9f2f5);border:1px solid rgba(74,112,124,.18);box-shadow:0 16px 42px rgba(44,70,79,.12)}.rmt-phone-notch{width:90px;height:5px;border-radius:999px;background:rgba(39,57,65,.28);margin:0 auto 12px}.rmt-phone-lock{display:flex;justify-content:space-between;align-items:center;padding:12px 14px}.rmt-phone-lock span{opacity:.6}.rmt-phone-apps{display:flex;gap:8px;overflow:auto;padding:8px 4px 14px}.rmt-phone-app{min-width:92px;border:0;border-radius:16px;background:rgba(255,255,255,.7);padding:11px 10px;display:flex;flex-direction:column;align-items:center;gap:6px}.rmt-phone-app.active{background:#fff;box-shadow:0 8px 20px rgba(77,113,126,.12)}.rmt-phone-content{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(0,1.2fr);gap:12px}.rmt-phone-list,.rmt-phone-detail{border-radius:18px;background:rgba(255,255,255,.78);border:1px solid rgba(74,112,124,.12);padding:12px}.rmt-phone-app-summary{padding:5px 4px 12px;opacity:.68}.rmt-phone-entry{width:100%;border:0;border-top:1px solid rgba(74,112,124,.1);background:transparent;padding:10px 6px;text-align:left;display:flex;flex-direction:column;gap:3px}.rmt-phone-entry.active{background:rgba(159,201,213,.14);border-radius:10px}.rmt-phone-entry small{opacity:.55}.rmt-phone-entry span{opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-phone-entry em{font-style:normal;font-size:8px;color:#8c7280;margin-top:2px}.rmt-phone-app-summary{display:grid;gap:3px}.rmt-phone-app-summary b{font-size:13px;color:#5c7184}.rmt-phone-app-summary span{font-size:10px;line-height:1.55}.rmt-phone-app-summary small{font-size:8px;opacity:.55}.rmt-phone-detail{position:relative;min-width:0}.rmt-phone-detail-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.rmt-phone-detail-toolbar>span{font-size:9px;color:#8e9ba7;text-align:right}.rmt-phone-detail h3{margin:8px 0}.rmt-phone-detail p{white-space:pre-wrap;line-height:1.8}.rmt-phone-evidence{margin-top:14px;font-size:12px;opacity:.58}.rmt-phone-chat-thread{display:grid;gap:8px;margin-top:12px}.rmt-phone-message{padding:9px 10px;border-radius:13px;background:#f7fbfd;border:1px solid rgba(74,112,124,.10);max-width:84%}.rmt-phone-message-owner{margin-left:auto;background:#fff2f6;border-color:rgba(199,125,151,.16)}.rmt-phone-message-contact{margin-right:auto;background:#f7fbfd}.rmt-phone-message>div{display:flex;justify-content:space-between;gap:8px;align-items:center}.rmt-phone-message b{font-size:10px}.rmt-phone-message small{font-size:8px;opacity:.55}.rmt-phone-message p{margin:5px 0 0!important;line-height:1.65!important;font-size:11px}.rmt-phone-speaker-warning{margin:10px 0;padding:9px 10px;border-radius:11px;background:#fff8e9;border:1px solid rgba(184,145,79,.18);font-size:10px;line-height:1.6;color:#8b7756}.rmt-phone-fields{display:grid;gap:7px;margin:12px 0}.rmt-phone-fields>div{display:grid;grid-template-columns:minmax(90px,.35fr) minmax(0,1fr);gap:8px;padding:8px 9px;border-radius:10px;background:#f8fbfd}.rmt-phone-fields dt{font-size:9px;color:#8795a2}.rmt-phone-fields dd{margin:0;font-size:11px;color:#5f7182;white-space:pre-wrap}.rmt-phone-image-caption{padding:11px;border-radius:12px;background:#fff7fa;line-height:1.65;white-space:pre-wrap}
.rmt-phone-lock>div,.rmt-phone-lock>span{display:grid;gap:2px}.rmt-phone-lock small{font-size:9px;opacity:.62}.rmt-phone-app{position:relative}.rmt-phone-badge{position:absolute;right:7px;top:6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;display:grid;place-items:center;background:#e98eaf;color:#fff;font-size:9px;font-style:normal;font-weight:850;box-shadow:0 2px 6px rgba(91,48,67,.18)}
.rmt-device-watch{width:min(560px,100%);border-radius:44px;border-width:6px;padding:18px}.rmt-device-watch .rmt-phone-notch{width:44px}.rmt-device-watch .rmt-phone-content{grid-template-columns:1fr}.rmt-device-watch .rmt-phone-apps{justify-content:flex-start}.rmt-device-watch .rmt-phone-detail{min-height:180px}.rmt-device-terminal,.rmt-device-communicator{border-radius:16px;background:linear-gradient(155deg,#edf4f6,#dce8ec)}

.rmt-avatar-talk-mark{position:absolute;right:-3px;bottom:-2px;width:21px;height:21px;display:grid;place-items:center;border-radius:50%;background:#fff7fa;border:1px solid #e6b1c5;color:#a86580;font-size:9px;box-shadow:0 2px 7px rgba(72,90,105,.16)}
.rmt-character-heart-head{display:flex;align-items:center;gap:13px}.rmt-character-heart-avatar{position:relative;width:72px;height:72px;flex:0 0 72px;border:3px solid #fff;border-radius:50%;padding:0;background:linear-gradient(145deg,#f8c8da,#cfe8f2);box-shadow:0 0 0 1px #cadde6,0 8px 20px rgba(64,85,101,.12);overflow:visible;cursor:pointer;color:#63778c}.rmt-character-heart-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}.rmt-character-heart-avatar:hover{transform:translateY(-1px)}.rmt-character-heart-avatar>span{position:absolute;right:-4px;bottom:-3px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:#fff7fa;border:1px solid #e6afc4;color:#a76580;font-size:10px;box-shadow:0 2px 7px rgba(72,90,105,.15)}
.rmt-avatar-dialog-pop{position:fixed;z-index:2147483638;inset:0;display:grid;place-items:center;padding:18px;background:rgba(35,45,55,.24);backdrop-filter:blur(3px)}.rmt-avatar-dialog-card{position:relative;width:min(470px,94vw);border:1px solid #d3e3ea;border-radius:22px;background:linear-gradient(160deg,#fff,#fff8fb 52%,#f5fbfd);padding:18px;box-shadow:0 22px 60px rgba(32,46,56,.28)}.rmt-avatar-dialog-close{position:absolute;right:10px;top:9px;width:30px;height:30px;border:0;border-radius:50%;background:#f4f8fa;color:#82909d;font:inherit;font-size:18px;cursor:pointer}.rmt-avatar-dialog-head{display:flex;align-items:center;gap:11px;padding-right:32px}.rmt-avatar-dialog-avatar{width:58px;height:58px;flex:0 0 58px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#f7c7da,#cee7f1);overflow:hidden;color:#9c667d}.rmt-avatar-dialog-avatar img{width:100%;height:100%;object-fit:cover}.rmt-avatar-dialog-head b{display:block;color:#53687d;font-size:14px}.rmt-avatar-dialog-head small{display:block;margin-top:3px;color:#aa748c;font-size:9px;letter-spacing:.08em}.rmt-avatar-dialog-bubble{position:relative;margin:15px 0 12px;padding:14px 15px;border:1px solid #dbe7ec;border-radius:4px 16px 16px 16px;background:#fff;color:#596d80;line-height:1.8;white-space:pre-wrap}.rmt-avatar-dialog-bubble:before{content:"";position:absolute;left:15px;top:-9px;border-width:0 9px 9px 0;border-style:solid;border-color:transparent #dbe7ec transparent transparent}.rmt-avatar-dialog-bubble:after{content:"";position:absolute;left:16px;top:-7px;border-width:0 8px 8px 0;border-style:solid;border-color:transparent #fff transparent transparent}.rmt-avatar-dialog-actions{display:flex;gap:8px;flex-wrap:wrap}.rmt-avatar-dialog-note{margin-top:10px;font-size:9px;color:#919da8;line-height:1.55}
.rmt-heart{padding:13px;display:grid;gap:12px}.rmt-heart-summary{border:1px solid #d6e4eb;border-radius:18px;background:linear-gradient(135deg,#fff8fb,#f6fbfd 55%,#fffdf7);padding:15px 17px;display:grid;gap:7px}.rmt-heart-summary-kicker{font-size:9px;font-weight:850;letter-spacing:.14em;color:#a76f87}.rmt-heart-summary h2{margin:0;color:#52677b;font-size:20px}.rmt-heart-summary p{margin:0;color:#6c7d8d;line-height:1.75}.rmt-heart-summary small{font-size:9px;color:#95a0aa}.rmt-heart-summary-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:3px}.rmt-heart-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.rmt-heart-tabs button{border:1px solid #d2e1e8;border-radius:12px;background:#fff;color:#68798b;padding:9px 8px;font:inherit;font-size:10px;font-weight:750;cursor:pointer}.rmt-heart-tabs button.active{border-color:#e4a8bf;background:#fff7fa;color:#995f79;box-shadow:0 0 0 2px rgba(228,168,191,.12)}
.rmt-heart-greetings{display:grid;gap:10px}.rmt-heart-current-line{padding:15px;border:1px solid #d8e5eb;border-radius:16px;background:#fff}.rmt-heart-current-line small{color:#a67389;font-size:9px}.rmt-heart-current-line p{margin:7px 0 0;color:#596d80;font-size:13px;line-height:1.75}.rmt-heart-greeting-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rmt-heart-greeting-group{padding:12px;border:1px solid #dce7ec;border-radius:14px;background:#fbfdfe}.rmt-heart-greeting-group b{display:block;color:#66798b;margin-bottom:7px;font-size:11px}.rmt-heart-greeting-group p{margin:5px 0;padding:7px 8px;border-radius:9px;background:#fff;color:#6b7a89;font-size:10px;line-height:1.6}
.rmt-heart-drama-layout{display:grid;grid-template-columns:minmax(170px,.32fr) minmax(0,1fr);gap:10px;min-width:0}.rmt-heart-drama-layout>nav{display:grid;gap:7px;align-content:start}.rmt-heart-drama-layout>main{min-width:0;padding:15px;border:1px solid #d8e5eb;border-radius:17px;background:#fff}.rmt-heart-drama-card,.rmt-heart-strip-card{border:1px solid #d7e4ea;border-radius:13px;background:#fff;padding:10px;text-align:left;color:#647589;font:inherit;display:grid;gap:3px;cursor:pointer;min-width:0}.rmt-heart-drama-card.active,.rmt-heart-strip-card.active{border-color:#e5a8c0;background:#fff7fa}.rmt-heart-drama-card b,.rmt-heart-strip-card b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-heart-drama-card span,.rmt-heart-strip-card span{font-size:9px;color:#8795a2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-heart-drama-card em,.rmt-heart-strip-card em{font-size:8px;font-style:normal;color:#a66f87}.rmt-heart-drama-head,.rmt-heart-strip-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.rmt-heart-drama-head h2,.rmt-heart-strip-head h2{margin:0;color:#53687c;font-size:19px}.rmt-heart-drama-head p,.rmt-heart-strip-head p{margin:4px 0 0;color:#8b98a4;font-size:10px}.rmt-heart-drama-head>span,.rmt-heart-strip-head>span{padding:4px 8px;border-radius:999px;background:#fff0f5;color:#a66a83;font-size:9px;white-space:nowrap}.rmt-heart-setting{margin:10px 0;padding:9px 10px;border-radius:10px;background:#f7fbfd;color:#758697;font-size:10px;line-height:1.65}.rmt-heart-script{display:grid;gap:8px;margin-top:10px}.rmt-heart-top-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}.rmt-heart-line{display:grid;grid-template-columns:38px minmax(0,1fr);gap:8px;align-items:start}.rmt-heart-line.user{grid-template-columns:minmax(0,1fr) 38px}.rmt-heart-line.user .rmt-heart-line-avatar{grid-column:2}.rmt-heart-line.user>div{grid-row:1;grid-column:1;background:#fff8fb}.rmt-heart-line-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#edf6fa;color:#7c8da0;font-size:9px}.rmt-heart-line-avatar img{width:100%;height:100%;object-fit:cover}.rmt-heart-line>div{padding:9px 10px;border:1px solid #dce7ec;border-radius:12px;background:#fbfdfe;color:#5f7183;line-height:1.7;font-size:11px;white-space:pre-wrap}.rmt-heart-line small{display:block;margin-bottom:3px;color:#9a7a89;font-size:8px}.rmt-heart-line p{margin:0}.rmt-heart-narration{padding:7px 10px;text-align:center;color:#8d99a4;font-size:9px;font-style:italic}
.rmt-heart-script-line{display:grid;grid-template-columns:38px minmax(0,1fr);gap:8px;align-items:start}.rmt-heart-script-line.user{grid-template-columns:minmax(0,1fr) 38px}.rmt-heart-script-line.user .rmt-heart-script-avatar{grid-column:2}.rmt-heart-script-line.user .rmt-heart-script-bubble{grid-row:1;grid-column:1;background:#fff8fb}.rmt-heart-script-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#edf6fa;color:#7c8da0;font-size:9px}.rmt-heart-script-avatar img{width:100%;height:100%;object-fit:cover}.rmt-heart-script-bubble{padding:9px 10px;border:1px solid #dce7ec;border-radius:12px;background:#fbfdfe;color:#5f7183;line-height:1.7;font-size:11px;white-space:pre-wrap}.rmt-heart-script-bubble small{display:block;margin-bottom:3px;color:#9a7a89;font-size:8px}.rmt-heart-script-narration{padding:7px 10px;text-align:center;color:#8d99a4;font-size:9px;font-style:italic}.rmt-heart-sim-note{margin-top:12px;padding-top:9px;border-top:1px dashed #dce6ea;color:#98a2ab;font-size:9px;line-height:1.55}
.rmt-heart-strip-image{position:relative;aspect-ratio:16/9;margin:11px 0;border:5px solid #fff;border-radius:14px;overflow:hidden;outline:1px solid #d4e3e9;box-shadow:0 8px 19px rgba(60,82,98,.09)}.rmt-heart-strip-image .rmt-abstract,.rmt-heart-strip-image .rmt-cg-image{inset:0}.rmt-heart-strip-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.rmt-heart-strip-actions small{flex:1 1 220px;color:#929da6;font-size:9px;line-height:1.5}.rmt-heart-panels{display:grid;gap:8px;margin-top:11px}.rmt-heart-panel{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;padding:10px;border:1px solid #dce7ec;border-radius:12px;background:#fbfdfe}.rmt-heart-panel>b{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#fff0f5;color:#a26981;font-size:9px}.rmt-heart-panel small{color:#8b98a4;font-size:8px}.rmt-heart-panel p{margin:4px 0;color:#607284;line-height:1.6;font-size:10px}.rmt-heart-panel-line{margin-top:5px;padding:6px 8px;border-radius:8px;background:#fff;color:#657688;font-size:10px}.rmt-heart-panel-line strong{margin-right:6px;color:#a46881}.rmt-heart-panel-line.user{background:#fff8fb}.rmt-heart-panel-line.user strong{color:#798fa2}
.rmt-ending{display:grid;grid-template-columns:minmax(220px,.38fr) minmax(0,1fr);gap:14px;padding:14px}.rmt-ending-summary{grid-column:1/-1;border:1px solid #d9e5ea;border-radius:16px;background:linear-gradient(135deg,#fff8fb,#f5fbfd);padding:14px 16px}.rmt-ending-summary b{display:block;font-size:16px;color:#5a687b}.rmt-ending-summary p{margin:7px 0 0;line-height:1.75;color:#718093}.rmt-ending-disclaimer{margin-top:7px;font-size:9px;color:#9a8290}.rmt-ending-list{display:grid;gap:8px;align-content:start}.rmt-ending-route{width:100%;border:1px solid #d4e1e7;border-radius:14px;background:rgba(255,255,255,.86);padding:11px 12px;text-align:left;color:#596d82;font:inherit;display:grid;gap:3px}.rmt-ending-route.active{border-color:#e6a5bd;box-shadow:0 0 0 2px rgba(230,165,189,.14);background:#fff8fb}.rmt-ending-route.locked{opacity:.66}.rmt-ending-route b{font-size:12px}.rmt-ending-route span{font-size:9px;color:#8795a4}.rmt-ending-route em{font-style:normal;font-size:8px;color:#b16f8a}.rmt-ending-detail{border:1px solid #d8e5eb;border-radius:18px;background:rgba(255,255,255,.86);padding:18px;min-width:0}.rmt-ending-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.rmt-ending-head h2{margin:0;color:#52677b;font-size:21px}.rmt-ending-head span{font-size:9px;padding:4px 8px;border-radius:999px;background:#fff0f5;color:#b06c88;white-space:nowrap}.rmt-ending-subtitle{margin:5px 0 12px;color:#8a96a2}.rmt-ending-lock{padding:18px;border:1px dashed #d8c7cf;border-radius:14px;background:#fff9fb;color:#7b6a72;line-height:1.75}.rmt-ending-section{margin-top:14px;padding-top:14px;border-top:1px solid #e1eaee}.rmt-ending-section>small{display:block;letter-spacing:.12em;color:#b17a91;font-weight:800;margin-bottom:7px}.rmt-ending-section p{white-space:pre-wrap;line-height:1.85;margin:0;color:#5f6f7e}.rmt-ending-confession{margin-top:12px;padding:13px 14px;border-left:3px solid #e89fbc;background:#fff7fa;border-radius:9px;white-space:pre-wrap;line-height:1.85;color:#665c64}.rmt-ending-epilogue{display:grid;gap:9px;margin-top:10px}.rmt-ending-epilogue article{padding:11px 12px;border-radius:12px;background:#f8fbfd;border:1px solid #e0e9ed}.rmt-ending-epilogue b{display:block;margin-bottom:5px;color:#607285}.rmt-ending-epilogue p{font-size:11px}.rmt-ending-final{margin-top:12px;text-align:right;color:#a2667f;font-weight:750}.rmt-ending-evidence{margin-top:12px;font-size:9px;color:#9aa5ae}
.rmt-achievements{padding:14px;display:grid;gap:16px}.rmt-achievements-head{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #dde7eb;padding:5px 2px 13px}.rmt-achievements-head h2{margin:0;color:#526579;font-size:21px}.rmt-achievements-head span{font-size:10px;color:#91a0ad}.rmt-achievement-section{display:grid;gap:9px}.rmt-achievement-section h3{margin:0;display:flex;gap:7px;align-items:center;color:#607286;font-size:13px}.rmt-achievement-section h3 span{font-size:9px;color:#9aa7b2}.rmt-achievement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rmt-achievement-card{display:grid;grid-template-columns:46px 1fr;gap:10px;align-items:start;padding:12px;border:1px solid #d8e3e8;border-radius:14px;background:#fff}.rmt-achievement-card.locked{filter:saturate(.6);opacity:.68;background:#f4f6f7}.rmt-achievement-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#fff6df;border:1px solid #ead5a2;color:#b28b37;font-size:17px}.rmt-achievement-card.locked .rmt-achievement-icon{background:#edf0f2;border-color:#d8dde1;color:#929da6}.rmt-achievement-copy{min-width:0}.rmt-achievement-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.rmt-achievement-title b{font-size:12px;color:#586b7e}.rmt-achievement-title span{font-size:8px;color:#9b8991}.rmt-achievement-copy p{margin:5px 0;color:#718092;font-size:10px;line-height:1.6}.rmt-achievement-copy small{font-size:8px;color:#a68b64}
.rmt-ending-tabs{grid-column:1/-1;display:flex;gap:7px;flex-wrap:wrap}.rmt-ending-tab{border:1px solid #d8e4e9;border-radius:999px;background:#fff;color:#718193;padding:7px 11px;font:700 10px/1 inherit;cursor:pointer}.rmt-ending-tab.active{border-color:#e3a0bb;background:#fff3f8;color:#a85f7c}.rmt-ending-tab span{margin-left:4px;opacity:.72}.rmt-confession-card{width:100%;border:1px solid #d6e2e8;border-radius:14px;background:rgba(255,255,255,.9);padding:11px 12px;text-align:left;color:#5f7081;font:inherit;display:grid;gap:3px}.rmt-confession-card.active{border-color:#dda0b8;background:#fff7fa;box-shadow:0 0 0 2px rgba(221,160,184,.12)}.rmt-confession-card b{font-size:12px}.rmt-confession-card span{font-size:9px;color:#8a97a4}.rmt-confession-card em{font-style:normal;font-size:8px;color:#b36f8b}.rmt-confession-replay-note{margin-top:10px;padding:9px 10px;border:1px dashed #d9cbd1;border-radius:11px;background:#fff9fb;color:#8a747e;font-size:9px;line-height:1.6}
.rmt-ending-confession-stage{margin-top:13px;padding:13px;border:1px solid #ead1dc;border-radius:15px;background:linear-gradient(145deg,#fff8fb,#f8fbfd);box-shadow:0 8px 22px rgba(96,69,82,.07)}.rmt-ending-confession-kicker{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:10px;color:#a56b84;font-size:8px;letter-spacing:.11em}.rmt-ending-confession-kicker b{font-size:8px;color:#8696a4;letter-spacing:0}.rmt-ending-confession-dialogue{display:grid;grid-template-columns:62px minmax(0,1fr);gap:11px;align-items:end}.rmt-ending-confession-avatar{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,#f5bed3,#cfe8f2);color:#fff;border:3px solid #fff;outline:1px solid #dfb7c7;box-shadow:0 5px 14px rgba(87,68,79,.14);font-size:19px}.rmt-ending-confession-avatar img{width:100%;height:100%;object-fit:cover}.rmt-ending-confession-bubble{position:relative;min-height:70px;padding:11px 13px;border:1px solid #e2dfe5;border-radius:14px 14px 14px 4px;background:#fff;color:#5f6572}.rmt-ending-confession-bubble small{display:block;margin-bottom:5px;color:#ac6b87;font-size:9px;font-weight:850}.rmt-ending-confession-bubble p{margin:0!important;color:#5f6572!important;line-height:1.8!important;font-size:12px}.rmt-ending-confession-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin-top:10px}.rmt-ending-confession-actions .rmt-btn{min-width:82px;justify-content:center}.rmt-ending-confession-actions .rmt-btn:disabled{opacity:.42;cursor:default}
.rmt-archive-readonly-control{margin-top:12px;padding:10px 11px;border:1px solid #d7e4ea;border-radius:12px;background:#f8fbfd;display:grid;gap:5px}.rmt-archive-readonly-control label{display:flex;align-items:center;gap:8px;color:#5f7184;font-weight:800;font-size:11px}.rmt-archive-readonly-control input{width:16px;height:16px}.rmt-archive-readonly-control small{color:#8a98a6;line-height:1.55}
.rmt-adv-bulkbar{display:grid;gap:7px;margin:0 0 10px;padding:9px;border:1px dashed #c8dce6;border-radius:12px;background:#f7fbfd;color:#718295;font-size:10px}.rmt-adv-bulkbar .rmt-btn{width:100%}

.rmt-signal{position:relative;display:grid;place-items:center;min-height:190px;overflow:hidden;border:3px double rgba(117,222,247,.76)!important;background:#020912!important;box-shadow:inset 0 0 28px rgba(73,200,236,.08)}
.rmt-signal:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px);pointer-events:none}
.rmt-signal-noise{position:absolute;inset:-20%;opacity:.18;background:repeating-radial-gradient(circle at 30% 40%,#9ee9fb 0 1px,transparent 1px 5px);mix-blend-mode:screen;animation:rmtNoiseDrift .7s steps(2,end) infinite}
.rmt-signal-center{position:relative;z-index:2;text-align:center;letter-spacing:.12em;font-size:11px;color:#bcecf8;text-shadow:0 0 8px #65d7f2;padding:18px}
@keyframes rmtNoiseDrift{0%{transform:translate(-2%,1%)}50%{transform:translate(2%,-1%)}100%{transform:translate(-1%,2%)}}
.rmt-node.true-ending{animation:rmtOmegaGlow 2.6s ease-in-out infinite;border-color:#e9a0c0!important;color:#ffd7e7!important;box-shadow:0 0 8px rgba(233,154,185,.25)}
@keyframes rmtOmegaGlow{0%,100%{opacity:.48;box-shadow:0 0 5px rgba(233,154,185,.16)}50%{opacity:1;box-shadow:0 0 18px rgba(233,154,185,.58)}}
.rmt-room-deep-actions{display:grid;gap:8px;margin:7px 0}.rmt-room-deep-actions .rmt-btn{width:100%;justify-content:flex-start}.rmt-room-deep-toolbar{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #d8e5ec;background:#f8fbfd;color:#6e7f91;font-size:11px}
.rmt-archive-overview{margin-top:14px}.rmt-archive-overview-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.rmt-archive-overview-head>div{display:grid;gap:3px}.rmt-archive-overview-head small{font-size:10px;color:#96a1ad}.rmt-archive-overview-list{display:grid;gap:7px;margin-top:10px;max-height:270px;overflow:auto;padding-right:2px}.rmt-archive-overview-item{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;width:100%;text-align:left;border:1px solid #d8e5eb;background:rgba(255,255,255,.86);border-radius:11px;padding:9px 10px;color:#607184;font:inherit;cursor:pointer}.rmt-archive-overview-item.current{border-color:#e6b1c6;background:#fff7fa}.rmt-archive-overview-item b{display:block;font-size:12px}.rmt-archive-overview-item small{display:block;margin-top:2px;font-size:9px;color:#98a4af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rmt-overview-dot{color:#dfa0b9}.rmt-archive-overview-empty{padding:13px;text-align:center;color:#9aa5af;font-size:11px;border:1px dashed #d9e5ea;border-radius:10px;margin-top:10px}
@media (prefers-reduced-motion: reduce){
  #${core_constants.OVERLAY_ID} *,#${core_constants.OVERLAY_ID} *:before,#${core_constants.OVERLAY_ID} *:after{animation:none!important;transition:none!important}
}
@media(max-width:760px){.rmt-current-archive-card{align-items:stretch}.rmt-current-archive-actions{display:grid;grid-template-columns:1fr;width:100%}.rmt-current-archive-actions .rmt-btn{width:100%;justify-content:center}.rmt-items{grid-template-columns:1fr}.rmt-items-boxes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.rmt-items-grid,.rmt-phone-content{grid-template-columns:1fr}.rmt-phone-shell{min-height:0;border-radius:20px;padding:10px}}
@media(max-width:760px){
  /* Mobile archive: narrower reading column and compact single-column mode cards. */
  .rmt-archive-room{padding:10px 12px 20px;max-width:540px;margin:0 auto}
  .rmt-archive-card{border-radius:15px}
  .rmt-memory-gate{margin:10px 0 0;padding:15px 13px 13px}
  .rmt-archive-title{font-size:18px!important;line-height:1.38}
  .rmt-archive-summary{font-size:11px;line-height:1.68}
  .rmt-archive-keywords{gap:5px}.rmt-archive-keywords span{font-size:9px;padding:3px 7px}
  .rmt-external-memory-row{margin:8px 0 0;padding:9px 10px}
  .rmt-archive-portals{grid-template-columns:1fr;gap:9px;margin:12px 0}
  .rmt-archive-portal{min-height:0;padding:11px 12px;border-radius:15px}
  .rmt-portal-open{display:grid;grid-template-columns:60px minmax(0,1fr);grid-template-areas:"avatar title" "avatar subtitle" "avatar status";column-gap:12px;row-gap:1px;align-items:center;text-align:left;padding:0}
  .rmt-portal-open>.rmt-portal-avatar{grid-area:avatar;width:58px;height:58px;margin:0;font-size:21px;border-width:3px}
  .rmt-portal-open>.rmt-portal-title{grid-area:title;font-size:15px}
  .rmt-portal-open>.rmt-portal-subtitle{grid-area:subtitle;min-height:0;margin-top:1px;font-size:9.5px;line-height:1.4}
  .rmt-portal-open>.rmt-portal-status{grid-area:status;margin-top:0;padding-top:4px;font-size:9px}
  .rmt-portal-open .rmt-portal-ready-dot,.rmt-portal-open .rmt-portal-lock{width:21px;height:21px;font-size:10px;right:-3px;bottom:-1px}
  .rmt-portal-generate{margin-top:8px;min-height:36px;padding:7px 10px}
  .rmt-archive-generate-row{display:grid;gap:8px;padding:10px 11px}.rmt-archive-generate{min-width:0;width:100%}
  /* Character library remains visual, but one card no longer hugs the left edge. */
  .rmt-character-portals{grid-template-columns:repeat(auto-fit,minmax(150px,220px));justify-content:center;align-items:stretch}
  .rmt-character-portals .rmt-archive-portal{min-height:182px;padding:13px 12px;text-align:center}
  .rmt-character-portals .rmt-portal-avatar{width:70px;height:70px;margin:1px auto 9px;font-size:24px;align-self:center}
  .rmt-character-portals .rmt-portal-title{font-size:15px}
  .rmt-character-portals .rmt-portal-subtitle{min-height:0;margin-top:4px}
  .rmt-character-portals .rmt-portal-status{padding-top:8px}

  #${core_constants.OVERLAY_ID}{padding:0}
  #${core_constants.OVERLAY_ID} .rmt-shell{max-height:100vh;border-radius:0;border:0;outline:0}
  dialog#${core_constants.OVERLAY_ID}{padding:0!important}
  #${core_constants.OVERLAY_ID}.rmt-tt-display{
    padding:
      max(env(safe-area-inset-top, 0px),var(--rmt-mobile-safe-top, 0px))
      env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px)
      env(safe-area-inset-left, 0px);
  }
  #${core_constants.OVERLAY_ID}.rmt-tt-display .rmt-shell{max-height:100%}
  dialog#${core_constants.OVERLAY_ID}.rmt-tt-display{
    padding:
      max(env(safe-area-inset-top, 0px),var(--rmt-mobile-safe-top, 0px))
      env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px)
      env(safe-area-inset-left, 0px)!important;
  }
  .rmt-shell:before{display:none}
  .rmt-topbar{min-height:48px;padding:6px 7px 6px 10px;gap:6px}.rmt-topbar-title{font-size:14px;letter-spacing:.025em}.rmt-topbar-title:after{display:none}
  .rmt-topbar button{padding:6px 8px;font-size:11px;min-width:0}
  .rmt-topbar-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rmt-topbar button[data-rmt-action="back"],.rmt-topbar button[data-rmt-action="home"],.rmt-topbar button[data-rmt-action="regenerate"],.rmt-topbar button[data-rmt-action="manage"],.rmt-topbar button[data-rmt-action="close"]{font-size:0;width:44px;height:44px;padding:0;display:grid;place-items:center;flex:0 0 44px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .rmt-topbar button[data-rmt-action="close"]{position:relative;z-index:12;pointer-events:auto}
  .rmt-topbar button[data-rmt-action="back"]:before{content:"←";font-size:17px;line-height:1}
  .rmt-topbar button[data-rmt-action="home"]:before{content:"⌂";font-size:16px;line-height:1}
  .rmt-topbar button[data-rmt-action="regenerate"]:before{content:"↻";font-size:17px;line-height:1}
  .rmt-topbar button[data-rmt-action="manage"]:before{content:"⋯";font-size:20px;line-height:1}
  .rmt-topbar button[data-rmt-action="close"]:before{content:"×";font-size:21px;line-height:1}
  .rmt-topbar button[hidden]{display:none!important}
  .rmt-memory-gate{margin:10px 0 0;padding:15px 13px 13px}.rmt-archive-title{font-size:18px!important}
  [data-rmt-action="archive-character-back"]{width:100%;justify-content:center}
  .rmt-choice{grid-template-columns:1fr;padding:12px;gap:10px}.rmt-choice-card{min-height:125px;padding:18px 16px}
  .rmt-tree-branches{grid-template-columns:repeat(2,minmax(120px,1fr))}.rmt-divergence-map-block{min-height:190px}
  .rmt-album{padding:10px}.rmt-album-head{padding:11px}.rmt-album-layout{grid-template-columns:1fr}
  .rmt-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rmt-info{position:static}
  .rmt-memory-cg{margin:10px 10px 7px;border-width:6px}.rmt-dialogue{margin:0 10px 10px}
  .rmt-adv{grid-template-columns:1fr;min-height:0}.rmt-event-list{border-right:0;border-bottom:1px solid #c9dce6;max-height:none;padding:10px;position:sticky;top:0;z-index:5;background:rgba(248,252,254,.97);box-shadow:0 5px 12px rgba(67,91,108,.06)}.rmt-event-list:before{display:none}.rmt-event-items{display:none}.rmt-adv-mobile-picker{display:grid;gap:8px}.rmt-adv-mobile-picker select{width:100%;min-height:42px;border:1px solid #c9dce6;border-radius:12px;background:#fff;color:#586a7d;padding:8px 10px;font:inherit}.rmt-adv-picker-status{display:flex;align-items:center;gap:8px;min-width:0}.rmt-adv-picker-status b{font-size:10px;color:#9d6d82}.rmt-adv-picker-status span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.rmt-adv-picker-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.rmt-adv-bulkbar{margin-bottom:8px}.rmt-adv-bulkbar .rmt-btn{min-height:38px}.rmt-event-detail{padding:10px 11px 18px}.rmt-memory-scene{min-height:calc(100vh - 55px)}
  .rmt-big-cg{border-width:5px;margin:2px 0 11px}.rmt-cg-caption{left:8px;right:8px;bottom:8px;padding:8px 9px;font-size:10px;line-height:1.45}.rmt-cg-card-draw{right:5px;bottom:5px;min-height:27px;padding:5px 7px;font-size:8px}.rmt-cg-provider-bar{padding:7px 8px;gap:6px;margin-bottom:8px;line-height:1.45}.rmt-mode-actions .rmt-btn{flex:1}.rmt-adv-reader{padding:14px}.rmt-adv-para{font-size:12px;line-height:1.85}
  .rmt-room-view{padding:10px 10px 18px}.rmt-room-map{margin:0 -2px;padding-bottom:9px}.rmt-room-space{min-width:96px;padding:8px 9px}.rmt-room-location{font-size:10px;margin-bottom:10px;align-items:flex-start;gap:7px}.rmt-room-location-actions{flex:0 0 auto;gap:5px}.rmt-room-location .rmt-room-find{padding:5px 7px;font-size:9px}.rmt-room-flow{gap:10px}.rmt-room-card{padding:13px;border-radius:14px}.rmt-room-object-title{font-size:16px}.rmt-room-object-desc,.rmt-room-atmosphere{font-size:11px;line-height:1.68}.rmt-room-stage{border-radius:14px}.rmt-room-stage-head{padding:9px 11px}.rmt-room-activity-strip{padding:8px 10px}.rmt-room-activity-strip>div{grid-template-columns:1fr;gap:3px}.rmt-room-activity-strip small{grid-column:1}.rmt-room-scene{min-height:350px}.rmt-room-person{left:44%;transform:scale(.82);transform-origin:bottom center}.rmt-room-person-label{font-size:9px;padding:2px 5px}.rmt-room-object-rail{grid-template-columns:repeat(2,minmax(0,1fr));padding:8px;gap:6px}.rmt-room-object-chip{grid-template-columns:22px minmax(0,1fr);padding:6px}.rmt-room-object-chip em{grid-column:2}.rmt-room-caption{padding:10px 11px 12px;font-size:11px}.rmt-room-private-access-card{margin-bottom:4px}
  .rmt-phone{padding:5px}.rmt-phone-shell{padding:9px}.rmt-phone-lock{padding:9px 7px}.rmt-phone-apps{gap:6px;padding:6px 0 10px}.rmt-phone-app{min-width:78px;padding:8px 7px}.rmt-phone-content{display:block}.rmt-phone-list,.rmt-phone-detail{padding:10px;border-radius:14px}.rmt-phone-view-list .rmt-phone-detail{display:none}.rmt-phone-view-detail .rmt-phone-list{display:none}.rmt-phone-detail-toolbar{position:sticky;top:0;background:rgba(255,255,255,.96);z-index:2;padding-bottom:7px}.rmt-phone-entry{padding:9px 5px}.rmt-phone-entry span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.rmt-phone-message p{font-size:11px}.rmt-phone-fields>div{grid-template-columns:1fr}
  .rmt-heart{padding:9px}.rmt-heart-tabs{grid-template-columns:1fr}.rmt-achievement-grid{grid-template-columns:1fr}.rmt-heart-greeting-grid{grid-template-columns:1fr}.rmt-heart-drama-layout{grid-template-columns:1fr}.rmt-heart-drama-layout>nav{grid-template-columns:repeat(2,minmax(0,1fr))}.rmt-heart-drama-layout>main{padding:12px}.rmt-heart-drama-head h2,.rmt-heart-strip-head h2{font-size:16px}.rmt-heart-script-bubble{font-size:10px}.rmt-avatar-dialog-card{padding:15px;border-radius:18px}.rmt-avatar-dialog-actions{display:grid;grid-template-columns:1fr}.rmt-character-heart-head{align-items:flex-start}.rmt-character-heart-avatar{width:62px;height:62px;flex-basis:62px}
  .rmt-ending{grid-template-columns:1fr;padding:9px;gap:10px}.rmt-ending-summary{padding:12px}.rmt-ending-list{grid-template-columns:1fr 1fr;gap:6px}.rmt-ending-route{padding:9px}.rmt-ending-detail{padding:13px;border-radius:15px}.rmt-ending-head h2{font-size:18px}.rmt-ending-section p,.rmt-ending-confession{font-size:11px;line-height:1.8}.rmt-ending-confession-stage{padding:10px}.rmt-ending-confession-dialogue{grid-template-columns:48px minmax(0,1fr);gap:8px}.rmt-ending-confession-avatar{width:48px;height:48px}.rmt-ending-confession-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.rmt-ending-confession-actions .rmt-btn{min-width:0;padding:7px 5px;font-size:9px}
  #${core_constants.SETTINGS_ID} .rmt-settings-buttons{grid-template-columns:1fr 1fr}#${core_constants.SETTINGS_ID} .rmt-api-grid{grid-template-columns:1fr 1fr}#${core_constants.SETTINGS_ID} .rmt-model-row{grid-template-columns:1fr}#${core_constants.SETTINGS_ID} .rmt-model-refresh{width:100%!important}
}
/* r36 relationship calendar */
.rmt-calendar-shell{display:flex;flex-direction:column;gap:14px;padding:4px 2px 20px}
.rmt-calendar-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px;border:1px solid rgba(145,158,171,.25);border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.92),rgba(245,247,250,.88));box-shadow:0 12px 28px rgba(52,63,79,.08)}
.rmt-calendar-hero h2{margin:3px 0 8px;font-size:22px;color:#52637a}.rmt-calendar-hero p{margin:0;max-width:760px;color:#7b8796;line-height:1.65;font-size:12px}
.rmt-calendar-counts{display:grid;grid-template-columns:repeat(3,minmax(74px,1fr));gap:8px;min-width:250px}.rmt-calendar-counts span{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;border-radius:14px;background:rgba(255,255,255,.8);border:1px solid rgba(145,158,171,.2);font-size:10px;color:#8390a1}.rmt-calendar-counts b{font-size:20px;color:#52637a;line-height:1.1}
.rmt-calendar-status-tabs,.rmt-calendar-months{display:flex;gap:7px;flex-wrap:wrap}.rmt-calendar-status-tabs button,.rmt-calendar-month{appearance:none;border:1px solid rgba(145,158,171,.28);background:rgba(255,255,255,.78);color:#7a8797;border-radius:999px;padding:7px 11px;font-size:11px;cursor:pointer}.rmt-calendar-status-tabs button.active,.rmt-calendar-month.active{background:#65768d;color:white;border-color:#65768d}.rmt-calendar-month.has-entry:not(.active){box-shadow:inset 0 -2px 0 rgba(101,118,141,.35)}
.rmt-calendar-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px;border-radius:14px;background:rgba(247,249,252,.85);font-size:10px;color:#8490a0}.rmt-calendar-legend span{display:flex;align-items:center;gap:7px}.rmt-calendar-legend i{width:8px;height:8px;border-radius:50%;flex:0 0 8px}.rmt-calendar-legend i.past{background:#8da1b8}.rmt-calendar-legend i.promised{background:#c69b7a}.rmt-calendar-legend i.future{background:#9b91bb}
.rmt-calendar-list{display:flex;flex-direction:column;gap:9px}.rmt-calendar-entry{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;padding:13px 15px;border-radius:16px;border:1px solid rgba(145,158,171,.22);background:rgba(255,255,255,.9)}.rmt-calendar-entry.rmt-calendar-past{border-left:4px solid #8da1b8}.rmt-calendar-entry.rmt-calendar-promised{border-left:4px solid #c69b7a}.rmt-calendar-entry.rmt-calendar-future{border-left:4px solid #9b91bb}
.rmt-calendar-date{display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid rgba(145,158,171,.2);padding-right:12px}.rmt-calendar-date b{font-size:18px;color:#52637a}.rmt-calendar-date small{font-size:9px;color:#9aa5b1;text-transform:uppercase;letter-spacing:.08em}
.rmt-calendar-entry-main{min-width:0}.rmt-calendar-entry-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rmt-calendar-entry-head>b{font-size:14px;color:#536274}.rmt-calendar-badge{font-size:9px;line-height:1;padding:4px 7px;border-radius:999px;background:#eef2f6;color:#738196}.rmt-calendar-entry-main p{margin:7px 0 6px;font-size:12px;line-height:1.65;color:#6f7c8c;white-space:pre-wrap}.rmt-calendar-source{display:block;color:#9aa4b0;font-size:9px}.rmt-calendar-empty{padding:26px 18px;text-align:center;border:1px dashed rgba(145,158,171,.35);border-radius:16px;color:#919baa;font-size:11px}
@media(max-width:720px){.rmt-calendar-hero{flex-direction:column}.rmt-calendar-counts{width:100%;min-width:0}.rmt-calendar-legend{grid-template-columns:1fr}.rmt-calendar-entry{grid-template-columns:62px minmax(0,1fr);padding:11px}.rmt-calendar-date b{font-size:15px}.rmt-calendar-status-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.rmt-calendar-status-tabs button{text-align:center}.rmt-calendar-months{max-height:92px;overflow:auto;padding-bottom:2px}}
/* r37 content controls */
.rmt-manage-shell{display:flex;flex-direction:column;gap:14px;padding:4px 2px 22px}.rmt-manage-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:17px;border:1px solid rgba(145,158,171,.24);border-radius:18px;background:rgba(255,255,255,.9)}.rmt-manage-hero h2{margin:3px 0 7px;color:#52637a}.rmt-manage-hero p,.rmt-manage-note{margin:0;max-width:760px;font-size:11px;line-height:1.65;color:#7b8796}.rmt-manage-note{margin-top:8px;color:#a36e57}.rmt-manage-category-actions,.rmt-manage-actions{display:flex;gap:7px;flex-wrap:wrap}.rmt-manage-category-actions{justify-content:flex-end;min-width:250px}.rmt-manage-danger{border-color:rgba(176,93,93,.45)!important;color:#a65353!important}.rmt-manage-list{display:flex;flex-direction:column;gap:8px}.rmt-manage-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid rgba(145,158,171,.2);border-radius:14px;background:rgba(255,255,255,.88)}.rmt-manage-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.rmt-manage-copy b{font-size:12px;color:#536274}.rmt-manage-copy small{font-size:9px;color:#929daa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:620px}.rmt-manage-empty{padding:24px;text-align:center;border:1px dashed rgba(145,158,171,.35);border-radius:14px;color:#929daa;font-size:11px}@media(max-width:720px){.rmt-manage-hero,.rmt-manage-row{flex-direction:column;align-items:stretch}.rmt-manage-category-actions{min-width:0}.rmt-manage-category-actions .rmt-btn,.rmt-manage-actions .rmt-btn{flex:1}.rmt-manage-copy small{max-width:100%}}


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
