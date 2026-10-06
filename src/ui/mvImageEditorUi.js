// Presentation only. Pixel edits, undo, storage and prompt generation remain in
// their existing modules; this layout keeps the canvas and save actions visible.
export function imageEditorMarkup({ hasNext = false, showPrompt = true } = {}) {
    return `<section class="rmt-mv-editor rmt-mvi-workbench" data-tools-open="false" aria-label="图片编辑">
      <header class="rmt-mvi-header"><button type="button" data-edit="close" aria-label="返回，放弃未保存修改">返回</button><div><b data-image-title>图片编辑</b><small data-image-scope></small></div><button type="button" data-edit="tools" aria-expanded="false">展开工具</button></header>
      <div class="rmt-mvi-layout">
        <section class="rmt-mvi-visual" aria-label="编辑画布">
          <div class="rmt-mvi-canvas-tools"><button type="button" data-edit="pan" aria-pressed="false">移动</button><label><span data-zoom-value>100%</span><input data-zoom type="range" min="1" max="4" step="0.25" value="1" aria-label="画布缩放"></label><button type="button" data-edit="fit">看全图</button><button type="button" data-edit="compare" aria-pressed="false">对比</button></div>
          <div class="rmt-mv-editor-viewport"><canvas data-editor-canvas aria-label="素材裁切与抠图画布"></canvas><span class="rmt-mvi-brush-cursor" data-brush-cursor hidden aria-hidden="true"></span></div>
        </section>
        <section class="rmt-mvi-inspector" aria-label="图片编辑工具">
          <nav class="rmt-mvi-tabs" aria-label="编辑方式"><button type="button" data-edit="select" aria-pressed="true">选单格</button><button type="button" data-edit="crop" aria-pressed="false">自由裁切</button><button type="button" data-edit="paint" aria-pressed="false">抠图修边</button></nav>
          <div class="rmt-mvi-tool-scroll" hidden>
            <div data-select-tools><label data-grid-picker>拼图排列<select data-grid><option value="free">手动框选</option><option value="1:1">整张</option><option value="2:1">上下两格</option><option value="3:1">上下三格</option><option value="4:1">上下四格</option><option value="1:2">左右两格</option><option value="1:3">左右三格</option><option value="1:4">左右四格</option><option value="2:2">四宫格</option><option value="3:3">九宫格</option></select></label><p class="rmt-x-note" data-selection-note>拖动框选画面，或选择排列后点选一格。</p><div class="rmt-mv-editor-tools"><button type="button" data-edit="apply-crop">使用选中画面</button><button type="button" data-edit="full-crop">整张入画</button></div></div>
            <div data-paint-tools hidden><div class="rmt-mv-editor-tools"><button type="button" data-edit="auto">一键抠图</button><button type="button" data-edit="erase" aria-pressed="true">擦除</button><button type="button" data-edit="restore" aria-pressed="false">恢复</button><button type="button" data-edit="region" aria-pressed="false">点除残底</button></div><label class="rmt-mvi-brush">笔刷<input data-brush type="range" min="1" max="100" value="20" aria-label="笔刷大小"><span data-brush-size>20 像素</span></label></div>
            <div class="rmt-mv-editor-tools"><button type="button" data-edit="reset">还原选中画面</button></div>
            <label class="rmt-mvi-layer"><input data-layer type="checkbox">使用此透明图叠背景</label>
            <div class="rmt-mvi-matte" aria-label="检查透明边缘"><small data-image-size></small><div><button type="button" data-matte="grid" aria-pressed="true">透明底</button><button type="button" data-matte="dark" aria-pressed="false">深色底</button><button type="button" data-matte="light" aria-pressed="false">浅色底</button></div></div>
            <details class="rmt-mvi-more"><summary>导入、原图与下载</summary><div class="rmt-mv-editor-tools"><label class="rmt-mv-editor-upload">导入图片<input type="file" accept="image/*" data-import="full"></label><label class="rmt-mv-editor-upload">导入透明图<input type="file" accept="image/png,image/webp" data-import="cutout"></label><button type="button" data-edit="download">下载当前 PNG</button><button type="button" data-edit="original">恢复原图</button></div></details>
            <details class="rmt-mvi-more"${showPrompt ? '' : ' hidden'}><summary>本张生图提示词</summary><label>提示词<textarea data-editor-prompt rows="6"></textarea></label><div class="rmt-mv-editor-tools"><button type="button" data-edit="default-prompt">恢复默认提示词</button></div><p class="rmt-x-note">保存不重新生图；重画时才使用新提示词。</p></details>
          </div>
        </section>
      </div>
      <footer class="rmt-mvi-footer"><p role="status" aria-live="polite" data-editor-status></p><div class="rmt-mvi-save-row"><button type="button" data-edit="undo" aria-label="撤销上一步">撤销</button><button type="button" class="rmt-mvi-primary" data-edit="save">保存修改</button><button type="button" data-edit="save-next"${hasNext ? '' : ' hidden'}>保存并下一镜</button></div></footer>
    </section>`;
}

export function imageEditorCss(root) {
    const r = `${root} .rmt-body.rmt-mve-body`;
    return `
${root} .rmt-shell.rmt-mvi-focus>.rmt-topbar,${root} .rmt-shell.rmt-mvi-focus>.rmt-workspace-tabs,${root} .rmt-shell.rmt-mvi-focus>.rmt-workspace-location{display:none!important}
${root} .rmt-shell.rmt-mvi-focus>.rmt-body.rmt-mve-body{display:flex!important;flex:1 1 0!important;min-height:0;padding:8px!important;overflow:hidden!important}
${r} .rmt-mve-image-page{display:flex;flex-direction:column;flex:1 1 0;min-height:0;max-width:none;width:100%;gap:0;padding:0}
${r} [data-rmt-mv-editor-host]{display:flex;flex:1;min-height:0;min-width:0}
${r} .rmt-mvi-loading{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
${r} .rmt-mvi-workbench{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;width:100%;gap:6px;overflow:hidden;container-type:inline-size}
${r} .rmt-mvi-workbench,${r} .rmt-mvi-workbench *{box-sizing:border-box}
${r} .rmt-mvi-workbench [hidden]{display:none!important}
${r} .rmt-mvi-workbench button{font:inherit;font-size:13px!important;line-height:1.3!important;min-height:44px;padding:7px 12px;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:999px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#294762);cursor:pointer;touch-action:manipulation;box-sizing:border-box}
${r} .rmt-mvi-workbench button[aria-pressed=true]{border-color:var(--rmt-theme-accent-ink,#4f769d);background:var(--rmt-theme-soft,#e7f1fa)}
${r} .rmt-mvi-workbench button:disabled{opacity:.5;cursor:default}
${r} .rmt-mvi-workbench button:focus-visible,${r} .rmt-mvi-workbench summary:focus-visible{outline:2px solid var(--rmt-theme-accent-ink,#4f769d);outline-offset:2px}
${r} .rmt-mvi-header{display:flex;align-items:center;justify-content:flex-start;gap:12px;flex:none;padding:0 0 6px;border-bottom:1px solid var(--rmt-theme-border,#cddfed)}
${r} .rmt-mvi-header>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
${r} .rmt-mvi-header button{flex:none;white-space:nowrap}
${r} .rmt-mvi-header b{font-size:15px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mvi-header small{font-size:11px!important;color:var(--rmt-theme-muted,#63788f);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${r} .rmt-mvi-layout{flex:1;min-height:0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:6px}
${r} .rmt-mvi-workbench[data-tools-open=true] .rmt-mvi-layout{grid-template-rows:minmax(0,1fr) minmax(0,.5fr)}
${r} .rmt-mvi-visual{display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:12px;background:var(--rmt-theme-soft,#e7f1fa)}
${r} .rmt-mvi-canvas-tools,${r} .rmt-mvi-matte{display:flex;align-items:center;justify-content:space-between;gap:7px;flex:none;padding:6px 8px}
${r} .rmt-mvi-canvas-tools>label{flex:1;display:flex;flex-direction:row;align-items:center;gap:6px;margin:0;font-size:11px!important;min-width:0;white-space:nowrap}
${r} .rmt-mvi-workbench input[type=range]{appearance:none!important;-webkit-appearance:none!important;display:block;min-width:0;min-height:44px!important;height:44px!important;max-height:44px!important;width:100%;padding:0!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;filter:none!important;touch-action:pan-y;cursor:pointer}
${r} .rmt-mvi-workbench input[type=range]::-webkit-slider-runnable-track{height:6px!important;border:0!important;border-radius:999px!important;background:var(--rmt-theme-border,#cddfed)!important;box-shadow:none!important}
${r} .rmt-mvi-workbench input[type=range]::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:22px!important;height:22px!important;margin-top:-8px!important;border:2px solid var(--rmt-theme-surface-solid,#fff)!important;border-radius:50%!important;background:var(--rmt-theme-accent-ink,#4f769d)!important;box-shadow:0 1px 4px #0003!important}
${r} .rmt-mvi-workbench input[type=range]::-moz-range-track{height:6px;border:0;border-radius:999px;background:var(--rmt-theme-border,#cddfed)}
${r} .rmt-mvi-workbench input[type=range]::-moz-range-thumb{width:18px;height:18px;border:2px solid var(--rmt-theme-surface-solid,#fff);border-radius:50%;background:var(--rmt-theme-accent-ink,#4f769d)}
${r} .rmt-mvi-canvas-tools input[type=range]{width:0;flex:1}
${r} .rmt-mvi-canvas-tools button,${r} .rmt-mvi-matte button{font-size:11px!important;min-height:44px;padding:4px 8px;white-space:nowrap}
${r} .rmt-mvi-visual .rmt-mv-editor-viewport{flex:1 1 0;min-height:0;max-height:none;width:100%;overflow:auto;overscroll-behavior:contain;position:relative;isolation:isolate}
${r} .rmt-mvi-visual [data-editor-canvas]{margin:0 auto;max-width:none;flex:none}
${r} .rmt-mvi-brush-cursor{position:absolute;z-index:2;display:block;pointer-events:none;transform:translate(-50%,-50%);border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #253445,inset 0 0 0 1px #253445;box-sizing:border-box}
${r} .rmt-mvi-matte>div{display:flex;gap:4px}
${r} .rmt-mvi-matte>small{font-size:10px;color:var(--rmt-theme-muted,#63788f);white-space:nowrap}
${r} .rmt-mv-editor-viewport[data-editor-matte=dark]{background:#253445}
${r} .rmt-mv-editor-viewport[data-editor-matte=light]{background:#f8fbfe}
${r} .rmt-mvi-inspector{display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;background:var(--rmt-theme-surface-solid,#fff);border:1px solid var(--rmt-theme-border,#cddfed);border-radius:12px}
${r} .rmt-mvi-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;flex:none;padding:5px;background:var(--rmt-theme-soft,#e7f1fa)}
${r} .rmt-mvi-tabs button{font-size:12px;min-height:44px;padding:6px 3px}
${r} .rmt-mvi-tool-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:auto;padding:10px 12px;scrollbar-width:thin;touch-action:pan-y pinch-zoom}
${r} .rmt-mvi-tool-scroll .rmt-mv-editor-tools{gap:6px;margin:4px 0}
${r} .rmt-mvi-tool-scroll .rmt-mv-editor-tools button{flex:1 0 auto;min-height:44px;padding:6px 10px;font-size:12px}
${r} .rmt-mvi-tool-scroll label{font-size:12px!important}
${r} .rmt-mvi-tool-scroll input:not([type=checkbox]):not([type=range]),${r} .rmt-mvi-tool-scroll select,${r} .rmt-mvi-tool-scroll textarea{font-size:16px}
${r} .rmt-mvi-tool-scroll .rmt-mvi-brush{display:flex;flex-direction:row;align-items:center;gap:8px}
${r} .rmt-mvi-tool-scroll .rmt-mvi-brush input{flex:1;width:0}
${r} .rmt-mvi-brush>span{flex:none;min-width:55px;font-size:11px!important;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
${r} .rmt-mvi-tool-scroll .rmt-mvi-layer{display:flex;flex-direction:row;align-items:center;gap:8px;line-height:1.5;margin:8px 0}
${r} .rmt-mvi-layer input{width:18px;min-width:18px;height:18px;margin:0}
${r} .rmt-mvi-more{margin-top:8px}
${r} .rmt-mvi-more summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:12px!important;padding:7px 12px;box-sizing:border-box;border:1px solid var(--rmt-theme-border,#cddfed);border-radius:999px;background:var(--rmt-theme-surface-solid,#fff)}
${r} .rmt-mvi-workbench .rmt-x-note{margin:5px 0;font-size:11px;line-height:1.6}
${r} .rmt-mvi-footer{flex:none;position:relative;z-index:3;padding:6px 0 max(2px,env(safe-area-inset-bottom,0px));border-top:1px solid var(--rmt-theme-border,#cddfed);background:var(--rmt-theme-bg,#f5f9fd)}
${r} .rmt-mvi-footer p{font-size:11px!important;line-height:1.5!important;color:var(--rmt-theme-muted,#63788f);margin:0 0 5px;max-height:3em;overflow:auto}
${r} .rmt-mvi-footer p:empty{display:none}
${r} .rmt-mvi-save-row{display:flex;align-items:center;gap:7px}
${r} .rmt-mvi-save-row button{min-height:48px;padding:8px 10px;white-space:nowrap;font-weight:600!important}
${r} .rmt-mvi-save-row [data-edit=undo]{min-width:64px}
${r} .rmt-mvi-workbench .rmt-mvi-primary{flex:1;background:var(--rmt-theme-accent-ink,#4f769d)!important;color:var(--rmt-theme-surface-solid,#fff)!important;border-color:var(--rmt-theme-accent-ink,#4f769d)!important;font-weight:700!important}
@media(min-width:960px){${r} .rmt-mvi-workbench[data-tools-open=true] .rmt-mvi-layout{grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:minmax(0,1fr)}}
@supports(container-type:inline-size){${r} .rmt-mvi-workbench[data-tools-open=true] .rmt-mvi-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,.5fr)}@container(min-width:740px){${r} .rmt-mvi-workbench[data-tools-open=true] .rmt-mvi-layout{grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:minmax(0,1fr)}}}
@media(max-height:600px) and (orientation:landscape) and (min-width:600px){${r} .rmt-mvi-workbench[data-tools-open=true] .rmt-mvi-layout{grid-template-columns:minmax(0,1fr) minmax(240px,.65fr);grid-template-rows:minmax(0,1fr)}${r} .rmt-mvi-header{padding-bottom:3px}${r} .rmt-mvi-workbench{gap:4px}}
`;
}
