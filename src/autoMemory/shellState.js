// 楼层下面的生成壳只根据已知计划说话。总数未知时不编进度，整份没完成时不显示揭晓。

export function shellBlocksChatInput() {
    return false;
}

export function floorShellCss() {
    return `
.rmt-floor-shell{position:static;clear:both;box-sizing:border-box;margin:8px 0 12px;max-width:100%;pointer-events:auto}
.rmt-floor-shell .rmt-floor-card{margin:0 12px 0 54px;max-width:640px;padding:14px 16px;border:1px solid #cbdce6;border-radius:16px;background:linear-gradient(180deg,#fffdf9 0%,#f7fbfe 100%);color:#4d5d73;box-shadow:0 8px 22px rgba(77,100,118,.08)}
.rmt-floor-shell .rmt-floor-card b{display:block;font-size:16px;line-height:1.55}
.rmt-floor-shell .rmt-floor-card b:before{content:"♥ ";color:#e99ab9}
.rmt-floor-shell .rmt-floor-card p{margin:6px 0 0;color:#7b8798;line-height:1.6}
.rmt-floor-shell .rmt-btn{margin-top:10px}
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
        return { level: 'success', title: '心口一热', message: `${face.line || '一段新的回忆'}。点开楼层下面，就能看见。` };
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
    return { phase: 'hidden', showReveal: false, blocksInput: false, progress: null, title: '', detail: '', moduleId: '' };
}

export function shellView(input = {}) {
    if (input.enabled !== true) return hidden();
    const steps = Array.isArray(input.steps) ? input.steps : [];
    const done = steps.filter(step => step?.status === 'completed').length;
    const allDone = steps.length > 0 && done === steps.length;
    const complete = input.moduleComplete === true && allDone;
    const revealStatus = input.revealStatus || '';
    const moduleId = typeof input.moduleId === 'string' ? input.moduleId : '';
    const face = { blocksInput: false, showReveal: false, progress: null, moduleId };
    if (complete && revealStatus === 'achievement_pending') {
        return { ...face, phase: 'achievement-pending', title: '回忆先留着', detail: '成就还缺一笔，先不拆开。' };
    }
    if (complete && (revealStatus === 'ready' || revealStatus === 'opened')) {
        return { ...face, phase: 'reveal', showReveal: true, title: input.revealLine || revealFace(input), detail: '点击查看详情' };
    }
    if (input.failureRecoverable === true) {
        return { ...face, phase: 'failed', title: '这份回忆可以再续', detail: '已经记下的部分还在，不会把它当成已经拆开。' };
    }
    if (input.paused === true) {
        return { ...face, phase: 'paused', title: '先停在这里', detail: '等待恢复。已经写好的部分不会重做。' };
    }
    if (steps.length && !complete) {
        const started = steps.some(step => step?.status === 'running' || step?.status === 'completed' || step?.status === 'failed');
        if (!started) return { ...face, phase: 'planning', title: '正在建立目录', detail: '目录还没定下来，先不显示第几步。' };
        if (allDone) return { ...face, phase: 'generating', title: '回忆生成中', detail: '还没整份核对完，先不拆开。' };
        const progress = knownProgress(done, steps.length);
        return { ...face, phase: 'generating', progress, title: '正在把这段回忆写下来', detail: progress ? `正在生成 ${progress.done} / ${progress.total}` : '正在生成' };
    }
    if (input.ticketStatus === 'drawn' || input.ticketStatus === 'running') {
        const title = cleanName(input.moduleTitle);
        return { ...face, phase: 'drawn', title: '抽中了一段回忆', detail: title ? `这一页是${title}。` : '还没开始写正文。' };
    }
    if (input.archive) {
        if (input.archive.waiting === true) return { ...face, phase: 'waiting-archive', title: '等待建档', detail: '档案还没开始写。' };
        const progress = knownProgress(input.archive.done, input.archive.total);
        return { ...face, phase: 'archiving', progress, title: '正在把聊天收成档案', detail: progress ? `正在建档 ${progress.done} / ${progress.total}` : '正在建档' };
    }
    if (revealStatus === 'generating' || revealStatus === 'ready' || revealStatus === 'opened') {
        return { ...face, phase: 'generating', title: '回忆生成中', detail: '还没整份写完，先不拆开。' };
    }
    return hidden();
}
