// 流式生成的开始和结束由本页自己记住。不能只看宿主有没有暴露 generating。

let latched = false;

export function noteAssistantStream(open) {
    latched = open === true;
}

export function assistantStreamLatched() {
    return latched === true;
}

export function generationOpen(context) {
    if (latched) return true;
    const stream = context?.streamingProcessor;
    if (stream && stream.finished !== true && stream.isStopped !== true) return true;
    if (context?.generating === true || context?.isGenerating === true) return true;
    const stop = globalThis.document?.getElementById?.('mes_stop');
    if (stop && stop.hidden !== true && stop.style?.display !== 'none' && stop.offsetParent !== null) return true;
    const live = globalThis.document?.querySelector?.('#chat .mes.streaming, #chat .mes.mes_streaming, #chat .last_mes.streaming');
    return !!live;
}
