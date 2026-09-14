import test from 'node:test';
import assert from 'node:assert/strict';
import * as avatars from '../src/ui/archiveAvatars.js';

function withLocation(t) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', { configurable: true, value: {
        href: 'https://tavern.example/app/', origin: 'https://tavern.example',
    } });
    t.after(() => previous ? Object.defineProperty(globalThis, 'location', previous) : delete globalThis.location);
}

test('avatar filenames remain compact and encode Unicode and punctuation without storing images', () => {
    const filename = '小月 #1?.png';
    assert.equal(avatars.normalizeAvatarFile(`  ${filename}  `), filename);
    assert.equal(avatars.userAvatarUrl(filename), `/User%20Avatars/${encodeURIComponent(filename)}`);
    assert.equal(avatars.normalizeAvatarFile('a'.repeat(299)), 'a'.repeat(299));
    assert.equal(avatars.normalizeAvatarFile('a'.repeat(300)), '');
    assert.equal(avatars.userAvatarUrl('avatar%2F1.png'), '/User%20Avatars/avatar%252F1.png');
});

test('unsafe or non-string avatar identifiers fall back instead of becoming executable or remote URLs', () => {
    for (const value of [null, undefined, 3, {}, '', '.', '..', '../x.png', 'a/b.png', 'a\\b.png',
        'data:image/png;base64,AAAA', 'blob:abc', 'https://other.example/a.png', '//other.example/a.png',
        'a\n.png', 'a\u0000.png', 'a\u007f.png']) {
        assert.equal(avatars.normalizeAvatarFile(value), '', String(value));
        assert.equal(avatars.userAvatarUrl(value), '', String(value));
        assert.equal(avatars.characterAvatarUrl(value, {}), '', String(value));
    }
});

test('explicit active user avatar wins over Persona DOM and stale chat lock', () => {
    const doc = { querySelector() { throw new Error('DOM must not be queried with explicit active avatar'); } };
    assert.equal(avatars.currentUserAvatar({ user_avatar: 'active.png', userAvatar: 'other.png',
        chatMetadata: { persona: 'locked.png' } }, doc), 'active.png');
    assert.equal(avatars.currentUserAvatar({ user_avatar: 'data:bad', userAvatar: 'tt.png' }, doc), 'tt.png');
});

test('ST selected Persona is read once and wins over chat lock', () => {
    const selectors = [];
    const doc = { querySelector(selector) {
        selectors.push(selector);
        return { getAttribute(name) { assert.equal(name, 'data-avatar-id'); return 'temporary.png'; } };
    } };
    assert.equal(avatars.currentUserAvatar({ chatMetadata: { persona: 'locked.png' } }, doc), 'temporary.png');
    assert.deepEqual(selectors, ['#user_avatar_block .avatar-container.selected']);
});

test('missing and throwing host or DOM getters safely fall back to this chat lock', () => {
    const ctx = { get user_avatar() { throw new Error('host unavailable'); },
        get userAvatar() { throw new Error('host unavailable'); }, chatMetadata: { persona: 'locked.png' } };
    assert.equal(avatars.currentUserAvatar(ctx, { querySelector() { throw new Error('DOM unavailable'); } }), 'locked.png');
    assert.equal(avatars.currentUserAvatar(ctx, { querySelector() { return { getAttribute() { throw new Error('missing'); } }; } }), 'locked.png');
    assert.equal(avatars.currentUserAvatar(null, null), '');
    assert.equal(avatars.currentUserAvatar({ get chatMetadata() { throw new Error('unavailable'); } }, null), '');
});

test('history binding uses only its own memory, index or source chat metadata', () => {
    assert.equal(avatars.archiveUserAvatar({ userAvatar: 'archived.png' }, { userAvatar: 'index.png' }, { persona: 'source.png' }), 'archived.png');
    assert.equal(avatars.archiveUserAvatar({}, { userAvatar: 'index.png' }, { persona: 'source.png' }), 'index.png');
    assert.equal(avatars.archiveUserAvatar({}, {}, { persona: 'source.png' }), 'source.png');
    assert.equal(avatars.archiveUserAvatar({ userAvatar: 'data:bad' }, { userAvatar: 'https://elsewhere/a' }, { persona: 'source.png' }), 'source.png');
    assert.equal(avatars.archiveUserAvatar({}, {}, {}), '');
    assert.equal(avatars.archiveUserAvatar(null), '');
    assert.equal(avatars.archiveUserAvatar({ get userAvatar() { throw new Error('unavailable'); } }), '');
});

test('historical archive never borrows a different active host or global Persona', t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'user_avatar');
    Object.defineProperty(globalThis, 'user_avatar', { configurable: true, value: 'other-chat.png' });
    t.after(() => previous ? Object.defineProperty(globalThis, 'user_avatar', previous) : delete globalThis.user_avatar);
    assert.equal(avatars.archiveUserAvatar({ userName: 'Same display name' }, {}), '');
});

test('character thumbnail uses the avatar kind and converts same-origin URLs to paths', t => {
    withLocation(t);
    const calls = [];
    const ctx = { getThumbnailUrl(kind, file) { calls.push([kind, file]); return '/thumbnail?type=avatar&file=char.png'; } };
    assert.equal(avatars.characterAvatarUrl('char.png', ctx), '/thumbnail?type=avatar&file=char.png');
    assert.deepEqual(calls, [['avatar', 'char.png']]);
    assert.equal(avatars.characterAvatarUrl('char.png', { getThumbnailUrl: () => 'https://tavern.example/thumbnail?file=char.png' }), '/thumbnail?file=char.png');
    assert.equal(avatars.characterAvatarUrl('char.png', { getThumbnailUrl: () => 'thumbnail?file=char.png' }), '/app/thumbnail?file=char.png');
});

test('unsafe or broken character thumbnail URLs fall back to the encoded same-origin character image', t => {
    withLocation(t);
    for (const url of ['https://other.example/char.png', 'http://tavern.example/char.png', 'https://u:p@tavern.example/char.png',
        'data:image/png;base64,x', 'blob:x', 'javascript:alert(1)', '//other.example/x', '\\other.example\\x',
        '/\nthumbnail', '/\\other.example/x', 123, null, '']) {
        assert.equal(avatars.characterAvatarUrl('角色.png', { getThumbnailUrl: () => url }), `/characters/${encodeURIComponent('角色.png')}`, String(url));
    }
    assert.equal(avatars.characterAvatarUrl('char.png', { get getThumbnailUrl() { throw new Error('host unavailable'); } }), '/characters/char.png');
    assert.equal(avatars.characterAvatarUrl('char.png', { getThumbnailUrl() { throw new Error('host unavailable'); } }), '/characters/char.png');
    assert.equal(avatars.characterAvatarUrl('char.png', null), '/characters/char.png');
});
