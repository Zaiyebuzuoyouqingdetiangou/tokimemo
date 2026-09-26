import * as core_context from './context.js';
import * as core_text from './text.js';
// 重构清单 C-3c（r84.100）：角色身份描述原在 archive/groups.js，只依赖 core，挪到 core 层，
// 这样 core/context.js 不必 import archive 层。声明一字未改；archive/groups.js 仍转发同名导出。

export function characterDescriptor(context, index) {
    const character = context?.characters?.[index];
    if (!character) return null;
    const data = character?.data && typeof character.data === 'object' ? character.data : character;
    const name = core_text.normalizeText(character?.name || data?.name, 120) || `角色 ${Number(index) + 1}`;
    const avatar = core_text.normalizeText(character?.avatar || data?.avatar, 300);
    const fingerprintSource = [
        avatar, name,
        core_text.normalizeText(data?.description || character?.description, 5000),
        core_text.normalizeText(data?.personality || character?.personality, 5000),
        core_text.normalizeText(data?.scenario || character?.scenario, 5000),
        core_text.normalizeText(data?.first_mes || character?.first_mes, 5000),
        core_text.normalizeText(data?.mes_example || character?.mes_example, 5000),
    ].join('\u001f');
    const fingerprint = `card:${core_context.stableArchiveHash(fingerprintSource)}`;
    return { index: Number(index), name, avatar, fingerprint };
}