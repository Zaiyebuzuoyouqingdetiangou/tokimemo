// 流式生成的开始和结束由本页自己记住。不能只看宿主有没有暴露 generating。

let latched = false;
let idleSince = 0;
// 「开始」之后宿主一直没有任何在生成的迹象，就不再当作在生成：漏掉的「结束」事件不会让页面一直卡着。
const LATCH_IDLE_MS = 20000;

export function noteAssistantStream(open) {
    latched = open === true;
    idleSince = 0;
}

export function assistantStreamLatched() {
    return latched === true;
}

// 停止按钮平时靠样式表藏起来，生成时酒馆给它写上 inline display。
// position:fixed 时 offsetParent 会是空的，不能拿它判断按钮在不在。
export function stopButtonOpen(stop, computedDisplay = '') {
    if (!stop || stop.hidden === true) return false;
    const inline = typeof stop.style?.display === 'string' ? stop.style.display : '';
    if (inline === 'none') return false;
    if (inline === 'flex' || inline === 'block' || inline === 'grid' || inline === 'inline-flex') return true;
    if (!computedDisplay) return false;
    return computedDisplay !== 'none';
}

export function hostGenerationOpen(context) {
    if (globalThis.document?.body?.dataset?.generating === 'true') return true;
    const stream = context?.streamingProcessor;
    if (stream && stream.finished !== true && stream.isFinished !== true && stream.isStopped !== true) return true;
    if (context?.generating === true || context?.isGenerating === true) return true;
    const stop = globalThis.document?.getElementById?.('mes_stop');
    let computed = '';
    try { computed = globalThis.getComputedStyle?.(stop)?.display || ''; } catch { computed = ''; }
    if (stopButtonOpen(stop, computed)) return true;
    const live = globalThis.document?.querySelector?.('#chat .mes.streaming, #chat .mes.mes_streaming, #chat .last_mes.streaming');
    return !!live;
}

export function generationOpen(context, now = Date.now()) {
    const host = hostGenerationOpen(context);
    if (!latched || host) {
        idleSince = 0;
        return latched || host;
    }
    if (!idleSince) idleSince = now;
    if (now - idleSince < LATCH_IDLE_MS) return true;
    latched = false;
    idleSince = 0;
    return false;
}
