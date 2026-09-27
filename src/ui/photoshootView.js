import * as photoshoots from '../core/photoshootContract.js';
import * as targets from '../core/cgTargets.js';
import * as images from '../generation/imageGeneration.js';
import * as text from '../core/text.js';
import * as expanded from './expandedCgView.js';
import * as overlay from './overlay.js';
import * as editor from './cgPromptEditor.js';
import * as coreState from '../core/state.js';
import * as workspace from './workspaceState.js';

function planDescriptor(session, plan) {
    return targets.describeExpandedCgTarget(session, { kind: 'heart-photoshoot', containerId: plan.id });
}
export function photoshootGalleryHtml(session, { readOnly = false } = {}) {
    const rows = Array.isArray(session?.photoshoots) ? session.photoshoots.map(plan => photoshoots.normalizePhotoshootPlan(plan)).filter(Boolean) : [];
    const cards = rows.map(plan => {
        const descriptor = planDescriptor(session, plan);
        const resolved = descriptor && targets.expandedCgItem(session, descriptor);
        const image = images.normalizeCgImageRecord(resolved?.item?.cgImage);
        const attrs = descriptor ? `data-rmt-photoshoot-target="${text.esc(JSON.stringify(descriptor))}"` : '';
        const capture = {selfie:'自拍',portrait:'他拍',together:'合照'}[plan.capture];
        return `<article class="rmt-photoshoot-card"><h3>${text.esc(plan.title)}</h3><small>${text.esc(capture)} · 3×3 九宫格 / 9:16</small><p>${text.esc(plan.scenePrompt)}</p>${image ? '' : '<p>计划已保存，尚未绘图。</p>'}${expanded.expandedCgHtml(session,{kind:'heart-photoshoot',containerId:plan.id},readOnly)}<details><summary>查看九格瞬间</summary><ol>${plan.moments.map(moment => `<li>${text.esc(moment)}</li>`).join('')}</ol></details></article>`;
    }).join('');
    return `<section class="rmt-photoshoot-gallery" data-rmt-photoshoot-gallery>${cards || '<p>还没有保存的写真计划。</p>'}</section>`;
}
export function photoshootPlanFormHtml({ idPrefix = 'rmt-photoshoot' } = {}) {
    const moments = photoshoots.photoshootDefaultMoments('together', photoshoots.PHOTOSHOOT_ROUTE.FAILED);
    return `<section class="rmt-photoshoot-plan" data-rmt-photoshoot-plan><input type="hidden" data-rmt-photoshoot-route value="failed-photoshoot"><label>场景<textarea data-rmt-photoshoot-scene rows="3" maxlength="1800" placeholder="例如：海边的合照，风太大，总有人没看镜头。"></textarea></label><label>拍摄方式<select data-rmt-photoshoot-capture><option value="selfie">自拍</option><option value="portrait">他拍</option><option value="together" selected>合照</option></select></label><details open><summary>九个意外瞬间 · 可以修改</summary><div data-rmt-photoshoot-moments>${moments.map((moment,index)=>`<label>第 ${index+1} 格<input data-rmt-photoshoot-moment="${index}" maxlength="320" value="${text.esc(moment)}"></label>`).join('')}</div></details><button type="button" class="rmt-btn" data-rmt-photoshoot-save>保存计划并打开图片设置</button><p role="status" data-rmt-photoshoot-status>确认绘图后才会调用生图接口。</p></section>`;
}
export function readPhotoshootPlanForm(root) {
    const scope = root?.querySelector?.('[data-rmt-photoshoot-plan]') || root;
    const scenePrompt = scope?.querySelector?.('[data-rmt-photoshoot-scene]')?.value || '';
    const capture = scope?.querySelector?.('[data-rmt-photoshoot-capture]')?.value || '';
    const route = scope?.querySelector?.('[data-rmt-photoshoot-route]')?.value || '';
    const moments = Array.from({ length: 9 }, (_, index) => scope?.querySelector?.(`[data-rmt-photoshoot-moment="${index}"]`)?.value || '');
    return { route, capture, scenePrompt, moments };
}
export function photoshootTargetFromButton(session, button) {
    try { return targets.resolveCgTargetDescriptor(session, JSON.parse(button?.dataset?.rmtPhotoshootTarget || '')); } catch { return null; }
}

export function renderPhotoshoots() {
    const state=coreState.state, session=state.activeSession;
    if(session?.kind!=='heart') return;
    const readOnly=!!state.activeArchiveSnapshot;
    overlay.topTitle('失败写真');overlay.setBackVisible(true,'内容');overlay.setManageVisible(false);overlay.setRegenerateVisible(false);
    overlay.bodyEl().innerHTML=`<section class="rmt-photoshoots"><header><small>OUTTAKES · 留住没拍好的瞬间</small><h2>失败写真</h2><p>自拍、他拍或合照，把九个小意外放进一张 9:16 的照片。</p></header>${readOnly?'':`<details ${session.photoshoots?.length?'':'open'}><summary>新建一张失败写真</summary>${photoshootPlanFormHtml()}</details>`}${photoshootGalleryHtml(session,{readOnly})}</section>`;
}

export function handlePhotoshootClick(event) {
    const button=event.target?.closest?.('[data-rmt-photoshoot-save]');
    if(!button || workspace.workspace.route!=='failed-photoshoot') return false;
    if(!button.disabled) void savePhotoshoot(button);
    return true;
}

async function savePhotoshoot(button) {
    const state=coreState.state, session=state.activeSession, epoch=workspace.workspace.epoch;
    if(state.activeArchiveSnapshot) return;
    const status=overlay.bodyEl()?.querySelector('[data-rmt-photoshoot-status]');
    button.disabled=true;
    try {
        const descriptor=await images.preparePhotoshootTarget(readPhotoshootPlanForm(overlay.bodyEl()));
        if(!descriptor) throw new Error('档案已经变化，请重新打开失败写真。');
        if(state.activeSession!==session || workspace.workspace.epoch!==epoch || workspace.workspace.route!=='failed-photoshoot') return;
        renderPhotoshoots();editor.openCgPromptEditor({targetDescriptor:descriptor});
    } catch(error) {if(status?.isConnected) status.textContent=text.safeErrorSummary(error);}
    finally {if(button.isConnected)button.disabled=false;}
}

export function photoshootCss(root) {return `
${root} .rmt-photoshoots{max-width:900px;margin:auto;padding:20px;line-height:1.7;color:var(--rmt-theme-text)}
${root} .rmt-photoshoots *{box-sizing:border-box;min-width:0;overflow-wrap:anywhere}
${root} .rmt-photoshoots :is(summary,button){min-height:44px;cursor:pointer}
${root} .rmt-photoshoots>details,${root} .rmt-photoshoot-card{border:1px solid var(--rmt-theme-border);border-radius:18px;padding:18px;margin:18px 0;background:var(--rmt-theme-surface)}
${root} .rmt-photoshoot-plan label{display:grid;gap:7px;margin:14px 0}
${root} .rmt-photoshoot-plan :is(input,textarea,select){width:100%;min-height:44px;padding:10px;font:inherit;font-size:16px;border:1px solid var(--rmt-theme-border);border-radius:9px;background:var(--rmt-theme-bg);color:inherit}
${root} .rmt-photoshoot-plan [data-rmt-photoshoot-moments]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
${root} .rmt-photoshoot-card .rmt-expanded-cg .rmt-thumb{aspect-ratio:9/16;max-height:none;width:min(100%,460px);margin:auto}
@media(max-width:620px){${root} .rmt-photoshoot-plan [data-rmt-photoshoot-moments]{grid-template-columns:1fr}${root} .rmt-photoshoots{padding:14px}}
`;}
