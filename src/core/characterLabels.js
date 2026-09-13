// Presentation only. Read an explicitly attributed character card, never Persona,
// names, avatars, dialogue or another live chat to guess gender. No storage/schema changes.
import * as context from './context.js';
import * as groups from '../archive/groups.js';
import { state as runtimeState } from './state.js';

function own(object, key) {
    try { const d = object && Object.getOwnPropertyDescriptor(object, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; } catch { return undefined; }
}
function genderValue(value) {
    if (typeof value !== 'string') return '';
    const s = value.trim().toLowerCase();
    if (/^(?:女|女性|女人|female|woman|girl|she(?:\/her)?)$/.test(s)) return '她';
    if (/^(?:男|男性|男人|male|man|boy|he(?:\/him)?)$/.test(s)) return '他';
    return '';
}
export function pronounFromCharacterCard(card) {
    const data = own(card, 'data');
    const explicit = [own(card, 'gender'), own(card, 'sex'), own(data, 'gender'), own(data, 'sex')].filter(value => value != null && value !== '');
    if (explicit.length) {
        const resolved = explicit.map(genderValue);
        return resolved.every(value => value && value === resolved[0]) ? resolved[0] : 'TA';
    }
    const description = own(data, 'description') ?? own(card, 'description');
    if (typeof description !== 'string') return 'TA';
    // Only a labelled field at the beginning of the card's own first paragraph.
    // Stop before NPC/Persona blocks; ordinary mentions of a woman are not evidence.
    const block = description.slice(0, 6000).split(/\n\s*\n|\n\s*(?:关系|家人|朋友|NPC|用户|user|persona|其他人物|人际)/i)[0];
    const genders = [...block.matchAll(/(?:^|\n)\s*[-*#【\[\s]*?(?:性别|gender|sex)\s*[】\]]?\s*[:：=]\s*([^\n，,;；。]{1,30})/gi)].map(match => genderValue(match[1].replace(/[*\]】]+$/g, '').trim()));
    return genders.length && genders.every(value => value && value === genders[0]) ? genders[0] : 'TA';
}
export function characterPronoun(ctx = null, snapshot = undefined) {
    try {
        const host = ctx || context.getContext();
        const target = snapshot === undefined ? runtimeState.activeArchiveSnapshot : snapshot;
        const index = target ? groups.matchArchiveEntryToCharacter(target, host)?.index : host.groupId ? null : host.characterId;
        if (index === undefined || index === null) return 'TA';
        return pronounFromCharacterCard(own(own(host, 'characters'), String(index)));
    } catch { return 'TA'; }
}
const OWNED_LABELS = new Set(['他的房间', '他的物品', '他的私人终端', '他的出行路线', '这个世界线了解到的他', '去看看他']);
export function characterUiLabel(label, ctx = null, snapshot = undefined) {
    if (!OWNED_LABELS.has(label)) return label;
    const pronoun = characterPronoun(ctx, snapshot);
    return label.startsWith('他的') ? pronoun + label.slice(1) : label.endsWith('他') ? label.slice(0, -1) + pronoun : label;
}
