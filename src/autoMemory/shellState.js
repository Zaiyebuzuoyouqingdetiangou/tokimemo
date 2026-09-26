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
.rmt-heart-letter{width:min(100%,260px);max-width:100%;min-width:0;margin:10px 0 4px;color:#5c463c}
.rmt-heart-letter:has(.rmt-heart-letter-paper:not([hidden])){width:min(100%,640px)}
.rmt-heart-letter:has(.rmt-heart-letter-paper:not([hidden])) .rmt-heart-letter-seal{display:none}
.rmt-heart-letter [data-rmt-letter-achievement]{margin:0 0 10px;font-weight:650}
.rmt-heart-letter-seal{display:grid;justify-items:center;gap:8px;width:100%;margin:0;padding:0;border:0;background:transparent;color:#6a4a58;box-shadow:none;font:inherit;text-align:center;cursor:pointer}
.rmt-heart-letter-seal small{color:#8d6d78;font-size:12px;line-height:1.4}
.rmt-envelope{display:block;width:min(100%,240px);height:auto;filter:drop-shadow(0 12px 16px rgba(90,24,48,.16))}
.rmt-heart-letter.is-writing .rmt-heart-letter-seal{display:grid!important;cursor:default}
.rmt-heart-letter.is-writing .rmt-heart-letter-paper{display:none!important}
.rmt-heart-letter-paper{margin-top:8px;min-width:0;height:auto!important;max-height:none!important;overflow:visible;padding:16px 14px 12px;border:1px solid #e6d3c4;border-left:7px solid #e99ab9;border-radius:4px 16px 16px 4px;background:#fff8ee;background-image:repeating-linear-gradient(0deg,transparent,transparent 22px,rgba(180,140,120,.16) 23px);color:#5c463c}
.rmt-heart-letter-paper p{margin:0 0 10px;font-size:15px;line-height:1.6}
.rmt-heart-letter-close{margin:0 0 12px}
.rmt-heart-letter .rmt-letter-piece h3{margin:16px 0 8px;font-size:16px}
.rmt-heart-letter .rmt-floor-body{display:block!important;height:auto!important;max-height:70vh!important;max-width:100%;min-width:0;min-height:0;margin-top:10px;overflow:auto!important}
.rmt-heart-letter .rmt-theme-song,.rmt-heart-letter .rmt-song-layout,.rmt-heart-letter .rmt-song-sheet,.rmt-heart-letter .rmt-song-sheet :is(header,section,div,h2,h3,p){position:static!important;display:block!important;height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;flex:none!important;float:none!important;visibility:visible!important;opacity:1!important;transform:none!important;width:auto!important;max-width:100%!important;grid-template-columns:none!important;color:#5c463c!important;-webkit-text-fill-color:#5c463c!important;font-size:15px!important;line-height:1.8!important;white-space:pre-wrap!important}
.rmt-heart-letter .rmt-song-sheet{margin:0 0 8px;padding:4px 2px 8px;border:0!important;background:transparent!important;box-shadow:none!important}
.rmt-heart-letter .rmt-song-sheet h2{font-size:22px!important;font-weight:700!important;margin:4px 0 8px!important}
.rmt-heart-letter .rmt-song-sheet h3{font-size:13px!important;font-weight:650!important;margin:14px 0 6px!important;color:#8d6d78!important;-webkit-text-fill-color:#8d6d78!important}
/* 信里用手机上的模块布局。生图条和会浮出屏幕的明信片留在插件页。 */
.rmt-heart-letter .rmt-floor-body .rmt-cg-format,
.rmt-heart-letter .rmt-floor-body .rmt-cg-provider-bar{display:none!important}
.rmt-heart-letter .rmt-album,
.rmt-heart-letter .rmt-adv,
.rmt-heart-letter .rmt-heart,
.rmt-heart-letter .rmt-ending,
.rmt-heart-letter .rmt-room-view,
.rmt-heart-letter .rmt-travel,
.rmt-heart-letter .rmt-crt,
.rmt-heart-letter .rmt-calendar-shell{min-height:0;max-width:100%;box-sizing:border-box}
.rmt-heart-letter .rmt-info{position:static;top:auto;width:auto;max-width:100%;min-height:0}
.rmt-heart-letter .rmt-travel-postcard,
.rmt-heart-letter .rmt-travel-dialogue,
.rmt-heart-letter .rmt-travel-artifact{position:relative!important;inset:auto!important;transform:none!important;width:auto!important;max-height:none!important}
.rmt-heart-letter .rmt-btn{max-width:100%;white-space:normal}
.rmt-heart-letter .rmt-card:hover{transform:none}
.rmt-heart-letter.is-waiting .rmt-heart-letter-seal{cursor:default}
#chat .mes.rmt-floor-return{outline:2px solid #e99ab9;outline-offset:2px}
`;
}

function splitSelectors(selector) {
    const parts = [];
    let current = '';
    let depth = 0;
    for (const ch of selector) {
        if (ch === '(') depth += 1;
        else if (ch === ')' && depth > 0) depth -= 1;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
}

function scopeNarrowRules(body, scope) {
    let out = '';
    let depth = 0;
    let selector = '';
    for (let index = 0; index < body.length; index += 1) {
        const ch = body[index];
        if (ch === '{') {
            if (depth === 0) {
                const scoped = splitSelectors(selector).map(part => {
                    const sel = part.trim();
                    if (!sel || sel.startsWith('@') || sel.includes(scope)) return sel;
                    return `${scope} ${sel}`;
                }).filter(Boolean).join(',');
                out += `${scoped}{`;
                selector = '';
            } else out += ch;
            depth += 1;
        } else if (ch === '}') {
            depth = Math.max(0, depth - 1);
            out += ch;
        } else if (depth === 0) selector += ch;
        else out += ch;
    }
    return out;
}

// 手机布局写在 max-width 媒体查询里。信比视口窄，桌面上看不到那套规则，这里把它们固定作用在楼层壳上。
export function promoteNarrowLayout(css, scope = '.rmt-floor-shell') {
    const source = String(css || '');
    const chunks = [];
    const pattern = /@media[^{]*max-width\s*:\s*\d+px[^{]*\{/g;
    let match = pattern.exec(source);
    while (match) {
        const start = match.index + match[0].length;
        let depth = 1;
        let index = start;
        while (index < source.length && depth > 0) {
            if (source[index] === '{') depth += 1;
            else if (source[index] === '}') depth -= 1;
            index += 1;
        }
        chunks.push(scopeNarrowRules(source.slice(start, index - 1), scope));
        match = pattern.exec(source);
    }
    return chunks.join('\n');
}

export const GENERATION_STALL_MS = 90_000;

// 没有正在跑的任务，进度签名也一直不变，超过 90 秒就当失败。有请求在跑，或这楼正文还在写，就重新计时。
export function generationStall({ active = false, running = false, storyOpen = false, signature = '', previous = null, now = 0 } = {}) {
    if (!active || running || storyOpen) return { stalled: false, since: 0, signature: '' };
    const same = previous && previous.signature === signature && Number(previous.since) > 0;
    const since = same ? previous.since : now;
    return { stalled: now - since >= GENERATION_STALL_MS, since, signature };
}

export function knownProgress(done, total) {
    if (!Number.isSafeInteger(done) || !Number.isSafeInteger(total) || total < 1 || done < 0 || done > total) return null;
    return { done, total };
}

function letterTitle(input) {
    const written = String(input.revealLine || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 100);
    if (written) return written;
    if (input.preferLibraryAchievement === true) return '';
    return revealFace(input);
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
    if (nextPhase === 'failed') return null;
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
        canRetry: false, canRepairAchievement: false, canComplete: false, canRedo: false,
        canOpen: false,
        moduleTitle: typeof input.moduleTitle === 'string' ? input.moduleTitle : '',
    };
    const drawFloor = Math.floor(Number(input.drawFloor));
    const floorNow = Math.floor(Number(input.floor));
    const planFinished = steps.length > 0 && steps.every(step => step?.status === 'completed');
    const staleLetter = planFinished && Number.isSafeInteger(drawFloor) && drawFloor > 0 && Number.isSafeInteger(floorNow) && floorNow > drawFloor;
    const written = !staleLetter && complete && input.canOpen === true && !running;
    if (!staleLetter && complete && revealStatus === 'achievement_pending') {
        return { ...face, phase: 'achievement-pending', canRepairAchievement: true, title: '回忆先留着', detail: '成就还缺一笔。可以补一次，不必重写正文。' };
    }
    if (!staleLetter && input.roundEmpty === true) {
        return { ...face, phase: 'empty', canComplete: true, canRedo: true, title: '这一页还是空的', detail: '写完了，但是没有新的段落。' };
    }
    if (!staleLetter && (written || (complete && (revealStatus === 'ready' || revealStatus === 'opened')))) {
        return {
            ...face, phase: 'reveal', showReveal: true, canOpen: input.canOpen === true,
            title: letterTitle(input), achievementCopy: input.achievementCopy || '', detail: '点击查看详情',
        };
    }
    if (input.failureRecoverable === true || input.stalled === true) {
        return {
            ...face, phase: 'failed', canRetry: true, canComplete: true,
            title: '这份回忆停住了',
            detail: input.stalled === true
                ? '90 秒没有新的进度。可以补全没写完的部分，或再试一次。'
                : '已经记下的部分还在。可以补全，或再试一次。',
        };
    }
    if (input.paused === true) {
        return { ...face, phase: 'paused', title: '先停在这里', detail: '等待恢复。已经写好的部分不会重做。' };
    }
    if (steps.length && !complete) {
        const started = steps.some(step => step?.status === 'running' || step?.status === 'completed' || step?.status === 'failed');
        if (!started && input.ticketStatus !== 'drawn' && input.ticketStatus !== 'running') {
            return { ...face, phase: 'planning', title: '正在建立目录', detail: '目录还没定下来，先不显示第几步。' };
        }
        const canRetry = started && !running;
        if (allDone) return { ...face, phase: 'generating', canRetry, title: '回忆正在生成中', detail: '正在生成中' };
        const progress = knownProgress(done, steps.length);
        return { ...face, phase: 'generating', canRetry, progress, title: '回忆正在生成中', detail: '正在生成中' };
    }
    if (!staleLetter && !steps.length && input.roundReveal === true && (revealStatus === 'ready' || revealStatus === 'opened')) {
        return {
            ...face, phase: 'reveal', showReveal: true, canOpen: input.canOpen === true,
            title: letterTitle(input), achievementCopy: input.achievementCopy || '', detail: '点击查看详情',
        };
    }
    if (!staleLetter && (input.ticketStatus === 'drawn' || input.ticketStatus === 'running')) {
        return { ...face, phase: 'generating', title: '回忆正在生成中', detail: '正在生成中' };
    }
    if (!staleLetter && (revealStatus === 'ready' || revealStatus === 'opened')) {
        return {
            ...face, phase: 'reveal', showReveal: true, canOpen: input.canOpen === true,
            title: letterTitle(input), achievementCopy: input.achievementCopy || '', detail: '点击查看详情',
        };
    }
    if (revealStatus === 'generating') {
        return { ...face, phase: 'generating', title: '回忆正在生成中', detail: '正在生成中' };
    }
    const interval = Math.floor(Number(input.intervalFloors));
    const left = auto_memory_floor.floorsRemaining(input.floor, input.nextDueFloor);
    const remain = interval === 1 ? '' : auto_memory_floor.formatFloorRemain(left);
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
