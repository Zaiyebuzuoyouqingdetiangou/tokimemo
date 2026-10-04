// 用户主动导入音乐链接；只读取链接响应和网页公开的音频标签。
// 不执行网页脚本，不调用站点私有接口，不使用代理或现成登录凭据。
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
            if (url !== musicUrl(base)) return { url, title: title.replace(/\s+/g, ' ').trim().slice(0, 120) };
        } catch {} // Invalid published candidates never become requests.
    }
    return null;
}

export function musicLinkName(url) {
    const parsed = new URL(url);
    let name = parsed.pathname.split('/').filter(Boolean).at(-1) || '';
    try { name = decodeURIComponent(name); } catch {}
    return /\.(?:mp3|m4a|mp4|aac|wav|ogg|opus|flac|webm)$/i.test(name) ? name.slice(0, 80) : '链接歌曲';
}

export async function readMusicLink(value, { signal, fetcher = globalThis.fetch } = {}) {
    const sourceUrl = musicUrl(value);
    const get = async url => {
        signal?.throwIfAborted?.();
        let response;
        try { response = await fetcher(url, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal }); }
        catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            throw linkError('链接读取失败，可能是网络或网站不允许跨站读取。原有歌曲未替换。', 'RMT_MV_LINK_NETWORK');
        }
        if (!response.ok) throw linkError(`音乐网站返回 ${response.status}，本次未导入。原有歌曲未替换。`, 'RMT_MV_LINK_HTTP', response.status);
        const finalUrl = musicUrl(response.url || url);
        return { response, finalUrl };
    };
    let { response, finalUrl } = await get(sourceUrl);
    let name = musicLinkName(finalUrl);
    if (/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
        const published = publicMusicSource(await response.text(), finalUrl);
        if (!published) throw linkError('歌曲网页没有提供可导入的公开音频地址。原有歌曲未替换。', 'RMT_MV_LINK_PAGE');
        ({ response, finalUrl } = await get(published.url));
        name = published.title || musicLinkName(finalUrl);
    }
    if (/^(?:text\/|application\/(?:json|xml|xhtml))/i.test(response.headers.get('content-type') || '')) {
        throw linkError('链接返回的不是音频文件。原有歌曲未替换。', 'RMT_MV_LINK_TYPE');
    }
    const blob = await response.blob();
    signal?.throwIfAborted?.();
    if (!blob.size) throw linkError('链接返回了空文件。原有歌曲未替换。', 'RMT_MV_LINK_EMPTY');
    return { blob, name, sourceUrl };
}
