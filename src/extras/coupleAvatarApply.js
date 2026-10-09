import * as crop from './coupleAvatarCrop.js';
import * as avatars from '../core/chatAvatarStore.js';
import * as text from '../core/text.js';

const label = value => typeof value === 'string' ? value.trim() : '';

// Both PNGs are prepared before any store write. halfIndex belongs to the
// original image; swapping the display order must not swap people's identity.
export function prepareCoupleAvatarApplication(record, loaded, context) {
    const images = crop.cropPairImage(loaded, record?.crops, record?.order).map(image => ({
        ...image, name: label(record?.settings?.people?.[image.halfIndex]?.name),
    }));
    const names = { char: label(context?.name2) || '角色', user: label(context?.name1) || '我' };
    const mapping = { char: null, user: null };
    for (const role of ['char', 'user']) {
        const matching = images.filter(image => {
            const person = record?.settings?.people?.[image.halfIndex];
            return person?.id === role && label(person.name) === names[role];
        });
        if (matching.length === 1) mapping[role] = matching[0].halfIndex;
    }
    return { scope: avatars.chatAvatarScope(context), names, images, mapping };
}

export async function applyPreparedCoupleAvatars(prepared, mapping, { context, expectedScope = prepared?.scope } = {}) {
    if (!prepared?.scope || prepared.scope !== expectedScope || avatars.chatAvatarScope(context) !== expectedScope) {
        throw text.safeUserError('聊天或人物已切换，请回到对应聊天重新应用。', 'RMT_PAIR_AVATAR_SCOPE');
    }
    if (![0, 1].includes(mapping?.char) || ![0, 1].includes(mapping?.user) || mapping.char === mapping.user) {
        throw text.safeUserError('请分别确认角色与你使用哪一张头像。', 'RMT_PAIR_AVATAR_MAPPING');
    }
    const pair = {};
    for (const role of ['char', 'user']) {
        const image = prepared.images?.find(row => row.halfIndex === mapping[role]);
        if (!image?.url?.startsWith('data:image/png;base64,')) {
            throw text.safeUserError('裁切图片尚未准备好，原头像未改变。', 'RMT_PAIR_AVATAR_IMAGE');
        }
        pair[role] = { name: prepared.names[role], url: image.url };
    }
    return avatars.saveChatAvatarPair(pair, { context, expectedScope });
}
