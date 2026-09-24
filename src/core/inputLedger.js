// Character accounting for one final prompt. Token totals stay with the host
// tokenizer; this module never adds section estimates together and calls them tokens.

export const LEDGER_SECTION_NAMES = Object.freeze([
    'promptTemplate',
    'archiveSlice',
    'characterEnvelope',
    'personaEnvelope',
    'selectedSettings',
    'activatedWorldInfo',
    'participantPayload',
    'worldPresentation',
    'other',
]);

const SECTION_LABELS = Object.freeze({
    promptTemplate: '任务说明',
    archiveSlice: '档案片段',
    characterEnvelope: '角色信封',
    personaEnvelope: '用户人设',
    selectedSettings: '手选与人物来源',
    activatedWorldInfo: '补充世界书',
    participantPayload: '人物索引',
    worldPresentation: '世界呈现',
    other: '分隔与其余',
});

function emptySections() {
    return Object.fromEntries(LEDGER_SECTION_NAMES.map(name => [name, {
        name,
        label: SECTION_LABELS[name],
        chars: 0,
        includedItems: 0,
        excludedItems: 0,
        deduplicatedChars: 0,
        truncated: false,
        dropped: false,
        reason: '',
    }]));
}

function claim(owner, name, start, end) {
    if (start < 0 || end <= start) return;
    for (let index = start; index < end && index < owner.length; index += 1) {
        if (owner[index] === 'other') owner[index] = name;
    }
}

function sectionEnd(text, start, tokenLength) {
    const headers = [
        '\nCHARACTER_CARD_JSON:',
        '\nUSER_PERSONA_JSON:',
        '\nWORLD_INFO_TEXT:',
        '\nWORLD_INFO_SELECTED:',
        '\nWORLD_INFO_ACTIVATED:',
        '\n【上下文结束】',
        '\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:',
        '\nCONTROLLED_WORLD_PRESENTATION_JSON:',
        '\nUNTRUSTED_ROOM_ARCHIVE_JSON:',
        '\nUNTRUSTED_INCREMENTAL_ROOM_ARCHIVE_JSON:',
        '\nCURRENT_ROOM_CONTEXT_JSON:',
        '\nRELATED_MEMORIES_JSON',
        '\nINPUT_JSON:',
        '\nNEW_RESIDENT_IDS_JSON:',
        '\nEXISTING_ROOM_INDEX_JSON:',
        '\nALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON:',
    ];
    let end = text.length;
    for (const header of headers) {
        const found = text.indexOf(header, start + tokenLength);
        if (found >= 0 && found < end) end = found;
    }
    return end;
}

function claimToken(text, owner, name, token) {
    let from = 0;
    while (from < text.length) {
        const start = text.indexOf(token, from);
        if (start < 0) return;
        claim(owner, name, start, sectionEnd(text, start, token.length));
        from = start + token.length;
    }
}

export function accountFinalPrompt(finalPrompt, packing = null) {
    const text = String(finalPrompt ?? '');
    const owner = new Array(text.length).fill('other');
    claimToken(text, owner, 'characterEnvelope', 'CHARACTER_CARD_JSON:');
    claimToken(text, owner, 'personaEnvelope', 'USER_PERSONA_JSON:');
    claimToken(text, owner, 'selectedSettings', 'WORLD_INFO_SELECTED:');
    claimToken(text, owner, 'activatedWorldInfo', 'WORLD_INFO_ACTIVATED:');
    claimToken(text, owner, 'activatedWorldInfo', 'WORLD_INFO_TEXT:');
    claimToken(text, owner, 'participantPayload', 'UNTRUSTED_SELECTED_PARTICIPANTS_JSON:');
    claimToken(text, owner, 'worldPresentation', 'CONTROLLED_WORLD_PRESENTATION_JSON:');
    for (const token of ['UNTRUSTED_ROOM_ARCHIVE_JSON:', 'UNTRUSTED_INCREMENTAL_ROOM_ARCHIVE_JSON:', 'CURRENT_ROOM_CONTEXT_JSON:', 'RELATED_MEMORIES_JSON', 'INPUT_JSON:', 'ALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON:']) {
        claimToken(text, owner, 'archiveSlice', token);
    }
    const instructionStart = text.indexOf('【');
    if (instructionStart > 0) claim(owner, 'promptTemplate', 0, instructionStart);
    const contextStart = text.indexOf('【心迹回廊受控');
    const contextEnd = text.indexOf('【上下文结束】');
    if (contextEnd >= 0) {
        const after = contextEnd + '【上下文结束】'.length;
        claim(owner, 'promptTemplate', after, text.length);
    } else if (contextStart < 0) {
        claim(owner, 'promptTemplate', 0, text.length);
    }
    const sections = emptySections();
    for (const name of owner) sections[name].chars += 1;
    if (packing) {
        sections.selectedSettings.includedItems = packing.used || 0;
        sections.selectedSettings.excludedItems = packing.dropped || 0;
        sections.selectedSettings.deduplicatedChars = packing.deduplicatedChars || 0;
        sections.selectedSettings.dropped = (packing.dropped || 0) > 0;
        sections.selectedSettings.reason = packing.note || '';
        sections.activatedWorldInfo.deduplicatedChars = 0;
    }
    const totalChars = LEDGER_SECTION_NAMES.reduce((sum, name) => sum + sections[name].chars, 0);
    if (totalChars !== text.length) {
        const drift = text.length - totalChars;
        sections.other.chars += drift;
    }
    const largest = LEDGER_SECTION_NAMES.map(name => sections[name]).reduce((best, section) => section.chars > best.chars ? section : best, sections.other);
    return {
        sections: LEDGER_SECTION_NAMES.map(name => sections[name]),
        totalChars: text.length,
        largest: { name: largest.name, label: largest.label, chars: largest.chars },
        deduplicatedChars: Math.max(0, Number(packing?.deduplicatedChars) || 0),
    };
}

export function preflightDetailText({ ledger, packing, budget }) {
    const lines = [];
    const chars = Number(budget?.chars ?? ledger?.totalChars) || 0;
    const tokensKnown = budget?.tokensKnown === true && Number.isFinite(budget?.tokens);
    lines.push(`总字符 ${chars.toLocaleString()}`);
    lines.push(tokensKnown ? `总 tokens ${Math.round(budget.tokens).toLocaleString()}` : 'tokens 未知');
    if (Number.isFinite(budget?.budgetTokens)) lines.push(`当前 token 预算 ${Math.round(budget.budgetTokens).toLocaleString()}`);
    if (Number.isFinite(budget?.charCap)) lines.push(`字符顶 ${Math.round(budget.charCap).toLocaleString()}`);
    for (const section of ledger?.sections || []) {
        if (!section.chars) continue;
        const share = chars ? Math.round((section.chars / chars) * 100) : 0;
        lines.push(`${section.label} ${section.chars.toLocaleString()} 字符（${share}%）`);
    }
    if (packing?.included?.length || packing?.excluded?.length) {
        const sent = (packing.included || []).map(item => `${item.title || item.uid} · ${item.chars} 字符 · ${item.reason}`);
        const held = (packing.excluded || []).map(item => `${item.title || item.uid} · ${item.chars} 字符 · ${item.reason}`);
        if (sent.length) lines.push(`已送：${sent.join('；')}`);
        if (held.length) lines.push(`未送：${held.join('；')}`);
    }
    if ((packing?.deduplicatedChars || ledger?.deduplicatedChars) > 0) {
        lines.push(`去重节省 ${(packing?.deduplicatedChars || ledger.deduplicatedChars).toLocaleString()} 字符`);
    }
    lines.push('可以减少人物、减少设定，或在设置中提高输入预算。');
    return lines.join('\n');
}
