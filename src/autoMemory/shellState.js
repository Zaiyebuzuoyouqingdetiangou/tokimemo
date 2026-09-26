// 楼层下面的生成壳只说明模块是不是在生成。建档在插件里进行，档案没完成时不挂壳。
import * as auto_memory_floor from './floorPace.js';

export function shellBlocksChatInput() {
    return false;
}

export function floorShellCss() {
    return `
.rmt-floor-shell{position:relative;clear:both;box-sizing:border-box;width:min(96%,640px);margin:8px auto 12px;z-index:1}
.rmt-floor-shell .rmt-floor-status{margin:0 0 8px;font-size:12px;font-weight:650;text-align:center;color:#4d5d73}
.rmt-floor-shell details{margin:0}
.rmt-floor-shell summary{display:block;width:fit-content;max-width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid rgba(0,0,0,.10);border-radius:14px;background:linear-gradient(145deg,#fff,#f7fbfe);color:#4d5d73;box-shadow:0 6px 16px rgba(0,0,0,.07),3px 0 0 #e99ab9 inset;cursor:pointer;list-style:none}
.rmt-floor-shell summary::-webkit-details-marker{display:none}
.rmt-floor-shell summary b{display:block;font-size:15px;line-height:1.5}
.rmt-floor-shell summary small{display:block;margin-top:4px;color:#7b8798;font-size:12px}
.rmt-floor-shell .rmt-floor-note,.rmt-floor-shell .rmt-floor-body{margin-top:8px;min-width:0}
.rmt-floor-shell[data-rmt-pending="1"] details{opacity:.76}
.rmt-floor-shell .rmt-floor-pace{display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;padding:6px 10px;border:1px solid rgba(0,0,0,.08);border-radius:999px;background:#fff;color:#4d5d73;font-size:12px;box-shadow:3px 0 0 #e99ab9 inset}
.rmt-floor-shell .rmt-floor-pace b{font-weight:650}
.rmt-floor-shell .rmt-floor-pace small{color:#7b8798}
.rmt-floor-shell .rmt-floor-fill,.rmt-floor-shell .rmt-heart-letter .rmt-btn{min-height:28px;padding:2px 10px}
.rmt-heart-letter-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.rmt-heart-letter{width:min(100%,320px);max-width:100%;min-width:0;margin:10px 0 4px;color:#5c463c}
.rmt-heart-letter:has(.rmt-heart-letter-paper:not([hidden])){width:min(100%,640px)}
.rmt-heart-letter:has(.rmt-heart-letter-paper:not([hidden])) .rmt-heart-letter-seal{display:none}
.rmt-heart-letter [data-rmt-letter-achievement]{margin:0 0 10px;font-weight:650}
.rmt-heart-letter-seal{display:grid;justify-items:center;gap:2px;width:100%;margin:0;padding:16px 14px 14px;border:1px solid #e7b7c8;border-left:7px solid #e99ab9;border-radius:6px 18px 18px 6px;background:#fff7f2;color:#6a4a58;box-shadow:0 10px 24px rgba(20,12,16,.16);font:inherit;text-align:center;cursor:pointer}
.rmt-heart-letter-seal i{font-style:normal;color:#e07098;font-size:22px;line-height:1}
.rmt-heart-letter-seal b{font-size:15px;line-height:1.4}
.rmt-heart-letter-seal small{color:#8d6d78;font-size:12px}
.rmt-heart-letter-paper{margin-top:8px;min-width:0;overflow:hidden;padding:16px 14px 12px;border:1px solid #e6d3c4;border-left:7px solid #e99ab9;border-radius:4px 16px 16px 4px;background:#fff8ee;background-image:repeating-linear-gradient(0deg,transparent,transparent 22px,rgba(180,140,120,.16) 23px);color:#5c463c}
.rmt-heart-letter-paper p{margin:0 0 10px;font-size:15px;line-height:1.6}
.rmt-heart-letter .rmt-floor-body{max-height:70vh;max-width:100%;min-width:0;margin-top:10px;overflow:auto}
/* 模块页按整页两栏排。在信里改成单栏，生图设置不占信纸。 */
.rmt-heart-letter .rmt-floor-body .rmt-cg-format,
.rmt-heart-letter .rmt-floor-body .rmt-cg-provider-bar{display:none!important}
.rmt-heart-letter .rmt-album,
.rmt-heart-letter .rmt-adv,
.rmt-heart-letter .rmt-heart,
.rmt-heart-letter .rmt-ending,
.rmt-heart-letter .rmt-room-view{min-height:0;max-width:100%;box-sizing:border-box;padding:4px;background:transparent}
.rmt-heart-letter .rmt-album-layout,
.rmt-heart-letter .rmt-adv,
.rmt-heart-letter .rmt-heart-drama-layout,
.rmt-heart-letter .rmt-ending{grid-template-columns:minmax(0,1fr)!important}
.rmt-heart-letter .rmt-album-head{align-items:flex-start}
.rmt-heart-letter .rmt-filter{width:100%;margin-left:0}
.rmt-heart-letter .rmt-grid{grid-template-columns:minmax(0,1fr)}
.rmt-heart-letter .rmt-info{position:static;top:auto;width:auto;max-width:100%;min-height:0}
.rmt-heart-letter .rmt-actions{display:grid;grid-template-columns:minmax(0,1fr)}
.rmt-heart-letter .rmt-btn{max-width:100%;white-space:normal}
.rmt-heart-letter .rmt-card:hover{transform:none}
.rmt-heart-letter.is-waiting .rmt-heart-letter-seal{cursor:default}
#chat .mes.rmt-floor-return{outline:2px solid #e99ab9;outline-offset:2px}
`;
}

export function knownProgress(done, total) {
    if (!Number.isSafeInteger(done) || !Number.isSafeInteger(total) || total < 1 || done < 0 || done > total) return null;
    return { done, total };
}

export function revealFace({ userName = '', achievementTitle = '', moduleTitle = '' } = {}) {
    const who = cleanName(userName) || '你';
    const what = cleanName(achievementTitle) || cleanName(moduleTitle) || '一段回忆';
    return `${who}获得了${what}的成就`;
}

export function toastForTransition(previousPhase, nextPhase, face = {}, { initial = false } = {}) {
    if (initial || !nextPhase || previousPhase === nextPhase) return null;
    if (nextPhase === 'reveal') {
        return { level: 'success', title: '心口一热', message: `今天留下了新的回忆。${face.line || '一段新的回忆'}。点开楼层下面，就能看见。` };
    }
    if (nextPhase === 'failed') {
        return { level: 'error', title: '这份回忆停住了', message: '已经记下的部分还在。楼层下面不会把它当成已经拆开。' };
    }
    if (nextPhase === 'achievement-pending') {
        return { level: 'warning', title: '回忆先留着', message: '成就还缺一笔。先不拆开，写好的部分还在。' };
    }
    return null;
}

function cleanName(value) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
}

function hidden() {
    return { phase: 'hidden', showReveal: false, blocksInput: false, progress: null, title: '', detail: '', moduleId: '', revealId: '' };
}

export function shellView(input = {}) {
    if (input.enabled !== true || input.archiveReady !== true) return hidden();
    const steps = Array.isArray(input.steps) ? input.steps : [];
    const done = steps.filter(step => step?.status === 'completed').length;
    const allDone = steps.length > 0 && done === steps.length;
    const complete = input.moduleComplete === true && allDone;
    const revealStatus = input.revealStatus || '';
    const moduleId = typeof input.moduleId === 'string' ? input.moduleId : '';
    const revealId = typeof input.revealId === 'string' ? input.revealId : '';
    const running = steps.some(step => step?.status === 'running');
    const face = {
        blocksInput: false, showReveal: false, progress: null, moduleId, revealId,
        canRetry: false, canRepairAchievement: false,
    };
    if (complete && revealStatus === 'achievement_pending') {
        return { ...face, phase: 'achievement-pending', canRepairAchievement: true, title: '回忆先留着', detail: '成就还缺一笔。可以补一次，不必重写正文。' };
    }
    if (complete && (revealStatus === 'ready' || revealStatus === 'opened')) {
        return { ...face, phase: 'reveal', showReveal: true, title: input.revealLine || revealFace(input), detail: '点击查看详情' };
    }
    if (input.failureRecoverable === true) {
        return { ...face, phase: 'failed', canRetry: true, title: '这份回忆可以再续', detail: '已经记下的部分还在，不会把它当成已经拆开。' };
    }
    if (input.paused === true) {
        return { ...face, phase: 'paused', title: '先停在这里', detail: '等待恢复。已经写好的部分不会重做。' };
    }
    if (steps.length && !complete) {
        const started = steps.some(step => step?.status === 'running' || step?.status === 'completed' || step?.status === 'failed');
        if (!started) return { ...face, phase: 'planning', title: '正在建立目录', detail: '目录还没定下来，先不显示第几步。' };
        const canRetry = !running;
        if (allDone) return { ...face, phase: 'generating', canRetry, title: '回忆生成中', detail: '还没整份核对完，先不拆开。' };
        const progress = knownProgress(done, steps.length);
        return { ...face, phase: 'generating', canRetry, progress, title: '正在把这段回忆写下来', detail: progress ? `正在生成 ${progress.done} / ${progress.total}` : '正在生成' };
    }
    if (!steps.length && input.roundReveal === true && (revealStatus === 'ready' || revealStatus === 'opened')) {
        return { ...face, phase: 'reveal', showReveal: true, title: input.revealLine || revealFace(input), detail: '点击查看详情' };
    }
    if (input.ticketStatus === 'drawn' || input.ticketStatus === 'running') {
        const title = cleanName(input.moduleTitle);
        return { ...face, phase: 'drawn', title: '抽中了一段回忆', detail: title ? `这一页是${title}。` : '还没开始写正文。' };
    }
    if (revealStatus === 'ready' || revealStatus === 'opened') {
        return { ...face, phase: 'reveal', showReveal: true, title: input.revealLine || revealFace(input), detail: '点击查看详情' };
    }
    if (revealStatus === 'generating') {
        return { ...face, phase: 'generating', title: '回忆生成中', detail: '还没整份写完，先不拆开。' };
    }
    const remain = auto_memory_floor.formatFloorRemain(auto_memory_floor.floorsRemaining(input.floor, input.nextDueFloor));
    if (remain) {
        const pace = { ...face, phase: 'pace', title: '留忆', detail: remain };
        if (input.gapText) {
            pace.gapText = String(input.gapText);
            pace.canFill = input.canFill === true;
        }
        return pace;
    }
    return hidden();
}
