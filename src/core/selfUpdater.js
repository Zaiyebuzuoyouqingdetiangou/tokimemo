const UPDATE_STATE = Symbol.for('heartbeatMemories.selfUpdate');
const PROJECT_REMOTE = 'https://github.com/zaiyebuzuoyouqingdetiangou/tokimemo';
function updateError(message) { const error = new Error(message); error.userMessage = message; return error; }

export function ownExtensionFolder(moduleUrl, origin) {
    const url = new URL(moduleUrl);
    if (url.origin !== origin) throw updateError('无法确认本插件安装位置，未执行更新。');
    const match = url.pathname.match(/^\/scripts\/extensions\/third-party\/([^/]+)\//);
    if (!match) throw updateError('当前不是可识别的第三方扩展安装，未执行更新。');
    const folder = decodeURIComponent(match[1]);
    if (!/^[\p{L}\p{N}_(). -]{1,120}$/u.test(folder) || folder === '.' || folder === '..' || folder.trim() !== folder) throw updateError('本插件目录名不符合安全要求。');
    return folder;
}

export function isProjectRemote(value) {
    return typeof value === 'string' && value.toLowerCase().replace(/\/$/, '').replace(/\.git$/, '') === PROJECT_REMOTE;
}

export async function updateSelf({ moduleUrl = import.meta.url, origin = globalThis.location?.origin,
    context = globalThis.SillyTavern?.getContext?.(), fetcher = globalThis.fetch, isBusy = () => false } = {}) {
    if (globalThis[UPDATE_STATE]) return globalThis[UPDATE_STATE];
    if (isBusy()) throw updateError('请等待生成和档案保存完成后，再更新插件。');
    const folder = ownExtensionFolder(moduleUrl, origin);
    if (typeof context?.getRequestHeaders !== 'function') throw updateError('宿主未提供更新所需的请求接口，请使用管理扩展或手动安装。');
    const job = (async () => {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
        const call = async (path, body) => {
            const response = await fetcher('/api/extensions/' + path, { method: body ? 'POST' : 'GET',
                headers: context.getRequestHeaders(), ...(body ? { body: JSON.stringify(body) } : {}),
                cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
            if (!response.ok) throw updateError(response.status === 403 ? '宿主拒绝更新权限；请联系管理员，不能在插件内绕过。' : '宿主更新检查失败，请检查 Git、网络及服务器日志；没有重装或删除文件。');
            return response.json();
        };
        try {
            const found = await call('discover');
            const matches = Array.isArray(found) ? found.filter(row => row?.name === 'third-party/' + folder && ['local', 'global'].includes(row.type)) : [];
            if (matches.length !== 1) throw updateError('无法唯一确认本扩展的位置，未执行更新。');
            const target = { extensionName: folder, global: matches[0].type === 'global' };
            const version = await call('version', target);
            if (!version?.currentCommitHash || !version?.remoteUrl) throw updateError('这是 ZIP/非 Git 安装，无法直接拉取；请保留数据并手动覆盖安装新版文件。');
            if (!isProjectRemote(version.remoteUrl)) throw updateError('当前安装的远端不是本项目仓库，未拉取其他来源的代码。');
            if (isBusy()) throw updateError('有新的生成任务开始，已暂停插件更新。');
            const result = await call('update', target);
            if (!isProjectRemote(result?.remoteUrl) || !/^[a-f0-9]{7,40}$/i.test(result?.shortCommitHash || '')) throw updateError('更新结果尚未确认，请稍后检查版本。');
            return { message: result.isUpToDate ? '已强制检查：仓库中没有新更新。' : '已拉取更新。请在保存聊天后手动刷新页面。' };
        } catch (error) {
            if (error?.userMessage) throw error;
            throw updateError(controller.signal.aborted ? '请求超时，服务器可能仍在更新；请稍后检查版本，不要连续重试。' : '更新请求未完成；请检查网络或宿主支持情况。');
        } finally { clearTimeout(timer); }
    })();
    globalThis[UPDATE_STATE] = job;
    try { return await job; } finally { if (globalThis[UPDATE_STATE] === job) delete globalThis[UPDATE_STATE]; }
}

export async function updateFromButton(button, status, options = {}) {
    if (!button || button.disabled) return;
    button.disabled = true;
    const say = text => { if (status) status.textContent = text; };
    say('正在检查并更新…');
    try { say((await updateSelf(options)).message); }
    catch (error) { say(error?.userMessage || '更新未完成，请检查宿主与网络。'); }
    finally { button.disabled = false; }
}
