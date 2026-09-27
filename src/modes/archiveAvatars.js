// Avatar references only: no image bytes, network calls or host module imports.
function read(value, key) {
    try { return value?.[key]; } catch { return undefined; }
}

export function normalizeAvatarFile(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f/\\:]/.test(value)) return '';
    const file = value.trim();
    return file && file.length < 300 && file !== '.' && file !== '..' ? file : '';
}

export function currentUserAvatar(context, documentLike = globalThis.document) {
    const active = normalizeAvatarFile(read(context, 'user_avatar'))
        || normalizeAvatarFile(read(context, 'userAvatar'));
    if (active) return active;
    // ST's selected Persona can differ from the chat's locked Persona.
    try {
        const selected = documentLike?.querySelector?.('#user_avatar_block .avatar-container.selected');
        const file = normalizeAvatarFile(selected?.getAttribute?.('data-avatar-id'));
        if (file) return file;
    } catch {}
    return normalizeAvatarFile(read(read(context, 'chatMetadata'), 'persona'));
}

export function userAvatarUrl(filename) {
    const file = normalizeAvatarFile(filename);
    return file ? `/User%20Avatars/${encodeURIComponent(file)}` : '';
}

function thumbnailPath(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return '';
    const raw = value.trim();
    if (!raw || raw.startsWith('//')) return '';
    try {
        const location = read(globalThis, 'location');
        const href = read(location, 'href') || read(location, 'origin');
        // Relative paths can still work in a minimal host without location, but
        // an absolute URL requires an actual host origin to establish trust.
        if (!href && /^[a-z][a-z\d+.-]*:/i.test(raw)) return '';
        const base = new URL(href || 'https://hearttrace.invalid/');
        const url = new URL(raw, base);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin
            || url.username || url.password || url.pathname.startsWith('//')) return '';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch { return ''; }
}

export function characterAvatarUrl(filename, context) {
    const file = normalizeAvatarFile(filename);
    if (!file) return '';
    try {
        const thumbnail = thumbnailPath(context?.getThumbnailUrl?.('avatar', file));
        if (thumbnail) return thumbnail;
    } catch {}
    return `/characters/${encodeURIComponent(file)}`;
}

export function archiveUserAvatar(memory, entry = null, metadata = null) {
    // Historical identity must never fall through to the currently active chat.
    return normalizeAvatarFile(read(memory, 'userAvatar'))
        || normalizeAvatarFile(read(entry, 'userAvatar'))
        || normalizeAvatarFile(read(metadata, 'persona'));
}
