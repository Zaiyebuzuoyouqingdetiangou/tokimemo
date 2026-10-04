const UPDATE_STATE = Symbol.for('heartbeatMemories.selfUpdate');
export const INSTALLED_BUILD = '1.0.13-r84.230-mv-materials';
const PROJECT_REMOTE = 'https://github.com/zaiyebuzuoyouqingdetiangou/tokimemo';
function updateError(message) { const error = new Error(message); error.userMessage = message; return error; }

function installation(moduleUrl, origin) {
    const url = new URL(moduleUrl);
    if (url.origin !== origin) throw updateError('无法确认本插件安装位置，未执行更新。');
    const match = url.pathname.match(/^(.*?)\/scripts\/extensions\/third-party\/([^/]+)\//);
    if (!match) throw updateError('当前不是可识别的第三方扩展安装，未执行更新。');
    if (match[1].startsWith('//')) throw updateError('无法确认更新接口的同源路径。');
    let folder;
    try { folder = decodeURIComponent(match[2]); } catch { throw updateError('本插件目录编码无效。'); }
    if (!/^[\p{L}\p{N}_(). -]{1,120}$/u.test(folder) || folder === '.' || folder === '..' || folder.trim() !== folder) throw updateError('本插件目录名不符合安全要求。');
    return { folder, apiBase: match[1] + '/api/extensions/' };
}

export function ownExtensionFolder(moduleUrl, origin) { return installation(moduleUrl, origin).folder; }

export function installedVersion() {
    return String(globalThis.__heartbeatMemoriesVersion || INSTALLED_BUILD);
}

export function isProjectRemote(value) {
    if (typeof value !== 'string') return false;
    const remote = value.trim().toLowerCase().replace(/^git@github\.com:/, 'https://github.com/').replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/');
    return remote.replace(/\/$/, '').replace(/\.git$/, '') === PROJECT_REMOTE;
}

export async function updateSelf({ moduleUrl = import.meta.url, origin = globalThis.location?.origin,
    context = globalThis.SillyTavern?.getContext?.(), fetcher = globalThis.fetch, isBusy = () => false } = {}) {
    if (globalThis[UPDATE_STATE]) return globalThis[UPDATE_STATE];
    if (isBusy()) throw updateError('请等待生成和档案保存完成后，再更新插件。');
    const { folder, apiBase } = installation(moduleUrl, origin);
    if (typeof context?.getRequestHeaders !== 'function') throw updateError('宿主未提供更新所需的请求接口，请使用管理扩展或手动安装。');
    const job = (async () => {
        const call = async (path, body) => {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
            try {
                const headers = new Headers(context.getRequestHeaders());
                if (body) headers.set('Content-Type', 'application/json');
                const response = await fetcher(apiBase + path, { method: body ? 'POST' : 'GET', headers,
                    ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
                if (!response.ok) throw updateError(response.status === 403 ? '宿主拒绝更新权限；请联系管理员。'
                    : response.status === 404 ? '宿主没有提供此更新接口，请在扩展管理中更新。'
                    : `宿主更新接口返回 HTTP ${response.status}；请检查 Git、网络及服务器日志。`);
                return await response.json();
            } catch (error) {
                if (error?.userMessage) throw error;
                throw updateError(controller.signal.aborted ? '请求超时，服务器可能仍在更新；请稍后检查版本，不要连续重试。' : '更新请求未完成；请检查网络或宿主支持情况。');
            } finally { clearTimeout(timer); }
        };
        try {
            const found = await call('discover');
            const matches = Array.isArray(found) ? found.filter(row => row?.name === 'third-party/' + folder && ['local', 'global'].includes(row.type)) : [];
            if (matches.length !== 1) throw updateError('无法唯一确认本扩展的位置，未执行更新。');
            const target = { extensionName: folder, global: matches[0].type === 'global' };
            const version = await call('version', target);
            if (!version?.currentCommitHash || !version?.remoteUrl) throw updateError('这是 ZIP/非 Git 安装，无法直接拉取；请保留数据并手动覆盖安装新版文件。');
            if (!isProjectRemote(version.remoteUrl)) throw updateError('当前安装的远端不是本项目仓库，未拉取其他来源的代码。');
            const branch = typeof version.currentBranchName === 'string' && version.currentBranchName ? `（${version.currentBranchName} 分支）` : '';
            if (version.isUpToDate === true) return { message: `已检查${branch}：此分支没有新提交。当前运行 ${installedVersion()}。` };
            if (isBusy()) throw updateError('有新的生成任务开始，已暂停插件更新。');
            const result = await call('update', target);
            if (!isProjectRemote(result?.remoteUrl) || !/^[a-f0-9]{7,40}$/i.test(result?.shortCommitHash || '')) throw updateError('更新结果尚未确认，请稍后检查版本。');
            const verified = await call('version', target);
            if (!isProjectRemote(verified?.remoteUrl) || !String(verified?.currentCommitHash || '').startsWith(result.shortCommitHash) || verified.isUpToDate !== true) throw updateError('服务器返回的更新结果尚未确认，请在扩展管理中检查；不要重复点击更新。');
            return { message: `已更新${branch} · 提交 ${result.shortCommitHash}。当前页面仍运行 ${installedVersion()}，保存聊天后刷新以加载新版。` };
        } catch (error) {
            if (error?.userMessage) throw error;
            throw updateError('更新结果尚未确认，请在扩展管理中检查。');
        }
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
