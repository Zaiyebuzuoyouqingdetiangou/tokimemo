const UPDATE_STATE = Symbol.for('heartbeatMemories.selfUpdate');
export const INSTALLED_BUILD = '1.0.26';
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

const HOMEPAGE = 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo';
const FALLBACK_BRANCH = 'main';
const CHECK_THROTTLE_MS = 30_000;
let updateView = { status: 'idle', remoteVersion: '', remoteBranch: FALLBACK_BRANCH, remoteUrl: HOMEPAGE, message: '' };
const updateListeners = new Set();
let checkingPromise = null;
let lastCheckAt = 0;
let checkSequence = 0;

function publishUpdate(next) {
    updateView = { ...updateView, ...next };
    for (const listener of updateListeners) {
        try { listener(hearttraceUpdateSnapshot()); } catch {}
    }
}

export function hearttraceUpdateSnapshot() {
    return { ...updateView };
}

export function subscribeHearttraceUpdate(listener) {
    updateListeners.add(listener);
    return () => updateListeners.delete(listener);
}

function versionParts(value) {
    const match = String(value || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

function revisionNumber(value) {
    const match = String(value || '').match(/r(\d+)(?:\.(\d+))?/i);
    return match ? Number(match[1]) * 1000 + Number(match[2] || 0) : null;
}

export function compareHearttraceVersions(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    if (!a || !b) return 0;
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }
    const leftRevision = revisionNumber(left);
    const rightRevision = revisionNumber(right);
    if (leftRevision == null || rightRevision == null) return 0;
    return leftRevision - rightRevision;
}

export function isNewerHearttraceVersion(latest, current) {
    return compareHearttraceVersions(latest, current) > 0;
}

function parseGithubRepo(remoteUrl) {
    const match = String(remoteUrl || '').trim().match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
    return match ? { owner: match[1], repo: match[2] } : null;
}

function remoteFileUrl(remoteUrl, fileName, branch, cdn) {
    const parsed = parseGithubRepo(remoteUrl);
    if (!parsed) return '';
    const safeBranch = String(branch || '').trim() || FALLBACK_BRANCH;
    const file = String(fileName || '').replace(/^\//, '');
    return cdn
        ? `https://cdn.jsdelivr.net/gh/${parsed.owner}/${parsed.repo}@${encodeURIComponent(safeBranch)}/${file}`
        : `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(safeBranch)}/${file}`;
}

async function readRemoteText(url, fetcher, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetcher(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return '';
        return await response.text();
    } catch {
        return '';
    } finally {
        clearTimeout(timer);
        void label;
    }
}

async function tryReadInstallInfo(moduleUrl, origin) {
    const fn = typeof globalThis.getExtensionInstallationInfo === 'function'
        ? globalThis.getExtensionInstallationInfo
        : globalThis.TavernHelper?.getExtensionStatus;
    if (typeof fn !== 'function') return null;
    try {
        const folder = ownExtensionFolder(moduleUrl, origin);
        return await Promise.race([
            fn(folder),
            new Promise(resolve => { setTimeout(() => resolve(null), 5000); }),
        ]);
    } catch {
        return null;
    }
}

function remoteIdentity(info) {
    return {
        remoteUrl: info?.remote_url || info?.remoteUrl || HOMEPAGE,
        remoteBranch: String(info?.current_branch_name || info?.currentBranchName || '').trim() || FALLBACK_BRANCH,
    };
}

async function fetchRemoteManifestVersion(identity, fetcher) {
    const urls = [...new Set([
        remoteFileUrl(identity.remoteUrl, 'manifest.json', identity.remoteBranch, false),
        remoteFileUrl(identity.remoteUrl, 'manifest.json', identity.remoteBranch, true),
    ].filter(Boolean))];
    for (const url of urls) {
        const text = await readRemoteText(url, fetcher, 'manifest');
        if (!text || text.trim()[0] !== '{') continue;
        try {
            const version = String(JSON.parse(text)?.version || '').trim();
            if (/^\d+\.\d+/.test(version)) return version;
        } catch {}
    }
    return '';
}

const changelogHeading = /^(#{1,3})\s+(\d+\.\d+(?:\.\d+)?)(?:\s*\/\s*(r[\w.-]+))?(?:\s*[·:：\-—]\s*|\s+)?(.*)$/;

export function parseHearttraceChangelog(text) {
    const sections = [];
    let current = null;
    const push = () => {
        if (!current) return;
        const items = [];
        for (const raw of current.lines) {
            const line = raw.replace(/^\s*>\s?/, '').trim().replace(/^[-*]\s+/, '').trim();
            if (line && line !== '---') items.push(line);
        }
        if (current.version || items.length) sections.push({ version: current.version, title: current.title, items });
    };
    for (const line of String(text || '').split(/\r?\n/)) {
        const match = changelogHeading.exec(line.trim());
        if (match) {
            push();
            const revision = match[3] ? `-${match[3]}` : '';
            current = { version: `${match[2]}${revision}`, title: (match[4] || '').trim(), lines: [] };
            continue;
        }
        if (current) current.lines.push(line);
    }
    push();
    return sections;
}

export async function loadHearttraceChangelog({ remoteUrl = HOMEPAGE, remoteBranch = FALLBACK_BRANCH, fetcher = globalThis.fetch.bind(globalThis), moduleUrl = import.meta.url } = {}) {
    const branch = String(remoteBranch || FALLBACK_BRANCH).trim() || FALLBACK_BRANCH;
    const urls = [...new Set([
        remoteFileUrl(remoteUrl, 'CHANGELOG.md', branch, false),
        remoteFileUrl(remoteUrl, 'CHANGELOG.md', branch, true),
    ].filter(Boolean))];
    try {
        const local = new URL('../CHANGELOG.md', moduleUrl);
        local.searchParams.set('rmt-check', String(Date.now()));
        urls.push(local.href);
    } catch {}
    for (const url of urls) {
        const text = await readRemoteText(url, fetcher, 'changelog');
        const sections = parseHearttraceChangelog(text);
        if (sections.length) return { ok: true, sections };
    }
    return { ok: false, sections: [], message: '没能读到更新日志。请检查网络后再打开一次。' };
}

export async function checkHearttraceUpdate({ force = false, moduleUrl = import.meta.url, origin = globalThis.location?.origin, fetcher = globalThis.fetch.bind(globalThis) } = {}) {
    if (updateView.status === 'checking' && checkingPromise) return checkingPromise;
    if (!force && updateView.status !== 'unknown' && Date.now() - lastCheckAt < CHECK_THROTTLE_MS) return hearttraceUpdateSnapshot();
    const sequence = ++checkSequence;
    lastCheckAt = Date.now();
    publishUpdate({ status: 'checking', message: '' });
    checkingPromise = (async () => {
        try {
            const info = await tryReadInstallInfo(moduleUrl, origin);
            const identity = remoteIdentity(info);
            const remoteVersion = await fetchRemoteManifestVersion(identity, fetcher);
            if (sequence !== checkSequence) return hearttraceUpdateSnapshot();
            if (!remoteVersion) {
                publishUpdate({ status: 'unknown', message: '网络不好，没能读到远程版本。', ...identity });
                return hearttraceUpdateSnapshot();
            }
            publishUpdate({
                status: isNewerHearttraceVersion(remoteVersion, installedVersion()) ? 'available' : 'latest',
                message: '',
                remoteVersion,
                ...identity,
            });
            return hearttraceUpdateSnapshot();
        } catch (error) {
            if (sequence === checkSequence) publishUpdate({ status: 'unknown', message: String(error?.userMessage || error?.message || '没能完成检测，请稍后再试。') });
            return hearttraceUpdateSnapshot();
        } finally {
            checkingPromise = null;
        }
    })();
    return checkingPromise;
}

function resolveHostFn(name) {
    if (typeof globalThis[name] === 'function') return globalThis[name].bind(globalThis);
    const helper = globalThis.TavernHelper;
    if (typeof helper?.[name] === 'function') return helper[name].bind(helper);
    return null;
}

function looksLikeGitPullBlocked(error, status = 0, detail = '') {
    const text = `${detail} ${error instanceof Error ? error.message : String(error || '')}`;
    return status === 500 || error?.status === 500 || /not valid JSON|Unexpected token|Internal Server Error|HTTP 500/i.test(text);
}

function reloadTavernPage(delayMs = 800) {
    globalThis.setTimeout(() => {
        try {
            if (typeof globalThis.triggerSlash === 'function') {
                globalThis.triggerSlash('/reload-page');
                return;
            }
        } catch {}
        try { globalThis.location?.reload(); } catch {}
    }, delayMs);
}

function localChangesMessage(branch) {
    return `更新失败：本地扩展目录有改动，酒馆无法 git pull。当前分支是 ${branch}，只有 main 才会用 GitHub 覆盖。请先处理本地改动后再更新。`;
}

function afterPullBlocked(branch, folder) {
    if (branch === 'main') return overwriteFromGithub(folder);
    throw updateError(localChangesMessage(branch));
}

async function overwriteFromGithub(folder) {
    const reinstallFn = resolveHostFn('reinstallExtension');
    if (!reinstallFn) throw updateError('更新失败：本地扩展目录有改动，酒馆无法 git pull。当前环境没有 GitHub 覆盖安装。');
    globalThis.toastr?.info?.('git pull 被本地改动挡住了，改为用 GitHub 版本覆盖…', '心迹回廊');
    const response = await reinstallFn(folder);
    if (response?.ok === true) {
        globalThis.toastr?.success?.('已强制覆盖为 GitHub 版本，正在刷新页面…', '心迹回廊');
        reloadTavernPage();
        return { ok: true, overwritten: true };
    }
    const status = typeof response?.status === 'number' ? response.status : 0;
    let detail = '';
    try { if (typeof response?.text === 'function') detail = (await response.text()).trim(); } catch {}
    throw updateError(detail || (status ? `GitHub 覆盖失败 (HTTP ${status})` : 'GitHub 覆盖失败'));
}

export async function applyHearttraceUpdateAndReload(options = {}) {
    const check = await checkHearttraceUpdate({ ...options, force: true });
    if (check.status !== 'available') {
        publishUpdate({ status: check.status === 'unknown' ? 'unknown' : 'latest' });
        return { ok: true, skipped: true, message: check.status === 'unknown' ? (check.message || '没能确认远程版本，没有发送更新。') : '当前已是最新版本，无需更新' };
    }
    if (options.isBusy?.()) throw updateError('请等待生成和档案保存完成后，再更新插件。');
    const folder = ownExtensionFolder(options.moduleUrl || import.meta.url, options.origin || globalThis.location?.origin);
    const branch = updateView.remoteBranch || FALLBACK_BRANCH;
    const updateFn = resolveHostFn('updateExtension');
    if (updateFn) {
        try {
            const response = await updateFn(folder);
            if (response?.ok === true) {
                globalThis.toastr?.success?.('心迹回廊已更新，正在刷新页面…', '心迹回廊');
                reloadTavernPage();
                return { ok: true };
            }
            const status = typeof response?.status === 'number' ? response.status : 0;
            let detail = '';
            try { if (typeof response?.text === 'function') detail = (await response.text()).trim(); } catch {}
            if (looksLikeGitPullBlocked(null, status, detail)) return afterPullBlocked(branch, folder);
            throw updateError(detail || `宿主更新接口返回 HTTP ${status || '?'}`);
        } catch (error) {
            if (looksLikeGitPullBlocked(error, error?.status, error?.detail)) return afterPullBlocked(branch, folder);
            throw error?.userMessage ? error : updateError(error?.message || '更新未完成，请检查宿主与网络。');
        }
    }
    try {
        const result = await updateSelf(options);
        globalThis.toastr?.success?.(`${result?.message || '心迹回廊已更新'} 正在刷新页面…`, '心迹回廊');
        reloadTavernPage();
        return { ok: true };
    } catch (error) {
        if (looksLikeGitPullBlocked(error, error?.status, error?.detail || error?.userMessage)) return afterPullBlocked(branch, folder);
        throw error;
    }
}
