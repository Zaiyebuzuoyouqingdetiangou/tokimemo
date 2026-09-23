// Transport selection only. Profiles keep their own credentials and models.
// The pool never copies secrets into content, recovery drafts, or exports.
import * as text from './text.js';

let cursor = 0;
const assigned = new WeakMap();

export function connectionPoolSettings(value = {}) {
    const ids = Array.isArray(value.connectionPoolIds) ? value.connectionPoolIds : [];
    return { connectionPoolEnabled: value.connectionPoolEnabled === true,
        connectionPoolIds: [...new Set(ids.filter(id => typeof id === 'string').map(id => text.normalizeText(id,160)).filter(Boolean))] };
}

export function connectionPoolFingerprint(value) {
    const pool = connectionPoolSettings(value);
    return pool.connectionPoolEnabled ? JSON.stringify(pool.connectionPoolIds) : '';
}

export function selectConnectionTransport(settings, task = null, frozenSelection = null) {
    const pool = connectionPoolSettings(settings);
    if (settings.apiConnectionMode === 'manual' || !pool.connectionPoolEnabled) {
        if (frozenSelection) throw text.safeUserError('本次任务原来使用的轮询连接已停用；旧草稿保留，请恢复原连接池后继续。','RMT_API_CONFIG_CHANGED');
        return settings;
    }
    if (!pool.connectionPoolIds.length) throw text.safeUserError('轮询连接池还没有选择连接。请先勾选连接，或关闭轮询。','RMT_CONNECTION_POOL_EMPTY');
    const fingerprint = connectionPoolFingerprint(settings);
    const usableTask = task && typeof task === 'object';
    const old = frozenSelection || (usableTask ? assigned.get(task) : null);
    let id;
    if (old) {
        if (old.fingerprint !== fingerprint || !pool.connectionPoolIds.includes(old.id)) throw text.safeUserError('本次任务使用的连接池已经变化，请恢复原连接池后继续；旧草稿保留。','RMT_API_CONFIG_CHANGED');
        id = old.id;
    } else {
        id = pool.connectionPoolIds[cursor % pool.connectionPoolIds.length];
        cursor = (cursor + 1) % Number.MAX_SAFE_INTEGER;
        if (usableTask) assigned.set(task,{fingerprint,id});
    }
    // Each selected Profile supplies its own saved model. A primary-profile
    // override must not accidentally route another provider to the wrong model.
    return {...settings,connectionProfileId:id,modelOverride:id === settings.connectionProfileId ? settings.modelOverride : ''};
}
