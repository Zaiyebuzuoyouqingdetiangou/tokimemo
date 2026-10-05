// 用户主动导入音乐链接：公开媒体元数据 → 当前剪辑台的单一音轨。
// 尝试酒馆已有的同源 CORS 路由；不启用宿主设置，不转发登录凭据。
function linkError(message, code, status = 0) {
    return Object.assign(new Error(message), { code, status });
}

export function musicUrl(value, base) {
    let url;
    try { url = new URL(String(value || '').trim(), base); }
    catch { throw linkError('请粘贴完整的音乐链接。', 'RMT_MV_LINK_URL'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
        throw linkError('请使用 HTTPS 音乐链接。', 'RMT_MV_LINK_URL');
    }
    url.hash = '';
    return url.href;
}

function decodeAttribute(value) {
    return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (full, entity) => {
        const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
        if (entity[0] !== '#') return named[entity.toLowerCase()] || full;
        const point = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : full;
    });
}

function attributes(tag) {
    const result = Object.create(null);
    for (const match of tag.matchAll(/([^\s=<>"'`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"'`]+))/g)) {
        const name = match[1].toLowerCase();
        if (!(name in result)) result[name] = decodeAttribute(match[2] ?? match[3] ?? match[4]);
    }
    return result;
}

export function publicMusicSource(html, base) {
    // Strip inert text containers first: an example or script string is not a published media tag.
    const clean = String(html || '').replace(/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
    const metas = [...clean.matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>/gi)].map(match => attributes(match[0]));
    const title = metas.find(meta => String(meta.property || meta.name).toLowerCase() === 'og:title')?.content || '';
    const sources = [];
    for (const key of ['og:audio:secure_url', 'og:audio:url', 'og:audio', 'twitter:player:stream']) {
        for (const meta of metas) if (String(meta.property || meta.name).toLowerCase() === key && meta.content) sources.push(meta.content);
    }
    // JSON-LD 是页面公开的结构化媒体描述，只解析 JSON，绝不执行脚本。
    const descriptors = String(html || '').replace(/<!--[\s\S]*?(?:-->|$)|<(style|textarea|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
    for (const match of descriptors.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (attributes(match[1]).type?.toLowerCase() !== 'application/ld+json') continue;
        try {
            const pending = [JSON.parse(match[2])];
            while (pending.length) {
                const item = pending.pop();
                if (!item || typeof item !== 'object') continue;
                if (Array.isArray(item)) { pending.push(...item); continue; }
                const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
                if (types.some(type => /^(?:https?:\/\/schema\.org\/)?AudioObject$/i.test(type || '')) && typeof item.contentUrl === 'string') sources.push(item.contentUrl);
                if (item['@graph']) pending.push(item['@graph']);
                if (item.audio) pending.push(item.audio);
                if (item.associatedMedia) pending.push(item.associatedMedia);
            }
        } catch {} // A malformed optional descriptor is not a reason to discard normal media tags.
    }
    for (const match of clean.matchAll(/<audio\b(?:"[^"]*"|'[^']*'|[^'">])*>([\s\S]*?)(?:<\/audio\s*>|$)/gi)) {
        const opening = match[0].match(/^<audio\b(?:"[^"]*"|'[^']*'|[^'">])*>/i)?.[0] || '';
        const direct = attributes(opening).src;
        if (direct) sources.push(direct);
        for (const source of match[1].matchAll(/<source\b(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>/gi)) {
            const attr = attributes(source[0]);
            if (attr.src && (!attr.type || attr.type.toLowerCase().startsWith('audio/'))) sources.push(attr.src);
        }
    }
    for (const source of sources) {
        try {
            const url = musicUrl(source, base);
            if (/\/(?:silence\.(?:mp3|wav)|api\/forbidden)\/?(?:\?|$)/i.test(new URL(url).pathname)) continue;
            if (url !== musicUrl(base)) return { url, title: title.replace(/\s+/g, ' ').trim().slice(0, 120) };
        } catch {} // Invalid published candidates never become requests.
    }
    return null;
}

export function sunoSongPage(html, base) {
    const origin = new URL(base);
    if (!/^(?:www\.)?suno\.com$/i.test(origin.hostname)) return '';
    const clean = String(html || '').replace(/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
    for (const match of clean.matchAll(/<(?:meta|link)\b(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>/gi)) {
        const attr = attributes(match[0]);
        const value = (attr.property || '').toLowerCase() === 'og:url' ? attr.content : (attr.rel || '').toLowerCase() === 'canonical' ? attr.href : '';
        if (!value) continue;
        try {
            const url = new URL(musicUrl(value, base));
            if (/^(?:www\.)?suno\.com$/i.test(url.hostname) && /^\/song\/[0-9a-f-]{36}\/?$/i.test(url.pathname)) return url.href;
        } catch {}
    }
    return '';
}

function abortReason(signal) { return signal?.reason || new DOMException('已取消', 'AbortError'); }

// Some WebView fetch bridges do not settle their promise when aborted. The UI
// must still leave its loading state; late responses cannot commit a new track.
export function waitMusicRequest(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
        if (signal.aborted) { Promise.resolve(promise).catch(() => {}); reject(abortReason(signal)); return; }
        const cancel = () => { signal.removeEventListener('abort', cancel); reject(abortReason(signal)); };
        signal.addEventListener('abort', cancel, { once: true });
        Promise.resolve(promise).then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
    });
}

function sunoPublicHost(url) {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.port && /^(?:(?:www\.)?suno\.com|cdn\d*\.suno\.(?:ai|com))$/i.test(parsed.hostname);
}

function hostProxyAvailable() {
    // TT's published API does not promise /proxy or generic native HTTP. Do not
    // guess Rust commands or import private host modules to manufacture it.
    return /^(?:https?:)$/.test(globalThis.location?.protocol || '') && !globalThis.__TAURITAVERN__
        && typeof globalThis.SillyTavern?.getContext === 'function';
}

export function musicLinkName(url) {
    const parsed = new URL(url);
    let name = parsed.pathname.split('/').filter(Boolean).at(-1) || '';
    try { name = decodeURIComponent(name); } catch {}
    return /\.(?:mp3|m4a|mp4|aac|wav|ogg|opus|flac|webm)$/i.test(name) ? name.slice(0, 80) : '链接歌曲';
}

export async function readMusicLink(value, { signal, fetcher = globalThis.fetch, allowStreaming = true, hostProxy = hostProxyAvailable() } = {}) {
    const sourceUrl = musicUrl(value);
    let proxyUnavailable = false;
    const get = async url => {
        signal?.throwIfAborted?.();
        let response;
        try { response = await waitMusicRequest(fetcher(url, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal }), signal); }
        catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            if (hostProxy && !proxyUnavailable && sunoPublicHost(url)) {
                try {
                    // ST documents /proxy/:url(*). Omit credentials because the
                    // host forwards request headers; no Basic Auth may escape.
                    response = await waitMusicRequest(fetcher('/proxy/' + encodeURIComponent(url), { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal }), signal);
                    if ([401, 404, 405, 501].includes(response.status)) { proxyUnavailable = true; response = null; }
                } catch (proxyError) {
                    if (signal?.aborted || proxyError?.name === 'AbortError') throw proxyError;
                    proxyUnavailable = true;
                }
            }
            if (response) {
                if (!response.ok) throw linkError(`音乐网站返回 ${response.status}，本次未导入。原有歌曲未替换。`, 'RMT_MV_LINK_HTTP', response.status);
                return { response, finalUrl: url };
            }
            throw linkError('链接读取失败，可能是网络或网站不允许跨站读取。原有歌曲未替换。', 'RMT_MV_LINK_NETWORK');
        }
        if (!response.ok) throw linkError(`音乐网站返回 ${response.status}，本次未导入。原有歌曲未替换。`, 'RMT_MV_LINK_HTTP', response.status);
        const finalUrl = musicUrl(response.url || url);
        return { response, finalUrl };
    };
    let response, finalUrl;
    try { ({ response, finalUrl } = await get(sourceUrl)); }
    catch (error) {
        if (allowStreaming && error?.code === 'RMT_MV_LINK_NETWORK' && /\.(?:mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(new URL(sourceUrl).pathname)) {
            return { url: sourceUrl, name: musicLinkName(sourceUrl), sourceUrl, streaming: true };
        }
        throw error;
    }
    let name = musicLinkName(finalUrl);
    if (/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
        let html = await waitMusicRequest(response.text(), signal);
        let published = publicMusicSource(html, finalUrl);
        // A share response may publish only its canonical song page. The
        // proxy response URL is local, so use the public canonical identity.
        const canonical = sunoSongPage(html, finalUrl);
        if (!published && canonical && canonical !== finalUrl) {
            ({ response, finalUrl } = await get(canonical));
            html = await waitMusicRequest(response.text(), signal);
            published = publicMusicSource(html, finalUrl);
        }
        if (!published) throw linkError('歌曲网页没有提供可导入的公开音频地址。原有歌曲未替换。', 'RMT_MV_LINK_PAGE');
        try { ({ response, finalUrl } = await get(published.url)); }
        catch (error) {
            if (allowStreaming && error?.code === 'RMT_MV_LINK_NETWORK') return { url: published.url, name: published.title || musicLinkName(published.url), sourceUrl, streaming: true };
            throw error;
        }
        name = published.title || musicLinkName(finalUrl);
    }
    if (/^(?:text\/|application\/(?:json|xml|xhtml))/i.test(response.headers.get('content-type') || '')) {
        throw linkError('链接返回的不是音频文件。原有歌曲未替换。', 'RMT_MV_LINK_TYPE');
    }
    const blob = await waitMusicRequest(response.blob(), signal);
    signal?.throwIfAborted?.();
    if (!blob.size) throw linkError('链接返回了空文件。原有歌曲未替换。', 'RMT_MV_LINK_EMPTY');
    return { blob, name, sourceUrl };
}
