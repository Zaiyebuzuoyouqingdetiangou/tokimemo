import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
// 房间宠物：物种、归属证据与规范化
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

export const ROOM_PET_SPECIES = Object.freeze(['cat', 'dog', 'bird', 'rabbit', 'fish', 'reptile', 'small_mammal', 'fantasy', 'other']);

const ROOM_PET_SPECIES_SET = new Set(ROOM_PET_SPECIES);

const ROOM_PET_SPECIES_ALIASES = Object.freeze({
    '猫': 'cat', '猫咪': 'cat', kitten: 'cat',
    '狗': 'dog', '狗狗': 'dog', puppy: 'dog',
    '鸟': 'bird', '鸟类': 'bird',
    '兔': 'rabbit', '兔子': 'rabbit',
    '鱼': 'fish', '观赏鱼': 'fish',
    '爬虫': 'reptile', '爬行类': 'reptile',
    '仓鼠': 'small_mammal', '豚鼠': 'small_mammal', hamster: 'small_mammal',
    '幻想生物': 'fantasy', '魔法生物': 'fantasy', companion: 'fantasy',
});

export function normalizeRoomPetSpecies(value) {
    const raw = core_text.normalizeText(value, 40).toLowerCase();
    const species = ROOM_PET_SPECIES_ALIASES[raw] || raw;
    return ROOM_PET_SPECIES_SET.has(species) ? species : 'other';
}

function roomPetSpeciesLabel(species, index) {
    return ({ cat: '猫咪', dog: '小狗', bird: '鸟儿', rabbit: '兔子', fish: '鱼儿', reptile: '爬宠' })[species]
        || `宠物 ${index + 1}`;
}

function roomPetOwnershipEvidence(evidence, characterName, speciesAliases, suppliedName = '', { allowCharacterProfileShorthand = false } = {}) {
    const text = core_text.normalizeText(evidence, 1600).replace(/[ \t]+/g, ' ');
    if (!text) return false;
    const escapeRegExp = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const petTerms = [...new Set([
        ...speciesAliases,
    ].map(value => core_text.normalizeText(value, 60)).filter(Boolean))];
    if (!petTerms.length) return false;
    const pet = `(?:${petTerms.map(escapeRegExp).join('|')})`;
    const owner = escapeRegExp(core_text.normalizeText(characterName, 120));
    const explicitProfile = new RegExp(`^(?:宠物|pet)\\s*[:：=]\\s*.{0,24}${pet}`, 'iu');
    const ownershipBridge = `(?:\\s*(?:自己|本人|一直|目前|现在|已经|亲自|长期|从小|家里|家中)){0,6}\\s*`;
    const firstPerson = new RegExp(`^(?:(?:我|我的|本人|I|my)${ownershipBridge})?(?:养(?:着|了|有)?|饲养|收养|领养|拥有|have|has|own|keep|adopt(?:ed)?)\\s*.{0,20}${pet}`, 'iu');
    const profileLongTermCare = new RegExp(`(?:^|[\\n。！？.!?；;])\\s*(?:他|她|角色).{0,32}(?:给|为).{0,12}${pet}.{0,24}(?:准备|添置|购买|安置).{0,30}(?:长期|专用|固定|日常).{0,20}(?:窝|床|笼|食盆|水盆|饲料|用品|项圈|玩具|cat\\s*bed|dog\\s*bed|pet\\s*bed|food\\s*bowl|supplies)`, 'iu');
    const ownerLongTermCare = new RegExp(`${owner}.{0,32}(?:给|为).{0,12}${pet}.{0,24}(?:准备|添置|购买|安置).{0,30}(?:长期|专用|固定|日常).{0,20}(?:窝|床|笼|食盆|水盆|饲料|用品|项圈|玩具|cat\\s*bed|dog\\s*bed|pet\\s*bed|food\\s*bowl|supplies)`, 'iu');
    const ownerFirst = new RegExp(`${owner}${ownershipBridge}(?:养(?:着|了|有)?|饲养|收养|领养|拥有|的宠物|have|has|own|keep|adopt(?:ed)?).{0,24}${pet}`, 'iu');
    const petFirst = new RegExp(`${pet}.{0,24}(?:是${owner}的|由${owner}(?:饲养|收养|领养)|belongs? to ${owner}|owned by ${owner})`, 'iu');
    const thirdParty = new RegExp(`(?:${owner || '(?!)'}|他|她|我|角色)(?:的)?(?:朋友|同事|同学|邻居|父母|父亲|母亲|兄弟|姐妹|家人|亲戚|哥哥|姐姐|弟弟|妹妹)|\\b(?:friend|colleague|neighbor|neighbour|parent|sibling)'?s?\\b`, 'iu');
    // Ownership of one species cannot authorize another species in a picture, a job,
    // another sentence or another person's clause. Generic aliases are supplied only
    // for an explicitly unspecified pet. A model-supplied pet name grants no authority.
    return text.split(/[\n。！？.!?；;，,]/u).some(clause => {
        if (thirdParty.test(clause)
            || /(?:如果|假如|倘若|要是|假设|梦见|梦到|想象|幻想|打算|计划|希望|(?:画|书|小说|故事|电影|游戏|梦)(?:中|里|内)|\b(?:if|imagine|imaginary|dream|movie|fiction|plans?\s+to)\b)/iu.test(clause)) return false;
        if (/(?:没(?:有)?|并非|从未|不(?:再|曾|会|想)?|未曾).{0,8}(?:养|拥有|收养|领养)|\b(?:not|never|no)\b.{0,16}\b(?:own|have|keep|adopt|pet)\b/iu.test(clause)) return false;
        if (allowCharacterProfileShorthand && (explicitProfile.test(clause) || firstPerson.test(clause) || profileLongTermCare.test(clause))) return true;
        return !!owner && (ownerLongTermCare.test(clause) || ownerFirst.test(clause) || petFirst.test(clause));
    });
}

export function normalizeRoomPets(value, spaces, memoryBank, { controlledEvidence = null, characterEvidence = null } = {}) {
    const availableSpaces = new Set((Array.isArray(spaces) ? spaces : []).map(space => space?.id).filter(Boolean));
    const usedIds = new Set();
    return (Array.isArray(value) ? value : []).slice(0, 6).map((item, index) => {
        const spaceId = core_text.safeId(item?.spaceId || item?.homeSpaceId, '');
        if (!spaceId || !availableSpaces.has(spaceId)) return null;
        const basis = core_constants.ROOM_BASIS_VALUES.has(item?.basis) ? item.basis : '设定';
        const species = normalizeRoomPetSpecies(item?.species);
        const suppliedName = core_text.normalizeText(item?.name, 60);
        let name = suppliedName || roomPetSpeciesLabel(species, index);
        let description = core_text.normalizeText(item?.description, 900);
        let line = core_text.normalizeText(item?.line, 500);
        const sourceEvidence = core_text.normalizeText(item?.sourceEvidence, 800);
        const reference = basis === '记忆'
            ? core_evidence.normalizeExactMemoryReference(
                item?.sourceMemoryIds,
                item?.sourceMemoryAnchor,
                memoryBank,
                1,
            )
            : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        if (basis === '记忆' && (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor)) return null;
        const speciesAliases = Object.entries(ROOM_PET_SPECIES_ALIASES)
            .filter(([, normalized]) => normalized === species).map(([alias]) => alias);
        speciesAliases.push(species);
        if (species === 'other') speciesAliases.push('宠物', '伙伴动物', 'pet', 'companion animal');
        if (basis === '设定' && controlledEvidence !== null) {
            const evidenceLower = sourceEvidence.toLowerCase();
            if (!sourceEvidence || !core_worldPresentation.controlledEvidenceContains(controlledEvidence, sourceEvidence)
                || !speciesAliases.some(alias => alias && evidenceLower.includes(alias.toLowerCase()))
                || !roomPetOwnershipEvidence(sourceEvidence, memoryBank?.characterName, speciesAliases, suppliedName, {
                    allowCharacterProfileShorthand: characterEvidence !== null
                        && core_worldPresentation.controlledEvidenceContains(characterEvidence, sourceEvidence),
                })) return null;
            if (suppliedName && !core_worldPresentation.controlledEvidenceContains(sourceEvidence, suppliedName)) name = roomPetSpeciesLabel(species, index);
            if (!description || !core_worldPresentation.controlledEvidenceContains(sourceEvidence, description)) description = `${name}长期生活在这个空间。`;
            if (line && !core_worldPresentation.controlledEvidenceContains(sourceEvidence, line)) line = '';
        }
        if (basis === '记忆') {
            const referencedEvidence = reference.sourceMemoryIds.map(id => {
                const memory = (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).find(entry => entry?.id === id);
                return [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].filter(Boolean).join('\n');
            }).join('\n');
            if (!roomPetOwnershipEvidence(referencedEvidence, memoryBank?.characterName, speciesAliases, core_text.normalizeText(item?.name, 60))) return null;
            if (suppliedName && !core_worldPresentation.controlledEvidenceContains(referencedEvidence, suppliedName)) name = roomPetSpeciesLabel(species, index);
            if (!description || !core_worldPresentation.controlledEvidenceContains(referencedEvidence, description)) description = `${name}长期生活在这个空间。`;
            if (line && !core_worldPresentation.controlledEvidenceContains(referencedEvidence, line)) line = '';
        }
        if (!description) description = `${name}长期生活在这个空间。`;
        const fallbackId = `PET${String(index + 1).padStart(2, '0')}`;
        let id = core_text.safeId(item?.id, fallbackId);
        if (usedIds.has(id)) id = fallbackId;
        while (usedIds.has(id)) id = `${fallbackId}_${usedIds.size + 1}`;
        usedIds.add(id);
        return {
            id,
            name,
            species,
            description,
            line,
            spaceId,
            basis,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            sourceEvidence: basis === '设定' ? sourceEvidence : '',
        };
    }).filter(Boolean);
}

export function roomRequiredPetSpecies(memoryBank, { controlledEvidence = null, characterEvidence = null } = {}) {
    if (controlledEvidence === null && characterEvidence === null) return [];
    const characterName = core_text.normalizeText(memoryBank?.characterName, 120);
    const controlled = core_text.normalizeText(controlledEvidence, 16000);
    const character = core_text.normalizeText(characterEvidence, 16000);
    const required = [];
    for (const species of ROOM_PET_SPECIES.filter(value => value !== 'other')) {
        const aliases = Object.entries(ROOM_PET_SPECIES_ALIASES)
            .filter(([, normalized]) => normalized === species).map(([alias]) => alias);
        aliases.push(species);
        const controlledMatch = aliases.some(alias => alias && controlled.toLowerCase().includes(alias.toLowerCase()))
            && roomPetOwnershipEvidence(controlled, characterName, aliases);
        const characterMatch = aliases.some(alias => alias && character.toLowerCase().includes(alias.toLowerCase()))
            && roomPetOwnershipEvidence(character, characterName, aliases, '', { allowCharacterProfileShorthand: true });
        if (controlledMatch || characterMatch) required.push(species);
    }
    if (required.length) return required;
    const genericAliases = ['宠物', '伙伴动物', 'pet', 'companion animal'];
    const genericControlled = genericAliases.some(alias => controlled.toLowerCase().includes(alias.toLowerCase()))
        && roomPetOwnershipEvidence(controlled, characterName, genericAliases);
    const genericCharacter = genericAliases.some(alias => character.toLowerCase().includes(alias.toLowerCase()))
        && roomPetOwnershipEvidence(character, characterName, genericAliases, '', { allowCharacterProfileShorthand: true });
    return genericControlled || genericCharacter ? ['other'] : [];
}
