// MirrorTranslate realtime beta public API v1 only. This controller never reads
// extension settings/keys and never persists or writes to the host chat.
const callMessage = value => String(value || '').trim();
const aborted = signal => !!signal?.aborted;

export function inspectMirrorCall(resolve = () => globalThis.__JINGYI__) {
    try {
        const api = resolve();
        const tts = api?.tts, stt = api?.stt, llm = api?.llm;
        if (!tts || !stt || !llm) return { ok: false, message: '未连接镜译实时通话 Beta：请安装并启用支持实时通话的镜译版本。' };
        if (tts.apiVersion !== 1 || typeof tts.status !== 'function' || typeof tts.stream !== 'function'
            || typeof stt.status !== 'function' || typeof stt.start !== 'function'
            || typeof llm.status !== 'function' || typeof llm.stream !== 'function')
            return { ok: false, message: '镜译实时通话 Beta 的公开接口版本不兼容，请更新镜译。' };
        const voice = tts.status(), mic = stt.status(), model = llm.status();
        if (!voice?.enabled) return { ok: false, message: '请先在镜译中打开实时朗读功能。' };
        if (!voice?.hasKey) return { ok: false, message: '请先在镜译中配置实时语音所需的 API Key。' };
        if (voice.busy) return { ok: false, message: '镜译正在进行另一段语音输出，请先在镜译中停止后再通话。' };
        if (!model?.connection) return { ok: false, message: '镜译实时模型尚未连接，请检查镜译的实时通话 Beta 状态。' };
        return { ok: true, api: { tts, stt, llm }, microphone: mic, message: '镜译实时通话 Beta 已就绪。' };
    } catch { return { ok: false, message: '镜译实时通话 Beta 暂时不可用，请等待镜译启动完成后重试。' }; }
}

export function createMirrorCall({ resolve = () => globalThis.__JINGYI__, describe = () => ({}), isCurrent = () => true } = {}) {
    let state = { phase: 'idle', message: '点击开始后再发送第一句话。', speaker: '', turns: [], partial: '', audioPaused: false };
    let prepared = null, flight = null, microphone = null, historyIdentity = '';
    const listeners = new Set();
    const emit = patch => { state = { ...state, ...patch, turns: [...(patch.turns || state.turns)] }; for (const listener of listeners) try { listener({ ...state, turns: [...state.turns] }); } catch {} };
    const current = run => !!run && !run.cancelled && !aborted(run.controller.signal) && prepared?.scope === run.scope && isCurrent(run.scope);
    const cancelTts = run => { try { run?.tts?.cancel?.(); } catch {} try { run?.unsubscribe?.(); } catch {} };
    const cancelMic = item => { try { item?.controller?.abort(); } catch {} try { item?.handle?.cancel?.(); } catch {} };
    const invalidate = run => {
        if (!run || run.cancelled) return;
        run.cancelled = true; try { run.controller.abort(); } catch {} cancelTts(run);
        if (flight === run) {
            flight = null;
            const turns = run.spoken && !run.recorded ? [...state.turns, { role: 'assistant', content: run.spoken, interrupted: true }] : state.turns;
            run.recorded = true; prepared = null;
            emit({ phase: 'idle', message: '角色或档案已变化，通话已停止。已收到的文字仍可保存。', turns, partial: '', audioPaused: false });
        }
    };
    const fail = (run, message) => {
        if (!current(run)) return;
        run.cancelled = true; run.controller.abort(); cancelTts(run);
        if (flight === run) flight = null;
        const turns = run.spoken && !run.recorded ? [...state.turns, { role: 'assistant', content: run.spoken, interrupted: true }] : state.turns;
        run.recorded = true;
        emit({ phase: 'error', message, turns, partial: '', audioPaused: false });
    };
    const addDelta = (run, text) => {
        const next = typeof text === 'string' ? text : '';
        if (!current(run)) { invalidate(run); return false; }
        if (next === run.spoken || next.length < run.spoken.length || !next.startsWith(run.spoken)) {
            if (next !== run.spoken) fail(run, '实时模型返回的累计文本发生重写，已停止朗读并保留已收到文字。');
            return false;
        }
        const delta = next.slice(run.spoken.length); run.spoken = next;
        if (!delta) return true;
        try { run.tts.push(delta); } catch { fail(run, '镜译语音流已中断，已停止本轮通话。'); return false; }
        emit({ phase: 'speaking', partial: next, message: state.audioPaused ? '浏览器暂停了声音，请点击“继续播放”。' : '正在生成并朗读…' });
        return true;
    };
    const stopFlight = (message, ready = true) => {
        const run = flight; if (!run) return false;
        run.cancelled = true; run.controller.abort(); cancelTts(run);
        if (flight === run) flight = null;
        const turns = run.spoken && !run.recorded ? [...state.turns, { role: 'assistant', content: run.spoken, interrupted: true }] : state.turns;
        run.recorded = true;
        if (prepared && isCurrent(prepared.scope)) emit({ phase: ready ? 'ready' : 'idle', message, turns, partial: '', audioPaused: false });
        return true;
    };
    const start = () => {
        if (flight || microphone) return false;
        const connection = inspectMirrorCall(resolve);
        if (!connection.ok) { emit({ phase: 'error', message: connection.message }); return false; }
        let info;
        try { info = describe() || {}; } catch (error) { emit({ phase: 'error', message: callMessage(error?.safeUserMessage || error?.message) || '无法读取当前角色与档案。请回到角色主页后重新打开通话。' }); return false; }
        const scope = info.scope;
        if (!scope || !isCurrent(scope)) { emit({ phase: 'error', message: '当前角色、档案或页面已变化，请重新打开通话。' }); return false; }
        const identity = `${scope}\u0000${callMessage(info.speaker)}`;
        if (historyIdentity && historyIdentity !== identity) emit({ turns: [], partial: '', message: '已切换到新的临时通话，会话文字不会带入当前角色。' });
        historyIdentity = identity;
        prepared = { scope, speaker: callMessage(info.speaker), user: callMessage(info.user) || '你', system: callMessage(info.system), identity };
        emit({ phase: 'ready', message: '已准备好。点击麦克风后才会请求权限；发送文字即可开始。', speaker: prepared.speaker, partial: '' });
        return true;
    };
    const send = async raw => {
        const text = typeof raw === 'string' ? raw : '';
        if (flight || microphone) return false;
        if (!prepared || !isCurrent(prepared.scope)) { emit({ phase: 'error', message: '当前角色、档案或页面已变化，请重新开始通话。' }); return false; }
        if (!text.trim()) { emit({ phase: 'ready', message: '没有收到文字，可以再说一次或直接打字。' }); return false; }
        const connection = inspectMirrorCall(resolve);
        if (!connection.ok) { emit({ phase: 'error', message: connection.message }); return false; }
        const run = { scope: prepared.scope, controller: new AbortController(), cancelled: false, tts: null, unsubscribe: null, spoken: '' };
        flight = run;
        const turns = [...state.turns, { role: 'user', content: text }];
        emit({ phase: 'thinking', message: '正在思考…', turns, partial: '', audioPaused: false });
        try {
            if (!current(run)) return false;
            const tts = connection.api.tts.stream({ speaker: prepared.speaker, signal: run.controller.signal });
            if (!tts || typeof tts.push !== 'function' || typeof tts.end !== 'function' || typeof tts.cancel !== 'function' || !tts.done || typeof tts.done.then !== 'function') throw new Error('tts');
            run.tts = tts;
            // Attach rejection handling immediately so a playback failure during
            // generation is never left as an unhandled promise.
            tts.done.catch(() => fail(run, '镜译朗读失败，已停止本轮通话。'));
            if (typeof tts.on === 'function') run.unsubscribe = tts.on('state', detail => {
                if (!current(run)) { invalidate(run); return; }
                const paused = detail?.state === 'paused' || detail?.blocked === true;
                emit({ audioPaused: paused, ...(paused ? { message: '浏览器暂停了声音，请点击“继续播放”。' } : {}) });
            });
            const messages = [...(prepared.system ? [{ role: 'system', content: prepared.system }] : []), ...turns.map(item => ({ role: item.role, content: item.content }))];
            const final = await connection.api.llm.stream({ messages, signal: run.controller.signal, onText: value => addDelta(run, value) });
            if (!current(run)) return false;
            const answer = typeof final === 'string' && final ? final : run.spoken;
            addDelta(run, answer);
            if (!current(run)) return false;
            if (!answer) throw new Error('empty');
            const completeTurns = [...turns, { role: 'assistant', content: answer }]; run.recorded = true;
            emit({ phase: 'speaking', message: state.audioPaused ? '浏览器暂停了声音，请点击“继续播放”。' : '正在完成朗读…', turns: completeTurns, partial: '' });
            run.tts.end();
            const playback = await run.tts.done;
            if (!current(run)) return false;
            if (playback?.cancelled) { fail(run, '语音播放被停止，文字已保留。'); return false; }
            if (Number(playback?.pieces) > 0 && Number(playback?.played) === 0) { fail(run, '本轮语音未能播放，回复文字已保留；请检查镜译的语音诊断。'); return false; }
            if (flight === run) flight = null;
            emit({ phase: 'ready', message: '这一轮已结束，可以继续说。', turns: completeTurns, partial: '', audioPaused: false });
            return true;
        } catch {
            if (current(run)) fail(run, '实时通话失败，已释放麦克风和语音流；可重新开始。');
            return false;
        } finally {
            try { run.unsubscribe?.(); } catch {}
            if (flight === run && !current(run)) invalidate(run);
        }
    };
    const interrupt = () => {
        const stopped = stopFlight('已打断当前回复。');
        if (microphone) { cancelMic(microphone); microphone = null; if (prepared && isCurrent(prepared.scope)) emit({ phase: 'ready', message: '已停止录音。', partial: '' }); return true; }
        return stopped;
    };
    const record = async () => {
        if (!prepared || !isCurrent(prepared.scope)) { emit({ phase: 'error', message: '当前角色、档案或页面已变化，请重新开始通话。' }); return false; }
        if (microphone) return false;
        if (flight) interrupt();
        const connection = inspectMirrorCall(resolve);
        if (!connection.ok) { emit({ phase: 'error', message: connection.message }); return false; }
        if (!connection.microphone?.available) { emit({ phase: 'error', message: `当前无法使用麦克风：${callMessage(connection.microphone?.reason) || '请检查浏览器麦克风权限。'}` }); return false; }
        const item = { scope: prepared.scope, controller: new AbortController(), handle: null, cancelled: false };
        microphone = item; emit({ phase: 'recording', message: '正在请求并等待麦克风…', partial: '', recordingReady: false });
        try {
            const handle = await connection.api.stt.start({ signal: item.controller.signal, onPartial: value => {
                if (microphone === item && !item.cancelled && !aborted(item.controller.signal) && prepared?.scope === item.scope && isCurrent(item.scope)) emit({ phase: 'recording', partial: typeof value === 'string' ? value : '', message: '正在听…' });
            } });
            item.handle = handle;
            if (microphone !== item || item.cancelled || aborted(item.controller.signal) || !isCurrent(item.scope)) { cancelMic(item); return false; }
            if (!handle || typeof handle.stop !== 'function' || typeof handle.cancel !== 'function') throw new Error('stt');
            emit({ phase: 'recording', message: '正在听，说完后点击“说完了”。', recordingReady: true });
            return true;
        } catch {
            cancelMic(item);
            if (microphone === item) {
                microphone = null;
                if (!item.cancelled && prepared?.scope === item.scope && isCurrent(item.scope)) emit({ phase: 'error', message: '无法开始录音，请检查麦克风权限与镜译实时通话 Beta。', partial: '' });
            }
            return false;
        }
    };
    const finishRecording = async () => {
        const item = microphone;
        if (!item?.handle || item.finishing) return false;
        if (!isCurrent(item.scope)) { cancelMic(item); if (microphone === item) microphone = null; return false; }
        item.finishing = true;
        emit({ phase: 'transcribing', message: '正在识别…', partial: state.partial });
        try {
            const transcript = await item.handle.stop();
            if (microphone !== item || item.cancelled || aborted(item.controller.signal) || !isCurrent(item.scope)) {
                cancelMic(item); if (microphone === item) microphone = null; return false;
            }
            microphone = null; emit({ phase: 'ready', message: '识别完成，正在发送…', partial: '' });
            return await send(typeof transcript === 'string' ? transcript : '');
        } catch { cancelMic(item); if (microphone === item) { microphone = null; if (prepared?.scope === item.scope && isCurrent(item.scope)) emit({ phase: 'error', message: '语音识别失败，已停止录音；可以重试或改用文字。', partial: state.partial }); } return false; }
    };
    const hangup = () => {
        stopFlight('通话已结束。', false); if (microphone) { microphone.cancelled = true; cancelMic(microphone); microphone = null; }
        prepared = null; emit({ phase: 'idle', message: '通话已结束。本次已收到的文字仍保留在此页，可保存下载。', partial: '', audioPaused: false }); return true;
    };
    const resume = () => {
        if (!current(flight)) { invalidate(flight); return false; }
        try { flight.tts?.resume?.(); emit({ audioPaused: false, message: '继续播放…' }); return true; }
        catch { fail(flight, '无法继续播放，文字已保留。'); return false; }
    };
    return { snapshot: () => ({ ...state, turns: [...state.turns] }), subscribe(listener) { listeners.add(listener); listener({ ...state, turns: [...state.turns] }); return () => listeners.delete(listener); }, start, send, interrupt, record, finishRecording, hangup, resume };
}
