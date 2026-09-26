import * as core_constants from '../../core/constants.js';
// 主窗口外壳、顶栏、通用卡片与按钮、终端头。
// r84.73 从 ui/styles.js ensureStyles 原样搬出（原第 229–428 行），一个字未改。
// ensureStyles 按 ui/styles.js 里的顺序拼接；层叠顺序有意义，不要调换。
export function overlayShellCss() {
    return `
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
  font-weight:800;letter-spacing:.055em;min-width:0;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:#50627b;font-size:18px
}
.rmt-topbar:has(.rmt-live-tasks:not([hidden])) .rmt-topbar-title{flex:0 1 auto;max-width:min(46%,280px)}
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
.rmt-topbar button[data-rmt-action="tasks"]:not(.rmt-live-chip){position:relative;display:inline-grid;place-items:center;width:36px;height:36px;padding:0}
.rmt-topbar button[data-rmt-action="tasks"]:not(.rmt-live-chip) i{font-size:15px;line-height:1;pointer-events:none}
.rmt-task-count{display:inline-grid;place-items:center;min-width:16px;height:16px;margin-left:4px;padding:0 4px;border-radius:999px;background:var(--rmt-theme-accent,#e89ab8);color:var(--rmt-theme-wash-ink,#fff);font-size:10px;line-height:1}
.rmt-topbar button[data-rmt-action="tasks"] .rmt-task-count{position:absolute;top:-4px;right:-4px;margin:0}
.rmt-task-count[hidden]{display:none!important}
.rmt-live-tasks{display:flex;flex:1 1 auto;flex-wrap:nowrap;gap:6px;align-items:center;min-width:0;margin:0 4px;padding:0;overflow:hidden;border:0;background:transparent;position:relative;z-index:9}
.rmt-live-tasks[hidden]{display:none!important}
.rmt-live-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;height:auto;min-height:28px;margin:0;padding:3px 10px;border:1px solid var(--rmt-theme-border,#d7e6ee);border-radius:999px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#243246);font:inherit;font-size:12px;font-weight:700;line-height:1.2;cursor:pointer;box-shadow:none}
.rmt-live-chip b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rmt-live-chip em{flex:0 0 auto;font-style:normal;font-weight:800;color:var(--rmt-theme-accent-ink,#9d6d82)}
.rmt-live-chip i{width:8px;height:8px;border-radius:50%;background:#ed9fbe;box-shadow:0 0 0 3px rgba(237,159,190,.22);animation:rmtPulse 1.5s ease-in-out infinite}
@keyframes rmtPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.72);opacity:.55}}
.rmt-live-fail{background:#fff6f6;border-color:#f0c4c8}
.rmt-live-fail em{color:#c24545}
.rmt-task-center{position:absolute;z-index:30;top:62px;right:12px;width:min(460px,calc(100% - 24px));max-height:min(72vh,620px,calc(100% - 74px));overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:14px;border:1px solid var(--rmt-theme-border,#c9dbe5);border-radius:18px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#243246);box-shadow:0 18px 48px var(--rmt-theme-shadow,rgba(13,22,34,.18))}
.rmt-task-center[hidden]{display:none!important}
.rmt-task-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.rmt-task-head-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.rmt-task-note,.rmt-task-empty{margin:0 0 10px;color:var(--rmt-theme-muted,#728093);font-size:12px;line-height:1.5}
.rmt-task-center h3{margin:14px 0 8px;font-size:12px;letter-spacing:.04em;color:var(--rmt-theme-muted,#728093)}
.rmt-task-card{display:grid;gap:6px;margin:0 0 8px;padding:10px 12px;border:1px solid var(--rmt-theme-border,#e4eef3);border-radius:14px;background:color-mix(in srgb,var(--rmt-theme-surface-solid,#fff) 92%,var(--rmt-theme-bg,#f7fafc))}
.rmt-task-card[data-state="failed"],.rmt-task-card[data-state="retry"]{border-color:#f0c4c8}
.rmt-task-main{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.rmt-task-main b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.rmt-task-state{flex:0 0 auto;padding:2px 8px;border-radius:999px;background:var(--rmt-theme-soft,#f4e7ee);color:var(--rmt-theme-accent-ink,#9d6d82);font-size:11px;font-weight:800}
.rmt-task-state[data-state="running"]{background:#fde7f0;color:#b85b7d}
.rmt-task-state[data-state="failed"],.rmt-task-state[data-state="retry"]{background:#fde8ea;color:#c24545}
.rmt-task-state[data-state="done"]{background:#e7f6ee;color:#3d7a55}
.rmt-task-card p{margin:0;color:var(--rmt-theme-muted,#728093);font-size:12px;line-height:1.45}
.rmt-task-center .rmt-task-actions{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.rmt-task-center .rmt-task-actions .rmt-btn,.rmt-task-head-actions .rmt-btn{min-height:32px;padding:4px 10px;font-size:12px}
.rmt-task-row{padding:10px 0;border-top:1px solid var(--rmt-theme-border,#e4eef3)}
.rmt-task-row header{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.rmt-task-row header span{flex:0 0 auto;color:var(--rmt-theme-accent-ink,#9d6d82);font-size:12px}
.rmt-task-row p{margin:4px 0 0;color:var(--rmt-theme-muted,#728093);font-size:12px;line-height:1.45}
.rmt-task-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.rmt-queue-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:4px 0 12px}
.rmt-queue-bar small{color:var(--rmt-theme-muted,#728093);font-size:12px;line-height:1.45}
.rmt-queue-pick{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;min-height:32px;color:var(--rmt-theme-text,#52647a);font-size:12px;cursor:pointer}
.rmt-queue-pick input{width:16px;height:16px;accent-color:var(--rmt-theme-accent-ink,#9d6d82)}
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
.rmt-archive-cover{max-width:46rem;margin:18px 0;min-width:0}
.rmt-archive-verdict{margin:0 0 16px;padding:18px 22px;border:0;border-inline-start:3px solid var(--rmt-theme-accent,#bd688d);background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#334155);font-size:clamp(17px,2.1vw,21px);font-weight:400;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;text-wrap:pretty}
.rmt-phone-draft-status{margin:12px 16px;font-size:14px;line-height:1.7;overflow-wrap:anywhere;color:var(--rmt-theme-text,#334155)}
.rmt-archive-verdict-empty{margin:12px 0;line-height:1.8}
.rmt-archive-source-fold{margin-top:18px;font-size:14px;line-height:1.8;color:inherit}
.rmt-archive-source-fold summary{cursor:pointer;min-height:44px;display:list-item;padding:10px 4px}
.rmt-archive-source-fold p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 16px}
.rmt-cover-rewrite{min-height:44px}
.rmt-archive-verdict p{margin:0 0 1em;line-height:inherit;font-size:inherit;font-weight:400;color:inherit}
.rmt-archive-verdict p:last-child{margin-bottom:0}
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
.rmt-loading,.rmt-error{min-height:360px;display:grid;place-items:center;text-align:center;padding:28px;line-height:1.7;color:var(--rmt-theme-text,#5e6d80)}
.rmt-spinner{
  width:40px;height:40px;border:3px solid rgba(113,155,175,.18);border-top-color:var(--gs-pink);
  border-right-color:var(--gs-blue);border-radius:50%;animation:rmtSpin .8s linear infinite;margin:auto auto 14px
}
@keyframes rmtSpin{to{transform:rotate(360deg)}}
.rmt-inline-status{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:color-mix(in srgb,var(--rmt-theme-bg,#f7fbfd) 92%,transparent);backdrop-filter:none;font-weight:700;color:var(--rmt-theme-text,#5c6d82)}
.rmt-inline-status[hidden]{display:none}
.rmt-inline-error{margin:10px;padding:10px 12px;border:1px solid #e9a7b5;border-radius:12px;background:#fff5f7;color:#8f4d5f;white-space:pre-wrap}
[data-rmt-auto-memory-root]{display:grid;gap:12px}
[data-rmt-auto-memory-root] h2{margin:0;font-size:20px;line-height:1.35;color:#4d5d73}
[data-rmt-auto-memory-root] p{margin:0;font-size:14px;line-height:1.65;color:#627286}
.rmt-auto-lead{color:#6d7c8c}
.rmt-auto-all{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;padding:10px 12px;border:1px solid #d5e3ea;border-radius:12px;background:#f6fafc;color:#4d5d73;font-size:14px;font-weight:700;cursor:pointer}
.rmt-auto-all input,.rmt-auto-pick input{flex:none;width:18px;height:18px;margin:0;accent-color:#d97ea3}
.rmt-auto-picks{display:grid;gap:8px}
.rmt-auto-pick{display:flex;align-items:flex-start;gap:12px;margin:0;padding:12px 14px;border:1px solid #d7e4eb;border-radius:14px;background:#fff;cursor:pointer}
.rmt-auto-pick:has(input:checked){border-color:#e7b4c9;background:linear-gradient(180deg,#fff,#fff7fa)}
.rmt-auto-pick span{display:grid;gap:4px;min-width:0}
.rmt-auto-pick b{font-size:15px;line-height:1.35;color:#4d5d73}
.rmt-auto-pick span>span,.rmt-auto-note p{font-size:13px;line-height:1.6;color:#627286}
.rmt-auto-pick small,.rmt-auto-note small{font-size:12px;line-height:1.5;color:#8b97a3}
.rmt-auto-note{display:grid;gap:4px;padding:12px 14px;border:1px solid #ead3c4;border-radius:14px;background:#fffaf6}
.rmt-auto-note b{font-size:15px;color:#6d5348}
.rmt-auto-note p{margin:0;color:#6d5348}
.rmt-auto-api{display:grid;gap:10px}
.rmt-auto-api-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.rmt-auto-api-mode{display:grid;gap:4px;min-height:72px;padding:12px;border:1px solid #d5e3ea;border-radius:14px;background:#fff;color:#4d5d73;text-align:left;cursor:pointer}
.rmt-auto-api-mode.is-on{border-color:#e7b4c9;box-shadow:0 0 0 2px rgba(233,154,185,.18)}
.rmt-auto-api-mode b{font-size:15px}
.rmt-auto-api-mode small{font-size:12px;line-height:1.4;color:#8b97a3}
.rmt-auto-api-note{margin:0;font-size:13px;line-height:1.55;color:#738394}
.rmt-auto-api-panel{display:grid;gap:10px}
.rmt-auto-api-panel[hidden]{display:none!important}
.rmt-auto-field{display:grid;gap:4px;min-width:0;font-size:13px;color:#627286}
.rmt-auto-field>span{font-weight:700;color:#4d5d73}
.rmt-auto-field input,.rmt-auto-field select{width:100%;min-height:40px;box-sizing:border-box;border:1px solid #d5e3ea;border-radius:10px;padding:8px 10px;background:#fff;color:#4d5d73;font:inherit}
.rmt-auto-api-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
.rmt-auto-api-save{justify-self:start}

`;
}
