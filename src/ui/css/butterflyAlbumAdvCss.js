// 蝴蝶效应终端、相簿、共同回忆、ADV。
// r84.73 从 ui/styles.js ensureStyles 原样搬出（原第 429–654 行），一个字未改。
// ensureStyles 按 ui/styles.js 里的顺序拼接；层叠顺序有意义，不要调换。
export function butterflyAlbumAdvCss() {
    return `/* 蝴蝶效应：保留 CRT 异常终端感，但改用与「心迹回廊」主 UI 同源的蓝 / 粉 / 柔金色系。 */
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

`;
}
