// 流式生成的开始和结束由本页自己记住。不能只看宿主有没有暴露 generating。

let latched = false;

export function noteAssistantStream(open) {
    latched = open === true;
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
    if (stream && stream.finished !== true && stream.isStopped !== true) return true;
    if (context?.generating === true || context?.isGenerating === true) return true;
    const stop = globalThis.document?.getElementById?.('mes_stop');
    let computed = '';
    try { computed = globalThis.getComputedStyle?.(stop)?.display || ''; } catch { computed = ''; }
    if (stopButtonOpen(stop, computed)) return true;
    const live = globalThis.document?.querySelector?.('#chat .mes.streaming, #chat .mes.mes_streaming, #chat .last_mes.streaming');
    return !!live;
}

export function generationOpen(context) {
    if (latched) return true;
    return hostGenerationOpen(context);
}
