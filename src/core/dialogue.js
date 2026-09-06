import * as core_text from './text.js';

export const DIALOGUE_CONTRACT = '脚本每项只属于一个说话人：speaker 为 char/user/narrator/npc；npc 必须另给 speakerName。动作、神态、环境写独立 narrator 项，气泡 text 只放该人实际说出的台词，不混入其他人的话。不要按段落顺序轮流猜说话人。';

// One pure boundary for generated scripts and legacy display. Unknown attribution is neutral.
export function normalizeDialogueRows(raw, { characterName = '', userName = '', strict = false } = {}) {
    const identities = [[core_text.normalizeText(characterName, 120), 'char'], [core_text.normalizeText(userName, 120), 'user']].filter(([name]) => name);
    const inputs = Array.isArray(raw) ? raw : [];
    const overBudget = () => {
        if (strict) throw new Error('对话拆分后超过 120 行或 50400 字符，请减少脚本长度后重新生成。');
        return [{ speaker: 'narrator', text: '这篇旧对话超过安全显示限额；原文仍保留在档案中。' }];
    };
    if (inputs.length > 120) return overBudget();
    const rows = [];
    const push = (speaker, text, speakerName = '') => {
        text = core_text.normalizeText(text, 50401);
        if (text) rows.push({ speaker, text, ...(speaker === 'npc' ? { speakerName } : {}) });
    };
    const explicitOwner = text => {
        const prefix = text.trim();
        // A name prefix is not an identity: 林舟的妹妹 / 小雨伞店 are different subjects.
        return identities.find(([name]) => prefix.startsWith(name)
            && /^(?:\s*[:：]|(?:说|问|答|道|笑|看|望|抬|低|转|伸|点|摇|歪|把|眼睛|眼神|轻声|轻轻|缓缓|忽然|停下|拿起|放下))/.test(prefix.slice(name.length)))?.[1] || '';
    };
    for (const rawLine of inputs) {
        const line = typeof rawLine === 'string' ? { speaker: 'narrator', text: rawLine } : rawLine;
        const name = core_text.normalizeText(line?.speaker, 120);
        const alias = name.toLowerCase();
        let speaker = ['char', 'user', 'narrator', 'npc'].includes(alias) ? alias
            : identities.find(([identity]) => name === identity)?.[1] || 'narrator';
        const npcName = core_text.normalizeText(line?.speakerName, 120);
        if (speaker === 'npc' && !npcName) speaker = 'narrator';
        const originalText = core_text.normalizeText(line?.text, 50401);
        const action = core_text.normalizeText(line?.action || line?.narration, 50401);
        if (action) push('narrator', action);
        if (!originalText) continue;
        const labelled = value => {
            const match = value.match(/^\s*([^\n:：]{1,120})\s*[:：]\s*([^]*)$/);
            if (!match) return null;
            const label = match[1].trim();
            const owner = identities.find(([identity]) => identity === label)?.[1]
                || (['char', 'user', 'narrator'].includes(label.toLowerCase()) ? label.toLowerCase() : '')
                || (npcName && label === npcName ? 'npc' : '');
            if (owner) return { speaker: owner, text: match[2] };
            // Unknown short speaker labels are neutral; ordinary first-person prose is not a label.
            if (/^[\p{L}\p{N}_·]{1,12}$/u.test(label) && !/^(?:我|我们|你|您|我的|意思|例如|注意)/.test(label)) return { speaker: 'narrator', text: value };
            return null;
        };
        const physicalLines = originalText.split(/\r?\n/);
        const hasLabels = physicalLines.some(value => labelled(value));
        for (const value of hasLabels ? physicalLines : [originalText]) {
            const tagged = hasLabels ? labelled(value) : null;
            const text = tagged ? tagged.text : value;
            const rowSpeaker = tagged ? tagged.speaker : hasLabels ? 'narrator' : speaker;
            if (!text.trim()) continue;
            const quotes = [...text.matchAll(/“([^”]*)”|「([^」]*)」|"([^"\n]*)"/g)];
            const firstPrefix = quotes.length ? text.slice(0, quotes[0].index).trim() : '';
            const narrativePrefix = explicitOwner(firstPrefix) || (!/^(?:我|我们|你|您)/.test(firstPrefix) && /(?:说|问|答|道|笑|看|伸手|转身)[^“”「」"]*[:：]?$/.test(firstPrefix));
            // Quoting a word inside ordinary speech is not narration: 我只想说“谢谢”，真的。
            if (quotes.length && (!firstPrefix || rowSpeaker === 'narrator' || narrativePrefix)) {
                let cursor = 0;
                let owner = rowSpeaker;
                for (const quote of quotes) {
                    const before = text.slice(cursor, quote.index).trim();
                    const nextOwner = explicitOwner(before);
                    if (before.replace(/[，。！？、：；,.!?:;\s]/g, '')) owner = nextOwner || 'narrator';
                    // An unattributed quote in narration stays narration, not a char bubble.
                    if (before) push('narrator', before);
                    push(owner, quote[1] ?? quote[2] ?? quote[3], npcName);
                    cursor = quote.index + quote[0].length;
                }
                push('narrator', text.slice(cursor));
            } else if (/^(?:\*[^*]+\*|（[^）]+）|\([^)]*\))$/.test(text) || explicitOwner(text) && /(?:说道|问道|看着|看了|转身|伸手|点头|摇头|歪了|笑了)/.test(text)) {
                push('narrator', text);
            } else {
                push(rowSpeaker, text, npcName);
            }
        }
    }
    if (rows.length > 120 || rows.reduce((sum, row) => sum + row.text.length, 0) > 50400) return overBudget();
    return rows;
}
