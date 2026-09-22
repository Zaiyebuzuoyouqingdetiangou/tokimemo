// MirrorTranslate's authorized public API v1 only. No keys, storage or private runtime access.
export const MAX_MIRROR_TEXT = 20000;

export function inspectMirror(resolve = () => globalThis.__JINGYI__) {
    try {
        const api = resolve()?.tts;
        if (!api) return { ok: false, message: '未连接镜译：请安装并启用 MirrorTranslate，再检查连接。' };
        if (api.apiVersion !== 1 || typeof api.speak !== 'function' || typeof api.status !== 'function') {
            return { ok: false, message: '镜译公开接口版本不兼容，请更新镜译。' };
        }
        const status = api.status();
        if (!status?.enabled) return { ok: false, message: '请先在镜译中打开朗读功能。' };
        if (!status.hasKey) return { ok: false, message: '请先在镜译中配置 Fish Audio API Key。' };
        const voices = typeof api.voices === 'function' ? api.voices() : [];
        return { ok: true, api, busy: !!status.busy, voices: Array.isArray(voices) ? voices.filter(v => typeof v?.name === 'string' && v.name.trim()) : [], message: '镜译已连接，使用镜译的音色与语音额度。' };
    } catch {
        return { ok: false, message: '镜译暂时不可用，请在镜译启动完成后检查连接。' };
    }
}

export function createMirrorReader(resolve = () => globalThis.__JINGYI__) {
    let state = { phase: 'idle', locked: false, message: '选择音色后，点击朗读。' };
    let flight = null;
    const listeners = new Set();
    const emit = patch => {
        state = { ...state, ...patch };
        for (const listener of listeners) { try { listener({ ...state }); } catch {} }
    };
    const safeStop = handle => { try { handle?.stop?.(); } catch {} };
    const stop = (message = '已停止。') => {
        if (!flight || flight.cancelled) return;
        flight.cancelled = true;
        flight.abort.abort();
        safeStop(flight.handle);
        emit({ phase: 'stopped', message: `${message} 正在结束本次会话。` });
    };
    const read = async ({ text, speaker = '' } = {}) => {
        if (flight) return false; // Include the period before speak() supplies a handle.
        const body = typeof text === 'string' ? text : '';
        if (!body.trim()) { emit({ phase: 'error', message: '没有可朗读的正文；可选中本页的一段文字再朗读。' }); return false; }
        if (body.trim().length > MAX_MIRROR_TEXT) {
            emit({ phase: 'error', message: '镜译单次最多接收 20,000 字；请选中较短的一段再朗读。正文没有被截断。' }); return false;
        }
        const connection = inspectMirror(resolve);
        if (!connection.ok) { emit({ phase: 'error', message: connection.message }); return false; }
        if (connection.busy) { emit({ phase: 'error', message: '镜译正在朗读其他内容，请先在镜译中停止，再回来朗读。' }); return false; }
        const run = { abort: new AbortController(), cancelled: false, handle: null, unsubscribe: null };
        flight = run;
        emit({ phase: 'preparing', locked: true, index: 0, total: 0, message: '正在准备语音…可以随时停止。' });
        try {
            const handle = await connection.api.speak({ text: body, speaker: String(speaker), analyze: false, play: true, signal: run.abort.signal });
            run.handle = handle;
            if (!handle || typeof handle.stop !== 'function' || !handle.done || typeof handle.done.then !== 'function') {
                safeStop(handle);
                throw new Error('incompatible handle');
            }
            if (run.cancelled) {
                // A v1 session cancelled before its first audio returns an already inactive
                // handle. Stopping that late handle would stop another extension's player.
                if (handle.playing) safeStop(handle);
            } else {
                const progress = value => {
                    if (run.cancelled || flight !== run) return;
                    const total = Math.max(0, Number(value?.total) || 0);
                    const index = Math.min(total, Math.max(0, (Number(value?.index) || 0) + 1));
                    emit({ phase: value?.playing ? 'playing' : 'waiting', index, total,
                        message: value?.playing ? `正在播放${total ? ` · 第 ${index} / ${total} 段` : ''}` : '播放暂歇或正在准备下一段…' });
                };
                progress(handle);
                if (typeof handle.onProgress === 'function') run.unsubscribe = handle.onProgress(progress);
            }
            await handle.done;
            // v1 does not distinguish an external interruption from natural completion.
            if (!run.cancelled) emit({ phase: 'ended', message: '朗读会话已结束。' });
            return !run.cancelled;
        } catch {
            if (!run.cancelled) emit({ phase: 'error', message: '朗读失败，请检查镜译运行记录、语音配置和浏览器播放权限。不会自动重试。' });
            return false;
        } finally {
            try { run.unsubscribe?.(); } catch {}
            if (flight === run) {
                flight = null;
                emit({ locked: false, ...(run.cancelled ? { phase: 'stopped', message: '已停止本次朗读。' } : {}) });
            }
        }
    };
    return {
        read, stop,
        snapshot: () => ({ ...state }),
        subscribe(listener) { listeners.add(listener); listener({ ...state }); return () => listeners.delete(listener); },
    };
}
